"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense, useRef, ChangeEvent } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { GRANULARIDADES } from "@/lib/dates/granularidade";
import { generatePrefix } from "@/lib/generate-prefix";

// --- CONSTANTES DE UI ---
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

const RELATION_TYPES = [
  { value: "relacionado_a", label: "Relacionado a" },
  { value: "amigo_de", label: "Amigo de" },
  { value: "inimigo_de", label: "Inimigo de" },
  { value: "localizado_em", label: "Localizado em" },
  { value: "mora_em", label: "Mora em" },
  { value: "nasceu_em", label: "Nasceu em" },
  { value: "participou_de", label: "Participou de" },
  { value: "protagonizado_por", label: "Protagonizado por" },
  { value: "menciona", label: "Menciona" },
  { value: "pai_de", label: "Pai de" },
  { value: "filho_de", label: "Filho de" },
  { value: "criador_de", label: "Criador de" },
  { value: "parte_de", label: "Parte de" },
  { value: "funcionario_de", label: "Funcionário de" }
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

const resizeImage = (file: File, maxWidth: number = 800, quality: number = 0.7): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error("Falha ao processar imagem"));
                }, 'image/jpeg', quality);
            };
        };
        reader.onerror = (error) => reject(error);
    });
};

function getWorldPrefix(world: World | undefined): string {
    if (!world) return "XX";
    const name = world.nome || "";
    const parts = name.split(" ");
    if (parts.length > 1) return parts.map(p => p[0]).join("").toUpperCase().slice(0, 3);
    return name.slice(0, 3).toUpperCase();
}

function getTypePrefix(tipo: string): string {
    return tipo.slice(0, 2).toUpperCase();
}

function LoreAdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Estados de Auth e View
  const [view, setView] = useState<ViewState>("loading");
  const [userId, setUserId] = useState<string|null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Tipos Dinâmicos
  const [loreTypes, setLoreTypes] = useState<{value: string, label: string}[]>([]);

  // Filtros
  const [fichasSearchTerm, setFichasSearchTerm] = useState("");
  const [fichaFilterTipos, setFichaFilterTipos] = useState<string[]>([]);
  const [selectedEpisodeFilter, setSelectedEpisodeFilter] = useState<string>("");

  // Forms
  const [universeFormMode, setUniverseFormMode] = useState<UniverseFormMode>("idle");
  const [universeForm, setUniverseForm] = useState({ id:"", nome:"", descricao:"" });
  const [worldFormMode, setWorldFormMode] = useState<WorldFormMode>("idle");
  const [worldForm, setWorldForm] = useState<Partial<World>>({});
  const [fichaFormMode, setFichaFormMode] = useState<FichaFormMode>("idle");
  const [fichaForm, setFichaForm] = useState<any>({});
  const [isSavingFicha, setIsSavingFicha] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  // Estados para gerenciamento de categorias
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showEditCategoriesModal, setShowEditCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [newCategoryPrefix, setNewCategoryPrefix] = useState("");
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [editingCategories, setEditingCategories] = useState<any[]>([]);

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Helpers de Wiki e Relações
  const [fichaTab, setFichaTab] = useState<"dados" | "relacoes">("dados");
  const [newRelTargetId, setNewRelTargetId] = useState("");
  const [newRelType, setNewRelType] = useState("relacionado_a");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState<number>(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // useEffect para fechar modais com tecla Esc
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fichaFormMode !== 'idle') setFichaFormMode('idle');
        if (showCategoryModal) setShowCategoryModal(false);
        if (showEditCategoriesModal) setShowEditCategoriesModal(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [fichaFormMode, showCategoryModal, showEditCategoriesModal]);

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

  // --- 2. LOAD INITIAL DATA ---
  useEffect(() => {
    if (userId && view === "loggedIn") {
        loadUniverses();
    }
  }, [userId, view]);

  // --- 3. SYNC URL WITH STATE ---
  useEffect(() => {
      if (universes.length === 0) return;

      const uniId = searchParams.get("universe");
      const worldId = searchParams.get("world");
      const fichaId = searchParams.get("ficha");

      if (uniId && uniId !== selectedUniverseId) {
          setSelectedUniverseId(uniId);
          fetchAllData(uniId, worldId, fichaId);
      } else if (uniId === selectedUniverseId) {
          if (worldId !== selectedWorldId) setSelectedWorldId(worldId);
          
          if (fichaId !== selectedFichaId) {
              setSelectedFichaId(fichaId);
              if (fichaId) loadFichaDetails(fichaId);
          }
      }
  }, [searchParams, universes, selectedUniverseId]);

  const updateUrl = (uniId: string | null, worldId: string | null, fichaId: string | null) => {
      const params = new URLSearchParams();
      if (uniId) params.set("universe", uniId);
      if (worldId) params.set("world", worldId);
      if (fichaId) params.set("ficha", fichaId);
      router.push(`/lore-admin?${params.toString()}`, { scroll: false });
  };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setIsSubmitting(true); setError(null);
    const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);
    if (error) setError(error.message);
    else if (data.session) { setUserId(data.session.user.id); setView("loggedIn"); }
  }
  async function handleLogout() { await supabaseBrowser.auth.signOut(); setView("loggedOut"); setUserId(null); }

  // --- GERENCIAMENTO DE CATEGORIAS ---
  const loadAllCategories = async () => {
    try {
      const response = await fetch("/api/lore/categories");
      if (!response.ok) throw new Error("Erro ao carregar categorias");
      const data = await response.json();
      setEditingCategories(data.categories || []);
    } catch (error) {
      console.error("Erro ao carregar categorias:", error);
    }
  };

  const handleCategoryNameChange = (name: string) => {
    setNewCategoryName(name);
    const prefix = generatePrefix(name);
    setNewCategoryPrefix(prefix);
  };

  const handleGenerateDescription = async () => {
    if (!newCategoryName) {
      alert("Digite o nome da categoria primeiro");
      return;
    }
    
    setIsGeneratingDescription(true);
    try {
      const response = await fetch("/api/lore/categories/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryName: newCategoryName,
          categorySlug: newCategoryName.toLowerCase().replace(/\s+/g, "_"),
        }),
      });
      
      if (!response.ok) throw new Error("Erro ao gerar descrição");
      
      const data = await response.json();
      setNewCategoryDescription(data.description);
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao gerar descrição");
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName) {
      alert("Nome da categoria é obrigatório");
      return;
    }
    
    try {
      const slug = newCategoryName.toLowerCase().replace(/\s+/g, "_");
      const response = await fetch("/api/lore/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          label: newCategoryName,
          description: newCategoryDescription || null,
          prefix: newCategoryPrefix || null,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao criar categoria");
      }
      
      alert("Categoria criada com sucesso!");
      setShowCategoryModal(false);
      setNewCategoryName("");
      setNewCategoryDescription("");
      setNewCategoryPrefix("");
      
      if (selectedUniverseId) {
        fetchAllData(selectedUniverseId, selectedWorldId, selectedFichaId);
      }
    } catch (error: any) {
      console.error("Erro:", error);
      alert(error.message || "Erro ao criar categoria");
    }
  };

  const handleUpdateCategory = async (category: any) => {
    try {
      const response = await fetch("/api/lore/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: category.slug,
          label: category.label,
          description: category.description,
          prefix: category.prefix,
        }),
      });
      
      if (!response.ok) throw new Error("Erro ao atualizar categoria");
      
      alert("Categoria atualizada com sucesso!");
      loadAllCategories();
      
      if (selectedUniverseId) {
        fetchAllData(selectedUniverseId, selectedWorldId, selectedFichaId);
      }
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao atualizar categoria");
    }
  };

  const handleDeleteCategory = async (slug: string) => {
    if (!confirm("Tem certeza? Isso vai deletar TODAS as fichas desta categoria!")) {
      return;
    }
    
    try {
      const response = await fetch(`/api/lore/categories?slug=${slug}`, {
        method: "DELETE",
      });
      
      if (!response.ok) throw new Error("Erro ao deletar categoria");
      
      alert("Categoria deletada com sucesso!");
      loadAllCategories();
      
      if (selectedUniverseId) {
        fetchAllData(selectedUniverseId, selectedWorldId, selectedFichaId);
      }
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao deletar categoria");
    }
  };


  // --- DATA FETCHING ---
  async function loadUniverses() {
    if(!userId) return;
    const { data } = await supabaseBrowser.from("universes").select("*").order("nome");
    if (data) {
      setUniverses(data);
      const urlUni = searchParams.get("universe");
      const initialUniId = (urlUni && data.find(u => u.id === urlUni)) ? urlUni : (data[0]?.id || null);
      setSelectedUniverseId(initialUniId);
      if(initialUniId) {
          fetchAllData(initialUniId, searchParams.get("world"), searchParams.get("ficha"));
      }
    }
  }

  const fetchAllData = useCallback(async (uniId: string, currentWorldId: string | null, currentFichaId: string | null = null) => {
    if (!uniId || !userId) return;
    setIsLoadingData(true);
    try {
      const params = new URLSearchParams();
      params.set('universeId', uniId);
      
      const res = await fetch(`/api/catalog?${params.toString()}`, {
         headers: { 'x-user-id': userId }
      });

      if (!res.ok) throw new Error("Falha ao carregar dados (401/500)");
      const data = await res.json();

      setWorlds(data.worlds || []);
      setFichas(data.entities || []);

      if (data.types && Array.isArray(data.types)) {
          setLoreTypes(data.types.map((t: any) => ({ value: t.id, label: t.label })));
      } else {
          setLoreTypes([
              { value: "personagem", label: "Personagem" },
              { value: "local", label: "Local" },
              { value: "evento", label: "Evento" },
              { value: "conceito", label: "Conceito" }
          ]);
      }

      let effectiveWorldId = currentWorldId;
      if (effectiveWorldId && !(data.worlds || []).some((w:World) => w.id === effectiveWorldId)) {
        effectiveWorldId = null;
      }
      setSelectedWorldId(effectiveWorldId);

      if (currentFichaId && (data.entities || []).some((f:FichaFull) => f.id === currentFichaId)) {
        setSelectedFichaId(currentFichaId);
        loadFichaDetails(currentFichaId);
      } else {
        setSelectedFichaId(null);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsLoadingData(false);
    }
  }, [userId]);

  const handleSelectUniverse = (id: string) => {
      updateUrl(id, null, null);
  };

  const handleSelectWorld = (id: string | null) => {
      updateUrl(selectedUniverseId, id, null);
  };

  const handleSelectFicha = (id: string) => {
      updateUrl(selectedUniverseId, selectedWorldId, id);
  };

  async function loadFichaDetails(fichaId: string) {
    const { data: cData } = await supabaseBrowser.from("codes").select("*").eq("ficha_id", fichaId).order("code");
    setCodes(cData || []);
    const { data: rData } = await supabaseBrowser.from("lore_relations")
      .select(`*, source:source_ficha_id(id, titulo, tipo), target:target_ficha_id(id, titulo, tipo)`)
      .or(`source_ficha_id.eq.${fichaId},target_ficha_id.eq.${fichaId}`);
    setRelations(rData || []);
  }

  // --- ACTIONS ---
  async function saveUniverse() {
    if (!universeForm.nome.trim()) return alert("Nome obrigatório");
    if (universeFormMode === "create") {
      const { data, error } = await supabaseBrowser.from("universes").insert({ nome: universeForm.nome, descricao: universeForm.descricao }).select().single();
      if (error) return alert("Erro: " + error.message);
      const rootId = universeForm.nome.toLowerCase().replace(/\s+/g, "_") + "_root_" + Date.now();
      await supabaseBrowser.from("worlds").insert({ id: rootId, nome: universeForm.nome, universe_id: data.id, is_root: true, tipo: "meta_universo", ordem: 0, has_episodes: false });
      loadUniverses();
    } else {
      await supabaseBrowser.from("universes").update({ nome: universeForm.nome, descricao: universeForm.descricao }).eq("id", universeForm.id);
      loadUniverses();
    }
    setUniverseFormMode("idle");
  }

  function startCreateWorld() { setWorldFormMode("create"); setWorldForm({ nome: "", descricao: "", has_episodes: true }); }
  async function handleSaveWorld(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUniverseId) return alert("Nenhum universo selecionado.");
    if (!worldForm.nome?.trim()) return alert("Nome obrigatório.");
    const payload: any = { nome: worldForm.nome, descricao: worldForm.descricao, has_episodes: worldForm.has_episodes, tipo: "mundo_ficcional", universe_id: selectedUniverseId };
    try {
      if (worldFormMode === 'create') {
         const slugId = worldForm.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "_") + "_" + Date.now();
         const { error } = await supabaseBrowser.from("worlds").insert([{ ...payload, id: slugId }]);
         if (error) throw error;
      } else {
         const { error } = await supabaseBrowser.from("worlds").update(payload).eq("id", worldForm.id);
         if (error) throw error;
      }
      setWorldFormMode("idle");
      await fetchAllData(selectedUniverseId, selectedWorldId);
    } catch (err: any) { alert("Erro: " + err.message); }
  }
  async function handleDeleteWorld(id: string, e?: React.MouseEvent) {
    if(e) e.stopPropagation();
    if(!confirm("Tem certeza? Isso apagará TODAS as fichas deste mundo.")) return;
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

  // --- FICHA ACTIONS ---
  function startCreateFicha() {
    if(!selectedUniverseId) return alert("Selecione um universo.");
    setFichaFormMode("create");
    setFichaTab("dados");
    setImagePreview(null);
    const rootWorld = worlds.find(w => w.is_root);
    const defaultWorld = selectedWorldId || rootWorld?.id || worlds[0]?.id;
    setFichaForm({ id: "", titulo: "", tipo: "conceito", world_id: defaultWorld, conteudo: "", resumo: "", tags: "", granularidade_data: "indefinido", camada_temporal: "linha_principal" });
  }

  // Atualiza código sugerido automaticamente
  useEffect(() => {
      if (fichaFormMode !== "idle" && fichaForm.world_id) {
          const world = worlds.find(w => w.id === fichaForm.world_id);
          if (!fichaForm.codigo || fichaForm.codigo.includes("AUTO")) {
              // Placeholder visual
          }
      }
  }, [fichaForm.world_id, fichaForm.episodio, fichaForm.tipo, worlds, fichaFormMode]);

  async function handleSaveFicha(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingFicha(true);
    try {
        if (!fichaForm.world_id) throw new Error("Selecione um Mundo.");
        if (!fichaForm.titulo?.trim()) throw new Error("Título obrigatório.");

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
            descricao_data: fichaForm.descricao_data || null,
            data_inicio: fichaForm.data_inicio || null,
            data_fim: fichaForm.data_fim || null,
            granularidade_data: fichaForm.granularidade_data || 'vago',
            camada_temporal: fichaForm.camada_temporal || 'linha_principal',
            episodio: fichaForm.episodio || null,
            codigo: fichaForm.codigo || null, 
            updated_at: new Date().toISOString(),
        };

        if (fichaFormMode === "create") {
            await supabaseBrowser.from("fichas").insert([payload]);
        } else {
            await supabaseBrowser.from("fichas").update(payload).eq("id", fichaForm.id);
        }

        setFichaFormMode("idle");
        await fetchAllData(selectedUniverseId!, selectedWorldId, fichaFormMode === 'create' ? null : fichaForm.id);
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

  async function handleDeleteImage(id: string) {
      if (!confirm("Apagar imagem desta ficha?")) return;
      try {
          const { error } = await supabaseBrowser.from("fichas").update({ imagem_url: null }).eq("id", id);
          if(error) throw error;
          const updatedFichas = fichas.map(f => f.id === id ? { ...f, imagem_url: null } : f);
          setFichas(updatedFichas);
          // Se a ficha estiver selecionada e o modal não estiver aberto, forçamos re-render
          if (selectedFichaId === id && fichaFormMode === 'idle') {
             setSelectedFichaId(null);
             setTimeout(() => setSelectedFichaId(id), 10);
          }
          // Se estiver no modal, limpamos o form
          if (fichaForm.id === id) {
             setFichaForm({...fichaForm, imagem_url: null});
             setImagePreview(null);
          }
      } catch(err: any) {
          alert("Erro ao apagar imagem: " + err.message);
      }
  }

  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    
    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);

    try {
        const resizedBlob = await resizeImage(file, 800, 0.7);
        const fileName = `${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
        const { data, error } = await supabaseBrowser.storage.from('images').upload(fileName, resizedBlob, { contentType: 'image/jpeg', upsert: true });
        if (error) {
            if (error.message.includes("not found") || error.message.includes("404")) throw new Error("Bucket 'images' não encontrado. Vá ao Supabase > Storage e crie um bucket público chamado 'images'.");
            throw error;
        }
        const { data: publicUrl } = supabaseBrowser.storage.from('images').getPublicUrl(fileName);
        setFichaForm((prev: any) => ({ ...prev, imagem_url: publicUrl.publicUrl }));
    } catch (err: any) {
        alert("Erro ao subir imagem: " + err.message);
        setImagePreview(null);
    } finally {
        setIsUploadingImage(false);
    }
  }

  async function handleAddRelation() {
      if (!newRelTargetId || !fichaForm.id) return;
      try {
          await supabaseBrowser.from("lore_relations").insert({
              source_ficha_id: fichaForm.id,
              target_ficha_id: newRelTargetId,
              tipo_relacao: newRelType,
              descricao: "Adicionado manualmente",
              user_id: userId
          });
          loadFichaDetails(fichaForm.id);
          setNewRelTargetId("");
      } catch (err: any) { alert("Erro: " + err.message); }
  }

  async function handleDeleteRelation(relId: string) {
      if(!confirm("Remover relação?")) return;
      await supabaseBrowser.from("lore_relations").delete().eq("id", relId);
      if(fichaForm.id) loadFichaDetails(fichaForm.id);
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      const selStart = e.target.selectionStart;
      setFichaForm({...fichaForm, conteudo: val});
      const textBeforeCursor = val.slice(0, selStart);
      const lastAt = textBeforeCursor.lastIndexOf("@");
      if (lastAt !== -1 && (lastAt === 0 || textBeforeCursor[lastAt-1] === ' ' || textBeforeCursor[lastAt-1] === '\n')) {
          const query = textBeforeCursor.slice(lastAt + 1);
          setMentionQuery(query);
          setMentionIndex(lastAt);
      } else {
          setMentionQuery(null);
      }
  };

  const insertMention = (fichaName: string) => {
      if (mentionIndex === -1) return;
      const before = fichaForm.conteudo.slice(0, mentionIndex);
      const after = fichaForm.conteudo.slice(textareaRef.current?.selectionStart || 0);
      const newText = `${before}${fichaName}${after}`;
      setFichaForm({...fichaForm, conteudo: newText});
      setMentionQuery(null);
      setTimeout(() => { if(textareaRef.current) { textareaRef.current.focus(); const p = mentionIndex + fichaName.length; textareaRef.current.setSelectionRange(p, p); } }, 50);
  };

  const mentionSuggestions = useMemo(() => {
      if (mentionQuery === null) return [];
      const q = mentionQuery.toLowerCase();
      return fichas.filter(f => f.titulo.toLowerCase().includes(q)).slice(0, 5);
  }, [mentionQuery, fichas]);

  // Filtros
  const availableEpisodes = useMemo(() => { const eps = new Set<string>(); fichas.forEach(f => { if (f.episodio && f.episodio !== "0") eps.add(f.episodio); if (!f.episodio && f.codigo) { const m = f.codigo.match(/[A-Z]+(\d+)-/); if (m) eps.add(m[1]); } }); return Array.from(eps).sort((a,b) => parseInt(a)-parseInt(b)); }, [fichas]);
  const filteredFichas = useMemo(() => { let list = fichas; if (selectedWorldId) list = list.filter(f => f.world_id === selectedWorldId); if (fichaFilterTipos.length > 0) list = list.filter(f => fichaFilterTipos.includes(f.tipo)); if (selectedEpisodeFilter) list = list.filter(f => f.episodio === selectedEpisodeFilter || f.codigo?.match(/[A-Z]+(\d+)-/)?.[1] === selectedEpisodeFilter); if (fichasSearchTerm.trim().length > 0) { const q = fichasSearchTerm.toLowerCase(); list = list.filter(f => (f.titulo||"").toLowerCase().includes(q) || (f.tags||"").toLowerCase().includes(q) || (f.resumo||"").toLowerCase().includes(q)); } return list; }, [fichas, selectedWorldId, fichaFilterTipos, selectedEpisodeFilter, fichasSearchTerm]);
  const renderWikiText = (text: string | null | undefined) => { 
      if (!text) return null; 
      const candidates = fichas.filter(f => f.id !== selectedFichaId && f.titulo).map(f => ({ id: f.id, titulo: f.titulo })); 
      
      const linkRegex = /(Documento:\s*)(.+?)(?=\n|$|\.)/g;
      
      if (candidates.length > 0) {
          candidates.sort((a, b) => b.titulo.length - a.titulo.length); 
          const pattern = new RegExp(`\\b(${candidates.map(c => escapeRegExp(c.titulo)).join("|")})\\b`, "gi"); 
          
          const parts = text.split(pattern); 
          return parts.map((part, i) => { 
              const match = candidates.find(c => c.titulo.toLowerCase() === part.toLowerCase()); 
              if (match) return <button key={i} onClick={() => handleSelectFicha(match.id)} className="text-emerald-400 hover:underline decoration-dotted decoration-emerald-600 font-medium">{part}</button>; 
              
              const linkParts = part.split(linkRegex);
              if (linkParts.length > 1) {
                  return <span key={i}>
                      {linkParts.map((subPart, j) => {
                          if (j % 3 === 2) {
                              const target = fichas.find(f => f.titulo.trim().toLowerCase() === subPart.trim().toLowerCase());
                              if (target) return <button key={`link-${j}`} onClick={() => handleSelectFicha(target.id)} className="text-blue-400 hover:underline">{subPart}</button>;
                              return subPart;
                          }
                          return subPart;
                      })}
                  </span>
              }

              return part; 
          }); 
      }
      return text; 
  };

  // Calcula episódios para o dropdown de edição
  const modalWorldEpisodes = useMemo(() => {
      if (!fichaForm.world_id) return [];
      const eps = new Set<string>();
      fichas.filter(f => f.world_id === fichaForm.world_id).forEach(f => { if(f.episodio) eps.add(f.episodio); });
      return Array.from(eps).sort((a,b) => parseInt(a)-parseInt(b));
  }, [fichaForm.world_id, fichas]);

  const selectedFicha = fichas.find(f => f.id === selectedFichaId);
  const currentUniverse = universes.find(u => u.id === selectedUniverseId);
  const childWorlds = worlds.filter(w => !w.is_root);
  const currentWorldHasEpisodes = selectedWorldId ? worlds.find(w => w.id === selectedWorldId)?.has_episodes : false;

  if (view === "loading") return <div className="min-h-screen bg-black text-neutral-500 flex items-center justify-center">Carregando...</div>;
  if (view === "loggedOut") return (
    <div className="min-h-screen bg-black flex items-center justify-center">
        <form onSubmit={handleLogin} className="p-8 border border-zinc-800 rounded bg-zinc-950">
            <h1 className="text-white mb-4">Login Admin</h1>
            <input className="block w-full mb-2 bg-black border border-zinc-700 p-2 text-white" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
            <input type="password" className="block w-full mb-4 bg-black border border-zinc-700 p-2 text-white" placeholder="Senha" value={password} onChange={e=>setPassword(e.target.value)} />
            <button className="bg-emerald-600 text-white px-4 py-2 w-full rounded">Entrar</button>
        </form>
    </div>
  );

  return (
    <div className="h-screen bg-black text-neutral-100 flex flex-col overflow-hidden font-sans">
      <header className="border-b border-neutral-900 px-4 py-2 flex items-center justify-between bg-zinc-950">
        <div className="flex items-center gap-4"><a href="/" className="text-[11px] text-neutral-300 hover:text-white">← Home</a><a href="/lore-upload" className="text-[11px] text-neutral-400 hover:text-white">Upload</a><a href="/lore-admin/timeline" className="text-[11px] text-neutral-400 hover:text-white">Timeline</a></div>
        <button onClick={handleLogout} className="text-[10px] border border-zinc-800 px-3 py-1 rounded hover:bg-zinc-900 text-zinc-400">Sair</button>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* SIDEBAR NAVIGATION */}
        <section className="w-64 border-r border-neutral-800 bg-neutral-950/50 flex flex-col min-h-0">
            <div className="p-4 border-b border-neutral-800">
                <label className="text-[9px] uppercase font-bold text-zinc-500 block mb-1">Universo Ativo</label>
                <div className="flex gap-1">
                    <select className="flex-1 bg-black border border-zinc-800 text-sm p-1.5 rounded text-white outline-none focus:border-emerald-500" value={selectedUniverseId || ""} onChange={(e) => { if(e.target.value === "__new__") { setUniverseForm({ id:"", nome:"", descricao:"" }); setUniverseFormMode("create"); } else { handleSelectUniverse(e.target.value); } }}>
                        {universes.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                        <option value="__new__" className="text-emerald-400">+ Novo Universo</option>
                    </select>
                    {currentUniverse && <button onClick={() => { setUniverseForm({...currentUniverse, descricao: currentUniverse.descricao||""}); setUniverseFormMode("edit"); }} className="px-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-400 hover:text-white">✎</button>}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                <button onClick={() => { handleSelectWorld(null); }} className={`w-full text-left p-2 rounded text-xs font-bold flex items-center gap-2 ${!selectedWorldId ? "bg-emerald-900/20 text-emerald-400 border border-emerald-500/30" : "text-zinc-400 hover:bg-zinc-900"}`}><span>🟢</span> Visão Geral (Tudo)</button>
                <div className="mt-4 mb-2 px-2 flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-zinc-600">Mundos</span><button onClick={startCreateWorld} className="text-[10px] bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-300 hover:border-emerald-500 hover:text-white">+</button></div>
                {childWorlds.map(w => ( <div key={w.id} className={`group flex items-center justify-between p-2 rounded cursor-pointer text-xs ${selectedWorldId === w.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"}`} onClick={() => handleSelectWorld(w.id)}><span className="truncate">{w.nome}</span><div className="hidden group-hover:flex gap-1"><button onClick={(e) => { e.stopPropagation(); setWorldForm(w); setWorldFormMode("edit"); }} className="px-1 text-[9px] bg-black border border-zinc-700 rounded text-zinc-300">✎</button><button onClick={(e) => handleDeleteWorld(w.id, e)} className="px-1 text-[9px] bg-red-900/30 border border-red-900 rounded text-red-400">×</button></div></div> ))}
            </div>
        </section>

        {/* LISTA DE FICHAS */}
        <section className="w-80 border-r border-neutral-800 bg-neutral-900/20 flex flex-col min-h-0">
             <div className="p-3 border-b border-neutral-800 flex justify-between items-center">
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">{selectedWorldId ? worlds.find(w=>w.id===selectedWorldId)?.nome : "Todas as Fichas"}</h2>
                <div className="flex gap-2">
                    <button onClick={() => { loadAllCategories(); setShowEditCategoriesModal(true); }} className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded font-medium border border-zinc-700">Editar Categorias</button>
                    <button onClick={startCreateFicha} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded font-medium">+ Ficha</button>
                </div>
             </div>
             <div className="p-2 space-y-2">
                <input placeholder="Buscar..." className="w-full bg-black border border-zinc-800 rounded p-1.5 text-xs text-white focus:border-emerald-500 outline-none" value={fichasSearchTerm} onChange={e => setFichasSearchTerm(e.target.value)} />
                {selectedWorldId && currentWorldHasEpisodes && availableEpisodes.length > 0 && (<div className="mb-2"><select className="w-full bg-black border border-zinc-800 rounded text-[10px] p-1 text-zinc-300 outline-none focus:border-emerald-500" value={selectedEpisodeFilter} onChange={(e) => setSelectedEpisodeFilter(e.target.value)}><option value="">Todos os Episódios</option>{availableEpisodes.map(ep => <option key={ep} value={ep}>Episódio {ep}</option>)}</select></div>)}
                <div className="flex flex-wrap gap-1 mb-2"><button onClick={() => setFichaFilterTipos([])} className={`px-2 py-0.5 rounded text-[9px] border ${fichaFilterTipos.length===0 ? "border-emerald-500 text-emerald-400" : "border-zinc-800 text-zinc-500"}`}>TODOS</button>
                    {loreTypes.map(t => ( <button key={t.value} onClick={() => setFichaFilterTipos(prev => prev.includes(t.value) ? prev.filter(x=>x!==t.value) : [...prev, t.value])} className={`px-2 py-0.5 whitespace-nowrap rounded text-[9px] border uppercase ${fichaFilterTipos.includes(t.value) ? "border-emerald-500 text-emerald-400" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}>{t.label}</button> ))}
                </div>
             </div>
             <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredFichas.map(f => ( 
                    <div key={f.id} onClick={() => handleSelectFicha(f.id)} className={`group relative p-2 rounded border cursor-pointer transition-all ${selectedFichaId === f.id ? "bg-emerald-900/20 border-emerald-500/50" : "bg-transparent border-zinc-800/50 hover:bg-zinc-900 hover:border-zinc-700"}`}>
                        <div className="flex justify-between items-start">
                            <div className="font-bold text-xs text-zinc-200">{f.titulo}</div>
                            <div className="text-[9px] uppercase tracking-wide text-zinc-500 group-hover:opacity-0 transition-opacity">{f.tipo}</div>
                        </div>
                        <div className="flex gap-2 mt-1">
                            {f.episodio && <span className="text-[9px] text-zinc-500">Ep. {f.episodio}</span>}
                        </div>
                        <div className="text-[10px] text-zinc-500 line-clamp-2 mt-1">{f.resumo}</div>
                        
                        {/* BOTÕES DE AÇÃO NA LISTA */}
                        <div className="absolute top-2 right-2 hidden group-hover:flex gap-2 bg-zinc-900/90 px-2 py-0.5 rounded shadow-lg border border-zinc-700">
                            <button onClick={(e) => { e.stopPropagation(); setFichaForm({...f}); setFichaFormMode("edit"); if(f.imagem_url) setImagePreview(f.imagem_url); }} className="text-zinc-400 hover:text-white transition text-[11px]" title="Editar">✎</button>
                            <button onClick={(e) => handleDeleteFicha(f.id, e)} className="text-zinc-400 hover:text-red-400 transition text-[13px]" title="Excluir">×</button>
                        </div>
                    </div> 
                ))}
             </div>
        </section>

        {/* DETALHES */}
        <section className="flex-1 bg-black flex flex-col min-h-0 overflow-y-auto">
            {selectedFichaId && selectedFicha ? (
                <div className="max-w-3xl mx-auto w-full p-8 pb-20">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <span className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold bg-emerald-900/10 px-2 py-1 rounded border border-emerald-900/30">{selectedFicha.tipo}</span>
                            <h1 className="text-3xl font-bold text-white mt-2 mb-1">{selectedFicha.titulo}</h1>
                            <div className="text-xs text-zinc-500 flex flex-wrap gap-3 items-center">
                                {selectedFicha.codigo && <span className="font-mono bg-zinc-900 px-1 rounded border border-zinc-800 text-emerald-500">{selectedFicha.codigo}</span>}
                                <span>{selectedFicha.slug}</span>
                                <span>•</span>
                                <span>{worlds.find(w => w.id === selectedFicha.world_id)?.nome}</span>
                            </div>
                        </div>
                        <button onClick={() => { setFichaForm({...selectedFicha}); setFichaFormMode("edit"); if(selectedFicha.imagem_url) setImagePreview(selectedFicha.imagem_url); loadFichaDetails(selectedFicha.id); }} className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1 rounded text-xs font-bold border border-zinc-700">Editar</button>
                    </div>
                    <div className="space-y-8">
                        
                        {/* IMAGEM COM BOTÕES DE AÇÃO */}
                        {selectedFicha.imagem_url && (
                            <div className="relative group rounded-lg border border-zinc-800 overflow-hidden bg-zinc-900/30 text-center">
                                <img src={selectedFicha.imagem_url} alt="" className="max-h-96 inline-block opacity-90 shadow-2xl object-contain" />
                                {/* Overlay com botões ao passar o mouse */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                    <button 
                                        onClick={() => { setFichaForm({...selectedFicha}); setFichaFormMode("edit"); setImagePreview(selectedFicha.imagem_url); }} 
                                        className="bg-white text-black text-xs font-bold px-4 py-2 rounded hover:bg-zinc-200"
                                    >
                                        Editar Imagem
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteImage(selectedFicha.id)} 
                                        className="bg-red-600 text-white text-xs font-bold px-4 py-2 rounded hover:bg-red-500"
                                    >
                                        Apagar
                                    </button>
                                </div>
                            </div>
                        )}

                        {selectedFicha.aparece_em && (
                            <div className="p-3 rounded border border-zinc-800 bg-zinc-900/30">
                                <h4 className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Aparece em:</h4>
                                <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                                    {renderWikiText(selectedFicha.aparece_em)}
                                </p>
                            </div>
                        )}

                        <div><h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Conteúdo</h3><div className="text-sm text-zinc-300 leading-loose whitespace-pre-wrap font-serif">{renderWikiText(selectedFicha.conteudo || selectedFicha.resumo)}</div></div>
                        <div className="grid grid-cols-2 gap-4 pt-6 border-t border-zinc-900">
                            <div><h4 className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Conexões</h4>{relations.map(rel => { const other = rel.source_ficha_id === selectedFicha.id ? rel.target : rel.source; return other ? (<div key={rel.id} className="text-xs py-1 border-b border-zinc-900 flex justify-between"><span className="text-zinc-400">{rel.tipo_relacao.replace(/_/g, " ")}</span><span className="text-emerald-500 cursor-pointer hover:underline" onClick={() => handleSelectFicha(other.id)}>{other.titulo}</span></div>) : null; })}</div>
                            <div><h4 className="text-[10px] uppercase font-bold text-zinc-500 mb-2">Dados</h4><div className="space-y-1"><div className="text-xs flex justify-between"><span className="text-zinc-500">Tags</span><span className="text-zinc-300 text-right">{selectedFicha.tags}</span></div></div></div>
                        </div>
                    </div>
                </div>
            ) : (<div className="h-full flex items-center justify-center text-zinc-600 text-xs">Selecione uma ficha.</div>)}
        </section>
      </main>

      {/* MODAL FICHA */}
      {fichaFormMode !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setFichaFormMode('idle')}>
            <form onSubmit={handleSaveFicha} onClick={(e) => e.stopPropagation()} className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg w-full max-w-4xl shadow-xl max-h-[90vh] overflow-y-auto flex flex-col">
                <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-2">
                    <div className="flex items-center gap-4">
                        <h3 className="text-white font-bold uppercase tracking-widest text-sm">{fichaFormMode === 'create' ? 'Nova Ficha' : 'Editar Ficha'}</h3>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setFichaTab("dados")} className={`text-xs px-3 py-1 rounded ${fichaTab === 'dados' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Dados</button>
                            {fichaFormMode === 'edit' && <button type="button" onClick={() => setFichaTab("relacoes")} className={`text-xs px-3 py-1 rounded ${fichaTab === 'relacoes' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Relações</button>}
                        </div>
                    </div>
                    <button type="button" onClick={() => setFichaFormMode('idle')} className="text-zinc-500 hover:text-white text-2xl leading-none font-light">&times;</button>
                </div>
                
                {fichaTab === 'dados' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="text-[10px] uppercase text-zinc-500 block mb-1">Mundo de Origem</label>
                                <select 
                                    className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white focus:border-emerald-500" 
                                    value={fichaForm.world_id || ""} 
                                    onChange={e => {
                                        setFichaForm({...fichaForm, world_id: e.target.value, codigo: ''}); 
                                    }}
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {worlds.map(w => <option key={w.id} value={w.id}>{w.nome} {w.is_root ? "(Global)" : ""}</option>)}
                                </select>
                            </div>
                            
                            {/* DROPDOWN INTELIGENTE DE EPISÓDIOS */}
                            <div>
                                <label className="text-[10px] uppercase text-zinc-500 block mb-1">Episódio</label>
                                <select 
                                    className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white" 
                                    value={fichaForm.episodio || ""} 
                                    onChange={e => {
                                        if(e.target.value === "NEW") {
                                            const n = prompt("Digite o número do novo episódio:");
                                            if(n) setFichaForm({...fichaForm, episodio: n, codigo: ''});
                                        } else {
                                            setFichaForm({...fichaForm, episodio: e.target.value, codigo: ''});
                                        }
                                    }}
                                    disabled={!fichaForm.world_id || !worlds.find(w => w.id === fichaForm.world_id)?.has_episodes}
                                >
                                    <option value="">Nenhum</option>
                                    {modalWorldEpisodes.map(ep => <option key={ep} value={ep}>Ep. {ep}</option>)}
                                    <option value="NEW" className="text-emerald-400 font-bold">+ Novo Episódio</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase text-zinc-500 block mb-1">Tipo</label>
                                <select className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white" value={fichaForm.tipo} onChange={e => {
                                    if (e.target.value === "__new_category__") {
                                        setShowCategoryModal(true);
                                    } else {
                                        setFichaForm({...fichaForm, tipo: e.target.value});
                                    }
                                }}>
                                    {loreTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    <option value="__new_category__" className="text-emerald-400">+ Nova Categoria</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex gap-4">
                                <div className="flex-1"><label className="text-[10px] uppercase text-zinc-500">Título</label><input className="w-full bg-black border border-zinc-800 rounded p-2 text-sm text-white" value={fichaForm.titulo || ""} onChange={e => setFichaForm({...fichaForm, titulo: e.target.value})} /></div>
                                <div className="w-32">
                                    <label className="text-[10px] uppercase text-zinc-500 block mb-1">Capa</label>
                                    <div className="relative group w-full h-24 bg-zinc-900 border border-zinc-800 rounded flex items-center justify-center cursor-pointer hover:bg-zinc-800 overflow-hidden">
                                        {imagePreview ? (
                                            <>
                                                <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <span className="text-[9px] text-white font-bold">Trocar</span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center">
                                                <span className="block text-2xl mb-1">📷</span>
                                                <span className="text-[9px] text-zinc-400">{isUploadingImage ? "Enviando..." : "Subir"}</span>
                                            </div>
                                        )}
                                        <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageUpload} disabled={isUploadingImage} />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-[10px] uppercase text-zinc-500">Slug (URL)</label><input className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-zinc-400" value={fichaForm.slug || ""} onChange={e => setFichaForm({...fichaForm, slug: e.target.value})} placeholder="Gerado automaticamente" /></div>
                                <div><label className="text-[10px] uppercase text-zinc-500">Ano Diegese</label><input type="number" className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white" value={fichaForm.ano_diegese || ""} onChange={e => setFichaForm({...fichaForm, ano_diegese: e.target.value})} /></div>
                            </div>

                            <div><label className="text-[10px] uppercase text-zinc-500">Resumo</label><textarea className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white h-16" value={fichaForm.resumo || ""} onChange={e => setFichaForm({...fichaForm, resumo: e.target.value})} /></div>
                            
                            <div className="relative">
                                <label className="text-[10px] uppercase text-zinc-500">Conteúdo Completo (Use @ para citar)</label>
                                <textarea 
                                    ref={textareaRef}
                                    className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white h-48 font-mono leading-relaxed" 
                                    value={fichaForm.conteudo || ""} 
                                    onChange={handleContentChange} 
                                />
                                {mentionQuery !== null && (
                                    <div className="absolute left-0 bottom-full mb-1 w-64 bg-zinc-900 border border-zinc-700 rounded shadow-xl max-h-40 overflow-y-auto z-50">
                                        {mentionSuggestions.map(s => (
                                            <button 
                                                key={s.id} 
                                                type="button"
                                                className="block w-full text-left px-3 py-2 text-xs hover:bg-emerald-900/30 hover:text-emerald-300 border-b border-zinc-800 last:border-0"
                                                onClick={() => insertMention(s.titulo)}
                                            >
                                                {s.titulo} <span className="text-[9px] opacity-50 ml-1">({s.tipo})</span>
                                            </button>
                                        ))}
                                        {mentionSuggestions.length === 0 && <div className="p-2 text-[10px] text-zinc-500">Nenhuma ficha encontrada...</div>}
                                    </div>
                                )}
                            </div>
                            
                            {/* Bloco de Evento (DIEGESE) */}
                            {fichaForm.tipo?.toLowerCase() === 'evento' && (
                                <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded mt-2">
                                    <span className="text-[10px] font-bold text-emerald-500 uppercase block mb-2">Timeline (Diegese)</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><label className="text-[10px] text-zinc-500">Início</label><input type="date" className="w-full bg-black border border-zinc-800 rounded p-1 text-xs" value={fichaForm.data_inicio || ""} onChange={e => setFichaForm({...fichaForm, data_inicio: e.target.value})} /></div>
                                        <div><label className="text-[10px] text-zinc-500">Fim</label><input type="date" className="w-full bg-black border border-zinc-800 rounded p-1 text-xs" value={fichaForm.data_fim || ""} onChange={e => setFichaForm({...fichaForm, data_fim: e.target.value})} /></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <div><label className="text-[10px] text-zinc-500">Granularidade</label><select className="w-full bg-black border border-zinc-800 rounded p-1 text-xs" value={fichaForm.granularidade_data || 'vago'} onChange={e => setFichaForm({...fichaForm, granularidade_data: e.target.value})}>{GRANULARIDADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
                                        <div><label className="text-[10px] text-zinc-500">Camada</label><select className="w-full bg-black border border-zinc-800 rounded p-1 text-xs" value={fichaForm.camada_temporal || 'linha_principal'} onChange={e => setFichaForm({...fichaForm, camada_temporal: e.target.value})}>{CAMADAS_TEMPORAIS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                                    </div>
                                    <div className="mt-2"><label className="text-[10px] text-zinc-500">Texto Original da Data</label><input className="w-full bg-black border border-zinc-800 rounded p-1 text-xs" value={fichaForm.descricao_data || ""} onChange={e => setFichaForm({...fichaForm, descricao_data: e.target.value})} placeholder="Ex: No verão de 94" /></div>
                                </div>
                            )}

                            <div><label className="text-[10px] uppercase text-zinc-500">Tags</label><input className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white" value={fichaForm.tags || ""} onChange={e => setFichaForm({...fichaForm, tags: e.target.value})} /></div>
                        </div>
                    </div>
                )}

                {/* ABA RELAÇÕES (WIKI) */}
                {fichaTab === 'relacoes' && (
                    <div className="space-y-4 h-full flex flex-col">
                        <div className="flex-1 bg-zinc-900/30 border border-zinc-800 rounded p-3 overflow-y-auto min-h-[200px]">
                            {relations.length === 0 && <div className="text-center text-zinc-600 text-xs mt-10">Sem relações cadastradas.</div>}
                            {relations.map(rel => {
                                const isSource = rel.source_ficha_id === fichaForm.id;
                                const other = isSource ? rel.target : rel.source;
                                return (
                                    <div key={rel.id} className="flex justify-between items-center p-2 border-b border-zinc-800 last:border-0 text-xs bg-zinc-900/50 rounded">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-zinc-300">{isSource ? "Esta ficha" : other?.titulo}</span>
                                            <span className="text-zinc-500">➜ {rel.tipo_relacao.replace(/_/g, " ")} ➜</span>
                                            <span className="font-bold text-zinc-300">{isSource ? other?.titulo : "Esta ficha"}</span>
                                        </div>
                                        <button type="button" onClick={() => handleDeleteRelation(rel.id)} className="text-red-500 hover:text-red-300 px-2">×</button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="pt-4 border-t border-zinc-800">
                            <label className="text-[10px] uppercase text-zinc-500 block mb-2">Adicionar Nova Relação</label>
                            <div className="flex gap-2">
                                <select className="w-32 bg-black border border-zinc-800 rounded p-2 text-xs" value={newRelType} onChange={e => setNewRelType(e.target.value)}>
                                    {RELATION_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
                                </select>
                                <select className="flex-1 bg-black border border-zinc-800 rounded p-2 text-xs" value={newRelTargetId} onChange={e => setNewRelTargetId(e.target.value)}>
                                    <option value="">Selecione a outra ficha...</option>
                                    {fichas.filter(f => f.id !== fichaForm.id).map(f => <option key={f.id} value={f.id}>{f.titulo} ({f.tipo})</option>)}
                                </select>
                                <button type="button" onClick={handleAddRelation} className="bg-emerald-600 text-white px-3 py-2 rounded text-xs hover:bg-emerald-500">Adicionar</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-800">
                    <button type="button" onClick={() => setFichaFormMode("idle")} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white">Cancelar</button>
                    <button type="submit" disabled={isSavingFicha} className="px-4 py-1.5 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-500 disabled:opacity-50">{isSavingFicha ? "Salvando..." : "Salvar Ficha"}</button>
                </div>
            </form>
        </div>
      )}
      {/* Modais de Mundo e Universo omitidos pois são idênticos */}
      {universeFormMode !== "idle" && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"><form onSubmit={e => { e.preventDefault(); saveUniverse(); }} className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg w-96 shadow-xl"><h3 className="text-white font-bold mb-4">{universeFormMode === 'create' ? 'Novo Universo' : 'Editar Universo'}</h3><input className="w-full bg-black border border-zinc-800 rounded p-2 mb-2 text-sm text-white" placeholder="Nome" value={universeForm.nome} onChange={e=>setUniverseForm({...universeForm, nome: e.target.value})} /><textarea className="w-full bg-black border border-zinc-800 rounded p-2 mb-4 text-sm text-white h-20" placeholder="Descrição" value={universeForm.descricao || ""} onChange={e=>setUniverseForm({...universeForm, descricao: e.target.value})} /><div className="flex justify-end gap-2"><button type="button" onClick={() => setUniverseFormMode("idle")} className="text-zinc-400 text-xs">Cancelar</button><button className="bg-emerald-600 text-white px-4 py-2 rounded text-xs font-bold">Salvar</button></div></form></div>)}
      {worldFormMode !== "idle" && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"><form onSubmit={handleSaveWorld} className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg w-96 shadow-xl"><h3 className="text-white font-bold mb-4">{worldFormMode === 'create' ? 'Novo Mundo' : 'Editar Mundo'}</h3><input className="w-full bg-black border border-zinc-800 rounded p-2 mb-2 text-sm text-white" placeholder="Nome" value={worldForm.nome || ""} onChange={e=>setWorldForm({...worldForm, nome: e.target.value})} /><div className="flex justify-end gap-2"><button type="button" onClick={() => setWorldFormMode("idle")} className="text-zinc-400 text-xs">Cancelar</button><button className="bg-emerald-600 text-white px-4 py-2 rounded text-xs font-bold">Salvar</button></div></form></div>)}

      {/* MODAL NOVA CATEGORIA */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowCategoryModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-2">
              <h3 className="text-white font-bold uppercase tracking-widest text-sm">Nova Categoria</h3>
              <button type="button" onClick={() => setShowCategoryModal(false)} className="text-zinc-500 hover:text-white text-2xl leading-none font-light">&times;</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase text-zinc-500 block mb-1">Nome da Categoria</label>
                <input 
                  type="text" 
                  className="w-full bg-black border border-zinc-800 rounded p-2 text-sm text-white focus:border-emerald-500"
                  placeholder="Ex: Planeta, Nave, Artefato"
                  value={newCategoryName}
                  onChange={(e) => handleCategoryNameChange(e.target.value)}
                />
              </div>
              
              <div>
                <label className="text-[10px] uppercase text-zinc-500 block mb-1">Prefixo (Auto-gerado)</label>
                <input 
                  type="text" 
                  className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-sm text-zinc-500"
                  value={newCategoryPrefix}
                  disabled
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] uppercase text-zinc-500">Descrição (para IA)</label>
                  <button 
                    type="button"
                    onClick={handleGenerateDescription}
                    disabled={isGeneratingDescription || !newCategoryName}
                    className="text-xs bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-2 py-1 rounded font-medium flex items-center gap-1"
                  >
                    <span>✨</span>
                    {isGeneratingDescription ? "Gerando..." : "Gerar com IA"}
                  </button>
                </div>
                <textarea 
                  className="w-full bg-black border border-zinc-800 rounded p-2 text-sm text-white focus:border-emerald-500 h-32"
                  placeholder="Descrição detalhada para guiar a IA na extração..."
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-800">
              <button type="button" onClick={() => setShowCategoryModal(false)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white">Cancelar</button>
              <button type="button" onClick={handleCreateCategory} className="px-4 py-1.5 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-500">Criar Categoria</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR CATEGORIAS */}
      {showEditCategoriesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowEditCategoriesModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg w-full max-w-4xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-2">
              <h3 className="text-white font-bold uppercase tracking-widest text-sm">Gerenciar Categorias</h3>
              <button type="button" onClick={() => setShowEditCategoriesModal(false)} className="text-zinc-500 hover:text-white text-2xl leading-none font-light">&times;</button>
            </div>
            
            <div className="space-y-3">
              {editingCategories.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">Nenhuma categoria encontrada</p>
              ) : (
                editingCategories.map((cat: any) => (
                  <div key={cat.slug} className="bg-black border border-zinc-800 rounded p-4">
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="text-[10px] uppercase text-zinc-500 block mb-1">Nome</label>
                        <input 
                          type="text" 
                          className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white"
                          value={cat.label}
                          onChange={(e) => {
                            const updated = editingCategories.map(c => 
                              c.slug === cat.slug ? {...c, label: e.target.value} : c
                            );
                            setEditingCategories(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-zinc-500 block mb-1">Slug</label>
                        <input 
                          type="text" 
                          className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-500"
                          value={cat.slug}
                          disabled
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-zinc-500 block mb-1">Prefixo</label>
                        <input 
                          type="text" 
                          className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white"
                          value={cat.prefix || ''}
                          onChange={(e) => {
                            const updated = editingCategories.map(c => 
                              c.slug === cat.slug ? {...c, prefix: e.target.value} : c
                            );
                            setEditingCategories(updated);
                          }}
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="text-[10px] uppercase text-zinc-500 block mb-1">Descrição</label>
                      <textarea 
                        className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white h-20"
                        value={cat.description || ''}
                        onChange={(e) => {
                          const updated = editingCategories.map(c => 
                            c.slug === cat.slug ? {...c, description: e.target.value} : c
                          );
                          setEditingCategories(updated);
                        }}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button 
                        type="button"
                        onClick={() => handleDeleteCategory(cat.slug)}
                        className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded"
                      >
                        Deletar
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleUpdateCategory(cat)}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded"
                      >
                        Salvar Alterações
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-zinc-800">
              <button type="button" onClick={() => setShowEditCategoriesModal(false)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white">Fechar</button>
            </div>
          </div>
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
