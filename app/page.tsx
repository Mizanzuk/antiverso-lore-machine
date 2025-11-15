"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
} from "react";
import { clsx } from "clsx";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type Mode = "consulta" | "criativo";

type Conversation = {
  id: string;
  title: string;
  mode: Mode;
  createdAt: string;
  messages: ChatMessage[];
};

const STORAGE_KEY = "av_lore_conversations_v1";

function createIntroMessage(): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content:
      "Eu sou Or, guardião do AntiVerso. Por padrão estou em modo CONSULTA, usando apenas o lore existente. Podemos começar uma nova história, revisar o lore ou organizar o que você já escreveu. Se quiser que eu comece a propor ideias novas de ficção, diga algo como: 'entre no modo criativo'.",
  };
}

function createNewConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "Nova conversa",
    mode: "consulta",
    createdAt: new Date().toISOString(),
    messages: [createIntroMessage()],
  };
}

export default function Page() {
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null
  );
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Carregar histórico do localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Conversation[];
        if (parsed.length > 0) {
          setConversations(parsed);
          setCurrentId(parsed[0].id);
          return;
        }
      }
    } catch (e) {
      console.warn("Erro ao ler conversas do localStorage:", e);
    }

    const first = createNewConversation();
    setConversations([first]);
    setCurrentId(first.id);
  }, []);

  // Salvar no localStorage sempre que as conversas mudarem
  useEffect(() => {
    if (!conversations || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (e) {
      console.warn("Erro ao salvar conversas no localStorage:", e);
    }
  }, [conversations]);

  if (!conversations || !currentId) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#050509] text-gray-200">
        Carregando Or…
      </div>
    );
  }

  const current = conversations.find((c) => c.id === currentId)!;
  const messages = current.messages;
  const mode = current.mode;

  // Scroll automático pro fim
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [currentId, messages.length, loading]);

  function updateCurrentConversation(
    updater: (conv: Conversation) => Conversation
  ) {
    setConversations((prev) =>
      (prev ?? []).map((c) => (c.id === currentId ? updater(c) : c))
    );
  }

  function handleNewChat() {
    const conv = createNewConversation();
    setConversations((prev) => [conv, ...(prev ?? [])]);
    setCurrentId(conv.id);
    setInput("");
  }

  function handleSelectConversation(id: string) {
    setCurrentId(id);
    setInput("");
  }

  async function onSubmit(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!current) return;

    const value = input.trim();
    if (!value || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: value,
    };

    // Detectar mudança de modo a partir do texto digitado
    const lower = value.toLowerCase();
    let newMode: Mode = mode;
    if (lower.includes("modo criativo")) {
      newMode = "criativo";
    } else if (lower.includes("modo consulta")) {
      newMode = "consulta";
    }

    // Atualizar conversa atual com a nova mensagem + modo
    updateCurrentConversation((conv) => {
      const newMessages = [...conv.messages, userMsg];
      const newTitle =
        conv.title === "Nova conversa" && conv.messages.length === 1
          ? value.slice(0, 60)
          : conv.title;

      return {
        ...conv,
        title: newTitle,
        mode: newMode,
        messages: newMessages,
      };
    });

    setInput("");
    setLoading(true);

    try {
      // Mensagem de sistema descrevendo o modo atual para o modelo
      const modeSystemMessage: ChatMessage = {
        id: "mode-system",
        role: "system",
        content:
          newMode === "consulta"
            ? "MODO ATUAL: CONSULTA. Responda apenas com base no lore fornecido. Não invente fatos novos sobre o AntiVerso. Se algo não existir no lore, diga explicitamente que ainda não foi definido."
            : "MODO ATUAL: CRIATIVO. Ajude a criar e expandir o AntiVerso, propondo ideias novas coerentes com o lore existente. Quando propor algo novo, deixe claro que é 'proposta de novo elemento de lore'.",
      };

      const payloadMessages: ChatMessage[] = [
        modeSystemMessage,
        ...messages,
        userMsg,
      ];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payloadMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error("Erro ao chamar /api/chat");
      }

      const data = await res.json();
      const answer: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply ?? "Algo deu errado ao gerar a resposta.",
      };

      updateCurrentConversation((conv) => ({
        ...conv,
        mode: newMode,
        messages: [...conv.messages, answer],
      }));
    } catch (err) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Houve um erro ao falar com Or. Verifique se suas chaves estão corretas e tente novamente.",
      };
      updateCurrentConversation((conv) => ({
        ...conv,
        messages: [...conv.messages, errorMsg],
      }));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter = enviar / Shift+Enter = quebra de linha
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="h-screen w-screen flex bg-[#050509] text-gray-100">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-72 border-r border-white/10 bg-black/40">
        <div className="px-4 py-4 border-b border-white/10 flex items-center gap-2">
          <button
            onClick={handleNewChat}
            className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
          >
            + Nova conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 text-xs text-gray-400 space-y-4 scrollbar-thin">
          <div>
            <p className="font-semibold text-gray-200 text-[11px] uppercase tracking-wide">
              AntiVerso Lore Machine
            </p>
            <p className="mt-1">
              Este ambiente é fechado e usa apenas os dados do AntiVerso que
              você subiu (banco JSON + bíblia).
            </p>
            <p className="mt-1">
              O modo padrão é{" "}
              <span className="font-semibold">CONSULTA</span>. Para entrar em
              modo criativo, basta escrever algo contendo
              &quot;modo criativo&quot; na conversa. Para voltar, mencione
              &quot;modo consulta&quot;.
            </p>
          </div>

          <div className="pt-2 border-t border-white/10">
            <p className="font-semibold text-gray-200 text-[11px] uppercase tracking-wide mb-2">
              Histórico de conversas
            </p>
            <div className="space-y-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={clsx(
                    "w-full text-left rounded-md px-2 py-2 text-[11px] leading-snug border border-transparent hover:border-white/20 hover:bg-white/5 transition",
                    conv.id === currentId && "border-white/30 bg-white/5"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {conv.title === "Nova conversa"
                        ? "Nova conversa"
                        : conv.title}
                    </span>
                    <span
                      className={clsx(
                        "ml-1 inline-flex items-center rounded-full px-2 py-[1px] text-[10px] font-semibold",
                        conv.mode === "consulta"
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                          : "bg-purple-500/10 text-purple-300 border border-purple-500/40"
                      )}
                    >
                      {conv.mode === "consulta" ? "CONSULTA" : "CRIATIVO"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-4 py-4 border-t border-white/10 text-xs text-gray-500">
          <p>Logado como Ivan.</p>
        </div>
      </aside>

      {/* Main chat */}
      <main className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-12 border-b border-white/10 flex items-center justify-between px-4 bg-black/40">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-red-600 via-purple-500 to-cyan-400" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">Or</span>
              <span className="text-[11px] text-gray-400">
                Guardião do AntiVerso —{" "}
                {mode === "consulta" ? "Modo consulta" : "Modo criativo"}
              </span>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div
          ref={viewportRef}
          className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-6 space-y-4 scrollbar-thin"
        >
          {messages.map((m) => {
            const isUser = m.role === "user";
            const name = isUser ? "Ivan" : "Or";
            return (
              <div
                key={m.id}
                className={clsx(
                  "flex w-full gap-3",
                  isUser ? "justify-end" : "justify-start"
                )}
              >
                {!isUser && (
                  <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-red-600 via-purple-500 to-cyan-400 flex items-center justify-center text-xs font-bold">
                    O
                  </div>
                )}
                <div
                  className={clsx(
                    "max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed",
                    isUser
                      ? "bg-[#1f2933] text-gray-100 rounded-br-none"
                      : "bg-[#111827] text-gray-100 border border-white/10 rounded-bl-none"
                  )}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    {name}
                  </div>
                  <div>{m.content}</div>
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex gap-3 items-center text-xs text-gray-400">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-red-600 via-purple-500 to-cyan-400 flex items-center justify-center text-xs font-bold">
                O
              </div>
              <span>Or está pensando…</span>
            </div>
          )}
        </div>

        {/* Input */}
        <footer className="border-t border-white/10 bg-black/40 px-3 md:px-4 py-3">
          <form
            onSubmit={onSubmit}
            className="flex items-end gap-2 max-w-3xl mx-auto"
          >
            <textarea
              className="flex-1 resize-none rounded-xl border border-white/15 bg-[#050509] px-3 py-2 text-sm outline-none focus:border-white/40 max-h-32 min-h-[44px]"
              placeholder={
                mode === "consulta"
                  ? "Você está em modo CONSULTA. Ex: 'Me lembre tudo o que já está definido sobre a ARIS.'"
                  : "Você está em modo CRIATIVO. Ex: 'Me sugira 3 novos arquivos ARIS ligados à BR-116 em 2003.'"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center justify-center rounded-lg bg-white text-black text-sm px-4 py-2 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Enviar
            </button>
          </form>
          <p className="mt-2 text-[11px] text-center text-gray-500">
            Enter envia a mensagem. Use Shift+Enter para quebrar a linha.
          </p>
        </footer>
      </main>
    </div>
  );
}
