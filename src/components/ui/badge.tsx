import * as React from 'react';
import { cn } from '@/lib/utils';
const tones = { default: 'bg-cave-700 text-white', green: 'bg-emerald-900/70 text-emerald-200 border-emerald-700', red: 'bg-red-900/70 text-red-200 border-red-700', amber: 'bg-amber-900/60 text-amber-200 border-amber-700', violet: 'bg-violet-900/60 text-violet-200 border-violet-700', blue: 'bg-sky-900/60 text-sky-200 border-sky-700' };
export const Badge = ({ className, tone = 'default', ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) =>
  <span className={cn('inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)} {...p} />;
