"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
} from "react";
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
import type { ProcessedRow } from "@/lib/clientDetection";
import type { ControllerOutput } from "@/lib/clientController";
import { fmt } from "@/lib/utils";

export type Channel = "mwd" | "css" | "rpm" | "torque" | "wob";

interface Props {
  data: ProcessedRow[];
  controlOutputs: ControllerOutput[];
  channel: Channel;
}

// Imperative handle: parent updates cursor without triggering React re-render
export interface LiveChartHandle {
  setCursorFraction: (fraction: number) => void;
}

const MAX_POINTS = 500;

// These must match the chart margins so the overlay cursor aligns with the data area
const CHART_MARGIN = { top: 8, right: 16, left: 0, bottom: 4 } as const;
const Y_AXIS_WIDTH = 44; // px

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function dayLabel(s: number): string {
  return `D${Math.floor(s / 86400) + 1}`;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number | null; color: string }>;
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  const hours = Math.round((label ?? 0) / 3600);
  const day = Math.floor((label ?? 0) / 86400) + 1;
  return (
    <div className="rounded border border-[#2a2a2a] bg-[#090909]/97 px-3 py-2 text-[11px] shadow-2xl backdrop-blur">
      <p className="text-[#4b5563] mb-1 font-mono">
        Day {day}, {hours % 24}h elapsed
      </p>
      {payload.map((p) =>
        p.value != null ? (
          <div key={p.name} className="flex items-center gap-2 py-0.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: p.color }}
            />
            <span className="text-[#6b7280]">{p.name}:</span>
            <span className="font-mono font-bold" style={{ color: p.color }}>
              {fmt(p.value, 2)}
            </span>
          </div>
        ) : null
      )}
    </div>
  );
}

// Shared axis / grid props
const xAxisProps = {
  dataKey: "elapsed_s" as const,
  type: "number" as const,
  domain: ["dataMin", "dataMax"] as [string, string],
  tickFormatter: dayLabel,
  tick: { fill: "#374151", fontSize: 10 },
  axisLine: { stroke: "#1a1a1a" },
  tickLine: false as const,
  minTickGap: 40,
};

const yAxisProps = {
  tick: { fill: "#374151", fontSize: 10 },
  axisLine: false as const,
  tickLine: false as const,
  width: Y_AXIS_WIDTH,
};

const gridProps = {
  strokeDasharray: "3 3" as const,
  stroke: "#111111" as const,
  vertical: false as const,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const LiveChart = forwardRef<LiveChartHandle, Props>(function LiveChart(
  { data, controlOutputs, channel },
  ref
) {
  const cursorLineRef = useRef<HTMLDivElement>(null);
  const cursorLabelRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const totalSRef = useRef(0);

  // Cursor moves via direct DOM — calling setCursorFraction() never triggers a re-render
  useImperativeHandle(
    ref,
    () => ({
      setCursorFraction(fraction: number) {
        if (!cursorLineRef.current || !containerRef.current) return;
        const w = containerRef.current.offsetWidth;
        const chartW = w - Y_AXIS_WIDTH - CHART_MARGIN.right;
        const x = Y_AXIS_WIDTH + Math.max(0, Math.min(1, fraction)) * chartW;
        cursorLineRef.current.style.left = `${x}px`;
        if (cursorLabelRef.current) {
          const s = fraction * totalSRef.current;
          cursorLabelRef.current.textContent = `▶ ${dayLabel(s)}`;
        }
      },
    }),
    []
  );

  const step = useMemo(
    () => Math.max(1, Math.ceil(data.length / MAX_POINTS)),
    [data.length]
  );

  const chartData = useMemo(() => {
    const rows = data
      .filter((_, i) => i % step === 0)
      .map((r, i) => {
        const ctrlIdx = Math.min(i * step, controlOutputs.length - 1);
        const ctrl = controlOutputs[ctrlIdx];
        return {
          elapsed_s: r.elapsed_s,
          mwd: r.mwd_ss_pktopk,
          css: r.computed_css,
          rpm: r.rpm,
          rpm_sp: ctrl?.rpm_setpoint ?? null,
          torque: r.torque_kNm,
          wob: r.wob_kkgf,
          wob_sp: ctrl?.wob_setpoint ?? null,
        };
      });
    totalSRef.current = rows[rows.length - 1]?.elapsed_s ?? 0;
    return rows;
  }, [data, controlOutputs, step]);

  // Event shading bands
  const eventBands = useMemo(() => {
    const bands: { x1: number; x2: number }[] = [];
    let start: number | null = null;
    for (let i = 0; i < data.length; i += step) {
      const r = data[i];
      if (r.computed_flag && start === null) start = r.elapsed_s;
      if (!r.computed_flag && start !== null) {
        bands.push({ x1: start, x2: r.elapsed_s });
        start = null;
      }
    }
    if (start !== null)
      bands.push({ x1: start, x2: data[data.length - 1]?.elapsed_s ?? 0 });
    return bands;
  }, [data, step]);

  const refLines = (
    <>
      {eventBands.map((b) => (
        <ReferenceLine
          key={`es-${b.x1}`}
          x={b.x1}
          stroke="#f9731612"
          strokeWidth={Math.max(
            2,
            ((b.x2 - b.x1) /
              (chartData[chartData.length - 1]?.elapsed_s ?? 1)) *
              2000
          )}
          zIndex={30}
        />
      ))}
    </>
  );

  return (
    <div ref={containerRef} className="relative select-none">
      {/* Cursor line — positioned via DOM ref by the parent's rAF loop */}
      <div
        ref={cursorLineRef}
        className="absolute pointer-events-none z-20"
        style={{
          top: `${CHART_MARGIN.top}px`,
          bottom: "28px",
          left: `${Y_AXIS_WIDTH}px`,
          width: "1px",
          background:
            "linear-gradient(to bottom, #60a5fa, #60a5fa88)",
        }}
      >
        <span
          ref={cursorLabelRef}
          className="absolute -top-5 left-1 text-[9px] text-blue-400 font-mono whitespace-nowrap select-none"
        />
      </div>

      <ResponsiveContainer width="100%" height={220}>
        {channel === "mwd" ? (
          <ComposedChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis
              {...yAxisProps}
              label={{
                value: "rpm PKtoPK",
                angle: -90,
                position: "insideLeft",
                fill: "#374151",
                fontSize: 9,
              }}
            />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine
              y={100}
              stroke="#ef444420"
              strokeDasharray="4 3"
              zIndex={30}
              label={{
                value: "Severe",
                position: "right",
                fill: "#ef4444",
                fontSize: 8,
              }}
            />
            <ReferenceLine
              y={50}
              stroke="#f9731620"
              strokeDasharray="4 3"
              zIndex={30}
              label={{
                value: "Mod",
                position: "right",
                fill: "#f97316",
                fontSize: 8,
              }}
            />
            {refLines}
            <Area
              dataKey="mwd"
              name="MWD PKtoPK (rpm)"
              stroke="#ef4444"
              fill="#ef444418"
              dot={false}
              strokeWidth={2}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        ) : channel === "css" ? (
          <ComposedChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis
              {...yAxisProps}
              domain={[0, 1]}
              label={{
                value: "CSS",
                angle: -90,
                position: "insideLeft",
                fill: "#374151",
                fontSize: 9,
              }}
            />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine
              y={0.75}
              stroke="#ef444425"
              strokeDasharray="4 3"
              zIndex={30}
              label={{
                value: "Severe",
                position: "right",
                fill: "#ef4444",
                fontSize: 8,
              }}
            />
            <ReferenceLine
              y={0.5}
              stroke="#f9731625"
              strokeDasharray="4 3"
              zIndex={30}
              label={{
                value: "Mod",
                position: "right",
                fill: "#f97316",
                fontSize: 8,
              }}
            />
            <ReferenceLine
              y={0.25}
              stroke="#eab30825"
              strokeDasharray="4 3"
              zIndex={30}
              label={{
                value: "Mild",
                position: "right",
                fill: "#eab308",
                fontSize: 8,
              }}
            />
            {refLines}
            <Area
              dataKey="css"
              name="Composite Severity Score"
              stroke="#f97316"
              fill="#f9731615"
              dot={false}
              strokeWidth={2}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        ) : channel === "rpm" ? (
          <ComposedChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis
              {...yAxisProps}
              label={{
                value: "RPM",
                angle: -90,
                position: "insideLeft",
                fill: "#374151",
                fontSize: 9,
              }}
            />
            <Tooltip content={<ChartTooltip />} />
            {refLines}
            <Line
              dataKey="rpm"
              name="Surface RPM"
              stroke="#60a5fa"
              dot={false}
              strokeWidth={1.5}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              dataKey="rpm_sp"
              name="RPM Setpoint"
              stroke="#f97316"
              dot={false}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        ) : channel === "torque" ? (
          <ComposedChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis
              {...yAxisProps}
              label={{
                value: "kNm",
                angle: -90,
                position: "insideLeft",
                fill: "#374151",
                fontSize: 9,
              }}
            />
            <Tooltip content={<ChartTooltip />} />
            {refLines}
            {/* connectNulls bridges the sparse WITSML torque data (~33% coverage) */}
            <Line
              dataKey="torque"
              name="Surface Torque (kNm)"
              stroke="#a78bfa"
              dot={false}
              strokeWidth={1.5}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        ) : (
          <ComposedChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis
              {...yAxisProps}
              label={{
                value: "kkgf",
                angle: -90,
                position: "insideLeft",
                fill: "#374151",
                fontSize: 9,
              }}
            />
            <Tooltip content={<ChartTooltip />} />
            {refLines}
            <Line
              dataKey="wob"
              name="WOB Actual (kkgf)"
              stroke="#34d399"
              dot={false}
              strokeWidth={1.5}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              dataKey="wob_sp"
              name="WOB Setpoint"
              stroke="#f97316"
              dot={false}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </div>
  );
});

export default LiveChart;
