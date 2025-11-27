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

async function compressImage(file: File): Promise<File> {
  return file;
}

function LoreAdminContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [view, setView] = useState<ViewState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string|null>(null); // NEW USER ID STATE
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
      setUserId(session.user.id); // GUARDAR USER ID
      setView("loggedIn");
    };
    checkSession();
  }, []);

  // Efeito separado para carregar dados apenas quando tiver userId
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
        // loadUniverses() será chamado pelo useEffect acima
    }
  }
  async function handleLogout() { await supabaseBrowser.auth.signOut(); setView("loggedOut"); setEmail(""); setPassword(""); setUserId(null); }

  // --- DATA LOADERS ---
  const fetchAllData = useCallback(async (uniId: string, currentWorldId: string | null) => {
    if (!uniId || !userId) return; // Segurança extra
    setIsLoadingData(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('universeId', uniId);
      
      const res = await fetch(`/api/catalog?${params.toString()}`, {
         headers: { 'x-user-id': userId } // HEADER IMPORTANTE
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Erro de rede desconhecido' }));
        throw new Error(errorData.error || `Falha ao carregar dados (Status: ${res.status})`);
      }
      
      const data = await res.json();

      const loadedWorlds = (data.worlds || []) as World[];
      const loadedFichas = (data.entities || []) as FichaFull[];
      
      setWorlds(loadedWorlds);
      setFichas(loadedFichas);

      let effectiveWorldId = currentWorldId;
      const urlWorld = searchParams.get("world");
      
      if (urlWorld && loadedWorlds.some(w => w.id === urlWorld)) {
        effectiveWorldId = urlWorld;
      } else if (effectiveWorldId && !loadedWorlds.some(w => w.id === effectiveWorldId)) {
        effectiveWorldId = null; 
      }
      
      setSelectedWorldId(effectiveWorldId);

      const urlFicha = searchParams.get("ficha");
      if (urlFicha && loadedFichas.some(f => f.id === urlFicha)) {
        setSelectedFichaId(urlFicha);
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
  }, [searchParams, userId]);


  async function loadUniverses() {
    if(!userId) return;
    setIsLoadingData(true);
    // Aqui usamos o cliente browser, que já respeita RLS automaticamente (pois tem sessão)
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
          await fetchAllData(initialUniId, searchParams.get("world"));
      }
    }
    setIsLoadingData(false);
  }

  async function loadDetails(fichaId: string) {
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
    fetchAllData(id, null); 
  }
  function handleSelectWorld(id: string | null) {
    setSelectedWorldId(id);
    setSelectedFichaId(null);
    setSelectedEpisodeFilter("");
    updateUrl(selectedUniverseId, id, null);
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
    if(selectedUniverseId) fetchAllData(selectedUniverseId, selectedWorldId); 
  }
  
  async function handleDeleteWorld(id: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!confirm("ATENÇÃO: Deletar um mundo também deletará TODAS as fichas, códigos e relações vinculadas a ele. Esta ação é irreversível.")) return;
    
    setError(null);

    try {
      // Exclusão em cascata manual para garantir limpeza
      const { data: fichasData } = await supabaseBrowser.from("fichas").select("id").eq("world_id", id);
      const fichaIds = fichasData?.map(f => f.id) || [];
      
      if (fichaIds.length > 0) {
        await supabaseBrowser.from("codes").delete().in("ficha_id", fichaIds);
        await supabaseBrowser.from("lore_relations").delete().or(`source_ficha_id.in.(${fichaIds.join(',')}),target_ficha_id.in.(${fichaIds.join(',')})`);
      }
      
      await supabaseBrowser.from("fichas").delete().eq("world_id", id);
      await supabaseBrowser.from("worlds").delete().eq("id", id);

      if (selectedWorldId === id) setSelectedWorldId(null);
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
    await fetchAllData(selectedUniverseId!, currentWorld ? currentWorld.id : null); 
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

  const filteredFichas = useMemo(() => {
    let list = fichas;

    if (selectedWorldId) {
        list = list.filter(f => f.world_id === selectedWorldId);
    }
    
    if (fichaFilterTipos.length > 0) {
        list = list.filter(f => fichaFilterTipos.includes(f.tipo));
    }
    
    if (selectedEpisodeFilter) {
       list = list.filter(f => {
          if (f.episodio === selectedEpisodeFilter) return true;
          const codeEp = f.codigo?.match(/[A-Z]+(\d+)-/)?.[1];
          return codeEp === selectedEpisodeFilter;
       });
    }

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
  const selectedWorldData = worlds.find(w => w.id === selectedWorldId); 
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

      {/* MODAL UNIVERSO */}
      {universeFormMode !== 'idle' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <form onSubmit={e => { e.preventDefault(); saveUniverse(); }} className="bg-zinc-950 border border-zinc-800 p-6 rounded w-96">
            <h3 className="text-white font-bold mb-4">{universeFormMode === 'create' ? 'Novo Universo' : 'Editar Universo'}</h3>
            <input className="w-full bg-black border border-zinc-700 rounded p-2 mb-2 text-white text-xs" placeholder="Nome" value={universeForm.nome} onChange={e=>setUniverseForm({...universeForm, nome: e.target.value})} />
            <textarea className="w-full bg-black border border-zinc-700 rounded p-2 mb-4 text-white h-24 text-xs" placeholder="Descrição" value={universeForm.descricao || ""} onChange={e=>setUniverseForm({...universeForm, descricao: e.target.value})} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setUniverseFormMode('idle')} className="text-zinc-400 text-xs">Cancelar</button>
              <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded text-xs font-bold">Salvar</button>
            </div>
          </form>
        </div>
      )}
      
      {/* MODAL DE EDIÇÃO DE FICHA E MUNDO... */}
      {/* ... (Resto dos modais, igual ao código anterior) ... */}
      {/* MODAL DE EDIÇÃO DE FICHA */}
      {fichaFormMode !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <form onSubmit={handleSaveFicha} className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 p-6 rounded-lg max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">Editar Ficha</h2>
            <div className="grid gap-4">
              
              {/* SELEÇÃO DE MUNDO (NOVO) */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-zinc-500">Mundo de Origem</label>
                <select 
                  className="w-full bg-black border border-zinc-800 p-2 text-xs rounded text-white focus:border-emerald-500"
                  value={fichaForm.world_id || ""}
                  onChange={(e) => {
                    if (e.target.value === "create_new_world") {
                      startCreateWorld();
                    } else {
                      setFichaForm({ ...fichaForm, world_id: e.target.value });
                    }
                  }}
                >
                  {/* Mundo Raiz (Universo Global) */}
                  {(() => {
                     const rootWorld = worlds.find(w => w.is_root);
                     return rootWorld ? (
                      <option value={rootWorld.id} className="font-bold bg-zinc-900">
                        ✨ {rootWorld.nome} (Global)
                      </option>
                     ) : null;
                  })()}
                  <option disabled>──────────</option>
                  {/* Outros Mundos */}
                  {worlds.filter(w => !w.is_root).map(w => (
                    <option key={w.id} value={w.id}>{w.nome}</option>
                  ))}
                  <option disabled>──────────</option>
                  <option value="create_new_world" className="text-emerald-400">+ Novo Mundo...</option>
                </select>
                <p className="text-[9px] text-zinc-500">Defina onde esta ficha existe primariamente. Use "Global" para entidades que existem em todos os mundos.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase text-zinc-500">Tipo</label>
                <select className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={LORE_TYPES.some(t => t.value === fichaForm.tipo) ? fichaForm.tipo : "novo"} onChange={(e) => { const val = e.target.value; if (val === "novo") { const custom = prompt("Digite o nome da nova categoria:"); if (custom) setFichaForm({...fichaForm, tipo: custom.toLowerCase().trim()}); } else { setFichaForm({...fichaForm, tipo: val}); } }}>
                  {LORE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  {!LORE_TYPES.some(t => t.value === fichaForm.tipo) && <option value={fichaForm.tipo}>{fichaForm.tipo} (Atual)</option>}
                  <option value="novo">+ Nova Categoria...</option>
                </select>
              </div>
              <div><label className="text-[10px] uppercase text-zinc-500">Título</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.titulo || ""} onChange={e=>setFichaForm({...fichaForm, titulo: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                 <div><label className="text-[10px] uppercase text-zinc-500">Slug</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.slug || ""} onChange={e=>setFichaForm({...fichaForm, slug: e.target.value})} /></div>
                 <div><label className="text-[10px] uppercase text-zinc-500">Ano Diegese</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.ano_diegese || ""} onChange={e=>setFichaForm({...fichaForm, ano_diegese: e.target.value})} /></div>
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-zinc-500">Imagem da Ficha</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageUpload} 
                    disabled={isUploadingImage}
                    className="w-full bg-black border border-zinc-800 p-2 text-xs rounded text-zinc-400"
                  />
                  {isUploadingImage && <span className="text-xs text-emerald-500 animate-pulse">Enviando...</span>}
                </div>
                {fichaForm.imagem_url && (
                  <div className="mt-2 p-1 border border-zinc-800 rounded bg-black/50 w-24 h-24 flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fichaForm.imagem_url} alt="" className="max-w-full max-h-full object-contain" />
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="text-[10px] uppercase text-zinc-500">Resumo</label>
                <textarea className="w-full bg-black border border-zinc-800 p-2 text-xs rounded h-20" value={fichaForm.resumo || ""} onChange={(e) => handleTextareaChange(e, "resumo")} />
                {activeTextarea === "resumo" && filteredMentions.length > 0 && (
                  <div className="absolute left-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-50">{filteredMentions.map(sug => (<button key={sug.id} type="button" onClick={() => insertMention(sug)} className="block w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-300">{sug.titulo} <span className="text-zinc-500 text-[9px]">({sug.tipo})</span></button>))}</div>
                )}
              </div>
              <div className="relative">
                <label className="text-[10px] uppercase text-zinc-500">Conteúdo</label>
                <textarea className="w-full bg-black border border-zinc-800 p-2 text-xs rounded h-40 font-mono leading-relaxed" value={fichaForm.conteudo || ""} onChange={(e) => handleTextareaChange(e, "conteudo")} />
                {activeTextarea === "conteudo" && filteredMentions.length > 0 && (
                  <div className="absolute left-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-50">{filteredMentions.map(sug => (<button key={sug.id} type="button" onClick={() => insertMention(sug)} className="block w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 text-zinc-300">{sug.titulo} <span className="text-zinc-500 text-[9px]">({sug.tipo})</span></button>))}</div>
                )}
              </div>
              {fichaForm.tipo === 'evento' && (
                <div className="p-3 bg-zinc-900/50 rounded border border-emerald-500/30 space-y-3 mt-2 border-l-4 border-l-emerald-500">
                   <div className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold">Dados da Timeline</div>
                   <div><label className="text-[10px] uppercase text-zinc-500">Descrição da Data</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.descricao_data || ''} onChange={e=>setFichaForm({...fichaForm, descricao_data: e.target.value})} /></div>
                   <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-[10px] uppercase text-zinc-500">Data Início</label><input type="date" className="w-full bg-black border border-zinc-800 p-2 text-xs rounded text-white" value={fichaForm.data_inicio || ''} onChange={e=>setFichaForm({...fichaForm, data_inicio: e.target.value})} /></div>
                      <div><label className="text-[10px] uppercase text-zinc-500">Data Fim</label><input type="date" className="w-full bg-black border border-zinc-800 p-2 text-xs rounded text-white" value={fichaForm.data_fim || ''} onChange={e=>setFichaForm({...fichaForm, data_fim: e.target.value})} /></div>
                   </div>
                   <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-[10px] uppercase text-zinc-500">Granularidade</label><select className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.granularidade_data || 'vago'} onChange={e=>setFichaForm({...fichaForm, granularidade_data: e.target.value})}>{GRANULARIDADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
                      <div><label className="text-[10px] uppercase text-zinc-500">Camada</label><select className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.camada_temporal || 'linha_principal'} onChange={e=>setFichaForm({...fichaForm, camada_temporal: e.target.value})}>{CAMADAS_TEMPORAIS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                   </div>
                </div>
              )}
              <div><label className="text-[10px] uppercase text-zinc-500">Tags</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.tags || ""} onChange={e=>setFichaForm({...fichaForm, tags: e.target.value})} /></div>
              <div><label className="text-[10px] uppercase text-zinc-500">Aparece Em</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={fichaForm.aparece_em || ""} onChange={e=>setFichaForm({...fichaForm, aparece_em: e.target.value})} /></div>
              <div><label className="text-[10px] uppercase text-zinc-500">Código (Opcional)</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded font-mono" value={fichaForm.codigo || ""} onChange={e=>setFichaForm({...fichaForm, codigo: e.target.value})} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
               <button type="button" onClick={checkConsistency} className="px-4 py-2 rounded text-xs font-bold border border-purple-500 text-purple-400 hover:bg-purple-900/20">🕵️ Verificar Coerência (Urizen)</button>
               <button type="button" onClick={cancelFichaForm} className="px-4 py-2 rounded text-xs text-zinc-400 hover:bg-zinc-900">Cancelar</button>
               <button type="submit" disabled={isUploadingImage} className="px-4 py-2 rounded bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{isSavingFicha ? "Salvando..." : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}
      
      {/* MODAL MUNDO */}
      {worldFormMode !== "idle" && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"><form onSubmit={handleSaveWorld} className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-lg p-6 shadow-2xl"><h2 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">{worldFormMode === 'create' ? 'Novo Mundo' : 'Editar Mundo'}</h2><div className="space-y-3"><div><label className="text-[10px] uppercase text-zinc-500">Nome</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={worldForm.nome || ""} onChange={e=>setWorldForm({...worldForm, nome: e.target.value})} /></div><div><label className="text-[10px] uppercase text-zinc-500">Descrição</label><textarea className="w-full bg-black border border-zinc-800 p-2 text-xs rounded h-20" value={worldForm.descricao || ""} onChange={e=>setWorldForm({...worldForm, descricao: e.target.value})} /></div></div><div className="flex justify-end gap-2 mt-4"><button type="button" onClick={cancelWorldForm} className="px-3 py-1.5 rounded border border-zinc-700 text-xs hover:bg-zinc-900">Cancelar</button><button type="submit" className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-medium">Salvar</button></div></form></div>)}
      
      {/* MODAL CÓDIGO */}
      {codeFormMode !== "idle" && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"><form onSubmit={handleSaveCode} className="w-full max-w-md bg-zinc-950 border border-zinc-800 p-6 rounded-lg shadow-2xl"><div className="flex justify-between mb-4"><h2 className="text-sm font-bold text-white uppercase tracking-widest">{codeFormMode === 'create' ? 'Novo Código' : 'Editar Código'}</h2><button type="button" onClick={cancelCodeForm} className="text-xs text-zinc-500 hover:text-white">Fechar</button></div><div className="space-y-3"><div><label className="text-[10px] uppercase text-zinc-500">Código</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded font-mono" value={codeForm.code} onChange={e=>setCodeForm({...codeForm, code: e.target.value})} placeholder="AV1-PS01" /></div><div><label className="text-[10px] uppercase text-zinc-500">Rótulo</label><input className="w-full bg-black border border-zinc-800 p-2 text-xs rounded" value={codeForm.label} onChange={e=>setCodeForm({...codeForm, label: e.target.value})} placeholder="Opcional" /></div><div><label className="text-[10px] uppercase text-zinc-500">Descrição</label><textarea className="w-full bg-black border border-zinc-800 p-2 text-xs rounded h-16" value={codeForm.description} onChange={e=>setCodeForm({...codeForm, description: e.target.value})} placeholder="Mais detalhes sobre onde esse código aparece…" /></div></div><div className="flex justify-end gap-2 mt-4"><button type="button" onClick={cancelCodeForm} className="px-3 py-1.5 rounded border border-zinc-700 text-xs hover:bg-zinc-900">Cancelar</button><button type="submit" className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-medium">Salvar</button></div></form></div>)}
      {showReconcile && (<div className="fixed inset-0 z-50 bg-black flex flex-col"><div className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950"><h2 className="text-lg font-bold text-purple-400">⚡ Reconciliação</h2><button onClick={()=>setShowReconcile(false)} className="text-zinc-400 text-sm">Fechar</button></div><div className="flex flex-1 overflow-hidden"><aside className="w-80 border-r border-zinc-800 bg-zinc-950 p-4 overflow-y-auto">{reconcilePairs.map((pair, i)=>(<button key={i} onClick={()=>handleSelectReconcilePair(pair)} className="w-full text-left p-3 mb-2 rounded border border-zinc-800 hover:bg-zinc-900"><div className="text-xs font-bold text-zinc-300">{pair.titulo_a}</div><div className="text-[10px] text-zinc-500">vs</div><div className="text-xs font-bold text-zinc-300">{pair.titulo_b}</div></button>))}</aside><main className="flex-1 p-8 overflow-y-auto">{comparing && mergeDraft && (<div><div className="flex justify-between items-end mb-8 border-b border-zinc-800 pb-4"><div><h3 className="text-xl font-bold text-white">Resolvendo Conflito</h3></div><button onClick={()=>executeMerge(comparing.a.id, comparing.b.id)} className="bg-purple-600 text-white px-6 py-2 rounded text-sm font-bold">Confirmar Fusão</button></div><div className="grid gap-1">
      <FieldChoice label="Título" field="titulo" comparing={comparing} mergeDraft={mergeDraft} onSelect={handleMergeSelect} />
      <FieldChoice label="Tipo" field="tipo" comparing={comparing} mergeDraft={mergeDraft} onSelect={handleMergeSelect} />
      <FieldChoice label="Resumo" field="resumo" comparing={comparing} mergeDraft={mergeDraft} onSelect={handleMergeSelect} />
      <FieldChoice label="Conteúdo" field="conteudo" comparing={comparing} mergeDraft={mergeDraft} onSelect={handleMergeSelect} />
      </div></div>)}</main></div></div>)}
    </div>
  );
}

export default function LoreAdminPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center bg-black text-neutral-500">Carregando...</div>}>
      <LoreAdminContent />
    </Suspense>
  );
}

}

{
type: uploaded file
fileName: mizanzuk/antiverso-lore-machine/Mizanzuk-antiverso-lore-machine-490d0e7bc22f5ead87327842c2bfd089bb1a9b37/lib/supabaseBrowser.ts
fullContent:
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️ Erro Crítico: Variáveis de ambiente do Supabase não encontradas no navegador.");
}

// Exportação NOMEADA correta para evitar o erro "Element type is invalid"
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey);

}

Excelente notícia! Se o Catálogo (Lore-Admin) parou de mostrar o "lixo", significa que a API já está bloqueando acessos sem credenciais. Isso é ótimo.

Porém, como você observou, **"não aparecer nada"** no Admin pode ser porque a página do Admin (`/lore-admin`) ainda não está enviando a "carteirinha" (`x-user-id`) para a API, então a API recusa o pedido e a lista volta vazia.

Para finalizar a segurança e garantir que **Urizen/Urthona** (o Chat) e o **Admin** funcionem apenas com os seus dados, precisamos atualizar mais 3 arquivos cruciais.

Aqui estão os códigos para finalizar a blindagem do sistema:

### 1. Atualizar `lib/rag.ts`
Este é o "cérebro" da busca. Vamos garantir que ele só busque fichas que tenham o seu `user_id`.

```typescript
import { supabaseAdmin } from "./supabase";

const STOPWORDS = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas",
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "e", "ou", "mas", "que", "se", "por", "para", "com", "sem",
  "quem", "qual", "quais", "onde", "como", "quando", "porquê", "porque",
  "é", "são", "foi", "foram", "era", "eram", "está", "estão",
  "me", "fale", "sobre", "diga", "explique", "mostre", "vida", "historia", "história",
  "existe", "existem", "sabe", "conhece"
]);

function extractMainKeyword(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^\w\sÀ-ÿ]/g, "") 
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w)); 
  
  // Retorna a primeira palavra-chave relevante ou o texto original se falhar
  return words.length > 0 ? words[0] : text.trim();
}

export type LoreChunk = {
  id: string;
  source: string;
  source_type: string;
  title: string;
  content: string;
  similarity: number;
};

export async function searchLore(
  query: string,
  options: { limit?: number; minSimilarity?: number; universeId?: string; userId?: string } = {}
): Promise<LoreChunk[]> {
  if (!supabaseAdmin) return [];

  const limit = options.limit ?? 8;
  const universeId = options.universeId;
  const userId = options.userId; // NOVO PARÂMETRO

  let results: LoreChunk[] = [];

  try {
      let worldIds: string[] = [];

      // 1. Se tiver Universo, busca mundos (COM FILTRO DE USUÁRIO SE DISPONÍVEL)
      if (universeId) {
        let wQuery = supabaseAdmin
            .from("worlds")
            .select("id")
            .eq("universe_id", universeId);
        
        if (userId) {
            wQuery = wQuery.eq("user_id", userId); // SEGURANÇA
        }

        const { data: worlds } = await wQuery;
        worldIds = worlds?.map(w => w.id) || [];
      }

      const term = extractMainKeyword(query);
      if (!term) return [];

      // 2. Construir Query nas Fichas
      let dbQuery = supabaseAdmin
        .from("fichas")
        .select("id, titulo, resumo, conteudo, tipo, tags, world_id");

      // FILTRO DE USUÁRIO (CRÍTICO)
      if (userId) {
        dbQuery = dbQuery.eq("user_id", userId);
      }

      if (worldIds.length > 0) {
        dbQuery = dbQuery.in("world_id", worldIds);
      }

      // Busca Textual
      dbQuery = dbQuery.or(`titulo.ilike.%${term}%,resumo.ilike.%${term}%,tags.ilike.%${term}%,conteudo.ilike.%${term}%`);
      dbQuery = dbQuery.limit(limit);

      const { data: matches, error } = await dbQuery;

      if (error) {
        console.error("Erro na busca de fichas:", error);
        return [];
      }

      if (matches && matches.length > 0) {
        results = matches.map((f: any) => ({
          id: f.id,
          source: "Ficha Viva",
          source_type: f.tipo,
          title: f.titulo,
          content: `[TIPO]: ${f.tipo}\n[RESUMO]: ${f.resumo || "N/A"}\n[TAGS]: ${f.tags}\n[CONTEÚDO]:\n${f.conteudo || ""}`,
          similarity: 1.0
        }));
      }

  } catch (err) {
    console.error("Erro fatal na busca:", err);
    return [];
  }

  return results;
}
