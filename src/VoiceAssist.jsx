import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Sparkles, X, TriangleAlert } from "lucide-react";
import { supabase } from "./lib/supabaseClient";

// ============================================================
// עוזר הרישום: מדברים (או כותבים) מה קרה – וה-AI ממלא את הטופס.
// לא שומר כלום לבד: מחזיר טיוטה, והמשתמש בודק ולוחץ אישור כרגיל.
// mode: "sale" | "repack" · onDraft(draft) – מקבל את הטיוטה מהשרת
// ============================================================
const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const MOBILE = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

export default function VoiceAssist({ mode, onDraft, title }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recRef = useRef(null);
  const baseRef = useRef("");
  const lastRef = useRef("");
  const wantRef = useRef(false);

  useEffect(() => () => { wantRef.current = false; try { recRef.current?.stop(); } catch (e) { /* ignore */ } }, []);

  // ממזג תוצאות בלי לשכפל: באנדרואיד/אייפון כל תוצאה מכילה לפעמים את כל מה שנאמר עד עכשיו
  const merge = (results) => {
    let s = "";
    for (let i = 0; i < results.length; i++) {
      const t = (results[i][0].transcript || "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      const cur = s.trim();
      if (!cur || t.startsWith(cur)) s = t;
      else if (cur.endsWith(t) || cur.startsWith(t)) continue;
      else s = cur + " " + t;
    }
    return s;
  };

  const listen = () => {
    const rec = new SR();
    rec.lang = "he-IL"; rec.interimResults = true;
    rec.continuous = !MOBILE; // בטלפון: משפט-משפט עם הפעלה מחדש אוטומטית – הכי יציב
    lastRef.current = "";
    rec.onresult = (e) => { lastRef.current = merge(e.results); setText((baseRef.current + lastRef.current).trim()); };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { wantRef.current = false; setError("אין הרשאה למיקרופון – צריך לאשר בדפדפן, או לכתוב בתיבה"); }
      else if (e.error !== "no-speech" && e.error !== "aborted" && !MOBILE) setError("ההקלטה נעצרה – אפשר לנסות שוב או לכתוב");
    };
    rec.onend = () => {
      if (lastRef.current) baseRef.current = (baseRef.current + lastRef.current).trim() + " ";
      lastRef.current = "";
      if (wantRef.current) { try { listen(); return; } catch (x) { /* ignore */ } }
      wantRef.current = false; setListening(false);
    };
    recRef.current = rec;
    rec.start();
  };

  const start = () => {
    setError("");
    if (!SR) { setError("הדפדפן הזה לא תומך בהקלטה – אפשר לכתוב את המשפט בתיבה"); return; }
    baseRef.current = text ? text.trim() + " " : "";
    wantRef.current = true;
    try { listen(); setListening(true); } catch (e) { wantRef.current = false; setError("לא הצלחתי להפעיל את המיקרופון"); }
  };
  const stop = () => { wantRef.current = false; try { recRef.current?.stop(); } catch (e) { /* ignore */ } setListening(false); };

  const send = async () => {
    stop();
    const t = text.trim();
    if (!t) { setError("לא נקלט טקסט"); return; }
    setBusy(true); setError("");
    try {
      const { data, error: e } = await supabase.functions.invoke("voice-assist", { body: { mode, text: t } });
      if (e) {
        let msg = e.message;
        try { const j = await e.context.json(); msg = j.error || msg; } catch (x) { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      onDraft(data);
      setOpen(false); setText("");
    } catch (e) { setError(e.message || "שגיאה בעוזר הרישום"); } finally { setBusy(false); }
  };

  if (!open) return (
    <button onClick={() => { setOpen(true); setError(""); }}
      className="w-full h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-[16px] text-white shadow-sm"
      style={{ background: "linear-gradient(135deg,#0f172a,#334155)" }}>
      <Mic size={22} /> {title || "ספר מה קרה – והטופס יתמלא לבד"}
    </button>
  );

  return (
    <div className="bg-white border-[1.5px] border-slate-300 rounded-2xl p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="font-bold flex items-center gap-1.5"><Sparkles size={18} className="text-amber-500" /> עוזר הרישום</span>
        <button aria-label="סגירה" onClick={() => { stop(); setOpen(false); }}><X size={20} className="text-slate-400" /></button>
      </div>
      <div className="text-[13px] text-slate-600">
        {mode === "sale" ? 'למשל: "מכרתי למשה ליטר פתאל בשתי חצאים ב-250 מזומן"' : 'למשל: "מזגתי גלון פתאל ל-3 קילו ו-4 חצאים"'}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="לחצו על המיקרופון ודברו – או כתבו כאן"
        className="border border-slate-300 rounded-xl px-3 py-2 text-base bg-white resize-none" />
      <div className="grid grid-cols-2 gap-2">
        {listening ? (
          <button onClick={stop} className="h-12 rounded-xl bg-rose-600 text-white font-semibold flex items-center justify-center gap-1.5"><Square size={16} /> עצור הקלטה</button>
        ) : (
          <button onClick={start} disabled={busy} className="h-12 rounded-xl bg-slate-900 text-white font-semibold flex items-center justify-center gap-1.5"><Mic size={18} /> {text ? "המשך לדבר" : "הקלט"}</button>
        )}
        <button onClick={send} disabled={busy || !text.trim()} className="h-12 rounded-xl font-bold flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: "#f59e0b", color: "#0f172a" }}>
          {busy ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />} {busy ? "ממלא..." : "מלא את הטופס"}
        </button>
      </div>
      {listening && <div className="text-xs text-rose-700 font-semibold">● מקליט... דברו בחופשיות, ולחצו "עצור" בסוף</div>}
      {error && <div className="flex items-start gap-1.5 text-sm text-rose-800 bg-rose-50 rounded-xl px-2.5 py-2"><TriangleAlert size={16} className="shrink-0 mt-0.5" />{error}</div>}
    </div>
  );
}

// רצועת "העוזר שואל" – שאלות ודברים לבדוק לפני האישור
export function VoiceQuestions({ draft, onClose }) {
  if (!draft) return null;
  const qs = draft.questions || [];
  return (
    <div className="bg-amber-50 border-[1.5px] border-amber-300 rounded-2xl p-3 flex flex-col gap-1.5 text-amber-950">
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm flex items-center gap-1.5"><Sparkles size={16} className="text-amber-600" /> מולא ע"י עוזר הרישום – בדקו לפני האישור</span>
        {onClose && <button aria-label="סגירה" onClick={onClose}><X size={16} className="text-amber-700" /></button>}
      </div>
      {draft.heard && <div className="text-[12px] text-amber-900">נקלט: "{draft.heard}"</div>}
      {qs.map((q, i) => <div key={i} className="text-[13px] font-semibold">⚠️ {q}</div>)}
    </div>
  );
}
