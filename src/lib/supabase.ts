import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only client. RLS stays enabled without policies, so only this
// secret key can read or write; the browser never talks to Supabase directly.
export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY is missing in .env.local");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
