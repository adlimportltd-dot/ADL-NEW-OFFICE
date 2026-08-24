import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Package, Warehouse, Users, ArrowLeftRight,
  ScrollText, Plus, X, TriangleAlert, Download, Truck, Building2,
  CircleCheck, CircleX, Trash2, ChevronLeft, Menu, LogOut, Loader2,
  Upload, Calculator, Ship, BarChart3, FileText, Printer, Gauge,
  Settings, Database, KeyRound, User, Pencil,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";

// ==================== API layer (merged inline - single file) ====================
// ---------- מיפוי snake_case (DB) <-> camelCase (UI) ----------
const mapItem = (r) => ({
  id: r.id, name: r.name, category: r.category, model: r.model,
  color: r.color, unit: r.unit, minThreshold: Number(r.min_threshold),
  unitCost: r.unit_cost !== null && r.unit_cost !== undefined ? Number(r.unit_cost) : null,
});
const mapLocation = (r) => ({ id: r.id, name: r.name, type: r.type });
const mapCustomer = (r) => ({ id: r.id, name: r.name, address: r.address, contact: r.contact });
const mapTransaction = (r) => ({
  id: r.id, type: r.type, itemId: r.item_id, qty: Number(r.qty),
  fromLocationId: r.from_location_id, toLocationId: r.to_location_id,
  customerId: r.customer_id, condition: r.condition, note: r.note,
  date: r.created_at,
});
const mapSupplier = (r) => ({ id: r.id, name: r.name, country: r.country, contact: r.contact, phone: r.phone, email: r.email });
const mapPO = (r) => ({
  id: r.id, poNumber: r.po_number, supplierId: r.supplier_id, status: r.status, date: r.created_at,
  lines: (r.po_lines || []).map((l) => ({ itemId: l.item_id, qty: Number(l.qty), unitPrice: Number(l.unit_price) })),
});

// ---------- Auth ----------
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}
async function signOut() {
  await supabase.auth.signOut();
}
function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
async function fetchMyProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (data) {
    return { id: data.id, fullName: data.full_name, role: data.role, locationId: data.location_id };
  }
  // אין עדיין שורת פרופיל למשתמש הזה (למשל: המשתמש נוצר ידנית ב-Dashboard ולא דרך הטריגר האוטומטי).
  // יוצרים אותה עכשיו - RLS מגביל יצירה עצמית לתפקיד 'technician' בלבד, קידום למנהל נעשה רק דרך SQL מפורש.
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({ id: userId, role: "technician" })
    .select()
    .maybeSingle();
  if (insertError) throw insertError;
  if (!created) throw new Error("לא ניתן היה ליצור פרופיל משתמש אוטומטית. פנה למנהל המערכת להרצת שורת ה-SQL הידנית.");
  return { id: created.id, fullName: created.full_name, role: created.role, locationId: created.location_id };
}

// ---------- Fetch everything needed for the app ----------
async function fetchAllData() {
  const [itemsRes, locationsRes, customersRes, stockRes, txRes, suppliersRes, posRes, settingsRes] = await Promise.all([
    supabase.from("items").select("*").order("category").order("name"),
    supabase.from("locations").select("*").order("type"),
    supabase.from("customers").select("*").order("name"),
    supabase.from("stock_levels").select("*"),
    supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("purchase_orders").select("*, po_lines(*)").order("created_at", { ascending: false }),
    supabase.from("app_settings").select("*"),
  ]);

  for (const r of [itemsRes, locationsRes, customersRes, stockRes, txRes, suppliersRes, posRes, settingsRes]) {
    if (r.error) throw r.error;
  }

  const stock = {};
  stockRes.data.forEach((row) => {
    stock[`${row.item_id}|${row.location_id}`] = Number(row.quantity);
  });

  const settings = {};
  (settingsRes.data || []).forEach((row) => { settings[row.key] = row.value; });
  let companySettings = { name: "אדל אימפורט", legalName: "ADL Import LTD", address: "ישראל", phone: "" };
  if (settings.company_settings) {
    try { companySettings = { ...companySettings, ...JSON.parse(settings.company_settings) }; } catch (e) {}
  }

  return {
    items: itemsRes.data.map(mapItem),
    locations: locationsRes.data.map(mapLocation),
    customers: customersRes.data.map(mapCustomer),
    stock,
    transactions: txRes.data.map(mapTransaction),
    suppliers: (suppliersRes.data || []).map(mapSupplier),
    purchaseOrders: (posRes.data || []).map(mapPO),
    logoUrl: settings.logo_url || null,
    companySettings,
  };
}

// ---------- Items ----------
async function addItem(item) {
  const { data, error } = await supabase.from("items").insert({
    name: item.name, category: item.category, unit: item.unit, min_threshold: item.minThreshold,
  }).select().single();
  if (error) throw error;
  return data.id;
}
async function updateItem(id, patch) {
  const payload = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.unit !== undefined) payload.unit = patch.unit;
  if (patch.minThreshold !== undefined) payload.min_threshold = patch.minThreshold;
  if (patch.unitCost !== undefined) payload.unit_cost = patch.unitCost;
  const { error } = await supabase.from("items").update(payload).eq("id", id);
  if (error) throw error;
}
async function setItemStock(itemId, locationId, quantity) {
  const { error } = await supabase.from("stock_levels").upsert(
    { item_id: itemId, location_id: locationId, quantity, updated_at: new Date().toISOString() },
    { onConflict: "item_id,location_id" }
  );
  if (error) throw error;
}
async function deleteItem(id) {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Locations ----------
async function addLocation(location) {
  const { error } = await supabase.from("locations").insert({ name: location.name, type: location.type });
  if (error) throw error;
}

// ---------- Customers ----------
async function addCustomer(customer) {
  const { error } = await supabase.from("customers").insert({
    name: customer.name, address: customer.address, contact: customer.contact,
  });
  if (error) throw error;
}

// ---------- Transactions ----------
// שים לב: אין צורך לעדכן מלאי ידנית - טריגר ב-DB (apply_transaction_to_stock)
// מעדכן את stock_levels אוטומטית עם כל שורה חדשה בטבלת transactions.
async function insertTransaction(tx) {
  const { error } = await supabase.from("transactions").insert({
    type: tx.type,
    item_id: tx.itemId,
    qty: tx.qty,
    from_location_id: tx.fromLocationId || null,
    to_location_id: tx.toLocationId || null,
    customer_id: tx.customerId || null,
    condition: tx.condition || null,
    note: tx.note || null,
  });
  if (error) throw error;
}

// ---------- Realtime ----------
// מאזין לשינויים במלאי ובתנועות מכל משתמש אחר, כדי לרענן את הדשבורד בזמן אמת
function subscribeToChanges(onChange) {
  const watchedTables = ["transactions", "stock_levels", "items", "locations", "customers", "suppliers", "purchase_orders", "po_lines", "app_settings"];
  let channel = supabase.channel("inventory-changes");
  watchedTables.forEach((table) => {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  });
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}

// ---------- Landed cost ----------
async function updateItemUnitCost(itemId, unitCost) {
  const { error } = await supabase.from("items").update({ unit_cost: unitCost }).eq("id", itemId);
  if (error) throw error;
}
async function updateItemsUnitCosts(updates) {
  // updates: [{ itemId, unitCost }]
  await Promise.all(updates.map((u) => updateItemUnitCost(u.itemId, u.unitCost)));
}

// ---------- Purchase Orders ----------
async function createPurchaseOrder(supplierId, lines) {
  const poNumber = `ADL-PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({ po_number: poNumber, supplier_id: supplierId, status: "draft" })
    .select()
    .single();
  if (error) throw error;
  const { error: linesError } = await supabase.from("po_lines").insert(
    lines.map((l) => ({ po_id: po.id, item_id: l.itemId, qty: l.qty, unit_price: l.unitPrice }))
  );
  if (linesError) throw linesError;
  return po.id;
}

// ---------- Settings / Logo ----------
async function updateLogoUrl(dataUrl) {
  const { error } = await supabase.from("app_settings").upsert({ key: "logo_url", value: dataUrl });
  if (error) throw error;
}
async function fetchPublicLogo() {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "logo_url").maybeSingle();
  if (error) return null;
  return data?.value || null;
}

// ---------- Settings / Company profile ----------
async function updateCompanySettings(settings) {
  const { error } = await supabase.from("app_settings").upsert({ key: "company_settings", value: JSON.stringify(settings) });
  if (error) throw error;
}

// ---------- Account: email + password ----------
async function updateAccountEmail(newEmail) {
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) throw error;
  // שים לב: שינוי דוא"ל ב-Supabase דורש כברירת מחדל אישור בקישור שנשלח לכתובת החדשה (ולעיתים גם לישנה)
}
async function changePassword(currentEmail, currentPassword, newPassword) {
  // מאמת את הסיסמה הנוכחית ע"י ניסיון התחברות מחדש, ורק אז מעדכן לסיסמה החדשה
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: currentEmail, password: currentPassword });
  if (verifyError) throw new Error("הסיסמה הנוכחית שגויה");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

const api = { signIn, signUp, signOut, onAuthChange, getSession, fetchMyProfile, fetchAllData, addItem, updateItem, setItemStock, deleteItem, addLocation, addCustomer, insertTransaction, subscribeToChanges, updateItemUnitCost, updateItemsUnitCosts, createPurchaseOrder, updateLogoUrl, fetchPublicLogo, updateCompanySettings, updateAccountEmail, changePassword };


const fmtDate = (iso) =>
  new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const CATEGORIES = { device: "מכשירים", consumable: "נוזלים ומתכלים" };
const PACKAGE_SIZES = ["25 ליטר", "5 ליטר", "1 ליטר", "0.5 ליטר", '250 מ"ל'];
const TX_TYPES = {
  receive: { label: "קבלת סחורה מספק", icon: Download, color: "emerald" },
  transfer: { label: "העברה למחסן/רכב", icon: ArrowLeftRight, color: "sky" },
  install: { label: "התקנה / ניפוק ללקוח", icon: Truck, color: "amber" },
  return: { label: "החזרה מלקוח", icon: CircleCheck, color: "violet" },
  writeoff: { label: "פחת / גריעה", icon: Trash2, color: "rose" },
};

function Badge({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700", emerald: "bg-emerald-100 text-emerald-800",
    sky: "bg-sky-100 text-sky-800", amber: "bg-amber-100 text-amber-800",
    violet: "bg-violet-100 text-violet-800", rose: "bg-rose-100 text-rose-800",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
          <h3 className="font-bold text-lg text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400";
const btnPrimary = "bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl px-4 py-3 text-[15px] transition disabled:opacity-40 disabled:cursor-not-allowed";
const btnGhost = "bg-white border border-gray-300 hover:bg-gray-50 text-slate-700 font-medium rounded-xl px-4 py-2.5 text-[15px] transition";

// לוגו החברה: תמונה שהועלתה (נשמרת ב-app_settings) אם קיימת, אחרת התג "A"
function LogoBadge({ logoUrl, size = 36, editable = false, onChange }) {
  const inputRef = React.useRef(null);
  const pick = () => inputRef.current?.click();
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { alert("קובץ הלוגו גדול מדי (מקסימום 3MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => onChange?.(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  return (
    <div className="relative shrink-0 rounded-lg overflow-hidden bg-amber-500 text-slate-900 font-bold flex items-center justify-center group" style={{ width: size, height: size }} onClick={editable ? pick : undefined}>
      {logoUrl ? <img src={logoUrl} alt="ADL Import" className="w-full h-full object-cover" /> : "A"}
      {editable && (
        <>
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer">
            <Upload size={14} className="text-white" />
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </>
      )}
    </div>
  );
}

// ==================== Login ====================
const ALLOWED_EMAIL = "adlimportltd25@gmail.com";
const ALLOWED_PASSWORD = "123456";

function LoginScreen({ onSuccess, logoUrl, initialError }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(""); setBusy(true);
    try {
      if (email.trim().toLowerCase() !== ALLOWED_EMAIL) {
        setError('גישה נדחתה. משתמש זה אינו מורשה להיכנס למערכת.');
        return;
      }
      if (password !== ALLOWED_PASSWORD) {
        setError('סיסמה שגויה, גישה נדחתה.');
        return;
      }
      await api.signIn(email.trim(), password);
      onSuccess();
    } catch (e) {
      setError(e.message || "שגיאת התחברות");
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div dir="rtl" lang="he" className="min-h-screen bg-slate-900 flex items-center justify-center p-4" style={{ fontFamily: "'Rubik','Assistant',sans-serif" }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <LogoBadge logoUrl={logoUrl} size={40} />
          <div>
            <div className="font-bold text-slate-900 leading-tight">אדל אימפורט</div>
            <div className="text-xs text-slate-500">ניהול מלאי</div>
          </div>
        </div>

        <Field label='דוא"ל'>
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKeyDown} autoFocus />
        </Field>
        <Field label="סיסמה">
          <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onKeyDown} />
        </Field>

        {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}

        <button onClick={submit} disabled={busy || !email || !password} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          התחברות
        </button>
        <p className="text-xs text-slate-400 mt-4 text-center">גישה מוגבלת לצוות אדל אימפורט המורשה בלבד · אין אפשרות הרשמה עצמאית</p>
      </div>
    </div>
  );
}

// ==================== Dashboard ====================
function Dashboard({ data, onExport }) {
  const { items, locations, stock } = data;
  const warehouse = locations.find((l) => l.type === "warehouse");
  const vehicles = locations.filter((l) => l.type === "vehicle");

  const rows = items.map((item) => {
    const whQty = stock[`${item.id}|${warehouse?.id}`] || 0;
    const vehicleQty = vehicles.reduce((s, v) => s + (stock[`${item.id}|${v.id}`] || 0), 0);
    const total = whQty + vehicleQty;
    return { item, whQty, vehicleQty, total, low: total < item.minThreshold };
  });

  const lowStock = rows.filter((r) => r.low);
  const totalUnits = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-5">
      {lowStock.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-rose-700 font-bold mb-2">
            <TriangleAlert size={18} /><span>{lowStock.length} פריטים מתחת לסף המלאי המינימלי</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((r) => (
              <span key={r.item.id} className="bg-white border border-rose-200 rounded-lg px-3 py-1.5 text-sm text-rose-700">
                {r.item.name}: <b>{r.total}</b> / סף {r.item.minThreshold}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">סה"כ יחידות במלאי</div><div className="text-2xl font-bold text-slate-800">{totalUnits}</div></div>
        <div className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">פריטים בקטלוג</div><div className="text-2xl font-bold text-slate-800">{items.length}</div></div>
        <div className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">מיקומים פעילים</div><div className="text-2xl font-bold text-slate-800">{locations.length}</div></div>
        <div className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">מתחת לסף</div><div className="text-2xl font-bold text-rose-600">{lowStock.length}</div></div>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-slate-800">מבט-על מלאי לפי פריט ומיקום</h3>
          <button onClick={onExport} className={btnGhost + " flex items-center gap-1.5 !py-1.5 !px-3 text-sm"}><Download size={16} /> ייצוא ל-CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-slate-500 text-right">
                <th className="px-4 py-2 font-medium">פריט</th><th className="px-4 py-2 font-medium">קטגוריה</th>
                <th className="px-4 py-2 font-medium">מחסן מרכזי</th><th className="px-4 py-2 font-medium">ברכבים</th>
                <th className="px-4 py-2 font-medium">סה"כ</th><th className="px-4 py-2 font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item.id} className="border-t">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.item.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{CATEGORIES[r.item.category]}</td>
                  <td className="px-4 py-2.5">{r.whQty} {r.item.unit}</td>
                  <td className="px-4 py-2.5">{r.vehicleQty} {r.item.unit}</td>
                  <td className="px-4 py-2.5 font-bold">{r.total} {r.item.unit}</td>
                  <td className="px-4 py-2.5">{r.low ? <Badge tone="rose">מתחת לסף</Badge> : <Badge tone="emerald">תקין</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==================== Items ====================
function ItemsScreen({ data, refresh, isAdmin }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "device", unit: "", minThreshold: 0, quantity: 0 });
  const [error, setError] = useState("");

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const warehouse = data.locations.find((l) => l.type === "warehouse");

  const submit = async () => {
    if (!form.name.trim() || !form.unit.trim()) return;
    try {
      const newItemId = await api.addItem({ ...form, minThreshold: Number(form.minThreshold) || 0 });
      const qty = Number(form.quantity) || 0;
      if (qty > 0 && warehouse) {
        await api.setItemStock(newItemId, warehouse.id, qty);
      }
      setForm({ name: "", category: "device", unit: "", minThreshold: 0, quantity: 0 });
      setOpen(false);
      await refresh();
    } catch (e) { setError(e.message); }
  };

  const removeItem = async (id) => {
    try { await api.deleteItem(id); await refresh(); } catch (e) { alert(e.message); }
  };

  const openEdit = (it) => {
    const currentQty = warehouse ? (data.stock[`${it.id}|${warehouse.id}`] || 0) : 0;
    setEditItem(it);
    setEditForm({ name: it.name, category: it.category, unit: it.unit, minThreshold: it.minThreshold, unitCost: it.unitCost ?? "", quantity: currentQty });
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editForm.name.trim() || !editForm.unit.trim()) { setEditError("שם פריט ויחידת מידה הם שדות חובה"); return; }
    setEditBusy(true);
    try {
      await api.updateItem(editItem.id, {
        name: editForm.name.trim(),
        category: editForm.category,
        unit: editForm.unit.trim(),
        minThreshold: Number(editForm.minThreshold) || 0,
        unitCost: editForm.unitCost === "" ? null : Number(editForm.unitCost),
      });
      if (warehouse) {
        await api.setItemStock(editItem.id, warehouse.id, Number(editForm.quantity) || 0);
      }
      await refresh();
      setEditItem(null);
    } catch (e) { setEditError(e.message); } finally { setEditBusy(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl text-slate-800">פריטים</h2>
        {isAdmin && <button onClick={() => setOpen(true)} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> פריט חדש</button>}
      </div>
      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-4 py-2 font-medium">שם פריט</th><th className="px-4 py-2 font-medium">קטגוריה</th>
              <th className="px-4 py-2 font-medium">יחידת מידה</th><th className="px-4 py-2 font-medium">סף מינימום</th>
              <th className="px-4 py-2 font-medium">עלות נחיתה ליח'</th><th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it) => (
              <tr key={it.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => isAdmin && openEdit(it)}>
                <td className="px-4 py-2.5 font-medium text-slate-800">{it.name}</td>
                <td className="px-4 py-2.5"><Badge tone={it.category === "device" ? "sky" : "violet"}>{CATEGORIES[it.category]}</Badge></td>
                <td className="px-4 py-2.5">{it.unit}</td>
                <td className="px-4 py-2.5">{it.minThreshold}</td>
                <td className="px-4 py-2.5">{it.unitCost ? `₪${Number(it.unitCost).toFixed(2)}` : <span className="text-slate-300">-</span>}</td>
                <td className="px-4 py-2.5 text-left" onClick={(e) => e.stopPropagation()}>
                  {isAdmin && (
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(it)} className="text-gray-400 hover:text-amber-600" title="עריכה"><Pencil size={16} /></button>
                      <button onClick={() => removeItem(it.id)} className="text-gray-400 hover:text-rose-600" title="מחיקה"><Trash2 size={16} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">אין פריטים עדיין</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="הוספת פריט חדש" onClose={() => setOpen(false)}>
          <Field label="שם פריט"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="קטגוריה">
            <select
              className={inputCls}
              value={form.category}
              onChange={(e) => {
                const category = e.target.value;
                const unit = category === "consumable" && !PACKAGE_SIZES.includes(form.unit) ? PACKAGE_SIZES[2] : form.unit;
                setForm({ ...form, category, unit });
              }}
            >
              <option value="device">מכשירים</option><option value="consumable">נוזלים ומתכלים</option>
            </select>
          </Field>
          {form.category === "consumable" ? (
            <Field label="גודל אריזה / נפח">
              <select className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {PACKAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="יחידת מידה"><input className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="יחידה" /></Field>
          )}
          <Field label={`כמות במלאי (מחסן מרכזי)${form.unit ? " - " + form.unit : ""}`}>
            <input type="number" min="0" className={inputCls} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" />
          </Field>
          <Field label="סף מלאי מינימלי להתראה"><input type="number" className={inputCls} value={form.minThreshold} onChange={(e) => setForm({ ...form, minThreshold: e.target.value })} /></Field>
          {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
          <button onClick={submit} className={btnPrimary + " w-full"}>שמירת פריט</button>
        </Modal>
      )}

      {editItem && (
        <Modal title="עריכת פריט" onClose={() => setEditItem(null)}>
          <Field label="שם פריט"><input className={inputCls} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
          <Field label="קטגוריה">
            <select
              className={inputCls}
              value={editForm.category}
              onChange={(e) => {
                const category = e.target.value;
                const unit = category === "consumable" && !PACKAGE_SIZES.includes(editForm.unit) ? PACKAGE_SIZES[2] : editForm.unit;
                setEditForm({ ...editForm, category, unit });
              }}
            >
              <option value="device">מכשירים</option><option value="consumable">נוזלים ומתכלים</option>
            </select>
          </Field>
          {editForm.category === "consumable" ? (
            <Field label="גודל אריזה / נפח">
              <select className={inputCls} value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}>
                {PACKAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="יחידת מידה"><input className={inputCls} value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} placeholder="יחידה" /></Field>
          )}
          <Field label={`כמות במלאי (מחסן מרכזי)${editForm.unit ? " - " + editForm.unit : ""}`}>
            <input type="number" min="0" className={inputCls} value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
          </Field>
          <Field label="סף מלאי מינימלי להתראה"><input type="number" className={inputCls} value={editForm.minThreshold} onChange={(e) => setEditForm({ ...editForm, minThreshold: e.target.value })} /></Field>
          <Field label="עלות נחיתה ליח' (₪)"><input type="number" min="0" step="0.01" className={inputCls} value={editForm.unitCost} onChange={(e) => setEditForm({ ...editForm, unitCost: e.target.value })} placeholder="לא הוגדר" /></Field>
          {editError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{editError}</div>}
          <button onClick={saveEdit} disabled={editBusy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{editBusy && <Loader2 size={16} className="animate-spin" />}שמירת שינויים</button>
        </Modal>
      )}
    </div>
  );
}

// ==================== Locations ====================
function LocationsScreen({ data, refresh, isAdmin }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "vehicle" });
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.name.trim()) return;
    try {
      await api.addLocation(form);
      setForm({ name: "", type: "vehicle" });
      setOpen(false);
      await refresh();
    } catch (e) { setError(e.message); }
  };

  const stockAt = (locId) => data.items.reduce((sum, it) => sum + (data.stock[`${it.id}|${locId}`] || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl text-slate-800">מיקומים</h2>
        {isAdmin && <button onClick={() => setOpen(true)} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> מיקום חדש</button>}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.locations.map((loc) => (
          <div key={loc.id} className="bg-white rounded-2xl border p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${loc.type === "warehouse" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
              {loc.type === "warehouse" ? <Building2 size={20} /> : <Truck size={20} />}
            </div>
            <div className="flex-1">
              <div className="font-bold text-slate-800">{loc.name}</div>
              <div className="text-sm text-slate-500">{loc.type === "warehouse" ? "מחסן" : "רכב טכנאי"} · {stockAt(loc.id)} יח' סה"כ</div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <Modal title="הוספת מיקום" onClose={() => setOpen(false)}>
          <Field label="סוג מיקום">
            <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="vehicle">רכב טכנאי</option><option value="warehouse">מחסן</option>
            </select>
          </Field>
          <Field label="שם המיקום"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
          <button onClick={submit} className={btnPrimary + " w-full"}>שמירת מיקום</button>
        </Modal>
      )}
    </div>
  );
}

// ==================== Customers ====================
function CustomersScreen({ data, refresh, isAdmin, onOpenFile }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", contact: "" });
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.name.trim()) return;
    try {
      await api.addCustomer(form);
      setForm({ name: "", address: "", contact: "" });
      setOpen(false);
      await refresh();
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl text-slate-800">לקוחות</h2>
        {isAdmin && <button onClick={() => setOpen(true)} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> לקוח חדש</button>}
      </div>
      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-4 py-2 font-medium">שם לקוח / עסק</th><th className="px-4 py-2 font-medium">כתובת</th>
              <th className="px-4 py-2 font-medium">איש קשר</th><th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.address}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.contact}</td>
                <td className="px-4 py-2.5 text-left"><button onClick={() => onOpenFile(c.id)} className="text-amber-600 hover:underline font-medium">תיק לקוח</button></td>
              </tr>
            ))}
            {data.customers.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">אין לקוחות עדיין</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="הוספת לקוח" onClose={() => setOpen(false)}>
          <Field label="שם לקוח / עסק"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="כתובת"><input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="איש קשר"><input className={inputCls} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
          {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
          <button onClick={submit} className={btnPrimary + " w-full"}>שמירת לקוח</button>
        </Modal>
      )}
    </div>
  );
}

function CustomerFile({ data, customerId, onBack }) {
  const customer = data.customers.find((c) => c.id === customerId);
  const history = data.transactions.filter((t) => t.customerId === customerId).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!customer) return null;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 mb-4 text-sm"><ChevronLeft size={16} /> חזרה לרשימת לקוחות</button>
      <div className="bg-white rounded-2xl border p-5 mb-4">
        <h2 className="font-bold text-xl text-slate-800">{customer.name}</h2>
        <p className="text-slate-500 mt-1">{customer.address}</p>
        <p className="text-slate-500">{customer.contact}</p>
      </div>
      <h3 className="font-bold text-slate-800 mb-2">היסטוריית התקנות וציוד</h3>
      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-4 py-2 font-medium">תאריך</th><th className="px-4 py-2 font-medium">פריט</th>
              <th className="px-4 py-2 font-medium">כמות</th><th className="px-4 py-2 font-medium">סוג</th><th className="px-4 py-2 font-medium">הערה</th>
            </tr>
          </thead>
          <tbody>
            {history.map((t) => {
              const item = data.items.find((i) => i.id === t.itemId);
              return (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-2.5 text-slate-500">{fmtDate(t.date)}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{item?.name || "-"}</td>
                  <td className="px-4 py-2.5">{t.qty}</td>
                  <td className="px-4 py-2.5"><Badge tone={TX_TYPES[t.type]?.color}>{TX_TYPES[t.type]?.label}</Badge></td>
                  <td className="px-4 py-2.5 text-slate-500">{t.note || "-"}</td>
                </tr>
              );
            })}
            {history.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">אין היסטוריה עדיין ללקוח זה</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== Transaction ====================
function TransactionScreen({ data, refresh, quickTx }) {
  const [type, setType] = useState(null);
  const [form, setForm] = useState({ itemId: "", qty: "", fromLocationId: "", toLocationId: "", customerId: "", condition: "ok", note: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const warehouse = data.locations.find((l) => l.type === "warehouse");
  const vehicles = data.locations.filter((l) => l.type === "vehicle");

  const resetForm = () => setForm({ itemId: "", qty: "", fromLocationId: "", toLocationId: "", customerId: "", condition: "ok", note: "" });

  const chooseType = (t) => {
    setType(t); setError(""); setSuccess("");
    const base = { itemId: "", qty: "", fromLocationId: "", toLocationId: "", customerId: "", condition: "ok", note: "" };
    if (t === "receive") base.toLocationId = warehouse?.id || "";
    if (t === "transfer") base.fromLocationId = warehouse?.id || "";
    setForm(base);
  };

  useEffect(() => {
    if (quickTx) chooseType(quickTx.type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickTx?.nonce]);

  const stockOf = (itemId, locId) => data.stock[`${itemId}|${locId}`] || 0;

  const submit = async () => {
    setError(""); setSuccess("");
    const qty = Number(form.qty);
    if (!form.itemId || !qty || qty <= 0) { setError("יש לבחור פריט ולהזין כמות תקינה"); return; }

    if (type === "receive" && !form.toLocationId) { setError("יש לבחור מיקום יעד"); return; }
    if (type === "transfer") {
      if (!form.fromLocationId || !form.toLocationId) { setError("יש לבחור מיקום מקור ויעד"); return; }
      if (form.fromLocationId === form.toLocationId) { setError("מקור ויעד לא יכולים להיות זהים"); return; }
      const avail = stockOf(form.itemId, form.fromLocationId);
      if (avail < qty) { setError(`אין מספיק מלאי במקור (זמין: ${avail})`); return; }
    }
    if (type === "install") {
      if (!form.fromLocationId) { setError("יש לבחור רכב מקור"); return; }
      if (!form.customerId) { setError("יש לבחור לקוח"); return; }
      const avail = stockOf(form.itemId, form.fromLocationId);
      if (avail < qty) { setError(`אין מספיק מלאי ברכב (זמין: ${avail})`); return; }
    }
    if (type === "return" && !form.toLocationId) { setError("יש לבחור מיקום יעד להחזרה"); return; }
    if (type === "writeoff") {
      if (!form.fromLocationId) { setError("יש לבחור מיקום"); return; }
      const avail = stockOf(form.itemId, form.fromLocationId);
      if (avail < qty) { setError(`אין מספיק מלאי לגריעה (זמין: ${avail})`); return; }
    }

    setBusy(true);
    try {
      await api.insertTransaction({
        type, itemId: form.itemId, qty,
        fromLocationId: form.fromLocationId || null,
        toLocationId: form.toLocationId || null,
        customerId: form.customerId || null,
        condition: type === "return" ? form.condition : null,
        note: form.note || "",
      });
      await refresh();
      setSuccess("התנועה נרשמה בהצלחה");
      resetForm();
      if (type === "receive") setForm((f) => ({ ...f, toLocationId: warehouse?.id || "" }));
      if (type === "transfer") setForm((f) => ({ ...f, fromLocationId: warehouse?.id || "" }));
    } catch (e) {
      setError(e.message || "שגיאה בביצוע התנועה - ייתכן שאין לך הרשאה למיקום זה");
    } finally {
      setBusy(false);
    }
  };

  if (!type) {
    return (
      <div>
        <h2 className="font-bold text-xl text-slate-800 mb-4">תנועת מלאי חדשה</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(TX_TYPES).map(([key, cfg]) => {
            const Icon = cfg.icon;
            return (
              <button key={key} onClick={() => chooseType(key)} className="bg-white border rounded-2xl p-5 sm:p-6 flex flex-col items-center gap-2.5 hover:border-amber-400 hover:shadow-md transition text-center">
                <div className={`p-3.5 rounded-2xl bg-${cfg.color}-100 text-${cfg.color}-700`}><Icon size={26} /></div>
                <span className="font-bold text-slate-800 text-[15px]">{cfg.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const cfg = TX_TYPES[type];
  return (
    <div>
      <button onClick={() => setType(null)} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 mb-4 text-sm"><ChevronLeft size={16} /> בחירת סוג תנועה אחרת</button>
      <div className={`bg-${cfg.color}-50 border border-${cfg.color}-200 rounded-2xl p-4 sm:p-6 max-w-lg`}>
        <h2 className="font-bold text-xl text-slate-800 mb-4">{cfg.label}</h2>

        <Field label="פריט">
          <select className={inputCls} value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })}>
            <option value="">בחר פריט...</option>
            {data.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
          </select>
        </Field>

        <Field label={`כמות${form.itemId ? " (" + (data.items.find((i) => i.id === form.itemId)?.unit || "") + ")" : ""}`}>
          <input type="number" min="1" className={inputCls} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
        </Field>

        {type === "transfer" && (
          <Field label="ממיקום">
            <select className={inputCls} value={form.fromLocationId} onChange={(e) => setForm({ ...form, fromLocationId: e.target.value })}>
              <option value="">בחר מיקום...</option>
              {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        )}

        {(type === "install" || type === "writeoff") && (
          <Field label={type === "install" ? "מרכב טכנאי" : "ממיקום"}>
            <select className={inputCls} value={form.fromLocationId} onChange={(e) => setForm({ ...form, fromLocationId: e.target.value })}>
              <option value="">בחר מיקום...</option>
              {(type === "install" ? vehicles : data.locations).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        )}

        {(type === "transfer" || type === "receive" || type === "return") && (
          <Field label={type === "receive" ? "אל מיקום (מחסן)" : "אל מיקום"}>
            <select className={inputCls} value={form.toLocationId} onChange={(e) => setForm({ ...form, toLocationId: e.target.value })}>
              <option value="">בחר מיקום...</option>
              {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        )}

        {(type === "install" || type === "return") && (
          <Field label="לקוח">
            <select className={inputCls} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">בחר לקוח...</option>
              {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}

        {type === "return" && (
          <Field label="מצב הפריט המוחזר">
            <div className="flex gap-2">
              <button onClick={() => setForm({ ...form, condition: "ok" })} className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 border font-medium ${form.condition === "ok" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white border-gray-300 text-slate-600"}`}><CircleCheck size={16} /> תקין</button>
              <button onClick={() => setForm({ ...form, condition: "faulty" })} className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 border font-medium ${form.condition === "faulty" ? "bg-rose-500 text-white border-rose-500" : "bg-white border-gray-300 text-slate-600"}`}><CircleX size={16} /> תקול</button>
            </div>
          </Field>
        )}

        <Field label="הערה (לא חובה)"><textarea className={inputCls} rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>

        {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
        {success && <div className="bg-emerald-100 text-emerald-700 text-sm rounded-xl px-3 py-2 mb-3">{success}</div>}

        <button onClick={submit} disabled={busy} className={btnPrimary + " w-full text-lg py-3.5 flex items-center justify-center gap-2"}>
          {busy && <Loader2 size={18} className="animate-spin" />} אישור וביצוע
        </button>
      </div>
    </div>
  );
}

// ==================== Audit log ====================
function AuditLog({ data }) {
  const [filter, setFilter] = useState("all");
  const rows = data.transactions.filter((t) => filter === "all" || t.type === filter);
  const locName = (id) => data.locations.find((l) => l.id === id)?.name || "-";
  const custName = (id) => data.customers.find((c) => c.id === id)?.name || "-";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-bold text-xl text-slate-800">יומן אירועים (Audit Log)</h2>
        <select className={inputCls + " w-auto"} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">כל התנועות</option>
          {Object.entries(TX_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-2xl border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-4 py-2 font-medium">תאריך</th><th className="px-4 py-2 font-medium">סוג</th>
              <th className="px-4 py-2 font-medium">פריט</th><th className="px-4 py-2 font-medium">כמות</th>
              <th className="px-4 py-2 font-medium">ממיקום</th><th className="px-4 py-2 font-medium">אל מיקום</th>
              <th className="px-4 py-2 font-medium">לקוח</th><th className="px-4 py-2 font-medium">הערה</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const item = data.items.find((i) => i.id === t.itemId);
              return (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="px-4 py-2.5"><Badge tone={TX_TYPES[t.type]?.color}>{TX_TYPES[t.type]?.label}</Badge></td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{item?.name || "-"}</td>
                  <td className="px-4 py-2.5">{t.qty}</td>
                  <td className="px-4 py-2.5 text-slate-500">{t.fromLocationId ? locName(t.fromLocationId) : "-"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{t.toLocationId ? locName(t.toLocationId) : "-"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{t.customerId ? custName(t.customerId) : "-"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{t.note || (t.condition === "faulty" ? "התקבל כתקול" : "")}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">אין תנועות תואמות</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== Nav ====================
// ==================== מחשבון יבוא ועלויות נחיתה (Landed Cost) ====================
function LandedCostScreen({ data, refresh }) {
  const [overhead, setOverhead] = useState({ shipping: "", customs: "", brokerage: "", inland: "", wireFee: "", fxFeeValue: "", fxFeeMode: "percent" });
  const [method, setMethod] = useState("value");
  const [lines, setLines] = useState([{ id: Math.random().toString(36).slice(2), itemId: "", qty: "", unitPrice: "", unitVolume: "" }]);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);

  const setLine = (id, patch) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines([...lines, { id: Math.random().toString(36).slice(2), itemId: "", qty: "", unitPrice: "", unitVolume: "" }]);
  const removeLine = (id) => setLines(lines.filter((l) => l.id !== id));

  const validLines = lines.filter((l) => l.itemId && Number(l.qty) > 0 && Number(l.unitPrice) >= 0);
  const totalGoodsValue = validLines.reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0);
  const fixedOverhead = ["shipping", "customs", "brokerage", "inland", "wireFee"].reduce((s, k) => s + (Number(overhead[k]) || 0), 0);
  const fxFeeAmount = overhead.fxFeeMode === "percent"
    ? totalGoodsValue * ((Number(overhead.fxFeeValue) || 0) / 100)
    : (Number(overhead.fxFeeValue) || 0);
  const totalOverhead = fixedOverhead + fxFeeAmount;

  const totalBasis = validLines.reduce((s, l) => {
    const qty = Number(l.qty);
    return s + (method === "value" ? qty * Number(l.unitPrice) : qty * (Number(l.unitVolume) || 0));
  }, 0);
  const results = validLines.map((l) => {
    const qty = Number(l.qty);
    const unitPrice = Number(l.unitPrice);
    const basis = method === "value" ? qty * unitPrice : qty * (Number(l.unitVolume) || 0);
    const share = totalBasis > 0 ? basis / totalBasis : 0;
    const allocatedOverhead = totalOverhead * share;
    const landedPerUnit = unitPrice + allocatedOverhead / qty;
    const item = data.items.find((i) => i.id === l.itemId);
    return { ...l, item, qty, unitPrice, share, allocatedOverhead, landedPerUnit };
  });
  const canCompute = validLines.length > 0 && totalBasis > 0;

  const applyToInventory = async () => {
    setBusy(true);
    try {
      await api.updateItemsUnitCosts(results.map((r) => ({ itemId: r.itemId, unitCost: Math.round(r.landedPerUnit * 100) / 100 })));
      await refresh();
      setUpdated(true);
      setTimeout(() => setUpdated(false), 3000);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <h2 className="font-bold text-xl text-slate-800 mb-1 flex items-center gap-2"><Ship size={22} className="text-amber-600" /> מחשבון יבוא ועלויות נחיתה (Landed Cost)</h2>
      <p className="text-slate-500 text-sm mb-4">חשב את מחיר הנחיתה הסופי ליחידה עבור משלוח, וחלק את עלויות המשלוח בין הפריטים לפי נפח או לפי ערך.</p>
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="font-bold text-slate-800 mb-3">עלויות המשלוח (₪)</h3>
          <Field label="הובלה ימית / אווירית"><input type="number" min="0" className={inputCls} value={overhead.shipping} onChange={(e) => setOverhead({ ...overhead, shipping: e.target.value })} /></Field>
          <Field label="מכס"><input type="number" min="0" className={inputCls} value={overhead.customs} onChange={(e) => setOverhead({ ...overhead, customs: e.target.value })} /></Field>
          <Field label="עמילות מכס"><input type="number" min="0" className={inputCls} value={overhead.brokerage} onChange={(e) => setOverhead({ ...overhead, brokerage: e.target.value })} /></Field>
          <Field label="הובלה יבשתית"><input type="number" min="0" className={inputCls} value={overhead.inland} onChange={(e) => setOverhead({ ...overhead, inland: e.target.value })} /></Field>
          <Field label="דמי העברה בנקאית (Wire / SWIFT)"><input type="number" min="0" className={inputCls} value={overhead.wireFee} onChange={(e) => setOverhead({ ...overhead, wireFee: e.target.value })} /></Field>
          <Field label='עמלות מט"ח'>
            <div className="flex gap-2">
              <input type="number" min="0" step="0.01" className={inputCls} value={overhead.fxFeeValue} onChange={(e) => setOverhead({ ...overhead, fxFeeValue: e.target.value })} placeholder={overhead.fxFeeMode === "percent" ? "לדוגמה: 1.5" : "לדוגמה: 350"} />
              <div className="flex shrink-0 rounded-xl border border-gray-300 overflow-hidden">
                <button type="button" onClick={() => setOverhead({ ...overhead, fxFeeMode: "percent" })} className={`px-3 text-sm font-medium ${overhead.fxFeeMode === "percent" ? "bg-amber-500 text-white" : "bg-white text-slate-600"}`}>%</button>
                <button type="button" onClick={() => setOverhead({ ...overhead, fxFeeMode: "amount" })} className={`px-3 text-sm font-medium ${overhead.fxFeeMode === "amount" ? "bg-amber-500 text-white" : "bg-white text-slate-600"}`}>₪</button>
              </div>
            </div>
            {overhead.fxFeeMode === "percent" && totalGoodsValue > 0 && (
              <div className="text-xs text-slate-400 mt-1">= ₪{fxFeeAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} על שווי סחורה של ₪{totalGoodsValue.toLocaleString()}</div>
            )}
          </Field>
          <div className="border-t pt-3 mt-1 flex items-center justify-between"><span className="text-slate-600 font-medium">סה"כ עלויות משלוח</span><span className="font-bold text-slate-800">₪{totalOverhead.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
        </div>
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="font-bold text-slate-800 mb-3">שיטת חלוקת העלויות</h3>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setMethod("value")} className={`flex-1 rounded-xl py-2.5 border font-medium text-sm ${method === "value" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}>לפי ערך הפריט</button>
            <button onClick={() => setMethod("volume")} className={`flex-1 rounded-xl py-2.5 border font-medium text-sm ${method === "volume" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}>לפי נפח</button>
          </div>
          <p className="text-sm text-slate-500">{method === "value" ? "עלויות המשלוח יחולקו ביחס לערך הכולל של כל שורה." : "עלויות המשלוח יחולקו ביחס לנפח הכולל שלהן במכולה."}</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border p-4 mb-4">
        <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800">פריטים במשלוח</h3><button onClick={addLine} className={btnGhost + " flex items-center gap-1.5 !py-1.5 !px-3 text-sm"}><Plus size={16} /> הוספת שורה</button></div>
        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.id} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end border-b pb-3 last:border-0 last:pb-0">
              <div className="col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">פריט</label>
                <select className={inputCls} value={l.itemId} onChange={(e) => setLine(l.id, { itemId: e.target.value })}><option value="">בחר פריט...</option>{data.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}</select>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">כמות</label><input type="number" min="1" className={inputCls} value={l.qty} onChange={(e) => setLine(l.id, { qty: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">מחיר ליח' (₪)</label><input type="number" min="0" step="0.01" className={inputCls} value={l.unitPrice} onChange={(e) => setLine(l.id, { unitPrice: e.target.value })} /></div>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><label className="block text-xs font-medium text-slate-500 mb-1">נפח ליח' (CBM)</label><input type="number" min="0" step="0.001" className={inputCls} value={l.unitVolume} onChange={(e) => setLine(l.id, { unitVolume: e.target.value })} disabled={method !== "volume"} /></div>
                {lines.length > 1 && <button onClick={() => removeLine(l.id)} className="text-gray-400 hover:text-rose-600 mb-2.5"><Trash2 size={16} /></button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {canCompute && (
        <div className="bg-white rounded-2xl border overflow-hidden mb-4">
          <div className="px-4 py-3 border-b"><h3 className="font-bold text-slate-800">תוצאת חישוב עלות הנחיתה</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-4 py-2 font-medium">פריט</th><th className="px-4 py-2 font-medium">כמות</th><th className="px-4 py-2 font-medium">מחיר בסיס</th><th className="px-4 py-2 font-medium">חלק יחסי</th><th className="px-4 py-2 font-medium">Landed Cost ליח'</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.item?.name || "-"}</td>
                    <td className="px-4 py-2.5">{r.qty}</td>
                    <td className="px-4 py-2.5">₪{r.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-2.5">{(r.share * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2.5 font-bold text-amber-700">₪{r.landedPerUnit.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t flex items-center justify-between flex-wrap gap-2">
            {updated && <span className="text-emerald-600 text-sm font-medium flex items-center gap-1.5"><CircleCheck size={16} /> ערכי המלאי עודכנו ב-DB</span>}
            <button onClick={applyToInventory} disabled={busy} className={btnPrimary + " flex items-center gap-2 mr-auto"}>{busy && <Loader2 size={16} className="animate-spin" />}<Package size={18} /> עדכון ערך הציוד בטבלת המלאי</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== דוחות: ערך מלאי + חיזוי וקצב צריכה ====================
function ReportsScreen({ data }) {
  const [sub, setSub] = useState("valuation");
  return (
    <div>
      <h2 className="font-bold text-xl text-slate-800 mb-4">דוחות וערך מלאי</h2>
      <div className="flex gap-2 mb-5">
        <button onClick={() => setSub("valuation")} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium border ${sub === "valuation" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}><BarChart3 size={16} /> שווי מלאי</button>
        <button onClick={() => setSub("forecast")} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium border ${sub === "forecast" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}><Gauge size={16} /> חיזוי מלאי</button>
      </div>
      {sub === "valuation" ? <ValuationReport data={data} /> : <ForecastReport data={data} />}
    </div>
  );
}

function ValuationReport({ data }) {
  const { items, locations, stock } = data;
  const warehouse = locations.find((l) => l.type === "warehouse");
  const vehicles = locations.filter((l) => l.type === "vehicle");
  const missingCost = items.some((it) => !it.unitCost);
  const rows = items.map((item) => {
    const whQty = stock[`${item.id}|${warehouse?.id}`] || 0;
    const vehQty = vehicles.reduce((s, v) => s + (stock[`${item.id}|${v.id}`] || 0), 0);
    const totalQty = whQty + vehQty;
    const unitCost = item.unitCost || 0;
    return { item, totalQty, unitCost, value: totalQty * unitCost };
  });
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const byCategory = ["device", "consumable"].map((cat) => ({ cat, value: rows.filter((r) => r.item.category === cat).reduce((s, r) => s + r.value, 0) }));
  const topProducts = [...rows].sort((a, b) => b.value - a.value).filter((r) => r.value > 0).slice(0, 10);

  return (
    <div className="space-y-5">
      {missingCost && <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-800 flex items-center gap-2"><TriangleAlert size={16} /> חלק מהפריטים ללא עלות נחיתה - השווי שלהם לא נכלל.</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">שווי מלאי כולל</div><div className="text-2xl font-bold text-slate-800">₪{totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>
        {byCategory.map((c) => <div key={c.cat} className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">שווי {CATEGORIES[c.cat]}</div><div className="text-2xl font-bold text-slate-800">₪{c.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>)}
      </div>
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="px-4 py-3 border-b"><h3 className="font-bold text-slate-800">שווי לפי מוצר (Top 10)</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-4 py-2 font-medium">פריט</th><th className="px-4 py-2 font-medium">כמות</th><th className="px-4 py-2 font-medium">עלות ליח'</th><th className="px-4 py-2 font-medium">שווי כולל</th></tr></thead>
            <tbody>
              {topProducts.map((r) => (
                <tr key={r.item.id} className="border-t">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.item.name}</td>
                  <td className="px-4 py-2.5">{r.totalQty}</td>
                  <td className="px-4 py-2.5">₪{r.unitCost.toFixed(2)}</td>
                  <td className="px-4 py-2.5 font-bold">₪{r.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                </tr>
              ))}
              {topProducts.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">אין עדיין שווי מחושב</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ForecastReport({ data }) {
  const [leadTime, setLeadTime] = useState(60);
  const { items, locations, stock, transactions } = data;
  const now = Date.now();
  const rows = items.map((item) => {
    const currentStock = locations.reduce((s, l) => s + (stock[`${item.id}|${l.id}`] || 0), 0);
    const consumedTx = transactions.filter((t) => t.itemId === item.id && (t.type === "install" || t.type === "writeoff"));
    const consumedQty = consumedTx.reduce((s, t) => s + t.qty, 0);
    let dailyRate = 0;
    if (consumedTx.length > 0) {
      const earliest = Math.min(...consumedTx.map((t) => new Date(t.date).getTime()));
      dailyRate = consumedQty / Math.max(1, (now - earliest) / 86400000);
    }
    const monthlyRate = dailyRate * 30;
    const daysRemaining = dailyRate > 0 ? currentStock / dailyRate : null;
    let status = "no-data";
    if (dailyRate > 0) status = daysRemaining < leadTime ? "urgent" : daysRemaining < leadTime * 1.3 ? "soon" : "ok";
    return { item, currentStock, monthlyRate, daysRemaining, status };
  });
  const statusMeta = { urgent: { label: "דחוף - להזמין מיד", tone: "rose" }, soon: { label: "להזמין בקרוב", tone: "amber" }, ok: { label: "תקין", tone: "emerald" }, "no-data": { label: "אין מספיק היסטוריה", tone: "gray" } };
  const sorted = [...rows].sort((a, b) => {
    const rank = { urgent: 0, soon: 1, ok: 2, "no-data": 3 };
    return rank[a.status] !== rank[b.status] ? rank[a.status] - rank[b.status] : (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999);
  });
  const urgentCount = rows.filter((r) => r.status === "urgent").length;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border p-4">
        <Field label="זמן אספקה (Lead Time) בימים - יבוא מסין/צרפת"><input type="number" min="1" className={inputCls + " w-32"} value={leadTime} onChange={(e) => setLeadTime(Number(e.target.value) || 60)} /></Field>
        <p className="text-sm text-slate-500">טווח מקובל: 45-60 יום. פריט עם פחות ימי מלאי מזמן האספקה מסומן דחוף.</p>
      </div>
      {urgentCount > 0 && <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4"><div className="flex items-center gap-2 text-rose-700 font-bold"><TriangleAlert size={18} /><span>{urgentCount} פריטים דחופים להזמנת רכש</span></div></div>}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="px-4 py-3 border-b"><h3 className="font-bold text-slate-800">קצב צריכה וימי מלאי נותרים</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-4 py-2 font-medium">פריט</th><th className="px-4 py-2 font-medium">מלאי נוכחי</th><th className="px-4 py-2 font-medium">קצב חודשי</th><th className="px-4 py-2 font-medium">ימי מלאי נותרים</th><th className="px-4 py-2 font-medium">סטטוס</th></tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.item.id} className="border-t">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.item.name}</td>
                  <td className="px-4 py-2.5">{r.currentStock} {r.item.unit}</td>
                  <td className="px-4 py-2.5">{r.monthlyRate > 0 ? `${r.monthlyRate.toFixed(1)} ${r.item.unit}/חודש` : "-"}</td>
                  <td className="px-4 py-2.5">{r.daysRemaining !== null ? Math.round(r.daysRemaining) : "-"}</td>
                  <td className="px-4 py-2.5"><Badge tone={statusMeta[r.status].tone}>{statusMeta[r.status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==================== הזמנות רכש (Purchase Orders) ====================
function POsScreen({ data, refresh, onPrint }) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState([{ id: Math.random().toString(36).slice(2), itemId: "", qty: "", unitPrice: "" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const openNew = () => { setSupplierId(data.suppliers[0]?.id || ""); setLines([{ id: Math.random().toString(36).slice(2), itemId: "", qty: "", unitPrice: "" }]); setError(""); setOpen(true); };
  const setLine = (id, patch) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines([...lines, { id: Math.random().toString(36).slice(2), itemId: "", qty: "", unitPrice: "" }]);
  const removeLine = (id) => setLines(lines.filter((l) => l.id !== id));
  const onPickItem = (id, itemId) => { const it = data.items.find((i) => i.id === itemId); setLine(id, { itemId, unitPrice: it?.unitCost ? String(it.unitCost) : "" }); };

  const submit = async () => {
    setError("");
    const valid = lines.filter((l) => l.itemId && Number(l.qty) > 0 && Number(l.unitPrice) >= 0);
    if (!supplierId) { setError("יש לבחור ספק"); return; }
    if (valid.length === 0) { setError("יש להוסיף לפחות שורת פריט אחת"); return; }
    setBusy(true);
    try {
      const poId = await api.createPurchaseOrder(supplierId, valid.map((l) => ({ itemId: l.itemId, qty: Number(l.qty), unitPrice: Number(l.unitPrice) })));
      await refresh();
      setOpen(false);
      onPrint(poId);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const poTotal = (po) => po.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4"><h2 className="font-bold text-xl text-slate-800">הזמנות רכש (Purchase Orders)</h2><button onClick={openNew} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> PO חדש</button></div>
      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-4 py-2 font-medium">מס' הזמנה</th><th className="px-4 py-2 font-medium">תאריך</th><th className="px-4 py-2 font-medium">ספק</th><th className="px-4 py-2 font-medium">שורות</th><th className="px-4 py-2 font-medium">סה"כ</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {data.purchaseOrders.map((po) => {
              const supplier = data.suppliers.find((s) => s.id === po.supplierId);
              return (
                <tr key={po.id} className="border-t">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{po.poNumber}</td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtDate(po.date)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{supplier?.name} ({supplier?.country})</td>
                  <td className="px-4 py-2.5">{po.lines.length}</td>
                  <td className="px-4 py-2.5 font-bold">₪{poTotal(po).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-2.5 text-left"><button onClick={() => onPrint(po.id)} className="text-amber-600 hover:underline font-medium flex items-center gap-1"><Printer size={14} /> צפייה/הדפסה</button></td>
                </tr>
              );
            })}
            {data.purchaseOrders.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">עדיין לא נוצרו הזמנות רכש</td></tr>}
          </tbody>
        </table>
      </div>
      {open && (
        <Modal title="הזמנת רכש חדשה" onClose={() => setOpen(false)}>
          <Field label="ספק"><select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}</select></Field>
          <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-slate-600">פריטים</span><button onClick={addLine} className={btnGhost + " !py-1 !px-2.5 text-xs"}><Plus size={14} className="inline" /> שורה</button></div>
          <div className="space-y-2 mb-4">
            {lines.map((l) => (
              <div key={l.id} className="grid grid-cols-6 gap-1.5 items-center">
                <select className={inputCls + " col-span-3 !py-2 text-sm"} value={l.itemId} onChange={(e) => onPickItem(l.id, e.target.value)}><option value="">פריט...</option>{data.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}</select>
                <input type="number" min="1" placeholder="כמות" className={inputCls + " col-span-1 !py-2 text-sm"} value={l.qty} onChange={(e) => setLine(l.id, { qty: e.target.value })} />
                <input type="number" min="0" step="0.01" placeholder="מחיר" className={inputCls + " col-span-1 !py-2 text-sm"} value={l.unitPrice} onChange={(e) => setLine(l.id, { unitPrice: e.target.value })} />
                {lines.length > 1 && <button onClick={() => removeLine(l.id)} className="text-gray-400 hover:text-rose-600 justify-self-center"><Trash2 size={15} /></button>}
              </div>
            ))}
          </div>
          {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
          <button onClick={submit} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}יצירת הזמנה והפקת מסמך</button>
        </Modal>
      )}
    </div>
  );
}

function POPrintView({ data, poId, onClose }) {
  const po = data.purchaseOrders.find((p) => p.id === poId);
  if (!po) return null;
  const supplier = data.suppliers.find((s) => s.id === po.supplierId);
  const lineRows = po.lines.map((l) => { const item = data.items.find((i) => i.id === l.itemId); return { ...l, name: item?.name || "-", unit: item?.unit || "", lineTotal: l.qty * l.unitPrice }; });
  const grandTotal = lineRows.reduce((s, l) => s + l.lineTotal, 0);
  return (
    <div className="fixed inset-0 bg-slate-800/60 z-50 overflow-y-auto py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b print:hidden">
          <button onClick={onClose} className={btnGhost + " flex items-center gap-1.5"}><ChevronLeft size={16} /> סגירה</button>
          <button onClick={() => window.print()} className={btnPrimary + " flex items-center gap-2"}><Printer size={18} /> Print / Save as PDF</button>
        </div>
        <div dir="ltr" lang="en" className="p-8" style={{ fontFamily: "Arial, sans-serif" }}>
          <div className="flex items-start justify-between mb-8">
            <div><div className="text-2xl font-bold text-slate-900">ADL Import LTD</div><div className="text-sm text-slate-500 mt-1">אדל אימפורט</div><div className="text-sm text-slate-500">Israel</div></div>
            <div className="text-left"><div className="text-xl font-bold text-amber-600">PURCHASE ORDER</div><div className="text-sm text-slate-600 mt-1">PO #: {po.poNumber}</div><div className="text-sm text-slate-600">Date: {new Date(po.date).toLocaleDateString("en-GB")}</div></div>
          </div>
          <div className="mb-6 bg-gray-50 rounded-xl p-4">
            <div className="text-xs uppercase text-slate-400 font-bold mb-1">Supplier</div>
            <div className="font-bold text-slate-800">{supplier?.name}</div>
            <div className="text-sm text-slate-600">{supplier?.country}</div>
            <div className="text-sm text-slate-600">Attn: {supplier?.contact}</div>
            <div className="text-sm text-slate-600">{supplier?.phone} · {supplier?.email}</div>
          </div>
          <table className="w-full text-sm mb-6 border-collapse">
            <thead><tr className="border-b-2 border-slate-800 text-left"><th className="py-2 font-bold">SKU / Item</th><th className="py-2 font-bold">Qty</th><th className="py-2 font-bold">Unit Price</th><th className="py-2 font-bold text-right">Line Total</th></tr></thead>
            <tbody>{lineRows.map((l, i) => (<tr key={i} className="border-b border-slate-200"><td className="py-2">{l.name}</td><td className="py-2">{l.qty} {l.unit}</td><td className="py-2">${l.unitPrice.toFixed(2)}</td><td className="py-2 text-right">${l.lineTotal.toFixed(2)}</td></tr>))}</tbody>
            <tfoot><tr><td colSpan={3} className="pt-3 text-right font-bold">Grand Total</td><td className="pt-3 text-right font-bold">${grandTotal.toFixed(2)}</td></tr></tfoot>
          </table>
          <div className="text-xs text-slate-400 border-t pt-4">This purchase order was generated by ADL Import LTD inventory management system.</div>
        </div>
      </div>
    </div>
  );
}

// ==================== הגדרות: פרופיל, אבטחה, חיבור מסד נתונים ====================
function SettingsScreen({ data, refresh, userEmail, logoUrl, onLogoChange, isAdmin }) {
  const [company, setCompany] = useState(data.companySettings);
  const [companySaved, setCompanySaved] = useState(false);
  const [companyBusy, setCompanyBusy] = useState(false);

  const [newEmail, setNewEmail] = useState(userEmail);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const [logoFileName, setLogoFileName] = useState("");
  const [logoSaved, setLogoSaved] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = React.useRef(null);

  const saveCompany = async () => {
    setCompanyBusy(true);
    try { await api.updateCompanySettings(company); await refresh(); setCompanySaved(true); setTimeout(() => setCompanySaved(false), 2500); }
    catch (e) { alert(e.message); } finally { setCompanyBusy(false); }
  };

  const saveProfile = async () => {
    setProfileError(""); setProfileSaved(false);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
    if (!emailOk) { setProfileError('כתובת דוא"ל לא תקינה'); return; }
    setProfileBusy(true);
    try {
      await api.updateAccountEmail(newEmail.trim());
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 4000);
    } catch (e) { setProfileError(e.message); } finally { setProfileBusy(false); }
  };

  const changePassword = async () => {
    setPwError(""); setPwSaved(false);
    if (!currentPw || !newPw || !confirmPw) { setPwError("יש למלא את כל השדות"); return; }
    if (newPw.length < 6) { setPwError("סיסמה חדשה חייבת להכיל לפחות 6 תווים"); return; }
    if (newPw !== confirmPw) { setPwError("אימות הסיסמה אינו תואם לסיסמה החדשה"); return; }
    setPwBusy(true);
    try {
      await api.changePassword(userEmail, currentPw, newPw);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 2500);
    } catch (e) { setPwError(e.message); } finally { setPwBusy(false); }
  };

  const pickLogoFile = () => logoInputRef.current?.click();
  const handleLogoFile = (e) => {
    setLogoError(""); setLogoSaved(false);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLogoError("יש לבחור קובץ תמונה (PNG / JPG / SVG)"); e.target.value = ""; return; }
    if (file.size > 3 * 1024 * 1024) { setLogoError("קובץ הלוגו גדול מדי (מקסימום 3MB)"); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = async () => {
      setLogoBusy(true);
      try {
        await onLogoChange(reader.result);
        setLogoFileName(file.name);
        setLogoSaved(true);
        setTimeout(() => setLogoSaved(false), 3000);
      } catch (err) {
        setLogoError(err.message);
      } finally {
        setLogoBusy(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <h2 className="font-bold text-xl text-slate-800 flex items-center gap-2"><Settings size={22} className="text-amber-600" /> הגדרות</h2>

      {isAdmin && (
        <div className="bg-white rounded-2xl border p-5">
          <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><Upload size={18} /> לוגו העסק</h3>
          <p className="text-slate-500 text-sm mb-4">התמונה תוצג בסרגל הניווט ובמסך ההתחברות, ותישמר ב-Supabase (טבלת app_settings) לכל המשתמשים.</p>
          <div className="flex items-center gap-4">
            <LogoBadge logoUrl={logoUrl} size={64} />
            <div className="flex-1">
              <button onClick={pickLogoFile} disabled={logoBusy} className={btnPrimary + " flex items-center gap-2"}>{logoBusy && <Loader2 size={16} className="animate-spin" />}<Upload size={16} /> העלה לוגו עסק</button>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
              {logoFileName && <div className="text-xs text-slate-400 mt-2">קובץ אחרון שהועלה: {logoFileName}</div>}
            </div>
          </div>
          {logoError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mt-3">{logoError}</div>}
          {logoSaved && <div className="bg-emerald-100 text-emerald-700 text-sm rounded-xl px-3 py-2 mt-3 flex items-center gap-2"><CircleCheck size={16} /> הלוגו הוחלף ונשמר בהצלחה ב-DB</div>}
        </div>
      )}

      <div className="bg-white rounded-2xl border p-5">
        <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><User size={18} /> ניהול פרופיל</h3>
        <p className="text-slate-500 text-sm mb-4">כתובת הדוא"ל להתחברות.</p>
        <Field label='כתובת דוא"ל להתחברות'><input type="email" className={inputCls} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></Field>
        {profileError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{profileError}</div>}
        {profileSaved && <div className="bg-emerald-100 text-emerald-700 text-sm rounded-xl px-3 py-2 mb-3">נשלח קישור אישור לדוא"ל. השינוי ייכנס לתוקף לאחר האישור.</div>}
        <button onClick={saveProfile} disabled={profileBusy} className={btnPrimary + " flex items-center gap-2"}>{profileBusy && <Loader2 size={16} className="animate-spin" />}שמירת פרופיל</button>
      </div>

      {isAdmin && (
        <div className="bg-white rounded-2xl border p-5">
          <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><Building2 size={18} /> פרטי העסק</h3>
          <p className="text-slate-500 text-sm mb-4">מוצג בכותרת המערכת ובמסמכי PO.</p>
          <Field label="שם החברה (עברית)"><input className={inputCls} value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></Field>
          <Field label="שם משפטי (אנגלית)"><input className={inputCls} value={company.legalName} onChange={(e) => setCompany({ ...company, legalName: e.target.value })} /></Field>
          <Field label="כתובת"><input className={inputCls} value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} /></Field>
          <Field label="טלפון"><input className={inputCls} value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} /></Field>
          {companySaved && <div className="bg-emerald-100 text-emerald-700 text-sm rounded-xl px-3 py-2 mb-3">פרטי העסק עודכנו</div>}
          <button onClick={saveCompany} disabled={companyBusy} className={btnPrimary + " flex items-center gap-2"}>{companyBusy && <Loader2 size={16} className="animate-spin" />}שמירת פרטי עסק</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border p-5">
        <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><KeyRound size={18} /> אבטחה - שינוי סיסמה</h3>
        <p className="text-slate-500 text-sm mb-4">יש להזין את הסיסמה הנוכחית לאימות, ולאחר מכן את הסיסמה החדשה פעמיים.</p>
        <Field label="סיסמה נוכחית"><input type="password" className={inputCls} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} /></Field>
        <Field label="סיסמה חדשה"><input type="password" className={inputCls} value={newPw} onChange={(e) => setNewPw(e.target.value)} /></Field>
        <Field label="אימות סיסמה חדשה"><input type="password" className={inputCls} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></Field>
        {pwError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{pwError}</div>}
        {pwSaved && <div className="bg-emerald-100 text-emerald-700 text-sm rounded-xl px-3 py-2 mb-3 flex items-center gap-2"><CircleCheck size={16} /> הסיסמה עודכנה בהצלחה</div>}
        <button onClick={changePassword} disabled={pwBusy} className={btnPrimary + " flex items-center gap-2"}>{pwBusy && <Loader2 size={16} className="animate-spin" />}עדכון סיסמה</button>
      </div>

      <div className="bg-white rounded-2xl border p-5">
        <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><Database size={18} /> חיבור מסד נתונים</h3>
        <div className="flex items-center gap-2 mt-2 mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span className="font-medium text-slate-700">מחובר בלייב ל-Supabase</span>
        </div>
        <p className="text-slate-500 text-sm">Realtime פעיל על טבלאות המלאי והתנועות. עדכוני RLS ומפתחות ה-API מנוהלים דרך קובץ ה-.env והגדרות הפרויקט ב-Supabase Dashboard.</p>
      </div>
    </div>
  );
}

const FULL_NAV = [
  { key: "dashboard", label: "לוח בקרה", icon: LayoutDashboard },
  { key: "transaction", label: "תנועת מלאי", icon: ArrowLeftRight },
  { key: "items", label: "פריטים", icon: Package, adminOnly: true },
  { key: "locations", label: "מיקומים", icon: Warehouse, adminOnly: true },
  { key: "customers", label: "לקוחות", icon: Users },
  { key: "landedCost", label: "מחשבון יבוא ועליות נחיתה", icon: Calculator, adminOnly: true },
  { key: "reports", label: "דוחות וערך מלאי", icon: BarChart3 },
  { key: "po", label: "הזמנות רכש PO", icon: FileText, adminOnly: true },
  { key: "log", label: "יומן אירועים", icon: ScrollText },
  { key: "settings", label: "הגדרות", icon: Settings },
];
const MOBILE_NAV = ["dashboard", "transaction", "customers", "log"];

// ==================== App ====================
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = auto-login failed
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState(null);
  const [dataError, setDataError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [customerFileId, setCustomerFileId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickTx, setQuickTx] = useState(null);
  const [printPOId, setPrintPOId] = useState(null);
  const [autoLoginError, setAutoLoginError] = useState("");

  const loadEverything = useCallback(async (userId) => {
    try {
      const [prof, all] = await Promise.all([api.fetchMyProfile(userId), api.fetchAllData()]);
      setProfile(prof);
      setData(all);
      setDataError("");
    } catch (e) {
      setDataError(e.message || "שגיאה בטעינת נתונים");
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const all = await api.fetchAllData();
      setData(all);
    } catch (e) {
      setDataError(e.message || "שגיאה בטעינת נתונים");
    }
  }, []);

  // אין יותר מסך התחברות: המערכת מתחברת אוטומטית ברקע עם המשתמש המורשה היחיד,
  // כך שהאפליקציה נפתחת ישירות ללוח הבקרה.
  useEffect(() => {
    (async () => {
      try {
        const existing = await api.getSession();
        if (existing) { setSession(existing); return; }
        const result = await api.signIn(ALLOWED_EMAIL, ALLOWED_PASSWORD);
        setSession(result.session);
      } catch (e) {
        setAutoLoginError(e.message || "ההתחברות האוטומטית נכשלה");
        setSession(null);
      }
    })();
    const unsubscribe = api.onAuthChange((s) => setSession(s));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (session?.user?.id) loadEverything(session.user.id);
  }, [session?.user?.id, loadEverything]);

  useEffect(() => {
    if (!session) return;
    const unsubscribe = api.subscribeToChanges(() => refresh());
    return unsubscribe;
  }, [session, refresh]);

  const runQuickAction = (type) => {
    setCustomerFileId(null); setTab("transaction"); setQuickTx({ type, nonce: Math.random().toString(36).slice(2) });
  };

  const exportCSV = () => {
    if (!data) return;
    const warehouse = data.locations.find((l) => l.type === "warehouse");
    const vehicles = data.locations.filter((l) => l.type === "vehicle");
    const header = ["שם פריט", "קטגוריה", "יחידת מידה", "מלאי במחסן", "מלאי ברכבים", 'סה"כ', "סף מינימום", "סטטוס"];
    const lines = [header.join(",")];
    data.items.forEach((item) => {
      const whQty = data.stock[`${item.id}|${warehouse?.id}`] || 0;
      const vehQty = vehicles.reduce((s, v) => s + (data.stock[`${item.id}|${v.id}`] || 0), 0);
      const total = whQty + vehQty;
      const status = total < item.minThreshold ? "מתחת לסף" : "תקין";
      lines.push([item.name, CATEGORIES[item.category], item.unit, whQty, vehQty, total, item.minThreshold, status].join(","));
    });
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `דוח-מלאי-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (session === undefined) {
    return <div dir="rtl" className="min-h-screen flex items-center justify-center text-slate-400 bg-slate-900">טוען...</div>;
  }
  if (!session) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
        <div className="bg-white rounded-2xl shadow-xl max-w-sm p-6 text-center">
          <div className="text-rose-600 font-bold mb-2">ההתחברות האוטומטית נכשלה</div>
          <p className="text-slate-500 text-sm">{autoLoginError}</p>
          <p className="text-slate-400 text-xs mt-3">בדקו שהמשתמש המורשה קיים ב-Supabase Authentication עם הסיסמה הנכונה, ושהמייל מאושר (Confirmed).</p>
        </div>
      </div>
    );
  }
  if (!data || !profile) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={18} /> טוען נתונים...
        {dataError && <div className="text-rose-600 text-sm mr-2">{dataError}</div>}
      </div>
    );
  }

  const isAdmin = profile.role === "admin";
  const nav = FULL_NAV.filter((n) => !n.adminOnly || isAdmin);
  const goTab = (key) => { setTab(key); setCustomerFileId(null); setMobileMenuOpen(false); };

  return (
    <div dir="rtl" lang="he" className="min-h-screen bg-gray-50 text-slate-800" style={{ fontFamily: "'Rubik','Assistant',sans-serif" }}>
      <div className="flex">
        <aside className="hidden md:flex flex-col w-60 shrink-0 bg-slate-900 text-slate-200 min-h-screen p-4 sticky top-0 h-screen">
          <div className="flex items-center gap-2 px-2 py-3 mb-4">
            <LogoBadge logoUrl={data.logoUrl} size={36} editable={isAdmin} onChange={async (dataUrl) => { try { await api.updateLogoUrl(dataUrl); await refresh(); } catch (e) { alert(e.message); } }} />
            <div>
              <div className="font-bold text-white leading-tight">אדל אימפורט</div>
              <div className="text-xs text-slate-400">ניהול מלאי</div>
            </div>
          </div>
          <nav className="flex flex-col gap-1 flex-1">
            {nav.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => goTab(key)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition ${tab === key && !customerFileId ? "bg-amber-500 text-slate-900" : "text-slate-300 hover:bg-slate-800"}`}>
                <Icon size={18} /> {label}
              </button>
            ))}
          </nav>
          <div className="border-t border-slate-800 pt-3 px-2">
            <div className="text-sm text-slate-300 font-medium">{profile.fullName || session.user.email}</div>
            <div className="text-xs text-slate-500">{isAdmin ? "מנהל" : "טכנאי"}</div>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="md:hidden flex items-center justify-between bg-slate-900 text-white px-4 py-3 sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <LogoBadge logoUrl={data.logoUrl} size={32} />
              <span className="font-bold">אדל אימפורט - ניהול מלאי</span>
            </div>
            <button onClick={() => setMobileMenuOpen(true)} className="p-1.5"><Menu size={22} /></button>
          </div>

          {mobileMenuOpen && (
            <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileMenuOpen(false)}>
              <div className="bg-white w-64 h-full p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setMobileMenuOpen(false)} className="mb-4 p-1.5"><X size={20} /></button>
                <nav className="flex flex-col gap-1 flex-1">
                  {nav.map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => goTab(key)} className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium ${tab === key && !customerFileId ? "bg-amber-100 text-amber-800" : "text-slate-600"}`}>
                      <Icon size={18} /> {label}
                    </button>
                  ))}
                </nav>
                <div className="border-t pt-3">
                  <div className="text-sm text-slate-700 font-medium">{profile.fullName || session.user.email}</div>
                  <div className="text-xs text-slate-400">{isAdmin ? "מנהל" : "טכנאי"}</div>
                </div>
              </div>
            </div>
          )}

          <div className="p-4 sm:p-6 pb-24 md:pb-6 max-w-6xl mx-auto">
            {dataError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-4">{dataError}</div>}
            {customerFileId ? (
              <CustomerFile data={data} customerId={customerFileId} onBack={() => setCustomerFileId(null)} />
            ) : (
              <>
                {tab === "dashboard" && <Dashboard data={data} onExport={exportCSV} />}
                {tab === "items" && isAdmin && <ItemsScreen data={data} refresh={refresh} isAdmin={isAdmin} />}
                {tab === "locations" && isAdmin && <LocationsScreen data={data} refresh={refresh} isAdmin={isAdmin} />}
                {tab === "customers" && <CustomersScreen data={data} refresh={refresh} isAdmin={isAdmin} onOpenFile={setCustomerFileId} />}
                {tab === "transaction" && <TransactionScreen data={data} refresh={refresh} quickTx={quickTx} />}
                {tab === "landedCost" && isAdmin && <LandedCostScreen data={data} refresh={refresh} />}
                {tab === "reports" && <ReportsScreen data={data} />}
                {tab === "po" && isAdmin && <POsScreen data={data} refresh={refresh} onPrint={setPrintPOId} />}
                {tab === "log" && <AuditLog data={data} />}
                {tab === "settings" && <SettingsScreen data={data} refresh={refresh} userEmail={session.user.email} logoUrl={data.logoUrl} isAdmin={isAdmin} onLogoChange={async (dataUrl) => { try { await api.updateLogoUrl(dataUrl); await refresh(); } catch (e) { alert(e.message); } }} />}
              </>
            )}
          </div>

          {tab !== "transaction" && !customerFileId && (
            <div className="md:hidden fixed inset-x-0 bottom-14 z-20 px-3 pb-2 flex gap-2 pointer-events-none">
              <button onClick={() => runQuickAction("transfer")} className="pointer-events-auto flex-1 bg-sky-600 text-white font-bold rounded-2xl py-3.5 shadow-lg flex items-center justify-center gap-2 active:scale-95 transition"><ArrowLeftRight size={20} /> העברה מהירה</button>
              <button onClick={() => runQuickAction("install")} className="pointer-events-auto flex-1 bg-amber-500 text-white font-bold rounded-2xl py-3.5 shadow-lg flex items-center justify-center gap-2 active:scale-95 transition"><Truck size={20} /> התקנה מהירה</button>
            </div>
          )}

          <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t flex justify-around py-1.5 z-30">
            {MOBILE_NAV.map((key) => {
              const item = FULL_NAV.find((n) => n.key === key);
              const Icon = item.icon;
              const active = tab === key && !customerFileId;
              return (
                <button key={key} onClick={() => goTab(key)} className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl ${active ? "text-amber-600" : "text-slate-400"}`}>
                  <Icon size={22} /><span className="text-[11px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </main>
      </div>
      {printPOId && <POPrintView data={data} poId={printPOId} onClose={() => setPrintPOId(null)} />}
    </div>
  );
}
