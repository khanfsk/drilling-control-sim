"use client";

/**
 * SeverityGauge — animated SVG arc gauge.
 * Shows the current Composite Severity Score from 0–1.
 * Arc color transitions through green → yellow → orange → red.
 */

import { severityColor, cssToSeverity } from "@/lib/clientDetection";

interface Props {
  value: number;   // 0–1
  size?: number;   // px, default 160
  label?: string;
}

export default function SeverityGauge({ value, size = 160, label = "CSS" }: Props) {
  const sv = Math.max(0, Math.min(1, value));
  const severity = cssToSeverity(sv);
  const color = severityColor(severity);

  // Arc geometry
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.75;
  const strokeWidth = (size / 2) * 0.12;

  // 240° arc from 150° to 390° (bottom-left to bottom-right via top)
  const startAngle = 150;
  const totalAngle = 240;

  function polarToXY(angleDeg: number, radius: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function describeArc(startDeg: number, endDeg: number, radius: number) {
    const s = polarToXY(startDeg, radius);
    const e = polarToXY(endDeg, radius);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const fillAngle = startAngle + sv * totalAngle;

  // Severity band markers
  const bands = [
    { start: startAngle, end: startAngle + 0.25 * totalAngle, color: "#22c55e33" },
    { start: startAngle + 0.25 * totalAngle, end: startAngle + 0.50 * totalAngle, color: "#eab30833" },
    { start: startAngle + 0.50 * totalAngle, end: startAngle + 0.75 * totalAngle, color: "#f9731633" },
    { start: startAngle + 0.75 * totalAngle, end: startAngle + totalAngle, color: "#ef444433" },
  ];

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${label}: ${sv.toFixed(3)}`}>
        {/* Band background arcs */}
        {bands.map((b, i) => (
          <path
            key={i}
            d={describeArc(b.start, b.end - 0.5, r)}
            fill="none"
            stroke={b.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
        ))}

        {/* Track (full arc, dimmed) */}
        <path
          d={describeArc(startAngle, startAngle + totalAngle - 0.5, r)}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Value arc */}
        {sv > 0.005 && (
          <path
            d={describeArc(startAngle, Math.max(startAngle + 1, fillAngle), r)}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color}80)`, transition: "d 0.3s ease" }}
          />
        )}

        {/* Needle dot */}
        {(() => {
          const tip = polarToXY(Math.max(startAngle + 1, fillAngle), r);
          return (
            <circle
              cx={tip.x}
              cy={tip.y}
              r={strokeWidth * 0.6}
              fill={color}
              style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            />
          );
        })()}

        {/* Tick marks at severity thresholds */}
        {[0.25, 0.50, 0.75].map((t) => {
          const ang = startAngle + t * totalAngle;
          const inner = polarToXY(ang, r - strokeWidth * 0.8);
          const outer = polarToXY(ang, r + strokeWidth * 0.8);
          return (
            <line
              key={t}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke="#475569"
              strokeWidth={1.5}
            />
          );
        })}

        {/* Centre value text */}
        <text
          x={cx}
          y={cy - size * 0.04}
          textAnchor="middle"
          fill={color}
          fontSize={size * 0.18}
          fontWeight="bold"
          fontFamily="ui-monospace, monospace"
          style={{ transition: "fill 0.3s ease" }}
        >
          {sv.toFixed(3)}
        </text>
        <text
          x={cx}
          y={cy + size * 0.10}
          textAnchor="middle"
          fill={color}
          fontSize={size * 0.09}
          fontFamily="ui-monospace, monospace"
          opacity={0.8}
        >
          {severity}
        </text>
        <text
          x={cx}
          y={cy + size * 0.22}
          textAnchor="middle"
          fill="#4b5563"
          fontSize={size * 0.07}
          fontFamily="ui-sans-serif, sans-serif"
          letterSpacing="0.05em"
        >
          {label}
        </text>

        {/* Scale labels */}
        {[
          { val: "0", ang: startAngle },
          { val: "0.5", ang: startAngle + 0.5 * totalAngle },
          { val: "1", ang: startAngle + totalAngle },
        ].map(({ val, ang }) => {
          const pos = polarToXY(ang, r + strokeWidth * 1.6);
          return (
            <text
              key={val}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#374151"
              fontSize={size * 0.07}
              fontFamily="ui-monospace, monospace"
            >
              {val}
            </text>
          );
        })}
      </svg>

      {label && (
        <p className="text-[10px] uppercase tracking-widest text-slate-600">{label}</p>
      )}
    </div>
  );
}
