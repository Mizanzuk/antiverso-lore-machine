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

const RELATION_TYPES = [
  "relacionado_a", "amigo_de", "inimigo_de", "localizado_em", "mora_em",
  "nasceu_em", "participou_de", "protagonizado_por", "menciona", "pai_de",
  "filho_de", "criador_de", "parte_de"
];

// --- TIPOS DE DADOS ---
type ViewState = "loading" | "loggedOut" | "loggedIn";
type WorldFormMode = "idle" | "create" | "edit";
type FichaFormMode = "idle" | "create" | "edit";
type CodeFormMode = "idle" | "create" | "edit";
type UniverseFormMode = "idle" | "create" | "edit";

type DuplicatePair = { id_a: string; titulo_a: string; tipo_a: string; id_b: string; titulo_b: string; tipo_b: string; similarity: number; };

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

function escapeRegExp(str: string): string { return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Componente Auxiliar para Reconciliação
function FieldChoice({ label, field, comparing, mergeDraft, onSelect }: { label: string; field: keyof FichaFull; comparing: { a: FichaFull; b: FichaFull } | null; mergeDraft: FichaFull | null; onSelect: (field: keyof FichaFull, value: any) => void }) {
  if (!comparing || !mergeDraft) return null;
  const valA = comparing.a[field];
  const valB = comparing.b[field];
  const cur = mergeDraft[field];
  
  if (valA === valB) return null;

  return (
    <div className="mb-2 border border-zinc-800 p-2 rounded">
      <div className="text-[10px] uppercase text-zinc-500 mb-1">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={()=>onSelect(field, valA)} className={`text-xs p-1 rounded border ${cur===valA?"border-emerald-500 bg-emerald-900/20":"border-zinc-700"}`}>A: {String(valA)}</button>
        <button onClick={()=>onSelect(field, valB)} className={`text-xs p-1 rounded border ${cur===valB?"border-emerald-500 bg-emerald-900/20":"border-zinc-700"}`}>B: {String(valB)}</button>
      </div>
    </div>
  );
}

function LoreAdminContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [view, setView] = useState<ViewState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Dados Principais
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
  const [fichaFilterTipos, setFichaFilterTipos] = useState<string[]>([]);
  const [selectedEpisodeFilter, setSelectedEpisodeFilter] = useState<string>(""); 
  const [fichasSearchTerm, setFichasSearchTerm] = useState<string>("");

  // Forms
  const [universeFormMode, setUniverseFormMode] = useState<UniverseFormMode>("idle");
  const [universeForm, setUniverseForm] = useState({ id:"", nome:"", descricao:"" });
  const [worldFormMode, setWorldFormMode] = useState<WorldFormMode>("idle");
  const [isSavingWorld, setIsSavingWorld] = useState(false);
  const [worldForm, setWorldForm] = useState<Partial<World>>({});
  const [fichaFormMode, setFichaFormMode] = useState<FichaFormMode>("idle");
  const [isSavingFicha, setIsSavingFicha] = useState(false);
  const [fichaForm, setFichaForm] = useState<any>({});
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [codeFormMode, setCodeFormMode] = useState<CodeFormMode>("idle");
  const [isSavingCode, setIsSavingCode] = useState(false);
  const [codeForm, setCodeForm] = useState<any>({});

  // Modais Visuais & Reconciliação
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcilePairs, setReconcilePairs] = useState<DuplicatePair[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [comparing, setComparing] = useState<{ a: FichaFull; b: FichaFull } | null>(null);
  const [mergeDraft, setMergeDraft] = useState<FichaFull | null>(null);

  // Gerenciamento de Relações e Menções
  const [isManagingRelations, setIsManagingRelations] = useState(false);
  const [newRelationTarget, setNewRelationTarget] = useState("");
  const [newRelationType, setNewRelationType] = useState("relacionado_a");
  const [isSavingRelation, setIsSavingRelation] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeTextarea, setActiveTextarea] = useState<"conteudo" | "resumo" | null>(null);

  // --- AUTH ---
  useEffect(() => {
    const checkSession = async () => {
      setView("loading");
      const { data: { session }, error } = await supabaseBrowser.auth.getSession();
      if (error || !session) { setView("loggedOut"); return; }
      setView("loggedIn");
      loadUniverses();
    };
    checkSession();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setIsSubmitting(true); setError(null);
    const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);
    if (error) setError(error.message);
    else { setView("loggedIn"); loadUniverses(); }
  }
  async function handleLogout() { await supabaseBrowser.auth.signOut(); setView("loggedOut"); setEmail(""); setPassword(""); }

  // --- DATA LOADERS (COMBINADOS EM UMA CHAMADA À API PARA BURLAR RLS) ---
  const fetchAllData = useCallback(async (uniId: string, currentWorldId: string | null) => {
    if (!uniId) return;
    setIsLoadingData(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('universeId', uniId);
      
      const res = await fetch(`/api/catalog?${params.toString()}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Erro de rede desconhecido' }));
        throw new Error(errorData.error || `Falha ao carregar dados do catálogo (Status: ${res.status})`);
      }
      
      const data = await res.json();

      const loadedWorlds = (data.worlds || []) as World[];
      const loadedFichas = (data.entities || []) as FichaFull[];
      
      setWorlds(loadedWorlds);
      setFichas(loadedFichas);

      // Lógica de seleção
      let effectiveWorldId = currentWorldId;
      const urlWorld = searchParams.get("world");
      
      if (urlWorld && loadedWorlds.some(w => w.id === urlWorld)) {
        effectiveWorldId = urlWorld;
      } else if (effectiveWorldId && !loadedWorlds.some(w => w.id === effectiveWorldId)) {
        effectiveWorldId = null; 
      }
      
      setSelectedWorldId(effectiveWorldId);

      // Carregar detalhes da ficha se houver ID na URL
      const urlFicha = searchParams.get("ficha");
      if (urlFicha && loadedFichas.some(f => f.id === urlFicha)) {
        setSelectedFichaId(urlFicha);
        // Os detalhes da ficha (códigos/relações) ainda precisam ser carregados separadamente
        loadDetails(urlFicha); 
      } else {
         setSelectedFichaId(null);
         setCodes([]);
         setRelations([]);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro inesperado ao carregar dados.");
    } finally {
      setIsLoadingData(false);
    }
  }, [searchParams]);


  async function loadUniverses() {
    setIsLoadingData(true);
    const { data } = await supabaseBrowser.from("universes").select("*").order("nome");
    if (data) {
      setUniverses(data);
      const urlUni = searchParams.get("universe");
      
      let initialUniId = null;

      if (urlUni && data.find(u => u.id === urlUni)) {
        initialUniId = urlUni;
      } else if (data.length > 0) {
        initialUniId = data[0].id;
      }

      setSelectedUniverseId(initialUniId);
      if(initialUniId) {
          // Aqui chamamos o fetchAllData, que substitui loadWorlds e loadFichas
          await fetchAllData(initialUniId, searchParams.get("world"));
      }
    }
    setIsLoadingData(false);
  }

  // MOCK das funções anteriores, que agora usam fetchAllData
  async function loadWorlds(uniId: string) {
      await fetchAllData(uniId, null);
  }
  async function loadFichas(uniId: string, wId: string | null) {
      // Esta função deve ser chamada apenas para re-filtrar no cliente, 
      // mas como o filtro é simples, podemos fazer o full fetch novamente
      await fetchAllData(uniId, wId);
  }

  async function loadDetails(fichaId: string) {
    // Estas chamadas ainda são feitas no cliente, pois são pequenas e específicas
    const { data: cData } = await supabaseBrowser.from("codes").select("*").eq("ficha_id", fichaId).order("code");
    setCodes(cData || []);
    const { data: rData } = await supabaseBrowser.from("lore_relations").select(`*, source:source_ficha_id(id, titulo, tipo), target:target_ficha_id(id, titulo, tipo)`).or(`source_ficha_id.eq.${fichaId},target_ficha_id.eq.${fichaId}`);
    setRelations(rData || []);
  }

  const updateUrl = useCallback((uniId: string | null, worldId: string | null, fichaId: string | null) => {
    const params = new URLSearchParams();
    if (uniId) params.set("universe", uniId);
    if (worldId) params.set("world", worldId);
    if (fichaId) params.set("ficha", fichaId);
    router.replace(`${pathname}?${params.toString()}`);
  }, [pathname, router]);

  function handleSelectUniverse(id: string) {
    setSelectedUniverseId(id);
    setSelectedWorldId(null);
    setSelectedFichaId(null);
    setSelectedEpisodeFilter("");
    updateUrl(id, null, null);
    // Chama o novo fetch para atualizar todos os dados
    fetchAllData(id, null); 
  }
  function handleSelectWorld(id: string | null) {
    setSelectedWorldId(id);
    setSelectedFichaId(null);
    setSelectedEpisodeFilter("");
    updateUrl(selectedUniverseId, id, null);
    // O filtro de fichas agora é feito no useMemo abaixo, 
    // mas a seleção do mundo é suficiente para re-renderizar.
  }
  function handleSelectFicha(id: string) {
    setSelectedFichaId(id);
    loadDetails(id);
    setIsManagingRelations(false);
    updateUrl(selectedUniverseId, selectedWorldId, id);
  }

  const renderWikiText = (text: string | null | undefined) => {
    if (!text) return null;
    const currentFichaId = selectedFichaId;
    const candidates = fichas.filter((f) => f.id !== currentFichaId && f.titulo?.trim()).map((f) => ({ id: f.id, titulo: f.titulo.trim() }));
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
          <button key={`${target.id}-${offset}`} type="button" className="underline decoration-dotted decoration-emerald-500/70 hover:text-emerald-300 text-emerald-100 font-medium cursor-pointer transition-colors" onClick={() => handleSelectFicha(target.id)}>
            {match}
          </button>
        );
      } else elements.push(match);
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < text.length) elements.push(text.slice(lastIndex));
    return <>{elements}</>;
  };

  function startCreateUniverse() { setUniverseForm({ id: "", nome: "", descricao: "" }); setUniverseFormMode("create"); }
  function startEditUniverse(u: Universe) { setUniverseForm({ id: u.id, nome: u.nome, descricao: u.descricao || "" }); setUniverseFormMode("edit"); }

  async function saveUniverse() {
    if (universeFormMode === "create") {
      const { data } = await supabaseBrowser.from("universes").insert({ nome: universeForm.nome, descricao: universeForm.descricao }).select().single();
      if (data) {
        const rootId = universeForm.nome.toLowerCase().replace(/\s+/g, "_") + "_root_" + Date.now();
        await supabaseBrowser.from("worlds").insert({ id: rootId, nome: universeForm.nome, universe_id: data.id, is_root: true, tipo: "meta_universo", ordem: 0, has_episodes: false });
        loadUniverses();
      }
    } else {
      await supabaseBrowser.from("universes").update({ nome: universeForm.nome, descricao: universeForm.descricao }).eq("id", universeForm.id);
      loadUniverses();
    }
    setUniverseFormMode("idle");
  }

  function requestDeleteUniverse(u: Universe) {
    const a = Math.floor(Math.random() * 10), b = Math.floor(Math.random() * 10);
    if (confirm(`ATENÇÃO: Apagar o universo "${u.nome}" deletará TODOS os mundos e fichas dentro dele.\nTem certeza?`)) {
       const ans = prompt(`Confirmação de segurança: quanto é ${a} + ${b}?`);
       if (ans === String(a + b)) supabaseBrowser.from("universes").delete().eq("id", u.id).then(() => loadUniverses());
       else alert("Captcha incorreto.");
    }
  }

  function startCreateWorld() { setWorldFormMode("create"); setWorldForm({ nome: "", descricao: "", has_episodes: true }); }
  function startEditWorld(w: World) { setWorldFormMode("edit"); setWorldForm(w); }
  function cancelWorldForm() { setWorldFormMode("idle"); setWorldForm({}); }
  
  // CORREÇÃO 2: Força o reload do catálogo completo para resolver o problema do "Teste 4" não aparecer
  async function handleSaveWorld(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...worldForm, universe_id: selectedUniverseId };
    const safeName = payload.nome || "novo_mundo";
    
    if (worldFormMode === 'create') {
       const slugId = safeName.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
       const { error } = await supabaseBrowser.from("worlds").insert([{ ...payload, id: slugId }]);
       if (error) { setError(`Erro ao criar Mundo: ${error.message}`); return; }
    } else {
       const { error } = await supabaseBrowser.from("worlds").update(payload).eq("id", worldForm.id);
       if (error) { setError(`Erro ao salvar Mundo: ${error.message}`); return; }
    }
    
    setWorldFormMode("idle");
    // Força a recarga de TODOS os dados (mundos e fichas)
    if(selectedUniverseId) fetchAllData(selectedUniverseId, selectedWorldId); 
  }
  
  // CORREÇÃO 1: Adiciona a exclusão em cascata manual para resolver o problema de Foreign Key (FK)
  async function handleDeleteWorld(id: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!confirm("ATENÇÃO: Deletar um mundo também deletará TODAS as fichas, códigos e relações vinculadas a ele. Esta ação é irreversível.")) return;
    
    setError(null);

    try {
      // 0. Encontrar todos os IDs de ficha que pertencem a este mundo
      const { data: fichasData, error: fetchError } = await supabaseBrowser
          .from("fichas")
          .select("id")
          .eq("world_id", id);
      
      if (fetchError) throw new Error("Erro ao buscar fichas para exclusão.");
      const fichaIds = fichasData?.map(f => f.id) || [];
      
      // 1. Limpar Códigos e Relações (necessário para que as fichas possam ser deletadas)
      if (fichaIds.length > 0) {
        // 1a. Deletar Códigos
        const { error: deleteCodesError } = await supabaseBrowser
            .from("codes")
            .delete()
            .in("ficha_id", fichaIds);
        if (deleteCodesError) console.warn("Aviso: Falha ao limpar códigos (ignorando).", deleteCodesError);

        // 1b. Deletar Relações (onde a ficha é SOURCE ou TARGET)
        const { error: deleteRelsError } = await supabaseBrowser
            .from("lore_relations")
            .delete()
            .or(`source_ficha_id.in.(${fichaIds.join(',')}),target_ficha_id.in.(${fichaIds.join(',')})`);
        if (deleteRelsError) console.warn("Aviso: Falha ao limpar relações (ignorando).", deleteRelsError);
      }
      
      // 2. Deletar Fichas (que agora não têm dependências)
      const { error: deleteFichasError } = await supabaseBrowser
        .from("fichas")
        .delete()
        .eq("world_id", id);

      if (deleteFichasError) {
        throw new Error("Não foi possível deletar fichas vinculadas. Erro: " + deleteFichasError.message);
      }
      
      // 3. Deletar o Mundo (que agora não tem fichas)
      const { error: deleteWorldError } = await supabaseBrowser
        .from("worlds")
        .delete()
        .eq("id", id);

      if (deleteWorldError) {
        throw new Error("Falha ao deletar mundo. Erro: " + deleteWorldError.message);
      }

      // 4. Atualizar estado
      if (selectedWorldId === id) setSelectedWorldId(null);
      // Força a recarga para aparecer o novo mundo (Teste 5) ou remover o deletado (Teste 3)
      if (selectedUniverseId) fetchAllData(selectedUniverseId, null); 

    } catch (err: any) {
      console.error("Erro ao deletar mundo:", err);
      setError("Erro ao deletar Mundo: " + err.message);
      
    }
  }

  function startCreateFicha() { 
    if(!selectedUniverseId) return alert("Selecione um universo.");
    setFichaFormMode("create"); 
    const rootWorld = worlds.find(w => w.is_root);
    const targetWorld = selectedWorldId || rootWorld?.id || worlds[0]?.id;
    setFichaForm({ id:"", titulo:"", tipo:"conceito", world_id: targetWorld, conteudo:"", resumo:"", tags:"", granularidade_data:"indefinido", camada_temporal:"linha_principal" }); 
  }
  function startEditFicha(f: any) { setFichaFormMode("edit"); setFichaForm({...f}); }
  function cancelFichaForm() { setFichaFormMode("idle"); setFichaForm({}); }
  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      // @ts-ignore
      const compressedFile = await compressImage(file);
      const fileName = `${Date.now()}_${compressedFile.name.replace(/\s+/g, '_')}`;
      const { data, error } = await supabaseBrowser.storage.from("lore-assets").upload(fileName, compressedFile);
      if (error) throw error;
      const { data: publicData } = supabaseBrowser.storage.from("lore-assets").getPublicUrl(data.path);
      setFichaForm({ ...fichaForm, imagem_url: publicData.publicUrl });
    } catch (err: any) {
      console.error(err);
      alert("Erro ao fazer upload da imagem.");
    } finally {
      setIsUploadingImage(false);
    }
  }
  async function handleSaveFicha(e: React.FormEvent) {
    e.preventDefault();
    if (!fichaForm.world_id) { setError("Selecione um Mundo para esta ficha."); return; }
    if (!fichaForm.titulo.trim()) { setError("Ficha precisa de um título."); return; }
    setIsSavingFicha(true);
    setError(null);
    const payload: any = {
      world_id: fichaForm.world_id,
      titulo: fichaForm.titulo.trim(),
      slug: fichaForm.slug?.trim() || null,
      tipo: fichaForm.tipo?.trim() || null,
      resumo: fichaForm.resumo?.trim() || null,
      conteudo: fichaForm.conteudo?.trim() || null,
      tags: fichaForm.tags?.trim() || null,
      ano_diegese: fichaForm.ano_diegese ? String(fichaForm.ano_diegese).trim() : null,
      ordem_cronologica: fichaForm.ordem_cronologica ? String(fichaForm.ordem_cronologica).trim() : null,
      aparece_em: fichaForm.aparece_em?.trim() || null,
      codigo: fichaForm.codigo?.trim() || null,
      imagem_url: fichaForm.imagem_url?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (payload.ano_diegese && !isNaN(Number(payload.ano_diegese))) payload.ano_diegese = Number(payload.ano_diegese);
    if (payload.ordem_cronologica && !isNaN(Number(payload.ordem_cronologica))) payload.ordem_cronologica = Number(payload.ordem_cronologica);

    let saveError = null;
    if (fichaFormMode === "create") {
      const { error } = await supabaseBrowser.from("fichas").insert([payload]);
      saveError = error;
    } else {
      const { error } = await supabaseBrowser.from("fichas").update(payload).eq("id", fichaForm.id);
      saveError = error;
    }
    setIsSavingFicha(false);
    if (saveError) {
      console.error(saveError);
      setError(`Erro ao salvar Ficha: ${(saveError as any)?.message || JSON.stringify(saveError)}`);
      return;
    }
    cancelFichaForm();
    const currentWorld = worlds.find((w) => w.id === selectedWorldId) || null;
    await fetchAllData(selectedUniverseId!, currentWorld ? currentWorld.id : null); // Chama o fetch completo
  }
  async function handleDeleteFicha(id: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!confirm("Tem certeza que deseja apagar esta ficha?")) return;
    await supabaseBrowser.from("codes").delete().eq("ficha_id", id);
    await supabaseBrowser.from("fichas").delete().eq("id", id);
    if (selectedFichaId === id) setSelectedFichaId(null);
    if (selectedUniverseId) fetchAllData(selectedUniverseId, selectedWorldId); // Chama o fetch completo
  }

  // MUDANÇA: Altera a referência ao Or para Urizen
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
      // MUDANÇA: Altera o título do relatório para Urizen
      if (data.analysis) alert("RELATÓRIO DE URIZEN:\n\n" + data.analysis);
      else alert("Erro ao analisar. Tente novamente.");
    } catch (err) {
      console.error(err);
      alert("Erro na requisição de coerência.");
    }
  }

  function getTypeLabel(typeValue: string) {
    const found = LORE_TYPES.find(t => t.value === typeValue);
    return found ? found.label : typeValue.charAt(0).toUpperCase() + typeValue.slice(1);
  }

  const availableEpisodes = useMemo(() => {
     const eps = new Set<string>();
     fichas.forEach(f => {
       if (f.episodio) eps.add(f.episodio);
       if (!f.episodio && f.codigo) {
          const m = f.codigo.match(/[A-Z]+(\d+)-/);
          if (m) eps.add(m[1]);
       }
     });
     return Array.from(eps).sort((a,b) => parseInt(a)-parseInt(b));
  }, [fichas]);

  // Filtro de Fichas na Coluna do Meio
  const filteredFichas = useMemo(() => {
    let list = fichas;

    // 1. Filtragem por Mundo
    if (selectedWorldId) {
        list = list.filter(f => f.world_id === selectedWorldId);
    }
    
    // 2. Filtragem por Tipo
    if (fichaFilterTipos.length > 0) {
        list = list.filter(f => fichaFilterTipos.includes(f.tipo));
    }
    
    // 3. Filtragem por Episódio
    if (selectedEpisodeFilter) {
       list = list.filter(f => {
          if (f.episodio === selectedEpisodeFilter) return true;
          const codeEp = f.codigo?.match(/[A-Z]+(\d+)-/)?.[1];
          return codeEp === selectedEpisodeFilter;
       });
    }

    // 4. Filtragem por Termo de Busca
    if (fichasSearchTerm.trim().length > 0) {
      const q = fichasSearchTerm.toLowerCase();
      list = list.filter(f => {
        const inTitulo = (f.titulo || "").toLowerCase().includes(q);
        const inResumo = (f.resumo || "").toLowerCase().includes(q);
        const inCodigo = (f.codigo || "").toLowerCase().includes(q);
        const inTags = (f.tags || "").toLowerCase().includes(q);
        return inTitulo || inResumo || inCodigo || inTags;
      });
    }

    return list;
  }, [fichas, selectedWorldId, fichaFilterTipos, selectedEpisodeFilter, fichasSearchTerm]);


  function toggleFilterTipo(tipo: string) {
    const t = tipo.toLowerCase();
    setFichaFilterTipos((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }

  const selectedFicha = fichas.find(f => f.id === selectedFichaId);
  const currentUniverse = universes.find(u => u.id === selectedUniverseId);
  const selectedWorldData = worlds.find(w => w.id === selectedWorldId); // Correção do bug anterior
  const rootWorld = worlds.find(w => w.is_root);
  const childWorlds = worlds.filter(w => !w.is_root);

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>, field: "conteudo" | "resumo") {
    const val = e.target.value;
    setFichaForm({ ...fichaForm, [field]: val });
    const cursor = e.target.selectionStart;
    const textBefore = val.substring(0, cursor);
    const lastAt = textBefore.lastIndexOf("@");
    if (lastAt !== -1) {
      const query = textBefore.substring(lastAt + 1);
      if (!/\s/.test(query)) { setMentionQuery(query); setActiveTextarea(field); return; }
    }
    setMentionQuery(null); setActiveTextarea(null);
  }
  function insertMention(ficha: any) {
    if (!activeTextarea) return;
    const currentText = fichaForm[activeTextarea] || "";
    const regex = new RegExp(`@${mentionQuery}$`);
    if (regex.test(currentText)) setFichaForm({ ...fichaForm, [activeTextarea]: currentText.replace(regex, ficha.titulo) });
    setMentionQuery(null); setActiveTextarea(null);
  }
  const filteredMentions = useMemo(() => {
    if (!mentionQuery) return [];
    const lower = mentionQuery.toLowerCase();
    return fichas.filter(f => f.titulo.toLowerCase().includes(lower) || (f.tipo && f.tipo.toLowerCase().includes(lower))).slice(0, 6);
  }, [mentionQuery, fichas]);

  function startCreateCode() { setCodeFormMode("create"); setCodeForm({ id:"", code:"", label:"", description:"", episode:"" }); }
  function startEditCode(c:any) { setCodeFormMode("edit"); setCodeForm(c); }
  function cancelCodeForm() { setCodeFormMode("idle"); setCodeForm({}); }
  async function handleSaveCode(e:React.FormEvent) {
    e.preventDefault();
    if(codeFormMode==='create') await supabaseBrowser.from("codes").insert({...codeForm, ficha_id: selectedFichaId});
    else await supabaseBrowser.from("codes").update(codeForm).eq("id", codeForm.id);
    setCodeFormMode("idle"); loadDetails(selectedFichaId!);
  }
  async function handleDeleteCode(id: string) { await supabaseBrowser.from("codes").delete().eq("id", id); loadDetails(selectedFichaId!); }
  async function handleAddRelation() {
    await supabaseBrowser.from("lore_relations").insert({source_ficha_id:selectedFichaId, target_ficha_id:newRelationTarget, tipo_relacao:newRelationType});
    loadDetails(selectedFichaId!); setIsManagingRelations(false);
  }
  async function handleDeleteRelation(id: string) { await supabaseBrowser.from("lore_relations").delete().eq("id", id); loadDetails(selectedFichaId!); }

  async function openReconcile() { setShowReconcile(true); setReconcileLoading(true); const r = await fetch("/api/lore/reconcile"); const j = await r.json(); setReconcilePairs(j.duplicates||[]); setReconcileLoading(false); }
  async function handleSelectReconcilePair(p: DuplicatePair) {
    setReconcileLoading(true);
    const {data:dA} = await supabaseBrowser.from("fichas").select("*").eq("id", p.id_a).single();
    const {data:dB} = await supabaseBrowser.from("fichas").select("*").eq("id", p.id_b).single();
    setComparing({a:dA, b:dB}); setMergeDraft(dA); setReconcileLoading(false);
  }
  async function executeMerge(wId: string, lId: string) {
    if(!confirm("Fundir?")) return;
    await fetch("/api/lore/reconcile", {method:"POST", body:JSON.stringify({winnerId:wId, loserId:lId, mergedData:mergeDraft})});
    setComparing(null); openReconcile();
  }
  function handleMergeSelect(field: keyof FichaFull, value: any) {
    setMergeDraft((prev: any) => ({ ...prev, [field]: value }));
  }


  if (view === "loading") return <div className="min-h-screen bg-black text-neutral-500 flex items-center justify-center">Carregando...</div>;
  if (view === "loggedOut") return <div className="min-h-screen bg-black flex items-center justify-center"><form onSubmit={handleLogin} className="p-8 border border-zinc-800 rounded"><input className="block mb-2 bg-black border p-2 text-white" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} /><input type="password" className="block mb-2 bg-black border p-2 text-white" placeholder="Senha" value={password} onChange={e=>setPassword(e.target.value)} /><button className="bg-emerald-600 text-white px-4 py-2">Entrar</button></form></div>;

  return (
    <div className="h-screen bg-black text-neutral-100 flex flex-col overflow-hidden">
      <header className="border-b border-neutral-900 px-4 py-2 flex items-center justify-between bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <a href="/" className="text-[11px] text-neutral-300 hover:text-white">← Home (Chat)</a>
          <a href="/lore-upload" className="text-[11px] text-neutral-400 hover:text-white">Upload</a>
          <a href="/lore-admin/timeline" className="text-[11px] text-neutral-400 hover:text-white">Timeline</a>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={openReconcile} className="text-[11px] px-3 py-1 rounded bg-purple-900/30 border border-purple-500/50 text-purple-200 hover:bg-purple-500 transition-colors">⚡ Reconciliar</button>
          <button onClick={handleLogout} className="text-[11px] px-3 py-1 rounded-full border border-neutral-700 text-neutral-300 hover:text-white transition-colors">Sair</button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* COLUNA 1: UNIVERSO & MUNDOS */}
        {!isFocusMode && (
          <section className="w-64 border-r border-neutral-800 p-4 flex flex-col min-h-0 bg-neutral-950/50">
            <div className="mb-6 pb-4 border-b border-zinc-800">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Universo</div>
              <div className="flex gap-2 mb-2 items-center">
                <select 
                  className="flex-1 bg-black border border-zinc-700 text-white text-sm rounded p-2 font-bold outline-none focus:border-emerald-500" 
                  value={selectedUniverseId || ""} 
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "__new__") {
                      startCreateUniverse();
                      // CORREÇÃO: Força o seletor a voltar ao ID atual.
                      e.target.value = selectedUniverseId || universes[0]?.id || "";
                    } else {
                      handleSelectUniverse(value);
                    }
                  }}
                >
                  {universes.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  <option value="__new__">+ Novo Universo...</option>
                </select>
                <button onClick={() => currentUniverse && startEditUniverse(currentUniverse)} className="p-2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600" title="Editar Universo">✎</button>
                <button onClick={() => currentUniverse && requestDeleteUniverse(currentUniverse)} className="p-2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-500 hover:border-red-900" title="Deletar Universo">×</button>
              </div>

              {/* MUNDO RAIZ / TODAS AS FICHAS */}
              <div onClick={() => handleSelectWorld(null)} className={`cursor-pointer p-3 rounded border transition-all ${!selectedWorldId ? "border-emerald-500 bg-emerald-900/20 text-white" : "border-zinc-800 text-zinc-400 hover:bg-zinc-900"}`}>
                <div className="text-xs font-bold flex items-center gap-2">{currentUniverse?.nome || "Universo"} (Tudo)</div>
                <div className="text-[9px] opacity-60 mt-1">Regras, conceitos e todas as fichas.</div>
              </div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 font-bold">Mundos</h2>
              <button onClick={startCreateWorld} className="text-[10px] px-2 py-0.5 rounded border border-neutral-800 hover:border-emerald-500 text-neutral-400 hover:text-white transition-colors">+</button>
            </div>
            {/* CORREÇÃO: Renderiza apenas mundos FILHOS */}
            <div className="flex-1 overflow-auto space-y-1 pr-1">
              {childWorlds.map((w) => (
                <div key={w.id} className={`group relative border rounded px-3 py-2 text-[11px] cursor-pointer transition-all ${selectedWorldId === w.id ? "border-emerald-500/50 bg-emerald-500/10 text-white" : "border-transparent hover:bg-neutral-900 text-neutral-400"}`} onClick={() => handleSelectWorld(w.id)}>
                  <div className="flex items-center justify-between pr-6"><span className="font-medium truncate">{w.nome}</span></div>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1 bg-black/90 rounded p-0.5 z-10">
                     <button onClick={(e) => { e.stopPropagation(); startEditWorld(w); }} className="text-[9px] px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded">Edit</button>
                     <button onClick={(e) => handleDeleteWorld(w.id, e)} className="text-[9px] px-1.5 py-0.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded">Del</button>
                  </div>
                </div>
              ))}
              {childWorlds.length === 0 && (
                <p className="text-[10px] text-zinc-500 mt-2">Nenhum mundo filho encontrado neste universo.</p>
              )}
            </div>
          </section>
        )}

        {/* 2. COLUNA LISTA (FICHAS) */}
        {!isFocusMode && (
          <section className="w-80 border-r border-neutral-800 p-4 flex flex-col min-h-0 bg-neutral-900/20">
            <div className="flex items-center justify-between mb-4"><h2 className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 font-bold">{selectedWorldId ? worlds.find(w=>w.id===selectedWorldId)?.nome : "Todas as Fichas"}</h2><button onClick={startCreateFicha} className="text-[10px] px-2 py-0.5 rounded border border-neutral-800 hover:border-emerald-500 text-neutral-400 hover:text-white">+ Nova</button></div>
            
            {/* BUSCA */}
            <input className="w-full rounded bg-black/40 border border-neutral-800 px-2 py-1.5 text-[11px] mb-2 text-white focus:border-emerald-500 outline-none" placeholder="Buscar por título, código, resumo..." value={fichasSearchTerm} onChange={(e) => setFichasSearchTerm(e.target.value)} />
            
            {/* FILTRO POR EPISÓDIO (Se houver) */}
            {selectedWorldData?.has_episodes && availableEpisodes.length > 0 && (
               <div className="mb-2">
                 <select 
                   className="w-full bg-black border border-zinc-800 rounded text-[10px] p-1 text-zinc-300"
                   value={selectedEpisodeFilter}
                   onChange={(e) => setSelectedEpisodeFilter(e.target.value)}
                 >
                    <option value="">Todos os Episódios</option>
                    {availableEpisodes.map(ep => <option key={ep} value={ep}>Episódio {ep}</option>)}
                 </select>
               </div>
            )}

            {/* FILTROS POR TIPO */}
            {fichaFilterTipos.length > 0 && <div className="text-[9px] text-emerald-500 mb-1 font-bold">Filtrando por: {fichaFilterTipos.map(getTypeLabel).join(", ")}</div>}
            <div className="flex flex-wrap gap-1 mb-3 max-h-24 overflow-y-auto scrollbar-thin">
              <button onClick={() => setFichaFilterTipos([])} className={`px-2 py-0.5 text-[9px] rounded border ${fichaFilterTipos.length === 0 ? "border-emerald-500 text-emerald-300" : "border-neutral-800 text-neutral-500"}`}>TODOS</button>
              {LORE_TYPES.map(t => (
                <button key={t.value} title={t.label} onClick={() => setFichaFilterTipos(prev => prev.includes(t.value) ? prev.filter(x => x !== t.value) : [...prev, t.value])} className={`px-2 py-0.5 text-[9px] uppercase rounded border ${fichaFilterTipos.includes(t.value) ? "border-emerald-500 text-emerald-300" : "border-neutral-800 text-neutral-500 hover:border-neutral-600"}`}>{t.value.slice(0,3)}</button>
              ))}
            </div>

            <div className="flex-1 overflow-auto space-y-1 pr-1">
              {fichas.length === 0 && (
                 <p className="text-[10px] text-zinc-500 mt-2">Nenhuma ficha carregada. Verifique os mundos ou filtros.</p>
              )}
              {filteredFichas.map((f) => (
                <div key={f.id} className={`group relative border rounded px-3 py-2 text-[11px] cursor-pointer transition-all ${selectedFichaId === f.id ? "border-emerald-500/50 bg-emerald-900/20" : "border-neutral-800/50 hover:bg-neutral-800/50"}`} onClick={() => handleSelectFicha(f.id)}>
                  <div className="flex justify-between items-start pr-8"><span className="font-medium text-neutral-200 line-clamp-1">{f.titulo}</span><span className="text-[9px] uppercase tracking-wide text-neutral-500">{f.tipo}</span></div>
                  {f.resumo && <span className="text-neutral-500 line-clamp-2 text-[10px] leading-relaxed pr-8">{f.resumo}</span>}
                  <div className="absolute right-2 top-2 hidden group-hover:flex flex-col gap-1 bg-black/90 rounded p-0.5 z-10">
                     <button onClick={(e) => { e.stopPropagation(); startEditFicha(f); }} className="text-[9px] px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-center">Edit</button>
                     <button onClick={(e) => handleDeleteFicha(f.id, e)} className="text-[9px] px-1.5 py-0.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded text-center">Del</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 3. COLUNA DETALHES */}
        <section className={`flex-1 p-6 flex flex-col min-h-0 overflow-y-auto bg-black transition-all duration-300 ${isFocusMode ? "w-full max-w-5xl mx-auto" : ""}`}>
          {!selectedFicha ? <div className="flex items-center justify-center h-full text-neutral-600 text-xs">Selecione uma ficha para visualizar</div> : (
            <div className="max-w-3xl mx-auto w-full relative">
              <div className="absolute -right-4 top-0">
                <button onClick={() => setIsFocusMode(!isFocusMode)} className="text-neutral-500 hover:text-white p-2 rounded hover:bg-zinc-900 transition-colors" title={isFocusMode ? "Restaurar painéis" : "Modo Leitura (Expandir)"}>
                  {isFocusMode ? <span className="text-xs uppercase tracking-widest">⇲ Restaurar</span> : <span className="text-lg">⤢</span>}
                </button>
              </div>

              <div className="mb-8 pb-6 border-b border-neutral-900 mt-2">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-600 font-bold mb-2"><span>{selectedFicha.tipo}</span>{selectedFicha.slug && <span className="text-neutral-600 font-normal lowercase">/ {selectedFicha.slug}</span>}</div>
                <h1 className="text-3xl font-bold text-white mb-3">{selectedFicha.titulo}</h1>
                {selectedFicha.resumo && <p className="text-lg text-neutral-400 italic leading-relaxed">{renderWikiText(selectedFicha.resumo)}</p>}
                {/* Display World Name in View Mode */}
                <div className="mt-3 inline-flex items-center px-2.5 py-0.5 rounded bg-neutral-800/60 text-[10px] font-mono text-neutral-400 border border-neutral-700/50">
                   🌎 {worlds.find(w => w.id === selectedFicha.world_id)?.nome || "Mundo Desconhecido"}
                </div>
              </div>
              
              <div className="flex justify-end gap-2 mb-6">
                <button onClick={() => startEditFicha(selectedFicha)} className="px-3 py-1 rounded border border-neutral-800 text-[10px] hover:bg-neutral-900 text-neutral-400">Editar Ficha</button>
                <button onClick={() => handleDeleteFicha(selectedFicha.id)} className="px-3 py-1 rounded border border-red-900/30 text-[10px] hover:bg-red-900/20 text-red-400">Excluir Ficha</button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-12">
                <div className="space-y-6">
                   {selectedFicha.imagem_url && <div className="rounded border border-neutral-800 overflow-hidden bg-neutral-900/30"><img src={selectedFicha.imagem_url} alt="" className="w-full object-cover opacity-80 hover:opacity-100" /></div>}
                   <div><h3 className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-2">Conteúdo</h3><div className="text-sm text-neutral-300 leading-loose whitespace-pre-wrap font-light">{renderWikiText(selectedFicha.conteudo)}</div></div>
                   {selectedFicha.aparece_em && <div className="p-4 rounded bg-neutral-900/30 border border-neutral-800"><h3 className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-1">Aparece em</h3><div className="text-xs text-neutral-400 whitespace-pre-wrap">{renderWikiText(selectedFicha.aparece_em)}</div></div>}
                </div>
                
                <div className="space-y-8">
                  <div className="border rounded border-neutral-800 bg-neutral-900/10 p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold flex items-center gap-2">🔗 Conexões</h3>
                      <button onClick={() => setIsManagingRelations(!isManagingRelations)} className={`text-[9px] px-2 py-0.5 rounded border ${isManagingRelations ? "bg-emerald-900/50 border-emerald-500 text-white" : "border-neutral-800 text-neutral-500 hover:text-white"}`}>{isManagingRelations ? "Concluir" : "Gerenciar"}</button>
                    </div>
                    <div className="space-y-1 mb-2">
                      {relations.length === 0 && <p className="text-[10px] text-neutral-600 italic">Nenhuma conexão.</p>}
                      {relations.map(rel => {
                        const other = rel.source_ficha_id === selectedFicha.id ? rel.target : rel.source;
                        return other ? (
                          <div key={rel.id} className="group flex items-center justify-between p-2 rounded bg-neutral-900/40 border border-neutral-800/50 hover:border-neutral-700 transition-all">
                            <button onClick={() => !isManagingRelations && handleSelectFicha(other.id)} className={`text-left flex-1 ${!isManagingRelations ? "cursor-pointer" : "cursor-default"}`}>
                              <div className="text-[9px] text-neutral-500 uppercase tracking-wide mb-0.5">{rel.tipo_relacao?.replace(/_/g, " ") || "Relacionado a"}</div>
                              <div className="text-xs font-medium text-neutral-300">{other.titulo}</div>
                            </button>
                            {isManagingRelations && <button onClick={() => handleDeleteRelation(rel.id)} className="text-red-500 hover:text-red-300 px-2 py-1 text-xs">×</button>}
                            {!isManagingRelations && <span className="text-[10px] text-neutral-600">→</span>}
                          </div>
                        ) : null;
                      })}
                    </div>
                    {isManagingRelations && (
                      <div className="mt-3 pt-3 border-t border-neutral-800 space-y-2">
                        <div className="text-[9px] text-neutral-500 uppercase tracking-wide">Adicionar Conexão</div>
                        <select className="w-full bg-black border border-neutral-700 rounded text-[10px] p-1.5 text-neutral-300" value={newRelationTarget} onChange={(e) => setNewRelationTarget(e.target.value)}>
                          <option value="">Selecione a ficha alvo...</option>
                          {fichas.filter(f => f.id !== selectedFicha.id).map(f => (<option key={f.id} value={f.id}>{f.titulo} ({f.tipo})</option>))}
                        </select>
                        <select className="w-full bg-black border border-neutral-700 rounded text-[10px] p-1.5 text-neutral-300" value={newRelationType} onChange={(e) => setNewRelationType(e.target.value)}>{RELATION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>
                        <button onClick={handleAddRelation} disabled={isSavingRelation || !newRelationTarget} className="w-full bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/50 text-emerald-200 text-[10px] py-1.5 rounded uppercase tracking-wide disabled:opacity-50">{isSavingRelation ? "Salvando..." : "Adicionar Conexão"}</button>
                      </div>
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
                          <div className="flex flex-col"><span className="font-mono text-emerald-500">{c.code}</span>{c.label && <span className="text-[9px] text-neutral-600">{c.label}</span>}</div>
                          <div className="opacity-0 group-hover:opacity-100 flex gap-1"><button onClick={()=>startEditCode(c)} className="text-[9px] text-neutral-500 hover:text-white">Edit</button><button onClick={()=>handleDeleteCode(c.id)} className="text-[9px] text-red-500 hover:text-red-400">Del</button></div>
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

      {/* Modais de edição – Mundo */}
      {worldFormMode !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <form
            onSubmit={handleSaveWorld}
            className="w-full max-w-md max-h-[90vh] overflow-auto border border-neutral-800 rounded-lg p-4 bg-neutral-950/95 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-neutral-400">
                {worldFormMode === "create" ? "Novo Mundo" : "Editar Mundo"}
              </div>
              <button
                type="button"
                onClick={cancelWorldForm}
                className="text-[11px] text-neutral-500 hover:text-neutral-200"
              >
                fechar
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">Nome</label>
              <input
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={worldForm.nome}
                onChange={(e) =>
                  setWorldForm((prev) => ({
                    ...prev,
                    nome: e.target.value,
                  }))
                }
                placeholder="Ex: Arquivos Vermelhos"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">
                Descrição
              </label>
              <textarea
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs min-h-[140px]"
                value={worldForm.descricao}
                onChange={(e) =>
                  setWorldForm((prev) => ({
                    ...prev,
                    descricao: e.target.value,
                  }))
                }
                placeholder="Resumo do Mundo…"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setWorldForm((prev) => ({
                    ...prev,
                    has_episodes: !prev.has_episodes,
                  }))
                }
                className={`h-4 px-2 rounded border text-[11px] ${
                  worldForm.has_episodes
                    ? "border-emerald-400 text-emerald-300 bg-emerald-400/10"
                    : "border-neutral-700 text-neutral-400 bg-black/40"
                }`}
              >
                Este mundo possui episódios
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancelWorldForm}
                className="px-3 py-1 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
                disabled={isSavingWorld}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingWorld}
                className="px-3 py-1 text-[11px] rounded bg-emerald-500 text-black font-medium hover:bg-emerald-400 disabled:opacity-60"
              >
                {isSavingWorld ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modais de leitura – Ficha */}
      {fichaViewModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-auto border border-neutral-800 rounded-lg p-4 bg-neutral-950/95 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] text-neutral-400">
                Ficha – visão geral
              </div>
              <button
                type="button"
                onClick={() => setFichaViewModal(null)}
                className="text-[11px] text-neutral-500 hover:text-neutral-200"
              >
                fechar
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] text-neutral-500">Título</div>
              <div className="text-sm text-neutral-100 font-medium">
                {fichaViewModal.titulo}
              </div>
            </div>

            {fichaViewModal.tipo && (
              <div className="space-y-1">
                <div className="text-[11px] text-neutral-500">Tipo</div>
                <div className="text-[12px] text-neutral-200">
                  {fichaViewModal.tipo}
                </div>
              </div>
            )}

            {fichaViewModal.slug && (
              <div className="space-y-1">
                <div className="text-[11px] text-neutral-500">Slug</div>
                <div className="text-[12px] text-neutral-200">
                  {fichaViewModal.slug}
                </div>
              </div>
            )}

            {fichaViewModal.resumo && (
              <div className="space-y-1">
                <div className="text-[11px] text-neutral-500">Resumo</div>
                <div className="text-[12px] text-neutral-200 whitespace-pre-line">
                  {fichaViewModal.resumo}
                </div>
              </div>
            )}

            {fichaViewModal.imagem_url && (
              <div className="space-y-1">
                <div className="text-[11px] text-neutral-500">Imagem</div>
                <div className="border border-neutral-800 rounded-md overflow-hidden bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fichaViewModal.imagem_url}
                    alt={fichaViewModal.titulo || "imagem da ficha"}
                    className="w-full max-h-80 object-contain"
                  />
                </div>
              </div>
            )}

            {fichaViewModal.conteudo && (
              <div className="space-y-1">
                <div className="text-[11px] text-neutral-500">
                  Conteúdo
                </div>
                <div className="text-[12px] text-neutral-200 whitespace-pre-line">
                  {fichaViewModal.conteudo}
                </div>
              </div>
            )}

            {fichaViewModal.tags && (
              <div className="space-y-1">
                <div className="text-[11px] text-neutral-500">Tags</div>
                <div className="text-[12px] text-neutral-200">
                  {fichaViewModal.tags}
                </div>
              </div>
            )}

            {fichaViewModal.aparece_em && (
              <div className="space-y-1">
                <div className="text-[11px] text-neutral-500">
                  Aparece em
                </div>
                <div className="text-[12px] text-neutral-200 whitespace-pre-line">
                  {fichaViewModal.aparece_em}
                </div>
              </div>
            )}

            {selectedFichaId === fichaViewModal.id && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-neutral-500">Códigos</div>
                  <button
                    type="button"
                    onClick={startCreateCode}
                    className="text-[11px] px-2 py-1 rounded-full border border-neutral-700 hover:border-emerald-500 hover:text-emerald-300 transition-colors"
                  >
                    + Novo código
                  </button>
                </div>
                {!codes.length && (
                  <div className="text-[11px] text-neutral-500 mt-1">
                    Nenhum código cadastrado para esta ficha.
                  </div>
                )}
                {codes.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {codes.map((code) => (
                      <div
                        key={code.id}
                        className="border border-neutral-800 rounded-md px-2 py-1 text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-neutral-100">
                              {code.code}
                            </div>
                            {code.label && (
                              <div className="text-[10px] text-neutral-500">
                                {code.label}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}


            {(fichaViewModal.ano_diegese ||
              fichaViewModal.ordem_cronologica) && (
              <div className="grid grid-cols-2 gap-3">
                {fichaViewModal.ano_diegese && (
                  <div className="space-y-1">
                    <div className="text-[11px] text-neutral-500">
                      Ano da diegese
                    </div>
                    <div className="text-[12px] text-neutral-200">
                      {fichaViewModal.ano_diegese}
                    </div>
                  </div>
                )}
                {fichaViewModal.ordem_cronologica && (
                  <div className="space-y-1">
                    <div className="text-[11px] text-neutral-500">
                      Ordem cronológica
                    </div>
                    <div className="text-[12px] text-neutral-200">
                      {fichaViewModal.ordem_cronologica}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFichaViewModal(null)}
                className="px-3 py-1 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  startEditFicha(fichaViewModal);
                  setFichaViewModal(null);
                }}
                className="px-3 py-1 text-[11px] rounded bg-emerald-500 text-black font-medium hover:bg-emerald-400"
              >
                Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modais de edição – Mundo */}
      {worldFormMode !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <form
            onSubmit={handleSaveWorld}
            className="w-full max-w-md max-h-[90vh] overflow-auto border border-neutral-800 rounded-lg p-4 bg-neutral-950/95 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-neutral-400">
                {worldFormMode === "create" ? "Novo Mundo" : "Editar Mundo"}
              </div>
              <button
                type="button"
                onClick={cancelWorldForm}
                className="text-[11px] text-neutral-500 hover:text-neutral-200"
              >
                fechar
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">Nome</label>
              <input
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={worldForm.nome}
                onChange={(e) =>
                  setWorldForm((prev) => ({
                    ...prev,
                    nome: e.target.value,
                  }))
                }
                placeholder="Ex: Arquivos Vermelhos"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">
                Descrição
              </label>
              <textarea
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs min-h-[140px]"
                value={worldForm.descricao}
                onChange={(e) =>
                  setWorldForm((prev) => ({
                    ...prev,
                    descricao: e.target.value,
                  }))
                }
                placeholder="Resumo do Mundo…"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setWorldForm((prev) => ({
                    ...prev,
                    has_episodes: !prev.has_episodes,
                  }))
                }
                className={`h-4 px-2 rounded border text-[11px] ${
                  worldForm.has_episodes
                    ? "border-emerald-400 text-emerald-300 bg-emerald-400/10"
                    : "border-neutral-700 text-neutral-400 bg-black/40"
                }`}
              >
                Este mundo possui episódios
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancelWorldForm}
                className="px-3 py-1 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
                disabled={isSavingWorld}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingWorld}
                className="px-3 py-1 text-[11px] rounded bg-emerald-500 text-black font-medium hover:bg-emerald-400 disabled:opacity-60"
              >
                {isSavingWorld ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modais de edição – Ficha */}
      {fichaFormMode !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <form
            onSubmit={handleSaveFicha}
            className="w-full max-w-3xl max-h-[90vh] overflow-auto border border-neutral-800 rounded-lg p-4 bg-neutral-950/95 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-neutral-400">
                {fichaFormMode === "create" ? "Nova Ficha" : "Editar Ficha"}
              </div>
              <button
                type="button"
                onClick={cancelFichaForm}
                className="text-[11px] text-neutral-500 hover:text-neutral-200"
              >
                fechar
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">Título</label>
              <input
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={fichaForm.titulo}
                onChange={(e) =>
                  setFichaForm((prev) => ({
                    ...prev,
                    titulo: e.target.value,
                  }))
                }
                placeholder="Ex: Delegada Cíntia"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-neutral-500">
                  Slug (opcional)
                </label>
                <input
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                  value={fichaForm.slug}
                  onChange={(e) =>
                    setFichaForm((prev) => ({
                      ...prev,
                      slug: e.target.value,
                    }))
                  }
                  placeholder="delegada-cintia, aris-042-corredor"
                />
              </div>
              
<div className="w-48 space-y-1">
                <label className="text-[11px] text-neutral-500">
                  Tipo (categoria)
                </label>
   
            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">Código da ficha</label>
              <input
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={fichaForm.codigo}
                onChange={(e) =>
                  setFichaForm((prev) => ({
                    ...prev,
                    codigo: e.target.value,
                  }))
                }
                placeholder="Deixe em branco para usar o código gerado automaticamente (ex: AV7-PS3)…"
              />
              <p className="text-[10px] text-neutral-500 mt-0.5">
                A Lore Machine pode gerar esse código automaticamente com base no Mundo, episódio e tipo.
                Aqui você pode ajustar manualmente se precisar.
              </p>
            </div>
             <select
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                  value={fichaForm.tipo}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "__novo__") {
                      const novo = window.prompt(
                        "Digite o novo tipo/categoria (ex: personagem, local, veículo…):"
                      );
                      if (novo && novo.trim()) {
                        const normalized = novo.trim().toLowerCase();
                        setFichaForm((prev) => ({
                          ...prev,
                          tipo: normalized,
                        }));
                      }
                    } else {
                      setFichaForm((prev) => ({
                        ...prev,
                        tipo: value,
                      }));
                    }
                  }}
                >
                  <option value="">Selecione um tipo…</option>
                  {dynamicTipos.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="__novo__">+ Novo tipo…</option>
                </select>
                <p className="text-[10px] text-neutral-500 mt-0.5">
                  Escolha um tipo existente ou crie um novo (ex: &quot;veiculo&quot;).
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">Resumo</label>
              <textarea
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs min-h-[60px]"
                value={fichaForm.resumo}
  onChange={(e) =>
                  setFichaForm((prev) => ({
                    ...prev,
                    resumo: e.target.value,
                  }))
                }
                placeholder="Resumo curto da ficha…"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">
                Conteúdo
              </label>
              <textarea
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs min-h-[120px]"
                value={fichaForm.conteudo}
                onChange={(e) =>
                  setFichaForm((prev) => ({
                    ...prev,
                    conteudo: e.target.value,
                  }))
                }
                placeholder="Texto mais longo da ficha…"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">Tags</label>
              <input
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={fichaForm.tags}
                onChange={(e) =>
                  setFichaForm((prev) => ({
                    ...prev,
                    tags: e.target.value,
                  }))
                }
                placeholder="separe por vírgulas ou espaço, como preferir"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">
                Imagem (URL)
              </label>
              <input
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={fichaForm.imagem_url}
                onChange={(e) =>
                  setFichaForm((prev) => ({
                    ...prev,
                    imagem_url: e.target.value,
                  }))
                }
                placeholder="https://… (link de imagem)"
              />
              <p className="text-[10px] text-neutral-500 mt-0.5">
                Por enquanto, cole aqui o link direto da imagem (pode ser do Supabase Storage, CDN, etc.).
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">
                Aparece em
              </label>
              <input
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={fichaForm.aparece_em}
                onChange={(e) =>
                  setFichaForm((prev) => ({
                    ...prev,
                    aparece_em: e.target.value,
                  }))
                }
                placeholder="ex: AV Ep.1; A Sala – Experimento 3…"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500">
                  Ano da diegese
                </label>
                <input
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                  value={fichaForm.ano_diegese}
                  onChange={(e) =>
                    setFichaForm((prev) => ({
                      ...prev,
                      ano_diegese: e.target.value,
                    }))
                  }
                  placeholder="ex: 1993"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500">
                  Ordem cronológica
                </label>
                <input
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                  value={fichaForm.ordem_cronologica}
                  onChange={(e) =>
                    setFichaForm((prev) => ({
                      ...prev,
                      ordem_cronologica: e.target.value,
                    }))
                  }
                  placeholder="ex: 10, 20, 30…"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancelFichaForm}
                disabled={isSavingFicha}
                className="px-3 py-1 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingFicha}
                className="px-3 py-1 text-[11px] rounded bg-emerald-500 text-black font-medium hover:bg-emerald-400 disabled:opacity-60"
              >
                {isSavingFicha ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modais de edição – Código */}
      {codeFormMode !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <form
            onSubmit={handleSaveCode}
            className="w-full max-w-md max-h-[90vh] overflow-auto border border-neutral-800 rounded-lg p-4 bg-neutral-950/95 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-neutral-400">
                {codeFormMode === "create" ? "Novo Código" : "Editar Código"}
              </div>
              <button
                type="button"
                onClick={cancelCodeForm}
                className="text-[11px] text-neutral-500 hover:text-neutral-200"
              >
                fechar
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">Código</label>
              <input
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={codeForm.code}
                onChange={(e) =>
                  setCodeForm((prev) => ({
                    ...prev,
                    code: e.target.value,
                  }))
                }
                placeholder="Deixe em branco para gerar automaticamente…"
              />
              <p className="text-[10px] text-neutral-500 mt-0.5">
                Se você deixar vazio e preencher o Episódio, a Lore Machine gera
                algo como AV7-PS3 automaticamente.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">
                Episódio (para geração automática)
              </label>
              <input
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={codeForm.episode}
                onChange={(e) =>
                  setCodeForm((prev) => ({
                    ...prev,
                    episode: e.target.value,
                  }))
                }
                placeholder="ex: 7"
              />
              <p className="text-[10px] text-neutral-500 mt-0.5">
                Usado para gerar o código no formato AV7-PS3. Você também pode
                ignorar e escrever o código manualmente.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">
                Rótulo (opcional)
              </label>
              <input
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={codeForm.label}
                onChange={(e) =>
                  setCodeForm((prev) => ({
                    ...prev,
                    label: e.target.value,
                  }))
                }
                placeholder="Corredor – VHS 1993…"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-neutral-500">
                Descrição (opcional)
              </label>
              <textarea
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs min-h-[60px]"
                value={codeForm.description}
                onChange={(e) =>
                  setCodeForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Mais detalhes sobre onde esse código aparece…"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancelCodeForm}
                disabled={isSavingCode}
                className="px-3 py-1 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingCode}
                className="px-3 py-1 text-[11px] rounded bg-emerald-500 text-black font-medium hover:bg-emerald-500 disabled:opacity-60"
              >
                {isSavingCode ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
