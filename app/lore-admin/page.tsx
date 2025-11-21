"use client";

import React, { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type ViewState = "loading" | "loggedOut" | "loggedIn";

type WorldFormMode = "idle" | "create" | "edit";
type FichaFormMode = "idle" | "create" | "edit";
type CodeFormMode = "idle" | "create" | "edit";

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
    case "personagem":
      return "PS";
    case "local":
      return "LC";
    case "empresa":
      return "EM";
    case "agencia":
      return "AG";
    case "midia":
      return "MD";
    case "conceito":
      return "CC";
    case "epistemologia":
      return "EP";
    case "evento":
      return "EV";
    case "regra_de_mundo":
      return "RM";
    default:
      return key.slice(0, 2).toUpperCase() || "XX";
  }
}

export default function LoreAdminPage() {
  const [view, setView] = useState<ViewState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [worlds, setWorlds] = useState<any[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [fichas, setFichas] = useState<any[]>([]);
  const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);
  const [codes, setCodes] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [fichaFilterTipos, setFichaFilterTipos] = useState<string[]>([]);

  const [fichasSearchTerm, setFichasSearchTerm] = useState<string>("");

  const [worldFormMode, setWorldFormMode] =
    useState<WorldFormMode>("idle");
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

  const [fichaFormMode, setFichaFormMode] =
    useState<FichaFormMode>("idle");
  const [isSavingFicha, setIsSavingFicha] = useState(false);
  const [fichaForm, setFichaForm] = useState<{
    id: string;
    titulo: string;
    slug: string;
    tipo: string;
    resumo: string;
    conteudo: string;
    tags: string;
    ano_diegese: string;
    ordem_cronologica: string;
    aparece_em: string;
    codigo: string;
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
    codigo: "",
  });

  const [codeFormMode, setCodeFormMode] =
    useState<CodeFormMode>("idle");
  const [isSavingCode, setIsSavingCode] = useState(false);
  const [codeForm, setCodeForm] = useState<{
    id: string;
    code: string;
    label: string;
    description: string;
    episode: string;
  }>({
    id: "",
    code: "",
    label: "",
    description: "",
    episode: "",
  });

  const [worldViewModal, setWorldViewModal] = useState<any | null>(null);
  const [fichaViewModal, setFichaViewModal] = useState<any | null>(null);

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

  async function fetchAllData() {
    try {
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
      console.error(err);
      setError("Erro inesperado ao carregar dados.");
      setIsLoadingData(false);
    }
  }

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
      codigo: "",
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
      codigo: ficha.codigo ?? "",
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
      codigo: "",
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
      codigo: fichaForm.codigo.trim() || null,
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

    // Primeiro, apagar códigos associados a esta ficha (para não violar FK)
    const { error: deleteCodesError } = await supabaseBrowser
      .from("codes")
      .delete()
      .eq("ficha_id", fichaId);

    if (deleteCodesError) {
      console.error(deleteCodesError);
      setError("Erro ao deletar códigos vinculados à Ficha.");
      return;
    }

    // Depois, apagar a ficha em si
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
      episode: "",
    });
  }

  function startEditCode(code: any) {
    let episode = "";
    if (typeof code.code === "string") {
      const m = code.code.match(/^[A-Z]{2}(\d+)-[A-Z]{2}\d+$/);
      if (m && m[1]) {
        episode = m[1];
      }
    }
    setCodeFormMode("edit");
    setCodeForm({
      id: code.id ?? "",
      code: code.code ?? "",
      label: code.label ?? "",
      description: code.description ?? "",
      episode,
    });
  }

  function cancelCodeForm() {
    setCodeFormMode("idle");
    setCodeForm({
      id: "",
      code: "",
      label: "",
      description: "",
      episode: "",
    });
  }

  async function handleSaveCode(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFichaId) {
      setError("Selecione uma Ficha antes de salvar um Código.");
      return;
    }
    if (codeFormMode === "idle") return;

    setIsSavingCode(true);
    setError(null);

    const selectedWorld =
      worlds.find((w) => w.id === selectedWorldId) || null;
    const selectedFicha =
      fichas.find((f) => f.id === selectedFichaId) || null;

    let finalCode = codeForm.code.trim();

    // GERAÇÃO AUTOMÁTICA
    if (!finalCode) {
      const episodeRaw = codeForm.episode.trim();
      if (!selectedWorld || !selectedFicha) {
        setError(
          "Não foi possível gerar o código: selecione um Mundo e uma Ficha.",
        );
        setIsSavingCode(false);
        return;
      }
      if (!episodeRaw) {
        setError(
          'Para gerar o código automaticamente, preencha o campo "Episódio".',
        );
        setIsSavingCode(false);
        return;
      }
      if (!selectedFicha.tipo) {
        setError(
          'Para gerar o código automaticamente, defina o "Tipo" da Ficha (personagem, local, etc.).',
        );
        setIsSavingCode(false);
        return;
      }

      const worldPrefix = getWorldPrefix(selectedWorld.nome);
      const tipoPrefix = getTipoPrefix(selectedFicha.tipo);
      const episodeNumber = episodeRaw;

      const basePrefix = `${worldPrefix}${episodeNumber}-${tipoPrefix}`;

      const { data: existingCodes, error: existingError } =
        await supabaseBrowser
          .from("codes")
          .select("code")
          .like("code", `${basePrefix}%`);

      if (existingError) {
        console.error(existingError);
        setError("Erro ao gerar código automaticamente.");
        setIsSavingCode(false);
        return;
      }

      let maxIndex = 0;
      (existingCodes || []).forEach((row) => {
        const c = row.code as string;
        if (typeof c === "string" && c.startsWith(basePrefix)) {
          const suffix = c.slice(basePrefix.length);
          const n = parseInt(suffix, 10);
          if (!Number.isNaN(n) && n > maxIndex) {
            maxIndex = n;
          }
        }
      });

      const nextIndex = maxIndex + 1;
      finalCode = `${basePrefix}${nextIndex}`;
    }

    if (!finalCode) {
      setError("Código precisa de um valor.");
      setIsSavingCode(false);
      return;
    }

    const payload: any = {
      ficha_id: selectedFichaId,
      code: finalCode,
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

  const selectedWorld =
    worlds.find((w) => w.id === selectedWorldId) || null;

  const dynamicTipos = Array.from(
    new Set<string>([
      ...KNOWN_TIPOS,
      ...fichas
        .map((f) => (f.tipo || "").toLowerCase())
        .filter((t) => !!t),
    ]),
  );

  const selectedFicha = fichas.find((f) => f.id === selectedFichaId) || null;

  const filteredFichas = fichas.filter((f) => {
    // filtro por tipo
    if (fichaFilterTipos.length > 0) {
      const t = (f.tipo || "").toLowerCase();
      if (!t || !fichaFilterTipos.includes(t)) {
        return false;
      }
    }

    // filtro por busca
    if (fichasSearchTerm.trim().length > 0) {
      const q = fichasSearchTerm.toLowerCase();
      const inTitulo = (f.titulo || "").toLowerCase().includes(q);
      const inResumo = (f.resumo || "").toLowerCase().includes(q);
      const inTags = (Array.isArray(f.tags) ? f.tags.join(",") : (f.tags || ""))
        .toLowerCase()
        .includes(q);
      if (!inTitulo && !inResumo && !inTags) {
        return false;
      }
    }

    return true;
  });

  function toggleFilterTipo(tipo: string) {
    const t = tipo.toLowerCase();
    setFichaFilterTipos((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

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
    <div className="h-screen bg-black text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-900 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="text-[11px] text-neutral-300 hover:text-white"
          >
            ← Voltar à Home
          </a>
          <a
            href="/lore-upload"
            className="text-[11px] text-neutral-400 hover:text-white"
          >
            Ir para Upload
          </a>
        </div>

        <button
          onClick={handleLogout}
          className="text-[11px] px-3 py-1 rounded-full border border-neutral-700 text-neutral-300 hover:text-emerald-300 hover:border-emerald-500 transition-colors"
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
        {/* Mundos */}
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
                onDoubleClick={() => setWorldViewModal(world)}
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
        </section>

        {/* Fichas */}
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

          <div className="mb-2">
            <input
              className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-[11px]"
              placeholder="Buscar fichas por título, resumo ou tags…"
              value={fichasSearchTerm}
              onChange={(e) => setFichasSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px]">
            <span className="text-neutral-500">Filtrar por tipo:</span>
            <button
              type="button"
              onClick={() => setFichaFilterTipos([])}
              className={`px-2 py-0.5 rounded-full border ${
                fichaFilterTipos.length === 0
                  ? "border-emerald-500 text-emerald-300 bg-emerald-500/10"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
              }`}
            >
              Todos
            </button>
            {dynamicTipos.map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => toggleFilterTipo(tipo)}
                className={`px-2 py-0.5 rounded-full border ${
                  fichaFilterTipos.includes(tipo)
                    ? "border-emerald-500 text-emerald-300 bg-emerald-500/10"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {tipo === "personagem"
                  ? "Personagens"
                  : tipo === "local"
                  ? "Locais"
                  : tipo === "agencia"
                  ? "Agências"
                  : tipo === "empresa"
                  ? "Empresas"
                  : tipo === "midia"
                  ? "Mídia"
                  : tipo === "conceito"
                  ? "Conceitos"
                  : tipo === "epistemologia"
                  ? "Epistemologia"
                  : tipo === "evento"
                  ? "Eventos"
                  : tipo === "regra_de_mundo"
                  ? "Regras de mundo"
                  : tipo}
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
                onDoubleClick={() => setFichaViewModal(ficha)}
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
        </section>

        
        {/* Detalhes da Ficha */}
        <section className="flex-1 p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              Detalhes da Ficha
            </h2>
            {selectedFicha && (
              <button
                onClick={() => startEditFicha(selectedFicha)}
                className="text-[11px] px-2 py-1 rounded-full border border-neutral-700 hover:border-emerald-500 hover:text-emerald-300 transition-colors"
              >
                Editar
              </button>
            )}
          </div>

          {!selectedFicha ? (
            <div className="text-[11px] text-neutral-500">
              Selecione uma ficha na coluna do meio para ver os detalhes aqui.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              <div className="space-y-1">
                <div className="text-[11px] text-neutral-500">Título</div>
                <div className="text-sm text-neutral-100 font-medium">
                  {selectedFicha.titulo}
                </div>
              </div>

              {selectedFicha.tipo && (
                <div className="space-y-1">
                  <div className="text-[11px] text-neutral-500">Tipo</div>
                  <div className="text-[12px] text-neutral-200">
                    {selectedFicha.tipo}
                  </div>
                </div>
              )}

              {selectedFicha.slug && (
                <div className="space-y-1">
                  <div className="text-[11px] text-neutral-500">Slug</div>
                  <div className="text-[12px] text-neutral-300">
                    {selectedFicha.slug}
                  </div>
                </div>
              )}

              {selectedFicha.codigo && (
                <div className="space-y-1">
                  <div className="text-[11px] text-neutral-500">Código</div>
                  <div className="text-[12px] text-neutral-300">
                    {selectedFicha.codigo}
                  </div>
                </div>
              )}

              {selectedFicha.resumo && (
                <div className="space-y-1">
                  <div className="text-[11px] text-neutral-500">Resumo</div>
                  <div className="text-[12px] text-neutral-200 whitespace-pre-line">
                    {selectedFicha.resumo}
                  </div>
                </div>
              )}

              {selectedFicha.conteudo && (
                <div className="space-y-1">
                  <div className="text-[11px] text-neutral-500">Conteúdo</div>
                  <div className="text-[12px] text-neutral-300 whitespace-pre-line">
                    {selectedFicha.conteudo}
                  </div>
                </div>
              )}

              {selectedFicha.tags && (
                <div className="space-y-1">
                  <div className="text-[11px] text-neutral-500">Tags</div>
                  <div className="text-[12px] text-neutral-300">
                    {selectedFicha.tags}
                  </div>
                </div>
              )}

              {selectedFicha.aparece_em && (
                <div className="space-y-1">
                  <div className="text-[11px] text-neutral-500">
                    Aparece em
                  </div>
                  <div className="text-[12px] text-neutral-300 whitespace-pre-line">
                    {selectedFicha.aparece_em}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-neutral-500">Códigos</div>
                  {selectedFicha && (
                    <button
                      onClick={startCreateCode}
                      className="text-[11px] px-2 py-1 rounded-full border border-neutral-700 hover:border-emerald-500 hover:text-emerald-300 transition-colors"
                    >
                      + Novo código
                    </button>
                  )}
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
                        className="group border border-neutral-800 rounded-md px-2 py-1 text-[11px]"
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
                )}
              </div>
            </div>
          )}
        </section>
      </main>


      {/* Modais de leitura – Mundo */}
      {worldViewModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80">
          <div className="w-full max-w-md max-h-[90vh] overflow-auto border border-neutral-800 rounded-lg p-4 bg-neutral-950/95 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] text-neutral-400">
                Mundo – visão geral
              </div>
              <button
                type="button"
                onClick={() => setWorldViewModal(null)}
                className="text-[11px] text-neutral-500 hover:text-neutral-200"
              >
                fechar
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] text-neutral-500">Nome</div>
              <div className="text-sm text-neutral-100 font-medium">
                {worldViewModal.nome}
              </div>
            </div>

            {worldViewModal.descricao && (
              <div className="space-y-1">
                <div className="text-[11px] text-neutral-500">
                  Descrição
                </div>
                <div className="text-[12px] text-neutral-200 whitespace-pre-line">
                  {worldViewModal.descricao}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWorldViewModal(null)}
                className="px-3 py-1 text-[11px] rounded border border-neutral-700 text-neutral-300 hover:border-neutral-500"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  startEditWorld(worldViewModal);
                  setWorldViewModal(null);
                }}
                className="px-3 py-1 text-[11px] rounded bg-emerald-500 text-black font-medium hover:bg-emerald-400"
              >
                Editar
              </button>
            </div>
          </div>
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
