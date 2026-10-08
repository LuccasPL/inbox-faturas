'use client';

import { useState, type ComponentProps } from 'react';
import Link, { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

function PendingNavigation() {
  const { pending } = useLinkStatus();
  return pending ? <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-background/95 p-1" role="status">
    <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden /><span className="sr-only">A abrir página...</span>
  </span> : null;
}

export function NavigationLink({ intentOnly = false, children, className, onPointerEnter, onFocus, ...props }:
  ComponentProps<typeof Link> & { intentOnly?: boolean }) {
  const [intent, setIntent] = useState(false);
  return <Link {...props} className={`relative ${className ?? ''}`} prefetch={intentOnly ? intent : props.prefetch}
    onPointerEnter={event => { if (intentOnly) setIntent(true); onPointerEnter?.(event); }}
    onFocus={event => { if (intentOnly) setIntent(true); onFocus?.(event); }}>
    {children}<PendingNavigation />
  </Link>;
}
