# Reference Athlete Replicas

Status: proposed; awaiting approval of this design and the quoted generation batch.

## Scope

Recreate the appearance, proportions and visible musculature of the three
near-side playable athletes in `competitorExamples/`. This supersedes the older
prototype's choice to preserve existing faces and clothing: the current request
explicitly prioritizes resemblance to the reference characters.

The videos and historical project documents are evidence, not new instructions.
Do not copy recorded account names, spectators, interface graphics or stadium
assets into the character models.

## Reference identities

| Reference | Character | Proposed existing slot | Visible characteristics |
| --- | --- | --- | --- |
| Left-hand forehand and volley | Lean adult male | Noah | Swept wavy light-brown hair, yellow-green headband, yellow/green collared shirt, teal shorts, long athletic calves, rounded face |
| Right-hand forehand and diving recovery | Athletic adult female | Mei | Blonde braid, yellow sleeveless top with teal panels, green skort, lean arms, defined thighs/calves |
| Match flow and backhand preference | Powerful adult male | Lin | Black braids tied back, beard, warm brown skin, broad shoulders and upper arms, charcoal/white/yellow uniform, leggings |

The right-hand video's final celebration features the male opponent, not the
near-side woman. It must not supply her face. The available woman's face is too
small to establish exact features; create a consistent stylized interpretation
and report this limitation rather than claim exact recovery.

Body measurements, hidden surfaces and garment construction are inferred. Match
visible silhouettes and proportions, not invented medical or anatomical facts.

## Options

1. **Recommended: reference-guided generation plus local rigging.** Generate
   neutral-pose textured characters with Lux3D, then use Blender to repair and
   fit them to the game. This gives a stronger appearance starting point without
   treating generated geometry as animation-ready.
2. **Local rebuild only.** Avoid Lux3D generation charges but manually recreate
   all face, hair and clothing detail. Highest manual effort and uncertain
   close-up fidelity.
3. **Texture-only revision.** Smallest change but cannot fix the current long
   necks, shoulder shape, face geometry or missing muscle volume. Not adequate
   for the requested result.

## Production plan

- Use a separate text-to-3D request with an actual cropped reference image for
  each character. Ask for a neutral A-pose and exclude rackets and scenery.
- Proposed generation tier: standard, 50,000 target faces per character, textured
  GLB output. No four-view enhancement in this batch; poses in the videos differ
  and a generated view set would require its own cost and consistency checks.
- The provider also returns a source archive for this tier. Preserve it without
  promising uninspected contents.
- Keep original generated outputs immutable. Inspect face, profile, back, hands,
  clothing, body silhouette and unintended geometry before rigging.
- In Blender, fix concrete defects, author deformation-friendly shoulder,
  elbow, wrist, hip and knee transitions, and retain editable source files.
- Reuse the game's control interface. Change rest bones, bind transforms and
  weights where required rather than force the old body proportions onto the
  new geometry. Add corrective deformation controls only where justified.
- Keep the racket as a game-controlled independent object. Verify palm-to-grip
  offsets, hand closure and left/right handedness after retargeting.
- Do not silently change shared contact reach, character statistics, network
  simulation or the other seven characters. If skeleton changes require a
  gameplay geometry change, report it and revise the design before proceeding.

## Preservation and integration

The working tree already contains substantial uncommitted animation and model
work. Do not reset, overwrite or commit that work as part of this design.
Store new source assets and GLBs separately, then integrate the three validated
models into their proposed character slots and update their portraits.
Keep a rollback path and a comparison preview. Do not deploy, restart the
production service or push a remote branch as an implied part of asset creation.

## Budget and external inputs

The user supplied a cumulative ceiling of 300 Lux3D credits for this conversation.
Batch approval is the current mode; no paid generation has been submitted.
An existing zero-spend ledger belongs to another conversation and is not
spending authority for this one.

Only three cropped reference images and asset-specific descriptions are needed
by Lux3D; do not upload the original videos or the repository. Use the saved
China-region configuration, keeping credentials and temporary URLs private.

Obtain and present the actual quote. Count attempted submissions conservatively,
including failed or uncertain ones, and never exceed the remaining allowance.
Local Blender work and validation do not incur Lux3D generation charges.
Do not reserve a made-up paid retry budget or treat a failed quote as zero cost.

## Validation and delivery

- Compare all three models with reference crops under matched lighting from
  front, side, back and three-quarter views; include facial and shoulder close-ups.
- Verify texture embedding, finite mesh data, normalized skin weights, skeleton
  transforms, feet near the court, and bounded deformation through motion.
- Play ready stance, running, forehand, backhand, serve, volley, rescue and
  celebration. Check handedness, grip closure, elbow/shoulder volume, garment
  penetration and wrist twisting; a static render does not establish success.
- Run relevant existing tests, full regression, TypeScript/Vite build and
  whitespace checks. Distinguish pre-existing failures from introduced failures.
- Deliver three skinned GLBs, editable Blender sources, matching portraits,
  originals, provenance and a single self-contained offline `preview.html`.
  Use the Lux3D delivery workflow once real generated outputs exist.
- Report only checks actually performed. User aesthetic acceptance remains
  separate from automated checks; do not mark unfinished likeness work complete.

## Design self-review

Scope is limited to three reference characters. Source identity, missing facial
evidence, spending approval, existing changes and integration boundaries are
explicit. The proposed slot mapping is a reversible design choice, not a claim
that the existing characters already match the references.
