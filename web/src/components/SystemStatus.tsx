"use client";

/**
 * SystemStatus — Nielsen Heuristic #1: Visibility of system status.
 * Always shows what state the controller is in, in plain English.
 * Color coding follows CRAP Contrast: green = safe, yellow = alert,
 * orange = acting, blue = recovering.
 */

import type { TelemetryRow } from "@/lib/types";
import type { ControllerState } from "@/lib/types";
import { STATE_COLORS } from "@/lib/utils";

const STATE_PLAIN_ENGLISH: Record<ControllerState, string> = {
  NORMAL:
    "Normal operation — drilling parameters are within acceptable bounds. The auto-driller is holding the nominal Weight on Bit and RPM setpoints.",
  DETECTING:
    "Potential stick-slip detected — the Composite Severity Score has crossed the threshold. The system is monitoring to confirm whether this is a sustained event before taking action.",
  MITIGATING:
    "Actively mitigating stick-slip — the auto-driller has reduced Weight on Bit and raised the RPM setpoint to break the bit free from the stuck phase and restore smooth rotation.",
  RECOVERING:
    "Recovering — stick-slip has subsided. The system is holding reduced WOB for 60 seconds to confirm stability before ramping parameters back to nominal.",
};

const STATE_ICON: Record<ControllerState, string> = {
  NORMAL: "●",
  DETECTING: "◆",
  MITIGATING: "▲",
  RECOVERING: "▼",
};

interface Props {
  /** Pass the last row of the telemetry stream as "current" state */
  lastRow: TelemetryRow | undefined;
  /** Overall session stats */
  totalEvents: number;
  severeEvents: number;
}

export default function SystemStatus({ lastRow, totalEvents, severeEvents }: Props) {
  const state: ControllerState =
    (lastRow?.state as ControllerState) ?? "NORMAL";
  const color = STATE_COLORS[state];
  const depth = lastRow?.bit_depth_m;
  const css = lastRow?.css;

  return (
    <div
      className="rounded-lg border bg-[#0c1527] p-4 flex flex-col sm:flex-row sm:items-center gap-4"
      style={{ borderColor: `${color}40` }}
      role="status"
      aria-live="polite"
      aria-label={`Controller state: ${state}`}
    >
      {/* State badge */}
      <div className="flex items-center gap-3 shrink-0">
        <span
          className="text-lg font-mono font-bold"
          style={{ color }}
          aria-hidden
        >
          {STATE_ICON[state]}
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
            Controller State
          </p>
          <p className="font-bold font-mono text-sm" style={{ color }}>
            {state}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="hidden sm:block w-px h-8 bg-slate-800 shrink-0" />

      {/* Plain-English description — Nielsen #2: Match real world */}
      <p className="text-xs text-slate-400 leading-relaxed flex-1">
        {STATE_PLAIN_ENGLISH[state]}
      </p>

      {/* Live readings */}
      <div className="flex items-center gap-4 shrink-0 text-right">
        {depth != null && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Bit Depth</p>
            <p className="font-mono text-sm font-bold text-slate-200">{depth.toFixed(0)} m</p>
          </div>
        )}
        {css != null && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">CSS Now</p>
            <p
              className="font-mono text-sm font-bold"
              style={{
                color:
                  css >= 0.75
                    ? "#ef4444"
                    : css >= 0.50
                    ? "#f97316"
                    : css >= 0.25
                    ? "#eab308"
                    : "#22c55e",
              }}
            >
              {css.toFixed(3)}
            </p>
          </div>
        )}
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">Events</p>
          <p className="font-mono text-sm font-bold text-slate-200">
            {totalEvents}
            {severeEvents > 0 && (
              <span className="text-red-400 ml-1 text-[10px]">({severeEvents} severe)</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
