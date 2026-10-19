import React from "react";
import { ChevronRight } from "lucide-react";

// רכיבים וקבועים משותפים למסכי הטלפון (מכירה, מזיגה, ספירה)
export const NAVY = "#0F172A";
export const AMBER = "#F59E0B";
export const fmt = (n) => `₪${Number(n || 0).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
export const ESSENCE_RE = /^תמצית ריח - (.+) \((.+)\)$/;
export const norm = (s) => (s || "").toString().replace(/[׳']/g, "").toLowerCase();
export const bigBtn = "w-full h-14 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-40";

export function parseEssence(name) {
  const m = (name || "").match(ESSENCE_RE);
  return m ? { scent: m[1], size: m[2] } : null;
}

export function Header({ title, subtitle, step, onBack, right }) {
  return (
    <div style={{ background: NAVY }} className="text-white px-5 pt-4 pb-4 sticky top-0 z-10">
      <div className="flex items-center gap-2.5">
        {onBack && (
          <button onClick={onBack} aria-label="חזרה" className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
            <ChevronRight size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xl font-bold truncate">{title}</div>
          {subtitle && <div className="text-[13px] text-slate-300 truncate">{subtitle}</div>}
        </div>
        {right}
      </div>
      {step && (
        <div className="flex gap-1.5 mt-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 h-1 rounded" style={{ background: n <= step ? AMBER : "#334155" }} />
          ))}
        </div>
      )}
    </div>
  );
}

export function BottomBar({ children }) {
  return <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 pt-3 pb-5 z-10">{children}</div>;
}
