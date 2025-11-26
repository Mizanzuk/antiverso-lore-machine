"use client";

import React, { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { GRANULARIDADES, normalizeGranularidade } from "@/lib/dates/granularidade";

// --- TIPOS ---
type ViewState = "loading" | "loggedOut" | "loggedIn";

type WorldFormMode = "idle" | "create" | "edit";
type FichaFormMode = "idle" | "create" | "edit";
type CodeFormMode = "idle" | "create" | "edit";

// Tipos para Reconciliação
type DuplicatePair = {
  id_a: string;
  titulo_a: string;
  tipo_a: string;
  id_b: string;
  titulo_b: string;
  tipo_b: string;
  similarity: number;
};

// Tipo completo para o Merge
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

// --- HELPERS ---
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const KNOWN_TIPOS = [
  "personagem",
  "local",
  "empresa",
  "agencia",
  "midia",
  "conceito",
  "epistemologia",
  "evento",
  "regra_de_mundo",
  "roteiro",
];

function getWorldPrefix(worldName: string | null | undefined): string {
  if (!worldName) return "XX";
  const words = worldName.trim().split(/\s+/);
  if (words.length === 0) return "XX";
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

function getTipoPrefix(tipo: string | null | undefined): string {
  if (!tipo) return "XX";
  const key = tipo.toLowerCase();
  switch (key) {
    case "personagem": return "PS";
    case "local": return "LC";
    case "empresa": return "EM";
    case "agencia": return "AG";
    case "midia": return "MD";
    case "conceito": return "CC";
    case "epistemologia": return "EP";
    case "evento": return "EV";
    case "regra_de_mundo": return "RM";
    default: return key.slice(0, 2).toUpperCase() || "XX";
  }
}

export default function LoreAdminPage() {
  const [view, setView] = useState<ViewState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dados principais
  const [worlds, setWorlds] = useState<any[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [fichas, setFichas] = useState<any[]>([]);
  const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);
  const [codes, setCodes] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Filtros
  const [fichaFilterTipos, setFichaFilterTipos] = useState<string[]>([]);
  const [fichasSearchTerm, setFichasSearchTerm] = useState<string>("");

  // Formulários (State)
  const [worldFormMode, setWorldFormMode] = useState<WorldFormMode>("idle");
  const [isSavingWorld, setIsSavingWorld] = useState(false);
  const [worldForm, setWorldForm] = useState<{
    id: string;
    nome: string;
    descricao: string;
    tipo: string;
    ordem: string;
    has_episodes: boolean;
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
    data_inicio: "", data_fim: "", granularidade_data: "indefinido", descricao_data: "", camada_temporal: ""
  });

  const [codeFormMode, setCodeFormMode] = useState<CodeFormMode>("idle");
  const [isSavingCode, setIsSavingCode] = useState(false);
  const [codeForm, setCodeForm] = useState<{
    id: string; code: string; label: string; description: string; episode: string;
  }>({ id: "", code: "", label: "", description: "", episode: "" });

  // Modais de Visualização
  const [worldViewModal, setWorldViewModal] = useState<any | null>(null);
  const [fichaViewModal, setFichaViewModal] = useState<any | null>(null);

  // --- ESTADOS DA RECONCILIAÇÃO ---
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcilePairs, setReconcilePairs] = useState<DuplicatePair[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [comparing, setComparing] = useState<{ a: FichaFull; b: FichaFull } | null>(null);
  const [mergeDraft, setMergeDraft] = useState<FichaFull | null>(null);
  const [reconcileProcessing, setReconcileProcessing] = useState(false);

  // --- AUTH & INIT ---
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
    setIsSubmitting(true);
    setError(null);
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
      const { data, error: worldsError } = await supabaseBrowser
        .from("worlds").select("*").order("ordem", { ascending: true });
      if (worldsError) {
        console.error(worldsError); setError("Erro ao carregar mundos."); setIsLoadingData(false); return;
      }
      const list = data || [];
      setWorlds(list);
      if (!selectedWorldId && list.length > 0) {
        const first = list[0];
        setSelectedWorldId(first.id as string);
        await fetchFichas(first);
      } else if (selectedWorldId) {
        const current = list.find((w) => w.id === selectedWorldId) || null;
        await fetchFichas(current);
      }
      setIsLoadingData(false);
    } catch (err: any) {
      console.error(err); setError("Erro inesperado ao carregar dados."); setIsLoadingData(false);
    }
  }

  async function fetchFichas(world: any | null) {
    setError(null);
    if (!world) { setFichas([]); setSelectedFichaId(null); setCodes([]); return; }
    const isRoot = (world?.nome || "").trim().toLowerCase() === "antiverso";
    let query = supabaseBrowser.from("fichas").select("*").order("titulo", { ascending: true });
    if (!isRoot) { query = query.eq("world_id", world.id); }
    const { data, error: fichasError } = await query;
    if (fichasError) { console.error(fichasError); setError("Erro ao carregar fichas."); return; }
    setFichas(data || []); setSelectedFichaId(null); setCodes([]);
  }

  async function fetchCodes(fichaId: string) {
    setError(null);
    const { data, error: codesError } = await supabaseBrowser.from("codes").select("*").eq("ficha_id", fichaId).order("code", { ascending: true });
    if (codesError) { console.error(codesError); setError("Erro ao carregar códigos."); return; }
    setCodes(data || []);
  }

  // --- FUNÇÕES DE RECONCILIAÇÃO ---
  async function openReconcile() {
    setShowReconcile(true);
    setReconcileLoading(true);
    setComparing(null);
    try {
      const res = await fetch("/api/lore/reconcile");
      const json = await res.json();
      if (json.duplicates) {
        setReconcilePairs(json.duplicates);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao buscar duplicatas.");
    } finally {
      setReconcileLoading(false);
    }
  }

  async function handleSelectReconcilePair(pair: DuplicatePair) {
    setReconcileLoading(true);
    try {
      const { data: dataA } = await supabaseBrowser.from("fichas").select("*").eq("id", pair.id_a).single();
      const { data: dataB } = await supabaseBrowser.from("fichas").select("*").eq("id", pair.id_b).single();
      if (dataA && dataB) {
        setComparing({ a: dataA, b: dataB });
        setMergeDraft({ ...dataA }); 
      }
    } catch (err) {
      console.error(err); alert("Erro ao carregar detalhes das fichas.");
    } finally {
      setReconcileLoading(false);
    }
  }

  function updateMergeDraft(field: keyof FichaFull, value: any) {
    if (!mergeDraft) return;
    setMergeDraft({ ...mergeDraft, [field]: value });
  }

  async function executeMerge(winnerOriginalId: string, loserOriginalId: string) {
    if (!mergeDraft || !confirm("Tem certeza? A ficha perdedora será apagada permanentemente.")) return;
    setReconcileProcessing(true);
    try {
      const res = await fetch("/api/lore/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winnerId: winnerOriginalId, loserId: loserOriginalId, mergedData: mergeDraft })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      
      alert("Merge realizado com sucesso!");
      setComparing(null);
      setMergeDraft(null);
      
      // Recarrega lista e fichas
      const resList = await fetch("/api/lore/reconcile");
      const jsonList = await resList.json();
      setReconcilePairs(jsonList.duplicates || []);
      
      const currentWorld = worlds.find((w) => w.id === selectedWorldId) || null;
      await fetchFichas(currentWorld);

    } catch (err: any) {
      console.error(err); alert("Erro no merge: " + err.message);
    } finally {
      setReconcileProcessing(false);
    }
  }

  const FieldChoice = ({ label, field }: { label: string; field: keyof FichaFull }) => {
    if (!comparing || !mergeDraft) return null;
    const valA = comparing.a[field];
    const valB = comparing.b[field];
    const current = mergeDraft[field];

    if (valA === valB) {
      return (
        <div className="mb-3 opacity-60">
          <div className="text-[10px] uppercase text-zinc-500 mb-1">{label} (iguais)</div>
          <div className="p-2 bg-zinc-900/50 rounded border border-zinc-800 text-sm text-zinc-300 mt-1 whitespace-pre-wrap break-words max-h-20 overflow-hidden">
            {String(valA || "(vazio)")}
          </div>
        </div>
      );
    }

    return (
      <div className="mb-4 p-3 bg-zinc-900/30 rounded border border-zinc-800">
        <div className="text-[10px] uppercase text-zinc-500 mb-2 flex justify-between font-bold">
          <span>{label} (Conflito)</span>
          <span className={current === valA ? "text-blue-400" : "text-purple-400"}>
            {current === valA ? "Mantendo A" : "Mantendo B"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => updateMergeDraft(field, valA)}
            className={`text-left p-2 rounded border text-xs transition-all ${
              current === valA 
                ? "border-blue-500 bg-blue-900/20 text-blue-100 ring-1 ring-blue-500/50" 
                : "border-zinc-700 hover:bg-zinc-800 text-zinc-400 opacity-60 hover:opacity-100"
            }`}
          >
            <span className="block font-bold mb-1 text-[10px] opacity-50">FICHA A</span>
            <div className="break-words whitespace-pre-wrap max-h-32 overflow-y-auto">{String(valA || "(vazio)")}</div>
          </button>
          <button
            onClick={() => updateMergeDraft(field, valB)}
            className={`text-left p-2 rounded border text-xs transition-all ${
              current === valB
                ? "border-purple-500 bg-purple-900/20 text-purple-100 ring-1 ring-purple-500/50"
                : "border-zinc-700 hover:bg-zinc-800 text-zinc-400 opacity-60 hover:opacity-100"
            }`}
          >
            <span className="block font-bold mb-1 text-[10px] opacity-50">FICHA B</span>
            <div className="break-words whitespace-pre-wrap max-h-32 overflow-y-auto">{String(valB || "(vazio)")}</div>
          </button>
        </div>
      </div>
    );
  };

  // --- WIKI RENDERER ---
  const renderWikiText = (text: string | null | undefined) => {
    if (!text) return null;
    const currentFichaId = selectedFichaId;
    const candidates = fichas
      .filter((f) => f.id !== currentFichaId && typeof f.titulo === "string" && f.titulo.trim().length > 0)
      .map((f) => ({ id: f.id as string, titulo: (f.titulo as string).trim() }));

    if (candidates.length === 0) return text;

    const pattern = new RegExp(`\\b(${candidates.map((c) => escapeRegExp(c.titulo)).join("|")})\\b`, "gi");
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    text.replace(pattern, (match, _group, offset) => {
      if (typeof offset !== "number") return match;
      if (offset > lastIndex) elements.push(text.slice(lastIndex, offset));
      const target = candidates.find((c) => c.titulo.toLowerCase() === match.toLowerCase());
      if (target) {
        elements.push(
          <button key={`${target.id}-${offset}`} type="button"
            className="underline decoration-dotted decoration-emerald-500/70 hover:text-emerald-200 cursor-pointer"
            onClick={() => { setSelectedFichaId(target.id); setFichaFormMode("idle"); }}
          >
            {match}
          </button>,
        );
      } else { elements.push(match); }
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < text.length) elements.push(text.slice(lastIndex));
    return <>{elements}</>;
  };

  // --- CRUD FUNCTIONS ---
  function startCreateWorld() {
    setWorldFormMode("create");
    setWorldForm({ id: "", nome: "", descricao: "", tipo: "", ordem: "", has_episodes: true });
  }
  function startEditWorld(world: any) {
    setWorldFormMode("edit");
    setWorldForm({ id: world.id ?? "", nome: world.nome ?? "", descricao: world.descricao ?? "", tipo: world.tipo ?? "", ordem: world.ordem ? String(world.ordem) : "", has_episodes: typeof world.has_episodes === "boolean" ? world.has_episodes : true });
  }
  function cancelWorldForm() { setWorldFormMode("idle"); setWorldForm({ id: "", nome: "", descricao: "", tipo: "", ordem: "", has_episodes: true }); }
  async function handleSaveWorld(e: React.FormEvent) {
    e.preventDefault(); setIsSavingWorld(true); setError(null);
    if (!worldForm.nome.trim()) { setError("Mundo precisa de um nome."); setIsSavingWorld(false); return; }
    const payload: any = { nome: worldForm.nome.trim(), descricao: worldForm.descricao.trim() || null, has_episodes: worldForm.has_episodes };
    let saveError = null;
    if (worldFormMode === "create") { const { error } = await supabaseBrowser.from("worlds").insert([payload]); saveError = error; } 
    else { const { error } = await supabaseBrowser.from("worlds").update(payload).eq("id", worldForm.id); saveError = error; }
    setIsSavingWorld(false);
    if (saveError) { console.error(saveError); setError("Erro ao salvar Mundo."); return; }
    cancelWorldForm(); await fetchAllData();
  }
  async function handleDeleteWorld(worldId: string) {
    setError(null); const ok = window.confirm("Tem certeza que deseja deletar este Mundo? Essa ação não pode ser desfeita.");
    if (!ok) return;
    const { error: deleteError } = await supabaseBrowser.from("worlds").delete().eq("id", worldId);
    if (deleteError) { console.error(deleteError); setError("Erro ao deletar Mundo. Verifique se não há Fichas ligadas a ele."); return; }
    if (selectedWorldId === worldId) { setSelectedWorldId(null); setFichas([]); setCodes([]); }
    await fetchAllData();
  }

  function startCreateFicha() {
    if (!selectedWorldId) { setError("Selecione um Mundo antes de criar uma Ficha."); return; }
    setFichaFormMode("create");
    setFichaForm({ id: "", titulo: "", slug: "", tipo: "", resumo: "", conteudo: "", tags: "", ano_diegese: "", ordem_cronologica: "", aparece_em: "", codigo: "", imagem_url: "", data_inicio: "", data_fim: "", granularidade_data: "indefinido", descricao_data: "", camada_temporal: "" });
  }
  function startEditFicha(ficha: any) {
    setFichaFormMode("edit");
    setFichaForm({
      id: ficha.id ?? "", titulo: ficha.titulo ?? "", slug: ficha.slug ?? "", tipo: ficha.tipo ?? "", resumo: ficha.resumo ?? "", conteudo: ficha.conteudo ?? "", tags: ficha.tags ?? "", aparece_em: ficha.aparece_em ?? "", codigo: ficha.codigo ?? "", imagem_url: ficha.imagem_url ?? "",
      ano_diegese: ficha.ano_diegese ? String(ficha.ano_diegese) : "", ordem_cronologica: ficha.ordem_cronologica ? String(ficha.ordem_cronologica) : "",
      data_inicio: ficha.data_inicio ?? "", data_fim: ficha.data_fim ?? "", granularidade_data: normalizeGranularidade(ficha.granularidade_data, ficha.descricao_data), descricao_data: ficha.descricao_data ?? "", camada_temporal: ficha.camada_temporal ?? "",
    });
  }
  function cancelFichaForm() {
    setFichaFormMode("idle");
    setFichaForm({ id: "", titulo: "", slug: "", tipo: "", resumo: "", conteudo: "", tags: "", ano_diegese: "", ordem_cronologica: "", aparece_em: "", codigo: "", imagem_url: "", data_inicio: "", data_fim: "", granularidade_data: "indefinido", descricao_data: "", camada_temporal: "" });
  }
  async function handleSaveFicha(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWorldId) { setError("Selecione um Mundo antes de salvar uma Ficha."); return; }
    if (fichaFormMode === "idle") return;
    if (!fichaForm.titulo.trim()) { setError("Ficha precisa de um título."); return; }
    setIsSavingFicha(true); setError(null);
    const payload: any = {
      world_id: selectedWorldId, titulo: fichaForm.titulo.trim(), slug: fichaForm.slug.trim() || null, tipo: fichaForm.tipo.trim() || null, resumo: fichaForm.resumo.trim() || null, conteudo: fichaForm.conteudo.trim() || null, tags: fichaForm.tags.trim() || null,
      ano_diegese: fichaForm.ano_diegese.trim() ? Number.isNaN(Number(fichaForm.ano_diegese.trim())) ? fichaForm.ano_diegese.trim() : Number(fichaForm.ano_diegese.trim()) : null,
      ordem_cronologica: fichaForm.ordem_cronologica.trim() ? Number.isNaN(Number(fichaForm.ordem_cronologica.trim())) ? fichaForm.ordem_cronologica.trim() : Number(fichaForm.ordem_cronologica.trim()) : null,
      aparece_em: fichaForm.aparece_em.trim() || null, codigo: fichaForm.codigo.trim() || null, imagem_url: fichaForm.imagem_url.trim() || null,
      data_inicio: fichaForm.data_inicio.trim() || null, data_fim: fichaForm.data_fim.trim() || null, granularidade_data: fichaForm.granularidade_data.trim() || null, descricao_data: fichaForm.descricao_data.trim() || null, camada_temporal: fichaForm.camada_temporal.trim() || null, updated_at: new Date().toISOString(),
    };
    let saveError = null;
    if (fichaFormMode === "create") { const { error } = await supabaseBrowser.from("fichas").insert([payload]); saveError = error; }
    else { const { error } = await supabaseBrowser.from("fichas").update(payload).eq("id", fichaForm.id); saveError = error; }
    setIsSavingFicha(false);
    if (saveError) { console.error(saveError); setError(`Erro ao salvar Ficha: ${(saveError as any)?.message || JSON.stringify(saveError)}`); return; }
    cancelFichaForm();
    const currentWorld = worlds.find((w) => w.id === selectedWorldId) || null;
    await fetchFichas(currentWorld);
  }
  async function handleDeleteFicha(fichaId: string) {
    setError(null); const ok = window.confirm("Tem certeza que deseja deletar esta Ficha? Essa ação não pode ser desfeita."); if (!ok) return;
    const { error: deleteCodesError } = await supabaseBrowser.from("codes").delete().eq("ficha_id", fichaId);
    if (deleteCodesError) { console.error(deleteCodesError); setError("Erro ao deletar códigos vinculados à Ficha."); return; }
    const { error: deleteError } = await supabaseBrowser.from("fichas").delete().eq("id", fichaId);
    if (deleteError) { console.error(deleteError); setError("Erro ao deletar Ficha."); return; }
    if (selectedFichaId === fichaId) { setSelectedFichaId(null); setCodes([]); }
    const currentWorld = worlds.find((w) => w.id === selectedWorldId) || null;
    await fetchFichas(currentWorld);
  }

  function startCreateCode() { if (!selectedFichaId) { setError("Selecione uma Ficha antes de criar um Código."); return; } setCodeFormMode("create"); setCodeForm({ id: "", code: "", label: "", description: "", episode: "" }); }
  function startEditCode(code: any) {
    let episode = "";
    if (typeof code.code === "string") { const m = code.code.match(/^[A-Z]{2}(\d+)-[A-Z]{2}\d+$/); if (m && m[1]) { episode = m[1]; } }
    setCodeFormMode("edit"); setCodeForm({ id: code.id ?? "", code: code.code ?? "", label: code.label ?? "", description: code.description ?? "", episode });
  }
  function cancelCodeForm() { setCodeFormMode("idle"); setCodeForm({ id: "", code: "", label: "", description: "", episode: "" }); }
  async function handleSaveCode(e: React.FormEvent) {
    e.preventDefault(); if (!selectedFichaId) { setError("Selecione uma Ficha antes de salvar um Código."); return; } if (codeFormMode === "idle") return; setIsSavingCode(true); setError(null);
    const selectedWorld = worlds.find((w) => w.id === selectedWorldId) || null; const selectedFicha = fichas.find((f) => f.id === selectedFichaId) || null;
    let finalCode = codeForm.code.trim();
    if (!finalCode) {
      const episodeRaw = codeForm.episode.trim();
      if (!selectedWorld || !selectedFicha) { setError("Não foi possível gerar o código: selecione um Mundo e uma Ficha."); setIsSavingCode(false); return; }
      if (!episodeRaw) { setError('Para gerar o código automaticamente, preencha o campo "Episódio".'); setIsSavingCode(false); return; }
      if (!selectedFicha.tipo) { setError('Para gerar o código automaticamente, defina o "Tipo" da Ficha.'); setIsSavingCode(false); return; }
      const worldPrefix = getWorldPrefix(selectedWorld.nome); const tipoPrefix = getTipoPrefix(selectedFicha.tipo); const episodeNumber = episodeRaw; const basePrefix = `${worldPrefix}${episodeNumber}-${tipoPrefix}`;
      const { data: existingCodes, error: existingError } = await supabaseBrowser.from("codes").select("code").like("code", `${basePrefix}%`);
      if (existingError) { console.error(existingError); setError("Erro ao gerar código automaticamente."); setIsSavingCode(false); return; }
      let maxIndex = 0;
      (existingCodes || []).forEach((row) => { const c = row.code as string; if (typeof c === "string" && c.startsWith(basePrefix)) { const suffix = c.slice(basePrefix.length); const n = parseInt(suffix, 10); if (!Number.isNaN(n) && n > maxIndex) { maxIndex = n; } } });
      const nextIndex = maxIndex + 1; finalCode = `${basePrefix}${nextIndex}`;
    }
    if (!finalCode) { setError("Código precisa de um valor."); setIsSavingCode(false); return; }
    const payload: any = { ficha_id: selectedFichaId, code: finalCode, label: codeForm.label.trim() || null, description: codeForm.description.trim() || null, updated_at: new Date().toISOString() };
    let saveError = null;
    if (codeFormMode === "create") { const { error } = await supabaseBrowser.from("codes").insert([payload]); saveError = error; } 
    else { const { error } = await supabaseBrowser.from("codes").update(payload).eq("id", codeForm.id); saveError = error; }
    setIsSavingCode(false);
    if (saveError) { console.error(saveError); setError("Erro ao salvar Código."); return; }
    cancelCodeForm(); if (selectedFichaId) { await fetchCodes(selectedFichaId); }
  }
  async function handleDeleteCode(codeId: string) {
    setError(null); const ok = window.confirm("Tem certeza que deseja deletar este Código? Essa ação não pode ser desfeita."); if (!ok) return;
    const { error: deleteError } = await supabaseBrowser.from("codes").delete().eq("id", codeId);
    if (deleteError) { console.error(deleteError); setError("Erro ao deletar Código."); return; }
    if (selectedFichaId) { await fetchCodes(selectedFichaId); }
  }

  // --- FILTROS ---
  const selectedWorld = worlds.find((w) => w.id === selectedWorldId) || null;
  const dynamicTipos = Array.from(new Set<string>([...KNOWN_TIPOS, ...fichas.map((f) => (f.tipo || "").toLowerCase()).filter((t) => !!t)]));
  const selectedFicha = fichas.find((f) => f.id === selectedFichaId) || null;
  const filteredFichas = fichas.filter((f) => {
    if (fichaFilterTipos.length > 0) { const t = (f.tipo || "").toLowerCase(); if (!t || !fichaFilterTipos.includes(t)) return false; }
    if (fichasSearchTerm.trim().length > 0) { const q = fichasSearchTerm.toLowerCase(); const inTitulo = (f.titulo || "").toLowerCase().includes(q); const inResumo = (f.resumo || "").toLowerCase().includes(q); const inTags = (Array.isArray(f.tags) ? f.tags.join(",") : (f.tags || "")).toLowerCase().includes(q); if (!inTitulo && !inResumo && !inTags) return false; }
    return true;
  });
  function toggleFilterTipo(tipo: string) { const t = tipo.toLowerCase(); setFichaFilterTipos((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]); }

  // --- VIEW ---
  if (view === "loading") return <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center">Carregando...</div>;
  if (view === "loggedOut") return (
    <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center">
      <form onSubmit={handleLogin} className="border border-neutral-800 rounded p-6 bg-neutral-950 w-80">
        <h1 className="text-sm font-bold mb-4 uppercase tracking-widest">Lore Admin</h1>
        {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-black border border-zinc-800 rounded px-2 py-1 mb-2 text-sm" placeholder="Email" />
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-black border border-zinc-800 rounded px-2 py-1 mb-4 text-sm" placeholder="Senha" />
        <button disabled={isSubmitting} className="w-full bg-emerald-600 text-black text-xs font-bold py-2 rounded">{isSubmitting?"...":"Entrar"}</button>
      </form>
    </div>
  );

  return (
    <div className="h-screen bg-black text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-900 px-4 py-2 flex items-center justify-between bg-neutral-950">
        <div className="flex items-center gap-4">
          <a href="/" className="text-[11px] text-neutral-300 hover:text-white">← Home</a>
          <a href="/lore-upload" className="text-[11px] text-neutral-400 hover:text-white">Upload</a>
          <a href="/lore-admin/timeline" className="text-[11px] text-neutral-400 hover:text-white">Timeline</a>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={openReconcile}
            className="text-[11px] px-3 py-1 rounded bg-purple-900/30 border border-purple-500/50 text-purple-200 hover:bg-purple-500 hover:text-white transition-colors flex items-center gap-2"
          >
            ⚡ Reconciliar Fichas
          </button>
          <button onClick={handleLogout} className="text-[11px] text-neutral-500 hover:text-white">Sair</button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {/* COLUNA MUNDOS */}
        <section className="w-72 border-r border-neutral-800 p-4 flex flex-col min-h-0 bg-black">
          <div className="flex justify-between mb-3 items-center"><h2 className="text-[10px] uppercase tracking-widest text-zinc-500">Mundos</h2><button onClick={startCreateWorld} className="text-[10px] border border-zinc-700 px-2 py-0.5 rounded hover:bg-zinc-800">+</button></div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {worlds.map(w => (
              <div key={w.id} onClick={()=>{setSelectedWorldId(w.id); fetchFichas(w);}} className={`p-2 rounded cursor-pointer text-xs border ${selectedWorldId===w.id ? 'bg-zinc-900 border-emerald-500/50 text-emerald-100' : 'border-transparent hover:bg-zinc-900 text-zinc-400'}`}>
                <div className="flex justify-between"><span className="font-medium">{w.nome}</span><button onClick={(e)=>{e.stopPropagation(); startEditWorld(w);}} className="opacity-0 hover:opacity-100 text-[9px] px-1">✎</button></div>
              </div>
            ))}
          </div>
        </section>

        {/* COLUNA FICHAS */}
        <section className="w-96 border-r border-neutral-800 p-4 flex flex-col min-h-0 bg-black">
          <div className="flex justify-between mb-3 items-center"><h2 className="text-[10px] uppercase tracking-widest text-zinc-500">Fichas</h2><button onClick={startCreateFicha} className="text-[10px] border border-zinc-700 px-2 py-0.5 rounded hover:bg-zinc-800">+ Nova</button></div>
          <input className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs mb-2" placeholder="Buscar..." value={fichasSearchTerm} onChange={e=>setFichasSearchTerm(e.target.value)} />
          <div className="flex flex-wrap gap-1 mb-2"><button onClick={()=>setFichaFilterTipos([])} className={`px-2 py-0.5 text-[9px] border rounded ${fichaFilterTipos.length===0?'border-emerald-500 text-emerald-400':'border-zinc-800 text-zinc-500'}`}>Todos</button>{dynamicTipos.slice(0,5).map(t => (<button key={t} onClick={()=>toggleFilterTipo(t)} className={`px-2 py-0.5 text-[9px] border rounded ${fichaFilterTipos.includes(t.toLowerCase())?'border-emerald-500 text-emerald-400':'border-zinc-800 text-zinc-500'}`}>{t}</button>))}</div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {filteredFichas.map(f => (
              <div key={f.id} onClick={()=>{setSelectedFichaId(f.id); fetchCodes(f.id);}} onDoubleClick={()=>startEditFicha(f)} className={`p-2 rounded cursor-pointer text-xs border ${selectedFichaId===f.id ? 'bg-zinc-900 border-emerald-500/50 text-emerald-100' : 'border-transparent hover:bg-zinc-900 text-zinc-400'}`}>
                <div className="font-bold">{f.titulo}</div><div className="text-[10px] opacity-60 truncate">{f.resumo}</div>
              </div>
            ))}
          </div>
        </section>

        {/* COLUNA DETALHES */}
        <section className="flex-1 p-6 overflow-y-auto bg-zinc-950">
          {!selectedFicha ? <div className="text-zinc-600 text-xs">Selecione uma ficha para ver detalhes.</div> : (
            <div className="max-w-2xl space-y-6">
              <div className="flex justify-between items-start">
                <div><h1 className="text-2xl font-bold text-white">{selectedFicha.titulo}</h1><span className="text-xs bg-zinc-900 px-2 py-0.5 rounded text-zinc-400 uppercase tracking-wide">{selectedFicha.tipo}</span></div>
                <div className="flex gap-2"><button onClick={()=>startEditFicha(selectedFicha)} className="px-3 py-1 border border-zinc-700 rounded text-xs hover:bg-zinc-900">Editar</button><button onClick={()=>handleDeleteFicha(selectedFicha.id)} className="px-3 py-1 border border-red-900 text-red-400 rounded text-xs hover:bg-red-900/20">Excluir</button></div>
              </div>
              {selectedFicha.imagem_url && <img src={selectedFicha.imagem_url} className="rounded border border-zinc-800 max-h-60 object-contain bg-black" alt="ref" />}
              <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
                {selectedFicha.resumo && <div className="p-3 bg-zinc-900/50 rounded border border-zinc-800 italic">{selectedFicha.resumo}</div>}
                {selectedFicha.conteudo && <div className="whitespace-pre-wrap">{renderWikiText(selectedFicha.conteudo)}</div>}
              </div>
              <div className="pt-4 border-t border-zinc-800"><h3 className="text-xs font-bold text-zinc-500 uppercase mb-2">Códigos</h3><div className="flex flex-wrap gap-2">{codes.map(c => (<span key={c.id} className="px-2 py-1 bg-black border border-zinc-800 rounded text-xs font-mono text-emerald-500">{c.code}</span>))}<button onClick={startCreateCode} className="px-2 py-1 border border-zinc-800 border-dashed rounded text-xs text-zinc-500 hover:text-zinc-300">+ Código</button></div></div>
            </div>
          )}
        </section>

        {/* --- OVERLAY RECONCILIAÇÃO --- */}
        {showReconcile && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col animate-in fade-in duration-200">
            <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950">
              <h2 className="text-lg font-bold text-purple-400 flex items-center gap-2">⚡ Modo Reconciliação</h2>
              <button onClick={()=>setShowReconcile(false)} className="text-zinc-400 hover:text-white text-sm">Fechar (Esc)</button>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <aside className="w-80 border-r border-zinc-800 bg-zinc-950 p-4 overflow-y-auto">
                {reconcileLoading && <div className="text-xs text-zinc-500">Buscando duplicatas...</div>}
                {!reconcileLoading && reconcilePairs.length === 0 && <div className="text-zinc-500 text-sm text-center mt-10">Nenhuma duplicata encontrada.<br/>O banco está limpo!</div>}
                <div className="space-y-2">{reconcilePairs.map((pair, idx) => (<button key={idx} onClick={()=>handleSelectReconcilePair(pair)} className="w-full text-left p-3 rounded border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900 hover:border-purple-500/50 transition-all group"><div className="flex justify-between mb-1"><span className="text-[10px] font-mono text-purple-400">{(pair.similarity*100).toFixed(0)}% similar</span></div><div className="text-xs font-bold text-zinc-300 group-hover:text-white">{pair.titulo_a}</div><div className="text-[10px] text-zinc-600 my-0.5">vs</div><div className="text-xs font-bold text-zinc-300 group-hover:text-white">{pair.titulo_b}</div></button>))}</div>
              </aside>
              <main className="flex-1 bg-black p-8 overflow-y-auto">
                {!comparing ? (<div className="h-full flex items-center justify-center text-zinc-600 text-sm">Selecione um par na esquerda para resolver o conflito.</div>) : mergeDraft && (
                  <div className="max-w-4xl mx-auto pb-20">
                    <div className="flex justify-between items-end mb-8 border-b border-zinc-800 pb-4">
                      <div><h3 className="text-xl font-bold text-white mb-1">Resolvendo Conflito</h3><p className="text-zinc-400 text-xs">Selecione qual versão de cada campo você quer manter.</p></div>
                      <button onClick={()=>executeMerge(comparing.a.id, comparing.b.id)} disabled={reconcileProcessing} className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded font-bold text-sm shadow-lg shadow-purple-900/20 disabled:opacity-50">{reconcileProcessing ? "Fundindo..." : "Confirmar Fusão"}</button>
                    </div>
                    <div className="grid gap-1">
                      <FieldChoice label="Título" field="titulo" />
                      <FieldChoice label="Tipo" field="tipo" />
                      <FieldChoice label="Resumo" field="resumo" />
                      <FieldChoice label="Conteúdo" field="conteudo" />
                      <FieldChoice label="Tags" field="tags" />
                      <FieldChoice label="Aparece Em" field="aparece_em" />
                      <div className="mt-8 pt-4 border-t border-zinc-800">
                        <h4 className="text-xs uppercase tracking-widest text-zinc-500 mb-4">Cronologia</h4>
                        <div className="grid grid-cols-2 gap-4"><FieldChoice label="Ano Diegese" field="ano_diegese" /><FieldChoice label="Camada" field="camada_temporal" /></div>
                      </div>
                    </div>
                  </div>
                )}
              </main>
            </div>
          </div>
        )}

        {/* --- MODAIS DE EDIÇÃO (MANTIDOS IGUAIS) --- */}
        {worldFormMode !== "idle" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <form onSubmit={handleSaveWorld} className="bg-zinc-950 border border-zinc-800 p-6 rounded w-96 space-y-4">
              <h3 className="font-bold text-white">Editar Mundo</h3>
              <input className="w-full bg-black border border-zinc-800 p-2 text-sm rounded" placeholder="Nome" value={worldForm.nome} onChange={e=>setWorldForm({...worldForm, nome:e.target.value})} />
              <textarea className="w-full bg-black border border-zinc-800 p-2 text-sm rounded h-24" placeholder="Descrição" value={worldForm.descricao} onChange={e=>setWorldForm({...worldForm, descricao:e.target.value})} />
              <div className="flex justify-end gap-2"><button type="button" onClick={cancelWorldForm} className="text-xs text-zinc-400 px-3 py-2">Cancelar</button><button className="bg-emerald-600 text-black text-xs font-bold px-4 py-2 rounded">Salvar</button></div>
            </form>
          </div>
        )}

        {fichaFormMode !== "idle" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <form onSubmit={handleSaveFicha} className="bg-zinc-950 border border-zinc-800 p-6 rounded w-[600px] max-h-[90vh] overflow-y-auto space-y-4">
              <h3 className="font-bold text-white">Editar Ficha</h3>
              <div className="grid grid-cols-2 gap-4"><input className="bg-black border border-zinc-800 p-2 text-sm rounded" placeholder="Título" value={fichaForm.titulo} onChange={e=>setFichaForm({...fichaForm, titulo:e.target.value})} /><input className="bg-black border border-zinc-800 p-2 text-sm rounded" placeholder="Tipo" value={fichaForm.tipo} onChange={e=>setFichaForm({...fichaForm, tipo:e.target.value})} /></div>
              <textarea className="w-full bg-black border border-zinc-800 p-2 text-sm rounded h-20" placeholder="Resumo" value={fichaForm.resumo} onChange={e=>setFichaForm({...fichaForm, resumo:e.target.value})} />
              <textarea className="w-full bg-black border border-zinc-800 p-2 text-sm rounded h-40" placeholder="Conteúdo" value={fichaForm.conteudo} onChange={e=>setFichaForm({...fichaForm, conteudo:e.target.value})} />
              <div className="grid grid-cols-2 gap-4"><input className="bg-black border border-zinc-800 p-2 text-sm rounded" placeholder="Tags" value={fichaForm.tags} onChange={e=>setFichaForm({...fichaForm, tags:e.target.value})} /><input className="bg-black border border-zinc-800 p-2 text-sm rounded" placeholder="Aparece Em" value={fichaForm.aparece_em} onChange={e=>setFichaForm({...fichaForm, aparece_em:e.target.value})} /></div>
              <div className="p-3 bg-zinc-900 rounded border border-zinc-800 grid grid-cols-3 gap-2">
                <input className="bg-black border border-zinc-800 p-2 text-xs rounded" type="number" placeholder="Ano" value={fichaForm.ano_diegese} onChange={e=>setFichaForm({...fichaForm, ano_diegese:e.target.value})} />
                <input className="bg-black border border-zinc-800 p-2 text-xs rounded" placeholder="Camada Temporal" value={fichaForm.camada_temporal} onChange={e=>setFichaForm({...fichaForm, camada_temporal:e.target.value})} />
                <input className="bg-black border border-zinc-800 p-2 text-xs rounded" placeholder="Data Descritiva" value={fichaForm.descricao_data} onChange={e=>setFichaForm({...fichaForm, descricao_data:e.target.value})} />
              </div>
              <div className="flex justify-end gap-2"><button type="button" onClick={cancelFichaForm} className="text-xs text-zinc-400 px-3 py-2">Cancelar</button><button className="bg-emerald-600 text-black text-xs font-bold px-4 py-2 rounded">Salvar</button></div>
            </form>
          </div>
        )}

        {codeFormMode !== "idle" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <form onSubmit={handleSaveCode} className="bg-zinc-950 border border-zinc-800 p-6 rounded w-96 space-y-4">
              <h3 className="font-bold text-white">Código</h3>
              <input className="w-full bg-black border border-zinc-800 p-2 text-sm rounded" placeholder="Código (ex: AV1-PS2)" value={codeForm.code} onChange={e=>setCodeForm({...codeForm, code:e.target.value})} />
              <div className="flex justify-end gap-2"><button type="button" onClick={cancelCodeForm} className="text-xs text-zinc-400 px-3 py-2">Cancelar</button><button className="bg-emerald-600 text-black text-xs font-bold px-4 py-2 rounded">Salvar</button></div>
            </form>
          </div>
        )}

      </main>
    </div>
  );
}
