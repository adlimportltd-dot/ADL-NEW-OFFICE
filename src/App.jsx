import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Package, Warehouse, Users, ArrowLeftRight,
  ScrollText, Plus, X, TriangleAlert, Download, Truck, Building2,
  CircleCheck, CircleX, Trash2, ChevronLeft, Menu, LogOut, Loader2,
  Upload, Calculator, Ship, BarChart3, FileText, Printer, Gauge,
  Settings, Database, KeyRound, User, Pencil, TrendingUp, ShoppingCart, CalendarPlus,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";

// ==================== API layer (merged inline - single file) ====================
// ---------- מיפוי snake_case (DB) <-> camelCase (UI) ----------
const mapItem = (r) => ({
  id: r.id, name: r.name, category: r.category, model: r.model,
  color: r.color, unit: r.unit, minThreshold: Number(r.min_threshold),
  unitCost: r.unit_cost !== null && r.unit_cost !== undefined ? Number(r.unit_cost) : null,
  supplierSku: r.supplier_sku || "", fragranceGroup: r.fragrance_group || "",
});
const mapLocation = (r) => ({ id: r.id, name: r.name, type: r.type });
const mapCustomer = (r) => ({
  id: r.id, name: r.name, address: r.address, contact: r.contact,
  phone: r.phone || "", email: r.email || "", clientType: r.client_type || "private",
});
const mapLead = (r) => ({
  id: r.id, name: r.name, phone: r.phone || "", email: r.email || "", customerId: r.customer_id,
  status: r.status, source: r.source || "", estimatedValue: r.estimated_value !== null && r.estimated_value !== undefined ? Number(r.estimated_value) : null,
  notes: r.notes || "", followUpDate: r.follow_up_date || "", date: r.created_at,
});
const mapQuote = (r) => ({
  id: r.id, quoteNumber: r.quote_number, customerId: r.customer_id, leadId: r.lead_id,
  status: r.status, notes: r.notes || "", date: r.created_at,
  lines: (r.quote_lines || []).map((l) => ({ itemId: l.item_id, qty: Number(l.qty), unitPrice: Number(l.unit_price) })),
});
const mapTransaction = (r) => ({
  id: r.id, type: r.type, itemId: r.item_id, qty: Number(r.qty),
  fromLocationId: r.from_location_id, toLocationId: r.to_location_id,
  customerId: r.customer_id, condition: r.condition, note: r.note,
  unitPrice: r.unit_price !== null && r.unit_price !== undefined ? Number(r.unit_price) : null,
  supplierId: r.supplier_id || null,
  date: r.created_at,
});
const mapSupplier = (r) => ({
  id: r.id, name: r.name, country: r.country, contact: r.contact, phone: r.phone, email: r.email,
  currency: r.currency || "USD", notes: r.notes || "",
});
const mapShipment = (r) => ({ id: r.id, name: r.name, status: r.status, notes: r.notes || "", date: r.created_at });
const mapRateCard = (r) => ({
  id: r.id, name: r.name, carrier: r.carrier || "", notes: r.notes || "", date: r.created_at,
  rates: (r.shipping_rates || []).map((x) => ({ id: x.id, rateType: x.rate_type, label: x.label || "", price: Number(x.price), currency: x.currency || "USD" })),
});
const mapPO = (r) => ({
  id: r.id, poNumber: r.po_number, supplierId: r.supplier_id, status: r.status, date: r.created_at,
  currency: r.currency || "USD", shippingTerms: r.shipping_terms || "", notes: r.notes || "",
  shipmentId: r.shipment_id || "",
  paymentTerms: r.payment_terms || "prepaid_100", depositPercent: r.deposit_percent !== null && r.deposit_percent !== undefined ? Number(r.deposit_percent) : null,
  netDays: r.net_days !== null && r.net_days !== undefined ? Number(r.net_days) : null, dueDate: r.due_date || "",
  lines: (r.po_lines || []).map((l) => ({ itemId: l.item_id, qty: Number(l.qty), unitPrice: Number(l.unit_price) })),
});
const mapPOPayment = (r) => ({ id: r.id, poId: r.po_id, amount: Number(r.amount), paidDate: r.paid_date, note: r.note || "" });
const mapExpense = (r) => ({
  id: r.id, category: r.category, supplierId: r.supplier_id, description: r.description || "",
  invoiceNumber: r.invoice_number || "", expenseDate: r.expense_date,
  vatMode: r.vat_mode, amountExclVat: Number(r.amount_excl_vat), vatAmount: Number(r.vat_amount), amountInclVat: Number(r.amount_incl_vat),
  paymentStatus: r.payment_status, paymentMethod: r.payment_method || "", notes: r.notes || "", date: r.created_at,
});
const mapExpensePayment = (r) => ({ id: r.id, expenseId: r.expense_id, amount: Number(r.amount), paidDate: r.paid_date, method: r.method || "", note: r.note || "" });

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

// ---------- אימות דו-שלבי (2FA / TOTP) ----------
// עוטף אך ורק את ה-API המובנה של Supabase Auth למניעת בניית מנגנון TOTP
// עצמאי - הסודות של המשתמשים מנוהלים ונשמרים אצל Supabase עצמו, לא בטבלה
// שלנו, ולכן אין כאן שום שינוי סכימה או השפעה על מדיניות RLS קיימת.
async function mfaGetAssuranceLevel() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data; // { currentLevel: 'aal1'|'aal2', nextLevel: 'aal1'|'aal2' }
}
async function mfaListFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data; // { totp: [...verified factors], all: [...] }
}
async function mfaEnroll() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator App" });
  if (error) throw error;
  return data; // { id, totp: { qr_code, secret, uri } }
}
async function mfaChallengeAndVerify(factorId, code) {
  const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
  return data;
}
async function mfaUnenroll(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
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
  const [itemsRes, locationsRes, customersRes, stockRes, txRes, suppliersRes, shipmentsRes, rateCardsRes, posRes, paymentsRes, leadsRes, quotesRes, expensesRes, expensePaymentsRes, settingsRes] = await Promise.all([
    supabase.from("items").select("*").order("category").order("name"),
    supabase.from("locations").select("*").order("type"),
    supabase.from("customers").select("*").order("name"),
    supabase.from("stock_levels").select("*"),
    supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("shipments").select("*").order("created_at", { ascending: false }),
    supabase.from("shipping_rate_cards").select("*, shipping_rates(*)").order("created_at", { ascending: false }),
    supabase.from("purchase_orders").select("*, po_lines(*)").order("created_at", { ascending: false }),
    supabase.from("po_payments").select("*").order("paid_date", { ascending: false }),
    supabase.from("leads").select("*").order("created_at", { ascending: false }),
    supabase.from("quotes").select("*, quote_lines(*)").order("created_at", { ascending: false }),
    supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
    supabase.from("expense_payments").select("*").order("paid_date", { ascending: false }),
    supabase.from("app_settings").select("*"),
  ]);

  for (const r of [itemsRes, locationsRes, customersRes, stockRes, txRes, suppliersRes, shipmentsRes, rateCardsRes, posRes, paymentsRes, leadsRes, quotesRes, expensesRes, expensePaymentsRes, settingsRes]) {
    if (r.error) throw r.error;
  }

  const stock = {};
  stockRes.data.forEach((row) => {
    stock[`${row.item_id}|${row.location_id}`] = Number(row.quantity);
  });

  const settings = {};
  (settingsRes.data || []).forEach((row) => { settings[row.key] = row.value; });
  let companySettings = { name: "אדל אימפורט", legalName: "ADL Import LTD", address: "ישראל", phone: "", vatRate: 18, taxAdvanceRate: 0 };
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
    shipments: (shipmentsRes.data || []).map(mapShipment),
    rateCards: (rateCardsRes.data || []).map(mapRateCard),
    purchaseOrders: (posRes.data || []).map(mapPO),
    poPayments: (paymentsRes.data || []).map(mapPOPayment),
    leads: (leadsRes.data || []).map(mapLead),
    quotes: (quotesRes.data || []).map(mapQuote),
    expenses: (expensesRes.data || []).map(mapExpense),
    expensePayments: (expensePaymentsRes.data || []).map(mapExpensePayment),
    logoUrl: settings.logo_url || null,
    companySettings,
  };
}

// ---------- Items ----------
async function addItem(item) {
  const { data, error } = await supabase.from("items").insert({
    name: item.name, category: item.category, unit: item.unit, min_threshold: item.minThreshold,
    supplier_sku: item.supplierSku || null, fragrance_group: item.fragranceGroup || null,
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
  if (patch.supplierSku !== undefined) payload.supplier_sku = patch.supplierSku;
  if (patch.fragranceGroup !== undefined) payload.fragrance_group = patch.fragranceGroup || null;
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
async function updateLocation(id, patch) {
  const payload = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.type !== undefined) payload.type = patch.type;
  const { error } = await supabase.from("locations").update(payload).eq("id", id);
  if (error) throw error;
}

// ---------- Customers ----------
async function addCustomer(customer) {
  const { data, error } = await supabase.from("customers").insert({
    name: customer.name, address: customer.address, contact: customer.contact,
    phone: customer.phone || null, email: customer.email || null, client_type: customer.clientType || "private",
  }).select().single();
  if (error) throw error;
  return data.id;
}
async function updateCustomer(id, patch) {
  const payload = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.address !== undefined) payload.address = patch.address;
  if (patch.contact !== undefined) payload.contact = patch.contact;
  if (patch.phone !== undefined) payload.phone = patch.phone;
  if (patch.email !== undefined) payload.email = patch.email;
  if (patch.clientType !== undefined) payload.client_type = patch.clientType;
  const { error } = await supabase.from("customers").update(payload).eq("id", id);
  if (error) throw error;
}

// ---------- Leads (CRM) ----------
async function addLead(lead) {
  const { error } = await supabase.from("leads").insert({
    name: lead.name, phone: lead.phone || null, email: lead.email || null, customer_id: lead.customerId || null,
    status: lead.status || "new", source: lead.source || null,
    estimated_value: lead.estimatedValue !== "" && lead.estimatedValue != null ? Number(lead.estimatedValue) : null,
    notes: lead.notes || null, follow_up_date: lead.followUpDate || null,
  });
  if (error) throw error;
}
async function updateLead(id, patch) {
  const payload = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.phone !== undefined) payload.phone = patch.phone;
  if (patch.email !== undefined) payload.email = patch.email;
  if (patch.customerId !== undefined) payload.customer_id = patch.customerId || null;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.source !== undefined) payload.source = patch.source;
  if (patch.estimatedValue !== undefined) payload.estimated_value = patch.estimatedValue !== "" && patch.estimatedValue != null ? Number(patch.estimatedValue) : null;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  if (patch.followUpDate !== undefined) payload.follow_up_date = patch.followUpDate || null;
  const { error } = await supabase.from("leads").update(payload).eq("id", id);
  if (error) throw error;
}
async function deleteLead(id) {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Quotes ----------
async function createQuote(customerId, leadId, lines, notes) {
  const quoteNumber = `ADL-Q-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
  const { data: quote, error } = await supabase
    .from("quotes")
    .insert({ quote_number: quoteNumber, customer_id: customerId || null, lead_id: leadId || null, status: "draft", notes: notes || null })
    .select()
    .single();
  if (error) throw error;
  const { error: linesError } = await supabase.from("quote_lines").insert(
    lines.map((l) => ({ quote_id: quote.id, item_id: l.itemId, qty: l.qty, unit_price: l.unitPrice }))
  );
  if (linesError) throw linesError;
  return quote.id;
}
async function updateQuoteStatus(quoteId, status) {
  const { error } = await supabase.from("quotes").update({ status }).eq("id", quoteId);
  if (error) throw error;
}
async function deleteQuote(id) {
  const { error } = await supabase.from("quotes").delete().eq("id", id);
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
    unit_price: tx.unitPrice !== undefined && tx.unitPrice !== null && tx.unitPrice !== "" ? Number(tx.unitPrice) : null,
    supplier_id: tx.supplierId || null,
  });
  if (error) throw error;
}

// ---------- Repackaging (המרת אריזות / מזיגה) ----------
async function insertRepackLine(itemId, qty, direction, locationId, note) {
  const { error } = await supabase.from("transactions").insert({
    type: "repack", item_id: itemId, qty, note: note || null,
    from_location_id: direction === "consume" ? locationId : null,
    to_location_id: direction === "produce" ? locationId : null,
  });
  if (error) throw error;
}
async function performRepackaging(warehouseId, consumedLines, producedLines, batchTag) {
  for (const line of consumedLines) {
    await insertRepackLine(line.itemId, line.qty, "consume", warehouseId, `${batchTag} - נצרך: ${line.label}`);
  }
  for (const line of producedLines) {
    await insertRepackLine(line.itemId, line.qty, "produce", warehouseId, `${batchTag} - הופק: ${line.label}`);
  }
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
async function createPurchaseOrder(supplierId, lines, extra = {}) {
  const poNumber = `ADL-PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: poNumber, supplier_id: supplierId, status: extra.status || "draft",
      currency: extra.currency || "USD", shipping_terms: extra.shippingTerms || null, notes: extra.notes || null,
      shipment_id: extra.shipmentId || null,
      payment_terms: extra.paymentTerms || "prepaid_100",
      deposit_percent: extra.paymentTerms === "deposit_balance" ? Number(extra.depositPercent) || null : null,
      net_days: extra.paymentTerms === "net_x" ? Number(extra.netDays) || null : null,
      due_date: extra.dueDate || null,
    })
    .select()
    .single();
  if (error) throw error;
  const { error: linesError } = await supabase.from("po_lines").insert(
    lines.map((l) => ({ po_id: po.id, item_id: l.itemId, qty: l.qty, unit_price: l.unitPrice }))
  );
  if (linesError) throw linesError;
  return po.id;
}
async function updatePOShipment(poId, shipmentId) {
  const { error } = await supabase.from("purchase_orders").update({ shipment_id: shipmentId || null }).eq("id", poId);
  if (error) throw error;
}
async function updatePOStatus(poId, status) {
  const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", poId);
  if (error) throw error;
}
async function updatePurchaseOrder(poId, supplierId, lines, extra = {}) {
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id: supplierId, status: extra.status || "draft",
      currency: extra.currency || "USD", shipping_terms: extra.shippingTerms || null, notes: extra.notes || null,
      shipment_id: extra.shipmentId || null,
      payment_terms: extra.paymentTerms || "prepaid_100",
      deposit_percent: extra.paymentTerms === "deposit_balance" ? Number(extra.depositPercent) || null : null,
      net_days: extra.paymentTerms === "net_x" ? Number(extra.netDays) || null : null,
      due_date: extra.dueDate || null,
    })
    .eq("id", poId);
  if (error) throw error;
  const { error: deleteError } = await supabase.from("po_lines").delete().eq("po_id", poId);
  if (deleteError) throw deleteError;
  const { error: insertError } = await supabase.from("po_lines").insert(
    lines.map((l) => ({ po_id: poId, item_id: l.itemId, qty: l.qty, unit_price: l.unitPrice }))
  );
  if (insertError) throw insertError;
}

// ---------- PO Payments ----------
async function addPOPayment(poId, amount, paidDate, note) {
  const { error } = await supabase.from("po_payments").insert({
    po_id: poId, amount, paid_date: paidDate, note: note || null,
  });
  if (error) throw error;
}
async function deletePOPayment(id) {
  const { error } = await supabase.from("po_payments").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Expenses (הוצאות וחשבוניות ספקים) ----------
async function addExpense(expense) {
  const { data, error } = await supabase.from("expenses").insert({
    category: expense.category, supplier_id: expense.supplierId || null, description: expense.description || null,
    invoice_number: expense.invoiceNumber || null, expense_date: expense.expenseDate,
    vat_mode: expense.vatMode, amount_excl_vat: expense.amountExclVat, vat_amount: expense.vatAmount, amount_incl_vat: expense.amountInclVat,
    payment_status: expense.paymentStatus, payment_method: expense.paymentMethod || null, notes: expense.notes || null,
  }).select().single();
  if (error) throw error;
  return data.id;
}
async function updateExpense(id, expense) {
  const { error } = await supabase.from("expenses").update({
    category: expense.category, supplier_id: expense.supplierId || null, description: expense.description || null,
    invoice_number: expense.invoiceNumber || null, expense_date: expense.expenseDate,
    vat_mode: expense.vatMode, amount_excl_vat: expense.amountExclVat, vat_amount: expense.vatAmount, amount_incl_vat: expense.amountInclVat,
    payment_status: expense.paymentStatus, payment_method: expense.paymentMethod || null, notes: expense.notes || null,
  }).eq("id", id);
  if (error) throw error;
}
async function deleteExpense(id) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}
async function addExpensePayment(expenseId, amount, paidDate, method, note) {
  const { error } = await supabase.from("expense_payments").insert({
    expense_id: expenseId, amount, paid_date: paidDate, method: method || null, note: note || null,
  });
  if (error) throw error;
}
async function deleteExpensePayment(id) {
  const { error } = await supabase.from("expense_payments").delete().eq("id", id);
  if (error) throw error;
}

// ---------- סריקת חשבונית חכמה (AI OCR) ----------
// ה-API של קלוד מקבל ל-image רק image/jpeg, image/png, image/gif, image/webp -
// PDF חייב להיות מומר לתמונה אמיתית (rendering ל-canvas) לפני שהוא נשלח,
// אחרת מתקבלת שגיאת תקינות מה-API. כל עמוד ב-PDF הופך לקובץ תמונה נפרד,
// ומצטרף לרשימת העמודים הצבורה בדיוק כמו תמונה שצולמה/הועלתה ישירות.
async function convertPdfFileToImages(file) {
  const pdfjsLib = await import("https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs";
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const baseName = file.name ? file.name.replace(/\.pdf$/i, "") : "invoice";
  const images = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 }); // רזולוציה גבוהה מספיק לזיהוי טקסט
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    images.push(new File([blob], `${baseName}-עמוד-${pageNum}.png`, { type: "image/png" }));
  }
  return images;
}

// שולח את התמונה ל-Edge Function פרטי (לא ל-API חיצוני ישירות מהדפדפן!) -
// המפתח הסודי של ה-AI חי אך ורק בצד השרת, לעולם לא בקוד הלקוח.
async function analyzeInvoiceImage(files) {
  const rawFiles = Array.from(files);
  if (rawFiles.length === 0) throw new Error("לא נבחרו תמונות");
  // הגנה כפולה: גם אם איכשהו הגיע לכאן PDF שלא עבר המרה קודם (למשל קריאה
  // ישירה לפונקציה הזו ממקום אחר בעתיד), הוא מומר כאן - ה-API לעולם לא
  // מקבל PDF, רק image/jpeg|png|gif|webp כפי שהוא דורש.
  const fileArray = [];
  for (const f of rawFiles) {
    if (f.type === "application/pdf") fileArray.push(...(await convertPdfFileToImages(f)));
    else fileArray.push(f);
  }
  const toBase64 = (f) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });
  const images = await Promise.all(fileArray.map(async (f) => ({ data: await toBase64(f), mediaType: f.type || "image/jpeg" })));
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("יש להתחבר מחדש כדי להשתמש בסריקה");

  const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-invoice`;
  const res = await fetch(functionsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ images }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`שגיאת שרת בסריקה (${res.status}): ${text || "נסו שוב או הזינו ידנית"}`);
  }
  return res.json(); // { supplierName, invoiceNumber, invoiceDate, amountExclVat, vatAmount, amountInclVat }
}

// ---------- Suppliers ----------
async function addSupplier(supplier) {
  const { error } = await supabase.from("suppliers").insert({
    name: supplier.name, country: supplier.country, contact: supplier.contact,
    phone: supplier.phone, email: supplier.email, currency: supplier.currency || "USD", notes: supplier.notes || null,
  });
  if (error) throw error;
}
async function updateSupplier(id, patch) {
  const payload = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.country !== undefined) payload.country = patch.country;
  if (patch.contact !== undefined) payload.contact = patch.contact;
  if (patch.phone !== undefined) payload.phone = patch.phone;
  if (patch.email !== undefined) payload.email = patch.email;
  if (patch.currency !== undefined) payload.currency = patch.currency;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  const { error } = await supabase.from("suppliers").update(payload).eq("id", id);
  if (error) throw error;
}
async function deleteSupplier(id) {
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Shipments ----------
async function addShipment(shipment) {
  const { data, error } = await supabase.from("shipments").insert({
    name: shipment.name, status: shipment.status || "preparing", notes: shipment.notes || null,
  }).select().single();
  if (error) throw error;
  return data.id;
}
async function updateShipment(id, patch) {
  const payload = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  const { error } = await supabase.from("shipments").update(payload).eq("id", id);
  if (error) throw error;
}
async function deleteShipment(id) {
  const { error } = await supabase.from("shipments").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Shipping Rate Cards ----------
async function addRateCard(card) {
  const { data, error } = await supabase.from("shipping_rate_cards").insert({
    name: card.name, carrier: card.carrier || null, notes: card.notes || null,
  }).select().single();
  if (error) throw error;
  return data.id;
}
async function updateRateCard(id, patch) {
  const payload = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.carrier !== undefined) payload.carrier = patch.carrier;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  const { error } = await supabase.from("shipping_rate_cards").update(payload).eq("id", id);
  if (error) throw error;
}
async function deleteRateCard(id) {
  const { error } = await supabase.from("shipping_rate_cards").delete().eq("id", id);
  if (error) throw error;
}
async function addRateLine(rateCardId, rate) {
  const { error } = await supabase.from("shipping_rates").insert({
    rate_card_id: rateCardId, rate_type: rate.rateType, label: rate.label || null,
    price: rate.price, currency: rate.currency || "USD",
  });
  if (error) throw error;
}
async function deleteRateLine(id) {
  const { error } = await supabase.from("shipping_rates").delete().eq("id", id);
  if (error) throw error;
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

const api = { signIn, signUp, signOut, onAuthChange, getSession, mfaGetAssuranceLevel, mfaListFactors, mfaEnroll, mfaChallengeAndVerify, mfaUnenroll, fetchMyProfile, fetchAllData, addItem, updateItem, setItemStock, deleteItem, addLocation, updateLocation, addCustomer, updateCustomer, insertTransaction, performRepackaging, subscribeToChanges, updateItemUnitCost, updateItemsUnitCosts, createPurchaseOrder, updatePurchaseOrder, updatePOStatus, updatePOShipment, addPOPayment, deletePOPayment, addSupplier, updateSupplier, deleteSupplier, addShipment, updateShipment, deleteShipment, addRateCard, updateRateCard, deleteRateCard, addRateLine, deleteRateLine, addLead, updateLead, deleteLead, createQuote, updateQuoteStatus, deleteQuote, addExpense, updateExpense, deleteExpense, addExpensePayment, deleteExpensePayment, analyzeInvoiceImage, updateLogoUrl, fetchPublicLogo, updateCompanySettings, updateAccountEmail, changePassword };


const fmtDate = (iso) =>
  new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const CATEGORIES = { device: "מכשירים", consumable: "נוזלים ומתכלים" };
const PACKAGE_SIZES = ["25 ליטר", "5 ליטר", "1 ליטר", "0.5 ליטר", '250 מ"ל'];
// אריזות "גדולות" הן תמיד מקור להמרה (נפתחות/נצרכות), "קטנות" הן תמיד תוצר (נמזגות אליהן)
const LARGE_PACKAGES = ["25 ליטר"];
const SMALL_PACKAGES = ["5 ליטר", "1 ליטר", "0.5 ליטר", '250 מ"ל'];
const PACKAGE_SIZE_VOLUMES = { "25 ליטר": 25, "5 ליטר": 5, "1 ליטר": 1, "0.5 ליטר": 0.5, '250 מ"ל': 0.25 };

// זיהוי גודל אריזה עמיד - לא תלוי בהתאמת מחרוזת מדויקת. תומך גם בערכים
// שהוזנו ישירות ב-DB או בניסוח שונה מהרשימה הסגורה (למשל "25 ק"ג" במקום "25 ליטר").
const parsePackageSizeNumber = (text) => {
  if (!text) return null;
  const m = String(text).replace(/,/g, ".").match(/[\d]+(\.[\d]+)?/);
  return m ? parseFloat(m[0]) : null;
};
const packageVolumeOf = (item) => {
  if (item?.unit && PACKAGE_SIZE_VOLUMES[item.unit] !== undefined) return PACKAGE_SIZE_VOLUMES[item.unit];
  const text = `${item?.unit || ""} ${item?.name || ""}`;
  const n = parsePackageSizeNumber(item?.unit) ?? parsePackageSizeNumber(item?.name);
  if (n === null) return 0;
  const isMilliliters = /מ["׳]?ל|ml/i.test(text);
  return isMilliliters ? n / 1000 : n;
};
const isLargePackage = (item) => {
  const vol = packageVolumeOf(item);
  if (vol > 0) return vol >= 25;
  return /ג['׳]?ריקן|חבית 25|25 ליטר/.test(`${item?.unit || ""} ${item?.name || ""}`);
};
// אריזה שמותר לפתוח בחלון ההמרה (לגרוע ממנה): ג'ריקן 25 ליטר, אבל גם חבית/גלון 5 ליטר -
// כי אפשר גם למזוג ישירות מ-5 ליטר לבקבוקים קטנים בלי לעבור דרך 25. שונה מ-isLargePackage,
// שנשאר מוגבל ל-25 ליטר בלבד לצורך מסך "קבלת סחורה מספק".
const canOpenForRepack = (item) => {
  const vol = packageVolumeOf(item);
  if (vol > 0) return vol >= 5;
  return /ג['׳]?ריקן|חבית|גלון/.test(`${item?.unit || ""} ${item?.name || ""}`);
};
// נירמול טקסט לצורך השוואת שמות ריח: מסיר רווחים כפולים/קצה ומאחד ייצוג יוניקוד,
// כדי ששני מחרוזות שנראות זהות לעין (אבל לא זהות בייט-לבייט בגלל איך שהוקלדו) יתאמו.
const normalizeText = (s) => (s || "").normalize("NFC").trim().replace(/\s+/g, " ");
const guessFragranceName = (item) => {
  if (item.fragranceGroup) return normalizeText(item.fragranceGroup);
  return normalizeText(item.name.replace(/^תמצית ריח - /, "").replace(/\s*\([^)]*\)\s*$/, ""));
};
const CURRENCIES = ["USD", "EUR", "ILS", "GBP"];
const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", ILS: "₪", GBP: "£" };
const PO_STATUSES = {
  draft: { label: "טיוטה", tone: "gray" },
  in_production: { label: "בייצור", tone: "amber" },
  in_transit: { label: "בדרך", tone: "sky" },
  received: { label: "התקבל", tone: "emerald" },
};
const SHIPMENT_STATUSES = {
  preparing: { label: "בהכנה", tone: "amber" },
  in_transit: { label: "בדרך", tone: "sky" },
  planned: { label: "מתוכנן לחודש הבא", tone: "violet" },
};
const PAYMENT_TERMS = {
  prepaid_100: { label: "100% מראש" },
  deposit_balance: { label: "מקדמה + יתרה" },
  net_x: { label: "שוטף + X ימים" },
};
const RATE_TYPES = {
  container_20ft: "מכולה 20ft",
  container_40ft: "מכולה 40ft",
  air_per_kg: 'הובלה אווירית (לפי ק"ג)',
  other: "אחר",
};
const CLIENT_TYPES = { private: { label: "פרטי", tone: "sky" }, business: { label: "עסקי", tone: "violet" } };
const LEAD_STATUSES = {
  new: { label: "ליד חדש", tone: "gray" },
  contacted: { label: "נוצר קשר", tone: "sky" },
  quote_sent: { label: "נשלחה הצעת מחיר", tone: "amber" },
  awaiting_approval: { label: "ממתין לאישור", tone: "violet" },
  closed_won: { label: "עסקה נסגרה", tone: "emerald" },
  closed_lost: { label: "הפסיד", tone: "rose" },
};
const LEAD_STATUS_ORDER = ["new", "contacted", "quote_sent", "awaiting_approval", "closed_won", "closed_lost"];
const QUOTE_STATUSES = {
  draft: { label: "טיוטה", tone: "gray" },
  sent: { label: "נשלחה", tone: "sky" },
  accepted: { label: "התקבלה", tone: "emerald" },
  rejected: { label: "נדחתה", tone: "rose" },
};

// ==================== מודול פיננסי - הוצאות, מע"מ, P&L ====================
const EXPENSE_CATEGORIES = {
  goods: "סחורה מספק (COGS)",
  payroll: "משכורות ועלויות עובדים",
  rent: "שכירות",
  utilities: "חשבונות ותשתיות",
  fixed: "הוצאה קבועה אחרת",
  variable: "הוצאה משתנה אחרת",
  other: "אחר",
};
const VAT_MODES = {
  incl: 'כולל מע"מ',
  excl: 'לא כולל מע"מ (לפני מע"מ)',
  zero: 'מע"מ אפס (פטור)',
};
const EXPENSE_PAYMENT_STATUSES = {
  paid: { label: "שולם", tone: "emerald" },
  pending: { label: "ממתין לתשלום", tone: "amber" },
};
const PAYMENT_METHODS = {
  bank_transfer: "העברה בנקאית",
  check: "שק",
  credit_card: "אשראי",
  cash: "מזומן",
};

// מנוע חישוב מע"מ - נקודת אמת יחידה, כדי שהחישוב יהיה זהה בכל מסך שמשתמש בו.
// amount הוא הסכום שהוזן בפועל (משמעותו תלויה ב-mode); rate הוא אחוז המע"מ (למשל 18).
function computeVat(mode, amount, rate) {
  const amt = Number(amount) || 0;
  const r = Number(rate) || 0;
  if (mode === "zero") return { amountExclVat: amt, vatAmount: 0, amountInclVat: amt };
  if (mode === "excl") {
    const vat = amt * (r / 100);
    return { amountExclVat: amt, vatAmount: vat, amountInclVat: amt + vat };
  }
  // incl (ברירת מחדל): מחלקים ב-(1 + אחוז/100) - שקול לחלוקה ב-1.18 כשהאחוז הוא 18
  const excl = amt / (1 + r / 100);
  const vat = amt - excl;
  return { amountExclVat: excl, vatAmount: vat, amountInclVat: amt };
}
// בקרת תקינות: הסכום ללא מע"מ + המע"מ (אחרי דריסה ידנית אפשרית) חייבים להתאים
// בדיוק (עד אגורה) לסכום הכולל - אחרת זו טעות חשבונאית שחוסמת שמירה.
function validateVatBalance(amountExclVat, vatAmount, amountInclVat) {
  const diff = Math.round((Number(amountExclVat) + Number(vatAmount) - Number(amountInclVat)) * 100) / 100;
  return { balanced: Math.abs(diff) < 0.01, diff };
}

const poTotalAmount = (po) => po.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
const poPaidAmount = (data, poId) => (data.poPayments || []).filter((p) => p.poId === poId).reduce((s, p) => s + p.amount, 0);
const poBalance = (data, po) => poTotalAmount(po) - poPaidAmount(data, po.id);
const TX_TYPES = {
  receive: { label: "קבלת סחורה מספק", icon: Download, color: "emerald" },
  transfer: { label: "העברה למחסן/רכב", icon: ArrowLeftRight, color: "sky" },
  install: { label: "התקנה / ניפוק ללקוח", icon: Truck, color: "amber" },
  return: { label: "החזרה מלקוח", icon: CircleCheck, color: "violet" },
  writeoff: { label: "פחת / גריעה", icon: Trash2, color: "rose" },
};
// לתצוגה בלבד ביומן האירועים - repack לא מוצג בלוח בחירת סוג התנועה
// כי הוא דורש מסך ייעודי משלו (כמה פריטים בו-זמנית), לא טופס פריט בודד
const AUDIT_TX_LABELS = { ...TX_TYPES, repack: { label: "המרת אריזות / מזיגה", color: "violet" } };

function Badge({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700", emerald: "bg-emerald-100 text-emerald-800",
    sky: "bg-sky-100 text-sky-800", amber: "bg-amber-100 text-amber-800",
    violet: "bg-violet-100 text-violet-800", rose: "bg-rose-100 text-rose-800",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

// בונה קישור "Google Calendar Add Event" (action=TEMPLATE) - הכל בצד הלקוח,
// בלי שום קריאת API או הרשאה. פותח את גוגל קלנדר עם השדות כבר ממולאים,
// והמשתמש רק לוחץ "שמור" שם. אירוע יום שלם (כמו תאריך יעד/מעקב, בלי שעה).
function buildGoogleCalendarUrl({ title, description, date }) {
  if (!date) return null;
  const start = new Date(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 1); // גוגל דורש תאריך סיום "בלעדי" לאירוע יום שלם
  const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title || "",
    details: description || "",
    dates: `${fmt(start)}/${fmt(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// כפתור משותף - מוצג רק אם יש תאריך תקין. נפתח בטאב חדש כדי לא לאבד את המסך הנוכחי.
function AddToGoogleCalendarButton({ title, description, date, label = "הוסף ליומן Google", className }) {
  const url = buildGoogleCalendarUrl({ title, description, date });
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={className || "inline-flex items-center gap-1 text-xs text-sky-600 hover:underline font-medium"}
    >
      <CalendarPlus size={13} /> {label}
    </a>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b sticky top-0 bg-white">
          <h3 className="font-bold text-lg text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
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
const btnGhost = "bg-white border border-gray-300 hover:bg-gray-50 text-slate-700 font-medium rounded-xl px-5 py-3 text-[15px] transition";

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
// שלב הזנת קוד ה-2FA - רכיב משותף שמשמש גם בתוך מסך ההתחברות (מיד אחרי
// דוא"ל+סיסמה) וגם ברמת ה-App עצמו (כשיש session שמור שעדיין לא עבר את
// שלב האימות הדו-שלבי, למשל אחרי רענון עמוד).
function MfaCodeStep({ factorId, onVerified, onCancel }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (code.trim().length !== 6) { setError("יש להזין קוד בן 6 ספרות"); return; }
    setBusy(true);
    try {
      await api.mfaChallengeAndVerify(factorId, code.trim());
      const session = await api.getSession();
      onVerified(session);
    } catch (e) {
      setError("קוד שגוי או שפג תוקפו. נסו שוב עם הקוד העדכני מהאפליקציה.");
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (e) => { if (e.key === "Enter") submit(); };

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <div className="p-2 rounded-xl bg-sky-50 text-sky-600"><KeyRound size={20} /></div>
        <div className="font-bold text-slate-900">אימות דו-שלבי</div>
      </div>
      <p className="text-sm text-slate-500 mb-4">הזינו את הקוד בן 6 הספרות המוצג כרגע באפליקציית ה-Authenticator שלכם.</p>
      <Field label="קוד אימות">
        <input
          type="text" inputMode="numeric" maxLength={6} autoFocus
          className={inputCls + " text-center text-2xl tracking-[0.5em] font-bold"}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={onKeyDown}
        />
      </Field>
      {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
      <button onClick={submit} disabled={busy || code.length !== 6} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>
        {busy && <Loader2 size={16} className="animate-spin" />} אימות
      </button>
      {onCancel && <button onClick={onCancel} className="w-full text-center text-sm text-slate-400 hover:text-slate-600 mt-3">חזרה להתחברות</button>}
    </>
  );
}

function LoginScreen({ onSuccess, logoUrl, initialError }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState(null); // null = credentials step, set = mfa step

  const submit = async () => {
    setError(""); setBusy(true);
    try {
      const result = await api.signIn(email.trim(), password);
      // בודקים אם החשבון הזה דורש קוד 2FA לפני מתן גישה מלאה (aal1 -> aal2).
      const aal = await api.mfaGetAssuranceLevel();
      if (aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
        const factors = await api.mfaListFactors();
        const totpFactor = factors.totp?.[0];
        if (totpFactor) { setMfaFactorId(totpFactor.id); return; }
      }
      // מעבירים את ה-session ישירות ל-App במקום להסתמך רק על ה-listener הגלובלי -
      // כך המעבר ללוח הבקרה קורה מיד ובאופן ודאי, גם אם ה-listener מתעכב מסיבה כלשהי.
      onSuccess(result.session);
    } catch (e) {
      setError(e.message === "Invalid login credentials" ? 'דוא"ל או סיסמה שגויים.' : (e.message || "שגיאת התחברות"));
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div dir="rtl" lang="he" className="min-h-screen bg-slate-900 flex items-center justify-center p-4" style={{ fontFamily: "'Inter','Rubik','Assistant',sans-serif" }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        {mfaFactorId ? (
          <MfaCodeStep factorId={mfaFactorId} onVerified={onSuccess} onCancel={() => { setMfaFactorId(null); api.signOut(); }} />
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

// ==================== Dashboard ====================
function Dashboard({ data, onExport, isAdmin }) {
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

  const now = new Date(new Date().toDateString());
  const in7 = new Date(now); in7.setDate(in7.getDate() + 7);
  const in30 = new Date(now); in30.setDate(in30.getDate() + 30);

  const cashflowAlerts = [];
  data.purchaseOrders.forEach((po) => {
    const total = poTotalAmount(po);
    const balance = total - poPaidAmount(data, po.id);
    if (balance <= 0.01) return;
    const supplier = data.suppliers.find((s) => s.id === po.supplierId);
    const sym = CURRENCY_SYMBOLS[po.currency] || po.currency;
    const balanceLabel = `${sym}${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    if (po.dueDate) {
      const due = new Date(po.dueDate);
      if (due < now) {
        const daysOverdue = Math.round((now - due) / 86400000);
        cashflowAlerts.push({ type: "overdue", po, supplier, text: `${supplier?.name || "ספק"} - עברו ${daysOverdue} ימים מיום היעד, יתרה לתשלום ${balanceLabel}` });
      } else if (due <= in7) {
        cashflowAlerts.push({ type: "due_week", po, supplier, text: `${supplier?.name || "ספק"} - תשלום ${balanceLabel} מגיע ב-${due.toLocaleDateString("he-IL")}` });
      } else if (due <= in30) {
        cashflowAlerts.push({ type: "due_month", po, supplier, text: `${supplier?.name || "ספק"} - תשלום ${balanceLabel} מגיע ב-${due.toLocaleDateString("he-IL")}` });
      }
    }
    if (po.paymentTerms === "deposit_balance" && (po.status === "in_production" || po.status === "in_transit")) {
      cashflowAlerts.push({ type: "shipping", po, supplier, text: `${supplier?.name || "ספק"} - הסחורה ${PO_STATUSES[po.status]?.label}, יתרה ${balanceLabel} ממתינה לשחרור` });
    }
  });
  const alertOrder = { overdue: 0, shipping: 1, due_week: 2, due_month: 3 };
  cashflowAlerts.sort((a, b) => alertOrder[a.type] - alertOrder[b.type]);
  const alertMeta = {
    overdue: { label: "פג תוקף - חובה לשלם", tone: "rose", icon: TriangleAlert },
    due_week: { label: "לתשלום השבוע", tone: "amber", icon: Database },
    due_month: { label: "לתשלום החודש", tone: "sky", icon: Database },
    shipping: { label: "שחרור יתרה לפני משלוח", tone: "violet", icon: Ship },
  };

  return (
    <div className="space-y-5">
      {isAdmin && cashflowAlerts.length > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2"><Database size={18} className="text-amber-600" /><h3 className="font-bold text-slate-800">מרכז התראות תזרים</h3></div>
          <div className="divide-y">
            {cashflowAlerts.map((a, i) => {
              const meta = alertMeta[a.type];
              const Icon = meta.icon;
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className={`p-2 rounded-xl bg-${meta.tone}-100 text-${meta.tone}-700 shrink-0`}><Icon size={16} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-xs text-slate-400">{a.po.poNumber}</span>
                    </div>
                    <div className="text-sm text-slate-700 mt-0.5">{a.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      <div className="grid grid-cols-2 gap-3.5 sm:gap-4 sm:grid-cols-4">
        {[
          { label: "סה\"כ יחידות במלאי", value: totalUnits, icon: Package, iconCls: "bg-sky-50/80 text-sky-600" },
          { label: "פריטים בקטלוג", value: items.length, icon: Database, iconCls: "bg-violet-50/80 text-violet-600" },
          { label: "מיקומים פעילים", value: locations.length, icon: Warehouse, iconCls: "bg-amber-50/80 text-amber-600" },
          { label: "מתחת לסף", value: lowStock.length, icon: TriangleAlert, iconCls: "bg-rose-50/80 text-rose-600", valueCls: "text-rose-600" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div
              key={i}
              className="rounded-[1.25rem] border border-white/60 bg-white/70 backdrop-blur-xl p-4 sm:p-5 min-w-0 shadow-[0_8px_30px_rgba(15,23,42,0.06)]"
            >
              <div className={`inline-flex p-2.5 rounded-2xl mb-3 ${kpi.iconCls}`}><Icon size={18} /></div>
              <div className={`text-xl sm:text-2xl font-bold leading-tight tracking-tight ${kpi.valueCls || "text-slate-800"}`}>{kpi.value}</div>
              <div className="text-slate-500 text-xs sm:text-sm mt-1 leading-snug font-medium">{kpi.label}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-slate-800">מבט-על מלאי לפי פריט ומיקום</h3>
          <button onClick={onExport} className={btnGhost + " flex items-center gap-1.5 !py-1.5 !px-3 text-sm"}><Download size={16} /> ייצוא ל-CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-slate-500 text-right">
                <th className="px-5 py-3 font-medium">פריט</th><th className="px-5 py-3 font-medium">קטגוריה</th>
                <th className="px-5 py-3 font-medium">מחסן מרכזי</th><th className="px-5 py-3 font-medium">ברכבים</th>
                <th className="px-5 py-3 font-medium">סה"כ</th><th className="px-5 py-3 font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item.id} className="border-t">
                  <td className="px-5 py-3 font-medium text-slate-800">{r.item.name}</td>
                  <td className="px-5 py-3 text-slate-500">{CATEGORIES[r.item.category]}</td>
                  <td className="px-5 py-3">{r.whQty} {r.item.unit}</td>
                  <td className="px-5 py-3">{r.vehicleQty} {r.item.unit}</td>
                  <td className="px-5 py-3 font-bold">{r.total} {r.item.unit}</td>
                  <td className="px-5 py-3">{r.low ? <Badge tone="rose">מתחת לסף</Badge> : <Badge tone="emerald">תקין</Badge>}</td>
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
  const [form, setForm] = useState({ name: "", fragranceName: "", category: "device", unit: "יחידה", minThreshold: 0, quantity: 0, supplierSku: "" });
  const [error, setError] = useState("");

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const warehouse = data.locations.find((l) => l.type === "warehouse");

  const submit = async () => {
    const isConsumable = form.category === "consumable";
    if (isConsumable && !form.fragranceName.trim()) { setError("שם הריח הוא שדה חובה"); return; }
    if (!isConsumable && !form.name.trim()) { setError("שם הפריט הוא שדה חובה"); return; }
    const finalUnit = isConsumable ? form.unit : "יחידה";
    if (!finalUnit.trim()) { setError("יחידת מידה / גודל אריזה הוא שדה חובה"); return; }
    setError("");
    try {
      const finalName = isConsumable ? `תמצית ריח - ${form.fragranceName.trim()} (${finalUnit})` : form.name.trim();
      const newItemId = await api.addItem({
        name: finalName, category: form.category, unit: finalUnit, minThreshold: Number(form.minThreshold) || 0,
        supplierSku: form.supplierSku, fragranceGroup: isConsumable ? form.fragranceName.trim() : null,
      });
      const qty = Number(form.quantity) || 0;
      if (qty > 0 && warehouse) {
        await api.setItemStock(newItemId, warehouse.id, qty);
      }
      setForm({ name: "", fragranceName: "", category: "device", unit: "יחידה", minThreshold: 0, quantity: 0, supplierSku: "" });
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
    setEditForm({
      name: it.name, fragranceName: it.category === "consumable" ? guessFragranceName(it) : "",
      category: it.category, unit: it.unit, minThreshold: it.minThreshold, unitCost: it.unitCost ?? "",
      quantity: currentQty, supplierSku: it.supplierSku || "",
    });
    setEditError("");
  };

  const saveEdit = async () => {
    const isConsumable = editForm.category === "consumable";
    if (isConsumable && !editForm.fragranceName.trim()) { setEditError("שם הריח הוא שדה חובה"); return; }
    if (!isConsumable && !editForm.name.trim()) { setEditError("שם הפריט הוא שדה חובה"); return; }
    const finalUnit = isConsumable ? editForm.unit.trim() : "יחידה";
    if (!finalUnit) { setEditError("יחידת מידה / גודל אריזה הוא שדה חובה"); return; }
    setEditBusy(true);
    try {
      const finalName = isConsumable ? `תמצית ריח - ${editForm.fragranceName.trim()} (${finalUnit})` : editForm.name.trim();
      await api.updateItem(editItem.id, {
        name: finalName,
        category: editForm.category,
        unit: finalUnit,
        minThreshold: Number(editForm.minThreshold) || 0,
        unitCost: editForm.unitCost === "" ? null : Number(editForm.unitCost),
        supplierSku: editForm.supplierSku.trim(),
        fragranceGroup: isConsumable ? editForm.fragranceName.trim() : null,
      });
      if (warehouse) {
        await api.setItemStock(editItem.id, warehouse.id, Number(editForm.quantity) || 0);
      }
      await refresh();
      setEditItem(null);
    } catch (e) { setEditError(e.message); } finally { setEditBusy(false); }
  };

  // ---------- סיכום מלאי לפי ריח (מרכז כל גדלי האריזה של אותו ריח לשורה אחת) ----------
  const totalStockOf = (itemId) => data.locations.reduce((s, l) => s + (data.stock[`${itemId}|${l.id}`] || 0), 0);
  const fragranceGroups = {};
  data.items.filter((it) => it.category === "consumable").forEach((it) => {
    const groupName = guessFragranceName(it);
    if (!fragranceGroups[groupName]) fragranceGroups[groupName] = { name: groupName, sizes: [], totalWeighted: 0 };
    const qty = totalStockOf(it.id);
    const volumePerUnit = packageVolumeOf(it);
    fragranceGroups[groupName].sizes.push({ itemId: it.id, unit: it.unit, qty });
    fragranceGroups[groupName].totalWeighted += qty * volumePerUnit;
  });
  const fragranceGroupList = Object.values(fragranceGroups).sort((a, b) => a.name.localeCompare(b.name, "he"));

  const [repackFor, setRepackFor] = useState(null); // fragrance name, or "" for open-picker mode

  const deviceItems = data.items.filter((it) => it.category === "device");

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl text-slate-800">פריטים</h2>
        <div className="flex items-center gap-2">
          {isAdmin && fragranceGroupList.length > 0 && (
            <button onClick={() => setRepackFor("")} className={btnGhost + " flex items-center gap-1.5 !py-2"}><Calculator size={16} /> המרת אריזות / מזיגה</button>
          )}
          {isAdmin && <button onClick={() => setOpen(true)} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> פריט חדש</button>}
        </div>
      </div>

      {fragranceGroupList.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold text-slate-800 mb-2">תמציות ריח - כרטיס אחד לכל ריח</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fragranceGroupList.map((g) => (
              <div key={g.name} className="bg-white rounded-2xl border shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-bold text-slate-800">{g.name}</div>
                  <Badge tone="violet">סה"כ {g.totalWeighted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ל'/ק"ג</Badge>
                </div>
                <div className="space-y-1.5 mb-2">
                  {g.sizes.map((s) => {
                    const item = data.items.find((i) => i.id === s.itemId);
                    return (
                      <div key={s.itemId} className="flex items-center justify-between text-sm group">
                        <span className="text-slate-500">{s.unit}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700">{s.qty} יח'</span>
                          {isAdmin && item && (
                            <button onClick={() => openEdit(item)} className="text-gray-300 hover:text-amber-600 opacity-0 group-hover:opacity-100 transition" title="עריכת אריזה זו"><Pencil size={13} /></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {isAdmin && (
                  <button onClick={() => setRepackFor(g.name)} className="text-xs text-amber-600 hover:underline font-medium mt-1 flex items-center gap-1"><Calculator size={12} /> המרת אריזות לריח זה</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="font-bold text-slate-800 mb-2">מכשירים</h3>
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-5 py-3 font-medium">שם פריט</th><th className="px-5 py-3 font-medium">SKU ספק</th>
              <th className="px-5 py-3 font-medium">יחידת מידה</th><th className="px-5 py-3 font-medium">סף מינימום</th>
              <th className="px-5 py-3 font-medium">עלות נחיתה ליח'</th><th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {deviceItems.map((it) => (
              <tr key={it.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => isAdmin && openEdit(it)}>
                <td className="px-5 py-3 font-medium text-slate-800">{it.name}</td>
                <td className="px-5 py-3 text-slate-500">{it.supplierSku || <span className="text-slate-300">-</span>}</td>
                <td className="px-5 py-3">{it.unit}</td>
                <td className="px-5 py-3">{it.minThreshold}</td>
                <td className="px-5 py-3">{it.unitCost ? `₪${Number(it.unitCost).toFixed(2)}` : <span className="text-slate-300">-</span>}</td>
                <td className="px-5 py-3 text-left" onClick={(e) => e.stopPropagation()}>
                  {isAdmin && (
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(it)} className="text-gray-400 hover:text-amber-600" title="עריכה"><Pencil size={16} /></button>
                      <button onClick={() => removeItem(it.id)} className="text-gray-400 hover:text-rose-600" title="מחיקה"><Trash2 size={16} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {deviceItems.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">אין מכשירים עדיין</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="הוספת פריט חדש" onClose={() => setOpen(false)}>
          <Field label="קטגוריה">
            <select
              className={inputCls}
              value={form.category}
              onChange={(e) => {
                const category = e.target.value;
                const unit = category === "consumable" ? (PACKAGE_SIZES.includes(form.unit) ? form.unit : PACKAGE_SIZES[2]) : "יחידה";
                setForm({ ...form, category, unit });
              }}
            >
              <option value="device">מכשירים</option><option value="consumable">נוזלים ומתכלים</option>
            </select>
          </Field>
          {form.category === "consumable" ? (
            <Field label="שם הריח"><input className={inputCls} value={form.fragranceName} onChange={(e) => setForm({ ...form, fragranceName: e.target.value })} placeholder="לדוגמה: מלון אסטוריה" /></Field>
          ) : (
            <Field label="שם פריט"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          )}
          {form.category === "consumable" ? (
            <Field label="גודל אריזה / נפח">
              <select className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {PACKAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <div className="text-xs text-slate-400 mt-1">ניתן להוסיף אותו ריח כמה פעמים בגדלים שונים - כל גודל יתנהל כמלאי נפרד, ויסוכם יחד בתצוגה למעלה.</div>
            </Field>
          ) : (
            <Field label="יחידת מידה"><input className={inputCls + " bg-gray-100 text-slate-500"} value="יחידה" disabled readOnly /></Field>
          )}
          <Field label="כינוי / SKU אצל הספק (לא חובה)"><input className={inputCls} value={form.supplierSku} onChange={(e) => setForm({ ...form, supplierSku: e.target.value })} placeholder='למשל: A300' /></Field>
          <div className="border-t pt-3 mt-1 mb-1">
            <div className="text-xs font-bold text-slate-500 mb-2">מלאי בפועל במחסן המרכזי (מספר יחידות, לא היחידה עצמה)</div>
            <Field label={`כמה ${form.category === "consumable" ? form.unit || "יחידות" : "יחידות"} יש כרגע במחסן`}>
              <input type="number" min="0" className={inputCls} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" />
            </Field>
          </div>
          <Field label="סף מלאי מינימלי להתראה"><input type="number" className={inputCls} value={form.minThreshold} onChange={(e) => setForm({ ...form, minThreshold: e.target.value })} /></Field>
          {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
          <button onClick={submit} className={btnPrimary + " w-full"}>שמירת פריט</button>
        </Modal>
      )}

      {editItem && (
        <Modal title="עריכת פריט" onClose={() => setEditItem(null)}>
          <Field label="קטגוריה">
            <select
              className={inputCls}
              value={editForm.category}
              onChange={(e) => {
                const category = e.target.value;
                const unit = category === "consumable" ? (PACKAGE_SIZES.includes(editForm.unit) ? editForm.unit : PACKAGE_SIZES[2]) : "יחידה";
                setEditForm({ ...editForm, category, unit });
              }}
            >
              <option value="device">מכשירים</option><option value="consumable">נוזלים ומתכלים</option>
            </select>
          </Field>
          {editForm.category === "consumable" ? (
            <Field label="שם הריח"><input className={inputCls} value={editForm.fragranceName} onChange={(e) => setEditForm({ ...editForm, fragranceName: e.target.value })} placeholder="לדוגמה: מלון אסטוריה" /></Field>
          ) : (
            <Field label="שם פריט"><input className={inputCls} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
          )}
          {editForm.category === "consumable" ? (
            <Field label="גודל אריזה / נפח">
              <select className={inputCls} value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}>
                {PACKAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="יחידת מידה"><input className={inputCls + " bg-gray-100 text-slate-500"} value="יחידה" disabled readOnly /></Field>
          )}
          <Field label="כינוי / SKU אצל הספק (לא חובה)"><input className={inputCls} value={editForm.supplierSku} onChange={(e) => setEditForm({ ...editForm, supplierSku: e.target.value })} placeholder='למשל: A300' /></Field>
          <div className="border-t pt-3 mt-1 mb-1">
            <div className="text-xs font-bold text-slate-500 mb-2">מלאי בפועל במחסן המרכזי (מספר יחידות, לא היחידה עצמה)</div>
            <Field label={`כמה ${editForm.category === "consumable" ? editForm.unit || "יחידות" : "יחידות"} יש כרגע במחסן`}>
              <input type="number" min="0" className={inputCls} value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
            </Field>
          </div>
          <Field label="סף מלאי מינימלי להתראה"><input type="number" className={inputCls} value={editForm.minThreshold} onChange={(e) => setEditForm({ ...editForm, minThreshold: e.target.value })} /></Field>
          <Field label="עלות נחיתה ליח' (₪)"><input type="number" min="0" step="0.01" className={inputCls} value={editForm.unitCost} onChange={(e) => setEditForm({ ...editForm, unitCost: e.target.value })} placeholder="לא הוגדר" /></Field>
          {editError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{editError}</div>}
          <button onClick={saveEdit} disabled={editBusy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{editBusy && <Loader2 size={16} className="animate-spin" />}שמירת שינויים</button>
        </Modal>
      )}
      {repackFor !== null && (
        <RepackagingModal
          data={data}
          refresh={refresh}
          fragranceGroupList={fragranceGroupList}
          initialFragrance={repackFor}
          onClose={() => setRepackFor(null)}
        />
      )}
    </div>
  );
}

function RepackagingModal({ data, refresh, fragranceGroupList, initialFragrance, onClose }) {
  const warehouse = data.locations.find((l) => l.type === "warehouse");
  const [fragranceName, setFragranceName] = useState(initialFragrance || "");
  const [consumedQtys, setConsumedQtys] = useState({}); // itemId -> qty string
  const [producedQtys, setProducedQtys] = useState({}); // unit -> qty string
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const itemFor = (itemId) => data.items.find((i) => i.id === itemId);
  const totalStockOf = (itemId) => data.locations.reduce((s, l) => s + (data.stock[`${itemId}|${l.id}`] || 0), 0);

  // מחושב ישירות מתוך data.items + data.stock בכל רינדור - בלי להסתמך על אף חישוב מוכן
  // מראש, כדי שלא יהיה פער בין מה שבאמת קיים במלאי לבין מה שמוצג כאן.
  const group = fragranceName
    ? {
        name: fragranceName,
        sizes: data.items
          .filter((it) => it.category === "consumable" && guessFragranceName(it) === normalizeText(fragranceName))
          .map((it) => ({ itemId: it.id, unit: it.unit, qty: totalStockOf(it.id) })),
      }
    : null;
  const existingUnits = group ? group.sizes.map((s) => s.unit) : [];

  const consumedLines = group
    ? group.sizes
        .filter((s) => canOpenForRepack(itemFor(s.itemId)) && Number(consumedQtys[s.itemId]) > 0)
        .map((s) => ({ itemId: s.itemId, qty: Number(consumedQtys[s.itemId]), unit: s.unit, available: s.qty, volume: packageVolumeOf(itemFor(s.itemId)) }))
    : [];
  const producedLines = SMALL_PACKAGES
    .filter((size) => Number(producedQtys[size]) > 0)
    .map((size) => {
      const existing = group?.sizes.find((s) => s.unit === size);
      return { unit: size, qty: Number(producedQtys[size]), existingItemId: existing?.itemId || null };
    });

  const consumedVolume = consumedLines.reduce((s, l) => s + l.qty * l.volume, 0);
  const producedVolume = producedLines.reduce((s, l) => s + l.qty * (PACKAGE_SIZE_VOLUMES[l.unit] || 0), 0);
  const volumeDiff = producedVolume - consumedVolume;

  const overStock = consumedLines.find((l) => l.qty > l.available);

  const submit = async () => {
    setError("");
    if (!fragranceName) { setError("יש לבחור ריח"); return; }
    if (!warehouse) { setError("לא נמצא מחסן מרכזי במערכת"); return; }
    if (consumedLines.length === 0) { setError("יש לבחור לפחות אריזה אחת לגריעה"); return; }
    if (producedLines.length === 0) { setError("יש לבחור לפחות אריזה אחת להוספה"); return; }
    if (overStock) { setError(`אין מספיק מלאי בגודל ${overStock.unit} (זמין: ${overStock.available})`); return; }
    setBusy(true);
    try {
      const batchTag = `המרה - ${fragranceName} (${new Date().toLocaleDateString("he-IL")})`;
      const resolvedProduced = [];
      for (const line of producedLines) {
        let itemId = line.existingItemId;
        if (!itemId) {
          itemId = await api.addItem({
            name: `תמצית ריח - ${fragranceName} (${line.unit})`,
            category: "consumable", unit: line.unit, minThreshold: 0, fragranceGroup: fragranceName,
          });
        }
        resolvedProduced.push({ itemId, qty: line.qty, label: line.unit });
      }
      const resolvedConsumed = consumedLines.map((l) => ({ itemId: l.itemId, qty: l.qty, label: l.unit }));
      await api.performRepackaging(warehouse.id, resolvedConsumed, resolvedProduced, note ? `${batchTag} - ${note}` : batchTag);
      await refresh();
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="המרת אריזות / מזיגה למלאי" onClose={onClose}>
      <Field label="ריח">
        <select className={inputCls} value={fragranceName} onChange={(e) => { setFragranceName(e.target.value); setConsumedQtys({}); setProducedQtys({}); }}>
          <option value="">בחר ריח...</option>
          {fragranceGroupList.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
        </select>
      </Field>

      {group && (
        <>
          <div className="mb-3">
            <div className="text-sm font-bold text-slate-700 mb-1">אריזות לגריעה מהמחסן (פתיחה)</div>
            <p className="text-xs text-slate-400 mb-2">רק אריזות גדולות (ג'ריקן 25 ליטר / חבית 5 ליטר) עם מלאי גדול מ-0 מוצגות כאן. אריזות קטנות ניתן רק להוסיף למטה.</p>
            <div className="space-y-2">
              {group.sizes.filter((s) => canOpenForRepack(itemFor(s.itemId)) && s.qty > 0).map((s) => (
                <div key={s.itemId} className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 w-28 shrink-0">{s.unit}</span>
                  <span className="text-xs text-slate-400 w-20 shrink-0">זמין: {s.qty}</span>
                  <input type="number" min="0" max={s.qty} className={inputCls + " !py-1.5"} value={consumedQtys[s.itemId] || ""} onChange={(e) => setConsumedQtys({ ...consumedQtys, [s.itemId]: e.target.value })} placeholder="0" />
                </div>
              ))}
              {group.sizes.filter((s) => canOpenForRepack(itemFor(s.itemId)) && s.qty > 0).length === 0 && (
                <div className="text-sm text-slate-400 py-2">אין מלאי אריזה גדולה (ג'ריקן/חבית) זמין לריח הזה כרגע - אי אפשר לבצע המרה עד שיתקבל מלאי גדול.</div>
              )}
            </div>
          </div>

          <div className="mb-3">
            <div className="text-sm font-bold text-slate-700 mb-1">אריזות להוספה למלאי (מזיגה)</div>
            <p className="text-xs text-slate-400 mb-2">רק אריזות קטנות - ליטר, חצי ליטר, 250 מ"ל - נוצרות מהמזיגה.</p>
            <div className="space-y-2">
              {SMALL_PACKAGES.map((size) => (
                <div key={size} className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 w-28 shrink-0">{size}{!existingUnits.includes(size) && <span className="text-xs text-amber-500"> (חדש)</span>}</span>
                  <input type="number" min="0" className={inputCls + " !py-1.5"} value={producedQtys[size] || ""} onChange={(e) => setProducedQtys({ ...producedQtys, [size]: e.target.value })} placeholder="0" />
                </div>
              ))}
            </div>
          </div>

          {(consumedLines.length > 0 || producedLines.length > 0) && (
            <div className="bg-gray-50 rounded-xl p-3 mb-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-500">נגרע</span><span className="font-medium">{consumedVolume.toLocaleString()} ל'/ק"ג</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">מופק</span><span className="font-medium">{producedVolume.toLocaleString()} ל'/ק"ג</span></div>
              <div className="flex items-center justify-between border-t mt-1 pt-1">
                <span className="text-slate-500">הפרש (איבוד/רווח מזיגה)</span>
                <span className={`font-bold ${Math.abs(volumeDiff) > consumedVolume * 0.05 ? "text-amber-600" : "text-slate-700"}`}>{volumeDiff > 0 ? "+" : ""}{volumeDiff.toLocaleString(undefined, { maximumFractionDigits: 2 })} ל'/ק"ג</span>
              </div>
            </div>
          )}

          <Field label="הערה (לא חובה)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="לדוגמה: מזיגה ידנית, אובדן טבעי" /></Field>
        </>
      )}

      {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
      <button onClick={submit} disabled={busy || !group} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}ביצוע ההמרה</button>
    </Modal>
  );
}

// ==================== Locations ====================
function LocationsScreen({ data, refresh, isAdmin }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "vehicle" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editLoc, setEditLoc] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const openNew = () => { setForm({ name: "", type: "vehicle" }); setError(""); setOpen(true); };
  const submit = async () => {
    if (!form.name.trim()) { setError("שם המיקום הוא שדה חובה"); return; }
    setBusy(true);
    try { await api.addLocation(form); await refresh(); setOpen(false); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const openEdit = (loc) => { setEditLoc(loc); setEditForm({ name: loc.name, type: loc.type }); setEditError(""); };
  const saveEdit = async () => {
    if (!editForm.name.trim()) { setEditError("שם המיקום הוא שדה חובה"); return; }
    setEditBusy(true);
    try { await api.updateLocation(editLoc.id, editForm); await refresh(); setEditLoc(null); }
    catch (e) { setEditError(e.message); } finally { setEditBusy(false); }
  };

  const stockAt = (locId) => data.items.reduce((sum, it) => sum + (data.stock[`${it.id}|${locId}`] || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl text-slate-800">מיקומים</h2>
        {isAdmin && <button onClick={openNew} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> מיקום חדש</button>}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.locations.map((loc) => (
          <div key={loc.id} className={`bg-white rounded-2xl border shadow-sm p-5 flex items-center gap-3 ${isAdmin ? "cursor-pointer hover:shadow-md transition" : ""}`} onClick={() => isAdmin && openEdit(loc)}>
            <div className={`p-2.5 rounded-xl ${loc.type === "warehouse" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
              {loc.type === "warehouse" ? <Building2 size={20} /> : <Truck size={20} />}
            </div>
            <div className="flex-1">
              <div className="font-bold text-slate-800">{loc.name}</div>
              <div className="text-sm text-slate-500">{loc.type === "warehouse" ? "מחסן" : "רכב טכנאי"} · {stockAt(loc.id)} יח' סה"כ</div>
            </div>
            {isAdmin && <Pencil size={16} className="text-gray-300" />}
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
          <button onClick={submit} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}שמירת מיקום</button>
        </Modal>
      )}

      {editLoc && (
        <Modal title="עריכת מיקום" onClose={() => setEditLoc(null)}>
          <Field label="סוג מיקום">
            <select className={inputCls} value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
              <option value="vehicle">רכב טכנאי</option><option value="warehouse">מחסן</option>
            </select>
          </Field>
          <Field label="שם המיקום"><input className={inputCls} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} autoFocus /></Field>
          {editError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{editError}</div>}
          <button onClick={saveEdit} disabled={editBusy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{editBusy && <Loader2 size={16} className="animate-spin" />}שמירת שינויים</button>
        </Modal>
      )}
    </div>
  );
}

// ==================== מכירה חדשה / הזמנה (Sale) ====================
function SaleScreen({ data, refresh, onOpenCustomer, initialCustomerId }) {
  const [customerId, setCustomerId] = useState(initialCustomerId || "");
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: "", phone: "", address: "", clientType: "private" });
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [lines, setLines] = useState([{ id: Math.random().toString(36).slice(2), itemId: "", qty: "1", unitPrice: "" }]);
  const [note, setNote] = useState("");
  const [priceMode, setPriceMode] = useState("excl"); // excl = prices before VAT, incl = prices include VAT
  const [vatRate, setVatRate] = useState(String(data.companySettings.vatRate ?? 18));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null); // { customerId, total }

  const warehouse = data.locations.find((l) => l.type === "warehouse");
  const vehicles = data.locations.filter((l) => l.type === "vehicle");

  useEffect(() => {
    if (!sourceLocationId && warehouse) setSourceLocationId(warehouse.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouse?.id]);

  const setLine = (id, patch) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines([...lines, { id: Math.random().toString(36).slice(2), itemId: "", qty: "1", unitPrice: "" }]);
  const removeLine = (id) => setLines(lines.filter((l) => l.id !== id));
  const onPickItem = (id, itemId) => {
    const it = data.items.find((i) => i.id === itemId);
    setLine(id, { itemId, unitPrice: it?.unitCost ? String(Math.round(it.unitCost * 1.4 * 100) / 100) : "" });
  };

  const stockOf = (itemId) => (sourceLocationId ? data.stock[`${itemId}|${sourceLocationId}`] || 0 : 0);
  const linesSubtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const vatPct = Number(vatRate) || 0;
  let preVatAmount, vatAmount, total;
  if (priceMode === "excl") {
    preVatAmount = linesSubtotal;
    vatAmount = preVatAmount * (vatPct / 100);
    total = preVatAmount + vatAmount;
  } else {
    total = linesSubtotal;
    vatAmount = total * (vatPct / (100 + vatPct));
    preVatAmount = total - vatAmount;
  }
  // המחיר בפועל שנגבה ליחידה, כולל מע"מ - זה מה שנשמר בכל שורת תנועה
  const finalUnitPrice = (rawPrice) => priceMode === "excl" ? Number(rawPrice) * (1 + vatPct / 100) : Number(rawPrice);

  const createNewCustomer = async () => {
    if (!newCustomerForm.name.trim()) { setError("שם הלקוח הוא שדה חובה"); return; }
    setBusy(true);
    try {
      const newId = await api.addCustomer(newCustomerForm);
      await refresh();
      setNewCustomerMode(false);
      setError("");
      setCustomerId(newId);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const submit = async () => {
    setError("");
    if (!customerId) { setError("יש לבחור לקוח"); return; }
    if (!sourceLocationId) { setError("יש לבחור מיקום מקור"); return; }
    const validLines = lines.filter((l) => l.itemId && Number(l.qty) > 0 && Number(l.unitPrice) >= 0);
    if (validLines.length === 0) { setError("יש להוסיף לפחות שורת מוצר אחת"); return; }
    const overStock = validLines.find((l) => Number(l.qty) > stockOf(l.itemId));
    if (overStock) {
      const it = data.items.find((i) => i.id === overStock.itemId);
      setError(`אין מספיק מלאי ל"${it?.name}" במיקום שנבחר (זמין: ${stockOf(overStock.itemId)})`);
      return;
    }
    setBusy(true);
    try {
      const batchTag = `הזמנה #${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const vatNote = priceMode === "excl" ? `מחיר לפני מע"מ (${vatPct}%)` : `מחיר כולל מע"מ (${vatPct}%)`;
      for (const l of validLines) {
        await api.insertTransaction({
          type: "install", itemId: l.itemId, qty: Number(l.qty),
          fromLocationId: sourceLocationId, customerId,
          unitPrice: Math.round(finalUnitPrice(l.unitPrice) * 100) / 100,
          note: note ? `${batchTag} - ${note} - ${vatNote}` : `${batchTag} - ${vatNote}`,
        });
      }
      await refresh();
      setSuccess({ customerId, total });
      setLines([{ id: Math.random().toString(36).slice(2), itemId: "", qty: "1", unitPrice: "" }]);
      setNote("");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const newSale = () => { setSuccess(null); setCustomerId(""); };

  if (success) {
    const customer = data.customers.find((c) => c.id === success.customerId);
    return (
      <div className="max-w-lg mx-auto text-center py-10">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4"><CircleCheck size={32} /></div>
        <h2 className="font-bold text-xl text-slate-800 mb-1">ההזמנה נשמרה בהצלחה</h2>
        <p className="text-slate-500 mb-1">עבור {customer?.name} · סה"כ ₪{success.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        <p className="text-slate-400 text-sm mb-6">המלאי עודכן אוטומטית - אין צורך בפעולה נוספת.</p>
        <div className="flex gap-2 justify-center">
          <button onClick={newSale} className={btnPrimary}>הזמנה חדשה</button>
          <button onClick={() => onOpenCustomer(success.customerId)} className={btnGhost}>צפייה בתיק הלקוח</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="font-bold text-xl text-slate-800 mb-1">מכירה / הזמנה חדשה</h2>
      <p className="text-slate-500 text-sm mb-4">בחרו לקוח, הוסיפו שורות מוצרים (מכשירים ותמציות), ושמרו - המלאי במחסן המרכזי יתעדכן אוטומטית, בלי צורך בעדכון ידני.</p>

      <div className="bg-white rounded-2xl border shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-slate-700">לקוח</span>
          <button onClick={() => setNewCustomerMode(!newCustomerMode)} className="text-xs text-amber-600 hover:underline font-medium flex items-center gap-1"><Plus size={12} /> {newCustomerMode ? "בחירת לקוח קיים" : "לקוח חדש"}</button>
        </div>
        {!newCustomerMode ? (
          <select className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">בחר לקוח...</option>
            {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <div className="space-y-2">
            <input className={inputCls} placeholder="שם הלקוח" value={newCustomerForm.name} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="טלפון" value={newCustomerForm.phone} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })} />
              <select className={inputCls} value={newCustomerForm.clientType} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, clientType: e.target.value })}>
                <option value="private">פרטי</option><option value="business">עסקי</option>
              </select>
            </div>
            <input className={inputCls} placeholder="כתובת" value={newCustomerForm.address} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })} />
            <button onClick={createNewCustomer} disabled={busy} className={btnGhost + " w-full"}>שמירת לקוח חדש ובחירה</button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-5 mb-4">
        <span className="text-sm font-bold text-slate-700 block mb-2">מקור המלאי</span>
        <select className={inputCls} value={sourceLocationId} onChange={(e) => setSourceLocationId(e.target.value)}>
          {warehouse && <option value={warehouse.id}>{warehouse.name}</option>}
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-slate-700">שורות מוצרים</span>
          <button onClick={addLine} className={btnGhost + " !py-1 !px-2.5 text-xs"}><Plus size={14} className="inline" /> שורה</button>
        </div>
        <div className="space-y-2">
          {lines.map((l) => {
            const available = l.itemId ? stockOf(l.itemId) : null;
            const overLimit = l.itemId && Number(l.qty) > available;
            return (
              <div key={l.id}>
                <div className="grid grid-cols-6 gap-1.5 items-center">
                  <select className={inputCls + " col-span-3 !py-2 text-sm"} value={l.itemId} onChange={(e) => onPickItem(l.id, e.target.value)}>
                    <option value="">פריט...</option>
                    {data.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                  <input type="number" min="1" placeholder="כמות" className={inputCls + " col-span-1 !py-2 text-sm"} value={l.qty} onChange={(e) => setLine(l.id, { qty: e.target.value })} />
                  <input type="number" min="0" step="0.01" placeholder="מחיר (₪)" className={inputCls + " col-span-1 !py-2 text-sm"} value={l.unitPrice} onChange={(e) => setLine(l.id, { unitPrice: e.target.value })} />
                  {lines.length > 1 && <button onClick={() => removeLine(l.id)} className="text-gray-400 hover:text-rose-600 justify-self-center"><Trash2 size={15} /></button>}
                </div>
                {l.itemId && <div className={`text-xs mt-0.5 ${overLimit ? "text-rose-500" : "text-slate-400"}`}>זמין במקור שנבחר: {available}{overLimit ? " - לא מספיק!" : ""}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-5 mb-4">
        <span className="text-sm font-bold text-slate-700 block mb-2">מע"מ</span>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setPriceMode("excl")} className={`flex-1 rounded-xl py-2 border text-sm font-medium ${priceMode === "excl" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}>המחירים למעלה לפני מע"מ</button>
          <button type="button" onClick={() => setPriceMode("incl")} className={`flex-1 rounded-xl py-2 border text-sm font-medium ${priceMode === "incl" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}>המחירים למעלה כוללים מע"מ</button>
        </div>
        <Field label={'אחוז מע"מ נוכחי'}>
          <input type="number" min="0" step="0.1" className={inputCls + " w-28"} value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
        </Field>
      </div>

      <div className="bg-gray-50 rounded-2xl p-4 mb-4 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">סכום לפני מע"מ</span>
          <span className="font-medium text-slate-700">₪{preVatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">מע"מ ({vatPct}%)</span>
          <span className="font-medium text-slate-700">₪{vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex items-center justify-between pt-1.5 border-t">
          <span className="font-bold text-slate-800">סה"כ הזמנה (כולל מע"מ)</span>
          <span className="font-bold text-slate-800 text-lg">₪{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-5 mb-4">
        <Field label="הערה (לא חובה)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>

      {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
      <button onClick={submit} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2 text-lg py-3.5"}>{busy && <Loader2 size={16} className="animate-spin" />}שמירת הזמנה ועדכון מלאי אוטומטי</button>
    </div>
  );
}

// ==================== Customers ====================
function CustomersScreen({ data, refresh, isAdmin, onOpenFile }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", contact: "", phone: "", email: "", clientType: "private" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editCustomer, setEditCustomer] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const openNew = () => { setForm({ name: "", address: "", contact: "", phone: "", email: "", clientType: "private" }); setError(""); setOpen(true); };
  const submit = async () => {
    if (!form.name.trim()) { setError("שם הלקוח הוא שדה חובה"); return; }
    setBusy(true);
    try {
      await api.addCustomer(form);
      await refresh();
      setOpen(false);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const openEdit = (c) => { setEditCustomer(c); setEditForm({ name: c.name, address: c.address || "", contact: c.contact || "", phone: c.phone || "", email: c.email || "", clientType: c.clientType || "private" }); setEditError(""); };
  const saveEdit = async () => {
    if (!editForm.name.trim()) { setEditError("שם הלקוח הוא שדה חובה"); return; }
    setEditBusy(true);
    try { await api.updateCustomer(editCustomer.id, editForm); await refresh(); setEditCustomer(null); }
    catch (e) { setEditError(e.message); } finally { setEditBusy(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl text-slate-800">לקוחות</h2>
        {isAdmin && <button onClick={openNew} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> לקוח חדש</button>}
      </div>
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-5 py-3 font-medium">שם לקוח / עסק</th><th className="px-5 py-3 font-medium">סוג</th>
              <th className="px-5 py-3 font-medium">טלפון</th><th className="px-5 py-3 font-medium">אימייל</th>
              <th className="px-5 py-3 font-medium">כתובת</th><th className="px-5 py-3 font-medium">איש קשר</th><th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.customers.map((c) => (
              <tr key={c.id} className="border-t hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-slate-800">{c.name}</td>
                <td className="px-5 py-3"><Badge tone={CLIENT_TYPES[c.clientType]?.tone}>{CLIENT_TYPES[c.clientType]?.label}</Badge></td>
                <td className="px-5 py-3 text-slate-500">{c.phone || "-"}</td>
                <td className="px-5 py-3 text-slate-500">{c.email || "-"}</td>
                <td className="px-5 py-3 text-slate-500">{c.address}</td>
                <td className="px-5 py-3 text-slate-500">{c.contact}</td>
                <td className="px-5 py-3 text-left">
                  <div className="flex items-center gap-3 justify-end">
                    {isAdmin && <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-amber-600" title="עריכה"><Pencil size={15} /></button>}
                    <button onClick={() => onOpenFile(c.id)} className="text-amber-600 hover:underline font-medium">תיק לקוח</button>
                  </div>
                </td>
              </tr>
            ))}
            {data.customers.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">אין לקוחות עדיין</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="הוספת לקוח" onClose={() => setOpen(false)}>
          <Field label="שם לקוח / עסק"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="סוג לקוח">
            <select className={inputCls} value={form.clientType} onChange={(e) => setForm({ ...form, clientType: e.target.value })}>
              <option value="private">פרטי</option><option value="business">עסקי</option>
            </select>
          </Field>
          <Field label="טלפון"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="אימייל"><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="כתובת"><input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="איש קשר"><input className={inputCls} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
          {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
          <button onClick={submit} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}שמירת לקוח</button>
        </Modal>
      )}

      {editCustomer && (
        <Modal title="עריכת לקוח" onClose={() => setEditCustomer(null)}>
          <Field label="שם לקוח / עסק"><input className={inputCls} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
          <Field label="סוג לקוח">
            <select className={inputCls} value={editForm.clientType} onChange={(e) => setEditForm({ ...editForm, clientType: e.target.value })}>
              <option value="private">פרטי</option><option value="business">עסקי</option>
            </select>
          </Field>
          <Field label="טלפון"><input className={inputCls} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></Field>
          <Field label="אימייל"><input type="email" className={inputCls} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></Field>
          <Field label="כתובת"><input className={inputCls} value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></Field>
          <Field label="איש קשר"><input className={inputCls} value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })} /></Field>
          {editError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{editError}</div>}
          <button onClick={saveEdit} disabled={editBusy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{editBusy && <Loader2 size={16} className="animate-spin" />}שמירת שינויים</button>
        </Modal>
      )}
    </div>
  );
}

function CustomerFile({ data, customerId, onBack, onCreateQuote, onStartSale, isAdmin }) {
  const customer = data.customers.find((c) => c.id === customerId);
  const history = data.transactions.filter((t) => t.customerId === customerId).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!customer) return null;

  const purchases = history.filter((t) => t.type === "install");
  const grandTotal = purchases.reduce((s, t) => s + (t.unitPrice != null ? t.unitPrice * t.qty : 0), 0);
  const deviceCount = purchases.filter((t) => data.items.find((i) => i.id === t.itemId)?.category === "device").reduce((s, t) => s + t.qty, 0);
  const consumableCount = purchases.filter((t) => data.items.find((i) => i.id === t.itemId)?.category === "consumable").reduce((s, t) => s + t.qty, 0);
  const customerQuotes = data.quotes.filter((q) => q.customerId === customerId).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 mb-4 text-sm"><ChevronLeft size={16} /> חזרה לרשימת לקוחות</button>
      <div className="bg-white rounded-2xl border shadow-sm p-5 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-bold text-xl text-slate-800">{customer.name}</h2>
              <Badge tone={CLIENT_TYPES[customer.clientType]?.tone}>{CLIENT_TYPES[customer.clientType]?.label}</Badge>
            </div>
            <p className="text-slate-500 mt-1">{customer.address}</p>
            <p className="text-slate-500">{customer.contact} {customer.phone && `· ${customer.phone}`} {customer.email && `· ${customer.email}`}</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && onStartSale && <button onClick={() => onStartSale(customer.id)} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><ShoppingCart size={16} /> הזמנה חדשה</button>}
            {isAdmin && <button onClick={() => onCreateQuote(customer.id, null)} className={btnGhost + " flex items-center gap-1.5 !py-2"}><FileText size={16} /> יצירת הצעת מחיר</button>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-2xl border shadow-sm p-5"><div className="text-slate-500 text-sm mb-1">סה"כ שולם</div><div className="text-2xl font-bold text-slate-800">₪{grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
        <div className="bg-white rounded-2xl border shadow-sm p-5"><div className="text-slate-500 text-sm mb-1">מכשירים שנרכשו</div><div className="text-2xl font-bold text-slate-800">{deviceCount}</div></div>
        <div className="bg-white rounded-2xl border shadow-sm p-5"><div className="text-slate-500 text-sm mb-1">תמציות שנרכשו</div><div className="text-2xl font-bold text-slate-800">{consumableCount}</div></div>
      </div>

      <h3 className="font-bold text-slate-800 mb-2">היסטוריית הזמנות ורכישות</h3>
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-5 py-3 font-medium">תאריך</th><th className="px-5 py-3 font-medium">פריט</th>
              <th className="px-5 py-3 font-medium">קטגוריה</th><th className="px-5 py-3 font-medium">יחידה / גודל</th>
              <th className="px-5 py-3 font-medium">כמות</th><th className="px-5 py-3 font-medium">מחיר ליח'</th>
              <th className="px-5 py-3 font-medium">סה"כ שורה</th><th className="px-5 py-3 font-medium">סוג</th><th className="px-5 py-3 font-medium">הערה</th>
            </tr>
          </thead>
          <tbody>
            {history.map((t) => {
              const item = data.items.find((i) => i.id === t.itemId);
              const lineTotal = t.unitPrice != null ? t.unitPrice * t.qty : null;
              return (
                <tr key={t.id} className="border-t">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{item?.name || "-"}</td>
                  <td className="px-5 py-3">{item ? <Badge tone={item.category === "device" ? "sky" : "violet"}>{CATEGORIES[item.category]}</Badge> : "-"}</td>
                  <td className="px-5 py-3 text-slate-500">{item?.unit || "-"}</td>
                  <td className="px-5 py-3">{t.qty}</td>
                  <td className="px-5 py-3">{t.unitPrice != null ? `₪${t.unitPrice.toFixed(2)}` : <span className="text-slate-300">-</span>}</td>
                  <td className="px-5 py-3 font-bold">{lineTotal != null ? `₪${lineTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : <span className="text-slate-300">-</span>}</td>
                  <td className="px-5 py-3"><Badge tone={TX_TYPES[t.type]?.color}>{TX_TYPES[t.type]?.label}</Badge></td>
                  <td className="px-5 py-3 text-slate-500">{t.note || "-"}</td>
                </tr>
              );
            })}
            {history.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">אין היסטוריה עדיין ללקוח זה</td></tr>}
          </tbody>
          {purchases.length > 0 && (
            <tfoot>
              <tr className="border-t bg-gray-50">
                <td colSpan={6} className="px-5 py-3 text-left font-bold text-slate-700">סה"כ שולם על ידי הלקוח</td>
                <td colSpan={3} className="px-5 py-3 font-bold text-amber-700">₪{grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {customerQuotes.length > 0 && (
        <>
          <h3 className="font-bold text-slate-800 mb-2 mt-4">הצעות מחיר</h3>
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-5 py-3 font-medium">מס' הצעה</th><th className="px-5 py-3 font-medium">תאריך</th><th className="px-5 py-3 font-medium">שורות</th><th className="px-5 py-3 font-medium">סה"כ</th><th className="px-5 py-3 font-medium">סטטוס</th></tr></thead>
              <tbody>
                {customerQuotes.map((q) => (
                  <tr key={q.id} className="border-t">
                    <td className="px-5 py-3 font-medium text-slate-800">{q.quoteNumber}</td>
                    <td className="px-5 py-3 text-slate-500">{fmtDate(q.date)}</td>
                    <td className="px-5 py-3">{q.lines.length}</td>
                    <td className="px-5 py-3 font-bold">₪{q.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3"><Badge tone={QUOTE_STATUSES[q.status]?.tone}>{QUOTE_STATUSES[q.status]?.label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ==================== Transaction ====================
function TransactionScreen({ data, refresh, quickTx }) {
  const [type, setType] = useState(null);
  const [form, setForm] = useState({ itemId: "", qty: "", fromLocationId: "", toLocationId: "", customerId: "", condition: "ok", note: "", unitPrice: "", supplierId: "" });
  const [receiveCategoryFilter, setReceiveCategoryFilter] = useState("all"); // all | device | consumable
  const [selectedFragranceName, setSelectedFragranceName] = useState("");
  const [resolvingFragrance, setResolvingFragrance] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const warehouse = data.locations.find((l) => l.type === "warehouse");
  const vehicles = data.locations.filter((l) => l.type === "vehicle");

  const resetForm = () => setForm({ itemId: "", qty: "", fromLocationId: "", toLocationId: "", customerId: "", condition: "ok", note: "", unitPrice: "", supplierId: "" });

  const chooseType = (t) => {
    setType(t); setError(""); setSuccess(""); setReceiveCategoryFilter("all"); setSelectedFragranceName("");
    const base = { itemId: "", qty: "", fromLocationId: "", toLocationId: "", customerId: "", condition: "ok", note: "", unitPrice: "", supplierId: "" };
    if (t === "receive") base.toLocationId = warehouse?.id || "";
    if (t === "transfer") base.fromLocationId = warehouse?.id || "";
    setForm(base);
  };

  // מאגר הריחות הראשי - כל שם ריח ייחודי מתוך כל פריטי התמציות בקטלוג, בכל גודל
  // (לא רק אלה שכבר קיימים בגודל 25 ליטר). זה מה שמוצג בבחירת קבלת סחורה.
  const fragranceNames = [...new Set(data.items.filter((it) => it.category === "consumable").map((it) => guessFragranceName(it)))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "he"));

  // כשבוחרים ריח לקבלת סחורה: אם כבר קיים לו פריט 25 ליטר - משתמשים בו.
  // אם לא, יוצרים אותו כעת אוטומטית ומשתמשים בפריט החדש.
  const onSelectReceiveFragrance = async (name) => {
    setSelectedFragranceName(name);
    if (!name) { setForm({ ...form, itemId: "" }); return; }
    const existing = data.items.find((it) => it.category === "consumable" && isLargePackage(it) && guessFragranceName(it) === name);
    if (existing) { setForm({ ...form, itemId: existing.id }); return; }
    setResolvingFragrance(true);
    setError("");
    try {
      const newId = await api.addItem({ name: `תמצית ריח - ${name} (25 ליטר)`, category: "consumable", unit: "25 ליטר", minThreshold: 0, fragranceGroup: name });
      await refresh();
      setForm({ ...form, itemId: newId });
    } catch (e) { setError(e.message); } finally { setResolvingFragrance(false); }
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

    if (type === "receive") {
      if (!form.toLocationId) { setError("יש לבחור מיקום יעד"); return; }
      if (!form.supplierId) { setError("יש לבחור ספק שממנו התקבלה הסחורה"); return; }
    }
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
      if (form.unitPrice === "" || Number(form.unitPrice) < 0) { setError("יש להזין מחיר ליחידה שנגבה מהלקוח"); return; }
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
        unitPrice: type === "install" ? form.unitPrice : null,
        supplierId: type === "receive" ? form.supplierId : null,
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
  // עבור סוגי תנועה שאינם קבלת סחורה, כל הפריטים זמינים כרגיל.
  // קבלת סחורה משתמשת בבחירה ייעודית למטה (מכשיר / ריח) ולא ברשימה הזו.
  const itemOptions = data.items;
  return (
    <div>
      <button onClick={() => setType(null)} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 mb-4 text-sm"><ChevronLeft size={16} /> בחירת סוג תנועה אחרת</button>
      <div className={`bg-${cfg.color}-50 border border-${cfg.color}-200 rounded-2xl p-4 sm:p-6 max-w-lg`}>
        <h2 className="font-bold text-xl text-slate-800 mb-4">{cfg.label}</h2>

        {type === "receive" && (
          <Field label="ספק">
            <select className={inputCls} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">בחר ספק...</option>
              {data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.country ? ` (${s.country})` : ""}</option>)}
            </select>
            {data.suppliers.length === 0 && <div className="text-xs text-rose-500 mt-1">אין עדיין ספקים במערכת - הוסיפו ספק במסך "ספקים" לפני קבלת סחורה.</div>}
          </Field>
        )}

        {type === "receive" && (
          <Field label="סינון לפי סוג">
            <div className="flex gap-2">
              {[["all", "הכל"], ["device", "מכשירים"], ["consumable", "תמציות ריח"]].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setReceiveCategoryFilter(key); setSelectedFragranceName(""); setForm({ ...form, itemId: "" }); }}
                  className={`flex-1 rounded-xl py-2 border text-sm font-medium ${receiveCategoryFilter === key ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {type === "receive" && (receiveCategoryFilter === "device" || receiveCategoryFilter === "all") && (
          <Field label="מכשיר">
            <select className={inputCls} value={data.items.find((i) => i.id === form.itemId)?.category === "device" ? form.itemId : ""} onChange={(e) => { setSelectedFragranceName(""); setForm({ ...form, itemId: e.target.value }); }}>
              <option value="">בחר מכשיר...</option>
              {data.items.filter((it) => it.category === "device").map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
          </Field>
        )}

        {type === "receive" && (receiveCategoryFilter === "consumable" || receiveCategoryFilter === "all") && (
          <Field label="ריח (מאגר הריחות הראשי - יתקבל כג'ריקן 25 ליטר)">
            <select className={inputCls} value={selectedFragranceName} onChange={(e) => onSelectReceiveFragrance(e.target.value)} disabled={resolvingFragrance}>
              <option value="">בחר ריח...</option>
              {fragranceNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            {resolvingFragrance && <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> יוצר אריזת 25 ליטר לריח זה...</div>}
            {!resolvingFragrance && <div className="text-xs text-slate-400 mt-1">תמציות ריח מתקבלות מהספק אך ורק בג'ריקן 25 ליטר. אם אין עדיין 25 ליטר לריח זה, ייווצר אוטומטית.</div>}
          </Field>
        )}

        {type !== "receive" && (
          <Field label="פריט">
            <select className={inputCls} value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })}>
              <option value="">בחר פריט...</option>
              {itemOptions.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
          </Field>
        )}

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
          <Field label={type === "install" ? "ממיקום (מחסן או רכב)" : "ממיקום"}>
            <select className={inputCls} value={form.fromLocationId} onChange={(e) => setForm({ ...form, fromLocationId: e.target.value })}>
              <option value="">בחר מיקום...</option>
              {(type === "install" ? [...(warehouse ? [warehouse] : []), ...vehicles] : data.locations).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
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

        {type === "install" && (
          <Field label="מחיר ליחידה שנגבה מהלקוח (₪)">
            <input type="number" min="0" step="0.01" className={inputCls} value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
            {form.qty && form.unitPrice !== "" && (
              <div className="text-xs text-slate-400 mt-1">סה"כ להזמנה: ₪{(Number(form.qty) * Number(form.unitPrice)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            )}
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
  const supplierName = (id) => data.suppliers.find((s) => s.id === id)?.name || "-";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-bold text-xl text-slate-800">יומן אירועים (Audit Log)</h2>
        <select className={inputCls + " w-auto"} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">כל התנועות</option>
          {Object.entries(AUDIT_TX_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-5 py-3 font-medium">תאריך</th><th className="px-5 py-3 font-medium">סוג</th>
              <th className="px-5 py-3 font-medium">פריט</th><th className="px-5 py-3 font-medium">כמות</th>
              <th className="px-5 py-3 font-medium">ממיקום</th><th className="px-5 py-3 font-medium">אל מיקום</th>
              <th className="px-5 py-3 font-medium">לקוח / ספק</th><th className="px-5 py-3 font-medium">הערה</th><th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const item = data.items.find((i) => i.id === t.itemId);
              return (
                <tr key={t.id} className="border-t">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="px-5 py-3"><Badge tone={AUDIT_TX_LABELS[t.type]?.color}>{AUDIT_TX_LABELS[t.type]?.label}</Badge></td>
                  <td className="px-5 py-3 font-medium text-slate-800">{item?.name || "-"}</td>
                  <td className="px-5 py-3">{t.qty}</td>
                  <td className="px-5 py-3 text-slate-500">{t.fromLocationId ? locName(t.fromLocationId) : "-"}</td>
                  <td className="px-5 py-3 text-slate-500">{t.toLocationId ? locName(t.toLocationId) : "-"}</td>
                  <td className="px-5 py-3 text-slate-500">{t.customerId ? custName(t.customerId) : t.supplierId ? supplierName(t.supplierId) : "-"}</td>
                  <td className="px-5 py-3 text-slate-500">{t.note || (t.condition === "faulty" ? "התקבל כתקול" : "")}</td>
                  <td className="px-5 py-3 text-left">
                    <AddToGoogleCalendarButton
                      title={`${AUDIT_TX_LABELS[t.type]?.label || "תנועת מלאי"} - ${item?.name || ""}`}
                      description={`כמות: ${t.qty}${t.note ? ` | הערה: ${t.note}` : ""}`}
                      date={t.date}
                      label=""
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">אין תנועות תואמות</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== Nav ====================
// ==================== מחשבון יבוא ועלויות נחיתה (Landed Cost) ====================
const DEFAULT_FX_RATES = { USD: 3.7, EUR: 4.0, GBP: 4.6, ILS: 1 };

function LandedCostScreen({ data, refresh }) {
  const [overhead, setOverhead] = useState({ shipping: "", customs: "", brokerage: "", inland: "", wireFee: "", bankFee: "", creditCardFee: "", fxFeeValue: "", fxFeeMode: "percent" });
  const [method, setMethod] = useState("value");
  const [lines, setLines] = useState([{ id: Math.random().toString(36).slice(2), itemId: "", qty: "", unitPrice: "", unitVolume: "", currency: "ILS" }]);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState("");
  const [exchangeRates, setExchangeRates] = useState({});
  const [selectedRateCardId, setSelectedRateCardId] = useState("");
  const [selectedRateId, setSelectedRateId] = useState("");
  const [airWeight, setAirWeight] = useState("");

  const shipmentsWithPOs = data.shipments.filter((s) => data.purchaseOrders.some((p) => p.shipmentId === s.id));
  const selectedRateCard = data.rateCards.find((c) => c.id === selectedRateCardId);
  const selectedRate = selectedRateCard?.rates.find((r) => r.id === selectedRateId);

  const setLine = (id, patch) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines([...lines, { id: Math.random().toString(36).slice(2), itemId: "", qty: "", unitPrice: "", unitVolume: "", currency: "ILS" }]);
  const removeLine = (id) => setLines(lines.filter((l) => l.id !== id));

  const loadShipment = (shipmentId) => {
    setSelectedShipment(shipmentId);
    if (!shipmentId) return;
    const posInShipment = data.purchaseOrders.filter((p) => p.shipmentId === shipmentId);
    const newLines = [];
    posInShipment.forEach((po) => {
      po.lines.forEach((l) => {
        newLines.push({
          id: Math.random().toString(36).slice(2),
          itemId: l.itemId, qty: String(l.qty), unitPrice: String(l.unitPrice),
          unitVolume: "", currency: po.currency,
        });
      });
    });
    if (newLines.length > 0) setLines(newLines);
    const currenciesUsed = [...new Set(posInShipment.map((p) => p.currency))];
    setExchangeRates((prev) => {
      const next = { ...prev };
      currenciesUsed.forEach((c) => { if (next[c] === undefined) next[c] = DEFAULT_FX_RATES[c] ?? 1; });
      return next;
    });
  };

  const rateFor = (currency) => currency === "ILS" ? 1 : Number(exchangeRates[currency] ?? DEFAULT_FX_RATES[currency] ?? 1);
  const priceILS = (l) => (Number(l.unitPrice) || 0) * rateFor(l.currency || "ILS");
  const currenciesInUse = [...new Set([...lines.map((l) => l.currency || "ILS"), ...(selectedRate ? [selectedRate.currency] : [])])].filter((c) => c !== "ILS");

  const validLines = lines.filter((l) => l.itemId && Number(l.qty) > 0 && Number(l.unitPrice) >= 0);
  const totalGoodsValue = validLines.reduce((s, l) => s + Number(l.qty) * priceILS(l), 0);
  const fixedOverhead = ["shipping", "customs", "brokerage", "inland", "wireFee", "bankFee", "creditCardFee"].reduce((s, k) => s + (Number(overhead[k]) || 0), 0);
  const fxFeeAmount = overhead.fxFeeMode === "percent"
    ? totalGoodsValue * ((Number(overhead.fxFeeValue) || 0) / 100)
    : (Number(overhead.fxFeeValue) || 0);
  const totalOverhead = fixedOverhead + fxFeeAmount;

  const totalBasis = validLines.reduce((s, l) => {
    const qty = Number(l.qty);
    return s + (method === "value" ? qty * priceILS(l) : qty * (Number(l.unitVolume) || 0));
  }, 0);
  const results = validLines.map((l) => {
    const qty = Number(l.qty);
    const unitPriceILS = priceILS(l);
    const basis = method === "value" ? qty * unitPriceILS : qty * (Number(l.unitVolume) || 0);
    const share = totalBasis > 0 ? basis / totalBasis : 0;
    const allocatedOverhead = totalOverhead * share;
    const landedPerUnit = unitPriceILS + allocatedOverhead / qty;
    const item = data.items.find((i) => i.id === l.itemId);
    return { ...l, item, qty, unitPriceILS, share, allocatedOverhead, landedPerUnit };
  });
  const canCompute = validLines.length > 0 && totalBasis > 0;

  const rateAppliedILS = selectedRate
    ? (selectedRate.rateType === "air_per_kg"
        ? selectedRate.price * (Number(airWeight) || 0)
        : selectedRate.price) * rateFor(selectedRate.currency)
    : 0;

  const applyRateToShipping = () => {
    if (!selectedRate) return;
    setOverhead({ ...overhead, shipping: String(Math.round(rateAppliedILS * 100) / 100) });
  };

  const applyToInventory = async () => {
    setBusy(true);
    try {
      await api.updateItemsUnitCosts(results.map((r) => ({ itemId: r.itemId, unitCost: Math.round(r.landedPerUnit * 100) / 100 })));
      await refresh();
      setUpdated(true);
      setTimeout(() => setUpdated(false), 3000);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const currencyBreakdown = currenciesInUse.map((c) => {
    const goodsInCurrency = validLines.filter((l) => (l.currency || "ILS") === c).reduce((s, l) => s + Number(l.qty) * Number(l.unitPrice), 0);
    const rate = rateFor(c);
    return { currency: c, goodsInCurrency, rate, convertedILS: goodsInCurrency * rate };
  });
  const totalPaymentFees = ["wireFee", "bankFee", "creditCardFee"].reduce((s, k) => s + (Number(overhead[k]) || 0), 0) + fxFeeAmount;
  const totalPaidILS = totalGoodsValue + totalPaymentFees;

  return (
    <div>
      <h2 className="font-bold text-xl text-slate-800 mb-1 flex items-center gap-2"><Ship size={22} className="text-amber-600" /> מחשבון יבוא ועלויות נחיתה (Landed Cost)</h2>
      <p className="text-slate-500 text-sm mb-4">חשב את מחיר הנחיתה הסופי ליחידה עבור משלוח, וחלק את עלויות המשלוח בין הפריטים לפי נפח או לפי ערך.</p>

      {shipmentsWithPOs.length > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm p-5 mb-4">
          <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><Ship size={16} /> טעינה ממכולה/משלוח משותף</h3>
          <p className="text-slate-500 text-sm mb-3">בחירת משלוח תטען אוטומטית את כל הפריטים והכמויות מכל הזמנות הרכש (מכל הספקים) שמשויכות אליו.</p>
          <select className={inputCls} value={selectedShipment} onChange={(e) => loadShipment(e.target.value)}>
            <option value="">בחירה ידנית (בלי טעינה)...</option>
            {shipmentsWithPOs.map((s) => {
              const posCount = data.purchaseOrders.filter((p) => p.shipmentId === s.id).length;
              return <option key={s.id} value={s.id}>{s.name} - {SHIPMENT_STATUSES[s.status]?.label} ({posCount} הזמנות)</option>;
            })}
          </select>
        </div>
      )}

      {data.rateCards.length > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm p-5 mb-4">
          <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><Database size={16} /> מחירון שילוח שמור</h3>
          <p className="text-slate-500 text-sm mb-3">בחרו מחירון ושורת מחיר כדי למלא אוטומטית את עלות ההובלה - עדיין ניתן לדרוס ידנית אחרי המילוי.</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-2">
            <Field label="מחירון">
              <select className={inputCls} value={selectedRateCardId} onChange={(e) => { setSelectedRateCardId(e.target.value); setSelectedRateId(""); }}>
                <option value="">בחר מחירון...</option>
                {data.rateCards.map((c) => <option key={c.id} value={c.id}>{c.name}{c.carrier ? ` - ${c.carrier}` : ""}</option>)}
              </select>
            </Field>
            {selectedRateCard && (
              <Field label="שורת מחיר">
                <select className={inputCls} value={selectedRateId} onChange={(e) => setSelectedRateId(e.target.value)}>
                  <option value="">בחר...</option>
                  {selectedRateCard.rates.map((r) => (
                    <option key={r.id} value={r.id}>{RATE_TYPES[r.rateType]}{r.label ? ` - ${r.label}` : ""} ({CURRENCY_SYMBOLS[r.currency] || r.currency}{r.price}{r.rateType === "air_per_kg" ? '/ק"ג' : ""})</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {selectedRate?.rateType === "air_per_kg" && (
            <Field label='משקל כולל (ק"ג)'><input type="number" min="0" className={inputCls} value={airWeight} onChange={(e) => setAirWeight(e.target.value)} /></Field>
          )}
          {selectedRate && (
            <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 mt-2">
              <span className="text-sm text-slate-600">עלות מחושבת: ₪{rateAppliedILS.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              <button onClick={applyRateToShipping} className={btnPrimary + " !py-2 !px-4 text-sm"}>החל על עלות הובלה</button>
            </div>
          )}
        </div>
      )}

      {currenciesInUse.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
          <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><Calculator size={16} /> שערי המרה ל-₪</h3>
          <p className="text-slate-500 text-sm mb-3">חלק מהפריטים שנטענו הם במטבע ספק שאינו ₪. עדכנו את השער הנוכחי (השער היציג או השער בפועל שקיבלתם) כדי שהחישוב יהיה מדויק.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {currenciesInUse.map((c) => (
              <Field key={c} label={`1 ${c} = ? ₪`}>
                <input type="number" min="0" step="0.001" className={inputCls} value={exchangeRates[c] ?? DEFAULT_FX_RATES[c] ?? 1} onChange={(e) => setExchangeRates({ ...exchangeRates, [c]: e.target.value })} />
              </Field>
            ))}
          </div>
        </div>
      )}

      {(currencyBreakdown.length > 0 || totalPaymentFees > 0) && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 mb-4">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Database size={16} /> סיכום תשלום בפועל (סחורה + עמלות)</h3>
          {currencyBreakdown.map((cb) => (
            <div key={cb.currency} className="flex items-center justify-between text-sm py-1 border-b border-sky-100 last:border-0">
              <span className="text-slate-600">{cb.currency} {cb.goodsInCurrency.toLocaleString(undefined, { maximumFractionDigits: 2 })} × שער {cb.rate}</span>
              <span className="font-medium text-slate-800">₪{cb.convertedILS.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
          ))}
          {totalPaymentFees > 0 && (
            <div className="flex items-center justify-between text-sm py-1 border-b border-sky-100">
              <span className="text-slate-600">סה"כ עמלות (SWIFT + בנק + אשראי + מט"ח)</span>
              <span className="font-medium text-slate-800">₪{totalPaymentFees.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 mt-1">
            <span className="font-bold text-slate-800">סה"כ בפועל בש"ח (סחורה + עמלות)</span>
            <span className="font-bold text-sky-700 text-lg">₪{totalPaidILS.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">הסכום הזה, יחד עם עלויות ההובלה והמכס למטה, הוא הבסיס שמתחלק באופן יחסי בין הפריטים בטבלת התוצאה.</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-3">עלויות המשלוח (₪)</h3>
          <Field label="הובלה ימית / אווירית"><input type="number" min="0" className={inputCls} value={overhead.shipping} onChange={(e) => setOverhead({ ...overhead, shipping: e.target.value })} /></Field>
          <Field label="מכס"><input type="number" min="0" className={inputCls} value={overhead.customs} onChange={(e) => setOverhead({ ...overhead, customs: e.target.value })} /></Field>
          <Field label="עמילות מכס"><input type="number" min="0" className={inputCls} value={overhead.brokerage} onChange={(e) => setOverhead({ ...overhead, brokerage: e.target.value })} /></Field>
          <Field label="הובלה יבשתית"><input type="number" min="0" className={inputCls} value={overhead.inland} onChange={(e) => setOverhead({ ...overhead, inland: e.target.value })} /></Field>

          <h3 className="font-bold text-slate-800 mb-3 mt-5 pt-4 border-t">עמלות תשלום והמרת מטבע (₪)</h3>
          <Field label="עמלת SWIFT / העברה בנקאית בינלאומית"><input type="number" min="0" className={inputCls} value={overhead.wireFee} onChange={(e) => setOverhead({ ...overhead, wireFee: e.target.value })} /></Field>
          <Field label="עמלת המרה בבנק"><input type="number" min="0" className={inputCls} value={overhead.bankFee} onChange={(e) => setOverhead({ ...overhead, bankFee: e.target.value })} /></Field>
          <Field label="עמלת כרטיס אשראי"><input type="number" min="0" className={inputCls} value={overhead.creditCardFee} onChange={(e) => setOverhead({ ...overhead, creditCardFee: e.target.value })} /></Field>
          <Field label='עמלת מט"ח כללית (על שווי הסחורה)'>
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
          <div className="border-t pt-3 mt-1 flex items-center justify-between"><span className="text-slate-600 font-medium">סה"כ עלויות משלוח + עמלות</span><span className="font-bold text-slate-800">₪{totalOverhead.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-3">שיטת חלוקת העלויות</h3>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setMethod("value")} className={`flex-1 rounded-xl py-2.5 border font-medium text-sm ${method === "value" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}>לפי ערך הפריט</button>
            <button onClick={() => setMethod("volume")} className={`flex-1 rounded-xl py-2.5 border font-medium text-sm ${method === "volume" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}>לפי נפח</button>
          </div>
          <p className="text-sm text-slate-500">{method === "value" ? "עלויות המשלוח יחולקו ביחס לערך הכולל של כל שורה (בש\"ח, אחרי המרה)." : "עלויות המשלוח יחולקו ביחס לנפח הכולל שלהן במכולה."}</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800">פריטים במשלוח</h3><button onClick={addLine} className={btnGhost + " flex items-center gap-1.5 !py-1.5 !px-3 text-sm"}><Plus size={16} /> הוספת שורה</button></div>
        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.id} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end border-b pb-3 last:border-0 last:pb-0">
              <div className="col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">פריט</label>
                <select className={inputCls} value={l.itemId} onChange={(e) => setLine(l.id, { itemId: e.target.value })}><option value="">בחר פריט...</option>{data.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}</select>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">כמות</label><input type="number" min="1" className={inputCls} value={l.qty} onChange={(e) => setLine(l.id, { qty: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">מטבע</label>
                <select className={inputCls} value={l.currency || "ILS"} onChange={(e) => setLine(l.id, { currency: e.target.value })}>
                  {["ILS", ...CURRENCIES].filter((c, i, arr) => arr.indexOf(c) === i).map((c) => <option key={c} value={c}>{CURRENCY_SYMBOLS[c] || c} {c}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">מחיר ליח' ({CURRENCY_SYMBOLS[l.currency || "ILS"]})</label><input type="number" min="0" step="0.01" className={inputCls} value={l.unitPrice} onChange={(e) => setLine(l.id, { unitPrice: e.target.value })} /></div>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><label className="block text-xs font-medium text-slate-500 mb-1">נפח ליח' (CBM)</label><input type="number" min="0" step="0.001" className={inputCls} value={l.unitVolume} onChange={(e) => setLine(l.id, { unitVolume: e.target.value })} disabled={method !== "volume"} /></div>
                {lines.length > 1 && <button onClick={() => removeLine(l.id)} className="text-gray-400 hover:text-rose-600 mb-2.5"><Trash2 size={16} /></button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {canCompute && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-3 border-b"><h3 className="font-bold text-slate-800">תוצאת חישוב עלות הנחיתה</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-5 py-3 font-medium">פריט</th><th className="px-5 py-3 font-medium">כמות</th><th className="px-5 py-3 font-medium">מחיר בסיס (₪)</th><th className="px-5 py-3 font-medium">חלק יחסי</th><th className="px-5 py-3 font-medium">Landed Cost ליח'</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-5 py-3 font-medium text-slate-800">{r.item?.name || "-"}</td>
                    <td className="px-5 py-3">{r.qty}</td>
                    <td className="px-5 py-3">₪{r.unitPriceILS.toFixed(2)}{r.currency !== "ILS" && <span className="text-slate-400 text-xs"> ({CURRENCY_SYMBOLS[r.currency]}{Number(r.unitPrice).toFixed(2)})</span>}</td>
                    <td className="px-5 py-3">{(r.share * 100).toFixed(1)}%</td>
                    <td className="px-5 py-3 font-bold text-amber-700">₪{r.landedPerUnit.toFixed(2)}</td>
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
// עוזרי תאריך לניווט ולסינון הטווח - לא נוגעים בשום לוגיקת חישוב קיימת,
// רק קובעים אילו תנועות/הוצאות נכנסות בכלל לתוך buildMonthlyPL/buildCategoryMonthMatrix.
function ymd(d) { return d.toISOString().slice(0, 10); }
function startOfMonth(dateStr) { const d = new Date(dateStr); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); }
function endOfMonth(dateStr) { const d = new Date(dateStr); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function shiftMonths(dateStr, delta) { const d = new Date(dateStr); d.setDate(1); d.setMonth(d.getMonth() + delta); return ymd(d); }
function filterDataByDateRange(data, from, to) {
  return {
    ...data,
    transactions: data.transactions.filter((t) => { const d = t.date.slice(0, 10); return d >= from && d <= to; }),
    expenses: data.expenses.filter((e) => e.expenseDate >= from && e.expenseDate <= to),
  };
}

function ReportsScreen({ data }) {
  const [sub, setSub] = useState("valuation");
  const today = ymd(new Date());
  const [dateFrom, setDateFrom] = useState(startOfMonth(shiftMonths(today, -5)));
  const [dateTo, setDateTo] = useState(endOfMonth(today));

  const shiftWindow = (delta) => { setDateFrom(shiftMonths(dateFrom, delta)); setDateTo(shiftMonths(dateTo, delta)); };
  const applyPreset = (months) => { setDateFrom(startOfMonth(shiftMonths(today, -(months - 1)))); setDateTo(endOfMonth(today)); };

  const showDateFilter = sub === "pl" || sub === "vat";
  const rangeLabel = `${new Date(dateFrom).toLocaleDateString("he-IL", { year: "numeric", month: "short" })} — ${new Date(dateTo).toLocaleDateString("he-IL", { year: "numeric", month: "short" })}`;

  return (
    <div>
      <h2 className="font-bold text-xl text-slate-800 mb-4">דוחות וערך מלאי</h2>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setSub("valuation")} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium border ${sub === "valuation" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}><BarChart3 size={16} /> שווי מלאי</button>
        <button onClick={() => setSub("forecast")} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium border ${sub === "forecast" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}><Gauge size={16} /> חיזוי מלאי</button>
        <button onClick={() => setSub("pl")} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium border ${sub === "pl" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}><TrendingUp size={16} /> רווח והפסד (P&L)</button>
        <button onClick={() => setSub("vat")} className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium border ${sub === "vat" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}><Calculator size={16} /> מע"מ ומקדמות</button>
      </div>

      {showDateFilter && (
        <div className="bg-white rounded-2xl border shadow-sm p-4 mb-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-2">
              <button onClick={() => shiftWindow(-1)} className={btnGhost + " !p-2"} title="חודש אחורה"><ChevronLeft size={16} className="rotate-180" /></button>
              <span className="font-bold text-slate-700 text-sm min-w-[140px] text-center">{rangeLabel}</span>
              <button onClick={() => shiftWindow(1)} className={btnGhost + " !p-2"} title="חודש קדימה"><ChevronLeft size={16} /></button>
            </div>
            <div className="flex items-center gap-1.5">
              {[3, 6, 12].map((n) => (
                <button key={n} onClick={() => applyPreset(n)} className="text-xs rounded-lg px-2.5 py-1.5 border border-gray-300 text-slate-600 hover:bg-gray-50">{n} חודשים אחרונים</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="מתאריך"><input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
            <Field label="עד תאריך"><input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
          </div>
        </div>
      )}

      {sub === "valuation" && <ValuationReport data={data} />}
      {sub === "forecast" && <ForecastReport data={data} />}
      {sub === "pl" && <PLReport data={filterDataByDateRange(data, dateFrom, dateTo)} />}
      {sub === "vat" && <VatSettlementReport data={filterDataByDateRange(data, dateFrom, dateTo)} />}
    </div>
  );
}

// בונה פילוח חודשי: הכנסות (מתנועות התקנה, כולל מע"מ) מול הוצאות (מטבלת expenses,
// שכבר שמורות עם פירוק מדויק לפני/אחרי מע"מ - לא נגזר בקירוב).
function buildMonthlyPL(data, vatRate) {
  const buckets = {};
  const ensure = (month) => { if (!buckets[month]) buckets[month] = { revenueIncl: 0, cogsExcl: 0, cogsVat: 0, cogsIncl: 0, opExExcl: 0, opExVat: 0, opExIncl: 0 }; return buckets[month]; };
  data.transactions.filter((t) => t.type === "install" && t.unitPrice != null).forEach((t) => {
    ensure(t.date.slice(0, 7)).revenueIncl += t.unitPrice * t.qty;
  });
  data.expenses.forEach((e) => {
    const b = ensure(e.expenseDate.slice(0, 7));
    if (e.category === "goods") { b.cogsExcl += e.amountExclVat; b.cogsVat += e.vatAmount; b.cogsIncl += e.amountInclVat; }
    else { b.opExExcl += e.amountExclVat; b.opExVat += e.vatAmount; b.opExIncl += e.amountInclVat; }
  });
  return Object.entries(buckets).sort((a, b) => b[0].localeCompare(a[0])).map(([month, v]) => {
    const revenueExcl = v.revenueIncl / (1 + vatRate / 100);
    const revenueVat = v.revenueIncl - revenueExcl;
    const grossProfitExcl = revenueExcl - v.cogsExcl;
    const netProfitExcl = grossProfitExcl - v.opExExcl;
    const netProfitIncl = v.revenueIncl - v.cogsIncl - v.opExIncl;
    return { month, ...v, revenueExcl, revenueVat, grossProfitExcl, netProfitExcl, netProfitIncl };
  });
}

// בונה מטריצה: קטגוריות כשורות, חודשים כעמודות (ללא מע"מ - המספרים החשבונאיים
// האמיתיים). משתמש באותם נתוני מקור בדיוק כמו buildMonthlyPL, רק מפרק את
// ההוצאות לפי קטגוריה בודדת במקום שני צברים (סחורה/תפעול) בלבד.
function buildCategoryMonthMatrix(data, vatRate) {
  const monthsSet = new Set();
  data.transactions.filter((t) => t.type === "install" && t.unitPrice != null).forEach((t) => monthsSet.add(t.date.slice(0, 7)));
  data.expenses.forEach((e) => monthsSet.add(e.expenseDate.slice(0, 7)));
  const months = [...monthsSet].sort((a, b) => b.localeCompare(a)); // מהחודש החדש לישן

  const revenueByMonth = {};
  months.forEach((m) => { revenueByMonth[m] = 0; });
  data.transactions.filter((t) => t.type === "install" && t.unitPrice != null).forEach((t) => {
    const m = t.date.slice(0, 7);
    revenueByMonth[m] += (t.unitPrice * t.qty) / (1 + vatRate / 100);
  });

  const categoryRows = {};
  Object.keys(EXPENSE_CATEGORIES).forEach((cat) => {
    categoryRows[cat] = {};
    months.forEach((m) => { categoryRows[cat][m] = 0; });
  });
  data.expenses.forEach((e) => {
    const m = e.expenseDate.slice(0, 7);
    if (categoryRows[e.category] && categoryRows[e.category][m] !== undefined) categoryRows[e.category][m] += e.amountExclVat;
  });

  const totalCostsByMonth = {};
  const netProfitByMonth = {};
  months.forEach((m) => {
    totalCostsByMonth[m] = Object.values(categoryRows).reduce((s, row) => s + (row[m] || 0), 0);
    netProfitByMonth[m] = revenueByMonth[m] - totalCostsByMonth[m];
  });

  return { months, revenueByMonth, categoryRows, totalCostsByMonth, netProfitByMonth };
}

// פילס צבעוניים לסכומים: ירוק = הכנסה/רווח חיובי, כתום/אדום עדין = הוצאה או הפסד.
// שלושה "סוגים": revenue (תמיד ירוק), cost (תמיד כתום-עדין), profit (דינמי לפי הסימן).
function MoneyPill({ value, kind = "neutral", fmt, size = "sm" }) {
  const isNeg = value < 0;
  let tone;
  if (kind === "revenue") tone = "bg-emerald-50 text-emerald-700";
  else if (kind === "cost") tone = "bg-amber-50 text-amber-700";
  else if (kind === "profit") tone = value >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
  else tone = "bg-slate-100 text-slate-700";
  const sizeCls = size === "lg" ? "px-3.5 py-1.5 text-base" : "px-2.5 py-1 text-xs";
  const sign = kind === "cost" ? "-" : (kind === "profit" && isNeg ? "-" : "");
  const shown = kind === "cost" ? Math.abs(value) : (kind === "profit" ? Math.abs(value) : value);
  return <span className={`inline-flex items-center rounded-full font-bold ${tone} ${sizeCls}`}>{sign}{fmt(shown)}</span>;
}

function PLReport({ data }) {
  const vatRate = data.companySettings.vatRate ?? 18;
  const rows = buildMonthlyPL(data, vatRate);
  const matrix = buildCategoryMonthMatrix(data, vatRate);
  const fmt = (n) => `₪${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const monthLabel = (m) => new Date(`${m}-01`).toLocaleDateString("he-IL", { year: "numeric", month: "long" });
  const monthLabelShort = (m) => new Date(`${m}-01`).toLocaleDateString("he-IL", { year: "2-digit", month: "short" });
  const [exportBusy, setExportBusy] = useState(false);

  const current = rows[0];
  const previous = rows[1];
  const trend = (curr, prev) => {
    if (prev == null || prev === 0) return null;
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    return { pct, up: pct >= 0 };
  };

  const exportMatrixToExcel = async () => {
    setExportBusy(true);
    try {
      const XLSX = await import("https://esm.sh/xlsx@0.18.5");
      const sheetRows = [];
      const header = { "קטגוריה": "הכנסות" };
      matrix.months.forEach((m) => { header[monthLabel(m)] = matrix.revenueByMonth[m]; });
      sheetRows.push(header);
      Object.entries(EXPENSE_CATEGORIES).forEach(([cat, label]) => {
        const row = { "קטגוריה": label };
        matrix.months.forEach((m) => { row[monthLabel(m)] = matrix.categoryRows[cat][m] || 0; });
        sheetRows.push(row);
      });
      const totalsRow = { "קטגוריה": 'סה"כ הוצאות' };
      matrix.months.forEach((m) => { totalsRow[monthLabel(m)] = matrix.totalCostsByMonth[m]; });
      sheetRows.push(totalsRow);
      const profitRow = { "קטגוריה": "רווח נקי" };
      matrix.months.forEach((m) => { profitRow[monthLabel(m)] = matrix.netProfitByMonth[m]; });
      sheetRows.push(profitRow);

      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "רווח והפסד");
      XLSX.writeFile(wb, `רווח-והפסד-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      alert("ייצוא האקסל נכשל - ודאו שיש חיבור אינטרנט תקין ונסו שוב.");
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {current && (
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { label: "רווח תפעולי נקי (ללא מע\"מ)", value: current.netProfitExcl, icon: TrendingUp, prevValue: previous?.netProfitExcl },
            { label: "סך הכנסות (ללא מע\"מ)", value: current.revenueExcl, icon: BarChart3, prevValue: previous?.revenueExcl },
            { label: "תזרים מזומנים נטו (כולל מע\"מ)", value: current.netProfitIncl, icon: Database, prevValue: previous?.netProfitIncl },
          ].map((kpi, i) => {
            const t = trend(kpi.value, kpi.prevValue);
            const isNeg = kpi.value < 0;
            const Icon = kpi.icon;
            return (
              <div key={i} className="bg-white rounded-2xl border shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${isNeg ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}><Icon size={20} /></div>
                  {t && (
                    <span className={`text-xs font-bold flex items-center gap-0.5 ${t.up ? "text-emerald-600" : "text-rose-600"}`}>
                      {t.up ? "▲" : "▼"} {Math.abs(t.pct).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className={`text-2xl font-bold mb-1 ${isNeg ? "text-rose-600" : "text-slate-800"}`}>{isNeg ? "-" : ""}{fmt(Math.abs(kpi.value))}</div>
                <div className="text-sm text-slate-500">{kpi.label}</div>
                <div className="text-xs text-slate-400 mt-1">{monthLabel(current.month)}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sm text-slate-700">
        <b>הבהרה חשובה:</b> כל הטבלה למטה מוצגת ללא מע"מ (המספרים החשבונאיים האמיתיים). "תזרים מזומנים" בכרטיסים למעלה בלבד הוא כולל מע"מ, לצורך מעקב תזרימי בפועל.
      </div>

      {matrix.months.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-slate-400">אין עדיין מספיק נתונים (מכירות/הוצאות) כדי להציג דוח</div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b flex-wrap gap-2">
            <h3 className="font-bold text-slate-800">מטריצת קטגוריות מול חודשים (ללא מע"מ)</h3>
            <div className="flex items-center gap-2">
              <button onClick={exportMatrixToExcel} disabled={exportBusy} className={btnGhost + " flex items-center gap-1.5 !py-1.5 !px-3 text-sm"}>{exportBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} אקסל</button>
              <button onClick={() => window.print()} className={btnGhost + " flex items-center gap-1.5 !py-1.5 !px-3 text-sm"}><Printer size={14} /> PDF / הדפסה</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="sticky right-0 bg-gray-50 px-4 py-3 text-right font-bold text-slate-700 whitespace-nowrap border-l">קטגוריה</th>
                  {matrix.months.map((m) => <th key={m} className="px-4 py-3 text-center font-bold text-slate-600 whitespace-nowrap min-w-[100px]">{monthLabelShort(m)}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t bg-emerald-50/40">
                  <td className="sticky right-0 bg-emerald-50 px-4 py-3 font-bold text-emerald-800 whitespace-nowrap border-l">הכנסות</td>
                  {matrix.months.map((m) => <td key={m} className="px-4 py-3 text-center"><MoneyPill value={matrix.revenueByMonth[m]} kind="revenue" fmt={fmt} /></td>)}
                </tr>
                {Object.entries(EXPENSE_CATEGORIES).map(([cat, label]) => (
                  <tr key={cat} className="border-t">
                    <td className="sticky right-0 bg-white px-4 py-3 text-slate-600 whitespace-nowrap border-l">{label}</td>
                    {matrix.months.map((m) => {
                      const v = matrix.categoryRows[cat][m] || 0;
                      return <td key={m} className="px-4 py-3 text-center">{v > 0 ? <MoneyPill value={v} kind="cost" fmt={fmt} /> : <span className="text-slate-300 text-xs">-</span>}</td>;
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td className="sticky right-0 bg-gray-50 px-4 py-3 font-bold text-slate-700 whitespace-nowrap border-l">סה"כ הוצאות</td>
                  {matrix.months.map((m) => <td key={m} className="px-4 py-3 text-center"><MoneyPill value={matrix.totalCostsByMonth[m]} kind="cost" fmt={fmt} /></td>)}
                </tr>
                <tr className="border-t-2 border-gray-300">
                  <td className="sticky right-0 bg-white px-4 py-3 font-bold text-slate-800 whitespace-nowrap border-l">רווח נקי</td>
                  {matrix.months.map((m) => <td key={m} className="px-4 py-3 text-center"><MoneyPill value={matrix.netProfitByMonth[m]} kind="profit" fmt={fmt} size="lg" /></td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function biMonthlyPeriodOf(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const biIndex = Math.floor(d.getMonth() / 2);
  const startMonth = biIndex * 2 + 1;
  return { key: `${y}-${biIndex}`, label: `${["ינואר-פברואר", "מרץ-אפריל", "מאי-יוני", "יולי-אוגוסט", "ספטמבר-אוקטובר", "נובמבר-דצמבר"][biIndex]} ${y}` };
}

function VatSettlementReport({ data }) {
  const vatRate = data.companySettings.vatRate ?? 18;
  const taxAdvanceRate = data.companySettings.taxAdvanceRate ?? 0;

  const periods = {};
  const ensure = (p) => { if (!periods[p.key]) periods[p.key] = { label: p.label, salesVat: 0, purchaseVat: 0, revenueExcl: 0 }; return periods[p.key]; };
  data.transactions.filter((t) => t.type === "install" && t.unitPrice != null).forEach((t) => {
    const incl = t.unitPrice * t.qty;
    const excl = incl / (1 + vatRate / 100);
    const b = ensure(biMonthlyPeriodOf(t.date));
    b.salesVat += incl - excl;
    b.revenueExcl += excl;
  });
  data.expenses.forEach((e) => {
    ensure(biMonthlyPeriodOf(e.expenseDate)).purchaseVat += e.vatAmount;
  });
  const rows = Object.entries(periods).sort((a, b) => b[0].localeCompare(a[0])).map(([key, v]) => ({
    key, ...v, netVat: v.salesVat - v.purchaseVat, taxAdvance: v.revenueExcl * (taxAdvanceRate / 100),
  }));
  const fmt = (n) => `₪${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {taxAdvanceRate === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 flex items-center gap-2">
          <TriangleAlert size={16} /> אחוז מקדמת מס הכנסה עדיין לא הוגדר (0%) - עדכנו אותו במסך "הגדרות" לפי האחוז שנקבע לכם על ידי רשות המסים, אחרת חישוב המקדמה למטה יציג 0.
        </div>
      )}
      {rows.length === 0 && <div className="bg-white rounded-2xl border shadow-sm p-8 text-center text-slate-400">אין עדיין מספיק נתונים כדי לחשב מע"מ</div>}
      {rows.map((r) => (
        <div key={r.key} className="bg-white rounded-2xl border shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-3">{r.label}</h3>
          <div className="grid sm:grid-cols-2 gap-4 mb-3">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">מע"מ עסקאות (על מכירות)</span><span className="font-medium">{fmt(r.salesVat)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">מע"מ תשומות (על הוצאות)</span><span className="font-medium text-rose-600">-{fmt(r.purchaseVat)}</span></div>
              <div className="flex justify-between pt-1 border-t"><span className="font-bold text-slate-800">מע"מ לתשלום בפועל</span><span className={`font-bold ${r.netVat >= 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmt(Math.abs(r.netVat))} {r.netVat < 0 && "(לזיכוי)"}</span></div>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">הכנסות התקופה (ללא מע"מ)</span><span className="font-medium">{fmt(r.revenueExcl)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">אחוז מקדמת מס הכנסה</span><span className="font-medium">{taxAdvanceRate}%</span></div>
              <div className="flex justify-between pt-1 border-t"><span className="font-bold text-slate-800">מקדמת מס הכנסה נדרשת</span><span className="font-bold text-amber-700">{fmt(r.taxAdvance)}</span></div>
            </div>
          </div>
        </div>
      ))}
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
        <div className="bg-white rounded-2xl border shadow-sm p-5"><div className="text-slate-500 text-sm mb-1">שווי מלאי כולל</div><div className="text-2xl font-bold text-slate-800">₪{totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>
        {byCategory.map((c) => <div key={c.cat} className="bg-white rounded-2xl border shadow-sm p-5"><div className="text-slate-500 text-sm mb-1">שווי {CATEGORIES[c.cat]}</div><div className="text-2xl font-bold text-slate-800">₪{c.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>)}
      </div>
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b"><h3 className="font-bold text-slate-800">שווי לפי מוצר (Top 10)</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-5 py-3 font-medium">פריט</th><th className="px-5 py-3 font-medium">כמות</th><th className="px-5 py-3 font-medium">עלות ליח'</th><th className="px-5 py-3 font-medium">שווי כולל</th></tr></thead>
            <tbody>
              {topProducts.map((r) => (
                <tr key={r.item.id} className="border-t">
                  <td className="px-5 py-3 font-medium text-slate-800">{r.item.name}</td>
                  <td className="px-5 py-3">{r.totalQty}</td>
                  <td className="px-5 py-3">₪{r.unitCost.toFixed(2)}</td>
                  <td className="px-5 py-3 font-bold">₪{r.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
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
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <Field label="זמן אספקה (Lead Time) בימים - יבוא מסין/צרפת"><input type="number" min="1" className={inputCls + " w-32"} value={leadTime} onChange={(e) => setLeadTime(Number(e.target.value) || 60)} /></Field>
        <p className="text-sm text-slate-500">טווח מקובל: 45-60 יום. פריט עם פחות ימי מלאי מזמן האספקה מסומן דחוף.</p>
      </div>
      {urgentCount > 0 && <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4"><div className="flex items-center gap-2 text-rose-700 font-bold"><TriangleAlert size={18} /><span>{urgentCount} פריטים דחופים להזמנת רכש</span></div></div>}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b"><h3 className="font-bold text-slate-800">קצב צריכה וימי מלאי נותרים</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-5 py-3 font-medium">פריט</th><th className="px-5 py-3 font-medium">מלאי נוכחי</th><th className="px-5 py-3 font-medium">קצב חודשי</th><th className="px-5 py-3 font-medium">ימי מלאי נותרים</th><th className="px-5 py-3 font-medium">סטטוס</th></tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.item.id} className="border-t">
                  <td className="px-5 py-3 font-medium text-slate-800">{r.item.name}</td>
                  <td className="px-5 py-3">{r.currentStock} {r.item.unit}</td>
                  <td className="px-5 py-3">{r.monthlyRate > 0 ? `${r.monthlyRate.toFixed(1)} ${r.item.unit}/חודש` : "-"}</td>
                  <td className="px-5 py-3">{r.daysRemaining !== null ? Math.round(r.daysRemaining) : "-"}</td>
                  <td className="px-5 py-3"><Badge tone={statusMeta[r.status].tone}>{statusMeta[r.status].label}</Badge></td>
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
// ==================== Suppliers ====================
function SuppliersScreen({ data, refresh }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", country: "", contact: "", phone: "", email: "", currency: "USD", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editSupplier, setEditSupplier] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const openNew = () => { setForm({ name: "", country: "", contact: "", phone: "", email: "", currency: "USD", notes: "" }); setError(""); setOpen(true); };

  const submit = async () => {
    if (!form.name.trim()) { setError("שם הספק הוא שדה חובה"); return; }
    setBusy(true);
    try {
      await api.addSupplier(form);
      await refresh();
      setOpen(false);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const openEdit = (s) => {
    setEditSupplier(s);
    setEditForm({ name: s.name, country: s.country || "", contact: s.contact || "", phone: s.phone || "", email: s.email || "", currency: s.currency, notes: s.notes || "" });
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editForm.name.trim()) { setEditError("שם הספק הוא שדה חובה"); return; }
    setEditBusy(true);
    try {
      await api.updateSupplier(editSupplier.id, editForm);
      await refresh();
      setEditSupplier(null);
    } catch (e) { setEditError(e.message); } finally { setEditBusy(false); }
  };

  const removeSupplier = async (id) => {
    if (!confirm("למחוק את הספק? לא ניתן יהיה לשחזר.")) return;
    try { await api.deleteSupplier(id); await refresh(); }
    catch (e) { alert(e.message.includes("foreign key") ? "לא ניתן למחוק ספק עם הזמנות רכש קיימות" : e.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl text-slate-800">ספקים</h2>
        <button onClick={openNew} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> ספק חדש</button>
      </div>
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-5 py-3 font-medium">שם ספק</th><th className="px-5 py-3 font-medium">מדינה</th>
              <th className="px-5 py-3 font-medium">איש קשר</th><th className="px-5 py-3 font-medium">טלפון</th>
              <th className="px-5 py-3 font-medium">אימייל</th><th className="px-5 py-3 font-medium">מטבע</th><th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.suppliers.map((s) => (
              <tr key={s.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(s)}>
                <td className="px-5 py-3 font-medium text-slate-800">{s.name}</td>
                <td className="px-5 py-3 text-slate-500">{s.country || "-"}</td>
                <td className="px-5 py-3 text-slate-500">{s.contact || "-"}</td>
                <td className="px-5 py-3 text-slate-500">{s.phone || "-"}</td>
                <td className="px-5 py-3 text-slate-500">{s.email || "-"}</td>
                <td className="px-5 py-3"><Badge tone="sky">{CURRENCY_SYMBOLS[s.currency]} {s.currency}</Badge></td>
                <td className="px-5 py-3 text-left" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(s)} className="text-gray-400 hover:text-amber-600" title="עריכה"><Pencil size={16} /></button>
                    <button onClick={() => removeSupplier(s.id)} className="text-gray-400 hover:text-rose-600" title="מחיקה"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {data.suppliers.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">אין ספקים עדיין</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="הוספת ספק חדש" onClose={() => setOpen(false)}>
          <Field label="שם ספק"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="מדינה"><input className={inputCls} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
          <Field label="איש קשר"><input className={inputCls} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
          <Field label="טלפון"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="אימייל"><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="מטבע עבודה">
            <select className={inputCls} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>)}
            </select>
          </Field>
          <Field label="הערות"><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
          <button onClick={submit} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}שמירת ספק</button>
        </Modal>
      )}

      {editSupplier && (
        <Modal title="עריכת ספק" onClose={() => setEditSupplier(null)}>
          <Field label="שם ספק"><input className={inputCls} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
          <Field label="מדינה"><input className={inputCls} value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} /></Field>
          <Field label="איש קשר"><input className={inputCls} value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })} /></Field>
          <Field label="טלפון"><input className={inputCls} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></Field>
          <Field label="אימייל"><input type="email" className={inputCls} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></Field>
          <Field label="מטבע עבודה">
            <select className={inputCls} value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>)}
            </select>
          </Field>
          <Field label="הערות"><textarea className={inputCls} rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></Field>
          {editError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{editError}</div>}
          <button onClick={saveEdit} disabled={editBusy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{editBusy && <Loader2 size={16} className="animate-spin" />}שמירת שינויים</button>
        </Modal>
      )}
    </div>
  );
}

// ==================== משלוחים / מכולות (Shipments) ====================
function ShipmentsScreen({ data, refresh }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", status: "preparing", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editShipment, setEditShipment] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const [viewShipmentId, setViewShipmentId] = useState(null);

  const openNew = () => { setForm({ name: "", status: "preparing", notes: "" }); setError(""); setOpen(true); };

  const submit = async () => {
    if (!form.name.trim()) { setError("שם המשלוח הוא שדה חובה"); return; }
    setBusy(true);
    try { await api.addShipment(form); await refresh(); setOpen(false); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const openEdit = (s) => { setEditShipment(s); setEditForm({ name: s.name, status: s.status, notes: s.notes || "" }); setEditError(""); };
  const saveEdit = async () => {
    if (!editForm.name.trim()) { setEditError("שם המשלוח הוא שדה חובה"); return; }
    setEditBusy(true);
    try { await api.updateShipment(editShipment.id, editForm); await refresh(); setEditShipment(null); }
    catch (e) { setEditError(e.message); } finally { setEditBusy(false); }
  };

  const removeShipment = async (id) => {
    if (!confirm("למחוק את המשלוח? הזמנות הרכש המשויכות אליו לא יימחקו, רק ינותקו ממנו.")) return;
    try { await api.deleteShipment(id); await refresh(); } catch (e) { alert(e.message); }
  };

  const posFor = (shipmentId) => data.purchaseOrders.filter((p) => p.shipmentId === shipmentId);
  const suppliersFor = (shipmentId) => {
    const ids = [...new Set(posFor(shipmentId).map((p) => p.supplierId))];
    return ids.map((id) => data.suppliers.find((s) => s.id === id)).filter(Boolean);
  };

  if (viewShipmentId) {
    const shipment = data.shipments.find((s) => s.id === viewShipmentId);
    const pos = posFor(viewShipmentId);
    if (!shipment) { setViewShipmentId(null); return null; }

    const itemTotals = {};
    pos.forEach((po) => {
      const supplier = data.suppliers.find((s) => s.id === po.supplierId);
      po.lines.forEach((l) => {
        const item = data.items.find((i) => i.id === l.itemId);
        const key = l.itemId;
        if (!itemTotals[key]) itemTotals[key] = { item, qty: 0, suppliers: new Set() };
        itemTotals[key].qty += l.qty;
        if (supplier) itemTotals[key].suppliers.add(supplier.name);
      });
    });

    return (
      <div>
        <button onClick={() => setViewShipmentId(null)} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 mb-4 text-sm"><ChevronLeft size={16} /> חזרה לרשימת משלוחים</button>
        <div className="bg-white rounded-2xl border shadow-sm p-5 mb-4">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="font-bold text-xl text-slate-800">{shipment.name}</h2>
            <Badge tone={SHIPMENT_STATUSES[shipment.status]?.tone}>{SHIPMENT_STATUSES[shipment.status]?.label}</Badge>
          </div>
          {shipment.notes && <p className="text-slate-500 mt-1">{shipment.notes}</p>}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-2xl border shadow-sm p-5"><div className="text-slate-500 text-sm mb-1">הזמנות רכש</div><div className="text-2xl font-bold text-slate-800">{pos.length}</div></div>
          <div className="bg-white rounded-2xl border shadow-sm p-5"><div className="text-slate-500 text-sm mb-1">ספקים</div><div className="text-2xl font-bold text-slate-800">{suppliersFor(viewShipmentId).length}</div></div>
          <div className="bg-white rounded-2xl border shadow-sm p-5"><div className="text-slate-500 text-sm mb-1">שורות פריטים</div><div className="text-2xl font-bold text-slate-800">{Object.keys(itemTotals).length}</div></div>
        </div>

        <h3 className="font-bold text-slate-800 mb-2">הזמנות הרכש במשלוח זה</h3>
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-5 py-3 font-medium">מס' הזמנה</th><th className="px-5 py-3 font-medium">ספק</th><th className="px-5 py-3 font-medium">מטבע</th><th className="px-5 py-3 font-medium">שורות</th><th className="px-5 py-3 font-medium">סטטוס PO</th></tr></thead>
            <tbody>
              {pos.map((po) => {
                const supplier = data.suppliers.find((s) => s.id === po.supplierId);
                return (
                  <tr key={po.id} className="border-t">
                    <td className="px-5 py-3 font-medium text-slate-800">{po.poNumber}</td>
                    <td className="px-5 py-3 text-slate-500">{supplier?.name || "-"} {supplier?.country ? `(${supplier.country})` : ""}</td>
                    <td className="px-5 py-3 text-slate-500">{po.currency}</td>
                    <td className="px-5 py-3">{po.lines.length}</td>
                    <td className="px-5 py-3"><Badge tone={PO_STATUSES[po.status]?.tone}>{PO_STATUSES[po.status]?.label}</Badge></td>
                  </tr>
                );
              })}
              {pos.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">אין עדיין הזמנות רכש משויכות למשלוח זה</td></tr>}
            </tbody>
          </table>
        </div>

        <h3 className="font-bold text-slate-800 mb-2">פריטים וכמויות מרוכזים (כל הספקים יחד)</h3>
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-5 py-3 font-medium">פריט</th><th className="px-5 py-3 font-medium">כמות כוללת</th><th className="px-5 py-3 font-medium">מגיע מספקים</th></tr></thead>
            <tbody>
              {Object.values(itemTotals).map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-5 py-3 font-medium text-slate-800">{r.item?.name || "-"}</td>
                  <td className="px-5 py-3">{r.qty} {r.item?.unit || ""}</td>
                  <td className="px-5 py-3 text-slate-500">{[...r.suppliers].join(", ")}</td>
                </tr>
              ))}
              {Object.keys(itemTotals).length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">אין עדיין פריטים</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-slate-400 text-xs mt-3">כדי לחשב עלות נחיתה למשלוח הזה, עברו ל"מחשבון יבוא ועליות נחיתה" ובחרו את המשלוח הזה מהרשימה.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl text-slate-800">משלוחים / מכולות</h2>
        <button onClick={openNew} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> משלוח חדש</button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.shipments.map((s) => {
          const pos = posFor(s.id);
          const suppliers = suppliersFor(s.id);
          return (
            <div key={s.id} className="bg-white rounded-2xl border shadow-sm p-5 cursor-pointer hover:shadow-md transition" onClick={() => setViewShipmentId(s.id)}>
              <div className="flex items-start justify-between mb-2">
                <div className="p-2.5 rounded-xl bg-violet-100 text-violet-700"><Ship size={20} /></div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(s)} className="text-gray-400 hover:text-amber-600 p-1" title="עריכה"><Pencil size={15} /></button>
                  <button onClick={() => removeShipment(s.id)} className="text-gray-400 hover:text-rose-600 p-1" title="מחיקה"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="font-bold text-slate-800 mb-1">{s.name}</div>
              <Badge tone={SHIPMENT_STATUSES[s.status]?.tone}>{SHIPMENT_STATUSES[s.status]?.label}</Badge>
              <div className="text-sm text-slate-500 mt-2">{pos.length} הזמנות · {suppliers.length} ספקים</div>
            </div>
          );
        })}
        {data.shipments.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl border p-8 text-center text-slate-400">אין עדיין משלוחים - צרו משלוח ראשון כדי להתחיל לשייך אליו הזמנות רכש</div>
        )}
      </div>

      {open && (
        <Modal title="משלוח / מכולה חדש" onClose={() => setOpen(false)}>
          <Field label="שם המשלוח"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='לדוגמה: מכולה אוגוסט 2026' /></Field>
          <Field label="סטטוס">
            <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(SHIPMENT_STATUSES).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
            </select>
          </Field>
          <Field label="הערות"><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
          <button onClick={submit} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}שמירת משלוח</button>
        </Modal>
      )}

      {editShipment && (
        <Modal title="עריכת משלוח" onClose={() => setEditShipment(null)}>
          <Field label="שם המשלוח"><input className={inputCls} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
          <Field label="סטטוס">
            <select className={inputCls} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              {Object.entries(SHIPMENT_STATUSES).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
            </select>
          </Field>
          <Field label="הערות"><textarea className={inputCls} rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></Field>
          {editError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{editError}</div>}
          <button onClick={saveEdit} disabled={editBusy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{editBusy && <Loader2 size={16} className="animate-spin" />}שמירת שינויים</button>
        </Modal>
      )}
    </div>
  );
}

// ==================== מחירוני שילוח (Shipping Rate Cards) ====================
function ShippingRatesScreen({ data, refresh }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", carrier: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editCard, setEditCard] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const [rateFormFor, setRateFormFor] = useState(null); // card id
  const [rateForm, setRateForm] = useState({ rateType: "container_20ft", label: "", price: "", currency: "USD" });
  const [rateError, setRateError] = useState("");
  const [rateBusy, setRateBusy] = useState(false);

  const openNew = () => { setForm({ name: "", carrier: "", notes: "" }); setError(""); setOpen(true); };
  const submit = async () => {
    if (!form.name.trim()) { setError("שם המחירון הוא שדה חובה"); return; }
    setBusy(true);
    try { await api.addRateCard(form); await refresh(); setOpen(false); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const openEdit = (c) => { setEditCard(c); setEditForm({ name: c.name, carrier: c.carrier || "", notes: c.notes || "" }); setEditError(""); };
  const saveEdit = async () => {
    if (!editForm.name.trim()) { setEditError("שם המחירון הוא שדה חובה"); return; }
    setEditBusy(true);
    try { await api.updateRateCard(editCard.id, editForm); await refresh(); setEditCard(null); }
    catch (e) { setEditError(e.message); } finally { setEditBusy(false); }
  };

  const removeCard = async (id) => {
    if (!confirm("למחוק את המחירון וכל השורות שבו?")) return;
    try { await api.deleteRateCard(id); await refresh(); } catch (e) { alert(e.message); }
  };

  const openRateForm = (cardId) => { setRateFormFor(cardId); setRateForm({ rateType: "container_20ft", label: "", price: "", currency: "USD" }); setRateError(""); };
  const submitRate = async () => {
    if (!rateForm.price || Number(rateForm.price) <= 0) { setRateError("יש להזין מחיר תקין"); return; }
    setRateBusy(true);
    try {
      await api.addRateLine(rateFormFor, rateForm);
      await refresh();
      setRateFormFor(null);
    } catch (e) { setRateError(e.message); } finally { setRateBusy(false); }
  };
  const removeRate = async (id) => {
    if (!confirm("למחוק את שורת המחיר?")) return;
    try { await api.deleteRateLine(id); await refresh(); } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl text-slate-800">מחירוני שילוח (Shipping Rate Cards)</h2>
        <button onClick={openNew} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> מחירון חדש</button>
      </div>
      <p className="text-slate-500 text-sm mb-4">שמרו כאן מחירים קבועים שסגרתם מול חברות שילוח - הם ייבחרו אוטומטית ב"מחשבון יבוא ועלויות נחיתה" במקום להקליד את אותו מחיר בכל פעם מחדש.</p>

      <div className="space-y-4">
        {data.rateCards.map((card) => (
          <div key={card.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <div>
                <div className="font-bold text-slate-800">{card.name}</div>
                {card.carrier && <div className="text-sm text-slate-500">{card.carrier}</div>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(card)} className="text-gray-400 hover:text-amber-600 p-1" title="עריכה"><Pencil size={16} /></button>
                <button onClick={() => removeCard(card.id)} className="text-gray-400 hover:text-rose-600 p-1" title="מחיקה"><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="p-4">
              {card.notes && <p className="text-sm text-slate-500 mb-3">{card.notes}</p>}
              <table className="w-full text-sm mb-3">
                <thead><tr className="text-slate-500 text-right"><th className="py-1.5 font-medium">סוג</th><th className="py-1.5 font-medium">תיאור</th><th className="py-1.5 font-medium">מחיר</th><th className="py-1.5"></th></tr></thead>
                <tbody>
                  {card.rates.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-1.5">{RATE_TYPES[r.rateType]}</td>
                      <td className="py-1.5 text-slate-500">{r.label || "-"}</td>
                      <td className="py-1.5 font-medium">{CURRENCY_SYMBOLS[r.currency] || r.currency}{r.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}{r.rateType === "air_per_kg" ? " / ק\"ג" : ""}</td>
                      <td className="py-1.5 text-left"><button onClick={() => removeRate(r.id)} className="text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                  {card.rates.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-400">אין עדיין שורות מחיר במחירון זה</td></tr>}
                </tbody>
              </table>
              <button onClick={() => openRateForm(card.id)} className={btnGhost + " flex items-center gap-1.5 !py-1.5 !px-3 text-sm"}><Plus size={14} /> הוספת שורת מחיר</button>
            </div>
          </div>
        ))}
        {data.rateCards.length === 0 && (
          <div className="bg-white rounded-2xl border p-8 text-center text-slate-400">אין עדיין מחירוני שילוח - צרו מחירון ראשון (לדוגמה "הובלה חודש יוני" או "מחירון חברת שילוח X")</div>
        )}
      </div>

      {open && (
        <Modal title="מחירון שילוח חדש" onClose={() => setOpen(false)}>
          <Field label='שם המחירון'><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='לדוגמה: הובלה חודש יוני' /></Field>
          <Field label="חברת שילוח (לא חובה)"><input className={inputCls} value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} /></Field>
          <Field label="הערות"><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
          <button onClick={submit} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}שמירת מחירון</button>
        </Modal>
      )}

      {editCard && (
        <Modal title="עריכת מחירון" onClose={() => setEditCard(null)}>
          <Field label="שם המחירון"><input className={inputCls} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
          <Field label="חברת שילוח (לא חובה)"><input className={inputCls} value={editForm.carrier} onChange={(e) => setEditForm({ ...editForm, carrier: e.target.value })} /></Field>
          <Field label="הערות"><textarea className={inputCls} rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></Field>
          {editError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{editError}</div>}
          <button onClick={saveEdit} disabled={editBusy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{editBusy && <Loader2 size={16} className="animate-spin" />}שמירת שינויים</button>
        </Modal>
      )}

      {rateFormFor && (
        <Modal title="הוספת שורת מחיר" onClose={() => setRateFormFor(null)}>
          <Field label="סוג">
            <select className={inputCls} value={rateForm.rateType} onChange={(e) => setRateForm({ ...rateForm, rateType: e.target.value })}>
              {Object.entries(RATE_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field>
          {rateForm.rateType === "other" && (
            <Field label="תיאור"><input className={inputCls} value={rateForm.label} onChange={(e) => setRateForm({ ...rateForm, label: e.target.value })} /></Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={`מחיר${rateForm.rateType === "air_per_kg" ? ' לק"ג' : ""}`}><input type="number" min="0" step="0.01" className={inputCls} value={rateForm.price} onChange={(e) => setRateForm({ ...rateForm, price: e.target.value })} /></Field>
            <Field label="מטבע">
              <select className={inputCls} value={rateForm.currency} onChange={(e) => setRateForm({ ...rateForm, currency: e.target.value })}>
                {["ILS", ...CURRENCIES].filter((c, i, arr) => arr.indexOf(c) === i).map((c) => <option key={c} value={c}>{CURRENCY_SYMBOLS[c] || c} {c}</option>)}
              </select>
            </Field>
          </div>
          {rateError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{rateError}</div>}
          <button onClick={submitRate} disabled={rateBusy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{rateBusy && <Loader2 size={16} className="animate-spin" />}הוספת שורה</button>
        </Modal>
      )}
    </div>
  );
}

// ==================== לידים ומשפך מכירות (Leads / CRM) ====================
function LeadsScreen({ data, refresh, onCreateQuote }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", customerId: "", status: "new", source: "", estimatedValue: "", notes: "", followUpDate: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editLead, setEditLead] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState(null);

  const openNew = () => { setForm({ name: "", phone: "", email: "", customerId: "", status: "new", source: "", estimatedValue: "", notes: "", followUpDate: "" }); setError(""); setOpen(true); };
  const submit = async () => {
    if (!form.name.trim()) { setError("שם הליד הוא שדה חובה"); return; }
    setBusy(true);
    try { await api.addLead(form); await refresh(); setOpen(false); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const openEdit = (l) => {
    setEditLead(l);
    setEditForm({ name: l.name, phone: l.phone, email: l.email, customerId: l.customerId || "", status: l.status, source: l.source, estimatedValue: l.estimatedValue ?? "", notes: l.notes, followUpDate: l.followUpDate || "" });
    setEditError("");
  };
  const saveEdit = async () => {
    if (!editForm.name.trim()) { setEditError("שם הליד הוא שדה חובה"); return; }
    setEditBusy(true);
    try { await api.updateLead(editLead.id, editForm); await refresh(); setEditLead(null); }
    catch (e) { setEditError(e.message); } finally { setEditBusy(false); }
  };
  const removeLead = async (id) => {
    if (!confirm("למחוק את הליד?")) return;
    try { await api.deleteLead(id); await refresh(); } catch (e) { alert(e.message); }
  };
  const changeStatus = async (id, status) => {
    setStatusBusyId(id);
    try { await api.updateLead(id, { status }); await refresh(); } catch (e) { alert(e.message); } finally { setStatusBusyId(null); }
  };

  const today = new Date(new Date().toDateString());

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl text-slate-800">לידים ומשפך מכירות (CRM)</h2>
        <button onClick={openNew} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> ליד חדש</button>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {LEAD_STATUS_ORDER.map((statusKey) => {
            const leadsInColumn = data.leads.filter((l) => l.status === statusKey);
            const meta = LEAD_STATUSES[statusKey];
            return (
              <div key={statusKey} className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span className="text-xs text-slate-400">{leadsInColumn.length}</span>
                </div>
                <div className="space-y-2">
                  {leadsInColumn.map((lead) => {
                    const customer = data.customers.find((c) => c.id === lead.customerId);
                    const isOverdue = lead.followUpDate && new Date(lead.followUpDate) < today;
                    return (
                      <div key={lead.id} className="bg-white rounded-2xl border p-3 shadow-sm">
                        <div className="flex items-start justify-between mb-1">
                          <div className="font-bold text-slate-800 text-sm">{lead.name}</div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(lead)} className="text-gray-400 hover:text-amber-600"><Pencil size={13} /></button>
                            <button onClick={() => removeLead(lead.id)} className="text-gray-400 hover:text-rose-600"><Trash2 size={13} /></button>
                          </div>
                        </div>
                        {customer && <div className="text-xs text-slate-400 mb-1">מקושר ללקוח: {customer.name}</div>}
                        {(lead.phone || lead.email) && <div className="text-xs text-slate-500 mb-1">{lead.phone} {lead.email && `· ${lead.email}`}</div>}
                        {lead.estimatedValue != null && <div className="text-xs text-emerald-700 font-medium mb-1">שווי משוער: ₪{lead.estimatedValue.toLocaleString()}</div>}
                        {lead.followUpDate && (
                          <div className={`text-xs mb-1 flex items-center justify-between gap-2 ${isOverdue ? "text-rose-600 font-medium" : "text-slate-500"}`}>
                            <span>מעקב: {new Date(lead.followUpDate).toLocaleDateString("he-IL")} {isOverdue && "(עבר!)"}</span>
                            <AddToGoogleCalendarButton
                              title={`מעקב ליד: ${lead.name}`}
                              description={`${lead.phone ? `טלפון: ${lead.phone}\n` : ""}${lead.notes || ""}`}
                              date={lead.followUpDate}
                              label=""
                            />
                          </div>
                        )}
                        {lead.notes && <div className="text-xs text-slate-500 mb-2 line-clamp-2">{lead.notes}</div>}
                        <div className="flex items-center gap-2 mt-2">
                          <select
                            className="flex-1 text-xs rounded-lg border border-gray-300 px-2 py-1.5 bg-white"
                            value={lead.status}
                            disabled={statusBusyId === lead.id}
                            onChange={(e) => changeStatus(lead.id, e.target.value)}
                          >
                            {LEAD_STATUS_ORDER.map((s) => <option key={s} value={s}>{LEAD_STATUSES[s].label}</option>)}
                          </select>
                          <button onClick={() => onCreateQuote(lead.customerId || null, lead.id)} className="shrink-0 text-amber-600 hover:bg-amber-50 rounded-lg p-1.5" title="יצירת הצעת מחיר"><FileText size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                  {leadsInColumn.length === 0 && <div className="text-xs text-slate-300 text-center py-6 border-2 border-dashed rounded-2xl">אין לידים</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {open && (
        <Modal title="ליד חדש" onClose={() => setOpen(false)}>
          <Field label="שם"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="טלפון"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="אימייל"><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="קישור ללקוח קיים (לא חובה)">
            <select className={inputCls} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">ללא קישור</option>
              {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="סטטוס">
            <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {LEAD_STATUS_ORDER.map((s) => <option key={s} value={s}>{LEAD_STATUSES[s].label}</option>)}
            </select>
          </Field>
          <Field label="מקור הליד"><input className={inputCls} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="לדוגמה: פייסבוק, המלצה" /></Field>
          <Field label="שווי משוער (₪)"><input type="number" min="0" className={inputCls} value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} /></Field>
          <Field label="תאריך מעקב הבא"><input type="date" className={inputCls} value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} /></Field>
          <Field label="הערות"><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
          <button onClick={submit} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}שמירת ליד</button>
        </Modal>
      )}

      {editLead && (
        <Modal title="עריכת ליד" onClose={() => setEditLead(null)}>
          <Field label="שם"><input className={inputCls} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
          <Field label="טלפון"><input className={inputCls} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></Field>
          <Field label="אימייל"><input type="email" className={inputCls} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></Field>
          <Field label="קישור ללקוח קיים (לא חובה)">
            <select className={inputCls} value={editForm.customerId} onChange={(e) => setEditForm({ ...editForm, customerId: e.target.value })}>
              <option value="">ללא קישור</option>
              {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="סטטוס">
            <select className={inputCls} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              {LEAD_STATUS_ORDER.map((s) => <option key={s} value={s}>{LEAD_STATUSES[s].label}</option>)}
            </select>
          </Field>
          <Field label="מקור הליד"><input className={inputCls} value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} /></Field>
          <Field label="שווי משוער (₪)"><input type="number" min="0" className={inputCls} value={editForm.estimatedValue} onChange={(e) => setEditForm({ ...editForm, estimatedValue: e.target.value })} /></Field>
          <Field label="תאריך מעקב הבא"><input type="date" className={inputCls} value={editForm.followUpDate} onChange={(e) => setEditForm({ ...editForm, followUpDate: e.target.value })} /></Field>
          <Field label="הערות"><textarea className={inputCls} rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></Field>
          {editError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{editError}</div>}
          <button onClick={saveEdit} disabled={editBusy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{editBusy && <Loader2 size={16} className="animate-spin" />}שמירת שינויים</button>
        </Modal>
      )}
    </div>
  );
}

// ==================== הצעות מחיר (Quotes) ====================
function QuoteBuilderModal({ data, customerId, leadId, refresh, onClose, onCreated }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId || "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ id: Math.random().toString(36).slice(2), itemId: "", qty: "1", unitPrice: "" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const lead = leadId ? data.leads.find((l) => l.id === leadId) : null;

  const setLine = (id, patch) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines([...lines, { id: Math.random().toString(36).slice(2), itemId: "", qty: "1", unitPrice: "" }]);
  const removeLine = (id) => setLines(lines.filter((l) => l.id !== id));
  const onPickItem = (id, itemId) => { const it = data.items.find((i) => i.id === itemId); setLine(id, { itemId, unitPrice: it?.unitCost ? String(Math.round(it.unitCost * 1.4 * 100) / 100) : "" }); };

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);

  const submit = async () => {
    setError("");
    const valid = lines.filter((l) => l.itemId && Number(l.qty) > 0 && Number(l.unitPrice) >= 0);
    if (!selectedCustomerId && !leadId) { setError("יש לבחור לקוח (או לשייך ליד)"); return; }
    if (valid.length === 0) { setError("יש להוסיף לפחות שורת פריט אחת"); return; }
    setBusy(true);
    try {
      const quoteId = await api.createQuote(
        selectedCustomerId || null, leadId || null,
        valid.map((l) => ({ itemId: l.itemId, qty: Number(l.qty), unitPrice: Number(l.unitPrice) })),
        notes
      );
      await refresh();
      onCreated(quoteId);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="יצירת הצעת מחיר" onClose={onClose}>
      {lead && <div className="bg-sky-50 rounded-xl p-2.5 text-sm text-slate-700 mb-3">מקושר לליד: <b>{lead.name}</b></div>}
      <Field label="לקוח">
        <select className={inputCls} value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
          <option value="">{lead ? "ללא קישור ללקוח קיים" : "בחר לקוח..."}</option>
          {data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-slate-600">פריטים</span><button onClick={addLine} className={btnGhost + " !py-1 !px-2.5 text-xs"}><Plus size={14} className="inline" /> שורה</button></div>
      <div className="space-y-2 mb-2">
        {lines.map((l) => (
          <div key={l.id} className="grid grid-cols-6 gap-1.5 items-center">
            <select className={inputCls + " col-span-3 !py-2 text-sm"} value={l.itemId} onChange={(e) => onPickItem(l.id, e.target.value)}>
              <option value="">פריט...</option>
              {data.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
            <input type="number" min="1" placeholder="כמות" className={inputCls + " col-span-1 !py-2 text-sm"} value={l.qty} onChange={(e) => setLine(l.id, { qty: e.target.value })} />
            <input type="number" min="0" step="0.01" placeholder="מחיר (₪)" className={inputCls + " col-span-1 !py-2 text-sm"} value={l.unitPrice} onChange={(e) => setLine(l.id, { unitPrice: e.target.value })} />
            {lines.length > 1 && <button onClick={() => removeLine(l.id)} className="text-gray-400 hover:text-rose-600 justify-self-center"><Trash2 size={15} /></button>}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-sm mb-4 px-1">
        <span className="text-slate-500">סה"כ הצעה</span>
        <span className="font-bold text-slate-800">₪{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
      <Field label="הערות"><textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
      <button onClick={submit} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}יצירת הצעת מחיר</button>
    </Modal>
  );
}

function QuotesScreen({ data, refresh, onPrint }) {
  const [statusBusyId, setStatusBusyId] = useState(null);
  const changeStatus = async (id, status) => {
    setStatusBusyId(id);
    try { await api.updateQuoteStatus(id, status); await refresh(); } catch (e) { alert(e.message); } finally { setStatusBusyId(null); }
  };
  const removeQuote = async (id) => {
    if (!confirm("למחוק את הצעת המחיר?")) return;
    try { await api.deleteQuote(id); await refresh(); } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <h2 className="font-bold text-xl text-slate-800 mb-4">הצעות מחיר</h2>
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-5 py-3 font-medium">מס' הצעה</th><th className="px-5 py-3 font-medium">תאריך</th><th className="px-5 py-3 font-medium">לקוח / ליד</th><th className="px-5 py-3 font-medium">שורות</th><th className="px-5 py-3 font-medium">סה"כ</th><th className="px-5 py-3 font-medium">סטטוס</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {data.quotes.map((q) => {
              const customer = data.customers.find((c) => c.id === q.customerId);
              const lead = data.leads.find((l) => l.id === q.leadId);
              const total = q.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
              return (
                <tr key={q.id} className="border-t">
                  <td className="px-5 py-3 font-medium text-slate-800">{q.quoteNumber}</td>
                  <td className="px-5 py-3 text-slate-500">{fmtDate(q.date)}</td>
                  <td className="px-5 py-3 text-slate-500">{customer?.name || lead?.name || "-"}</td>
                  <td className="px-5 py-3">{q.lines.length}</td>
                  <td className="px-5 py-3 font-bold">₪{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3">
                    <select className="text-xs rounded-lg border border-gray-300 px-2 py-1 bg-white" value={q.status} disabled={statusBusyId === q.id} onChange={(e) => changeStatus(q.id, e.target.value)}>
                      {Object.entries(QUOTE_STATUSES).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-left">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => onPrint(q.id)} className="text-amber-600 hover:underline font-medium flex items-center gap-1"><Printer size={14} /> צפייה/הדפסה</button>
                      <button onClick={() => removeQuote(q.id)} className="text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.quotes.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">עדיין לא נוצרו הצעות מחיר</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuotePrintView({ data, quoteId, onClose }) {
  const quote = data.quotes.find((q) => q.id === quoteId);
  if (!quote) return null;
  const customer = data.customers.find((c) => c.id === quote.customerId);
  const lead = data.leads.find((l) => l.id === quote.leadId);
  const lineRows = quote.lines.map((l) => { const item = data.items.find((i) => i.id === l.itemId); return { ...l, name: item?.name || "-", unit: item?.unit || "", lineTotal: l.qty * l.unitPrice }; });
  const grandTotal = lineRows.reduce((s, l) => s + l.lineTotal, 0);
  return (
    <div className="fixed inset-0 bg-slate-800/60 z-50 overflow-y-auto py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b print:hidden">
          <button onClick={onClose} className={btnGhost + " flex items-center gap-1.5"}><ChevronLeft size={16} /> סגירה</button>
          <button onClick={() => window.print()} className={btnPrimary + " flex items-center gap-2"}><Printer size={18} /> הדפסה / שמירה כ-PDF</button>
        </div>
        <div dir="rtl" lang="he" className="p-8">
          <div className="flex items-start justify-between mb-8">
            <div><div className="text-2xl font-bold text-slate-900">אדל אימפורט</div><div className="text-sm text-slate-500 mt-1">ADL Import LTD</div></div>
            <div className="text-left" dir="ltr"><div className="text-xl font-bold text-amber-600">הצעת מחיר</div><div className="text-sm text-slate-600 mt-1">מס': {quote.quoteNumber}</div><div className="text-sm text-slate-600">{new Date(quote.date).toLocaleDateString("he-IL")}</div></div>
          </div>
          <div className="mb-6 bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-slate-400 font-bold mb-1">לכבוד</div>
            <div className="font-bold text-slate-800">{customer?.name || lead?.name || "-"}</div>
            {customer?.address && <div className="text-sm text-slate-600">{customer.address}</div>}
            {(customer?.phone || customer?.email || lead?.phone || lead?.email) && <div className="text-sm text-slate-600">{customer?.phone || lead?.phone} {(customer?.email || lead?.email) && `· ${customer?.email || lead?.email}`}</div>}
          </div>
          <table className="w-full text-sm mb-6 border-collapse">
            <thead><tr className="border-b-2 border-slate-800 text-right"><th className="py-2 font-bold">פריט</th><th className="py-2 font-bold">כמות</th><th className="py-2 font-bold">מחיר ליח'</th><th className="py-2 font-bold">סה"כ</th></tr></thead>
            <tbody>{lineRows.map((l, i) => (<tr key={i} className="border-b border-slate-200"><td className="py-2">{l.name}</td><td className="py-2">{l.qty} {l.unit}</td><td className="py-2">₪{l.unitPrice.toFixed(2)}</td><td className="py-2">₪{l.lineTotal.toFixed(2)}</td></tr>))}</tbody>
            <tfoot><tr><td colSpan={3} className="pt-3 font-bold">סה"כ לתשלום</td><td className="pt-3 font-bold">₪{grandTotal.toFixed(2)}</td></tr></tfoot>
          </table>
          {quote.notes && <div className="mb-4"><div className="text-xs text-slate-400 font-bold mb-1">הערות</div><div className="text-sm text-slate-700">{quote.notes}</div></div>}
          <div className="text-xs text-slate-400 border-t pt-4">הצעת המחיר הופקה על ידי מערכת ניהול המלאי של אדל אימפורט. בתוקף ל-14 יום מתאריך ההנפקה, אלא אם צוין אחרת.</div>
        </div>
      </div>
    </div>
  );
}

// ==================== הוצאות וחשבוניות ספקים (Expenses) ====================
function emptyExpenseForm() {
  return {
    category: "goods", supplierId: "", description: "", invoiceNumber: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    vatMode: "incl", amount: "", vatOverride: false, vatAmountOverride: "",
    paymentStatus: "pending", paymentMethod: "bank_transfer", notes: "",
  };
}

function ExpenseModal({ data, existing, onClose, refresh }) {
  const [form, setForm] = useState(() => {
    if (!existing) return emptyExpenseForm();
    return {
      category: existing.category, supplierId: existing.supplierId || "", description: existing.description,
      invoiceNumber: existing.invoiceNumber, expenseDate: existing.expenseDate,
      vatMode: existing.vatMode, amount: existing.vatMode === "incl" ? String(existing.amountInclVat) : String(existing.amountExclVat),
      vatOverride: true, vatAmountOverride: String(existing.vatAmount),
      paymentStatus: existing.paymentStatus, paymentMethod: existing.paymentMethod || "bank_transfer", notes: existing.notes,
    };
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanNotice, setScanNotice] = useState("");
  const [stagedFiles, setStagedFiles] = useState([]);
  const [stagedPreviews, setStagedPreviews] = useState([]); // object URLs, אינדקס מקביל ל-stagedFiles
  const [pdfConverting, setPdfConverting] = useState(false);

  const vatRate = data.companySettings.vatRate ?? 18;
  const computed = computeVat(form.vatMode, form.amount, vatRate);
  // דריסה ידנית: אם המשתמש נגע בשדה המע"מ בעצמו, נשתמש בערך שלו במקום בערך המחושב,
  // ונגזור מחדש את הסכום ללא מע"מ כך שהוא + המע"מ שווים תמיד לסכום הכולל שהוזן.
  const amountInclVat = form.vatMode === "incl" ? (Number(form.amount) || 0) : computed.amountInclVat;
  const vatAmount = form.vatOverride && form.vatAmountOverride !== "" ? Number(form.vatAmountOverride) : computed.vatAmount;
  const amountExclVat = form.vatMode === "incl" ? amountInclVat - vatAmount : (Number(form.amount) || 0);
  const validation = validateVatBalance(amountExclVat, vatAmount, amountInclVat);

  // בונים ומנקים תצוגות מקדימות (object URLs) בכל שינוי ברשימת העמודים שנצברו,
  // כדי שלא יישארו כתובות זיכרון פתוחות בדפדפן אחרי שעמוד הוסר או הניתוח הושלם.
  useEffect(() => {
    const urls = stagedFiles.map((f) => (f.type && f.type.startsWith("image/") ? URL.createObjectURL(f) : null));
    setStagedPreviews(urls);
    return () => { urls.forEach((u) => u && URL.revokeObjectURL(u)); };
  }, [stagedFiles]);

  // מצלמת נייד תופסת תמונה אחת בלבד לכל הפעלה - אז מצטברים כמה עמודים ברצף
  // בזה אחר זה, עם תצוגה מקדימה לכל אחד, ורק בלחיצה על "סיים ונתח" כל התמונות
  // נשלחות יחד כמערך אחד לפונקציית ה-AI, כחשבונית רב-עמודית אחת.
  // קובץ PDF מומר כאן לתמונות אמיתיות (עמוד אחד = תמונה אחת) - ה-API לעולם
  // לא מקבל PDF ישירות, כי הוא תומך רק ב-jpeg/png/gif/webp.
  const addStagedFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const expanded = [];
    const hasPdf = files.some((f) => f.type === "application/pdf");
    if (hasPdf) setPdfConverting(true);
    try {
      for (const f of files) {
        if (f.type === "application/pdf") {
          try {
            expanded.push(...(await convertPdfFileToImages(f)));
          } catch (e) {
            setScanError('המרת קובץ ה-PDF לתמונה נכשלה - נסו לצלם או להעלות תמונה (JPG/PNG) במקום.');
          }
        } else {
          expanded.push(f);
        }
      }
    } finally {
      if (hasPdf) setPdfConverting(false);
    }
    if (expanded.length > 0) setStagedFiles((prev) => [...prev, ...expanded]);
  };
  const removeStagedFile = (idx) => setStagedFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleScanFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setScanError(""); setScanNotice(""); setScanBusy(true);
    try {
      const result = await api.analyzeInvoiceImage(files);
      // ניסיון התאמה אוטומטית של הספק שזוהה מול רשימת הספקים הקיימת
      const normalizedName = normalizeText(result.supplierName || "");
      const matchedSupplier = normalizedName
        ? data.suppliers.find((s) => normalizeText(s.name) === normalizedName || normalizeText(s.name).includes(normalizedName) || normalizedName.includes(normalizeText(s.name)))
        : null;

      setForm((f) => ({
        ...f,
        supplierId: matchedSupplier ? matchedSupplier.id : f.supplierId,
        invoiceNumber: result.invoiceNumber || f.invoiceNumber,
        expenseDate: result.invoiceDate || f.expenseDate,
        vatMode: "incl",
        amount: result.amountInclVat != null ? String(result.amountInclVat) : f.amount,
        vatOverride: true,
        vatAmountOverride: result.vatAmount != null ? String(result.vatAmount) : f.vatAmountOverride,
      }));

      const pagesNote = files.length > 1 ? `נותחו ${files.length} עמודים יחד כחשבונית אחת. ` : "";
      if (result.supplierName && !matchedSupplier) {
        setScanNotice(`${pagesNote}זוהה שם הספק "${result.supplierName}" אך הוא לא נמצא ברשימת הספקים - בחרו ידנית או הוסיפו אותו כספק חדש. שאר השדות מולאו אוטומטית.`);
      } else {
        setScanNotice(`${pagesNote}הנתונים מולאו אוטומטית מהחשבונית - בדקו שהכל נכון לפני השמירה.`);
      }
      setStagedFiles([]);
    } catch (e) {
      setScanError(e.message || "הסריקה נכשלה - ניתן להמשיך ולמלא את הטופס ידנית, או ללחוץ שוב על נתח כדי לנסות שנית.");
    } finally {
      setScanBusy(false);
    }
  };

  const submit = async () => {
    setError("");
    if (!form.category) { setError("יש לבחור קטגוריה"); return; }
    if (!form.expenseDate) { setError("יש להזין תאריך"); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError("יש להזין סכום תקין"); return; }
    if (!validation.balanced) {
      setError(`בקרת תקינות נכשלה: הפרש של ₪${validation.diff.toFixed(2)} בין הסכום ללא מע"מ + מע"מ לבין הסכום הכולל. תקנו את הדריסה הידנית לפני השמירה.`);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        category: form.category, supplierId: form.supplierId || null, description: form.description,
        invoiceNumber: form.invoiceNumber, expenseDate: form.expenseDate,
        vatMode: form.vatMode,
        amountExclVat: Math.round(amountExclVat * 100) / 100,
        vatAmount: Math.round(vatAmount * 100) / 100,
        amountInclVat: Math.round(amountInclVat * 100) / 100,
        paymentStatus: form.paymentStatus, paymentMethod: form.paymentStatus === "paid" ? form.paymentMethod : null,
        notes: form.notes,
      };
      if (existing) await api.updateExpense(existing.id, payload);
      else await api.addExpense(payload);
      await refresh();
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={existing ? "עריכת הוצאה / חשבונית" : "הוצאה / חשבונית חדשה"} onClose={onClose}>
      {!existing && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Calculator size={16} className="text-violet-600" />
            <span className="text-sm font-bold text-slate-800">סריקת חשבונית חכמה (AI)</span>
          </div>
          <p className="text-xs text-slate-500 mb-3">חשבונית עם כמה עמודים? צלמו כל עמוד בנפרד (כל לחיצה מוסיפה עמוד לרשימה למטה עם תצוגה מקדימה) - ורק אחרי שכל העמודים נאספו, לחצו "סיים ונתח" כדי לעבד את כולם יחד כמסמך אחד.</p>
          <div className="flex gap-2 mb-3">
            <label className={btnGhost + " flex-1 text-center cursor-pointer flex items-center justify-center gap-2 !py-2.5"}>
              <Upload size={16} /> צילום עמוד
              <input type="file" accept="image/*" capture="environment" className="hidden" disabled={scanBusy || pdfConverting} onChange={(e) => { addStagedFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <label className={btnGhost + " flex-1 text-center cursor-pointer flex items-center justify-center gap-2 !py-2.5"}>
              <Upload size={16} /> העלאת קבצים
              <input type="file" accept="image/*,application/pdf" multiple className="hidden" disabled={scanBusy || pdfConverting} onChange={(e) => { addStagedFiles(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
          {pdfConverting && <div className="text-xs text-violet-600 mb-3 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> ממיר PDF לתמונות...</div>}

          {stagedFiles.length > 0 && (
            <div className="mb-3">
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-3">
                {stagedFiles.map((f, i) => (
                  <div key={i} className="relative group">
                    <div className="aspect-square rounded-xl border border-violet-200 bg-white overflow-hidden flex items-center justify-center">
                      {stagedPreviews[i] ? (
                        <img src={stagedPreviews[i]} alt={`עמוד ${i + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <FileText size={22} className="text-slate-300" />
                      )}
                    </div>
                    <span className="absolute top-1 right-1 bg-slate-900/70 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeStagedFile(i)}
                      className="absolute -top-1.5 -left-1.5 bg-white border border-gray-300 rounded-full w-5 h-5 flex items-center justify-center text-slate-500 hover:text-rose-600 hover:border-rose-300 shadow-sm"
                      title="הסרת עמוד זה"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleScanFiles(stagedFiles)}
                disabled={scanBusy || pdfConverting}
                className={btnPrimary + " w-full flex items-center justify-center gap-2 !py-2.5"}
              >
                {scanBusy ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                {scanBusy ? "מנתח..." : `סיים ונתח (${stagedFiles.length} ${stagedFiles.length === 1 ? "עמוד" : "עמודים"})`}
              </button>
            </div>
          )}

          {scanNotice && <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-2 mt-2">{scanNotice}</div>}
          {scanError && <div className="text-xs text-rose-700 bg-rose-50 rounded-lg px-2.5 py-2 mt-2">{scanError}</div>}
        </div>
      )}
      <Field label="קטגוריה">
        <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="ספק (לא חובה)">
        <select className={inputCls} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
          <option value="">ללא / לא רלוונטי</option>
          {data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="תיאור"><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="מספר חשבונית"><input className={inputCls} value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} /></Field>
        <Field label="תאריך אספקה/חיוב"><input type="date" className={inputCls} value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></Field>
      </div>

      <Field label='סטטוס מע"מ'>
        <div className="flex gap-1.5">
          {Object.entries(VAT_MODES).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setForm({ ...form, vatMode: key, vatOverride: false, vatAmountOverride: "" })} className={`flex-1 rounded-xl py-2 border text-xs font-medium ${form.vatMode === key ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}>{label}</button>
          ))}
        </div>
      </Field>
      <Field label={form.vatMode === "incl" ? 'סכום כולל מע"מ (₪)' : 'סכום לפני מע"מ (₪)'}>
        <input type="number" min="0" step="0.01" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </Field>

      <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm space-y-1.5">
        <div className="flex items-center justify-between"><span className="text-slate-500">סכום לפני מע"מ</span><span className="font-medium">₪{amountExclVat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500 flex items-center gap-1.5">
            מע"מ ({vatRate}%)
            {form.vatMode !== "zero" && (
              <button type="button" onClick={() => setForm({ ...form, vatOverride: !form.vatOverride, vatAmountOverride: form.vatOverride ? "" : String(Math.round(computed.vatAmount * 100) / 100) })} className="text-[11px] text-amber-600 hover:underline">
                {form.vatOverride ? "בטל דריסה" : "דריסה ידנית"}
              </button>
            )}
          </span>
          {form.vatOverride ? (
            <input type="number" step="0.01" className={inputCls + " w-24 !py-1"} value={form.vatAmountOverride} onChange={(e) => setForm({ ...form, vatAmountOverride: e.target.value })} />
          ) : (
            <span className="font-medium">₪{vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          )}
        </div>
        <div className="flex items-center justify-between pt-1.5 border-t"><span className="font-bold text-slate-800">סה"כ כולל מע"מ</span><span className="font-bold text-slate-800">₪{amountInclVat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
        {!validation.balanced && (
          <div className="bg-rose-100 text-rose-700 text-xs rounded-lg px-2.5 py-2 mt-1 flex items-center gap-1.5"><TriangleAlert size={13} /> החשבון לא מתאזן - הפרש ₪{validation.diff.toFixed(2)}. לא ניתן לשמור עד לתיקון.</div>
        )}
      </div>

      <Field label="סטטוס תשלום">
        <div className="flex gap-2">
          {Object.entries(EXPENSE_PAYMENT_STATUSES).map(([key, cfg]) => (
            <button key={key} type="button" onClick={() => setForm({ ...form, paymentStatus: key })} className={`flex-1 rounded-xl py-2 border text-sm font-medium ${form.paymentStatus === key ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}>{cfg.label}</button>
          ))}
        </div>
      </Field>
      {form.paymentStatus === "paid" && (
        <Field label="אמצעי תשלום">
          <select className={inputCls} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      )}
      <Field label="הערות"><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>

      {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
      <button onClick={submit} disabled={busy || !validation.balanced} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}{existing ? "שמירת שינויים" : "שמירת הוצאה"}</button>
    </Modal>
  );
}

function ExpensePaymentsModal({ data, expense, onClose, refresh }) {
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const payments = (data.expensePayments || []).filter((p) => p.expenseId === expense.id).sort((a, b) => new Date(b.paidDate) - new Date(a.paidDate));
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = expense.amountInclVat - paid;

  const addPayment = async () => {
    setError("");
    if (!amount || Number(amount) <= 0) { setError("יש להזין סכום תקין"); return; }
    setBusy(true);
    try {
      await api.addExpensePayment(expense.id, Number(amount), paidDate, method, note);
      await refresh();
      setAmount(""); setNote("");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const removePayment = async (id) => {
    if (!confirm("למחוק את רישום התשלום?")) return;
    try { await api.deleteExpensePayment(id); await refresh(); } catch (e) { alert(e.message); }
  };

  return (
    <Modal title={`תשלומים - ${expense.invoiceNumber || expense.description || "הוצאה"}`} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-gray-50 rounded-xl p-3 text-center"><div className="text-xs text-slate-500 mb-1">סה"כ (כולל מע"מ)</div><div className="font-bold text-slate-800">₪{expense.amountInclVat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center"><div className="text-xs text-slate-500 mb-1">שולם</div><div className="font-bold text-emerald-700">₪{paid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
        <div className="bg-amber-50 rounded-xl p-3 text-center"><div className="text-xs text-slate-500 mb-1">יתרה</div><div className="font-bold text-amber-700">₪{balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
      </div>
      <div className="mb-4">
        <div className="text-sm font-medium text-slate-600 mb-2">היסטוריית תשלומים</div>
        {payments.length === 0 && <div className="text-sm text-slate-400 text-center py-3">עדיין לא נרשמו תשלומים</div>}
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
            <div>
              <div className="font-medium text-slate-800">₪{p.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {p.method && `· ${PAYMENT_METHODS[p.method] || p.method}`}</div>
              <div className="text-xs text-slate-500">{new Date(p.paidDate).toLocaleDateString("he-IL")} {p.note && `· ${p.note}`}</div>
            </div>
            <button onClick={() => removePayment(p.id)} className="text-gray-400 hover:text-rose-600"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="border-t pt-3">
        <div className="text-sm font-bold text-slate-700 mb-2">רישום תשלום חדש</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="סכום (₪)"><input type="number" min="0" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="תאריך תשלום"><input type="date" className={inputCls} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></Field>
        </div>
        <Field label="אמצעי תשלום">
          <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="הערה"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
        <button onClick={addPayment} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}רישום תשלום</button>
      </div>
    </Modal>
  );
}

function ExpensesScreen({ data, refresh, isAdmin }) {
  const [modalExpense, setModalExpense] = useState(null); // {} for new, object for edit, null for closed
  const [paymentsFor, setPaymentsFor] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [exportBusy, setExportBusy] = useState(false);

  const today = ymd(new Date());
  const [dateFrom, setDateFrom] = useState(startOfMonth(shiftMonths(today, -5)));
  const [dateTo, setDateTo] = useState(endOfMonth(today));
  const shiftWindow = (delta) => { setDateFrom(shiftMonths(dateFrom, delta)); setDateTo(shiftMonths(dateTo, delta)); };
  const applyPreset = (months) => { setDateFrom(startOfMonth(shiftMonths(today, -(months - 1)))); setDateTo(endOfMonth(today)); };
  const rangeLabel = `${new Date(dateFrom).toLocaleDateString("he-IL", { year: "numeric", month: "short" })} — ${new Date(dateTo).toLocaleDateString("he-IL", { year: "numeric", month: "short" })}`;

  const rows = data.expenses.filter((e) =>
    (categoryFilter === "all" || e.category === categoryFilter) &&
    e.expenseDate >= dateFrom && e.expenseDate <= dateTo
  );
  const removeExpense = async (id) => {
    if (!confirm("למחוק את ההוצאה/החשבונית וכל היסטוריית התשלומים שלה?")) return;
    try { await api.deleteExpense(id); await refresh(); } catch (e) { alert(e.message); }
  };

  const exportToExcel = async () => {
    setExportBusy(true);
    try {
      const XLSX = await import("https://esm.sh/xlsx@0.18.5");
      const sheetData = rows.map((e) => {
        const supplier = data.suppliers.find((s) => s.id === e.supplierId);
        const paid = (data.expensePayments || []).filter((p) => p.expenseId === e.id).reduce((s, p) => s + p.amount, 0);
        return {
          "תאריך": e.expenseDate, "קטגוריה": EXPENSE_CATEGORIES[e.category], "ספק": supplier?.name || "",
          "מספר חשבונית": e.invoiceNumber, "תיאור": e.description,
          "סכום לפני מע\"מ": e.amountExclVat, "מע\"מ": e.vatAmount, "סה\"כ כולל מע\"מ": e.amountInclVat,
          "סטטוס תשלום": EXPENSE_PAYMENT_STATUSES[e.paymentStatus]?.label, "שולם בפועל": paid,
          "אמצעי תשלום": e.paymentMethod ? PAYMENT_METHODS[e.paymentMethod] : "",
        };
      });
      const ws = XLSX.utils.json_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "הוצאות");
      XLSX.writeFile(wb, `הוצאות-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      alert("ייצוא האקסל נכשל - ודאו שיש חיבור אינטרנט תקין (הספרייה נטענת מרשת) ונסו שוב.");
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-bold text-xl text-slate-800">הוצאות וחשבוניות ספקים</h2>
        <div className="flex items-center gap-2">
          <button onClick={exportToExcel} disabled={exportBusy} className={btnGhost + " flex items-center gap-1.5 !py-2"}>{exportBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} ייצוא לאקסל</button>
          {isAdmin && <button onClick={() => setModalExpense({})} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> הוצאה חדשה</button>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftWindow(-1)} className={btnGhost + " !p-2"} title="חודש אחורה"><ChevronLeft size={16} className="rotate-180" /></button>
            <span className="font-bold text-slate-700 text-sm min-w-[140px] text-center">{rangeLabel}</span>
            <button onClick={() => shiftWindow(1)} className={btnGhost + " !p-2"} title="חודש קדימה"><ChevronLeft size={16} /></button>
          </div>
          <div className="flex items-center gap-1.5">
            {[3, 6, 12].map((n) => (
              <button key={n} onClick={() => applyPreset(n)} className="text-xs rounded-lg px-2.5 py-1.5 border border-gray-300 text-slate-600 hover:bg-gray-50">{n} חודשים אחרונים</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Field label="מתאריך"><input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
          <Field label="עד תאריך"><input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
        </div>
        <select className={inputCls + " w-auto"} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">כל הקטגוריות</option>
          {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-5 py-3 font-medium">תאריך</th><th className="px-5 py-3 font-medium">קטגוריה</th>
              <th className="px-5 py-3 font-medium">ספק</th><th className="px-5 py-3 font-medium">חשבונית</th>
              <th className="px-5 py-3 font-medium">לפני מע"מ</th><th className="px-5 py-3 font-medium">מע"מ</th>
              <th className="px-5 py-3 font-medium">סה"כ</th><th className="px-5 py-3 font-medium">תשלום</th><th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const supplier = data.suppliers.find((s) => s.id === e.supplierId);
              return (
                <tr key={e.id} className="border-t">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{new Date(e.expenseDate).toLocaleDateString("he-IL")}</td>
                  <td className="px-5 py-3">{EXPENSE_CATEGORIES[e.category]}</td>
                  <td className="px-5 py-3 text-slate-500">{supplier?.name || "-"}</td>
                  <td className="px-5 py-3 text-slate-500">{e.invoiceNumber || "-"}</td>
                  <td className="px-5 py-3">₪{e.amountExclVat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3 text-slate-500">₪{e.vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3 font-bold">₪{e.amountInclVat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3"><Badge tone={EXPENSE_PAYMENT_STATUSES[e.paymentStatus]?.tone}>{EXPENSE_PAYMENT_STATUSES[e.paymentStatus]?.label}</Badge></td>
                  <td className="px-5 py-3 text-left">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setPaymentsFor(e)} className="text-emerald-600 hover:underline text-xs font-medium">תשלומים</button>
                      {isAdmin && <button onClick={() => setModalExpense(e)} className="text-gray-400 hover:text-amber-600"><Pencil size={14} /></button>}
                      {isAdmin && <button onClick={() => removeExpense(e.id)} className="text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-400">אין עדיין הוצאות רשומות</td></tr>}
          </tbody>
        </table>
      </div>

      {modalExpense && <ExpenseModal data={data} existing={modalExpense.id ? modalExpense : null} onClose={() => setModalExpense(null)} refresh={refresh} />}
      {paymentsFor && <ExpensePaymentsModal data={data} expense={paymentsFor} onClose={() => setPaymentsFor(null)} refresh={refresh} />}
    </div>
  );
}

// ==================== הזמנות רכש (Purchase Orders) ====================
function POsScreen({ data, refresh, onPrint }) {
  const [open, setOpen] = useState(false);
  const [editingPOId, setEditingPOId] = useState(null);
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState("draft");
  const [shipmentId, setShipmentId] = useState("");
  const [shippingTerms, setShippingTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("prepaid_100");
  const [depositPercent, setDepositPercent] = useState("30");
  const [netDays, setNetDays] = useState("60");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState([{ id: Math.random().toString(36).slice(2), itemId: "", qty: "", unitPrice: "" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState(null);
  const [paymentsPO, setPaymentsPO] = useState(null);
  const [newItemForLineId, setNewItemForLineId] = useState(null);
  const [newItemForm, setNewItemForm] = useState({ name: "", category: "device", unit: "יחידה" });
  const [newItemError, setNewItemError] = useState("");
  const [newItemBusy, setNewItemBusy] = useState(false);

  const selectedSupplier = data.suppliers.find((s) => s.id === supplierId);
  const currency = selectedSupplier?.currency || "USD";
  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency;
  // הרשימה עצמה (data.shipments) מגיעה כעת מטבלת shipments אמיתית

  const openNew = () => {
    setEditingPOId(null);
    setSupplierId(data.suppliers[0]?.id || "");
    setStatus("draft"); setShipmentId(""); setShippingTerms(""); setNotes("");
    setPaymentTerms("prepaid_100"); setDepositPercent("30"); setNetDays("60"); setDueDate("");
    setLines([{ id: Math.random().toString(36).slice(2), itemId: "", qty: "", unitPrice: "" }]);
    setError(""); setOpen(true);
  };
  const openEditPO = (po) => {
    setEditingPOId(po.id);
    setSupplierId(po.supplierId);
    setStatus(po.status); setShipmentId(po.shipmentId || ""); setShippingTerms(po.shippingTerms || ""); setNotes(po.notes || "");
    setPaymentTerms(po.paymentTerms || "prepaid_100");
    setDepositPercent(po.depositPercent != null ? String(po.depositPercent) : "30");
    setNetDays(po.netDays != null ? String(po.netDays) : "60");
    setDueDate(po.dueDate || "");
    setLines(
      po.lines.length > 0
        ? po.lines.map((l) => ({ id: Math.random().toString(36).slice(2), itemId: l.itemId, qty: String(l.qty), unitPrice: String(l.unitPrice) }))
        : [{ id: Math.random().toString(36).slice(2), itemId: "", qty: "", unitPrice: "" }]
    );
    setError(""); setOpen(true);
  };
  const setLine = (id, patch) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines([...lines, { id: Math.random().toString(36).slice(2), itemId: "", qty: "", unitPrice: "" }]);
  const removeLine = (id) => setLines(lines.filter((l) => l.id !== id));
  const onPickItem = (id, itemId) => { const it = data.items.find((i) => i.id === itemId); setLine(id, { itemId, unitPrice: it?.unitCost ? String(it.unitCost) : "" }); };
  const itemLabel = (it) => it.supplierSku ? `${it.name} (${it.supplierSku})` : it.name;

  const openNewItemFor = (lineId) => {
    setNewItemForLineId(lineId);
    setNewItemForm({ name: "", category: "device", unit: "" });
    setNewItemError("");
  };
  const submitNewItem = async () => {
    setNewItemError("");
    if (!newItemForm.name.trim()) { setNewItemError("שם הפריט הוא שדה חובה"); return; }
    const finalUnit = newItemForm.category === "consumable" ? newItemForm.unit.trim() : "יחידה";
    if (!finalUnit) { setNewItemError("יחידת מידה היא שדה חובה"); return; }
    setNewItemBusy(true);
    try {
      const newItemId = await api.addItem({ ...newItemForm, unit: finalUnit, minThreshold: 0 });
      setLine(newItemForLineId, { itemId: newItemId });
      await refresh();
      setNewItemForLineId(null);
    } catch (e) { setNewItemError(e.message); } finally { setNewItemBusy(false); }
  };

  const lineTotal = (l) => (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
  const orderTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  const applyNetDaysToDueDate = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + (Number(days) || 0));
    setDueDate(d.toISOString().slice(0, 10));
  };

  const submit = async () => {
    setError("");
    const valid = lines.filter((l) => l.itemId && Number(l.qty) > 0 && Number(l.unitPrice) >= 0);
    if (!supplierId) { setError("יש לבחור ספק"); return; }
    if (valid.length === 0) { setError("יש להוסיף לפחות שורת פריט אחת"); return; }
    if (paymentTerms === "deposit_balance" && (!depositPercent || Number(depositPercent) <= 0 || Number(depositPercent) >= 100)) { setError("יש להזין אחוז מקדמה תקין (בין 1 ל-99)"); return; }
    if (paymentTerms === "net_x" && (!netDays || Number(netDays) <= 0)) { setError("יש להזין מספר ימי שוטף תקין"); return; }
    setBusy(true);
    try {
      const linesPayload = valid.map((l) => ({ itemId: l.itemId, qty: Number(l.qty), unitPrice: Number(l.unitPrice) }));
      const extra = { status, currency, shippingTerms, notes, shipmentId, paymentTerms, depositPercent, netDays, dueDate };
      if (editingPOId) {
        await api.updatePurchaseOrder(editingPOId, supplierId, linesPayload, extra);
        await refresh();
        setOpen(false);
        onPrint(editingPOId);
      } else {
        const poId = await api.createPurchaseOrder(supplierId, linesPayload, extra);
        await refresh();
        setOpen(false);
        onPrint(poId);
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const changeStatus = async (poId, newStatus) => {
    setStatusBusyId(poId);
    try { await api.updatePOStatus(poId, newStatus); await refresh(); }
    catch (e) { alert(e.message); } finally { setStatusBusyId(null); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4"><h2 className="font-bold text-xl text-slate-800">הזמנות רכש (Purchase Orders)</h2><button onClick={openNew} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><Plus size={18} /> PO חדש</button></div>
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-5 py-3 font-medium">מס' הזמנה</th><th className="px-5 py-3 font-medium">מכולה/משלוח</th><th className="px-5 py-3 font-medium">ספק</th><th className="px-5 py-3 font-medium">סה"כ</th><th className="px-5 py-3 font-medium">שולם</th><th className="px-5 py-3 font-medium">יתרה</th><th className="px-5 py-3 font-medium">תנאי תשלום</th><th className="px-5 py-3 font-medium">סטטוס</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {data.purchaseOrders.map((po) => {
              const supplier = data.suppliers.find((s) => s.id === po.supplierId);
              const shipment = data.shipments.find((s) => s.id === po.shipmentId);
              const sym = CURRENCY_SYMBOLS[po.currency] || po.currency;
              const total = poTotalAmount(po);
              const paid = poPaidAmount(data, po.id);
              const balance = total - paid;
              const isOverdue = po.dueDate && balance > 0.01 && new Date(po.dueDate) < new Date(new Date().toDateString());
              return (
                <tr key={po.id} className="border-t">
                  <td className="px-5 py-3 font-medium text-slate-800 whitespace-nowrap">{po.poNumber}</td>
                  <td className="px-5 py-3">{shipment ? <Badge tone="violet">{shipment.name}</Badge> : <span className="text-slate-300">-</span>}</td>
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{supplier?.name} {supplier?.country ? `(${supplier.country})` : ""}</td>
                  <td className="px-5 py-3 font-bold whitespace-nowrap">{sym}{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3 text-emerald-700 whitespace-nowrap">{sym}{paid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className={`px-5 py-3 font-medium whitespace-nowrap ${balance > 0.01 ? (isOverdue ? "text-rose-600" : "text-amber-600") : "text-slate-300"}`}>
                    {sym}{balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    {isOverdue && <span className="block text-xs">פג תוקף!</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                    {PAYMENT_TERMS[po.paymentTerms]?.label}
                    {po.paymentTerms === "deposit_balance" && po.depositPercent ? ` (${po.depositPercent}%)` : ""}
                    {po.paymentTerms === "net_x" && po.netDays ? ` (${po.netDays} ימים)` : ""}
                    {po.dueDate && (
                      <div className="flex items-center gap-1.5 text-xs mt-0.5">
                        <span>יעד: {new Date(po.dueDate).toLocaleDateString("he-IL")}</span>
                        {balance > 0.01 && (
                          <AddToGoogleCalendarButton
                            title={`תשלום לספק: ${supplier?.name || ""} - ${po.poNumber}`}
                            description={`יתרה לתשלום: ${sym}${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} | הזמנה: ${po.poNumber}`}
                            date={po.dueDate}
                            label=""
                          />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <select
                      className="text-xs rounded-lg border border-gray-300 px-2 py-1 bg-white"
                      value={po.status}
                      disabled={statusBusyId === po.id}
                      onChange={(e) => changeStatus(po.id, e.target.value)}
                    >
                      {Object.entries(PO_STATUSES).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-left">
                    <div className="flex items-center gap-3 justify-end whitespace-nowrap">
                      <button onClick={() => setPaymentsPO(po)} className="text-emerald-600 hover:underline font-medium flex items-center gap-1"><Database size={14} /> תשלומים</button>
                      <button onClick={() => openEditPO(po)} className="text-slate-500 hover:text-amber-600 font-medium flex items-center gap-1"><Pencil size={14} /> עריכה</button>
                      <button onClick={() => onPrint(po.id)} className="text-amber-600 hover:underline font-medium flex items-center gap-1"><Printer size={14} /> צפייה/הדפסה</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.purchaseOrders.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">עדיין לא נוצרו הזמנות רכש</td></tr>}
          </tbody>
        </table>
      </div>
      {open && (
        <Modal title={editingPOId ? "עריכת הזמנת רכש" : "הזמנת רכש חדשה"} onClose={() => setOpen(false)}>
          <Field label="ספק">
            <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">בחר ספק...</option>
              {data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} {s.country ? `(${s.country})` : ""} - {s.currency}</option>)}
            </select>
          </Field>
          <Field label="סטטוס הזמנה">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(PO_STATUSES).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
            </select>
          </Field>
          <Field label="משלוח / מכולה (לא חובה)">
            <select className={inputCls} value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
              <option value="">ללא שיוך למשלוח</option>
              {data.shipments.map((s) => <option key={s.id} value={s.id}>{s.name} - {SHIPMENT_STATUSES[s.status]?.label}</option>)}
            </select>
            <div className="text-xs text-slate-400 mt-1">הזמנות מכל הספקים שמשויכות לאותו משלוח ייטענו יחד במחשבון היבוא ועלויות הנחיתה.</div>
          </Field>
          <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-slate-600">פריטים (מחירים ב-{currencySymbol}{currency})</span><button onClick={addLine} className={btnGhost + " !py-1 !px-2.5 text-xs"}><Plus size={14} className="inline" /> שורה</button></div>
          <div className="space-y-2 mb-2">
            {lines.map((l) => (
              <div key={l.id} className="grid grid-cols-6 gap-1.5 items-center">
                <div className="col-span-3 flex gap-1">
                  <select className={inputCls + " !py-2 text-sm"} value={l.itemId} onChange={(e) => onPickItem(l.id, e.target.value)}>
                    <option value="">פריט...</option>
                    {data.items.map((it) => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}
                  </select>
                  <button type="button" onClick={() => openNewItemFor(l.id)} className="shrink-0 rounded-xl border border-dashed border-amber-400 text-amber-600 hover:bg-amber-50 px-2.5" title="הוספת פריט חדש למאגר"><Plus size={16} /></button>
                </div>
                <input type="number" min="1" placeholder="כמות" className={inputCls + " col-span-1 !py-2 text-sm"} value={l.qty} onChange={(e) => setLine(l.id, { qty: e.target.value })} />
                <input type="number" min="0" step="0.01" placeholder={`מחיר (${currencySymbol})`} className={inputCls + " col-span-1 !py-2 text-sm"} value={l.unitPrice} onChange={(e) => setLine(l.id, { unitPrice: e.target.value })} />
                {lines.length > 1 && <button onClick={() => removeLine(l.id)} className="text-gray-400 hover:text-rose-600 justify-self-center"><Trash2 size={15} /></button>}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mb-2">לא מוצאים את הפריט ברשימה? לחצו על <Plus size={11} className="inline" /> ליצירת פריט חדש ישירות מכאן - הוא יישמר במאגר הפריטים הכללי ויתמלא אוטומטית בשורה.</p>
          <div className="flex items-center justify-between text-sm mb-4 px-1">
            <span className="text-slate-500">סה"כ הזמנה</span>
            <span className="font-bold text-slate-800">{currencySymbol}{orderTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>

          <div className="border-t pt-3 mb-1"><span className="text-sm font-bold text-slate-700">תנאי תשלום</span></div>
          <Field label="סוג תנאי תשלום">
            <select className={inputCls} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
              {Object.entries(PAYMENT_TERMS).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
            </select>
          </Field>
          {paymentTerms === "deposit_balance" && (
            <Field label="אחוז מקדמה חובה (%)">
              <input type="number" min="1" max="99" className={inputCls} value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
              {orderTotal > 0 && depositPercent && (
                <div className="text-xs text-slate-400 mt-1">מקדמה: {currencySymbol}{(orderTotal * Number(depositPercent) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} · יתרה: {currencySymbol}{(orderTotal * (1 - Number(depositPercent) / 100)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              )}
            </Field>
          )}
          {paymentTerms === "net_x" && (
            <Field label="שוטף + כמה ימים">
              <div className="flex gap-2">
                <input type="number" min="1" className={inputCls} value={netDays} onChange={(e) => setNetDays(e.target.value)} />
                <button type="button" onClick={() => applyNetDaysToDueDate(netDays)} className={btnGhost + " !py-2 !px-3 text-sm whitespace-nowrap"}>חשב תאריך יעד</button>
              </div>
            </Field>
          )}
          <Field label="תאריך יעד לתשלום (לא חובה)"><input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>

          <Field label="תנאי משלוח"><input className={inputCls} value={shippingTerms} onChange={(e) => setShippingTerms(e.target.value)} placeholder="לדוגמה: FOB Shanghai, 45 ימי אספקה" /></Field>
          <Field label="הערות"><textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
          <button onClick={submit} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}{editingPOId ? "שמירת שינויים" : "יצירת הזמנה והפקת מסמך"}</button>
        </Modal>
      )}
      {paymentsPO && <POPaymentsModal data={data} po={paymentsPO} refresh={refresh} onClose={() => setPaymentsPO(null)} />}
      {newItemForLineId && (
        <Modal title="פריט חדש למאגר" onClose={() => setNewItemForLineId(null)}>
          <Field label="שם פריט"><input className={inputCls} value={newItemForm.name} onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })} autoFocus /></Field>
          <Field label="קטגוריה">
            <select
              className={inputCls}
              value={newItemForm.category}
              onChange={(e) => {
                const category = e.target.value;
                const unit = category === "consumable" ? (PACKAGE_SIZES.includes(newItemForm.unit) ? newItemForm.unit : PACKAGE_SIZES[2]) : "יחידה";
                setNewItemForm({ ...newItemForm, category, unit });
              }}
            >
              <option value="device">מכשירים</option><option value="consumable">נוזלים ומתכלים</option>
            </select>
          </Field>
          {newItemForm.category === "consumable" ? (
            <Field label="גודל אריזה / נפח">
              <select className={inputCls} value={newItemForm.unit} onChange={(e) => setNewItemForm({ ...newItemForm, unit: e.target.value })}>
                <option value="">בחר גודל...</option>
                {PACKAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="יחידת מידה"><input className={inputCls + " bg-gray-100 text-slate-500"} value="יחידה" disabled readOnly /></Field>
          )}
          {newItemError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{newItemError}</div>}
          <button onClick={submitNewItem} disabled={newItemBusy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{newItemBusy && <Loader2 size={16} className="animate-spin" />}יצירה והוספה להזמנה</button>
        </Modal>
      )}
    </div>
  );
}

function POPaymentsModal({ data, po, refresh, onClose }) {
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sym = CURRENCY_SYMBOLS[po.currency] || po.currency;
  const total = poTotalAmount(po);
  const payments = (data.poPayments || []).filter((p) => p.poId === po.id).sort((a, b) => new Date(b.paidDate) - new Date(a.paidDate));
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = total - paid;
  const depositAmount = po.paymentTerms === "deposit_balance" && po.depositPercent ? total * po.depositPercent / 100 : null;

  const addPayment = async () => {
    setError("");
    if (!amount || Number(amount) <= 0) { setError("יש להזין סכום תקין"); return; }
    setBusy(true);
    try {
      await api.addPOPayment(po.id, Number(amount), paidDate, note);
      await refresh();
      setAmount(""); setNote("");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const removePayment = async (id) => {
    if (!confirm("למחוק את רישום התשלום?")) return;
    try { await api.deletePOPayment(id); await refresh(); } catch (e) { alert(e.message); }
  };

  return (
    <Modal title={`תשלומים - ${po.poNumber}`} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-gray-50 rounded-xl p-3 text-center"><div className="text-xs text-slate-500 mb-1">סה"כ הזמנה</div><div className="font-bold text-slate-800">{sym}{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center"><div className="text-xs text-slate-500 mb-1">שולם</div><div className="font-bold text-emerald-700">{sym}{paid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
        <div className="bg-amber-50 rounded-xl p-3 text-center"><div className="text-xs text-slate-500 mb-1">יתרה</div><div className="font-bold text-amber-700">{sym}{balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
      </div>
      {depositAmount != null && (
        <div className="text-xs text-slate-500 mb-4 bg-sky-50 rounded-xl p-2.5">תנאי תשלום: מקדמה {po.depositPercent}% ({sym}{depositAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}) + יתרה {sym}{(total - depositAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
      )}

      <div className="mb-4">
        <div className="text-sm font-medium text-slate-600 mb-2">היסטוריית תשלומים</div>
        {payments.length === 0 && <div className="text-sm text-slate-400 text-center py-3">עדיין לא נרשמו תשלומים</div>}
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
            <div>
              <div className="font-medium text-slate-800">{sym}{p.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              <div className="text-xs text-slate-500">{new Date(p.paidDate).toLocaleDateString("he-IL")} {p.note && `· ${p.note}`}</div>
            </div>
            <button onClick={() => removePayment(p.id)} className="text-gray-400 hover:text-rose-600"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>

      <div className="border-t pt-3">
        <div className="text-sm font-bold text-slate-700 mb-2">רישום תשלום חדש</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label={`סכום (${sym})`}><input type="number" min="0" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="תאריך תשלום"><input type="date" className={inputCls} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></Field>
        </div>
        <Field label="הערה (לדוגמה: מקדמה 30%, יתרה)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{error}</div>}
        <button onClick={addPayment} disabled={busy} className={btnPrimary + " w-full flex items-center justify-center gap-2"}>{busy && <Loader2 size={16} className="animate-spin" />}רישום תשלום</button>
      </div>
    </Modal>
  );
}

const PO_STATUS_EN = { draft: "Draft", in_production: "In Production", in_transit: "In Transit", received: "Received" };

function POPrintView({ data, poId, onClose }) {
  const po = data.purchaseOrders.find((p) => p.id === poId);
  if (!po) return null;
  const supplier = data.suppliers.find((s) => s.id === po.supplierId);
  const sym = CURRENCY_SYMBOLS[po.currency] || po.currency;
  const lineRows = po.lines.map((l) => { const item = data.items.find((i) => i.id === l.itemId); return { ...l, name: item?.name || "-", sku: item?.supplierSku || "", unit: item?.unit || "", lineTotal: l.qty * l.unitPrice }; });
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
            <div className="text-left">
              <div className="text-xl font-bold text-amber-600">PURCHASE ORDER</div>
              <div className="text-sm text-slate-600 mt-1">PO #: {po.poNumber}</div>
              <div className="text-sm text-slate-600">Date: {new Date(po.date).toLocaleDateString("en-GB")}</div>
              <div className="text-sm text-slate-600">Status: {PO_STATUS_EN[po.status] || po.status}</div>
              <div className="text-sm text-slate-600">Currency: {po.currency}</div>
            </div>
          </div>
          <div className="mb-6 bg-gray-50 rounded-xl p-4">
            <div className="text-xs uppercase text-slate-400 font-bold mb-1">Supplier</div>
            <div className="font-bold text-slate-800">{supplier?.name}</div>
            <div className="text-sm text-slate-600">{supplier?.country}</div>
            <div className="text-sm text-slate-600">Attn: {supplier?.contact}</div>
            <div className="text-sm text-slate-600">{supplier?.phone} · {supplier?.email}</div>
          </div>
          <table className="w-full text-sm mb-6 border-collapse">
            <thead><tr className="border-b-2 border-slate-800 text-left"><th className="py-2 font-bold">SKU</th><th className="py-2 font-bold">Item</th><th className="py-2 font-bold">Qty</th><th className="py-2 font-bold">Unit Price</th><th className="py-2 font-bold text-right">Line Total</th></tr></thead>
            <tbody>{lineRows.map((l, i) => (<tr key={i} className="border-b border-slate-200"><td className="py-2">{l.sku || "-"}</td><td className="py-2">{l.name}</td><td className="py-2">{l.qty} {l.unit}</td><td className="py-2">{sym}{l.unitPrice.toFixed(2)}</td><td className="py-2 text-right">{sym}{l.lineTotal.toFixed(2)}</td></tr>))}</tbody>
            <tfoot><tr><td colSpan={4} className="pt-3 text-right font-bold">Grand Total</td><td className="pt-3 text-right font-bold">{sym}{grandTotal.toFixed(2)}</td></tr></tfoot>
          </table>
          {po.shippingTerms && (
            <div className="mb-4"><div className="text-xs uppercase text-slate-400 font-bold mb-1">Shipping Terms</div><div className="text-sm text-slate-700">{po.shippingTerms}</div></div>
          )}
          {po.notes && (
            <div className="mb-4"><div className="text-xs uppercase text-slate-400 font-bold mb-1">Notes</div><div className="text-sm text-slate-700">{po.notes}</div></div>
          )}
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

  // ---------- אימות דו-שלבי (2FA) ----------
  const [mfaFactors, setMfaFactors] = useState(null); // null = טוען, [] = אין, [factor] = פעיל
  const [mfaEnrollData, setMfaEnrollData] = useState(null); // { id, totp: { qr_code, secret } } בזמן הרשמה
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  const loadMfaFactors = async () => {
    try { const result = await api.mfaListFactors(); setMfaFactors(result.totp || []); }
    catch (e) { setMfaFactors([]); }
  };
  useEffect(() => { loadMfaFactors(); }, []);

  const startMfaEnroll = async () => {
    setMfaError(""); setMfaBusy(true);
    try { const result = await api.mfaEnroll(); setMfaEnrollData(result); }
    catch (e) { setMfaError(e.message); } finally { setMfaBusy(false); }
  };
  const confirmMfaEnroll = async () => {
    setMfaError("");
    if (mfaCode.trim().length !== 6) { setMfaError("יש להזין קוד בן 6 ספרות"); return; }
    setMfaBusy(true);
    try {
      await api.mfaChallengeAndVerify(mfaEnrollData.id, mfaCode.trim());
      setMfaEnrollData(null); setMfaCode("");
      await loadMfaFactors();
    } catch (e) { setMfaError("קוד שגוי - ודאו שהזנתם את הקוד הנוכחי מהאפליקציה ונסו שוב."); } finally { setMfaBusy(false); }
  };
  const cancelMfaEnroll = () => { setMfaEnrollData(null); setMfaCode(""); setMfaError(""); };
  const disableMfa = async (factorId) => {
    if (!confirm("לבטל את האימות הדו-שלבי? החשבון יהיה מוגן רק בסיסמה.")) return;
    setMfaBusy(true);
    try { await api.mfaUnenroll(factorId); await loadMfaFactors(); }
    catch (e) { alert(e.message); } finally { setMfaBusy(false); }
  };

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
        <div className="bg-white rounded-2xl border shadow-sm p-5">
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

      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><User size={18} /> ניהול פרופיל</h3>
        <p className="text-slate-500 text-sm mb-4">כתובת הדוא"ל להתחברות.</p>
        <Field label='כתובת דוא"ל להתחברות'><input type="email" className={inputCls} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></Field>
        {profileError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{profileError}</div>}
        {profileSaved && <div className="bg-emerald-100 text-emerald-700 text-sm rounded-xl px-3 py-2 mb-3">נשלח קישור אישור לדוא"ל. השינוי ייכנס לתוקף לאחר האישור.</div>}
        <button onClick={saveProfile} disabled={profileBusy} className={btnPrimary + " flex items-center gap-2"}>{profileBusy && <Loader2 size={16} className="animate-spin" />}שמירת פרופיל</button>
      </div>

      {isAdmin && (
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><Building2 size={18} /> פרטי העסק</h3>
          <p className="text-slate-500 text-sm mb-4">מוצג בכותרת המערכת ובמסמכי PO.</p>
          <Field label="שם החברה (עברית)"><input className={inputCls} value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></Field>
          <Field label="שם משפטי (אנגלית)"><input className={inputCls} value={company.legalName} onChange={(e) => setCompany({ ...company, legalName: e.target.value })} /></Field>
          <Field label="כתובת"><input className={inputCls} value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} /></Field>
          <Field label="טלפון"><input className={inputCls} value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label='אחוז מע"מ נוכחי'><input type="number" min="0" step="0.1" className={inputCls} value={company.vatRate ?? 18} onChange={(e) => setCompany({ ...company, vatRate: Number(e.target.value) })} /></Field>
            <Field label="אחוז מקדמת מס הכנסה"><input type="number" min="0" step="0.1" className={inputCls} value={company.taxAdvanceRate ?? 0} onChange={(e) => setCompany({ ...company, taxAdvanceRate: Number(e.target.value) })} /></Field>
          </div>
          <p className="text-xs text-slate-400 -mt-2 mb-3">שני האחוזים האלה משמשים את מנוע חישוב המע"מ בכל המערכת (הזמנות, הוצאות) ואת דוח "מע"מ ומקדמות".</p>
          {companySaved && <div className="bg-emerald-100 text-emerald-700 text-sm rounded-xl px-3 py-2 mb-3">פרטי העסק עודכנו</div>}
          <button onClick={saveCompany} disabled={companyBusy} className={btnPrimary + " flex items-center gap-2"}>{companyBusy && <Loader2 size={16} className="animate-spin" />}שמירת פרטי עסק</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><KeyRound size={18} /> אבטחה - שינוי סיסמה</h3>
        <p className="text-slate-500 text-sm mb-4">יש להזין את הסיסמה הנוכחית לאימות, ולאחר מכן את הסיסמה החדשה פעמיים.</p>
        <Field label="סיסמה נוכחית"><input type="password" className={inputCls} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} /></Field>
        <Field label="סיסמה חדשה"><input type="password" className={inputCls} value={newPw} onChange={(e) => setNewPw(e.target.value)} /></Field>
        <Field label="אימות סיסמה חדשה"><input type="password" className={inputCls} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></Field>
        {pwError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{pwError}</div>}
        {pwSaved && <div className="bg-emerald-100 text-emerald-700 text-sm rounded-xl px-3 py-2 mb-3 flex items-center gap-2"><CircleCheck size={16} /> הסיסמה עודכנה בהצלחה</div>}
        <button onClick={changePassword} disabled={pwBusy} className={btnPrimary + " flex items-center gap-2"}>{pwBusy && <Loader2 size={16} className="animate-spin" />}עדכון סיסמה</button>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><KeyRound size={18} /> אימות דו-שלבי (2FA)</h3>
        <p className="text-slate-500 text-sm mb-4">שכבת הגנה נוספת מעבר לסיסמה, דרך אפליקציית Authenticator (Google Authenticator, Microsoft Authenticator וכדומה).</p>

        {mfaFactors === null && <div className="text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> בודק סטטוס...</div>}

        {mfaFactors && mfaFactors.length > 0 && !mfaEnrollData && (
          <div>
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-xl px-3 py-2.5 mb-3 text-sm font-medium">
              <CircleCheck size={16} /> אימות דו-שלבי פעיל על החשבון שלכם
            </div>
            <button onClick={() => disableMfa(mfaFactors[0].id)} disabled={mfaBusy} className={btnGhost + " flex items-center gap-2 text-rose-600"}>
              {mfaBusy && <Loader2 size={16} className="animate-spin" />} ביטול אימות דו-שלבי
            </button>
          </div>
        )}

        {mfaFactors && mfaFactors.length === 0 && !mfaEnrollData && (
          <div>
            <div className="flex items-center gap-2 bg-amber-50 text-amber-700 rounded-xl px-3 py-2.5 mb-3 text-sm font-medium">
              <TriangleAlert size={16} /> אימות דו-שלבי אינו מופעל
            </div>
            <button onClick={startMfaEnroll} disabled={mfaBusy} className={btnPrimary + " flex items-center gap-2"}>
              {mfaBusy && <Loader2 size={16} className="animate-spin" />} הפעלת אימות דו-שלבי
            </button>
          </div>
        )}

        {mfaEnrollData && (
          <div>
            <p className="text-sm text-slate-600 mb-3">1. סרקו את הקוד עם אפליקציית ה-Authenticator, או הזינו את המפתח הסודי ידנית:</p>
            <div className="flex justify-center bg-gray-50 rounded-xl p-4 mb-3">
              <img src={mfaEnrollData.totp.qr_code} alt="QR Code" className="w-44 h-44" />
            </div>
            <div className="bg-gray-50 rounded-xl px-3 py-2 mb-4 text-center">
              <div className="text-xs text-slate-400 mb-1">מפתח סודי להזנה ידנית</div>
              <div className="font-mono text-sm text-slate-700 break-all">{mfaEnrollData.totp.secret}</div>
            </div>
            <p className="text-sm text-slate-600 mb-2">2. הזינו את הקוד בן 6 הספרות שמופיע כרגע באפליקציה:</p>
            <Field label="קוד אימות">
              <input
                type="text" inputMode="numeric" maxLength={6}
                className={inputCls + " text-center text-2xl tracking-[0.5em] font-bold"}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </Field>
            {mfaError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-3">{mfaError}</div>}
            <div className="flex gap-2">
              <button onClick={confirmMfaEnroll} disabled={mfaBusy || mfaCode.length !== 6} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}>
                {mfaBusy && <Loader2 size={16} className="animate-spin" />} אימות והפעלה
              </button>
              <button onClick={cancelMfaEnroll} className={btnGhost}>ביטול</button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-5">
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
  { key: "transaction", label: "תנועת מלאי", icon: ArrowLeftRight, adminOnly: true },
  { key: "sale", label: "מכירה / הזמנה חדשה", icon: ShoppingCart, adminOnly: true },
  { key: "items", label: "פריטים", icon: Package, adminOnly: true },
  { key: "locations", label: "מיקומים", icon: Warehouse, adminOnly: true },
  { key: "customers", label: "לקוחות", icon: Users },
  { key: "leads", label: "לידים (CRM)", icon: TrendingUp, adminOnly: true },
  { key: "quotes", label: "הצעות מחיר", icon: FileText, adminOnly: true },
  { key: "suppliers", label: "ספקים", icon: Building2, adminOnly: true },
  { key: "shipments", label: "משלוחים / מכולות", icon: Ship, adminOnly: true },
  { key: "shippingRates", label: "מחירוני שילוח", icon: Database, adminOnly: true },
  { key: "landedCost", label: "מחשבון יבוא ועליות נחיתה", icon: Calculator, adminOnly: true },
  { key: "reports", label: "דוחות וערך מלאי", icon: BarChart3 },
  { key: "po", label: "הזמנות רכש PO", icon: FileText, adminOnly: true },
  { key: "expenses", label: "הוצאות וחשבוניות", icon: Calculator },
  { key: "log", label: "יומן אירועים", icon: ScrollText },
  { key: "settings", label: "הגדרות", icon: Settings },
];
const MOBILE_NAV = ["dashboard", "transaction", "customers", "log"];

// ==================== App ====================
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = not logged in yet
  const [publicLogoUrl, setPublicLogoUrl] = useState(null);
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState(null);
  const [dataError, setDataError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [customerFileId, setCustomerFileId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickTx, setQuickTx] = useState(null);
  const [printPOId, setPrintPOId] = useState(null);
  const [quoteBuilderFor, setQuoteBuilderFor] = useState(null); // { customerId, leadId }
  const [saleInitialCustomerId, setSaleInitialCustomerId] = useState(null);
  const [printQuoteId, setPrintQuoteId] = useState(null);
  const [mfaPendingFactorId, setMfaPendingFactorId] = useState(null); // אם קיים, יש session אמיתי אבל הוא עדיין ב-aal1 וצריך קוד 2FA

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

  // מסך התחברות אמיתי: בודקים אם כבר יש session פעיל (למשל רענון עמוד),
  // אחרת מציגים את LoginScreen ומחכים שהמשתמש יזין דוא"ל וסיסמה בעצמו.
  // אם יש session קיים שעדיין לא עבר את שלב ה-2FA (aal1 בלבד, לא aal2) -
  // מציגים ישירות את שלב הזנת הקוד, בלי לבקש דוא"ל+סיסמה שוב.
  useEffect(() => {
    (async () => {
      try {
        const existing = await api.getSession();
        if (!existing) { setSession(null); return; }
        const aal = await api.mfaGetAssuranceLevel();
        if (aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
          const factors = await api.mfaListFactors();
          const totpFactor = factors.totp?.[0];
          if (totpFactor) { setMfaPendingFactorId(totpFactor.id); setSession(existing); return; }
        }
        setSession(existing);
      } catch (e) {
        setSession(null);
      }
    })();
    const unsubscribe = api.onAuthChange((s) => setSession(s));
    return unsubscribe;
  }, []);

  // הלוגו נטען בנפרד עוד לפני התחברות, כדי שיוצג במסך ה-Login עצמו
  // (מתאפשר בזכות מדיניות RLS ציבורית ייעודית על app_settings).
  useEffect(() => {
    (async () => {
      try {
        const logo = await api.fetchPublicLogo();
        setPublicLogoUrl(logo);
      } catch (e) {
        // לא קריטי - מסך ההתחברות פשוט יציג את התג הגנרי אם זה נכשל
      }
    })();
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

  const openQuoteBuilder = (customerId, leadId) => setQuoteBuilderFor({ customerId, leadId });

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
    return <LoginScreen onSuccess={(newSession) => setSession(newSession)} logoUrl={publicLogoUrl} />;
  }
  if (mfaPendingFactorId) {
    return (
      <div dir="rtl" lang="he" className="min-h-screen bg-slate-900 flex items-center justify-center p-4" style={{ fontFamily: "'Inter','Rubik','Assistant',sans-serif" }}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
          <MfaCodeStep
            factorId={mfaPendingFactorId}
            onVerified={() => setMfaPendingFactorId(null)}
            onCancel={() => { setMfaPendingFactorId(null); api.signOut(); setSession(null); }}
          />
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

  // isAdmin הוא המקור היחיד שקובע הרשאות בכל המערכת (תפריט + כל בדיקת isAdmin
  // בתוך המסכים). isViewer משמש אך ורק לתווית התצוגה למטה - לא לשום החלטת
  // הרשאה - כדי שלא ייווצר בעתיד גבול הרשאות כפול וסותר.
  const isAdmin = profile.role === "admin";
  const isViewer = profile.role === "viewer";
  const roleLabel = isAdmin ? "מנהל" : isViewer ? "צפייה בלבד" : "טכנאי";
  const nav = FULL_NAV.filter((n) => !n.adminOnly || isAdmin);
  const goTab = (key) => { setTab(key); setCustomerFileId(null); setMobileMenuOpen(false); };
  const handleSignOut = async () => { try { await api.signOut(); } catch (e) {} };

  return (
    <div dir="rtl" lang="he" className="min-h-screen bg-gray-50 text-slate-800" style={{ fontFamily: "'Inter','Rubik','Assistant',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .sidebar-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; }
        .sidebar-scroll:hover { scrollbar-color: rgba(255,255,255,0.25) transparent; }
        .sidebar-scroll::-webkit-scrollbar { width: 5px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 9999px; }
        .sidebar-scroll:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.25); }
        .mobile-nav-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; }
        .mobile-nav-scroll:hover { scrollbar-color: rgba(0,0,0,0.15) transparent; }
        .mobile-nav-scroll::-webkit-scrollbar { width: 5px; }
        .mobile-nav-scroll::-webkit-scrollbar-track { background: transparent; }
        .mobile-nav-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 9999px; }
        .mobile-nav-scroll:hover::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); }
      `}</style>
      <div className="flex">
        <aside className="hidden md:flex flex-col w-60 shrink-0 bg-slate-900 text-slate-200 min-h-screen p-4 sticky top-0 h-screen">
          <div className="flex items-center gap-2 px-2 py-3 mb-4 shrink-0">
            <LogoBadge logoUrl={data.logoUrl} size={36} editable={isAdmin} onChange={async (dataUrl) => { try { await api.updateLogoUrl(dataUrl); await refresh(); } catch (e) { alert(e.message); } }} />
            <div>
              <div className="font-bold text-white leading-tight">אדל אימפורט</div>
              <div className="text-xs text-slate-400">ניהול מלאי</div>
            </div>
          </div>
          <nav className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto sidebar-scroll">
            {nav.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => goTab(key)} className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-[15px] font-medium transition shrink-0 ${tab === key && !customerFileId ? "bg-amber-500 text-slate-900" : "text-slate-300 hover:bg-slate-800"}`}>
                <Icon size={18} /> {label}
              </button>
            ))}
          </nav>
          <div className="border-t border-slate-800 pt-3 px-2 shrink-0">
            <div className="text-sm text-slate-300 font-medium">{profile.fullName || session.user.email}</div>
            <div className="text-xs text-slate-500 mb-2">{roleLabel}</div>
            <button onClick={handleSignOut} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition"><LogOut size={14} /> התנתקות</button>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="md:hidden flex flex-row-reverse items-center justify-between bg-gradient-to-l from-slate-900 to-slate-800 text-white px-4 py-3.5 sticky top-0 z-30 shadow-md">
            <div className="flex items-center gap-2.5">
              <LogoBadge logoUrl={data.logoUrl} size={34} />
              <div className="leading-tight">
                <div className="font-bold text-[15px] tracking-tight">אדל אימפורט</div>
                <div className="text-[11px] text-slate-400 font-medium">ניהול מלאי</div>
              </div>
            </div>
            <button onClick={() => setMobileMenuOpen(true)} className="p-1.5 rounded-lg hover:bg-white/10 transition"><Menu size={22} /></button>
          </div>

          {mobileMenuOpen && (
            <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileMenuOpen(false)}>
              <div className="bg-white w-64 h-full p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setMobileMenuOpen(false)} className="mb-4 p-1.5 shrink-0"><X size={20} /></button>
                <nav className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto mobile-nav-scroll">
                  {nav.map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => goTab(key)} className={`flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium shrink-0 ${tab === key && !customerFileId ? "bg-amber-100 text-amber-800" : "text-slate-600"}`}>
                      <Icon size={18} /> {label}
                    </button>
                  ))}
                </nav>
                <div className="border-t pt-3 shrink-0">
                  <div className="text-sm text-slate-700 font-medium">{profile.fullName || session.user.email}</div>
                  <div className="text-xs text-slate-400 mb-2">{roleLabel}</div>
                  <button onClick={handleSignOut} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800 transition"><LogOut size={14} /> התנתקות</button>
                </div>
              </div>
            </div>
          )}

          <div className="p-4 sm:p-6 pb-48 md:pb-6 max-w-6xl mx-auto">
            {dataError && <div className="bg-rose-100 text-rose-700 text-sm rounded-xl px-3 py-2 mb-4">{dataError}</div>}
            {customerFileId ? (
              <CustomerFile
                data={data}
                customerId={customerFileId}
                onBack={() => setCustomerFileId(null)}
                onCreateQuote={openQuoteBuilder}
                onStartSale={(id) => { setSaleInitialCustomerId(id); setCustomerFileId(null); setTab("sale"); }}
                isAdmin={isAdmin}
              />
            ) : (
              <>
                {tab === "dashboard" && <Dashboard data={data} onExport={exportCSV} isAdmin={isAdmin} />}
                {tab === "items" && isAdmin && <ItemsScreen data={data} refresh={refresh} isAdmin={isAdmin} />}
                {tab === "locations" && isAdmin && <LocationsScreen data={data} refresh={refresh} isAdmin={isAdmin} />}
                {tab === "customers" && <CustomersScreen data={data} refresh={refresh} isAdmin={isAdmin} onOpenFile={setCustomerFileId} />}
                {tab === "leads" && <LeadsScreen data={data} refresh={refresh} onCreateQuote={openQuoteBuilder} />}
                {tab === "quotes" && <QuotesScreen data={data} refresh={refresh} onPrint={setPrintQuoteId} />}
                {tab === "suppliers" && isAdmin && <SuppliersScreen data={data} refresh={refresh} />}
                {tab === "shipments" && isAdmin && <ShipmentsScreen data={data} refresh={refresh} />}
                {tab === "shippingRates" && isAdmin && <ShippingRatesScreen data={data} refresh={refresh} />}
                {tab === "transaction" && <TransactionScreen data={data} refresh={refresh} quickTx={quickTx} />}
                {tab === "sale" && <SaleScreen data={data} refresh={refresh} initialCustomerId={saleInitialCustomerId} onOpenCustomer={(id) => { setCustomerFileId(id); setTab("customers"); }} />}
                {tab === "landedCost" && isAdmin && <LandedCostScreen data={data} refresh={refresh} />}
                {tab === "reports" && <ReportsScreen data={data} />}
                {tab === "po" && isAdmin && <POsScreen data={data} refresh={refresh} onPrint={setPrintPOId} />}
                {tab === "expenses" && <ExpensesScreen data={data} refresh={refresh} isAdmin={isAdmin} />}
                {tab === "log" && <AuditLog data={data} />}
                {tab === "settings" && <SettingsScreen data={data} refresh={refresh} userEmail={session.user.email} logoUrl={data.logoUrl} isAdmin={isAdmin} onLogoChange={async (dataUrl) => { try { await api.updateLogoUrl(dataUrl); await refresh(); } catch (e) { alert(e.message); } }} />}
              </>
            )}
          </div>

          {tab !== "transaction" && !customerFileId && isAdmin && (
            <div
              className="md:hidden fixed inset-x-0 z-20 bg-white/90 backdrop-blur-xl border-t border-gray-100"
              style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))", height: "4rem" }}
            >
              <div className="flex h-full divide-x divide-x-reverse divide-gray-100">
                <button onClick={() => runQuickAction("transfer")} className="flex-1 flex items-center justify-center gap-2.5 active:bg-gray-50 transition">
                  <div className="p-2 rounded-xl bg-sky-50 text-sky-600"><ArrowLeftRight size={17} /></div>
                  <span className="text-sm font-semibold text-slate-700">העברה מהירה</span>
                </button>
                <button onClick={() => runQuickAction("install")} className="flex-1 flex items-center justify-center gap-2.5 active:bg-gray-50 transition">
                  <div className="p-2 rounded-xl bg-amber-50 text-amber-600"><Truck size={17} /></div>
                  <span className="text-sm font-semibold text-slate-700">התקנה מהירה</span>
                </button>
              </div>
            </div>
          )}

          <nav
            className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t flex justify-around items-center z-30"
            style={{ height: "4rem", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {MOBILE_NAV.filter((key) => nav.some((n) => n.key === key)).map((key) => {
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
      {quoteBuilderFor && (
        <QuoteBuilderModal
          data={data}
          customerId={quoteBuilderFor.customerId}
          leadId={quoteBuilderFor.leadId}
          refresh={refresh}
          onClose={() => setQuoteBuilderFor(null)}
          onCreated={(quoteId) => { setQuoteBuilderFor(null); setPrintQuoteId(quoteId); }}
        />
      )}
      {printQuoteId && <QuotePrintView data={data} quoteId={printQuoteId} onClose={() => setPrintQuoteId(null)} />}
    </div>
  );
}
