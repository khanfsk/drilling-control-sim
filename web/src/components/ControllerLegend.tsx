"use client";

import type { ControllerConfig } from "@/lib/types";
import { STATE_COLORS } from "@/lib/utils";
import type { ControllerState } from "@/lib/types";

interface Props {
  config: ControllerConfig;
}

const STATE_DESCRIPTIONS: Record<ControllerState, string> = {
  NORMAL: "Nominal operation — hold WOB and RPM setpoints",
  DETECTING: "SSI threshold crossed — monitoring for sustained event",
  MITIGATING: "WOB reduced proportionally; RPM setpoint raised to break stick phase",
  RECOVERING: "CSS below recovery threshold — ramping WOB back to nominal",
};

export default function ControllerLegend({ config }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-slate-700/40 bg-slate-800/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Nominal WOB</p>
          <p className="font-mono font-bold text-blue-300">{config.nominal_wob_kkgf.toFixed(2)} kkgf</p>
        </div>
        <div className="rounded border border-slate-700/40 bg-slate-800/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Nominal RPM</p>
          <p className="font-mono font-bold text-blue-300">{config.nominal_rpm.toFixed(0)} rpm</p>
        </div>
        <div className="rounded border border-slate-700/40 bg-slate-800/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Kp (WOB)</p>
          <p className="font-mono font-bold text-slate-300">{config.kp_wob}</p>
        </div>
        <div className="rounded border border-slate-700/40 bg-slate-800/20 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">WOB Floor</p>
          <p className="font-mono font-bold text-slate-300">{(config.wob_min_fraction * 100).toFixed(0)}% nominal</p>
        </div>
      </div>

      <div className="space-y-2">
        {(config.states as ControllerState[]).map((state) => (
          <div key={state} className="flex items-start gap-3">
            <div
              className="w-2 h-2 rounded-full shrink-0 mt-1.5"
              style={{ backgroundColor: STATE_COLORS[state] }}
            />
            <div>
              <p className="text-xs font-semibold" style={{ color: STATE_COLORS[state] }}>
                {state}
              </p>
              <p className="text-[11px] text-slate-500">{STATE_DESCRIPTIONS[state]}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
