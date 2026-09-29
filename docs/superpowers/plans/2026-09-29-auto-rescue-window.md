# Automatic rescue and half-second contact window

**Approved behavior:** automatic detection independent of swipes; physically paced lateral dive; freeze both athletes and ball at actual reachable contact for up to 0.5s if no input; queued input hits immediately; timeout resumes the original ball without a hit/rewind. Existing stamina lottery, ordinary-return priority, legality, and winner dance remain.

## Implementation checkpoints

- [x] Add regressions for no-input auto launch, slower distance-dependent travel, real racket contact, exact 0.5s freeze, queued/immediate/late/invalid input, timeout continuation and no repeated rescue.
- [x] Add authoritative `rescueWindow` state; freeze simulation time, physics, stamina and both players while only the window countdown advances. Ignore movement during hold. Clear on reset/finish.
- [x] Forecast further ahead and choose reachable lateral paths with bounded speed/acceleration; map natural travel time onto existing authored dive poses, preserve 0.5s get-up. Do not enlarge arm reach.
- [x] Update render/playback/camera/HUD so snapshot extrapolation and local movement prediction cannot move frozen objects. Synchronize both clients and handle disconnect/resume.
- [x] Update superseded short-travel/no-input test fixtures, preserving physical contact and ordinary-return gates; add real two-WebSocket hold/success/timeout tests.
- [x] Inspect actual GLB contact/hold/release poses, run full regression/build/diff check, deploy both client/server only when rooms empty, verify production bundle and live sockets — 377 tests passed; live success and timeout verified.

No subagents. No browser bypass or GPU/phone acceptance claims. A 0.5s hold is explicitly a game input aid, not real-world tennis physics.
