# Drop-Chess

Real-time 6x8 chess clash played at Clash Royale speed—no turns, 2.5s per-piece stamina rings, 20 HP Kings with Last-Stand adrenaline, spells (`Freeze`, `Swap`, `Promote`), real-time Castling, 3s-telegraphed Center-Line `+2 Elixir` runes, Overtime `2x` Elixir + Center-Line Auto-Queens, 5 AI bots, daily & tactical puzzles, custom 8-card decks, replay scrubber, mobile-first Clash touch ergonomics, and online 1v1 multiplayer.

## One-Click Deploy on Coolify

1. In Coolify, create a **New Resource → Public / Private Git Repository** pointing to `https://github.com/ParcivalLTD/blitzgrid`.
2. Select **Build Pack: Dockerfile** (auto-detected from the root `Dockerfile`).
3. Set **Ports Exposes** to `8765` (matches `EXPOSE 8765` and built-in `/health` Docker healthcheck).
4. Attach your domain and click **Deploy** — Coolify/Traefik handles HTTPS and `wss://` WebSocket upgrades automatically for 1v1 multiplayer.

## Run Locally

Requires only Python 3 (zero external packages):

```bash
python server.py
```

Open `http://127.0.0.1:8765` (or set `BLITZ_HOST=0.0.0.0` to play on your phone over Wi-Fi).
