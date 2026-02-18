"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TelemetryRow, DrillingEvent } from "@/lib/types";
import { downsample, fmt } from "@/lib/utils";

interface Props {
  data: TelemetryRow[];
  events: DrillingEvent[];
}

const CHANNELS = [
  { key: "css",    label: "CSS (severity)",  color: "#f97316", unit: "(0–1)" },
  { key: "mwd",    label: "MWD PKtoPK",      color: "#ef4444", unit: "rpm" },
  { key: "wob",    label: "WOB",             color: "#34d399", unit: "kkgf" },
  { key: "torque", label: "Torque",           color: "#a78bfa", unit: "kNm" },
  { key: "rpm",    label: "Surface RPM",     color: "#60a5fa", unit: "rpm" },
] as const;

function norm(v: number | null, min: number, max: number): number | null {
  if (v == null) return null;
  return max > min ? (v - min) / (max - min) : 0;
}

function dayLabel(s: number): string {
  return `D${Math.floor(s / 86400) + 1}`;
}

function OverlayTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Array<{ payload: any }>;
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const day = Math.floor((label ?? 0) / 86400) + 1;
  const h = Math.floor(((label ?? 0) % 86400) / 3600);
  return (
    <div className="rounded border border-[#2a2a2a] bg-[#090909]/97 px-3 py-2 text-[11px] shadow-2xl backdrop-blur">
      <p className="text-[#4b5563] mb-1.5 font-mono">
        Day {day}, {h}h elapsed
      </p>
      {CHANNELS.map((ch) => {
        const raw = row[`${ch.key}_raw`] as number | null;
        if (raw == null) return null;
        return (
          <div key={ch.key} className="flex items-center gap-2 py-0.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ch.color }} />
            <span className="text-[#6b7280]">{ch.label}:</span>
            <span className="font-mono font-bold" style={{ color: ch.color }}>
              {fmt(raw, ch.key === "css" ? 3 : 1)} {ch.unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function OverlayChart({ data, events }: Props) {
  const chartData = useMemo(() => {
    const ds = downsample(data, 800);

    // Per-channel min/max for normalization
    const vals = (fn: (r: TelemetryRow) => number | null) =>
      ds.map(fn).filter((v): v is number => v != null);

    const mwdV = vals((r) => r.mwd_ss_pktopk);
    const rpmV = vals((r) => r.rpm);
    const torV = vals((r) => r.torque_kNm);
    const wobV = vals((r) => r.wob_kkgf);

    const [mwdMin, mwdMax] = [Math.min(...mwdV), Math.max(...mwdV)];
    const [rpmMin, rpmMax] = [Math.min(...rpmV), Math.max(...rpmV)];
    const [torMin, torMax] = [Math.min(...torV), Math.max(...torV)];
    const [wobMin, wobMax] = [Math.min(...wobV), Math.max(...wobV)];

    return ds.map((r) => ({
      elapsed_s: r.elapsed_s,
      css:    r.css,                                       // already 0–1
      mwd:    norm(r.mwd_ss_pktopk, mwdMin, mwdMax),
      rpm:    norm(r.rpm,           rpmMin, rpmMax),
      torque: norm(r.torque_kNm,   torMin, torMax),
      wob:    norm(r.wob_kkgf,     wobMin, wobMax),
      // raw values surfaced only in the tooltip
      css_raw:    r.css,
      mwd_raw:    r.mwd_ss_pktopk,
      rpm_raw:    r.rpm,
      torque_raw: r.torque_kNm,
      wob_raw:    r.wob_kkgf,
    }));
  }, [data]);

  const eventLines = useMemo(
    () => events.map((e) => ({ x: e.start_elapsed_s, id: e.event_id })),
    [events]
  );

  return (
    <section className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b]">
      {/* Header */}
      <div className="border-b border-[#141414] px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-[#c9d1d9]">
              All Channels — Normalized Overlay
            </h2>
            <p className="text-[11px] text-[#4b5563] mt-0.5">
              Each signal is independently scaled to 0–1 by its own min/max, revealing
              co-movement and timing relationships across channels.
            </p>
          </div>
          {/* Inline legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
            {CHANNELS.map((ch) => (
              <div key={ch.key} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-4 h-[2px] rounded-full"
                  style={{ background: ch.color }}
                />
                <span className="text-[10px] text-[#4b5563]">{ch.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-4 pt-4 pb-2">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={chartData}
            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#111111" vertical={false} />
            <XAxis
              dataKey="elapsed_s"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={dayLabel}
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={{ stroke: "#1a1a1a" }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[0, 1]}
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={44}
              label={{
                value: "Normalized",
                angle: -90,
                position: "insideLeft",
                fill: "#374151",
                fontSize: 9,
              }}
            />
            <Tooltip content={<OverlayTooltip />} />

            {/* CSS severity thresholds (apply directly since CSS isn't rescaled) */}
            <ReferenceLine y={0.75} stroke="#ef444420" strokeDasharray="4 3" />
            <ReferenceLine y={0.50} stroke="#f9731620" strokeDasharray="4 3" />
            <ReferenceLine y={0.25} stroke="#eab30820" strokeDasharray="4 3" />

            {/* Stick-slip event onset markers */}
            {eventLines.map((e) => (
              <ReferenceLine
                key={e.id}
                x={e.x}
                stroke="#f9731614"
                strokeWidth={12}
              />
            ))}

            {/* CSS as filled area — primary detection signal */}
            <Area
              dataKey="css"
              stroke="#f97316"
              fill="#f9731615"
              dot={false}
              strokeWidth={2}
              connectNulls
              isAnimationActive={false}
            />
            {/* MWD — ground truth downhole oscillation */}
            <Line
              dataKey="mwd"
              stroke="#ef4444"
              dot={false}
              strokeWidth={1.5}
              connectNulls={false}
              isAnimationActive={false}
            />
            {/* WOB */}
            <Line
              dataKey="wob"
              stroke="#34d399"
              dot={false}
              strokeWidth={1.5}
              connectNulls
              isAnimationActive={false}
            />
            {/* Torque */}
            <Line
              dataKey="torque"
              stroke="#a78bfa"
              dot={false}
              strokeWidth={1.5}
              connectNulls
              isAnimationActive={false}
            />
            {/* Surface RPM — least reactive, render at reduced opacity */}
            <Line
              dataKey="rpm"
              stroke="#60a5fa"
              dot={false}
              strokeWidth={1}
              connectNulls
              isAnimationActive={false}
              opacity={0.6}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Callout */}
      <div className="border-t border-[#111] px-4 py-3 flex gap-2 items-start">
        <span className="text-[10px] font-bold text-[#374151] uppercase tracking-widest shrink-0 mt-0.5">
          What to look for
        </span>
        <p className="text-[11px] text-[#4b5563] leading-relaxed">
          CSS (orange) and MWD (red) should spike together during events — confirming the detection
          algorithm tracks the ground truth. WOB (green) drops in response as the controller mitigates.
          Surface RPM (blue) barely moves, illustrating the drill string&apos;s torsional attenuation.
          Torque (purple) shows moderate correlation with MWD spikes, justifying its 30% weight in the CSS formula.
        </p>
      </div>
    </section>
  );
}
