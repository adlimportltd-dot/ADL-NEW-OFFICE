import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Package, Warehouse, Users, ArrowLeftRight,
  ScrollText, Plus, X, TriangleAlert, Download, Truck, Building2,
  CircleCheck, CircleX, Trash2, ChevronLeft, Menu, LogOut, Loader2,
  Upload, Calculator, Ship, BarChart3, FileText, Printer, Gauge,
  Settings, Database, KeyRound, User, Pencil, TrendingUp,
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
  const [itemsRes, locationsRes, customersRes, stockRes, txRes, suppliersRes, shipmentsRes, rateCardsRes, posRes, paymentsRes, leadsRes, quotesRes, settingsRes] = await Promise.all([
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
    supabase.from("app_settings").select("*"),
  ]);

  for (const r of [itemsRes, locationsRes, customersRes, stockRes, txRes, suppliersRes, shipmentsRes, rateCardsRes, posRes, paymentsRes, leadsRes, quotesRes, settingsRes]) {
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
    shipments: (shipmentsRes.data || []).map(mapShipment),
    rateCards: (rateCardsRes.data || []).map(mapRateCard),
    purchaseOrders: (posRes.data || []).map(mapPO),
    poPayments: (paymentsRes.data || []).map(mapPOPayment),
    leads: (leadsRes.data || []).map(mapLead),
    quotes: (quotesRes.data || []).map(mapQuote),
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
  const { error } = await supabase.from("customers").insert({
    name: customer.name, address: customer.address, contact: customer.contact,
    phone: customer.phone || null, email: customer.email || null, client_type: customer.clientType || "private",
  });
  if (error) throw error;
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

const api = { signIn, signUp, signOut, onAuthChange, getSession, fetchMyProfile, fetchAllData, addItem, updateItem, setItemStock, deleteItem, addLocation, updateLocation, addCustomer, updateCustomer, insertTransaction, performRepackaging, subscribeToChanges, updateItemUnitCost, updateItemsUnitCosts, createPurchaseOrder, updatePurchaseOrder, updatePOStatus, updatePOShipment, addPOPayment, deletePOPayment, addSupplier, updateSupplier, deleteSupplier, addShipment, updateShipment, deleteShipment, addRateCard, updateRateCard, deleteRateCard, addRateLine, deleteRateLine, addLead, updateLead, deleteLead, createQuote, updateQuoteStatus, deleteQuote, updateLogoUrl, fetchPublicLogo, updateCompanySettings, updateAccountEmail, changePassword };


const fmtDate = (iso) =>
  new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const CATEGORIES = { device: "מכשירים", consumable: "נוזלים ומתכלים" };
const PACKAGE_SIZES = ["25 ליטר", "5 ליטר", "1 ליטר", "0.5 ליטר", '250 מ"ל'];
const PACKAGE_SIZE_VOLUMES = { "25 ליטר": 25, "5 ליטר": 5, "1 ליטר": 1, "0.5 ליטר": 0.5, '250 מ"ל': 0.25 };
const guessFragranceName = (item) => {
  if (item.fragranceGroup) return item.fragranceGroup;
  return item.name.replace(/^תמצית ריח - /, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
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
      {cashflowAlerts.length > 0 && (
        <div className="bg-white rounded-2xl border overflow-hidden">
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
  const [form, setForm] = useState({ name: "", fragranceName: "", category: "device", unit: "", minThreshold: 0, quantity: 0, supplierSku: "" });
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
    if (!form.unit.trim()) { setError("יחידת מידה / גודל אריזה הוא שדה חובה"); return; }
    setError("");
    try {
      const finalName = isConsumable ? `תמצית ריח - ${form.fragranceName.trim()} (${form.unit})` : form.name.trim();
      const newItemId = await api.addItem({
        name: finalName, category: form.category, unit: form.unit, minThreshold: Number(form.minThreshold) || 0,
        supplierSku: form.supplierSku, fragranceGroup: isConsumable ? form.fragranceName.trim() : null,
      });
      const qty = Number(form.quantity) || 0;
      if (qty > 0 && warehouse) {
        await api.setItemStock(newItemId, warehouse.id, qty);
      }
      setForm({ name: "", fragranceName: "", category: "device", unit: "", minThreshold: 0, quantity: 0, supplierSku: "" });
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
    if (!editForm.unit.trim()) { setEditError("יחידת מידה / גודל אריזה הוא שדה חובה"); return; }
    setEditBusy(true);
    try {
      const finalName = isConsumable ? `תמצית ריח - ${editForm.fragranceName.trim()} (${editForm.unit})` : editForm.name.trim();
      await api.updateItem(editItem.id, {
        name: finalName,
        category: editForm.category,
        unit: editForm.unit.trim(),
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
    const groupName = guessFragranceName(it) || it.name;
    if (!fragranceGroups[groupName]) fragranceGroups[groupName] = { name: groupName, sizes: [], totalWeighted: 0 };
    const qty = totalStockOf(it.id);
    const volumePerUnit = PACKAGE_SIZE_VOLUMES[it.unit] || 0;
    fragranceGroups[groupName].sizes.push({ itemId: it.id, unit: it.unit, qty });
    fragranceGroups[groupName].totalWeighted += qty * volumePerUnit;
  });
  const fragranceGroupList = Object.values(fragranceGroups).sort((a, b) => a.name.localeCompare(b.name, "he"));

  const [repackFor, setRepackFor] = useState(null); // fragrance name, or "" for open-picker mode

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
        <div className="mb-5">
          <h3 className="font-bold text-slate-800 mb-2">סיכום מלאי לפי ריח</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fragranceGroupList.map((g) => (
              <div key={g.name} className="bg-white rounded-2xl border p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-800">{g.name}</div>
                  <Badge tone="violet">סה"כ {g.totalWeighted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ל'/ק"ג</Badge>
                </div>
                <div className="space-y-1">
                  {g.sizes.map((s) => (
                    <div key={s.itemId} className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{s.unit}</span>
                      <span className="font-medium text-slate-700">{s.qty} יח'</span>
                    </div>
                  ))}
                </div>
                {isAdmin && (
                  <button onClick={() => setRepackFor(g.name)} className="text-xs text-amber-600 hover:underline font-medium mt-2 flex items-center gap-1"><Calculator size={12} /> המרת אריזות לריח זה</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-4 py-2 font-medium">שם פריט</th><th className="px-4 py-2 font-medium">SKU ספק</th><th className="px-4 py-2 font-medium">קטגוריה</th>
              <th className="px-4 py-2 font-medium">יחידת מידה</th><th className="px-4 py-2 font-medium">סף מינימום</th>
              <th className="px-4 py-2 font-medium">עלות נחיתה ליח'</th><th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it) => (
              <tr key={it.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => isAdmin && openEdit(it)}>
                <td className="px-4 py-2.5 font-medium text-slate-800">{it.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{it.supplierSku || <span className="text-slate-300">-</span>}</td>
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
            {data.items.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">אין פריטים עדיין</td></tr>}
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
                const unit = category === "consumable" && !PACKAGE_SIZES.includes(form.unit) ? PACKAGE_SIZES[2] : form.unit;
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
            <Field label="יחידת מידה"><input className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="יחידה" /></Field>
          )}
          <Field label="כינוי / SKU אצל הספק (לא חובה)"><input className={inputCls} value={form.supplierSku} onChange={(e) => setForm({ ...form, supplierSku: e.target.value })} placeholder='למשל: A300' /></Field>
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
            <Field label="יחידת מידה"><input className={inputCls} value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} placeholder="יחידה" /></Field>
          )}
          <Field label="כינוי / SKU אצל הספק (לא חובה)"><input className={inputCls} value={editForm.supplierSku} onChange={(e) => setEditForm({ ...editForm, supplierSku: e.target.value })} placeholder='למשל: A300' /></Field>
          <Field label={`כמות במלאי (מחסן מרכזי)${editForm.unit ? " - " + editForm.unit : ""}`}>
            <input type="number" min="0" className={inputCls} value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
          </Field>
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

  const group = fragranceGroupList.find((g) => g.name === fragranceName);
  const existingUnits = group ? group.sizes.map((s) => s.unit) : [];

  const consumedLines = group
    ? group.sizes
        .filter((s) => Number(consumedQtys[s.itemId]) > 0)
        .map((s) => ({ itemId: s.itemId, qty: Number(consumedQtys[s.itemId]), unit: s.unit, available: s.qty }))
    : [];
  const producedLines = PACKAGE_SIZES
    .filter((size) => Number(producedQtys[size]) > 0)
    .map((size) => {
      const existing = group?.sizes.find((s) => s.unit === size);
      return { unit: size, qty: Number(producedQtys[size]), existingItemId: existing?.itemId || null };
    });

  const consumedVolume = consumedLines.reduce((s, l) => s + l.qty * (PACKAGE_SIZE_VOLUMES[l.unit] || 0), 0);
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
            <div className="text-sm font-bold text-slate-700 mb-2">אריזות לגריעה מהמחסן</div>
            <div className="space-y-2">
              {group.sizes.map((s) => (
                <div key={s.itemId} className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 w-28 shrink-0">{s.unit}</span>
                  <span className="text-xs text-slate-400 w-20 shrink-0">זמין: {s.qty}</span>
                  <input type="number" min="0" max={s.qty} className={inputCls + " !py-1.5"} value={consumedQtys[s.itemId] || ""} onChange={(e) => setConsumedQtys({ ...consumedQtys, [s.itemId]: e.target.value })} placeholder="0" />
                </div>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <div className="text-sm font-bold text-slate-700 mb-2">אריזות להוספה למלאי</div>
            <div className="space-y-2">
              {PACKAGE_SIZES.map((size) => (
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
          <div key={loc.id} className={`bg-white rounded-2xl border p-4 flex items-center gap-3 ${isAdmin ? "cursor-pointer hover:shadow-md transition" : ""}`} onClick={() => isAdmin && openEdit(loc)}>
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
      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-4 py-2 font-medium">שם לקוח / עסק</th><th className="px-4 py-2 font-medium">סוג</th>
              <th className="px-4 py-2 font-medium">טלפון</th><th className="px-4 py-2 font-medium">אימייל</th>
              <th className="px-4 py-2 font-medium">כתובת</th><th className="px-4 py-2 font-medium">איש קשר</th><th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.customers.map((c) => (
              <tr key={c.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-2.5"><Badge tone={CLIENT_TYPES[c.clientType]?.tone}>{CLIENT_TYPES[c.clientType]?.label}</Badge></td>
                <td className="px-4 py-2.5 text-slate-500">{c.phone || "-"}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.email || "-"}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.address}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.contact}</td>
                <td className="px-4 py-2.5 text-left">
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

function CustomerFile({ data, customerId, onBack, onCreateQuote }) {
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
      <div className="bg-white rounded-2xl border p-5 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-bold text-xl text-slate-800">{customer.name}</h2>
              <Badge tone={CLIENT_TYPES[customer.clientType]?.tone}>{CLIENT_TYPES[customer.clientType]?.label}</Badge>
            </div>
            <p className="text-slate-500 mt-1">{customer.address}</p>
            <p className="text-slate-500">{customer.contact} {customer.phone && `· ${customer.phone}`} {customer.email && `· ${customer.email}`}</p>
          </div>
          <button onClick={() => onCreateQuote(customer.id, null)} className={btnPrimary + " flex items-center gap-1.5 !py-2"}><FileText size={16} /> יצירת הצעת מחיר</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">סה"כ שולם</div><div className="text-2xl font-bold text-slate-800">₪{grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div></div>
        <div className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">מכשירים שנרכשו</div><div className="text-2xl font-bold text-slate-800">{deviceCount}</div></div>
        <div className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">תמציות שנרכשו</div><div className="text-2xl font-bold text-slate-800">{consumableCount}</div></div>
      </div>

      <h3 className="font-bold text-slate-800 mb-2">היסטוריית הזמנות ורכישות</h3>
      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-4 py-2 font-medium">תאריך</th><th className="px-4 py-2 font-medium">פריט</th>
              <th className="px-4 py-2 font-medium">קטגוריה</th><th className="px-4 py-2 font-medium">יחידה / גודל</th>
              <th className="px-4 py-2 font-medium">כמות</th><th className="px-4 py-2 font-medium">מחיר ליח'</th>
              <th className="px-4 py-2 font-medium">סה"כ שורה</th><th className="px-4 py-2 font-medium">סוג</th><th className="px-4 py-2 font-medium">הערה</th>
            </tr>
          </thead>
          <tbody>
            {history.map((t) => {
              const item = data.items.find((i) => i.id === t.itemId);
              const lineTotal = t.unitPrice != null ? t.unitPrice * t.qty : null;
              return (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{item?.name || "-"}</td>
                  <td className="px-4 py-2.5">{item ? <Badge tone={item.category === "device" ? "sky" : "violet"}>{CATEGORIES[item.category]}</Badge> : "-"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{item?.unit || "-"}</td>
                  <td className="px-4 py-2.5">{t.qty}</td>
                  <td className="px-4 py-2.5">{t.unitPrice != null ? `₪${t.unitPrice.toFixed(2)}` : <span className="text-slate-300">-</span>}</td>
                  <td className="px-4 py-2.5 font-bold">{lineTotal != null ? `₪${lineTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : <span className="text-slate-300">-</span>}</td>
                  <td className="px-4 py-2.5"><Badge tone={TX_TYPES[t.type]?.color}>{TX_TYPES[t.type]?.label}</Badge></td>
                  <td className="px-4 py-2.5 text-slate-500">{t.note || "-"}</td>
                </tr>
              );
            })}
            {history.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">אין היסטוריה עדיין ללקוח זה</td></tr>}
          </tbody>
          {purchases.length > 0 && (
            <tfoot>
              <tr className="border-t bg-gray-50">
                <td colSpan={6} className="px-4 py-2.5 text-left font-bold text-slate-700">סה"כ שולם על ידי הלקוח</td>
                <td colSpan={3} className="px-4 py-2.5 font-bold text-amber-700">₪{grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {customerQuotes.length > 0 && (
        <>
          <h3 className="font-bold text-slate-800 mb-2 mt-4">הצעות מחיר</h3>
          <div className="bg-white rounded-2xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-4 py-2 font-medium">מס' הצעה</th><th className="px-4 py-2 font-medium">תאריך</th><th className="px-4 py-2 font-medium">שורות</th><th className="px-4 py-2 font-medium">סה"כ</th><th className="px-4 py-2 font-medium">סטטוס</th></tr></thead>
              <tbody>
                {customerQuotes.map((q) => (
                  <tr key={q.id} className="border-t">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{q.quoteNumber}</td>
                    <td className="px-4 py-2.5 text-slate-500">{fmtDate(q.date)}</td>
                    <td className="px-4 py-2.5">{q.lines.length}</td>
                    <td className="px-4 py-2.5 font-bold">₪{q.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2.5"><Badge tone={QUOTE_STATUSES[q.status]?.tone}>{QUOTE_STATUSES[q.status]?.label}</Badge></td>
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
  const [form, setForm] = useState({ itemId: "", qty: "", fromLocationId: "", toLocationId: "", customerId: "", condition: "ok", note: "", unitPrice: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const warehouse = data.locations.find((l) => l.type === "warehouse");
  const vehicles = data.locations.filter((l) => l.type === "vehicle");

  const resetForm = () => setForm({ itemId: "", qty: "", fromLocationId: "", toLocationId: "", customerId: "", condition: "ok", note: "", unitPrice: "" });

  const chooseType = (t) => {
    setType(t); setError(""); setSuccess("");
    const base = { itemId: "", qty: "", fromLocationId: "", toLocationId: "", customerId: "", condition: "ok", note: "", unitPrice: "" };
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-bold text-xl text-slate-800">יומן אירועים (Audit Log)</h2>
        <select className={inputCls + " w-auto"} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">כל התנועות</option>
          {Object.entries(AUDIT_TX_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
                  <td className="px-4 py-2.5"><Badge tone={AUDIT_TX_LABELS[t.type]?.color}>{AUDIT_TX_LABELS[t.type]?.label}</Badge></td>
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
        <div className="bg-white rounded-2xl border p-4 mb-4">
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
        <div className="bg-white rounded-2xl border p-4 mb-4">
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
        <div className="bg-white rounded-2xl border p-4">
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
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="font-bold text-slate-800 mb-3">שיטת חלוקת העלויות</h3>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setMethod("value")} className={`flex-1 rounded-xl py-2.5 border font-medium text-sm ${method === "value" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}>לפי ערך הפריט</button>
            <button onClick={() => setMethod("volume")} className={`flex-1 rounded-xl py-2.5 border font-medium text-sm ${method === "volume" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-gray-300 text-slate-600"}`}>לפי נפח</button>
          </div>
          <p className="text-sm text-slate-500">{method === "value" ? "עלויות המשלוח יחולקו ביחס לערך הכולל של כל שורה (בש\"ח, אחרי המרה)." : "עלויות המשלוח יחולקו ביחס לנפח הכולל שלהן במכולה."}</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border p-4 mb-4">
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
        <div className="bg-white rounded-2xl border overflow-hidden mb-4">
          <div className="px-4 py-3 border-b"><h3 className="font-bold text-slate-800">תוצאת חישוב עלות הנחיתה</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-4 py-2 font-medium">פריט</th><th className="px-4 py-2 font-medium">כמות</th><th className="px-4 py-2 font-medium">מחיר בסיס (₪)</th><th className="px-4 py-2 font-medium">חלק יחסי</th><th className="px-4 py-2 font-medium">Landed Cost ליח'</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.item?.name || "-"}</td>
                    <td className="px-4 py-2.5">{r.qty}</td>
                    <td className="px-4 py-2.5">₪{r.unitPriceILS.toFixed(2)}{r.currency !== "ILS" && <span className="text-slate-400 text-xs"> ({CURRENCY_SYMBOLS[r.currency]}{Number(r.unitPrice).toFixed(2)})</span>}</td>
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
      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-slate-500 text-right">
              <th className="px-4 py-2 font-medium">שם ספק</th><th className="px-4 py-2 font-medium">מדינה</th>
              <th className="px-4 py-2 font-medium">איש קשר</th><th className="px-4 py-2 font-medium">טלפון</th>
              <th className="px-4 py-2 font-medium">אימייל</th><th className="px-4 py-2 font-medium">מטבע</th><th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.suppliers.map((s) => (
              <tr key={s.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(s)}>
                <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.country || "-"}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.contact || "-"}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.phone || "-"}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.email || "-"}</td>
                <td className="px-4 py-2.5"><Badge tone="sky">{CURRENCY_SYMBOLS[s.currency]} {s.currency}</Badge></td>
                <td className="px-4 py-2.5 text-left" onClick={(e) => e.stopPropagation()}>
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
        <div className="bg-white rounded-2xl border p-5 mb-4">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="font-bold text-xl text-slate-800">{shipment.name}</h2>
            <Badge tone={SHIPMENT_STATUSES[shipment.status]?.tone}>{SHIPMENT_STATUSES[shipment.status]?.label}</Badge>
          </div>
          {shipment.notes && <p className="text-slate-500 mt-1">{shipment.notes}</p>}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">הזמנות רכש</div><div className="text-2xl font-bold text-slate-800">{pos.length}</div></div>
          <div className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">ספקים</div><div className="text-2xl font-bold text-slate-800">{suppliersFor(viewShipmentId).length}</div></div>
          <div className="bg-white rounded-2xl border p-4"><div className="text-slate-500 text-sm mb-1">שורות פריטים</div><div className="text-2xl font-bold text-slate-800">{Object.keys(itemTotals).length}</div></div>
        </div>

        <h3 className="font-bold text-slate-800 mb-2">הזמנות הרכש במשלוח זה</h3>
        <div className="bg-white rounded-2xl border overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-4 py-2 font-medium">מס' הזמנה</th><th className="px-4 py-2 font-medium">ספק</th><th className="px-4 py-2 font-medium">מטבע</th><th className="px-4 py-2 font-medium">שורות</th><th className="px-4 py-2 font-medium">סטטוס PO</th></tr></thead>
            <tbody>
              {pos.map((po) => {
                const supplier = data.suppliers.find((s) => s.id === po.supplierId);
                return (
                  <tr key={po.id} className="border-t">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{po.poNumber}</td>
                    <td className="px-4 py-2.5 text-slate-500">{supplier?.name || "-"} {supplier?.country ? `(${supplier.country})` : ""}</td>
                    <td className="px-4 py-2.5 text-slate-500">{po.currency}</td>
                    <td className="px-4 py-2.5">{po.lines.length}</td>
                    <td className="px-4 py-2.5"><Badge tone={PO_STATUSES[po.status]?.tone}>{PO_STATUSES[po.status]?.label}</Badge></td>
                  </tr>
                );
              })}
              {pos.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">אין עדיין הזמנות רכש משויכות למשלוח זה</td></tr>}
            </tbody>
          </table>
        </div>

        <h3 className="font-bold text-slate-800 mb-2">פריטים וכמויות מרוכזים (כל הספקים יחד)</h3>
        <div className="bg-white rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-4 py-2 font-medium">פריט</th><th className="px-4 py-2 font-medium">כמות כוללת</th><th className="px-4 py-2 font-medium">מגיע מספקים</th></tr></thead>
            <tbody>
              {Object.values(itemTotals).map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.item?.name || "-"}</td>
                  <td className="px-4 py-2.5">{r.qty} {r.item?.unit || ""}</td>
                  <td className="px-4 py-2.5 text-slate-500">{[...r.suppliers].join(", ")}</td>
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
            <div key={s.id} className="bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-md transition" onClick={() => setViewShipmentId(s.id)}>
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
          <div key={card.id} className="bg-white rounded-2xl border overflow-hidden">
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
                          <div className={`text-xs mb-1 ${isOverdue ? "text-rose-600 font-medium" : "text-slate-500"}`}>
                            מעקב: {new Date(lead.followUpDate).toLocaleDateString("he-IL")} {isOverdue && "(עבר!)"}
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
      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-4 py-2 font-medium">מס' הצעה</th><th className="px-4 py-2 font-medium">תאריך</th><th className="px-4 py-2 font-medium">לקוח / ליד</th><th className="px-4 py-2 font-medium">שורות</th><th className="px-4 py-2 font-medium">סה"כ</th><th className="px-4 py-2 font-medium">סטטוס</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {data.quotes.map((q) => {
              const customer = data.customers.find((c) => c.id === q.customerId);
              const lead = data.leads.find((l) => l.id === q.leadId);
              const total = q.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
              return (
                <tr key={q.id} className="border-t">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{q.quoteNumber}</td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtDate(q.date)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{customer?.name || lead?.name || "-"}</td>
                  <td className="px-4 py-2.5">{q.lines.length}</td>
                  <td className="px-4 py-2.5 font-bold">₪{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5">
                    <select className="text-xs rounded-lg border border-gray-300 px-2 py-1 bg-white" value={q.status} disabled={statusBusyId === q.id} onChange={(e) => changeStatus(q.id, e.target.value)}>
                      {Object.entries(QUOTE_STATUSES).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-left">
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
  const [newItemForm, setNewItemForm] = useState({ name: "", category: "device", unit: "" });
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
    if (!newItemForm.unit.trim()) { setNewItemError("יחידת מידה היא שדה חובה"); return; }
    setNewItemBusy(true);
    try {
      const newItemId = await api.addItem({ ...newItemForm, minThreshold: 0 });
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
      <div className="bg-white rounded-2xl border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-slate-500 text-right"><th className="px-4 py-2 font-medium">מס' הזמנה</th><th className="px-4 py-2 font-medium">מכולה/משלוח</th><th className="px-4 py-2 font-medium">ספק</th><th className="px-4 py-2 font-medium">סה"כ</th><th className="px-4 py-2 font-medium">שולם</th><th className="px-4 py-2 font-medium">יתרה</th><th className="px-4 py-2 font-medium">תנאי תשלום</th><th className="px-4 py-2 font-medium">סטטוס</th><th className="px-4 py-2"></th></tr></thead>
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
                  <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{po.poNumber}</td>
                  <td className="px-4 py-2.5">{shipment ? <Badge tone="violet">{shipment.name}</Badge> : <span className="text-slate-300">-</span>}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{supplier?.name} {supplier?.country ? `(${supplier.country})` : ""}</td>
                  <td className="px-4 py-2.5 font-bold whitespace-nowrap">{sym}{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5 text-emerald-700 whitespace-nowrap">{sym}{paid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className={`px-4 py-2.5 font-medium whitespace-nowrap ${balance > 0.01 ? (isOverdue ? "text-rose-600" : "text-amber-600") : "text-slate-300"}`}>
                    {sym}{balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    {isOverdue && <span className="block text-xs">פג תוקף!</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                    {PAYMENT_TERMS[po.paymentTerms]?.label}
                    {po.paymentTerms === "deposit_balance" && po.depositPercent ? ` (${po.depositPercent}%)` : ""}
                    {po.paymentTerms === "net_x" && po.netDays ? ` (${po.netDays} ימים)` : ""}
                    {po.dueDate && <div className="text-xs">יעד: {new Date(po.dueDate).toLocaleDateString("he-IL")}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="text-xs rounded-lg border border-gray-300 px-2 py-1 bg-white"
                      value={po.status}
                      disabled={statusBusyId === po.id}
                      onChange={(e) => changeStatus(po.id, e.target.value)}
                    >
                      {Object.entries(PO_STATUSES).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-left">
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
                const unit = category === "consumable" && !PACKAGE_SIZES.includes(newItemForm.unit) ? PACKAGE_SIZES[2] : newItemForm.unit;
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
            <Field label="יחידת מידה"><input className={inputCls} value={newItemForm.unit} onChange={(e) => setNewItemForm({ ...newItemForm, unit: e.target.value })} placeholder="יחידה" /></Field>
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
  { key: "leads", label: "לידים (CRM)", icon: TrendingUp },
  { key: "quotes", label: "הצעות מחיר", icon: FileText },
  { key: "suppliers", label: "ספקים", icon: Building2, adminOnly: true },
  { key: "shipments", label: "משלוחים / מכולות", icon: Ship, adminOnly: true },
  { key: "shippingRates", label: "מחירוני שילוח", icon: Database, adminOnly: true },
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
  const [quoteBuilderFor, setQuoteBuilderFor] = useState(null); // { customerId, leadId }
  const [printQuoteId, setPrintQuoteId] = useState(null);
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
              <CustomerFile data={data} customerId={customerFileId} onBack={() => setCustomerFileId(null)} onCreateQuote={openQuoteBuilder} />
            ) : (
              <>
                {tab === "dashboard" && <Dashboard data={data} onExport={exportCSV} />}
                {tab === "items" && isAdmin && <ItemsScreen data={data} refresh={refresh} isAdmin={isAdmin} />}
                {tab === "locations" && isAdmin && <LocationsScreen data={data} refresh={refresh} isAdmin={isAdmin} />}
                {tab === "customers" && <CustomersScreen data={data} refresh={refresh} isAdmin={isAdmin} onOpenFile={setCustomerFileId} />}
                {tab === "leads" && <LeadsScreen data={data} refresh={refresh} onCreateQuote={openQuoteBuilder} />}
                {tab === "quotes" && <QuotesScreen data={data} refresh={refresh} onPrint={setPrintQuoteId} />}
                {tab === "suppliers" && isAdmin && <SuppliersScreen data={data} refresh={refresh} />}
                {tab === "shipments" && isAdmin && <ShipmentsScreen data={data} refresh={refresh} />}
                {tab === "shippingRates" && isAdmin && <ShippingRatesScreen data={data} refresh={refresh} />}
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
