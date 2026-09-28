# Hidden Master Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task in the current checkout.

**Goal:** Deliver the approved all-99 black-and-gold hidden character, including persistent five-click discovery, practice and friend matches.

**Architecture:** Keep all ten identities in the shared simulation catalogue, with a separate ordinary roster for balancing. A small UI-only unlock controller owns click counting and resilient persistence; it does not act as server authorization. Derive the costume from the shipped Lin model without changing geometry or skinning.

**Tech Stack:** TypeScript, node:test, Three.js, Vite, WebSocket, local Python/Blender asset tools.

## Global Constraints

- Preserve original nine stat sets and all existing physics/rules.
- Use `wuming`, right-handed, two-handed backhand; all six stats exactly 99.
- Five consecutive title activations; other picker actions reset count; no speed requirement.
- Local unlock shared by player/opponent; failed persistence leaves session usable.
- No remote push or production deployment. Git commit is deferred after approval-service failure.
- User explicitly requested direct completion without further design confirmations.

## Tasks

- [x] **1. Catalogue and actual effects:** Extend `tests/characters.test.ts` with a failing all-99/ordinary-budget assertion, then add `wuming`, `hidden?:boolean` and `STANDARD_CHARACTERS` in `src/simulation/characters.ts`. Make `scripts/balance/characters.ts` consume only `STANDARD_CHARACTERS`. Exercise real movement, serve, forehand, backhand, volley, running drain, idle recovery and point recovery on both seats.
- [x] **2. Unlock and picker:** Add `tests/hidden-character.test.ts`, first asserting no hidden card with `characterPicker('lin',false)`. Add `src/ui/hidden-character.ts` with `HiddenCharacterUnlock(storage,report)`, `activate()`, `reset()` and `selectable(id)`; storage key `rally-hidden-master`, value `1`. Test four/five clicks, interruption, persistence and storage exceptions. Wire native title button, shared controller and safe selection persistence into `src/ui/app.ts` and `src/ui/characters.ts`; style title in `src/ui/style.css`.
- [ ] **3. Owned costume:** Add `wuming` to actual model animation tests and an integrity test before asset generation. Author `scripts/assets/hidden-master.py` to recolor only existing uniform pixels and cuff material while preserving geometry/skin buffers. Output `public/models/characters/wuming.glb`, matching `public/portraits/wuming.png`, editable source and provenance/hashes under `assets/characters/wuming/`. Inspect portrait and browser-rendered model.
- [ ] **4. Network:** Extend `tests/rooms.test.ts` using real sockets to cover hidden ID validation, lobby selection, identical state, active-match lock, resume and rematch. Unlocked client state is not transmitted or required by the opponent.
- [ ] **5. Verification and closeout:** Run `node --import tsx --test tests/hidden-character.test.ts tests/characters.test.ts tests/rooms.test.ts`, then `npm test`, `npm run build`, and `git diff --check`. Verify browser phone-size picker, five-click reveal, 99 meters, reload, practice self/opponent and two-client room. Save screenshots and coverage in `docs/hidden-master-verification.md`, update `docs/MASTER_CHECKLIST.md` and spec status.

### Execution evidence / remaining gates

- Task 3: GLB and CPU-rendered PNG complete, source buffers preserved exactly, 22 model tests pass. Actual GPU/browser view and optional `.blend` export remain unverified/blocked. Rebuildable editable GLB and Python source preserved.
- Task 4: Real-socket regression written but blocked by `listen EPERM`. Additional in-process `Rooms` protocol test passes, including identical state, resume and rematch; not represented as real-socket evidence.
- Task 5: 257 tests excluding the two port-dependent test files (`rooms.test.ts`, `http.test.ts`) pass; production build and `git diff --check` pass. Browser testing blocked by inability to start a local server. An offline file-navigation attempt was rejected by browser URL policy and was not bypassed. No final-completion claim until these remaining gates are verified.

## Concrete acceptance assertions

```ts
assert.equal(CHARACTERS.length, 10);
assert.equal(STANDARD_CHARACTERS.length, 9);
assert.deepEqual(Object.values(getCharacter('wuming').stats), [99,99,99,99,99,99]);
assert.ok(!characterPicker('lin', false).includes('pick-character-wuming'));
assert.ok(characterPicker('lin', false, true).includes('pick-character-wuming'));
```

RED commands must fail on the new requirement, not an unrelated environment failure. GREEN commands must cover real physics and actual GLB bytes in addition to UI strings. Browser screenshots are required for visual evidence; desktop emulation is not real-phone acceptance.
