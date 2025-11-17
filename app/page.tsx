"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { clsx } from "clsx";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatMode = "consulta" | "criativo";
type ViewMode = "chat" | "catalog";

type ChatSession = {
  id: string;
  title: string;
  mode: ChatMode;
  createdAt: number;
  messages: ChatMessage[];
};

type World = {
  id: string;
  nome: string;
  descricao?: string | null;
  tipo?: string | null;
  ordem?: number | null;
};

type LoreEntity = {
  id: string;
  slug: string;
  tipo: string;
  titulo: string;
  resumo?: string | null;
  world_id?: string | null;
  ano_diegese?: number | null;
  ordem_cronologica?: number | null;
  tags?: string[] | null;
  codes?: string[] | null;
};

type CatalogResponse = {
  worlds: World[];
  entities: LoreEntity[];
  types: { id: string; label: string }[];
};

function createIntroMessage(): ChatMessage {
  return {
    id: "intro",
    role: "assistant",
    content:
      "Eu sou Or, guardião do AntiVerso. Podemos começar uma nova história, revisar o lore ou organizar o que você já escreveu. Sobre o que você quer falar hoje?",
  };
}

export default function Page() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const id =
      typeof crypto !== "undefined" ? crypto.randomUUID() : "session-inicial";
    return [
      {
        id,
        title: "Nova conversa",
        mode: "consulta",
        createdAt: Date.now(),
        messages: [createIntroMessage()],
      },
    ];
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("chat");

  const [worlds, setWorlds] = useState<World[]>([]);
  const [entities, setEntities] = useState<LoreEntity[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [historySearchTerm, setHistorySearchTerm] = useState<string>("");

  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 20;

  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSessionId, sessions]);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const messages = activeSession?.messages ?? [];
  const mode: ChatMode = activeSession?.mode ?? "consulta";

  const filteredSessions = sessions.filter((s) => {
    if (!historySearchTerm.trim()) return true;
    const q = normalize(historySearchTerm);
    const inTitle = normalize(s.title).includes(q);
    const inMessages = s.messages.some((m) =>
      normalize(m.content).includes(q)
    );
    return inTitle || inMessages;
  });


  useEffect(() => {
    if (viewMode === "chat") {
      scrollToBottom();
    }
  }, [messages.length, viewMode]);

  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoadingCatalog(true);
        setCatalogError(null);
        const res = await fetch("/api/catalog");
        if (!res.ok) {
          throw new Error("Erro ao carregar catálogo");
        }
        const data = (await res.json()) as CatalogResponse;
        setWorlds(data.worlds ?? []);
        setEntities(data.entities ?? []);
      } catch (err) {
        console.error(err);
        setCatalogError(
          "Não foi possível carregar o catálogo do AntiVerso agora."
        );
      } finally {
        setLoadingCatalog(false);
      }
    }

    loadCatalog();
  }, []);

  // Se o usuário aplicar filtro de mundo/tipo/busca, automaticamente focamos no catálogo
  useEffect(() => {
    if (
      selectedWorldId !== "all" ||
      selectedType !== "all" ||
      searchTerm.trim().length > 0
    ) {
      setViewMode("catalog");
      setCurrentPage(1);
    }
  }, [selectedWorldId, selectedType, searchTerm]);

  async function onSubmit(e?: FormEvent) {
    if (e) {
      e.preventDefault();
    }
    const value = input.trim();
    if (!value || loading || !activeSession) return;

    const newUserMessage: ChatMessage = {
      id:
        typeof crypto !== "undefined"
          ? crypto.randomUUID()
          : Date.now().toString(),
      role: "user",
      content: value,
    };

    setInput("");

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSession.id) return s;
        const isFirstUserMessage =
          s.messages.filter((m) => m.role === "user").length === 0;
        return {
          ...s,
          title: isFirstUserMessage
            ? value.slice(0, 60)
            : s.title || "Conversa",
          messages: [...s.messages, newUserMessage],
        };
      })
    );

    setLoading(true);

    try {
      const systemPromptConsulta =
        "Você é Or, guardião do AntiVerso. Você está em MODO CONSULTA. Use apenas o lore existente fornecido pelo banco de dados (JSON + bíblia). Não invente fatos novos. Se não tiver certeza, diga que aquela informação ainda não está definida.";
      const systemPromptCriativo =
        "Você é Or, guardião do AntiVerso. Você está em MODO CRIATIVO. Você pode propor ideias novas de ficção, desde que respeitem a coerência do lore já estabelecido. Quando estiver extrapolando ou especulando, deixe isso claro para o usuário.";

      const systemPrompt =
        mode === "consulta" ? systemPromptConsulta : systemPromptCriativo;

      const payloadMessages = [
        { role: "system" as const, content: systemPrompt },
        ...activeSession.messages,
        newUserMessage,
      ].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages }),
      });

      if (!res.ok) {
        throw new Error("Erro ao chamar /api/chat");
      }

      const data = await res.json();

      const answer: ChatMessage = {
        id:
          typeof crypto !== "undefined"
            ? crypto.randomUUID()
            : `${Date.now()}-assistant`,
        role: "assistant",
        content: data.reply ?? "Algo deu errado ao gerar a resposta.",
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? { ...s, messages: [...s.messages, answer] }
            : s
        )
      );
      setViewMode("chat");
    } catch (err) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id:
          typeof crypto !== "undefined"
            ? crypto.randomUUID()
            : `${Date.now()}-error`,
        role: "assistant",
        content:
          "Houve um erro ao falar com Or. Verifique se suas chaves estão corretas e tente novamente.",
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? { ...s, messages: [...s.messages, errorMsg] }
            : s
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function scrollToBottom() {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  function newChat() {
    const id =
      typeof crypto !== "undefined" ? crypto.randomUUID() : `session-${Date.now()}`;
    const newSession: ChatSession = {
      id,
      title: "Nova conversa",
      mode: "consulta",
      createdAt: Date.now(),
      messages: [createIntroMessage()],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(id);
    setInput("");
    setViewMode("chat");
  }

  function handleModeChange(newMode: ChatMode) {
    if (!activeSession) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id ? { ...s, mode: newMode } : s
      )
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading) {
        void onSubmit();
      }
    }
  }

  function deleteSession(sessionId: string) {
    const ok = window.confirm("Tem certeza que quer excluir esta conversa?");
    if (!ok) return;

    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId);
      if (remaining.length === 0) {
        const id =
          typeof crypto !== "undefined"
            ? crypto.randomUUID()
            : `session-${Date.now()}`;
        return [
          {
            id,
            title: "Nova conversa",
            mode: "consulta",
            createdAt: Date.now(),
            messages: [createIntroMessage()],
          },
        ];
      }
      if (activeSessionId === sessionId && remaining[0]) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  }

  const catalogTypes: { id: string; label: string }[] = [
    { id: "all", label: "Todos os tipos" },
    { id: "personagem", label: "Personagens" },
    { id: "local", label: "Locais" },
    { id: "organizacao", label: "Empresas / Agências" },
    { id: "midia", label: "Mídias" },
    { id: "arquivo_aris", label: "Arquivos ARIS" },
    { id: "episodio", label: "Episódios" },
    { id: "evento", label: "Eventos" },
    { id: "conceito", label: "Conceitos" },
    { id: "objeto", label: "Objetos" },
  ];

  function normalize(str: string | null | undefined) {
    return (str ?? "").toLowerCase();
  }

  const filteredEntitiesAll = entities.filter((e) => {
    if (selectedWorldId !== "all" && e.world_id !== selectedWorldId) {
      return false;
    }
    if (selectedType !== "all" && e.tipo !== selectedType) {
      return false;
    }
    if (searchTerm.trim().length > 0) {
      const q = normalize(searchTerm);
      const inTitle = normalize(e.titulo).includes(q);
      const inResumo = normalize(e.resumo).includes(q);
      const inSlug = normalize(e.slug).includes(q);
      const inTags = (e.tags ?? [])
        .map((t) => t.toLowerCase())
        .some((t) => t.includes(q));
      const inCodes = (e.codes ?? [])
        .map((c) => c.toLowerCase())
        .some((c) => c.includes(q));
      if (!inTitle && !inResumo && !inSlug && !inTags && !inCodes) {
        return false;
      }
    }
    return true;
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredEntitiesAll.length / itemsPerPage)
  );
  const safePage =
    currentPage > totalPages ? totalPages : Math.max(1, currentPage);
  const startIndex = (safePage - 1) * itemsPerPage;
  const pageEntities = filteredEntitiesAll.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  function getWorldName(worldId?: string | null): string | null {
    if (!worldId) return null;
    const w = worlds.find((w) => w.id === worldId);
    return w ? w.nome : worldId;
  }

  function handleCatalogClick(entity: LoreEntity) {
    const titulo = entity.titulo;
    const prompt = `Em modo consulta, sem inventar nada, me diga o que já está definido sobre ${titulo}.`;
    setInput(prompt);
    setViewMode("chat");
  }

  function CatalogPagination() {
    if (totalPages <= 1) return null;
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    return (
      <div className="flex flex-wrap items-center justify-center gap-1 text-xs text-gray-300 my-2">
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => setCurrentPage(p)}
            className={clsx(
              "px-2 py-1 rounded-md border",
              p === safePage
                ? "bg-white/20 border-white text-white"
                : "bg-transparent border-white/20 hover:bg-white/10"
            )}
          >
            {p}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex bg-[#050509] text-gray-100">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-72 border-r border-white/10 bg-black/40">
        <div className="px-4 py-4 border-b border-white/10">
          <button
            onClick={newChat}
            className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
          >
            + Nova conversa
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 text-xs text-gray-400 space-y-4">
          <div>
            <p className="font-semibold text-gray-200 text-[11px] uppercase tracking-wide">
              AntiVerso Lore Machine
            </p>
            <p className="mt-1">
              Este ambiente é fechado e usa apenas os dados do AntiVerso que
              você subiu (banco JSON + bíblia). Or evita inventar fatos em modo
              de consulta, mas pode criar coisas novas quando você pedir.
            </p>
          </div>

          {/* Histórico de conversas */}
          <div>
            <p className="font-semibold text-gray-300 text-[11px] uppercase tracking-wide mb-1">
              Histórico
            </p>
            {sessions.length === 0 && (
              <p className="text-gray-500 text-[11px]">
                Nenhuma conversa ainda.
              </p>
            )}
            {sessions.length > 0 && (
              <>
                <input
                  className="mb-2 w-full bg-black/40 border border-white/15 rounded-md px-2 py-1 text-[11px] text-gray-200"
                  placeholder="Buscar no histórico..."
                  value={historySearchTerm}
                  onChange={(e) => setHistorySearchTerm(e.target.value)}
                />
                {filteredSessions.length === 0 && (
                  <p className="text-gray-500 text-[11px]">
                    Nenhuma conversa encontrada para essa busca.
                  </p>
                )}
                <div className="space-y-1">
                  {filteredSessions.map((session) => (
                    <div
                      key={session.id}
                      className={clsx(
                        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] cursor-pointer border border-transparent hover:border-white/20",
                        activeSession?.id === session.id
                          ? "bg-white/10 border-white/20"
                          : "bg-white/5"
                      )}
                    >
                      <button
                        className="flex-1 text-left"
                        onClick={() => {
                          setActiveSessionId(session.id);
                          setViewMode("chat");
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-gray-100">
                            {session.title || "Conversa"}
                          </span>
                          <span
                            className={clsx(
                              "shrink-0 rounded-full px-2 py-[1px] text-[10px] border",
                              session.mode === "consulta"
                                ? "border-emerald-500/50 text-emerald-300/90"
                                : "border-purple-500/60 text-purple-300/90"
                            )}
                          >
                            {session.mode === "consulta"
                              ? "Consulta"
                              : "Criativo"}
                          </span>
                        </div>
                      </button>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition text-[13px]"
                        onClick={() => deleteSession(session.id)}
                        aria-label="Excluir conversa"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Ferramentas de catálogo e upload */}
          <div className="border-t border-white/10 pt-3 mt-3">
            <p className="font-semibold text-gray-300 text-[11px] uppercase tracking-wide mb-2">
              Ferramentas
            </p>
            <div className="space-y-2">
              <a
                href="/lore-upload"
                className="block w-full text-left text-[11px] rounded-md border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-2"
              >
                <div className="font-semibold text-gray-100">
                  Upload de arquivo
                </div>
                <div className="text-[10px] text-gray-400">
                  Envie um texto para extrair fichas automaticamente.
                </div>
              </a>
              <a
                href="/lore-admin"
                className="block w-full text-left text-[11px] rounded-md border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-2"
              >
                <div className="font-semibold text-gray-100">
                  Catálogo completo
                </div>
                <div className="text-[10px] text-gray-400">
                  Gerencie mundos, fichas e códigos do AntiVerso.
                </div>
              </a>
            </div>
          </div>

        <div className="px-4 py-4 border-t border-white/10 text-xs text-gray-500">
          <p>Logado como Ivan.</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-12 border-b border-white/10 flex items-center justify-between px-4 bg-black/40">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-red-600 via-purple-500 to-blue-500" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Or</span>
              <span className="text-[11px] text-gray-400">
                Guardião do AntiVerso —{" "}
                {mode === "consulta" ? "Modo consulta" : "Modo criativo"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Modo:</span>
              <button
                onClick={() => handleModeChange("consulta")}
                className={clsx(
                  "px-2 py-1 rounded-full border text-xs",
                  mode === "consulta"
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-200"
                    : "bg-transparent border-white/20 text-gray-300 hover:bg-white/10"
                )}
              >
                Consulta
              </button>
              <button
                onClick={() => handleModeChange("criativo")}
                className={clsx(
                  "px-2 py-1 rounded-full border text-xs",
                  mode === "criativo"
                    ? "bg-purple-600/30 border-purple-400 text-purple-100"
                    : "bg-transparent border-white/20 text-gray-300 hover:bg-white/10"
                )}
              >
                Criativo
              </button>
            </div>

            <div className="flex items-center gap-1 border border-white/20 rounded-full p-[2px] bg-black/40">
              <button
                onClick={() => setViewMode("chat")}
                className={clsx(
                  "px-2 py-1 rounded-full text-[11px]",
                  viewMode === "chat"
                    ? "bg-white text-black"
                    : "text-gray-300 hover:bg-white/10"
                )}
              >
                Chat
              </button>
              <button
                onClick={() => setViewMode("catalog")}
                className={clsx(
                  "px-2 py-1 rounded-full text-[11px]",
                  viewMode === "catalog"
                    ? "bg-white text-black"
                    : "text-gray-300 hover:bg-white/10"
                )}
              >
                Catálogo
              </button>
            </div>
          </div>
        </header>

        {/* Conteúdo principal */}
        <section className="flex-1 overflow-y-auto px-4 py-4" ref={viewportRef}>
          <div className="max-w-4xl mx-auto">
            {viewMode === "chat" && (
              <div className="space-y-4 max-w-2xl mx-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={clsx(
                      "flex",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={clsx(
                        "rounded-2xl px-4 py-3 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap",
                        msg.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-white/5 text-gray-100 border border-white/10"
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {messages.length === 0 && (
                  <p className="text-center text-gray-500 text-sm mt-8">
                    Comece uma conversa com Or escrevendo abaixo.
                  </p>
                )}
              </div>
            )}

            {viewMode === "catalog" && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-100">
                  Catálogo do AntiVerso
                </h2>
                <p className="text-xs text-gray-400 mb-1">
                  {filteredEntitiesAll.length} entrada
                  {filteredEntitiesAll.length === 1 ? "" : "s"} encontrada
                  {selectedWorldId !== "all" && (
                    <>
                      {" "}
                      · Mundo:{" "}
                      <span className="text-gray-200">
                        {getWorldName(selectedWorldId) ?? selectedWorldId}
                      </span>
                    </>
                  )}
                  {selectedType !== "all" && (
                    <>
                      {" "}
                      · Tipo:{" "}
                      <span className="text-gray-200">
                        {
                          catalogTypes.find((t) => t.id === selectedType)
                            ?.label
                        }
                      </span>
                    </>
                  )}
                  {searchTerm.trim().length > 0 && (
                    <>
                      {" "}
                      · Busca:{" "}
                      <span className="text-gray-200">
                        “{searchTerm.trim()}”
                      </span>
                    </>
                  )}
                </p>

                <CatalogPagination />

                {pageEntities.length === 0 && (
                  <p className="text-sm text-gray-500 mt-4">
                    Nenhuma entrada para esses filtros. Tente limpar a busca ou
                    escolher outro mundo/tipo.
                  </p>
                )}

                {pageEntities.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pageEntities.map((entity) => (
                      <button
                        key={entity.id}
                        onClick={() => handleCatalogClick(entity)}
                        className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-3 text-sm transition"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-gray-50 truncate">
                            {entity.titulo}
                          </h3>
                          {entity.tipo && (
                            <span className="text-[10px] uppercase tracking-wide px-2 py-[2px] rounded-full border border-white/20 text-gray-200">
                              {entity.tipo}
                            </span>
                          )}
                        </div>

                        {entity.resumo && (
                          <p className="text-xs text-gray-300 line-clamp-3 mb-2">
                            {entity.resumo}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-1 text-[10px] text-gray-400">
                          {getWorldName(entity.world_id) && (
                            <span className="px-2 py-[1px] rounded-full bg-white/5">
                              {getWorldName(entity.world_id)}
                            </span>
                          )}
                          {(entity.codes ?? []).map((code) => (
                            <span
                              key={code}
                              className="px-2 py-[1px] rounded-full bg-black/40 border border-white/20 text-[10px]"
                            >
                              {code}
                            </span>
                          ))}
                          {(entity.tags ?? []).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-[1px] rounded-full bg-black/30 border border-white/10"
                            >
                              #{tag}
                            </span>
                          ))}
                          {entity.ano_diegese && (
                            <span className="ml-auto text-[10px] text-gray-400">
                              Ano diegético: {entity.ano_diegese}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <CatalogPagination />
              </div>
            )}
          </div>
        </section>

        {/* Input de chat */}
        <footer className="border-t border-white/10 px-4 py-3 bg-black/40">
          <form
            onSubmit={(e) => {
              void onSubmit(e);
            }}
            className="max-w-2xl mx-auto flex items-end gap-2"
          >
            <textarea
              className="flex-1 resize-none rounded-xl border border-white/20 bg-black/60 px-3 py-2 text-sm outline-none focus:border-white/40 max-h-32 min-h-[44px]"
              placeholder="Escreva aqui para Or. Ex: 'Quero criar uma nova história para Arquivos Vermelhos sobre um caso em rodovia'..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={1}
              onKeyDown={handleKeyDown}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white text-black px-3 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Pensando..." : "Enviar"}
            </button>
          </form>
          <p className="mt-2 text-[11px] text-center text-gray-500">
            Enter envia. Use Shift+Enter para quebrar linha. Use o modo
            Catálogo para navegar pelos mundos, personagens, arquivos ARIS,
            episódios e conceitos. Clique em um card para trazer o assunto para
            o chat.
          </p>
        </footer>
      </main>
    </div>
  );
}
