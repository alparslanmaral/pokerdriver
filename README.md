# Poker Racer

A browser-based 3D first-person arcade racer. Grab the steering wheel with the mouse, and play poker hands on the
center console card table while you drive. One mouse, two jobs.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type check + production build into dist/
```

## Controls

- `W` throttle, `S` brake / reverse, `Space` handbrake, `R` reset car, `Esc` pause, `M` mute.
- Hold the left mouse button on the steering wheel and move around its center to steer. Release to let go.
- Cards: click to select (max 5) and press PLAY; drag a card above the dashboard line to throw it out of the window.
- Drive through floating card boxes to draw cards. Hard crashes knock a card off your table.

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for the full design and [CLAUDE.md](CLAUDE.md) for project conventions.
