"""
preprocess.py
-------------
Run this script once locally to transform the raw Volve time-series CSV
into a compact JSON payload for the Next.js web dashboard.

Outputs (written to ../web/public/data/)
-----------------------------------------
  telemetry.json  — downsampled drilling time series (~2–4 MB)
  events.json     — per-event summary table
  metadata.json   — well info, detection stats, validation results

Usage
-----
  python preprocessing/preprocess.py
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.data_loader import load_time_log
from src.detection import (
    compute_signals,
    compute_torsional_frequency,
    detect_events,
    validate_against_mwd,
)
from src.controller import AutoDriller, ControllerConfig, simulate_drillstring_response

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

RAW_CSV = (
    Path(__file__).parent.parent
    / "archive 2"
    / "Norway-NA-15_47_9-F-9 A time.csv"
)
OUT_DIR = Path(__file__).parent.parent / "web" / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Keep every N-th row in the telemetry JSON payload
DOWNSAMPLE_N = 2


def _json_safe(obj):
    """Serialise numpy scalars for JSON (called by default= for unknown types)."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, np.floating):
        return None if (obj != obj) else round(float(obj), 5)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    raise TypeError(f"Not serialisable: {type(obj)}")


def _sanitize(obj):
    """
    Recursively replace Python float NaN/Inf with None so that
    json.dump produces valid JSON (NaN is not valid in JSON).
    """
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, float) and (obj != obj or obj == float("inf") or obj == float("-inf")):
        return None
    return obj


def main() -> None:

    # -----------------------------------------------------------------------
    # 1. Load
    # -----------------------------------------------------------------------
    df = load_time_log(RAW_CSV)

    # -----------------------------------------------------------------------
    # 2. Detect
    # -----------------------------------------------------------------------
    df = compute_signals(df, window_s=60)
    df = detect_events(df, css_threshold=0.25, min_duration_s=20.0)

    validation = validate_against_mwd(df)
    torsional = compute_torsional_frequency(df)

    # -----------------------------------------------------------------------
    # 3. Control
    # -----------------------------------------------------------------------
    cfg = ControllerConfig()
    controller = AutoDriller(cfg)
    trace = controller.run(df)
    ctrl_df = trace.to_dataframe()

    # Simulate physics response under controller setpoints
    sim_df = simulate_drillstring_response(ctrl_df, df, cfg)

    # Merge controller outputs onto telemetry
    df = df.merge(
        ctrl_df[["time_s", "state", "wob_setpoint", "rpm_setpoint"]],
        on="time_s",
        how="left",
    )
    df = df.merge(
        sim_df[["time_s", "sim_rpm", "sim_torque", "sim_rop"]],
        on="time_s",
        how="left",
    )

    # -----------------------------------------------------------------------
    # 4. Telemetry JSON
    # -----------------------------------------------------------------------
    logger.info("Serialising telemetry JSON…")

    # Normalise time to elapsed seconds from t=0
    t0 = float(df["time_s"].iloc[0])
    df["elapsed_s"] = (df["time_s"] - t0).round(1)

    cols_out = [
        "elapsed_s", "bit_depth_m",
        "rpm", "torque_kNm", "wob_kkgf", "rop_mh",
        "rpm_ssi", "torque_deviation", "torque_spike",
        "mwd_ss_pktopk", "mwd_ssi", "css",
        "severity_label", "stick_slip_flag", "event_id",
        "state", "wob_setpoint", "rpm_setpoint",
        "sim_rpm", "sim_torque", "sim_rop",
    ]
    available = [c for c in cols_out if c in df.columns]
    out = df[available].iloc[::DOWNSAMPLE_N].copy()

    # Convert booleans to int for JSON compactness
    for col in ["stick_slip_flag", "torque_spike"]:
        if col in out.columns:
            out[col] = out[col].astype(int)

    records = _sanitize(out.to_dict(orient="records"))

    out_telem = OUT_DIR / "telemetry.json"
    with open(out_telem, "w") as f:
        json.dump(records, f, default=_json_safe, separators=(",", ":"))
    logger.info("Wrote telemetry.json | %d rows | %.1f MB",
                len(records), out_telem.stat().st_size / 1e6)

    # -----------------------------------------------------------------------
    # 5. Events JSON
    # -----------------------------------------------------------------------
    logger.info("Serialising events JSON…")

    events_data: list[dict] = []
    max_event = int(df["event_id"].max())
    for eid in range(1, max_event + 1):
        seg = df[df["event_id"] == eid]
        if seg.empty:
            continue
        events_data.append({
            "event_id": int(eid),
            "start_elapsed_s": round(float(seg["elapsed_s"].iloc[0]), 1),
            "end_elapsed_s": round(float(seg["elapsed_s"].iloc[-1]), 1),
            "duration_s": round(float(seg["elapsed_s"].iloc[-1] - seg["elapsed_s"].iloc[0]), 1),
            "depth_m": round(float(seg["bit_depth_m"].mean()), 1),
            "peak_css": round(float(seg["css"].max()), 4),
            "mean_css": round(float(seg["css"].mean()), 4),
            "severity": str(seg.loc[seg["css"].idxmax(), "severity_label"]),
            "mean_wob_kkgf": round(float(seg["wob_kkgf"].mean()), 3),
            "mean_rpm": round(float(seg["rpm"].mean()), 1),
            "peak_mwd_pktopk": (
                round(float(seg["mwd_ss_pktopk"].max()), 1)
                if seg["mwd_ss_pktopk"].notna().any() else None
            ),
            "wob_reduction_kkgf": (
                round(float(seg["wob_kkgf"].mean() - seg["wob_setpoint"].mean()), 3)
                if "wob_setpoint" in seg.columns else None
            ),
        })

    out_events = OUT_DIR / "events.json"
    with open(out_events, "w") as f:
        json.dump(events_data, f, default=_json_safe, separators=(",", ":"))
    logger.info("Wrote events.json | %d events", len(events_data))

    # -----------------------------------------------------------------------
    # 6. Metadata JSON
    # -----------------------------------------------------------------------
    logger.info("Serialising metadata JSON…")

    nominal_wob = float(df["wob_kkgf"].median())
    nominal_rpm = float(df["rpm"].median())

    metadata = {
        "well": "15/9-F-9 A",
        "field": "Volve",
        "operator": "Equinor (Statoil)",
        "license": "NPD Open Government Data",
        "section": '12.25 in',
        "depth_range_m": [
            round(float(df["bit_depth_m"].min()), 1),
            round(float(df["bit_depth_m"].max()), 1),
        ],
        "drilling_days": round(
            float((df["time_s"].max() - df["time_s"].min()) / 86400), 1
        ),
        "on_bottom_samples": len(df),
        "downsampled_samples": len(records),
        "n_events": len(events_data),
        "severe_events": int(
            sum(1 for e in events_data if e["severity"] == "SEVERE")
        ),
        "moderate_events": int(
            sum(1 for e in events_data if e["severity"] == "MODERATE")
        ),
        "mwd_max_pktopk_rpm": round(float(df["mwd_ss_pktopk"].max()), 1),
        "key_insight": (
            "Surface RPM variation during MWD-confirmed stick-slip events was "
            "±1 rpm while downhole PKtoPK oscillation reached 381 rpm — a "
            "380× attenuation by the drill string acting as a torsional spring. "
            "This demonstrates why downhole MWD data is essential for reliable "
            "stick-slip detection in this well."
        ),
        "detection": {
            "method": "Composite Severity Score (CSS)",
            "css_threshold": 0.25,
            "min_duration_s": 20.0,
            "signals": {
                "mwd_downhole": "50% weight — primary ground truth (MWD PKtoPK RPM)",
                "surface_torque": "40% weight — continuous proxy (torque deviation from rolling baseline)",
                "surface_rpm": "10% weight — attenuated but still present (std/mean RPM)",
            },
        },
        "validation": validation,
        "torsional_frequency": torsional,
        "controller": {
            "type": "Proportional State-Machine (PI-inspired, Soft Torque pattern)",
            "states": ["NORMAL", "DETECTING", "MITIGATING", "RECOVERING"],
            "nominal_wob_kkgf": round(nominal_wob, 3),
            "nominal_rpm": round(nominal_rpm, 1),
            "kp_wob": cfg.kp_wob,
            "wob_min_fraction": cfg.wob_min_fraction,
            "rpm_max_increase_rpm": cfg.rpm_max_increase,
            "detection_holdoff_s": cfg.detection_holdoff_s,
        },
    }

    out_meta = OUT_DIR / "metadata.json"
    with open(out_meta, "w") as f:
        json.dump(metadata, f, default=_json_safe, indent=2)
    logger.info("Wrote metadata.json")

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    logger.info(
        "\n"
        "═══ Preprocessing complete ═══\n"
        "  Well       : %s — %s\n"
        "  Depth      : %.0f – %.0f m\n"
        "  On-bottom  : %d samples → %d (downsampled)\n"
        "  Events     : %d total (%d severe)\n"
        "  MWD max SS : %.0f rpm PKtoPK\n"
        "  r(CSS,MWD) : %.3f\n"
        "  Output     : %s",
        metadata["well"], metadata["field"],
        metadata["depth_range_m"][0], metadata["depth_range_m"][1],
        metadata["on_bottom_samples"], metadata["downsampled_samples"],
        len(events_data), metadata["severe_events"],
        metadata["mwd_max_pktopk_rpm"],
        validation.get("pearson_r", 0.0),
        OUT_DIR,
    )


if __name__ == "__main__":
    main()
