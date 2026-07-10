import { useState, useRef, useEffect } from "react";
import { LayoutDashboard, Shield, Waypoints, FlaskConical, Settings, ChevronLeft, ChevronDown, X, Briefcase, Plus, MessageSquare, Pencil, Trash2, Check, Globe } from "lucide-react";
import { useChatHistory } from "../contexts/ChatHistoryContext";

export type TabKey = "overview" | "security" | "proxy" | "routing-lab" | "workspace" | "settings";

interface NavItem {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

const WORKSPACE_ITEM: NavItem = { key: "workspace", label: "Workspace", icon: <Briefcase size={18} /> };

const GATEWAY_ITEMS: NavItem[] = [
  { key: "overview", label: "Gateway Overview", icon: <LayoutDashboard size={18} /> },
  { key: "security", label: "Security Suite", icon: <Shield size={18} /> },
  { key: "proxy", label: "Proxy & Chat", icon: <Waypoints size={18} /> },
  { key: "routing-lab", label: "Routing Lab", icon: <FlaskConical size={18} /> },
];

const SETTINGS_ITEM: NavItem = { key: "settings", label: "Settings", icon: <Settings size={18} /> };

interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const {
    conversations,
    activeConversationId,
    createConversation,
    deleteConversation,
    renameConversation,
    selectConversation,
  } = useChatHistory();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [gatewayOpen, setGatewayOpen] = useState(false);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleTabClick = (tab: TabKey) => {
    onTabChange(tab);
    onMobileClose?.();
  };

  const handleNewChat = () => {
    const id = createConversation();
    selectConversation(id);
    onTabChange("workspace");
    onMobileClose?.();
  };

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
    onTabChange("workspace");
    onMobileClose?.();
  };

  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleConfirmRename = () => {
    if (editingId) {
      renameConversation(editingId, editTitle);
    }
    setEditingId(null);
    setEditTitle("");
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleConfirmRename();
    } else if (e.key === "Escape") {
      setEditingId(null);
      setEditTitle("");
    }
  };

  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`Delete "${title}"?`)) {
      deleteConversation(id);
    }
  };

  const chatHistorySection = (
    <div className="flex flex-col gap-1 min-h-0">
      <div className="flex items-center justify-between px-3 py-1">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider select-none"
          style={{ color: "var(--color-text-muted)" }}
        >
          Chat History
        </span>
        <button
          onClick={handleNewChat}
          className="flex items-center justify-center w-5 h-5 rounded cursor-pointer transition-all duration-150 active:scale-90"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="New chat"
          title="New chat"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-accent)";
            e.currentTarget.style.backgroundColor = "var(--color-accent-glow)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--color-text-muted)";
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="overflow-y-auto max-h-48">
        {conversations.map((conv) => {
          const isActive = conv.id === activeConversationId && activeTab === "workspace";
          const isEditing = editingId === conv.id;

          return (
            <div
              key={conv.id}
              className="group relative"
            >
              {isEditing ? (
                <div className="flex items-center gap-1 px-3 py-1.5">
                  <input
                    ref={editInputRef}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={handleConfirmRename}
                    onKeyDown={handleRenameKeyDown}
                    className="flex-1 text-xs bg-transparent border-none outline-none rounded px-1 py-0.5"
                    style={{
                      color: "var(--color-text-primary)",
                      backgroundColor: "var(--color-bg-input)",
                      border: "1px solid var(--color-accent)",
                    }}
                  />
                  <button
                    onMouseDown={(e) => { e.preventDefault(); handleConfirmRename(); }}
                    className="flex-shrink-0 p-0.5 rounded cursor-pointer"
                    style={{ color: "var(--color-success)" }}
                  >
                    <Check size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleSelectConversation(conv.id)}
                  className="flex items-center gap-2 px-3 py-1.5 w-full text-left text-xs rounded cursor-pointer transition-all duration-150"
                  style={{
                    backgroundColor: isActive ? "var(--color-sidebar-hover)" : "transparent",
                    color: isActive ? "var(--color-sidebar-active)" : "var(--color-text-secondary)",
                    borderLeft: isActive ? "3px solid var(--color-sidebar-active)" : "3px solid transparent",
                    paddingLeft: isActive ? "9px" : "12px",
                  }}
                  title={conv.title}
                >
                  <MessageSquare size={12} className="flex-shrink-0" />
                  <span className="truncate flex-1">{conv.title}</span>

                  <span
                    className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartRename(conv.id, conv.title);
                      }}
                      className="p-0.5 rounded cursor-pointer transition-colors"
                      style={{ color: "var(--color-text-muted)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-accent)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; }}
                      title="Rename"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(conv.id, conv.title);
                      }}
                      className="p-0.5 rounded cursor-pointer transition-colors"
                      style={{ color: "var(--color-text-muted)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-error)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; }}
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const desktopSidebar = (
    <aside
      className="hidden lg:flex flex-col py-4 px-3 fixed top-14 bottom-0 z-40 transition-all duration-200"
      style={{
        width: collapsed ? "64px" : "var(--sidebar-width)",
        backgroundColor: "var(--color-bg-sidebar)",
        borderRight: "1px solid var(--color-border-default)",
      }}
      aria-label="Main navigation"
    >
      <button
        onClick={onToggleCollapse}
        className="flex items-center justify-center w-7 h-7 rounded-md mb-3 ml-auto cursor-pointer transition-all duration-150 active:scale-95"
        style={{
          color: "var(--color-text-muted)",
          backgroundColor: "var(--color-bg-base)",
          border: "1px solid var(--color-border-light)",
        }}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <ChevronLeft
          size={14}
          aria-hidden="true"
          className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
        />
      </button>

      <nav className="flex flex-col gap-1">
        {(() => {
          const isActive = activeTab === WORKSPACE_ITEM.key;
          return (
            <button
              key={WORKSPACE_ITEM.key}
              onClick={() => handleTabClick(WORKSPACE_ITEM.key)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium w-full text-left cursor-pointer active:scale-[0.98] transition-all duration-150"
              style={{
                backgroundColor: isActive ? "var(--color-sidebar-hover)" : "transparent",
                color: isActive ? "var(--color-sidebar-active)" : "var(--color-text-secondary)",
                borderLeft: isActive ? "3px solid var(--color-sidebar-active)" : "3px solid transparent",
                paddingLeft: isActive ? "9px" : "12px",
                justifyContent: collapsed ? "center" : "flex-start",
              }}
              title={collapsed ? WORKSPACE_ITEM.label : undefined}
              aria-label={collapsed ? WORKSPACE_ITEM.label : undefined}
            >
              <span className="flex-shrink-0">{WORKSPACE_ITEM.icon}</span>
              {!collapsed && <span>{WORKSPACE_ITEM.label}</span>}
            </button>
          );
        })()}

        <button
          onClick={() => setGatewayOpen(!gatewayOpen)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium w-full text-left cursor-pointer transition-all duration-150"
          style={{
            color: "var(--color-text-secondary)",
            justifyContent: collapsed ? "center" : "flex-start",
          }}
          title={collapsed ? "Gateway" : undefined}
          aria-label={collapsed ? "Gateway" : undefined}
        >
          <span className="flex-shrink-0"><Globe size={18} /></span>
          {!collapsed && (
            <>
              <span className="flex-1">Gateway</span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${gatewayOpen ? "" : "-rotate-90"}`}
              />
            </>
          )}
        </button>

        {!collapsed && gatewayOpen && (
          <div className="flex flex-col gap-1 pl-4">
            {GATEWAY_ITEMS.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => handleTabClick(item.key)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium w-full text-left cursor-pointer active:scale-[0.98] transition-all duration-150"
                  style={{
                    backgroundColor: isActive ? "var(--color-sidebar-hover)" : "transparent",
                    color: isActive ? "var(--color-sidebar-active)" : "var(--color-text-secondary)",
                    borderLeft: isActive ? "3px solid var(--color-sidebar-active)" : "3px solid transparent",
                    paddingLeft: isActive ? "9px" : "12px",
                  }}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {!collapsed && conversations.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--color-border-default)" }}>
          {chatHistorySection}
        </div>
      )}

      <div className="flex-1" />
      <nav className="flex flex-col gap-1 mt-auto">
        {(() => {
          const isActive = activeTab === SETTINGS_ITEM.key;
          return (
            <button
              key={SETTINGS_ITEM.key}
              onClick={() => handleTabClick(SETTINGS_ITEM.key)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium w-full text-left cursor-pointer active:scale-[0.98] transition-all duration-150"
              style={{
                backgroundColor: isActive ? "var(--color-sidebar-hover)" : "transparent",
                color: isActive ? "var(--color-sidebar-active)" : "var(--color-text-secondary)",
                borderLeft: isActive ? "3px solid var(--color-sidebar-active)" : "3px solid transparent",
                paddingLeft: isActive ? "9px" : "12px",
                justifyContent: collapsed ? "center" : "flex-start",
              }}
              title={collapsed ? SETTINGS_ITEM.label : undefined}
              aria-label={collapsed ? SETTINGS_ITEM.label : undefined}
            >
              <span className="flex-shrink-0">{SETTINGS_ITEM.icon}</span>
              {!collapsed && <span>{SETTINGS_ITEM.label}</span>}
            </button>
          );
        })()}
      </nav>
    </aside>
  );

  const mobileDrawer = (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 flex flex-col py-4 px-3 pt-16 transition-transform duration-250 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          width: "var(--sidebar-width)",
          backgroundColor: "var(--color-bg-sidebar)",
          borderRight: "1px solid var(--color-border-default)",
        }}
        aria-label="Mobile navigation"
      >
        <button
          onClick={onMobileClose}
          className="absolute top-3 right-3 flex items-center justify-center w-8 h-8 rounded-md cursor-pointer"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Close navigation menu"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2 px-3 mb-6">
          <Shield size={20} style={{ color: "var(--color-accent)" }} />
          <span className="text-sm font-semibold">GreatAegis</span>
        </div>

        <nav className="flex flex-col gap-1">
          {(() => {
            const isActive = activeTab === WORKSPACE_ITEM.key;
            return (
              <button
                key={WORKSPACE_ITEM.key}
                onClick={() => handleTabClick(WORKSPACE_ITEM.key)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium w-full text-left cursor-pointer active:scale-[0.98]"
                style={{
                  backgroundColor: isActive ? "var(--color-sidebar-hover)" : "transparent",
                  color: isActive ? "var(--color-sidebar-active)" : "var(--color-text-secondary)",
                  borderLeft: isActive ? "3px solid var(--color-sidebar-active)" : "3px solid transparent",
                  paddingLeft: isActive ? "9px" : "12px",
                  transition: "background-color 150ms, color 150ms, border-color 150ms, padding-left 150ms",
                }}
              >
                <span className="flex-shrink-0">{WORKSPACE_ITEM.icon}</span>
                <span>{WORKSPACE_ITEM.label}</span>
              </button>
            );
          })()}

          <button
            onClick={() => setGatewayOpen(!gatewayOpen)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium w-full text-left cursor-pointer transition-all duration-150"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <span className="flex-shrink-0"><Globe size={18} /></span>
            <span className="flex-1">Gateway</span>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${gatewayOpen ? "" : "-rotate-90"}`}
            />
          </button>

          {gatewayOpen && (
            <div className="flex flex-col gap-1 pl-4">
              {GATEWAY_ITEMS.map((item) => {
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => handleTabClick(item.key)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium w-full text-left cursor-pointer active:scale-[0.98]"
                    style={{
                      backgroundColor: isActive ? "var(--color-sidebar-hover)" : "transparent",
                      color: isActive ? "var(--color-sidebar-active)" : "var(--color-text-secondary)",
                      borderLeft: isActive ? "3px solid var(--color-sidebar-active)" : "3px solid transparent",
                      paddingLeft: isActive ? "9px" : "12px",
                      transition: "background-color 150ms, color 150ms, border-color 150ms, padding-left 150ms",
                    }}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {conversations.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--color-border-default)" }}>
            {chatHistorySection}
          </div>
        )}

        <div className="flex-1" />
        <nav className="flex flex-col gap-1 mt-auto">
          {(() => {
            const isActive = activeTab === SETTINGS_ITEM.key;
            return (
              <button
                key={SETTINGS_ITEM.key}
                onClick={() => handleTabClick(SETTINGS_ITEM.key)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium w-full text-left cursor-pointer active:scale-[0.98]"
                style={{
                  backgroundColor: isActive ? "var(--color-sidebar-hover)" : "transparent",
                  color: isActive ? "var(--color-sidebar-active)" : "var(--color-text-secondary)",
                  borderLeft: isActive ? "3px solid var(--color-sidebar-active)" : "3px solid transparent",
                  paddingLeft: isActive ? "9px" : "12px",
                  transition: "background-color 150ms, color 150ms, border-color 150ms, padding-left 150ms",
                }}
              >
                <span className="flex-shrink-0">{SETTINGS_ITEM.icon}</span>
                <span>{SETTINGS_ITEM.label}</span>
              </button>
            );
          })()}
        </nav>
      </aside>
    </>
  );

  return (
    <>
      {desktopSidebar}
      {mobileDrawer}
    </>
  );
}
