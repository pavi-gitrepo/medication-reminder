
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("Supabase URL configured:", Boolean(supabaseUrl));
console.log("Supabase key configured:", Boolean(supabaseKey));

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase environment variables. Check GitHub Actions configuration."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
