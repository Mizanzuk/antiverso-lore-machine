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

type WorldRow = {
  id: string;
  nome: string | null;
  descricao: string | null;
  tipo: string | null;
  ordem: number | null;
};

const TYPE_PREFIX_MAP: Record<string, string> = {
  personagem: "PS",
  local: "LO",
  midia: "MD",
  agencia: "AG",
  empresa: "EM",
  conceito: "CO",
  regra_de_mundo: "RG",
  evento: "EV",
  epistemologia: "EP",
};

function getTypePrefix(tipo: string): string {
  const key = (tipo || "").toLowerCase();
  if (TYPE_PREFIX_MAP[key]) return TYPE_PREFIX_MAP[key];

  const cleaned = key.replace(/[^a-z]/g, "");
  if (!cleaned) return "XX";

  if (cleaned.length === 1) {
    const upper = cleaned.toUpperCase();
    return upper.padEnd(2, upper);
  }

  return cleaned.slice(0, 2).toUpperCase();
}

function getWorldPrefix(world: WorldRow): string {
  const rawTipo = (world.tipo || "").trim();
  if (rawTipo && /^[A-Za-z]{2,5}$/.test(rawTipo)) {
    // Se você já preencher "AV", "OR" etc em world.tipo, ele usa isso
    return rawTipo.toUpperCase();
  }

  const nome = (world.nome || "").trim();
  if (!nome) return "AV";

  const words = nome.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "AV";

  const initials = words
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  return initials.toUpperCase();
}

function getWorldIndex(world: WorldRow): number {
  if (typeof world.ordem === "number" && !Number.isNaN(world.ordem)) {
    return world.ordem;
  }
  return 1;
}

async function ensureCodeForFicha({
  fichaId,
  world,
  tipo,
}: {
  fichaId: string;
  world: WorldRow;
  tipo: string;
}) {
  // 1) Verifica se a ficha já possui algum código
  const { data: existingCodes, error: existingCodesError } = await supabaseAdmin
    .from("codes")
    .select("id, code")
    .eq("ficha_id", fichaId);

  if (existingCodesError) {
    console.error("Erro ao verificar códigos existentes da ficha:", existingCodesError);
    return;
  }

  if (existingCodes && existingCodes.length > 0) {
    // Já existe pelo menos um código vinculado → não gera automaticamente
    return;
  }

  // 2) Monta prefixos
  const worldPrefix = getWorldPrefix(world); // ex: "AV"
  const worldIndex = getWorldIndex(world);   // ex: 1
  const typePrefix = getTypePrefix(tipo);    // ex: "PS"

  const worldSegment = `${worldPrefix}${worldIndex}`; // "AV1"
  const prefix = `${worldSegment}-${typePrefix}`;     // "AV1-PS"

  // 3) Busca o último código existente começando por esse prefixo
  const { data: latestCodeRows, error: latestCodeError } = await supabaseAdmin
    .from("codes")
    .select("code")
    .ilike("code", `${prefix}%`)
    .order("code", { ascending: false })
    .limit(1);

  if (latestCodeError) {
    console.error("Erro ao buscar último código existente:", latestCodeError);
  }

  let nextNumber = 1;

  if (latestCodeRows && latestCodeRows.length > 0) {
    const lastCode = latestCodeRows[0].code as string;
    const numericPart = lastCode.replace(prefix, "");
    const parsed = Number.parseInt(numericPart, 10);
    if (!Number.isNaN(parsed) && parsed >= 1) {
      nextNumber = parsed + 1;
    }
  }

  const finalCode = `${prefix}${nextNumber}`; // ex: "AV1-PS3"

  // 4) Cria o registro em "codes"
  const { error: insertCodeError } = await supabaseAdmin.from("codes").insert({
    ficha_id: fichaId,
    code: finalCode,
    label: null,
    description: null,
  });

  if (insertCodeError) {
    console.error("Erro ao criar código automático para ficha:", insertCodeError);
  }
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

// Junta "tags" antigas + novas, sem duplicar
function mergeTags(oldVal: string | null, newTags: string[]): string {
  const oldArr = (oldVal || "")
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
  if (novo.includes(antigo)) return novo;

  return `${antigo} | ${novo}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error:
            "Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
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

    // Carrega o mundo uma vez para usar na geração automática de códigos
    let worldRow: WorldRow | null = null;
    const { data: worldData, error: worldError } = await supabaseAdmin
      .from("worlds")
      .select("id, nome, descricao, tipo, ordem")
      .eq("id", worldId)
      .single();

    if (worldError) {
      console.error("Erro ao carregar mundo para geração de códigos:", worldError);
    } else if (worldData) {
      worldRow = worldData as WorldRow;
    }

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

        if (worldRow && data && typeof (data as any).id === "string") {
          await ensureCodeForFicha({
            fichaId: (data as any).id as string,
            world: worldRow,
            tipo: tipoNormalizado,
          });
        }
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

        if (worldRow && updated && typeof (updated as any).id === "string") {
          await ensureCodeForFicha({
            fichaId: (updated as any).id as string,
            world: worldRow,
            tipo: tipoNormalizado,
          });
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
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
