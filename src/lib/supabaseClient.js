import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "חסרים משתני סביבה VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
    "העתק את .env.example לקובץ .env והזן את הפרטים מ-Supabase (Project Settings -> API)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
