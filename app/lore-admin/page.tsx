"use client";

import React, { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type ViewState = "loading" | "loggedOut" | "loggedIn";

// Form helpers
type WorldFormMode = "idle" | "create" | "edit";
type FichaFormMode = "idle" | "create" | "edit";
type CodeFormMode = "idle" | "create" | "edit";

export default function LoreAdminPage() {
  // ---- Estado de autenticação / tela ---------------------------------------
  const [view, setView] = useState<ViewState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Estado de dados (Mundos, Fichas, Códigos) ---------------------------
  const [worlds, setWorlds] = useState<any[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [fichas, setFichas] = useState<any[]>([]);
  const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);
  const [codes, setCodes] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Filtro por tipo de ficha (personagem, local, epistemologia, etc.)
  const [fichaFilterTipo, setFichaFilterTipo] = useState<string>("all");

  // ---- Formulário de Mundo --------------------------------------------------
  const [worldFormMode, setWorldFormMode] = useState<WorldFormMode>("idle");
  const [isSavingWorld, setIsSavingWorld] = useState(false);
  const [worldForm, setWorldForm] = useState<{
    id: string;
    nome: string;
    descricao: string;
    tipo: string;
    ordem: string;
  }>({
    id: "",
    nome: "",
    descricao: "",
    tipo: "",
    ordem: "",
  });

  // ---- Formulário de Ficha --------------------------------------------------
  const [fichaFormMode, setFichaFormMode] = useState<FichaFormMode>("idle");
  const [isSavingFicha, setIsSavingFicha] = useState(false);
  const [fichaForm, setFichaForm] = useState<{
    id: string; // só usamos para edição
    titulo: string;
    slug: string;
    tipo: string;
    resumo: string;
    conteudo: string;
    tags: string;
    ano_diegese: string;
    ordem_cronologica: string;
    aparece_em: string;
  }>({
    id: "",
    titulo: "",
    slug: "",
    tipo: "",
    resumo: "",
    conteudo: "",
    tags: "",
    ano_diegese: "",
    ordem_cronologica: "",
    aparece_em: "",
  });

  // ---- Formulário de Código -------------------------------------------------
  const [codeFormMode, setCodeFormMode] = useState<CodeFormMode>("idle");
  const [isSavingCode, setIsSavingCode] = useState(false);
  const [codeForm, setCodeForm] = useState<{
    id: string;
    code: string;
    label: string;
    description: string;
  }>({
    id: "",
    code: "",
    label: "",
    description: "",
  });

  // ===========================================================================
  // Autenticação básica
  // ===========================================================================

  useEffect(() => {
    const checkSession = async () => {
      setView("loading");
      const {
        data: { session },
        error,
      } = await supabaseBrowser.auth.getSession();

      if (error) {
        console.error(error);
        setView("loggedOut");
        return;
      }

      if (session) {
        setView("loggedIn");
        await fetchAllData();
      } else {
        setView("loggedOut");
      }
    };

    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const { data, error: loginError } =
      await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });

    setIsSubmitting(false);

    if (loginError) {
      setError(loginError.message);
      return;
    }

    if (data.session) {
      setView("loggedIn");
      await fetchAllData();
    }
  }

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    setView("loggedOut");
    setEmail("");
    setPassword("");
  }

  // ===========================================================================
  // Carregamento inicial
  // ===========================================================================

  async function fetchAllData() {
    try {
      setIsLoadingData(true);
      setError(null);

      // Carrega Mundos
      const { data, error: worldsError } = await supabaseBrowser
        .from("worlds")
        .select("*")
        .order("ordem", { ascending: true });

      if (worldsError) {
        console.error(worldsError);
        setError("Erro ao carregar mundos.");
        setIsLoadingData(false);
        return;
      }

      const list = data || [];
      setWorlds(list);

      // seleciona um mundo inicial
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
      console.error(err);
      setError("Erro inesperado ao carregar dados.");
      setIsLoadingData(false);
    }
  }

  // Busca fichas: se o mundo for "AntiVerso", traz TODAS as fichas (root)
  async function fetchFichas(world: any | null) {
    setError(null);

    if (!world) {
      setFichas([]);
      setSelectedFichaId(null);
      setCodes([]);
      return;
    }

    const isRoot =
      (world?.nome || "").trim().toLowerCase() === "antiverso";

    let query = supabaseBrowser
      .from("fichas")
      .select("*")
      .order("titulo", { ascending: true });

    if (!isRoot) {
      query = query.eq("world_id", world.id);
    }

    const { data, error: fichasError } = await query;

    if (fichasError) {
      console.error(fichasError);
      setError("Erro ao carregar fichas.");
      return;
    }

    setFichas(data || []);
    setSelectedFichaId(null);
    setCodes([]);
  }

  async function fetchCodes(fichaId: string) {
    setError(null);
    const { data, error: codesError } = await supabaseBrowser
      .from("codes")
      .select("*")
      .eq("ficha_id", fichaId)
      .order("code", { ascending: true });

    if (codesError) {
      console.error(codesError);
      setError("Erro ao carregar códigos.");
      return;
    }

    setCodes(data || []);
  }

  // ===========================================================================
  // CRUD – MUNDOS
  // ===========================================================================

  function startCreateWorld() {
    setWorldFormMode("create");
    setWorldForm({
      id: "",
      nome: "",
      descricao: "",
      tipo: "",
      ordem: "",
    });
  }

  function startEditWorld(world: any) {
    setWorldFormMode("edit");
    setWorldForm({
      id: world.id ?? "",
      nome: world.nome ?? "",
      descricao: world.descricao ?? "",
      tipo: world.tipo ?? "",
      ordem: world.ordem ? String(world.ordem) : "",
    });
  }

  function cancelWorldForm() {
    setWorldFormMode("idle");
    setWorldForm({
      id: "",
      nome: "",
      descricao: "",
      tipo: "",
      ordem: "",
    });
  }

  async function handleSaveWorld(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingWorld(true);
    setError(null);

    if (!worldForm.nome.trim()) {
      setError("Mundo precisa de um nome.");
      setIsSavingWorld(false);
      return;
    }

    const payload: any = {
      nome: worldForm.nome.trim(),
      descricao: worldForm.descricao.trim() || null,
      // tipo e ordem não são mais editados aqui; deixamos como estão no banco
      updated_at: new Date().toISOString(),
    };

    let saveError = null;

    if (worldFormMode === "create") {
      const { error } = await supabaseBrowser.from("worlds").insert([payload]);
      saveError = error;
    } else {
      const { error } = await supabaseBrowser
        .from("worlds")
        .update(payload)
        .eq("id", worldForm.id);
      saveError = error;
    }

    setIsSavingWorld(false);

    if (saveError) {
      console.error(saveError);
      setError("Erro ao salvar Mundo.");
      return;
    }

    cancelWorldForm();
    await fetchAllData();
  }

  async function handleDeleteWorld(worldId: string) {
    setError(null);

    const ok = window.confirm(
      "Tem certeza que deseja deletar este Mundo? Essa ação não pode ser desfeita.",
    );
    if (!ok) return;

    const { error: deleteError } = await supabaseBrowser
      .from("worlds")
      .delete()
      .eq("id", worldId);

    if (deleteError) {
      console.error(deleteError);
      setError(
        "Erro ao deletar Mundo. Verifique se não há Fichas ligadas a ele.",
      );
      return;
    }

    if (selectedWorldId === worldId) {
      setSelectedWorldId(null);
      setFichas([]);
      setCodes([]);
    }

    await fetchAllData();
  }

  // ===========================================================================
  // CRUD – FICHAS
  // ===========================================================================

  function startCreateFicha() {
    if (!selectedWorldId) {
      setError("Selecione um Mundo antes de criar uma Ficha.");
      return;
    }
    setFichaFormMode("create");
    setFichaForm({
      id: "",
      titulo: "",
      slug: "",
      tipo: "",
      resumo: "",
      conteudo: "",
      tags: "",
      ano_diegese: "",
      ordem_cronologica: "",
      aparece_em: "",
    });
  }

  function startEditFicha(ficha: any) {
    setFichaFormMode("edit");
    setFichaForm({
      id: ficha.id ?? "",
      titulo: ficha.titulo ?? "",
      slug: ficha.slug ?? "",
      tipo: ficha.tipo ?? "",
      resumo: ficha.resumo ?? "",
      conteudo: ficha.conteudo ?? "",
      tags: ficha.tags ?? "",
      ano_diegese: ficha.ano_diegese ? String(ficha.ano_diegese) : "",
      ordem_cronologica: ficha.ordem_cronologica
        ? String(ficha.ordem_cronologica)
        : "",
      aparece_em: ficha.aparece_em ?? "",
    });
  }

  function cancelFichaForm() {
    setFichaFormMode("idle");
    setFichaForm({
      id: "",
      titulo: "",
      slug: "",
      tipo: "",
      resumo: "",
      conteudo: "",
      tags: "",
      ano_diegese: "",
      ordem_cronologica: "",
      aparece_em: "",
    });
  }

  async function handleSaveFicha(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWorldId) {
      setError("Selecione um Mundo antes de salvar uma Ficha.");
      return;
    }
    if (fichaFormMode === "idle") return;

    if (!fichaForm.titulo.trim()) {
      setError("Ficha precisa de um título.");
      return;
    }

    setIsSavingFicha(true);
    setError(null);

    const payload: any = {
      world_id: selectedWorldId,
      titulo: fichaForm.titulo.trim(),
      slug: fichaForm.slug.trim() || null,
      tipo: fichaForm.tipo.trim() || null,
      resumo: fichaForm.resumo.trim() || null,
      conteudo: fichaForm.conteudo.trim() || null,
      tags: fichaForm.tags.trim() || null,
      ano_diegese: fichaForm.ano_diegese.trim()
        ? Number.isNaN(Number(fichaForm.ano_diegese.trim()))
          ? fichaForm.ano_diegese.trim()
          : Number(fichaForm.ano_diegese.trim())
        : null,
      ordem_cronologica: fichaForm.ordem_cronologica.trim()
        ? Number.isNaN(Number(fichaForm.ordem_cronologica.trim()))
          ? fichaForm.ordem_cronologica.trim()
          : Number(fichaForm.ordem_cronologica.trim())
        : null,
      aparece_em: fichaForm.aparece_em.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let saveError = null;

    if (fichaFormMode === "create") {
      const { error } = await supabaseBrowser.from("fichas").insert([payload]);
      saveError = error;
    } else {
      const { error } = await supabaseBrowser
        .from("fichas")
        .update(payload)
        .eq("id", fichaForm.id);
      saveError = error;
    }

    setIsSavingFicha(false);

    if (saveError) {
      console.error(saveError);
      setError("Erro ao salvar Ficha.");
      return;
    }

    cancelFichaForm();
    const currentWorld =
      worlds.find((w) => w.id === selectedWorldId) || null;
    await fetchFichas(currentWorld);
  }

  async function handleDeleteFicha(fichaId: string) {
    setError(null);
    const ok = window.confirm(
      "Tem certeza que deseja deletar esta Ficha? Essa ação não pode ser desfeita.",
    );
    if (!ok) return;

    const { error: deleteError } = await supabaseBrowser
      .from("fichas")
      .delete()
      .eq("id", fichaId);

    if (deleteError) {
      console.error(deleteError);
      setError("Erro ao deletar Ficha.");
      return;
    }

    if (selectedFichaId === fichaId) {
      setSelectedFichaId(null);
      setCodes([]);
    }

    const currentWorld =
      worlds.find((w) => w.id === selectedWorldId) || null;
    await fetchFichas(currentWorld);
  }

  // ===========================================================================
  // CRUD – CÓDIGOS
  // ===========================================================================

  function startCreateCode() {
    if (!selectedFichaId) {
      setError("Selecione uma Ficha antes de criar um Código.");
      return;
    }
    setCodeFormMode("create");
    setCodeForm({
      id: "",
      code: "",
      label: "",
      description: "",
    });
  }

  function startEditCode(code: any) {
    setCodeFormMode("edit");
    setCodeForm({
      id: code.id ?? "",
      code: code.code ?? "",
      label: code.label ?? "",
      description: code.description ?? "",
    });
  }

  function cancelCodeForm() {
    setCodeFormMode("idle");
    setCodeForm({
      id: "",
      code: "",
      label: "",
      description: "",
    });
  }

  async function handleSaveCode(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFichaId) {
      setError("Selecione uma Ficha antes de salvar um Código.");
      return;
    }
    if (codeFormMode === "idle") return;

    if (!codeForm.code.trim()) {
      setError("Código precisa de um valor.");
      return;
    }

    setIsSavingCode(true);
    setError(null);

    const payload: any = {
      ficha_id: selectedFichaId,
      code: codeForm.code.trim(),
      label: codeForm.label.trim() || null,
      description: codeForm.description.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let saveError = null;

    if (codeFormMode === "create") {
      const { error } = await supabaseBrowser.from("codes").insert([payload]);
      saveError = error;
    } else {
      const { error } = await supabaseBrowser
        .from("codes")
        .update(payload)
        .eq("id", codeForm.id);
      saveError = error;
    }

    setIsSavingCode(false);

    if (saveError) {
      console.error(saveError);
      setError("Erro ao salvar Código.");
      return;
    }

    cancelCodeForm();
    if (selectedFichaId) {
      await fetchCodes(selectedFichaId);
    }
  }

  async function handleDeleteCode(codeId: string) {
    setError(null);
    const ok = window.confirm(
      "Tem certeza que deseja deletar este Código? Essa ação não pode ser desfeita.",
    );
    if (!ok) return;

    const { error: deleteError } = await supabaseBrowser
      .from("codes")
      .delete()
      .eq("id", codeId);

    if (deleteError) {
      console.error(deleteError);
      setError("Erro ao deletar Código.");
      return;
    }

    if (selectedFichaId) {
      await fetchCodes(selectedFichaId);
    }
  }

  // ===========================================================================
  // Derivados de estado
  // ===========================================================================

  const selectedWorld =
    worlds.find((w) => w.id === selectedWorldId) || null;

  const filteredFichas =
    fichaFilterTipo === "all"
      ? fichas
      : fichas.filter(
          (f) =>
            (f.tipo || "").toLowerCase() ===
            fichaFilterTipo.toLowerCase(),
        );

  // ===========================================================================
  // Renderização
  // ===========================================================================

  if (view === "loading") {
    return (
      <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center">
        <div className="text-xs text-neutral-500">Carregando…</div>
      </div>
    );
  }

  if (view === "loggedOut") {
    return (
      <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center">
        <form
          onSubmit={handleLogin}
          className="border border-neutral-800 rounded-lg p-6 w-[320px] bg-neutral-950/80"
        >
          <h1 className="text-sm font-semibold mb-2 tracking-[0.18em] uppercase text-neutral-400">
            /lore-admin – Mundos, Fichas e Códigos
          </h1>
          <p className="text-[11px] text-neutral-500 mb-4">
            Acesse com seu e-mail e senha de admin.
          </p>

          {error && (
            <div className="mb-3 text-[11px] text-red-400 bg-red-950/40 border border-red-900 rounded px-2 py-1">
              {error}
            </div>
          )}

          <div className="space-y-2 mb-3">
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1">
                E-mail
              </label>
              <input
                type="email"
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1">
                Senha
              </label>
              <input
                type="password"
                className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-1 text-[11px] px-3 py-1.5 rounded-full border border-emerald-500 text-emerald-200 hover:bg-emerald-500 hover:text-black transition-colors disabled:opacity-60"
          >
            {isSubmitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-900 px-4 py-2 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            AntiVerso Lore Machine
          </div>
          <div className="text-[11px] text-neutral-600">
            /lore-admin – Mundos, Fichas e Códigos
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-[11px] px-3 py-1 rounded-full border border-neutral-800 text-neutral-400 hover:text-emerald-300 hover:border-emerald-500 transition-colors"
        >
          Sair
        </button>
      </header>

      {error && (
        <div className="px-4 py-2 text-[11px] text-red-400 bg-red-950/40 border-b border-red-900">
          {error}
        </div>
      )}

      {isLoadingData && (
        <div className="px-4 py-1 text-[11px] text-neutral-500 border-b border-neutral-900">
          Carregando dados…
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        {/* Coluna 1: Mundos */}
        <section className="w-80 border-r border-neutral-800 p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              Mundos
            </h2>
            <button
              onClick={startCreateWorld}
              className="text-[11px] px-2 py-1 rounded-full border border-neutral-700 hover:border-emerald-500 hover:text-emerald-300 transition-colors"
            >
              + Novo
            </button>
          </div>

          <div className="text-[11px] text-neutral-500 mb-2">
            Selecione um Mundo para ver suas Fichas e Códigos.
          </div>

          <div className="flex-1 overflow-auto space-y-1 pr-1">
            {worlds.length === 0 && (
              <div className="text-[11px] text-neutral-600">
                Nenhum Mundo cadastrado ainda.
              </div>
            )}

            {worlds.map((world) => (
              <div
                key={world.id}
                className={`group border rounded-md px-2 py-1 text-[11px] cursor-pointer mb-1 ${
                  selectedWorldId === world.id
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-neutral-800 hover:border-neutral-500"
                }`}
                onClick={() => {
                  setSelectedWorldId(world.id as string);
                  fetchFichas(world);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-neutral-100">
                    {world.nome}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="text-[10px] px-1 py-0.5 rounded border border-neutral-700 hover:border-neutral-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditWorld(world);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-1 py-0.5 rounded border border-red-700 text-red-300 hover:bg-red-900/40"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWorld(world.id as string);
                      }}
                    >
                      Del
                    </button>
                  </div>
                </div>
                {world.descricao && (
                  <div className="text-[10px] text-neutral-500 mt-0.5 line-clamp-2">
                    {world.descricao}
                  </div>
                )}
              </div>
            ))}
          </div>

          {worldFormMode !== "idle" && (
            <form
              onSubmit={handleSaveWorld}
              className="mt-3 border border-neutral-800 rounded-lg p-3 bg-neutral-950/60 space-y-2"
            >
              <div className="text-[11px] text-neutral-400 mb-1">
                {worldFormMode === "create" ? "Novo Mundo" : "Editar Mundo"}
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
          )}
        </section>

        {/* Coluna 2: Fichas */}
        <section className="w-[32rem] border-r border-neutral-800 p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              Fichas do Mundo
            </h2>
            <button
              onClick={startCreateFicha}
              className="text-[11px] px-2 py-1 rounded-full border border-neutral-700 hover:border-emerald-500 hover:text-emerald-300 transition-colors"
            >
              + Nova
            </button>
          </div>

          <div className="text-[11px] text-neutral-500 mb-1">
            Mundo selecionado:{" "}
            <span className="text-neutral-300">
              {selectedWorld?.nome ?? "nenhum selecionado"}
            </span>
          </div>

          {/* Filtro por tipo de ficha */}
          <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px]">
            <span className="text-neutral-500">Filtrar por tipo:</span>
            {[
              { value: "all", label: "Todos" },
              { value: "personagem", label: "Personagens" },
              { value: "local", label: "Locais" },
              { value: "agencia", label: "Agências" },
              { value: "empresa", label: "Empresas" },
              { value: "midia", label: "Mídia" },
              { value: "conceito", label: "Conceitos" },
              { value: "epistemologia", label: "Epistemologia" },
              { value: "evento", label: "Eventos" },
              { value: "regra_de_mundo", label: "Regras de mundo" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFichaFilterTipo(opt.value)}
                className={`px-2 py-0.5 rounded-full border ${
                  fichaFilterTipo === opt.value
                    ? "border-emerald-500 text-emerald-300 bg-emerald-500/10"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto space-y-1 pr-1 mb-3">
            {selectedWorldId == null && (
              <div className="text-[11px] text-neutral-600">
                Selecione um Mundo na coluna da esquerda.
              </div>
            )}

            {selectedWorldId != null && filteredFichas.length === 0 && (
              <div className="text-[11px] text-neutral-600">
                Nenhuma Ficha cadastrada para este filtro.
              </div>
            )}

            {filteredFichas.map((ficha) => (
              <div
                key={ficha.id}
                className={`group border rounded-md px-2 py-1 text-[11px] cursor-pointer mb-1 ${
                  selectedFichaId === ficha.id
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-neutral-800 hover:border-neutral-500"
                }`}
                onClick={() => {
                  setSelectedFichaId(ficha.id as string);
                  fetchCodes(ficha.id as string);
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-neutral-100">
                      {ficha.titulo}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {ficha.tipo || "sem tipo definido"}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="text-[10px] px-1 py-0.5 rounded border border-neutral-700 hover:border-neutral-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditFicha(ficha);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-1 py-0.5 rounded border border-red-700 text-red-300 hover:bg-red-900/40"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFicha(ficha.id as string);
                      }}
                    >
                      Del
                    </button>
                  </div>
                </div>
                {ficha.resumo && (
                  <div className="text-[10px] text-neutral-500 mt-0.5 line-clamp-2">
                    {ficha.resumo}
                  </div>
                )}
              </div>
            ))}
          </div>

          {fichaFormMode !== "idle" && (
            <form
              onSubmit={handleSaveFicha}
              className="border border-neutral-800 rounded-lg p-3 bg-neutral-950/60 space-y-2"
            >
              <div className="text-[11px] text-neutral-400 mb-1">
                {fichaFormMode === "create" ? "Nova Ficha" : "Editar Ficha"}
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
                <div className="w-40 space-y-1">
                  <label className="text-[11px] text-neutral-500">
                    Tipo
                  </label>
                  <select
                    className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                    value={fichaForm.tipo}
                    onChange={(e) =>
                      setFichaForm((prev) => ({
                        ...prev,
                        tipo: e.target.value,
                      }))
                    }
                  >
                    <option value="">Selecione…</option>
                    <option value="personagem">Personagem</option>
                    <option value="local">Local</option>
                    <option value="empresa">Empresa</option>
                    <option value="agencia">Agência</option>
                    <option value="midia">Mídia</option>
                    <option value="conceito">Conceito</option>
                    <option value="epistemologia">Epistemologia</option>
                    <option value="evento">Evento</option>
                    <option value="regra_de_mundo">Regra de mundo</option>
                  </select>
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
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs min-h-[100px]"
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
          )}
        </section>

        {/* Coluna 3: Códigos */}
        <section className="flex-1 p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              Códigos da Ficha
            </h2>
            <button
              onClick={startCreateCode}
              className="text-[11px] px-2 py-1 rounded-full border border-neutral-700 hover:border-emerald-500 hover:text-emerald-300 transition-colors"
            >
              + Novo
            </button>
          </div>

          <div className="text-[11px] text-neutral-500 mb-1">
            Ficha selecionada:{" "}
            <span className="text-neutral-300">
              {fichas.find((f) => f.id === selectedFichaId)?.titulo ||
                "nenhuma selecionada"}
            </span>
          </div>

          <div className="flex-1 overflow-auto space-y-1 pr-1 mb-3">
            {selectedFichaId == null && (
              <div className="text-[11px] text-neutral-600">
                Escolha uma Ficha na coluna do meio.
              </div>
            )}

            {selectedFichaId != null && codes.length === 0 && (
              <div className="text-[11px] text-neutral-600">
                Nenhum código cadastrado para esta Ficha.
              </div>
            )}

            {codes.map((code) => (
              <div
                key={code.id}
                className="group border border-neutral-800 rounded-md px-2 py-1 text-[11px] mb-1"
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
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="text-[10px] px-1 py-0.5 rounded border border-neutral-700 hover:border-neutral-400"
                      onClick={() => startEditCode(code)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-1 py-0.5 rounded border border-red-700 text-red-300 hover:bg-red-900/40"
                      onClick={() => handleDeleteCode(code.id as string)}
                    >
                      Del
                    </button>
                  </div>
                </div>
                {code.description && (
                  <div className="text-[10px] text-neutral-500 mt-0.5 line-clamp-2">
                    {code.description}
                  </div>
                )}
              </div>
            ))}
          </div>

          {codeFormMode !== "idle" && (
            <form
              onSubmit={handleSaveCode}
              className="border border-neutral-800 rounded-lg p-3 bg-neutral-950/60 space-y-2"
            >
              <div className="text-[11px] text-neutral-400 mb-1">
                {codeFormMode === "create" ? "Novo Código" : "Editar Código"}
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
                  placeholder="ex: AV1-PS1, SAL1-PS3…"
                />
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
          )}
        </section>
      </main>
    </div>
  );
}
