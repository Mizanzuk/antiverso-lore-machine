import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Valida o usuário real via cookie
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Usuário não identificado." },
        { status: 401 }
      );
    }

    // Busca Universos e Mundos (RLS filtra automaticamente)
    const { data: worlds, error: worldsError } = await supabase
      .from("worlds")
      .select("id, nome, descricao, tipo, ordem, is_root, universe_id")
      .order("ordem", { ascending: true });

    if (worldsError) {
      console.error("Erro ao buscar worlds:", worldsError.message);
    }

    // Busca Fichas (RLS filtra automaticamente)
    const { data: entities, error: entitiesError } = await supabase
      .from("fichas")
      .select(
        "id, slug, tipo, titulo, resumo, world_id, ano_diegese, ordem_cronologica, tags, codigo"
      )
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
