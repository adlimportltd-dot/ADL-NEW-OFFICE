import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Search, Plus, Minus, Check, Loader2, CircleCheck, TriangleAlert, X, Truck, PackagePlus, Undo2 } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { NAVY, AMBER, norm, parseEssence, Header, BottomBar, bigBtn, WIDE, SectionTitle } from "./mobileUi";

// ============================================================
// הרכב שלי (נתי): מה יש ברכב, בקשת העמסה מהמחסן, בקשת החזרה למחסן.
// כל בקשה ממתינה לאישור של ליאור או אלירן – רק אז הסחורה עוברת במלאי
// (request_vehicle_move / decide_vehicle_move).
// ============================================================

const BULK_KG_UNIT = 'ק"ג';
const SIZE_ORDER = { '25 ק"ג': 0, '5 ק"ג': 1, '1 ק"ג': 2, 'חצי ק"ג': 3, 'רבע ק"ג': 4 };
const SIZE_LABEL = { '25 ק"ג': "חבית 25", '5 ק"ג': "גלון 5", '1 ק"ג': '1 ק"ג', 'חצי ק"ג': "חצי", 'רבע ק"ג': "רבע" };
const KIND_LABEL = { load: "העמסה לרכב", return: "החזרה למחסן" };
const STATUS = {
  pending: { label: "ממתין לאישור", cls: "bg-amber-100 text-amber-900" },
  approved: { label: "אושר", cls: "bg-green-100 text-green-800" },
  rejected: { label: "נדחה", cls: "bg-rose-100 text-rose-800" },
  cancelled: { label: "בוטל", cls: "bg-slate-200 text-slate-700" },
};
const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; };
const qtyTxt = (n) => Number(n || 0).toLocaleString("he-IL", { maximumFractionDigits: 2 });
const shortName = (name) => {
  const p = parseEssence(name);
  return p ? `${p.scent} · ${SIZE_LABEL[p.size] || p.size}` : name;
};
export const linesText = (lines) => (lines || []).map((l) => `${qtyTxt(l.qty)} ${shortName(l.name)}`).join(", ");

function ErrorBox({ children }) {
  if (!children) return null;
  return <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2.5 text-sm"><TriangleAlert size={16} className="shrink-0 mt-0.5" /> <span>{children}</span></div>;
}

export function Stepper({ value, onChange, max, label }) {
  const n = toInt(value);
  const atMax = max != null && n >= max;
  return (
    <div className="flex items-center gap-1.5">
      <button aria-label={`הפחת ${label}`} onClick={() => onChange(Math.max(0, n - 1))} disabled={n === 0} className="w-10 h-10 rounded-xl border-[1.5px] border-slate-300 bg-white flex items-center justify-center disabled:opacity-40"><Minus size={17} /></button>
      <input aria-label={label} inputMode="numeric" value={n || ""} placeholder="0"
        onChange={(e) => { const raw = toInt(e.target.value.replace(/[^\d]/g, "")); onChange(max != null ? Math.min(raw, max) : raw); }}
        className="w-12 h-10 text-center text-lg font-bold border-[1.5px] border-slate-300 rounded-xl bg-white" />
      <button aria-label={`הוסף ${label}`} onClick={() => onChange(n + 1)} disabled={atMax} className="w-10 h-10 rounded-xl flex items-center justify-center disabled:bg-slate-200 disabled:text-slate-500" style={atMax ? {} : { background: NAVY, color: "#fff" }}><Plus size={17} /></button>
    </div>
  );
}

// קיבוץ פריטים: תמציות לפי ריח (עם גדלים), מכשירים כשורה אחת
export function groupItems(items) {
  const map = {};
  items.forEach((i) => {
    const p = parseEssence(i.name);
    const key = p ? p.scent : i.name;
    if (!map[key]) map[key] = { key, title: key, aliases: "", rows: [] };
    map[key].rows.push({ ...i, label: p ? SIZE_LABEL[p.size] || p.size : "יחידות" });
    if (i.aliases) map[key].aliases = i.aliases;
  });
  return Object.values(map)
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => (SIZE_ORDER[a.unit] ?? 9) - (SIZE_ORDER[b.unit] ?? 9)) }))
    .sort((a, b) => a.title.localeCompare(b.title, "he"));
}

export function VehicleScreen({ userName, onBack }) {
  const [view, setView] = useState("main"); // main | load | return
  const [veh, setVeh] = useState(null);
  const [requests, setRequests] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);

  const load = useCallback(async () => {
    setError("");
    const [v, r, c] = await Promise.all([
      supabase.rpc("my_vehicle"),
      supabase.from("vehicle_requests").select("id,tag,kind,lines,note,status,created_at,decided_by_name,decision_note").order("created_at", { ascending: false }).limit(10),
      supabase.rpc("mobile_catalog"),
    ]);
    if (v.error) setError(v.error.message); else setVeh(v.data);
    setRequests(r.error ? [] : r.data || []);
    setCatalog(c.error ? [] : c.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const cancel = async (id) => {
    if (!window.confirm("לבטל את הבקשה?")) return;
    const { error: e } = await supabase.rpc("cancel_vehicle_move", { p_id: id });
    if (e) setError(e.message); else load();
  };

  if (loading) return (<><Header title="הרכב שלי" onBack={onBack} /><div className="flex-1 flex items-center justify-center gap-2 text-slate-500 py-16"><Loader2 className="animate-spin" size={18} /> טוען...</div></>);
  if (!veh?.vehicle) return (<><Header title="הרכב שלי" onBack={onBack} /><div className="p-4 flex flex-col gap-3"><ErrorBox>{error}</ErrorBox><div className="text-center text-slate-600 py-10">אין רכב משויך למשתמש שלך</div></div></>);

  if (view === "load" || view === "return") {
    const source = view === "load"
      ? catalog.filter((i) => i.unit !== BULK_KG_UNIT && !/בדיקה/.test(i.name) && Number(i.stock) > 0).map((i) => ({ id: i.id, name: i.name, unit: i.unit, aliases: i.aliases, avail: Number(i.stock) }))
      : (veh.stock || []).map((s) => ({ id: s.item_id, name: s.name, unit: s.unit, avail: Number(s.qty) }));
    return <RequestBuilder kind={view} items={source} onCancel={() => setView("main")}
      onSent={(res) => { setSent({ ...res, kind: view }); setView("main"); load(); }} />;
  }

  const stockGroups = groupItems((veh.stock || []).map((s) => ({ id: s.item_id, name: s.name, unit: s.unit, qty: Number(s.qty) })));
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (<>
    <Header title="הרכב שלי" subtitle={`${userName} · ${veh.vehicle.name}`} onBack={onBack} />
    <div className="flex-1 px-4 py-3.5 flex flex-col gap-3">
      {sent && (
        <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-2xl px-3.5 py-3 text-sm text-green-900">
          <CircleCheck size={22} className="text-green-700 shrink-0" />
          <div><div className="font-bold">נשלח לאישור · {sent.tag}</div>
            <div>{sent.kind === "load" ? "הסחורה תיכנס לרכב במערכת" : "הסחורה תחזור למחסן במערכת"} אחרי שליאור או אלירן יאשרו.</div></div>
        </div>
      )}
      <ErrorBox>{error}</ErrorBox>
      <div className="grid grid-cols-2 gap-2.5 lg:group-[.wide]/w:max-w-xl">
        <button onClick={() => { setSent(null); setView("load"); }} className="rounded-2xl p-3.5 min-h-[92px] flex flex-col items-start justify-between font-bold text-right shadow-sm transition hover:brightness-105 active:scale-[0.98]" style={{ background: AMBER, color: NAVY }}>
          <PackagePlus size={24} /> <span>בקשת העמסה מהמחסן</span>
        </button>
        <button disabled={!stockGroups.length} onClick={() => { setSent(null); setView("return"); }} className="rounded-2xl p-3.5 min-h-[92px] flex flex-col items-start justify-between font-bold text-right bg-white border-[1.5px] border-slate-200 transition hover:border-slate-300 active:scale-[0.98] disabled:opacity-50">
          <Undo2 size={24} /> <span>החזרה למחסן</span>
        </button>
      </div>

      {requests.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionTitle>הבקשות שלי{pendingCount ? ` · ${pendingCount} ממתינות` : ""}</SectionTitle>
          <div className="grid grid-cols-1 gap-2 lg:group-[.wide]/w:grid-cols-2">{requests.map((r) => {
            const st = STATUS[r.status] || STATUS.pending;
            return (
              <div key={r.id} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold flex-1">{KIND_LABEL[r.kind]} · {new Date(r.created_at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${st.cls}`}>{st.label}</span>
                </div>
                <div className="text-[13px] text-slate-700">{linesText(r.lines)}</div>
                {r.status === "rejected" && r.decision_note && <div className="text-xs text-rose-700">נדחה ע"י {r.decided_by_name}: {r.decision_note}</div>}
                {r.status === "pending" && <button onClick={() => cancel(r.id)} className="self-start text-xs text-slate-600 underline">ביטול הבקשה</button>}
              </div>
            );
          })}</div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <SectionTitle icon={Truck}>מה יש עכשיו ברכב</SectionTitle>
        <div className="grid grid-cols-1 gap-2 lg:group-[.wide]/w:grid-cols-2">
        {stockGroups.length === 0 && <div className="bg-white border border-dashed border-slate-300 rounded-xl px-3 py-5 text-center text-slate-500 lg:group-[.wide]/w:col-span-2">הרכב ריק במערכת</div>}
        {stockGroups.map((g) => (
          <div key={g.key} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
            <span className="font-semibold flex-1">{g.title}</span>
            <span className="flex flex-wrap gap-1 justify-end">{g.rows.map((r) => <span key={r.label} className="text-[13px] bg-slate-100 rounded-lg px-2 py-0.5">{r.label} <b>{qtyTxt(r.qty)}</b></span>)}</span>
          </div>
        ))}
        </div>
      </div>
    </div>
  </>);
}

function RequestBuilder({ kind, items, onCancel, onSent }) {
  const [qty, setQty] = useState({});
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const groups = useMemo(() => groupItems(items), [items]);
  const q = norm(query);
  const shown = groups.filter((g) => !q || norm(g.title).includes(q) || norm(g.aliases).includes(q));
  const picked = items.filter((i) => toInt(qty[i.id]) > 0);
  const total = picked.reduce((s, i) => s + toInt(qty[i.id]), 0);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const lines = picked.map((i) => ({ item_id: i.id, qty: toInt(qty[i.id]) }));
      const { data, error: e } = await supabase.rpc("request_vehicle_move", { p_kind: kind, p_lines: lines, p_note: note || null });
      if (e) throw e;
      onSent(data);
    } catch (e) { setError(e.message || "שגיאה בשליחה"); } finally { setBusy(false); }
  };

  return (<>
    <Header title={kind === "load" ? "בקשת העמסה" : "החזרה למחסן"} subtitle={kind === "load" ? "מה לוקחים מהמחסן לרכב" : "מה מחזירים מהרכב למחסן"} onBack={onCancel} />
    <div className="flex-1 px-4 py-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-slate-300 rounded-2xl px-3.5 h-[50px]">
        <Search size={20} className="text-slate-500" />
        <label htmlFor="vq" className="sr-only">חיפוש</label>
        <input id="vq" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חפש ריח או מכשיר" className="flex-1 bg-transparent outline-none text-base" />
        {query && <button aria-label="ניקוי" onClick={() => setQuery("")}><X size={18} className="text-slate-400" /></button>}
      </div>
      {kind === "return" && items.length > 0 && (
        <button onClick={() => setQty(Object.fromEntries(items.map((i) => [i.id, Math.floor(i.avail)])))} className="h-11 rounded-xl border-[1.5px] border-slate-300 bg-white font-semibold">להחזיר הכול</button>
      )}
      <div className={WIDE}>{shown.map((g) => {
        const has = g.rows.some((r) => toInt(qty[r.id]) > 0);
        return (
          <div key={g.key} className={`bg-white rounded-2xl p-3.5 flex flex-col gap-2.5 border-[1.5px] ${has ? "border-amber-500" : "border-slate-200"}`}>
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-[17px]">{g.title}</span>
              {g.aliases && <span className="text-xs text-slate-600">נקרא גם: {g.aliases}</span>}
            </div>
            {g.rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{r.label}</div>
                  <div className="text-xs text-slate-600">{kind === "load" ? "במחסן" : "ברכב"} {qtyTxt(r.avail)}</div>
                </div>
                <Stepper label={`${g.title} ${r.label}`} value={qty[r.id]} max={Math.floor(r.avail)} onChange={(v) => setQty({ ...qty, [r.id]: v })} />
              </div>
            ))}
          </div>
        );
      })}</div>
      {shown.length === 0 && <div className="text-center text-slate-500 py-6">{items.length ? "לא נמצא" : kind === "load" ? "אין מלאי במחסן" : "הרכב ריק"}</div>}
      {picked.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="vnote" className="text-sm text-slate-600">הערה (לא חובה)</label>
          <input id="vnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "load" ? "למשל: להתקנות של מחר" : "למשל: לא נמכר השבוע"} className="h-12 border border-slate-300 rounded-xl px-3 bg-white" />
        </div>
      )}
      <ErrorBox>{error}</ErrorBox>
    </div>
    <BottomBar hint={picked.length === 0 ? (kind === "load" ? "בחר מה לוקחים לרכב" : "בחר מה מחזירים") : null}>
      <button disabled={busy || picked.length === 0} onClick={submit} className={bigBtn} style={{ background: AMBER, color: NAVY }}>
        {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={20} />} שליחה לאישור{total ? ` (${total} פריטים)` : ""}
      </button>
    </BottomBar>
  </>);
}
