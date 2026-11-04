'use client';
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Accessible disclosure (shadcn-style Collapsible). Collapsed by default. */
export function Collapsible({ title, icon, defaultOpen = false, children, className, badge, onOpenChange, open: controlled }: {
  title: React.ReactNode; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode; className?: string; badge?: React.ReactNode; onOpenChange?: (o: boolean) => void; open?: boolean;
}) {
  const [o, setO] = React.useState(defaultOpen);
  const open = controlled ?? o;
  const id = React.useId();
  return (
    <section className={cn('rounded-2xl border border-cave-700 bg-cave-900/90', className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => { setO(!open); onOpenChange?.(!open); }}
        className="flex min-h-[52px] w-full items-center gap-2 px-4 py-3 text-start font-bold">
        {icon}<span className="flex-1">{title}</span>{badge}
        <ChevronDown className={cn('h-5 w-5 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div id={id} className="border-t border-cave-700 px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}
