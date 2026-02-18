/**
 * clientDetection.ts
 * ------------------
 * Client-side re-computation of the Composite Severity Score and event
 * detection. Runs in the browser when the user adjusts detection parameters
 * via the interactive tuning panel.
 *
 * All signals (mwd_ssi, torque_deviation, rpm_ssi) are pre-computed by the
 * Python preprocessor and stored in telemetry.json. Only the CSS weighting
 * and threshold need to be recomputed on parameter change.
 */

import type { TelemetryRow } from "./types";

export interface DetectionParams {
  mwdWeight: number;       // 0–1, default 0.60
  torqueWeight: number;    // 0–1, default 0.30
  rpmWeight: number;       // 0–1, default 0.10
  cssThreshold: number;    // default 0.25
  minDurationSamples: number; // default 4 (≈20s at 5s/sample)
}

export const DEFAULT_PARAMS: DetectionParams = {
  mwdWeight: 0.60,
  torqueWeight: 0.30,
  rpmWeight: 0.10,
  cssThreshold: 0.25,
  minDurationSamples: 4,
};

export interface ProcessedRow extends TelemetryRow {
  computed_css: number;
  computed_flag: boolean;
  computed_event_id: number;
}

/**
 * Re-compute CSS, detect events, and return the processed rows.
 * Fast enough to run synchronously in the browser (~5ms for 11k rows).
 */
export function recompute(
  rows: TelemetryRow[],
  params: DetectionParams
): ProcessedRow[] {
  const total = params.mwdWeight + params.torqueWeight + params.rpmWeight;
  const wMwd = params.mwdWeight / total;
  const wTorque = params.torqueWeight / total;
  const wRpm = params.rpmWeight / total;

  // Step 1: compute CSS for every row
  const processed: ProcessedRow[] = rows.map((r) => {
    const mwd = (r.mwd_ssi ?? 0) * wMwd;
    const torque = Math.max(0, Math.min(1, (r.torque_deviation ?? 0) * 0.5)) * wTorque;
    const rpm = Math.max(0, Math.min(1, (r.rpm_ssi ?? 0) * 0.5)) * wRpm;
    const css = Math.min(1, mwd + torque + rpm);
    return { ...r, computed_css: css, computed_flag: false, computed_event_id: 0 };
  });

  // Step 2: detect events (sustained CSS ≥ threshold for ≥ minDurationSamples)
  const n = processed.length;
  const rawFlag = processed.map((r) => r.computed_css >= params.cssThreshold);

  // Rolling minimum over window to require sustained detection
  const sustained: boolean[] = new Array(n).fill(false);
  const w = params.minDurationSamples;
  for (let i = w - 1; i < n; i++) {
    let allTrue = true;
    for (let j = i - w + 1; j <= i; j++) {
      if (!rawFlag[j]) { allTrue = false; break; }
    }
    if (allTrue) sustained[i] = true;
  }

  // Step 3: assign event IDs
  let eventId = 0;
  let inEvent = false;
  for (let i = 0; i < n; i++) {
    if (sustained[i] && !inEvent) {
      eventId++;
      inEvent = true;
    } else if (!sustained[i]) {
      inEvent = false;
    }
    processed[i].computed_flag = sustained[i];
    processed[i].computed_event_id = sustained[i] ? eventId : 0;
  }

  return processed;
}

export type SeverityLabel = "STABLE" | "MILD" | "MODERATE" | "SEVERE";

export function cssToSeverity(css: number): SeverityLabel {
  if (css >= 0.75) return "SEVERE";
  if (css >= 0.50) return "MODERATE";
  if (css >= 0.25) return "MILD";
  return "STABLE";
}

export function severityColor(s: SeverityLabel): string {
  switch (s) {
    case "SEVERE":   return "#ef4444";
    case "MODERATE": return "#f97316";
    case "MILD":     return "#eab308";
    default:         return "#22c55e";
  }
}
