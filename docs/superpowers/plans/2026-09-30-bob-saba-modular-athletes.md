# Bob and Saba Modular Athletes Implementation Plan

> Execute inline with the executing-plans workflow; preserve unrelated working-tree changes.

**Goal:** Reproduce the eight supplied views as two rigged athletes with complete bodies and independently replaceable outfits.

**Architecture:** Lux3D supplies reference-guided appearance bases. Blender corrects and separates geometry, reconstructs hidden anatomy, binds bodies and garments, and exports editable sources and skinned GLBs. Keep cloud originals immutable and validate likeness and motion separately from file integrity.

**Tech stack:** Installed Lux3D Python runtime, Blender 5.2, Three.js, local Python image tools.

## Global constraints

- Only Bob and Saba; full scope in `docs/superpowers/specs/2026-09-30-bob-saba-modular-athletes-design.md`.
- User explicitly approved automatic execution, including necessary corrections and retries, with a cumulative ceiling of 300 credits.
- Private task root: `artifacts/bob-saba-2026-09-30`.
- One budget coordinator; record attempts before dispatch and task IDs immediately after.
- Do not overwrite current roster GLBs or concurrent rig/animation changes.
- Anatomical right sleeve on Bob; anatomical left tiger tattoo on Saba.
- Preserve Saba's bun, racerback opening and pleated skirt, Bob's collar and rear headband knot.
- No automatic preview opening, deployment, service restart or remote push.

## Task 1: Obtain and inspect immutable generated sources

- [ ] Record explicit approval in the task ledger and refresh the two-item quote with the existing exact parameters.
- [ ] Reserve the quoted batch only if cumulative total is at most 300; move reservations to committed when each create call starts.
- [ ] Save `private/bob-attempt-1.json` and `private/saba-attempt-1.json` before submitting once; save returned task IDs immediately.
- [ ] Query those IDs using `get_task`, never a generation convenience helper.
- [ ] Download all formats from `generation_result_formats` using the real output helpers into `original/`.
- [ ] Run `artifact_delivery.py inspect --help`, then inspect both actual GLBs and archive members.
- [ ] Render front, side, back and facial details in Blender. Reject scene fragments, wrong pose, fused fingers or incorrect appearance explicitly.

## Task 2: Build body and independent garment sources

- [ ] Create task-local Blender inspection and reconstruction scripts, deriving scale and segmentation from the actual generated assets rather than presuming topology.
- [ ] Fit silhouette and facial profile to original four-view boards. Keep an annotated record of visible remaining differences.
- [ ] Reconstruct complete torso, hips and covered limb regions; retain source color/UV data where correct.
- [ ] Split Bob into body, hair, polo, shorts, right sleeve, shoes and headband. Split Saba into body, hair, dress, sports liner, shoes and jewelry.
- [ ] Give dress back opening actual open geometry and skirt pleats volume. Keep tattoo with body.
- [ ] Make simple alternate training outfits locally to demonstrate mesh replacement on the same body.
- [ ] Save packed source `.blend` files under `assets/characters/bob/` and `assets/characters/saba/` only after geometry is inspected.

## Task 3: Rig and exercise the actual meshes

- [ ] Fit joints to measured neutral geometry and bind body/garments to a common skeleton per athlete.
- [ ] Preserve stable core joint names. New helper joints require explicit parent-relative runtime handling, not an accidental torso fallback.
- [ ] Verify finite vertices, valid indices, embedded textures, normalized weights and separate garment nodes.
- [ ] Export isolated prototype GLBs without replacing existing roster assets.
- [ ] Preview original/training/original outfit swaps while preserving face, body and tattoo.
- [ ] Inspect ready, running, forehand, backhand, serve, volley, rescue and celebration through motion; record shoulder, elbow, wrist, skirt and ground-contact defects.
- [ ] If project runtime files require changes, write scoped regression tests before those changes and run targeted tests plus `npm test`, `npm run build`, `git diff --check`.

## Task 4: Package and audit

- [ ] Use actual source task IDs and downloaded artifacts to build sanitized delivery snapshots.
- [ ] Read the installed delivery and scene evidence schemas before constructing bundle input.
- [ ] Package originals and corrected assets with a self-contained offline `preview.html` and `lux3d-delivery.json`; keep `.blend` and rendered media alongside.
- [ ] Load delivered GLBs in an isolated viewer, exercise rotation/zoom and the implemented wardrobe controls.
- [ ] Audit each user requirement against model renders and actual behavior. Do not mark complete when only generation or file checks pass.
- [ ] Report delivered paths, exact verified checks, known limitations and cumulative quote-based spend.
