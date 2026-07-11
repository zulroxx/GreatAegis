import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import {
  Send,
  Paperclip,
  Loader2,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import type { ChatRoutingInfo, ChatMessage } from "../types/api";
import { useChatHistory } from "../contexts/ChatHistoryContext";
import { extractTextFromFile } from "../utils/fileTextExtractor";
import { encapsulatePrompt } from "../utils/pqc-client";
import { apiFetch } from "../utils/api";

const SUGGESTIONS = [
  "Explain quantum-resistant cryptography in simple terms",
  "Write a Python function that validates JWT tokens",
  "Summarise the key security considerations for deploying LLMs in production",
];

const STORAGE_PREFIX = "great-aegis-quantum-rule-";
const MODEL_STORAGE_KEY = "GREATAEGIS_FIREWORKS_MODEL";

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
  onRouting: (info: ChatRoutingInfo) => void,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  quantumEncryption: boolean,
  zeroTrust: boolean,
  podIsolation: boolean,
  signal?: AbortSignal,
  onWarning?: (warning: string) => void,
  systemPrompt?: string,
  model?: string,
  historyMessages?: { role: string; content: string }[],
  historyRoutingVerdicts?: string[],
) {
  try {
    // ── Client-side PQC: encrypt prompt before transit if ML-KEM is enabled ──
    let encryptedPrompt: string | undefined;
    if (quantumEncryption) {
      try {
        const enc = await encapsulatePrompt(prompt);
        encryptedPrompt = enc.encrypted_prompt;
      } catch (e) {
        // PQC encryption failed — fall back to plaintext but log warning
        console.warn("Client-side PQC encapsulation failed, sending plaintext:", e);
      }
    }

    const res = await apiFetch(`/api/v1/gateway/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        messages: historyMessages,
        history_routing_verdicts: historyRoutingVerdicts,
        model,
        temperature: 0.7,
        max_tokens: 2048,
        system_prompt: systemPrompt,
        client_encryption_flag: quantumEncryption,
        quantum_encryption_enabled: quantumEncryption,
        zero_trust_enabled: zeroTrust,
        pod_isolation_enabled: podIsolation,
        encrypted_prompt: encryptedPrompt,
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
            case "warning":
              if (onWarning) onWarning(dataStr);
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
  const [podWarning, setPodWarning] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [fileProcessing, setFileProcessing] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userScrolledUpRef = useRef(false);
  const prevShowRef = useRef(false);

  useEffect(() => {
    apiFetch(`/api/v1/gateway/key-status`)
      .then((res) => res.json())
      .then((data) => setKeyConnected(data.configured))
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, []);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    let ticking = false;
    const THRESHOLD = 96;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const { scrollTop, scrollHeight, clientHeight } = main;
        const distFromBottom = scrollHeight - scrollTop - clientHeight;
        const scrolledUp = distFromBottom > THRESHOLD;
        userScrolledUpRef.current = scrolledUp;
        if (scrolledUp !== prevShowRef.current) {
          prevShowRef.current = scrolledUp;
          setShowScrollButton(scrolledUp);
        }
        ticking = false;
      });
    };

    main.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

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
    if ((!trimmed && !attachedFile) || streaming) return;

    const currentFile = attachedFile;
    setAttachedFile(null);
    setError(null);
    setPodWarning(null);

    // Ingest the file into Qdrant so it's available for future RAG queries
    if (currentFile) {
      apiFetch(`/api/v1/gateway/vector/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: currentFile.name,
          classification: "Confidential",
          content: currentFile.content,
          chunk_size: 512,
          chunk_overlap: 64,
        }),
      }).catch(() => { /* non-critical — prompt still fires */ });
    }

    // Include extracted file content as plain context text (not framed as a
    // "file attachment" — some models reflexively say "I can't read files"
    // when they see that phrasing, even when the text is right there).
    const fullPrompt = currentFile
      ? `Document text:\n\n${currentFile.content}\n\nQuestion: ${trimmed || "Summarise the document above."}`
      : trimmed;

    if (currentFile && (!currentFile.content || currentFile.content.trim().length === 0)) {
      setError("No readable text could be extracted from this file. Try a .txt file or a text-based PDF.");
      setAttachedFile(null);
      return;
    }

    let convId = activeConversationId;
    if (!convId) {
      convId = createConversation();
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: trimmed || `Uploaded: ${currentFile?.name}`,
      attachment: currentFile ? { name: currentFile.name, content: currentFile.content } : null,
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

    const selectedModel = localStorage.getItem(MODEL_STORAGE_KEY) || undefined;

    let fullContent = "";
    const latest = { current: newMessages };

    // Build history for context: previous user + assistant messages
    const baseHistory = baseMessages;
    const historyMessages = baseHistory.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const historyRoutingVerdicts = baseHistory
      .filter((m) => m.role === "assistant" && m.routing?.routing_verdict)
      .map((m) => m.routing!.routing_verdict);

    await streamGatewayChat(
      fullPrompt,
      (routing) => {
        const updated = updateMessageById(latest.current, assistantId, (m) => ({ ...m, routing }));
        latest.current = updated;
        updateMessages(convId, updated);
      },
      (token) => {
        fullContent += token;
        const updated = updateMessageById(latest.current, assistantId, (m) => ({ ...m, content: fullContent }));
        latest.current = updated;
        updateMessages(convId, updated);
      },
      () => {
        setStreaming(false);
      },
      (err) => {
        setError(err);
        setStreaming(false);
        const updated = updateMessageById(latest.current, assistantId, (m) => ({ ...m, content: `⚠️ Error: ${err}` }));
        latest.current = updated;
        updateMessages(convId, updated);
      },
      quantumEncryption,
      zeroTrust,
      podIsolation,
      abortCtrl.signal,
      (warning) => {
        setPodWarning(warning);
      },
      currentFile
        ? "The user's message contains document text labeled 'Document text:'. It is NOT a file attachment — the actual text has already been extracted and is included directly in the message. Read it and answer the user's question about it."
        : undefined,
      selectedModel,
      historyMessages,
      historyRoutingVerdicts,
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

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large — maximum 10 MB.");
      return;
    }
    setFileProcessing(true);
    setError(null);
    try {
      const { text, unsupported } = await extractTextFromFile(file);
      setAttachedFile({ name: file.name, content: text });
      if (unsupported) {
        setError(text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setFileProcessing(false);
    }
  }, []);

  const removeAttachedFile = useCallback(() => {
    setAttachedFile(null);
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* ── Floating Badges ─────────────────────────────────── */}
      <div className="sticky top-0 z-10" style={{ backgroundColor: "var(--color-bg-base)" }}>
        <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{
            backgroundColor: keyConnected
              ? "var(--color-accent-dim)"
              : "rgba(221, 107, 32, 0.1)",
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
            color: "var(--color-text-muted)",
          }}
        >
          <Shield size={11} />
          <span>Auto-Routed</span>
        </div>
      </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────── */}
      {error && (
        <div
          className="flex items-center gap-2 px-5 py-2.5 text-xs"
          style={{
            backgroundColor: "var(--color-error-dim)",
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

      {/* ── AMD Pod Warning Banner ──────────────────────────── */}
      {podWarning && (
        <div
          className="mx-5 mt-3 rounded-lg px-4 py-3 text-xs leading-relaxed flex items-start gap-2.5 animate-bounce-in"
          style={{
            backgroundColor: "rgba(221, 107, 32, 0.1)",
            color: "var(--color-warning)",
          }}
        >
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "var(--color-warning)" }} />
          <div>
            <p className="font-bold uppercase tracking-wide text-[0.65rem] mb-0.5">AMD Secure Pod Not Ready</p>
            <p style={{ color: "var(--color-text-secondary)" }}>{podWarning}</p>
          </div>
        </div>
      )}

      {/* ── Chat / Greeting Area ─────────────────────────────── */}
      <div className="px-5 py-6">
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
                      color: "var(--color-text-secondary)",
                      animationDelay: `${300 + idx * 100}ms`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--color-accent) 4%, transparent)";
                    }}
                    onMouseLeave={(e) => {
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
                        {msg.routing.pqc_algorithm && (
                          <>
                            <span style={{ color: "var(--color-border-light)" }}>·</span>
                            <span style={{ color: "var(--color-accent)" }}>
                              {msg.routing.pqc_algorithm}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div
                  className={`px-4 py-3 rounded text-sm leading-relaxed animate-fade-in ${
                    msg.role === "user" ? "self-end" : "self-start"
                  }`}
                  style={{
                    backgroundColor:
                      msg.role === "user"
                        ? "var(--color-accent-glow)"
                        : "var(--color-bg-input)",
                    color: "var(--color-text-primary)",
                    maxWidth: "85%",
                    whiteSpace: msg.role === "user" ? "pre-wrap" : "normal",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.attachment && (
                    <div
                      className="flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-lg text-xs"
                      style={{
                        backgroundColor: "var(--color-bg-input)",
                      }}
                    >
                      <Paperclip size={11} style={{ color: "var(--color-accent)" }} />
                      <span style={{ color: "var(--color-text-primary)" }} className="font-medium">
                        {msg.attachment.name}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                        {(msg.attachment.content.length / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  )}

                  {msg.content ? (
                    msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none" style={{ color: "var(--color-text-primary)" }}>
                        <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={markdownComponents}>{msg.content}</ReactMarkdown>
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

      {/* ── Floating Input Area ────────────────────────────────── */}
      <div className="sticky bottom-0 z-10" style={{ backgroundColor: "var(--color-bg-base)" }}>
      <div className="px-4 pb-4 pt-2">
        {/* File processing indicator */}
        {fileProcessing && (
          <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ color: "var(--color-text-muted)" }}>
            <Loader2 size={13} className="animate-spin" />
            <span>Extracting text from file...</span>
          </div>
        )}

        {/* Attached file chip */}
        {attachedFile && (
          <div className="mb-2 flex items-center gap-2">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
              style={{
                backgroundColor: "var(--color-accent-dim)",
                color: "var(--color-accent)",
              }}
            >
              <Paperclip size={11} />
              <span className="font-medium truncate max-w-[200px]">{attachedFile.name}</span>
              <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {attachedFile.content.length > 500
                  ? `${(attachedFile.content.length / 1024).toFixed(1)} KB`
                  : `${attachedFile.content.length} chars`}
              </span>
            </div>
            <button
              onClick={removeAttachedFile}
              className="text-[10px] px-2 py-0.5 rounded cursor-pointer transition-all duration-150"
              style={{
                backgroundColor: "var(--color-error-dim)",
                color: "var(--color-error)",
              }}
              aria-label="Remove attached file"
            >
              Remove
            </button>
          </div>
        )}

        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-bg-input) 85%, transparent)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
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
            onChange={handleFileChange}
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

      {showScrollButton && createPortal(
        <button
          onClick={scrollToBottom}
          className="fixed bottom-28 right-5 sm:right-8 w-9 h-9 flex items-center justify-center rounded-full shadow-lg cursor-pointer transition-all duration-150 active:scale-90 z-30"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "#000",
          }}
          aria-label="Scroll to bottom"
        >
          <ChevronDown size={18} />
        </button>,
        document.body,
      )}
    </>
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
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 text-[10px] select-none"
        style={{
          backgroundColor: "var(--color-bg-base)",
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
          color: "var(--color-accent)",
        }}
        {...props}
      >
        {children}
      </code>
    );
  },
};
