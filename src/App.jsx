import { supabase } from "./supabaseClient";

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
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}
export async function signOut() {
  await supabase.auth.signOut();
}
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export async function fetchMyProfile(userId) {
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
export async function fetchAllData() {
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
export async function addItem(item) {
  const { error } = await supabase.from("items").insert({
    name: item.name, category: item.category, unit: item.unit, min_threshold: item.minThreshold,
  });
  if (error) throw error;
}
export async function deleteItem(id) {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Locations ----------
export async function addLocation(location) {
  const { error } = await supabase.from("locations").insert({ name: location.name, type: location.type });
  if (error) throw error;
}

// ---------- Customers ----------
export async function addCustomer(customer) {
  const { error } = await supabase.from("customers").insert({
    name: customer.name, address: customer.address, contact: customer.contact,
  });
  if (error) throw error;
}

// ---------- Transactions ----------
// שים לב: אין צורך לעדכן מלאי ידנית - טריגר ב-DB (apply_transaction_to_stock)
// מעדכן את stock_levels אוטומטית עם כל שורה חדשה בטבלת transactions.
export async function insertTransaction(tx) {
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
export function subscribeToChanges(onChange) {
  const channel = supabase
    .channel("inventory-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "stock_levels" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ---------- Landed cost ----------
export async function updateItemUnitCost(itemId, unitCost) {
  const { error } = await supabase.from("items").update({ unit_cost: unitCost }).eq("id", itemId);
  if (error) throw error;
}
export async function updateItemsUnitCosts(updates) {
  // updates: [{ itemId, unitCost }]
  await Promise.all(updates.map((u) => updateItemUnitCost(u.itemId, u.unitCost)));
}

// ---------- Purchase Orders ----------
export async function createPurchaseOrder(supplierId, lines) {
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
export async function updateLogoUrl(dataUrl) {
  const { error } = await supabase.from("app_settings").upsert({ key: "logo_url", value: dataUrl });
  if (error) throw error;
}
export async function fetchPublicLogo() {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "logo_url").maybeSingle();
  if (error) return null;
  return data?.value || null;
}

// ---------- Settings / Company profile ----------
export async function updateCompanySettings(settings) {
  const { error } = await supabase.from("app_settings").upsert({ key: "company_settings", value: JSON.stringify(settings) });
  if (error) throw error;
}

// ---------- Account: email + password ----------
export async function updateAccountEmail(newEmail) {
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) throw error;
  // שים לב: שינוי דוא"ל ב-Supabase דורש כברירת מחדל אישור בקישור שנשלח לכתובת החדשה (ולעיתים גם לישנה)
}
export async function changePassword(currentEmail, currentPassword, newPassword) {
  // מאמת את הסיסמה הנוכחית ע"י ניסיון התחברות מחדש, ורק אז מעדכן לסיסמה החדשה
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: currentEmail, password: currentPassword });
  if (verifyError) throw new Error("הסיסמה הנוכחית שגויה");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
