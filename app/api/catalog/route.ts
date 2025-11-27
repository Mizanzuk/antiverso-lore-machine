import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error:
            "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      );
    }

    const client = supabaseAdmin;

    // 1. Buscando Mundos (worlds)
    const { data: worlds, error: worldsError } = await client
      .from("worlds")
      .select("id, nome, descricao, tipo, ordem, is_root, universe_id") // Adicionando campos necessários para o frontend
      .order("ordem", { ascending: true });

    if (worldsError) {
      console.error("Erro ao buscar worlds:", worldsError.message);
    }

    // 2. CORREÇÃO CRÍTICA: Buscar as fichas da tabela 'fichas' (que tem a RLS e user_id)
    const { data: entities, error: entitiesError } = await client
      .from("fichas") // <--- CORRIGIDO: Era "lore_entities"
      .select(
        "id, slug, tipo, titulo, resumo, world_id, ano_diegese, ordem_cronologica, tags, codigo, user_id" // Selecionando campos que existem em 'fichas'
      )
      .order("titulo", { ascending: true })
      .limit(500);

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
