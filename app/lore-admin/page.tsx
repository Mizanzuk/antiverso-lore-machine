"use client";

import React, { useEffect, useState, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { GRANULARIDADES, normalizeGranularidade } from "@/lib/dates/granularidade";

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
type CodeFormMode = "idle" | "create" | "edit";

type DuplicatePair = {
  id_a: string;
  titulo_a: string;
  tipo_a: string;
  id_b: string;
  titulo_b: string;
  tipo_b: string;
  similarity: number;
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

type Relation = {
  id: string;
  tipo_relacao: string;
  descricao: string;
  source_ficha_id: string;
  target_ficha_id: string;
  source?: { id: string; titulo: string; tipo: string };
  target?: { id: string; titulo: string; tipo: string };
};

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function LoreAdminPage() {
  const [view, setView] = useState<ViewState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dados
  const [worlds, setWorlds] = useState<any[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [fichas, setFichas] = useState<any[]>([]);
  const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);
  const [codes, setCodes] = useState<any[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Filtros
  const [fichaFilterTipos, setFichaFilterTipos] = useState<string[]>([]);
  const [fichasSearchTerm, setFichasSearchTerm] = useState<string>("");

  // Forms
  const [worldFormMode, setWorldFormMode] = useState<WorldFormMode>("idle");
  const [isSavingWorld, setIsSavingWorld] = useState(false);
  const [worldForm, setWorldForm] = useState<{
    id: string; nome: string; descricao: string; tipo: string; ordem: string; has_episodes: boolean;
  }>({ id: "", nome: "", descricao: "", tipo: "", ordem: "", has_episodes: true });

  const [fichaFormMode, setFichaFormMode] = useState<FichaFormMode>("idle");
  const [isSavingFicha, setIsSavingFicha] = useState(false);
  const [fichaForm, setFichaForm] = useState<{
    id: string; titulo: string; slug: string; tipo: string; resumo: string;
    conteudo: string; tags: string; ano_diegese: string; ordem_cronologica: string;
    aparece_em: string; codigo: string; imagem_url: string;
    data_inicio: string; data_fim: string; granularidade_data: string;
    descricao_data: string; camada_temporal: string;
  }>({
    id: "", titulo: "", slug: "", tipo: "", resumo: "", conteudo: "", tags: "",
    ano_diegese: "", ordem_cronologica: "", aparece_em: "", codigo: "", imagem_url: "",
    data_inicio: "", data_fim: "", granularidade_data: "indefinido", descricao_data: "", camada_temporal: "linha_principal"
  });

  const [codeFormMode, setCodeFormMode] = useState<CodeFormMode>("idle");
  const [isSavingCode, setIsSavingCode] = useState(false);
  const [codeForm, setCodeForm] = useState<{
    id: string; code: string; label: string; description: string; episode: string;
  }>({ id: "", code: "", label: "", description: "", episode: "" });

  // Modais Visuais
  const [worldViewModal, setWorldViewModal] = useState<any | null>(null);
  const [fichaViewModal, setFichaViewModal] = useState<any | null>(null);

  // Reconciliação
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcilePairs, setReconcilePairs] = useState<DuplicatePair[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [comparing, setComparing] = useState<{ a: FichaFull; b: FichaFull } | null>(null);
  const [mergeDraft, setMergeDraft] = useState<FichaFull | null>(null);
  const [reconcileProcessing, setReconcileProcessing] = useState(false);

  // --- AUTH ---
  useEffect(() => {
    const checkSession = async () => {
      setView("loading");
      const { data: { session }, error } = await supabaseBrowser.auth.getSession();
      if (error) { console.error(error); setView("loggedOut"); return; }
      if (session) { setView("loggedIn"); await fetchAllData(); } 
      else { setView("loggedOut"); }
    };
    checkSession();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true); setError(null);
    const { data, error: loginError } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);
    if (loginError) { setError(loginError.message); return; }
    if (data.session) { setView("loggedIn"); await fetchAllData(); }
  }

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    setView("loggedOut"); setEmail(""); setPassword("");
  }

  // --- DATA FETCHING ---
  async function fetchAllData() {
    try {
      setIsLoadingData(true); setError(null);
      const { data, error: worldsError } = await supabaseBrowser.from("worlds").select("*").order("ordem", { ascending: true });
      if (worldsError) { console.error(worldsError); setError("Erro ao carregar mundos."); setIsLoadingData(false); return; }
      
      const list = data || [];
      list.sort((a: any, b: any) => {
        const nameA = (a.nome || "").toLowerCase().trim();
        const nameB = (b.nome || "").toLowerCase().trim();
        if (nameA === "antiverso") return -1;
        if (nameB === "antiverso") return 1;
        return (a.ordem || 0) - (b.ordem || 0);
      });

      setWorlds(list);

      if (!selectedWorldId && list.length > 0) {
        const anti = list.find((w: any) => w.nome?.toLowerCase().trim() === "antiverso");
        const first = anti || list[0];
        setSelectedWorldId(first.id as string);
        await fetchFichas(first);
      } else if (selectedWorldId) {
        const current = list.find((w: any) => w.id === selectedWorldId) || null;
        await fetchFichas(current);
      }
      setIsLoadingData(false);
    } catch (err: any) {
      console.error(err); setError("Erro inesperado ao carregar dados."); setIsLoadingData(false);
    }
  }

  async function fetchFichas(world: any | null) {
    setError(null);
    if (!world) { setFichas([]); setSelectedFichaId(null); setCodes([]); setRelations([]); return; }
    const isRoot = (world?.nome || "").trim().toLowerCase() === "antiverso";
    let query = supabaseBrowser.from("fichas").select("*").order("titulo", { ascending: true });
    if (!isRoot) { query = query.eq("world_id", world.id); }
    const { data, error: fichasError } = await query;
    if (fichasError) { console.error(fichasError); setError("Erro ao carregar fichas."); return; }
    setFichas(data || []); setSelectedFichaId(null); setCodes([]); setRelations([]);
  }

  async function fetchCodes(fichaId: string) {
    setError(null);
    const { data, error: codesError } = await supabaseBrowser.from("codes").select("*").eq("ficha_id", fichaId).order("code", { ascending: true });
    if (codesError) { console.error(codesError); setError("Erro ao carregar códigos."); return; }
    setCodes(data || []);
  }

  async function fetchRelations(fichaId: string) {
    setRelations([]);
    const { data, error: relError } = await supabaseBrowser
      .from("lore_relations")
      .select(`*, source:source_ficha_id(id, titulo, tipo), target:target_ficha_id(id, titulo, tipo)`)
      .or(`source_ficha_id.eq.${fichaId},target_ficha_id.eq.${fichaId}`);

    if (relError) { console.error("Erro ao carregar relações:", relError); return; }
    setRelations((data as any[]) || []);
  }

  function handleSelectFicha(fichaId: string) {
    setSelectedFichaId(fichaId);
    fetchCodes(fichaId);
    fetchRelations(fichaId);
  }

  // --- WIKI RENDERER ---
  const renderWikiText = (text: string | null | undefined) => {
    if (!text) return null;
    const currentFichaId = selectedFichaId;
    const candidates = fichas
      .filter((f) => f.id !== currentFichaId && typeof f.titulo === "string" && f.titulo.trim().length > 0)
      .map((f) => ({ id: f.id as string, titulo: (f.titulo as string).trim() }));

    if (candidates.length === 0) return text;
    candidates.sort((a, b) => b.titulo.length - a.titulo.length);

    const pattern = new RegExp(`\\b(${candidates.map((c) => escapeRegExp(c.titulo)).join("|")})\\b`, "gi");
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    text.replace(pattern, (match, _group, offset) => {
      if (typeof offset !== "number") return match;
      if (offset > lastIndex) elements.push(text.slice(lastIndex, offset));
      
      const target = candidates.find((c) => c.titulo.toLowerCase() === match.toLowerCase());
      if (target) {
        elements.push(
          <button
            key={`${target.id}-${offset}`}
            type="button"
            className="underline decoration-dotted decoration-emerald-500/70 hover:text-emerald-300 text-emerald-100 font-medium cursor-pointer transition-colors"
            onClick={() => handleSelectFicha(target.id)}
          >
            {match}
          </button>
        );
      } else {
        elements.push(match);
      }
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < text.length) elements.push(text.slice(lastIndex));
    return <>{elements}</>;
  };

  // --- CRUD MUNDOS ---
  function startCreateWorld() { setWorldFormMode("create"); setWorldForm({ id: "", nome: "", descricao: "", tipo: "", ordem: "", has_episodes: true }); }
  function startEditWorld(world: any) { setWorldFormMode("edit"); setWorldForm({ id: world.id, nome: world.nome, descricao: world.descricao, tipo: world.tipo, ordem: world.ordem, has_episodes: world.has_episodes }); }
  function cancelWorldForm() { setWorldFormMode("idle"); }
  async function handleSaveWorld(e: React.FormEvent) {
    e.preventDefault(); setIsSavingWorld(true);
    const payload: any = { nome: worldForm.nome.trim(), descricao: worldForm.descricao.trim() || null, has_episodes: worldForm.has_episodes };
    if(worldFormMode==='create') await supabaseBrowser.from("worlds").insert([payload]);
    else await supabaseBrowser.from("worlds").update(payload).eq("id", worldForm.id);
    setIsSavingWorld(false); cancelWorldForm(); await fetchAllData();
  }
  async function handleDeleteWorld(id: string) {
    if(!confirm("Deletar mundo?")) return;
    await supabaseBrowser.from("worlds").delete().eq("id", id); await fetchAllData();
  }

  // --- CRUD FICHAS ---
  function startCreateFicha() { 
    if(!selectedWorldId) return alert("Selecione um mundo");
    setFichaFormMode("create"); 
    setFichaForm({ id:"", titulo:"", slug:"", tipo:"conceito", resumo:"", conteudo:"", tags:"", ano_diegese:"", ordem_cronologica:"", aparece_em:"", codigo:"", imagem_url:"", data_inicio:"", data_fim:"", granularidade_data:"indefinido", descricao_data:"", camada_temporal:"linha_principal" }); 
  }
  function startEditFicha(f: any) { 
    setFichaFormMode("edit"); 
    setFichaForm({ 
      id: f.id, titulo: f.titulo, slug: f.slug, tipo: f.tipo, resumo: f.resumo, conteudo: f.conteudo, tags: f.tags, 
      ano_diegese: f.ano_diegese, ordem_cronologica: f.ordem_cronologica, aparece_em: f.aparece_em, codigo: f.codigo, imagem_url: f.imagem_url,
      data_inicio: f.data_inicio, data_fim: f.data_fim, granularidade_data: f.granularidade_data, descricao_data: f.descricao_data, camada_temporal: f.camada_temporal 
    }); 
  }
  function cancelFichaForm() { setFichaFormMode("idle"); }
  async function handleSaveFicha(e: React.FormEvent) {
    e.preventDefault(); setIsSavingFicha(true);
    const payload: any = {
      world_id: selectedWorldId,
      titulo: fichaForm.titulo,
      slug: fichaForm.slug || null,
      tipo: fichaForm.tipo,
      resumo: fichaForm.resumo,
      conteudo: fichaForm.conteudo,
      tags: fichaForm.tags,
      ano_diegese: fichaForm.ano_diegese ? parseInt(fichaForm.ano_diegese) : null,
      aparece_em: fichaForm.aparece_em,
      codigo: fichaForm.codigo,
      imagem_url: fichaForm.imagem_url,
      data_inicio: fichaForm.data_inicio || null,
      data_fim: fichaForm.data_fim || null,
      granularidade_data: fichaForm.granularidade_data || null,
      descricao_data: fichaForm.descricao_data || null,
      camada_temporal: fichaForm.camada_temporal || null,
      updated_at: new Date().toISOString()
    };
    if (fichaFormMode === 'create') await supabaseBrowser.from("fichas").insert([payload]);
    else await supabaseBrowser.from("fichas").update(payload).eq("id", fichaForm.id);
    setIsSavingFicha(false); cancelFichaForm();
    const w = worlds.find(x => x.id === selectedWorldId); await fetchFichas(w);
  }
  async function handleDeleteFicha(id: string) {
    if(!confirm("Deletar ficha?")) return;
    await supabaseBrowser.from("codes").delete().eq("ficha_id", id);
    await supabaseBrowser.from("fichas").delete().eq("id", id);
    if(selectedFichaId === id) setSelectedFichaId(null);
    const w = worlds.find(x => x.id === selectedWorldId); await fetchFichas(w);
  }

  // --- CRUD CÓDIGOS ---
  function startCreateCode() { setCodeFormMode("create"); setCodeForm({ id:"", code:"", label:"", description:"", episode:"" }); }
  function startEditCode(c:any) { setCodeFormMode("edit"); setCodeForm({ id:c.id, code:c.code, label:c.label, description:c.description, episode:"" }); }
  function cancelCodeForm() { setCodeFormMode("idle"); }
  async function handleSaveCode(e:React.FormEvent) {
    e.preventDefault(); 
    const payload:any = { ficha_id: selectedFichaId, code: codeForm.code, label: codeForm.label, description: codeForm.description, updated_at: new Date().toISOString() }; 
    if(codeFormMode==='create') await supabaseBrowser.from("codes").insert([payload]); 
    else await supabaseBrowser.from("codes").update(payload).eq("id", codeForm.id); 
    setIsSavingCode(false); setCodeFormMode("idle"); fetchCodes(selectedFichaId!); 
  }
  async function handleDeleteCode(id: string) { await supabaseBrowser.from("codes").delete().eq("id", id); fetchCodes(selectedFichaId!); }

  // --- RECONCILIAÇÃO ---
  async function openReconcile() { setShowReconcile(true); setReconcileLoading(true); const res = await fetch("/api/lore/reconcile"); const json = await res.json(); setReconcilePairs(json.duplicates || []); setReconcileLoading(false); }
  async function handleSelectReconcilePair(pair: DuplicatePair) { setReconcileLoading(true); const {data:dA} = await supabaseBrowser.from("fichas").select("*").eq("id", pair.id_a).single(); const {data:dB} = await supabaseBrowser.from("fichas").select("*").eq("id", pair.id_b).single(); setComparing({a:dA, b:dB}); setMergeDraft({...dA}); setReconcileLoading(false); }
  function updateMergeDraft(field: keyof FichaFull, value: any) { if(mergeDraft) setMergeDraft({...mergeDraft, [field]: value}); }
  async function executeMerge(wId: string, lId: string) { if(!confirm("Confirmar fusão?")) return; setReconcileProcessing(true); await fetch("/api/lore/reconcile", {method:"POST", body:JSON.stringify({winnerId:wId, loserId:lId, mergedData:mergeDraft})}); setComparing(null); setMergeDraft(null); openReconcile(); setReconcileProcessing(false); }
  
  const FieldChoice = ({ label, field }: { label: string; field: keyof FichaFull }) => {
    if (!comparing || !mergeDraft) return null;
    const valA = comparing.a[field];
    const valB = comparing.b[field];
    const current = mergeDraft[field];
    if (valA === valB) return <div className="mb-3 opacity-60"><div className="text-[10px] uppercase text-zinc-500 mb-1">{label} (iguais)</div><div className="p-2 bg-zinc-900/50 rounded border border-zinc-800 text-sm text-zinc-300">{String(valA || "(vazio)")}</div></div>;
    return (
      <div className="mb-4 p-3 bg-zinc-900/30 rounded border border-zinc-800">
        <div className="text-[10px] uppercase text-zinc-500 mb-2 flex justify-between font-bold"><span>{label}</span><span className={current===valA?"text-blue-400":"text-purple-400"}>{current===valA?"A":"B"}</span></div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={()=>updateMergeDraft(field, valA)} className={`text-left p-2 rounded border text-xs ${current===valA?"border-blue-500 bg-blue-900/20":"border-zinc-700"}`}>{String(valA||"(vazio)")}</button>
          <button onClick={()=>updateMergeDraft(field, valB)} className={`text-left p-2 rounded border text-xs ${current===valB?"border-purple-500 bg-purple-900/20":"border-zinc-700"}`}>{String(valB||"(vazio)")}</button>
        </div>
      </div>
    );
  };

  // --- UI HELPER ---
  const selectedWorld = worlds.find((w) => w.id === selectedWorldId) || null;
  const selectedFicha = fichas.find((f) => f.id === selectedFichaId) || null;

  // Calcula tipos disponíveis dinamicamente para os filtros
  const allTypes = useMemo(() => {
    const standard = LORE_TYPES.map(t => t.value);
    const fromData = fichas.map(f => (f.tipo || "").toLowerCase().trim()).filter(Boolean);
    // Junta tudo num Set para remover duplicatas e ordena
    return Array.from(new Set([...standard, ...fromData])).sort();
  }, [fichas]);

  // Helper para pegar o Label bonito do tipo
  function getTypeLabel(typeValue: string) {
    const found = LORE_TYPES.find(t => t.value === typeValue);
    return found ? found.label : typeValue.charAt(0).toUpperCase() + typeValue.slice(1);
  }

  const filteredFichas = fichas.filter((f) => {
    if (fichaFilterTipos.length > 0 && !fichaFilterTipos.includes((f.tipo || "").toLowerCase())) return false;
    if (fichasSearchTerm.trim().length > 0) {
      const q = fichasSearchTerm.toLowerCase();
      const inTitulo = (f.titulo || "").toLowerCase().includes(q);
      const inResumo = (f.resumo || "").toLowerCase().includes(q);
      if (!inTitulo && !inResumo) return false;
    }
    return true;
  });

  function toggleFilterTipo(tipo: string) {
    const t = tipo.toLowerCase();
    setFichaFilterTipos((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }

  if (view === "loading") return <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center"><div className="text-xs text-neutral-500">Carregando…</div></div>;
  if (view === "loggedOut") return (<div className="min-h-screen bg-black text-white flex items-center justify-center"><form onSubmit={handleLogin} className="p-8 border border-zinc-800 rounded bg-zinc-950"><h1 className="mb-4 text-sm uppercase tracking-widest">Login Admin</h1><input type="email" placeholder="Email" className="block w-full mb-2 p-2 bg-black border border-zinc-700 text-xs" value={email} onChange={e=>setEmail(e.target.value)}/><input type="password" placeholder="Senha" className="block w-full mb-4 p-2 bg-black border border-zinc-700 text-xs" value={password} onChange={e=>setPassword(e.target.value)}/><button className="w-full bg-emerald-600 py-2 text-xs uppercase font-bold">Entrar</button></form></div>);

  return (
    <div className="h-screen bg-black text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-900 px-4 py-2 flex items-center justify-between bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <a href="/" className="text-[11px] text-neutral-300 hover:text-white">← Home</a>
          <a href="/lore-upload" className="text-[11px] text-neutral-400 hover:text-white">Upload</a>
          <a href="/lore-admin/timeline" className="text-[11px] text-neutral-400 hover:text-white">Timeline</a>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={openReconcile} className="text-[11px] px-3 py-1 rounded bg-purple-900/30 border border-purple-500/50 text-purple-200 hover:bg-purple-500 hover:text-white transition-colors flex items-center gap-2">⚡ Reconciliar</button>
          <button onClick={handleLogout} className="text-[11px] px-3 py-1 rounded-full border border-neutral-700 text-neutral-300 hover:text-emerald-300 hover:border-emerald-500 transition-colors">Sair</button>
        </div>
      </header>

      {error && <div className="px-4 py-2 text-[11px] text-red-400 bg-red-950/40 border-b border-red-900">{error}</div>}

      <main className="flex flex-1 overflow-hidden">
        <section className="w-64 border-r border-neutral-800 p-4 flex flex-col min-h-0 bg-neutral-950/50">
          <div className="flex items-center justify-between mb-4"><h2 className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 font-bold">Mundos</h2><button onClick={startCreateWorld} className="text-[10px] px-2 py-0.5 rounded border border-neutral-800 hover:border-emerald-500 text-neutral-400 hover:text-white">+</button></div>
          <div className="flex-1 overflow-auto space-y-1 pr-1">{worlds.map((w) => (<div key={w.id} className={`group border rounded px-3 py-2 text-[11px] cursor-pointer transition-all ${selectedWorldId === w.id ? "border-emerald-500/50 bg-emerald-500/10 text-white" : "border-transparent hover:bg-neutral-900 text-neutral-400"}`} onClick={() => { setSelectedWorldId(w.id); fetchFichas(w); }}><div className="flex items-center justify-between"><span className="font-medium">{w.nome}</span><span className="opacity-0 group-hover:opacity-100 text-[9px] text-neutral-500">EDIT</span></div></div>))}</div>
        </section>

        <section className="w-80 border-r border-neutral-800 p-4 flex flex-col min-h-0 bg-neutral-900/20">
          <div className="flex items-center justify-between mb-4"><h2 className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 font-bold">{selectedWorld?.nome || "Fichas"}</h2><button onClick={startCreateFicha} className="text-[10px] px-2 py-0.5 rounded border border-neutral-800 hover:border-emerald-500 text-neutral-400 hover:text-white">+ Nova</button></div>
          <input className="w-full rounded bg-black/40 border border-neutral-800 px-2 py-1.5 text-[11px] mb-3 text-white focus:border-emerald-500 outline-none" placeholder="Buscar..." value={fichasSearchTerm} onChange={(e) => setFichasSearchTerm(e.target.value)} />
          
          {/* FILTROS DE CATEGORIA ATUALIZADOS */}
          <div className="flex flex-wrap gap-1 mb-3">
            <button 
              onClick={() => setFichaFilterTipos([])} 
              className={`px-2 py-0.5 text-[9px] uppercase tracking-wide rounded border ${fichaFilterTipos.length === 0 ? "border-emerald-500 text-emerald-300" : "border-neutral-800 text-neutral-500"}`}
              title="Mostrar todas as categorias"
            >
              TODOS
            </button>
            {allTypes.map(t => {
              const label = getTypeLabel(t);
              return (
                <button 
                  key={t} 
                  onClick={() => toggleFilterTipo(t)} 
                  className={`px-2 py-0.5 text-[9px] uppercase tracking-wide rounded border ${fichaFilterTipos.includes(t) ? "border-emerald-500 text-emerald-300" : "border-neutral-800 text-neutral-500"}`}
                  title={label} // Tooltip com nome completo
                >
                  {t.slice(0,3).toUpperCase()}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-auto space-y-1 pr-1">{filteredFichas.map((f) => (<div key={f.id} className={`border rounded px-3 py-2 text-[11px] cursor-pointer transition-all flex flex-col gap-1 ${selectedFichaId === f.id ? "border-emerald-500/50 bg-emerald-900/20" : "border-neutral-800/50 hover:bg-neutral-800/50"}`} onClick={() => handleSelectFicha(f.id)}><div className="flex justify-between items-start"><span className="font-medium text-neutral-200 line-clamp-1">{f.titulo}</span><span className="text-[9px] uppercase tracking-wide text-neutral-500">{f.tipo}</span></div>{f.resumo && <span className="text-neutral-500 line-clamp-2 text-[10px] leading-relaxed">{f.resumo}</span>}</div>))}</div>
        </section>

        <section className="flex-1 p-6 flex flex-col min-h-0 overflow-y-auto bg-black">
          {!selectedFicha ? <div className="flex items-center justify-center h-full text-neutral-600 text-xs">Selecione uma ficha para visualizar</div> : (
            <div className="max-w-3xl mx-auto w-full">
              <div className="flex justify-end gap-2 mb-6"><button onClick={() => startEditFicha(selectedFicha)} className="px-3 py-1 rounded border border-neutral-800 text-[10px] hover:bg-neutral-900 text-neutral-400">Editar</button><button onClick={() => handleDeleteFicha(selectedFicha.id)} className="px-3 py-1 rounded border border-red-900/30 text-[10px] hover:bg-red-900/20 text-red-400">Excluir</button></div>
              <div className="mb-8 pb-6 border-b border-neutral-900"><div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-600 font-bold mb-2"><span>{selectedFicha.tipo}</span>{selectedFicha.slug && <span className="text-neutral-600 font-normal lowercase">/ {selectedFicha.slug}</span>}</div><h1 className="text-3xl font-bold text-white mb-3">{selectedFicha.titulo}</h1>{selectedFicha.resumo && <p className="text-lg text-neutral-400 italic leading-relaxed">{renderWikiText(selectedFicha.resumo)}</p>}</div>
              
              <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-12">
                <div className="space-y-6">
                   {selectedFicha.imagem_url && <div className="rounded border border-neutral-800 overflow-hidden bg-neutral-900/30"><img src={selectedFicha.imagem_url} className="w-full object-cover opacity-80 hover:opacity-100" /></div>}
                   <div><h3 className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-2">Conteúdo</h3><div className="text-sm text-neutral-300 leading-loose whitespace-pre-wrap font-light">{renderWikiText(selectedFicha.conteudo)}</div></div>
                   {selectedFicha.aparece_em && <div className="p-4 rounded bg-neutral-900/30 border border-neutral-800"><h3 className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1">Aparece em</h3><div className="text-xs text-neutral-400 whitespace-pre-wrap">{renderWikiText(selectedFicha.aparece_em)}</div></div>}
                </div>
                
                <div className="space-y-8">
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold mb-3 flex items-center gap-2">🔗 Conexões Detectadas</h3>
                    {relations.length === 0 ? <p className="text-[10px] text-neutral-600">Nenhuma conexão registrada.</p> : (
                      <div className="space-y-2">{relations.map(rel => { const other = rel.source_ficha_id === selectedFicha.id ? rel.target : rel.source; if (!other) return null; return (<button key={rel.id} onClick={() => handleSelectFicha(other.id)} className="w-full text-left p-2 rounded border border-neutral-800 hover:border-emerald-500/50 bg-neutral-900/20 hover:bg-neutral-900/50 transition-all group"><div><div className="text-[9px] text-neutral-500 uppercase tracking-wide group-hover:text-emerald-400 mb-0.5">{rel.tipo_relacao?.replace(/_/g, " ") || "Relacionado a"}</div><div className="text-xs font-medium text-neutral-300 group-hover:text-white">{other.titulo}</div></div><span className="text-[10px] text-neutral-600 group-hover:text-emerald-500">→</span></button>); })}</div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-3 flex items-center justify-between">
                      Metadados
                      <button onClick={startCreateCode} className="text-[9px] px-2 py-0.5 border border-neutral-800 rounded hover:bg-neutral-900 text-neutral-400">+ Código</button>
                    </h3>
                    <div className="space-y-2 text-[11px]">
                      {codes.map(c => (
                        <div key={c.id} className="flex justify-between items-center py-1 border-b border-neutral-900 group">
                          <div className="flex flex-col">
                            <span className="font-mono text-emerald-500">{c.code}</span>
                            {c.label && <span className="text-[9px] text-neutral-600">{c.label}</span>}
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                            <button onClick={()=>startEditCode(c)} className="text-[9px] text-neutral-500 hover:text-white">Edit</button>
                            <button onClick={()=>handleDeleteCode(c.id)} className="text-[9px] text-red-500 hover:text-red-400">Del</button>
                          </div>
                        </div>
                      ))}
                      {selectedFicha.ano_diegese && <div className="flex justify-between py-1 border-b border-neutral-900"><span className="text-neutral-500">Ano</span><span className="text-neutral-300">{selectedFicha.ano_diegese}</span></div>}
                      {selectedFicha.tags && <div className="pt-2 flex flex-wrap gap-1">{selectedFicha.tags.split(',').map((t:string, i:number) => <span key={i} className="px-1.5 py-0.5 rounded bg-neutral-800 text-[9px] text-neutral-400">#{t.trim()}</span>)}</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* MODAL DE EDIÇÃO DE FICHA COMPLETO */}
      {fichaFormMode !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <form onSubmit={handleSaveFicha} className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 p-6 rounded-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">Editar Ficha</h2>
            <div className="grid gap-4">
              
              {/* TIPO (DROPDOWN COM SUPORTE A NOVO TIPO) */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-zinc-500">Tipo</label>
                <select 
                  className="w-full bg-black border border-zinc-800 p-2 text-xs rounded"
                  value={LORE_TYPES.some(t => t.value === fichaForm.tipo) ? fichaForm.tipo : "novo"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "novo") {
                      const custom = prompt("Digite o nome da nova categoria:");
                      if (custom) setFichaForm({...fichaForm, tipo: custom.toLowerCase().trim()});
                    } else {
                      setFichaForm({...fichaForm, tipo: val});
                    }
                  }}
                >
                  {LORE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  {!LORE_TYPES.some(t => t.value === fichaForm.tipo) && <option value={fichaForm.tipo}>{fichaForm.tipo} (Atual)</option>}
                  <option value="novo">+ Nova Categoria...</option>
                </select>
              </div>

              <div><label className="text-[10px] uppercase text-zinc-500">Título</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.titulo} onChange={e=>setFichaForm({...fichaForm, titulo: e.target.value})} /></div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div><label className="text-[10px] uppercase text-zinc-500">Slug</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.slug} onChange={e=>setFichaForm({...fichaForm, slug: e.target.value})} /></div>
                 <div><label className="text-[10px] uppercase text-zinc-500">Ano Diegese</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.ano_diegese} onChange={e=>setFichaForm({...fichaForm, ano_diegese: e.target.value})} /></div>
              </div>
              
              <div><label className="text-[10px] uppercase text-zinc-500">Resumo</label><textarea className="w-full bg-black border border-zinc-800 p-2 text-xs rounded h-20" value={fichaForm.resumo} onChange={e=>setFichaForm({...fichaForm, resumo: e.target.value})} /></div>
              <div><label className="text-[10px] uppercase text-zinc-500">Conteúdo</label><textarea className="w-full bg-black border border-zinc-800 p-2 text-xs rounded h-40 font-mono leading-relaxed" value={fichaForm.conteudo} onChange={e=>setFichaForm({...fichaForm, conteudo: e.target.value})} /></div>
              
              {/* CAMPOS DE TIMELINE (APARECEM APENAS SE FOR EVENTO) */}
              {fichaForm.tipo === 'evento' && (
                <div className="p-3 bg-zinc-900/50 rounded border border-emerald-500/30 space-y-3 mt-2 border-l-4 border-l-emerald-500">
                   <div className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold">Dados da Timeline</div>
                   
                   <div>
                     <label className="text-[10px] uppercase text-zinc-500">Descrição da Data</label>
                     <input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.descricao_data || ''} onChange={e=>setFichaForm({...fichaForm, descricao_data: e.target.value})} placeholder='ex: "Na tarde de 23 de agosto..."' />
                   </div>

                   <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-[10px] uppercase text-zinc-500">Data Início</label><input type="date" className="w-full bg-black border border-zinc-800 p-2 text-xs rounded text-white" value={fichaForm.data_inicio || ''} onChange={e=>setFichaForm({...fichaForm, data_inicio: e.target.value})} /></div>
                      <div><label className="text-[10px] uppercase text-zinc-500">Data Fim</label><input type="date" className="w-full bg-black border border-zinc-800 p-2 text-xs rounded text-white" value={fichaForm.data_fim || ''} onChange={e=>setFichaForm({...fichaForm, data_fim: e.target.value})} /></div>
                   </div>

                   <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase text-zinc-500">Granularidade</label>
                        <select className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.granularidade_data || 'vago'} onChange={e=>setFichaForm({...fichaForm, granularidade_data: e.target.value})}>
                           {GRANULARIDADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-zinc-500">Camada</label>
                        <select className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.camada_temporal || 'linha_principal'} onChange={e=>setFichaForm({...fichaForm, camada_temporal: e.target.value})}>
                           {CAMADAS_TEMPORAIS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                   </div>
                </div>
              )}

              <div><label className="text-[10px] uppercase text-zinc-500">Tags</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.tags} onChange={e=>setFichaForm({...fichaForm, tags: e.target.value})} /></div>
              <div><label className="text-[10px] uppercase text-zinc-500">Aparece Em</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.aparece_em} onChange={e=>setFichaForm({...fichaForm, aparece_em: e.target.value})} /></div>
              <div><label className="text-[10px] uppercase text-zinc-500">Código (Opcional)</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded font-mono" value={fichaForm.codigo} onChange={e=>setFichaForm({...fichaForm, codigo: e.target.value})} /></div>

            </div>
            <div className="flex justify-end gap-2 mt-6"><button type="button" onClick={cancelFichaForm} className="px-4 py-2 rounded text-xs text-zinc-400 hover:bg-zinc-900">Cancelar</button><button type="submit" className="px-4 py-2 rounded bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500">Salvar</button></div>
          </form>
        </div>
      )}

      {/* MODAL DE CÓDIGO */}
      {codeFormMode !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <form onSubmit={handleSaveCode} className="w-full max-w-md bg-zinc-950 border border-zinc-800 p-6 rounded-lg shadow-2xl">
            <div className="flex justify-between mb-4"><h2 className="text-sm font-bold text-white uppercase tracking-widest">{codeFormMode === 'create' ? 'Novo Código' : 'Editar Código'}</h2><button type="button" onClick={cancelCodeForm} className="text-xs text-zinc-500 hover:text-white">Fechar</button></div>
            <div className="space-y-3">
               <div><label className="text-[10px] uppercase text-zinc-500">Código</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded font-mono" value={codeForm.code} onChange={e=>setCodeForm({...codeForm, code: e.target.value})} placeholder="AV1-PS01" /></div>
               <div><label className="text-[10px] uppercase text-zinc-500">Rótulo</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={codeForm.label} onChange={e=>setCodeForm({...codeForm, label: e.target.value})} placeholder="Opcional" /></div>
               <div><label className="text-[10px] uppercase text-zinc-500">Descrição</label><textarea className="w-full bg-black border border-zinc-800 p-2 text-xs rounded h-16" value={codeForm.description} onChange={e=>setCodeForm({...codeForm, description: e.target.value})} placeholder="Detalhes do código..." /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4"><button type="button" onClick={cancelCodeForm} className="px-3 py-1.5 rounded border border-zinc-700 text-xs hover:bg-zinc-900">Cancelar</button><button type="submit" className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-medium">Salvar</button></div>
          </form>
        </div>
      )}

      {/* MODAL DE VISUALIZAÇÃO RÁPIDA (DOUBLE CLICK) */}
      {fichaViewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
           <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 p-8 rounded-lg max-h-[90vh] overflow-y-auto shadow-2xl relative">
             <button onClick={() => setFichaViewModal(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-white text-xs">FECHAR</button>
             <div className="mb-6 pb-4 border-b border-zinc-800">
               <div className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold mb-2">{fichaViewModal.tipo}</div>
               <h1 className="text-3xl font-bold text-white">{fichaViewModal.titulo}</h1>
             </div>
             <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
               <div className="p-4 bg-zinc-900/30 rounded border border-zinc-800/50 italic text-zinc-400">{renderWikiText(fichaViewModal.resumo)}</div>
               <div className="whitespace-pre-wrap">{renderWikiText(fichaViewModal.conteudo)}</div>
             </div>
             <div className="mt-8 flex justify-end gap-2">
               <button onClick={() => { startEditFicha(fichaViewModal); setFichaViewModal(null); }} className="px-4 py-2 rounded bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500">Editar</button>
             </div>
           </div>
        </div>
      )}

      {/* MODAL DE RECONCILIAÇÃO (Mantido) */}
      {showReconcile && (<div className="fixed inset-0 z-50 bg-black flex flex-col"><div className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950"><h2 className="text-lg font-bold text-purple-400">⚡ Reconciliação</h2><button onClick={()=>setShowReconcile(false)} className="text-zinc-400 text-sm">Fechar</button></div><div className="flex flex-1 overflow-hidden"><aside className="w-80 border-r border-zinc-800 bg-zinc-950 p-4 overflow-y-auto">{reconcilePairs.map((pair, i)=>(<button key={i} onClick={()=>handleSelectReconcilePair(pair)} className="w-full text-left p-3 mb-2 rounded border border-zinc-800 hover:bg-zinc-900"><div className="text-xs font-bold text-zinc-300">{pair.titulo_a}</div><div className="text-[10px] text-zinc-500">vs</div><div className="text-xs font-bold text-zinc-300">{pair.titulo_b}</div></button>))}</aside><main className="flex-1 p-8 overflow-y-auto">{comparing && mergeDraft && (<div><div className="flex justify-between items-end mb-8 border-b border-zinc-800 pb-4"><div><h3 className="text-xl font-bold text-white">Resolvendo Conflito</h3></div><button onClick={()=>executeMerge(comparing.a.id, comparing.b.id)} className="bg-purple-600 text-white px-6 py-2 rounded text-sm font-bold">Confirmar Fusão</button></div><div className="grid gap-1"><FieldChoice label="Título" field="titulo" /><FieldChoice label="Tipo" field="tipo" /><FieldChoice label="Resumo" field="resumo" /><FieldChoice label="Conteúdo" field="conteudo" /></div></div>)}</main></div></div>)}
    </div>
  );
}
