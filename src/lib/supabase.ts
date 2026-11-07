import { createClient } from "@supabase/supabase-js";
import { storage } from "./storage";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isConfigured = Boolean(url && key);
export const localAuthBypass = import.meta.env.VITE_LOCAL_AUTH_BYPASS === "true";
export const supabase = isConfigured ? createClient(url!, key!, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storage,
  },
}) : null;
