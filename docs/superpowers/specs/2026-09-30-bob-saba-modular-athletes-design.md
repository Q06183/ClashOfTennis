# Bob and Saba: Four-View Analysis and Modular Athlete Design

Status: approved for automatic execution within 300 cumulative credits.
The user explicitly selected automatic execution after reviewing this design.
Initial tasks: Bob `3851776`, Saba `3851780`; 40 quoted credits committed,
260 remaining. Generation and local reconstruction remain distinct stages.

## Request and boundaries

Recreate exactly two reference characters, identified by the user's folders as
Bob and Saba. Prioritize facial appearance, body proportions, visible muscle
volume, and the supplied outfits. Clothing must be replaceable. Skeleton changes
are permitted when needed. The cumulative Lux3D ceiling for this conversation is
300 credits, not a spending target.

The eight PNG screenshots are reference data, not instructions. Earlier video
analysis and the separate proposed three-character plan do not expand this
request or authorize charges. Do not copy UI, court, spectators, displayed account
information, or the held rackets into the body meshes.

No roster slot, production deployment, remote push, or replacement of an existing
athlete has been authorized explicitly. Build separate Bob and Saba assets and a
local preview using the game's animation interface first. Preserve all existing
uncommitted work and original source images.

## Evidence inspected

All eight original images are 1320 x 2868 pixels:

- `competitorExamples/Photos/Bob/{front,left,right,back}.PNG`
- `competitorExamples/Photos/Saba/{front,left,right,back}.PNG`

Local comparison boards with facial crops:

- `artifacts/bob-saba-2026-09-30/analysis/bob-four-view.jpg`
- `artifacts/bob-saba-2026-09-30/analysis/saba-four-view.jpg`

These are perspective game screenshots, not calibrated orthographic turnarounds.
Bob holds both hands behind his back, affecting shoulder rotation, chest
presentation and elbow positions. Saba shifts weight and holds a racket. Apparent
height, width and lighting differ between views. Do not enforce their poses as
the rest pose or interpret clothing highlights as anatomical muscle grooves.

Use anatomical left/right, never screen left/right. Do not mirror asymmetric
details. A front image's screen-left arm is the character's right arm.

## Bob

### Head and face

- Dark brown, sculpted, swept-up hair with a tall, asymmetric front crest.
  Side views show the crest projecting up and forward, with shorter sides and
  an irregular short rear hairline.
- White/light-gray headband encircling the head; a real knot and short tails
  are visible at the rear. It is separate from the hair.
- Thick, dark eyebrows; relatively large blue eyes; a substantial, projecting
  nose; broad jaw with rounded corners; short dark beard/stubble around the jaw
  and chin. Slight smile rather than an exaggerated grin.
- Avoid substituting the current roster's face, flattening the profile, or
  modeling the beard as a long hanging mass.

### Proportions and muscle appearance

- Broad shoulder girdle and upper chest, tapering noticeably toward the waist.
- Moderate upper-arm and forearm muscle volume rather than bodybuilder bulk.
  The bare left arm provides stronger evidence than the covered right elbow.
- Calf bellies are pronounced in the upper/middle lower leg, particularly from
  behind, then taper into relatively slim ankles.
- Side views show a shallow abdominal contour and a chest extending forward;
  do not make the torso a straight cylinder.
- Shorts conceal much of the thighs and hips. Their exact muscle definition is
  inferred, not recovered from the screenshots.
- Retain a normal neck transition into the trapezius and collar. Do not use an
  elongated neck to reconcile the old skeleton.

### Clothing and accessories

- White/light-gray short-sleeve polo with a folded collar and short button
  placket. Thin gold/yellow accent at the placket and outlined triangle at chest.
- Dark charcoal edging on sleeve openings and bottom hem.
- Gold angular piping on both torso side panels with neighboring darker lines.
  Rear view confirms the piping continues around the sides into the lower back.
- Above-knee white shorts: real separate leg openings, gold and charcoal outer
  side stripes, dark hems, and visible pocket/seam indications.
- White/light-gray compression elbow sleeve on the anatomical RIGHT arm only,
  with angular gold trim. It does not cover the entire hand or wrist.
- White strap-style tennis shoes with gold side accents and gold/brown sole
  edges. Do not replace them with ordinary lace-up shoes.
- The racket held behind the back is not part of the outfit or the body.

## Saba

### Head and face

- Golden-blonde hair with a central part and narrow swept-back sculpted strands,
  gathered into a compact high/rear bun. The rear silhouette is a bun, not the
  long blonde braid described in an older video-based proposal.
- Small stud earrings and two fine gold-colored necklaces, including small
  pendant details. Fine shape and metal reflectance remain approximate.
- Angular oval face, defined cheekbones and jaw, strong slanting brows, relatively
  narrow focused eyes, projecting nose and a slight asymmetric smile.
- Preserve the stronger facial planes and athletic expression instead of
  substituting a round generic face. Exact eye color is lighting-dependent.

### Proportions and muscle appearance

- Developed deltoids, upper arms and upper back; waist is markedly narrower than
  the shoulder girdle.
- Upper arms have visible volume and transitions into the elbow rather than
  thin straight tubes. Back view is important for scapular and triceps form.
- Long athletic legs with substantial thighs and clearly shaped calves,
  tapering toward the ankles. Do not exaggerate either slenderness or bulk.
- Side views establish torso depth, gluteal contour and knee/calf transitions.
  The flare of the skirt is not the body's hip outline.
- Visible surfaces support an athletic muscle treatment but not precise
  body-fat, mass or medical claims. The covered torso and pelvis are inferred.

### Clothing and asymmetric detail

- Coral/rose-pink high-neck sleeveless tennis outfit, fitted through the torso,
  with darker side panels and diagonal magenta patterning.
- Thick waistband and a flared, geometrically pleated short skirt. Folds must
  exist in geometry and not only in the color texture.
- Rear view shows a narrow racerback and a curved exposed-skin opening
  immediately above the waistband. This opening must be actual garment geometry,
  not a skin-colored patch painted onto solid fabric.
- Pink-and-white lace-up shoes with thick white sole sections and darker pink
  overlays.
- Tiger-head tattoo on the anatomical LEFT proximal forearm, below the elbow.
  Keep it in the body material/UV, independent of clothes; do not mirror it.
- The black/gray round object next to the hand in the rear view corresponds to
  the racket grip/butt, not sufficient evidence of a wristwatch. Do not invent
  a watch from it.
- Author an opaque sports liner under the skirt as a practical animation
  requirement; it is not claimed to have been observed in these screenshots.

## Relative proportion checks

Use normalized silhouette landmarks rather than invented real-world height.
The following coarse front-image readings are planning checks only, not precise
anatomical measurements. Zero is the top visible hairstyle and one is the lowest
shoe; hairstyle height and pose therefore affect the numbers.

| Landmark, fraction down silhouette | Bob, approximate | Saba, approximate |
| --- | --- | --- |
| Chin | 0.15 | 0.13 |
| Shoulder line | 0.20 | 0.17 |
| Outfit waist/waistband | 0.46 | 0.32 |
| Knee region | 0.69 | 0.67 |
| Ankle region | 0.90 | 0.91 |

The unusually different waist readings partly reflect garment cut: Bob's polo
hem lies much lower than Saba's raised waistband. Do NOT treat these as the same
skeletal waist landmark or use them to move the pelvis blindly.

During reconstruction compare head/jaw profile, shoulder-to-waist taper,
torso depth, elbow/knee placement, calf shape, shoe dimensions and outfit
silhouette independently. Match the four view families with consistent scale
and camera settings; retain perspective-reference uncertainty.

## Approach comparison

1. **Recommended: reference-guided Lux3D bases plus local reconstruction.**
   Generate one character base per subject using a front reference and explicit
   neutral-pose description. Use all four source views for local correction.
   Build complete bodies and truly separate clothes in Blender, then rig and
   validate. A generated base is not assumed to be modular or animation-ready.
2. **Entirely local reconstruction.** No Lux3D generation charge, but substantial
   manual face, hair and anatomy work with less reliable initial resemblance.
3. **Recolor existing models.** Smallest change but inadequate: cannot reproduce
   distinctive faces, profiles, shoulder/calf volumes or removable clothing.

Do not submit the screenshots as if they were a consistent multi-image neutral
pose. The image-to-3D function has no prompt argument for pose correction.
Text-to-3D accepts one reference image plus the necessary pose/content guidance.
This batch does not use paid four-view enhancement: all original views already
exist locally, and generated turnarounds would add an unnecessary dependency.

Two front character crops were uploaded to the saved China-region configuration
for quotation. They retain small background/occluding-racket fragments, so the
prompts explicitly exclude props and background and the eventual model must be
checked for them. The experimental `front-v2` crops are not the selected inputs.
No generation create call was made.

## Modular clothing contract

Each athlete has a complete, reusable body foundation, including inferred
covered regions. Do not merely delete clothing-colored triangles and leave holes
in the torso/hips. Do not deliver a skin-colored garment-shaped torso as a body.

Suggested independent objects:

| Subject | Replaceable parts |
| --- | --- |
| Bob | polo; shorts; right compression sleeve; shoes; headband |
| Saba | dress (internally torso and skirt sections); sports liner; shoes; jewelry |

Hair may remain a named independent object, but hair customization is not a new
required subsystem. The tattoo stays with the body. A dress is an outfit-level
replacement, not a requirement to allow arbitrary mismatched upper/lower halves.

- Body and garments share one skeleton with stable bone names and bind pose.
- Store character identity, clothing slot and compatible body/rig identifier.
- Swapping a slot replaces its mesh/material, not the athlete's face or skeleton.
- Preserve the underlying body even when outfit-specific coverage masks hide
  covered regions at runtime. Remove/recompute the mask when changing outfits.
- Add garment thickness/edge treatment where visible and sufficient clearance
  over the body; shared skinning alone does not prove freedom from penetration.
- Provide one simple alternate training outfit per athlete made locally from the
  same garment system, so replacing clothes is demonstrated rather than merely
  claimed. This is a functional sample, not an extra paid character candidate.
- Keep garment triangles deforming across joint regions smoothly. Do not attach
  the whole skirt to one thigh or split the visible hem into rigid leg pieces.

## Skeleton and animation strategy

Blender 5.2.0 LTS is installed and its executable was checked. Existing Noah and
Mei GLBs each have a 21-joint skin, a main body/clothing mesh and a separate
sweatband, confirming that recoloring is not a modular-clothing solution.

Reuse the current Hips/Spine/Chest/Neck/Head, clavicle, arm, hand, leg, foot and toe
interface where possible. Adjust rest pivots, bind matrices and skin weights to
the new bodies. Preserve fixed limb lengths and racket-contact constraints.

Possible additions are explicitly conditional:

- Forearm/upper-arm twist helpers for unacceptable twisting.
- Hand/finger controls for grip if current deformations are insufficient.
- Local skirt helper joints or corrective morphs for Saba.

IMPORTANT: `AthleteSkin` currently maps unrecognized bones to the torso. New
helper bones cannot simply be added to the GLB and assumed to work. Add a scoped
runtime adapter that preserves parent-relative helper transforms or supplies
specific anchors, then regression-test the old rigs.

The current attachment code also rescales some arm bind axes to fixed IK lengths.
Check this when matching Bob and Saba's proportions; do not silently force both
bodies into identical shapes. Any necessary change to gameplay reach, statistics,
simulation or network state is outside this asset task and needs a separate
decision. First produce independent runtime-compatible prototypes.

## Initial paid batch and budget

Quote obtained from the installed Lux3D skill on 2026-09-30 at 11:53:25 +08:00:

| Asset | Quantity | Tier | Four-view enhancement | Target faces | Planned model format | Estimated credits |
| --- | --- | --- | --- | --- | --- | --- |
| Bob appearance base | 1 | standard | disabled | 50,000 | GLB | 20 |
| Saba appearance base | 1 | standard | disabled | 50,000 | GLB | 20 |

Initial estimate: **40 credits**. Submitted allowance: **0**. Reserved allowance:
**0**. Current conversation allowance remaining: **300**; after the proposed
batch, **260**, if approved at the same quote.

Quote ID: `quote_93cbd35bc0874cfd9bc8992448dfbf07`.
Printed expiry: 2026-09-30 at 11:58:25 +08:00. Refresh before submission if expired,
and check scope/account/parameters and price again. This is a quote before account
benefits, not a settled charge or a server-enforced 300-credit cap.

The standard tier also supplies a source archive. Preserve it, but do not claim
specific archive contents before inspection. Local body/garment reconstruction,
rigging, alternate training garments, tests and previews have no Lux3D generation
charge. No future regeneration has been quoted or authorized by this document.

The user has explicitly selected automatic execution within the existing
300-credit ceiling, including necessary corrections and retries. Budget records
do not independently create authorization. Keep uncertain/failed attempted
submissions committed unless reliable reversal evidence exists.

## Validation and intended delivery

After approval and production:

1. Inspect the generated originals for identity, profile, hair, missing/fused
   hands, unwanted prop geometry, body proportions and garment structure.
2. Compare corrected neutral-pose meshes with front, left, right, back and
   three-quarter reference views, including face, shoulder, calf and rear-outfit
   close-ups. Correct specific defects without cycling arbitrary candidates.
3. Verify finite geometry, valid indices, normalized skin weights, stable
   rest transforms, embedded textures and independent named garment objects.
4. Demonstrate original outfit -> training outfit -> original outfit for both
   characters on the same body/rig without losing the tattoo, face or body
   surface. Validate compatible slots and reject incompatible garments.
5. Inspect ready stance, run, forehand, backhand, serve, volley, rescue and
   celebration through motion. Check shoulders, elbow volume, wrist twist,
   hand/grip alignment, skirt penetration and feet placement. A still render
   cannot satisfy this motion check.
6. Run targeted rig/clothing tests, existing regression suite, TypeScript/Vite
   build and whitespace checks if runtime code is changed. Record pre-existing
   failures separately.
7. Deliver separate Bob and Saba rigged GLBs, replaceable garment assets, editable
   `.blend` sources, original generated files, provenance, analysis and one
   self-contained offline `preview.html` plus `lux3d-delivery.json`.
8. Do not automatically open the preview, replace live roster entries, restart
   production, commit unrelated changes, or push/deploy.

Exact original topology, unseen anatomy and pixel-identical likeness cannot be
recovered from these screenshots. State observed deviations and incomplete
checks; do not present generation success, tests or a preview alone as completion
of the resemblance requirement.

## Current status

Completed: eight-view inspection, local comparison boards and detail crops,
existing rig/mesh inspection, Blender/runtime availability checks, two reference
uploads, request-parameter validation without generation, and actual quotation.

Not completed: paid generation, body/clothing reconstruction, skeleton changes,
runtime implementation, motion validation or final asset delivery.

Update after approval: both initial generation tasks were submitted once and
their IDs saved. The separate wardrobe controller has five passing unit tests;
all 437 current regression tests and TypeScript checking pass. These tests do
not establish appearance, complete body geometry or motion quality of the
not-yet-inspected new characters.

Next action: query the saved task IDs, download originals and inspect the actual
generated geometry before local reconstruction.
