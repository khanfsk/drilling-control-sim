"""
data_loader.py
--------------
Loads and preprocesses the Volve field time-series drilling log.
Isolates on-bottom drilling intervals and returns a clean DataFrame
with standardized column names for use by detection and control modules.

Key filtering criteria for active drilling rows:
  - WOB > 0.5 kkgf  (bit is engaged with formation)
  - RPM > 15         (rotary system is turning)
  - |torque| < 50 kNm (clip instrument outliers)
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Raw column → internal alias mapping
# ---------------------------------------------------------------------------
COLUMN_MAP: dict[str, str] = {
    "Time s": "timestamp_raw",
    "Averaged RPM rpm": "rpm",
    "Average Surface Torque kN.m": "torque_kNm",
    "Averaged WOB kkgf": "wob_kkgf",
    "Rate of Penetration m/h": "rop_mh",
    "Bit Depth m": "bit_depth_m",
    "MWD Stick-Slip PKtoPK RPM rpm": "mwd_ss_pktopk",
    "Stand Pipe Pressure kPa": "spp_kPa",
    "Average Standpipe Pressure kPa": "spp2_kPa",
    "DateTime parsed": "datetime",
}

# Rows 50 000–300 000 (chunks 1–5) contain the 12.25-in drilling section
_CHUNKS_TO_LOAD = [1, 2, 3, 4, 5]
_CHUNK_SIZE = 50_000

# Active drilling gate criteria
_MIN_WOB_KKGF = 0.5
_MIN_RPM = 15.0
_MAX_TORQUE_ABS = 50.0   # clip sensor glitches (outlier torque = -888 kNm)


def load_time_log(filepath: str | Path) -> pd.DataFrame:
    """
    Load the Volve time-indexed drilling log and return a pre-filtered
    DataFrame containing only confirmed on-bottom drilling rows.

    Parameters
    ----------
    filepath : str or Path
        Path to the raw CSV.

    Returns
    -------
    pd.DataFrame
        Cleaned DataFrame with standardised column names.
    """
    filepath = Path(filepath)
    logger.info("Loading time log: %s", filepath.name)

    parts: list[pd.DataFrame] = []
    for i, chunk in enumerate(
        pd.read_csv(filepath, chunksize=_CHUNK_SIZE, low_memory=False)
    ):
        if i in _CHUNKS_TO_LOAD:
            parts.append(chunk)
        elif i > max(_CHUNKS_TO_LOAD):
            break

    raw = pd.concat(parts, ignore_index=True)
    logger.info("Raw rows loaded: %d", len(raw))

    rename = {k: v for k, v in COLUMN_MAP.items() if k in raw.columns}
    df = raw.rename(columns=rename)

    # --- Timestamps ----------------------------------------------------------
    if "datetime" in df.columns:
        df["datetime"] = pd.to_datetime(df["datetime"], utc=True, errors="coerce")
        df = df.sort_values("datetime").reset_index(drop=True)
        t0 = df["datetime"].dropna().iloc[0]
        df["time_s"] = (df["datetime"] - t0).dt.total_seconds()
    else:
        df["time_s"] = pd.to_numeric(
            df.get("timestamp_raw", pd.Series(dtype=float)), errors="coerce"
        )

    # --- Active drilling filter ----------------------------------------------
    # WOB and RPM must both be in the active-drilling range.
    # Negative or near-zero WOB indicates the bit is off bottom.
    df["wob_kkgf"] = df["wob_kkgf"].clip(lower=0.0)
    on_bottom = (df["wob_kkgf"] > _MIN_WOB_KKGF) & (df["rpm"] > _MIN_RPM)
    df = df[on_bottom].copy()
    logger.info("On-bottom drilling rows (WOB>%.1f, RPM>%.1f): %d",
                _MIN_WOB_KKGF, _MIN_RPM, len(df))

    # --- Signal conditioning -------------------------------------------------
    # Torque: clip sensor glitches (e.g., -888 kNm spike is an instrument fault)
    df["torque_kNm"] = df["torque_kNm"].clip(lower=-_MAX_TORQUE_ABS, upper=_MAX_TORQUE_ABS)

    # ROP: cap extreme spikes at 99th percentile × 1.5 and interpolate gaps
    rop_99 = df["rop_mh"].quantile(0.99)
    df.loc[df["rop_mh"] > rop_99 * 1.5, "rop_mh"] = np.nan
    df["rop_mh"] = df["rop_mh"].interpolate(method="linear", limit=10)

    # WOB: forward-fill short sensor dropouts (common in real WITSML streams)
    df["wob_kkgf"] = df["wob_kkgf"].ffill().bfill()

    # --- Deduplicate and sort ------------------------------------------------
    df = df.drop_duplicates(subset="time_s").sort_values("time_s").reset_index(drop=True)

    logger.info(
        "Date range : %s → %s",
        df["datetime"].min().strftime("%Y-%m-%d %H:%M"),
        df["datetime"].max().strftime("%Y-%m-%d %H:%M"),
    )
    logger.info(
        "Depth range: %.1f – %.1f m  |  RPM: %.0f–%.0f (median %.0f)",
        df["bit_depth_m"].min(),
        df["bit_depth_m"].max(),
        df["rpm"].min(),
        df["rpm"].max(),
        df["rpm"].median(),
    )

    return df
