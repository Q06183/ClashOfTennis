# Character Roster Implementation Plan

**Goal:** Deliver six selectable, visibly distinct, balanced tennis characters with six authoritative attributes and five new Lux3D models inside the existing 300-credit allowance.

**Architecture:** Shared immutable roster and effect functions consumed by simulation, room validation and UI. Match snapshots carry character IDs; render selects cached skinned GLBs. Preserve existing default behavior through neutral lin ratings.

**Tech Stack:** TypeScript, Three.js, Rapier, Node/ws, Lux3D China, Blender.

## Global constraints

- Budget 300 total, already committed20; five successful model tasks; the provider rejected an extra concurrency attempt before assigning a task ID, conservatively retaining its20 allowance. Log before dispatch, no duplicate task submissions.
- No payment, upgrades or hidden reach; every character free. Shared 1.96m rig, mobile GLB texture limit1024.
- Character lock in live matches; invalid IDs cannot smuggle stat values.

## Work sequence

- [x] Assets: quote and reserve five attempts in artifacts/lux3d/budget.json, save IDs immediately, poll originals, download/inspect, adapt scripts/assets/rig-athlete.py per inspected bind pose, export public/models/characters/{id}.glb and provenance. Verify model scale, weights and actual motions before integration is accepted.
- [x] Mechanics: create src/simulation/characters.ts with roster and move/stroke/stamina multipliers as specified. Extend PlayerState with optional characterId (legacy defaults lin); Match constructor accepts IDs, reset retains them. Apply to movement and actual hit-type speed, consumption/recovery. Add tests/characters.test.ts for neutral invariance, directional stroke effects and legal flight.
- [x] Networking: room member characterId, create/join IDs, select-character action before match, selection resets ready; Match receives both validated picks. Add real socket checks for invalid picks, locked live choice, resume and rematch.
- [x] UI: separate roster selection panel reachable from home/setup/room, six cards with name/role/portrait and six values, strengths/weaknesses and effect explanation. Persist local selection; room displays both identities, practice opponent selectable; HUD remains compact.
- [x] Rendering: model cache keyed by roster URL, switch clones safely on IDs, clear fallback/material ownership, retain authored outfit colors and seat ground-marker distinction. Inspect true skin poses for each new model.
- [x] Balance: deterministic pairwise seeded policy sweep with both seat orders; output docs/character-balance.json and readable matrix, tune against spec gates with disclosed scope. Add targeted meaningful rule regressions and run existing suite once final implementation settles.
- [x] Delivery: production build, browser responsive selection/game verification, restart existing7470 only for changed simulation, complete LAN protocol match with different characters, update MASTER_CHECKLIST/verification, local rollback commit and goal requirement audit.

Each stage must save its evidence before checking it complete. No model placeholder or green unit suite alone counts as completion of generated-character integration.

Evidence: docs/verification.md, docs/character-balance.md and both raw reports; 94/94 tests, production build, 7:4 LAN protocol match. Five originals inspected and integrated. Standalone offline preview generated but interaction could not be verified under browser transport/URL limits; actual game model rendering verified.
