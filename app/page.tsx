"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { clsx } from "clsx";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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
  universeId?: string; 
};

type World = {
  id: string;
  nome: string;
  descricao?: string | null;
  tipo?: string | null;
  ordem?: number | null;
};

type Universe = {
  id: string;
  nome: string;
  descricao?: string | null;
};

type LoreEntity = {
  id: string;
  slug: string;
  tipo: string;
  titulo: string;
  resumo?: string | null;
  world_id?: string | null;
  ano_diegese?: number | null;
  // ordem_cronologica removida do tipo também
  tags?: string | null; // Pode vir como string do banco
  codes?: string[] | null; // Códigos não vêm direto da ficha nessa rota simplificada, mas mantemos tipo
};

type CatalogResponse = {
  worlds: World[];
  entities: any[]; // Usando any para flexibilidade no frontend
  types: { id: string; label: string }[];
};

type ViewState = "loading" | "loggedOut" | "loggedIn";

// --- PERSONAS ---
const PERSONAS = {
  consulta: {
    nome: "Urizen",
    titulo: "A Lei (Consulta)",
    intro: "Eu sou Urizen, a Lei deste AntiVerso. Minha função é garantir a coerência dos Registros. O que você quer analisar hoje?",
    styles: {
      color: "text-emerald-200",
      bg: "bg-emerald-900/20",
      header: "bg-gradient-to-tr from-cyan-600 via-emerald-500 to-blue-500",
      button: "bg-emerald-500/20 border-emerald-400 text-emerald-200",
    }
  },
  criativo: {
    nome: "Urthona",
    titulo: "O Fluxo (Criativo)",
    intro: "Eu sou Urthona, o Forjador. Minha forja está pronta para criar e expandir as narrativas. Qual a próxima história?",
    styles: {
      color: "text-purple-100",
      bg: "bg-purple-900/30",
      header: "bg-gradient-to-tr from-fuchsia-600 via-purple-500 to-pink-500",
      button: "bg-purple-600/30 border-purple-400 text-purple-100",
    }
  }
};

function createIntroMessage(mode: ChatMode): ChatMessage {
  const persona = PERSONAS[mode];
  return {
    id: "intro",
    role: "assistant",
    content: persona.intro,
  };
}

function normalize(str: string | null | undefined) {
  return (str ?? "").toLowerCase();
}

const SESSION_STORAGE_KEY = "antiverso-lore-sessions-v2";
const MAX_MESSAGES_PER_SESSION = 32;
const MAX_SESSIONS = 40;

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "os", "as", "um", "uma", "uns", "umas",
  "que", "por", "para", "com", "na", "no", "nas", "nos", "em", "se", "sobre", "como",
  "qual", "quais", "quando", "onde", "porque", "porquê", "ser", "tem", "ter", "vai",
  "vou", "tá", "tava", "está", "estao", "estão", "quero", "queria", "querer", "novo",
  "nova", "novas", "novos", "historia", "história", "historias", "histórias", "contar",
  "conta", "coisa", "coisas", "lista", "listas", "faca", "facas", "ideia", "ideias",
  "pode", "poder", "fazer", "faco", "faço", "fiz", "feito", "usar", "uso", "ajudar",
  "explicar", "mostrar", "gerar", "criar", "montar", "continuar", "seguir", "comecar", "começar",
]);

function trimMessagesForStorage(messages: ChatMessage[]): ChatMessage[] {
  if (!messages || messages.length <= MAX_MESSAGES_PER_SESSION) return messages;
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");
  const allowedNonSystem = Math.max(0, MAX_MESSAGES_PER_SESSION - systemMessages.length);
  const tailNonSystem = nonSystem.slice(-allowedNonSystem);
  return [...systemMessages, ...tailNonSystem];
}

function buildTitleFromQuestion(text: string): string {
  const raw = (text || "").trim();
  if (!raw) return "Nova conversa";

  const compact = raw.replace(/\s+/g, " ");
  const normalized = compact.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const rawWords = compact.split(" ");
  const normWords = normalized.split(" ");
  const keywords: string[] = [];
  const MAX_KEYWORDS = 4;

  for (let i = 0; i < normWords.length; i++) {
    if (keywords.length >= MAX_KEYWORDS) break;
    const n = normWords[i];
    const ascii = n.replace(/[^a-z0-9]/g, "");
    if (!ascii || ascii.length < 3) continue;
    if (STOPWORDS.has(ascii)) continue;
    const original = rawWords[i].replace(/^["'“”‘’]+/, "");
    if (!original) continue;
    const capitalized = original.charAt(0).toUpperCase() + original.slice(1);
    if (!keywords.some((k) => k.toLowerCase() === capitalized.toLowerCase())) {
      keywords.push(capitalized);
    }
  }

  let title = keywords.length > 0 ? keywords.join(" · ") : compact;
  const MAX_LEN = 60;
  if (title.length > MAX_LEN) {
    title = title.slice(0, MAX_LEN - 1).trimEnd() + "…";
  }
  return title || "Nova conversa";
}

export default function Page() {
  const [view, setView] = useState<ViewState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [remoteLoaded, setRemoteLoaded] = useState(false);

  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState<string>(() => {
    // Tentar carregar do localStorage ao inicializar
    if (typeof window !== "undefined") {
      return localStorage.getItem("selectedUniverseId") || "";
    }
    return "";
  }); 
  
  const [showUniverseModal, setShowUniverseModal] = useState(false);
  const [newUniverseName, setNewUniverseName] = useState("");
  const [newUniverseDesc, setNewUniverseDesc] = useState("");
  const [isCreatingUniverse, setIsCreatingUniverse] = useState(false);
  
  const [showEditUniModal, setShowEditUniModal] = useState(false);
  const [editUniForm, setEditUniForm] = useState({ id: "", nome: "", descricao: "" });
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  
  const [viewMode, setViewMode] = useState<ViewMode>("chat"); 
  const [historySearchTerm, setHistorySearchTerm] = useState<string>("");
  
  // Estados de Catálogo
  const [worlds, setWorlds] = useState<World[]>([]);
  const [entities, setEntities] = useState<LoreEntity[]>([]);
  const [catalogTypes, setCatalogTypes] = useState<{id: string, label: string}[]>([]);
  
  const [selectedWorldId, setSelectedWorldId] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 20;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const typingIntervalRef = useRef<number | null>(null);

  // --- 1. AUTH ---
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error } = await supabaseBrowser.auth.getSession();
      if (error || !session) {
        setView("loggedOut");
      } else {
        setUserId(session.user.id);
        setView("loggedIn");
        loadUniverses();
      }
    };
    checkSession();
  }, []);

  // --- 2. LOADERS ---
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
           setSessions(parsed.map((s: ChatSession) => ({
              ...s,
              messages: s.messages.map(m => m.id === "intro" ? createIntroMessage(s.mode || "consulta") : m)
           })) as ChatSession[]);
        }
      }
    } catch (err) { console.error(err); }
  }, []);

  async function loadUniverses() {
    const { data } = await supabaseBrowser.from("universes").select("id, nome, descricao").order("nome");
    if (data && data.length > 0) {
      setUniverses(data);
      // Priorizar universo salvo no localStorage
      const savedUniId = typeof window !== "undefined" ? localStorage.getItem("selectedUniverseId") : null;
      const lastUsedUni = sessions.filter(s => s.universeId).pop()?.universeId;
      const initialUniId = 
        (savedUniId && data.some(u => u.id === savedUniId)) ? savedUniId :
        (lastUsedUni && data.some(u => u.id === lastUsedUni)) ? lastUsedUni : 
        data[0].id;
      setSelectedUniverseId(initialUniId);
      if (typeof window !== "undefined") localStorage.setItem("selectedUniverseId", initialUniId); 
    } else {
        setUniverses([]);
        setSelectedUniverseId("");
        setSessions([]);
        setShowUniverseModal(true); 
    }
  }

  // Carrega Catálogo (agora seguro, passando userId)
  async function loadCatalog() {
    if (!userId) return;
    try {
      setLoadingCatalog(true);
      setCatalogError(null);
      const res = await fetch(`/api/catalog?universeId=${selectedUniverseId}`, {
        headers: { "x-user-id": userId } // HEADER DE SEGURANÇA
      });
      if (!res.ok) throw new Error("Erro ao carregar catálogo");
      const data = (await res.json()) as CatalogResponse;
      setWorlds(data.worlds ?? []);
      setEntities(data.entities ?? []);
      
      // Carrega tipos dinâmicos se houver
      if(data.types && data.types.length > 0) {
          // Adiciona opção "Todos"
          setCatalogTypes([{ id: "all", label: "Todos os tipos" }, ...data.types]);
      } else {
          // Fallback
          setCatalogTypes([
            { id: "all", label: "Todos os tipos" },
            { id: "personagem", label: "Personagens" },
            { id: "local", label: "Locais" },
            { id: "evento", label: "Eventos" }
          ]);
      }

    } catch (err) {
      console.error(err);
      setCatalogError("Não foi possível carregar o catálogo do AntiVerso agora.");
    } finally {
      setLoadingCatalog(false);
    }
  }

  // Trigger de carga do catálogo
  useEffect(() => {
    if (viewMode === "catalog" && userId) {
        loadCatalog();
    }
  }, [viewMode, userId]); 

  // --- 3. CHAT CORE ---
  const newChatCallback = useCallback((newMode: ChatMode = "consulta", uniId: string | null = selectedUniverseId) => {
    if (!uniId) {
        if (universes.length === 0) setShowUniverseModal(true);
        else alert("Selecione um Universo para iniciar uma nova conversa.");
        return;
    }
    const id = typeof crypto !== "undefined" ? crypto.randomUUID() : `session-${Date.now()}`;
    const newSession: ChatSession = { 
      id, 
      title: "Nova conversa", 
      mode: newMode, 
      createdAt: Date.now(), 
      messages: [createIntroMessage(newMode)],
      universeId: uniId 
    };
    setSessions((prev) => { const merged = [newSession, ...prev]; if (merged.length > MAX_SESSIONS) return merged.slice(0, MAX_SESSIONS); return merged; });
    setActiveSessionId(id); setInput("");
    setViewMode("chat");
  }, [selectedUniverseId, universes.length]);
  
  const newChat = (newMode: ChatMode = "consulta") => newChatCallback(newMode, selectedUniverseId);

  const handleModeChange = (newMode: ChatMode) => { 
    if (activeSession?.mode === newMode) return;
    newChatCallback(newMode, selectedUniverseId);
  }

  // --- EFEITOS E PERSISTÊNCIA ---
  useEffect(() => {
    if (!selectedUniverseId) {
        setActiveSessionId(null);
        return;
    }
    const relevantSessions = sessions.filter(s => s.universeId === selectedUniverseId);
    const activeIsRelevant = activeSessionId && relevantSessions.some(s => s.id === activeSessionId);
    if (!activeIsRelevant && relevantSessions.length > 0) {
        setActiveSessionId(relevantSessions[0].id);
    } else if (!activeIsRelevant && selectedUniverseId && view === "loggedIn") {
        newChatCallback("consulta", selectedUniverseId);
    }
  }, [selectedUniverseId, sessions, view, activeSessionId, newChatCallback]);

  useEffect(() => {
    if (view !== "loggedIn" || !userId || remoteLoaded) return;
    const loadRemote = async () => {
      try {
        const { data, error } = await supabaseBrowser.from("chat_states").select("data").eq("user_id", userId).limit(1);
        if (error) return;
        if (data && data.length > 0 && data[0]?.data) {
          const remote = data[0].data as ChatSession[];
          if (Array.isArray(remote) && remote.length > 0) setSessions(remote);
        }
      } catch (err) { console.error(err); } finally { setRemoteLoaded(true); }
    };
    loadRemote();
  }, [view, userId, remoteLoaded]);

  useEffect(() => {
    if (view !== "loggedIn" || !userId) return;
    const saveRemote = async () => {
      try {
        const sanitized = sessions.map((s) => ({ ...s, messages: trimMessagesForStorage(s.messages) }));
        await supabaseBrowser.from("chat_states").upsert({ user_id: userId, data: sanitized, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      } catch (err) { console.error(err); }
    };
    saveRemote();
  }, [sessions, view, userId]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? (sessions.length > 0 ? sessions[0] : null);
  const messages = activeSession?.messages ?? [];
  const mode: ChatMode = activeSession?.mode ?? "consulta";
  const persona = PERSONAS[mode];

  const filteredSessions = sessions.filter((s) => {
    if (selectedUniverseId && s.universeId !== selectedUniverseId) return false;
    if (!historySearchTerm.trim()) return true;
    const q = normalize(historySearchTerm);
    const inTitle = normalize(s.title).includes(q);
    const inMessages = s.messages.some((m) => normalize(m.content).includes(q));
    return inTitle || inMessages;
  });

  useEffect(() => {
    if (viewMode === "chat") scrollToBottom();
  }, [messages.length, viewMode]);

  // --- UTILS ---
  function renderAssistantMarkdown(text: string) {
    const lines = text.split(/\r?\n/);
    const blocks: JSX.Element[] = [];
    let currentList: string[] = [];
    const flushList = () => {
      if (!currentList.length) return;
      blocks.push(<ul className="list-disc pl-5 space-y-1">{currentList.map((item, idx) => <li key={idx} className="leading-relaxed">{applyBoldInline(item)}</li>)}</ul>);
      currentList = [];
    };
    lines.forEach((rawLine) => {
      const line = rawLine || "";
      if (line.startsWith("### ")) {
        flushList();
        const content = line.slice(4).trim();
        if (content) blocks.push(<h3 key={blocks.length} className="text-sm font-semibold mt-3 mb-1 text-gray-100">{applyBoldInline(content)}</h3>);
        return;
      }
      if (/^\s*[-*] /.test(line)) {
        const item = line.replace(/^\s*[-*] /, "").trim();
        if (item) currentList.push(item);
        return;
      }
      if (!line.trim()) { flushList(); return; }
      flushList();
      blocks.push(<p key={blocks.length} className="mb-2 last:mb-0 leading-relaxed text-gray-100">{applyBoldInline(line)}</p>);
    });
    flushList();
    if (!blocks.length) return <p className="leading-relaxed text-gray-100 whitespace-pre-wrap">{text}</p>;
    return <div className="space-y-3">{blocks}</div>;
  }

  function applyBoldInline(text: string) {
    const parts = text.split(/(\*{1,2}[^*]+\*{1,2})/g);
    return parts.map((part, idx) => {
      const match = part.match(/^\*{1,2}([^*]+)\*{1,2}$/);
      if (match) return <strong key={idx} className="font-semibold">{match[1]}</strong>;
      return <span key={idx}>{part}</span>;
    });
  }

  async function onSubmit(e?: FormEvent) {
    if (e) e.preventDefault();
    const value = input.trim();
    if (!value || loading || !activeSession || !selectedUniverseId) {
        if (!selectedUniverseId) setShowUniverseModal(true);
        return;
    }
    if (typingIntervalRef.current !== null) {
      window.clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    const newUserMessage: ChatMessage = {
      id: typeof crypto !== "undefined" ? crypto.randomUUID() : Date.now().toString(),
      role: "user",
      content: value,
    };
    const placeholderId = typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-assistant-placeholder`;
    const placeholderAssistant: ChatMessage = { id: placeholderId, role: "assistant", content: "" };
    setInput("");
    setSessions((prev) => prev.map((s) => {
      if (s.id !== activeSession.id) return s;
      const hadUserBefore = s.messages.some((m) => m.role === "user");
      const updatedMessages = trimMessagesForStorage([...s.messages, newUserMessage, placeholderAssistant]);
      let newTitle = s.title;
      if (!hadUserBefore && s.title === "Nova conversa") newTitle = buildTitleFromQuestion(newUserMessage.content);
      return { ...s, title: newTitle, messages: updatedMessages, mode: s.mode ?? "consulta" };
    }));
    setLoading(true);

    try {
      const currentUniName = universes.find(u => u.id === selectedUniverseId)?.nome || "neste universo";
      const currentPersona = PERSONAS[mode].nome;
      const currentPersonaTitle = PERSONAS[mode].titulo;
      const systemPromptBase = `Você é ${currentPersona}, o ${currentPersonaTitle} de ${currentUniName}. Você está em MODO ${mode.toUpperCase()}.`;
      const systemPromptConsulta = systemPromptBase + ` Use apenas o lore existente fornecido pelo banco de dados local. Não invente fatos novos e nem traga informações de outras mídias se não estiverem no contexto. Se não tiver certeza, diga que aquela informação ainda não está definida neste universo.`;
      const systemPromptCriativo = systemPromptBase + ` Você pode propor ideias novas de ficção para ${currentUniName}, desde que respeitem a coerência do lore já estabelecido aqui.`;
      const systemPrompt = mode === "consulta" ? systemPromptConsulta : systemPromptCriativo;
      
      const contextMessages = trimMessagesForStorage([...activeSession.messages, newUserMessage]);
      const payloadMessages = [{ role: "system" as const, content: systemPrompt }, ...contextMessages].map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", { 
        method: "POST", 
        headers: { 
            "Content-Type": "application/json",
            "x-user-id": userId || "" // Envia ID para fallback
        }, 
        body: JSON.stringify({ 
          messages: payloadMessages,
          universeId: selectedUniverseId || null 
        }) 
      });
      
      if (!res.ok) throw new Error("Erro ao chamar /api/chat");

      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          fullText += chunk;
          setSessions((prev) => prev.map((s) => {
            if (s.id !== activeSession.id) return s;
            return { ...s, messages: s.messages.map(m => m.id === placeholderId ? { ...m, content: fullText } : m) };
          }));
          scrollToBottom();
        }
        setLoading(false);
        return;
      }
      const data = await res.json();
      const fullReply: string = typeof data?.reply === "string" ? data.reply : "Algo deu errado ao gerar a resposta.";
      let index = 0; const step = 10; const delay = 20;
      typingIntervalRef.current = window.setInterval(() => {
        index += step;
        const slice = fullReply.slice(0, index);
        setSessions((prev) => prev.map((s) => s.id === activeSession.id ? { ...s, messages: s.messages.map((m) => m.id === placeholderId ? { ...m, content: slice } : m) } : s));
        scrollToBottom();
        if (index >= fullReply.length) {
          if (typingIntervalRef.current !== null) { window.clearInterval(typingIntervalRef.current); typingIntervalRef.current = null; }
          setLoading(false);
        }
      }, delay);
    } catch (err) {
      if (typingIntervalRef.current !== null) { window.clearInterval(typingIntervalRef.current); typingIntervalRef.current = null; }
      const errorText = "Houve um erro ao falar com o assistente. Verifique se suas chaves estão corretas e tente novamente.";
      setSessions((prev) => prev.map((s) => s.id === activeSession.id ? { ...s, messages: s.messages.map((m) => m.id === placeholderId ? { ...m, content: errorText } : m) } : s));
      setLoading(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault(); setAuthSubmitting(true); setAuthError(null);
    try {
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
      if (error) { setAuthError(error.message); setView("loggedOut"); setUserId(null); return; }
      if (data?.session) { 
          setUserId(data.session.user.id);
          setView("loggedIn"); 
          loadUniverses(); 
      } else { 
          setView("loggedOut"); setUserId(null); 
      }
    } catch (err: any) { setAuthError(err.message ?? "Erro ao fazer login"); setView("loggedOut"); setUserId(null); } finally { setAuthSubmitting(false); }
  }

  async function handleLogout() {
    try { await supabaseBrowser.auth.signOut(); } catch (err) { console.error(err); } 
    finally { setView("loggedOut"); setUserId(null); setEmail(""); setPassword(""); setSessions([]); setActiveSessionId(null); setRemoteLoaded(false); }
  }

  function scrollToBottom() { const el = viewportRef.current; if (!el) return; el.scrollTop = el.scrollHeight; }
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!loading && selectedUniverseId) void onSubmit(); } }
  function startRenameSession(sessionId: string, currentTitle: string) { setRenamingSessionId(sessionId); setRenameDraft(currentTitle); }
  function confirmRenameSession() { if (!renamingSessionId) return; const newTitle = renameDraft.trim(); if (!newTitle) { setRenamingSessionId(null); setRenameDraft(""); return; } setSessions((prev) => prev.map((s) => s.id === renamingSessionId ? { ...s, title: newTitle } : s)); setRenamingSessionId(null); setRenameDraft(""); }
  function cancelRenameSession() { setRenamingSessionId(null); setRenameDraft(""); }
  
  async function deleteUniverse(uniId: string) {
    if (!uniId) return;
    const a = Math.floor(Math.random() * 10), b = Math.floor(Math.random() * 10);
    const currentUni = universes.find(u => u.id === uniId);
    if (!confirm(`ATENÇÃO: Apagar o universo "${currentUni?.nome}" deletará TODOS os mundos, fichas e histórico de chat vinculados a ele.\nTem certeza?`)) return;
    const ans = prompt(`Confirmação de segurança: quanto é ${a} + ${b}?`);
    if (ans !== String(a + b)) { alert("Captcha incorreto. Deleção abortada."); return; }
    try {
        const { error: worldError } = await supabaseBrowser.from("worlds").delete().eq("universe_id", uniId);
        if (worldError) throw worldError;
        const { error: uniError } = await supabaseBrowser.from("universes").delete().eq("id", uniId);
        if (uniError) throw uniError;
        setSessions(prev => prev.filter(s => s.universeId !== uniId));
        loadUniverses();
    } catch (e: any) { alert("Falha ao deletar Universo. Verifique as permissões de RLS. Erro: " + e.message); }
  }

  async function saveEditUniverse() {
    if (!editUniForm.id || !editUniForm.nome.trim()) return alert("Nome do universo é obrigatório");
    try {
        const { error } = await supabaseBrowser.from("universes").update({ nome: editUniForm.nome.trim(), descricao: editUniForm.descricao.trim() || null }).eq("id", editUniForm.id);
        if (error) throw error;
        setUniverses(prev => prev.map(u => u.id === editUniForm.id ? { ...u, nome: editUniForm.nome.trim(), descricao: editUniForm.descricao.trim() || null } : u));
        setShowEditUniModal(false);
    } catch (e: any) { alert("Falha ao editar Universo: " + e.message); }
  }

  function deleteSession(sessionId: string) {
    const ok = window.confirm("Tem certeza que quer excluir esta conversa?"); if (!ok) return;
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId);
      if (remaining.length === 0) { 
        if (selectedUniverseId) newChatCallback("consulta", selectedUniverseId);
        return prev.filter(s => s.id !== sessionId); 
      }
      if (activeSessionId === sessionId && remaining[0]) setActiveSessionId(remaining[0].id);
      return remaining;
    });
  }

  async function createUniverse() {
    if (!newUniverseName.trim()) return alert("Nome do universo é obrigatório");
    setIsCreatingUniverse(true);
    try {
        const { data: uniData, error: uniError } = await supabaseBrowser.from("universes").insert({ nome: newUniverseName.trim(), descricao: newUniverseDesc.trim() || null }).select().single();
        if (uniError || !uniData) { alert("Erro ao criar universo: " + (uniError?.message || "Erro desconhecido.")); return; }
        const rootId = newUniverseName.trim().toLowerCase().replace(/\s+/g, "_") + "_root_" + Date.now();
        const { error: worldError } = await supabaseBrowser.from("worlds").insert({ id: rootId, nome: uniData.nome, universe_id: uniData.id, is_root: true, tipo: "meta_universo", ordem: 0, has_episodes: false });
        if (worldError) { alert("Erro ao criar Mundo Raiz. Verifique as permissões de RLS no Supabase. Erro: " + (worldError?.message || "Erro desconhecido.")); return; }
        setUniverses(prev => [...prev, uniData]);
        setSelectedUniverseId(uniData.id);
        setShowUniverseModal(false);
        setNewUniverseName("");
        setNewUniverseDesc("");
        newChatCallback("consulta", uniData.id);
    } catch(e: any) { alert("Falha inesperada durante a criação do universo: " + e.message); } finally { setIsCreatingUniverse(false); }
  }

  const filteredEntitiesAll = entities.filter((e) => {
    if (selectedWorldId !== "all" && e.world_id !== selectedWorldId) return false;
    if (selectedType !== "all" && e.tipo !== selectedType) return false;
    if (searchTerm.trim().length > 0) {
      const q = normalize(searchTerm);
      const inTitle = normalize(e.titulo).includes(q);
      const inResumo = normalize(e.resumo).includes(q);
      const inSlug = normalize(e.slug).includes(q);
      const inTags = (e.tags ?? "").toLowerCase().includes(q); // tags pode ser string
      if (!inTitle && !inResumo && !inSlug && !inTags) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredEntitiesAll.length / itemsPerPage));
  const safePage = currentPage > totalPages ? totalPages : Math.max(1, currentPage);
  const startIndex = (safePage - 1) * itemsPerPage;
  const pageEntities = filteredEntitiesAll.slice(startIndex, startIndex + itemsPerPage);

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

  const CatalogPagination = () => {
    if (totalPages <= 1) return null;
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    return (
      <div className="flex flex-wrap items-center justify-center gap-1 text-xs text-gray-300 my-2">
        {pages.map((p) => (<button key={p} onClick={() => setCurrentPage(p)} className={clsx("px-2 py-1 rounded-md border", p === safePage ? "bg-white/20 border-white text-white" : "bg-transparent border-white/20 hover:bg-white/10")}>{p}</button>))}
      </div>
    );
  };

  const currentUniverseName = universes.find(u => u.id === selectedUniverseId)?.nome || "Or";
  const selectedUniverseData = universes.find(u => u.id === selectedUniverseId);

  if (view === "loading") return <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center"><div className="text-xs text-neutral-500">Carregando…</div></div>;
  if (view === "loggedOut") return (<div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center"><form onSubmit={handleLogin} className="border border-neutral-800 rounded-lg p-6 w-[320px] bg-neutral-950/80"><h1 className="text-sm font-semibold mb-2 tracking-[0.18em] uppercase text-neutral-400">AntiVerso Lore Machine</h1><p className="text-[11px] text-neutral-500 mb-4">Acesse com seu e-mail e senha de admin.</p>{authError && <div className="mb-3 text-[11px] text-red-400 bg-red-950/40 border border-red-900 rounded px-2 py-1">{authError}</div>}<div className="space-y-2 mb-3"><div><label className="block text-[11px] text-neutral-500 mb-1">E-mail</label><input type="email" className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div><div><label className="block text-[11px] text-neutral-500 mb-1">Senha</label><input type="password" className="w-full rounded border border-neutral-800 bg-black/60 px-2 py-1 text-xs" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div></div><button type="submit" disabled={authSubmitting} className="w-full mt-1 text-[11px] px-3 py-1.5 rounded border border-emerald-500 bg-emerald-600/80 hover:bg-emerald-400 hover:border-emerald-400 hover:text-black transition-colors disabled:opacity-60">{authSubmitting ? "Entrando…" : "Entrar"}</button></form></div>);

  return (
    <div className="h-screen w-screen flex bg-[#050509] text-gray-100">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-72 border-r border-white/10 bg-black/40">
        
        {/* SEÇÃO DE UNIVERSO */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex flex-col gap-2">
            {universes.length === 0 ? (
                <button 
                  onClick={() => setShowUniverseModal(true)}
                  className="w-full rounded-md border border-emerald-500 bg-emerald-600/20 px-3 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-600/40 transition"
                >
                    + Novo Universo
                </button>
            ) : (
                <div className="relative group">
                    <div className="flex items-center justify-between group/header">
                        <div className="relative flex-1 mr-2 cursor-pointer">
                            <div className="font-bold text-sm text-white flex items-center gap-2 hover:text-emerald-400 transition-colors">
                                {currentUniverseName}
                                <span className="text-[10px] text-zinc-500">▼</span>
                            </div>
                            <select 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                value={selectedUniverseId || ""}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === "__new__") {
                                        setShowUniverseModal(true);
                                        e.target.value = selectedUniverseId || "";
                                    } else {
                                         setSelectedUniverseId(value);
                                        // Salvar no localStorage
                                        localStorage.setItem("selectedUniverseId", value);
                                    }
                                }}
                            >
                                {universes.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                                <option value="__new__" className="font-bold text-emerald-400">+ Novo Universo...</option>
                            </select>
                        </div>

                        {selectedUniverseId && (
                            <div className="flex gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity">
                                <button
                                    onClick={() => { 
                                        if (selectedUniverseData) {
                                            setEditUniForm({ id: selectedUniverseId, nome: selectedUniverseData.nome, descricao: selectedUniverseData.descricao || "" });
                                            setShowEditUniModal(true); 
                                        }
                                    }}
                                    className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 text-[10px]"
                                    title="Editar Universo"
                                >
                                    ✎
                                </button>
                                <button
                                    onClick={() => deleteUniverse(selectedUniverseId)}
                                    className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-500 hover:border-red-900 text-[10px]"
                                    title="Deletar Universo"
                                >
                                    ×
                                </button>
                            </div>
                        )}
                    </div>

                    {selectedUniverseData?.descricao && (
                        <div className="mt-1 text-[11px] text-zinc-500 line-clamp-3 leading-snug">
                            {selectedUniverseData.descricao}
                        </div>
                    )}
                </div>
            )}
          </div>
        </div>

        <div className="px-4 py-4 border-b border-white/10">
          <button 
            onClick={() => newChat(mode)} 
            className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition disabled:opacity-50"
            disabled={!selectedUniverseId}
          >
            + Nova conversa
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 text-xs text-gray-400 space-y-4">
          <div>
            <p className="font-semibold text-gray-200 text-[11px] uppercase tracking-wide">LORE MACHINE</p>
            {!selectedUniverseId ? (
                <p className="mt-1 text-red-400 font-semibold">Crie ou selecione um Universo para começar.</p>
            ) : (
                <p className="mt-1">Este ambiente está focado em **{currentUniverseName}**.</p>
            )}
          </div>

          {/* Histórico */}
          <div className={clsx({"opacity-50": !selectedUniverseId})}>
            <p className="font-semibold text-gray-300 text-[11px] uppercase tracking-wide mb-1">HISTÓRICO</p>
            
            {!selectedUniverseId && (
                <p className="text-gray-500 text-[11px]">Nenhum Universo Selecionado.</p>
            )}

            {selectedUniverseId && filteredSessions.length === 0 && <p className="text-gray-500 text-[11px]">Nenhuma conversa neste Universo.</p>}
            
            {selectedUniverseId && filteredSessions.length > 0 && (
              <>
                <input className="mb-2 w-full bg-black/40 border border-white/15 rounded-md px-2 py-1 text-[11px] text-gray-200" placeholder="Buscar no histórico..." value={historySearchTerm} onChange={(e) => setHistorySearchTerm(e.target.value)} />
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {filteredSessions.map((session) => {
                    const isActive = activeSession?.id === session.id;
                    const isRenaming = renamingSessionId === session.id;
                    const sessionMode: ChatMode = (session.mode as ChatMode) ?? "consulta";
                    const personaData = PERSONAS[sessionMode];
                    const modeLabel = sessionMode === "consulta" ? "Consulta" : "Criativo";
                    return (
                      <div key={session.id} className={clsx("group relative flex items-start gap-2 rounded-md px-2 py-1 text-[11px] cursor-pointer border border-transparent hover:border-white/20", isActive ? "bg-white/10 border-white/30" : "bg-transparent")}>
                        <button className="flex-1 text-left" onClick={() => { setActiveSessionId(session.id); setViewMode("chat"); }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-medium text-gray-100 leading-snug break-words max-w-[200px]">{isRenaming ? (<input className="w-full bg-black/60 border border-white/20 rounded px-1 py-0.5 text-[11px] text-gray-100" value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onBlur={confirmRenameSession} onKeyDown={(e) => { if (e.key === "Enter") { confirmRenameSession(); } else if (e.key === "Escape") { cancelRenameSession(); } }} autoFocus />) : (session.title)}</div>
                              <div className="text-[10px] text-gray-500 truncate">{new Date(session.createdAt).toLocaleString()}</div>
                            </div>
                            <span className={clsx("ml-1 flex-shrink-0 px-2 py-[1px] rounded-full text-[9px] uppercase tracking-wide border", personaData.styles.color, sessionMode === "consulta" ? "border-emerald-400 bg-emerald-500/10" : "border-purple-400 bg-purple-500/10")}>{modeLabel}</span>
                          </div>
                        </button>
                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="text-gray-500 hover:text-gray-200 transition text-[11px]" onClick={(e) => { e.stopPropagation(); startRenameSession(session.id, session.title); }}>✎</button>
                            <button className="text-gray-500 hover:text-red-400 transition text-[13px]" onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}>×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Ferramentas */}
          <div className="border-t border-white/10 pt-3 mt-3">
            <p className="font-semibold text-gray-300 text-[11px] uppercase tracking-wide mb-2">Ferramentas</p>
            <div className="space-y-2">
              <a href="/lore-upload" className="block w-full text-left text-[11px] rounded-md border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-2"><div className="font-semibold text-gray-100">Upload de arquivo</div><div className="text-[10px] text-gray-400">Envie um texto para extrair fichas.</div></a>
              <a href="/lore-admin" className="block w-full text-left text-[11px] rounded-md border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-2"><div className="font-semibold text-gray-100">Catálogo completo</div><div className="text-[10px] text-gray-400">Gerencie mundos, fichas e códigos.</div></a>
              <a href="/lore-admin/timeline" className="block w-full text-left text-[11px] rounded-md border border-white/20 bg-white/5 hover:bg-white/10 px-2 py-2"><div className="font-semibold text-gray-100">Timeline</div><div className="text-[10px] text-gray-400">Visualize e edite a linha do tempo.</div></a>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 border-t border-white/10 text-xs text-gray-500">
          <div className="relative">
            <button 
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-white/20 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-rose-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
                  {email ? email[0].toUpperCase() : "U"}
                </div>
                <span className="text-[11px] text-gray-300 truncate max-w-[120px]">{email || "Usuário"}</span>
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showProfileMenu ? 'rotate-180' : ''}` } fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            
            {showProfileMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-900 border border-white/20 rounded-md shadow-xl overflow-hidden">
                <button className="w-full text-left px-3 py-2 text-[11px] text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2" onClick={() => { alert('Funcionalidade em desenvolvimento'); setShowProfileMenu(false); }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                  Tema
                </button>
                <button className="w-full text-left px-3 py-2 text-[11px] text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2" onClick={() => { alert('Funcionalidade em desenvolvimento'); setShowProfileMenu(false); }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  Editar Perfil
                </button>
                <div className="border-t border-white/10" />
                <button className="w-full text-left px-3 py-2 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2" onClick={() => { handleLogout(); setShowProfileMenu(false); }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-12 border-b border-white/10 flex items-center justify-between px-4 bg-black/40">
          <div className="flex items-center gap-2">
            <div className={clsx("h-6 w-6 rounded-full", persona.styles.header)} />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{persona.nome}</span>
              <span className="text-[11px] text-gray-400">Guardião do Universo — {persona.titulo}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Modo:</span>
              <button 
                onClick={() => handleModeChange("consulta")} 
                className={clsx("px-2 py-1 rounded-full border text-xs", mode === "consulta" ? persona.styles.button : "bg-transparent border-white/20 text-gray-300 hover:bg-white/10")}
                disabled={!selectedUniverseId}
              >
                Consulta
              </button>
              <button 
                onClick={() => handleModeChange("criativo")} 
                className={clsx("px-2 py-1 rounded-full border text-xs", mode === "criativo" ? persona.styles.button : "bg-transparent border-white/20 text-gray-300 hover:bg-white/10")}
                disabled={!selectedUniverseId}
              >
                Criativo
              </button>
            </div>
          </div>
        </header>

        {/* Conteúdo principal */}
        <section className="flex-1 overflow-y-auto px-4 py-4" ref={viewportRef}>
          <div className="max-w-4xl mx-auto">
            
            {!selectedUniverseId && (
                <div className="text-center mt-12">
                    <h2 className="text-xl font-bold text-zinc-300 mb-4">Bem-vindo à Lore Machine</h2>
                    <p className="text-zinc-500">
                        O chat é ativado ao selecionar um Universo.
                    </p>
                    {universes.length === 0 && (
                        <button 
                            onClick={() => setShowUniverseModal(true)}
                            className="mt-6 px-4 py-2 rounded-md bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 transition"
                        >
                            Criar meu Primeiro Universo
                        </button>
                    )}
                </div>
            )}
            
            {selectedUniverseId && viewMode === "chat" && (
              <div className="space-y-4 max-w-2xl mx-auto">
                {messages.map((msg) => (
                  <div key={msg.id} className={clsx("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={clsx("rounded-2xl px-4 py-3 max-w-[80%] text-sm leading-relaxed", msg.role === "user" ? "bg-blue-600 text-white" : persona.styles.bg + " " + persona.styles.color + " border border-white/10")}>
                      {msg.role === "user" ? (<div className="whitespace-pre-wrap">{msg.content}</div>) : (renderAssistantMarkdown(msg.content))}
                    </div>
                  </div>
                ))}
                {loading && <div className="flex justify-start"><div className="flex items-center gap-2 text-[11px] text-gray-400 pl-2"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /><span>{persona.nome} está escrevendo…</span></div></div>}
                {messages.length === 0 && !loading && <p className="text-center text-gray-500 text-sm mt-8">Comece uma conversa com {persona.nome} escrevendo abaixo.</p>}
              </div>
            )}

            {/* MODO CATÁLOGO */}
            {viewMode === "catalog" && selectedUniverseId && (
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

                {/* FILTROS DE CATEGORIA */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {catalogTypes.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedType(t.id)}
                      className={`px-3 py-1 whitespace-nowrap rounded text-xs border uppercase transition ${
                        selectedType === t.id
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                          : "border-white/20 text-gray-300 hover:border-white/40 hover:bg-white/5"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <CatalogPagination />

                {catalogError && (
                  <p className="text-xs text-red-400 mt-2">{catalogError}</p>
                )}

                {loadingCatalog && (
                  <p className="text-xs text-gray-400 mt-2">
                    Carregando catálogo...
                  </p>
                )}

                {!loadingCatalog && pageEntities.length === 0 && (
                  <p className="text-sm text-gray-500 mt-4">
                    Nenhuma entrada para esses filtros. Tente limpar a busca ou
                    escolher outro mundo/tipo.
                  </p>
                )}

                {!loadingCatalog && pageEntities.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pageEntities.map((entity) => (
                      <div
                        key={entity.id}
                        className="group relative text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-3 text-sm transition cursor-pointer"
                        onClick={() => handleCatalogClick(entity)}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-gray-5 truncate">
                            {entity.titulo}
                          </h3>
                          <div className="flex items-center gap-2">
                            {entity.tipo && (
                              <span className="text-[10px] uppercase tracking-wide px-2 py-[2px] rounded-full border border-white/20 text-gray-200">
                                {entity.tipo}
                              </span>
                            )}
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); window.location.href = `/lore-admin?ficha=${entity.id}`; }}
                                className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 text-[10px]"
                                title="Editar Ficha"
                              >
                                ✎
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); if (confirm(`Tem certeza que deseja apagar a ficha "${entity.titulo}"?`)) { /* TODO: implementar delete */ alert('Funcionalidade em desenvolvimento'); } }}
                                className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-500 hover:border-red-900 text-[10px]"
                                title="Apagar Ficha"
                              >
                                ×
                              </button>
                            </div>
                          </div>
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
                          {(entity.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => (
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
                      </div>
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
          <form onSubmit={(e) => { void onSubmit(e); }} className="max-w-2xl mx-auto flex items-end gap-2">
            <textarea
              className="flex-1 resize-none rounded-xl border border-white/20 bg-black/60 px-3 py-2 text-sm outline-none focus:border-white/40 max-h-32 min-h-[44px]"
              placeholder={selectedUniverseId ? `Escreva aqui para ${persona.nome} em ${currentUniverseName}...` : "Crie um Universo para ativar o chat..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={1}
              onKeyDown={handleKeyDown}
              disabled={!selectedUniverseId}
            />
            <button type="submit" disabled={loading || !input.trim() || !selectedUniverseId} className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white text-black px-3 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">{loading ? "Pensando..." : "Enviar"}</button>
          </form>
          <p className="mt-2 text-[11px] text-center text-gray-500">Enter envia. Use Shift+Enter para quebrar linha.</p>
        </footer>
      </main>

      {/* MODAL NOVO UNIVERSO */}
      {showUniverseModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowUniverseModal(false)}>
          <form onSubmit={e => { e.preventDefault(); createUniverse(); }} onClick={(e) => e.stopPropagation()} className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-sm">Novo Universo</h3>
              <button type="button" onClick={() => setShowUniverseModal(false)} className="text-zinc-500 hover:text-white text-2xl leading-none font-light">&times;</button>
            </div>
            <input className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 mb-2 text-white text-sm" placeholder="Nome do Universo" value={newUniverseName} onChange={e=>setNewUniverseName(e.target.value)} autoFocus />
            <textarea className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 mb-4 text-white h-20 text-sm" placeholder="Descrição (opcional)" value={newUniverseDesc} onChange={e=>setNewUniverseDesc(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowUniverseModal(false)} className="text-xs text-zinc-400 hover:text-zinc-100">Fechar</button>
              <button type="submit" disabled={isCreatingUniverse} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-xs font-bold">{isCreatingUniverse ? "Criando..." : "Criar"}</button>
            </div>
          </form>
        </div>
      )}
      
      {/* MODAL EDITAR UNIVERSO */}
      {showEditUniModal && selectedUniverseData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowEditUniModal(false)}>
          <form onSubmit={e => { e.preventDefault(); saveEditUniverse(); }} onClick={(e) => e.stopPropagation()} className="bg-zinc-950 border border-zinc-800 p-6 rounded-lg max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-sm">Editar Universo</h3>
              <button type="button" onClick={() => setShowEditUniModal(false)} className="text-zinc-500 hover:text-white text-2xl leading-none font-light">&times;</button>
            </div>
            <input className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 mb-2 text-white text-sm" placeholder="Nome do Universo" value={editUniForm.nome} onChange={e=>setEditUniForm({...editUniForm, nome: e.target.value})} autoFocus />
            <textarea className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 mb-4 text-white h-20 text-sm" placeholder="Descrição (opcional)" value={editUniForm.descricao} onChange={e=>setEditUniForm({...editUniForm, descricao: e.target.value})} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowEditUniModal(false)} className="text-xs text-zinc-400 hover:text-zinc-100">Fechar</button>
              <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-xs font-bold">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
