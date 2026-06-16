import Link from 'next/link';
import type { ReactNode } from 'react';
import { UserButton } from '@clerk/nextjs';
import { FileText, Inbox, Settings } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

type NavKey = 'inbox' | 'settings';

interface AppShellProps {
  active: NavKey;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

const navItems = [
  { key: 'inbox' as const, label: 'Inbox', href: '/inbox', icon: Inbox },
  {
    key: 'settings' as const,
    label: 'Settings',
    href: '/settings',
    icon: Settings,
  },
];

export function AppShell({
  active,
  title,
  description,
  actions,
  children,
}: AppShellProps) {
  return (
    <main className="min-h-screen bg-muted/35">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-background/95 md:flex md:flex-col">
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0">
            <Link href="/" className="block truncate text-sm font-semibold">
              Inbox Faturas
            </Link>
            <div className="text-xs text-muted-foreground">
              Revisão e emissão
            </div>
          </div>
        </div>

        <nav className="space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t p-3 text-xs text-muted-foreground">
          IA para transformar pedidos por email em drafts revistos.
        </div>
      </aside>

      <section className="md:pl-64">
        <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 md:px-8">
            <div className="min-w-0">
              <div className="flex items-center gap-2 md:hidden">
                <FileText className="size-4" />
                <Link href="/" className="text-sm font-semibold">
                  Inbox Faturas
                </Link>
              </div>
              <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">
                {title}
              </h1>
              {description && (
                <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <ThemeToggle />
              <UserButton />
            </div>
          </div>

          <nav className="flex gap-1 border-t px-3 py-2 md:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    'flex h-8 flex-1 items-center justify-center gap-2 rounded-lg text-sm',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
          {children}
        </div>
      </section>
    </main>
  );
}
