# Rescue Coverage Implementation Plan

> **For agentic workers:** Execute inline with executing-plans, task-by-task; shared checkout contains other uncommitted work and must not be reset.

**Goal:** Increase physically credible lateral rescue coverage without changing stamina odds, reach or ball direction.

**Architecture:** Measure a continuous ordinary-contact window rather than a single reachable sample. Forecast and stage normal footwork before a last-safe lateral launch; use bounded initial-velocity-aware trajectories with short/long recovery timing. Match remains authoritative and actual racket reach gates hits/holds.

**Tech Stack:** TypeScript, Three.js, Rapier, Node test runner, WebSocket.

## Global Constraints
- Maximum lateral travel 3.5m; speed 9m/s; acceleration 65m/s².
- Keep 10%–90% stamina lottery, one draw per incoming flight, actual contact, .5s hold.
- No forward/backward airborne translation or mesh changes; slice bounce randomness remains.
- New prediction is provisional and recalculated after bounce, movement and input.
- Preserve manual footwork intent; pre-position automatically only when ordinary assistance is allowed.
- Back up source/runtime/static entry; do not commit unrelated work or overwrite concurrent releases.

## Execution readback
- [x] Stable/grazing window separation and ordinary instant contact protection.
- [x] Momentum-aware cubic trajectory, analytic extrema, bounded reverse braking, short recovery.
- [x] Early normal-footwork planning, late revalidation, bounce/input invalidation, per-flight counters.
- [x] 216-case baseline comparison; real released-skin contacts; short-rescue two-socket tests.
- [x] Full 504/504, typecheck, production build, browser short/left-hand pose inspection.
- [x] Frontend resource-first deployment and zero-room backend restart.
- [x] Final deployed no-input rescue success/timeout receipt and documentation closeout.

Detailed evidence and explicit reverse-running tradeoff: `docs/rescue-coverage-2026-09-30.md`.
The task checkboxes below preserve the original implementation plan.

### Task 1: Stable ordinary windows
Files: `src/simulation/return-plan.ts`, `src/simulation/rescue.ts`, `tests/rescue-coverage.test.ts`.
- [ ] Write stable-vs-grazing regression and verify failure.
- [ ] `canWaitForBounce(..., minimumWindow=.05)` retains ordinary callers; rescue uses .10s.
- [ ] `hasNormalReturnWindow` accumulates consecutive legal reachable time, resets on gaps.
- [ ] Verify ordinary legal contact is still taken immediately and never stolen by rescue.

### Task 2: Momentum-aware short and long lateral targets
Files: `src/simulation/rescue.ts`, `src/simulation/types.ts`, tests.
- [ ] Add `launchVx?:number`, `short?:boolean` to authoritative rescue state.
- [ ] Cubic trajectory x(u)=x0+d*(3u²−2u³)+v0*T*(u³−2u²+u); derive velocity/acceleration analytically and gate maxima.
- [ ] Same-direction motion is preserved; opposite motion cannot reverse instantly.
- [ ] Search .16–.90s, allow short reach >=.35m only outside ordinary reach; validate a multi-tick contact interval.
- [ ] Short rescue uses step-out and shorter post-contact recovery, with existing canonical pose phases.
- [ ] Test mirrored sides, velocity bounds, real skinned contact and no leg/arm scaling.

### Task 3: Early planning / late commitment
Files: `src/simulation/rescue.ts`, `src/simulation/match.ts`.
- [ ] Forecast an approach with normal `movePlayer`, not teleportation, when no immediate lateral target exists.
- [ ] Keep candidate plan private and revalidate each decision; allow preparation before service bounce but never illegal contact.
- [ ] Delay launch only while normal movement can preserve the candidate; decide near last-safe time, then draw once.
- [ ] Ordinary stable windows veto, instant ordinary reachable balls retain priority.
- [ ] Add per-flight local counters: candidate, stable veto, staged, lottery passed, contact, missed; no per-tick denominator inflation.

### Task 4: Coverage, regression, release
- [ ] Deterministic scenario sweep against saved baseline: candidate/start/contact counts and unchanged odds.
- [ ] Full `npm test`, TypeScript, production build, actual GLB checks, two-socket protocol verification.
- [ ] Check motion in browser; distinguish deterministic suite from real-phone results.
- [ ] Publish resource-first/HTML-last; restart backend only with no active rooms.
- [ ] Update MASTER_CHECKLIST and release receipt with evidence, measured limits and remaining acceptance.
