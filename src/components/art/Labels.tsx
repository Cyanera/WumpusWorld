import { Label } from '@/lib/engine/types';
import { Check } from 'lucide-react';

export const LABEL_META: Record<Label, { text: string; short: string; cls: string }> = {
  safe: { text: 'Safe', short: 'Safe', cls: 'bg-emerald-600 text-white' },
  possible_pit: { text: 'Possible Pit', short: '?Pit', cls: 'bg-orange-500 text-black' },
  confirmed_pit: { text: 'Confirmed Pit', short: 'Pit!', cls: 'bg-red-600 text-white' },
  possible_wumpus: { text: 'Possible Wumpus', short: '?W', cls: 'bg-fuchsia-500 text-black' },
  confirmed_wumpus: { text: 'Confirmed Wumpus', short: 'W!', cls: 'bg-red-700 text-white' },
  unknown: { text: 'Unknown', short: '?', cls: 'bg-slate-500 text-white' },
};
export function LabelChip({ label, className = '' }: { label: Label; className?: string }) {
  const m = LABEL_META[label];
  return <span className={`inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-extrabold leading-4 ${m.cls} ${className}`}>{label === 'safe' && <Check className="h-2.5 w-2.5" aria-hidden />}{m.short}</span>;
}
