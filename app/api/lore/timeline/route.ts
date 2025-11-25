// app/api/lore/timeline/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic"; // evita tentativa de pré-gerar

// Tipagem básica compatível com a Timeline
type TimelineEvent = {
  id: string;
  world_id: string | null;
  titulo: string | null;
  resumo: string | null;
  tipo: string | null;
  episodio: string | null;
  camada_temporal: string | null;
  descricao_data: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  granularidade_data: string | null;
  aparece_em: string[] | null;
};

type TimelineResponse =
  | {
      ok: true;
      events: TimelineEvent[];
      count: number | null;
      error?: undefined;
    }
  | {
      ok: false;
      events: [];
      count: null;
      error: string;
    };

// --- Supabase client (usando as mesmas envs do front) ---

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // isso aparece no log do Vercel se as envs não estiverem definidas
  throw new Error(
    "[Timeline API] Faltando NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY nas variáveis de ambiente."
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Handler ---

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const worldId = searchParams.get("worldId");
    const camadaTemporal = searchParams.get("camada_temporal");

    let query = supabase
      .from("fichas")
      .select(
        `
        id,
        world_id,
        titulo,
        resumo,
        tipo,
        episodio,
        camada_temporal,
        descricao_data,
        data_inicio,
        data_fim,
        granularidade_data,
        aparece_em
      `,
        { count: "exact" }
      )
      .eq("tipo", "evento")
      .order("data_inicio", { ascending: true, nullsFirst: true });

    if (worldId) {
      query = query.eq("world_id", worldId);
    }

    if (camadaTemporal && camadaTemporal.trim().length > 0) {
      query = query.eq("camada_temporal", camadaTemporal.trim());
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("[Timeline API] Erro Supabase:", error);
      const body: TimelineResponse = {
        ok: false,
        events: [],
        count: null,
        error: "Erro ao carregar eventos da Timeline.",
      };
      return NextResponse.json(body, { status: 500 });
    }

    const events = (data || []) as TimelineEvent[];

    const body: TimelineResponse = {
      ok: true,
      events,
      count: count ?? null,
    };

    return NextResponse.json(body, { status: 200 });
  } catch (err: any) {
    console.error("[Timeline API] Erro inesperado:", err);
    const body: TimelineResponse = {
      ok: false,
      events: [],
      count: null,
      error: "Erro inesperado na Timeline API.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
