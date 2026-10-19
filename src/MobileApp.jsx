import React, { useEffect, useState, useCallback } from "react";
import { ShoppingCart, Droplets, ClipboardList, CircleCheck, Tag, LogOut, Monitor, Truck } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { NAVY, AMBER } from "./mobileUi";
import MobileSale, { PriceList } from "./MobileSale";
import { RepackScreen, WeeklyCount, CountReview, Approvals } from "./MobileWarehouse";
import { VehicleScreen } from "./MobileVehicle";

// ============================================================
// מסך הבית בטלפון: כל העבודה היומית במחסן ממקום אחד.
// נתי: מכירה, מזיגה ופירוק, ספירה שבועית.
// ליאור / אלירן: גם "לאישור" (עם מספר ממתינים), מחירון, ומעבר למערכת המלאה.
// ============================================================
export default function MobileApp({ profile, onSignOut, onExitToSystem, initialScreen }) {
  const isAdmin = profile?.role === "admin";
  const userName = profile?.fullName || (isAdmin ? "מנהל" : "מוכר");
  const [screen, setScreen] = useState(initialScreen || "home"); // home | sale | repack | count | approvals | review | prices
  const [pending, setPending] = useState({ repacks: 0, counts: 0, vehicle: 0 });
  const [vehicle, setVehicle] = useState(null);

  const loadPending = useCallback(async () => {
    const v = await supabase.rpc("my_vehicle");
    setVehicle(!v.error && v.data?.vehicle ? { ...v.data.vehicle, items: (v.data.stock || []).length } : null);
    if (!isAdmin) return;
    const { data, error } = await supabase.rpc("mobile_pending");
    if (!error && data) setPending(data);
  }, [isAdmin]);
  useEffect(() => { if (screen === "home") loadPending(); }, [screen, loadPending]);

  const home = () => setScreen("home");
  const shell = (children) => (
    <div dir="rtl" lang="he" className="min-h-screen bg-slate-100 flex justify-center" style={{ fontFamily: "'Rubik','Assistant',sans-serif" }}>
      <div className="w-full max-w-md min-h-screen bg-slate-50 flex flex-col text-slate-900">{children}</div>
    </div>
  );

  if (screen === "sale") return <MobileSale profile={profile} onHome={home} />;
  if (screen === "vehicle") return shell(<VehicleScreen userName={userName} onBack={home} />);
  if (screen === "repack") return shell(<RepackScreen userName={userName} isAdmin={isAdmin} onBack={home} />);
  if (screen === "count") return shell(<WeeklyCount userName={userName} onBack={home} />);
  if (screen === "approvals" && isAdmin) return shell(<Approvals onBack={home} onOpenCount={() => setScreen("review")} />);
  if (screen === "review" && isAdmin) return shell(<CountReview onBack={() => setScreen("approvals")} />);
  if (screen === "prices" && isAdmin) return shell(<PriceList onBack={home} />);

  const waiting = Number(pending.repacks || 0) + Number(pending.counts || 0) + Number(pending.vehicle || 0);
  const waitingText = [
    pending.vehicle > 0 && `${pending.vehicle} בקשות רכב`,
    pending.repacks > 0 && `${pending.repacks} מזיגות`,
    pending.counts > 0 && "ספירה שבועית",
  ].filter(Boolean).join(" · ");
  const day = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" });
  const isCountDay = new Date().getDay() === 4; // חמישי

  const Tile = ({ icon: Icon, title, sub, onClick, accent, badge }) => (
    <button onClick={onClick} className={`relative rounded-2xl p-4 min-h-[118px] flex flex-col items-start justify-between text-right border-[1.5px] active:scale-[0.98] transition ${accent ? "border-transparent" : "bg-white border-slate-200"}`} style={accent ? { background: AMBER, color: NAVY } : {}}>
      <Icon size={28} />
      <div>
        <div className="text-lg font-bold leading-tight">{title}</div>
        {sub && <div className={`text-xs mt-0.5 ${accent ? "" : "text-slate-600"}`}>{sub}</div>}
      </div>
      {badge > 0 && <span className="absolute top-3 left-3 min-w-[26px] h-[26px] px-1.5 rounded-full bg-rose-600 text-white text-sm font-bold flex items-center justify-center">{badge}</span>}
    </button>
  );

  return shell(<>
    <div style={{ background: NAVY }} className="text-white px-5 pt-5 pb-6">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-bold truncate">שלום {userName}</div>
          <div className="text-[13px] text-slate-300">{day} · מחסן מרכזי</div>
        </div>
        {isAdmin && onExitToSystem && (
          <button onClick={onExitToSystem} className="h-10 px-3 rounded-xl bg-slate-800 text-sm flex items-center gap-1.5"><Monitor size={15} /> למערכת</button>
        )}
        <button onClick={onSignOut} aria-label="התנתקות" className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center"><LogOut size={17} /></button>
      </div>
    </div>
    <div className="flex-1 px-4 py-4 flex flex-col gap-3">
      {isAdmin && waiting > 0 && (
        <button onClick={() => setScreen("approvals")} className="rounded-2xl px-4 py-3.5 flex items-center gap-3 text-right font-semibold" style={{ background: AMBER, color: NAVY }}>
          <CircleCheck size={22} />
          <span className="flex-1">מחכים לאישור שלך: {waitingText}</span>
          <span>←</span>
        </button>
      )}
      <Tile icon={ShoppingCart} title="מכירה" sub="לקוח, פריטים, תשלום" onClick={() => setScreen("sale")} accent />
      <div className="grid grid-cols-2 gap-3">
        {vehicle && <Tile icon={Truck} title="הרכב שלי" sub={vehicle.items ? `${vehicle.items} סוגי פריטים ברכב` : "הרכב ריק – בקשת העמסה"} onClick={() => setScreen("vehicle")} />}
        <Tile icon={Droplets} title="מזיגה ופירוק" sub="פתיחת חבית או גלון" onClick={() => setScreen("repack")} />
        <Tile icon={ClipboardList} title="ספירה שבועית" sub={isCountDay ? "היום יום ספירה – 14:00" : "כל חמישי ב-14:00"} onClick={() => setScreen("count")} />
        {isAdmin && <Tile icon={CircleCheck} title="לאישור" sub={waiting ? "יש ממתינים" : "אין ממתינים"} onClick={() => setScreen("approvals")} badge={waiting} />}
        {isAdmin && <Tile icon={Tag} title="מחירון" sub="מחיר רגיל ולאייקון" onClick={() => setScreen("prices")} />}
      </div>
    </div>
  </>);
}
