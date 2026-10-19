import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Search, Check, Loader2, CircleCheck, TriangleAlert, X, Gift, Droplet, Ban, Home, HelpCircle } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { NAVY, AMBER, norm, Header, BottomBar, bigBtn } from "./mobileUi";
import { Stepper, groupItems, linesText } from "./MobileVehicle";

// ============================================================
// דוגמאות ופחת: כל יציאה מהמלאי שאינה מכירה – עם סיבה.
// השרת (record_waste) בודק מלאי, ומחליט אם יורד מיד או ממתין לאישור
// (מעל 1 ק"ג או 200 ₪ אצל נתי). השווי בשקלים לא מגיע למסך.
// ============================================================

export const WASTE_REASONS = [
  { key: "sample", label: "דוגמה ללקוח", icon: Gift },
  { key: "spill", label: "שפיכה / שבר", icon: Droplet },
  { key: "defective", label: "מוצר פגום", icon: Ban },
  { key: "internal", label: "שימוש פנימי", icon: Home },
  { key: "other", label: "אחר", icon: HelpCircle },
];
export const reasonLabel = (k) => WASTE_REASONS.find((r) => r.key === k)?.label || k;
const STATUS = {
  done: { label: "ירד מהמלאי", cls: "bg-green-100 text-green-800" },
  approved: { label: "אושר", cls: "bg-green-100 text-green-800" },
  pending: { label: "ממתין לאישור", cls: "bg-amber-100 text-amber-900" },
  rejected: { label: "נדחה", cls: "bg-rose-100 text-rose-800" },
};

export function WasteScreen({ userName, onBack }) {
  const [catalog, setCatalog] = useState([]);
  const [veh, setVeh] = useState(null);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState(null);
  const [reason, setReason] = useState("");
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const load = useCallback(async () => {
    const [c, v, m] = await Promise.all([supabase.rpc("mobile_catalog"), supabase.rpc("my_vehicle"), supabase.rpc("my_waste")]);
    setCatalog(c.error ? [] : c.data || []);
    const vv = !v.error && v.data?.vehicle ? v.data : null;
    setVeh(vv);
    setSource((cur) => cur || (vv ? "vehicle" : "warehouse"));
    setMine(m.error ? [] : m.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    if (source === "vehicle") return (veh?.stock || []).map((s) => ({ id: s.item_id, name: s.name, unit: s.unit, avail: Number(s.qty) }));
    return catalog.filter((i) => i.unit !== 'ק"ג' && !/בדיקה/.test(i.name) && Number(i.stock) > 0)
      .map((i) => ({ id: i.id, name: i.name, unit: i.unit, aliases: i.aliases, avail: Number(i.stock) }));
  }, [catalog, veh, source]);
  const groups = useMemo(() => groupItems(items), [items]);
  const q = norm(query);
  const picked = items.filter((i) => (qty[i.id] || 0) > 0);
  const shown = groups.filter((g) => !q || norm(g.title).includes(q) || norm(g.aliases).includes(q) || g.rows.some((r) => qty[r.id]));

  const reset = () => { setReason(""); setCustomer(""); setNote(""); setQty({}); setQuery(""); setError(""); };

  const submit = async () => {
    setError("");
    if (!reason) { setError("יש לבחור סיבה"); return; }
    if (reason === "sample" && !customer.trim()) { setError("לאיזה לקוח הדוגמה?"); return; }
    if (reason === "other" && !note.trim()) { setError("יש לכתוב מה קרה"); return; }
    if (!picked.length) { setError("יש לבחור מה יצא מהמלאי"); return; }
    setBusy(true);
    try {
      const { data, error: e } = await supabase.rpc("record_waste", {
        p_reason: reason, p_source: source, p_customer: reason === "sample" ? customer : null, p_note: note || null,
        p_lines: picked.map((i) => ({ item_id: i.id, qty: qty[i.id] })),
      });
      if (e) throw e;
      setDone(data); reset(); setLoading(true); await load();
    } catch (e) { setError(e.message || "שגיאה בשמירה"); } finally { setBusy(false); }
  };

  if (loading) return (<><Header title="דוגמה / פחת" onBack={onBack} /><div className="flex-1 flex items-center justify-center gap-2 text-slate-500 py-16"><Loader2 className="animate-spin" size={18} /> טוען...</div></>);

  return (<>
    <Header title="דוגמה / פחת" subtitle={`${userName} · מה יצא מהמלאי בלי מכירה`} onBack={onBack} />
    <div className="flex-1 px-4 py-3.5 flex flex-col gap-3">
      {done && (
        <div className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm border ${done.status === "pending" ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-green-50 border-green-200 text-green-900"}`}>
          {done.status === "pending" ? <TriangleAlert size={22} className="shrink-0" /> : <CircleCheck size={22} className="shrink-0 text-green-700" />}
          <div><div className="font-bold">{done.status === "pending" ? "נשלח לאישור" : "נרשם"} · {done.tag}</div>
            <div>{done.status === "pending" ? "כמות גדולה – המלאי יתעדכן אחרי שליאור או אלירן יאשרו." : "ירד מהמלאי."}</div></div>
        </div>
      )}

      {veh && (
        <div className="grid grid-cols-2 gap-2">
          {[["vehicle", "מהרכב שלי"], ["warehouse", "מהמחסן"]].map(([k, l]) => (
            <button key={k} onClick={() => { if (source !== k) { setSource(k); setQty({}); } }} className={`h-11 rounded-xl font-semibold ${source === k ? "text-white" : "bg-white border-[1.5px] border-slate-300"}`} style={source === k ? { background: NAVY } : {}}>{l}</button>
          ))}
        </div>
      )}

      <div className="font-semibold">למה זה יצא?</div>
      <div className="grid grid-cols-2 gap-2">
        {WASTE_REASONS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => { setReason(key); setError(""); }}
            className={`h-14 rounded-xl flex items-center justify-center gap-2 font-semibold border-[1.5px] ${reason === key ? "border-transparent" : "bg-white border-slate-300"} ${key === "other" ? "col-span-2" : ""}`}
            style={reason === key ? { background: AMBER, color: NAVY } : {}}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>
      {reason === "sample" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="wcust" className="text-sm font-semibold">לאיזה לקוח? (חובה)</label>
          <input id="wcust" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="שם הלקוח או העסק" className="h-12 border-[1.5px] border-slate-300 rounded-xl px-3 bg-white" />
        </div>
      )}

      <div className="font-semibold mt-1">מה יצא?</div>
      <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-slate-300 rounded-2xl px-3.5 h-[50px]">
        <Search size={20} className="text-slate-500" />
        <label htmlFor="wq" className="sr-only">חיפוש</label>
        <input id="wq" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חפש ריח או מכשיר" className="flex-1 bg-transparent outline-none text-base" />
        {query && <button aria-label="ניקוי" onClick={() => setQuery("")}><X size={18} className="text-slate-400" /></button>}
      </div>
      {!q && picked.length === 0 && <div className="text-xs text-slate-500">חפש את הריח או המכשיר, ובחר כמות.</div>}
      {(q || picked.length > 0) && shown.slice(0, 15).map((g) => (
        <div key={g.key} className={`bg-white rounded-2xl p-3.5 flex flex-col gap-2.5 border-[1.5px] ${g.rows.some((r) => qty[r.id]) ? "border-amber-500" : "border-slate-200"}`}>
          <div className="font-bold text-[17px]">{g.title}</div>
          {g.rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2">
              <div><div className="font-semibold">{r.label}</div><div className="text-xs text-slate-600">{source === "vehicle" ? "ברכב" : "במחסן"} {r.avail}</div></div>
              <Stepper label={`${g.title} ${r.label}`} value={qty[r.id]} max={Math.floor(r.avail)} onChange={(v) => setQty({ ...qty, [r.id]: v })} />
            </div>
          ))}
        </div>
      ))}
      {q && shown.length === 0 && <div className="text-center text-slate-500 py-4">לא נמצא</div>}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="wnote" className="text-sm text-slate-600">{reason === "other" ? "מה קרה? (חובה)" : "הערה (לא חובה)"}</label>
        <input id="wnote" value={note} onChange={(e) => setNote(e.target.value)} className="h-12 border border-slate-300 rounded-xl px-3 bg-white" />
      </div>
      {error && <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2.5 text-sm"><TriangleAlert size={16} /> {error}</div>}

      {mine.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <div className="text-[13px] text-slate-600 font-medium">הרישומים האחרונים שלי</div>
          {mine.map((w) => {
            const st = STATUS[w.status] || STATUS.done;
            return (
              <div key={w.id} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold flex-1">{reasonLabel(w.reason)}{w.customer ? ` · ${w.customer}` : ""}</span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${st.cls}`}>{st.label}</span>
                </div>
                <div className="text-[13px] text-slate-700">{linesText(w.lines)}</div>
                {w.status === "rejected" && w.decision_note && <div className="text-xs text-rose-700">נדחה ע"י {w.decided_by}: {w.decision_note}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
    <BottomBar>
      <button disabled={busy || !reason || !picked.length} onClick={submit} className={bigBtn} style={{ background: AMBER, color: NAVY }}>
        {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={20} />} רישום
      </button>
    </BottomBar>
  </>);
}
