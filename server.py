"""
Unified zero-dependency Python 3 HTTP + RFC 6455 WebSocket server for Blitz Grid.
Serves static files on http://127.0.0.1:8765 and real-time 1v1 rooms on ws://127.0.0.1:8765/ws.
"""

import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import pathlib
import random
import struct
from urllib.parse import urlparse

PORT = int(os.environ.get("PORT") or os.environ.get("BLITZ_PORT") or "8765")
HOST = os.environ.get("BLITZ_HOST") or ("0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
ROOT = pathlib.Path(__file__).resolve().parent

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

MIME_OVERRIDES = {
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
}

rooms = {}  # code -> { "white": client, "black": client, "mode": str }


class WsClient:
    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader = reader
        self.writer = writer
        self.room_code = None
        self.side = None
        self.name = "Player"
        self.elo = 800
        self.closed = False

    async def send_json(self, obj: dict):
        if self.closed:
            return
        try:
            payload = json.dumps(obj, separators=(",", ":")).encode("utf-8")
            frame = encode_ws_frame(payload, opcode=0x1)
            self.writer.write(frame)
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

    mask_key = await reader.readexactly(4) if masked else None
    payload = await reader.readexactly(length) if length > 0 else b""

    if masked and mask_key:
        payload = bytes(b ^ mask_key[i & 3] for i, b in enumerate(payload))

    return opcode, payload


def generate_room_code() -> str:
    for _ in range(50):
        code = "".join(random.choice(CODE_CHARS) for _ in range(4))
        if code not in rooms:
            return code
    return "".join(random.choice(CODE_CHARS) for _ in range(6))


async def leave_room(client: WsClient):
    code = client.room_code
    if not code:
        return
    client.room_code = None
    side = client.side
    client.side = None

    room = rooms.get(code)
    if not room:
        return

    other_side = "black" if side == "white" else "white"
    other = room.get(other_side)
    room[side] = None

    if other and not other.closed:
        await other.send_json({"type": "OPPONENT_LEFT"})

    if not room.get("white") and not room.get("black"):
        rooms.pop(code, None)


async def handle_ws_message(client: WsClient, raw: str):
    try:
        msg = json.loads(raw)
    except Exception:
        return

    mtype = msg.get("type")

    if mtype == "CREATE_ROOM":
        await leave_room(client)
        code = generate_room_code()
        client.room_code = code
        client.side = "white"
        client.name = str(msg.get("name") or "Player")[:18]
        client.elo = int(msg.get("elo") or 800)
        mode = msg.get("mode") if msg.get("mode") in ("blitz", "overtime") else "blitz"
        rooms[code] = {
            "white": client,
            "black": None,
            "mode": mode,
            "rematch": set(),
        }
        await client.send_json({"type": "ROOM_CREATED", "code": code, "side": "white", "mode": mode})
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

        await leave_room(client)
        client.room_code = code
        client.side = "black"
        client.name = str(msg.get("name") or "Guest")[:18]
        client.elo = int(msg.get("elo") or 800)
        room["black"] = client
        room["rematch"] = set()

        host = room["white"]
        await host.send_json({
            "type": "MATCH_READY",
            "code": code,
            "side": "white",
            "mode": room["mode"],
            "opponent": {"name": client.name, "elo": client.elo},
            "guestDeck": msg.get("deck"),
        })
        await client.send_json({
            "type": "MATCH_READY",
            "code": code,
            "side": "black",
            "mode": room["mode"],
            "opponent": {"name": host.name, "elo": host.elo},
        })
        return

    if mtype == "LEAVE_ROOM":
        await leave_room(client)
        return

    # Room relay messages
    code = client.room_code
    if not code or code not in rooms:
        return
    room = rooms[code]
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

    # Direct relay for STATE, EVENT, CMD, DECK_SYNC
    if other and not other.closed:
        await other.send_json(msg)


async def handle_websocket(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, ws_key: str):
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

    client = WsClient(reader, writer)
    try:
        while not client.closed:
            opcode, payload = await read_ws_frame(reader)
            if opcode == 0x8:  # Close
                break
            elif opcode == 0x9:  # Ping
                await client.send_pong(payload)
            elif opcode == 0x1:  # Text
                await handle_ws_message(client, payload.decode("utf-8", errors="ignore"))
    except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError):
        pass
    finally:
        await leave_room(client)
        await client.close()


async def serve_static(writer: asyncio.StreamWriter, raw_path: str, head_only: bool = False):
    parsed = urlparse(raw_path)

    if parsed.path == "/health":
        body = json.dumps({"status": "ok", "rooms": len(rooms)}).encode("utf-8")
        header = (
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: application/json; charset=utf-8\r\n"
            f"Content-Length: {len(body)}\r\n"
            "Cache-Control: no-store\r\n"
            "Connection: close\r\n"
            "\r\n"
        ).encode("ascii")
        writer.write(header if head_only else header + body)
        await writer.drain()
        return

    rel = parsed.path.lstrip("/") or "index.html"
    target = (ROOT / rel).resolve()

    # Path traversal guard
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
        await handle_websocket(reader, writer, headers["sec-websocket-key"])
        return

    if method == "GET":
        await serve_static(writer, path, head_only=False)
    elif method == "HEAD":
        await serve_static(writer, path, head_only=True)
    else:
        writer.write(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        await writer.drain()

    try:
        writer.close()
        await writer.wait_closed()
    except Exception:
        pass


async def main():
    server = await asyncio.start_server(handle_connection, HOST, PORT)
    print(f"Blitz Grid server running at http://{HOST}:{PORT} (WebSocket at ws://{HOST}:{PORT}/ws)")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
