# Reference-aligned athlete rig and motion — proposed design

**Status: proposed, awaiting user review. No implementation approval inferred
from automatic goal continuation.**

## Objective and scope

Make the existing game's athletes, body/court proportions and motion vocabulary
match the three local recordings, including:

- Right- and left-handed forehands.
- Backhands, retaining the game's single/double-handed distinction.
- Compact volleys.
- Running, short lateral adjustments, braking and split-step transitions.
- Airborne rescue hits, landing, and recovery.
- Finite, character-specific post-match celebrations.

“Especially” does not exclude the other existing actions. Include serve/toss,
overhead smash, lob and forehand/backhand slice in the motion inventory and
integration regression. Review their source occurrences where present; when a
clip contains no usable example, explicitly mark the missing reference rather
than claiming that an unchanged action was made reference-identical.

The full objective is not satisfied by attractive still poses, a working
skeleton, passing unit tests, or a few selected frames. Each requested motion
needs a source-backed phase comparison and actual continuous game playback.

Evidence: `docs/reference-motion-analysis-2026-09-29.md`.
The 111 OCR-proposed windows are a navigation queue, not verified completeness.
Continue the per-action review rather than claiming all source footage analysed.

## Proposed choice

**Recommended: retain the ten existing character appearances; upgrade their
shared control/deformation rig as needed, then author motion against the videos.**

Alternatives considered:

1. Tune only the existing 16-bone poses. Less migration work, but limited
   independent shoulder, torso and foot articulation.
2. Regenerate all characters. Changes already accepted appearances, spends
   credits and still does not supply reference-accurate movement. Not selected.

This work is local-first. No paid Lux3D asset is currently proposed.

## Non-goals and invariants

- Do not redesign faces, clothing, roster, stats, room flow or scoring.
- Do not erase the latest pace/placement changes from the other task.
- Preserve authoritative ball physics and legal contact; animation never grants
  a hit merely because an authored pose reached its contact marker.
- Preserve the approved rescue auto-anticipation and real-time 0.5 s input
  freeze. A reference frame is not authority to remove that assistance.
- Preserve fixed limb lengths, support-hand constraints and mirrored-seat aiming.
- Preserve regulation court dimensions unless later reference measurement
  establishes a deliberate, user-approved physical-scale change.
- Do not infer hidden limbs, force distribution, exact joint angles or completed
  celebrations from cropped/occluded footage.
- Keep original GLBs and Blender sources available; do not destructively replace
  all ten assets during the first prototype.

## 1. Rig first

### Control hierarchy

Use one explicit canonical right-handed control model:

```
MotionRoot (authoritative horizontal position; visual vertical/pivot offsets)
  Pelvis
    Spine
      Chest
        Neck / Head target
        Clavicle L/R
          UpperArm L/R → Forearm L/R → Hand L/R
    UpperLeg L/R → LowerLeg L/R → Ankle L/R → Toe L/R

Independent world-space controls:
  Racket sweet spot / grip orientation
  Support-hand grip
  Heel / toe / ankle contact targets
  Elbow and knee poles
  Ball gaze target
```

Control nodes and deformation bones serve different purposes. A named control
without corresponding useful deformation is not proof that a rig was improved.

The first deformation upgrade is **21 bones**: existing 16 plus Chest,
two Clavicles and two Toes. Keep existing bone identities where practical.
Add twist/finger deformation only after inspecting the actual mesh topology and
demonstrating a concrete need. Do not promise an exact finger-pointing sign using
one rigid hand bone. If the topology cannot support it, document the limitation
and refine the existing hand locally before calling it reference-equivalent.

### Binding and migration

- Prototype with Lin and Noah, covering right/left reflection.
- Reuse source geometry/materials; normalise coordinate systems once.
- Preserve bind-world transforms when introducing intermediate bones.
- Redistribute weights smoothly around chest/shoulder and toe bends; never
  assign whole triangles by crude spatial bins alone.
- Validate bind-pose silhouette, weight normalisation, zero unbound vertices,
  joint lengths, and continuous mesh deformation before migrating others.
- Propagate to all ten models, including Wuming's derivative texture/materials.
- Retain a tested legacy-16-bone adapter during migration. The final delivery
  must state which models actually use the upgraded skin; fallback compatibility
  alone does not count as migrating the roster.
- Export editable local Blender sources and runtime GLBs; maintain a manifest
  of source/output hashes and the bone schema version.

## 2. Shared motion clock and constraints

Each action has named stages:

`enter → load → hold → accelerate → contact → follow → land/brake → recover`.

Not every stage exists in every action. Stage durations differ by action.
Recorded preparation pauses must not be stretched into a slow full swing.
The racket, pelvis, chest, off-hand, gaze and support feet sample the same clock.
IK makes bounded corrections around authored tracks, not independent poses
that fight the body.

Data flow:

1. Read authoritative/interpolated player state and the current shot/rescue event.
2. Select motion family and style from stroke, handedness, support state,
   movement direction/speed, contact height and event history.
3. Evaluate phase tracks and foot contacts.
4. Apply the shared contact geometry and fixed-length limb IK.
5. Apply skin retargeting/deformation.
6. Reflect the completed canonical rig once for a left-handed player.

The root used by rescue reach eligibility and the rendered rescue pivot must
agree. Changes to the rescue body model require a shared pure calculation and
new authority/render contact regression, not a visual-only offset that makes a
legal ball miss the racket.

During input freeze, sample the same event and same motion time on both clients.
Real-time countdown can advance without changing pose, locomotion phase, ball
or stamina. Resume from that pose, not from a wall-clock-advanced animation.

## 3. Action families

### Groundstrokes

- Forehand: broad loaded stance, pelvis starts uncoiling before the arm,
  low-to-high racket acceleration, released rear heel, opposite-shoulder wrap,
  then gathering recovery. Preserve independent left/right handedness.
- Double backhand: unit turn, shared grip, lower racket beside loaded knees,
  two-arm forward/up drive and high finish. Do not detach the supporting hand
  early merely to make IK easier.
- Single backhand: own preparation/release/counterbalance track; do not label
  an emergency one-handed reach as proof of a normal single-backhand stroke.
  Additional source evidence remains necessary where clips are ambiguous.
- Distinct preparation hold and fast strike; retain exact runtime contact.

### Other existing strokes

Keep serve/toss, overhead, lob and slice as separate tracks in the same shared
clock/rig contract. The three recordings' serve sequences must be reviewed for
toss, loading, racket drop, extension and landing; no current serve regression
may be discarded to make the new rig pass. Catalogue usable overhead/lob/slice
evidence or record its absence. Do not fabricate unseen reference variants.

### Volley

Racket stays ahead of the trunk, preparation is short and the motion is a
compact block/punch. Lower-body approach and braking may continue independently;
late preparation must not freeze a moving player's legs. Forehand/backhand
volley sides remain distinct without becoming full groundstrokes.

### Locomotion and split-step

- Separate forward run, backpedal, short shuffle and turning/crossover chase.
- Blend direction and speed continuously, with entry/braking steps.
- Drive stride from actual travel, but use explicit heel/toe support phases.
- Avoid forced parallel shuffling for long lateral chases.
- Add an event-aware receiving split: gather/load, small unweighting/spread,
  land/flex, directional push-off. It is not a perpetual idle bounce.
- Preserve foot planting during support; turn/pivot about a supported part of
  the foot, not a sliding flat sole.
- Derive visual timing from match events so both clients agree, including
  low-frame-rate playback, pause, point transitions and reconnect.
- Quantitative jump height remains a design estimate until stronger source
  evidence is available; label it as such.

### Rescue

Source review establishes two required recovery families:

1. **Step-out rescue:** side take-off, asymmetric trailing legs, extended hit,
   lead foot landing, compression, follow-up lunge/gather, ready.
2. **Supported-fall rescue:** horizontal/diagonal flight, low sideways landing,
   controlled descent/roll to hand/knee support, delayed pelvis rise, ready.

Keep forehand, backhand, volley and high-contact arm tracks distinct.
The first pass must not delete supported falls simply because the selected
near-player leap landed on its feet.

Select and latch the recovery family for an event before contact; do not
randomly change it each render frame. Prototype selection from travel, contact
height and body extension, with explicit animation-preview overrides for both.
Any effect on movement lockout belongs in authority state and requires gameplay
approval/testing; do not silently shorten recovery because a new animation ends.

### Celebration

Use finite profiles, selected deterministically by character:

- Low racket + face-level free-hand gesture + crossing/collecting step +
  point/thumb-like acknowledgement + settle.
- Short racket flourish + free-arm flex/fist + open-hand acknowledgement +
  bow-like finish.
- Reserved racket/ball acknowledgement based on the visible purple winner.

Profile assignments are proposed art choices, not identities copied from the
reference players. Preserve the winning athlete, correct racket hand and
previous-pose entry blend. The left-reference celebration changes racket hands;
our left-handed profile should mirror its gesture, not reproduce that mismatch.

Only source-visible motions count as observed. If the recording ends or cuts
before a final settle, author and label a safe continuation rather than claiming
it was captured. Keep result UI framing separate from match camera framing.

## 4. Player/court proportion calibration

Separate:

1. Physical rig/court/racket dimensions.
2. Camera elevation/depth/FOV and projection.
3. Uniform near/far crop/zoom.

The existing near preset scales all projected lengths by 1.9 and leaves the
player/court ratio unchanged. Therefore zoom-only tuning is insufficient.

For several unoccluded frames, annotate court intersections, near/far athlete
head/feet, racket extent, posture and athlete court depth. Fit/register court
perspective, then compare the athlete at the same depth and phase.
Initial rough ratios in the analysis report are hypotheses, not final targets.
Keep straight rear framing as the initial game presentation; reference camera
yaw/orbit must not be introduced silently as part of a scale adjustment.

## 5. Delivery and verification

### Evidence deliverables

- Updated phase/interval ledger for all reviewed reference actions.
- Rig schema, binding report and per-model source/output hashes.
- Editable local Blender sources and runtime assets for migrated characters.
- Side-by-side source/game contact sheets and continuous playback for each
  motion family, both handednesses and both seats.
- An offline preview with source files/manifests if new model assets are
  delivered. Do not automatically open it merely because it exists.
- A clear list of source occlusions, inferred details and remaining mismatches.

### Acceptance gates

1. **Rig:** all ten shipped models have valid weights/bind poses, the documented
   joints and stable limb lengths; actual deformed meshes remain intact.
2. **Contact:** rendered sweet spot and authoritative contact agree throughout
   legal contact fixtures, not just at a single centre-court shot.
3. **Hands:** double-backhand support stays on the grip; left-hand reflection
   preserves geometry and does not flip wrists or swap hands.
4. **Feet:** support contacts remain planted, no ground penetration, intentional
   heel/toe roll, clear take-off/landing and controlled gathering steps.
5. **Source fidelity:** every requested category has annotated source stages,
   the corresponding game stages, and visually reviewed continuous transitions.
6. **Rescue:** both observed landing families pass visual/contact checks and
   preserve the input-freeze/resume contract.
7. **Celebration:** correct winner, finite profiles, source-supported gestures,
   safe entry from run/serve/rescue and no uncontrolled looping.
8. **Proportions:** multiple depth-corrected near/far comparisons, not one rough
   screenshot ratio or a larger zoom value.
9. **Runtime:** 20/30/60 fps, both seats, all ten assets, network interpolation,
   paused/held/resumed actions and point/match transitions.
10. **Regression:** current full tests, production build and whitespace checks;
    actual browser playback with no new errors. Desktop proof does not replace
    phone/friend playtest feedback.

Set numeric fidelity thresholds after the source landmark uncertainty and
baseline measurements are established. Never loosen a guard merely to certify
a mismatched pose, and never invent centimetre-accurate 3D ground truth from a
single 2D view.

## 6. Budget and execution boundary

- User Lux3D ceiling: **300 credits for this conversation**.
- Committed/reserved in this task: **0 / 0 credits**.
- No new generation is currently planned; local rigging/animation has no
  Lux3D generation charge.
- Before any paid operation: real quote, scoped plan, applicable user approval,
  and budget reservation. Record every attempted submission and task ID.
- Existing source asset use does not reset or expand spending authority.

## Review request

Approve or revise the recommended retained-appearance rig/motion route,
including both rescue recovery families and handedness-preserving celebration.
After approval, create a detailed implementation plan and proceed in bounded
stages, retaining the full reference-fidelity goal and migrating all ten models.
