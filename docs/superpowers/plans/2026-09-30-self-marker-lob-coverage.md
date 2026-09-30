# Self marker and doubles lob coverage repair

User request: a more visible foot ring and small overhead triangle for self;
repair front-court inactivity on a lob, choosing interception versus retreat.

## Confirmed direction and scope

- High-contrast lime ring with a dark rim; matching downward triangle above self.
  No text, no mouse/touch capture, fixed readable pixel size for the arrow.
- Bind to the viewer's actual seat, not serving player or physical-end slot.
  Visible in singles/doubles during play and point breaks; hidden in lobby and
  result so it cannot point at a hidden loser.
- Prefer a physically reachable overhead interception, otherwise retreat for a
  bounce. If the teammate has a clearly better opportunity, assign the ball to
  that teammate and retreat to cover, rather than staying fixed at the net.
- Preserve real reach, acceleration, stamina, service receiver restrictions,
  manual moves and existing short/long rescue rules. No new jump animation,
  extended arm reach or teleport.

## Evidence before repair

At main `a9f4e75`, front player 2 at (2.6, 3.4), partner 0 at (-2.6, 10),
incoming ball (2.3, 4, 3), velocity (0, 1, 5):
`returnPlan` finds a front-player smash at 0.72s, but `assistedReceiver` selects
the rear player only from post-bounce distance. `supportPosition` returns the
front player's old (2.6, 3.4), even with an early queued shot.

## Execution

- [ ] Reproduce marker and lob failures in tests before implementation.
- [ ] Add isolated self-marker view helper and wire it to actual seat/camera.
- [ ] Introduce bounded physically validated overhead forecasting and
  time-aware doubles receiver selection, plus lob-retreat support.
- [ ] Run mirrored seats, surfaces, smash/retreat, service exclusion, manual
  movement, no-double-hit and existing singles/nearby-rescue regressions.
- [ ] Run full tests/typecheck; build into a staging directory, not live dist.
- [ ] Browser-check visible self marker on contrasting surfaces and four seats.
- [ ] Publish verified bundle and server only at zero rooms; retain rollback
  and verify live authoritative movement and marker after reload.
