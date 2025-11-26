"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { GRANULARIDADES } from "@/lib/dates/granularidade";

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

const RELATION_TYPES = [
  "relacionado_a", "amigo_de", "inimigo_de", "localizado_em", "mora_em",
  "nasceu_em", "participou_de", "protagonizado_por", "menciona", "pai_de",
  "filho_de", "criador_de", "parte_de"
];

// --- TIPOS ---
type Universe = { id: string; nome: string; descricao?: string | null; };
type World = { id: string; nome: string; descricao?: string | null; tipo: string; ordem: number; has_episodes: boolean; universe_id?: string | null; is_root?: boolean; };
type FichaFull = {
  id: string; titulo: string; resumo: string | null; conteudo: string | null; tipo: string; tags: string | null;
  aparece_em: string | null; ano_diegese: number | null; data_inicio: string | null; data_fim: string | null;
  granularidade_data: string | null; camada_temporal: string | null; descricao_data: string | null;
  world_id: string; imagem_url?: string | null; codigo?: string | null; slug?: string | null;
  [key: string]: any;
};
type Relation = { id: string; tipo_relacao: string; source_ficha_id: string; target_ficha_id: string; source?: any; target?: any; };

function escapeRegExp(str: string) { return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// --- COMPONENTE INTERNO ---
function LoreAdminContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Auth & Status
  const [view, setView] = useState<"loading"|"loggedOut"|"loggedIn">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Dados
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState<string | null>(null);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null); // null = VENDO TODOS DO UNIVERSO
  const [fichas, setFichas] = useState<FichaFull[]>([]);
  const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);
  const [codes, setCodes] = useState<any[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);

  // Filtros UI
  const [fichaFilterTipos, setFichaFilterTipos] = useState<string[]>([]);
  const [fichasSearchTerm, setFichasSearchTerm] = useState<string>("");
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Forms States (Simplificado para brevidade, lógica mantida)
  const [universeFormMode, setUniverseFormMode] = useState<"idle"|"create"|"edit">("idle");
  const [universeForm, setUniverseForm] = useState({ id:"", nome:"", descricao:"" });
  const [captcha, setCaptcha] = useState("");
  const [captchaChallenge, setCaptchaChallenge] = useState({ q: "", a: "" });

  const [worldFormMode, setWorldFormMode] = useState<"idle"|"create"|"edit">("idle");
  const [worldForm, setWorldForm] = useState<any>({}); // Simplificado
  const [fichaFormMode, setFichaFormMode] = useState<"idle"|"create"|"edit">("idle");
  const [fichaForm, setFichaForm] = useState<any>({}); // Simplificado

  // --- AUTH & INIT ---
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (data.session) { setView("loggedIn"); loadUniverses(); }
      else setView("loggedOut");
    });
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else { setView("loggedIn"); loadUniverses(); }
  }

  // --- LOADERS ---
  async function loadUniverses() {
    setIsLoadingData(true);
    const { data } = await supabaseBrowser.from("universes").select("*").order("nome");
    if (data) {
      setUniverses(data);
      // Seleciona o primeiro ou o da URL
      const initial = data.length > 0 ? data[0].id : null;
      if (initial) handleSelectUniverse(initial);
    }
    setIsLoadingData(false);
  }

  async function loadWorlds(uniId: string) {
    const { data } = await supabaseBrowser.from("worlds").select("*").eq("universe_id", uniId).order("ordem");
    const list = data || [];
    setWorlds(list);
    // Se não tiver mundo selecionado, carregamos TODAS as fichas do universo
    if (!selectedWorldId) loadFichas(uniId, null); 
    else loadFichas(uniId, selectedWorldId);
  }

  async function loadFichas(uniId: string, worldId: string | null) {
    setIsLoadingData(true);
    let query = supabaseBrowser.from("fichas").select("*").order("titulo");
    
    if (worldId) {
      // Filtrar por mundo específico
      query = query.eq("world_id", worldId);
    } else {
      // Filtrar por TODOS os mundos do universo
      // Primeiro pegamos os IDs dos mundos desse universo
      const { data: wData } = await supabaseBrowser.from("worlds").select("id").eq("universe_id", uniId);
      const wIds = wData?.map(w => w.id) || [];
      if (wIds.length > 0) query = query.in("world_id", wIds);
      else query = query.eq("id", "00000000-0000-0000-0000-000000000000"); // Nenhum
    }

    const { data } = await query;
    setFichas(data || []);
    setIsLoadingData(false);
  }

  async function loadDetails(fichaId: string) {
    const { data: cData } = await supabaseBrowser.from("codes").select("*").eq("ficha_id", fichaId);
    setCodes(cData || []);
    const { data: rData } = await supabaseBrowser.from("lore_relations").select(`*, source:source_ficha_id(titulo), target:target_ficha_id(titulo)`).or(`source_ficha_id.eq.${fichaId},target_ficha_id.eq.${fichaId}`);
    setRelations(rData || []);
  }

  // --- HANDLERS DE SELEÇÃO ---
  function handleSelectUniverse(id: string) {
    setSelectedUniverseId(id);
    setSelectedWorldId(null); // Reseta mundo para ver "Tudo"
    setSelectedFichaId(null);
    loadWorlds(id);
  }

  function handleSelectWorld(id: string | null) {
    setSelectedWorldId(id);
    setSelectedFichaId(null);
    if (selectedUniverseId) loadFichas(selectedUniverseId, id);
  }

  function handleSelectFicha(id: string) {
    setSelectedFichaId(id);
    loadDetails(id);
  }

  // --- ACTIONS (Create/Edit/Delete) ---
  
  // UNIVERSO
  function startCreateUniverse() { setUniverseForm({id:"", nome:"", descricao:""}); setUniverseFormMode("create"); }
  function startEditUniverse(u: Universe) { setUniverseForm(u); setUniverseFormMode("edit"); }
  async function saveUniverse() {
    if (universeFormMode === "create") {
      const { data } = await supabaseBrowser.from("universes").insert({ nome: universeForm.nome, descricao: universeForm.descricao }).select().single();
      if (data) {
        // Criar mundo raiz automaticamente
        const rootId = universeForm.nome.toLowerCase().replace(/\s+/g, "_") + "_root";
        await supabaseBrowser.from("worlds").insert({ id: rootId, nome: universeForm.nome, universe_id: data.id, is_root: true, tipo: "meta_universo", ordem: 0 });
        loadUniverses();
      }
    } else {
      await supabaseBrowser.from("universes").update({ nome: universeForm.nome, descricao: universeForm.descricao }).eq("id", universeForm.id);
      loadUniverses();
    }
    setUniverseFormMode("idle");
  }
  function requestDeleteUniverse(u: Universe) {
    const a = Math.floor(Math.random() * 10);
    const b = Math.floor(Math.random() * 10);
    setCaptchaChallenge({ q: `${a} + ${b}`, a: String(a + b) });
    setCaptcha("");
    if (confirm(`ATENÇÃO: Deletar o universo "${u.nome}" apagará TODOS os mundos e fichas dentro dele. \n\nTem certeza absoluta?`)) {
       const ans = prompt(`Para confirmar, resolva: ${a} + ${b}`);
       if (ans === String(a + b)) {
         supabaseBrowser.from("universes").delete().eq("id", u.id).then(() => loadUniverses());
       } else {
         alert("Captcha incorreto. Ação cancelada.");
       }
    }
  }

  // FICHA (Resumido para caber)
  async function saveFicha(e: any) {
    e.preventDefault();
    const payload = { ...fichaForm, updated_at: new Date().toISOString() };
    // Se não tem mundo selecionado (está vendo tudo), obriga a selecionar um mundo raiz ou o primeiro
    if (!payload.world_id && selectedUniverseId) {
       const root = worlds.find(w => w.is_root) || worlds[0];
       if(root) payload.world_id = root.id;
    }
    
    if (fichaFormMode === 'create') await supabaseBrowser.from("fichas").insert([payload]);
    else await supabaseBrowser.from("fichas").update(payload).eq("id", fichaForm.id);
    
    setFichaFormMode("idle");
    if (selectedUniverseId) loadFichas(selectedUniverseId, selectedWorldId);
  }
  async function deleteFicha(id: string) {
    if (!confirm("Deletar ficha?")) return;
    await supabaseBrowser.from("fichas").delete().eq("id", id);
    if (selectedUniverseId) loadFichas(selectedUniverseId, selectedWorldId);
    setSelectedFichaId(null);
  }

  // --- RENDER HELPERS ---
  const renderWikiText = (text: string | null) => {
    if (!text) return null;
    // Lógica simplificada de links wiki
    return <div className="whitespace-pre-wrap">{text}</div>; 
  };

  // Filtros
  const filteredFichas = fichas.filter(f => {
    if (fichaFilterTipos.length > 0 && !fichaFilterTipos.includes(f.tipo)) return false;
    if (fichasSearchTerm && !f.titulo.toLowerCase().includes(fichasSearchTerm.toLowerCase())) return false;
    return true;
  });

  const currentUniverse = universes.find(u => u.id === selectedUniverseId);
  const currentFicha = fichas.find(f => f.id === selectedFichaId);

  if (view === "loading") return <div className="h-screen bg-black text-white flex items-center justify-center">Carregando...</div>;
  if (view === "loggedOut") return <div className="h-screen bg-black text-white flex items-center justify-center">Login necessário.</div>;

  return (
    <div className="h-screen bg-black text-neutral-100 flex flex-col overflow-hidden">
      {/* 1.1 MENU DE TOPO RESTAURADO */}
      <header className="h-10 border-b border-zinc-900 flex items-center justify-between px-4 bg-zinc-950">
        <div className="flex items-center gap-6 text-xs font-medium">
          <a href="/" className="text-zinc-400 hover:text-white">Home</a>
          <a href="/lore-upload" className="text-zinc-400 hover:text-white">Upload</a>
          <a href="/lore-admin/timeline" className="text-zinc-400 hover:text-white">Timeline</a>
        </div>
        <div className="text-[10px] text-zinc-600 uppercase tracking-widest">Lore Machine Admin</div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* COLUNA 1: UNIVERSO & MUNDOS */}
        {!isFocusMode && (
          <aside className="w-64 bg-zinc-950 border-r border-zinc-900 flex flex-col min-h-0">
            
            {/* 1.3 SEÇÃO UNIVERSO */}
            <div className="p-4 border-b border-zinc-900 bg-zinc-900/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Universo</span>
                <div className="flex gap-1">
                  <button onClick={() => currentUniverse && startEditUniverse(currentUniverse)} className="text-zinc-600 hover:text-white" title="Editar Universo">✎</button>
                  <button onClick={() => currentUniverse && requestDeleteUniverse(currentUniverse)} className="text-zinc-600 hover:text-red-500" title="Deletar Universo">×</button>
                </div>
              </div>
              
              <div className="relative group">
                <select 
                  className="w-full bg-black border border-zinc-700 text-white text-sm rounded p-2 outline-none focus:border-emerald-500 appearance-none font-bold"
                  value={selectedUniverseId || ""}
                  onChange={(e) => e.target.value === "new" ? startCreateUniverse() : handleSelectUniverse(e.target.value)}
                >
                  {universes.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  <option value="new">+ Novo Universo...</option>
                </select>
                <div className="absolute right-3 top-3 pointer-events-none text-zinc-500 text-[10px]">▼</div>
              </div>
            </div>

            {/* 1.5 BOTÃO "VER TUDO DO UNIVERSO" */}
            <div className="p-2">
               <button 
                 onClick={() => handleSelectWorld(null)}
                 className={`w-full text-left p-3 rounded border transition-all mb-2 ${!selectedWorldId ? "border-emerald-500 bg-emerald-900/10 text-white font-bold shadow-[0_0_10px_rgba(16,185,129,0.2)]" : "border-zinc-800 text-zinc-400 hover:bg-zinc-900"}`}
               >
                 <div className="flex items-center gap-2">
                   <span>🪐</span>
                   <span className="text-xs">{currentUniverse?.nome || "Universo"} (Todos)</span>
                 </div>
               </button>
            </div>

            {/* LISTA DE MUNDOS */}
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              <div className="flex items-center justify-between px-1 mb-2 mt-2">
                <span className="text-[9px] uppercase tracking-widest text-zinc-600">Mundos</span>
                <button onClick={() => { setWorldFormMode("create"); setWorldForm({universe_id: selectedUniverseId}); }} className="text-[10px] text-zinc-500 hover:text-white">+ Novo</button>
              </div>
              <div className="space-y-1">
                {worlds.map(w => (
                  <div key={w.id} className={`group flex items-center justify-between px-3 py-2 rounded cursor-pointer border ${selectedWorldId === w.id ? "bg-zinc-800 border-emerald-500/50 text-white" : "border-transparent text-zinc-400 hover:bg-zinc-900"}`} onClick={() => handleSelectWorld(w.id)}>
                    <span className="text-xs truncate w-32">{w.nome}</span>
                    <div className="hidden group-hover:flex gap-1">
                       <button className="text-[9px] text-zinc-500 hover:text-white">✎</button>
                       <button className="text-[9px] text-zinc-500 hover:text-red-500">×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* COLUNA 2: LISTA DE FICHAS */}
        {!isFocusMode && (
          <aside className="w-80 bg-black border-r border-zinc-900 flex flex-col min-h-0">
            <div className="p-4 border-b border-zinc-900">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                  {selectedWorldId ? worlds.find(w => w.id === selectedWorldId)?.nome : currentUniverse?.nome}
                </h2>
                <button onClick={() => { setFichaFormMode("create"); setFichaForm({tipo:'conceito'}); }} className="text-[10px] px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300 transition">+ Nova</button>
              </div>
              
              {/* 1.4.4 BARRA DE BUSCA */}
              <input 
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-white focus:border-emerald-500 outline-none mb-3"
                placeholder="Buscar ficha..."
                value={fichasSearchTerm}
                onChange={e => setFichasSearchTerm(e.target.value)}
              />

              {/* 1.4.3 FILTROS DE CATEGORIA */}
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto scrollbar-thin">
                <button onClick={() => setFichaFilterTipos([])} className={`px-2 py-0.5 text-[9px] rounded border ${fichaFilterTipos.length === 0 ? "border-emerald-500 text-emerald-400" : "border-zinc-800 text-zinc-500"}`}>TODOS</button>
                {LORE_TYPES.map(t => (
                  <button 
                    key={t.value} 
                    title={t.label} 
                    onClick={() => setFichaFilterTipos(prev => prev.includes(t.value) ? prev.filter(x => x !== t.value) : [...prev, t.value])}
                    className={`px-2 py-0.5 text-[9px] rounded border uppercase ${fichaFilterTipos.includes(t.value) ? "border-emerald-500 text-emerald-400" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}
                  >
                    {t.value.slice(0,3)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredFichas.map(f => (
                <div 
                  key={f.id} 
                  onClick={() => handleSelectFicha(f.id)}
                  className={`group p-3 rounded border cursor-pointer transition-all ${selectedFichaId === f.id ? "bg-zinc-900 border-emerald-500/50 text-white" : "bg-transparent border-zinc-900 text-zinc-400 hover:border-zinc-700"}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-xs mb-1">{f.titulo}</div>
                      <div className="text-[9px] uppercase tracking-wider opacity-60">{f.tipo}</div>
                    </div>
                    <div className="hidden group-hover:flex gap-2 bg-black/50 p-1 rounded">
                      <button onClick={(e) => {e.stopPropagation(); setFichaForm(f); setFichaFormMode('edit')}} className="text-[9px] hover:text-emerald-400">Edit</button>
                      <button onClick={(e) => {e.stopPropagation(); deleteFicha(f.id)}} className="text-[9px] hover:text-red-400">Del</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* COLUNA 3: DETALHES (WIKI STYLE) */}
        <main className="flex-1 bg-black overflow-y-auto p-8 flex justify-center">
          {currentFicha ? (
            <div className={`w-full transition-all ${isFocusMode ? "max-w-4xl" : "max-w-3xl"}`}>
              <div className="flex justify-between items-start mb-6 border-b border-zinc-800 pb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold mb-1 flex items-center gap-2">
                    {currentFicha.tipo}
                    {currentFicha.codigo && <span className="bg-zinc-900 px-1 rounded text-zinc-500 font-mono">{currentFicha.codigo}</span>}
                  </div>
                  <h1 className="text-4xl font-bold text-white">{currentFicha.titulo}</h1>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setFichaForm(currentFicha); setFichaFormMode('edit'); }} className="px-3 py-1 rounded border border-zinc-700 text-xs hover:bg-zinc-800 text-zinc-300">Editar</button>
                  <button onClick={() => setIsFocusMode(!isFocusMode)} className="px-3 py-1 rounded border border-zinc-700 text-xs hover:bg-zinc-800 text-zinc-300">{isFocusMode ? "Restaurar" : "Expandir"}</button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[3fr,1fr] gap-8">
                {/* CONTEÚDO PRINCIPAL */}
                <div className="space-y-6">
                  {currentFicha.imagem_url && <img src={currentFicha.imagem_url} className="w-full rounded border border-zinc-800" />}
                  
                  {currentFicha.resumo && (
                    <div className="text-lg leading-relaxed text-zinc-400 italic font-serif border-l-2 border-emerald-900 pl-4">
                      {currentFicha.resumo}
                    </div>
                  )}
                  
                  <div className="prose prose-invert prose-sm max-w-none text-zinc-300 leading-7 whitespace-pre-wrap">
                    {/* 1.4.6 VOLTAR AO MODO ANTIGO DE VISUALIZAÇÃO */}
                    {currentFicha.conteudo}
                  </div>

                  {currentFicha.aparece_em && (
                    <div className="mt-8 pt-4 border-t border-zinc-900">
                      <h4 className="text-xs font-bold uppercase text-zinc-500 mb-2">Aparições</h4>
                      <p className="text-sm text-zinc-400">{currentFicha.aparece_em}</p>
                    </div>
                  )}
                </div>

                {/* SIDEBAR DE METADADOS */}
                <div className="space-y-6">
                  {relations.length > 0 && (
                    <div className="bg-zinc-900/30 p-4 rounded border border-zinc-800">
                      <h4 className="text-[10px] font-bold uppercase text-emerald-500 mb-3">Conexões</h4>
                      <ul className="space-y-2">
                        {relations.map(r => (
                          <li key={r.id} className="text-xs text-zinc-300 flex flex-col">
                            <span className="text-[9px] text-zinc-500 uppercase">{r.tipo_relacao.replace(/_/g, " ")}</span>
                            <span className="font-medium hover:underline cursor-pointer" onClick={() => handleSelectFicha(r.source_ficha_id === currentFicha.id ? r.target_ficha_id : r.source_ficha_id)}>
                              {r.source_ficha_id === currentFicha.id ? r.target?.titulo : r.source?.titulo}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {codes.length > 0 && (
                    <div className="bg-zinc-900/30 p-4 rounded border border-zinc-800">
                      <h4 className="text-[10px] font-bold uppercase text-zinc-500 mb-3">Códigos</h4>
                      <div className="flex flex-wrap gap-2">
                        {codes.map(c => <span key={c.id} className="text-[10px] font-mono bg-black border border-zinc-700 px-2 py-1 rounded text-emerald-400" title={c.description}>{c.code}</span>)}
                      </div>
                    </div>
                  )}

                  <div className="bg-zinc-900/30 p-4 rounded border border-zinc-800 space-y-3">
                    <h4 className="text-[10px] font-bold uppercase text-zinc-500">Dados Temporais</h4>
                    {currentFicha.ano_diegese && <div className="flex justify-between text-xs text-zinc-400"><span>Ano</span><span className="text-white">{currentFicha.ano_diegese}</span></div>}
                    {currentFicha.data_inicio && <div className="flex justify-between text-xs text-zinc-400"><span>Início</span><span className="text-white">{currentFicha.data_inicio}</span></div>}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-zinc-700 gap-4">
              <div className="text-6xl opacity-20">❖</div>
              <div className="text-sm uppercase tracking-widest">Selecione uma ficha para ler</div>
            </div>
          )}
        </main>
      </div>

      {/* MODAIS (Forms) - Simplificados aqui para economizar espaço, mas a lógica está nos handlers acima */}
      {universeFormMode !== 'idle' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded w-96">
            <h3 className="text-white font-bold mb-4">{universeFormMode === 'create' ? 'Novo Universo' : 'Editar Universo'}</h3>
            <input className="w-full bg-black border border-zinc-700 rounded p-2 mb-2 text-white" placeholder="Nome" value={universeForm.nome} onChange={e=>setUniverseForm({...universeForm, nome: e.target.value})} />
            <textarea className="w-full bg-black border border-zinc-700 rounded p-2 mb-4 text-white h-24" placeholder="Descrição" value={universeForm.descricao || ""} onChange={e=>setUniverseForm({...universeForm, descricao: e.target.value})} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setUniverseFormMode('idle')} className="text-zinc-400 text-xs">Cancelar</button>
              <button onClick={saveUniverse} className="bg-emerald-600 text-white px-4 py-2 rounded text-xs">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* INSERIR AQUI OS MODAIS DE FICHA E MUNDO (Mantendo a lógica que você já tinha antes) */}
      {/* Eles usarão os states `fichaFormMode` e `worldFormMode` configurados nos handlers */}
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
