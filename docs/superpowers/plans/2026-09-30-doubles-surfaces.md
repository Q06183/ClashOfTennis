# Doubles and surfaces implementation plan

> **For agentic workers:** Execute task-by-task using executing-plans; verify each test cycle before continuing.

**Goal:** Four-seat human/AI doubles rooms with correct tennis rules, selectable scoring, and selectable hard/clay/grass in every mode.

**Architecture:** Keep the existing authoritative Match and character rendering. Separate player identity from team identity, centralize scoring and surface responses, and extend room membership and presentation to four players. Surface selection is server-authoritative in rooms and part of matchmaking compatibility.

**Tech Stack:** TypeScript, Three.js, Rapier, Node WebSocket, node:test, Vite.

## Global constraints

- Work only in `/Users/bytedance/.codex/worktrees/doubles-surfaces/TennisClash`, branch `codex/doubles-surfaces`, base `210a959`.
- No changes to character assets, skins, rigging or authored poses. No restart of 7470, no publication or push.
- Preserve hard-court/singles defaults and existing tests; ignored original Bob/Saba GLBs have been copied with matching hashes for baseline tests (504/504).
- Authoritative state, prediction and rendering must agree. No surface-dependent airborne direction scatter. Existing slice authority RNG remains.
- Accepted research/spec: `docs/doubles-surfaces-research-2026-09-30.md`.

## 1. Surface response, movement and prediction

Files: create `src/simulation/surfaces.ts`, `tests/surfaces.test.ts`; modify `physics.ts`, `match.ts`, `types.ts`, `movement.ts`, `reception.ts`, `return-plan.ts`, `rescue.ts`.

Interface: `SurfaceId = 'hard'|'clay'|'grass'`; `surfaceProfile(id)`; `bounceVelocity(incoming, ball, random?)` yields shared post-bounce Vec; optional `surface` on ball/player snapshots supports old snapshots.

- [ ] Red: identical launches must first bounce lower on grass than hard and higher on clay; grass retains more horizontal velocity; stronger topspin response on clay; default equals hard.
- [ ] Run `node --import tsx --test tests/surfaces.test.ts`; record feature-absence failures.
- [ ] Add immutable profiles, surface-aware collider restitution and shared expected/authority bounce adjustment. Feed profiles into all analytic rebound paths and mover braking/acceleration.
- [ ] Green: run surface, reception, slice, rescue, movement tests and `npm run build`; numeric comparisons use same incoming ball.
- [ ] Commit only surface code and tests after green.

## 2. Doubles identity, scoring and court rules

Files: `src/simulation/types.ts`, `rules.ts`, new `scoring.ts`, `tests/doubles-rules.test.ts`.

Interface: `Seat = 0|1|2|3`, `Team = 0|1`, `teamOf(seat)`, `partner(seat)`; seats 0/2 are team 0, 1/3 team 1. Scores and winners are teams; server/hitter/receiver remain seats.

- [ ] Red: four-player service order (one then pairs in tiebreak), fixed deuce/ad receivers, rally width 5.485m versus service width 4.115m; full standard set deuce/advantage, six-all tiebreak, winning by two.
- [ ] Implement focused scoring state with point-in-game parity and cumulative points independently tracked. Change ends every six tiebreak points or odd standard games.
- [ ] Green: rules/scoring tests and old singles rules tests.

## 3. Four-player authoritative match and AI

Files: `src/simulation/match.ts`, `ai.ts`, focused team positioning helpers, `tests/doubles-match.test.ts`.

- [ ] Red: create four players; teammates cannot play the same return; designated receiver only for service; doubles alleys count in rallies but not serves; original server/receiver retained after first fault and second-service let.
- [ ] Extend arrays/iteration and replace identity-based opponent checks with teams; retain existing hitting/rescue mechanisms. Select assisted receiving player by reach/interception, support manually positioned partner.
- [ ] Add standard-score integration, end changes, service let handling and physical contact distinctions (input alone is not a fault).
- [ ] Green: run natural AI 2v2 rallies, all-human inputs, same-player successive exchanges, match-end and rematch tests. Run existing singles regression.

## 4. Four-seat room lifecycle and matchmaking surfaces

Files: `server/rooms.ts`, `src/network/client.ts`, `types.ts`, `tests/doubles-rooms.test.ts`, existing matchmaking tests.

- [ ] Red: create doubles room; join 1–4 humans; host sets bot/free seats and moves occupants; non-host or in-play changes rejected; ready invalidated after config changes; bots run on server.
- [ ] Implement typed validated create/config messages. Preserve tokens across seat moves and reconnect; host migrates on explicit leave; never overwrite human without a move.
- [ ] Red/green: selected surface included in rooms/matches; same-surface queue pairing only; cancellation and reconnect authoritative; three real WS clients plus bot and four real clients agree.
- [ ] Commit protocol after targeted tests.

## 5. Presentation and surface UI

Files: `src/render/court.ts`, `view.ts`, `trajectory.ts`, `src/network/playback.ts`, `src/ui/app.ts`, `style.css`; focused surface/room UI helpers.

- [ ] Red: snapshot playback retains/interpolates all four players; guide uses doubles width and designated service box; changing ends does not blend across discontinuity.
- [ ] Render four existing Athlete instances; team/local markers; camera shows doubles width and follows player's current end. Do not alter models or poses.
- [ ] Court palettes plus clay grain/grass stripes, reuse scene geometry/materials and dispose replaced GPU resources.
- [ ] Turn court tag into keyboard-accessible picker; home practice/rooms/quick-match all carry choice. Host room picker, four slots, bots and team swap controls; standard scoring and serving/receiving roles visible.
- [ ] Build and browser-check 390×844, small phone and landscape. No unavailable button claims.

## 6. End-to-end proof and delivery

Files: `tests/doubles-network.test.ts`, scoped browser scripts if required, `artifacts/doubles-surfaces-2026-09-30/`, accepted checklist.

- [ ] Full `npm test`, `npm run build`, `git diff --check`; retain logs.
- [ ] Isolated preview server on a free non-7470 port. Browser create/configure room, switch all surfaces, start mixed doubles, run four-client rally, reconnect, complete standard/tiebreak and rematch.
- [ ] Validate 1 human + 3 bots, 2 humans on same/opposite teams, 3 humans + bot, four humans. Verify authoritative same-state and mode/surface matrix.
- [ ] Compare incoming bounce velocity/height and movement per surface. Inspect rendered court/player visibility and console errors.
- [ ] Review diff protects character files and original service. Report exact preview path/port and evidence; distinguish browser QA from unperformed real-phone acceptance.

## Current execution

- Baseline readback: clean code at `210a959`, 504/504 tests, production build passed.
- User design approval received. Task 1 next.
