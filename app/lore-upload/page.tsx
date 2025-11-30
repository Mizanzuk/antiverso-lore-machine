"use client";

import { useEffect, useState, ChangeEvent, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { GRANULARIDADES, normalizeGranularidade } from "@/lib/dates/granularidade";

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
  { value: "relato", label: "Relato / Memória" },
  { value: "publicacao", label: "Publicação" },
];

type Universe = { id: string; nome: string; };
type World = { id: string; nome: string | null; descricao?: string | null; ordem?: number | null; prefixo?: string | null; has_episodes?: boolean | null; descricao_longa?: string | null; universe_id?: string | null; is_root?: boolean; };
type SuggestedFicha = { id: string; tipo: string; titulo: string; resumo: string; conteudo: string; tags: string; aparece_em: string; codigo?: string; ano_diegese?: number | null; descricao_data?: string; data_inicio?: string; data_fim?: string; granularidade_data?: string; camada_temporal?: string; meta?: any; };
type ApiFicha = { tipo?: string; titulo?: string; resumo?: string; conteudo?: string; tags?: string[]; aparece_em?: string; ano_diegese?: number | null; descricao_data?: string | null; data_inicio?: string | null; data_fim?: string | null; granularidade_data?: string | null; camada_temporal?: string | null; meta?: any; };
type ExtractResponse = { fichas: ApiFicha[]; };
type CatalogResponse = { worlds: World[]; entities: ApiFicha[]; types: { id: string; label: string }[]; };

function createEmptyFicha(id: string): SuggestedFicha { return { id, tipo: "conceito", titulo: "", resumo: "", conteudo: "", tags: "", aparece_em: "", codigo: "", ano_diegese: null, descricao_data: "", data_inicio: "", data_fim: "", granularidade_data: "indefinido", camada_temporal: "linha_principal", meta: {}, }; }
function normalizeEpisode(raw: string): string | null { if (!raw) return null; const trimmed = raw.trim(); if (!trimmed) return null; if (/^\d+$/.test(trimmed)) { return trimmed.padStart(2, "0"); } return trimmed; }
function getWorldPrefix(world: World | null): string { if (!world) return ""; if (world.prefixo && world.prefixo.trim()) { return world.prefixo.trim(); } const nome = (world.nome || world.id || "").toUpperCase(); const cleaned = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9\s]/g, " ").trim(); if (!cleaned) return ""; if (cleaned.startsWith("ARQUIVOS VERMELHOS")) return "AV"; if (cleaned.startsWith("TORRE DE VERA CRUZ")) return "TVC"; if (cleaned.startsWith("EVANGELHO DE OR")) return "EO"; if (cleaned.startsWith("CULTO DE OR")) return "CO"; if (cleaned.startsWith("ANTIVERSO")) return "ANT"; if (cleaned.startsWith("ARIS")) return "ARIS"; const words = cleaned.split(/\s+/).filter(Boolean); if (words.length === 1) { return words[0].slice(0, 3).toUpperCase(); } const initials = words.map((p) => p[0]).join(""); return initials.slice(0, 4).toUpperCase(); }
const TYPE_PREFIX_MAP: Record<string, string> = { personagem: "PS", local: "LO", conceito: "CC", evento: "EV", midia: "MD", "mídia": "MD", empresa: "EM", agencia: "AG", "agência": "AG", registro_anomalo: "RA", "registro anômalo": "RA", roteiro: "RT", };
function getTypePrefix(tipo: string): string { const key = (tipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); if (TYPE_PREFIX_MAP[key]) return TYPE_PREFIX_MAP[key]; return key.slice(0, 2).toUpperCase() || "XX"; }


export default function LoreUploadPage() {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState<string>(() => {
    // Tentar carregar do localStorage ao inicializar
    if (typeof window !== "undefined") {
      return localStorage.getItem("selectedUniverseId") || "";
    }
    return "";
  });
  const [userId, setUserId] = useState<string | null>(null);

  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string>("");
  const [unitNumber, setUnitNumber] = useState<string>("");
  const [documentName, setDocumentName] = useState<string>("");
  const [text, setText] = useState<string>("");

  const [loreTypes, setLoreTypes] = useState<{value: string, label: string}[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [suggestedFichas, setSuggestedFichas] = useState<SuggestedFicha[]>([]);
  const [editingFicha, setEditingFicha] = useState<SuggestedFicha | null>(null);

  // PROGRESS STATES
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractStatus, setExtractStatus] = useState("");
  const [currentStep, setCurrentStep] = useState(0);

  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [showNewWorldModal, setShowNewWorldModal] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [newWorldDescription, setNewWorldDescription] = useState("");
  const [newWorldHasEpisodes, setNewWorldHasEpisodes] = useState(true);
  const [isCreatingWorld, setIsCreatingWorld] = useState(false);

  const [showNewUniverseModal, setShowNewUniverseModal] = useState(false);
  const [newUniverseName, setNewUniverseName] = useState("");
  const [newUniverseDescription, setNewUniverseDescription] = useState("");
  const [isCreatingUniverse, setIsCreatingUniverse] = useState(false);

  const [existingEpisodes, setExistingEpisodes] = useState<string[]>([]);
  const [showNewEpisodeInput, setShowNewEpisodeInput] = useState(false);

  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const [consistencyReport, setConsistencyReport] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const getUser = async () => {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (session) setUserId(session.user.id);
    };
    getUser();
  }, []);

  useEffect(() => {
    if (!userId) return;
    async function fetchUniverses() {
      const { data } = await supabaseBrowser.from("universes").select("id, nome").order("nome");
      if (data) {
        setUniverses(data);
        if (data.length > 0) {
          const savedUniId = typeof window !== "undefined" ? localStorage.getItem("selectedUniverseId") : null;
          const initialUniId = (savedUniId && data.some(u => u.id === savedUniId)) ? savedUniId : data[0].id;
          setSelectedUniverseId(initialUniId);
          if (typeof window !== "undefined") localStorage.setItem("selectedUniverseId", initialUniId);
        }
      }
    }
    fetchUniverses();
  }, [userId]);

  const fetchWorldsAndTypes = async () => {
      if (!userId) return;
      setError(null);
      try {
        const params = new URLSearchParams({ universeId: selectedUniverseId });
        const res = await fetch(`/api/catalog?${params.toString()}`, {
            headers: { 'x-user-id': userId }
        });
        
        if (!res.ok) throw new Error(`Falha ao carregar Mundos. Status: ${res.status}`);
        
        const data = (await res.json()) as CatalogResponse;
        
        if (data.types && data.types.length > 0) {
            const types = data.types.map(t => ({ value: t.id, label: t.label }));
            setLoreTypes(types);
            // Inicializar com todas as categorias selecionadas
            setSelectedCategories(types.map(t => t.value));
        }

        const rootWorld = data.worlds.find(w => w.is_root);
        const childWorlds = data.worlds.filter(w => !w.is_root);
        
        let worldList: World[] = [];
        if (rootWorld) worldList.push(rootWorld);
        worldList = [...worldList, ...childWorlds];

        if (worldList.length > 0) {
          setWorlds(worldList);
          if (!worldList.find(w => w.id === selectedWorldId)) setSelectedWorldId(worldList[0].id);
        } else {
          setWorlds([]);
          setSelectedWorldId("");
        }
        
        // Carregar episódios existentes do mundo selecionado
        if (selectedWorldId) {
          await fetchExistingEpisodes(selectedWorldId);
        }
      } catch (err: any) {
        console.error("Erro ao carregar dados:", err);
        setError(err.message || "Erro ao carregar dados.");
      }
  }
  
  useEffect(() => {
    if (!selectedUniverseId || !userId) return;
    fetchWorldsAndTypes();
  }, [selectedUniverseId, userId]);

  async function fetchExistingEpisodes(worldId: string) {
    try {
      const { data } = await supabaseBrowser
        .from("fichas")
        .select("episodio")
        .eq("world_id", worldId)
        .not("episodio", "is", null)
        .order("episodio", { ascending: true });
      
      if (data) {
        const episodes = Array.from(new Set(data.map(f => f.episodio).filter(Boolean)));
        setExistingEpisodes(episodes);
      }
    } catch (err) {
      console.error("Erro ao carregar episódios:", err);
    }
  }

  function handleWorldChange(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === "create_new") { setShowNewWorldModal(true); return; }
    setSelectedWorldId(value);
    setUnitNumber("");
    setShowNewEpisodeInput(false);
    fetchExistingEpisodes(value);
  }
  
  function handleUniverseChange(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === "create_new_universe") { setShowNewUniverseModal(true); return; }
    setSelectedUniverseId(value);
    if (typeof window !== "undefined") localStorage.setItem("selectedUniverseId", value);
  }
  
  function handleEpisodeChange(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === "new_episode") {
      setShowNewEpisodeInput(true);
      setUnitNumber("");
    } else {
      setShowNewEpisodeInput(false);
      setUnitNumber(value);
    }
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingFile(true);
    setError(null);
    if (!documentName) setDocumentName(file.name.replace(/\.[^/.]+$/, ""));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || "Erro ao ler arquivo"); }
      const data = await res.json();
      if (data.text) { setText(data.text); setSuccessMessage("Arquivo lido com sucesso!"); }
    } catch (err: any) { console.error(err); setError(err.message || "Erro ao processar arquivo."); } finally { setIsParsingFile(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  async function handleCreateWorldFromModal() {
    if (!newWorldName.trim()) { setError("Dê um nome ao novo Mundo."); return; }
    if (!selectedUniverseId) { setError("Selecione um Universo primeiro."); return; }
    setIsCreatingWorld(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const baseId = newWorldName.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const newId = `${baseId}_${Date.now().toString().slice(-4)}`;
      const payload: any = { id: newId, nome: newWorldName.trim(), descricao: newWorldDescription.trim() || null, has_episodes: newWorldHasEpisodes, tipo: "mundo_ficcional", universe_id: selectedUniverseId };
      const { data, error } = await supabaseBrowser.from("worlds").insert([payload]).select("*");
      if (error) { console.error(error); setError("Erro ao criar novo Mundo."); return; }
      const inserted = (data?.[0] || null) as World | null;
      if (inserted) { fetchWorldsAndTypes(); setSelectedWorldId(inserted.id); setShowNewWorldModal(false); setNewWorldName(""); setNewWorldDescription(""); setNewWorldHasEpisodes(true); setSuccessMessage("Novo Mundo criado com sucesso."); }
    } catch (err) { console.error(err); setError("Erro inesperado ao criar Mundo."); } finally { setIsCreatingWorld(false); }
  }

  function handleCancelWorldModal() { setShowNewWorldModal(false); setNewWorldName(""); setNewWorldDescription(""); setNewWorldHasEpisodes(true); }

  async function handleCreateUniverse() {
    if (!newUniverseName.trim()) { setError("Dê um nome ao novo Universo."); return; }
    if (!userId) { setError("Usuário não autenticado."); return; }
    setIsCreatingUniverse(true);
    setError(null);
    try {
      const { data: inserted, error: insertError } = await supabaseBrowser
        .from("universes")
        .insert({ 
          nome: newUniverseName.trim(),
          descricao: newUniverseDescription.trim() || null
        })
        .select("id, nome")
        .single();
      if (insertError) throw insertError;
      if (inserted) {
        setUniverses(prev => [...prev, inserted]);
        setSelectedUniverseId(inserted.id);
        if (typeof window !== "undefined") localStorage.setItem("selectedUniverseId", inserted.id);
        setShowNewUniverseModal(false);
        setNewUniverseName("");
        setNewUniverseDescription("");
        setSuccessMessage("Novo Universo criado com sucesso.");
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao criar Universo.");
    } finally {
      setIsCreatingUniverse(false);
    }
  }

  function handleCancelUniverseModal() { setShowNewUniverseModal(false); setNewUniverseName(""); setNewUniverseDescription(""); }

  // --- STREAMING EXTRACTION ---
  async function handleExtractFichas() {
    setError(null); setSuccessMessage(null);
    if (!userId) { setError("Usuário não autenticado."); return; }
    if (!selectedUniverseId) { setError("Selecione um Universo antes de extrair fichas."); return; }
    const world = worlds.find((w) => w.id === selectedWorldId) || null;
    const worldHasEpisodes = world?.has_episodes !== false;
    if (!selectedWorldId || !world) { setError("Selecione um Mundo antes de extrair fichas."); return; }
    if (worldHasEpisodes && !unitNumber.trim()) { setError("Informe o número do episódio/capítulo."); return; }
    if (!text.trim()) { setError("Cole um texto ou faça upload de um arquivo para extrair fichas."); return; }
    if (selectedCategories.length === 0) { setError("Selecione pelo menos uma categoria para extrair."); return; }
    
    setIsExtracting(true);
    setExtractProgress(0);
    setExtractStatus("Iniciando...");
    setCurrentStep(1);

    try {
      const selectedWorld = worlds.find((w) => w.id === selectedWorldId);
      const worldName = selectedWorld?.nome || selectedWorld?.id || "Mundo Desconhecido";
      
      const response = await fetch("/api/lore/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ 
          text, 
          worldId: selectedWorldId, 
          worldName, 
          documentName: documentName.trim() || null, 
          unitNumber, 
          universeId: selectedUniverseId,
          categories: selectedCategories.length > 0 ? selectedCategories : null
        }),
      });

      if (!response.ok || !response.body) {
         const errorData = await response.json().catch(() => null);
         throw new Error(errorData?.error || `Erro na conexão (status ${response.status}).`);
      }

      // LEITOR DE STREAM
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let finalFichas: ApiFicha[] = [];

      while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Guarda o resto incompleto

          for (const line of lines) {
              if (!line.trim()) continue;
              
              // Remover o prefixo "data: " do formato SSE
              let jsonLine = line.trim();
              if (jsonLine.startsWith("data:")) {
                  jsonLine = jsonLine.substring(5).trim();
              }
              
              if (!jsonLine) continue;
              
              try {
                  const data = JSON.parse(jsonLine);
                  
                  // Processar diferentes status da API
                  if (data.status === "started") {
                      setCurrentStep(2);
                      setExtractProgress(5);
                      setExtractStatus(`Iniciando extração (${data.totalChunks} chunk${data.totalChunks > 1 ? 's' : ''})...`);
                  } else if (data.status === "processing") {
                      setCurrentStep(3);
                      // Progresso mais suave: cada chunk ocupa uma faixa de progresso
                      const chunkWeight = 90 / data.totalChunks; // 90% dividido pelos chunks (5% inicial + 5% final)
                      const baseProgress = 5 + ((data.currentChunk - 1) * chunkWeight);
                      const progress = Math.min(95, Math.round(baseProgress + chunkWeight));
                      setExtractProgress(progress);
                      setExtractStatus(`Processando chunk ${data.currentChunk}/${data.totalChunks}...`);
                  } else if (data.status === "completed") {
                      setCurrentStep(4);
                      setExtractProgress(100);
                      setExtractStatus("Extração concluída!");
                      finalFichas = data.fichas || [];
                  } else if (data.error) {
                      throw new Error(data.error);
                  }
              } catch (e) {
                  console.warn("Erro ao parsear linha de stream:", e, "Linha:", jsonLine);
              }
          }
      }

      // PROCESSAMENTO FINAL
      if (finalFichas.length === 0) throw new Error("Nenhuma ficha retornada.");
      
      const prefix = getWorldPrefix(selectedWorld || null);
      const normalizedEpisode = normalizeEpisode(unitNumber || "");
      const typeCounters: Record<string, number> = {};

      const mapped: SuggestedFicha[] = finalFichas.map((rawFicha) => {
        const base = createEmptyFicha(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const tipo = rawFicha.tipo?.trim() || base.tipo;
        const tagsArray = rawFicha.tags || [];
        const tagsString = tagsArray.join(", ");
        
        // CORREÇÃO: Aqui usamos selectedWorld em vez de 'selected'
        const worldNameForAparece = selectedWorld?.nome || selectedWorld?.id || "Mundo Desconhecido";
        const appearsParts: string[] = [];
        if (worldNameForAparece) appearsParts.push(`Mundo: ${worldNameForAparece}`);
        if (normalizedEpisode) appearsParts.push(`Episódio/Capítulo: ${normalizedEpisode}`);
        if (documentName.trim()) appearsParts.push(`Documento: ${documentName.trim()}`);
        
        const appearsEmValue = appearsParts.join("\n\n");
        let codigoGerado = "";
        
        if (prefix && normalizedEpisode) {
          const typePrefix = getTypePrefix(tipo);
          if (typePrefix === "RT") { 
              codigoGerado = `${prefix}${normalizedEpisode}-Roteiro`; 
          } else { 
              if (!typeCounters[typePrefix]) typeCounters[typePrefix] = 1; 
              const count = typeCounters[typePrefix]++; 
              const counterStr = String(count).padStart(2, "0"); 
              codigoGerado = `${prefix}${normalizedEpisode}-${typePrefix}${counterStr}`; 
          }
        }
        
        const anoDiegese = typeof rawFicha.ano_diegese === "number" ? rawFicha.ano_diegese : null;
        const granularidadeData = normalizeGranularidade(rawFicha.granularidade_data, rawFicha.descricao_data);
        
        return { 
            ...base, 
            ...rawFicha,
            id: base.id, // Garante ID único local
            tags: tagsString, 
            aparece_em: appearsEmValue, 
            codigo: codigoGerado, 
            ano_diegese: anoDiegese, 
            granularidade_data: granularidadeData, 
            camada_temporal: rawFicha.camada_temporal || "linha_principal",
            meta: rawFicha.meta || {} 
        };
      });

      setSuggestedFichas(mapped);
      setSuccessMessage(`Extração concluída! ${mapped.length} fichas geradas.`);
      
    } catch (err: any) {
        console.error("Erro de extração:", err);
        setError(err.message || "Erro ao processar extração.");
    } finally {
        setIsExtracting(false);
        setCurrentStep(0);
    }
  }

  async function handleCheckConsistency() {
    if (suggestedFichas.length === 0 || !userId) return;
    setIsCheckingConsistency(true);
    setConsistencyReport(null);
    alert("Consultando Urizen, a Lei, sobre a coerência...");
    const proposalText = suggestedFichas.map(f => ` - [PROPOSTA] ${f.titulo} (${f.tipo}): Resumo: ${f.resumo} Data: ${f.descricao_data || f.ano_diegese || "N/A"} Status: ${f.meta?.status || "Ativo"}`).join("\n");
    try {
      const res = await fetch("/api/lore/consistency", { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": userId }, body: JSON.stringify({ input: proposalText, universeId: selectedUniverseId }) });
      const data = await res.json();
      if (data.analysis) { setConsistencyReport(data.analysis); } else { setConsistencyReport("Urizen, a Lei, não encontrou inconsistências óbvias nos Registros."); }
    } catch (err) { console.error(err); setConsistencyReport("Erro ao conectar com o Módulo de Coerência."); } finally { setIsCheckingConsistency(false); }
  }

  async function handleSaveFichas() {
    setError(null); setSuccessMessage(null);
    if (!userId) { setError("Erro de autenticação. Recarregue a página."); return; }
    if (suggestedFichas.length === 0) { setError("Não há fichas para salvar."); return; }
    const world = worlds.find((w) => w.id === selectedWorldId) || null;
    if (!selectedWorldId || !world) { setError("Selecione um Mundo antes de salvar fichas."); return; }
    const worldHasEpisodes = world.has_episodes !== false;
    const normalizedUnitNumber = worldHasEpisodes ? unitNumber.trim() : "0";
    if (worldHasEpisodes && !normalizedUnitNumber) { setError("Informe o número do episódio/capítulo."); return; }
    setIsSaving(true);
    try {
      const fichasPayload = suggestedFichas.map((f) => ({ 
          tipo: f.tipo, 
          titulo: f.titulo, 
          resumo: f.resumo, 
          conteudo: f.conteudo, 
          tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), 
          aparece_em: f.aparece_em || undefined, 
          ano_diegese: typeof f.ano_diegese === "number" ? f.ano_diegese : null, 
          descricao_data: f.descricao_data || null, 
          data_inicio: f.data_inicio || null, 
          data_fim: f.data_fim || null, 
          granularidade_data: f.granularidade_data || null, 
          camada_temporal: f.camada_temporal || null, 
          codigo: f.codigo, 
          meta: f.meta || {}, 
      }));
      const payload = { worldId: selectedWorldId, unitNumber: normalizedUnitNumber || "0", fichas: fichasPayload };
      const response = await fetch("/api/lore/save", { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": userId }, body: JSON.stringify(payload), });
      if (!response.ok) { const errorData = await response.json().catch(() => null); const msg = (errorData && errorData.error) || `Erro ao salvar fichas (status ${response.status}).`; setError(msg); return; }
      const dataResp = await response.json();
      setSuggestedFichas([]); setText(""); setDocumentName(""); setUnitNumber(""); setSuccessMessage("Fichas salvas com sucesso! As relações também foram registradas.");
    } catch (err) { console.error("Erro inesperado ao salvar fichas:", err); setError("Erro inesperado ao salvar fichas."); } finally { setIsSaving(false); }
  }

  function handleEditFicha(id: string) { const ficha = suggestedFichas.find((f) => f.id === id); if (!ficha) return; setEditingFicha({ ...ficha }); }
  function applyEditingFicha() { if (!editingFicha) return; setSuggestedFichas((prev) => prev.map((f) => (f.id === editingFicha.id ? { ...editingFicha } : f))); setEditingFicha(null); }
  function handleRemoveFicha(id: string) { setSuggestedFichas((prev) => prev.filter((f) => f.id !== id)); }
  function handleClearAll() { setSuggestedFichas([]); setSuccessMessage(null); }
  const selectedWorld = worlds.find((w) => w.id === selectedWorldId) || null;
  const worldHasEpisodes = selectedWorld?.has_episodes !== false;

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
            <h1 className="text-2xl font-semibold">Upload de Arquivo ou Texto</h1>
            <p className="text-sm text-zinc-400">Envie um roteiro (PDF, DOCX, TXT) ou cole o texto. A Lore Machine extrairá fichas automaticamente.</p>
          </header>

          {error && <div className="rounded-md border border-red-500 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}
          {successMessage && !error && <div className="rounded-md border border-emerald-500 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{successMessage}</div>}

          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div className="space-y-1"><label className="text-xs uppercase tracking-wide text-zinc-400">Universo</label><select className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={selectedUniverseId} onChange={handleUniverseChange}>{universes.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}<option value="create_new_universe">+ Novo universo...</option></select></div>
            <div className="space-y-1"><label className="text-xs uppercase tracking-wide text-zinc-400">Mundo de destino</label><select className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={selectedWorldId} onChange={handleWorldChange}>{worlds.map((world) => <option key={world.id} value={world.id}>{world.is_root ? `[Raiz] ${world.nome ?? world.id}` : (world.nome ?? world.id)}</option>)}<option value="create_new">+ Novo mundo...</option></select></div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-zinc-400">Episódio / Capítulo #</label>
              {!worldHasEpisodes ? (
                <input className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value="N/A" disabled />
              ) : showNewEpisodeInput ? (
                <input className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="Ex.: 6" autoFocus />
              ) : (
                <select className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={unitNumber} onChange={handleEpisodeChange}>
                  <option value="">Selecione...</option>
                  {existingEpisodes.map(ep => <option key={ep} value={ep}>{ep}</option>)}
                  <option value="new_episode">+ Novo episódio/capítulo...</option>
                </select>
              )}
            </div>
          </section>

          <section className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-zinc-400">Nome do documento (opcional)</label>
            <input className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={documentName} onChange={(e) => setDocumentName(e.target.value)} placeholder="Ex.: Episódio 6 — A Geladeira" />
          </section>

          <section className="p-4 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors">
             <div className="flex flex-col items-center justify-center gap-2">
                <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded text-sm font-medium border border-zinc-600 transition-colors">
                   <span>Escolher Arquivo (PDF, DOCX, TXT)</span>
                   <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.doc,.txt,.md" onChange={handleFileSelect} disabled={isParsingFile} />
                </label>
                <span className="text-xs text-zinc-500">{isParsingFile ? "Lendo arquivo..." : "Ou arraste um arquivo aqui"}</span>
             </div>
          </section>

          <section className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-zinc-400">Texto do episódio / capítulo</label>
            <textarea className="w-full min-h-[180px] rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} placeholder="O texto do arquivo aparecerá aqui, ou você pode colar manualmente..." />
          </section>

          {/* FILTRO DE CATEGORIAS */}
          {loreTypes.length > 0 && (
            <section className="space-y-2 p-4 bg-zinc-900/50 border border-zinc-800 rounded-md">
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wide text-zinc-400">Categorias para Extrair</label>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCategories.length === loreTypes.length) {
                      setSelectedCategories([]);
                    } else {
                      setSelectedCategories(loreTypes.map(t => t.value));
                    }
                  }}
                  className="text-xs text-fuchsia-400 hover:text-fuchsia-300 font-medium"
                >
                  {selectedCategories.length === loreTypes.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {loreTypes.map((type) => (
                  <label key={type.value} className="flex items-center gap-2 cursor-pointer hover:bg-zinc-800/50 p-2 rounded transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(type.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCategories([...selectedCategories, type.value]);
                        } else {
                          setSelectedCategories(selectedCategories.filter(c => c !== type.value));
                        }
                      }}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-fuchsia-600 focus:ring-fuchsia-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-zinc-300">{type.label}</span>
                  </label>
                ))}
              </div>
              {selectedCategories.length === 0 && (
                <p className="text-xs text-amber-500 mt-2">⚠️ Nenhuma categoria selecionada. Selecione pelo menos uma para extrair fichas.</p>
              )}
            </section>
          )}

          {/* BARRA DE PROGRESSO EM ETAPAS */}
          {isExtracting && (
            <div className="space-y-4 py-4">
              {/* Etapas visuais */}
              <div className="flex items-center justify-between">
                {/* Etapa 1: Buscar Categorias */}
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    currentStep >= 1 ? 'bg-fuchsia-600 text-white' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {currentStep > 1 ? '✓' : '1'}
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-2 text-center">Categorias</p>
                </div>
                
                {/* Linha conectora 1-2 */}
                <div className={`flex-1 h-1 mx-2 transition-all ${
                  currentStep >= 2 ? 'bg-fuchsia-600' : 'bg-zinc-800'
                }`}></div>
                
                {/* Etapa 2: Dividir Texto */}
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    currentStep >= 2 ? 'bg-fuchsia-600 text-white' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {currentStep > 2 ? '✓' : '2'}
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-2 text-center">Dividir</p>
                </div>
                
                {/* Linha conectora 2-3 */}
                <div className={`flex-1 h-1 mx-2 transition-all ${
                  currentStep >= 3 ? 'bg-fuchsia-600' : 'bg-zinc-800'
                }`}></div>
                
                {/* Etapa 3: Processar Chunks */}
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    currentStep >= 3 ? 'bg-fuchsia-600 text-white animate-pulse' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {currentStep > 3 ? '✓' : '3'}
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-2 text-center">Processar</p>
                </div>
                
                {/* Linha conectora 3-4 */}
                <div className={`flex-1 h-1 mx-2 transition-all ${
                  currentStep >= 4 ? 'bg-fuchsia-600' : 'bg-zinc-800'
                }`}></div>
                
                {/* Etapa 4: Finalizar */}
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    currentStep >= 4 ? 'bg-fuchsia-600 text-white' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {currentStep > 4 ? '✓' : '4'}
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-2 text-center">Finalizar</p>
                </div>
              </div>
              
              {/* Barra de progresso detalhada */}
              <div className="space-y-2">
                <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div className="bg-fuchsia-600 h-2 rounded-full transition-all duration-500" style={{ width: `${extractProgress}%` }}></div>
                </div>
                <p className="text-[10px] text-zinc-400 text-center">{extractStatus} ({extractProgress}%)</p>
              </div>
            </div>
          )}

          <div className="flex justify-center">
            <button onClick={handleExtractFichas} disabled={isExtracting || isParsingFile} className="w-full md:w-auto px-6 py-2 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-60 text-sm font-medium">{isExtracting ? "Processando..." : "Extrair fichas"}</button>
          </div>

          <section className="space-y-3 pb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Fichas sugeridas ({suggestedFichas.length})</h2>
              {suggestedFichas.length > 0 && <button onClick={handleClearAll} className="text-xs text-zinc-400 hover:text-zinc-100 underline-offset-2 hover:underline">Limpar todas</button>}
            </div>

            {suggestedFichas.length === 0 && <p className="text-xs text-zinc-500">Nenhuma ficha sugerida ainda.</p>}

            <div className="space-y-2">
              {suggestedFichas.map((ficha) => (
                <div key={ficha.id} className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{ficha.titulo || "(sem título)"}</div>
                      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{ficha.tipo || "conceito"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {ficha.codigo && <span className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300 font-mono">{ficha.codigo}</span>}
                      <button onClick={() => handleEditFicha(ficha.id)} className="text-xs px-2 py-1 rounded-md border border-zinc-700 hover:bg-zinc-800">Editar</button>
                      <button onClick={() => handleRemoveFicha(ficha.id)} className="text-xs px-2 py-1 rounded-md border border-red-700 text-red-200 hover:bg-red-900/40">Remover</button>
                    </div>
                  </div>
                  {ficha.resumo && <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{ficha.resumo}</p>}
                </div>
              ))}
            </div>

            {suggestedFichas.length > 0 && (
              <div className="pt-6 space-y-4 border-t border-zinc-800 mt-6">
                <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-2">🛡️ Protocolo de Coerência (Urizen)</h3>
                    <button onClick={handleCheckConsistency} disabled={isCheckingConsistency} className="px-3 py-1.5 text-xs bg-purple-900/30 text-purple-200 border border-purple-500/50 rounded hover:bg-purple-900/50 transition-colors disabled:opacity-50">
                      {isCheckingConsistency ? "Analisando Linha do Tempo..." : "Verificar Coerência (Urizen)"}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mb-3">Antes de salvar, peça para **Urizen**, a Lei, verificar se estas novas fichas contradizem fatos estabelecidos.</p>
                  {consistencyReport && (
                    <div className={`text-xs p-3 rounded border leading-relaxed whitespace-pre-wrap ${consistencyReport.includes("ALERTA") || consistencyReport.includes("INCONSISTÊNCIA") ? "bg-red-950/30 border-red-800 text-red-200" : "bg-emerald-950/30 border-emerald-800 text-emerald-200"}`}>
                      <strong>Relatório de Urizen:</strong><br/>{consistencyReport}
                    </div>
                  )}
                </div>
                <div className="flex justify-center">
                  <button onClick={handleSaveFichas} disabled={isSaving} className="w-full md:w-auto px-8 py-3 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all transform hover:scale-105">
                    {isSaving ? "Salvando fichas..." : "CONFIRMAR E SALVAR FICHAS"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {showNewUniverseModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <form onSubmit={e => { e.preventDefault(); handleCreateUniverse(); }} className="w-full max-w-md border border-zinc-800 rounded-lg p-4 bg-zinc-950/95 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-zinc-400">Novo Universo</div>
              <button type="button" onClick={handleCancelUniverseModal} className="text-[11px] text-zinc-500 hover:text-zinc-200">fechar</button>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-500">Nome do Universo</label>
              <input className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={newUniverseName} onChange={(e) => setNewUniverseName(e.target.value)} placeholder="Ex: Antiverso" autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-zinc-500">Descrição</label>
              <textarea className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm min-h-[100px]" value={newUniverseDescription} onChange={(e) => setNewUniverseDescription(e.target.value)} placeholder="Resumo do Universo…" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={handleCancelUniverseModal} className="px-3 py-1.5 rounded border border-zinc-700 text-[11px] text-zinc-300 hover:bg-zinc-800/60">Cancelar</button>
              <button type="submit" disabled={isCreatingUniverse} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-[11px] font-medium">{isCreatingUniverse ? "Criando..." : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}

      {showNewWorldModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <form onSubmit={e => { e.preventDefault(); handleCreateWorldFromModal(); }} className="w-full max-w-md max-h-[90vh] overflow-auto border border-zinc-800 rounded-lg p-4 bg-zinc-950/95 space-y-3">
            <div className="flex items-center justify-between"><div className="text-[11px] text-zinc-400">Novo Mundo</div><button type="button" onClick={handleCancelWorldModal} className="text-[11px] text-zinc-500 hover:text-zinc-200">fechar</button></div>
            <div className="space-y-1"><label className="text-[11px] text-zinc-500">Nome</label><input className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={newWorldName} onChange={(e) => setNewWorldName(e.target.value)} placeholder="Ex: Arquivos Vermelhos" /></div>
            <div className="space-y-1"><label className="text-[11px] text-zinc-500">Descrição</label><textarea className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm min-h-[140px]" value={newWorldDescription} onChange={(e) => setNewWorldDescription(e.target.value)} placeholder="Resumo do Mundo…" /></div>
            <div className="flex items-center gap-2 pt-1"><button type="button" onClick={() => setNewWorldHasEpisodes((prev) => !prev)} className={`h-4 px-2 rounded border text-[11px] ${newWorldHasEpisodes ? "border-emerald-400 text-emerald-300 bg-emerald-400/10" : "border-zinc-700 text-zinc-400 bg-black/40"}`}>Este mundo possui episódios</button></div>
            <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={handleCancelWorldModal} className="px-3 py-1.5 rounded border border-zinc-700 text-[11px] text-zinc-300 hover:bg-zinc-800/60">Cancelar</button><button type="submit" disabled={isCreatingWorld} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-[11px] font-medium">{isCreatingWorld ? "Criando..." : "Salvar"}</button></div>
          </form>
        </div>
      )}

      {editingFicha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-xl rounded-lg bg-zinc-950 border border-zinc-800 p-4 space-y-4">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Editar ficha</h2><button className="text-xs text-zinc-400 hover:text-zinc-100" onClick={() => setEditingFicha(null)}>Fechar</button></div>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              
              {/* DROPDOWN DINÂMICO AQUI */}
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">Tipo</label>
                <select 
                    className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" 
                    value={loreTypes.some(t => t.value === editingFicha.tipo) ? editingFicha.tipo : "novo"} 
                    onChange={(e) => { 
                        const val = e.target.value; 
                        if (val === "novo") { 
                            const custom = prompt("Digite o nome da nova categoria:"); 
                            if (custom) setEditingFicha((prev) => prev ? { ...prev, tipo: custom.toLowerCase().trim() } : prev); 
                        } else { 
                            setEditingFicha((prev) => prev ? { ...prev, tipo: val } : prev); 
                        } 
                    }}
                >
                  {loreTypes.map(t => (<option key={t.value} value={t.value}>{t.label}</option>))}
                  {!loreTypes.some(t => t.value === editingFicha.tipo) && (<option value={editingFicha.tipo}>{editingFicha.tipo} (Atual)</option>)}
                  <option value="novo">+ Nova Categoria...</option>
                </select>
              </div>

              <div className="space-y-1"><label className="text-xs uppercase tracking-wide text-zinc-400">Título</label><input className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={editingFicha.titulo} onChange={(e) => setEditingFicha((prev) => prev ? { ...prev, titulo: e.target.value } : prev)} /></div>
              <div className="space-y-1"><label className="text-xs uppercase tracking-wide text-zinc-400">Resumo</label><textarea className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm min-h-[60px]" value={editingFicha.resumo} onChange={(e) => setEditingFicha((prev) => prev ? { ...prev, resumo: e.target.value } : prev)} /></div>
              <div className="space-y-1"><label className="text-xs uppercase tracking-wide text-zinc-400">Conteúdo</label><textarea className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm min-h-[80px]" value={editingFicha.conteudo} onChange={(e) => setEditingFicha((prev) => prev ? { ...prev, conteudo: e.target.value } : prev)} /></div>
              
              {editingFicha.tipo === 'evento' && (
                <div className="p-3 bg-zinc-900/50 rounded border border-emerald-500/30 space-y-3 mt-2 border-l-4 border-l-emerald-500">
                   <div className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold">Dados da Timeline</div>
                   <div className="space-y-1"><label className="text-xs text-zinc-400">Descrição da Data (Texto original)</label><input className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={editingFicha.descricao_data || ''} onChange={(e) => setEditingFicha(prev => prev ? {...prev, descricao_data: e.target.value} : prev)} placeholder='ex: "Na tarde de 23 de agosto..."' /></div>
                   <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1"><label className="text-xs text-zinc-400">Data Início</label><input type="date" className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={editingFicha.data_inicio || ''} onChange={(e) => setEditingFicha(prev => prev ? {...prev, data_inicio: e.target.value} : prev)} /></div>
                      <div className="space-y-1"><label className="text-xs text-zinc-400">Data Fim</label><input type="date" className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={editingFicha.data_fim || ''} onChange={(e) => setEditingFicha(prev => prev ? {...prev, data_fim: e.target.value} : prev)} /></div>
                   </div>
                   <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1"><label className="text-xs text-zinc-400">Granularidade</label><select className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={editingFicha.granularidade_data || 'vago'} onChange={(e) => setEditingFicha(prev => prev ? {...prev, granularidade_data: e.target.value} : prev)}>{GRANULARIDADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
                      <div className="space-y-1"><label className="text-xs text-zinc-400">Camada</label><select className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={editingFicha.camada_temporal || 'linha_principal'} onChange={(e) => setEditingFicha(prev => prev ? {...prev, camada_temporal: e.target.value} : prev)}>{CAMADAS_TEMPORAIS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                   </div>
                </div>
              )}

              <div className="space-y-1"><label className="text-xs uppercase tracking-wide text-zinc-400">Tags</label><input className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm" value={editingFicha.tags} onChange={(e) => setEditingFicha((prev) => prev ? { ...prev, tags: e.target.value } : prev)} /></div>
              <div className="space-y-1"><label className="text-xs uppercase tracking-wide text-zinc-400">Código</label><input className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm font-mono" value={editingFicha.codigo} onChange={(e) => setEditingFicha((prev) => prev ? { ...prev, codigo: e.target.value } : prev)} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><button className="px-3 py-1.5 rounded-md border border-zinc-700 text-xs hover:bg-zinc-800" onClick={() => setEditingFicha(null)}>Cancelar</button><button className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-medium" onClick={applyEditingFicha}>Salvar alterações</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
