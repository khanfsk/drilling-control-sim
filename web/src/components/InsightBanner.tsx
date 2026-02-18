"use client";

import { Info } from "lucide-react";

interface Props {
  text: string;
}

export default function InsightBanner({ text }: Props) {
  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex gap-3 items-start">
      <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
      <p className="text-sm text-blue-200/80 leading-relaxed">{text}</p>
    </div>
  );
}
