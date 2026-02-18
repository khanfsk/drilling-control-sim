"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { TelemetryRow } from "@/lib/types";
import {
  recompute,
  DEFAULT_PARAMS,
  cssToSeverity,
  severityColor,
  type ProcessedRow,
} from "@/lib/clientDetection";
import {
  runController,
  DEFAULT_CONTROLLER,
  type ControllerOutput,
  type ControllerState,
} from "@/lib/clientController";
import SeverityGauge from "./SeverityGauge";
import StateMachineViz from "./StateMachineViz";
import LiveChart, { type LiveChartHandle } from "./LiveChart";
import { fmt, formatDuration } from "@/lib/utils";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Gauge,
  SlidersHorizontal,
  Activity,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Param slider
// ---------------------------------------------------------------------------
interface SliderProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

function ParamSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium text-[#c9d1d9]">{label}</span>
          <span className="text-[10px] text-[#4b5563] ml-2">{hint}</span>
        </div>
        <span className="text-xs font-mono font-bold text-blue-400">
          {format ? format(value) : value}
        </span>
      </div>
      <div className="relative h-1 rounded-full bg-[#1a1a1a]">
        <div
          className="absolute h-1 rounded-full bg-blue-500/80 transition-all duration-75"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-1"
          aria-label={label}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Speeds: data samples advanced per animation frame
// ---------------------------------------------------------------------------
const SPEEDS = [
  { label: "1×", samples: 1 },
  { label: "5×", samples: 5 },
  { label: "20×", samples: 20 },
  { label: "100×", samples: 100 },
];

type Channel = "mwd" | "css" | "rpm" | "torque" | "wob";
const CHANNELS: { id: Channel; label: string }[] = [
  { id: "mwd", label: "Downhole SS" },
  { id: "css", label: "Severity" },
  { id: "rpm", label: "RPM" },
  { id: "torque", label: "Torque" },
  { id: "wob", label: "WOB" },
];

const CHANNEL_NOTES: Record<Channel, string> = {
  mwd: "Ground-truth downhole oscillation from BHA sensor — only available 9.9% of the time.",
  css: "Composite Severity Score fusing MWD (60%) + torque (30%) + RPM (10%). Drives the controller.",
  rpm: "Surface RPM barely moves — the drill string absorbs oscillations (380× attenuation).",
  torque: "Sparse WITSML data (~33% coverage, bridged). Torque deviation drives 30% of the CSS signal.",
  wob: "Auto-driller reduces WOB proportional to CSS severity when MITIGATING.",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface Props {
  rawTelemetry: TelemetryRow[];
  nominalWob: number;
  nominalRpm: number;
}

export default function SimulationEngine({
  rawTelemetry,
  nominalWob,
  nominalRpm,
}: Props) {
  const [detParams, setDetParams] = useState(DEFAULT_PARAMS);
  const [ctrlParams, setCtrlParams] = useState(DEFAULT_CONTROLLER);

  const processed = useMemo(
    () => recompute(rawTelemetry, detParams),
    [rawTelemetry, detParams]
  );
  const ctrlOutputs = useMemo(
    () => runController(processed, ctrlParams, nominalWob, nominalRpm),
    [processed, ctrlParams, nominalWob, nominalRpm]
  );

  const eventCount = useMemo(
    () =>
      processed.length > 0
        ? processed[processed.length - 1].computed_event_id
        : 0,
    [processed]
  );

  // ── Playback state ──────────────────────────────────────────────────────
  // cursorIdxRef: updated at 60fps, drives DOM cursor + scrubber
  // cursorIdx (state): throttled to ~15fps, drives readings/gauge/state machine
  const cursorIdxRef = useRef(0);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const lastDisplayRef = useRef<number>(0);

  // DOM refs for zero-render-cost cursor updates
  const scrubFillRef = useRef<HTMLDivElement>(null);
  const scrubTimeRef = useRef<HTMLSpanElement>(null);
  const liveChartRef = useRef<LiveChartHandle>(null);

  // EMA for gauge — attack fast, release slowly (prevents confusing flicker)
  const smoothedCssRef = useRef(0);
  const [displayCss, setDisplayCss] = useState(0);

  const atEnd = cursorIdx >= processed.length - 1;

  // Sync ref when params change (data recomputed = length may change)
  useEffect(() => {
    cursorIdxRef.current = Math.min(
      cursorIdxRef.current,
      processed.length - 1
    );
    setCursorIdx(cursorIdxRef.current);
  }, [processed.length]);

  // ── Animation loop ──────────────────────────────────────────────────────
  const tick = useCallback(
    (ts: number) => {
      if (lastFrameRef.current === 0) lastFrameRef.current = ts;
      const frameDelta = ts - lastFrameRef.current;

      if (frameDelta >= 16) {
        lastFrameRef.current = ts;
        const newIdx = Math.min(
          cursorIdxRef.current + SPEEDS[speedIdx].samples,
          processed.length - 1
        );
        cursorIdxRef.current = newIdx;

        const frac =
          processed.length > 1 ? newIdx / (processed.length - 1) : 0;

        // ── Direct DOM updates — zero React re-renders ──
        if (scrubFillRef.current) {
          scrubFillRef.current.style.width = `${frac * 100}%`;
        }
        liveChartRef.current?.setCursorFraction(frac);

        // ── Throttled React update ~15fps ───────────────
        if (ts - lastDisplayRef.current >= 66) {
          lastDisplayRef.current = ts;

          // Attack-release EMA: rises at 40%, falls at 8% per update
          const raw = processed[newIdx]?.computed_css ?? 0;
          const alpha = raw > smoothedCssRef.current ? 0.4 : 0.08;
          smoothedCssRef.current =
            alpha * raw + (1 - alpha) * smoothedCssRef.current;

          setCursorIdx(newIdx);
          setDisplayCss(smoothedCssRef.current);

          if (scrubTimeRef.current) {
            const s = processed[newIdx]?.elapsed_s ?? 0;
            scrubTimeRef.current.textContent = formatDuration(s);
          }

          if (newIdx >= processed.length - 1) {
            setPlaying(false);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [speedIdx, processed]
  );

  useEffect(() => {
    if (playing) {
      lastFrameRef.current = 0;
      lastDisplayRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, tick]);

  // Helpers to move cursor from user interactions (restart / scrub)
  function moveCursor(newIdx: number) {
    cursorIdxRef.current = newIdx;
    const frac =
      processed.length > 1 ? newIdx / (processed.length - 1) : 0;
    if (scrubFillRef.current)
      scrubFillRef.current.style.width = `${frac * 100}%`;
    liveChartRef.current?.setCursorFraction(frac);
    // Update smoothed CSS too
    const raw = processed[newIdx]?.computed_css ?? 0;
    smoothedCssRef.current = raw;
    setDisplayCss(raw);
    setCursorIdx(newIdx);
  }

  // ── Derived values (from throttled cursorIdx) ───────────────────────────
  const row = processed[cursorIdx] ?? processed[0];
  const ctrl = ctrlOutputs[cursorIdx] ?? ctrlOutputs[0];
  const currentState = (ctrl?.state ?? "NORMAL") as ControllerState;
  const severity = cssToSeverity(displayCss);
  const color = severityColor(severity);

  const progress =
    processed.length > 1 ? cursorIdx / (processed.length - 1) : 0;
  const elapsedS = row?.elapsed_s ?? 0;
  const totalS = processed[processed.length - 1]?.elapsed_s ?? 0;

  const [channel, setChannel] = useState<Channel>("mwd");
  const [rightTab, setRightTab] = useState<"state" | "params">("state");

  return (
    <div className="space-y-3">

      {/* ── Playback bar ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b] px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">

          {/* Transport controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setPlaying(false); moveCursor(0); }}
              className="p-1.5 rounded-lg text-[#4b5563] hover:text-[#9ca3af] hover:bg-[#161616] transition-all"
              aria-label="Restart"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (atEnd) moveCursor(0);
                setPlaying((v) => !v);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full text-white transition-all"
              style={{
                background: playing
                  ? "linear-gradient(135deg, #f97316, #ef4444)"
                  : "linear-gradient(135deg, #3b82f6, #6366f1)",
                boxShadow: playing
                  ? "0 0 12px #f9731640"
                  : "0 0 12px #3b82f640",
              }}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={() => { setPlaying(false); moveCursor(processed.length - 1); }}
              className="p-1.5 rounded-lg text-[#4b5563] hover:text-[#9ca3af] hover:bg-[#161616] transition-all"
              aria-label="Jump to end"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Speed */}
          <div className="flex items-center gap-0.5 bg-[#111] rounded-lg p-0.5 border border-[#1a1a1a]">
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setSpeedIdx(i)}
                className={`text-[10px] font-mono px-2 py-0.5 rounded-md transition-all ${
                  i === speedIdx
                    ? "bg-blue-600 text-white"
                    : "text-[#4b5563] hover:text-[#9ca3af]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Scrubber */}
          <div className="flex-1 min-w-32 flex items-center gap-2">
            <div className="relative flex-1 h-1 rounded-full bg-[#1a1a1a]">
              {/* Fill — updated via DOM ref */}
              <div
                ref={scrubFillRef}
                className="absolute h-1 rounded-full bg-blue-600"
                style={{ width: `${progress * 100}%` }}
              />
              {/* Event markers */}
              {processed
                .filter(
                  (r, i) =>
                    r.computed_flag &&
                    (i === 0 || !processed[i - 1].computed_flag)
                )
                .map((r) => (
                  <div
                    key={r.elapsed_s}
                    className="absolute top-0 w-0.5 h-1 bg-orange-500/70"
                    style={{
                      left: `${(r.elapsed_s / (totalS || 1)) * 100}%`,
                    }}
                  />
                ))}
              <input
                type="range"
                min={0}
                max={processed.length - 1}
                value={cursorIdx}
                onChange={(e) => {
                  setPlaying(false);
                  moveCursor(parseInt(e.target.value));
                }}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-1"
                aria-label="Playback position"
              />
            </div>
            <span className="text-[10px] font-mono text-[#4b5563] whitespace-nowrap">
              <span ref={scrubTimeRef}>{formatDuration(elapsedS)}</span>
              {" / "}
              {formatDuration(totalS)}
            </span>
          </div>

          {/* Event counter */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#4b5563] whitespace-nowrap">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: eventCount > 0 ? "#f97316" : "#374151" }}
            />
            <span className="text-orange-400 font-bold">{eventCount}</span>
            <span>events detected</span>
          </div>
        </div>
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_250px] gap-3">

        {/* LEFT — Gauge + readings */}
        <div className="space-y-3">

          {/* Severity gauge card */}
          <div className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b] p-4 flex flex-col items-center gap-1">
            <div className="flex items-center justify-between w-full mb-1">
              <p className="text-[10px] uppercase tracking-widest text-[#4b5563] font-medium">
                Live Severity
              </p>
              <span
                className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
                style={{
                  color,
                  borderColor: `${color}50`,
                  background: `${color}10`,
                }}
              >
                {severity}
              </span>
            </div>
            <SeverityGauge
              value={displayCss}
              size={174}
              label="Composite Severity Score"
            />
            <p className="text-[9px] text-[#374151] text-center leading-snug mt-1">
              Smoothed display · raw CSS {(row?.computed_css ?? 0).toFixed(3)}
            </p>
          </div>

          {/* Live readings */}
          <div className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b] p-3 space-y-2.5">
            <p className="text-[10px] uppercase tracking-widest text-[#4b5563] font-medium">
              Live Readings
            </p>
            {[
              {
                label: "Depth",
                value: `${fmt(row?.bit_depth_m, 0)} m`,
                color: "text-[#c9d1d9]",
              },
              {
                label: "RPM",
                value: fmt(row?.rpm, 0),
                sub: `SP ${fmt(ctrl?.rpm_setpoint, 0)}`,
                color: "text-blue-400",
              },
              {
                label: "WOB",
                value: `${fmt(row?.wob_kkgf, 2)} kkgf`,
                sub: `SP ${fmt(ctrl?.wob_setpoint, 2)}`,
                color: "text-emerald-400",
              },
              {
                label: "Torque",
                value: `${fmt(row?.torque_kNm, 2)} kNm`,
                color: "text-violet-400",
              },
              {
                label: "MWD",
                value:
                  row?.mwd_ss_pktopk != null
                    ? `${fmt(row.mwd_ss_pktopk, 0)} rpm`
                    : "—",
                color: "text-red-400",
              },
            ].map(({ label, value, sub, color: c }) => (
              <div
                key={label}
                className="flex items-center justify-between"
              >
                <span className="text-[10px] uppercase tracking-wide text-[#374151]">
                  {label}
                </span>
                <div className="text-right leading-tight">
                  <span className={`text-xs font-mono font-bold ${c}`}>
                    {value}
                  </span>
                  {sub && (
                    <span className="text-[10px] text-[#374151] ml-1">
                      → {sub}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CENTRE — Chart */}
        <div className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b] overflow-hidden">
          {/* Channel tabs */}
          <div
            className="flex border-b border-[#141414] overflow-x-auto bg-[#0b0b0b]"
            role="tablist"
          >
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === channel}
                onClick={() => setChannel(c.id)}
                className={`px-3 py-2.5 text-[11px] font-medium whitespace-nowrap border-b-2 transition-all flex-1 ${
                  c.id === channel
                    ? "border-blue-500 text-blue-400 bg-[#0f0f0f]"
                    : "border-transparent text-[#374151] hover:text-[#6b7280]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="px-3 pt-3 pb-1">
            <LiveChart
              ref={liveChartRef}
              data={processed}
              controlOutputs={ctrlOutputs}
              channel={channel}
            />
          </div>

          {/* Status bar */}
          <div
            className="px-4 py-2 border-t border-[#111] flex items-center gap-3 flex-wrap"
            style={{ background: `${color}06` }}
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background: color,
                boxShadow:
                  severity !== "STABLE" ? `0 0 6px ${color}` : "none",
              }}
            />
            <span
              className="text-[11px] font-mono font-bold shrink-0"
              style={{ color }}
            >
              {currentState}
            </span>
            <span className="text-[10px] text-[#374151] flex-1 truncate">
              {CHANNEL_NOTES[channel]}
            </span>
            {row?.computed_flag && (
              <span className="text-[10px] font-mono text-orange-400 shrink-0">
                Event #{row.computed_event_id}
              </span>
            )}
          </div>
        </div>

        {/* RIGHT — State machine / params */}
        <div className="space-y-3">
          {/* Tab row */}
          <div className="flex rounded-xl border border-[#1a1a1a] bg-[#0b0b0b] overflow-hidden p-0.5 gap-0.5">
            {(["state", "params"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setRightTab(t)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
                  rightTab === t
                    ? "bg-[#161616] text-[#c9d1d9]"
                    : "text-[#4b5563] hover:text-[#6b7280]"
                }`}
              >
                {t === "state" ? (
                  <>
                    <Gauge className="w-3 h-3" /> Controller
                  </>
                ) : (
                  <>
                    <SlidersHorizontal className="w-3 h-3" /> Tune
                  </>
                )}
              </button>
            ))}
          </div>

          {rightTab === "state" ? (
            <div className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b] p-3 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-[#4b5563] font-medium">
                State Machine
              </p>
              <StateMachineViz current={currentState} />

              <div className="border-t border-[#141414] pt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#1a1a1a] bg-[#111] px-3 py-2">
                  <p className="text-[10px] text-[#374151] mb-0.5">WOB setpoint</p>
                  <p className="font-mono font-bold text-emerald-400 text-sm">
                    {fmt(ctrl?.wob_setpoint, 2)}
                    <span className="text-[10px] text-[#374151] font-normal ml-0.5">
                      kkgf
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-[#1a1a1a] bg-[#111] px-3 py-2">
                  <p className="text-[10px] text-[#374151] mb-0.5">RPM setpoint</p>
                  <p className="font-mono font-bold text-blue-400 text-sm">
                    {fmt(ctrl?.rpm_setpoint, 0)}
                    <span className="text-[10px] text-[#374151] font-normal ml-0.5">
                      rpm
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b] p-3 space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#4b5563] font-medium">
                  Detection
                </p>
                <p className="text-[10px] text-[#374151] mt-0.5">
                  Adjust and watch events update live
                </p>
              </div>
              <div className="space-y-4">
                <ParamSlider
                  label="CSS Threshold"
                  hint="engage threshold"
                  value={detParams.cssThreshold}
                  min={0.1}
                  max={0.8}
                  step={0.01}
                  format={(v) => v.toFixed(2)}
                  onChange={(v) =>
                    setDetParams((p) => ({ ...p, cssThreshold: v }))
                  }
                />
                <ParamSlider
                  label="Min Duration"
                  hint="samples"
                  value={detParams.minDurationSamples}
                  min={2}
                  max={20}
                  step={1}
                  format={(v) => `${v} samples`}
                  onChange={(v) =>
                    setDetParams((p) => ({
                      ...p,
                      minDurationSamples: v,
                    }))
                  }
                />
              </div>

              <div className="border-t border-[#141414] pt-3 space-y-4">
                <p className="text-[10px] uppercase tracking-widest text-[#4b5563] font-medium">
                  Controller
                </p>
                <ParamSlider
                  label="Kp (WOB)"
                  hint="proportional gain"
                  value={ctrlParams.kpWob}
                  min={0.05}
                  max={0.8}
                  step={0.01}
                  format={(v) => v.toFixed(2)}
                  onChange={(v) =>
                    setCtrlParams((p) => ({ ...p, kpWob: v }))
                  }
                />
                <ParamSlider
                  label="WOB Floor"
                  hint="min WOB fraction"
                  value={ctrlParams.wobMinFraction}
                  min={0.2}
                  max={0.8}
                  step={0.01}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                  onChange={(v) =>
                    setCtrlParams((p) => ({ ...p, wobMinFraction: v }))
                  }
                />
                <ParamSlider
                  label="Max RPM Δ"
                  hint="above nominal"
                  value={ctrlParams.rpmMaxIncrease}
                  min={0}
                  max={60}
                  step={1}
                  format={(v) => `+${v} rpm`}
                  onChange={(v) =>
                    setCtrlParams((p) => ({ ...p, rpmMaxIncrease: v }))
                  }
                />
                <ParamSlider
                  label="Holdoff"
                  hint="before action"
                  value={ctrlParams.holdoffSamples}
                  min={1}
                  max={20}
                  step={1}
                  format={(v) => `${v} samples`}
                  onChange={(v) =>
                    setCtrlParams((p) => ({
                      ...p,
                      holdoffSamples: v,
                    }))
                  }
                />
              </div>

              {/* Live event count */}
              <div className="border-t border-[#141414] pt-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-[#374151]">
                    Events at these params
                  </p>
                  <p className="text-2xl font-bold font-mono text-orange-400">
                    {eventCount}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-[#374151]">vs baseline</p>
                  <p className="text-xs font-mono text-[#4b5563]">
                    8 (original)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Mini event log */}
          <div className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b] p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="w-3 h-3 text-[#374151]" />
              <p className="text-[10px] uppercase tracking-widest text-[#4b5563] font-medium">
                Events so far
              </p>
            </div>
            {eventCount === 0 ? (
              <p className="text-[10px] text-[#374151]">
                None yet — scrub forward
              </p>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {Array.from({ length: eventCount }, (_, i) => i + 1).map(
                  (eid) => {
                    const evRows = processed.filter(
                      (r) =>
                        r.computed_event_id === eid &&
                        r.elapsed_s <= elapsedS
                    );
                    if (evRows.length === 0) return null;
                    const peak = Math.max(
                      ...evRows.map((r) => r.computed_css)
                    );
                    const sev = cssToSeverity(peak);
                    const col = severityColor(sev);
                    return (
                      <div
                        key={eid}
                        className="flex items-center gap-2 text-[10px] py-0.5"
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: col }}
                        />
                        <span className="font-mono text-[#374151]">
                          #{eid}
                        </span>
                        <span
                          style={{ color: col }}
                          className="font-bold"
                        >
                          {sev}
                        </span>
                        <span className="text-[#374151] ml-auto">
                          {peak.toFixed(3)}
                        </span>
                      </div>
                    );
                  }
                ).filter(Boolean)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
