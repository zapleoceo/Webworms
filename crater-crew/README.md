# Crater Crew

An original browser artillery game. 

## Play locally

Run `npm start` in this folder and open the printed address. The server listens on loopback by default; set `HOST` explicitly only for an approved LAN deployment.

The game uses original Canvas art and procedural WebAudio music and effects. Game audio starts only after you press LET'S BATTLE. The music-note button opens separate music and effects switches and volume sliders; the computer's system mute setting is untouched. The game does not contain the copyrighted sprites, voices, music or maps from Worms Armageddon.

## Controls

- A/D or Left/Right: walk; W or Up: jump
- Mouse: aim; Q/E: aim by keyboard; hold Space or FIRE to charge, release to shoot
- 1–7: weapon; Tab: cycle worms (before moving); Enter: end turn
- Jetpack: select it and press FIRE, then steer with movement/jump until fuel runs out
- Dynamite: move away during the three-second fuse
- Shotgun: aim and fire twice during the same turn; the second shot can use a new angle
- Grenade: select a 1–5 second fuse and high or low bounce in the options below the armory; Shift+1…5 and -/+ also work
- Airstrike: choose the incoming side in the options below the armory, or press R
- Jetpack: press X or the on-screen DROP DYNAMITE button once while flying; flight continues
- On touch screens use the on-screen controls and tap the field to aim. For Airstrike, tap the target point.

Choose **Local algorithm** to play offline, or **Broker LLM** to ask a model to choose every AI action. Broker mode requires a separately authorized server-side project key and shows an explicit error when unavailable. See [DEPLOY.md](DEPLOY.md) for the serverless contract, safety requirements and Vercel setup. See [REVIEW.md](REVIEW.md) for the acceptance checklist and test evidence. QA PNG screenshots stay in the local workspace and are not runtime assets.

## Acceptance checklist

- [x] Three procedural maps, terrain craters, water and fall deaths
- [x] Three worms per team, rotating active units, health, turn clock, win/loss, restart and new map
- [x] Rising water after round eight prevents endless stalemates
- [x] Walk, jump, aim, charge, gravity and wind
- [x] Bazooka, timed bouncing grenade, shotgun, dynamite, airstrike, punch and jetpack
- [x] Easy, Normal and Hard algorithmic AI with distinct aiming, tactics, friendly-fire caution and seven weapon choices
- [x] Effects, original canvas art, synthesized music and weapon sounds, separate audio controls, responsive controls
- [x] Automated complete matches and restarts on all three maps at all three difficulty levels across three seeds
- [x] Manual Chrome playthrough to victory on round eight, rematch, three map views and live jetpack movement; the later art/aim pass also checked a downward rocket crater and the two shotgun shots. No browser console errors or warnings.

No third-party art, audio, fonts, scripts or runtime dependencies.
