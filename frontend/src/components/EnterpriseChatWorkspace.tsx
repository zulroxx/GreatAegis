import { useState, useRef, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  Send,
  Paperclip,
  Loader2,
  User,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
} from "lucide-react";
import type { ChatRoutingInfo, ChatMessage } from "../types/api";
import { useChatHistory } from "../contexts/ChatHistoryContext";

const API_BASE = "http://localhost:8060";

const SUGGESTIONS = [
  "Explain quantum-resistant cryptography in simple terms",
  "Write a Python function that validates JWT tokens",
  "Summarise the key security considerations for deploying LLMs in production",
];

const STORAGE_PREFIX = "great-aegis-quantum-rule-";

function getQuantumRule(label: string, defaultVal: boolean = true): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + label);
    if (stored !== null) return stored === "true";
  } catch {
    /* localStorage unavailable */
  }
  return defaultVal;
}

async function streamGatewayChat(
  prompt: string,
  model: string,
  onRouting: (info: ChatRoutingInfo) => void,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  quantumEncryption: boolean,
  zeroTrust: boolean,
  podIsolation: boolean,
  signal?: AbortSignal,
) {
  try {
    const res = await fetch(`${API_BASE}/api/v1/gateway/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        model,
        temperature: 0.7,
        max_tokens: 2048,
        client_encryption_flag: quantumEncryption,
        quantum_encryption_enabled: quantumEncryption,
        zero_trust_enabled: zeroTrust,
        pod_isolation_enabled: podIsolation,
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      onError(`Gateway returned ${res.status}: ${text}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError("No response body from stream");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (let line of lines) {
        line = line.replace(/\r$/, "");
        if (!line) continue;

        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data:")) {
          const dataStr = line.slice(5).replace(/^ /, "");

          switch (currentEvent) {
            case "routing": {
              try {
                const parsed = JSON.parse(dataStr);
                onRouting(parsed as ChatRoutingInfo);
              } catch {
                // ignore malformed routing
              }
              break;
            }
            case "token":
              onToken(dataStr || "\n");
              break;
            case "done":
              onDone();
              break;
            case "error":
              onError(dataStr);
              return;
            default:
                if (dataStr === "[DONE]") {
                  onDone();
                } else {
                  try {
                    const parsed = JSON.parse(dataStr);
                    if (parsed.routing_verdict) {
                      onRouting(parsed as ChatRoutingInfo);
                    } else if (parsed.content) {
                      onToken(parsed.content || "\n");
                    } else if (parsed.finish_reason) {
                      onDone();
                    }
                  } catch {
                    onToken(dataStr || "\n");
                  }
                }
          }
        }
      }
    }
    onDone();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    const message =
      err instanceof TypeError && err.message === "Failed to fetch"
        ? "Cannot reach the GreatAegis API server — the backend is not running."
        : err instanceof Error
          ? err.message
          : "Stream failed";
    onError(message);
  }
}

export default function EnterpriseChatWorkspace() {
  const {
    conversations,
    activeConversationId,
    createConversation,
    getActiveConversation,
    updateMessages,
  } = useChatHistory();

  const activeConv = getActiveConversation();
  const messages = activeConv?.messages ?? [];

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyConnected, setKeyConnected] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/gateway/key-status`)
      .then((res) => res.json())
      .then((data) => setKeyConnected(data.configured))
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [input, streaming],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    setError(null);

    let convId = activeConversationId;
    if (!convId) {
      convId = createConversation();
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const assistantId = `msg-${Date.now() + 1}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      routing: null,
    };

    const currentConv = conversations.find((c) => c.id === convId);
    const baseMessages = currentConv?.messages ?? [];
    const newMessages = [...baseMessages, userMsg, assistantMsg];
    updateMessages(convId, newMessages);

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    setStreaming(true);
    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    const quantumEncryption = getQuantumRule("Enforce Client-Side ML-KEM/Kyber Key Wrapping");
    const zeroTrust = getQuantumRule("Zero-Trust Data-in-Transit Payload Encapsulation");
    const podIsolation = getQuantumRule("Strict Safe-Compute Pod Isolation");
    const model = localStorage.getItem("GREATAEGIS_FIREWORKS_MODEL") || "accounts/fireworks/models/glm-5p2";

    let fullContent = "";

    await streamGatewayChat(
      trimmed,
      model,
      (routing) => {
        updateMessages(convId, updateMessageById(newMessages, assistantId, (m) => ({ ...m, routing })));
      },
      (token) => {
        fullContent += token;
        updateMessages(convId, updateMessageById(newMessages, assistantId, (m) => ({ ...m, content: fullContent })));
      },
      () => {
        setStreaming(false);
      },
      (err) => {
        setError(err);
        setStreaming(false);
        updateMessages(convId, updateMessageById(newMessages, assistantId, (m) => ({ ...m, content: `⚠️ Error: ${err}` })));
      },
      quantumEncryption,
      zeroTrust,
      podIsolation,
      abortCtrl.signal,
    );
  }, [input, streaming, activeConversationId, conversations, createConversation, updateMessages]);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setInput(suggestion);
      setTimeout(() => {
        setInput(suggestion);
      }, 0);
    },
    [],
  );

  const handlePaperclip = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div
      className="rounded-xl flex flex-col flex-1 min-h-0"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      {/* ── Workspace Header Bar ─────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-3 rounded-t-xl"
        style={{
          borderBottom: "1px solid var(--color-border-default)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor: keyConnected
                ? "var(--color-accent-dim)"
                : "rgba(221, 107, 32, 0.1)",
              border: `1px solid ${
                keyConnected
                  ? "color-mix(in srgb, var(--color-accent) 30%, transparent)"
                  : "rgba(221, 107, 32, 0.4)"
              }`,
              color: keyConnected ? "var(--color-success)" : "var(--color-warning)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: keyConnected
                  ? "var(--color-success)"
                  : "var(--color-warning)",
                animation: "pulse-green 2s ease-in-out infinite",
              }}
            />
            {keyConnected ? "Gateway Live" : "Demo Mode"}
          </div>

          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
            style={{
              backgroundColor: "var(--color-bg-input)",
              border: "1px solid var(--color-border-light)",
              color: "var(--color-text-muted)",
            }}
          >
            <Shield size={11} />
            <span>Auto-Routed</span>
          </div>
        </div>

        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all duration-150 active:scale-95 select-none"
          style={{
            backgroundColor: "var(--color-bg-input)",
            border: "1px solid var(--color-border-light)",
            color: "var(--color-text-secondary)",
          }}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "#000",
            }}
          >
            <User size={14} />
          </div>
          Sovereignty Admin
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 px-5 py-2.5 text-xs"
          style={{
            backgroundColor: "var(--color-error-dim)",
            borderBottom: "1px solid var(--color-error)",
            color: "var(--color-error)",
          }}
        >
          <AlertTriangle size={13} />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-[10px] underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Chat / Greeting Area ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-6" style={{ maxHeight: "calc(100vh - 300px)" }}>
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="max-w-3xl">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-5 animate-bounce-in"
                style={{
                  backgroundColor: "var(--color-accent-glow)",
                  color: "var(--color-accent)",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>

              <h2
                className="text-xl font-semibold mb-1 animate-slide-up"
                style={{ color: "var(--color-text-primary)", animationDelay: "100ms" }}
              >
                GreatAegis Autonomous Gateway
              </h2>
              <p
                className="text-xs mb-2 animate-slide-up"
                style={{ color: "var(--color-text-muted)", animationDelay: "200ms" }}
              >
                {keyConnected
                  ? "Live via autonomous hybrid router — the gateway selects the optimal model based on content sensitivity."
                  : "Demo mode — enter an API key in Settings for live completions on the public route."}
              </p>

              {keyConnected && (
                <div
                  className="flex items-center justify-center gap-1.5 mb-6 animate-slide-up text-xs"
                  style={{ color: "var(--color-success)", animationDelay: "250ms" }}
                >
                  <CheckCircle2 size={12} />
                  <span>Fireworks AI connected — routing is autonomous via the hybrid router</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="flex items-center justify-center px-4 py-4 rounded-xl text-center text-xs leading-tight transition-all duration-150 cursor-pointer group animate-slide-up"
                    style={{
                      backgroundColor: "var(--color-bg-input)",
                      border: "1px solid var(--color-border-default)",
                      color: "var(--color-text-secondary)",
                      animationDelay: `${300 + idx * 100}ms`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-accent)";
                      e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--color-accent) 4%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-border-default)";
                      e.currentTarget.style.backgroundColor = "var(--color-bg-input)";
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 max-w-4xl mx-auto">
            {messages.map((msg) => (
              <div key={msg.id} className="flex flex-col gap-1">
                {msg.role === "assistant" && msg.routing && (
                  <div className="flex flex-col gap-1 self-start mb-1">
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium"
                      style={{
                        backgroundColor: msg.routing.fallback_engaged
                          ? "rgba(221, 107, 32, 0.1)"
                          : "var(--color-accent-dim)",
                        border: `1px solid ${
                          msg.routing.fallback_engaged
                            ? "rgba(221, 107, 32, 0.3)"
                            : "color-mix(in srgb, var(--color-accent) 30%, transparent)"
                        }`,
                        color: msg.routing.fallback_engaged
                          ? "var(--color-warning)"
                          : "var(--color-success)",
                      }}
                    >
                      <Shield size={10} />
                      <span>
                        {msg.routing.routing_verdict.replace(/_/g, " ")}
                        {msg.routing.fallback_engaged && " ⚠️ FALLBACK"}
                      </span>
                    </div>

                    {msg.routing.quantum_rules && (
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px]"
                        style={{
                          backgroundColor: "var(--color-bg-input)",
                          border: "1px solid var(--color-border-light)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        <span>Rules:</span>
                        <span style={{
                          color: msg.routing.quantum_rules.ml_kem_wrapping
                            ? "var(--color-success)" : "var(--color-warning)"
                        }}>
                          {msg.routing.quantum_rules.ml_kem_wrapping ? "ML-KEM ✓" : "ML-KEM ✗"}
                        </span>
                        <span style={{ color: "var(--color-border-light)" }}>·</span>
                        <span style={{
                          color: msg.routing.quantum_rules.zero_trust_encapsulation
                            ? "var(--color-success)" : "var(--color-warning)"
                        }}>
                          {msg.routing.quantum_rules.zero_trust_encapsulation ? "ZT ✓" : "ZT ✗"}
                        </span>
                        <span style={{ color: "var(--color-border-light)" }}>·</span>
                        <span style={{
                          color: msg.routing.quantum_rules.pod_isolation
                            ? "var(--color-success)" : "var(--color-warning)"
                        }}>
                          {msg.routing.quantum_rules.pod_isolation ? "ISO ✓" : "ISO ✗"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div
                  className={`px-4 py-3 rounded-xl text-sm leading-relaxed animate-fade-in ${
                    msg.role === "user" ? "self-end" : "self-start"
                  }`}
                  style={{
                    backgroundColor:
                      msg.role === "user"
                        ? "var(--color-accent-glow)"
                        : "var(--color-bg-input)",
                    border: `1px solid ${
                      msg.role === "user"
                        ? "color-mix(in srgb, var(--color-accent) 20%, transparent)"
                        : "var(--color-border-light)"
                    }`,
                    color: "var(--color-text-primary)",
                    maxWidth: "85%",
                    whiteSpace: msg.role === "user" ? "pre-wrap" : "normal",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.content ? (
                    msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none" style={{ color: "var(--color-text-primary)" }}>
                        <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )
                  ) : (
                    <span className="flex items-center gap-2" style={{ color: "var(--color-text-muted)" }}>
                      <Loader2 size={13} className="animate-spin" />
                      Generating response...
                    </span>
                  )}
                  {msg.role === "assistant" && streaming && msg.id === messages[messages.length - 1]?.id && (
                    <span className="inline-block w-2 h-4 ml-0.5 animate-pulse" style={{ backgroundColor: "var(--color-accent)" }} />
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* ── Input Area ─────────────────────────────────────────── */}
      <div
        className="px-4 py-3 rounded-b-xl"
        style={{
          borderTop: "1px solid var(--color-border-default)",
          marginTop: "auto",
        }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-bg-input) 85%, transparent)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--color-border-light)",
          }}
        >
          <button
            onClick={handlePaperclip}
            aria-label="Attach a document or file"
            className="flex-shrink-0 p-1.5 rounded-full transition-all duration-150 cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-accent)";
              e.currentTarget.style.backgroundColor = "var(--color-accent-glow)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-muted)";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <Paperclip size={17} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".txt,.pdf,.doc,.docx,.csv,.json,.md"
          />

          <label htmlFor="workspace-input" className="sr-only">
            Type your enterprise prompt
          </label>
          <textarea
            id="workspace-input"
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={streaming ? "Streaming response..." : "Type your enterprise prompt..."}
            rows={1}
            disabled={streaming}
            className="flex-1 text-sm bg-transparent border-none outline-none resize-none min-h-[22px]"
            style={{
              color: "var(--color-text-primary)",
              fontFamily: "inherit",
              maxHeight: "128px",
              opacity: streaming ? 0.5 : 1,
            }}
          />

          {streaming ? (
            <button
              onClick={cancelStream}
              aria-label="Cancel streaming"
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-150 active:scale-90 cursor-pointer"
              style={{
                backgroundColor: "var(--color-warning)",
                color: "#000",
              }}
            >
              <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: "#000" }} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              aria-label="Send prompt"
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-150 active:scale-90"
              style={{
                backgroundColor: input.trim()
                  ? "var(--color-accent)"
                  : "var(--color-border-light)",
                color: input.trim() ? "#000" : "var(--color-text-muted)",
                cursor: input.trim() ? "pointer" : "not-allowed",
              }}
            >
              <Send size={16} />
            </button>
          )}
        </div>

        <p
          className="text-[10px] text-center mt-2.5 select-none"
          style={{ color: "var(--color-text-muted)" }}
        >
          {getQuantumRule("Enforce Client-Side ML-KEM/Kyber Key Wrapping")
            ? "All enterprise traffic is quantum-wrapped client-side using ML-KEM/Kyber prior to transit."
            : "ML-KEM key wrapping is DISABLED — traffic encryption bypassed. Enable in Security Suite."}
          {getQuantumRule("Zero-Trust Data-in-Transit Payload Encapsulation")
            ? " Zero-trust encapsulation active."
            : ""}
          {getQuantumRule("Strict Safe-Compute Pod Isolation")
            ? " Pod isolation enforced."
            : " External fallback permitted."}
        </p>
      </div>
    </div>
  );
}

function updateMessageById(
  messages: ChatMessage[],
  id: string,
  updater: (msg: ChatMessage) => ChatMessage,
): ChatMessage[] {
  return messages.map((m) => (m.id === id ? updater(m) : m));
}

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const content = String(children).replace(/\n$/, "");
  const lang = className?.replace("language-", "") || "";

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }, [content]);

  return (
    <div
      className="rounded-lg overflow-hidden my-2"
      style={{ border: "1px solid var(--color-border-default)" }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 text-[10px] select-none"
        style={{
          backgroundColor: "var(--color-bg-base)",
          borderBottom: "1px solid var(--color-border-light)",
          color: "var(--color-text-muted)",
        }}
      >
        <span className="font-medium uppercase tracking-wider">{lang || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer transition-all duration-150 active:scale-95"
          style={{ color: copied ? "var(--color-success)" : "var(--color-text-muted)" }}
          onMouseEnter={(e) => {
            if (!copied) e.currentTarget.style.color = "var(--color-accent)";
          }}
          onMouseLeave={(e) => {
            if (!copied) e.currentTarget.style.color = "var(--color-text-muted)";
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="!m-0 !rounded-none !border-none" style={{ background: "var(--color-bg-terminal)" }}>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

const markdownComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code({ children, className, inline, ...props }: any) {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return <CodeBlock className={className}>{children}</CodeBlock>;
    }
    return (
      <code
        className={className}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.8em",
          background: "var(--color-bg-base)",
          padding: "0.125rem 0.375rem",
          borderRadius: "0.25rem",
          border: "1px solid var(--color-border-light)",
          color: "var(--color-accent)",
        }}
        {...props}
      >
        {children}
      </code>
    );
  },
};
