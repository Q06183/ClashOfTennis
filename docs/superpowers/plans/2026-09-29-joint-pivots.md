# Joint-pivot correction

Approved continuation: preserve revision-3 proportions and continuous skin, but
make articulation rotate about actual joints rather than rescale limb segments.

- [x] Reproduce variation in actual LowerArm -> Hand length across strokes.
- [x] Fixed anatomical wrist from elbow orientation and a constant segment length;
  palm rotation pivots about that wrist, never moves it or resizes the forearm.
- [x] Limit upper/forearm/hand mixed weights to small shoulder/elbow/wrist zones.
- [x] Isolated elbow and wrist tests must check actual deformed midshaft vertices,
  not just bounds. Dynamic bone scale and limb length must be invariant.
- [x] Add an isolated joint inspection mode with angle controls in the lab.
- [x] Test all three prototypes, hands/seats, strokes, pauses and repeat draws.
- [x] Regenerate GLBs/editable sources and inspect isolated poses plus stroke regressions.
- [x] Full regression/build and update the master checklist with evidence limits.

No paid generation, separate body-part geometry or changes to authoritative
contact/racket reach. Original non-prototype assets retain legacy behavior.
