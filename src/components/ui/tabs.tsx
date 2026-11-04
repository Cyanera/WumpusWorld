'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
export function Tabs({ tabs, value, onChange, className }: { tabs: { id: string; label: React.ReactNode }[]; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('flex flex-wrap gap-1 rounded-xl bg-cave-900 p-1', className)}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn('rounded-lg px-4 py-2 text-sm font-bold transition', value === t.id ? 'bg-amber-500 text-black' : 'text-slate-300 hover:bg-cave-700')}>{t.label}</button>
      ))}
    </div>
  );
}
