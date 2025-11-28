import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase"; // Importa o admin para fallback

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Tenta cliente padrão (Cookies)
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    let clientToUse = supabase;
    let userId = user?.id;

    // 2. CORREÇÃO: Se cookie falhar, verifica o Header enviado pelo frontend
    if (!userId) {
        const headerUserId = req.headers.get("x-user-id");
        if (headerUserId) {
            // Se temos o ID via header, usamos o Supabase Admin para garantir acesso aos dados
            // Isso bypassa o RLS (Row Level Security) que exige cookie ativo
            if (supabaseAdmin) {
                clientToUse = supabaseAdmin;
                userId = headerUserId;
            } else {
                console.warn("Supabase Admin não configurado, fallback de header pode falhar com RLS.");
            }
        }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Usuário não identificado (401). Realize login novamente." },
        { status: 401 }
      );
    }

    // Busca Universos e Mundos
    const { data: worlds, error: worldsError } = await clientToUse
      .from("worlds")
      .select("id, nome, descricao, tipo, ordem, is_root, universe_id")
      .order("ordem", { ascending: true });

    if (worldsError) {
      console.error("Erro ao buscar worlds:", worldsError.message);
    }

    // Busca Fichas
    const { data: entities, error: entitiesError } = await clientToUse
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
  } catch (err: any) {
    console.error("Erro inesperado em /api/catalog:", err);
    return NextResponse.json(
      { error: "Erro ao carregar catálogo: " + err.message },
      { status: 500 }
    );
  }
}
