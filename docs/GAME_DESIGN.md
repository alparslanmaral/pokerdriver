# Poker Racer - Game Design

A browser-based 3D first-person arcade racing prototype inspired by Half Grip. You steer a right-hand-drive car
with the keyboard (or on-screen buttons on touch devices). On the center console (where the radio would be) sits a small card
table with a hand of poker cards. You play poker hands for rewards (money, nitro, ...) while driving, so you have to
glance down at the cards without leaving the road. That tension is the core of the game.

## 1. Scope of this version

In: main menu (singleplayer / online), starting a race, the core gameplay loop, finish screen, online rooms for up to 6.
Out (not yet): garage, car upgrades, shop, roguelike layers. Systems are kept decoupled and data-driven so these can
be added later (car stats in a `CarStats` object, rewards in a config table, AI card use possible later).

### Online mode

- Menu has **Singleplayer** and **Online** and a pilot-name field (saved in localStorage, max 14 chars).
- Rooms: the host's PeerJS id is `pokerracer-<CODE>` (5 chars, unambiguous alphabet), so the code *is* the address.
  Joining via `?room=CODE` (the "Copy invite link" button) opens the join screen with the code prefilled.
  Star topology: clients connect to the host only, the host relays messages. Max 6 humans; late joiners are rejected
  while a race is running.
- Start: only the host can start. With fewer than 6 players the lobby asks "Fill the N empty slots with AI?" (Yes = AI
  drivers take the free grid slots, No = humans only, which needs at least 2 players). The roster/grid order is shuffled
  by the host and sent with a shared track seed. Every client builds the race, reports `ready`, and the host sends `go`
  (or after a timeout) so the 3-2-1 countdown starts together.
- Simulation: **client-authoritative per car**. Each player simulates their own car at 120 Hz and broadcasts a snapshot
  (position, heading, velocities, race progress, finish time, flags) 20 times/s. Remote cars are drawn 110 ms in the past
  with snapshot interpolation (`net/RemoteCar.ts`), extrapolating briefly when packets are late. The **host simulates the
  AI cars** and streams them like any other car. Rubber banding uses the average human progress.
- Collisions: each client resolves contacts between its own car and others locally (remote cars are not pushed
  authoritatively); crash penalties apply to the local player only.
- Cards stay private: every player has their own shuffled deck, card boxes sit at the same places for everyone (seeded)
  but are collected individually. Effects on others are messages: the **Straight oil** drops patches everybody else
  slips on (your own oil never hurts you), **slow rivals** slows every other human and the AI.
- The race never pauses online: Esc opens a "MENU" overlay (resume / leave room) while the car keeps driving.
  Finishing shows the standings, which keep updating as the others finish; "Back to lobby" returns to the room,
  "Leave room" closes the connection. A player who disconnects is removed from the race; if the host leaves, the room closes
  and everybody returns to the main menu with a notice.
- Known limits: no host migration, no reconnect, no anti-cheat (the clients are trusted), WebRTC may fail behind strict
  NATs (PeerJS' default config includes STUN and a free TURN relay).

## 2. Tech stack

- Vite + TypeScript + Three.js. No external assets: all 3D is procedural geometry (boxes, cylinders, extruded
  strips, canvas-generated textures). Sounds are synthesized with WebAudio.
- No physics engine: a custom, deterministic, tunable arcade car model.
- Cards are a DOM/CSS overlay glued to the 3D console (crisp text, easy tap handling); the steering wheel is a 3D mesh.
- Target 60 fps on a normal laptop: pixel ratio capped at 2, fog, gradient sky, one shadow-casting sun with a
  player-following shadow frustum, instanced low-poly scenery, a low-res (30 Hz) rear-view mirror pass.

## 3. Screens / flow

1. **Main menu** - title, "Start Race", current money (persisted in localStorage), short controls help. The
   background is a camera gliding along a random circuit.
2. **Race** - 3-2-1-GO countdown, 3 laps on a procedurally generated closed circuit, grid of 1 player + 5 AI rivals.
   HUD: speed, lap, position, money, nitro bar, active effect chips, minimap. `Esc` = pause (resume / quit to menu).
3. **Finish screen** - final position, payout by position (1st +500, 2nd +350, 3rd +250, others +100) added to the
   persisted money, standings, buttons "Race again" / "Main menu".

## 4. Cabin and camera

- RIGHT-hand drive: driver on the right, wheel on the right side of the cabin. The card table is in the center console,
  to the left of the wheel.
- Camera at the driver's eye. Head sway with acceleration/braking/cornering, FOV grows with speed and nitro, camera shake
  on crashes.
- Procedural cabin: dashboard, windshield frame, A-pillars, real rear-view mirror (low-res rear render), side mirrors,
  steering wheel, instrument cluster (canvas), console with the card table, visible hood.

## 5. Controls

| Input | Action |
| --- | --- |
| `W` | throttle |
| `S` | brake; reverse when stopped |
| `Space` | handbrake (rear grip drops -> drifts) |
| `A` / `D` (or arrow keys) | steer left / right |
| Touch: left / right buttons, GAS, BRAKE | same as the keys (landscape only); small pause and reset buttons in the middle |
| `R` | reset car onto the track (3 s cooldown) |
| `Esc` | pause |
| `M` | mute |

Steering wheel (`car/SteerInput.ts`): while a steer key / touch button is held, the 3D wheel turns towards full lock
(+/-270 degrees) at `WHEEL.turnRateDeg`, faster when counter-steering. Letting go (or pausing / losing focus) hands
control to a damped spring that returns the wheel to center, so the car straightens.
Steering input = wheelAngle / maxWheelAngle (with a response curve), then speed-sensitive steering in the car model.
The mouse is only used for the cards, so looking down at the table is a risk because you are still steering by key.

Touch layout (`ui/TouchControls.ts`): active on coarse-pointer devices (`?touch=1` forces it on desktop). Steer buttons
bottom-left, BRAKE + GAS bottom-right, pause / reset bottom-center. Entering a race requests fullscreen + landscape lock
(best effort). In portrait a full-screen "rotate your device" overlay is shown and the race is paused.

PWA: `public/manifest.webmanifest` + `sw.js` (generated at build time by `vite.config.ts` from
`scripts/sw.template.js`, precaches the bundle). `src/pwa/pwa.ts` registers the worker in production builds and powers
the menu's "Install app" button (`beforeinstallprompt`; on iOS it shows Add-to-Home-Screen instructions; hidden when
already installed).

## 6. Car physics (arcade, Half Grip-ish)

Bicycle-style model (`src/car/Car.ts`): tapered acceleration curve, braking, reverse, drag + rolling resistance,
lateral tire forces from slip angles with a saturating (Pacejka-lite) curve, handbrake cutting rear grip to allow
drifts, off-track surface (less grip, lower top speed, extra drag). Fixed 120 Hz step, deterministic.

- **Nitro**: acceleration and top speed multiplier while a timer is running; stacks by adding time (capped).
- **Walls**: barriers on both sides, collision against the track centerline offset; bounce, speed loss, nose realigns.
- **Car-to-car**: two circles per car, positional push + restitution impulse + a small yaw kick.
- **Hard crash**: closing speed above `PHYSICS.hardCrashSpeed` (walls or cars) triggers the card-loss mechanic.
- All tuning values live in `src/config/carStats.ts` (`CarStats` + `PHYSICS`) and `src/config/gameConfig.ts`.

## 7. Track

Procedural closed loop from a seeded smooth spline (Catmull-Rom, centripetal) built from a polar shape with random
harmonics; the generator retries calmer shapes until the minimum curvature radius and the minimum separation between
distant parts are valid. Road mesh with canvas texture (edge lines + dashed lane lines), kerbs, gravel shoulders,
barriers on both sides, start/finish line + gantry, low-poly roadside scenery (pines, round trees, buildings, far
mountains). `Track` exposes centerline samples (position, tangent, curvature, arc length) for AI, lap counting,
ranking (progress along the spline), wall collision and box placement.

## 8. AI rivals

5 rivals follow the spline with individual lane offsets (pure pursuit), plan corner speeds from the curvature ahead
(including braking distance), and avoid slower cars just ahead. Mild rubber banding (+/-7% speed by distance to the
player). Each has a name and color. They do NOT use cards; the AI driver only produces a `CarInput`, and rewards go
through the `RewardTarget` interface, so a card-using brain can be added later. Stuck rivals are re-placed on track.

## 9. Card system

- **Deck**: standard 52-card deck (4 suits x 13 ranks, one of each), shuffled at race start (`DECK_SIZE = 52` in
  `src/config/cardConfig.ts`). Hand starts with 7 cards, max hand size 7. Deck size, hand size and starting values are
  config constants (later upgradeable with money).
- **Card boxes**: floating rotating cubes with card symbols placed in clusters across the road width (Mario Kart item
  boxes). Driving through one draws up to 2 cards (only as many as fit; with a full hand it does nothing and the box
  stays). The box disappears and respawns after ~6 s. Pickup particle burst + a card fly-in animation from the box's
  screen position to the table.
- **Selecting**: click a card to toggle select (selected card lifts), max 5. The detected hand name and reward are shown
  above the table while selecting.
- **Playing**: PLAY button. The best poker hand among the selected cards is evaluated (ace high or low in straights),
  the reward is applied, and ALL played cards are consumed.
- **Discarding**: double-click (double-tap) a card. It flies out of the window with a spin/shrink animation and is
  gone for this race. A single click / tap toggles selection (two taps on the same card within 320 ms = double).
- Discarded, played and knocked-off cards never come back during that race.
- **Crash penalty**: on every hard crash, one random card is knocked off the table (flies/falls off with an effect). If the
  hand is empty, one card is removed from the draw pile with a HUD flash. This is a single function:
  `applyCrashPenalty` in `src/cards/crashPenalty.ts`.

### Hand evaluation with fewer than 5 cards

Straights and flushes need all 5 cards. With fewer cards you can still make High Card, Pair, Two Pair (4 cards),
Three of a Kind and Four of a Kind. A single selected card is a High Card.

### Rewards (data-driven table in `src/config/rewards.ts`)

| Hand | Reward |
| --- | --- |
| High Card (1 card) | +40$ |
| Pair | +150$ |
| Two Pair | +300$ |
| Three of a Kind | 3 s nitro |
| Straight | oil slicks dropped behind you for 8 s; rivals that hit them lose speed |
| Flush | 6 s nitro |
| Full House | 4 s nitro + 200$ |
| Four of a Kind | shield for 12 s (crashes do not drop cards or cost speed) |
| Straight Flush | 10 s nitro + all rivals slowed by 20% for 6 s |

Money is persisted in localStorage through the `SaveData` module. It is only displayed for now.

## 10. Decisions made where the spec was ambiguous

- Card money is saved immediately when a hand is played (quitting mid-race keeps it); the finish payout is added when the
  finish screen opens. The HUD money shows the persisted total.
- Player starts on the grid in slot 4 of 6 (`GAME.playerGridSlot`).
- The race keeps simulating after the player crosses the line (the car is auto-driven at reduced speed); the finish
  screen opens 2.2 s after finishing with the ranking at that moment.
- Cards cannot be used during the countdown, while paused, or after finishing.
- Oil slicks stop affecting the player; they only slow rivals (rivals lose 45% speed and grip for 1.4 s, 2 s cooldown
  per rival per slick contact).
- Shield: no card drop and no speed loss on wall hits (the car still bounces off); car-to-car hits push the other car.
- Hard-crash threshold: 10.5 m/s closing speed; 0.8 s cooldown between card penalties.
- Nitro timer is capped at 20 s; shield at 30 s.
- Throwing a card out of the window (double-click) also works while driving.
- A manual reset key (`R`) and a "stuck" hint were added as quality-of-life features.
- Wheel response uses an exponent (1.25) for finer control near center. The wheel spring damping ratio is 0.8.
- The rear-view mirror is a real low-res render (30 Hz); disable with `MIRROR.enabled = false` if performance suffers.
- Track lap length is ~2.0-2.6 km (`TRACK.baseRadius`), so a 3-lap race takes roughly 2.5-3.5 minutes.

## 11. Architecture (for future layers)

- `config/` - every tunable: `carStats.ts` (car + physics), `gameConfig.ts` (race, AI, camera, wheel, payouts, effects),
  `cardConfig.ts`, `rewards.ts`, `trackConfig.ts`, `cabinConfig.ts`.
- `RewardTarget` (`cards/applyReward.ts`) is the only way rewards touch the race; implement it for a rival to give AI
  cards later.
- `CarStats` is passed to the physics per car: a garage/upgrade layer only needs to build a different stats object.
- `CardSystem` is pure logic (no DOM); `CardTableUI` is a view subscribed to its events.
- Deck size / hand size / box draw count / respawn are config constants for money-based upgrades.
