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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---- Estado de dados (Mundos, Fichas, Códigos) ---------------------------
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [worlds, setWorlds] = useState<any[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);

  const [fichas, setFichas] = useState<any[]>([]);
  const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);

  const [codes, setCodes] = useState<any[]>([]);

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
  }>({
    id: "",
    titulo: "",
    slug: "",
    tipo: "",
    resumo: "",
    conteudo: "",
    tags: "",
  });

  // ---- Formulário de Código -------------------------------------------------
  const [codeFormMode, setCodeFormMode] = useState<CodeFormMode>("idle");
  const [isSavingCode, setIsSavingCode] = useState(false);
  const [codeForm, setCodeForm] = useState<{
    id: string; // só para edição
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
  // FUNÇÕES DE CARREGAMENTO
  // ===========================================================================

  async function fetchWorlds() {
    setIsLoadingData(true);
    setError(null);

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

    setWorlds(data || []);

    // se não houver um mundo selecionado, seleciona o primeiro
    if (!selectedWorldId && data && data.length > 0) {
      const firstId = data[0].id as string;
      setSelectedWorldId(firstId);
      fetchFichas(firstId);
    }

    setIsLoadingData(false);
  }

  async function fetchFichas(worldId: string) {
    setIsLoadingData(true);
    setError(null);

    const { data, error: fichasError } = await supabaseBrowser
      .from("fichas")
      .select("*")
      .eq("world_id", worldId)
      .order("created_at", { ascending: true });

    if (fichasError) {
      console.error(fichasError);
      setError("Erro ao carregar fichas.");
      setIsLoadingData(false);
      return;
    }

    setFichas(data || []);
    setSelectedFichaId(null);
    setCodes([]);

    if (data && data.length > 0) {
      const firstFichaId = data[0].id as string;
      setSelectedFichaId(firstFichaId);
      fetchCodes(firstFichaId);
    }

    setIsLoadingData(false);
  }

  async function fetchCodes(fichaId: string) {
    setIsLoadingData(true);
    setError(null);

    const { data, error: codesError } = await supabaseBrowser
      .from("codes")
      .select("*")
      .eq("ficha_id", fichaId)
      .order("created_at", { ascending: true });

    if (codesError) {
      console.error(codesError);
      setError("Erro ao carregar códigos.");
      setIsLoadingData(false);
      return;
    }

    setCodes(data || []);
    setIsLoadingData(false);
  }

  // ===========================================================================
  // CHECK DE SESSÃO AO ABRIR A PÁGINA
  // ===========================================================================

  useEffect(() => {
    const checkSession = async () => {
      const { data, error: userError } = await supabaseBrowser.auth.getUser();

      if (userError || !data?.user) {
        setView("loggedOut");
        return;
      }

      setUserEmail(data.user.email ?? null);
      await fetchWorlds();
      setView("loggedIn");
    };

    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===========================================================================
  // LOGIN / LOGOUT
  // ===========================================================================

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { data, error: loginError } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (loginError) {
      setError(loginError.message);
      return;
    }

    setUserEmail(data.user?.email ?? null);
    await fetchWorlds();
    setView("loggedIn");
  }

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    setUserEmail(null);
    setView("loggedOut");
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
      ordem: world.ordem != null ? String(world.ordem) : "",
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
    if (worldFormMode === "idle") return;

    if (!worldForm.id.trim() || !worldForm.nome.trim()) {
      setError("Mundo precisa de ID e Nome.");
      return;
    }

    setIsSavingWorld(true);
    setError(null);

    const payload: any = {
      id: worldForm.id.trim(),
      nome: worldForm.nome.trim(),
      descricao: worldForm.descricao.trim() || null,
      tipo: worldForm.tipo.trim() || null,
      ordem: worldForm.ordem ? Number(worldForm.ordem) : null,
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

    await fetchWorlds();
    setWorldFormMode("idle");
  }

  async function handleDeleteWorld(worldId: string) {
    if (!window.confirm("Tem certeza que deseja deletar este Mundo?")) return;

    setError(null);

    const { error: deleteError } = await supabaseBrowser
      .from("worlds")
      .delete()
      .eq("id", worldId);

    if (deleteError) {
      console.error(deleteError);
      setError("Erro ao deletar Mundo. Verifique se não há Fichas ligadas a ele.");
      return;
    }

    if (selectedWorldId === worldId) {
      setSelectedWorldId(null);
      setFichas([]);
      setSelectedFichaId(null);
      setCodes([]);
    }

    await fetchWorlds();
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

    await fetchFichas(selectedWorldId);
    setFichaFormMode("idle");
  }

  async function handleDeleteFicha(fichaId: string) {
    if (!window.confirm("Tem certeza que deseja deletar esta Ficha?")) return;

    if (!selectedWorldId) return;

    setError(null);

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

    await fetchFichas(selectedWorldId);
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
      setError("O campo 'Código' é obrigatório.");
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

    await fetchCodes(selectedFichaId);
    setCodeFormMode("idle");
  }

  async function handleDeleteCode(codeId: string) {
    if (!window.confirm("Tem certeza que deseja deletar este Código?")) return;
    if (!selectedFichaId) return;

    setError(null);

    const { error: deleteError } = await supabaseBrowser
      .from("codes")
      .delete()
      .eq("id", codeId);

    if (deleteError) {
      console.error(deleteError);
      setError("Erro ao deletar Código.");
      return;
    }

    await fetchCodes(selectedFichaId);
  }

  // ===========================================================================
  // TELAS – LOADING / LOGIN / PAINEL
  // ===========================================================================

  if (view === "loading") {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-neutral-200">
        <div className="text-sm text-neutral-500">
          Carregando AntiVerso Admin…
        </div>
      </div>
    );
  }

  if (view === "loggedOut") {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-neutral-100">
        <div className="w-full max-w-sm border border-neutral-800 rounded-2xl p-6 bg-neutral-950/80 shadow-lg">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-1">
            AntiVerso Lore Machine
          </div>
          <h1 className="text-lg font-semibold mb-1">Acesso ao painel admin</h1>
          <p className="text-[13px] text-neutral-400 mb-4">
            Faça login com o usuário configurado no Supabase para editar Mundos,
            Fichas e Códigos.
          </p>

          <form className="space-y-3" onSubmit={handleLogin}>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                E-mail
              </label>
              <input
                type="email"
                required
                className="w-full rounded-lg border border-neutral-800 bg-black/60 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@antiverso.com"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                Senha
              </label>
              <input
                type="password"
                required
                className="w-full rounded-lg border border-neutral-800 bg-black/60 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha do Supabase"
              />
            </div>

            {error && (
              <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 rounded-lg bg-emerald-500 text-black text-sm font-medium py-2.5 hover:bg-emerald-400 disabled:opacity-60 disabled:hover:bg-emerald-500 transition-colors"
            >
              {isSubmitting ? "Entrando…" : "Entrar"}
            </button>

            <p className="text-[11px] text-neutral-500 mt-2">
              Esta tela usa Supabase Auth (email + senha). Depois podemos
              afinar as regras de acesso com Row Level Security (RLS).
            </p>
          </form>
        </div>
      </div>
    );
  }

  // ---- Tela logada – painel Admin ------------------------------------------
  return (
    <div className="h-screen flex flex-col bg-black text-neutral-100">
      {/* Top bar */}
      <header className="h-12 border-b border-neutral-800 flex items-center justify-between px-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            AntiVerso Lore Machine — Admin
          </div>
          <div className="text-[11px] text-neutral-500">
            /lore-admin – Mundos, Fichas e Códigos
          </div>
        </div>

        <div className="flex items-center gap-3 text-[12px]">
          {userEmail && (
            <span className="text-neutral-400">
              Logado como{" "}
              <span className="text-neutral-200 font-medium">{userEmail}</span>
            </span>
          )}
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-full border border-neutral-700 text-[11px] text-neutral-200 hover:border-red-500 hover:text-red-300 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Avisos globais */}
      {error && (
        <div className="border-b border-red-800/60 bg-red-950/40 text-red-200 text-xs px-4 py-2">
          {error}
        </div>
      )}
      {isLoadingData && (
        <div className="border-b border-neutral-800 bg-neutral-950/40 text-neutral-400 text-xs px-4 py-1">
          Carregando dados…
        </div>
      )}

      {/* Conteúdo principal */}
      <main className="flex-1 flex overflow-hidden text-sm">
        {/* Coluna 1: Mundos */}
        <aside className="w-72 border-r border-neutral-800 p-4 flex flex-col">
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

          <div className="flex-1 overflow-auto space-y-1">
            {worlds.length === 0 && (
              <div className="text-[12px] text-neutral-500">
                Nenhum mundo cadastrado ainda.
              </div>
            )}

            {worlds.map((world) => (
              <div
                key={world.id}
                className={`group border border-neutral-800 rounded-lg px-2 py-1.5 cursor-pointer text-xs ${
                  selectedWorldId === world.id
                    ? "bg-neutral-900/80 border-emerald-500/60"
                    : "bg-neutral-950/40 hover:bg-neutral-900/40"
                }`}
                onClick={() => {
                  setSelectedWorldId(world.id);
                  fetchFichas(world.id);
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
                        handleDeleteWorld(world.id);
                      }}
                    >
                      Del
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-neutral-500 truncate">
                  id: {world.id}
                </div>
              </div>
            ))}
          </div>

          {/* Form de Mundo */}
          {worldFormMode !== "idle" && (
            <form
              onSubmit={handleSaveWorld}
              className="mt-3 border border-neutral-800 rounded-lg p-2 bg-neutral-950/60 space-y-2"
            >
              <div className="text-[11px] text-neutral-400 mb-1">
                {worldFormMode === "create"
                  ? "Novo Mundo"
                  : "Editar Mundo"}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500">ID</label>
                <input
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                  value={worldForm.id}
                  onChange={(e) =>
                    setWorldForm((prev) => ({ ...prev, id: e.target.value }))
                  }
                  placeholder="ex: aris, a_sala, arquivos_vermelhos"
                  disabled={worldFormMode === "edit"}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500">Nome</label>
                <input
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                  value={worldForm.nome}
                  onChange={(e) =>
                    setWorldForm((prev) => ({ ...prev, nome: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500">Descrição</label>
                <textarea
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                  rows={2}
                  value={worldForm.descricao}
                  onChange={(e) =>
                    setWorldForm((prev) => ({
                      ...prev,
                      descricao: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] text-neutral-500">Tipo</label>
                  <input
                    className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                    value={worldForm.tipo}
                    onChange={(e) =>
                      setWorldForm((prev) => ({
                        ...prev,
                        tipo: e.target.value,
                      }))
                    }
                    placeholder="meta_universo, projeto_mid..."
                  />
                </div>
                <div className="w-20 space-y-1">
                  <label className="text-[11px] text-neutral-500">
                    Ordem
                  </label>
                  <input
                    className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                    value={worldForm.ordem}
                    onChange={(e) =>
                      setWorldForm((prev) => ({
                        ...prev,
                        ordem: e.target.value,
                      }))
                    }
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={cancelWorldForm}
                  className="px-2 py-1 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-900/60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingWorld}
                  className="px-3 py-1 text-[11px] rounded bg-emerald-600 text-black font-medium hover:bg-emerald-500 disabled:opacity-60"
                >
                  {isSavingWorld ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          )}
        </aside>

        {/* Coluna 2: Fichas */}
        <section className="w-[32rem] border-r border-neutral-800 p-4 flex flex-col">
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
            <span className="text-neutral-200 font-medium">
              {worlds.find((w) => w.id === selectedWorldId)?.nome ||
                "(nenhum)"}
            </span>
          </div>

          <div className="flex-1 overflow-auto space-y-1 mb-3">
            {selectedWorldId == null && (
              <div className="text-[12px] text-neutral-500">
                Escolha um Mundo na coluna da esquerda.
              </div>
            )}

            {selectedWorldId != null && fichas.length === 0 && (
              <div className="text-[12px] text-neutral-500">
                Nenhuma ficha cadastrada para este Mundo.
              </div>
            )}

            {fichas.map((ficha) => (
              <div
                key={ficha.id}
                className={`group border border-neutral-800 rounded-lg px-3 py-2 cursor-pointer text-xs ${
                  selectedFichaId === ficha.id
                    ? "bg-neutral-900/80 border-emerald-500/60"
                    : "bg-neutral-950/40 hover:bg-neutral-900/40"
                }`}
                onClick={() => {
                  setSelectedFichaId(ficha.id);
                  fetchCodes(ficha.id);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-neutral-100">
                    {ficha.titulo}
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
                        handleDeleteFicha(ficha.id);
                      }}
                    >
                      Del
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-neutral-500 truncate">
                  slug: {ficha.slug || "(sem slug)"}
                </div>
                {ficha.resumo && (
                  <div className="text-[11px] text-neutral-400 mt-1 line-clamp-2">
                    {ficha.resumo}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Form de Ficha */}
          {fichaFormMode !== "idle" && (
            <form
              onSubmit={handleSaveFicha}
              className="border border-neutral-800 rounded-lg p-3 bg-neutral-950/60 space-y-2"
            >
              <div className="text-[11px] text-neutral-400 mb-1">
                {fichaFormMode === "create"
                  ? "Nova Ficha"
                  : "Editar Ficha"}
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
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] text-neutral-500">Slug</label>
                  <input
                    className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                    value={fichaForm.slug}
                    onChange={(e) =>
                      setFichaForm((prev) => ({
                        ...prev,
                        slug: e.target.value,
                      }))
                    }
                    placeholder="ex: aris-042-corredor"
                  />
                </div>
                <div className="w-32 space-y-1">
                  <label className="text-[11px] text-neutral-500">
                    Tipo
                  </label>
                  <input
                    className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                    value={fichaForm.tipo}
                    onChange={(e) =>
                      setFichaForm((prev) => ({
                        ...prev,
                        tipo: e.target.value,
                      }))
                    }
                    placeholder="registro_anomalo…"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500">Resumo</label>
                <textarea
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                  rows={2}
                  value={fichaForm.resumo}
                  onChange={(e) =>
                    setFichaForm((prev) => ({
                      ...prev,
                      resumo: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500">
                  Conteúdo
                </label>
                <textarea
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                  rows={3}
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

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={cancelFichaForm}
                  className="px-2 py-1 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-900/60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingFicha}
                  className="px-3 py-1 text-[11px] rounded bg-emerald-600 text-black font-medium hover:bg-emerald-500 disabled:opacity-60"
                >
                  {isSavingFicha ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Coluna 3: Códigos */}
        <section className="flex-1 p-4 flex flex-col">
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
            <span className="text-neutral-200 font-medium">
              {fichas.find((f) => f.id === selectedFichaId)?.titulo ||
                "(nenhuma)"}
            </span>
          </div>

          <div className="flex-1 overflow-auto space-y-1 mb-3">
            {selectedFichaId == null && (
              <div className="text-[12px] text-neutral-500">
                Escolha uma Ficha na coluna do meio.
              </div>
            )}

            {selectedFichaId != null && codes.length === 0 && (
              <div className="text-[12px] text-neutral-500">
                Nenhum código cadastrado para esta Ficha.
              </div>
            )}

            {codes.map((c) => (
              <div
                key={c.id}
                className="group border border-neutral-800 rounded-lg px-3 py-2 text-xs bg-neutral-950/40 hover:bg-neutral-900/40"
              >
                <div className="flex items-center justify-between">
                  <div className="font-mono text-xs text-emerald-300">
                    {c.code}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="text-[10px] px-1 py-0.5 rounded border border-neutral-700 hover:border-neutral-400"
                      onClick={() => startEditCode(c)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-1 py-0.5 rounded border border-red-700 text-red-300 hover:bg-red-900/40"
                      onClick={() => handleDeleteCode(c.id)}
                    >
                      Del
                    </button>
                  </div>
                </div>
                {c.label && (
                  <div className="text-[11px] text-neutral-200 mt-1">
                    {c.label}
                  </div>
                )}
                {c.description && (
                  <div className="text-[11px] text-neutral-400 mt-1 line-clamp-2">
                    {c.description}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Form de Código */}
          {codeFormMode !== "idle" && (
            <form
              onSubmit={handleSaveCode}
              className="border border-neutral-800 rounded-lg p-3 bg-neutral-950/60 space-y-2"
            >
              <div className="text-[11px] text-neutral-400 mb-1">
                {codeFormMode === "create"
                  ? "Novo Código"
                  : "Editar Código"}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500">
                  Código (string)
                </label>
                <input
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs font-mono"
                  value={codeForm.code}
                  onChange={(e) =>
                    setCodeForm((prev) => ({
                      ...prev,
                      code: e.target.value,
                    }))
                  }
                  placeholder="ex: TONO, LORE01, ARIS-SEGREDO…"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500">
                  Rótulo (label)
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
                  placeholder="Ex: Primeiro Sinal, Chave da ARIS…"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500">
                  Descrição
                </label>
                <textarea
                  className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs"
                  rows={3}
                  value={codeForm.description}
                  onChange={(e) =>
                    setCodeForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Explique rapidamente o que este código desbloqueia / faz."
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={cancelCodeForm}
                  className="px-2 py-1 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-900/60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCode}
                  className="px-3 py-1 text-[11px] rounded bg-emerald-600 text-black font-medium hover:bg-emerald-500 disabled:opacity-60"
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
