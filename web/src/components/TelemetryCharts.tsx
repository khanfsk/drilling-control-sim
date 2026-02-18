"use client";

/**
 * TelemetryCharts — Nielsen #3: User control and freedom.
 * Users can switch between channels freely. Each panel has:
 *  - A plain-English title and description (Nielsen #2: match real world)
 *  - An inline "What am I looking at?" callout (Nielsen #10: help and docs)
 *  - Units on every axis (CRAP Contrast: critical info stands out)
 *
 * Nielsen #6: Recognition over recall — channel names are spelled out,
 * not abbreviated. Severity thresholds are labelled on-chart.
 */

import { useState } from "react";
import TelemetryChart from "./TelemetryChart";
import type { TelemetryRow, DrillingEvent } from "@/lib/types";

interface Props {
  telemetry: TelemetryRow[];
  events: DrillingEvent[];
}

type Panel = "mwd" | "css" | "rpm" | "torque" | "wob";

interface PanelConfig {
  id: Panel;
  label: string;
  color: string;
  title: string;
  unit: string;
  description: string;
  callout: string;
}

const PANELS: PanelConfig[] = [
  {
    id: "mwd",
    label: "Downhole Stick-Slip",
    color: "text-red-400",
    title: "MWD Downhole Oscillation — Peak-to-Peak RPM",
    unit: "rpm (PKtoPK)",
    description:
      "Direct measurement from the MWD sensor in the Bottom Hole Assembly. Shows how violently the bit is oscillating between a full stall and peak spin speed.",
    callout:
      "This is the ground truth. The MWD sensor is 30–50 m above the bit and records peak-to-peak RPM variation in real time. A value of 381 rpm PKtoPK means the bit was momentarily spinning at 381 rpm then dropping to near-zero within the same rotation cycle — catastrophic for the bit and drill string.",
  },
  {
    id: "css",
    label: "Severity Score",
    color: "text-orange-400",
    title: "Composite Severity Score (CSS) — Detection Signal",
    unit: "0 to 1 (dimensionless)",
    description:
      "The CSS fuses MWD downhole data (60%), surface torque deviation (30%), and surface RPM oscillation (10%) into a single 0–1 severity index that drives the auto-driller controller.",
    callout:
      "MILD ≥ 0.25 (monitor) → MODERATE ≥ 0.50 (reduce WOB 10–20%) → SEVERE ≥ 0.75 (reduce WOB 25–35%, raise RPM). The controller enters DETECTING state when CSS crosses 0.25 and starts actively mitigating after 25 seconds of sustained elevation to avoid responding to transient spikes.",
  },
  {
    id: "rpm",
    label: "Rotary Speed",
    color: "text-blue-400",
    title: "Surface Rotary Speed vs Controller Setpoint",
    unit: "RPM",
    description:
      "The top drive maintains surface RPM almost perfectly constant (±1 rpm) via a speed controller. The orange dashed line is the auto-driller's RPM setpoint.",
    callout:
      "Notice that surface RPM barely changes even during severe downhole oscillations. The drill string acts as a torsional spring: it absorbs the oscillations before they reach surface. This is why surface RPM alone is an unreliable stick-slip detector — and why MWD data is essential for reliable detection.",
  },
  {
    id: "torque",
    label: "Surface Torque",
    color: "text-purple-400",
    title: "Surface Torque vs Rolling Baseline",
    unit: "kNm (kilonewton-metres)",
    description:
      "Torque at the top drive. The dashed purple line is the rolling median baseline; deviations from it are the torque contribution to the CSS detection signal.",
    callout:
      "Torque is the most useful surface-available indicator of stick-slip. During the stick phase, torque builds as the string winds up. During the slip phase, it releases suddenly. However, at this well the signal is mild (±2 kNm deviation) because the formation is relatively soft (12.25-in section, shallow).",
  },
  {
    id: "wob",
    label: "Weight on Bit",
    color: "text-green-400",
    title: "Weight on Bit — Actual vs Controller Setpoint",
    unit: "kkgf (thousand kilograms-force)",
    description:
      "The primary drilling parameter. WOB is controlled by adjusting the hookload on the drill string. The controller reduces WOB when stick-slip is detected.",
    callout:
      "Reducing WOB reduces the reactive torque at the bit-formation interface. Less torque = less energy stored in the torsional spring = smaller oscillation amplitude. The controller targets a WOB reduction proportional to CSS severity, subject to a floor of 35% of nominal to avoid losing too much ROP.",
  },
];

export default function TelemetryCharts({ telemetry, events }: Props) {
  const [activeId, setActiveId] = useState<Panel>("mwd");
  const active = PANELS.find((p) => p.id === activeId)!;

  return (
    <section
      className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b]"
      aria-label="Drilling telemetry charts"
    >
      {/* Panel header — CRAP Alignment: tabs flush with content below */}
      <div className="border-b border-[#141414] px-4 pt-4 pb-0">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <h2 className="text-sm font-semibold text-[#c9d1d9]">
              {active.title}
            </h2>
            <p className="text-[11px] text-[#4b5563] mt-0.5">
              {active.description}{" "}
              <span className="text-[#374151]">Unit: {active.unit}</span>
            </p>
          </div>
          <p className="text-[10px] text-[#374151] font-mono">
            {(telemetry.length / 1000).toFixed(1)}k data points ·{" "}
            {events.length} events marked
          </p>
        </div>

        {/* Tab row — CRAP Repetition: same tab anatomy for every channel */}
        <div
          className="flex gap-0.5 -mb-px overflow-x-auto"
          role="tablist"
          aria-label="Data channels"
        >
          {PANELS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={p.id === activeId}
              onClick={() => setActiveId(p.id)}
              className={`
                px-3 py-2 text-[11px] font-medium whitespace-nowrap border-b-2 transition-all
                ${p.id === activeId
                  ? `${p.color} border-current bg-[#111]`
                  : "text-[#374151] border-transparent hover:text-[#6b7280]"
                }
              `}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="p-4">
        <TelemetryChart
          data={telemetry}
          events={events}
          panel={activeId}
          title={active.title}
        />
      </div>

      {/* Callout — Nielsen #10: Help and documentation (inline, not hidden in a modal) */}
      <div className="border-t border-[#111] px-4 py-3 flex gap-2 items-start">
        <span className="text-[10px] font-bold text-[#374151] uppercase tracking-widest shrink-0 mt-0.5">
          Context
        </span>
        <p className="text-[11px] text-[#4b5563] leading-relaxed">{active.callout}</p>
      </div>
    </section>
  );
}
