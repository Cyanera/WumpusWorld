'use client';
import * as React from 'react';
import { Wind, CloudFog, Sparkles, Hand, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { k: 'stench', label: 'Stench', Icon: CloudFog, on: 'bg-lime-600/80 border-lime-300' },
  { k: 'breeze', label: 'Breeze', Icon: Wind, on: 'bg-sky-600/80 border-sky-200' },
  { k: 'glitter', label: 'Glitter', Icon: Sparkles, on: 'bg-amber-500/90 text-black border-amber-200' },
  { k: 'bump', label: 'Bump', Icon: Hand, on: 'bg-orange-600/80 border-orange-300' },
  { k: 'scream', label: 'Scream', Icon: Volume2, on: 'bg-fuchsia-700/80 border-fuchsia-300' },
] as const;

export function PerceptStrip({ p, compact = false }: { p: Record<string, boolean>; compact?: boolean }) {
  return (
    <ul className={cn('grid gap-1.5', compact ? 'grid-cols-5' : 'grid-cols-2 sm:grid-cols-5')} aria-label="Percepts">
      {ITEMS.map(({ k, label, Icon, on }) => {
        const yes = !!p?.[k];
        return (
          <li key={k} className={cn('flex items-center gap-2 rounded-xl border px-2 py-2 text-sm font-bold transition', yes ? `${on} fx-pop` : 'border-cave-700 bg-cave-800 text-slate-400', compact && 'flex-col gap-0 px-1 py-1 text-[11px]')}>
            <Icon className={cn('h-5 w-5 shrink-0', yes && k === 'breeze' && 'fx-bob', yes && k === 'glitter' && 'fx-glow')} aria-hidden />
            <span className="flex-1">{label}</span><span className={cn('text-xs', !compact && 'rounded bg-black/30 px-1.5 py-0.5')}>{yes ? 'Yes' : 'No'}</span>
          </li>
        );
      })}
    </ul>
  );
}
