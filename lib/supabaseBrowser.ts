// lib/supabaseBrowser.ts
import { createClient } from "@supabase/supabase-js";

// Esses valores vêm das variáveis de ambiente definidas na Vercel
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente Supabase para ser usado em COMPONENTES CLIENT (browser)
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey);
