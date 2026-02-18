"use client";

import { useState } from "react";
import type { TelemetryRow, DrillingEvent, Metadata } from "@/lib/types";
import TelemetryCharts from "./TelemetryCharts";
import OverlayChart from "./OverlayChart";
import SimulationEngine from "./SimulationEngine";
import EventsTable from "./EventsTable";
import AttenuationBadge from "./AttenutationBadge";
import ControllerLegend from "./ControllerLegend";
import Glossary from "./Glossary";
import { BarChart3, Cpu } from "lucide-react";

interface Props {
  telemetry: TelemetryRow[];
  events: DrillingEvent[];
  metadata: Metadata;
  surfaceVariation: number;
}

export default function PageTabs({
  telemetry,
  events,
  metadata,
  surfaceVariation,
}: Props) {
  const [tab, setTab] = useState<"overview" | "simulation">("simulation");

  return (
    <div className="space-y-5">

      {/* ── Tab selector ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-[#0b0b0b] border border-[#1a1a1a] rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("overview")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "overview"
              ? "bg-[#161616] text-white shadow-sm"
              : "text-[#4b5563] hover:text-[#9ca3af]"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Historical Data
        </button>
        <button
          onClick={() => setTab("simulation")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "simulation"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-[#4b5563] hover:text-[#9ca3af]"
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Interactive Simulation
          {tab !== "simulation" && (
            <span className="text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono">
              LIVE
            </span>
          )}
        </button>
      </div>

      {/* ── Historical overview ───────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-5 animate-fade-in">

          {/* 5-channel telemetry chart (tabbed, per-channel) */}
          <TelemetryCharts telemetry={telemetry} events={events} />

          {/* All channels overlaid on a single normalized chart */}
          <OverlayChart data={telemetry} events={events} />

          {/* Lower 3-column panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <AttenuationBadge
              surfaceVariation={surfaceVariation}
              downholeVariation={metadata.mwd_max_pktopk_rpm}
            />
            <div className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b] p-4 space-y-3">
              <h2 className="text-[10px] uppercase tracking-widest text-[#4b5563] font-medium">
                Controller Logic
              </h2>
              <p className="text-[11px] text-[#4b5563] leading-relaxed border-l-2 border-[#1a1a1a] pl-2">
                {metadata.controller.type}
              </p>
              <ControllerLegend config={metadata.controller} />
            </div>
            <div className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b] p-4 space-y-3">
              <h2 className="text-[10px] uppercase tracking-widest text-[#4b5563] font-medium">
                Signal Weighting
              </h2>
              <div className="space-y-2">
                {Object.entries(metadata.detection.signals).map(
                  ([key, desc]) => {
                    const pct = key.includes("mwd")
                      ? 60
                      : key.includes("torque")
                      ? 30
                      : 10;
                    const col = key.includes("mwd")
                      ? "bg-red-500"
                      : key.includes("torque")
                      ? "bg-purple-500"
                      : "bg-blue-500";
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-[#1a1a1a] bg-[#111] px-3 py-2"
                      >
                        <div className="flex justify-between mb-1">
                          <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide">
                            {key.replace(/_/g, " ")}
                          </p>
                          <span className="text-[10px] font-mono text-[#4b5563]">
                            {pct}%
                          </span>
                        </div>
                        <div className="w-full bg-[#1a1a1a] rounded-full h-0.5 mb-1.5">
                          <div
                            className={`h-0.5 rounded-full ${col}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-[#4b5563] leading-snug">
                          {desc}
                        </p>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </div>

          {/* Events table */}
          <section className="rounded-xl border border-[#1a1a1a] bg-[#0b0b0b] p-4">
            <h2 className="text-[10px] uppercase tracking-widest text-[#4b5563] font-medium mb-1">
              Detected Events —{" "}
              <span className="text-orange-400">{events.length}</span> over{" "}
              {metadata.drilling_days} drilling days
            </h2>
            <p className="text-[11px] text-[#374151] mb-4">
              Pre-computed using default parameters. Switch to Interactive
              Simulation to retune and re-detect in real time.
            </p>
            <EventsTable events={events} />
          </section>

          {/* Glossary */}
          <Glossary />
        </div>
      )}

      {/* ── Interactive simulation ────────────────────────────────────────── */}
      {tab === "simulation" && (
        <div className="animate-fade-in">
          <SimulationEngine
            rawTelemetry={telemetry}
            nominalWob={metadata.controller.nominal_wob_kkgf}
            nominalRpm={metadata.controller.nominal_rpm}
          />
        </div>
      )}
    </div>
  );
}
