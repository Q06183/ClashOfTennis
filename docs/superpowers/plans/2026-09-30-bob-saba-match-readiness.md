# Bob and Saba match-readiness continuation

The user requests completion through actual match readiness. This continues the
approved replica/replaceable-clothing design, not a new spending approval.
Budget remains 140 committed / 160 available of 300. No new generation planned.

## User-selected appearance baseline

The user prefers the **original generated reference** models over the rebuilt
prototypes and asks to bind skeletons directly to those originals.
Use `artifacts/bob-saba-2026-09-30/original/bob_glb.glb` and
`artifacts/bob-saba-2026-09-30/original/saba_glb.glb`, not the four-view revisions
or the authored/fitted/remeshed derivatives.

Both originals were re-inspected: one mesh/material each, embedded textures and
UVs, no skin and no animations. Bob has 44,842 vertices / 47,138 triangles;
Saba has 39,118 vertices / 49,804 triangles. Missing skin is not a reason to
regenerate appearance.

First produce direct-rig versions by adding skeleton, inverse bind matrices and
weights while preserving POSITION, indices, UVs, normals, materials and image
bytes. Apply any unit conversion through a common parent transform rather than
reshaping the meshes. Test bind-pose identity numerically and compare renders
with the originals before testing motion. Do not change faces, proportions or
outfits merely to fit existing control anchors.

Only after this passes, separate garments while preserving their existing
triangles, UVs, weights and shared-boundary normals. Add missing covered body
surfaces separately for replacement outfits. This remains required, but must not
be allowed to degrade the chosen dressed appearance. Any local topology repair
must address an observed deformation defect and preserve unaffected regions.

## Critical path

1. Add a fitted skeleton and coherent skinning field directly to each selected
   original, without remeshing or regenerating it. Verify unchanged bind-pose
   appearance; split clothing only afterward. Retain covered anatomical surfaces.
2. Add a versioned runtime adapter for these assets, leaving all old rig paths
   unchanged. Bind-length matching, wrist pivot alignment, helper-bone inheritance
   and garment coverage must be explicit.
3. Test with the actual `Athlete.update` and celebration/rescue code, not custom
   demonstration actions. Measure seams, grip position, skin-edge stretch and
   ground contact, then inspect continuous rendered action sequences.
4. Preserve the user-selected original appearance. Address remaining reference
   detail differences only with bounded, reversible local changes; never replace
   the original with less faithful primitive garments or a different body.
5. Produce game-loadable GLBs, compatible outfit variants and editable packed
   Blender sources. Integrate only validated assets into the playable roster;
   preserve the existing ten players' statistics, paths and files.
6. Verify all targeted tests, full regression, build, asset loading and local
   gameplay. Package a verified offline preview with real match actions, originals
   and provenance. Keep remaining limitations explicit; do not label partial
   geometry as production-ready.

## File scope

- New: `scripts/assets/build-match-athletes.py`, scoped asset helper modules,
  `src/render/match-athlete-skin.ts`, `tests/match-athlete-*.test.ts`.
- Narrow integration: `src/render/player.ts` and its asset selection entry point.
- New assets only: `assets/characters/bob`, `assets/characters/saba`,
  `public/models/characters/bob*.glb`, `public/models/characters/saba*.glb`.
- Evidence: `artifacts/bob-saba-2026-09-30/match-readiness/`.

No remote push, deployment, existing asset overwrite or production restart.
