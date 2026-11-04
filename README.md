# Wumpus World — Think Like an AI Agent

Real-time classroom web app for teaching **Knowledge-Based Agents** (Perception → Knowledge → Inference → Decision → Action).
Students (English, mobile-first) each play their own random 4×4 Wumpus World on a phone; the instructor (Arabic, RTL, projector-first)
monitors, analyses, replays and demonstrates live.

## What is implemented
| Area | Where |
|---|---|
| Wumpus World rules, percepts, scoring (+1000 / −1000 / −1 / −10) | `src/lib/engine/world.ts` |
| Random, valid, **solvable**, pedagogically-scored world generator (seeded, configurable pits, easy/normal/hard) | `src/lib/engine/simulate.ts` |
| Deterministic reasoner (model checking over the frontier) + structured inference records | `src/lib/engine/reasoner.ts` |
| Formal rules library (Rules 1–7), instantiated per game; KaTeX rendering | `src/lib/engine/formal.ts`, `components/game/LogicSection.tsx` |
| Guided checkpoints, map-labelling grading, misconception detection | `src/lib/engine/checkpoints.ts` |
| Server-authoritative game controller, student view (no hidden data), reports | `src/lib/engine/game.ts` |
| Perfect-agent playthrough for fresh demos | `src/lib/engine/demo.ts` |
| DB abstraction (Supabase or in-memory), auth, services, analytics, CSV/XLSX export | `src/lib/server/*` |
| API routes | `src/app/api/**` |
| Student UI / Instructor dashboard / Replay / Demo mode | `src/components/**`, `src/app/**` |
| Schema, indexes, RLS | `supabase/migrations/0001_schema.sql` |
| Tests | `tests/*.test.ts`, `tests/e2e/mobile.e2e.mjs` |

Illustrations are hand-made SVG: a monster Wumpus (glowing eyes, fangs, claws, horns), rocky pits with depth, a treasure chest with coins,
animated wind lines for Breeze, green smoky particles for Stench, gold twinkles for Glitter, fog of war, and an explorer robot with a facing ring.
All animation honours `prefers-reduced-motion`. UI primitives are shadcn/ui-style (own Button/Card/Tabs/Collapsible using `cva` + `tailwind-merge`).

## Key design decisions
* **Hidden world isolation.** Pits/Wumpus/gold live only in `hidden_worlds`, read by server routes with the service-role key. RLS is enabled on every table with *no* browser policies. The student payload is built by `studentView()` and contains the world only after the game is over (tested, including a network-level check in the e2e script).
* **Reasoning is never LLM-based.** `classify()` enumerates pit assignments over the frontier and Wumpus positions; "safe" requires both ruled out. Every inference record carries `entail: {kb, conclusion}`, and a test **brute-force verifies KB ⊨ conclusion over all 2¹⁵×15 worlds** for every generated record, so the displayed formulas match the engine.
* **Think first.** In Guided mode actions are rejected (`409 checkpoint_pending`) until the checkpoint is answered; newly inferred knowledge, explanations and formulas are withheld until submission. In Challenge mode inferred knowledge is revealed only when the student runs “Mark what the agent knows”.
* **Realtime.** The server pings Supabase Realtime *Broadcast* (`session:<CODE>`, no game data in payload); clients refetch through authenticated routes. Polling (3–4 s) always runs as fallback, plus refetch on tab-visible/online. Duplicate deliveries are deduplicated with `opId`; writes use optimistic versioning.
* **Instructor auth.** Email + password from env, signed HttpOnly cookie (HMAC, 12 h), login throttling. Students are anonymous with a random token (stored hashed).
* Without Supabase env vars the app only runs on an **in-memory store** in development, or in production when `ALLOW_MEMORY_DB=1` is set (local demos only). On Vercel a missing Supabase config returns a clear `503 not_configured` instead of silently losing student sessions.

## Local development
```bash
npm install
cp .env.example .env.local   # leave Supabase empty for the in-memory store
npm run dev                  # http://localhost:3000  (dev instructor login: instructor@example.edu / wumpus)
npm test                     # unit + integration tests (26)
npm run build && ALLOW_MEMORY_DB=1 INSTRUCTOR_PASSWORD=wumpus AUTH_SECRET=some-long-secret npm start   # ALLOW_MEMORY_DB only for local demos
npm run test:e2e             # Playwright phone-viewport smoke test against the running server
```
Production builds require `INSTRUCTOR_PASSWORD` and `AUTH_SECRET` (no insecure defaults).

## Deployment: Supabase + Vercel
1. **Supabase**: create a project → SQL editor → run `supabase/migrations/0001_schema.sql` (or `supabase db push`). Copy the project URL, anon key and service-role key. Realtime Broadcast needs no table replication.
2. **Vercel**: import the repo (framework *Next.js*). Set env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `INSTRUCTOR_EMAIL`, `INSTRUCTOR_PASSWORD`, `AUTH_SECRET` (32+ random chars), `NEXT_PUBLIC_APP_URL` (production URL, used in QR codes).
3. Deploy, open `/instructor`, sign in, **create a session**, press **QR** and project it. Students scan it, type a name and play.

## Classroom flow
Create session (mode, difficulty, pits, duration) → project QR → *Start* → watch the table, metrics and analytics → reveal a class checkpoint's correct answer → open **Logical Rules** for students (Natural / Formal / Both) and project any recorded inference → *Demo mode* (a student's real game or a fresh perfect-agent game; reveal map, hide reasoning) → export CSV / Excel (students, attempts, rules used, analytics).

## Known limits
* Not yet run against a real Supabase project in this environment — the `SupabaseDB` adapter and SQL are written to the same table interface the tests exercise through the in-memory store; please run the e2e script once against your project.
* Rate limiting beyond login throttling is not included; add Vercel/WAF limits for large public use.
* A single env-configured instructor credential; swap `checkInstructorPassword` for Supabase Auth if you need multiple instructors.
