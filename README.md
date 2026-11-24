# Drop-Chess

Real-time 6x8 chess clash played at Clash Royale speed—no turns, 2.5s per-piece stamina rings, 20 HP Kings with Last-Stand adrenaline, 10 collectible cards (`Pawn`, `Pawns x2`, `Knight`, `Bishop`, `Rook`, `Haste`, `Wall`, `Freeze`, `Swap`, `Promote`), real-time Castling, 3s-telegraphed Center-Line `+2 Elixir` runes, Overtime `2x` Elixir + Center-Line Auto-Queens, 5 AI bots, daily & tactical puzzles, custom 8-card decks, replay scrubber, SQLite daily/ELO leaderboard, installable PWA, mobile-first Clash touch ergonomics, public `Find Match` queue, private room codes, and live Spectator Mode (`?watch=CODE`).

## One-Click Deploy on Coolify

1. In Coolify, create a **New Resource -> Public / Private Git Repository** pointing to `https://github.com/ParcivalLTD/blitzgrid`.
2. Select **Build Pack: Dockerfile** (auto-detected from the root `Dockerfile`).
3. Set **Ports Exposes** to `8765` (matches `EXPOSE 8765` and built-in `/health` Docker healthcheck).
4. Optional: mount persistent storage at `/data` so the built-in SQLite leaderboard (`dropchess.db`) persists across redeploys.
5. Attach your domain and click **Deploy** — Coolify/Traefik handles HTTPS and `wss://` WebSocket upgrades automatically for 1v1 matchmaking & spectating.

## Run Locally

Requires only Python 3 (zero external packages):

```bash
python server.py
```

Open `http://127.0.0.1:8765` (or set `BLITZ_HOST=0.0.0.0` to play on your phone over Wi-Fi, or install to your home screen as a fullscreen PWA).
