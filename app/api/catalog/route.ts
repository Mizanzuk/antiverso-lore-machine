import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase não configurado." },
        { status: 500 }
      );
    }

    // 1. SEGURANÇA: Identificar o usuário
    // O frontend deve enviar o ID do usuário no header "x-user-id"
    const userId = req.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "Usuário não identificado (x-user-id ausente)." },
        { status: 401 }
      );
    }

    const client = supabaseAdmin;

    // 2. Buscar Mundos (FILTRANDO POR USER_ID)
    const { data: worlds, error: worldsError } = await client
      .from("worlds")
      .select("id, nome, descricao, tipo, ordem, is_root, universe_id")
      .eq("user_id", userId) // <--- FILTRO DE SEGURANÇA
      .order("ordem", { ascending: true });

    if (worldsError) {
      console.error("Erro ao buscar worlds:", worldsError.message);
    }

    // 3. Buscar Fichas (FILTRANDO POR USER_ID)
    const { data: entities, error: entitiesError } = await client
      .from("fichas")
      .select(
        "id, slug, tipo, titulo, resumo, world_id, ano_diegese, ordem_cronologica, tags, codigo, user_id"
      )
      .eq("user_id", userId) // <--- FILTRO DE SEGURANÇA
      .order("titulo", { ascending: true })
      .limit(1000);

    if (entitiesError) {
      console.error("Erro ao buscar fichas:", entitiesError.message);
    }

    const types = [
      { id: "personagem", label: "Personagens" },
      { id: "local", label: "Locais" },
      { id: "organizacao", label: "Empresas / Agências" },
      { id: "midia", label: "Mídias" },
      { id: "arquivo_aris", label: "Arquivos ARIS" },
      { id: "episodio", label: "Episódios" },
      { id: "evento", label: "Eventos" },
      { id: "conceito", label: "Conceitos" },
      { id: "objeto", label: "Objetos" },
    ];

    return NextResponse.json({
      worlds: worlds ?? [],
      entities: entities ?? [],
      types,
    });
  } catch (err) {
    console.error("Erro inesperado em /api/catalog:", err);
    return NextResponse.json(
      { error: "Erro ao carregar catálogo." },
      { status: 500 }
    );
  }
}
