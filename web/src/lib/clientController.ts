/**
 * clientController.ts
 * -------------------
 * Client-side auto-driller state machine.
 * Re-runs when the user adjusts controller parameters via the tuning sliders.
 */

import type { ProcessedRow } from "./clientDetection";

export type ControllerState = "NORMAL" | "DETECTING" | "MITIGATING" | "RECOVERING";

export interface ControllerParams {
  ssiEngage: number;       // CSS threshold to enter DETECTING (default 0.25)
  ssiRecovery: number;     // CSS threshold to exit MITIGATING (default 0.20)
  holdoffSamples: number;  // samples of sustained detection before acting (default 5)
  kpWob: number;           // proportional gain on WOB reduction (default 0.30)
  wobMinFraction: number;  // floor = this fraction of nominal WOB (default 0.35)
  kpRpm: number;           // proportional gain on RPM increase (default 0.15)
  rpmMaxIncrease: number;  // max RPM increase above nominal (default 25)
}

export const DEFAULT_CONTROLLER: ControllerParams = {
  ssiEngage: 0.25,
  ssiRecovery: 0.20,
  holdoffSamples: 5,
  kpWob: 0.30,
  wobMinFraction: 0.35,
  kpRpm: 0.15,
  rpmMaxIncrease: 25,
};

export interface ControllerOutput {
  state: ControllerState;
  wob_setpoint: number;
  rpm_setpoint: number;
}

export function runController(
  rows: ProcessedRow[],
  params: ControllerParams,
  nominalWob: number,
  nominalRpm: number
): ControllerOutput[] {
  const outputs: ControllerOutput[] = [];

  let state: ControllerState = "NORMAL";
  let detectionStartIdx = 0;
  let recoveryStartIdx = 0;
  let wobSp = nominalWob;
  let rpmSp = nominalRpm;

  for (let i = 0; i < rows.length; i++) {
    const css = rows[i].computed_css;

    switch (state) {
      case "NORMAL":
        wobSp = nominalWob;
        rpmSp = nominalRpm;
        if (css >= params.ssiEngage) {
          state = "DETECTING";
          detectionStartIdx = i;
        }
        break;

      case "DETECTING":
        if (css < params.ssiEngage) {
          state = "NORMAL";
        } else if (i - detectionStartIdx >= params.holdoffSamples) {
          state = "MITIGATING";
        }
        break;

      case "MITIGATING": {
        const excess = Math.max(0, css - params.ssiEngage);
        wobSp = Math.max(
          nominalWob * params.wobMinFraction,
          nominalWob - params.kpWob * excess * nominalWob
        );
        rpmSp = Math.min(
          nominalRpm + params.rpmMaxIncrease,
          nominalRpm + params.kpRpm * excess * 10
        );
        if (css < params.ssiRecovery) {
          state = "RECOVERING";
          recoveryStartIdx = i;
        }
        break;
      }

      case "RECOVERING":
        if (css >= params.ssiEngage) {
          state = "MITIGATING";
        } else if (i - recoveryStartIdx >= 12) {
          // Ramp back
          wobSp = Math.min(nominalWob, wobSp + 0.008 * nominalWob);
          rpmSp = Math.max(nominalRpm, rpmSp - 0.5);
          if (wobSp >= nominalWob * 0.98) {
            state = "NORMAL";
            wobSp = nominalWob;
            rpmSp = nominalRpm;
          }
        }
        break;
    }

    outputs.push({ state, wob_setpoint: wobSp, rpm_setpoint: rpmSp });
  }

  return outputs;
}
