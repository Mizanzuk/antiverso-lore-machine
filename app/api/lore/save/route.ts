import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  
  // NOVOS CAMPOS
  descricao_data?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  granularidade_data?: string | null;
  camada_temporal?: string | null;
  ano_diegese?: number | null; // Mantido por compatibilidade

  meta?: {
    relacoes?: {
      tipo: string;
      alvo_titulo?: string;
      alvo_id?: string;
    }[];
    [key: string]: any;
  };
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
  supabase: any;
}): Promise<string | null> {
  const { fichaId, world, tipo, unitNumber, supabase } = opts;

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
    basePrefix = `${worldPrefix}${episode}-Roteiro`;
    appendSequence = false;
  } else {
    const typePrefix = getTypePrefix(tipo);
    basePrefix = `${worldPrefix}${episode}-${typePrefix}`;
  }

  const { data: existing } = await supabase
    .from("codes")
    .select("code")
    .ilike("code", `${basePrefix}%`);

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

  await supabase.from("codes").insert({
    ficha_id: fichaId,
    code: finalCode,
    label: "",
    description: "",
  });

  await supabase.from("fichas").update({ codigo: finalCode }).eq("id", fichaId);

  return finalCode;
}

async function applyCodeForFicha(opts: {
  fichaId: string;
  world: WorldRow;
  tipo: string;
  unitNumber: string;
  supabase: any;
  manualCode?: string | null;
}): Promise<string | null> {
  const { fichaId, world, tipo, unitNumber, manualCode, supabase } = opts;
  const trimmed = (manualCode ?? "").trim();

  if (trimmed.length > 0) {
    await supabase.from("codes").insert({
      ficha_id: fichaId,
      code: trimmed,
      label: "",
      description: "",
    });
    await supabase.from("fichas").update({ codigo: trimmed }).eq("id", fichaId);
    return trimmed;
  }

  return generateAutomaticCode({ fichaId, world, tipo, unitNumber, supabase });
}

async function saveRelations(sourceFichaId: string, relacoes: any[], supabase: any) {
  if (!relacoes || relacoes.length === 0) return;

  for (const rel of relacoes) {
    const alvoTitulo = rel.alvo_titulo;
    if (!alvoTitulo) continue;

    const { data: targetFicha } = await supabase
      .from("fichas")
      .select("id")
      .ilike("titulo", alvoTitulo)
      .maybeSingle();

    if (targetFicha) {
      await supabase.from("lore_relations").insert({
        source_ficha_id: sourceFichaId,
        target_ficha_id: targetFicha.id,
        tipo_relacao: rel.tipo || "relacionado_a",
        descricao: `Gerado automaticamente via extração.`,
      });
    }
  }
}

// --- Handler principal ---

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let clientToUse = supabase;
    let userId = user?.id;

    if (!userId) {
        const headerUserId = req.headers.get("x-user-id");
        if (headerUserId) {
            if (supabaseAdmin) {
                clientToUse = supabaseAdmin;
                userId = headerUserId;
            } else {
                console.warn("⚠️ Supabase Admin não inicializado.");
            }
        }
    }

    if (!userId) {
      return NextResponse.json({ error: "Acesso negado (401). Usuário não identificado." }, { status: 401 });
    }

    const body = await req.json();
    const worldId = String(body.worldId || "").trim();
    const unitNumber = String(body.unitNumber || "").trim();
    const fichas = (body.fichas || []) as IncomingFicha[];

    if (!worldId || !Array.isArray(fichas) || fichas.length === 0) {
      return NextResponse.json(
        { error: "Parâmetros inválidos. 'worldId' e 'fichas' são obrigatórios." },
        { status: 400 },
      );
    }

    const { data: worldRow, error: worldError } = await clientToUse
      .from("worlds")
      .select("*")
      .eq("id", worldId)
      .single();

    if (worldError || !worldRow) {
      console.error("Erro ao buscar mundo:", worldError);
      return NextResponse.json({ error: "Mundo não encontrado ou acesso negado." }, { status: 400 });
    }

    const world = worldRow as WorldRow;
    const saved: any[] = [];

    for (const ficha of fichas) {
      const titulo = (ficha.titulo || "").trim();
      if (!titulo) continue;

      const tipoNormalizado = (ficha.tipo || "conceito").toLowerCase().trim();
      const slug = slugify(titulo);
      const tagsStr = (ficha.tags || []).join(", ");
      
      // Lógica de Ano Diegético (Legado ou extraído do ano da data_inicio)
      let anoDiegeseFinal = ficha.ano_diegese;
      if (!anoDiegeseFinal && ficha.data_inicio) {
          try {
              anoDiegeseFinal = new Date(ficha.data_inicio).getFullYear();
          } catch {}
      }

      // Mapeamento dos novos campos do PDF
      const insertData: any = {
          world_id: world.id,
          titulo,
          slug,
          tipo: tipoNormalizado,
          resumo: ficha.resumo ?? "",
          conteudo: ficha.conteudo ?? "",
          tags: tagsStr,
          aparece_em: ficha.aparece_em,
          episodio: normalizeEpisode(unitNumber),
          
          // Novos Campos Temporais
          descricao_data: ficha.descricao_data || null,
          data_inicio: ficha.data_inicio || null,
          data_fim: ficha.data_fim || null,
          granularidade_data: ficha.granularidade_data || 'vago',
          camada_temporal: ficha.camada_temporal || 'linha_principal',
          ano_diegese: anoDiegeseFinal || null,
      };

      const { data: inserted, error: insertError } = await clientToUse
        .from("fichas")
        .insert(insertData)
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
        supabase: clientToUse,
      });

      if (ficha.meta && ficha.meta.relacoes) {
        await saveRelations(fichaId, ficha.meta.relacoes, clientToUse);
      }

      saved.push({ fichaId, titulo, codigo: finalCode });
    }

    return NextResponse.json({ ok: true, savedCount: saved.length, saved });
  } catch (err: any) {
    console.error("Erro em /api/lore/save:", err);
    return NextResponse.json({ error: "Erro inesperado: " + err.message }, { status: 500 });
  }
}
