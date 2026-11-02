# Crater Crew — Skyfall Skirmish

An original turn-based browser artillery game with two teams of three, three maps, destructible terrain, seven weapons, original Canvas art and synthesized music/effects. The opponent offers Easy, Normal and Hard settings.

## Play locally

From this directory, run `npm start` and open the address printed by the server. Use mouse or touch to aim, A/D to move, W to jump, Space or FIRE to fire, and keys 1–7 to select weapons. The server defaults to loopback; set `HOST` explicitly only for an approved local network deployment.

The **Local algorithm** driver works offline. **Broker LLM** asks a model to choose each AI action and shows a visible error if Broker is unavailable. It never silently switches to the local bot. See [DEPLOY.md](DEPLOY.md) for the backend contract, Vercel setup and credential requirements.

Run `npm test` for physics, weapons, AI, audio, Broker mock and server tests. No original Worms Armageddon assets or recordings are included. No runtime package dependencies are required. Browser and server audio controls do not change the operating system's mute setting.
