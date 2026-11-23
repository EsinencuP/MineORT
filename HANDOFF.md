# Handoff: map atlas

Plan: `docs/plans/2026-11-22-1531-feat-map-atlas-plan.md` (note at its top: the map copies the AtlasMap mod). Branch `feat/map-atlas`, nothing pushed.

Done: codec v2 and server PNG tiles, full-screen AtlasMap UI (themes, ruler, drawing), live positions (U6, verified), markers (U8): `map_markers` (migration `20261122000005`, applied to staging), `/api/map/markers`, list, card, editor, icon and colour pickers, `/map?m=<id>`, reports and public-marker premoderation in `/admin/moderation`. 440 unit/integration tests, map e2e green. Marker work not committed yet.

Next: U9 screenshots on markers, U10 path marker and route, U7 trails, U12 docs. Plugin (U1, U2, U11) needs JDK 25: owner approval. Add `SUPABASE_JWT_SECRET` to Vercel.

Gotchas: run `npm run seed:map -- --clean` before tests (demo server breaks bridge tests); tests with `FF_P1C= FF_P1C_ATLAS=`; after a dev-server restart open `/map` once before e2e.
