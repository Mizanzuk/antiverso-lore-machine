"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type World = {
  id: string;
  nome: string | null;
  descricao_curta?: string | null;
  descricao_longa?: string | null;
  ordem?: number | null;
  prefixo?: string | null;
  has_episodes?: boolean | null;
};

type SuggestedFicha = {
  id: string;
  tipo: string;
  titulo: string;
  resumo: string;
  conteudo: string;
  tags: string;
  aparece_em: string;
  codigo?: string;
};

type ApiFicha = {
  tipo?: string;
  titulo?: string;
  resumo?: string;
  conteudo?: string;
  tags?: string[];
  aparece_em?: string;
};

type ExtractResponse = {
  fichas: ApiFicha[];
};

function createEmptyFicha(id: string): SuggestedFicha {
  return {
    id,
    tipo: "",
    titulo: "",
    resumo: "",
    conteudo: "",
    tags: "",
    aparece_em: "",
    codigo: "",
  };
}

function normalizeEpisode(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(2, "0");
  }
  return trimmed;
}

function getWorldPrefix(world: World | null): string {
  if (!world) return "";
  if (world.prefixo && world.prefixo.trim()) {
    return world.prefixo.trim();
  }
  const nome = (world.nome || world.id || "").toUpperCase();
  const cleaned = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim();

  if (!cleaned) return "";

  if (cleaned.startsWith("ARQUIVOS VERMELHOS")) return "AV";
  if (cleaned.startsWith("TORRE DE VERA CRUZ")) return "TVC";
  if (cleaned.startsWith("EVANGELHO DE OR")) return "EO";
  if (cleaned.startsWith("ANTIVERSO")) return "ANT";
  if (cleaned.startsWith("ARIS")) return "ARIS";

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }
  const initials = words.map((w) => w[0]).join("");
  return initials.slice(0, 4).toUpperCase();
}

export default function LoreUploadPage() {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string>("");
  const [unitNumber, setUnitNumber] = useState<string>("");
  const [documentName, setDocumentName] = useState<string>("");
  const [text, setText] = useState<string>("");

  const [suggestedFichas, setSuggestedFichas] = useState<SuggestedFicha[]>([]);
  const [editingFicha, setEditingFicha] = useState<SuggestedFicha | null>(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [showNewWorldModal, setShowNewWorldModal] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [newWorldDescription, setNewWorldDescription] = useState("");
  const [newWorldHasEpisodes, setNewWorldHasEpisodes] = useState(true);
  const [isCreatingWorld, setIsCreatingWorld] = useState(false);

  useEffect(() => {
    async function fetchWorlds() {
      const { data, error } = await supabaseBrowser
        .from("worlds")
        .select("*")
        .order("ordem", { ascending: true });

      if (error) {
        console.error(error);
        setError("Erro ao carregar Mundos.");
        return;
      }

      const typed = (data || []) as World[];

      if (typed.length > 0) {
        setWorlds(typed);
        setSelectedWorldId(typed[0].id);
      } else {
        setWorlds([]);
        setSelectedWorldId("");
      }
    }

    fetchWorlds();
  }, []);

  function handleWorldChange(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;

    if (value === "create_new") {
      setShowNewWorldModal(true);
      return;
    }

    setSelectedWorldId(value);
  }

  async function handleCreateWorldFromModal() {
    if (!newWorldName.trim()) {
      setError("Dê um nome ao novo Mundo.");
      return;
    }

    setIsCreatingWorld(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data, error } = await supabaseBrowser
        .from("worlds")
        .insert([
          {
            nome: newWorldName.trim(),
            descricao_curta: newWorldDescription.trim() || null,
            has_episodes: newWorldHasEpisodes,
          },
        ])
        .select("*");

      if (error) {
        console.error(error);
        setError("Erro ao criar novo Mundo.");
        return;
      }

      const inserted = (data?.[0] || null) as World | null;

      if (inserted) {
        setWorlds((prev) => [...prev, inserted]);
        setSelectedWorldId(inserted.id);
        setShowNewWorldModal(false);
        setNewWorldName("");
        setNewWorldDescription("");
        setNewWorldHasEpisodes(true);
        setSuccessMessage("Novo Mundo criado com sucesso.");
      }
    } catch (err) {
      console.error(err);
      setError("Erro inesperado ao criar Mundo.");
    } finally {
      setIsCreatingWorld(false);
    }
  }

  function handleCancelWorldModal() {
    setShowNewWorldModal(false);
    setNewWorldName("");
    setNewWorldDescription("");
    setNewWorldHasEpisodes(true);
  }

  async function handleExtractFichas() {
    setError(null);
    setSuccessMessage(null);

    const world = worlds.find((w) => w.id === selectedWorldId) || null;
    const worldHasEpisodes = world?.has_episodes !== false;

    if (!selectedWorldId || !world) {
      setError("Selecione um Mundo antes de extrair fichas.");
      return;
    }
    if (worldHasEpisodes && !unitNumber.trim()) {
      setError("Informe o número do episódio/capítulo.");
      return;
    }
    if (!text.trim()) {
      setError("Cole um texto para extrair fichas.");
      return;
    }

    setIsExtracting(true);

    try {
      const selectedWorld = worlds.find((w) => w.id === selectedWorldId);
      const worldName =
        selectedWorld?.nome || selectedWorld?.id || "Mundo Desconhecido";

      const response = await fetch("/api/lore/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          worldId: selectedWorldId,
          worldName,
          documentName: documentName.trim() || null,
          unitNumber,
        }),
      });

      if (!response.ok) {
        console.error("Falha ao extrair fichas:", response.statusText);
        const errorData = await response.json().catch(() => null);
        const msg =
          errorData?.error ||
          `Erro ao extrair fichas (status ${response.status}).`;
        setError(msg);
        return;
      }

      const data = (await response.json()) as ExtractResponse;
      const rawFichas = data.fichas || [];

      const selected = worlds.find((w) => w.id === selectedWorldId) || null;
      const prefix = getWorldPrefix(selected);
      const normalizedEpisode = normalizeEpisode(unitNumber || "");
      let fichaCounter = 1;

      const mapped: SuggestedFicha[] = rawFichas.map((rawFicha) => {
        const base = createEmptyFicha(
          `${Date.now()}-${Math.random().toString(36).slice(2)}`
        );

        const titulo = rawFicha.titulo?.trim() || base.titulo;
        const tipo = rawFicha.tipo?.trim() || base.tipo;
        const resumo = rawFicha.resumo?.trim() || base.resumo;
        const conteudo = rawFicha.conteudo?.trim() || base.conteudo;
        const tagsArray = rawFicha.tags || [];
        const apareceEmRaw = rawFicha.aparece_em?.trim() || "";

        const tagsString = tagsArray.join(", ");

        const worldNameForAparece =
          selected?.nome || selected?.id || "Mundo Desconhecido";

        const appearsParts: string[] = [];

        if (worldNameForAparece) {
          appearsParts.push(`Mundo: ${worldNameForAparece}`);
        }

        if (normalizedEpisode) {
          appearsParts.push(`Episódio/Capítulo: ${normalizedEpisode}`);
        }

        if (documentName.trim()) {
          appearsParts.push(`Documento: ${documentName.trim()}`);
        }

        if (!normalizedEpisode && !documentName.trim() && apareceEmRaw) {
          appearsParts.push(apareceEmRaw);
        }

        const appearsEmValue = appearsParts.join("\n\n");

        let codigoGerado = "";
        if (prefix && normalizedEpisode) {
          const counterStr = String(fichaCounter).padStart(2, "0");
          codigoGerado = `${prefix}${normalizedEpisode}-PS${counterStr}`;
          fichaCounter += 1;
        }

        return {
          ...base,
          tipo,
          titulo,
          resumo,
          conteudo,
          tags: tagsString,
          aparece_em: appearsEmValue,
          codigo: codigoGerado,
        };
      });

      setSuggestedFichas(mapped);
      setSuccessMessage(
        `Foram extraídas ${mapped.length} fichas. Revise antes de salvar.`
      );
    } catch (err) {
      console.error("Erro inesperado ao extrair fichas:", err);
      setError("Erro inesperado ao extrair fichas.");
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSaveFichas() {
    setError(null);
    setSuccessMessage(null);

    if (suggestedFichas.length === 0) {
      setError("Não há fichas para salvar.");
      return;
    }

    if (!selectedWorldId) {
      setError("Selecione um Mundo antes de salvar fichas.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = suggestedFichas.map((f) => ({
        tipo: f.tipo,
        titulo: f.titulo,
        resumo: f.resumo,
        conteudo: f.conteudo,
        tags: f.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        aparece_em: f.aparece_em,
        codigo: f.codigo,
        world_id: selectedWorldId,
      }));

      const response = await fetch("/api/lore/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fichas: payload }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const msg =
          errorData?.error ||
          `Erro ao salvar fichas (status ${response.status}).`;
        setError(msg);
        return;
      }

      const data = await response.json();
      console.log("Fichas salvas:", data);

      setSuggestedFichas([]);
      setText("");
      setDocumentName("");
      setUnitNumber("");

      setSuccessMessage("Fichas salvas com sucesso!");
    } catch (err) {
      console.error("Erro inesperado ao salvar fichas:", err);
      setError("Erro inesperado ao salvar fichas.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleEditFicha(id: string) {
    const ficha = suggestedFichas.find((f) => f.id === id);
    if (!ficha) return;
    setEditingFicha({ ...ficha });
  }

  function applyEditingFicha() {
    if (!editingFicha) return;

    setSuggestedFichas((prev) =>
      prev.map((f) => (f.id === editingFicha.id ? { ...editingFicha } : f))
    );
    setEditingFicha(null);
  }

  function handleRemoveFicha(id: string) {
    setSuggestedFichas((prev) => prev.filter((f) => f.id !== id));
  }

  function handleClearAll() {
    setSuggestedFichas([]);
    setSuccessMessage(null);
  }

  const selectedWorld = worlds.find((w) => w.id === selectedWorldId) || null;
  const worldPrefix = getWorldPrefix(selectedWorld);
  const episode = normalizeEpisode(unitNumber || "");
  const worldHasEpisodes = selectedWorld?.has_episodes !== false;

  return (
    <div className="h-screen bg-black text-zinc-100 flex flex-col">
      {/* TOPO FIXO */}
      <header className="h-10 border-b border-white/10 flex items-center justify-between px-4 bg-black/40">
        <div className="flex items-center gap-4 text-xs">
          <a href="/" className="text-gray-300 hover:text-white">
            ← Voltar à Home
          </a>
          <a
            href="/lore-admin"
            className="text-gray-400 hover:text-white text-[11px]"
          >
            Ir para Catálogo
          </a>
        </div>
      </header>

      {/* ÁREA SCROLLÁVEL */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-4 py-8 space-y-6">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold">Upload de Texto</h1>
            <p className="text-sm text-zinc-400">
              Envie o texto de um episódio, capítulo ou documento. A Lore
              Machine extrai automaticamente fichas pertencentes ao Mundo
              escolhido, permitindo editar cada ficha antes de salvar no banco.
            </p>
          </header>

          {error && (
            <div className="rounded-md border border-red-500 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
          {successMessage && !error && (
            <div className="rounded-md border border-emerald-500 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
              {successMessage}
            </div>
          )}

          {/* Seleção de mundo e episódio */}
          <section className="grid grid-cols-1 md:grid-cols-[2fr,1fr] gap-3 items-center">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-zinc-400">
                Mundo de destino
              </label>
              <select
                className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
                value={selectedWorldId}
                onChange={handleWorldChange}
              >
                {worlds.map((world) => (
                  <option key={world.id} value={world.id}>
                    {world.nome ?? world.id}
                  </option>
                ))}
                <option value="create_new">+ Novo mundo...</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-zinc-400">
                Episódio / Capítulo / Documento #
              </label>
              <input
                className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder={
                  worldHasEpisodes
                    ? "Ex.: 6"
                    : "Este mundo não utiliza episódios"
                }
                disabled={!worldHasEpisodes}
              />
              {!worldHasEpisodes && (
                <p className="text-[11px] text-zinc-500">
                  Este mundo não utiliza episódios. Você pode deixar este campo
                  em branco.
                </p>
              )}
            </div>
          </section>

          {/* Nome do documento (opcional) */}
          <section className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-zinc-400">
              Nome do documento (opcional)
            </label>
            <input
              className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="Ex.: Episódio 6 — A Geladeira"
            />
          </section>

          {/* Texto */}
          <section className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-zinc-400">
              Texto do episódio / capítulo
            </label>
            <textarea
              className="w-full min-h-[180px] rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm leading-relaxed"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Cole aqui o texto a ser analisado..."
            />
          </section>

          {/* Botão de extrair */}
          <div className="flex justify-center">
            <button
              onClick={handleExtractFichas}
              disabled={isExtracting}
              className="w-full md:w-auto px-6 py-2 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-60 text-sm font-medium"
            >
              {isExtracting ? "Extraindo fichas..." : "Extrair fichas"}
            </button>
          </div>

          {/* Fichas sugeridas */}
          <section className="space-y-3 pb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
                Fichas sugeridas ({suggestedFichas.length})
              </h2>
              {suggestedFichas.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs text-zinc-400 hover:text-zinc-100 underline-offset-2 hover:underline"
                >
                  Limpar todas
                </button>
              )}
            </div>

            {suggestedFichas.length === 0 && (
              <p className="text-xs text-zinc-500">
                Nenhuma ficha sugerida ainda. Extraia fichas a partir de um
                texto para começar.
              </p>
            )}

            <div className="space-y-2">
              {suggestedFichas.map((ficha) => (
                <div
                  key={ficha.id}
                  className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">
                        {ficha.titulo || "(sem título)"}
                      </div>
                      <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                        {ficha.tipo || "conceito"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {ficha.codigo && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300 font-mono">
                          {ficha.codigo}
                        </span>
                      )}
                      <button
                        onClick={() => handleEditFicha(ficha.id)}
                        className="text-xs px-2 py-1 rounded-md border border-zinc-700 hover:bg-zinc-800"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleRemoveFicha(ficha.id)}
                        className="text-xs px-2 py-1 rounded-md border border-red-700 text-red-200 hover:bg-red-900/40"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  {ficha.resumo && (
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                      {ficha.resumo}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {suggestedFichas.length > 0 && (
              <div className="pt-3 flex justify-center">
                <button
                  onClick={handleSaveFichas}
                  disabled={isSaving}
                  className="w-full md:w-auto px-6 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm font-medium"
                >
                  {isSaving ? "Salvando fichas..." : "Salvar fichas"}
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modal de criação de novo mundo */}
      {showNewWorldModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md max-h-[90vh] overflow-auto border border-zinc-800 rounded-lg p-4 bg-zinc-950/95 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-zinc-400">Novo Mundo</div>
              <button
                type="button"
                onClick={handleCancelWorldModal}
                className="text-[11px] text-zinc-500 hover:text-zinc-200"
              >
                fechar
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-500">Nome</label>
              <input
                className="w-full rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs"
                value={newWorldName}
                onChange={(e) => setNewWorldName(e.target.value)}
                placeholder="Ex: Arquivos Vermelhos"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-500">Descrição</label>
              <textarea
                className="w-full rounded border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs min-h-[140px]"
                value={newWorldDescription}
                onChange={(e) => setNewWorldDescription(e.target.value)}
                placeholder="Resumo do Mundo…"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setNewWorldHasEpisodes((prev) => !prev)
                }
                className={`h-4 px-2 rounded border text-[11px] ${
                  newWorldHasEpisodes
                    ? "border-emerald-400 text-emerald-300 bg-emerald-400/10"
                    : "border-zinc-700 text-zinc-400 bg-black/40"
                }`}
              >
                Este mundo possui episódios
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancelWorldModal}
                className="px-3 py-1.5 rounded border border-zinc-700 text-[11px] text-zinc-300 hover:bg-zinc-800/60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateWorldFromModal}
                disabled={isCreatingWorld}
                className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-[11px] font-medium"
              >
                {isCreatingWorld ? "Criando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edição de ficha */}
      {editingFicha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-xl rounded-lg bg-zinc-950 border border-zinc-800 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Editar ficha</h2>
              <button
                className="text-xs text-zinc-400 hover:text-zinc-100"
                onClick={() => setEditingFicha(null)}
              >
                Fechar
              </button>
            </div>

            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Título
                </label>
                <input
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
                  value={editingFicha.titulo}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, titulo: e.target.value } : prev
                    )
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Tipo
                </label>
                <input
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
                  value={editingFicha.tipo}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, tipo: e.target.value } : prev
                    )
                  }
                  placeholder="Ex.: personagem, local, conceito, evento..."
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Resumo
                </label>
                <textarea
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm min-h-[60px]"
                  value={editingFicha.resumo}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, resumo: e.target.value } : prev
                    )
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Conteúdo
                </label>
                <textarea
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm min-h-[80px]"
                  value={editingFicha.conteudo}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, conteudo: e.target.value } : prev
                    )
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Tags (separadas por vírgula)
                </label>
                <input
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
                  value={editingFicha.tags}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, tags: e.target.value } : prev
                    )
                  }
                  placeholder="Ex.: religião, protagonista, fé"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Aparece em
                </label>
                <textarea
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm min-h-[72px]"
                  value={editingFicha.aparece_em}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, aparece_em: e.target.value } : prev
                    )
                  }
                  placeholder="Ex.: Episódio 6 — A Geladeira"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-400">
                  Código da ficha (gerado automaticamente, mas editável)
                </label>
                <input
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm font-mono"
                  value={editingFicha.codigo}
                  onChange={(e) =>
                    setEditingFicha((prev) =>
                      prev ? { ...prev, codigo: e.target.value } : prev
                    )
                  }
                  placeholder={
                    worldPrefix && episode
                      ? `${worldPrefix}${episode}-PS1`
                      : "Ex.: TS6-PS1"
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-3 py-1.5 rounded-md border border-zinc-700 text-xs hover:bg-zinc-800"
                onClick={() => setEditingFicha(null)}
              >
                Cancelar
              </button>
              <button
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-medium"
                onClick={applyEditingFicha}
              >
                Salvar alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
