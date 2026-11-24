"""
Unified zero-dependency Python 3 HTTP + RFC 6455 WebSocket + SQLite server for Drop-Chess.
Features:
  - Static PWA file serving + GET/HEAD /health
  - Public 1v1 matchmaking queue (Find Match) + Private room codes + Live Spectators (?watch=CODE)
  - 20s WebSocket keepalive heartbeats + 15s mid-match reconnect grace + per-IP rate limiting
  - Built-in SQLite leaderboard (Daily Challenge fastest clears + global ELO) at /api/leaderboard & /api/score
"""

import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import pathlib
import random
import re
import secrets
import sqlite3
import struct
import time
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("PORT") or os.environ.get("BLITZ_PORT") or "8765")
HOST = os.environ.get("BLITZ_HOST") or ("0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
ROOT = pathlib.Path(__file__).resolve().parent
DATA_DIR = pathlib.Path(os.environ.get("BLITZ_DATA_DIR") or (ROOT / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "dropchess.db"

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
MAX_ROOMS = 500
HEARTBEAT_SEC = 20
RECONNECT_GRACE_SEC = 15

MIME_OVERRIDES = {
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
}

# =============================================================================
# SQLite Leaderboard Persistence (Zero External Dependencies)
# =============================================================================

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_scores (
            date_key TEXT NOT NULL,
            handle TEXT NOT NULL,
            clear_sec REAL NOT NULL,
            brilliant INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (date_key, handle)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS elo_board (
            handle TEXT PRIMARY KEY,
            elo INTEGER NOT NULL,
            wins INTEGER NOT NULL DEFAULT 0,
            games INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        )
    """)
    conn.commit()
    return conn


DB = init_db()


def sanitize_handle(raw: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9 _\-]", "", str(raw or "")).strip()[:16]
    return cleaned or "Player"


def db_get_leaderboard(date_key: str):
    cur = DB.cursor()
    cur.execute(
        "SELECT handle, clear_sec, brilliant FROM daily_scores WHERE date_key = ? ORDER BY clear_sec ASC LIMIT 10",
        (date_key,),
    )
    daily_top = [{"handle": r[0], "clearSec": round(r[1], 1), "brilliant": r[2]} for r in cur.fetchall()]

    cur.execute(
        "SELECT handle, elo, wins, games FROM elo_board WHERE games > 0 ORDER BY elo DESC, wins DESC LIMIT 10"
    )
    elo_top = [{"handle": r[0], "elo": r[1], "wins": r[2], "games": r[3]} for r in cur.fetchall()]
    return {"dailyTop": daily_top, "eloTop": elo_top}


def db_record_score(payload: dict):
    handle = sanitize_handle(payload.get("handle"))
    if handle.lower() in ("you", "player", "host", "guest"):
        # Still allow anonymous names cleanly if user hasn't customized
        pass
    now_ts = int(time.time())
    kind = payload.get("kind")

    if kind == "daily":
        date_key = str(payload.get("dateKey") or "")[:10]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_key):
            return False
        clear_sec = max(0.5, min(60.0, float(payload.get("clearSec") or 24.0)))
        brilliant = max(0, min(50, int(payload.get("brilliant") or 0)))
        cur = DB.cursor()
        cur.execute("SELECT clear_sec FROM daily_scores WHERE date_key = ? AND handle = ?", (date_key, handle))
        row = cur.fetchone()
        if not row or clear_sec < row[0]:
            cur.execute(
                """
                INSERT INTO daily_scores (date_key, handle, clear_sec, brilliant, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(date_key, handle) DO UPDATE SET
                    clear_sec = excluded.clear_sec,
                    brilliant = excluded.brilliant,
                    updated_at = excluded.updated_at
                """,
                (date_key, handle, clear_sec, brilliant, now_ts),
            )
            DB.commit()
        return True

    if kind == "elo":
        elo = max(400, min(3200, int(payload.get("elo") or 800)))
        wins = max(0, min(100000, int(payload.get("wins") or 0)))
        games = max(wins, min(100000, int(payload.get("games") or 0)))
        DB.execute(
            """
            INSERT INTO elo_board (handle, elo, wins, games, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(handle) DO UPDATE SET
                elo = excluded.elo,
                wins = excluded.wins,
                games = excluded.games,
                updated_at = excluded.updated_at
            """,
            (handle, elo, wins, games, now_ts),
        )
        DB.commit()
        return True

    return False


# =============================================================================
# Live Multiplayer State: Rooms, Public Queue, Spectators, Rate Limits
# =============================================================================

connected_clients = set()
rooms = {}  # code -> room dict
match_queues = {"blitz": [], "overtime": []}
ip_rate_buckets = {}  # ip -> [timestamps]


def allow_rate(ip: str, limit: int = 20, window: int = 60) -> bool:
    now = time.time()
    hist = [t for t in ip_rate_buckets.get(ip, []) if now - t < window]
    if len(hist) >= limit:
        ip_rate_buckets[ip] = hist
        return False
    hist.append(now)
    ip_rate_buckets[ip] = hist
    return True


class WsClient:
    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, ip: str):
        self.reader = reader
        self.writer = writer
        self.ip = ip
        self.room_code = None
        self.side = None  # 'white' | 'black' | 'spectator'
        self.token = None
        self.name = "Player"
        self.elo = 800
        self.deck = None
        self.closed = False
        self.last_seen = time.time()

    async def send_json(self, obj: dict):
        if self.closed:
            return
        try:
            payload = json.dumps(obj, separators=(",", ":")).encode("utf-8")
            self.writer.write(encode_ws_frame(payload, opcode=0x1))
            await self.writer.drain()
        except Exception:
            self.closed = True

    async def send_pong(self, payload: bytes):
        if self.closed:
            return
        try:
            self.writer.write(encode_ws_frame(payload, opcode=0xA))
            await self.writer.drain()
        except Exception:
            self.closed = True

    async def close(self):
        if self.closed:
            return
        self.closed = True
        try:
            self.writer.write(encode_ws_frame(b"", opcode=0x8))
            await self.writer.drain()
        except Exception:
            pass
        try:
            self.writer.close()
            await self.writer.wait_closed()
        except Exception:
            pass


def encode_ws_frame(payload: bytes, opcode: int = 0x1) -> bytes:
    header = bytearray()
    header.append(0x80 | (opcode & 0x0F))
    length = len(payload)
    if length < 126:
        header.append(length)
    elif length < 65536:
        header.append(126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", length))
    return bytes(header) + payload


async def read_ws_frame(reader: asyncio.StreamReader):
    first_two = await reader.readexactly(2)
    b1, b2 = first_two[0], first_two[1]
    opcode = b1 & 0x0F
    masked = (b2 & 0x80) != 0
    length = b2 & 0x7F

    if length == 126:
        length = struct.unpack("!H", await reader.readexactly(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", await reader.readexactly(8))[0]

    if length > 512 * 1024:
        raise ValueError("Frame too large")

    mask_key = await reader.readexactly(4) if masked else None
    payload = await reader.readexactly(length) if length > 0 else b""
    if masked and mask_key:
        payload = bytes(b ^ mask_key[i & 3] for i, b in enumerate(payload))
    return opcode, payload


def generate_room_code() -> str:
    for _ in range(60):
        code = "".join(random.choice(CODE_CHARS) for _ in range(4))
        if code not in rooms:
            return code
    return "".join(random.choice(CODE_CHARS) for _ in range(6))


def remove_from_queues(client: WsClient):
    for q in match_queues.values():
        if client in q:
            q.remove(client)


async def broadcast_presence():
    total_q = sum(len(q) for q in match_queues.values())
    msg = {"type": "PRESENCE", "online": len(connected_clients), "inQueue": total_q}
    for c in list(connected_clients):
        if not c.closed:
            await c.send_json(msg)


async def expire_disconnected_seat(code: str, side: str, expected_token: str):
    await asyncio.sleep(RECONNECT_GRACE_SEC)
    room = rooms.get(code)
    if not room:
        return
    if room.get(side) is not None:
        return  # Reconnected!
    if room["tokens"].get(side) != expected_token:
        return

    other_side = "black" if side == "white" else "white"
    other = room.get(other_side)
    if other and not other.closed:
        await other.send_json({"type": "OPPONENT_LEFT"})
    for sp in list(room["spectators"]):
        if not sp.closed:
            await sp.send_json({"type": "OPPONENT_LEFT"})
    rooms.pop(code, None)


async def leave_room(client: WsClient, allow_grace: bool = False):
    remove_from_queues(client)
    code = client.room_code
    if not code:
        return
    side = client.side
    token = client.token
    client.room_code = None
    client.side = None
    client.token = None

    room = rooms.get(code)
    if not room:
        return

    if side == "spectator":
        room["spectators"].discard(client)
        return

    other_side = "black" if side == "white" else "white"
    other = room.get(other_side)
    room[side] = None

    # Allow 15s reconnect grace if match is live and opponent is still connected
    if allow_grace and other and not other.closed and token:
        await other.send_json({"type": "OPPONENT_RECONNECTING", "seconds": RECONNECT_GRACE_SEC})
        task = asyncio.create_task(expire_disconnected_seat(code, side, token))
        room["grace_tasks"][side] = task
        return

    if other and not other.closed:
        await other.send_json({"type": "OPPONENT_LEFT"})
    for sp in list(room["spectators"]):
        if not sp.closed:
            await sp.send_json({"type": "OPPONENT_LEFT"})

    if not room.get("white") and not room.get("black"):
        rooms.pop(code, None)


async def pair_players(host: WsClient, guest: WsClient, mode: str, code: str = None):
    code = code or generate_room_code()
    w_tok = secrets.token_hex(8)
    b_tok = secrets.token_hex(8)
    rooms[code] = {
        "white": host,
        "black": guest,
        "mode": mode,
        "rematch": set(),
        "spectators": set(),
        "tokens": {"white": w_tok, "black": b_tok},
        "grace_tasks": {},
        "last_state": None,
        "names": {"white": host.name, "black": guest.name},
        "elos": {"white": host.elo, "black": guest.elo},
    }
    host.room_code = code
    host.side = "white"
    host.token = w_tok
    guest.room_code = code
    guest.side = "black"
    guest.token = b_tok

    await host.send_json({
        "type": "MATCH_READY",
        "code": code,
        "side": "white",
        "mode": mode,
        "token": w_tok,
        "opponent": {"name": guest.name, "elo": guest.elo},
        "guestDeck": guest.deck,
    })
    await guest.send_json({
        "type": "MATCH_READY",
        "code": code,
        "side": "black",
        "mode": mode,
        "token": b_tok,
        "opponent": {"name": host.name, "elo": host.elo},
    })


async def handle_ws_message(client: WsClient, raw: str):
    client.last_seen = time.time()
    try:
        msg = json.loads(raw)
    except Exception:
        return

    mtype = msg.get("type")

    if mtype == "PONG":
        return

    if mtype == "QUEUE_JOIN":
        await leave_room(client, allow_grace=False)
        mode = msg.get("mode") if msg.get("mode") in ("blitz", "overtime") else "blitz"
        client.name = sanitize_handle(msg.get("name") or "Player")
        client.elo = max(400, min(3200, int(msg.get("elo") or 800)))
        client.deck = msg.get("deck")
        q = match_queues[mode]
        # Clean dead sockets from queue
        q[:] = [c for c in q if not c.closed and c is not client]
        if q:
            partner = q.pop(0)
            await pair_players(partner, client, mode)
        else:
            q.append(client)
            await client.send_json({"type": "QUEUE_WAITING", "mode": mode})
        await broadcast_presence()
        return

    if mtype == "QUEUE_LEAVE":
        remove_from_queues(client)
        await client.send_json({"type": "QUEUE_LEFT"})
        await broadcast_presence()
        return

    if mtype == "CREATE_ROOM":
        if len(rooms) >= MAX_ROOMS:
            await client.send_json({"type": "ROOM_ERROR", "message": "Server at room capacity."})
            return
        if not allow_rate(client.ip, limit=18, window=60):
            await client.send_json({"type": "ROOM_ERROR", "message": "Too many rooms created. Wait a moment."})
            return
        await leave_room(client, allow_grace=False)
        code = generate_room_code()
        tok = secrets.token_hex(8)
        client.room_code = code
        client.side = "white"
        client.token = tok
        client.name = sanitize_handle(msg.get("name") or "Host")
        client.elo = max(400, min(3200, int(msg.get("elo") or 800)))
        client.deck = msg.get("deck")
        mode = msg.get("mode") if msg.get("mode") in ("blitz", "overtime") else "blitz"
        rooms[code] = {
            "white": client,
            "black": None,
            "mode": mode,
            "rematch": set(),
            "spectators": set(),
            "tokens": {"white": tok, "black": None},
            "grace_tasks": {},
            "last_state": None,
            "names": {"white": client.name, "black": "Guest"},
            "elos": {"white": client.elo, "black": 800},
        }
        await client.send_json({"type": "ROOM_CREATED", "code": code, "side": "white", "mode": mode, "token": tok})
        return

    if mtype == "JOIN_ROOM":
        code = str(msg.get("code") or "").strip().upper()
        room = rooms.get(code)
        if not room:
            await client.send_json({"type": "ROOM_ERROR", "message": "Room not found."})
            return
        if room.get("black") is not None:
            await client.send_json({"type": "ROOM_ERROR", "message": "Room is full."})
            return
        if room.get("white") is client:
            return

        await leave_room(client, allow_grace=False)
        tok = secrets.token_hex(8)
        client.room_code = code
        client.side = "black"
        client.token = tok
        client.name = sanitize_handle(msg.get("name") or "Guest")
        client.elo = max(400, min(3200, int(msg.get("elo") or 800)))
        client.deck = msg.get("deck")
        room["black"] = client
        room["tokens"]["black"] = tok
        room["names"]["black"] = client.name
        room["elos"]["black"] = client.elo
        room["rematch"] = set()

        host = room["white"]
        await host.send_json({
            "type": "MATCH_READY",
            "code": code,
            "side": "white",
            "mode": room["mode"],
            "token": room["tokens"]["white"],
            "opponent": {"name": client.name, "elo": client.elo},
            "guestDeck": client.deck,
        })
        await client.send_json({
            "type": "MATCH_READY",
            "code": code,
            "side": "black",
            "mode": room["mode"],
            "token": tok,
            "opponent": {"name": host.name, "elo": host.elo},
        })
        return

    if mtype == "WATCH_ROOM":
        code = str(msg.get("code") or "").strip().upper()
        room = rooms.get(code)
        if not room:
            await client.send_json({"type": "ROOM_ERROR", "message": "Room not found to spectate."})
            return
        await leave_room(client, allow_grace=False)
        client.room_code = code
        client.side = "spectator"
        room["spectators"].add(client)
        await client.send_json({
            "type": "WATCH_JOINED",
            "code": code,
            "mode": room["mode"],
            "white": {"name": room["names"]["white"], "elo": room["elos"]["white"]},
            "black": {"name": room["names"]["black"], "elo": room["elos"]["black"]},
            "state": room.get("last_state"),
        })
        return

    if mtype == "RECONNECT":
        code = str(msg.get("code") or "").strip().upper()
        tok = str(msg.get("token") or "")
        room = rooms.get(code)
        if not room or not tok:
            await client.send_json({"type": "ROOM_ERROR", "message": "Session expired."})
            return
        matched_side = None
        for s in ("white", "black"):
            if room["tokens"].get(s) == tok and room.get(s) is None:
                matched_side = s
                break
        if not matched_side:
            await client.send_json({"type": "ROOM_ERROR", "message": "Seat no longer available."})
            return

        # Cancel grace expiry task and reseat player
        gt = room["grace_tasks"].pop(matched_side, None)
        if gt:
            gt.cancel()
        client.room_code = code
        client.side = matched_side
        client.token = tok
        room[matched_side] = client
        other_side = "black" if matched_side == "white" else "white"
        other = room.get(other_side)
        if other and not other.closed:
            await other.send_json({"type": "OPPONENT_RECONNECTED"})
        await client.send_json({
            "type": "RECONNECTED",
            "code": code,
            "side": matched_side,
            "mode": room["mode"],
            "opponent": {"name": room["names"][other_side], "elo": room["elos"][other_side]},
            "state": room.get("last_state"),
        })
        return

    if mtype == "LEAVE_ROOM":
        await leave_room(client, allow_grace=False)
        await broadcast_presence()
        return

    # Room relay messages
    code = client.room_code
    if not code or code not in rooms:
        return
    room = rooms[code]
    if client.side == "spectator":
        return

    other_side = "black" if client.side == "white" else "white"
    other = room.get(other_side)

    if mtype == "REMATCH_REQ":
        room["rematch"].add(client.side)
        if other and not other.closed:
            await other.send_json({"type": "REMATCH_OFFERED"})
        if "white" in room["rematch"] and "black" in room["rematch"]:
            room["rematch"] = set()
            if room["white"]:
                await room["white"].send_json({"type": "REMATCH_START"})
            if room["black"]:
                await room["black"].send_json({"type": "REMATCH_START"})
        return

    if mtype == "STATE":
        room["last_state"] = msg.get("state")

    if other and not other.closed:
        await other.send_json(msg)

    # Relay live STATE & EVENT packets to all spectators!
    if mtype in ("STATE", "EVENT") and room["spectators"]:
        for sp in list(room["spectators"]):
            if not sp.closed:
                await sp.send_json(msg)


async def heartbeat_loop():
    while True:
        await asyncio.sleep(HEARTBEAT_SEC)
        for c in list(connected_clients):
            if c.closed:
                connected_clients.discard(c)
                continue
            await c.send_json({"type": "PING"})


async def handle_websocket(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, ws_key: str, ip: str):
    accept_src = (ws_key.strip() + WS_GUID).encode("utf-8")
    accept_val = base64.b64encode(hashlib.sha1(accept_src).digest()).decode("ascii")
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept_val}\r\n"
        "\r\n"
    )
    writer.write(response.encode("ascii"))
    await writer.drain()

    client = WsClient(reader, writer, ip)
    connected_clients.add(client)
    await broadcast_presence()
    try:
        while not client.closed:
            opcode, payload = await read_ws_frame(reader)
            if opcode == 0x8:
                break
            elif opcode == 0x9:
                await client.send_pong(payload)
            elif opcode == 0xA:
                client.last_seen = time.time()
            elif opcode == 0x1:
                await handle_ws_message(client, payload.decode("utf-8", errors="ignore"))
    except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError, ValueError):
        pass
    finally:
        connected_clients.discard(client)
        await leave_room(client, allow_grace=True)
        await client.close()
        await broadcast_presence()


async def send_json_http(writer: asyncio.StreamWriter, obj: dict, status: str = "200 OK", head_only: bool = False):
    body = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    header = (
        f"HTTP/1.1 {status}\r\n"
        "Content-Type: application/json; charset=utf-8\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Cache-Control: no-store\r\n"
        "Connection: close\r\n"
        "\r\n"
    ).encode("ascii")
    writer.write(header if head_only else header + body)
    await writer.drain()


async def serve_static(writer: asyncio.StreamWriter, raw_path: str, head_only: bool = False):
    parsed = urlparse(raw_path)

    if parsed.path == "/health":
        await send_json_http(
            writer,
            {
                "status": "ok",
                "rooms": len(rooms),
                "online": len(connected_clients),
                "queue": sum(len(q) for q in match_queues.values()),
            },
            head_only=head_only,
        )
        return

    if parsed.path == "/api/leaderboard":
        qs = parse_qs(parsed.query)
        date_key = (qs.get("date") or [time.strftime("%Y-%m-%d")])[0][:10]
        board = db_get_leaderboard(date_key)
        board["online"] = len(connected_clients)
        board["inQueue"] = sum(len(q) for q in match_queues.values())
        await send_json_http(writer, board, head_only=head_only)
        return

    rel = parsed.path.lstrip("/") or "index.html"
    target = (ROOT / rel).resolve()

    try:
        target.relative_to(ROOT)
    except ValueError:
        writer.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 9\r\nConnection: close\r\n\r\nForbidden")
        await writer.drain()
        return

    if target.is_dir():
        target = target / "index.html"

    if not target.is_file():
        writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\nConnection: close\r\n\r\nNot Found")
        await writer.drain()
        return

    data = target.read_bytes()
    ext = target.suffix.lower()
    ctype = MIME_OVERRIDES.get(ext) or mimetypes.guess_type(str(target))[0] or "application/octet-stream"

    header = (
        "HTTP/1.1 200 OK\r\n"
        f"Content-Type: {ctype}\r\n"
        f"Content-Length: {len(data)}\r\n"
        "Cache-Control: no-cache\r\n"
        "Connection: close\r\n"
        "\r\n"
    ).encode("ascii")
    writer.write(header if head_only else header + data)
    await writer.drain()


async def handle_connection(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    peer = writer.get_extra_info("peername")
    ip = peer[0] if peer else "unknown"
    try:
        raw_head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10.0)
    except Exception:
        writer.close()
        return

    lines = raw_head.decode("iso-8859-1", errors="ignore").split("\r\n")
    if not lines or not lines[0]:
        writer.close()
        return

    parts = lines[0].split(" ")
    if len(parts) < 2:
        writer.close()
        return
    method, path = parts[0], parts[1]

    headers = {}
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()

    if headers.get("upgrade", "").lower() == "websocket" and "sec-websocket-key" in headers:
        await handle_websocket(reader, writer, headers["sec-websocket-key"], ip)
        return

    if method == "GET":
        await serve_static(writer, path, head_only=False)
    elif method == "HEAD":
        await serve_static(writer, path, head_only=True)
    elif method == "POST" and urlparse(path).path == "/api/score":
        if not allow_rate(ip, limit=30, window=60):
            await send_json_http(writer, {"ok": False, "error": "rate_limited"}, status="429 Too Many Requests")
        else:
            clen = min(8192, max(0, int(headers.get("content-length") or 0)))
            body = await reader.readexactly(clen) if clen > 0 else b"{}"
            try:
                payload = json.loads(body.decode("utf-8", errors="ignore"))
                ok = db_record_score(payload)
                await send_json_http(writer, {"ok": ok})
            except Exception:
                await send_json_http(writer, {"ok": False}, status="400 Bad Request")
    else:
        writer.write(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        await writer.drain()

    try:
        writer.close()
        await writer.wait_closed()
    except Exception:
        pass


async def main():
    asyncio.create_task(heartbeat_loop())
    server = await asyncio.start_server(handle_connection, HOST, PORT)
    print(f"Drop-Chess server running at http://{HOST}:{PORT} (WebSocket at ws://{HOST}:{PORT}/ws, DB at {DB_PATH})")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
