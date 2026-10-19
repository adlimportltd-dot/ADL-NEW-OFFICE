import React from "react";
import { ChevronRight } from "lucide-react";

// רכיבים וקבועים משותפים למסכי הטלפון (מכירה, מזיגה, ספירה)
export const NAVY = "#0F172A";
export const AMBER = "#F59E0B";
export const fmt = (n) => `₪${Number(n || 0).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
export const ESSENCE_RE = /^תמצית ריח - (.+) \((.+)\)$/;
export const norm = (s) => (s || "").toString().replace(/[׳']/g, "").toLowerCase();
export const bigBtn = "w-full h-14 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.99] hover:brightness-105 disabled:opacity-40 disabled:shadow-none disabled:active:scale-100 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-amber-500";
// רשימת כרטיסים: בטלפון טור אחד, במחשב (בתוך המערכת) שני טורים
export const WIDE = "grid grid-cols-1 gap-3 lg:group-[.wide]/w:grid-cols-2";
// עטיפת המסכים: בטלפון – מסך צר לכל הגובה; במחשב – ליד התפריט, ברוחב העבודה
export function Shell({ embedded, wide = true, children }) {
  return embedded ? (
    <div dir="rtl" lang="he" className={`w-full ${wide ? "max-w-5xl group/w wide" : "max-w-3xl"} tabular-nums`}>
      <div className="bg-slate-50 border border-slate-200 rounded-2xl shadow-sm flex flex-col text-slate-900 min-h-[calc(100vh-7rem)] overflow-clip [&>div:first-child]:rounded-t-2xl">{children}</div>
    </div>
  ) : (
    <div dir="rtl" lang="he" className="min-h-screen bg-slate-100 flex justify-center tabular-nums" style={{ fontFamily: "'Rubik','Assistant',sans-serif" }}>
      <div className="w-full max-w-md min-h-screen bg-slate-50 flex flex-col text-slate-900">{children}</div>
    </div>
  );
}

export function SectionTitle({ children, icon: Icon, right }) {
  return (
    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 mt-1">
      {Icon && <Icon size={15} />}<span className="flex-1">{children}</span>{right}
    </div>
  );
}

export function parseEssence(name) {
  const m = (name || "").match(ESSENCE_RE);
  return m ? { scent: m[1], size: m[2] } : null;
}

export function Header({ title, subtitle, step, onBack, right }) {
  return (
    <div style={{ background: NAVY }} className="text-white px-5 pt-4 pb-4 sticky top-0 z-10">
      <div className="flex items-center gap-2.5">
        {onBack && (
          <button onClick={onBack} aria-label="חזרה" className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 transition flex items-center justify-center shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
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

// hint = מה עוד חסר כדי שהכפתור ייפתח (במקום כפתור אפור בלי הסבר)
export function BottomBar({ children, hint }) {
  return (
    <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 px-4 pt-3 pb-5 z-10 flex flex-col gap-2">
      {hint && <div className="text-center text-[13px] text-slate-500">{hint}</div>}
      {children}
    </div>
  );
}
