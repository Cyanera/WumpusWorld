import * as React from 'react';

type P = { className?: string; style?: React.CSSProperties };
const base = 'absolute inset-0 h-full w-full pointer-events-none';

/** A real-looking monster: horns, glowing eyes, fangs, claws. */
export function WumpusArt({ className = '', dead = false }: P & { dead?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`${base} ${className}`} role="img" aria-label="Wumpus monster">
      <defs>
        <radialGradient id="wbody" cx="50%" cy="40%" r="65%"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#3b1a6b" /></radialGradient>
        <radialGradient id="weye" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff7ae" /><stop offset="1" stopColor="#f59e0b" /></radialGradient>
      </defs>
      <ellipse cx="50" cy="92" rx="30" ry="5" fill="#000" opacity=".4" />
      {/* horns */}
      <path d="M22 34 L12 8 L36 26 Z" fill="#e5e1d0" stroke="#6b6350" strokeWidth="1.5" />
      <path d="M78 34 L88 8 L64 26 Z" fill="#e5e1d0" stroke="#6b6350" strokeWidth="1.5" />
      {/* body */}
      <path d="M50 18 C80 18 90 42 86 66 C84 82 70 90 50 90 C30 90 16 82 14 66 C10 42 20 18 50 18Z" fill="url(#wbody)" stroke="#1e0b3a" strokeWidth="2.5" />
      {/* fur spikes */}
      <path d="M20 58 l-7 4 l7 3 M80 58 l7 4 l-7 3 M30 80 l-4 6 l7 -2 M70 80 l4 6 l-7 -2" fill="none" stroke="#1e0b3a" strokeWidth="2" strokeLinecap="round" />
      {/* eyes */}
      <g className={dead ? '' : 'fx-eyes'}>
        {dead ? (<g stroke="#f5f5f5" strokeWidth="3" strokeLinecap="round"><path d="M28 34l14 12M42 34l-14 12M58 34l14 12M72 34l-14 12" /></g>) : (<>
          <ellipse cx="35" cy="42" rx="11" ry="12" fill="url(#weye)" stroke="#1e0b3a" strokeWidth="2" />
          <ellipse cx="65" cy="42" rx="11" ry="12" fill="url(#weye)" stroke="#1e0b3a" strokeWidth="2" />
          <ellipse cx="36" cy="43" rx="2.6" ry="9" fill="#111" /><ellipse cx="64" cy="43" rx="2.6" ry="9" fill="#111" />
        </>)}
      </g>
      <path d="M24 30 L44 36 M76 30 L56 36" stroke="#1e0b3a" strokeWidth="4" strokeLinecap="round" />
      {/* mouth + fangs */}
      <path d="M28 64 Q50 82 72 64 Q50 72 28 64Z" fill="#1a0510" stroke="#1e0b3a" strokeWidth="2" />
      <path d="M34 66 l4 10 l4 -8 M58 68 l4 8 l4 -10 M46 70 l4 7 l4 -7" fill="#fff" stroke="#ddd" strokeWidth="1" />
      {/* claws */}
      <g fill="#f3efe0" stroke="#6b6350" strokeWidth="1.2">
        <path d="M6 70 q2 -8 5 -2 q3 -8 6 -1 q3 -7 5 1 q-8 8 -16 2Z" />
        <path d="M94 70 q-2 -8 -5 -2 q-3 -8 -6 -1 q-3 -7 -5 1 q8 8 16 2Z" />
      </g>
    </svg>
  );
}

/** Dark hole with cracked rocky rim and depth. */
export function PitArt({ className = '', faded = false }: P & { faded?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`${base} ${className}`} style={{ opacity: faded ? 0.55 : 1 }} role="img" aria-label="Pit">
      <defs>
        <radialGradient id="pitd" cx="50%" cy="55%" r="55%"><stop offset="0" stopColor="#000" /><stop offset=".6" stopColor="#0c0a14" /><stop offset="1" stopColor="#2a2438" /></radialGradient>
        <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8a8196" /><stop offset="1" stopColor="#4b4458" /></linearGradient>
      </defs>
      <ellipse cx="50" cy="60" rx="40" ry="30" fill="url(#rim)" stroke="#2a2438" strokeWidth="2" />
      <path d="M12 58 l6 -4 l3 4 M84 52 l5 4 l-2 5 M30 36 l3 5 l5 -2 M66 34 l-2 6 l6 1 M20 78 l5 -2 l2 5 M76 80 l4 -3 l1 5" fill="none" stroke="#2a2438" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="50" cy="62" rx="31" ry="21" fill="url(#pitd)" stroke="#1a1626" strokeWidth="2.5" />
      <ellipse cx="50" cy="54" rx="24" ry="10" fill="#000" opacity=".45" />
      <path d="M26 54 q24 -14 48 0" fill="none" stroke="#5c5470" strokeWidth="2" opacity=".6" />
      <g stroke="#a99fbd" strokeWidth="1.6" fill="none" opacity=".7"><path d="M18 62 l5 2 M80 66 l4 -2 M40 30 l2 4 M60 30 l-1 4" /></g>
    </svg>
  );
}

/** Treasure chest with coins and glow. */
export function GoldArt({ className = '', collected = false }: P & { collected?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`${base} ${className}`} role="img" aria-label="Gold treasure">
      <defs>
        <radialGradient id="gglow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fde047" stopOpacity=".9" /><stop offset="1" stopColor="#f59e0b" stopOpacity="0" /></radialGradient>
        <linearGradient id="gcoin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff2a0" /><stop offset="1" stopColor="#d97706" /></linearGradient>
      </defs>
      {!collected && <circle cx="50" cy="55" r="46" fill="url(#gglow)" className="fx-glow" />}
      <ellipse cx="50" cy="86" rx="32" ry="5" fill="#000" opacity=".35" />
      {/* coins pile */}
      <g stroke="#92400e" strokeWidth="1.2" fill="url(#gcoin)">
        <ellipse cx="22" cy="80" rx="9" ry="4" /><ellipse cx="30" cy="76" rx="9" ry="4" /><ellipse cx="78" cy="80" rx="9" ry="4" /><ellipse cx="70" cy="77" rx="9" ry="4" />
      </g>
      {/* chest */}
      <rect x="25" y="46" width="50" height="32" rx="3" fill="#7c4a1e" stroke="#3b2208" strokeWidth="2.5" />
      <path d="M25 48 Q25 26 50 26 Q75 26 75 48Z" fill="#9a5b25" stroke="#3b2208" strokeWidth="2.5" />
      <rect x="25" y="46" width="50" height="6" fill="#f59e0b" stroke="#3b2208" strokeWidth="1.5" />
      <rect x="45" y="46" width="10" height="14" rx="2" fill="#fde047" stroke="#3b2208" strokeWidth="1.5" />
      <circle cx="50" cy="53" r="2" fill="#3b2208" />
      <path d="M33 30 v18 M67 30 v18" stroke="#f59e0b" strokeWidth="3" />
      {/* overflowing coins */}
      <g stroke="#92400e" strokeWidth="1.2" fill="url(#gcoin)"><circle cx="42" cy="26" r="5" /><circle cx="52" cy="23" r="5" /><circle cx="60" cy="27" r="4.5" /></g>
    </svg>
  );
}

/** Animated wind lines — "air movement". */
export function BreezeFx({ className = '' }: P) {
  return (
    <svg viewBox="0 0 100 100" className={`${base} fx-breeze ${className}`} aria-hidden>
      <g fill="none" stroke="#bae6fd" strokeWidth="3" strokeLinecap="round">
        <path d="M8 28 H52 C64 28 66 14 56 14" /><path d="M14 46 H70 C84 46 86 62 74 62" /><path d="M6 72 H46 C56 72 58 84 50 84" />
      </g>
    </svg>
  );
}
/** Green, smoky odour particles + wavy scent lines — clearly different from Breeze. */
export function StenchFx({ className = '' }: P) {
  return (
    <svg viewBox="0 0 100 100" className={`${base} fx-stench ${className}`} aria-hidden>
      <g fill="#84cc16" opacity=".75">
        <circle className="puff" cx="24" cy="78" r="9" /><circle className="puff" cx="50" cy="82" r="11" fill="#65a30d" /><circle className="puff" cx="74" cy="76" r="8" /><circle className="puff" cx="40" cy="70" r="7" fill="#a3e635" />
      </g>
      <g className="wave" fill="none" stroke="#a3e635" strokeWidth="2.5" strokeLinecap="round" opacity=".8">
        <path d="M30 56 q-6 -6 0 -12 t0 -12" /><path d="M52 58 q-6 -6 0 -12 t0 -12" /><path d="M72 56 q-6 -6 0 -12 t0 -12" />
      </g>
    </svg>
  );
}
/** Gold twinkles. */
export function GlitterFx({ className = '' }: P) {
  const star = (cx: number, cy: number, r: number) => `M${cx} ${cy - r} L${cx + r * 0.28} ${cy - r * 0.28} L${cx + r} ${cy} L${cx + r * 0.28} ${cy + r * 0.28} L${cx} ${cy + r} L${cx - r * 0.28} ${cy + r * 0.28} L${cx - r} ${cy} L${cx - r * 0.28} ${cy - r * 0.28}Z`;
  return (
    <svg viewBox="0 0 100 100" className={`${base} fx-glitter ${className}`} aria-hidden>
      <g fill="#fde047" stroke="#fff" strokeWidth=".8">
        <path className="spark" d={star(20, 24, 9)} /><path className="spark" d={star(80, 30, 7)} /><path className="spark" d={star(72, 78, 10)} /><path className="spark" d={star(26, 74, 6)} />
      </g>
    </svg>
  );
}

/** Cute explorer robot; the ring pointer shows the facing direction. */
export function AgentArt({ dir = 'E', alive = true, className = '' }: { dir?: string; alive?: boolean; className?: string }) {
  const rot = { E: 0, N: -90, W: 180, S: 90 }[dir] ?? 0;
  return (
    <svg viewBox="0 0 100 100" className={`${base} ${className}`} role="img" aria-label={`Agent facing ${dir}`}>
      <defs><linearGradient id="abody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f8fafc" /><stop offset="1" stopColor="#94a3b8" /></linearGradient></defs>
      <g transform={`rotate(${rot} 50 50)`}>
        <path d="M92 50 L78 41 L78 59 Z" fill="#22d3ee" stroke="#0e7490" strokeWidth="2" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeDasharray="4 5" opacity=".8" />
      </g>
      <g className={alive ? 'fx-bob' : ''}>
        <line x1="50" y1="22" x2="50" y2="12" stroke="#475569" strokeWidth="3" /><circle cx="50" cy="10" r="4" fill="#f43f5e" />
        <path d="M30 40 Q30 20 50 20 Q70 20 70 40Z" fill="#f59e0b" stroke="#92400e" strokeWidth="2.5" />
        <rect x="30" y="36" width="40" height="34" rx="12" fill="url(#abody)" stroke="#334155" strokeWidth="2.5" />
        <rect x="36" y="42" width="28" height="15" rx="7" fill="#0f172a" />
        {alive ? (<><circle cx="44" cy="49" r="3.4" fill="#22d3ee" /><circle cx="56" cy="49" r="3.4" fill="#22d3ee" /></>) : (<path d="M41 46l6 6M47 46l-6 6M53 46l6 6M59 46l-6 6" stroke="#f87171" strokeWidth="2" />)}
        <rect x="37" y="68" width="10" height="8" rx="3" fill="#475569" /><rect x="53" y="68" width="10" height="8" rx="3" fill="#475569" />
      </g>
    </svg>
  );
}
