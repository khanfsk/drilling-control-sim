// Core data types matching the JSON output from preprocessing/preprocess.py

export type SeverityLabel = "STABLE" | "MILD" | "MODERATE" | "SEVERE";
export type ControllerState = "NORMAL" | "DETECTING" | "MITIGATING" | "RECOVERING";

export interface TelemetryRow {
  elapsed_s: number;
  bit_depth_m: number | null;
  rpm: number | null;
  torque_kNm: number | null;
  wob_kkgf: number | null;
  rop_mh: number | null;
  rpm_ssi: number | null;
  torque_deviation: number | null;
  torque_spike: 0 | 1 | null;
  mwd_ss_pktopk: number | null;
  mwd_ssi: number | null;
  css: number | null;
  severity_label: SeverityLabel | null;
  stick_slip_flag: 0 | 1 | null;
  event_id: number | null;
  state: ControllerState | null;
  wob_setpoint: number | null;
  rpm_setpoint: number | null;
  sim_rpm: number | null;
  sim_torque: number | null;
  sim_rop: number | null;
}

export interface DrillingEvent {
  event_id: number;
  start_elapsed_s: number;
  end_elapsed_s: number;
  duration_s: number;
  depth_m: number;
  peak_css: number;
  mean_css: number;
  severity: SeverityLabel;
  mean_wob_kkgf: number;
  mean_rpm: number;
  peak_mwd_pktopk: number | null;
  wob_reduction_kkgf: number | null;
}

export interface DetectionConfig {
  method: string;
  css_threshold: number;
  min_duration_s: number;
  signals: Record<string, string>;
}

export interface ControllerConfig {
  type: string;
  states: ControllerState[];
  nominal_wob_kkgf: number;
  nominal_rpm: number;
  kp_wob: number;
  wob_min_fraction: number;
  rpm_max_increase_rpm: number;
  detection_holdoff_s: number;
}

export interface ValidationMetrics {
  pearson_r: number;
  precision: number;
  recall: number;
  f1: number;
  n_samples: number;
  mwd_mean_pktopk_rpm: number;
  mwd_max_pktopk_rpm: number;
}

export interface Metadata {
  well: string;
  field: string;
  operator: string;
  license: string;
  section: string;
  depth_range_m: [number, number];
  drilling_days: number;
  on_bottom_samples: number;
  downsampled_samples: number;
  n_events: number;
  severe_events: number;
  moderate_events: number;
  mwd_max_pktopk_rpm: number;
  key_insight: string;
  detection: DetectionConfig;
  validation: ValidationMetrics;
  torsional_frequency: {
    dominant_freq_hz: number;
    period_s: number;
    oscillations_per_minute: number;
  };
  controller: ControllerConfig;
}
