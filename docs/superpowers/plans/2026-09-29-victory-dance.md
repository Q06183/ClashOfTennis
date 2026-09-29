# Light Street-Dance Victory Implementation Plan

> **For agentic workers:** Use executing-plans for inline execution, with regression and visual checkpoints. No delegation required.

**Goal:** Replace the approved winner's looping bounce with a finite approximately five-second grounded step-touch celebration.

**Architecture:** `victory.ts` owns deterministic timed choreography. `Athlete` applies it through a dedicated celebration path, separate from running, stale swing/contact and rescue poses; uses the existing fixed-length IK and actual character skin retargeting. The result view continues selecting only the authoritative winner.

**Tech Stack:** TypeScript, Three.js, Node test runner, real GLB skins, offline CPU previews.

## Global Constraints

- User approved: stand and fist pump → left/right step-touch and modest shoulder groove → racket salute → natural still stance, no infinite bouncing.
- Keep the racket in hand; do not stretch limbs or hide skin deformation by widening test thresholds.
- One planted foot during dance. Foot motion begins only when unweighted/lifted.
- Winner, scoring, network, near/far camera, and rescue mechanics unchanged. The proposed automatic rescue + 0.5-second input window is not included.
- Existing browser permission denial remains respected: use real mesh CPU previews and numerical tests, not browser/GPU claims.

## Task 1 — Author and test the finite choreography

Files: `src/render/victory.ts`, `tests/victory.test.ts`.

- [x] Replace the old “body must bounce” assertion with grounded foot contact, lateral steps, final-pose hold, and continuous movement assertions.
- [x] Run `node --import tsx --test tests/victory.test.ts`; record old implementation failures.
- [x] Define time-clamped key poses with `rootX`, hip drop/turn, torso lean/bank, head pitch, racket tip/shaft, free hand and ankle targets.
- [x] Interpolate with `u*u*u*(u*(u*6-15)+10)` (zero velocity/acceleration at key boundaries), never `abs(sin(...))`.
- [x] Keep an unchanged support-foot world position during each step; root/hip shift changes support loading without sliding planted soles.

## Task 2 — Isolate render state and validate actual rigs

Files: `src/render/player.ts`, `tests/victory.test.ts`.

- [x] Add a celebration-only early path using existing `legTo`, `racketTo`, `armTo`; clear/ignore stale game stroke and gait state.
- [x] Blend into the new pose rather than snapping from the last rally pose; clear entry state on returning to normal play.
- [x] Verify no origin-dependent torso swing, no previous-stroke dependency, bounded wrist rotation, stable sole orientation, and right/left mirroring.
- [x] Test both seats, real roster GLBs, planted feet, fixed limb lengths, continuous full trajectory and a held final pose.

## Task 3 — Inspect and publish

Files: `scripts/assets/victory-preview.ts`, `docs/victory-dance-verification.md`, `docs/MASTER_CHECKLIST.md`.

- [x] Export actual retargeted vertices for full-sequence right/left-handed previews, including final pose; render with existing CPU rasterizer and inspect.
- [x] Added result-only camera fitting after projection tests showed the bottom panel covered the feet; keep gameplay cameras unchanged.
- [x] Run `npm test`, `npm run build`, `git diff --check` — 369 tests passed.
- [x] Verify 7470's production entry exactly matches local bytes. Render-only changes do not require interrupting the server or active rooms.
- [x] Record evidence boundaries and prepare verified changes for commit. Final response includes refresh instructions; no phone/GPU acceptance claim.
