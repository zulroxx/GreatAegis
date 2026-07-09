import { useState, useEffect, useCallback } from "react";
import Header from "./components/Header";
import Sidebar, { type TabKey } from "./components/Sidebar";
import GatewayOverview from "./pages/GatewayOverview";
import SecuritySuite from "./pages/SecuritySuite";
import ProxyChat from "./pages/ProxyChat";
import RoutingLab from "./pages/RoutingLab";
import EnterpriseChatWorkspace from "./components/EnterpriseChatWorkspace";
import SettingsPage from "./pages/Settings";

const COLLAPSE_KEY = "GREATAEGIS_SIDEBAR_COLLAPSED";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // Desktop sidebar collapsed state (persisted)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  });

  // Mobile drawer open/close
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const toggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const openMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(true);
  }, []);

  const closeMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(false);
  }, []);

  // Trap focus/keyboard: close mobile drawer on Escape
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileDrawer();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mobileDrawerOpen, closeMobileDrawer]);

  // Close mobile drawer on route change
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    closeMobileDrawer();
  };

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-background text-foreground font-sans">
      {/* ── Global Top Header Bar ─────────────────────────── */}
      <Header onToggleSidebar={openMobileDrawer} />

      {/* ── Body: Sidebar + Content ───────────────────────── */}
      <div className="flex flex-1 pt-14 overflow-hidden">
        {/* Sidebar (desktop + mobile drawer) */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleCollapse}
          mobileOpen={mobileDrawerOpen}
          onMobileClose={closeMobileDrawer}
        />

        {/* Main Content Area — responsive margin */}
        <main
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:ml-[220px]"
          style={{
            backgroundColor: "var(--color-bg-base)",
            marginLeft: sidebarCollapsed ? "64px" : undefined,
          }}
        >
          <div key={activeTab} className="animate-slide-up">
            {activeTab === "overview" && <GatewayOverview />}
            {activeTab === "security" && <SecuritySuite />}
            {activeTab === "proxy" && <ProxyChat />}
            {activeTab === "routing-lab" && <RoutingLab />}
            {activeTab === "workspace" && <EnterpriseChatWorkspace />}
            {activeTab === "settings" && <SettingsPage />}
          </div>
        </main>
      </div>
    </div>
  );
}
