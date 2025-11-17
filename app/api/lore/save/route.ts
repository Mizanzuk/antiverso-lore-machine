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

type DBFicha = {
  id: string;
  world_id: string;
  titulo: string;
  slug: string | null;
  tipo: string | null;
  resumo: string | null;
  conteudo: string | null;
  tags: string | null;
  aparece_em: string | null;
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

// Faz merge de tags antigas (string) com tags novas (array) sem repetir
function mergeTags(oldTags: string | null, newTags: string[]): string {
  const oldArr = (oldTags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const all = new Set<string>([...oldArr, ...newTags.map((t) => t.trim())]);
  return Array.from(all).join(", ");
}

// Junta textos de "aparece_em" sem duplicar
function mergeApareceEm(oldVal: string | null, newVal?: string): string {
  const antigo = (oldVal || "").trim();
  const novo = (newVal || "").trim();

  if (!novo) return antigo;
  if (!antigo) return novo;
  if (antigo.includes(novo)) return antigo;

  // separador simples; depois podemos sofisticar (por episódio, etc.)
  return `${antigo} | ${novo}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error:
            "Supabase Admin não configurado. Verifique SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL.",
        },
        { status: 500 },
      );
    }

    const body = await req.json();

    const worldId = String(body.worldId ?? "").trim();
    const unitNumberRaw = body.unitNumber; // episódio / capítulo / vídeo (ainda opcional)
    const fichas = (body.fichas ?? []) as IncomingFicha[];

    if (!worldId) {
      return NextResponse.json(
        { error: "worldId é obrigatório para salvar fichas." },
        { status: 400 },
      );
    }

    if (!Array.isArray(fichas) || fichas.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma ficha enviada para salvar." },
        { status: 400 },
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

      const tipoNormalizado = (ficha.tipo ?? "").toLowerCase();
      const slug = slugify(titulo);

      // 1) Verifica se já existe ficha igual (mesmo mundo + tipo + título)
      const { data: existingList, error: existingError } = await supabaseAdmin
        .from("fichas")
        .select("*")
        .eq("world_id", worldId)
        .eq("tipo", tipoNormalizado)
        .eq("titulo", titulo)
        .limit(1);

      if (existingError) {
        console.error(
          "Erro ao verificar ficha existente:",
          ficha.titulo,
          existingError,
        );
        return NextResponse.json(
          {
            error: `Erro ao verificar se a ficha "${titulo}" já existe.`,
            details: existingError.message,
          },
          { status: 500 },
        );
      }

      const existing: DBFicha | null =
        existingList && existingList.length > 0 ? (existingList[0] as DBFicha) : null;

      if (!existing) {
        // 2) Não existe ainda → cria ficha nova
        const { data, error } = await supabaseAdmin
          .from("fichas")
          .insert({
            world_id: worldId,
            titulo,
            slug,
            tipo: tipoNormalizado,
            resumo: ficha.resumo ?? "",
            conteudo: ficha.conteudo ?? "",
            tags: (ficha.tags ?? []).join(", "),
            aparece_em: ficha.aparece_em ?? "",
            // futuro: ano_diegese
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
            { status: 500 },
          );
        }

        saved.push({
          ...data,
          unitNumber,
          wasNew: true,
        });
      } else {
        // 3) Já existe → faz MERGE (aparece_em + tags + eventualmente resumo/conteúdo)
        const mergedTags = mergeTags(existing.tags, ficha.tags ?? []);
        const mergedApareceEm = mergeApareceEm(
          existing.aparece_em,
          ficha.aparece_em,
        );

        const { data: updated, error: updateError } = await supabaseAdmin
          .from("fichas")
          .update({
            // se vier resumo/conteúdo novo, podemos substituir; se preferir manter o antigo, é só tirar essas linhas
            resumo: ficha.resumo || existing.resumo || "",
            conteudo: ficha.conteudo || existing.conteudo || "",
            tags: mergedTags,
            aparece_em: mergedApareceEm,
          })
          .eq("id", existing.id)
          .select("*")
          .single();

        if (updateError) {
          console.error("Erro ao atualizar ficha:", ficha.titulo, updateError);
          return NextResponse.json(
            {
              error: `Erro ao atualizar a ficha "${titulo}".`,
              details: updateError.message,
            },
            { status: 500 },
          );
        }

        saved.push({
          ...updated,
          unitNumber,
          wasNew: false,
        });
      }
    }

    return NextResponse.json(
      {
        worldId,
        unitNumber,
        count: saved.length,
        fichas: saved,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error("Erro inesperado em /api/lore/save:", err);
    return NextResponse.json(
      {
        error: "Erro inesperado ao salvar fichas.",
        details: err?.message ?? String(err),
      },
      { status: 500 },
    );
  }
}
