'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AgentArt, GoldArt, WumpusArt, PitArt } from '@/components/art/Art';

export default function Home() {
  const [code, setCode] = React.useState(''); const router = useRouter();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="grid grid-cols-4 gap-2" aria-hidden>
        {[<AgentArt key="a" />, <WumpusArt key="w" />, <PitArt key="p" />, <GoldArt key="g" />].map((e, i) => <div key={i} className="relative h-16 w-16 rounded-xl bg-cave-800">{e}</div>)}
      </div>
      <div><h1 className="text-4xl font-black">Wumpus World</h1><p className="mt-1 text-lg text-slate-300">Think Like an AI Agent</p></div>
      <form className="w-full space-y-3" onSubmit={(e) => { e.preventDefault(); if (code.trim()) router.push(`/play/${code.trim().toUpperCase()}`); }}>
        <label className="block text-start text-sm font-semibold">Session code
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} inputMode="text" autoCapitalize="characters" placeholder="ABC123" className="mt-1 h-16 w-full rounded-xl border border-cave-600 bg-cave-900 text-center text-3xl font-black tracking-[0.3em] outline-none focus:border-amber-400" />
        </label>
        <Button size="lg" className="w-full" disabled={code.trim().length < 4}>Join</Button>
      </form>
      <p className="text-sm text-slate-400">Or scan the QR code shown by your instructor.</p>
      <Link href="/instructor" className="text-sm text-slate-400 underline">Instructor sign in · دخول المحاضرة</Link>
    </main>
  );
}
