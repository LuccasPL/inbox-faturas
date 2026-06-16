import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/theme-toggle';
import { Mail } from 'lucide-react';

interface AppHeaderProps {
  current?: 'inbox' | 'settings';
  /** Conteúdo extra à direita (botões de acção contextuais) */
  rightSlot?: React.ReactNode;
  /** Conteúdo extra à esquerda (ex: voltar) */
  leftSlot?: React.ReactNode;
}

export function AppHeader({ current, rightSlot, leftSlot }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          {leftSlot}
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
              <Mail className="size-3.5" />
            </span>
            Inbox Faturas
          </Link>
          {current && (
            <nav className="hidden items-center gap-1 text-sm md:flex">
              <NavLink href="/inbox" active={current === 'inbox'}>
                Inbox
              </NavLink>
              <NavLink href="/settings" active={current === 'settings'}>
                Settings
              </NavLink>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          {rightSlot}
          <ThemeToggle />
          <UserButton />
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'rounded-md px-3 py-1.5 text-foreground'
          : 'rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
      }
    >
      {children}
    </Link>
  );
}
