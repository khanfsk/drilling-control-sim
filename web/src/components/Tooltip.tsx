"use client";

/**
 * Tooltip — Nielsen Heuristic #6: Recognition over recall.
 * Every abbreviation and technical term in drilling engineering
 * must be explained inline so the UI is usable without prior knowledge.
 */

import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface Props {
  term: string;
  definition: string;
  children?: React.ReactNode;
  /** If true, wraps children in an underline rather than showing an icon */
  inline?: boolean;
}

export default function Tooltip({ term, definition, children, inline = false }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click (Nielsen #3: user control)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <span ref={ref} className="relative inline-flex items-center gap-0.5">
      {inline ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="border-b border-dotted border-slate-500 text-inherit hover:border-blue-400 transition-colors cursor-help"
          aria-label={`Explain: ${term}`}
        >
          {children ?? term}
        </button>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-slate-600 hover:text-blue-400 transition-colors"
          aria-label={`Explain: ${term}`}
        >
          <HelpCircle className="w-3 h-3" />
        </button>
      )}

      {open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 mb-2 z-50 w-56 rounded-lg border border-blue-500/30 bg-[#0c1527] shadow-xl p-3 text-left"
        >
          <p className="text-[11px] font-bold text-blue-300 mb-1">{term}</p>
          <p className="text-[11px] text-slate-400 leading-relaxed">{definition}</p>
          {/* Arrow */}
          <div className="absolute -bottom-1.5 left-3 w-3 h-3 rotate-45 border-b border-r border-blue-500/30 bg-[#0c1527]" />
        </div>
      )}
    </span>
  );
}
