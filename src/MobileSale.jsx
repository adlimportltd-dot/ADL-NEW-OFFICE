import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Search, Plus, Minus, Check, Loader2, CircleCheck,
  TriangleAlert, Info, Package, Droplets, X,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { NAVY, AMBER, fmt, norm, parseEssence, Header, BottomBar, bigBtn, Shell } from "./mobileUi";

// ============================================================
// מכירה מהירה בטלפון (אדל)
// מסך נפרד מהמערכת הראשית: מוכר (seller) רואה רק אותו, מנהל נכנס עם ?m=1.
// כל הלוגיקה הרגישה (מחירים, בדיקת מלאי, הורדה מהמלאי, חשבונית) רצה בשרת
// בפונקציה mobile_sale – המסך לא מקבל עלויות ולא מחיר לאייקון בכלל.
// ============================================================

const BULK_KG_UNIT = 'ק"ג';
const SIZES = [
  { key: 'רבע ק"ג', label: "רבע" },
  { key: 'חצי ק"ג', label: "חצי" },
  { key: '1 ק"ג', label: '1 ק"ג' },
  { key: '5 ק"ג', label: "גלון 5" },
  { key: '25 ק"ג', label: "חבית 25" },
];
const PAYMENTS = [
  { key: "cash", label: "מזומן" },
  { key: "credit_card", label: "אשראי" },
  { key: "bank_transfer", label: "העברה" },
  { key: "bit", label: "ביט" },
  { key: "open", label: "חוב פתוח" },
];

export default function MobileSale({ profile, onHome, embedded = false }) {
  const isAdmin = profile?.role === "admin";
  const userName = profile?.fullName || (isAdmin ? "מנהל" : "מוכר");

  const [screen, setScreen] = useState("customer"); // customer | items | summary | done
  const [rawCatalog, setCatalog] = useState([]);
  const [vehicle, setVehicle] = useState(null);   // הרכב של המוכר (נתי) – אם יש
  const [vehStock, setVehStock] = useState({});   // itemId -> כמות ברכב
  const [source, setSource] = useState(null);      // "vehicle" | "warehouse"
  const [customers, setCustomers] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [customer, setCustomer] = useState(null);
  const [custQuery, setCustQuery] = useState("");
  const [newCust, setNewCust] = useState(null); // {name, phone}

  const [tab, setTab] = useState("consumable");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState({}); // itemId -> qty
  const [priceEdits, setPriceEdits] = useState({}); // itemId -> price (מחיר פתוח, נקבע בתיאום עם ליאור/אלירן)
  const [approvedBy, setApprovedBy] = useState("");

  const [payment, setPayment] = useState("");
  const [iconSite, setIconSite] = useState(false);
  const [endCustomer, setEndCustomer] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [vatRate, setVatRate] = useState(18);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [cat, cust, rec, veh] = await Promise.all([
        supabase.rpc("mobile_catalog"),
        supabase.from("customers").select("id,name,phone").order("name"),
        supabase.rpc("mobile_recent_customers"),
        supabase.rpc("my_vehicle"),
      ]);
      if (cat.error) throw cat.error;
      if (cust.error) throw cust.error;
      setCatalog(cat.data || []);
      setCustomers(cust.data || []);
      setRecent(rec.error ? [] : rec.data || []);
      const v = !veh.error && veh.data?.vehicle ? veh.data.vehicle : null;
      setVehicle(v);
      setVehStock(Object.fromEntries(((!veh.error && veh.data?.stock) || []).map((r) => [r.item_id, Number(r.qty)])));
      setSource((cur) => cur || (v ? "vehicle" : "warehouse"));
    } catch (e) {
      setLoadError(e.message || "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // המלאי שמוצג ונבדק תלוי במקור: הרכב של המוכר או המחסן
  const catalog = useMemo(
    () => (source === "vehicle" ? rawCatalog.map((i) => ({ ...i, stock: vehStock[i.id] || 0 })) : rawCatalog),
    [rawCatalog, vehStock, source]
  );
  const sourceName = source === "vehicle" ? "מהרכב שלי" : "מהמחסן";

  const byId = useMemo(() => Object.fromEntries(catalog.map((i) => [i.id, i])), [catalog]);

  // תמציות: כרטיס אחד לכל ריח, עם כל גדלי האריזה שלו
  const scents = useMemo(() => {
    const map = {};
    catalog.forEach((i) => {
      if (i.category !== "consumable" || i.unit === BULK_KG_UNIT) return;
      const p = parseEssence(i.name);
      if (!p) return;
      if (!map[p.scent]) map[p.scent] = { scent: p.scent, aliases: "", sizes: {} };
      map[p.scent].sizes[p.size] = i;
      if (i.aliases) map[p.scent].aliases = i.aliases;
    });
    return Object.values(map)
      .filter((s) => SIZES.some((z) => s.sizes[z.key]))
      .sort((a, b) => a.scent.localeCompare(b.scent, "he"));
  }, [catalog]);

  const devices = useMemo(
    () => catalog.filter((i) => i.category === "device" && !/בדיקה/.test(i.name)).sort((a, b) => a.name.localeCompare(b.name, "he")),
    [catalog]
  );

  const q = norm(query);
  // ברכב מציגים רק מה שבאמת יש בו
  const inCar = (i) => source !== "vehicle" || Number(i?.stock || 0) > 0;
  const shownScents = scents.filter((s) => (!q || norm(s.scent).includes(q) || norm(s.aliases).includes(q)) && Object.values(s.sizes).some(inCar));
  const shownDevices = devices.filter((d) => (!q || norm(d.name).includes(q)) && inCar(d));

  const cartLines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ item: byId[id], qty: n })).filter((l) => l.item);
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const setQty = (id, n) => {
    const max = Number(byId[id]?.stock || 0);
    const v = Math.max(0, Math.min(n, max));
    setCart((c) => ({ ...c, [id]: v }));
  };

  const viaIcon = payment === "bit" || iconSite;
  const unitPriceOf = (item) => {
    // המחיר מוקלד כולל מע"מ (מה שהלקוח משלם בפועל) ומומר כאן ללפני מע"מ
    const v = priceEdits[item.id];
    if (v === undefined || v === "" || isNaN(Number(v))) return null;
    return Number(v) / (1 + (Number(vatRate) || 0) / 100);
  };
  const missingPrice = !viaIcon && cartLines.some((l) => unitPriceOf(l.item) == null);
  const subtotal = cartLines.reduce((s, l) => s + l.qty * (unitPriceOf(l.item) || 0), 0);
  const vat = subtotal * (Number(vatRate) || 0) / 100;

  const resetSale = () => {
    setCustomer(null); setCustQuery(""); setCart({}); setPriceEdits({}); setApprovedBy(""); setPayment("");
    setIconSite(false); setEndCustomer(""); setOrderRef(""); setVatRate(18); setNote("");
    setError(""); setResult(null); setQuery(""); setTab("consumable"); setScreen("customer");
  };

  const pickCustomer = (c) => { setCustomer(c); setEndCustomer(c.name); setScreen("items"); };

  const createCustomer = async () => {
    if (!newCust?.name?.trim()) { setError("שם הלקוח הוא שדה חובה"); return; }
    setBusy(true); setError("");
    try {
      const { data, error: e } = await supabase.rpc("mobile_add_customer", { p_name: newCust.name, p_phone: newCust.phone || null });
      if (e) throw e;
      const c = { id: data, name: newCust.name.trim(), phone: newCust.phone || "" };
      setCustomers((list) => [...list, c]);
      setNewCust(null);
      pickCustomer(c);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const submit = async () => {
    setError("");
    if (!payment) { setError("יש לבחור איך הלקוח משלם"); return; }
    if (cartLines.length === 0) { setError("הסל ריק"); return; }
    if (missingPrice) { setError("יש להקליד מחיר לכל פריט (אחרי תיאום עם ליאור או אלירן)"); return; }
    if (!isAdmin && !viaIcon && !approvedBy) { setError("יש לסמן מי אישר את המחיר – ליאור או אלירן"); return; }
    setBusy(true);
    try {
      const lines = cartLines.map((l) => {
        const line = { item_id: l.item.id, qty: l.qty };
        if (!viaIcon) line.unit_price = Math.round(unitPriceOf(l.item) * 10000) / 10000;
        return line;
      });
      const { data, error: e } = await supabase.rpc("mobile_sale", {
        p_customer_id: customer.id,
        p_lines: lines,
        p_payment: payment,
        p_channel: iconSite ? "icon_site" : "adl",
        p_end_customer: viaIcon ? endCustomer : null,
        p_order_ref: iconSite ? orderRef : null,
        p_vat_rate: Number(vatRate),
        p_note: note || null,
        p_approved_by: isAdmin ? (approvedBy || null) : approvedBy,
        p_source: source === "vehicle" ? "vehicle" : "warehouse",
      });
      if (e) throw e;
      setResult(data);
      setScreen("done");
      load();
    } catch (e) {
      setError(e.message || "שגיאה בשמירה");
      load();
    } finally { setBusy(false); }
  };

  // במחשב (בתוך המערכת, ליד התפריט) – רוחב מלא יותר; בטלפון – מסך צר לכל הגובה
  const shell = (children) => <Shell embedded={embedded} wide={false}>{children}</Shell>;

  if (loading) return shell(<div className="flex-1 flex items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={18} /> טוען...</div>);
  if (loadError) return shell(
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <TriangleAlert className="text-rose-600" size={32} />
      <div className="font-bold">לא הצלחנו לטעון את מסך המכירה</div>
      <div className="text-sm text-slate-600">{loadError}</div>
      <button onClick={() => { setLoading(true); load(); }} className={bigBtn} style={{ background: AMBER }}>נסה שוב</button>
      <button onClick={onHome} className="text-sm text-slate-600 underline">{embedded ? "חזרה ללוח הבקרה" : "חזרה למסך הבית"}</button>
    </div>
  );

  // ---------- מסך 1: לקוח ----------
  if (screen === "customer") {
    const cq = norm(custQuery);
    const found = cq ? customers.filter((c) => norm(c.name).includes(cq) || norm(c.phone).includes(cq)).slice(0, 12) : [];
    const list = cq ? found : recent;
    return shell(<>
      <Header
        title="מכירה חדשה"
        subtitle={`שלום ${userName} · מוכר ${sourceName}`}
        step={1}
        onBack={onHome}
      />
      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        <label htmlFor="cust" className="font-semibold">למי מוכרים?</label>
        <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-slate-300 rounded-2xl px-3.5 h-14">
          <Search size={20} className="text-slate-500" />
          <input id="cust" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="שם לקוח או טלפון" className="flex-1 bg-transparent outline-none text-base" />
          {custQuery && <button aria-label="ניקוי" onClick={() => setCustQuery("")}><X size={18} className="text-slate-400" /></button>}
        </div>
        <div className="text-[13px] font-semibold text-slate-500 mt-1">{cq ? (found.length ? "תוצאות" : "לא נמצא לקוח בשם הזה") : "לקוחות אחרונים"}</div>
        <div className="flex flex-col gap-2.5">
          {list.map((c) => (
            <button key={c.id} onClick={() => pickCustomer(c)} className="flex items-center gap-3 bg-white border-[1.5px] border-slate-200 active:border-amber-500 rounded-2xl px-3.5 py-3 min-h-[64px] text-right">
              <div className="w-10 h-10 rounded-xl bg-slate-200 font-bold flex items-center justify-center">{(c.name || "?").trim().charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{c.name}</div>
                {c.phone && <div className="text-xs text-slate-600">{c.phone}</div>}
              </div>
            </button>
          ))}
          {!newCust ? (
            <button onClick={() => { setNewCust({ name: custQuery, phone: "" }); setError(""); }} className="flex items-center gap-2 border-[1.5px] border-dashed border-slate-400 rounded-2xl px-3.5 min-h-[56px] text-slate-700 font-medium bg-white">
              <Plus size={18} /> לקוח חדש
            </button>
          ) : (
            <div className="bg-white border-[1.5px] border-amber-500 rounded-2xl p-3.5 flex flex-col gap-2.5">
              <div className="font-semibold">לקוח חדש</div>
              <label className="text-sm text-slate-600" htmlFor="nc-name">שם</label>
              <input id="nc-name" value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} className="h-12 border border-slate-300 rounded-xl px-3 text-base" />
              <label className="text-sm text-slate-600" htmlFor="nc-phone">טלפון</label>
              <input id="nc-phone" inputMode="tel" value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} className="h-12 border border-slate-300 rounded-xl px-3 text-base" />
              {error && <div className="text-sm text-rose-700">{error}</div>}
              <div className="flex gap-2">
                <button disabled={busy} onClick={createCustomer} className="flex-1 h-12 rounded-xl font-bold" style={{ background: AMBER }}>{busy ? "שומר..." : "שמור ובחר"}</button>
                <button onClick={() => setNewCust(null)} className="h-12 px-4 rounded-xl border border-slate-300">ביטול</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>);
  }

  // ---------- מסך 2: פריטים ----------
  if (screen === "items") {
    const sizeBtn = (item, label) => {
      if (!item) return <div key={label} />;
      const stock = Number(item.stock || 0);
      const inCart = cart[item.id] || 0;
      const out = stock <= 0;
      return (
        <button
          key={item.id}
          disabled={out}
          onClick={() => setQty(item.id, inCart + 1)}
          className={`relative h-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 border-[1.5px] ${out ? "border-dashed border-slate-300 bg-slate-100" : inCart ? "bg-slate-900 border-slate-900" : "bg-white border-slate-300"}`}
        >
          <span className={`text-[15px] font-semibold ${out ? "text-slate-500" : inCart ? "text-white" : "text-slate-900"}`}>{label}</span>
          <span className={`text-[11px] ${out ? "text-slate-500" : inCart ? "text-slate-200" : "text-slate-600"}`}>{out ? "אזל" : `נשארו ${stock - inCart}`}</span>
          {inCart > 0 && <span className="absolute -top-2 -left-2 min-w-[22px] h-[22px] px-1 rounded-full text-xs font-bold flex items-center justify-center" style={{ background: AMBER, color: NAVY }}>{inCart}</span>}
        </button>
      );
    };
    const stepper = (item) => {
      const n = cart[item.id] || 0;
      const atMax = n >= Number(item.stock || 0);
      return (
        <div className="flex items-center gap-2">
          <button aria-label="הפחת" onClick={() => setQty(item.id, n - 1)} disabled={n === 0} className="w-11 h-11 rounded-xl border-[1.5px] border-slate-300 bg-white flex items-center justify-center disabled:opacity-40"><Minus size={18} /></button>
          <span className="min-w-[30px] text-center text-xl font-bold">{n}</span>
          <button aria-label="הוסף" onClick={() => setQty(item.id, n + 1)} disabled={atMax} className="w-11 h-11 rounded-xl flex items-center justify-center disabled:bg-slate-200 disabled:text-slate-500" style={atMax ? {} : { background: NAVY, color: "#fff" }}><Plus size={18} /></button>
        </div>
      );
    };
    return shell(<>
      <Header title="מה הוא לוקח?" subtitle={`לקוח: ${customer?.name}`} step={2} onBack={() => setScreen("customer")} />
      <div className="flex-1 px-4 py-3.5 flex flex-col gap-3">
        {vehicle && (
          <div className="flex flex-col gap-1.5">
            <div className="text-[13px] font-semibold text-slate-500">מאיפה הסחורה יוצאת?</div>
            <div className="grid grid-cols-2 gap-2">
              {[["vehicle", "הרכב שלי"], ["warehouse", "המחסן"]].map(([k, label]) => (
                <button key={k} onClick={() => { if (source !== k) { setSource(k); setCart({}); } }}
                  className={`h-11 rounded-xl font-semibold ${source === k ? "text-white" : "bg-white border-[1.5px] border-slate-300"}`}
                  style={source === k ? { background: NAVY } : {}}>{label}</button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setTab("consumable")} className={`h-11 rounded-xl font-semibold flex items-center justify-center gap-1.5 ${tab === "consumable" ? "bg-slate-900 text-white" : "bg-white border-[1.5px] border-slate-300"}`}><Droplets size={16} /> תמציות</button>
          <button onClick={() => setTab("device")} className={`h-11 rounded-xl font-semibold flex items-center justify-center gap-1.5 ${tab === "device" ? "bg-slate-900 text-white" : "bg-white border-[1.5px] border-slate-300"}`}><Package size={16} /> מכשירים</button>
        </div>
        <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-slate-300 rounded-2xl px-3.5 h-[50px]">
          <Search size={20} className="text-slate-500" />
          <label htmlFor="q" className="sr-only">חיפוש</label>
          <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tab === "consumable" ? "חפש ריח (גם נרסיסו, אדידס...)" : "חפש מכשיר"} className="flex-1 bg-transparent outline-none text-base" />
          {query && <button aria-label="ניקוי" onClick={() => setQuery("")}><X size={18} className="text-slate-400" /></button>}
        </div>

        {tab === "consumable" && shownScents.map((s) => {
          const picked = SIZES.some((z) => s.sizes[z.key] && cart[s.sizes[z.key].id]);
          const sizesHere = SIZES.filter((z) => s.sizes[z.key]);
          return (
            <div key={s.scent} className={`bg-white rounded-2xl p-3.5 flex flex-col gap-3 border-[1.5px] ${picked ? "border-amber-500" : "border-slate-200"}`}>
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-bold">{s.scent}</span>
                {s.aliases && <span className="text-xs text-slate-600">נקרא גם: {s.aliases}</span>}
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(sizesHere.length, 4)}, minmax(0,1fr))` }}>
                {sizesHere.map((z) => sizeBtn(s.sizes[z.key], z.label))}
              </div>
              {sizesHere.filter((z) => cart[s.sizes[z.key].id]).map((z) => {
                const it = s.sizes[z.key];
                const atMax = (cart[it.id] || 0) >= Number(it.stock || 0);
                return (
                  <div key={it.id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">{z.label} – כמה?</span>
                      {stepper(it)}
                    </div>
                    {atMax && (
                      <div className="flex items-center gap-2 bg-amber-100 rounded-lg px-2.5 py-2 text-[13px] text-amber-900">
                        <TriangleAlert size={16} /> זה כל מה שיש במלאי – אי אפשר להוסיף עוד
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {tab === "device" && shownDevices.map((d) => {
          const stock = Number(d.stock || 0);
          const n = cart[d.id] || 0;
          return (
            <div key={d.id} className={`bg-white rounded-2xl p-3.5 flex items-center gap-3 border-[1.5px] ${n ? "border-amber-500" : "border-slate-200"} ${stock <= 0 ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{d.name}</div>
                <div className="text-xs text-slate-600">{stock <= 0 ? "אזל מהמלאי" : `במלאי ${stock - n}`}</div>
              </div>
              {stock > 0 && stepper(d)}
            </div>
          );
        })}
        {((tab === "consumable" && shownScents.length === 0) || (tab === "device" && shownDevices.length === 0)) && (
          <div className="text-center text-slate-500 py-6">{source === "vehicle" && !q ? "אין כלום ברכב – אפשר לבקש העמסה ממסך \"הרכב שלי\" או לבחור \"המחסן\"" : "לא נמצא"}</div>
        )}
      </div>
      <BottomBar>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-slate-600">בסל</div>
            <div className="font-bold">{cartLines.length} שורות · {cartCount} פריטים</div>
          </div>
          <button disabled={cartLines.length === 0} onClick={() => {
            setError("");
            const pre = { ...priceEdits };
            cartLines.forEach((l) => { if (pre[l.item.id] === undefined && l.item.sale_price != null) pre[l.item.id] = String(Math.round(Number(l.item.sale_price) * (1 + (Number(vatRate) || 0) / 100))); });
            setPriceEdits(pre);
            setScreen("summary");
          }} className="h-[54px] px-6 rounded-2xl font-bold text-white disabled:opacity-40" style={{ background: NAVY }}>לסיכום</button>
        </div>
      </BottomBar>
    </>);
  }

  // ---------- מסך 3: סיכום ותשלום ----------
  if (screen === "summary") {
    return shell(<>
      <Header title="בודקים ומאשרים" subtitle={`לקוח: ${customer?.name}`} step={3} onBack={() => setScreen("items")} />
      <div className="flex-1 px-4 py-3.5 flex flex-col gap-3">
        <div className="bg-white border-[1.5px] border-slate-200 rounded-2xl px-3.5 py-1">
          {cartLines.map((l, idx) => {
            const p = unitPriceOf(l.item);
            const label = parseEssence(l.item.name) ? `${parseEssence(l.item.name).scent} · ${parseEssence(l.item.name).size}` : l.item.name;
            return (
              <div key={l.item.id} className={`flex items-center gap-2.5 py-3 ${idx ? "border-t border-slate-100" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{label}</div>
                  <div className="text-[13px] text-slate-600">
                    {l.qty} יח'
                    {!viaIcon && (p != null ? ` × ${fmt(Number(priceEdits[l.item.id]))}` : "")}
                  </div>
                  {!viaIcon && p == null && <div className="text-xs text-rose-700 mt-0.5">יש להקליד מחיר</div>}
                  {!viaIcon && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <label className="text-xs text-slate-600" htmlFor={`pr-${l.item.id}`}>מחיר ליחידה ללקוח (כולל מע"מ)</label>
                      <input id={`pr-${l.item.id}`} inputMode="decimal" className="w-24 h-9 border border-slate-300 rounded-lg px-2 text-sm"
                        placeholder="מחיר"
                        value={priceEdits[l.item.id] ?? ""} onChange={(e) => setPriceEdits({ ...priceEdits, [l.item.id]: e.target.value })} />
                    </div>
                  )}
                </div>
                {!viaIcon && <span className="font-bold">{p != null ? fmt(Number(priceEdits[l.item.id]) * l.qty) : "—"}</span>}
              </div>
            );
          })}
        </div>
        {!viaIcon && <div className="text-xs text-slate-600 px-1">המחירים כוללים מע"מ ומתמלאים מהמחירון. כל מחיר נקבע בתיאום עם ליאור או אלירן. בחבילה (למשל מכשיר + ריח) אפשר לשים את כל המחיר על המכשיר ו-0 על הריח.</div>}
        {!isAdmin && !viaIcon && (
          <div className="bg-white border-[1.5px] border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2">
            <div className="font-semibold text-[15px]">מי אישר את המחיר?</div>
            <div className="grid grid-cols-2 gap-2">
              {["ליאור", "אלירן"].map((n) => (
                <button key={n} onClick={() => setApprovedBy(n)} className={`h-12 rounded-xl text-[15px] ${approvedBy === n ? "bg-slate-900 text-white font-semibold" : "bg-white border-[1.5px] border-slate-300"}`}>{n}</button>
              ))}
            </div>
          </div>
        )}

        <div className="font-semibold mt-1">איך הוא משלם?</div>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENTS.map((p) => (
            <button key={p.key} onClick={() => setPayment(p.key)}
              className={`h-12 rounded-xl text-[15px] ${p.key === "open" ? "col-span-2" : ""} ${payment === p.key ? "bg-slate-900 text-white font-semibold" : "bg-white border-[1.5px] border-slate-300"}`}>
              {p.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2.5 bg-white border-[1.5px] border-slate-200 rounded-2xl px-3.5 min-h-[52px] cursor-pointer">
          <input type="checkbox" checked={iconSite} onChange={(e) => setIconSite(e.target.checked)} className="w-5 h-5 accent-amber-500" />
          <span className="text-[15px]">זו הזמנה מהאתר של אייקון</span>
        </label>

        {viaIcon && (
          <div className="bg-blue-50 rounded-2xl p-3.5 flex flex-col gap-2.5 text-blue-950">
            <div className="flex gap-2 text-[13px] leading-relaxed">
              <Info size={18} className="shrink-0 mt-0.5 text-blue-700" />
              <span>החשבונית ללקוח יוצאת מאייקון. במערכת של אדל המכירה נרשמת ללקוח <b>אייקון אייר</b> במחיר לאייקון, עם שם הלקוח הסופי.</span>
            </div>
            <label className="text-sm" htmlFor="endc">שם הלקוח הסופי</label>
            <input id="endc" value={endCustomer} onChange={(e) => setEndCustomer(e.target.value)} className="h-12 border border-blue-200 rounded-xl px-3 text-base bg-white" />
            {iconSite && <>
              <label className="text-sm" htmlFor="oref">מספר הזמנה באתר</label>
              <input id="oref" inputMode="numeric" value={orderRef} onChange={(e) => setOrderRef(e.target.value)} className="h-12 border border-blue-200 rounded-xl px-3 text-base bg-white" />
            </>}
          </div>
        )}

        {!viaIcon && (
          <div className="grid grid-cols-2 gap-2">
            {[18, 0].map((r) => (
              <button key={r} onClick={() => setVatRate(r)} className={`h-12 rounded-xl text-[15px] ${vatRate === r ? "bg-slate-900 text-white font-semibold" : "bg-white border-[1.5px] border-slate-300"}`}>{r ? 'עם מע"מ 18%' : 'ללא מע"מ'}</button>
            ))}
          </div>
        )}

        <label className="text-sm text-slate-700" htmlFor="note">הערה (לא חובה)</label>
        <input id="note" value={note} onChange={(e) => setNote(e.target.value)} className="h-12 border border-slate-300 rounded-xl px-3 text-base bg-white" />

        {!viaIcon && (
          <div className="bg-white border-[1.5px] border-slate-200 rounded-2xl px-3.5 py-3 flex flex-col gap-1.5">
            <div className="flex justify-between text-sm text-slate-700"><span>לפני מע"מ</span><span>{fmt(subtotal)}</span></div>
            <div className="flex justify-between text-sm text-slate-700"><span>מע"מ {vatRate}%</span><span>{fmt(vat)}</span></div>
            <div className="flex justify-between text-lg font-bold"><span>לתשלום</span><span>{fmt(subtotal + vat)}</span></div>
          </div>
        )}
        {error && <div className="bg-rose-100 text-rose-800 rounded-xl px-3 py-2.5 text-sm flex gap-2"><TriangleAlert size={18} className="shrink-0" />{error}</div>}
      </div>
      <BottomBar>
        <button disabled={busy || !payment || missingPrice || (!isAdmin && !viaIcon && !approvedBy)} onClick={submit} className={bigBtn} style={{ background: AMBER, color: NAVY }}>
          {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={20} />} {busy ? "שומר..." : "אשר מכירה"}
        </button>
      </BottomBar>
    </>);
  }

  // ---------- מסך 4: נשמר ----------
  if (screen === "done" && result) {
    return shell(<>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center"><CircleCheck size={52} className="text-green-700" /></div>
        <div className="text-[26px] font-bold">המכירה נשמרה</div>
        <div className="text-[15px] text-slate-700">הסחורה ירדה מהמלאי {result.source === "vehicle" ? "של הרכב" : "במחסן"}{result.icon ? " ונרשמה לאייקון אייר" : ""}</div>
        <div className="w-full bg-white border-[1.5px] border-slate-200 rounded-2xl p-3.5 flex flex-col gap-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">לקוח</span><span className="font-semibold">{result.icon ? `אייקון אייר (${endCustomer || customer?.name})` : customer?.name}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">פריטים</span><span className="font-semibold">{cartCount}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">תשלום</span><span className="font-semibold">{PAYMENTS.find((p) => p.key === payment)?.label}</span></div>
          {!result.icon && <div className="flex justify-between"><span className="text-slate-600">סכום</span><span className="font-semibold">{fmt(result.total)}</span></div>}
          <div className="flex justify-between"><span className="text-slate-600">מספר</span><span className="font-semibold">{result.order_tag}</span></div>
        </div>
      </div>
      <div className="px-4 pb-6 flex flex-col gap-2.5">
        <button onClick={resetSale} className={bigBtn} style={{ background: AMBER, color: NAVY }}>מכירה חדשה</button>
        <button onClick={onHome} className="h-12 rounded-2xl border border-slate-300 bg-white font-semibold hover:bg-slate-50 transition">{embedded ? "ללוח הבקרה" : "למסך הבית"}</button>
      </div>
    </>);
  }

  return shell(<div className="p-6">...</div>);
}

// ============================================================
// מחירון – מנהל בלבד. מחיר רגיל ומחיר לאייקון, לפני מע"מ.
// ============================================================
export function PriceList({ onBack }) {
  const [items, setItems] = useState([]);
  const [hints, setHints] = useState({}); // itemId -> { last, lastIcon }
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [it, cust, tx] = await Promise.all([
          supabase.from("items").select("id,name,category,unit,unit_cost,sale_price,icon_price").order("category").order("name"),
          supabase.from("customers").select("id,name").like("name", "אייקון אייר%"),
          supabase.from("transactions").select("item_id,unit_price,customer_id,note,created_at").eq("type", "install").not("unit_price", "is", null).order("created_at", { ascending: false }).limit(3000),
        ]);
        if (it.error) throw it.error;
        const iconIds = new Set((cust.data || []).map((c) => c.id));
        const h = {};
        (tx.data || []).forEach((t) => {
          const m = (t.note || "").match(/\((\d+(?:\.\d+)?)%\)/);
          const rate = m ? Number(m[1]) : 18;
          const pre = Math.round((Number(t.unit_price) / (1 + rate / 100)) * 100) / 100;
          if (!h[t.item_id]) h[t.item_id] = {};
          if (iconIds.has(t.customer_id)) { if (h[t.item_id].lastIcon == null) h[t.item_id].lastIcon = pre; }
          else if (pre > 0 && h[t.item_id].last == null) h[t.item_id].last = pre;
        });
        setItems((it.data || []).filter((i) => i.unit !== BULK_KG_UNIT && !/בדיקה/.test(i.name)));
        setHints(h);
      } catch (e) { setMsg(e.message); } finally { setLoading(false); }
    })();
  }, []);

  const val = (i, f) => (edits[i.id]?.[f] !== undefined ? edits[i.id][f] : i[f] ?? "");
  const setVal = (i, f, v) => setEdits({ ...edits, [i.id]: { ...(edits[i.id] || {}), [f]: v } });
  const fillFromHistory = () => {
    const next = { ...edits };
    items.forEach((i) => {
      const hh = hints[i.id] || {};
      if ((i.sale_price == null) && hh.last != null && next[i.id]?.sale_price === undefined) next[i.id] = { ...(next[i.id] || {}), sale_price: String(hh.last) };
      if ((i.icon_price == null) && hh.lastIcon != null && next[i.id]?.icon_price === undefined) next[i.id] = { ...(next[i.id] || {}), icon_price: String(hh.lastIcon) };
    });
    setEdits(next);
    setMsg("מולאו מחירים לפי המכירה האחרונה – בדוק ולחץ שמירה");
  };
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const changed = Object.entries(edits);
      for (const [id, e] of changed) {
        const patch = {};
        if (e.sale_price !== undefined) patch.sale_price = e.sale_price === "" ? null : Number(e.sale_price);
        if (e.icon_price !== undefined) patch.icon_price = e.icon_price === "" ? null : Number(e.icon_price);
        const { error } = await supabase.from("items").update(patch).eq("id", id);
        if (error) throw error;
      }
      setItems(items.map((i) => (edits[i.id] ? { ...i, ...Object.fromEntries(Object.entries(edits[i.id]).map(([k, v]) => [k, v === "" ? null : Number(v)])) } : i)));
      setEdits({});
      setMsg(`נשמרו ${changed.length} פריטים`);
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };

  const qq = norm(query);
  const shown = items.filter((i) => (!qq || norm(i.name).includes(qq)) && (!onlyMissing || i.sale_price == null || i.icon_price == null));
  const dirty = Object.keys(edits).length;

  return (<>
    <Header title="מחירון" subtitle='מחירים לפני מע"מ · רק ליאור ואלירן' onBack={onBack} />
    <div className="flex-1 px-3 py-3 flex flex-col gap-2.5">
      {loading ? <div className="flex items-center justify-center gap-2 py-10 text-slate-500"><Loader2 className="animate-spin" size={18} /> טוען...</div> : <>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש פריט" className="h-12 border border-slate-300 rounded-xl px-3 bg-white" />
        <div className="flex gap-2">
          <button onClick={() => setOnlyMissing(!onlyMissing)} className={`flex-1 h-11 rounded-xl text-sm ${onlyMissing ? "bg-slate-900 text-white" : "bg-white border border-slate-300"}`}>רק חסרי מחיר</button>
          <button onClick={fillFromHistory} className="flex-1 h-11 rounded-xl text-sm bg-white border border-slate-300">מלא חסרים מהמכירה האחרונה</button>
        </div>
        {msg && <div className="text-sm bg-amber-50 text-amber-900 rounded-xl px-3 py-2">{msg}</div>}
        {shown.map((i) => {
          const hh = hints[i.id] || {};
          return (
            <div key={i.id} className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col gap-2">
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-[15px]">{i.name.replace("תמצית ריח - ", "")}</span>
                <span className="text-xs text-slate-600 shrink-0">עלות {i.unit_cost != null ? fmt(i.unit_cost) : "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-600" htmlFor={`sp-${i.id}`}>מחיר רגיל</label>
                  <input id={`sp-${i.id}`} inputMode="decimal" value={val(i, "sale_price")} onChange={(e) => setVal(i, "sale_price", e.target.value)} className="w-full h-10 border border-slate-300 rounded-lg px-2" />
                  {hh.last != null && <div className="text-[11px] text-slate-500 mt-0.5">אחרון: {fmt(hh.last)}</div>}
                </div>
                <div>
                  <label className="text-xs text-slate-600" htmlFor={`ip-${i.id}`}>מחיר לאייקון</label>
                  <input id={`ip-${i.id}`} inputMode="decimal" value={val(i, "icon_price")} onChange={(e) => setVal(i, "icon_price", e.target.value)} className="w-full h-10 border border-slate-300 rounded-lg px-2" />
                  {hh.lastIcon != null && <div className="text-[11px] text-slate-500 mt-0.5">אחרון: {fmt(hh.lastIcon)}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </>}
    </div>
    <BottomBar>
      <button disabled={busy || !dirty} onClick={save} className={bigBtn} style={{ background: AMBER, color: NAVY }}>
        {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={20} />} שמירה{dirty ? ` (${dirty})` : ""}
      </button>
    </BottomBar>
  </>);
}
