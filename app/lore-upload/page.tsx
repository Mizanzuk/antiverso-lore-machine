"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { GRANULARIDADES, normalizeGranularidade } from "@/lib/dates/granularidade";

// --- TIPOS E CONSTANTES ---
const LORE_TYPES = [
  { value: "personagem", label: "Personagem" },
  { value: "local", label: "Local" },
  { value: "evento", label: "Evento" },
  { value: "empresa", label: "Empresa" },
  { value: "agencia", label: "Agência" },
  { value: "midia", label: "Mídia" },
  { value: "conceito", label: "Conceito" },
  { value: "epistemologia", label: "Epistemologia" },
  { value: "regra_de_mundo", label: "Regra de Mundo" },
  { value: "objeto", label: "Objetos" },
  { value: "roteiro", label: "Roteiro" },
  { value: "registro_anomalo", label: "Registro Anômalo" },
];

const CAMADAS_TEMPORAIS = [
  { value: "linha_principal", label: "Linha Principal" },
  { value: "flashback", label: "Flashback" },
  { value: "flashforward", label: "Flashforward" },
  { value: "sonho_visao", label: "Sonho / Visão" },
  { value: "mundo_alternativo", label: "Mundo Alternativo" },
  { value: "historico_antigo", label: "Histórico / Antigo" },
  { value: "outro", label: "Outro" },
];

type Universe = { id: string; nome: string; };
type World = { id: string; nome: string; universe_id?: string; has_episodes?: boolean; prefixo?: string; };
type SuggestedFicha = { id: string; tipo: string; titulo: string; resumo: string; conteudo: string; tags: string; aparece_em: string; codigo?: string; ano_diegese?: number | null; descricao_data?: string; data_inicio?: string; data_fim?: string; granularidade_data?: string; camada_temporal?: string; meta?: any; };
type ExtractResponse = { fichas: any[]; };

function getTypePrefix(tipo: string): string {
  const map: Record<string, string> = { personagem: "PS", local: "LO", evento: "EV", roteiro: "RT" };
  return map[tipo] || tipo.slice(0,2).toUpperCase();
}

function createEmptyFicha(id: string): SuggestedFicha {
  return { id, tipo: "conceito", titulo: "", resumo: "", conteudo: "", tags: "", aparece_em: "", codigo: "", ano_diegese: null, descricao_data: "", data_inicio: "", data_fim: "", granularidade_data: "indefinido", camada_temporal: "linha_principal", meta: {} };
}

function normalizeEpisode(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? trimmed.padStart(2, "0") : trimmed;
}

function getWorldPrefix(world: World | null): string {
  if (!world) return "";
  const nome = (world.nome || "").toUpperCase();
  if (nome.startsWith("ARQUIVOS")) return "AV";
  if (nome.startsWith("ANTIVERSO")) return "ANT";
  return nome.slice(0, 3);
}

export default function LoreUploadPage() {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState<string>("");
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string>("");
  
  const [unitNumber, setUnitNumber] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [text, setText] = useState("");
  
  const [suggestedFichas, setSuggestedFichas] = useState<SuggestedFicha[]>([]);
  const [editingFicha, setEditingFicha] = useState<SuggestedFicha | null>(null);
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser.from("universes").select("id, nome").order("nome").then(({ data }) => {
      if (data) {
        setUniverses(data);
        if(data.length > 0) setSelectedUniverseId(data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if(!selectedUniverseId) return;
    supabaseBrowser.from("worlds").select("*").eq("universe_id", selectedUniverseId).order("ordem").then(({ data }) => {
      if (data) {
        setWorlds(data);
        if(data.length > 0) setSelectedWorldId(data[0].id);
        else setSelectedWorldId("");
      }
    });
  }, [selectedUniverseId]);

  async function handleExtractFichas() {
    setError(null); setSuccessMessage(null);
    if (!selectedWorldId || !text.trim()) { setError("Selecione mundo e cole texto."); return; }
    setIsExtracting(true);
    try {
      const res = await fetch("/api/lore/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, worldId: selectedWorldId, documentName, unitNumber })
      });
      if (!res.ok) throw new Error("Erro na extração");
      const data = await res.json();
      
      const mapped = (data.fichas || []).map((f: any) => ({
        ...createEmptyFicha(crypto.randomUUID()),
        ...f,
        tipo: f.tipo || "conceito",
        tags: (f.tags || []).join(", ")
      }));
      setSuggestedFichas(mapped);
      setSuccessMessage(`${mapped.length} fichas extraídas.`);
    } catch (err: any) { setError(err.message); }
    finally { setIsExtracting(false); }
  }

  async function handleSaveFichas() {
    if (suggestedFichas.length === 0) return;
    setIsSaving(true);
    try {
      const payload = {
        worldId: selectedWorldId,
        unitNumber: unitNumber || "0",
        fichas: suggestedFichas.map(f => ({
          ...f,
          tags: f.tags.split(",").map(t => t.trim()).filter(Boolean)
        }))
      };
      const res = await fetch("/api/lore/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      setSuggestedFichas([]);
      setText("");
      setSuccessMessage("Salvo com sucesso!");
    } catch (err: any) { setError(err.message); }
    finally { setIsSaving(false); }
  }

  const worldHasEpisodes = worlds.find(w => w.id === selectedWorldId)?.has_episodes !== false;

  return (
    <div className="h-screen bg-black text-zinc-100 flex flex-col">
      <header className="h-10 border-b border-white/10 flex items-center justify-between px-4 bg-black/40">
        <div className="flex items-center gap-4 text-xs">
          <a href="/" className="text-gray-300 hover:text-white">← Home</a>
          <a href="/lore-admin" className="text-gray-400 hover:text-white text-[11px]">Catálogo</a>
          <a href="/lore-admin/timeline" className="text-gray-400 hover:text-white text-[11px]">Timeline</a>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-6">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold">Upload de Texto</h1>
            <p className="text-sm text-zinc-400">Envie roteiros ou documentos para extração.</p>
          </header>

          {error && <div className="text-red-400 text-xs bg-red-900/20 p-2 border border-red-900 rounded">{error}</div>}
          {successMessage && <div className="text-emerald-400 text-xs bg-emerald-900/20 p-2 border border-emerald-900 rounded">{successMessage}</div>}

          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-zinc-400">Universo</label>
              <select className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={selectedUniverseId} onChange={(e) => setSelectedUniverseId(e.target.value)}>
                {universes.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-zinc-400">Mundo de Destino</label>
              <select className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={selectedWorldId} onChange={(e) => setSelectedWorldId(e.target.value)}>
                {worlds.map((world) => <option key={world.id} value={world.id}>{world.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-zinc-400">Episódio / Capítulo #</label>
              <input className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder={worldHasEpisodes ? "Ex.: 6" : "N/A"} disabled={!worldHasEpisodes} />
            </div>
          </section>

          <section className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-zinc-400">Texto</label>
            <textarea className="w-full min-h-[180px] rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} placeholder="Cole aqui o texto..." />
          </section>

          {isExtracting && <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden"><div className="bg-fuchsia-600 h-full w-full animate-pulse"></div></div>}

          <div className="flex justify-center">
            <button onClick={handleExtractFichas} disabled={isExtracting} className="w-full md:w-auto px-6 py-2 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-60 text-sm font-medium">{isExtracting ? "Extraindo..." : "Extrair Fichas"}</button>
          </div>

          {suggestedFichas.length > 0 && (
            <div className="space-y-2">
               <div className="flex justify-between items-center">
                 <h3 className="text-sm font-bold text-zinc-400">Fichas Sugeridas ({suggestedFichas.length})</h3>
                 <button onClick={() => setSuggestedFichas([])} className="text-xs text-zinc-500">Limpar</button>
               </div>
               {suggestedFichas.map(f => (
                 <div key={f.id} className="bg-zinc-900 p-3 rounded border border-zinc-800 text-xs">
                   <div className="font-bold text-white">{f.titulo} <span className="text-zinc-500 font-normal">({f.tipo})</span></div>
                   <div className="text-zinc-400 truncate">{f.resumo}</div>
                 </div>
               ))}
               <button onClick={handleSaveFichas} disabled={isSaving} className="w-full bg-emerald-600 py-2 rounded font-bold text-sm hover:bg-emerald-500">{isSaving ? "Salvando..." : "Salvar Tudo"}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
