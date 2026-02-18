"use client";

/**
 * MetricsBar — CRAP: Repetition + Proximity.
 * Each card has identical anatomy: label → value → context note → help tooltip.
 * Related information is grouped together. Units always accompany values.
 *
 * Nielsen #6: Recognition over recall — every abbreviation has an inline tooltip.
 * Nielsen #8: Aesthetic and minimalist design — no decoration without meaning.
 */

import type { Metadata } from "@/lib/types";
import { fmt } from "@/lib/utils";
import { Activity, AlertTriangle, BarChart3, Layers, Zap } from "lucide-react";
import Tooltip from "./Tooltip";

interface Props {
  metadata: Metadata;
}

interface Card {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  color: string;
  border: string;
  tooltip?: { term: string; definition: string };
}

export default function MetricsBar({ metadata }: Props) {
  const cards: Card[] = [
    {
      icon: Layers,
      label: "Drill Section",
      value: metadata.section,
      sub: `${metadata.depth_range_m[0].toFixed(0)} – ${metadata.depth_range_m[1].toFixed(0)} m Measured Depth`,
      color: "text-blue-400",
      border: "border-blue-500/20",
      tooltip: {
        term: "Measured Depth (MD)",
        definition:
          "Total distance drilled along the borehole path, measured from the rotary table. Different from True Vertical Depth (TVD) in deviated wells.",
      },
    },
    {
      icon: AlertTriangle,
      label: "Peak Downhole Oscillation",
      value: `${metadata.mwd_max_pktopk_rpm} rpm`,
      sub: "Measured at MWD tool — bit-rock interface",
      color: "text-red-400",
      border: "border-red-500/20",
      tooltip: {
        term: "MWD PKtoPK RPM",
        definition:
          "Measurement While Drilling — peak-to-peak RPM oscillation recorded by a sensor in the Bottom Hole Assembly, 30–50 m above the bit. The bit itself oscillates between near-zero (stick) and this peak value (slip).",
      },
    },
    {
      icon: Activity,
      label: "Events Detected",
      value: `${metadata.n_events} events`,
      sub: `${metadata.severe_events} severe · ${metadata.moderate_events} moderate`,
      color: "text-orange-400",
      border: "border-orange-500/20",
      tooltip: {
        term: "Stick-Slip Event",
        definition:
          "A sustained period where the bit alternates between being momentarily stuck (torque builds, RPM drops to zero) and suddenly releasing (bit accelerates to 2–3× surface RPM). Damages the bit, drill string connections, and MWD tools.",
      },
    },
    {
      icon: BarChart3,
      label: "Detection Accuracy",
      value: `r = ${fmt(metadata.validation?.pearson_r, 3)}`,
      sub: `vs. MWD ground truth · n = ${metadata.validation?.n_samples?.toLocaleString()}`,
      color: "text-green-400",
      border: "border-green-500/20",
      tooltip: {
        term: "Pearson Correlation (r)",
        definition:
          "How closely the Composite Severity Score (computed from surface instruments) tracks the actual downhole MWD stick-slip measurement. r = 1.0 is a perfect match. r = 0.758 means strong agreement, especially given that the drill string attenuates the signal by ~380×.",
      },
    },
    {
      icon: Zap,
      label: "Torsional Period",
      value: `${fmt(metadata.torsional_frequency?.period_s, 1)} s`,
      sub: `${fmt(metadata.torsional_frequency?.dominant_freq_hz, 4)} Hz · FFT of torque signal`,
      color: "text-purple-400",
      border: "border-purple-500/20",
      tooltip: {
        term: "Torsional Natural Frequency",
        definition:
          "The frequency at which the drill string naturally wants to oscillate torsionally — determined by its length, stiffness, and inertia. Stick-slip occurs when the bit-rock interaction excites this frequency. Computed via FFT of surface torque during the worst event.",
      },
    },
  ];

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
      role="region"
      aria-label="Key drilling metrics"
    >
      {cards.map(({ icon: Icon, label, value, sub, color, border, tooltip }) => (
        <div
          key={label}
          className={`rounded-xl border ${border} bg-[#0b0b0b] px-4 py-3`}
        >
          {/* Label row — CRAP Proximity: label and help icon are together */}
          <div className="flex items-center gap-1.5 mb-2">
            <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} aria-hidden />
            <p className="text-[10px] uppercase tracking-widest text-[#4b5563] font-medium leading-none">
              {label}
            </p>
            {tooltip && (
              <Tooltip term={tooltip.term} definition={tooltip.definition} />
            )}
          </div>

          {/* Value — largest text, highest contrast */}
          <p className={`text-lg font-bold font-mono ${color} leading-none mb-1`}>
            {value}
          </p>

          {/* Context note — smaller, lower contrast, supports value */}
          <p className="text-[10px] text-[#4b5563] leading-snug">{sub}</p>
        </div>
      ))}
    </div>
  );
}
