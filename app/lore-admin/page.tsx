"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense, ChangeEvent } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { GRANULARIDADES } from "@/lib/dates/granularidade";

// --- CONSTANTES DE UI ---
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

// --- TIPOS ---
type ViewState = "loading" | "loggedOut" | "loggedIn";
type WorldFormMode = "idle" | "create" | "edit";
type FichaFormMode = "idle" | "create" | "edit";
type UniverseFormMode = "idle" | "create" | "edit";

type FichaFull = {
  id: string; titulo: string; resumo: string | null; conteudo: string | null; tipo: string;
  tags: string | null; aparece_em: string | null; ano_diegese: number | null;
  data_inicio: string | null; data_fim: string | null; granularidade_data: string | null;
  camada_temporal: string | null; descricao_data: string | null;
  world_id: string; imagem_url?: string | null; codigo?: string | null; slug?: string | null;
  episodio?: string | null;
  [key: string]: any;
};

type Relation = {
  id: string; tipo_relacao: string; descricao: string; source_ficha_id: string; target_ficha_id: string;
  source?: { id: string; titulo: string; tipo: string };
  target?: { id: string; titulo: string; tipo: string };
};

type Universe = { id: string; nome: string; descricao?: string | null; };
type World = { id: string; nome: string; descricao?: string | null; tipo: string; ordem: number; has_episodes: boolean; universe_id?: string | null; is_root?: boolean; };

// --- HELPERS ---
function escapeRegExp(str: string): string { return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Componente Principal
function LoreAdminContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Estados de Auth e View
  const [view, setView] = useState<ViewState>("loading");
  const [userId, setUserId] = useState<string|null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Dados
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState<string | null>(null);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [fichas, setFichas] = useState<FichaFull[]>([]);
  const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);
  const [codes, setCodes] = useState<any[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Filtros
  const [fichasSearchTerm, setFichasSearchTerm] = useState("");
  const [fichaFilterTipos, setFichaFilterTipos] = useState<string[]>([]);

  // Forms
  const [universeFormMode, setUniverseFormMode] = useState<UniverseFormMode>("idle");
  const [universeForm, setUniverseForm] = useState({ id:"", nome:"", descricao:"" });
  
  const [worldFormMode, setWorldFormMode] = useState<WorldFormMode>("idle");
  const [worldForm, setWorldForm] = useState<Partial<World>>({});
  
  const [fichaFormMode, setFichaFormMode] = useState<FichaFormMode>("idle");
  const [fichaForm, setFichaForm] = useState<any>({});
  const [isSavingFicha, setIsSavingFicha] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Helpers de Wiki e Relações
  const [isManagingRelations, setIsManagingRelations] = useState(false);
  const [newRelationTarget, setNewRelationTarget] = useState("");
  const [newRelationType, setNewRelationType] = useState("relacionado_a");

  // --- 1. AUTH ---
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error } = await supabaseBrowser.auth.getSession();
      if (error || !session) { setView("loggedOut"); return; }
      setUserId(session.user.id);
      setView("loggedIn");
    };
    checkSession();
  }, []);

  // Carregar Universos assim que logar
  useEffect(() => {
    if (userId && view === "loggedIn") {
        loadUniverses();
    }
  }, [userId, view]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setIsSubmitting(true); setError(null);
    const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);
    if (error) setError(error.message);
    else { 
        if (data.session) setUserId(data.session.user.id);
        setView("loggedIn"); 
    }
  }
  async function handleLogout() { await supabaseBrowser.auth.signOut(); setView("loggedOut"); setUserId(null); }

  // --- 2. DATA FETCHING ---
  async function loadUniverses() {
    if(!userId) return;
    const { data } = await supabaseBrowser.from("universes").select("*").order("nome");
    if (data) {
      setUniverses(data);
      // Mantém seleção da URL ou seleciona o primeiro
      const urlUni = searchParams.get("universe");
      const initialUniId = (urlUni && data.find(u => u.id === urlUni)) ? urlUni : (data[0]?.id || null);
      
      setSelectedUniverseId(initialUniId);
      if(initialUniId) {
          fetchAllData(initialUniId, searchParams.get("world"));
      }
    }
  }

  // Função crítica: Carrega Mundos e Fichas passando o Header de autenticação
  const fetchAllData = useCallback(async (uniId: string, currentWorldId: string | null) => {
    if (!uniId || !userId) return;
    setIsLoadingData(true);
    try {
      const params = new URLSearchParams();
      params.set('universeId', uniId);
      
      // Chamada para a API com Header Seguro
      const res = await fetch(`/api/catalog?${params.toString()}`, {
         headers: { 'x-user-id': userId }
      });

      if (!res.ok) throw new Error("Falha ao carregar dados (401/500)");
      const data = await res.json();

      setWorlds(data.worlds || []);
      setFichas(data.entities || []);

      // Lógica de seleção de mundo
      let effectiveWorldId = currentWorldId;
      if (effectiveWorldId && !(data.worlds || []).some((w:World) => w.id === effectiveWorldId)) {
        effectiveWorldId = null;
      }
      setSelectedWorldId(effectiveWorldId);

      // Lógica de seleção de ficha
      const urlFicha = searchParams.get("ficha");
      if (urlFicha && (data.entities || []).some((f:FichaFull) => f.id === urlFicha)) {
        setSelectedFichaId(urlFicha);
        loadFichaDetails(urlFicha);
      } else {
        setSelectedFichaId(null);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsLoadingData(false);
    }
  }, [searchParams, userId]);

  async function loadFichaDetails(fichaId: string) {
    const { data: cData } = await supabaseBrowser.from("codes").select("*").eq("ficha_id", fichaId).order("code");
    setCodes(cData || []);
    const { data: rData } = await supabaseBrowser.from("lore_relations")
      .select(`*, source:source_ficha_id(id, titulo, tipo), target:target_ficha_id(id, titulo, tipo)`)
      .or(`source_ficha_id.eq.${fichaId},target_ficha_id.eq.${fichaId}`);
    setRelations(rData || []);
  }

  // --- 3. ACTIONS: UNIVERSO ---
  async function saveUniverse() {
    if (!universeForm.nome.trim()) return alert("Nome obrigatório");
    
    if (universeFormMode === "create") {
      const { data, error } = await supabaseBrowser.from("universes").insert({ nome: universeForm.nome, descricao: universeForm.descricao }).select().single();
      if (error) return alert("Erro ao criar universo: " + error.message);
      
      // Cria mundo raiz automaticamente
      const rootId = universeForm.nome.toLowerCase().replace(/\s+/g, "_") + "_root_" + Date.now();
      await supabaseBrowser.from("worlds").insert({ 
        id: rootId, nome: universeForm.nome, universe_id: data.id, is_root: true, tipo: "meta_universo", ordem: 0, has_episodes: false 
      });
      loadUniverses();
    } else {
      await supabaseBrowser.from("universes").update({ nome: universeForm.nome, descricao: universeForm.descricao }).eq("id", universeForm.id);
      loadUniverses();
    }
    setUniverseFormMode("idle");
  }

  // --- 4. ACTIONS: MUNDO (CORRIGIDO) ---
  function startCreateWorld() {
    setWorldFormMode("create");
    setWorldForm({ nome: "", descricao: "", has_episodes: true });
  }

  async function handleSaveWorld(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUniverseId) return alert("Nenhum universo selecionado. Crie um universo primeiro.");
    if (!worldForm.nome?.trim()) return alert("Nome do mundo é obrigatório.");

    const payload: any = {
      nome: worldForm.nome,
      descricao: worldForm.descricao,
      has_episodes: worldForm.has_episodes,
      tipo: "mundo_ficcional",
      universe_id: selectedUniverseId // Vínculo essencial para a query funcionar
    };

    try {
      if (worldFormMode === 'create') {
         // Gera ID seguro (Slug único)
         const slugId = worldForm.nome.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, "_") + "_" + Date.now();
         
         const { error } = await supabaseBrowser.from("worlds").insert([{ ...payload, id: slugId }]);
         if (error) throw error;
      } else {
         const { error } = await supabaseBrowser.from("worlds").update(payload).eq("id", worldForm.id);
         if (error) throw error;
      }
      
      setWorldFormMode("idle");
      // Recarrega tudo para atualizar a lista lateral imediatamente
      await fetchAllData(selectedUniverseId, selectedWorldId);

    } catch (err: any) {
      alert("Erro ao salvar mundo: " + err.message);
    }
  }

  async function handleDeleteWorld(id: string, e?: React.MouseEvent) {
    if(e) e.stopPropagation();
    if(!confirm("Tem certeza? Isso apagará TODAS as fichas deste mundo.")) return;
    
    // Exclusão em cascata manual
    const { data: fichas } = await supabaseBrowser.from("fichas").select("id").eq("world_id", id);
    const ids = fichas?.map(f => f.id) || [];
    if(ids.length > 0) {
       await supabaseBrowser.from("codes").delete().in("ficha_id", ids);
       await supabaseBrowser.from("lore_relations").delete().or(`source_ficha_id.in.(${ids.join(',')}),target_ficha_id.in.(${ids.join(',')})`);
       await supabaseBrowser.from("fichas").delete().eq("world_id", id);
    }
    await supabaseBrowser.from("worlds").delete().eq("id", id);
    if(selectedUniverseId) await fetchAllData(selectedUniverseId, null);
  }

  // --- 5. ACTIONS: FICHA (CORRIGIDO) ---
  function startCreateFicha() {
    if(!selectedUniverseId) return alert("Selecione um universo.");
    setFichaFormMode("create");
    
    // Define mundo padrão: o selecionado OU o mundo raiz
    const rootWorld = worlds.find(w => w.is_root);
    const defaultWorld = selectedWorldId || rootWorld?.id || worlds[0]?.id;
    
    setFichaForm({ 
        id: "", 
        titulo: "", 
        tipo: "conceito", 
        world_id: defaultWorld, // Preenche o ID do mundo
        conteudo: "", 
        resumo: "", 
        tags: "", 
        granularidade_data: "indefinido", 
        camada_temporal: "linha_principal" 
    });
  }

  async function handleSaveFicha(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingFicha(true);
    
    try {
        // Validações
        if (!fichaForm.world_id) throw new Error("Você deve selecionar um Mundo para a ficha.");
        if (!fichaForm.titulo?.trim()) throw new Error("Título é obrigatório.");

        const payload: any = {
            world_id: fichaForm.world_id,
            titulo: fichaForm.titulo.trim(),
            slug: fichaForm.slug?.trim() || fichaForm.titulo.toLowerCase().replace(/\s+/g, '-'),
            tipo: fichaForm.tipo,
            resumo: fichaForm.resumo || null,
            conteudo: fichaForm.conteudo || null,
            tags: fichaForm.tags || null,
            ano_diegese: fichaForm.ano_diegese ? Number(fichaForm.ano_diegese) : null,
            aparece_em: fichaForm.aparece_em || null,
            imagem_url: fichaForm.imagem_url || null,
            // Campos de evento
            descricao_data: fichaForm.descricao_data || null,
            data_inicio: fichaForm.data_inicio || null,
            data_fim: fichaForm.data_fim || null,
            granularidade_data: fichaForm.granularidade_data || 'vago',
            camada_temporal: fichaForm.camada_temporal || 'linha_principal',
            updated_at: new Date().toISOString(),
        };

        if (fichaFormMode === "create") {
            const { error } = await supabaseBrowser.from("fichas").insert([payload]);
            if(error) throw error;
        } else {
            const { error } = await supabaseBrowser.from("fichas").update(payload).eq("id", fichaForm.id);
            if(error) throw error;
        }

        setFichaFormMode("idle");
        // Recarrega lista
        await fetchAllData(selectedUniverseId!, selectedWorldId);

    } catch (err: any) {
        alert("Erro ao salvar ficha: " + err.message);
    } finally {
        setIsSavingFicha(false);
    }
  }

  async function handleDeleteFicha(id: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!confirm("Tem certeza que deseja apagar esta ficha?")) return;
    await supabaseBrowser.from("codes").delete().eq("ficha_id", id);
    await supabaseBrowser.from("fichas").delete().eq("id", id);
    if (selectedFichaId === id) setSelectedFichaId(null);
    if (selectedUniverseId) fetchAllData(selectedUniverseId, selectedWorldId); 
  }

  async function checkConsistency() {
    const textToCheck = `[PROPOSTA DE FICHA] Título: ${fichaForm.titulo} Tipo: ${fichaForm.tipo} Ano/Data: ${fichaForm.ano_diegese || fichaForm.data_inicio || "Não informado"} Resumo: ${fichaForm.resumo} Conteúdo: ${fichaForm.conteudo}`.trim();
    alert("Consultando Urizen, a Lei, sobre a coerência...");
    try {
      const res = await fetch("/api/lore/consistency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: textToCheck, universeId: selectedUniverseId })
      });
      const data = await res.json();
      if (data.analysis) alert("RELATÓRIO DE URIZEN:\n\n" + data.analysis);
      else alert("Erro ao analisar. Tente novamente.");
    } catch (err) {
      console.error(err);
      alert("Erro na requisição de coerência.");
    }
  }

  // --- FILTRAGEM DE LISTA ---
  const filteredFichas = useMemo(() => {
    let list = fichas;
    // Se um mundo específico estiver selecionado, filtra por ele.
    if (selectedWorldId) {
        list = list.filter(f => f.world_id === selectedWorldId);
    }
    
    if (fichaFilterTipos.length > 0) {
        list = list.filter(f => fichaFilterTipos.includes(f.tipo));
    }

    if (fichasSearchTerm.trim().length > 0) {
      const q = fichasSearchTerm.toLowerCase();
      list = list.filter(f => 
        (f.titulo || "").toLowerCase().includes(q) || 
        (f.tags || "").toLowerCase().includes(q) ||
        (f.resumo || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [fichas, selectedWorldId, fichaFilterTipos, fichasSearchTerm]);

  // --- RENDER WIKI TEXT ---
  const renderWikiText = (text: string | null | undefined) => {
    if (!text) return null;
    const candidates = fichas.filter(f => f.id !== selectedFichaId && f.titulo).map(f => ({ id: f.id, titulo: f.titulo }));
    if (!candidates.length) return text;
    
    // Ordena por tamanho para dar match no maior nome primeiro
    candidates.sort((a, b) => b.titulo.length - a.titulo.length);
    
    const pattern = new RegExp(`\\b(${candidates.map(c => escapeRegExp(c.titulo)).join("|")})\\b`, "gi");
    const parts = text.split(pattern);
    
    return parts.map((part, i) => {
        const match = candidates.find(c => c.titulo.toLowerCase() === part.toLowerCase());
        if (match) {
            return (
                <button key={i} onClick={() => { setSelectedFichaId(match.id); loadFichaDetails(match.id); }} className="text-emerald-400 hover:underline decoration-dotted decoration-emerald-600 font-medium">
                    {part}
                </button>
            );
        }
        return part;
    });
  };

  // --- RENDER UI ---
  const selectedFicha = fichas.find(f => f.id === selectedFichaId);
  const currentUniverse = universes.find(u => u.id === selectedUniverseId);
  const childWorlds = worlds.filter(w => !w.is_root); // Apenas mundos filhos para a lista lateral

  if (view === "loading") return <div className="min-h-screen bg-black text-neutral-500 flex items-center justify-center">Carregando...</div>;
  if (view === "loggedOut") return <div className="min-h-screen bg-black flex items-center justify-center"><form onSubmit={handleLogin} className="p-8 border border-zinc-800 rounded bg-zinc-950"><h1 className="text-white mb-4">Login Admin</h1><input className="block w-full mb-2 bg-black border border-zinc-700 p-2 text-white" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} /><input type="password" className="block w-full mb-4 bg-black border border-zinc-700 p-2 text-white" placeholder="Senha" value={password} onChange={e=>setPassword(e.target.value)} /><button className="bg-emerald-600 text-white px-4 py-2 w-full rounded">Entrar</button></form></div>;

  return (
    <div className="h-screen bg-black text-neutral-100 flex flex-col overflow-hidden font-sans">
      
      {/* HEADER */}
      <header className="border-b border-neutral-900 px-4 py-2 flex items-center justify-between bg-zinc-950">
        <div className="flex items-center gap-4">
          <a href="/" className="text-[11px] text-neutral-300 hover:text-white">← Home</a>
          <a href="/lore-upload" className="text-[11px] text-neutral-400 hover:text-white">Upload</a>
          <div className="h-4 w-px bg-zinc-800"></div>
          <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest">Admin</span>
        </div>
        <button onClick={handleLogout} className="text-[10px] border border-zinc-800 px-3 py-1 rounded hover:bg-zinc-900 text-zinc-400">Sair</button>
      </header>

      <main className="flex flex-1 overflow-hidden">
        
        {/* COLUNA 1: NAVEGAÇÃO DE ESTRUTURA */}
        {!isFocusMode && (
          <section className="w-64 border-r border-neutral-800 bg-neutral-950/50 flex flex-col min-h-0">
            <div className="p-4 border-b border-neutral-800">
                <label className="text-[9px] uppercase font-bold text-zinc-500 block mb-1">Universo Ativo</label>
                <div className="flex gap-1">
                    <select 
                        className="flex-1 bg-black border border-zinc-800 text-sm p-1.5 rounded text-white outline-none focus:border-emerald-500"
                        value={selectedUniverseId || ""}
                        onChange={(e) => {
                            if(e.target.value === "__new__") {
                                setUniverseForm({ id:"", nome:"", descricao:"" });
                                setUniverseFormMode("create");
                            } else {
                                setSelectedUniverseId(e.target.value);
                                fetchAllData(e.target.value, null);
                            }
                        }}
                    >
                        {universes.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                        <option value="__new__" className="text-emerald-400">+ Novo Universo</option>
                    </select>
                    {currentUniverse && <button onClick={() => { setUniverseForm({...currentUniverse, descricao: currentUniverse.descricao||""}); setUniverseFormMode("edit"); }} className="px-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-400 hover:text-white">✎</button>}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {/* Botão Raiz (Ver Tudo) */}
                <button 
                    onClick={() => { setSelectedWorldId(null); setSelectedFichaId(null); }}
                    className={`w-full text-left p-2 rounded text-xs font-bold flex items-center gap-2 ${!selectedWorldId ? "bg-emerald-900/20 text-emerald-400 border border-emerald-500/30" : "text-zinc-400 hover:bg-zinc-900"}`}
                >
                    <span>🌌</span> Visão Geral (Tudo)
                </button>

                <div className="mt-4 mb-2 px-2 flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold text-zinc-600">Mundos</span>
                    <button onClick={startCreateWorld} className="text-[10px] bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-300 hover:border-emerald-500 hover:text-white">+</button>
                </div>

                {childWorlds.map(w => (
                    <div key={w.id} className={`group flex items-center justify-between p-2 rounded cursor-pointer text-xs ${selectedWorldId === w.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"}`} onClick={() => { setSelectedWorldId(w.id); setSelectedFichaId(null); }}>
                        <span className="truncate">{w.nome}</span>
                        <div className="hidden group-hover:flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); setWorldForm(w); setWorldFormMode("edit"); }} className="px-1 text-[9px] bg-black border border-zinc-700 rounded text-zinc-300">Edit</button>
                            <button onClick={(e) => handleDeleteWorld(w.id, e)} className="px-1 text-[9px] bg-red-900/30 border border-red-900 rounded text-red-400">×</button>
                        </div>
                    </div>
                ))}
                
                {childWorlds.length === 0 && <div className="px-2 text-[10px] text-zinc-600 italic">Nenhum mundo criado.</div>}
            </div>
          </section>
        )}

        {/* COLUNA 2: LISTA DE FICHAS */}
        {!isFocusMode && (
          <section className="w-80 border-r border-neutral-800 bg-neutral-900/20 flex flex-col min-h-0">
             <div className="p-3 border-b border-neutral-800 flex justify-between items-center">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                    {selectedWorldId ? worlds.find(w=>w.id===selectedWorldId)?.nome : "Todas as Fichas"}
                </h2>
                <button onClick={startCreateFicha} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded font-medium">+ Ficha</button>
             </div>
             
             <div className="p-2 space-y-2">
                <input 
                    placeholder="Buscar..." 
                    className="w-full bg-black border border-zinc-800 rounded p-1.5 text-xs text-white focus:border-emerald-500 outline-none"
                    value={fichasSearchTerm}
                    onChange={e => setFichasSearchTerm(e.target.value)}
                />
                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                    <button onClick={() => setFichaFilterTipos([])} className={`px-2 py-0.5 rounded text-[9px] border ${fichaFilterTipos.length===0 ? "border-emerald-500 text-emerald-400" : "border-zinc-800 text-zinc-500"}`}>TODOS</button>
                    {LORE_TYPES.map(t => (
                        <button key={t.value} onClick={() => setFichaFilterTipos(prev => prev.includes(t.value) ? prev.filter(x=>x!==t.value) : [...prev, t.value])} className={`px-2 py-0.5 whitespace-nowrap rounded text-[9px] border uppercase ${fichaFilterTipos.includes(t.value) ? "border-emerald-500 text-emerald-400" : "border-zinc-800 text-zinc-500"}`}>
                            {t.label}
                        </button>
                    ))}
                </div>
             </div>

             <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredFichas.length === 0 && <div className="text-center mt-10 text-[10px] text-zinc-600">Nenhuma ficha encontrada.</div>}
                {filteredFichas.map(f => (
                    <div key={f.id} onClick={() => loadFichaDetails(f.id).then(() => setSelectedFichaId(f.id))} className={`group p-2 rounded border cursor-pointer transition-all ${selectedFichaId === f.id ? "bg-emerald-900/20 border-emerald-500/50" : "bg-transparent border-zinc-800/50 hover:bg-zinc-900 hover:border-zinc-700"}`}>
                        <div className="flex justify-between items-start">
                            <div className="font-bold text-xs text-zinc-200">{f.titulo}</div>
                            <div className="text-[9px] uppercase tracking-wide text-zinc-500">{f.tipo}</div>
                        </div>
                        <div className="text-[10px] text-zinc-500 line-clamp-2 mt-1">{f.resumo}</div>
                    </div>
                ))}
             </div>
          </section>
        )}

        {/* COLUNA 3: DETALHES DA FICHA */}
        <section className={`flex-1 bg-black flex flex-col min-h-0 overflow-y-auto relative transition-all ${isFocusMode ? "w-full" : ""}`}>
            {!selectedFichaId ? (
                <div className="h-full flex items-center justify-center text-zinc-600 text-xs">Selecione ou crie uma ficha.</div>
            ) : (
                <div className="max-w-3xl mx-auto w-full p-8 pb-20">
                    {/* Toolbar */}
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <span className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold bg-emerald-900/10 px-2 py-1 rounded border border-emerald-900/30">{selectedFicha?.tipo}</span>
                            <h1 className="text-3xl font-bold text-white mt-2 mb-1">{selectedFicha?.titulo}</h1>
                            <div className="text-xs text-zinc-500 flex gap-2">
                                <span>{selectedFicha?.slug}</span>
                                <span>•</span>
                                <span>{worlds.find(w => w.id === selectedFicha?.world_id)?.nome}</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setIsFocusMode(!isFocusMode)} className="text-zinc-500 hover:text-white px-3 py-1 rounded border border-zinc-800 text-xs">{isFocusMode ? "Restaurar" : "Expandir"}</button>
                            <button onClick={() => { setFichaForm({...selectedFicha}); setFichaFormMode("edit"); }} className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1 rounded text-xs font-bold border border-zinc-700">Editar</button>
                        </div>
                    </div>

                    <div className="space-y-8">
                        {selectedFicha?.imagem_url && (
                            <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-900/30">
                                <img src={selectedFicha.imagem_url} alt="" className="w-full object-cover max-h-64 opacity-80" />
                            </div>
                        )}

                        <div>
                            <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Conteúdo</h3>
                            <div className="text-sm text-zinc-300 leading-loose whitespace-pre-wrap font-serif">
                                {renderWikiText(selectedFicha?.conteudo || selectedFicha?.resumo)}
                            </div>
                        </div>

                        {/* Metadados e Relações */}
                        <div className="grid grid-cols-2 gap-4 pt-6 border-t border-zinc-900">
                            <div>
                                <h4 className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Conexões</h4>
                                {relations.map(rel => {
                                    const other = rel.source_ficha_id === selectedFicha?.id ? rel.target : rel.source;
                                    return other ? (
                                        <div key={rel.id} className="text-xs py-1 border-b border-zinc-900 flex justify-between">
                                            <span className="text-zinc-400">{rel.tipo_relacao.replace(/_/g, " ")}</span>
                                            <span className="text-emerald-500 cursor-pointer hover:underline" onClick={() => { setSelectedFichaId(other.id); loadFichaDetails(other.id); }}>{other.titulo}</span>
                                        </div>
                                    ) : null;
                                })}
                                {relations.length === 0 && <span className="text-xs text-zinc-600 italic">Nenhuma.</span>}
                            </div>
                            <div>
                                <h4 className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Dados</h4>
                                <div className="space-y-1">
                                    {selectedFicha?.ano_diegese && <div className="text-xs flex justify-between"><span className="text-zinc-500">Ano Diegético</span><span className="text-zinc-300">{selectedFicha.ano_diegese}</span></div>}
                                    {selectedFicha?.camada_temporal && <div className="text-xs flex justify-between"><span className="text-zinc-500">Camada</span><span className="text-zinc-300">{selectedFicha.camada_temporal}</span></div>}
                                    <div className="text-xs flex justify-between"><span className="text-zinc-500">Tags</span><span className="text-zinc-300 text-right">{selectedFicha?.tags}</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
      </main>

      {/* --- MODAIS --- */}

      {/* MODAL MUNDO */}
      {worldFormMode !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <form onSubmit={handleSaveWorld} className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg w-96 shadow-xl">
                <h3 className="text-white font-bold mb-4">{worldFormMode === 'create' ? 'Novo Mundo' : 'Editar Mundo'}</h3>
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] uppercase text-zinc-500">Nome</label>
                        <input className="w-full bg-black border border-zinc-800 rounded p-2 text-sm text-white" value={worldForm.nome || ""} onChange={e => setWorldForm({...worldForm, nome: e.target.value})} autoFocus />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-zinc-500">Descrição</label>
                        <textarea className="w-full bg-black border border-zinc-800 rounded p-2 text-sm text-white h-20" value={worldForm.descricao || ""} onChange={e => setWorldForm({...worldForm, descricao: e.target.value})} />
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="hasEp" checked={worldForm.has_episodes || false} onChange={e => setWorldForm({...worldForm, has_episodes: e.target.checked})} />
                        <label htmlFor="hasEp" className="text-xs text-zinc-300">Possui episódios / capítulos?</label>
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button type="button" onClick={() => setWorldFormMode("idle")} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white">Cancelar</button>
                    <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-500">Salvar</button>
                </div>
            </form>
        </div>
      )}

      {/* MODAL FICHA */}
      {fichaFormMode !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <form onSubmit={handleSaveFicha} className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-white font-bold mb-4 uppercase tracking-widest text-sm">
                    {fichaFormMode === 'create' ? 'Nova Ficha' : 'Editar Ficha'}
                </h3>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="text-[10px] uppercase text-zinc-500 block mb-1">Mundo de Origem</label>
                        <select 
                            className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white focus:border-emerald-500"
                            value={fichaForm.world_id || ""}
                            onChange={e => setFichaForm({...fichaForm, world_id: e.target.value})}
                        >
                            <option value="" disabled>Selecione...</option>
                            {worlds.map(w => <option key={w.id} value={w.id}>{w.nome} {w.is_root ? "(Global)" : ""}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-zinc-500 block mb-1">Tipo</label>
                        <select 
                            className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white"
                            value={fichaForm.tipo}
                            onChange={e => setFichaForm({...fichaForm, tipo: e.target.value})}
                        >
                            {LORE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                </div>

                <div className="space-y-3">
                    <div><label className="text-[10px] uppercase text-zinc-500">Título</label><input className="w-full bg-black border border-zinc-800 rounded p-2 text-sm text-white" value={fichaForm.titulo || ""} onChange={e => setFichaForm({...fichaForm, titulo: e.target.value})} /></div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-[10px] uppercase text-zinc-500">Slug (URL)</label><input className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-zinc-400" value={fichaForm.slug || ""} onChange={e => setFichaForm({...fichaForm, slug: e.target.value})} placeholder="Gerado automaticamente se vazio" /></div>
                        <div><label className="text-[10px] uppercase text-zinc-500">Ano Diegese</label><input type="number" className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white" value={fichaForm.ano_diegese || ""} onChange={e => setFichaForm({...fichaForm, ano_diegese: e.target.value})} /></div>
                    </div>

                    <div><label className="text-[10px] uppercase text-zinc-500">Resumo</label><textarea className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white h-16" value={fichaForm.resumo || ""} onChange={e => setFichaForm({...fichaForm, resumo: e.target.value})} /></div>
                    <div><label className="text-[10px] uppercase text-zinc-500">Conteúdo Completo</label><textarea className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white h-32 font-mono" value={fichaForm.conteudo || ""} onChange={e => setFichaForm({...fichaForm, conteudo: e.target.value})} /></div>
                    
                    {/* Campos de Evento Condicionais */}
                    {fichaForm.tipo === 'evento' && (
                        <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded mt-2">
                            <span className="text-[10px] font-bold text-emerald-500 uppercase block mb-2">Dados de Evento</span>
                            <div className="grid grid-cols-2 gap-2">
                                <div><label className="text-[10px] text-zinc-500">Data Início</label><input type="date" className="w-full bg-black border border-zinc-800 rounded p-1 text-xs" value={fichaForm.data_inicio || ""} onChange={e => setFichaForm({...fichaForm, data_inicio: e.target.value})} /></div>
                                <div><label className="text-[10px] text-zinc-500">Data Fim</label><input type="date" className="w-full bg-black border border-zinc-800 rounded p-1 text-xs" value={fichaForm.data_fim || ""} onChange={e => setFichaForm({...fichaForm, data_fim: e.target.value})} /></div>
                            </div>
                        </div>
                    )}

                    <div><label className="text-[10px] uppercase text-zinc-500">Tags (separadas por vírgula)</label><input className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white" value={fichaForm.tags || ""} onChange={e => setFichaForm({...fichaForm, tags: e.target.value})} /></div>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <button type="button" onClick={() => setFichaFormMode("idle")} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white">Cancelar</button>
                    <button type="submit" disabled={isSavingFicha} className="px-4 py-1.5 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-500 disabled:opacity-50">{isSavingFicha ? "Salvando..." : "Salvar Ficha"}</button>
                </div>
            </form>
        </div>
      )}

      {/* MODAL UNIVERSO */}
      {universeFormMode !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <form onSubmit={e => { e.preventDefault(); saveUniverse(); }} className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg w-96 shadow-xl">
                <h3 className="text-white font-bold mb-4">{universeFormMode === 'create' ? 'Novo Universo' : 'Editar Universo'}</h3>
                <input className="w-full bg-black border border-zinc-800 rounded p-2 mb-2 text-sm text-white" placeholder="Nome" value={universeForm.nome} onChange={e=>setUniverseForm({...universeForm, nome: e.target.value})} />
                <textarea className="w-full bg-black border border-zinc-800 rounded p-2 mb-4 text-sm text-white h-20" placeholder="Descrição" value={universeForm.descricao || ""} onChange={e=>setUniverseForm({...universeForm, descricao: e.target.value})} />
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setUniverseFormMode("idle")} className="text-zinc-400 text-xs">Cancelar</button>
                    <button className="bg-emerald-600 text-white px-4 py-2 rounded text-xs font-bold">Salvar</button>
                </div>
            </form>
        </div>
      )}

    </div>
  );
}

export default function LoreAdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black text-white flex items-center justify-center">Carregando Admin...</div>}>
      <LoreAdminContent />
    </Suspense>
  );
}
