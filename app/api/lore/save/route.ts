import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type IncomingFicha = {
  tipo: string;
  titulo: string;
  resumo?: string;
  conteudo?: string;
  tags?: string[];
  aparece_em?: string;
  codigo?: string;
  ano_diegese?: number | null;
};

type WorldRow = {
  id: string;
  nome: string | null;
  descricao?: string | null;
  tipo?: string | null;
};

// --- Helpers ---

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const WORLD_PREFIX_MAP: Record<string, string> = {
  // ids dos mundos principais
  arquivos_vermelhos: "AV",
  torre_de_vera_cruz: "TVC",
  evangelho_de_or: "EO",
  culto_de_or: "CO",
  a_sala: "AS",
  aris: "ARIS",
  antiverso: "AN",
  teste: "TS",
};

function getWorldPrefix(world: WorldRow): string {
  const keyFromId = (world.id || "").toLowerCase().trim();
  if (WORLD_PREFIX_MAP[keyFromId]) return WORLD_PREFIX_MAP[keyFromId];

  const nameKey = (world.nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  if (WORLD_PREFIX_MAP[nameKey]) return WORLD_PREFIX_MAP[nameKey];

  // fallback: primeiras letras de cada palavra do nome
  const parts = nameKey.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 3).toUpperCase();
  }
  const initials = parts.map((p) => p[0]).join("");
  return initials.toUpperCase().slice(0, 4) || "XX";
}

const TYPE_PREFIX_MAP: Record<string, string> = {
  personagem: "PS",
  local: "LO",
  conceito: "CC",
  evento: "EV",
  midia: "MD",
  "mídia": "MD",
  empresa: "EM",
  agencia: "AG",
  "agência": "AG",
  registro_anomalo: "RA",
  "registro anômalo": "RA",
};

function getTypePrefix(tipo: string): string {
  const key = tipo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  if (TYPE_PREFIX_MAP[key]) return TYPE_PREFIX_MAP[key];

  // fallback: primeiras 2 letras
  return key.slice(0, 2).toUpperCase() || "FX";
}

function normalizeEpisode(unitNumber: string): string {
  const onlyDigits = (unitNumber || "").replace(/\D+/g, "");
  if (!onlyDigits) return "0";
  // remove zeros à esquerda
  return String(parseInt(onlyDigits, 10));
}

async function generateAutomaticCode(opts: {
  fichaId: string;
  world: WorldRow;
  tipo: string;
  unitNumber: string;
}): Promise<string | null> {
  const { fichaId, world, tipo, unitNumber } = opts;

  const worldPrefix = getWorldPrefix(world);
  const typePrefix = getTypePrefix(tipo);
  const episode = normalizeEpisode(unitNumber);

  const basePrefix = `${worldPrefix}${episode}-${typePrefix}`;

  // busca códigos existentes com mesmo prefixo, para descobrir o próximo número
  const { data: existing, error } = await supabaseAdmin
    .from("codes")
    .select("code")
    .ilike("code", `${basePrefix}%`);

  if (error) {
    console.error("Erro ao buscar códigos existentes:", error);
  }

  let nextNumber = 1;

  if (existing && existing.length > 0) {
    for (const row of existing) {
      const code: string = (row as any).code || "";
      const match = code.match(/(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!Number.isNaN(n) && n >= nextNumber) {
          nextNumber = n + 1;
        }
      }
    }
  }

  const finalCode = `${basePrefix}${nextNumber}`;

  const { error: insertCodeError } = await supabaseAdmin.from("codes").insert({
    ficha_id: fichaId,
    code: finalCode,
    label: "",
    description: "",
  });

  if (insertCodeError) {
    console.error("Erro ao inserir código automático em 'codes':", insertCodeError);
    return null;
  }

  const { error: updateFichaError } = await supabaseAdmin
    .from("fichas")
    .update({ codigo: finalCode })
    .eq("id", fichaId);

  if (updateFichaError) {
    console.error(
      "Erro ao atualizar campo 'codigo' na tabela 'fichas':",
      updateFichaError,
    );
  }

  return finalCode;
}

async function applyCodeForFicha(opts: {
  fichaId: string;
  world: WorldRow;
  tipo: string;
  unitNumber: string;
  manualCode?: string | null;
}): Promise<string | null> {
  const { fichaId, world, tipo, unitNumber, manualCode } = opts;

  const trimmed = (manualCode ?? "").trim();

  // Se o usuário enviou um código manual não vazio, usamos ele.
  if (trimmed.length > 0) {
    const { error: insertManualError } = await supabaseAdmin.from("codes").insert({
      ficha_id: fichaId,
      code: trimmed,
      label: "",
      description: "",
    });

    if (insertManualError) {
      console.error("Erro ao inserir código manual em 'codes':", insertManualError);
    }

    const { error: updateFichaError } = await supabaseAdmin
      .from("fichas")
      .update({ codigo: trimmed })
      .eq("id", fichaId);

    if (updateFichaError) {
      console.error(
        "Erro ao atualizar campo 'codigo' da ficha (manual):",
        updateFichaError,
      );
    }

    return trimmed;
  }

  // Caso contrário, gera automaticamente
  return generateAutomaticCode({ fichaId, world, tipo, unitNumber });
}

// --- Handler principal ---

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const worldId = String(body.worldId || "").trim();
    const unitNumber = String(body.unitNumber || "").trim();
    const fichas = (body.fichas || []) as IncomingFicha[];

    if (!worldId || !unitNumber || !Array.isArray(fichas) || fichas.length === 0) {
      return NextResponse.json(
        { error: "Parâmetros inválidos. Verifique worldId, unitNumber e fichas." },
        { status: 400 },
      );
    }

    // Buscar mundo
    const { data: worldRow, error: worldError } = await supabaseAdmin
      .from("worlds")
      .select("id, nome, descricao, tipo")
      .eq("id", worldId)
      .single();

    if (worldError || !worldRow) {
      console.error("Erro ao buscar mundo:", worldError);
      return NextResponse.json(
        { error: "Mundo não encontrado para o worldId informado." },
        { status: 400 },
      );
    }

    const world = worldRow as WorldRow;
    const saved: { fichaId: string; titulo: string; codigo?: string | null }[] = [];

    for (const ficha of fichas) {
      const titulo = (ficha.titulo || "").trim();
      if (!titulo) {
        continue;
      }

      const tipoNormalizado = (ficha.tipo || "conceito")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();

      const slug = slugify(titulo);
      const tagsStr = (ficha.tags || []).join(", ");

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("fichas")
        .insert({
          world_id: world.id,
          titulo,
          slug,
          tipo: tipoNormalizado,
          resumo: ficha.resumo ?? "",
          conteudo: ficha.conteudo ?? "",
          tags: tagsStr,
          aparece_em: ficha.aparece_em ?? null,
          ano_diegese: ficha.ano_diegese ?? null,
          codigo: null, // será preenchido após gerar/aplicar código
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        console.error("Erro ao inserir ficha:", insertError);
        continue;
      }

      const fichaId = (inserted as any).id as string;

      const finalCode = await applyCodeForFicha({
        fichaId,
        world,
        tipo: tipoNormalizado,
        unitNumber,
        manualCode: ficha.codigo,
      });

      saved.push({
        fichaId,
        titulo,
        codigo: finalCode,
      });
    }

    return NextResponse.json({
      ok: true,
      savedCount: saved.length,
      saved,
    });
  } catch (err) {
    console.error("Erro em /api/lore/save:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao salvar fichas." },
      { status: 500 },
    );
  }
}
