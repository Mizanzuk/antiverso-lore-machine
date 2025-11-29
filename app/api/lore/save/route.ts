import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase"; 

export const dynamic = "force-dynamic";

type IncomingRelation = {
  source_titulo: string;
  target_titulo: string;
  tipo_relacao: string;
  descricao?: string;
};

type IncomingFicha = {
  tipo: string;
  titulo: string;
  resumo?: string;
  conteudo?: string;
  tags?: string[];
  aparece_em?: string;
  codigo?: string;
  descricao_data?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  granularidade_data?: string | null;
  camada_temporal?: string | null;
  ano_diegese?: number | null;
  meta?: any;
  relations?: IncomingRelation[];
};

// Helpers... (slugify, prefixes, etc. iguais ao anterior)
function slugify(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function normalizeEpisode(unitNumber: string) { const onlyDigits = (unitNumber || "").replace(/\D+/g, ""); return onlyDigits ? String(parseInt(onlyDigits, 10)) : "0"; }

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

function getWorldPrefix(world: any): string {
  const keyFromId = (world.id || "").toLowerCase().trim();
  if (WORLD_PREFIX_MAP[keyFromId]) return WORLD_PREFIX_MAP[keyFromId];
  const nameKey = (world.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (WORLD_PREFIX_MAP[nameKey]) return WORLD_PREFIX_MAP[nameKey];
  const parts = nameKey.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  const initials = parts.map((p:string) => p[0]).join("");
  return initials.toUpperCase().slice(0, 4) || "XX";
}

const TYPE_PREFIX_MAP: Record<string, string> = {
  personagem: "PS",
  local: "LO",
  conceito: "CO", // <-- BUG CORRIGIDO
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
  const key = tipo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (TYPE_PREFIX_MAP[key]) return TYPE_PREFIX_MAP[key];
  return key.slice(0, 2).toUpperCase() || "FX";
}

// Helpers de Código
async function generateAutomaticCode(opts: { fichaId: string; world: any; tipo: string; unitNumber: string; supabase: any; }): Promise<string | null> {
  const { fichaId, world, tipo, unitNumber, supabase } = opts;
  const worldPrefix = getWorldPrefix(world);
  const normalizedTipo = tipo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
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

  const { data: existing } = await supabase.from("codes").select("code").ilike("code", `${basePrefix}%`);
  let nextNumber = 1;
  if (appendSequence && existing && existing.length > 0) {
    for (const row of existing) {
      const code: string = (row as any).code || "";
      const match = code.match(/(\d+)$/);
      if (match) { const n = parseInt(match[1], 10); if (!Number.isNaN(n) && n >= nextNumber) nextNumber = n + 1; }
    }
  }
  const finalCode = appendSequence ? `${basePrefix}${nextNumber}` : basePrefix;
  await supabase.from("codes").insert({ ficha_id: fichaId, code: finalCode });
  await supabase.from("fichas").update({ codigo: finalCode }).eq("id", fichaId);
  return finalCode;
}

async function applyCodeForFicha(opts: { fichaId: string; world: any; tipo: string; unitNumber: string; supabase: any; manualCode?: string | null; }): Promise<string | null> {
  const { fichaId, world, tipo, unitNumber, manualCode, supabase } = opts;
  const trimmed = (manualCode ?? "").trim();
  if (trimmed.length > 0) {
    await supabase.from("codes").insert({ ficha_id: fichaId, code: trimmed });
    await supabase.from("fichas").update({ codigo: trimmed }).eq("id", fichaId);
    return trimmed;
  }
  return generateAutomaticCode({ fichaId, world, tipo, unitNumber, supabase });
}

// Main Save Handler
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let clientToUse = supabase;
    let userId = user?.id;

    if (!userId && req.headers.get("x-user-id") && supabaseAdmin) {
        clientToUse = supabaseAdmin;
        userId = req.headers.get("x-user-id")!;
    }

    if (!userId) return NextResponse.json({ error: "Acesso negado." }, { status: 401 });

    const body = await req.json();
    const { worldId, unitNumber, fichas } = body;
    const epNumber = normalizeEpisode(unitNumber);
    
    // DEBUG: Logar quantas fichas têm relações
    const fichasComRelacoes = fichas.filter((f: IncomingFicha) => f.relations && f.relations.length > 0);
    console.log(`[SAVE] 🔍 DEBUG: ${fichas.length} fichas recebidas, ${fichasComRelacoes.length} têm campo 'relations'`);
    
    if (fichasComRelacoes.length > 0) {
        console.log(`[SAVE] 🔍 DEBUG: Primeira ficha com relações:`, JSON.stringify(fichasComRelacoes[0], null, 2));
    }

    const { data: worldData } = await clientToUse.from("worlds").select("*").eq("id", worldId).single();
    if (!worldData) throw new Error("Mundo não encontrado");
    const worldName = worldData.nome || "Mundo Desconhecido";
    
    // FORMATO PADRÃO DO APARECE EM
    const currentAppearance = `Mundo: ${worldName}; Episódio: ${epNumber}`;

    const saved = [];

    for (const ficha of fichas) {
        const titulo = ficha.titulo.trim();
        const slug = slugify(titulo);
        if (!titulo) continue;

        // Tenta achar ficha existente
        const { data: existing } = await clientToUse
            .from("fichas")
            .select("id, conteudo, aparece_em")
            .eq("world_id", worldId)
            .eq("slug", slug)
            .maybeSingle();

        if (existing) {
            // MERGE: Anexa novo conteúdo e atualiza locais
            let finalConteudo = existing.conteudo || "";
            if (ficha.conteudo && !finalConteudo.includes(ficha.conteudo.slice(0, 50))) {
                finalConteudo += `\n\n---\n[Adicionado em ${new Date().toLocaleDateString()} via Ep. ${epNumber}]:\n${ficha.conteudo}`;
            }

            let finalApareceEm = existing.aparece_em || "";
            if (!finalApareceEm.includes(`Episódio: ${epNumber}`)) {
                finalApareceEm = finalApareceEm ? `${finalApareceEm}\n${currentAppearance}` : currentAppearance;
            }

            await clientToUse.from("fichas").update({
                conteudo: finalConteudo,
                aparece_em: finalApareceEm,
                updated_at: new Date().toISOString()
            }).eq("id", existing.id);
            
            saved.push({ id: existing.id, status: "updated" });

        } else {
            // INSERT
            const insertData = {
                world_id: worldId,
                titulo,
                slug,
                tipo: ficha.tipo,
                resumo: ficha.resumo,
                conteudo: ficha.conteudo,
                aparece_em: currentAppearance,
                tags: (ficha.tags || []).join(", "),
                episodio: epNumber,
                user_id: userId,
                data_inicio: ficha.data_inicio || null,
                data_fim: ficha.data_fim || null,
                granularidade_data: ficha.granularidade_data || "vago",
                camada_temporal: ficha.camada_temporal || "linha_principal",
                descricao_data: ficha.descricao_data || null,
                ano_diegese: ficha.ano_diegese || null
            };

            const { data: inserted } = await clientToUse.from("fichas").insert(insertData).select("id").single();
            
            if (inserted) {
                const fichaId = inserted.id;
                await applyCodeForFicha({
                    fichaId,
                    world: worldData,
                    tipo: ficha.tipo,
                    unitNumber,
                    manualCode: ficha.codigo,
                    supabase: clientToUse
                });
                saved.push({ id: fichaId, status: "created" });
            }
        }
    }

    // Salvar relações entre fichas
    console.log("[SAVE] Processando relações entre fichas...");
    let relationsCreated = 0;
    
    for (const ficha of fichas) {
        if (!ficha.relations || ficha.relations.length === 0) continue;
        
        // Buscar ID da ficha de origem pelo título
        const sourceSlug = slugify(ficha.titulo);
        const { data: sourceFicha } = await clientToUse
            .from("fichas")
            .select("id")
            .eq("world_id", worldId)
            .eq("slug", sourceSlug)
            .maybeSingle();
        
        if (!sourceFicha) {
            console.log(`[SAVE] Ficha de origem não encontrada: ${ficha.titulo}`);
            continue;
        }
        
        for (const rel of ficha.relations) {
            // Buscar ID da ficha de destino pelo título
            const targetSlug = slugify(rel.target_titulo);
            const { data: targetFicha } = await clientToUse
                .from("fichas")
                .select("id")
                .eq("world_id", worldId)
                .eq("slug", targetSlug)
                .maybeSingle();
            
            if (!targetFicha) {
                console.log(`[SAVE] Ficha de destino não encontrada: ${rel.target_titulo}`);
                continue;
            }
            
            // Verificar se a relação já existe (A->B)
            const { data: existingRelation } = await clientToUse
                .from("lore_relations")
                .select("id")
                .eq("source_ficha_id", sourceFicha.id)
                .eq("target_ficha_id", targetFicha.id)
                .eq("tipo_relacao", rel.tipo_relacao)
                .maybeSingle();
            
            if (existingRelation) {
                console.log(`[SAVE] Relação já existe: ${ficha.titulo} -> ${rel.target_titulo}`);
                continue;
            }
            
            // Verificar se a relação inversa já existe (B->A) para relações simétricas
            const symmetricRelations = ['amigo_de', 'inimigo_de', 'aliado_de', 'rival_de', 'irmão_de', 'casado_com', 'noivo_de'];
            if (symmetricRelations.includes(rel.tipo_relacao)) {
                const { data: reverseRelation } = await clientToUse
                    .from("lore_relations")
                    .select("id")
                    .eq("source_ficha_id", targetFicha.id)
                    .eq("target_ficha_id", sourceFicha.id)
                    .eq("tipo_relacao", rel.tipo_relacao)
                    .maybeSingle();
                
                if (reverseRelation) {
                    console.log(`[SAVE] Relação inversa já existe (deduplicando): ${rel.target_titulo} -> ${ficha.titulo}`);
                    continue;
                }
            }
            
            // Criar nova relação
            const { error: relError } = await clientToUse
                .from("lore_relations")
                .insert({
                    source_ficha_id: sourceFicha.id,
                    target_ficha_id: targetFicha.id,
                    tipo_relacao: rel.tipo_relacao,
                    descricao: rel.descricao || null,
                    user_id: userId
                });
            
            if (relError) {
                console.error(`[SAVE] Erro ao criar relação:`, relError);
            } else {
                relationsCreated++;
                console.log(`[SAVE] ✅ Relação criada: ${ficha.titulo} -[${rel.tipo_relacao}]-> ${rel.target_titulo}`);
            }
        }
    }
    
    console.log(`[SAVE] ✅ Total de ${relationsCreated} relações criadas`);

    return NextResponse.json({ ok: true, saved, relationsCreated });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
