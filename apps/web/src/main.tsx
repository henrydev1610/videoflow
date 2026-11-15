import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  NavLink,
  Routes,
  Route,
  useLocation,
  Link,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Plus,
  FolderDown,
  History,
  Settings as SettingsIcon,
  Menu,
  Moon,
  Sun,
  ArrowDownToLine,
} from 'lucide-react';
import { Toaster } from 'sonner';
import { PreferencesProvider, usePreferences } from './lib/preferences';
import { SessionProvider } from './lib/session';
import { Dashboard, Manager, NewDownload, Settings } from './pages';
import { Button } from './components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from './components/ui/sheet';
import { TooltipProvider } from './components/ui/tooltip';
import './styles.css';
const routes = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/new', label: 'Novo Download', icon: Plus },
  { path: '/downloads', label: 'Gerenciador', icon: FolderDown },
  { path: '/history', label: 'Histórico', icon: History },
  { path: '/settings', label: 'Configurações', icon: SettingsIcon },
];
function Shell() {
  const [menu, setMenu] = useState(false);
  const { preferences, set } = usePreferences();
  const location = useLocation();
  const navigation = (
    <>
      <Link className="brand" to="/" onClick={() => setMenu(false)}>
        <span className="brand-icon">
          <ArrowDownToLine size={23} />
        </span>
        <span>
          VideoFlow<small>Seu espaço de mídia</small>
        </span>
      </Link>
      <nav aria-label="Navegação principal">
        {routes.map(({ path, label, icon: Icon }) => (
          <NavLink key={path} end to={path} onClick={() => setMenu(false)}>
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="online-dot" /> Espaço deste navegador
        <p>Sem conta. Com controle.</p>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Pular para conteúdo
      </a>
      <aside className="sidebar">{navigation}</aside>
      <div className="workspace">
        <header className="topbar">
          <div className="header-title">
            <Button
              size="icon"
              variant="ghost"
              className="mobile-menu"
              aria-label="Abrir navegação"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </Button>
            <span>
              Workspace <span aria-hidden="true">/</span>{' '}
              <strong>
                {routes.find((r) => r.path === location.pathname)?.label ??
                  'Página não encontrada'}
              </strong>
            </span>
          </div>
          <div className="header-actions">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Alternar tema"
              onClick={() =>
                set({
                  theme: document.documentElement.classList.contains('dark')
                    ? 'light'
                    : 'dark',
                })
              }
            >
              {preferences.theme === 'dark' ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </Button>
            {location.pathname !== '/new' && (
              <Button asChild>
                <Link to="/new">
                  <Plus size={17} />
                  <span>Novo download</span>
                </Link>
              </Button>
            )}
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewDownload />} />
            <Route path="/downloads" element={<Manager />} />
            <Route path="/history" element={<Manager history />} />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  <h1>Página não encontrada</h1>
                  <Link to="/">Voltar ao Dashboard</Link>
                </div>
              }
            />
          </Routes>
        </main>
        <footer className="workspace-footer">
          VideoFlow{' '}
          <span>Mídia autorizada. Processamento sob seu controle.</span>
        </footer>
      </div>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="mobile-sidebar">
          <SheetTitle className="sr-only">Navegação</SheetTitle>
          <SheetDescription className="sr-only">
            Áreas do VideoFlow
          </SheetDescription>
          {navigation}
        </SheetContent>
      </Sheet>
      <Toaster
        richColors
        closeButton
        theme={preferences.theme === 'system' ? 'system' : preferences.theme}
        position="bottom-right"
      />
    </div>
  );
}
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <PreferencesProvider>
        <TooltipProvider>
          <BrowserRouter>
            <SessionProvider>
              <Shell />
            </SessionProvider>
          </BrowserRouter>
        </TooltipProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
