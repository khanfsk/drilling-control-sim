"use client";

/**
 * EventsTable — CRAP: Alignment + Proximity.
 * Columns are aligned to a grid. Related columns are adjacent.
 * Row color reinforces severity category (CRAP Contrast).
 *
 * Nielsen #6: Recognition over recall — column headers include units.
 * Nielsen #8: Minimalist — only show columns that carry information.
 */

import type { DrillingEvent } from "@/lib/types";
import { SEVERITY_BG, SEVERITY_COLORS, fmt, formatDuration } from "@/lib/utils";
import Tooltip from "./Tooltip";

interface Props {
  events: DrillingEvent[];
}

const COLUMN_TOOLTIPS: Record<string, { term: string; definition: string }> = {
  Severity: {
    term: "Severity Classification",
    definition:
      "Based on CSS value at event peak. MILD ≥ 0.25 · MODERATE ≥ 0.50 · SEVERE ≥ 0.75.",
  },
  "Peak CSS": {
    term: "Composite Severity Score (CSS)",
    definition:
      "0–1 dimensionless index fusing MWD oscillation (60%), torque deviation (30%), and RPM variation (10%).",
  },
  "MWD PKtoPK (rpm)": {
    term: "MWD Peak-to-Peak RPM",
    definition:
      "Downhole oscillation amplitude recorded by the MWD sensor. The bit alternates between near-zero and this value within each stick-slip cycle.",
  },
  "WOB Δ (kkgf)": {
    term: "Controller WOB Reduction",
    definition:
      "How much the auto-driller reduced Weight on Bit from nominal during this event. Negative = reduced (desired response).",
  },
};

export default function EventsTable({ events }: Props) {
  if (events.length === 0) {
    return (
      <div
        className="rounded border border-slate-800 bg-slate-800/20 px-4 py-6 text-center"
        role="status"
      >
        <p className="text-slate-500 text-sm">No stick-slip events detected in this session.</p>
      </div>
    );
  }

  const columns = [
    { key: "event_id", label: "#" },
    { key: "Severity", label: "Severity", hasTooltip: true },
    { key: "depth_m", label: "Depth (m MD)" },
    { key: "duration_s", label: "Duration" },
    { key: "Peak CSS", label: "Peak CSS", hasTooltip: true },
    { key: "mean_wob_kkgf", label: "Avg WOB (kkgf)" },
    { key: "mean_rpm", label: "Avg RPM" },
    { key: "MWD PKtoPK (rpm)", label: "MWD PKtoPK (rpm)", hasTooltip: true },
    { key: "WOB Δ (kkgf)", label: "WOB Δ (kkgf)", hasTooltip: true },
  ];

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm" aria-label="Stick-slip events">
        <thead>
          <tr className="border-b border-slate-800">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="text-left pb-2 pr-6 text-[10px] uppercase tracking-widest text-slate-500 font-medium whitespace-nowrap"
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {col.hasTooltip && COLUMN_TOOLTIPS[col.key] && (
                    <Tooltip
                      term={COLUMN_TOOLTIPS[col.key].term}
                      definition={COLUMN_TOOLTIPS[col.key].definition}
                    />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const severityColor = SEVERITY_COLORS[e.severity];
            return (
              <tr
                key={e.event_id}
                className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors"
              >
                {/* # */}
                <td className="py-2.5 pr-6 font-mono text-xs text-slate-500">
                  {e.event_id}
                </td>

                {/* Severity badge — CRAP Contrast: color carries meaning */}
                <td className="py-2.5 pr-6">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${SEVERITY_BG[e.severity]}`}
                    style={{ borderColor: `${severityColor}40` }}
                  >
                    {e.severity}
                  </span>
                </td>

                {/* Depth */}
                <td className="py-2.5 pr-6 font-mono text-xs text-slate-300">
                  {fmt(e.depth_m, 0)}
                </td>

                {/* Duration */}
                <td className="py-2.5 pr-6 font-mono text-xs text-slate-300">
                  {formatDuration(e.duration_s)}
                </td>

                {/* Peak CSS — colored by severity */}
                <td className="py-2.5 pr-6 font-mono text-xs font-bold" style={{ color: severityColor }}>
                  {fmt(e.peak_css, 3)}
                </td>

                {/* WOB */}
                <td className="py-2.5 pr-6 font-mono text-xs text-slate-300">
                  {fmt(e.mean_wob_kkgf, 2)}
                </td>

                {/* RPM */}
                <td className="py-2.5 pr-6 font-mono text-xs text-slate-300">
                  {fmt(e.mean_rpm, 0)}
                </td>

                {/* MWD PKtoPK */}
                <td className="py-2.5 pr-6 font-mono text-xs">
                  {e.peak_mwd_pktopk != null ? (
                    <span
                      style={{
                        color:
                          e.peak_mwd_pktopk >= 100
                            ? "#ef4444"
                            : e.peak_mwd_pktopk >= 50
                            ? "#f97316"
                            : "#eab308",
                      }}
                    >
                      {fmt(e.peak_mwd_pktopk, 0)}
                    </span>
                  ) : (
                    <span className="text-slate-600">No MWD</span>
                  )}
                </td>

                {/* WOB reduction */}
                <td className="py-2.5 pr-6 font-mono text-xs">
                  {e.wob_reduction_kkgf != null ? (
                    <span className={e.wob_reduction_kkgf > 0 ? "text-green-400" : "text-slate-500"}>
                      {e.wob_reduction_kkgf > 0
                        ? `−${fmt(e.wob_reduction_kkgf, 2)}`
                        : "No change"}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Table legend — Nielsen #6: recognition over recall */}
      <div className="mt-3 flex flex-wrap gap-3 pt-3 border-t border-slate-800">
        {(["MILD", "MODERATE", "SEVERE"] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: SEVERITY_COLORS[s] }}
            />
            <span className="text-[10px] text-slate-500">
              {s === "MILD" && "MILD — CSS 0.25–0.50 · monitoring"}
              {s === "MODERATE" && "MODERATE — CSS 0.50–0.75 · reduce WOB 10–20%"}
              {s === "SEVERE" && "SEVERE — CSS > 0.75 · reduce WOB 25–35%, raise RPM"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
