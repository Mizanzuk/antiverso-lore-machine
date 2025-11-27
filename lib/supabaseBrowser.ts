import { createClient } from "@supabase/supabase-js";

// Esses valores vêm das variáveis de ambiente definidas na Vercel
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Verificação de segurança para não crashar o app (White Screen of Death)
// Se as variáveis não existirem, usamos valores placeholder para o app carregar e mostrar erro na UI
const url = supabaseUrl || "https://placeholder.supabase.co";
const key = supabaseAnonKey || "placeholder";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️ ALERTA CRÍTICO: Variáveis de ambiente do Supabase não encontradas. O login não funcionará.");
}

// Cliente Supabase para ser usado em COMPONENTES CLIENT (browser)
export const supabaseBrowser = createClient(url, key);
