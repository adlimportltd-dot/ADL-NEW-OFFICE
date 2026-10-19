import React, { useEffect, useState, useCallback } from "react";
import { ChevronRight, ChevronLeft, Loader2, TriangleAlert, CircleCheck, ShoppingCart, TrendingUp, Wallet, Hourglass } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { NAVY, AMBER, fmt, parseEssence, Header, WIDE } from "./mobileUi";
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

function Section({ title, children, empty, count, full }) {
  return (
    <section className={`bg-white border-[1.5px] border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2 ${full ? "lg:group-[.wide]/w:col-span-2" : ""}`}>
      <h2 className="font-bold text-[16px] flex items-center gap-2">
        <span className="flex-1">{title}</span>
        {count > 0 && <span className="text-xs font-semibold bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{count}</span>}
      </h2>
      {empty ? <div className="text-sm text-slate-400">{empty}</div> : children}
    </section>
  );
}
// אריח מספר בראש הדוח
function Kpi({ icon: Icon, label, value, sub, tone = "plain", onClick }) {
  const tones = {
    dark: "text-white border-transparent",
    warn: "bg-amber-50 border-amber-300 text-amber-950",
    plain: "bg-white border-slate-200",
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`rounded-2xl border-[1.5px] p-3.5 flex flex-col gap-1 text-right ${tones[tone]}`} style={tone === "dark" ? { background: NAVY } : {}}>
      <div className={`flex items-center gap-1.5 text-[13px] ${tone === "dark" ? "text-slate-300" : "text-slate-500"}`}><Icon size={15} /> {label}</div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      {sub && <div className={`text-xs ${tone === "dark" ? "text-slate-300" : "text-slate-500"}`}>{sub}</div>}
    </Tag>
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
      <div className="grid grid-cols-[48px_1fr_48px] gap-2 items-center lg:group-[.wide]/w:max-w-md">
        <button aria-label="יום קודם" onClick={() => setDay(addDays(day, -1))} className="h-11 rounded-xl bg-white border-[1.5px] border-slate-300 hover:bg-slate-50 transition flex items-center justify-center"><ChevronRight size={20} /></button>
        <button onClick={() => setDay(yesterday)} className="h-11 rounded-xl bg-white border-[1.5px] border-slate-300 text-sm font-semibold">{day === yesterday ? "אתמול" : day === today ? "היום (עד עכשיו)" : "חזרה לאתמול"}</button>
        <button aria-label="יום הבא" disabled={day >= today} onClick={() => setDay(addDays(day, 1))} className="h-11 rounded-xl bg-white border-[1.5px] border-slate-300 hover:bg-slate-50 transition flex items-center justify-center disabled:opacity-40"><ChevronLeft size={20} /></button>
      </div>

      {error && <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2.5 text-sm"><TriangleAlert size={16} /> {error}</div>}
      {!r && !error && <div className="flex items-center justify-center gap-2 text-slate-500 py-16"><Loader2 className="animate-spin" size={18} /> טוען...</div>}

      {r && (<>
        <div className="grid grid-cols-2 gap-3 lg:group-[.wide]/w:grid-cols-4">
          <Kpi icon={ShoppingCart} tone="dark" label="מכירות" value={fmt(Math.round(s.total || 0))} sub={`${s.count || 0} מכירות`} />
          <Kpi icon={TrendingUp} label="רווח משוער" value={fmt(Math.round(s.profit || 0))} sub={`מכירות לפני מע״מ ${fmt(Math.round(s.ex_vat || 0))}`} />
          <Kpi icon={Wallet} tone={Number(s.unpaid_count) > 0 ? "warn" : "plain"} label="לא שולם" value={fmt(Math.round(s.unpaid_total || 0))} sub={Number(s.unpaid_count) > 0 ? `${s.unpaid_count} מכירות` : "הכול שולם"} />
          <Kpi icon={Hourglass} tone={pendingTotal > 0 ? "warn" : "plain"} label="מחכים לאישור" value={pendingTotal}
            sub={pendingTotal > 0 ? [pend.vehicle > 0 && `${pend.vehicle} רכב`, pend.repacks > 0 && `${pend.repacks} מזיגה`, pend.waste > 0 && `${pend.waste} פחת`, pend.counts > 0 && "ספירה"].filter(Boolean).join(" · ") : "אין ממתינים"} />
        </div>

        {exceptions.length > 0 && (
          <section className="bg-amber-50 border-[1.5px] border-amber-300 rounded-2xl p-3.5 flex flex-col gap-1.5">
            <h2 className="font-bold text-[16px] flex items-center gap-2 text-amber-950"><TriangleAlert size={18} className="text-amber-600" /> חריגות לבדיקה <span className="text-xs font-semibold bg-amber-200 rounded-full px-2 py-0.5">{exceptions.length}</span></h2>
            {exceptions.map((t, i) => <div key={i} className="text-sm text-amber-950 flex gap-2"><span className="text-amber-500">•</span><span>{t}</span></div>)}
          </section>
        )}

        <div className={WIDE}>

        <Section title="מכירות לפי מוכר" count={(s.by_seller || []).length} empty={(s.by_seller || []).length ? null : "לא היו מכירות"}>
          {(s.by_seller || []).map((x) => (
            <Row key={x.name} a={`${x.name} · ${x.count} מכירות${Number(x.from_vehicle) ? ` (${x.from_vehicle} מהרכב)` : ""}`} b={`${fmt(x.total)} · רווח ${fmt(x.profit)}`} />
          ))}
        </Section>

        {(s.list || []).length > 0 && (
          <Section title="כל המכירות" count={s.list.length}>
            {s.list.map((x) => (
              <div key={x.num} className="flex justify-between gap-2 text-sm border-b border-slate-100 last:border-0 pb-1.5">
                <span className="min-w-0 truncate">{x.customer} · {x.seller}{x.from_vehicle ? " · מהרכב" : ""}{x.vat === 0 ? " · ללא מע\"מ" : ""}</span>
                <span className="font-semibold shrink-0">{fmt(x.total)}{x.paid ? "" : <span className="text-amber-700"> · לא שולם</span>}</span>
              </div>
            ))}
          </Section>
        )}

        <Section title="מזיגות" count={(r.repacks || []).length} empty={(r.repacks || []).length || r.repacks_desktop ? null : "לא היו מזיגות"}>
          {(r.repacks || []).map((x) => (
            <Row key={x.tag} a={`${x.scent} · ${x.by}${x.status === "pending" ? " · ממתין" : x.status === "rejected" ? " · נדחה" : ""}`} b={`${q(x.in_kg)} ← ${q(x.out_kg)} ק"ג`} />
          ))}
          {Number(r.repacks_desktop) > 0 && <div className="text-sm text-slate-600">ועוד {r.repacks_desktop} מזיגות שנרשמו במחשב</div>}
        </Section>

        <Section title="רכב" count={(r.vehicle || []).length} empty={(r.vehicle || []).length ? null : "לא היו העמסות או החזרות"}>
          {(r.vehicle || []).map((x) => (
            <div key={x.tag} className="text-sm">
              <span className="font-semibold">{x.kind === "load" ? "העמסה לרכב" : "החזרה למחסן"}</span>
              <span className="text-slate-600"> · {x.by} · {x.status === "approved" ? `אושר ע"י ${x.decided_by}` : x.status === "pending" ? "ממתין" : x.status === "rejected" ? "נדחה" : "בוטל"}</span>
              <div className="text-slate-700">{(x.lines || []).map((l) => `${q(l.qty)} ${short(l.name)}`).join(", ")}</div>
            </div>
          ))}
        </Section>

        <Section title="דוגמאות ופחת" count={(r.waste || []).length} empty={(r.waste || []).length ? null : "לא היו"}>
          {(r.waste || []).map((x) => (
            <Row key={x.tag} a={`${reasonLabel(x.reason)}${x.customer ? `: ${x.customer}` : ""} · ${x.by}${x.status === "pending" ? " · ממתין" : x.status === "rejected" ? " · נדחה" : ""} – ${(x.lines || []).map((l) => `${q(l.qty)} ${short(l.name)}`).join(", ")}`} b={fmt(x.value)} />
          ))}
        </Section>

        <Section title="כל הגריעות מהמלאי" count={(r.writeoffs || []).length} empty={(r.writeoffs || []).length ? null : "לא היו גריעות"}>
          {(r.writeoffs || []).map((x, i) => (
            <Row key={i} a={`${q(x.qty)} ${short(x.item)}${x.note ? ` – ${x.note}` : ""}`} b={fmt(x.value)} />
          ))}
        </Section>

        <Section title="צריך למזוג" count={(r.to_pour || []).length} empty={(r.to_pour || []).length ? null : "המדפים מלאים"}>
          <div className="flex flex-wrap gap-1.5">{(r.to_pour || []).map((x) => <span key={x.scent + x.unit} className="text-[13px] bg-slate-100 rounded-lg px-2 py-1">{x.scent} {SIZE_LABEL[x.unit] || x.unit}</span>)}</div>
        </Section>

        <Section title="מלאי נמוך (מתחת לסף)" count={(r.low_stock || []).length} empty={(r.low_stock || []).length ? null : "אין"}>
          {(r.low_stock || []).map((x) => <Row key={x.item} a={short(x.item)} b={`${q(x.qty)} (סף ${q(x.min)})`} />)}
        </Section>
        </div>

        {exceptions.length === 0 && pendingTotal === 0 && (
          <div className="flex items-center gap-2 text-green-800 text-sm justify-center py-2"><CircleCheck size={18} /> יום נקי – בלי חריגות ובלי ממתינים</div>
        )}
      </>)}
    </div>
  </>);
}
