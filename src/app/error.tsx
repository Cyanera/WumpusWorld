'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-black">Something went wrong</h1>
      <p className="max-w-sm break-words text-sm text-slate-400">{error.message}</p>
      <button className="h-12 rounded-xl bg-amber-500 px-6 font-bold text-black" onClick={() => reset()}>Try again</button>
    </main>
  );
}
