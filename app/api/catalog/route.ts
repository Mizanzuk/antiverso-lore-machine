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

    const { data: worlds, error: worldsError } = await client
      .from("worlds")
      .select("id, nome, descricao, tipo, ordem")
      .order("ordem", { ascending: true });

    if (worldsError) {
      console.error("Erro ao buscar worlds:", worldsError.message);
    }

    const { data: entities, error: entitiesError } = await client
      .from("lore_entities")
      .select(
        "id, slug, tipo, titulo, resumo, world_id, ano_diegese, ordem_cronologica, tags, codigo, codes"
      )
      .order("ano_diegese", { ascending: true })
      .limit(500);

    if (entitiesError) {
      console.error("Erro ao buscar lore_entities:", entitiesError.message);
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
