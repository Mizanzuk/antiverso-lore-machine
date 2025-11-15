
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content:
        "Eu sou Or, guardião do AntiVerso. Podemos começar uma nova história, revisar o lore ou organizar o que você já escreveu. Sobre o que você quer falar hoje?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || loading) return;

    const newUserMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: value,
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, newUserMessage].map((m) => ({
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
      setMessages((prev) => [...prev, answer]);
    } catch (err) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Houve um erro ao falar com Or. Verifique se suas chaves estão corretas e tente novamente.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setMessages([
      {
        id: "intro",
        role: "assistant",
        content:
          "Nova sessão iniciada. Sobre qual parte do AntiVerso você quer falar agora?",
      },
    ]);
    setInput("");
  }

  return (
    <div className="h-screen w-screen flex bg-[#050509] text-gray-100">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-white/10 bg-black/40">
        <div className="px-4 py-4 border-b border-white/10">
          <button
            onClick={newChat}
            className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
          >
            + Nova conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 text-xs text-gray-400 space-y-2">
          <p className="font-semibold text-gray-200 text-[11px] uppercase tracking-wide">
            AntiVerso Lore Machine
          </p>
          <p>
            Este ambiente é fechado e usa apenas os dados do AntiVerso que você
            subiu (banco JSON + bíblia). Or evita inventar fatos em modo de
            consulta, mas pode criar coisas novas quando você pedir.
          </p>
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
                Guardião do AntiVerso
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
              placeholder="Escreva aqui para Or. Ex: 'Quero criar uma nova história para Arquivos Vermelhos sobre um caso em rodovia'..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
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
            Or pode criar novas ideias ficcionais. Para consultar lore já
            definido, peça explicitamente: &quot;Em modo consulta, sem inventar
            nada, me diga…&quot;
          </p>
        </footer>
      </main>
    </div>
  );
}
