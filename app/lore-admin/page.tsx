"use client";

import React, { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type ViewState = "loading" | "loggedOut" | "loggedIn";

export default function LoreAdminPage() {
  const [view, setView] = useState<ViewState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Verifica se já existe usuário logado (cookie/localStorage do Supabase)
  useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabaseBrowser.auth.getUser();

      if (error || !data?.user) {
        setView("loggedOut");
        return;
      }

      setUserEmail(data.user.email ?? null);
      setView("loggedIn");
    };

    checkSession();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { data, error } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setUserEmail(data.user?.email ?? null);
    setView("loggedIn");
  }

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    setUserEmail(null);
    setView("loggedOut");
  }

  // TELAS -------------------------------------------------------------

  // Tela de loading inicial
  if (view === "loading") {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-neutral-200">
        <div className="text-sm text-neutral-500">Carregando AntiVerso Admin…</div>
      </div>
    );
  }

  // Tela de login
  if (view === "loggedOut") {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-neutral-100">
        <div className="w-full max-w-sm border border-neutral-800 rounded-2xl p-6 bg-neutral-950/80 shadow-lg">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-1">
            AntiVerso Lore Machine
          </div>
          <h1 className="text-lg font-semibold mb-1">Acesso ao painel admin</h1>
          <p className="text-[13px] text-neutral-400 mb-4">
            Faça login com o usuário configurado no Supabase para editar Mundos e Fichas.
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
              Esta tela usa Supabase Auth (email + senha). Depois vamos amarrar isso com
              regras de acesso às tabelas (RLS).
            </p>
          </form>
        </div>
      </div>
    );
  }

  // Tela logada (esqueleto do painel admin)
  return (
    <div className="h-screen flex flex-col bg-black text-neutral-100">
      {/* Top bar */}
      <header className="h-12 border-b border-neutral-800 flex items-center justify-between px-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            AntiVerso Lore Machine — Admin
          </div>
          <div className="text-[11px] text-neutral-500">
            /lore-admin – painel de Mundos, Fichas e Códigos
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

      {/* Conteúdo do painel (por enquanto placeholder) */}
      <main className="flex-1 flex">
        <aside className="w-72 border-r border-neutral-800 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500 mb-2">
            Navegação
          </div>
          <ul className="space-y-1 text-sm text-neutral-300">
            <li className="px-2 py-1 rounded-md bg-neutral-900/80">
              Mundos &gt; Fichas &gt; Códigos
            </li>
            <li className="px-2 py-1 rounded-md hover:bg-neutral-900/60 cursor-default text-neutral-500">
              (Em breve) CRUD completo aqui
            </li>
          </ul>
        </aside>

        <section className="flex-1 p-6">
          <h2 className="text-lg font-semibold mb-2">
            Bem-vindo ao painel do AntiVerso
          </h2>
          <p className="text-sm text-neutral-300 mb-4 max-w-xl">
            Nesta tela vamos construir, passo a passo, o editor de{" "}
            <span className="font-medium">Mundos</span>,{" "}
            <span className="font-medium">Fichas</span> e{" "}
            <span className="font-medium">Códigos</span>.
          </p>

          <div className="border border-dashed border-neutral-800 rounded-xl p-4 text-sm text-neutral-400 bg-neutral-950/60">
            <p className="mb-1">
              ✅ Autenticação com Supabase funcionando.
            </p>
            <p className="mb-1">
              Próximo passo: carregar a lista de <strong>Mundos</strong> a partir do
              banco e permitir <strong>criar / editar / deletar</strong> Mundos e Fichas
              por aqui.
            </p>
            <p>
              Ou seja: este é o esqueleto do painel. Agora que o login está pronto e
              testado, partimos para o CRUD.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
