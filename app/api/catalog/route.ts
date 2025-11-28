import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase"; // Importação crítica para o fallback

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // Lógica de Fallback de Autenticação (Igual ao save/route.ts)
    let clientToUse = supabase;
    let userId = user?.id;

    if (!userId) {
        const headerUserId = req.headers.get("x-user-id");
        if (headerUserId && supabaseAdmin) {
            clientToUse = supabaseAdmin;
            userId = headerUserId;
        }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Usuário não identificado." },
        { status: 401 }
      );
    }

    // Pegar o Universe ID da URL
    const { searchParams } = new URL(req.url);
    const universeId = searchParams.get("universeId");

    // 1. Busca Mundos (AGORA FILTRANDO PELO UNIVERSO)
    let worldsQuery = clientToUse
      .from("worlds")
      .select("id, nome, descricao, tipo, ordem, is_root, universe_id")
      .order("ordem", { ascending: true });

    if (universeId) {
        worldsQuery = worldsQuery.eq("universe_id", universeId);
    }

    const { data: worlds, error: worldsError } = await worldsQuery;

    if (worldsError) {
      console.error("Erro ao buscar worlds:", worldsError.message);
    }

    // 2. Busca Fichas (Filtrando pelos Mundos do Universo Selecionado)
    let entitiesQuery = clientToUse
      .from("fichas")
      .select(
        "id, slug, tipo, titulo, resumo, world_id, ano_diegese, ordem_cronologica, tags, codigo"
      )
      .order("titulo", { ascending: true })
      .limit(2000);

    // Se temos mundos carregados, filtramos as fichas para pertencerem apenas a esses mundos
    if (worlds && worlds.length > 0) {
        const worldIds = worlds.map(w => w.id);
        entitiesQuery = entitiesQuery.in("world_id", worldIds);
    } else if (universeId) {
        // Se um universo foi selecionado mas não tem mundos, garante que a lista de fichas venha vazia
        // (Isso impede que fichas de outros universos vazem aqui)
        entitiesQuery = entitiesQuery.in("world_id", []);
    }

    const { data: entities, error: entitiesError } = await entitiesQuery;

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
  } catch (err: any) {
    console.error("Erro inesperado em /api/catalog:", err);
    return NextResponse.json(
      { error: "Erro ao carregar catálogo." },
      { status: 500 }
    );
  }
}
