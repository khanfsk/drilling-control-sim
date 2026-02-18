"use client";

/**
 * StateMachineViz — animated controller state machine diagram.
 * Shows the four states as nodes with the active one highlighted.
 */

import type { ControllerState } from "@/lib/clientController";
import { STATE_COLORS } from "@/lib/utils";

interface Props {
  current: ControllerState;
}

const STATES: ControllerState[] = ["NORMAL", "DETECTING", "MITIGATING", "RECOVERING"];

const STATE_SHORT: Record<ControllerState, string> = {
  NORMAL: "Normal",
  DETECTING: "Detecting",
  MITIGATING: "Mitigating",
  RECOVERING: "Recovering",
};

const STATE_DESC: Record<ControllerState, string> = {
  NORMAL: "Hold nominal WOB & RPM",
  DETECTING: "Monitoring CSS threshold…",
  MITIGATING: "WOB↓  RPM↑  active now",
  RECOVERING: "CSS cleared — ramping WOB back",
};

export default function StateMachineViz({ current }: Props) {
  return (
    <div className="space-y-2">
      {STATES.map((s) => {
        const isActive = s === current;
        const color = STATE_COLORS[s];
        return (
          <div
            key={s}
            className={`
              flex items-center gap-3 rounded-lg border px-3 py-2.5
              transition-all duration-300
              ${isActive
                ? "bg-current/5 shadow-lg"
                : "border-slate-800 bg-transparent opacity-50"
              }
            `}
            style={isActive ? { borderColor: `${color}60`, boxShadow: `0 0 12px ${color}20` } : {}}
            aria-current={isActive ? "step" : undefined}
          >
            {/* State indicator */}
            <div className="relative shrink-0">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: isActive ? color : "#334155" }}
              />
              {isActive && (
                <div
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{ backgroundColor: color, opacity: 0.4 }}
                />
              )}
            </div>

            {/* Labels */}
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-bold font-mono"
                style={{ color: isActive ? color : "#475569" }}
              >
                {STATE_SHORT[s]}
              </p>
              <p className="text-[10px] text-slate-600 truncate">{STATE_DESC[s]}</p>
            </div>

            {/* Active badge */}
            {isActive && (
              <span
                className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border shrink-0"
                style={{ color, borderColor: `${color}60`, backgroundColor: `${color}15` }}
              >
                active
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
