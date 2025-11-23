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

  // Campos temporais (principalmente para fichas do tipo "evento")
  descricao_data?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  generalidade_data?: string | null;
  camada_temporal?: string | null;

  // ano_diegese?: number | null; // legado, mantido apenas para compatibilidade futura
};

type WorldRow = {
  id: string;
  nome: string | null;
  descricao?: string | null;
  tipo?: string | null;
  has_episodes?: boolean | null;
};

// --- Helpers ---

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const WORLD_PREFIX_MAP: Record<string, string> = {
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
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (WORLD_PREFIX_MAP[nameKey]) return WORLD_PREFIX_MAP[nameKey];

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
  roteiro: "RT",
};

function getTypePrefix(tipo: string): string {
  const key = tipo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (TYPE_PREFIX_MAP[key]) return TYPE_PREFIX_MAP[key];
  return key.slice(0, 2).toUpperCase() || "FX";
}

function normalizeEpisode(unitNumber: string): string {
  const onlyDigits = (unitNumber || "").replace(/\D+/g, "");
  if (!onlyDigits) return "0";
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
  const normalizedTipo = tipo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  const episode = normalizeEpisode(unitNumber);

  let basePrefix: string;
  let appendSequence = true;

  if (normalizedTipo === "roteiro") {
    // Código especial para roteiros: {PREFIXO}{EP}-Roteiro (sem sufixo numérico)
    basePrefix = `${worldPrefix}${episode}-Roteiro`;
    appendSequence = false;
  } else {
    const typePrefix = getTypePrefix(tipo);
    basePrefix = `${worldPrefix}${episode}-${typePrefix}`;
  }

  const { data: existing, error } = await supabaseAdmin!
    .from("codes")
    .select("code")
    .ilike("code", `${basePrefix}%`);

  if (error) {
    console.error("Erro ao buscar códigos existentes:", error);
  }

  let nextNumber = 1;

  if (appendSequence && existing && existing.length > 0) {
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

  const finalCode = appendSequence ? `${basePrefix}${nextNumber}` : basePrefix;

  const { error: insertCodeError } = await supabaseAdmin!.from("codes").insert({
    ficha_id: fichaId,
    code: finalCode,
    label: "",
    description: "",
  });

  if (insertCodeError) {
    console.error("Erro ao inserir código automático em 'codes':", insertCodeError);
    return null;
  }

  const { error: updateFichaError } = await supabaseAdmin!
    .from("fichas")
    .update({ codigo: finalCode })
    .eq("id", fichaId);

  if (updateFichaError) {
    console.error("Erro ao atualizar 'codigo' na tabela 'fichas':", updateFichaError);
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

  if (trimmed.length > 0) {
    const { error: insertManualError } = await supabaseAdmin!.from("codes").insert({
      ficha_id: fichaId,
      code: trimmed,
      label: "",
      description: "",
    });

    if (insertManualError) {
      console.error("Erro ao inserir código manual em 'codes':", insertManualError);
    }

    const { error: updateFichaError } = await supabaseAdmin!
      .from("fichas")
      .update({ codigo: trimmed })
      .eq("id", fichaId);

    if (updateFichaError) {
      console.error("Erro ao atualizar 'codigo' da ficha (manual):", updateFichaError);
    }

    return trimmed;
  }

  return generateAutomaticCode({ fichaId, world, tipo, unitNumber });
}

// --- Handler principal ---

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase Admin não configurado no servidor." },
        { status: 500 },
      );
    }

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

    const { data: worldRow, error: worldError } = await supabaseAdmin!
      .from("worlds")
      .select("id, nome, descricao, tipo, has_episodes")
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
      if (!titulo) continue;

      const tipoNormalizado = (ficha.tipo || "conceito")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

      const slug = slugify(titulo);
      const tagsStr = (ficha.tags || []).join(", ");

      // Campos temporais: por doutrina, só fazem sentido para fichas do tipo "evento".
      const isEvento = tipoNormalizado === "evento";

      const descricao_data =
        isEvento && typeof ficha.descricao_data === "string"
          ? ficha.descricao_data
          : null;
      const data_inicio =
        isEvento && typeof ficha.data_inicio === "string"
          ? ficha.data_inicio
          : null;
      const data_fim =
        isEvento && typeof ficha.data_fim === "string"
          ? ficha.data_fim
          : null;
      const generalidade_data =
        isEvento && typeof ficha.generalidade_data === "string"
          ? ficha.generalidade_data
          : null;

      // No banco, a coluna se chama "granularidade_data".
      const granularidade_data = generalidade_data;

      const camada_temporal =
        isEvento && typeof ficha.camada_temporal === "string"
          ? ficha.camada_temporal
          : null;

      const { data: inserted, error: insertError } = await supabaseAdmin!
        .from("fichas")
        .insert({
          world_id: world.id,
          titulo,
          slug,
          tipo: tipoNormalizado,
          resumo: ficha.resumo ?? "",
          conteudo: ficha.conteudo ?? "",
          tags: tagsStr,
          // Campos temporais (apenas fichas de tipo "evento" terão valores; demais ficam null)
          descricao_data,
          data_inicio,
          data_fim,
          granularidade_data,
          camada_temporal,
          // "aparece_em" agora é preenchido automaticamente a partir de Mundo + Episódio
          aparece_em: (() => {
            const episode = normalizeEpisode(unitNumber);
            const worldName = (world.nome || "").trim();
            const hasEpisodes =
              typeof world.has_episodes === "boolean"
                ? world.has_episodes
                : true;

            if (!worldName && !episode) return null;

            if (!hasEpisodes || !episode || episode === "0") {
              return worldName ? `Mundo: ${worldName}` : null;
            }

            return worldName
              ? `Mundo: ${worldName}\nEpisódio: ${episode}`
              : `Episódio: ${episode}`;
          })(),
          episodio: normalizeEpisode(unitNumber),
          // codigo será preenchido depois
          codigo: null,
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

      saved.push({ fichaId, titulo, codigo: finalCode });
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
