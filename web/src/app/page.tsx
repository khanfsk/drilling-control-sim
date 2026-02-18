import type { TelemetryRow, DrillingEvent, Metadata } from "@/lib/types";
import MetricsBar from "@/components/MetricsBar";
import InsightBanner from "@/components/InsightBanner";
import PageTabs from "@/components/PageTabs";
import { readFile } from "fs/promises";
import path from "path";

async function getData() {
  const dir = path.join(process.cwd(), "public", "data");
  const [t, e, m] = await Promise.all([
    readFile(path.join(dir, "telemetry.json"), "utf-8"),
    readFile(path.join(dir, "events.json"), "utf-8"),
    readFile(path.join(dir, "metadata.json"), "utf-8"),
  ]);
  return {
    telemetry: JSON.parse(t) as TelemetryRow[],
    events: JSON.parse(e) as DrillingEvent[],
    metadata: JSON.parse(m) as Metadata,
  };
}

export default async function Home() {
  const { telemetry, events, metadata } = await getData();

  const rpms = telemetry
    .map((r) => r.rpm)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const surfaceVariation =
    rpms.length > 0
      ? (rpms[Math.floor(rpms.length * 0.95)] -
          rpms[Math.floor(rpms.length * 0.05)]) /
        2
      : 1;

  return (
    <div className="min-h-screen" style={{ background: "#050505" }}>

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header
        className="border-b sticky top-0 z-50 backdrop-blur-md"
        style={{ borderColor: "#141414", background: "#080808cc" }}
        role="banner"
      >
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="w-2 h-2 rounded-full pulse-slow"
              style={{ background: "#22c55e" }}
              aria-label="System online"
            />
            <span
              className="text-xs font-mono font-semibold tracking-wide"
              style={{ color: "#e2e8f0" }}
            >
              AutoDriller
            </span>
            <span
              className="hidden sm:inline text-[10px] font-mono uppercase tracking-widest"
              style={{ color: "#374151" }}
            >
              · Torsional Vibration Mitigation
            </span>
          </div>
          <div className="hidden md:flex items-center gap-5 text-[11px]" style={{ color: "#4b5563" }}>
            <span>
              Well{" "}
              <span className="font-mono" style={{ color: "#9ca3af" }}>
                {metadata.well}
              </span>
            </span>
            <span>
              Field{" "}
              <span className="font-mono" style={{ color: "#9ca3af" }}>
                {metadata.field}
              </span>
            </span>
            <span
              className="border px-2 py-0.5 rounded text-[10px] font-mono"
              style={{
                color: "#60a5fa",
                borderColor: "#1e40af50",
                background: "#1e3a5f15",
              }}
            >
              {metadata.section}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-7 space-y-7">

        {/* Title */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1
              className="text-xl sm:text-2xl font-bold tracking-tight"
              style={{ color: "#f9fafb" }}
            >
              Closed-Loop Auto-Driller
              <span style={{ color: "#60a5fa" }}> · Stick-Slip Mitigation</span>
            </h1>
          </div>
          <p
            className="text-sm max-w-3xl leading-relaxed"
            style={{ color: "#6b7280" }}
          >
            Real WITSML telemetry from Equinor&apos;s Volve open dataset (Well
            15/9-F-9 A, 2009). Play through the drilling session, tune
            detection and controller parameters, and watch the simulation
            respond in real time.
          </p>
        </div>

        {/* Key metrics */}
        <MetricsBar metadata={metadata} />

        {/* Engineering insight */}
        <InsightBanner text={metadata.key_insight} />

        {/* Tabbed sections */}
        <PageTabs
          telemetry={telemetry}
          events={events}
          metadata={metadata}
          surfaceVariation={surfaceVariation}
        />

        {/* Footer */}
        <footer
          className="border-t pt-5 pb-8 text-center space-y-1"
          style={{ borderColor: "#141414" }}
          role="contentinfo"
        >
          <p className="text-[11px]" style={{ color: "#4b5563" }}>
            Equinor Volve Open Dataset ·{" "}
            <a
              href="https://www.equinor.com/energy/volve-data-sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              {metadata.license}
            </a>
          </p>
          <p className="text-[10px]" style={{ color: "#374151" }}>
            {metadata.on_bottom_samples.toLocaleString()} on-bottom samples ·{" "}
            {metadata.drilling_days} drilling days ·{" "}
            {metadata.depth_range_m[0].toFixed(0)}–
            {metadata.depth_range_m[1].toFixed(0)} m MD · North Sea
          </p>
        </footer>
      </main>
    </div>
  );
}
