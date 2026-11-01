# Poker Racer - project conventions

## Language rules
- **Talk to the user in Turkish at all times.**
- **Everything inside the project is English**: code, comments, identifiers, file names, UI text, docs, commit messages.

## What this is
Browser 3D first-person arcade racer (right-hand drive, Half Grip inspired). You steer with A/D (or on-screen buttons on
touch devices) and drive a 3D steering wheel; a DOM card table on the center console lets you play poker hands for
rewards with the mouse / finger while driving. Installable as a PWA. Full spec and decisions: `docs/GAME_DESIGN.md` (keep it updated when behavior changes).

## Stack
- Vite + TypeScript (strict) + Three.js. No external assets: procedural geometry, canvas textures, WebAudio synthesis.
- No physics engine; custom deterministic arcade car model (fixed 120 Hz step).
- Commands: `npm run dev` (http://localhost:5173), `npm run build` (tsc --noEmit + vite build), `npm run typecheck`.
- In dev builds `window.__game` exposes the Game (and `__game.currentRace`) for debugging / browser automation.

## Folder structure (src/)
- `config/` - ALL tunables (never hard-code numbers elsewhere):
  `carStats.ts` (CarStats + PHYSICS), `gameConfig.ts` (race/AI/camera/wheel/payouts/effects/mirror),
  `cardConfig.ts` (DECK_SIZE, hand size, boxes), `rewards.ts` (hand reward table), `trackConfig.ts`, `cabinConfig.ts`.
- `core/` - math, seeded RNG, event emitter, SaveData (localStorage), keyboard, device detection (touch / standalone), WebAudio engine.
- `track/Track.ts` - centerline data (samples, curvature, locate/pointAt) + seeded generator.
- `car/` - `Car.ts` (physics step), `collisions.ts` (walls, car-car), `AIDriver.ts`, `SteerInput.ts` (keyboard/touch steering wheel).
- `cards/` - `CardSystem` (pure logic), `Deck`, `PokerEval`, `crashPenalty.ts` (single function), `applyReward.ts`
  (`RewardTarget` interface; rewards are data in `config/rewards.ts`).
- `scene/` - `World` (sky, fog, lights, track, scenery), `TrackMesh`, `Scenery`, `Cabin`, `CameraRig`, `CarMesh`,
  `Sky`, `textures` (canvas textures), `dispose`.
- `net/` - online mode (PeerJS/WebRTC): `NetSession` (room, lobby, relay, ready/go handshake), `RemoteCar`
  (snapshot interpolation), `protocol.ts` (wire types). Tunables in `config/netConfig.ts`.
- `fx/` - `Particles`, `OilSlicks`, `CardBoxes`.
- `ui/` - DOM UI: `HUD`, `screens` (menu/pause/finish), `CardTableUI` (tap select, double-tap discard, animations),
  `TouchControls` (on-screen drive buttons), `OnlineScreen` (create/join/lobby/AI question), `dom` helpers.
  Styles in `src/style.css`.
- `pwa/` - `pwa.ts` (service worker registration + install prompt). Manifest/icons in `public/`, SW template in
  `scripts/sw.template.js` (built into `sw.js` by the plugin in `vite.config.ts`).
- `game/` - `Game` (menu <-> race state machine, renderer, main loop), `Race` (one race session, owns the fixed-step
  simulation and wires everything), `Showcase` (menu background).

## Conventions
- Frame convention: car heading `h` means forward = (-sin h, -cos h), right = (cos h, -sin h); +heading = left turn;
  +steer = right; +lateral offset on the track = right of the centerline. Cabin local space: +X right, +Y up, -Z forward.
- Keep systems decoupled: game logic in plain classes (no DOM) where possible; UI subscribes to events.
- Rewards are data (`HAND_REWARDS`) applied through `RewardTarget`; crash penalty lives only in `applyCrashPenalty`.
- Car stats go through `CarStats` objects (future garage/upgrades). Don't read stats constants directly in physics.
- Dispose everything a race creates (`Race.dispose()`); canvases/DOM must not leak between races.
- Wrap localStorage access in try/catch (SaveData does).
- Cap pixel ratio at 2, keep draw calls low (instancing for scenery), avoid per-frame allocations in hot loops.

## Verifying changes
- Always run `npm run build` (type check + bundle) after changes.
- Browser checks: run the dev server and drive it with puppeteer-core + system Chrome (WebGL works headless with
  `--use-angle=swiftshader --enable-unsafe-swiftshader`). Physics/AI/poker logic can be simulated headless with `tsx`
  because `Car.ts`, `Track.ts`, `PokerEval.ts` have no DOM dependency.

## Not built yet (planned)
Garage, car upgrades, shop, roguelike layers, AI card use, music, gamepad support, host migration / reconnect online.
