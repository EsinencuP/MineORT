# MineOrt V

Site for the MineOrt V Minecraft community. Stack (OD-35 = A): Next.js + TypeScript + Tailwind, Supabase/PostgreSQL, Vercel, Java Paper Bridge.
Product and planning docs live in [`docs/`](docs/README.md); the MVP plan is `docs/04-plan/04-mvp-development-plan.md`.

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
```

## Commands

| Command                | What it does                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Dev server                                                                                                             |
| `npm run build`        | Production build                                                                                                       |
| `npm run typecheck`    | `next typegen` + `tsc --noEmit`                                                                                        |
| `npm run lint`         | ESLint                                                                                                                 |
| `npm run format:check` | Prettier check (`npm run format` fixes)                                                                                |
| `npm run test`         | Unit tests (vitest)                                                                                                    |
| `npm run test:e2e`     | Playwright smoke (builds and starts the app with all wave flags off; set `PW_CHROMIUM_PATH` to reuse a local Chromium) |
| `npm run check`        | typecheck + lint + format:check                                                                                        |

## Rules for AI agents

- Structure: `src/app` routes, `src/components` UI, `src/lib` shared logic. One task = one story (`US-Exx-nn`) from the plan.
- Read the story's acceptance criteria in the plan first; do not widen scope.
- Run `npm run check` before every commit. Commit message format: `feat(US-E00-01): ...`.
- Never commit secrets; use `.env.local` (gitignored). Staging and prod use separate keys.
- Writes to the database go only through backend/RPC; never write privileged columns from the client (see US-E00-06).
- Do not invent server rules text or numbers: mark gaps `[ОПРЕДЕЛИТЬ]` and ask the owner.
- Do not use the ORT Hertli emblem until rights are confirmed (OD-39).
- Check Next.js docs in `node_modules/next/dist/docs/` before using its APIs (see `AGENTS.md`).
