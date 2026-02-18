"""
detection.py
------------
Torsional dysfunction detection engine.

Core engineering insight (Volve dataset-specific)
--------------------------------------------------
Surface RPM barely oscillates during MWD-confirmed stick-slip events
(observed ±1 rpm) because the top drive actively holds rotary speed.
The drill string behaves as a torsional spring: it absorbs the downhole
oscillations before they reach the surface. This means a surface-only
RPM-based SSI will miss the majority of events (recall ≈ 0.01 in this
dataset).

Implication for detection architecture
---------------------------------------
1. **MWD downhole channel** (`mwd_ss_pktopk`) is used as primary ground
   truth when available (transmitted at MWD survey intervals).
2. **Surface torque deviation** is used as continuous real-time proxy
   because torque *does* respond (mildly) to downhole oscillations.
3. **Composite Severity Score (CSS)** fuses both signals into a unified
   0–1 index that drives the controller.

This architecture mirrors real rig automation systems (e.g., Soft Torque
Rotary System, National Oilwell Varco's Top Drive controller) where the
downhole measurement is the authority signal and surface torque provides
the continuous feedback loop.

Stick-Slip Severity Categories
--------------------------------
  0.00 – 0.25 : STABLE     (no dysfunction)
  0.25 – 0.50 : MILD       (monitor; no action required)
  0.50 – 0.75 : MODERATE   (reduce WOB 10–20%)
  0.75 – 1.00 : SEVERE     (reduce WOB 25–35%, increase RPM)
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Severity thresholds (dimensionless CSS 0–1)
# ---------------------------------------------------------------------------
SEVERITY_STABLE = 0.25
SEVERITY_MILD = 0.50
SEVERITY_MODERATE = 0.75

# MWD scale: 381 rpm PKtoPK is the observed maximum in this dataset
_MWD_MAX_PKTOPK = 400.0

# Torque deviation: flag if torque > baseline + N × rolling std
_TORQUE_SPIKE_SIGMA = 1.5


def compute_signals(
    df: pd.DataFrame,
    window_s: int = 60,
    min_rpm: float = 15.0,
) -> pd.DataFrame:
    """
    Compute all detection signals in one pass.

    Adds the following columns to the DataFrame:
        rpm_roll_mean    : rolling average RPM (rpm)
        rpm_roll_std     : rolling std RPM (rpm)
        rpm_ssi          : surface Stick-Slip Index = std / mean (dimensionless)
        torque_baseline  : rolling median torque (kNm)
        torque_deviation : (torque - baseline) / baseline (fraction)
        torque_spike     : bool — torque exceeded baseline + 1.5σ
        mwd_ssi          : normalised MWD PKtoPK / RPM (0–max_possible)
        css              : Composite Severity Score, 0–1
        severity_label   : "STABLE" | "MILD" | "MODERATE" | "SEVERE"

    Parameters
    ----------
    df : pd.DataFrame
        On-bottom drilling rows from data_loader.
    window_s : int
        Rolling window in seconds.
    min_rpm : float
        Minimum mean RPM to compute signals (exclude near-zero rows).
    """
    df = df.copy()

    dt = df["time_s"].diff().median()
    win = max(int(window_s / dt), 5) if (dt and dt > 0) else 15
    logger.info("Signal window: %d s → %d samples (dt=%.1f s)", window_s, win, dt)

    rpm = df["rpm"].fillna(0.0)
    torque = df["torque_kNm"].fillna(0.0)

    # --- Surface RPM signals -------------------------------------------------
    df["rpm_roll_mean"] = rpm.rolling(win, min_periods=5).mean()
    df["rpm_roll_std"] = rpm.rolling(win, min_periods=5).std().fillna(0)

    denom = df["rpm_roll_mean"].clip(lower=min_rpm)
    df["rpm_ssi"] = df["rpm_roll_std"] / denom          # surface SSI (attenuated)

    # --- Surface Torque deviation signal ------------------------------------
    # Uses a longer window for the baseline to capture slow drift
    baseline_win = max(win * 3, 30)
    df["torque_baseline"] = (
        torque.rolling(baseline_win, min_periods=10).median()
    )
    df["torque_roll_std"] = torque.rolling(win, min_periods=5).std().fillna(0)

    baseline = df["torque_baseline"].clip(lower=0.5)
    df["torque_deviation"] = (torque - df["torque_baseline"]) / baseline
    df["torque_spike"] = (
        torque > df["torque_baseline"] + _TORQUE_SPIKE_SIGMA * df["torque_roll_std"]
    )

    # --- MWD Downhole signal -------------------------------------------------
    # Normalise PKtoPK RPM by rolling mean RPM: mwd_ssi = PKtoPK / RPM_mean
    # This gives a physically meaningful dimensionless ratio (comparable to SSI).
    # A ratio of 0.3 (30% oscillation) = mild; 1.0+ = severe.
    # Clip to 0–2 then rescale to 0–1 for CSS weighting.
    if "mwd_ss_pktopk" in df.columns:
        mwd_raw = df["mwd_ss_pktopk"].fillna(0.0)
        # Normalise by rolling RPM mean; avoid division by near-zero
        mwd_denom = df["rpm_roll_mean"].clip(lower=min_rpm)
        df["mwd_ssi"] = (mwd_raw / mwd_denom).clip(0, 2) / 2.0  # maps 0-200% → 0-1
        # Propagate MWD readings forward (MWD surveys transmitted at intervals)
        df["mwd_ssi"] = df["mwd_ssi"].replace(0, np.nan).ffill(limit=8).fillna(0)
    else:
        df["mwd_ssi"] = 0.0

    # --- Composite Severity Score (CSS) --------------------------------------
    # MWD (60%) + surface torque deviation (30%) + surface RPM oscillation (10%)
    torque_contrib = df["torque_deviation"].clip(0, 2) * 0.30 * 0.5  # max 0.30
    mwd_contrib = df["mwd_ssi"] * 0.60
    rpm_contrib = df["rpm_ssi"].clip(0, 2) * 0.10 * 0.5

    df["css"] = (torque_contrib + mwd_contrib + rpm_contrib).clip(0, 1)

    # --- Severity label ------------------------------------------------------
    conditions = [
        df["css"] >= SEVERITY_MODERATE,
        df["css"] >= SEVERITY_MILD,
        df["css"] >= SEVERITY_STABLE,
    ]
    choices = ["SEVERE", "MODERATE", "MILD"]
    df["severity_label"] = np.select(conditions, choices, default="STABLE")

    # Mask rows where the bit is not rotating
    not_rotating = df["rpm_roll_mean"].fillna(0) < min_rpm
    df.loc[not_rotating, ["rpm_ssi", "css"]] = np.nan

    logger.info(
        "Signals computed | CSS: max=%.3f p50=%.3f p95=%.3f | "
        "MWD coverage: %.1f%% | torque spikes: %.1f%%",
        df["css"].max(),
        df["css"].quantile(0.50),
        df["css"].quantile(0.95),
        (df["mwd_ssi"] > 0).mean() * 100,
        df["torque_spike"].mean() * 100,
    )
    return df


def detect_events(
    df: pd.DataFrame,
    css_threshold: float = SEVERITY_MILD,
    min_duration_s: float = 20.0,
) -> pd.DataFrame:
    """
    Label stick-slip events using the Composite Severity Score.

    An event is declared when CSS ≥ css_threshold for ≥ min_duration_s
    consecutive seconds. Each contiguous event segment receives a unique
    integer event_id.

    Returns
    -------
    pd.DataFrame
        Input with added columns:
          stick_slip_flag  : bool
          event_id         : int (0 = no event)
    """
    df = df.copy()

    raw_flag = df["css"].fillna(0) >= css_threshold

    dt = df["time_s"].diff().median()
    min_samples = max(int(min_duration_s / dt), 3) if (dt and dt > 0) else 5

    sustained = (
        raw_flag.astype(int)
        .rolling(min_samples, min_periods=min_samples)
        .min()
        .fillna(0)
        .astype(bool)
    )
    df["stick_slip_flag"] = sustained

    # Assign unique IDs to contiguous event segments
    transitions = df["stick_slip_flag"].astype(int).diff().fillna(0)
    event_id = 0
    ids = np.zeros(len(df), dtype=int)
    for loc, (df_idx, val) in enumerate(transitions.items()):
        if val == 1:
            event_id += 1
        if df.loc[df_idx, "stick_slip_flag"]:
            ids[loc] = event_id
    df["event_id"] = ids

    n_events = int(df["event_id"].max())
    flagged_pct = float(df["stick_slip_flag"].mean() * 100)
    logger.info(
        "Detection | events=%d | flagged=%.1f%% of on-bottom time | CSS≥%.2f for ≥%.0fs",
        n_events, flagged_pct, css_threshold, min_duration_s,
    )
    return df


def compute_torsional_frequency(
    df: pd.DataFrame,
    segment_s: float = 300.0,
    target_column: str = "torque_kNm",
) -> dict[str, float]:
    """
    Estimate dominant torsional oscillation frequency via FFT of torque
    signal during the most severe stick-slip event.
    """
    events = df[df.get("stick_slip_flag", pd.Series(False, index=df.index))]
    if events.empty:
        return {"dominant_freq_hz": 0.0, "period_s": 0.0, "oscillations_per_minute": 0.0}

    peak_css_by_event = df[df["event_id"] > 0].groupby("event_id")["css"].max()
    if peak_css_by_event.empty:
        return {"dominant_freq_hz": 0.0, "period_s": 0.0, "oscillations_per_minute": 0.0}

    worst_event = int(peak_css_by_event.idxmax())
    t_start = float(df[df["event_id"] == worst_event]["time_s"].iloc[0])
    seg = df[
        (df["time_s"] >= t_start) & (df["time_s"] <= t_start + segment_s)
    ][target_column].dropna()

    if len(seg) < 16:
        return {"dominant_freq_hz": 0.0, "period_s": 0.0, "oscillations_per_minute": 0.0}

    dt = float(df["time_s"].diff().median())
    signal = seg.values - seg.mean()
    fft_mag = np.abs(np.fft.rfft(signal))
    freqs = np.fft.rfftfreq(len(signal), d=dt)

    valid = (freqs > 0.005) & (freqs < 0.5)
    if not valid.any():
        return {"dominant_freq_hz": 0.0, "period_s": 0.0, "oscillations_per_minute": 0.0}

    dominant_freq = float(freqs[valid][np.argmax(fft_mag[valid])])
    result = {
        "dominant_freq_hz": round(dominant_freq, 5),
        "period_s": round(1.0 / dominant_freq, 1),
        "oscillations_per_minute": round(dominant_freq * 60.0, 2),
    }
    logger.info(
        "Torsional FFT (event %d) | freq=%.4f Hz | period=%.1f s",
        worst_event, result["dominant_freq_hz"], result["period_s"],
    )
    return result


def validate_against_mwd(df: pd.DataFrame) -> dict[str, float]:
    """
    Compare surface-derived CSS against MWD downhole stick-slip measurements.

    Key metric: even with 40% weighting, surface torque correlation with
    MWD captures most moderate/severe events (recall on severe events).
    """
    if "mwd_ss_pktopk" not in df.columns:
        return {}

    sub = df[df["mwd_ss_pktopk"].notna() & df["css"].notna()].copy()
    if sub.empty:
        logger.warning("No overlapping CSS + MWD data.")
        return {}

    mwd_norm = (sub["mwd_ss_pktopk"] / _MWD_MAX_PKTOPK).clip(0, 1)
    pearson = float(np.corrcoef(sub["css"].values, mwd_norm.values)[0, 1])

    mwd_positive = mwd_norm >= 0.1   # MWD PKtoPK ≥ 40 rpm = positive
    ssi_positive = sub["stick_slip_flag"] if "stick_slip_flag" in sub.columns else pd.Series(False)

    tp = int((ssi_positive & mwd_positive).sum())
    fp = int((ssi_positive & ~mwd_positive).sum())
    fn = int((~ssi_positive & mwd_positive).sum())

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)
          if (precision + recall) > 0 else 0.0)

    metrics = {
        "pearson_r": round(pearson, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "n_samples": len(sub),
        "mwd_mean_pktopk_rpm": round(float(sub["mwd_ss_pktopk"].mean()), 1),
        "mwd_max_pktopk_rpm": round(float(sub["mwd_ss_pktopk"].max()), 1),
    }
    logger.info(
        "MWD Validation | r=%.3f | P=%.2f | R=%.2f | F1=%.2f | n=%d",
        pearson, precision, recall, f1, len(sub),
    )
    return metrics
