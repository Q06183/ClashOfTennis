# Six-character roster and match balance

Status: implemented and locally verified; new-character human playtest remains a calibration boundary.

## Product contract

Six freely selectable original adult characters, no progression/payments/random perks. Existing 林岳 is the all-rounder. Five new Lux3D models have distinct face, hair, skin and clothing, retaining independent rackets and the current contact-driven skeleton. All use the same collision reach and normalized 1.96m skeleton; body appearance grants no hidden reach bonus. User budget is 300 cumulative Lux3D credits; include the earlier 20, leaving 280 before this batch. Five standard 12k-face GLBs via text-to-3D; optional reference images are unnecessary because the user permits direct original design. Preserve source and editable rigs.

## Roster (0–100 display scale; each total 360)

| ID / name | Role | Move | Forehand | Backhand | Volley | Serve | Stamina | Appearance |
|---|---|---:|---:|---:|---:|---:|---:|---|
| lin / 林岳 | 均衡全场 |60|60|60|60|60|60|Existing ivory polo, dark hair|
| mei / 梅岚 | 跑动耐力 |78|54|66|44|42|76|East Asian woman, bun, teal/navy|
| rafa / 拉斐 | 正手进攻 |60|82|46|54|66|52|Olive skin man, wavy dark hair, terracotta/cream|
| sora / 空野 | 反手控制 |64|52|82|58|48|56|East Asian man, straight black hair, cobalt/gray|
| ines / 伊内丝 | 网前截击 |68|54|52|82|62|42|Deep brown skin woman, short natural curls, violet/plum|
| leo / 里奥 | 发球进攻 |48|68|50|66|84|44|Fair skin man, blond hair/stubble, green/gold|

Scores are design ratings, not copied Tennis Clash numeric rules. Attribute taxonomy is inspired by its official balance discussions: https://wildlifestudios.com/new-cards-rebalancing-april-2023/ and https://wildlifestudios.com/games/tennis-clash/news/tennis-clash-balance-update/ . Equal totals are only the initial budget, not proof of balance.

## Authoritative effects

- Movement: speed multiplier `1+(move-60)*0.0012`; acceleration uses the same multiplier. Braking, collision reach, input timing and movement boundaries remain common. Range here 0.9856–1.0216.
- Forehand/backhand/volley/serve: relevant stroke speed multiplier `1+(rating-60)*0.0025` (forehand uses 0.0012 after calibration), selected from actual contact type and side. Forehand/backhand also apply to respective high-lob strokes. Flight still satisfies shared net clearance and target landing. Stamina and stretch penalties still apply; rating does not convert a swipe into a higher colour tier or secretly alter swipe direction/depth.
- Stamina: consumption multiplier `1-(stamina-60)*0.002`, idle/point recovery multiplier `1+(stamina-60)*0.002`. Same 0–1 gauge, no extra resource, no bonus between first and second serves. Strong strokes additionally cost their speed multiplier to price their advantage.
- No randomness, auto-aim bonuses, enlarged rackets or special rules. All six effects available in practice and server-authoritative friend matches.
- Selection is explicit before play; saved locally, visible to both room members, validated by server, locked for live matches, preserved through resume and rematch. Unknown IDs rejected for room selection and safely defaulted for stale saved local values. Selecting a new character resets readiness.

## Balance acceptance

1. Ratings bounded, distinct strengths/weaknesses, equal initial total; baseline lin exactly preserves existing mechanics.
2. Measured movement time, actual legal serve/forehand/backhand/volley velocity, consumption/recovery checks (both seats). Effects may be constrained by safe over-net arc, documented rather than overstated.
3. Deterministic pairwise matches with both seat orders and multiple shot policies; report per-character win rates, point share, max rally, faults and sample size. Target roster overall wins 40–60%, no pair above 70% under tested policies. If not met, tune bounded coefficients/ratings and rerun; don't equate bot results with human fairness.
4. One-sided players can be countered by actual forehand/backhand targeting; volley requires net position and still cannot volley serve. Shot speed tiers/out-risk remain the current user-approved system.
5. New model manifests, rig/skin deformation tests and actual rendered animation checks; distinct appearance in game, selection previews, both seats and mirror picks. Mobile file sizes and failure fallback checked.
6. Real sockets verify different picks, validation, lock, resume/rematch; full LAN match; 390×844/small-screen UI inspection. Human balance remains a playtest boundary.

## Calibration evidence

Initial 270-game sweep showed Rafa70% wins. Reducing forehand weight to0.0012 removed that bias; expanding to1080 games revealed combined movement/endurance dominance. Final coefficients above (with shared braking) pass1080 calibration games and a further1080 held-out-seed games. Held-out overall wins45.0–55.8%, each pair30–70% gate passes; raw scores in docs/character-balance*.json. Tested policies: normal baseline, attacking baseline, selective net approaches after third shot;12 seeds and both seats per policy. A naive always-rush-net policy produced143:143 alternating service outcomes; it was replaced because it tested a strategy pathology, not labeled balanced. No capped match was assigned a fake winner in accepted reports.

No claim of universal or human-proven fairness; movement/stamina have smaller numeric multipliers because they affect every rally while individual stroke attributes are situational. Public ratings use the same points budget, but effect weights are explicitly different and visible in the UI.
