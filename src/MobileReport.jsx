import React, { useEffect, useState, useCallback } from "react";
import { ChevronRight, ChevronLeft, Loader2, TriangleAlert, CircleCheck } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { NAVY, AMBER, fmt, parseEssence, Header } from "./mobileUi";
import { reasonLabel } from "./MobileWaste";

// ============================================================
// דוח יומי – ליאור / אלירן בלבד. כל הנתונים מ-daily_report (קריאה בלבד).
// אותו מסך נקרא כל בוקר ע"י המשימה המתוזמנת ונשלח במייל.
// ============================================================

const SIZE_LABEL = { '25 ק"ג': "חבית 25", '5 ק"ג': "גלון 5", '1 ק"ג': '1 ק"ג', 'חצי ק"ג': "חצי", 'רבע ק"ג': "רבע" };
const q = (n) => Number(n || 0).toLocaleString("he-IL", { maximumFractionDigits: 2 });
const short = (name) => { const p = parseEssence(name); return p ? `${p.scent} ${SIZE_LABEL[p.size] || p.size}` : name; };
const israelToday = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };

function Section({ title, children, empty }) {
  return (
    <section className="bg-white border-[1.5px] border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2">
      <h2 className="font-bold text-[16px]">{title}</h2>
      {empty ? <div className="text-sm text-slate-500">{empty}</div> : children}
    </section>
  );
}
const Row = ({ a, b, strong }) => (
  <div className="flex justify-between gap-3 text-sm"><span className="text-slate-600">{a}</span><span className={strong ? "font-bold" : "font-semibold"}>{b}</span></div>
);

export function DailyReport({ onBack }) {
  const yesterday = addDays(iso(israelToday()), -1);
  const [day, setDay] = useState(yesterday);
  const [r, setR] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async (d) => {
    setR(null); setError("");
    const { data, error: e } = await supabase.rpc("daily_report", { p_day: d });
    if (e) setError(e.message); else setR(data);
  }, []);
  useEffect(() => { load(day); }, [day, load]);

  const today = iso(israelToday());
  const dayTitle = new Date(day + "T12:00:00").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" });

  const s = r?.sales || {};
  const exceptions = [];
  if (r) {
    (s.list || []).filter((x) => x.vat === 0).forEach((x) => exceptions.push(`ללא מע"מ: ${x.customer} – ${fmt(x.total)} (${x.seller})`));
    (s.list || []).filter((x) => x.below_cost).forEach((x) => exceptions.push(`מתחת לעלות: ${x.customer} – ${fmt(x.total)} (${x.seller})`));
    (r.repacks || []).filter((x) => x.reason).forEach((x) => exceptions.push(`מזיגה חריגה: ${x.scent} – נפתח ${q(x.in_kg)} יצא ${q(x.out_kg)} ק"ג (${x.by}) – ${x.reason}`));
    (r.counts || []).filter((x) => Number(x.diff_ils) !== 0).forEach((x) => exceptions.push(`פער בספירה של ${x.by}: ${fmt(x.diff_ils)}`));
  }
  const pend = r?.pending || {};
  const pendingTotal = Number(pend.repacks || 0) + Number(pend.counts || 0) + Number(pend.vehicle || 0) + Number(pend.waste || 0);

  return (<>
    <Header title="דוח יומי" subtitle={dayTitle} onBack={onBack} />
    <div className="flex-1 px-4 py-3.5 flex flex-col gap-3" id="daily-report">
      <div className="grid grid-cols-[48px_1fr_48px] gap-2 items-center">
        <button aria-label="יום קודם" onClick={() => setDay(addDays(day, -1))} className="h-11 rounded-xl bg-white border-[1.5px] border-slate-300 flex items-center justify-center"><ChevronRight size={20} /></button>
        <button onClick={() => setDay(yesterday)} className="h-11 rounded-xl bg-white border-[1.5px] border-slate-300 text-sm font-semibold">{day === yesterday ? "אתמול" : day === today ? "היום (עד עכשיו)" : "חזרה לאתמול"}</button>
        <button aria-label="יום הבא" disabled={day >= today} onClick={() => setDay(addDays(day, 1))} className="h-11 rounded-xl bg-white border-[1.5px] border-slate-300 flex items-center justify-center disabled:opacity-40"><ChevronLeft size={20} /></button>
      </div>

      {error && <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2.5 text-sm"><TriangleAlert size={16} /> {error}</div>}
      {!r && !error && <div className="flex items-center justify-center gap-2 text-slate-500 py-16"><Loader2 className="animate-spin" size={18} /> טוען...</div>}

      {r && (<>
        <div className="rounded-2xl p-4 flex flex-col gap-1" style={{ background: NAVY, color: "#fff" }}>
          <div className="text-sm text-slate-300">מכירות</div>
          <div className="text-3xl font-bold">{fmt(s.total)}</div>
          <div className="text-sm text-slate-300">{s.count} מכירות · לפני מע"מ {fmt(s.ex_vat)} · רווח משוער {fmt(s.profit)}</div>
          {Number(s.unpaid_count) > 0 && <div className="text-sm mt-1" style={{ color: AMBER }}>לא שולם עדיין: {s.unpaid_count} מכירות · {fmt(s.unpaid_total)}</div>}
        </div>

        {pendingTotal > 0 && (
          <div className="rounded-2xl px-4 py-3 font-semibold" style={{ background: AMBER, color: NAVY }}>
            מחכים לאישור: {[pend.vehicle > 0 && `${pend.vehicle} בקשות רכב`, pend.repacks > 0 && `${pend.repacks} מזיגות`, pend.waste > 0 && `${pend.waste} פחת/דוגמאות`, pend.counts > 0 && "ספירה שבועית"].filter(Boolean).join(" · ")}
          </div>
        )}

        <Section title="⚠️ חריגות" empty={exceptions.length ? null : "אין חריגות"}>
          {exceptions.map((t, i) => <div key={i} className="text-sm bg-amber-50 rounded-lg px-2.5 py-1.5">{t}</div>)}
        </Section>

        <Section title="מכירות לפי מוכר" empty={(s.by_seller || []).length ? null : "לא היו מכירות"}>
          {(s.by_seller || []).map((x) => (
            <Row key={x.name} a={`${x.name} · ${x.count} מכירות${Number(x.from_vehicle) ? ` (${x.from_vehicle} מהרכב)` : ""}`} b={`${fmt(x.total)} · רווח ${fmt(x.profit)}`} />
          ))}
        </Section>

        {(s.list || []).length > 0 && (
          <Section title="כל המכירות">
            {s.list.map((x) => (
              <div key={x.num} className="flex justify-between gap-2 text-sm border-b border-slate-100 last:border-0 pb-1.5">
                <span className="min-w-0 truncate">{x.customer} · {x.seller}{x.from_vehicle ? " · מהרכב" : ""}{x.vat === 0 ? " · ללא מע\"מ" : ""}</span>
                <span className="font-semibold shrink-0">{fmt(x.total)}{x.paid ? "" : " · לא שולם"}</span>
              </div>
            ))}
          </Section>
        )}

        <Section title="מזיגות" empty={(r.repacks || []).length || r.repacks_desktop ? null : "לא היו מזיגות"}>
          {(r.repacks || []).map((x) => (
            <Row key={x.tag} a={`${x.scent} · ${x.by}${x.status === "pending" ? " · ממתין" : x.status === "rejected" ? " · נדחה" : ""}`} b={`${q(x.in_kg)} ← ${q(x.out_kg)} ק"ג`} />
          ))}
          {Number(r.repacks_desktop) > 0 && <div className="text-sm text-slate-600">ועוד {r.repacks_desktop} מזיגות שנרשמו במחשב</div>}
        </Section>

        <Section title="רכב" empty={(r.vehicle || []).length ? null : "לא היו העמסות או החזרות"}>
          {(r.vehicle || []).map((x) => (
            <div key={x.tag} className="text-sm">
              <span className="font-semibold">{x.kind === "load" ? "העמסה לרכב" : "החזרה למחסן"}</span>
              <span className="text-slate-600"> · {x.by} · {x.status === "approved" ? `אושר ע"י ${x.decided_by}` : x.status === "pending" ? "ממתין" : x.status === "rejected" ? "נדחה" : "בוטל"}</span>
              <div className="text-slate-700">{(x.lines || []).map((l) => `${q(l.qty)} ${short(l.name)}`).join(", ")}</div>
            </div>
          ))}
        </Section>

        <Section title="דוגמאות ופחת" empty={(r.waste || []).length ? null : "לא היו"}>
          {(r.waste || []).map((x) => (
            <Row key={x.tag} a={`${reasonLabel(x.reason)}${x.customer ? `: ${x.customer}` : ""} · ${x.by}${x.status === "pending" ? " · ממתין" : x.status === "rejected" ? " · נדחה" : ""} – ${(x.lines || []).map((l) => `${q(l.qty)} ${short(l.name)}`).join(", ")}`} b={fmt(x.value)} />
          ))}
        </Section>

        <Section title="כל הגריעות מהמלאי (פחת, דוגמאות, ספירה)" empty={(r.writeoffs || []).length ? null : "לא היו גריעות"}>
          {(r.writeoffs || []).map((x, i) => (
            <Row key={i} a={`${q(x.qty)} ${short(x.item)}${x.note ? ` – ${x.note}` : ""}`} b={fmt(x.value)} />
          ))}
        </Section>

        <Section title="צריך למזוג" empty={(r.to_pour || []).length ? null : "המדפים מלאים"}>
          <div className="text-sm">{(r.to_pour || []).map((x) => `${x.scent} ${SIZE_LABEL[x.unit] || x.unit}`).join(" · ")}</div>
        </Section>

        <Section title="מלאי נמוך (מתחת לסף)" empty={(r.low_stock || []).length ? null : "אין"}>
          {(r.low_stock || []).map((x) => <Row key={x.item} a={short(x.item)} b={`${q(x.qty)} (סף ${q(x.min)})`} />)}
        </Section>

        {exceptions.length === 0 && pendingTotal === 0 && (
          <div className="flex items-center gap-2 text-green-800 text-sm justify-center py-2"><CircleCheck size={18} /> יום נקי – בלי חריגות ובלי ממתינים</div>
        )}
      </>)}
    </div>
  </>);
}
