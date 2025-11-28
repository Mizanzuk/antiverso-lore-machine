import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase"; 

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// TIPOS
type FichaMeta = {
  periodo_diegese?: string | null;
  status?: "ativo" | "obsoleto" | "mesclado";
  relacoes?: {
    tipo: string;
    alvo_titulo?: string;
    alvo_id?: string;
  }[];
  [key: string]: any;
};

type ExtractedFicha = {
  tipo: string;
  titulo: string;
  resumo: string;
  conteudo: string;
  tags: string[];
  ano_diegese: number | null;
  aparece_em: string;
  descricao_data?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  granularidade_data?: string | null;
  camada_temporal?: string | null;
  meta?: FichaMeta;
};

function normalizeEpisode(unitNumber: string): string {
  const onlyDigits = (unitNumber || "").replace(/\D+/g, "");
  if (!onlyDigits) return "0";
  return String(parseInt(onlyDigits, 10));
}

function splitTextIntoChunks(text: string, maxChars = 12000): string[] {
  if (!text || text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let currentChunk = "";
  const paragraphs = text.split("\n");
  for (const p of paragraphs) {
    if ((currentChunk.length + p.length) > maxChars) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += p + "\n";
  }
  if (currentChunk.trim()) chunks.push(currentChunk);
  return chunks;
}

async function processChunk(text: string, chunkIndex: number, totalChunks: number, allowedTypes: string[]): Promise<ExtractedFicha[]> {
    const typeInstructions = allowedTypes.map((t) => `"${t}"`).join(", ");
    
    const systemPrompt = `
  Você é o Motor de Extração de Lore do AntiVerso.
  Sua missão é DECOMPOR o texto em uma lista de objetos JSON (fichas), preenchendo o máximo de campos possível.
  
  ⚠️ MODO DE ALTA COMPLETUDE:
  - Quebre o texto em várias fichas.
  - Gere TAGS ricas e RELAÇÕES entre os personagens.
  
  TIPOS PERMITIDOS: ${typeInstructions}
  
  ### EXEMPLO DE COMPORTAMENTO ESPERADO (Siga este padrão):
  Texto: "Em 1999, João (filho de Maria e inimigo de Pedro) entrou na Caverna Escura sentindo medo."
  Saída JSON:
  {
    "fichas": [
      { 
        "tipo": "personagem", 
        "titulo": "João", 
        "resumo": "Filho de Maria que explorou a caverna.", 
        "tags": ["medo", "exploração", "família", "protagonista"],
        "meta": { 
           "relacoes": [
              { "tipo": "filho_de", "alvo_titulo": "Maria" },
              { "tipo": "inimigo_de", "alvo_titulo": "Pedro" }
           ] 
        }
      },
      { 
        "tipo": "local", 
        "titulo": "Caverna Escura", 
        "resumo": "Local perigoso explorado por João.",
        "tags": ["perigo", "subterrâneo", "escuro"]
      },
      { 
        "tipo": "evento", 
        "titulo": "Exploração da Caverna", 
        "data_inicio": "1999-01-01", 
        "granularidade_data": "ano",
        "descricao_data": "Em 1999", 
        "camada_temporal": "linha_principal", 
        "tags": ["incidente", "1999"],
        "resumo": "Momento em que João entra na caverna." 
      }
    ]
  }

  ### SUAS DIRETRIZES:
  1. **PERSONAGENS & RELAÇÕES (CRUCIAL):**
     - Se Personagem A interage, menciona ou é parente de Personagem B, preencha 'meta.relacoes'.
     - Use tipos como: 'amigo_de', 'pai_de', 'inimigo_de', 'menciona', 'interage_com'.
  
  2. **TAGS (OBRIGATÓRIO):**
     - Gere de 3 a 6 tags para CADA ficha.
     - Inclua: sentimentos (ex: "medo"), temas (ex: "traição"), objetos associados ou arquétipos.
  
  3. **EVENTOS:**
     - Se houver datas, crie fichas de evento com 'data_inicio' (YYYY-MM-DD).
  
  Retorne APENAS o JSON válido com a chave "fichas".
  `.trim();
  
    const userPrompt = `Texto para análise:\n"""${text}"""`;
  
    try {
      const completion = await openai!.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.4, // Levemente aumentado para favorecer geração de tags criativas
        max_tokens: 4000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });
      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) return [];
      const parsed = JSON.parse(rawContent);
      return Array.isArray(parsed.fichas) ? parsed.fichas : [];
    } catch (err) {
      console.error(`Erro chunk ${chunkIndex}:`, err);
      return [];
    }
}

function deduplicateFichas(allFichas: ExtractedFicha[]): ExtractedFicha[] {
    const map = new Map<string, ExtractedFicha>();
    for (const f of allFichas) {
      const safeTitulo = (f.titulo || "").toLowerCase().trim();
      const safeTipo = (f.tipo || "conceito").toLowerCase().trim();

      if (!safeTitulo) continue; 

      const key = `${safeTipo}-${safeTitulo}`;
      
      if (map.has(key)) {
        const existing = map.get(key)!;
        const safeConteudo = f.conteudo || "";
        const existingConteudo = existing.conteudo || "";

        if (safeConteudo && !existingConteudo.includes(safeConteudo.slice(0, 20))) {
            existing.conteudo += `\n\n[Mais]: ${safeConteudo}`;
        }
        
        // Merge inteligente de Tags
        const mergedTags = new Set([...(existing.tags || []), ...(f.tags || [])]);
        existing.tags = Array.from(mergedTags);
        
        // Merge inteligente de Relações
        if (f.meta?.relacoes) {
          const existingRels = existing.meta?.relacoes || [];
          // Evita duplicatas exatas de relação
          const newRels = f.meta.relacoes.filter(r => 
              !existingRels.some(er => er.alvo_titulo === r.alvo_titulo && er.tipo === r.tipo)
          );
          existing.meta = { ...existing.meta, relacoes: [...existingRels, ...newRels] };
        }
        
        if (!existing.data_inicio && f.data_inicio) {
           existing.data_inicio = f.data_inicio;
           existing.data_fim = f.data_fim;
           existing.ano_diegese = f.ano_diegese;
           existing.descricao_data = f.descricao_data;
           existing.granularidade_data = f.granularidade_data;
           existing.camada_temporal = f.camada_temporal;
        }
      } else {
        f.titulo = f.titulo || "Sem Título";
        f.tipo = f.tipo || "conceito";
        f.conteudo = f.conteudo || "";
        f.tags = f.tags || [];
        map.set(key, f);
      }
    }
    return Array.from(map.values());
}

export async function POST(req: NextRequest) {
  try {
    if (!openai) {
      return NextResponse.json({ error: "OPENAI_API_KEY não configurada." }, { status: 500 });
    }
    
    // Auth com Fallback
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

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
      return NextResponse.json({ error: "Unauthorized (401)." }, { status: 401 });
    }

    // 1. BUSCAR CATEGORIAS DINÂMICAS DO BANCO
    let allowedTypes = ["personagem", "local", "evento", "conceito", "roteiro", "objeto", "organizacao", "registro_anomalo"];
    try {
        const { data: catData } = await clientToUse.from("lore_categories").select("slug");
        if (catData && catData.length > 0) {
            allowedTypes = catData.map((c: any) => c.slug);
        }
    } catch (e) {
        console.warn("Aviso: Falha ao carregar categorias dinâmicas, usando fallback.", e);
    }

    const body = await req.json().catch(() => ({}));
    const { worldId, unitNumber, text, documentName } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Campo 'text' é obrigatório." }, { status: 400 });
    }

    // START STREAMING
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
         const send = (data: any) => {
             controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
         };

         try {
            send({ type: "progress", percentage: 5, message: "Iniciando análise do roteiro..." });

            // 2. SALVAR ROTEIRO (BACKUP)
            let roteiroId: string | null = null;
            const episodio = typeof unitNumber === "string" ? normalizeEpisode(unitNumber) : "0";
            const tituloDoc = documentName?.trim() || "Roteiro Processado";

            if (clientToUse) {
              try {
                const { data, error } = await clientToUse
                  .from("roteiros")
                  .insert({ 
                    world_id: worldId ?? null, 
                    titulo: tituloDoc, 
                    conteudo: text, 
                    episodio,
                  })
                  .select("id")
                  .single();
                if (!error && data) roteiroId = data.id;
              } catch (err) {
                console.warn("Aviso: Erro ao salvar roteiro backup.", err);
              }
            }
            
            send({ type: "progress", percentage: 10, message: "Roteiro salvo. Dividindo texto..." });

            // 3. DIVIDIR E CONQUISTAR
            const chunks = splitTextIntoChunks(text);
            const totalChunks = chunks.length;
            let allRawFichas: ExtractedFicha[] = [];

            for (let i = 0; i < totalChunks; i++) {
                const progressBase = 10;
                const progressSpace = 80; // 10% a 90%
                const currentPct = Math.round(progressBase + ((i / totalChunks) * progressSpace));
                
                send({ type: "progress", percentage: currentPct, message: `Analisando parte ${i + 1} de ${totalChunks}...` });
                
                const chunkFichas = await processChunk(chunks[i], i, totalChunks, allowedTypes);
                allRawFichas.push(...chunkFichas);
            }

            send({ type: "progress", percentage: 90, message: "Consolidando e gerando tags..." });

            // 4. DEDUPLICAÇÃO
            const uniqueFichas = deduplicateFichas(allRawFichas);

            // 5. FICHA DO ROTEIRO
            const fichaRoteiro: ExtractedFicha = {
              tipo: "roteiro",
              titulo: tituloDoc,
              resumo: `Ficha técnica automática do documento/episódio ${episodio}.`,
              conteudo: text,
              tags: ["roteiro", `ep-${episodio}`, "documento_original"],
              ano_diegese: null,
              aparece_em: `Episódio ${episodio}`,
              meta: { status: "ativo" }
            };

            uniqueFichas.unshift(fichaRoteiro);

            const cleanFichas = uniqueFichas.map(f => ({
              ...f,
              titulo: (f.titulo || "").trim(),
              tipo: (f.tipo || "conceito").toLowerCase().trim(),
              meta: { ...f.meta, relacoes: f.meta?.relacoes || [] }
            }));

            send({ type: "progress", percentage: 100, message: "Concluído!" });
            send({ type: "complete", fichas: cleanFichas, roteiroId });
            
            controller.close();

         } catch (err: any) {
            console.error("Erro no stream:", err);
            send({ type: "error", message: err.message || "Erro desconhecido no servidor." });
            controller.close();
         }
      }
    });

    return new NextResponse(stream, { 
        headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
    });

  } catch (err: any) {
    console.error("Erro fatal:", err);
    return NextResponse.json({ error: `Erro interno: ${err.message}` }, { status: 500 });
  }
}
