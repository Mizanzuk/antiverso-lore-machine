import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type IncomingFicha = {
  tipo: string;
  titulo: string;
  resumo: string;
  conteudo: string;
  tags: string[];
  aparece_em?: string;
  ano_diegese?: number | null;
};

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error:
            "Supabase Admin não configurado. Verifique SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL.",
        },
        { status: 500 }
      );
    }

    const body = await req.json();

    const worldId = String(body.worldId ?? "").trim();
    const unitNumberRaw = body.unitNumber; // episódio / capítulo / vídeo (opcional)
    const fichas = (body.fichas ?? []) as IncomingFicha[];

    if (!worldId) {
      return NextResponse.json(
        { error: "worldId é obrigatório para salvar fichas." },
        { status: 400 }
      );
    }

    if (!Array.isArray(fichas) || fichas.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma ficha enviada para salvar." },
        { status: 400 }
      );
    }

    const unitNumber =
      typeof unitNumberRaw === "number"
        ? unitNumberRaw
        : unitNumberRaw
        ? Number(unitNumberRaw)
        : null;

    const saved: any[] = [];

    for (const ficha of fichas) {
      const titulo = (ficha.titulo ?? "").trim();
      if (!titulo) {
        // pula fichas sem título
        continue;
      }

      const slug = slugify(titulo);

      const { data, error } = await supabaseAdmin
        .from("fichas")
        .insert({
          world_id: worldId,
          titulo,
          slug,
          tipo: (ficha.tipo ?? "").toLowerCase(),
          resumo: ficha.resumo ?? "",
          conteudo: ficha.conteudo ?? "",
          tags: (ficha.tags ?? []).join(", "),
          aparece_em: ficha.aparece_em ?? "",
          // se no futuro você criar coluna ano_diegese na tabela, basta descomentar:
          // ano_diegese: ficha.ano_diegese ?? null,
        })
        .select("*")
        .single();

      if (error) {
        console.error("Erro ao salvar ficha:", ficha.titulo, error);
        return NextResponse.json(
          {
            error: `Erro ao salvar a ficha "${titulo}".`,
            details: error.message,
          },
          { status: 500 }
        );
      }

      saved.push({
        ...data,
        unitNumber,
      });
    }

    return NextResponse.json(
      {
        worldId,
        unitNumber,
        count: saved.length,
        fichas: saved,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Erro inesperado em /api/lore/save:", err);
    return NextResponse.json(
      {
        error: "Erro inesperado ao salvar fichas.",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
