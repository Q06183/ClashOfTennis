# Reference Motion Implementation Plan

> **For agentic workers:** use executing-plans inline, one verified milestone at
> a time. Do not dispatch agents without user authorization.

**Goal:** Retain ten character appearances, upgrade real deformation to 21 bones,
then align each motion family with the recorded evidence.

**Architecture:** Preserve binary geometry, UVs and images while extending GLB
skins locally. Runtime control anchors remain separate from deformation bones.
Shared pure phase calculations coordinate racket, body and support contacts;
authoritative contact, input freeze and rescue travel remain unchanged.

**Tech Stack:** TypeScript, Three.js, Node test runner, local Blender.

## Global Constraints

- Preserve faces, clothing, body dimensions, roster and court physics.
- No paid generation; ceiling remains 300 credits, not a spending target.
- Preserve 0.5 s contact freeze, natural rescue travel, fixed limb lengths and
  mechanically connected two-hand grips.
- Source frames are observations, not reconstructed mocap or physics.
- Legacy 16-bone support is required; all ten actual shipped skins must migrate.
- Do not claim video fidelity or real-phone acceptance from unit tests alone.

## Milestone 1 — deformation and control rig

Files: `scripts/assets/upgrade-rig.ts`, `scripts/assets/save-control-rigs.py`,
`src/render/player.ts`, `src/render/athlete-skin.ts`,
`src/render/body-controls.ts`, `tests/control-rig.test.ts`.

- [x] Save the current ten GLBs under `artifacts/reference-motion-2026-09-29/legacy-models`;
  compute a source/output manifest. Keep original Blender projects untouched.
- [x] RED: actual model tests assert 21 bones, weighted Chest/Clavicle/Toe,
  normalized weights and unchanged vertex/material/image payloads.
- [x] Run `node --import tsx --test tests/control-rig.test.ts`; expect missing
  Chest/Clavicle/Toe assertions before implementation.
- [x] Add five joints with bind-world-preserving reparenting, append inverse
  bind matrices and four-influence weights without re-exporting geometry.
- [x] Prototype Lin and Noah, then migrate the remaining eight only after checks.
- [x] Add independent runtime chest, shoulder and toe anchors. Change arm IK to
  solve in the actual shoulder-parent coordinates. Keep wrist limits.
- [x] Verify independent vertex deformation, exact neutral binding, contact
  reach, left reflection and legacy loading. Save editable `.blend` siblings.
- [x] Run all tests/build; inspect textured continuous browser previews.

## Milestone 2 — ground contact and motion phases

Files: `src/render/footwork.ts`, `src/render/body-controls.ts`,
`src/render/motion-phase.ts`, `src/render/strokes.ts`,
`src/render/stroke-body.ts`, `tests/reference-motion.test.ts`.

- [x] RED: toe-off changes heel height but not toe contact; no idle oscillation;
  shared prepare/hold/accelerate/contact clock gives exact contact at progress 1.
- [x] Add phase-driven heel/toe rollover without changing travel cadence.
- [x] Introduce groundstroke load-hold-fast-strike timing for forehand and
  single/double backhand; both racket/body sample the same phase function.
- [x] Verify both seats/hands at 20/30/60 fps, freeze/resume, fixed limb lengths,
  support-hand grip, skin bounds and continuous transitions.
- [ ] Compare key phases with right F530–578, left F1910–1963 and backhand
  F5451–5576. Record phase evidence separately from automatic checks.

## Milestone 3 — individually rebuilt action families

- [ ] Run/backpedal/shuffle/crossover and event-driven receiving split.
- [ ] Compact volley with moving approach: left F2060–2107.
- [ ] Step-out rescue: right F1941–2000 / backhand F1431–1490. Keep shared
  authority/render root geometry and preserve supported-fall as another family.
- [ ] Supported-fall rescue: left F5196–5306 / backhand F3690–3803.
- [ ] Character celebration profiles: free-hand gesture, flex/wave/bow,
  restrained racket acknowledgement. Finite ending; no silent handedness swap.
- [ ] Serve and overhead/lob/slice inventory: retain regression and explicitly
  mark evidence gaps where a matching source action is unavailable.

For every action: write its failing phase/contact test, implement only that
family, run targeted regression, inspect continuous preview and source-frame
comparison, record remaining differences before proceeding.

## Acceptance ledger

`docs/MASTER_CHECKLIST.md` remains the single live status ledger. Link per-run
reports there; do not mark unimplemented families complete. Production build
and browser preview do not constitute real-phone or complete-video acceptance.

2026-09-29 first implementation checkpoint: 404/404 and build passed. Rig
milestone delivered; phase and recovery-family changes are partial motion work,
not full reference acceptance. See `docs/reference-motion-implementation-2026-09-29.md`.
