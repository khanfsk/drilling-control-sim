"""
controller.py — Closed-loop auto-driller for torsional vibration mitigation.

PI-inspired, deterministic state machine: NORMAL → DETECTING → MITIGATING → RECOVERING.
When stick-slip is detected, WOB is reduced proportionally to CSS severity and RPM is
raised to push through the torsional resonance. See README for control equations.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum, auto

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class ControllerState(Enum):
    NORMAL = auto()
    DETECTING = auto()
    MITIGATING = auto()
    RECOVERING = auto()


@dataclass
class ControllerConfig:
    """All tunable parameters for the auto-driller controller."""

    # Detection coupling thresholds
    ssi_engage: float = 0.30           # enter DETECTING when SSI exceeds this
    ssi_recovery: float = 0.20         # exit MITIGATING when SSI falls below this
    detection_holdoff_s: float = 25.0  # seconds of sustained detection → MITIGATING

    # WOB control
    kp_wob: float = 0.30               # proportional gain: WOB reduction per unit excess SSI
    wob_min_fraction: float = 0.35     # WOB floor = 35% of nominal
    wob_ramp_rate: float = 0.008       # fraction of nominal WOB restored per sample

    # RPM control
    kp_rpm: float = 0.15               # proportional gain on RPM increase
    rpm_max_increase: float = 25.0     # hard ceiling on RPM increase above nominal (rpm)
    recovery_hold_s: float = 60.0      # seconds at ssi < recovery before ramp-up starts

    # Torsional physics model parameters (simplified spring-damper)
    drill_string_stiffness: float = 450.0   # Nm/rad
    bit_damping: float = 40.0               # Nm·s/rad
    inertia_drillstring: float = 1800.0     # kg·m²


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ControlAction:
    time_s: float
    state: ControllerState
    wob_setpoint: float
    rpm_setpoint: float
    ssi_observed: float
    action_taken: str = ""


@dataclass
class ControllerTrace:
    actions: list[ControlAction] = field(default_factory=list)

    def to_dataframe(self) -> pd.DataFrame:
        return pd.DataFrame([
            {
                "time_s": a.time_s,
                "state": a.state.name,
                "wob_setpoint": round(a.wob_setpoint, 4),
                "rpm_setpoint": round(a.rpm_setpoint, 2),
                "ssi_observed": round(a.ssi_observed, 4),
                "action_taken": a.action_taken,
            }
            for a in self.actions
        ])


# ---------------------------------------------------------------------------
# AutoDriller controller
# ---------------------------------------------------------------------------

class AutoDriller:
    """
    Deterministic closed-loop auto-driller for torsional vibration mitigation.

    Parameters
    ----------
    config : ControllerConfig, optional
        Tuning parameters. Defaults to calibrated values for Volve 12.25-in section.

    Usage
    -----
        controller = AutoDriller(config)
        trace = controller.run(df)       # df from detection.detect_events()
        ctrl_df = trace.to_dataframe()
    """

    def __init__(self, config: ControllerConfig | None = None) -> None:
        self.cfg = config or ControllerConfig()
        self._state = ControllerState.NORMAL
        self._detection_start_t: float = 0.0
        self._recovery_start_t: float = 0.0
        self._nominal_wob: float = 0.0
        self._nominal_rpm: float = 0.0

    def run(self, df: pd.DataFrame) -> ControllerTrace:
        """
        Iterate through telemetry and produce a control response trace.

        Parameters
        ----------
        df : pd.DataFrame
            Must contain: time_s, ssi, wob_kkgf, rpm, stick_slip_flag.
            (Already filtered to active drilling by data_loader.)

        Returns
        -------
        ControllerTrace
        """
        trace = ControllerTrace()

        # Establish nominal setpoints: median of earliest stable 5 minutes
        t_window_end = df["time_s"].iloc[0] + 300.0
        early = df[df["time_s"] <= t_window_end]
        stable_early = early[early["css"].fillna(1.0) < self.cfg.ssi_engage]

        if len(stable_early) >= 10:
            self._nominal_wob = float(stable_early["wob_kkgf"].median())
            self._nominal_rpm = float(stable_early["rpm"].median())
        else:
            # Fallback: global drilling median
            self._nominal_wob = float(df["wob_kkgf"].median())
            self._nominal_rpm = float(df["rpm"].median())

        # Ensure nominal values are physically plausible
        self._nominal_wob = max(self._nominal_wob, 2.0)
        self._nominal_rpm = max(self._nominal_rpm, 30.0)

        wob_sp = self._nominal_wob
        rpm_sp = self._nominal_rpm

        logger.info(
            "AutoDriller nominal | WOB=%.2f kkgf | RPM=%.1f",
            self._nominal_wob,
            self._nominal_rpm,
        )

        for _, row in df.iterrows():
            ssi = row.get("css", np.nan)
            t = float(row["time_s"])

            if np.isnan(ssi):
                trace.actions.append(ControlAction(
                    time_s=t, state=self._state,
                    wob_setpoint=wob_sp, rpm_setpoint=rpm_sp,
                    ssi_observed=0.0, action_taken="no_data",
                ))
                continue

            action = "hold"

            if self._state == ControllerState.NORMAL:
                wob_sp = self._nominal_wob
                rpm_sp = self._nominal_rpm
                if ssi >= self.cfg.ssi_engage:
                    self._state = ControllerState.DETECTING
                    self._detection_start_t = t
                    action = "event_detected"

            elif self._state == ControllerState.DETECTING:
                if ssi < self.cfg.ssi_engage:
                    self._state = ControllerState.NORMAL
                    action = "transient_cleared"
                elif (t - self._detection_start_t) >= self.cfg.detection_holdoff_s:
                    self._state = ControllerState.MITIGATING
                    action = "mitigation_engaged"

            elif self._state == ControllerState.MITIGATING:
                excess = max(0.0, ssi - self.cfg.ssi_engage)

                # WOB: reduce proportionally to SSI excess
                wob_reduction = self.cfg.kp_wob * excess * self._nominal_wob
                wob_sp = max(
                    self._nominal_wob * self.cfg.wob_min_fraction,
                    self._nominal_wob - wob_reduction,
                )

                # RPM: increase proportionally to push through resonance
                rpm_increase = self.cfg.kp_rpm * excess * 10.0
                rpm_sp = min(
                    self._nominal_rpm + self.cfg.rpm_max_increase,
                    self._nominal_rpm + rpm_increase,
                )

                action = (
                    f"WOB↓{wob_sp:.1f} RPM↑{rpm_sp:.0f}"
                )

                if ssi < self.cfg.ssi_recovery:
                    self._state = ControllerState.RECOVERING
                    self._recovery_start_t = t
                    action = "recovery_phase"

            elif self._state == ControllerState.RECOVERING:
                hold_elapsed = t - self._recovery_start_t

                if ssi >= self.cfg.ssi_engage:
                    # Relapse: jump back to mitigating immediately
                    self._state = ControllerState.MITIGATING
                    action = "relapse"
                elif hold_elapsed >= self.cfg.recovery_hold_s:
                    # Stable for hold period: ramp WOB back toward nominal
                    wob_sp = min(
                        self._nominal_wob,
                        wob_sp + self.cfg.wob_ramp_rate * self._nominal_wob,
                    )
                    rpm_sp = max(
                        self._nominal_rpm,
                        rpm_sp - self.cfg.wob_ramp_rate * self.cfg.rpm_max_increase,
                    )
                    action = f"ramp_wob→{wob_sp:.1f}"

                    if wob_sp >= self._nominal_wob * 0.98:
                        rpm_sp = self._nominal_rpm
                        self._state = ControllerState.NORMAL
                        action = "fully_recovered"

            trace.actions.append(ControlAction(
                time_s=t, state=self._state,
                wob_setpoint=wob_sp, rpm_setpoint=rpm_sp,
                ssi_observed=ssi, action_taken=action,
            ))

        # Report state distribution
        state_counts = {}
        for a in trace.actions:
            state_counts[a.state.name] = state_counts.get(a.state.name, 0) + 1
        logger.info("Controller state distribution: %s", state_counts)

        return trace


# ---------------------------------------------------------------------------
# Physics model: torsional drill-string response simulation
# ---------------------------------------------------------------------------

def simulate_drillstring_response(
    ctrl_df: pd.DataFrame,
    df: pd.DataFrame,
    config: ControllerConfig | None = None,
) -> pd.DataFrame:
    """
    Simulate drill string torsional response under controller setpoints.

    Euler integration of:  I × dω/dt = T_drive − k × θ − c × ω − τ_bit(WOB)

    Returns ctrl_df with added columns: sim_rpm, sim_torque, sim_rop.
    """
    cfg = config or ControllerConfig()

    # Merge depth/datetime context for visualisation
    context_cols = ["time_s", "bit_depth_m"]
    avail = [c for c in context_cols if c in df.columns]
    merged = ctrl_df.merge(
        df[avail].drop_duplicates("time_s"),
        on="time_s",
        how="left",
    )

    dt_series = merged["time_s"].diff().fillna(4.0).clip(lower=0.5, upper=30.0)
    n = len(merged)

    sim_rpm = np.zeros(n)
    sim_torque = np.zeros(n)
    sim_rop = np.zeros(n)

    k = cfg.drill_string_stiffness
    c = cfg.bit_damping
    I = cfg.inertia_drillstring

    # Initialise at the first setpoint
    omega = float(merged["rpm_setpoint"].iloc[0]) * (2 * np.pi / 60.0)
    theta_twist = 0.0

    for i in range(n):
        dt = float(dt_series.iloc[i])
        wob = float(merged["wob_setpoint"].iloc[i])
        omega_set = float(merged["rpm_setpoint"].iloc[i]) * (2 * np.pi / 60.0)

        # Bit-rock Coulomb friction torque (Pessier & Fear 1992 simplified model)
        # τ_bit = μ × WOB × r_bit  where r_bit ≈ 0.155 m for 12.25-in bit
        tau_bit = 0.55 * wob * 9.81 * 0.155

        # Drive system: PD torque controller tracking RPM setpoint
        T_drive = k * 0.4 * (omega_set - omega) + c * 0.08 * omega_set

        # Equation of motion (forward Euler)
        torque_net = T_drive - k * theta_twist - c * omega - tau_bit
        alpha = np.clip(torque_net / I, -50.0, 50.0)   # limit angular acceleration
        omega += alpha * dt
        omega = max(0.0, omega)
        theta_twist = np.clip(theta_twist + (omega_set - omega) * dt, -5.0, 5.0)

        sim_rpm[i] = omega * 60.0 / (2 * np.pi)
        sim_torque[i] = max(0.0, abs(T_drive - tau_bit))

        # Bingham-style ROP model: ROP ∝ (WOB - WOB_threshold)^0.6 × N^0.4
        wob_eff = max(0.0, wob - 1.2)
        n_rpm = max(0.0, sim_rpm[i])
        sim_rop[i] = 2.8 * (wob_eff ** 0.6) * ((n_rpm / 80.0) ** 0.4)

    merged["sim_rpm"] = np.clip(sim_rpm, 0, 300)
    merged["sim_torque"] = np.clip(sim_torque, 0, 60)
    merged["sim_rop"] = np.clip(sim_rop, 0, 200)

    logger.info(
        "Physics model | RPM: %.1f–%.1f | Torque: %.2f–%.2f kNm | ROP: %.1f–%.1f m/h",
        merged["sim_rpm"].min(), merged["sim_rpm"].max(),
        merged["sim_torque"].min(), merged["sim_torque"].max(),
        merged["sim_rop"].min(), merged["sim_rop"].max(),
    )
    return merged
