import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Package, Warehouse, Users, ArrowLeftRight,
  ScrollText, Plus, X, TriangleAlert, Download, Truck, Building2,
  CircleCheck, CircleX, Trash2, ChevronLeft, Menu, LogOut, Loader2,
  Upload, Calculator, Ship, BarChart3, FileText, Printer, Gauge,
  Settings, Database, KeyRound, User,
} from "lucide-react";
import * as api from "./lib/api";

const fmtDate = (iso) =>
  new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const CATEGORIES = { device: "מכשירים", consumable: "נוזלים ומתכלים" };
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
