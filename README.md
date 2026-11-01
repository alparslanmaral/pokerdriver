# Poker Racer

A browser-based 3D first-person arcade racer. Steer with the keyboard (or on-screen buttons on a phone) and play poker hands on the
center console card table with the mouse / your finger while you drive.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type check + production build into dist/
```

## Controls

- `W` throttle, `S` brake / reverse, `A` / `D` steer (arrow keys work too), `Space` handbrake, `R` reset car,
  `Esc` pause, `M` mute.
- Cards (mouse): click to select (max 5) and press PLAY; double-click a card to throw it out of the window.
- Phone / tablet (landscape): hold the left/right buttons to steer, GAS and BRAKE on the right, tap cards, double-tap
  to throw one out. Portrait shows a "rotate your device" screen.
- Drive through floating card boxes to draw cards. Hard crashes knock a card off your table.

## Install as an app (PWA)

The production build ships a web manifest and a service worker, so the game works offline once loaded and can be
installed: use the **Install app** button in the main menu (Chrome / Edge / Android), or on iOS Safari
**Share -> Add to Home Screen**. The installed app starts fullscreen in landscape.

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for the full design and [CLAUDE.md](CLAUDE.md) for project conventions.
