# Responsive regression checks

Run `npm start` from `crater-crew`, then open `http://127.0.0.1:4173/tests/responsive.html` (or your configured PORT).

The page loads the actual index markup and stylesheet in sandboxed, script-free fixtures at 320x568, 390x844, 568x320, 844x390 and 1280x760. It checks horizontal overflow, all six small-screen controls, SWAP scroll reachability, status/power overlap, desktop height, and manual bounds/end/close accessibility. The nine generated armory buttons match the game's DOM structure; no game script, settings request or model call runs. Subpixel scroll rounding permits at most half a CSS pixel.

Expected: **37 passed; 0 failed**. The previous production stylesheet (109b1de) fails nine checks. This is browser layout testing, not physical touchscreen or multi-touch acceptance. Also smoke-test the real game, because fixture checks do not exercise pointer handlers or physics.
