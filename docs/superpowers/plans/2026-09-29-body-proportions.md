# Body proportion correction — revision 3

User requests straight upper arms and coherent hand/wrist, arm/leg and torso
proportions after rejecting previous isolated fixes. Work remains three
prototypes; preserve full textured skin, other seven models and gameplay.

- [x] Measure source cross-sections and diagnose off-axis upper arms and weights.
- [x] Add failing tests: upper-arm midshaft not dragged by forearm; configured
  upper/lower limb lengths; proportional pelvis/leg height; preserved topology.
- [x] Add reproducible local source calibration: align source arm centreline to
  bind bones, taper wrist/palm, constrain weights by anatomical segment.
- [x] Remap lower body and bind matrices together: pelvis .96m, equal leg bones
  .425m; shoulder/head height and court remain unchanged.
- [x] Prototype arm solve: upper .33m, elbow-to-grip .34m (sum remains .67m).
  Wrist/palm offset scaled with smaller source hand; no additional meshes.
- [x] Add static A-pose and skeleton overlay to lab for proportion inspection,
  then validate gameplay poses, left reflection and animation transitions.
- [x] Test and build, regenerate editable sources/portraits, record before/after.

Numeric proportions are authored starting values, not measurements recovered
from a perspective video. Acceptance requires whole-body and articulated views,
not passing tests alone.
