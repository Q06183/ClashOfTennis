# Reference-motion evidence — analysis passes 1–2

Status: **research in progress; no game-animation changes in this task yet**.

This is an evidence record, not a claim that every rally or all source frames have
been visually reviewed. All three videos have a decoded presentation-timestamp
index and a two-second overview. Selected motion windows have native consecutive
frames. Repeated rallies, off-screen limbs, fine fingers and some recovery tails
still need coverage.

## Inputs and indexing

| Local reference | Duration | Container frame count | Decoded presentation frames |
|---|---:|---:|---:|
| `competitorExamples/右手正手+飞身救球.mov` | 97.701667 s | 5,862 | 5,845 |
| `competitorExamples/左手正手+截击.mov` | 141.590000 s | 8,474 | 8,456 |
| `competitorExamples/匹配流程+反手为主要习惯.mov` | 133.486667 s | 7,966 | 7,954 |
| Total | 372.778334 s | 22,302 | 22,255 |

Resolution is 1320 × 2868. Nominal rate is 60 fps; timing is not exactly constant.
Use decoded frame index and `best_effort_timestamp_time`, **not `time * 60`**.
Container counts and decoder counts differ; do not silently equate them.

Local evidence directory: `artifacts/reference-motion-2026-09-29/`.

- `analyze.py`: reproducible local-only extraction and labelled contact sheets.
- `{right,left,backhand}-frames.json`: decoded frame-index/PTS tables.
- `overview/`: coarse two-second navigation only, not frame-level evidence.
- Each extracted interval has a `manifest.json`, full-resolution JPEG frames and
  labelled sheets. `everyNthSourceFrame=1` means no source frames were skipped in
  that window. Locate sheets explicitly use larger intervals.
- `model-audit.json`: actual current GLB hashes, skins, joint counts and clips.

Pass 1 extracted 598 native consecutive frames across ten windows. Pass 2
added 696 native frames across nine windows, bringing the total to **1,294
native frames across nineteen windows**. A separate 641-frame census sampled
every 30th decoded frame of the gameplay intervals.
Extraction alone is not visual acceptance. Sheet-level review and detailed
phase notes below distinguish observed evidence from further work.
Nothing was uploaded to Lux3D or another external service.

## Motion observations and phase landmarks

Times below refer to the source recording, not an animation's local clock.
Visual contact times are approximate because ball trails and gesture overlays
can obscure the exact racket/ball overlap. They are not recovered physics data.

### Right-hand forehand

Evidence: `right-forehand-native`, 8.82–9.65 s, F530–F578.

- 8.835–9.052: lower stance, torso side-on, racket behind/low on the hitting side,
  free arm forward as counterbalance; the legs do not simply stay upright.
- 9.068–9.135: extension through the legs and torso; the racket accelerates
  low-to-high. Contact neighbourhood is around 9.085–9.135, not a proven
  single contact frame.
- 9.152–9.285: arm crosses the front of the body, weight transfers; the rear
  heel/foot is released rather than both soles being forcibly locked flat.
- 9.302–9.618: racket returns to the front, knees re-flex into ready stance.

Implementation implication: load/uncoil/contact/follow-through/recovery need
different speeds. Preserve exact runtime contact IK, while timing the pelvis,
thorax, off-hand and foot pivot together. Do not infer a full second of wind-up
from a held preparation waiting for input.

### Forehand in the left-hand reference

Evidence: `left-forehand-native`, 31.85–32.75 s, F1910–F1963.

- 31.853–32.187: held side-on loading, wide staggered feet, racket low behind the
  body, non-hitting arm forward. Much of this interval is a held pose.
- 32.203–32.337: hips and torso open, knees extend, racket sweeps forwards.
- 32.353–32.420: short high wrap towards the opposite shoulder.
- 32.437 onward: lower racket and settle into a staggered ready stance.

Pass 2 checked enlarged, unmirrored source crops in `handedness-check.jpg`.
In the rear-view ready pose at 6.002 s and stroke at 32.303 s, the racket grip
is attached to the left forearm. The front-facing celebration at 124.395 s
instead shows the racket in the character's right hand. This is evidence of
a gameplay/celebration handedness difference in the reference, not a reason
to label the playing forehand right-handed. Our declared left-handed
characters must retain their selected racket hand in gameplay and celebration;
mirror the celebration choreography rather than silently swapping hands.

### Standard double-handed backhand

Evidence: `backhand-normal-native`, 91.5–93.0 s, F5451–F5540;
`backhand-follow-native`, 93.0–93.6 s, F5541–F5576.

- 91.508–92.008: forward running approach and braking.
- 92.025–92.192: widen and settle feet, bring the racket up in front.
- 92.208–92.492: unit turn with both hands, then racket drops beside the bent legs.
- 92.508–92.792: a held loaded pose; this is not slow continuous swinging.
- Around 92.808–92.892: two hands drive forward/up through the ball region.
- 92.908–93.142: high follow-through with both hands still engaged.
- 93.192–93.592: return to front-ready stance.

Implementation implication: keep the support hand mechanically connected to the
handle through the fast stroke; preserve a separate single-backhand release
track. A normal double backhand and a one-handed emergency reach are different
actions, even for the same character.

### Volley

Evidence: `left-volley-native`, 34.35–35.15 s, F2060–F2107;
locating/recovery context in `locate-volley`.

- 34.353–34.487: arriving forward, short preparation with racket in front.
- 34.503–34.637: firm forward/staggered stance and compact held block.
- Around 34.653–34.687: short punch/block and outgoing ball trail.
- 34.703–34.953: restrained follow-through; no big baseline backswing.
- 34.970–35.137: racket recentres without long shoulder wrap.

Implementation implication: upper-body volley has a short track; lower body can
still be approaching/braking. Do not stop all footwork merely because the
preparation progress is near contact.

### Airborne emergency forehand

Evidence: `right-leaping-forehand-native`, 32.4–33.4 s, F1941–F2000;
recovery context continues to 34.7 s in `locate-right-30`.

- 32.403–32.637: feet spread, racket reaches low/outward, torso starts banking.
- 32.653–32.770: lateral take-off; free arm extends opposite the reaching arm,
  legs trail asymmetrically; silhouette becomes diagonal.
- 32.787–32.853: airborne upward racket sweep and outgoing ball.
- 32.870–32.987: lead leg reaches down while the trailing leg bends.
- 33.003–33.070: landing compression and gathering step.
- 33.087–33.387: long lateral recovery step/lunge with the racket kept low.
- Coarse context by approximately 33.7: recovering to ready.

**Observed distinction:** this selected rescue lands on the feet. It does not
become a full prone push-up. The current shared `rescuePose()` rotates every
kind towards prone after the reaching phase, so its recovery is not faithful
to this example. Do not generalize this finding to every unseen dive.

### Airborne emergency backhand

Evidence: `backhand-leap-native`, 24.4–25.4 s, F1431–F1490.

- 24.402–24.518: wide base and lateral preparation.
- 24.535–24.668: sideways take-off, torso inclines, racket arm reaches.
- 24.685–24.768: hitting arm extends while the other arm opens backwards;
  this is not a normal two-handed backhand grip throughout.
- 24.785–24.985: lead foot comes down, trailing knee stays folded.
- 25.002 onward: compressed foot landing and lateral recovery.

The visible pattern again supports a foot-landing rescue variant instead of
forcing every save through one full-body prone animation.

### Supported/falling rescue — important counterexample from pass 2

The first pass's foot-landing saves are **not all the saves in the recordings**.
Two far-player examples visibly use lower-body/hand support after landing.
The on-screen label reads `远身救球`; OCR retained this text without treating
it as a physics classification.

**Left recording, far white-shirt player:** `far-dive-left-native`,
86.65–88.5 s, F5196–F5306. The first crop missed the rightmost athlete during
flight; review used `detail/sheet-01..05.jpg`, cropped from the original
full-resolution frames rather than decoding a new timeline.

- 86.658–86.925: lateral approach, broad base and reaching preparation.
- 86.942–87.108: take-off into a diagonal, then more horizontal silhouette.
- 87.108–87.158: extended hitting-arm region and outgoing ball;
  exact overlap remains obscured by overlays.
- 87.192–87.342: lead leg reaches down, rear leg stays raised.
- 87.358–87.492: feet gather below a strongly pitched-forward torso.
- 87.525–87.742: torso lowers further; hands/forearms approach the ground,
  one leg trails rather than both feet snapping directly to ready.
- 87.758–88.042: compressed hand/knee-supported posture.
- 88.058–88.325: rises and regains the ready stance.

**Backhand recording, far purple-shirt player:** `far-dive-backhand-native`,
62.1–64.0 s, F3690–F3803; review `detail/sheet-01..05.jpg`.

- 62.105–62.338: turn, crouch and lateral launch preparation.
- 62.355–62.538: nearly horizontal flight and reaching arm.
- 62.555–62.705: rotation towards a low sideways/seated-looking landing.
- 62.722–63.172: roll/weight transfer into a low supported posture.
- 63.188–63.455: push-up/rise with pelvis following the support.
- 63.488–63.788: upright recovery and racket recentring.

Small far-player silhouettes do not establish which exact palm or knee carries
force, nor the collision surface beneath clothing. Nevertheless, the temporal
order and low-support phase clearly differ from the near-player foot-landing
leaps. Therefore the design requires **both** `step-out` and `supported-fall`
recovery families. Removing every floor recovery would be as unfaithful as
forcing every save through it. No frequency or selection probability can be
inferred from these examples alone.

### Running and split-step

Evidence: approach frames above; `split-step-native`, 61.65–62.25 s,
F3695–F3730; locating context in `locate-right-60`.

- Running: cadence tied to travel, alternate bent-knee recovery, compact racket
  carry and a separate free-arm swing. Transition to ready shortens steps.
- 61.657–61.757: narrow running/gathering base.
- 61.773–61.873: feet separate, racket comes back to front-ready.
- 61.890–62.240: wider lowered receiving stance.

Foot spread and knee flexion are clear. A precise airborne height and contact
order are **not** established from these single-camera frames; do not claim a
measured jump height. Shadow-to-foot separation is confounded by camera motion.
Further native sequences should isolate left/right shuffle, crossover, forward
acceleration, backpedal and the receiving split-step relative to the other
player's strike.

Additional native locomotion windows reviewed in pass 2:

| Window | Source / frames | Observed sequence |
|---|---|---|
| `forward-run-native` | Left, 33.403–34.337, F2003–F2059 | Wide ready base → foot gathering at 33.503 → forward drive at 33.553 → alternating running legs → shortened approach and racket brought forward before volley |
| `backpedal-native` | Right, 30.253–31.837, F1812–F1907 | Rearward/diagonal retreat with chest still oriented to net; compact hands; lower leg reaches back before support; small gathering/ready resets near the end |
| `lateral-run-native` | Backhand, 23.252–24.385, F1362–F1430 | Initial direction change → torso turns into travel → long asymmetrical running stride → braking/gathering from about 24.135 → widened loaded base by 24.252 |

The last example is a turning run/crossover-like chase, **not** evidence that
all lateral movement should be a parallel-foot shuffle. Differentiate long
chases from short receiving adjustments. Screen-space movement of the court
must not be mistaken for root speed. Neither raw pixel displacement nor a
single feet-off-shadow gap is a measured world-space velocity/jump height.

### Celebration

1. Left-reference winner, `celebration-left-native`, 123.15–124.7 s,
   F7380–F7472: settle, raise free hand beside the face, hold an expressive
   gesture, step/cross the feet, then point/thumb-like gesture towards camera.
   Racket stays low and is not the main raised prop.
2. Backhand-reference winner, `celebration-backhand-native`, 126.0–127.2 s,
   F7513–F7584: short racket flourish/open hand, lower racket, raise the free arm
   into a biceps/fist gesture, hold while turning gaze towards it.
   `locate-celebration-backhand` also shows release/settle around 127.8–128.2.
3. Right-reference winner, `locate-right-ending`, 94.0–97.67 s: scoreboard shows
   0–7 and the close-up is the **far opponent**, not the near female player.
   The visible close-up ends at the phone control-centre overlay; do not
   invent an unrecorded full celebration.

Pass 2 completed native-frame review of the visible tails:

- `celebration-left-ending-native`, 124.712–125.495, F7473–F7520:
  the free-hand finger/thumb-like pointing gesture reaches towards the camera;
  the crossing/raised foot lowers, feet collect, then the hand drops as the
  head tilts. This is not an endless looping side-step.
- `celebration-backhand-ending-native`, 127.212–128.545, F7585–F7665:
  the flexed free arm opens into a wave, descends across the chest, then the
  player bends forward into a bow-like acknowledgement with racket behind.
  Thus the last motion is **not merely return to upright ready**. The selected
  window ends mid/bottom bow; later cut-to-court must not be invented as an
  observed upright ending.
- `celebration-right-winner-native`, 95.208–96.592, F5701–F5784:
  purple-clad winner stands with the ball in the free hand, lifts/angles the
  racket in front around 95.51–95.79, then lowers it by 96.29 and looks sideways.
  The control-centre overlay truncates later choreography.

Final boundary check: `celebration-bow-cut-native`, 128.562–129.145,
F7666–F7701, confirms the bow continues through 128.912. At 128.928 the
character has reset to a ready pose during the rapid camera transition; by
128.945 the view is back on court. There is no recorded smooth bow-to-upright
return. Any smooth game exit from the bow is an authored continuation, not
something recovered from these frames.

The current single 5.2 s step-touch-and-racket-salute animation is intentionally
different. A reference-inspired system needs distinct profiles and a finite
settled ending. Detailed hand signs need local hand deformation/finger controls;
16 rigid hand bones cannot reproduce them exactly.

## Proportion evidence — do not conflate scale with crop

Initial hand-read pixels from 660 × 1434 review copies:

| Sample | Athlete top/foot y | Far/near centre-baseline y | Approx. athlete/court depth |
|---|---|---|---:|
| Right F3714, 61.973 s | 1123 / 1329 | 302 / 1028 | 0.284 |
| Left F1959, 32.670 s | 972 / 1166 | 366 / 1118 | 0.258 |

These are **rough screen-space observations**, with about 5–10 px landmark
uncertainty and different player depth, posture and camera yaw. They are not
measurements of real body height. The backhand sample at the service line cannot
be compared to a baseline player without correcting depth.

Current camera projection was queried mathematically, not browser-rendered:
`frameMatch`, 660 × 1434, nominal 1.96 m athlete.

| Player z | Far athlete px | Far court px | Ratio |
|---:|---:|---:|---:|
| 11.885 | 77.683 | 395.569 | 0.1964 |
| 12.4 | 78.518 | 395.581 | 0.1985 |
| 14.0 | 81.179 | 395.619 | 0.2052 |
| 16.0 | 84.622 | 395.667 | 0.2139 |

The current near preset multiplies projected lengths by 1.9 and preserves these
ratios. Therefore **zoom alone cannot fix a player/court ratio mismatch**.
Calibrate camera elevation/depth/FOV against registered court landmarks before
rescaling the physical rig or changing reach. Preserve legal court dimensions.
Retain the existing straight rear view unless camera orbit is explicitly chosen.

## Current game architecture and constraints

Baseline inspected: `316cb6721d719a200470f4fcb195e49c5fedded2`.
Another task is actively editing this same checkout; later implementation must
re-read affected files and preserve its approved timing/input changes.

Pass 2 read the checkout at `8345791` (pace-dependent placement forgiveness).
No runtime code or shipped model was modified by this analysis task. Do not
attribute the other task's rescue/touch-return changes to reference alignment.

Actual assets: ten GLBs (nine standard characters plus Wuming), all with one
16-joint skin and no embedded animation clips.

Current deformation skeleton:

```
Hips → Spine → Neck → Head
             → UpperArm_L → LowerArm_L → Hand_L
             → UpperArm_R → LowerArm_R → Hand_R
Hips → UpperLeg_L → LowerLeg_L → Foot_L
     → UpperLeg_R → LowerLeg_R → Foot_R
```

- `src/render/player.ts`: canonical-right-handed solver, whole-rig reflection,
  fixed two-bone limb IK, racket target and support-hand constraints.
- `athlete-skin.ts`: retargeting to actual mesh; bounds wrist bend and matches
  skin segment endpoints. Preserve these anti-stretch safeguards.
- `strokes.ts` + `stroke-body.ts`: related but separate racket/torso/leg tracks;
  most non-serve strokes use a common 0.44 s recovery.
- `footwork.ts`: world-planted feet and distance-driven phase; no distinct
  receiving split-step track or explicit toe rollover.
- `rescue-strokes.ts` + simulation `rescue.ts`: shared prone recovery.
- `victory.ts`: one choreography for the whole roster.
- `camera.ts`: straight centred rear camera; zoom presets preserve proportions.

Existing authority additions from the other task include natural rescue travel
and a shared 0.5 s contact-input freeze. Those are gameplay decisions, not motion
capture artefacts. Animation work must not erase them.

## Recommended next design (not approved or implemented yet)

1. Preserve current appearance/assets and court physics.
2. Build an explicit control rig: root/pelvis/thorax/shoulder controls, fixed
   limbs, ankle/heel/toe contacts, racket grip and off-hand targets.
3. Prototype on one right-handed and one left-handed character. Add deform
   Chest/Clavicle/Toe bones only where the existing skin cannot express the
   observed motion; validate bind pose and weights before migrating all assets.
   Keep an explicit legacy-rig fallback rather than breaking ten GLBs at once.
4. Author event/phase tracks: prepare, hold, accelerate, exact contact,
   follow-through, land/brake, recover. Preserve both the observed step-out and
   supported-fall rescue families; neither may stand in for the other.
5. Add locomotion and receiving-step transitions, then left/right forehand,
   double/single backhand, compact volley, saves and celebration profiles.
6. Match registered reference/game silhouettes at the same action phase and
   comparable court depth; supplement with side/front views to catch
   self-intersection that the reference camera hides.
7. Validate fixed limb lengths, racket contact, support-hand distance, planted
   foot sliding, vertex deformation, 20/30/60 fps transitions, freeze/resume,
   both seats and all ten models. Run current full regression and build.

Alternatives:

- Only tune existing 16-bone pose numbers: fastest, but shoulder/foot/hand
  expressivity remains limited.
- Rebuild every character via Lux3D: unnecessarily changes appearance and does
  not itself recover animations from the videos; not recommended now.

No paid Lux3D requests have been made for this task. User ceiling: 300 credits.
Local analysis and local Blender rig/animation work have no Lux3D generation
charge. If a paid operation becomes necessary, obtain its real quote and follow
the selected approval mode before submission; do not treat 300 as a spending goal.

## Remaining evidence work

- [x] Build a whole-gameplay navigation queue: `action-census.json/.md`,
      local OCR on 641 frames, 111 **candidate** label windows.
- [ ] Visually enumerate/verify remaining rally actions; OCR is not exhaustive
      and a persistent label does not prove a new stroke.
- [x] Record native forward, backward and turning lateral chase windows.
- [ ] Add clean short shuffle and receiving-split cycles tied to opponent contact.
- [x] Verify the selected left-hand playing grip and identify the celebration
      handedness difference with enlarged original crops.
- [x] Establish foot-landing and supported/falling save counterexamples.
- [ ] Classify remaining saves and complete per-variant contact/support review.
- [x] Extend all three visible celebration segments and distinguish winners.
- [x] Inspect the backhand winner's last bow-to-cut boundary.
- [ ] Annotate court corners and compare registered near/far player proportions.
- [ ] Complete design approval before changing game behaviour or rig assets.
- [ ] Implement and verify; no tests/builds in another task count as this task's
      motion-fidelity acceptance.

## Research tooling and evidence limits

`action-ocr.swift` uses local Apple Vision text recognition. `build-census.py`
groups label detections by time and near/far label-height hint. No video bytes
are uploaded. This pipeline proposes a review queue, not a body pose, exact
impact, exhaustive event count, or completion certificate.

The original crop for `far-dive-left-native` excluded part of the flight.
The `detail/` crop and original images were inspected to repair that gap;
do not use the first crop alone as proof of a completed flight review.
