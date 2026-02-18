"use client";

/**
 * Visual "before vs after" card showing the drill string attenuation effect.
 * Surface RPM barely changes while downhole PKtoPK can exceed 300 rpm.
 */
export default function AttenuationBadge({
  surfaceVariation,
  downholeVariation,
}: {
  surfaceVariation: number;
  downholeVariation: number;
}) {
  const ratio = downholeVariation / Math.max(surfaceVariation, 1);

  return (
    <div className="rounded-lg border border-slate-700/40 bg-[#0c1527] p-4 space-y-3">
      <h4 className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
        Drill String Torsional Attenuation
      </h4>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-center">
          <p className="text-[10px] text-slate-500 mb-1">Surface RPM Variation</p>
          <p className="text-xl font-bold font-mono text-blue-300">±{surfaceVariation.toFixed(0)}</p>
          <p className="text-[10px] text-slate-500">rpm (observed)</p>
        </div>
        <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-center">
          <p className="text-[10px] text-slate-500 mb-1">Downhole PKtoPK (MWD)</p>
          <p className="text-xl font-bold font-mono text-red-300">{downholeVariation.toFixed(0)}</p>
          <p className="text-[10px] text-slate-500">rpm max observed</p>
        </div>
      </div>

      <div className="rounded bg-slate-800/30 px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500">Attenuation factor</span>
          <span className="font-mono font-bold text-orange-300 text-sm">{ratio.toFixed(0)}×</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-red-500"
            style={{ width: `${Math.min(100, (ratio / 400) * 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-600 mt-1">
          The drill string absorbs torsional oscillations — surface instruments
          underestimate at-bit severity by {ratio.toFixed(0)}×.
        </p>
      </div>
    </div>
  );
}
