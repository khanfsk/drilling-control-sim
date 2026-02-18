import type { SeverityLabel, ControllerState } from "./types";

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

/** Convert elapsed seconds to a human-readable duration string. */
export function formatDuration(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Convert elapsed seconds to elapsed days + hours label. */
export function formatElapsed(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  if (d > 0) return `Day ${d + 1}, ${h.toString().padStart(2, "0")}:00`;
  return `${h.toString().padStart(2, "0")}:00`;
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

export const SEVERITY_COLORS: Record<SeverityLabel, string> = {
  STABLE: "#22c55e",      // green-500
  MILD: "#eab308",        // yellow-500
  MODERATE: "#f97316",    // orange-500
  SEVERE: "#ef4444",      // red-500
};

export const SEVERITY_BG: Record<SeverityLabel, string> = {
  STABLE: "bg-green-500/10 text-green-400 border-green-500/30",
  MILD: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  MODERATE: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  SEVERE: "bg-red-500/10 text-red-400 border-red-500/30",
};

export const STATE_COLORS: Record<ControllerState, string> = {
  NORMAL: "#64748b",      // slate-500
  DETECTING: "#eab308",   // yellow-500
  MITIGATING: "#f97316",  // orange-500
  RECOVERING: "#3b82f6",  // blue-500
};

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

export function fmt(n: number | null | undefined, dp = 1): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toFixed(dp);
}

export function fmtPct(n: number | null | undefined, dp = 1): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(dp)}%`;
}

// ---------------------------------------------------------------------------
// CSS severity to 0-4 numeric level
// ---------------------------------------------------------------------------

export function cssToLevel(css: number): SeverityLabel {
  if (css >= 0.75) return "SEVERE";
  if (css >= 0.50) return "MODERATE";
  if (css >= 0.25) return "MILD";
  return "STABLE";
}

// ---------------------------------------------------------------------------
// Downsampling for chart performance
// ---------------------------------------------------------------------------

/** Return every N-th element of an array for chart rendering performance. */
export function downsample<T>(arr: T[], targetPoints: number): T[] {
  if (arr.length <= targetPoints) return arr;
  const step = Math.ceil(arr.length / targetPoints);
  return arr.filter((_, i) => i % step === 0);
}
