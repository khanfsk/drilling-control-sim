"use client";

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TelemetryRow, DrillingEvent } from "@/lib/types";
import { downsample, fmt } from "@/lib/utils";
import { useMemo } from "react";

interface Props {
  data: TelemetryRow[];
  events: DrillingEvent[];
  /** Which panel to show: "rpm" | "torque" | "wob" | "css" | "mwd" */
  panel: "rpm" | "torque" | "wob" | "css" | "mwd";
  title: string;
}

const PANEL_MAX_POINTS = 800;

// Custom tooltip with drilling engineering context
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; unit?: string }>;
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-[#080808]/97 px-3 py-2 shadow-xl text-xs">
      <p className="text-[#4b5563] mb-1 font-mono">
        t = {label != null ? fmt(label / 3600, 1) : "—"} h elapsed
      </p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="font-mono font-bold" style={{ color: p.color }}>
            {fmt(p.value, 2)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Format X-axis as "Day N"
function xFormatter(s: number): string {
  return `D${Math.floor(s / 86400) + 1}`;
}

export default function TelemetryChart({ data, events, panel, title }: Props) {
  const chartData = useMemo(
    () => downsample(data, PANEL_MAX_POINTS),
    [data]
  );

  const eventLines = useMemo(
    () =>
      events.map((e) => ({
        x: e.start_elapsed_s,
        label: `E${e.event_id}`,
        severity: e.severity,
      })),
    [events]
  );

  return (
    <div className="rounded-lg border border-[#1a1a1a] bg-[#0b0b0b] p-4">
      <h3 className="text-xs uppercase tracking-widest text-[#4b5563] mb-3 font-medium">
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        {panel === "rpm" ? (
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#141414" />
            <XAxis
              dataKey="elapsed_s"
              tickFormatter={xFormatter}
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={{ stroke: "#1e3a5f" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              label={{ value: "RPM", angle: -90, position: "insideLeft", fill: "#374151", fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, color: "#4b5563" }} />
            {eventLines.map((e) => (
              <ReferenceLine
                key={e.x}
                x={e.x}
                stroke="#f97316"
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{ value: e.label, fill: "#f97316", fontSize: 8, position: "top" }}
              />
            ))}
            <Line
              dataKey="rpm"
              name="Surface RPM"
              stroke="#60a5fa"
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />
            <Line
              dataKey="rpm_setpoint"
              name="RPM Setpoint"
              stroke="#f97316"
              dot={false}
              strokeWidth={1}
              strokeDasharray="5 3"
              connectNulls
            />
          </ComposedChart>
        ) : panel === "torque" ? (
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#141414" />
            <XAxis
              dataKey="elapsed_s"
              tickFormatter={xFormatter}
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={{ stroke: "#1e3a5f" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              label={{ value: "kNm", angle: -90, position: "insideLeft", fill: "#374151", fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, color: "#4b5563" }} />
            {eventLines.map((e) => (
              <ReferenceLine
                key={e.x}
                x={e.x}
                stroke="#f97316"
                strokeDasharray="4 3"
                strokeWidth={1}
              />
            ))}
            <Line
              dataKey="torque_kNm"
              name="Surface Torque"
              stroke="#a78bfa"
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />
            <Line
              dataKey="torque_baseline"
              name="Torque Baseline"
              stroke="#a78bfa"
              dot={false}
              strokeWidth={0.8}
              strokeDasharray="5 3"
              connectNulls
              opacity={0.4}
            />
          </ComposedChart>
        ) : panel === "wob" ? (
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#141414" />
            <XAxis
              dataKey="elapsed_s"
              tickFormatter={xFormatter}
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={{ stroke: "#1e3a5f" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              label={{ value: "kkgf", angle: -90, position: "insideLeft", fill: "#374151", fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, color: "#4b5563" }} />
            {eventLines.map((e) => (
              <ReferenceLine
                key={e.x}
                x={e.x}
                stroke="#f97316"
                strokeDasharray="4 3"
                strokeWidth={1}
              />
            ))}
            <Line
              dataKey="wob_kkgf"
              name="WOB (actual)"
              stroke="#34d399"
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />
            <Line
              dataKey="wob_setpoint"
              name="WOB Setpoint"
              stroke="#f97316"
              dot={false}
              strokeWidth={1}
              strokeDasharray="5 3"
              connectNulls
            />
          </ComposedChart>
        ) : panel === "css" ? (
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#141414" />
            <XAxis
              dataKey="elapsed_s"
              tickFormatter={xFormatter}
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={{ stroke: "#1e3a5f" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 1]}
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              label={{ value: "CSS", angle: -90, position: "insideLeft", fill: "#374151", fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, color: "#4b5563" }} />
            <ReferenceLine
              y={0.75}
              stroke="#ef4444"
              strokeDasharray="3 3"
              label={{ value: "SEVERE", fill: "#ef4444", fontSize: 8, position: "right" }}
            />
            <ReferenceLine
              y={0.50}
              stroke="#f97316"
              strokeDasharray="3 3"
              label={{ value: "MOD", fill: "#f97316", fontSize: 8, position: "right" }}
            />
            <ReferenceLine
              y={0.25}
              stroke="#eab308"
              strokeDasharray="3 3"
              label={{ value: "MILD", fill: "#eab308", fontSize: 8, position: "right" }}
            />
            <Area
              dataKey="css"
              name="CSS"
              stroke="#f97316"
              fill="#f97316"
              fillOpacity={0.15}
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />
          </ComposedChart>
        ) : (
          /* MWD panel */
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#141414" />
            <XAxis
              dataKey="elapsed_s"
              tickFormatter={xFormatter}
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={{ stroke: "#1e3a5f" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#374151", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              label={{ value: "rpm PKtoPK", angle: -90, position: "insideLeft", fill: "#374151", fontSize: 9 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, color: "#4b5563" }} />
            {eventLines.map((e) => (
              <ReferenceLine
                key={e.x}
                x={e.x}
                stroke="#ef4444"
                strokeDasharray="4 3"
                strokeWidth={1}
              />
            ))}
            <ReferenceLine
              y={100}
              stroke="#ef4444"
              strokeDasharray="3 3"
              label={{ value: "SEVERE", fill: "#ef4444", fontSize: 8, position: "right" }}
            />
            <ReferenceLine
              y={50}
              stroke="#f97316"
              strokeDasharray="3 3"
              label={{ value: "MOD", fill: "#f97316", fontSize: 8, position: "right" }}
            />
            <Area
              dataKey="mwd_ss_pktopk"
              name="MWD PKtoPK (rpm)"
              stroke="#ef4444"
              fill="#ef4444"
              fillOpacity={0.12}
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
