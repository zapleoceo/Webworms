# Crater Crew — acceptance review

## 2 November reference and mechanics review

I compared the current build against the [original Team17 Worms Armageddon manual](https://ftp.zx.net.nz/pub/archive/ftp.team17.com/pub/t17/manuals/Worms_Armageddon.pdf), the [Team17 anniversary gallery](https://www.team17.com/games/worms-armageddon-anniversary-edition) and an [official promotional screenshot](https://26630753.fs1.hubspotusercontent-eu1.net/hubfs/26630753/worms-armageddon-2-1.jpg). The manual is a rules reference; the image is a visual reference. No original sprite, level, voice or music file was used.

The downward-aim bug had one direct cause: mouse and keyboard angle clamps stopped at `-0.05` radians, so the vertical part of every aim vector stayed negative. The old allowed range also crossed 90 degrees, making a left-facing AI barrel point right. The game now clamps to just under ±90 degrees relative to facing, permits downward aim with mouse, Q/E and touch, and uses the same angle convention in AI rocket, grenade and shotgun calculations. A live Chrome test moved the barrel below horizontal and fired into a slope, leaving a visible crater.

The previous worm was an oval with a hat and a small overlay. Original-inspired, independently drawn Canvas characters now have a tapered body, curled tail, separate large eyes, facial expression, team-coloured headgear, animated feet, and a distinct held model for each of the seven actions. The three themes now include map-specific rock ruins, industrial vents, or crystal outcrops; terrain uses fine grain rather than a prominent crosshatch. Grenades, rockets, dynamite and strike missiles have different silhouettes and trails. These are deliberately original illustrations, not copies of Team17 pixels. The sound pass layers a different procedural cue for each action; system output stayed muted, so this is graph/event verification, not an auditory listening test.

| Action | Team17 manual reference | Current checked behavior and remaining difference |
| --- | --- | --- |
| Bazooka | Aim up/down, charge power, wind, 50 maximum direct blast damage. | Up/down in either direction, charged ballistic shot, wind, impact blast, knockback, terrain removal, friendly fire, water/boundaries and AI tested. Crater Crew uses 58 max and its own radius/physics. |
| Grenade | Aim/charge, selectable 1–5 s fuse and high/low bounce, 50 maximum damage. | Up/down, charged ballistic throw, selectable 1–5 s fuse and high/low bounce, 66 max blast, knockback/crater, water/boundaries and AI tested. Controls are on-screen or Shift+1–5 and -/+. Bounce coefficients and damage differ from the original. |
| Shotgun | Two aimed shots, 50 maximum total damage. | Corrected from one nine-pellet volley to two independently aimed five-pellet shots, at most 25 damage each. Terrain blocks pellets and impact chips the terrain; no wind. Second shot keeps the same worm's turn; AI automatically takes it. Spread and range differ from the original. |
| Dynamite | Dropped explosive, 75 maximum damage. | Corrected from a short throw to a drop with zero initial velocity, fixed 3 s fuse, 82 max blast, retreat, crater, self/friendly damage, water and AI tested. |
| Air Strike | Five missiles on chosen area, direction selectable; unaffected by wind, 30 maximum each. | Five targetable missiles with selectable approach from left/right via on-screen button or R; wind does not bend them. Crater, splash damage, boundaries and AI tested. 40 max each; no cavern maps. |
| Fire Punch | Close attack, knocks a worm upward, cuts terrain, 30 damage. | Directional close hit, knockback and newly added terrain cut tested. 30 base damage; jump punch behavior is simplified. |
| Jet Pack | Controlled flight; original can drop weapons while flying. | Four seconds of steering/thrust, cliff escape, water risk and AI use tested. One dynamite can be dropped with X or an on-screen button during flight; flight continues. It consumes a turn and does not allow other mid-flight weapons. |

All weapons consume a turn in this game's rules, except the first shotgun shot, which leaves one shot in that turn. The player's grenade and strike settings persist across worm changes and AI turns, then reset on rematch. There is no ammo limit or crate economy. The current seven actions are a bounded original game inspired by the manual, not the complete Armageddon catalog or identical numeric balance.

After the follow-up mechanics pass, `npm test` passed **35/35**, including 27 fully simulated battles across three maps, three difficulty settings and three seeds. Regressions cover both downward directions, keyboard crossing the horizon, touch aim, edge position and worm switch, selectable grenade fuse and bounce response, wind-free left/right strike, mid-flight dynamite drop and one-drop limit, punch terrain cutting, all seven audio event graphs and the two-shot turn. Chrome displayed all three revised themes, the live downward rocket crater, two shotgun shots followed by an AI turn, grenade fuse/bounce controls, airstrike approach controls and the jetpack drop state. The console had no errors or warnings. The current Chrome tab remains at `http://192.168.1.253:4173/`.

Review screenshots: [Sunset Cove](screenshot-sunset.png), [Cinder Peaks](screenshot-cinder.png), [Moonlit Atoll](screenshot-moonlit.png), [grenade options](screenshot-grenade-options.png), [airstrike approach](screenshot-airstrike-options.png), [jetpack drop](screenshot-jetpack-drop.png). The 390×844 Chrome viewport showed the new grenade settings and touch aim buttons without clipping; physical touch hardware was not available. The viewport was reset to the user's normal desktop size after inspection.

## 2 November availability and art pass

The owner's blank page was a stopped server: Chrome showed `ERR_CONNECTION_REFUSED` for `192.168.1.253:4173`, the prior managed session no longer existed, and no listener was reported in the accessible shell. Starting the existing `server.mjs` on the same address restored the game immediately in Chrome; the page and arena rendered normally. This was a service-lifetime failure, not a new MIME or JavaScript regression. The server was then relaunched as a hidden background Node process (PID 14860); a subsequent real LAN request returned HTTP 200, `text/html`, and the Crater Crew title. The subsequent art pass added visible held tools, face and movement details, and distinct procedural sound layers for firing, explosions and worm loss. The Windows system output stayed muted. WebAudio was verified with a mocked graph; it was not heard through the muted laptop.

## Scope

Original single-player browser artillery game inspired by turn-based terrain battles. It is not an asset-level, feature-complete recreation of Worms Armageddon.

## Acceptance checklist

| Requirement | Status | Evidence / precise scope |
| --- | --- | --- |
| Separate new project | Implemented | All work is inside `crater-crew`; no Dusthaven code or assets imported. |
| Original visuals and sound | Implemented | Original Canvas character, weapon, projectile and themed scenery drawings; seven synthesized weapon cues, hit/explosion/step cues and original synthesized music; audio begins after the battle-start gesture. These are not Team17 assets or voice banks. |
| Several maps | Implemented | Three seeded procedural terrain profiles, including gaps on Moonlit Atoll. |
| Destructible terrain and water | Implemented | Pixel collision mask, circular excavation, drowning and fall deaths. |
| Team battle | Implemented | Three worms per side, per-team turn rotation, health, active worm selection, 35-second turns, rounds, victory/loss/draw and restart. Water rises after round eight to force a decisive endgame. |
| Movement and aim | Implemented | Walking, jump, pointer and keyboard aim, charged launch, gravity, wind and knockback. |
| Armory | Implemented | Seven distinct actions described below. |
| AI opponent | Implemented | Three difficulties; scored projectile search, friend-fire penalties, target choice, one bounded reposition attempt, water-risk retreat with jetpack, retreat after dynamite, weapon fallback. |
| Keyboard and touch | Implemented in code | Movement/aim keys and holdable touch controls; narrow-screen layout keeps canvas aspect ratio and pointer mapping aligned. |
| Victory/defeat playthroughs | Verified | Twenty-seven complete simulated battles: three seeds on every map at every difficulty; direct win/loss tests. A manual Chrome match against Rookie AI ended in a visible VICTORY! at round eight. |
| Manual browser play and screenshots | Verified on desktop and mobile viewport | Chrome opened the LAN URL as a page after the MIME fix, without a download. The live match showed airstrikes, rocket and grenade attacks, a jetpack move, terrain destruction, damage, drowning, rotating active worms, HUD updates, and the victory screen. Rematch reset the terrain, health, round and teams. All three maps were visually inspected; the 390×844 viewport showed touch controls and scrollable weapon choices. Console errors and warnings: none. Physical touch hardware was not available for manual testing. |

## Weapon behavior

| Action | Behavior |
| --- | --- |
| Bazooka | Charged ballistic rocket, explodes on terrain/worm impact, 77 px blast radius, max 58 damage. |
| Grenade | Charged ballistic throw, bounces off terrain and walls, 1–5 second selectable fuse, high/low bounce, 84 px radius, max 66 damage. |
| Shotgun | Two aimed shots of five direct pellets each, terrain occlusion and small impact chips, up to 25 damage per shot. |
| Dynamite | Dropped charge with zero launch speed, three-second fuse, 102 px radius, max 82 damage; the acting worm can retreat until detonation. |
| Airstrike | Five spaced wind-proof missiles approaching from a selectable left/right side over a selected x coordinate, 56 px radius each, max 40 damage each. |
| Punch | Close-range directional hit, 30 base damage, knockback and a small terrain cut. |
| Jetpack | Four seconds of thrust-assisted movement and steering; one mid-flight dynamite drop; consumes a turn. |

All blasts can hit the shooter and allies. Terrain and fall risk affect the outcome.

## AI behavior and limits

The AI chooses punch when adjacent, dynamite when it has a retreat path, shotgun when a close target is visible, a scored grenade or bazooka trajectory at range, or airstrike if no good arc is found. It estimates friendly blast damage, searches limited movement positions for better rocket shots, and uses a jetpack to leave shallow terrain near water. Movement planning has a one-attempt limit and a time limit. Difficulty changes trajectory search resolution, aim error, ally protection and weapon tactics, as detailed in the update below.

The AI does not plan several turns ahead. Grenade bounce prediction is approximate. There is no multiplayer, campaign, rope, ammo economy, or full original weapon catalog. [Team17's official description](https://www.team17.com/games/worms-armageddon-anniversary-edition) lists over 55 weapons and over 30 sound banks for Armageddon; Crater Crew has seven weapons and synthesized nonverbal effects. No original art, voices, music or maps were supplied or included. Exact visual or audio identity requires rights-cleared source assets and permission to use them.

## Verification

Run `npm test` in this folder. Thirty-eight tests cover maps, terrain excavation, blast falloff, AI trajectory search, downward pointer/keyboard/touch aiming, focus-loss cancellation, seeded restart state, render-independent simulation RNG, HUD state, per-team worm rotation, weapon persistence, grenade fuse and low/high bounce, both airstrike approaches without wind drift, jetpack dynamite drop and one-drop limit, mocked WebAudio graphs for all seven actions, launch mechanics, two shotgun shots and punch terrain cutting, seven action resolutions, win and loss states, all AI weapon choices, bounded walking repositioning, self-damage, drowning after footing destruction, sudden-death water, 27 full simulated matches, and server MIME/routing for `/` and assets. The match tests use three fixed seeds for each map/difficulty combination and a frame cap. `node --check server.mjs`, `node --check game.js`, `node --check art.js` and `node --check engine.js` pass.

The old prototype on `192.168.1.253:4173` was stopped after verifying its process and title. At that time Crater Crew bound that same LAN address (superseded on 3 November: the server binds to loopback by default; see below). The root-route bug that caused Chrome to download the game was confirmed: `/` returned the HTML bytes as `application/octet-stream` because MIME was chosen from the extensionless request path. The server now chooses MIME from the resolved `index.html` path. Real HTTP requests to `/`, `/index.html`, `/game.js`, `/engine.js` and `/style.css` returned 200 with the correct MIME types; `/` returned `text/html`, no `Content-Disposition`, and HTML bytes beginning `<!doctype h`. Chrome then opened `http://192.168.1.253:4173/` normally and displayed the title `Crater Crew - Skyfall Skirmish` and working canvas. A live eight-round match ended in victory, followed by a successful rematch and visual checks of all three maps. The old Dusthaven folder, including `data/world.json`, was sent to Windows Recycle Bin; its exact original path was found in a Recycle Bin metadata record, and the matching recycled folder contains the save and `package.json` named `dusthaven`.

## Visual and live-hit follow-up (2026-11-02)

After independent review, fighters were scaled to 82% of their prior painted size while their collision body stayed fixed for aiming. The terrain outline now has fine deterministic chips, mineral flecks and a highlighted edge along newly excavated surfaces. Sunset Cove gained sail and driftwood shapes, Cinder Peaks gained cranes, and Moonlit Atoll gained dish structures. Desktop HUD panels, buttons and frame were made more compact; the existing mobile breakpoint remains separate. Open-sky maps remain intentional. These are original canvas drawings informed by public Team17 reference material, not original Armageddon sprites, scenery or recordings.

Central team positions were interleaved at x=730 and x=780 so the existing close weapons can be used without several empty walking turns. In Chrome, cycling twice to Mochi and clicking Punch yielded `WHAM!`, reduced Grub from 100 to 66 HP in the earlier build; the base hit now reduces 100 to 70 HP, knocked him upward/right and cut the ground under the impact. In a separate browser match, two aimed shotgun clicks at the nearby Grub yielded **25 damage on each shot**, visible knockback, an HP bar at about half, and a completed turn. The first-shot message now retains its damage amount while prompting for the second shot; pellets that strike ground make small destructible chips. No hidden state was set for these live checks.

Low and high grenade modes were both selected in the actual UI and thrown into the nearby ridge with a five-second fuse; moving projectiles and rebounds were seen. Their quantitative height comparison is covered by the deterministic integration test (`0.55` high versus `0.32` low vertical rebound factor), because the two live trials had different wind and timing. This is a limit of the visual comparison, not a claim of exact Armageddon bounce physics.

New visual evidence: `screenshot-polished-sunset.png`, `screenshot-polished-cinder.png`, `screenshot-punch-hit.png`, `screenshot-shotgun-first-hit.png`, `screenshot-shotgun-second-hit.png`, `screenshot-grenade-low-bounce.png`, and `screenshot-grenade-high-bounce.png`. Chrome reported no console warnings or errors. The system and in-game sound remained off; synthesized sound event graphs are testable in code, but these effects were not audibly evaluated.

## Final mechanics and browser acceptance

The punch's direct hit was 34 HP loss in the prior build, entirely from the direct-hit subtraction; landing applies no extra fall damage. The direct hit now uses `data.punch.damage = 30`, matching the base damage stated in the Team17 manual. The integration check on all three maps expects 100 to 70 HP, upward/right knockback and terrain removal.

After this change, `npm test` passed **35/35**, including the 27 full simulated battles. A fresh, ordinary Chrome match on the new interleaved spawn layout was played against Rookie AI through **round 11** and ended at the visible `DEFEAT` screen after the last player worm was eliminated. The player used a punch and several aimed airstrikes; enemy turns, knockback, craters, loss of team members and sudden-death water all occurred. `REMATCH` then produced a new round 1 with three worms per team, a reset power meter, fresh wind and restored terrain. This was a new browser playthrough after the final spawn and damage changes. Screenshots: `screenshot-final-defeat-round11.png` and `screenshot-final-rematch.png`. Chrome logged no warnings or errors. The rematch reset was verified, then the game tab was left on its map-selection screen at `http://192.168.1.253:4173/`.

The appearance remains a partial, original-art homage rather than visual identity with Worms Armageddon. Sounds remain synthesized and were not listened to because system mute was preserved.




## AI and audio update (2026-11-02)

The enemy is a local algorithmic bot, **not an LLM**. `game.js:aiAct` applies tactical rules, while `engine.js:selectShot` and `selectLob` sample trajectories and subtract predicted friendly blast damage. The former trajectory sampler launched from the worm's center whereas `fire()` launched from the weapon muzzle; this was corrected. No external model, account or API is called. All levels use the same health, damage, physics and turn rules.

| Level | Search / accuracy | Tactics |
| --- | --- | --- |
| Easy | 9° angle grid, 0.15 power steps, 0.18 rad aim jitter | Simple bazooka and airstrike preference, close punch/shotgun, no planned reposition or dynamite. |
| Normal | 5° grid, 0.10 power steps, 0.045 rad jitter | Grenades, shotgun at greater range, safe walking and dynamite retreat. |
| Hard | 3° grid, 0.07 power steps, 0.008 rad jitter | More careful ally protection, kill bonus in trajectory scoring, more accurate airstrike, wider shotgun range, safe reposition. |

The setup menu and in-match enemy HUD show the level. REMATCH and NEW MAP preserve it; starting a new selection chooses the displayed level. A deterministic flat duel at 15 identical target/seed setups per level, with the same player/enemy stats and actions, produced total player damage **348 / 582 / 727** for Easy / Normal / Hard. Easy used 15 bazooka shots; Normal and Hard each used 12 grenades and three shotguns in those setups. This is a controlled accuracy comparison, not a guarantee that Hard wins every match. In 27 full autoplay games with identical initial seeds across levels and an airstrike-only player policy, the AI won 1/9, 2/9 and 1/9 respectively; total player damage was 2111, 2139 and 2171. The small sample and water/match variance make win count nonmonotonic. The Hard bot still has one-turn planning and approximate grenade bounce prediction.

Background music is a new original 64-step WebAudio melody with bass and percussion-like synthesized notes. It schedules from the game frame clock, resumes only after a user gesture, stops scheduling at the result screen, and resets its sequence on a new match without creating an extra loop. Music and effects have independent switches and sliders. Seven weapon sounds remain distinct; blast, impact, grenade bounce, dynamite fuse, flight, steps and worm reaction have additional cues. These are original synthesis, not Team17 recordings, voices or soundbanks. The Windows system mute was preserved; audio events, graph connections and lifecycle were tested, but **actual audible quality was not verified by listening**.

Final automated check: `npm test` **38/38** passing, including all seven weapons, same-seed difficulty comparison, audio gesture/settings/lifecycle and 27 full simulated matches. Chrome at `http://192.168.1.253:4173/` loaded the updated UI with no console errors. Easy, Normal and Hard selections appeared in the in-match HUD. A live Hard match was played to the visible `DEFEAT` screen in round 10; `REMATCH` restored round 1 and 3v3 while keeping Hard. The system mute was not changed. Screenshots: `qa-hard-defeat.png` and `qa-hard-rematch.png`.

## Broker LLM preparation

The optional Broker LLM driver requests an external model decision on each AI action. The local trajectory code only supplies legal candidate moves and checks the returned choice. The existing local algorithm is named explicitly in the setup menu and is never used as a hidden fallback from Broker mode. The serverless API keeps the project key server-side, requires both an authorized key and `BROKER_GAME_ENABLED=true`, signs polling tickets, validates input size and candidate IDs, and returns a visible unavailable state when unconfigured. No real Broker job was submitted in this preparation. Mocked create/poll/error tests and the offline regression suite pass. See `DEPLOY.md` for the remaining access and cost prerequisites. Historical screenshot filenames in this report refer to local QA artifacts omitted from the source repository; they are not game assets.

## 3 November integration note

This file is the historical Codex acceptance log of 2 November; its test counts (35/35, 38/38) and LAN addresses describe that time. The referenced screenshots stay in the Codex task folder and are not part of the repository. The manual link points to a third-party archive mirror, not to Team17. After integrating the visual redraw in a Worms Armageddon-inspired style (original Canvas/SVG art only) on top of this patch, `npm test` passes 65/65, and `server.mjs` binds to `127.0.0.1` unless `HOST` is set for an approved LAN deployment.
