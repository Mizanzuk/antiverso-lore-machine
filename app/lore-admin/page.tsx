"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { GRANULARIDADES } from "@/lib/dates/granularidade";

// --- TIPOS ---
type Universe = {
  id: string;
  nome: string;
  descricao?: string | null;
};

type World = {
  id: string;
  nome: string;
  descricao?: string | null;
  tipo: string;
  ordem: number;
  has_episodes: boolean;
  universe_id?: string | null;
  is_root?: boolean; // Novo campo
};

type FichaFull = {
  id: string;
  titulo: string;
  resumo: string | null;
  conteudo: string | null;
  tipo: string;
  tags: string | null;
  aparece_em: string | null;
  ano_diegese: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  granularidade_data: string | null;
  camada_temporal: string | null;
  descricao_data: string | null;
  [key: string]: any;
};

// --- CONSTANTES ---
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

// --- COMPONENTE PRINCIPAL ---
function LoreAdminContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Estados de Dados
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState<string | null>(null);
  
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  
  const [fichas, setFichas] = useState<FichaFull[]>([]);
  const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);

  // UI
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewUniverseModal, setShowNewUniverseModal] = useState(false);
  const [newUniverseName, setNewUniverseName] = useState("");

  // 1. Carregar Universos
  useEffect(() => {
    async function loadUniverses() {
      setLoading(true);
      const { data } = await supabaseBrowser.from("universes").select("*").order("created_at", { ascending: true });
      if (data && data.length > 0) {
        setUniverses(data);
        // Tenta pegar da URL ou pega o primeiro
        const urlUni = searchParams.get("universe");
        const initial = urlUni && data.find(u => u.id === urlUni) ? urlUni : data[0].id;
        setSelectedUniverseId(initial);
      } else {
        // Se não tem universo nenhum (banco zerado), cria um default em memória ou pede para criar
        setUniverses([]);
      }
      setLoading(false);
    }
    loadUniverses();
  }, []);

  // 2. Carregar Mundos quando Universo muda
  useEffect(() => {
    if (!selectedUniverseId) return;
    async function loadWorlds() {
      const { data } = await supabaseBrowser
        .from("worlds")
        .select("*")
        .eq("universe_id", selectedUniverseId)
        .order("ordem", { ascending: true }); // Ordena por ordem definida
        
      const loadedWorlds = (data || []) as World[];
      
      // Ordenação manual: Root primeiro, depois o resto
      loadedWorlds.sort((a, b) => {
        if (a.is_root) return -1;
        if (b.is_root) return 1;
        return (a.ordem || 0) - (b.ordem || 0);
      });

      setWorlds(loadedWorlds);

      // Seleção inicial de mundo
      const urlWorld = searchParams.get("world");
      // Se tiver na URL e pertencer a este universo, seleciona. Se não, seleciona o Root.
      const target = loadedWorlds.find(w => w.id === urlWorld) || loadedWorlds.find(w => w.is_root) || loadedWorlds[0];
      
      if (target) {
        setSelectedWorldId(target.id);
      } else {
        setSelectedWorldId(null);
        setFichas([]);
      }
    }
    loadWorlds();
  }, [selectedUniverseId]);

  // 3. Carregar Fichas quando Mundo muda
  useEffect(() => {
    if (!selectedWorldId) return;
    async function loadFichas() {
      const { data } = await supabaseBrowser
        .from("fichas")
        .select("*")
        .eq("world_id", selectedWorldId)
        .order("titulo", { ascending: true });
      setFichas((data as FichaFull[]) || []);
      
      // URL Deep link ficha
      const urlFicha = searchParams.get("ficha");
      if (urlFicha && data?.some(f => f.id === urlFicha)) {
        setSelectedFichaId(urlFicha);
      } else {
        setSelectedFichaId(null);
      }
    }
    loadFichas();
  }, [selectedWorldId]);

  // Sync URL
  const updateUrl = (uniId: string | null, worldId: string | null, fichaId: string | null) => {
    const params = new URLSearchParams();
    if (uniId) params.set("universe", uniId);
    if (worldId) params.set("world", worldId);
    if (fichaId) params.set("ficha", fichaId);
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Handlers
  const handleSelectUniverse = (id: string) => {
    setSelectedUniverseId(id);
    // Ao mudar universo, a lógica de useEffect vai selecionar o mundo root automaticamente
    updateUrl(id, null, null); 
  };

  const handleSelectWorld = (id: string) => {
    setSelectedWorldId(id);
    setSelectedFichaId(null);
    updateUrl(selectedUniverseId, id, null);
  };

  const handleSelectFicha = (id: string) => {
    setSelectedFichaId(id);
    updateUrl(selectedUniverseId, selectedWorldId, id);
  };

  const handleCreateUniverse = async () => {
    if (!newUniverseName.trim()) return;
    
    // 1. Criar Universo
    const { data: uniData, error: uniError } = await supabaseBrowser
      .from("universes")
      .insert({ nome: newUniverseName.trim() })
      .select()
      .single();
      
    if (uniError || !uniData) return alert("Erro ao criar universo");

    // 2. Criar Mundo Raiz (com o mesmo nome)
    const rootId = newUniverseName.trim().toLowerCase().replace(/\s+/g, "_") + "_root";
    const { error: worldError } = await supabaseBrowser
      .from("worlds")
      .insert({
        id: rootId,
        nome: newUniverseName.trim(), // Nome igual ao universo
        universe_id: uniData.id,
        is_root: true, // É o container de regras
        tipo: "meta_universo",
        descricao: "Regras e conceitos globais deste universo."
      });

    if (worldError) {
      alert("Universo criado, mas erro ao criar mundo raiz: " + worldError.message);
    } else {
      // Reload
      setUniverses(prev => [...prev, uniData]);
      handleSelectUniverse(uniData.id);
      setShowNewUniverseModal(false);
      setNewUniverseName("");
    }
  };

  // Helpers visuais
  const selectedFicha = fichas.find(f => f.id === selectedFichaId);
  const rootWorld = worlds.find(w => w.is_root);
  const otherWorlds = worlds.filter(w => !w.is_root);
  const currentUniverse = universes.find(u => u.id === selectedUniverseId);

  if (loading && universes.length === 0) return <div className="h-screen flex items-center justify-center text-neutral-500 text-xs">Carregando multiverso...</div>;

  return (
    <div className="h-screen bg-black text-neutral-100 flex flex-col overflow-hidden">
      {/* HEADER */}
      <header className="h-12 border-b border-neutral-900 flex items-center justify-between px-4 bg-black/90 z-10">
        <div className="flex items-center gap-4">
          <div className="text-[11px] font-bold tracking-widest text-emerald-500 uppercase">Lore Machine</div>
          <div className="h-4 w-px bg-neutral-800"></div>
          {/* SELETOR DE UNIVERSO */}
          <div className="relative group">
            <button className="text-xs font-bold text-white flex items-center gap-2 hover:text-emerald-400 transition-colors">
              {currentUniverse?.nome || "Selecione um Universo"} ▾
            </button>
            <div className="absolute top-full left-0 mt-2 w-56 bg-zinc-950 border border-zinc-800 rounded shadow-xl hidden group-hover:block p-1 z-50">
              {universes.map(u => (
                <button 
                  key={u.id} 
                  onClick={() => handleSelectUniverse(u.id)}
                  className={`w-full text-left px-3 py-2 text-xs rounded ${selectedUniverseId === u.id ? "bg-emerald-900/20 text-emerald-400" : "hover:bg-zinc-900 text-zinc-400"}`}
                >
                  {u.nome}
                </button>
              ))}
              <div className="h-px bg-zinc-900 my-1"></div>
              <button onClick={() => setShowNewUniverseModal(true)} className="w-full text-left px-3 py-2 text-xs text-emerald-500 hover:bg-emerald-900/10 font-bold">+ Novo Universo</button>
            </div>
          </div>
        </div>
        <div className="text-[10px] text-neutral-500">
          {selectedWorldId === rootWorld?.id ? "Editando Leis Universais" : "Editando Mundo Específico"}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* COLUNA 1: ESTRUTURA DO UNIVERSO */}
        {!isFocusMode && (
          <aside className="w-64 bg-zinc-950/50 border-r border-zinc-900 flex flex-col">
            <div className="p-4 pb-2">
              <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold mb-2">Mundo Mestre</div>
              {/* MUNDO RAIZ (UNIVERSO) */}
              {rootWorld && (
                <button
                  onClick={() => handleSelectWorld(rootWorld.id)}
                  className={`w-full p-3 rounded border text-left transition-all group relative ${
                    selectedWorldId === rootWorld.id 
                      ? "border-emerald-500 bg-emerald-950/10 text-white shadow-[0_0_15px_rgba(16,185,129,0.1)]" 
                      : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🪐</span>
                    <div>
                      <div className="text-xs font-bold">{rootWorld.nome}</div>
                      <div className="text-[9px] opacity-60">Regras & Conceitos</div>
                    </div>
                  </div>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 pt-0">
              <div className="flex items-center justify-between mb-2 mt-4">
                <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold">Mundos / Séries</div>
                <button className="text-[9px] hover:text-white text-zinc-500">+ Novo</button>
              </div>
              <div className="space-y-1">
                {otherWorlds.map(w => (
                  <button
                    key={w.id}
                    onClick={() => handleSelectWorld(w.id)}
                    className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                      selectedWorldId === w.id 
                        ? "bg-zinc-800 text-white font-medium border-l-2 border-emerald-500" 
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                    }`}
                  >
                    {w.nome}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* COLUNA 2: LISTA DE FICHAS */}
        {!isFocusMode && (
          <aside className="w-80 bg-black border-r border-zinc-900 flex flex-col">
            <div className="p-4 border-b border-zinc-900/50">
              <h2 className="text-sm font-bold text-white mb-1">
                {worlds.find(w => w.id === selectedWorldId)?.nome}
              </h2>
              <p className="text-[10px] text-zinc-500">
                {selectedWorldId === rootWorld?.id 
                  ? "Fichas aqui são leis universais." 
                  : "Fichas restritas a este mundo."}
              </p>
            </div>
            <div className="p-2">
              <input placeholder="Buscar ficha..." className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none" />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {fichas.map(f => (
                <button
                  key={f.id}
                  onClick={() => handleSelectFicha(f.id)}
                  className={`w-full text-left p-3 rounded border transition-all ${
                    selectedFichaId === f.id
                      ? "bg-zinc-900 border-emerald-500/50 text-white"
                      : "bg-transparent border-zinc-900 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-950"
                  }`}
                >
                  <div className="flex justify-between mb-1">
                    <span className="font-bold text-xs">{f.titulo}</span>
                    <span className="text-[9px] uppercase text-zinc-600 border border-zinc-800 px-1 rounded">{f.tipo.slice(0,3)}</span>
                  </div>
                  {f.resumo && <div className="text-[10px] opacity-60 line-clamp-2">{f.resumo}</div>}
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* COLUNA 3: DETALHES (Igual a anterior, mas adaptada ao layout) */}
        <main className="flex-1 bg-black overflow-y-auto p-8 flex justify-center">
          {selectedFicha ? (
            <div className="max-w-3xl w-full animate-in fade-in duration-300">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold mb-1">
                    {selectedFicha.tipo} {selectedWorldId === rootWorld?.id && "⭐ UNIVERSAL"}
                  </div>
                  <h1 className="text-3xl font-bold text-white">{selectedFicha.titulo}</h1>
                </div>
                <button onClick={() => setIsFocusMode(!isFocusMode)} className="text-zinc-500 hover:text-white">
                  {isFocusMode ? "Restaurar" : "Expandir"}
                </button>
              </div>
              
              <div className="prose prose-invert prose-sm max-w-none">
                <div className="bg-zinc-900/30 p-4 rounded border border-zinc-800 mb-6 italic text-zinc-400">
                  {selectedFicha.resumo || "Sem resumo."}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed text-zinc-300">
                  {selectedFicha.conteudo || "Sem conteúdo."}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-zinc-600 gap-2">
              <div className="text-4xl opacity-20">❖</div>
              <div className="text-xs uppercase tracking-widest">Selecione uma ficha</div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL NOVO UNIVERSO */}
      {showNewUniverseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="w-80 bg-zinc-950 border border-zinc-800 p-6 rounded-lg">
            <h3 className="text-sm font-bold text-white mb-4">Criar Novo Universo</h3>
            <input 
              className="w-full bg-black border border-zinc-800 rounded p-2 text-xs mb-4 text-white"
              placeholder="Nome (ex: Terra Média)"
              value={newUniverseName}
              onChange={e => setNewUniverseName(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewUniverseModal(false)} className="text-xs text-zinc-500 hover:text-white px-3 py-1">Cancelar</button>
              <button onClick={handleCreateUniverse} className="text-xs bg-emerald-600 text-white px-3 py-1 rounded hover:bg-emerald-500">Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoreAdminPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-black text-white flex items-center justify-center">Carregando...</div>}>
      <LoreAdminContent />
    </Suspense>
  );
}
