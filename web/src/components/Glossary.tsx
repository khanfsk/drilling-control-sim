"use client";

/**
 * Glossary — Nielsen Heuristic #10: Help and documentation.
 * Inline glossary for drilling engineering terms so that anyone
 * (not just petroleum engineers) can understand the dashboard.
 *
 * CRAP Proximity: terms are grouped by category.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";

const TERMS = [
  {
    category: "Drilling Parameters",
    items: [
      {
        term: "WOB — Weight on Bit",
        definition:
          "The downward force applied on the drill bit, measured in kkgf (thousand kilograms-force). Higher WOB generally increases Rate of Penetration (ROP) but also increases the torque required to turn the bit, which can trigger stick-slip.",
      },
      {
        term: "RPM — Rotary Speed",
        definition:
          "Revolutions per minute of the drill string at the surface (top drive). The bit RPM downhole is different during stick-slip: it can drop to zero (stick) then spike to 2–3× surface RPM (slip).",
      },
      {
        term: "ROP — Rate of Penetration",
        definition:
          "How fast the drill bit advances into the formation, in metres per hour. Stick-slip reduces effective ROP because energy is wasted in oscillation rather than drilling.",
      },
      {
        term: "Torque (kNm)",
        definition:
          "Rotational force at the top drive, measured in kilonewton-metres. Torque builds during the stick phase (bit is locked) and releases suddenly during the slip phase, causing a visible spike at surface.",
      },
    ],
  },
  {
    category: "Stick-Slip Physics",
    items: [
      {
        term: "Torsional Drill String Oscillation",
        definition:
          "When the drill bit sticks in the formation, the top drive continues rotating and 'winds up' the drill string like a spring. When the stored energy exceeds static friction, the bit suddenly releases and spins far faster than the surface — then sticks again. This cycle can repeat at 0.05–0.5 Hz.",
      },
      {
        term: "Torsional Attenuation",
        definition:
          "The drill string absorbs torsional oscillations before they reach surface instruments. In this well, the at-bit PKtoPK oscillation reached 381 rpm while the surface RPM variation was only ±1 rpm — a 380× attenuation. This is why surface RPM alone cannot detect stick-slip.",
      },
      {
        term: "PKtoPK — Peak-to-Peak",
        definition:
          "The full range of an oscillating quantity: peak maximum minus peak minimum. For MWD stick-slip, it is the difference between maximum and minimum RPM recorded within one oscillation cycle.",
      },
    ],
  },
  {
    category: "Measurement Tools",
    items: [
      {
        term: "MWD — Measurement While Drilling",
        definition:
          "A sensor package in the Bottom Hole Assembly (BHA) that transmits real-time downhole measurements to surface via pressure pulses in the mud column. Includes gamma ray, inclination, azimuth, and (in this dataset) stick-slip PKtoPK RPM.",
      },
      {
        term: "WITSML — Well Information Transfer Standard Markup Language",
        definition:
          "An industry-standard XML-based format for exchanging drilling data between rig systems and office software. The Volve dataset was originally stored in WITSML format and is the source for all time-series data shown here.",
      },
      {
        term: "Top Drive",
        definition:
          "The electric motor at the top of the drill string that rotates it. Modern top drives have active speed control that holds surface RPM nearly constant — which is why surface RPM doesn't reflect downhole oscillation.",
      },
    ],
  },
  {
    category: "Control System",
    items: [
      {
        term: "CSS — Composite Severity Score",
        definition:
          "A 0–1 dimensionless severity index computed by this system. It weights MWD downhole data (60%), surface torque deviation from rolling baseline (30%), and surface RPM oscillation (10%). It is the primary signal driving the auto-driller controller.",
      },
      {
        term: "Soft Torque Rotary System (STRS)",
        definition:
          "A real-world rig automation technology that modulates top drive RPM in response to surface torque changes to damp downhole torsional oscillations. The controller in this simulation is inspired by STRS but uses WOB reduction as the primary mitigation lever.",
      },
      {
        term: "Kp — Proportional Gain",
        definition:
          "The scaling factor in a proportional controller. In this system, Kp_WOB = 0.30 means a CSS excess of 0.10 above threshold results in a 3% WOB reduction from nominal.",
      },
    ],
  },
];

export default function Glossary() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0c1527]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/20 transition-colors rounded-lg"
        aria-expanded={open}
        aria-controls="glossary-content"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-slate-400" aria-hidden />
          <span className="text-sm font-medium text-slate-300">
            Drilling Engineering Glossary
          </span>
          <span className="text-[10px] text-slate-600 ml-1">
            — explains all abbreviations and concepts used in this dashboard
          </span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {open && (
        <div id="glossary-content" className="border-t border-slate-800 px-4 pb-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TERMS.map((group) => (
              <div key={group.category}>
                <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-medium mb-3">
                  {group.category}
                </h4>
                <dl className="space-y-3">
                  {group.items.map((item) => (
                    <div key={item.term}>
                      <dt className="text-xs font-semibold text-slate-200 mb-0.5">
                        {item.term}
                      </dt>
                      <dd className="text-[11px] text-slate-500 leading-relaxed">
                        {item.definition}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
