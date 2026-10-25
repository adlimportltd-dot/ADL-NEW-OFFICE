import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Search, Plus, Minus, Check, Loader2, CircleCheck, TriangleAlert, X, ChevronDown, ChevronUp, ClipboardList, Truck, Gift, Droplets } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { NAVY, AMBER, fmt, norm, parseEssence, Header, BottomBar, bigBtn, WIDE, SectionTitle } from "./mobileUi";
import { linesText } from "./MobileVehicle";
import { reasonLabel } from "./MobileWaste";
import VoiceAssist, { VoiceQuestions } from "./VoiceAssist";

// ============================================================
// מסכי מחסן בטלפון:
// 1) מזיגה ופירוק – כולם. השרת (mobile_repack) בודק מלאי ומאזן ק"ג; חריגה של נתי ממתינה לאישור.
// 2) ספירה שבועית עיוורת – הסופר לא רואה מה רשום (count_sheet / submit_stock_count).
// 3) אישור ספירה – מנהל שלא ספר (stock_count_review / approve_stock_count).
// 4) לאישור – מזיגות חריגות של נתי + ספירה שממתינה (decide_repack).
// ============================================================

const UNIT_LABEL = { '25 ק"ג': "חבית 25", '5 ק"ג': "גלון 5", '1 ק"ג': '1 ק"ג', 'חצי ק"ג': "חצי", 'רבע ק"ג': "רבע" };
const UNIT_KG = { '25 ק"ג': 25, '5 ק"ג': 5, '1 ק"ג': 1, 'חצי ק"ג': 0.5, 'רבע ק"ג': 0.25 };
const OPEN_UNITS = ['25 ק"ג', '5 ק"ג', '1 ק"ג', 'חצי ק"ג']; // אפשר לפתוח גם בקבוק 1 ק"ג או חצי
const OUT_UNITS = ['5 ק"ג', '1 ק"ג', 'חצי ק"ג', 'רבע ק"ג'];
const TX_LABEL = { receive: "קבלה", install: "מכירה", repack: "מזיגה", writeoff: "גריעה", transfer: "העברה", return: "החזרה" };
const kg = (n) => Number(n || 0).toLocaleString("he-IL", { maximumFractionDigits: 2 });
const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; };

function Loading() {
  return <div className="flex-1 flex items-center justify-center gap-2 text-slate-500 py-16"><Loader2 className="animate-spin" size={18} /> טוען...</div>;
}

function ErrorBox({ children }) {
  if (!children) return null;
  return <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2.5 text-sm"><TriangleAlert size={16} className="shrink-0 mt-0.5" /> <span>{children}</span></div>;
}

// כפתורי + / − עם שדה להקלדה ישירה (לכמויות גדולות כמו 40 חצאים)
function Stepper({ value, onChange, max, id, label, placeholder = "0" }) {
  const n = toInt(value);
  const atMax = max != null && n >= max;
  return (
    <div className="flex items-center gap-1.5">
      <button aria-label={`הפחת ${label || ""}`} onClick={() => onChange(String(Math.max(0, n - 1)))} disabled={n === 0} className="w-11 h-11 rounded-xl border-[1.5px] border-slate-300 bg-white flex items-center justify-center disabled:opacity-40"><Minus size={18} /></button>
      <input
        id={id} aria-label={label} inputMode="numeric" value={value ?? ""} placeholder={placeholder}
        onChange={(e) => { const raw = e.target.value.replace(/[^\d]/g, ""); onChange(max != null && raw !== "" && Number(raw) > max ? String(max) : raw); }}
        className="w-14 h-11 text-center text-lg font-bold border-[1.5px] border-slate-300 rounded-xl bg-white"
      />
      <button aria-label={`הוסף ${label || ""}`} onClick={() => onChange(String(n + 1))} disabled={atMax} className="w-11 h-11 rounded-xl flex items-center justify-center disabled:bg-slate-200 disabled:text-slate-500" style={atMax ? {} : { background: NAVY, color: "#fff" }}><Plus size={18} /></button>
    </div>
  );
}

// ============================================================
// 1) מזיגה ופירוק
// ============================================================
export function RepackScreen({ userName, isAdmin, onBack }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scent, setScent] = useState(null);
  const [openQ, setOpenQ] = useState({});
  const [outQ, setOutQ] = useState({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [recent, setRecent] = useState([]);

  const load = useCallback(async () => {
    const [cat, rec] = await Promise.all([
      supabase.rpc("mobile_catalog"),
      supabase.from("repack_log").select("id,tag,scent,in_kg,out_kg,status,created_by_name,created_at,decided_by_name,decision_note").order("created_at", { ascending: false }).limit(8),
    ]);
    if (cat.error) setError(cat.error.message); else setCatalog(cat.data || []);
    setRecent(rec.error ? [] : rec.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const scents = useMemo(() => {
    const map = {};
    catalog.forEach((i) => {
      if (i.category !== "consumable" || !UNIT_KG[i.unit]) return;
      const p = parseEssence(i.name);
      if (!p || /בדיקה/.test(i.name)) return;
      if (!map[p.scent]) map[p.scent] = { scent: p.scent, aliases: "", sizes: {} };
      map[p.scent].sizes[i.unit] = i;
      if (i.aliases) map[p.scent].aliases = i.aliases;
    });
    return Object.values(map)
      .map((s) => ({ ...s, openable: OPEN_UNITS.some((u) => Number(s.sizes[u]?.stock || 0) > 0) }))
      .filter((s) => OPEN_UNITS.some((u) => s.sizes[u]))
      .sort((a, b) => (a.openable === b.openable ? a.scent.localeCompare(b.scent, "he") : a.openable ? -1 : 1));
  }, [catalog]);

  const current = scent ? scents.find((s) => s.scent === scent) : null;
  const openRows = current ? OPEN_UNITS.filter((u) => current.sizes[u]).map((u) => current.sizes[u]) : [];
  // מה שיוצא חייב להיות קטן ממה שנפתח (לפני שבוחרים – כמו גלון: 1 ק"ג / חצי / רבע)
  const maxOpenKg = openRows.reduce((m, i) => (toInt(openQ[i.id]) > 0 ? Math.max(m, UNIT_KG[i.unit]) : m), 0);
  const outRows = current ? OUT_UNITS.filter((u) => current.sizes[u] && UNIT_KG[u] < (maxOpenKg || 5) && !(toInt(openQ[current.sizes[u].id]) > 0)).map((u) => current.sizes[u]) : [];
  const inKg = openRows.reduce((s, i) => s + toInt(openQ[i.id]) * UNIT_KG[i.unit], 0);
  const outKg = outRows.reduce((s, i) => s + toInt(outQ[i.id]) * UNIT_KG[i.unit], 0);
  const pct = inKg > 0 ? Math.round((outKg / inKg - 1) * 100) : 0;
  const outOfRange = inKg > 0 && outKg > 0 && Math.abs(outKg / inKg - 1) > 0.1;
  const [dup, setDup] = useState(null); // מזיגה דומה נרשמה לאחרונה – לוודא שזו לא כפילות
  // עוזר הרישום: טיוטת מזיגה מהקול/טקסט. כמה מזיגות במשפט אחד – אחת אחרי השנייה
  const [voiceDraft, setVoiceDraft] = useState(null);
  const [voiceQueue, setVoiceQueue] = useState([]);
  const fillRepack = (r, draft) => {
    const firstOpen = r.open[0]?.item_id;
    const sc = scents.find((x) => Object.values(x.sizes).some((i) => i.id === firstOpen));
    if (!sc) { setError("העוזר בחר ריח שלא נמצא ברשימה – בחרו ידנית"); return; }
    setScent(sc.scent); setReason(""); setNote(""); setError(""); setDone(null); setDup(null);
    setOpenQ(Object.fromEntries(r.open.map((l) => [l.item_id, String(l.qty)])));
    setOutQ(Object.fromEntries(r.out.map((l) => [l.item_id, String(l.qty)])));
    setVoiceDraft(draft);
  };
  const applyRepackDraft = (d) => {
    const list = d.repacks || [];
    if (!list.length) { setError("העוזר לא זיהה מזיגה – נסו לנסח שוב או בחרו ידנית"); return; }
    setVoiceQueue(list.slice(1).map((r) => ({ r, d })));
    fillRepack(list[0], d);
  };

  const pick = (s) => { setScent(s.scent); setOpenQ({}); setOutQ({}); setReason(""); setNote(""); setError(""); setDone(null); setDup(null); };
  const clear = () => { setScent(null); setOpenQ({}); setOutQ({}); setReason(""); setNote(""); setError(""); setDup(null); };

  const save = async (confirmDup = false) => {
    setError(""); setDup(null);

    const consumed = openRows.filter((i) => toInt(openQ[i.id]) > 0).map((i) => ({ item_id: i.id, qty: toInt(openQ[i.id]) }));
    const produced = outRows.filter((i) => toInt(outQ[i.id]) > 0).map((i) => ({ item_id: i.id, qty: toInt(outQ[i.id]) }));
    if (!consumed.length) { setError("יש לבחור מה פותחים – חבית או גלון"); return; }
    if (!produced.length) { setError("יש לרשום מה יצא מהמזיגה"); return; }
    if (outOfRange && !reason.trim()) { setError("ההפרש מעל 10% – יש לכתוב סיבה"); return; }
    setBusy(true);
    try {
      const noteToSend = confirmDup ? `[כפילות מאושרת] ${note || ""}`.trim() : (note || null);
      const { data, error: e } = await supabase.rpc("mobile_repack", { p_consumed: consumed, p_produced: produced, p_reason: reason || null, p_note: noteToSend });
      if (e) throw e;
      setDone(data);
      clear(); setVoiceDraft(null);
      setLoading(true);
      await load();
    } catch (e) {
      const m = String(e.message || "");
      if (m.startsWith("DUP|")) { const [, tag, mins, by] = m.split("|"); setDup({ tag, mins, by }); }
      else setError(m || "שגיאה בשמירה");
    } finally { setBusy(false); }
  };

  // ---------- רשימת ריחות ----------
  if (!current) {
    const q = norm(query);
    const shown = scents.filter((s) => !q || norm(s.scent).includes(q) || norm(s.aliases).includes(q));
    return (<>
      <Header title="מזיגה ופירוק" subtitle={`${userName} · מחסן מרכזי`} onBack={onBack} />
      <div className="flex-1 px-4 py-3.5 flex flex-col gap-3">
        <VoiceAssist mode="repack" title="ספר מה מזגת – והמזיגה תתמלא לבד" onDraft={applyRepackDraft} />
        {voiceQueue.length > 0 && (
          <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-300 rounded-2xl px-3.5 py-2.5">
            <span className="text-sm text-amber-950 font-semibold">מההקלטה נשארו עוד {voiceQueue.length} מזיגות</span>
            <button onClick={() => { const [first, ...rest] = voiceQueue; setVoiceQueue(rest); fillRepack(first.r, first.d); }} className="h-10 px-3 rounded-xl bg-slate-900 text-white text-sm font-semibold">למלא את הבאה</button>
          </div>
        )}
        {done && done.status === "pending" && (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-2xl px-3.5 py-3">
            <TriangleAlert size={22} className="text-amber-700 shrink-0" />
            <div className="text-sm text-amber-900">
              <div className="font-bold">נשלח לאישור · {done.tag}</div>
              <div>{done.scent}: נפתחו {kg(done.in_kg)} ק"ג, יצאו {kg(done.out_kg)} ק"ג. המלאי יתעדכן אחרי שליאור או אלירן יאשרו.</div>
            </div>
          </div>
        )}
        {done && done.status !== "pending" && (
          <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-2xl px-3.5 py-3">
            <CircleCheck size={22} className="text-green-700 shrink-0" />
            <div className="text-sm">
              <div className="font-bold text-green-900">נשמר · {done.tag}</div>
              <div className="text-green-900">{done.scent}: נפתחו {kg(done.in_kg)} ק"ג, יצאו {kg(done.out_kg)} ק"ג. המלאי עודכן.</div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-slate-300 rounded-2xl px-3.5 h-[50px]">
          <Search size={20} className="text-slate-500" />
          <label htmlFor="rq" className="sr-only">חיפוש ריח</label>
          <input id="rq" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="איזה ריח מוזגים?" className="flex-1 bg-transparent outline-none text-base" />
          {query && <button aria-label="ניקוי" onClick={() => setQuery("")}><X size={18} className="text-slate-400" /></button>}
        </div>
        <ErrorBox>{error}</ErrorBox>
        {loading ? <Loading /> : <div className={WIDE}>{shown.map((s) => (
          <button key={s.scent} disabled={!s.openable} onClick={() => pick(s)} className={`flex items-center gap-3 bg-white border-[1.5px] rounded-2xl px-3.5 py-3 min-h-[64px] text-right transition ${s.openable ? "border-slate-200 hover:border-amber-400 hover:shadow-sm active:border-amber-500" : "border-dashed border-slate-300 opacity-60"}`}>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[17px] truncate">{s.scent}</div>
              <div className="text-xs text-slate-600">
                {s.openable ? OPEN_UNITS.filter((u) => Number(s.sizes[u]?.stock || 0) > 0).map((u) => `${UNIT_LABEL[u]}: ${kg(s.sizes[u].stock)}`).join(" · ") : "אין מה לפתוח"}
              </div>
            </div>
            {s.openable && <ChevronDown size={18} className="text-slate-400 rotate-90" />}
          </button>
        ))}</div>}
        {!loading && shown.length === 0 && <div className="text-center text-slate-500 py-6">לא נמצא</div>}
        {!loading && !q && recent.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <SectionTitle>מזיגות אחרונות</SectionTitle>
            <div className="grid grid-cols-1 gap-2 lg:group-[.wide]/w:grid-cols-2">{recent.map((r) => <RepackRow key={r.id} r={r} />)}</div>
          </div>
        )}
      </div>
    </>);
  }

  // ---------- מזיגה של ריח אחד ----------
  return (<>
    <Header title={current.scent} subtitle="מה פותחים ומה יצא" onBack={() => { clear(); setVoiceDraft(null); }} />
    <div className="flex-1 px-4 py-3.5 flex flex-col gap-3">
      {voiceDraft && <VoiceQuestions draft={voiceDraft} onClose={() => setVoiceDraft(null)} />}
      {!isAdmin && <div className="text-[13px] text-slate-600 bg-slate-100 rounded-xl px-3 py-2">המזיגה תישלח לאישור של ליאור או אלירן, והמלאי יתעדכן אחרי האישור.</div>}
      <div className={WIDE + " items-start"}>
      <div className="bg-white border-[1.5px] border-slate-200 rounded-2xl p-3.5 flex flex-col gap-3">
        <div className="font-bold flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center">1</span> מה פותחים?</div>
        {openRows.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold">{UNIT_LABEL[i.unit]}</div>
              <div className="text-xs text-slate-600">במחסן {kg(i.stock)}</div>
            </div>
            {Number(i.stock) > 0
              ? <Stepper id={`o-${i.id}`} label={UNIT_LABEL[i.unit]} value={openQ[i.id]} max={Math.floor(Number(i.stock))} onChange={(v) => setOpenQ({ ...openQ, [i.id]: v })} />
              : <span className="text-sm text-slate-500">אין במלאי</span>}
          </div>
        ))}
      </div>

      <div className="bg-white border-[1.5px] border-slate-200 rounded-2xl p-3.5 flex flex-col gap-3">
        <div className="font-bold flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center">2</span> מה יצא?</div>
        {outRows.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-2">
            <div className="font-semibold">{UNIT_LABEL[i.unit]}</div>
            <Stepper id={`p-${i.id}`} label={UNIT_LABEL[i.unit]} value={outQ[i.id]} onChange={(v) => setOutQ({ ...outQ, [i.id]: v })} />
          </div>
        ))}
        <div className="text-xs text-slate-500">יוצא רק מה שקטן ממה שנפתח: מחבית – גם גלון, מבקבוק 1 ק"ג – חצי ורבע, מחצי – רבע.</div>
      </div>
      </div>

      {inKg > 0 && (
        <div className={`rounded-2xl p-3.5 flex flex-col gap-1 border-[1.5px] ${outOfRange ? "bg-amber-50 border-amber-400" : "bg-slate-100 border-slate-200"}`}>
          <div className="flex justify-between"><span className="text-slate-600">נפתח</span><span className="font-bold">{kg(inKg)} ק"ג</span></div>
          <div className="flex justify-between"><span className="text-slate-600">יצא</span><span className="font-bold">{kg(outKg)} ק"ג</span></div>
          {outKg < inKg && (
            <div className="flex justify-between"><span className="text-slate-600">נשאר לחלק</span><span className="font-bold">{kg(inKg - outKg)} ק"ג</span></div>
          )}
          {outKg > 0 && (
            <div className="flex justify-between border-t border-slate-300 pt-1 mt-1">
              <span className="text-slate-600">הפרש</span>
              <span className={`font-bold ${outOfRange ? "text-amber-800" : "text-slate-800"}`}>{pct > 0 ? "+" : ""}{pct}%{outOfRange ? " – מעל 10%" : ""}</span>
            </div>
          )}
        </div>
      )}

      {outOfRange && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reason" className="text-sm font-semibold text-amber-900">ההפרש מעל 10%. מה הסיבה? (חובה)</label>
          {!isAdmin && <div className="text-xs text-amber-900">המזיגה תישלח לאישור של ליאור או אלירן, והמלאי יתעדכן אחרי האישור.</div>}
          <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="למשל: נשפך, בקבוקים מולאו פחות" className="h-12 border-[1.5px] border-amber-400 rounded-xl px-3 bg-white" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="rnote" className="text-sm text-slate-600">הערה (לא חובה)</label>
        <input id="rnote" value={note} onChange={(e) => setNote(e.target.value)} className="h-12 border border-slate-300 rounded-xl px-3 bg-white" />
      </div>
      {dup && (
        <div className="bg-amber-50 border-[1.5px] border-amber-400 rounded-2xl p-3.5 flex flex-col gap-2.5">
          <div className="flex items-start gap-2 text-amber-950">
            <TriangleAlert size={20} className="shrink-0 mt-0.5 text-amber-700" />
            <span className="text-[15px]"><b>כבר נרשמה מזיגה של {current?.scent} לפני {dup.mins} דקות</b>{dup.by ? ` (${dup.by}, ${dup.tag})` : ` (${dup.tag})`}. זו באמת מזיגה נוספת, או שהיא כבר נרשמה?</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => save(true)} disabled={busy} className="h-12 rounded-xl bg-slate-900 text-white font-semibold">כן, מזיגה נוספת</button>
            <button onClick={clear} className="h-12 rounded-xl bg-white border-[1.5px] border-slate-300 font-semibold">לא – כבר נרשמה</button>
          </div>
        </div>
      )}
      <ErrorBox>{error}</ErrorBox>
    </div>
    <BottomBar hint={inKg === 0 ? "בחר מה פותחים" : outKg === 0 ? "רשום מה יצא מהמזיגה" : outOfRange && !reason.trim() ? "כתוב למה ההפרש מעל 10%" : null}>
      <button disabled={busy || inKg === 0 || outKg === 0} onClick={() => save(false)} className={bigBtn} style={{ background: AMBER, color: NAVY }}>
        {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={20} />} {!isAdmin ? "שליחה לאישור" : "שמירת המזיגה"}
      </button>
    </BottomBar>
  </>);
}

// ============================================================
// 2) ספירה שבועית עיוורת
// ============================================================
const DRAFT_KEY = "adl_weekly_count_draft";
const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") || {}; } catch (e) { return {}; } };
const writeDraft = (v) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch (e) {} };
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} };

export function WeeklyCount({ userName, onBack }) {
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState("");
  const [counts, setCounts] = useState(readDraft);
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [step, setStep] = useState("count"); // count | confirm | sent
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error: e } = await supabase.rpc("count_sheet");
      if (e) setError(e.message); else setSheet(data);
    })();
  }, []);

  const setCount = (id, v) => { const next = { ...counts, [id]: v }; setCounts(next); writeDraft(next); };
  // מכשירים בקרטונים: סופרים קרטונים סגורים + יחידות פתוחות, והסך מחושב לבד
  const setPart = (id, part, v, perCarton) => {
    const next = { ...counts, [`${part}:${id}`]: v };
    const c = next[`c:${id}`], l = next[`l:${id}`];
    next[id] = (c === undefined || c === "") && (l === undefined || l === "") ? "" : String(toInt(c) * perCarton + toInt(l));
    setCounts(next); writeDraft(next);
  };
  const setNone = (r) => (r.per_carton
    ? (() => { const next = { ...counts, [r.item_id]: "0", [`c:${r.item_id}`]: "0", [`l:${r.item_id}`]: "0" }; setCounts(next); writeDraft(next); })()
    : setCount(r.item_id, "0"));

  const groups = useMemo(() => {
    const map = {};
    (sheet?.items || []).forEach((r) => {
      const key = `${r.section || "scent"}|${r.scent}`;
      if (!map[key]) map[key] = { key, section: r.section || "scent", scent: r.scent, aliases: r.aliases || "", rows: [] };
      map[key].rows.push(r);
    });
    return Object.values(map);
  }, [sheet]);
  const total = sheet?.items?.length || 0;
  const filled = (sheet?.items || []).filter((r) => counts[r.item_id] !== undefined && counts[r.item_id] !== "").length;

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const lines = sheet.items.map((r) => ({ item_id: r.item_id, qty: toInt(counts[r.item_id]) }));
      const { error: e } = await supabase.rpc("submit_stock_count", { p_lines: lines, p_note: note || null });
      if (e) throw e;
      clearDraft();
      setStep("sent");
    } catch (e) { setError(e.message || "שגיאה בשליחה"); } finally { setBusy(false); }
  };

  if (!sheet && !error) return (<><Header title="ספירה שבועית" onBack={onBack} /><Loading /></>);
  if (!sheet) return (<><Header title="ספירה שבועית" onBack={onBack} /><div className="p-4"><ErrorBox>{error}</ErrorBox></div></>);

  if (sheet.pending && step !== "sent") {
    const at = new Date(sheet.pending.at).toLocaleString("he-IL", { weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
    return (<>
      <Header title="ספירה שבועית" onBack={onBack} />
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <TriangleAlert size={40} className="text-amber-600" />
        <div className="text-xl font-bold">יש ספירה שממתינה לאישור</div>
        <div className="text-slate-700">{sheet.pending.by} ספר ב{at}. אפשר לספור שוב אחרי שמנהל יאשר או יבטל אותה.</div>
        <button onClick={onBack} className={bigBtn + " mt-2"} style={{ background: NAVY, color: "#fff" }}>חזרה</button>
      </div>
    </>);
  }

  if (step === "sent") return (<>
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center"><CircleCheck size={52} className="text-green-700" /></div>
      <div className="text-[26px] font-bold">הספירה נשלחה</div>
      <div className="text-[15px] text-slate-700">המלאי יתעדכן אחרי שמנהל יעבור על הפערים ויאשר.</div>
    </div>
    <div className="px-4 pb-6"><button onClick={onBack} className={bigBtn} style={{ background: AMBER, color: NAVY }}>סיום</button></div>
  </>);

  if (step === "confirm") return (<>
    <Header title="שליחת הספירה" onBack={() => setStep("count")} />
    <div className="flex-1 px-4 py-4 flex flex-col gap-3">
      <div className="bg-white border-[1.5px] border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2">
        <div className="flex justify-between"><span className="text-slate-600">סופר</span><span className="font-semibold">{userName}</span></div>
        <div className="flex justify-between"><span className="text-slate-600">שורות שנספרו</span><span className="font-semibold">{filled} מתוך {total}</span></div>
      </div>
      <div className="text-sm text-slate-700">אחרי השליחה אי אפשר לשנות את הספירה. אם משהו לא בטוח – חזור וספור שוב את השורה.</div>
      <label htmlFor="cnote" className="text-sm text-slate-600">הערה (לא חובה)</label>
      <input id="cnote" value={note} onChange={(e) => setNote(e.target.value)} className="h-12 border border-slate-300 rounded-xl px-3 bg-white" />
      <ErrorBox>{error}</ErrorBox>
    </div>
    <BottomBar>
      <button disabled={busy} onClick={submit} className={bigBtn} style={{ background: AMBER, color: NAVY }}>
        {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={20} />} שליחה לאישור
      </button>
    </BottomBar>
  </>);

  const q = norm(query);
  const shown = groups.filter((g) => (!q || norm(g.scent).includes(q) || norm(g.aliases).includes(q))
    && (!onlyMissing || g.rows.some((r) => counts[r.item_id] === undefined || counts[r.item_id] === "")));

  return (<>
    <Header title="ספירה שבועית" subtitle={`${userName} · מחסן מרכזי`} onBack={onBack} />
    <div className="flex-1 px-4 py-3.5 flex flex-col gap-3">
      <div className="bg-slate-100 rounded-2xl px-3.5 py-3 text-sm text-slate-700">
        סופרים את <b>כל המחסן</b>: ריחות בכל הגדלים (חבית, גלון, 1 ק"ג, חצי, רבע) ו<b>מכשירים</b> (במכשירים בקרטון: סופרים קרטונים סגורים + יחידות פתוחות, והסך מחושב לבד). המסך לא מראה מה רשום במערכת – רושמים רק מה שרואים. אין בכלל? לוחצים "אין".
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-sm"><span className="text-slate-600">נספרו</span><span className="font-bold">{filled} מתוך {total}</span></div>
        <div className="h-2 rounded bg-slate-200 overflow-hidden"><div className="h-full rounded transition-all duration-300" style={{ width: `${total ? (filled / total) * 100 : 0}%`, background: AMBER }} /></div>
      </div>
      <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-slate-300 rounded-2xl px-3.5 h-[50px]">
        <Search size={20} className="text-slate-500" />
        <label htmlFor="cq" className="sr-only">חיפוש ריח או מכשיר</label>
        <input id="cq" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חפש ריח או מכשיר" className="flex-1 bg-transparent outline-none text-base" />
        {query && <button aria-label="ניקוי" onClick={() => setQuery("")}><X size={18} className="text-slate-400" /></button>}
      </div>
      <button onClick={() => setOnlyMissing(!onlyMissing)} className={`h-11 rounded-xl text-sm font-semibold ${onlyMissing ? "bg-slate-900 text-white" : "bg-white border-[1.5px] border-slate-300"}`}>
        {onlyMissing ? "מוצג: רק מה שעוד לא נספר" : "הצג רק מה שעוד לא נספר"}
      </button>
      <div className={WIDE}>{shown.map((g, gi) => {
        const complete = g.rows.every((r) => counts[r.item_id] !== undefined && counts[r.item_id] !== "");
        const sectionStart = gi === 0 || shown[gi - 1].section !== g.section;
        return (<React.Fragment key={g.key}>
          {sectionStart && <div className="col-span-full text-base font-bold text-slate-800 pt-1">{g.section === "device" ? "מכשירים" : "ריחות"}</div>}
          <div className={`rounded-2xl p-3.5 flex flex-col gap-2.5 border-[1.5px] transition ${complete ? "bg-green-50/40 border-green-500" : "bg-white border-slate-200"}`}>
            <div className="flex justify-between items-baseline">
              <span className="text-lg font-bold">{g.scent}</span>
              {g.aliases ? <span className="text-xs text-slate-600">נקרא גם: {g.aliases}</span> : complete ? <Check size={18} className="text-green-600" /> : null}
            </div>
            {g.rows.map((r) => r.per_carton ? (
              <div key={r.item_id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm leading-tight">קרטונים סגורים<br /><span className="text-xs text-slate-500 font-normal">{r.per_carton} בקרטון</span></span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setNone(r)} className={`h-11 px-3 rounded-xl text-sm border-[1.5px] ${counts[r.item_id] === "0" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300"}`}>אין</button>
                    <Stepper id={`cc-${r.item_id}`} label={`${g.scent} קרטונים`} value={counts[`c:${r.item_id}`]} placeholder="?" onChange={(v) => setPart(r.item_id, "c", v, r.per_carton)} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm">יחידות פתוחות</span>
                  <Stepper id={`cl-${r.item_id}`} label={`${g.scent} יחידות פתוחות`} value={counts[`l:${r.item_id}`]} placeholder="?" onChange={(v) => setPart(r.item_id, "l", v, r.per_carton)} />
                </div>
                {counts[r.item_id] !== undefined && counts[r.item_id] !== "" && (
                  <div className="text-sm text-slate-700 text-left">סה"כ: <b>{counts[r.item_id]}</b> יחידות</div>
                )}
              </div>
            ) : (
              <div key={r.item_id} className="flex items-center justify-between gap-2">
                <span className="font-semibold w-16">{g.section === "device" ? "יחידות" : (UNIT_LABEL[r.unit] || r.unit)}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setNone(r)} className={`h-11 px-3 rounded-xl text-sm border-[1.5px] ${counts[r.item_id] === "0" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300"}`}>אין</button>
                  <Stepper id={`c-${r.item_id}`} label={`${g.scent} ${g.section === "device" ? "" : (UNIT_LABEL[r.unit] || r.unit)}`} value={counts[r.item_id]} placeholder="?" onChange={(v) => setCount(r.item_id, v)} />
                </div>
              </div>
            ))}
          </div>
        </React.Fragment>);
      })}</div>
      {shown.length === 0 && <div className="text-center text-slate-500 py-6">{onlyMissing ? "הכול נספר" : "לא נמצא"}</div>}
    </div>
    <BottomBar>
      <button disabled={filled < total} onClick={() => { setError(""); setStep("confirm"); }} className={bigBtn} style={{ background: NAVY, color: "#fff" }}>
        {filled < total ? `נשארו ${total - filled} שורות לספור` : "סיימתי – לשליחה"}
      </button>
    </BottomBar>
  </>);
}

// ============================================================
// 3) אישור ספירה – מנהל בלבד
// ============================================================
export function CountReview({ onBack }) {
  const [rev, setRev] = useState(null);
  const [none, setNone] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);

  const loadReview = useCallback(async () => {
    try {
      const { data: list, error: e1 } = await supabase.from("stock_counts").select("id").eq("status", "submitted").order("submitted_at", { ascending: false }).limit(1);
      if (e1) throw e1;
      if (!list?.length) { setNone(true); return; }
      const { data, error: e2 } = await supabase.rpc("stock_count_review", { p_count_id: list[0].id });
      if (e2) throw e2;
      setRev(data);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { loadReview(); }, [loadReview]);

  // יציאה שנרשמה אחרי הספירה אבל קרתה לפניה – מקטינים את החוסר בשורה, כדי שלא ייגרע פעמיים
  const offsetLine = async (l, qty) => {
    setBusy(true); setError("");
    try {
      const { error: e } = await supabase.rpc("offset_count_line", { p_count_id: rev.count.id, p_item_id: l.item_id, p_qty: qty });
      if (e) throw e;
      await loadReview();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const approve = async () => {
    setBusy(true); setError("");
    try {
      const { error: e } = await supabase.rpc("approve_stock_count", { p_count_id: rev.count.id });
      if (e) throw e;
      setApproved(true);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!window.confirm("לבטל את הספירה? המלאי לא ישתנה, ואפשר יהיה לספור מחדש.")) return;
    setBusy(true); setError("");
    try {
      const { error: e } = await supabase.rpc("cancel_stock_count", { p_count_id: rev.count.id });
      if (e) throw e;
      onBack();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (approved) return (<>
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center"><CircleCheck size={52} className="text-green-700" /></div>
      <div className="text-[26px] font-bold">הספירה אושרה</div>
      <div className="text-[15px] text-slate-700">המלאי עודכן לפי מה שנספר, והפערים נשמרו בהיסטוריה.</div>
    </div>
    <div className="px-4 pb-6"><button onClick={onBack} className={bigBtn} style={{ background: AMBER, color: NAVY }}>סיום</button></div>
  </>);

  if (none) return (<><Header title="אישור ספירה" onBack={onBack} /><div className="text-center text-slate-600 py-16">אין ספירה שממתינה לאישור</div></>);
  if (!rev) return (<><Header title="אישור ספירה" onBack={onBack} />{error ? <div className="p-4"><ErrorBox>{error}</ErrorBox></div> : <Loading />}</>);

  const c = rev.count;
  const at = new Date(c.submitted_at).toLocaleString("he-IL", { weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  const since = new Date(rev.since).toLocaleDateString("he-IL");
  const neg = Number(rev.total_ils) < 0;

  return (<>
    <Header title="אישור ספירה" subtitle={`ספר: ${c.counted_by_name} · ${at}`} onBack={onBack} />
    <div className="flex-1 px-4 py-3.5 flex flex-col gap-3">
      <div className="bg-white border-[1.5px] border-slate-200 rounded-2xl p-3.5 flex flex-col gap-1.5">
        <div className="flex justify-between"><span className="text-slate-600">שורות שנספרו</span><span className="font-semibold">{rev.total_lines}</span></div>
        <div className="flex justify-between"><span className="text-slate-600">שורות עם פער</span><span className="font-semibold">{rev.lines.length}</span></div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1">
          <span className="text-slate-600">פער כולל</span>
          <span className={`font-bold ${neg ? "text-rose-700" : "text-slate-900"}`}>{kg(rev.total_kg)} ק"ג · {fmt(rev.total_ils)}</span>
        </div>
        {c.note && <div className="text-sm text-slate-700 pt-1">הערה: {c.note}</div>}
      </div>

      {rev.lines.length === 0 ? (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-2xl px-3.5 py-3 text-green-900 font-semibold"><CircleCheck size={20} /> הכול תואם – אין פערים</div>
      ) : (
        <div className="text-sm text-slate-600">לחיצה על שורה מראה את כל התנועות של הפריט מאז {since}.</div>
      )}

      {rev.lines.map((l) => {
        const isOpen = open[l.item_id];
        const minus = Number(l.diff) < 0;
        return (
          <div key={l.item_id} className={`bg-white rounded-2xl border-[1.5px] ${minus ? "border-rose-200" : "border-amber-200"}`}>
            <button onClick={() => setOpen({ ...open, [l.item_id]: !isOpen })} className="w-full p-3.5 flex items-center gap-2 text-right">
              <div className="flex-1 min-w-0">
                <div className="font-bold">{l.scent}{l.diff_kg == null ? "" : ` · ${UNIT_LABEL[l.unit] || l.unit}`}</div>
                <div className="text-[13px] text-slate-600">רשום {kg(l.system_qty)} · נספר {kg(l.counted_qty)}</div>
              </div>
              <div className="text-left">
                <div className={`font-bold ${minus ? "text-rose-700" : "text-amber-700"}`}>{Number(l.diff) > 0 ? "+" : ""}{kg(l.diff)}</div>
                <div className="text-xs text-slate-600">{l.diff_kg == null ? "" : `${kg(l.diff_kg)} ק"ג · `}{fmt(l.diff_ils)}</div>
              </div>
              {isOpen ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
            </button>
            {minus && Number(l.after_out) > 0 && (() => {
              const offer = Math.min(-Number(l.diff), Number(l.after_out));
              return (
                <div className="mx-3.5 mb-3 bg-amber-50 border border-amber-300 rounded-xl p-2.5 flex flex-col gap-2 text-amber-950">
                  <div className="text-[13px]"><b>שים לב:</b> אחרי הספירה נרשמה יציאה של {kg(l.after_out)} מהפריט הזה:</div>
                  {(l.after || []).map((m, i) => (
                    <div key={i} className="text-[12px] text-amber-900">· {new Date(m.at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })} – {TX_LABEL[m.type] || m.type} {kg(m.qty)}{m.note ? ` – ${m.note}` : ""}</div>
                  ))}
                  <div className="text-[13px]">אם הסחורה יצאה <b>לפני</b> הספירה ונרשמה רק אחריה – מקזזים, כדי שלא תיגרע פעמיים.</div>
                  <button disabled={busy} onClick={() => offsetLine(l, offer)} className="h-11 rounded-xl bg-slate-900 text-white font-semibold text-sm">יצא לפני הספירה – לקזז {kg(offer)}</button>
                </div>
              );
            })()}
            {isOpen && (
              <div className="border-t border-slate-100 px-3.5 py-2 flex flex-col gap-2">
                {(l.moves || []).length === 0 && <div className="text-sm text-slate-500 py-1">אין תנועות בתקופה הזאת</div>}
                {(l.moves || []).map((m, i) => (
                  <div key={i} className="text-[13px] flex gap-2">
                    <span className="text-slate-500 shrink-0 w-[74px]">{new Date(m.at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className={`font-bold shrink-0 w-10 ${Number(m.qty) < 0 ? "text-rose-700" : "text-green-700"}`}>{Number(m.qty) > 0 ? "+" : ""}{kg(m.qty)}</span>
                    <span className="text-slate-700">{TX_LABEL[m.type] || m.type}{m.note ? ` – ${m.note}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <ErrorBox>{error}</ErrorBox>
      {!rev.can_approve && <div className="text-sm bg-amber-50 text-amber-900 rounded-xl px-3 py-2">את הספירה הזאת ספרת בעצמך – מנהל אחר צריך לאשר אותה.</div>}
    </div>
    <BottomBar>
      <div className="flex flex-col gap-2">
        <button disabled={busy || !rev.can_approve} onClick={approve} className={bigBtn} style={{ background: AMBER, color: NAVY }}>
          {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={20} />} אישור ועדכון המלאי
        </button>
        <button disabled={busy} onClick={cancel} className="h-11 rounded-xl border border-slate-300 text-slate-700">ביטול הספירה</button>
      </div>
    </BottomBar>
  </>);
}

// שורה ברשימת מזיגות
const REPACK_STATUS = {
  done: { label: "נשמר", cls: "bg-green-100 text-green-800" },
  approved: { label: "אושר", cls: "bg-green-100 text-green-800" },
  pending: { label: "ממתין לאישור", cls: "bg-amber-100 text-amber-900" },
  rejected: { label: "נדחה", cls: "bg-rose-100 text-rose-800" },
};
function RepackRow({ r }) {
  const st = REPACK_STATUS[r.status] || REPACK_STATUS.done;
  const when = new Date(r.created_at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] truncate">{r.scent}</div>
        <div className="text-xs text-slate-600">{when} · {r.created_by_name} · {kg(r.in_kg)} ← {kg(r.out_kg)} ק"ג</div>
        {r.status === "rejected" && r.decision_note && <div className="text-xs text-rose-700">נדחה: {r.decision_note}</div>}
      </div>
      <span className={`text-xs font-semibold px-2 py-1 rounded-lg shrink-0 ${st.cls}`}>{st.label}</span>
    </div>
  );
}

// ============================================================
// 4) לאישור – ליאור / אלירן: מזיגות חריגות וספירה שבועית
// ============================================================
export function Approvals({ onBack, onOpenCount }) {
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState([]);
  const [moves, setMoves] = useState([]);
  const [wastes, setWastes] = useState([]);
  const [names, setNames] = useState({});
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectNote, setRejectNote] = useState("");

  const load = useCallback(async () => {
    setError("");
    const [rp, sc, it, vr, ws] = await Promise.all([
      supabase.from("repack_log").select("*").eq("status", "pending").order("created_at"),
      supabase.from("stock_counts").select("id,counted_by_name,submitted_at").eq("status", "submitted").order("submitted_at"),
      supabase.from("items").select("id,unit"),
      supabase.from("vehicle_requests").select("*").eq("status", "pending").order("created_at"),
      supabase.from("waste_log").select("*").eq("status", "pending").order("created_at"),
    ]);
    if (rp.error) { setError(rp.error.message); setItems([]); return; }
    setItems(rp.data || []);
    setCounts(sc.error ? [] : sc.data || []);
    setMoves(vr.error ? [] : vr.data || []);
    setWastes(ws.error ? [] : ws.data || []);
    setNames(Object.fromEntries((it.data || []).map((i) => [i.id, i.unit])));
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (r, approve, fn = "decide_repack") => {
    if (!approve && !rejectNote.trim()) { setError("כתוב בקצרה למה נדחה"); return; }
    setBusyId(r.id); setError("");
    try {
      const { error: e } = await supabase.rpc(fn, { p_id: r.id, p_approve: approve, p_note: approve ? null : rejectNote });
      if (e) throw e;
      setRejectFor(null); setRejectNote("");
      await load();
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  const lines = (arr) => (arr || []).map((l) => `${kg(l.qty)} ${UNIT_LABEL[l.unit || names[l.item_id]] || ""}`).join(" + ");
  const total = (items || []).length + counts.length + moves.length + wastes.length;
  const Kind = ({ icon: Icon, children, cls }) => <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ${cls}`}><Icon size={12} /> {children}</span>;

  return (<>
    <Header title="לאישור" subtitle={items === null ? "רכב, פחת, מזיגות חריגות וספירה" : (total ? `${total} מחכים להחלטה שלך` : "אין ממתינים")} onBack={onBack} />
    <div className="flex-1 px-4 py-3.5 flex flex-col gap-3">
      <ErrorBox>{error}</ErrorBox>
      {items === null ? <Loading /> : (<div className={WIDE + " items-start"}>
        {counts.map((c) => (
          <button key={c.id} onClick={onOpenCount} className="lg:group-[.wide]/w:col-span-2 bg-white border-[1.5px] border-amber-400 rounded-2xl p-3.5 flex items-center gap-3 text-right hover:shadow-sm transition">
            <ClipboardList size={24} className="text-amber-700 shrink-0" />
            <div className="flex-1">
              <div className="font-bold">ספירה שבועית</div>
              <div className="text-[13px] text-slate-600">ספר: {c.counted_by_name} · {new Date(c.submitted_at).toLocaleString("he-IL", { weekday: "long", hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <span className="text-sm font-semibold" style={{ color: NAVY }}>לפערים ←</span>
          </button>
        ))}
        {wastes.map((r) => (
          <div key={r.id} className="bg-white border-[1.5px] border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2">
            <Kind icon={Gift} cls="bg-rose-50 text-rose-700 self-start">פחת / דוגמה</Kind>
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-[17px]">{reasonLabel(r.reason)}{r.customer_name ? ` · ${r.customer_name}` : ""}</span>
              <span className="text-sm font-bold text-amber-800">{fmt(r.value)}</span>
            </div>
            <div className="text-[13px] text-slate-600">{r.created_by_name} · {new Date(r.created_at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })} · {kg(r.kg)} ק"ג</div>
            <div className="text-sm">{linesText(r.lines)}</div>
            {r.note && <div className="text-sm text-slate-700">הערה: {r.note}</div>}
            {rejectFor === r.id ? (
              <div className="flex flex-col gap-2">
                <label htmlFor={`rjw-${r.id}`} className="text-sm text-slate-600">למה נדחה? (נתי יראה את זה)</label>
                <input id={`rjw-${r.id}`} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} className="h-11 border border-slate-300 rounded-xl px-3" />
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busyId === r.id} onClick={() => decide(r, false, "decide_waste")} className="h-11 rounded-xl bg-rose-600 text-white font-semibold">דחייה</button>
                  <button onClick={() => { setRejectFor(null); setRejectNote(""); }} className="h-11 rounded-xl border border-slate-300">ביטול</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button disabled={busyId === r.id} onClick={() => decide(r, true, "decide_waste")} className="h-12 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50" style={{ background: AMBER, color: NAVY }}>
                  {busyId === r.id ? <Loader2 className="animate-spin" size={16} /> : <Check size={18} />} אישור
                </button>
                <button disabled={busyId === r.id} onClick={() => { setRejectFor(r.id); setRejectNote(""); setError(""); }} className="h-12 rounded-xl border-[1.5px] border-slate-300 bg-white font-semibold text-rose-700 hover:bg-rose-50 transition">דחייה</button>
              </div>
            )}
          </div>
        ))}
        {moves.map((r) => (
          <div key={r.id} className="bg-white border-[1.5px] border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2">
            <Kind icon={Truck} cls="bg-sky-50 text-sky-700 self-start">רכב</Kind>
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-[17px]">{r.kind === "load" ? "העמסה לרכב" : "החזרה למחסן"}</span>
              <span className="text-xs text-slate-600">{r.tag}</span>
            </div>
            <div className="text-[13px] text-slate-600">{r.created_by_name} · {new Date(r.created_at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
            <div className="text-sm">{linesText(r.lines)}</div>
            {r.note && <div className="text-sm text-slate-700">הערה: {r.note}</div>}
            {rejectFor === r.id ? (
              <div className="flex flex-col gap-2">
                <label htmlFor={`rjv-${r.id}`} className="text-sm text-slate-600">למה נדחה? (נתי יראה את זה)</label>
                <input id={`rjv-${r.id}`} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} className="h-11 border border-slate-300 rounded-xl px-3" />
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busyId === r.id} onClick={() => decide(r, false, "decide_vehicle_move")} className="h-11 rounded-xl bg-rose-600 text-white font-semibold">דחייה</button>
                  <button onClick={() => { setRejectFor(null); setRejectNote(""); }} className="h-11 rounded-xl border border-slate-300">ביטול</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button disabled={busyId === r.id} onClick={() => decide(r, true, "decide_vehicle_move")} className="h-12 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50" style={{ background: AMBER, color: NAVY }}>
                  {busyId === r.id ? <Loader2 className="animate-spin" size={16} /> : <Check size={18} />} {r.kind === "load" ? "אישור – יצא לרכב" : "אישור – חזר למחסן"}
                </button>
                <button disabled={busyId === r.id} onClick={() => { setRejectFor(r.id); setRejectNote(""); setError(""); }} className="h-12 rounded-xl border-[1.5px] border-slate-300 bg-white font-semibold text-rose-700 hover:bg-rose-50 transition">דחייה</button>
              </div>
            )}
          </div>
        ))}
        {items.map((r) => {
          const pct = Math.round((Number(r.out_kg) / Number(r.in_kg) - 1) * 100);
          return (
            <div key={r.id} className="bg-white border-[1.5px] border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2">
              <Kind icon={Droplets} cls="bg-violet-50 text-violet-700 self-start">מזיגה חריגה</Kind>
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-[17px]">{r.scent}</span>
                <span className="text-sm font-bold text-amber-800">{pct > 0 ? "+" : ""}{pct}%</span>
              </div>
              <div className="text-[13px] text-slate-600">{r.created_by_name} · {new Date(r.created_at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              <div className="text-sm"><span className="text-slate-600">נפתח: </span>{lines(r.consumed)} ({kg(r.in_kg)} ק"ג)</div>
              <div className="text-sm"><span className="text-slate-600">יצא: </span>{lines(r.produced)} ({kg(r.out_kg)} ק"ג)</div>
              {r.reason && <div className="text-sm bg-amber-50 rounded-lg px-2.5 py-1.5"><span className="text-slate-600">סיבה: </span>{r.reason}</div>}
              {r.note && <div className="text-sm text-slate-700">הערה: {r.note}</div>}
              {rejectFor === r.id ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor={`rj-${r.id}`} className="text-sm text-slate-600">למה נדחה? (נתי יראה את זה)</label>
                  <input id={`rj-${r.id}`} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} className="h-11 border border-slate-300 rounded-xl px-3" />
                  <div className="grid grid-cols-2 gap-2">
                    <button disabled={busyId === r.id} onClick={() => decide(r, false)} className="h-11 rounded-xl bg-rose-600 text-white font-semibold">דחייה</button>
                    <button onClick={() => { setRejectFor(null); setRejectNote(""); }} className="h-11 rounded-xl border border-slate-300">ביטול</button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button disabled={busyId === r.id} onClick={() => decide(r, true)} className="h-12 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50" style={{ background: AMBER, color: NAVY }}>
                    {busyId === r.id ? <Loader2 className="animate-spin" size={16} /> : <Check size={18} />} אישור
                  </button>
                  <button disabled={busyId === r.id} onClick={() => { setRejectFor(r.id); setRejectNote(""); setError(""); }} className="h-12 rounded-xl border-[1.5px] border-slate-300 bg-white font-semibold text-rose-700 hover:bg-rose-50 transition">דחייה</button>
                </div>
              )}
            </div>
          );
        })}
        {total === 0 && (
          <div className="lg:group-[.wide]/w:col-span-2 flex flex-col items-center gap-2 py-14 text-slate-600"><span className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"><CircleCheck size={34} className="text-green-600" /></span><span className="font-semibold">אין שום דבר שמחכה לאישור</span></div>
        )}
      </div>)}
    </div>
  </>);
}
