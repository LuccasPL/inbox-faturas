import Link from 'next/link';
import type { ReactNode } from 'react';
import { UserButton } from '@clerk/nextjs';
import { ArrowUpRight, FileText, Inbox, LayoutDashboard, Settings, Users } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { WorkflowDemoDialog } from '@/components/workflow-demo-dialog';
import { NavigationLink } from '@/components/navigation-link';
import { cn } from '@/lib/utils';

type NavKey = 'dashboard' | 'inbox' | 'clientes' | 'settings';

interface AppShellProps {
  active: NavKey;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

const navItems = [
  { key: 'dashboard' as const, label: 'Visão geral', href: '/dashboard', icon: LayoutDashboard },
  { key: 'inbox' as const, label: 'Inbox', href: '/inbox', icon: Inbox },
  { key: 'clientes' as const, label: 'Clientes', href: '/clientes', icon: Users },
  { key: 'settings' as const, label: 'Definições', href: '/settings', icon: Settings },
];

export function AppShell({ active, title, description, actions, children }: AppShellProps) {
  return (
    <div className="workspace">
      <a href="#conteudo" className="workspace-skip-link">Ir para o conteúdo</a>
      <aside className="workspace-sidebar">
        <Link href="/" className="workspace-brand">
          <span className="workspace-brand-icon"><FileText className="size-5" /></span>
          <span><strong>Inbox Faturas</strong><small>Espaço de trabalho</small></span>
        </Link>
        <div className="workspace-nav-label">TRABALHO</div>
        <nav className="workspace-nav" aria-label="Navegação principal">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return <NavigationLink key={item.key} href={item.href} aria-current={isActive ? 'page' : undefined} className={cn('workspace-nav-link', isActive && 'is-active')}><Icon className="size-4" /><span>{item.label}</span>{isActive && <span className="workspace-active-mark" />}</NavigationLink>;
          })}
        </nav>
        <div className="workspace-sidebar-footer">
          <WorkflowDemoDialog />
          <Link href="/" className="workspace-home-link">Página inicial<ArrowUpRight className="size-3.5" /></Link>
          <div className="workspace-version">Inbox Faturas <span>Beta</span></div>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <Link href="/" className="workspace-mobile-brand"><FileText className="size-4 text-primary" />Inbox Faturas</Link>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span>Espaço de trabalho</span><span>/</span><span className="font-medium text-foreground">{navItems.find(item => item.key === active)?.label}</span></div>
          <div className="flex items-center gap-2">
            <div className="md:hidden"><WorkflowDemoDialog compact /></div>
            <ThemeToggle /><span className="mx-1 h-5 w-px bg-border" /><UserButton />
          </div>
        </header>
        <nav className="workspace-mobile-nav" aria-label="Navegação móvel">
          {navItems.map(item => {
            const Icon = item.icon;
            return <NavigationLink key={item.key} href={item.href} aria-current={active === item.key ? 'page' : undefined} className={active === item.key ? 'is-active' : undefined}><Icon className="size-4" /><span>{item.label}</span></NavigationLink>;
          })}
        </nav>
        <main id="conteudo" className="workspace-content">
          <div className="workspace-page-heading">
            <div className="min-w-0"><h1>{title}</h1>{description && <p>{description}</p>}</div>
            {actions && <div className="workspace-page-actions">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
