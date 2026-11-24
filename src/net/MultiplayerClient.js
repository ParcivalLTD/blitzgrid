// Lightweight WebSocket 1v1 room client talking to server.py (/ws).

export class MultiplayerClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.ws = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'waiting' | 'connected'
    this.roomCode = null;
    this.side = null; // 'white' (host) | 'black' (guest)
    this.mode = 'blitz';
    this.opponent = null;
    this.error = null;
    this.rematchOffered = false;
    this.rematchSent = false;
    this.pendingQueue = [];
  }

  getWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  ensureConnected() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.status = 'connecting';
    this.error = null;
    this.notify();

    try {
      this.ws = new WebSocket(this.getWsUrl());
    } catch {
      this.status = 'disconnected';
      this.error = 'WebSocket unavailable. Run server.py.';
      this.notify();
      return;
    }

    this.ws.addEventListener('open', () => {
      while (this.pendingQueue.length > 0) {
        this.ws.send(JSON.stringify(this.pendingQueue.shift()));
      }
    });

    this.ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.onMessage(msg);
    });

    this.ws.addEventListener('close', () => {
      const wasInRoom = this.status === 'connected' || this.status === 'waiting';
      this.ws = null;
      this.status = 'disconnected';
      this.roomCode = null;
      this.side = null;
      this.opponent = null;
      this.rematchOffered = false;
      this.rematchSent = false;
      if (wasInRoom) {
        this.error = 'Disconnected from server.';
        if (this.handlers.onOpponentLeft) this.handlers.onOpponentLeft();
      }
      this.notify();
    });

    this.ws.addEventListener('error', () => {
      this.error = 'Server unreachable. Start python server.py.';
      this.notify();
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    } else {
      this.pendingQueue.push(obj);
      this.ensureConnected();
    }
  }

  createRoom({ mode = 'blitz', elo = 800, name = 'Host' } = {}) {
    this.error = null;
    this.rematchOffered = false;
    this.rematchSent = false;
    this.send({ type: 'CREATE_ROOM', mode, elo, name });
  }

  joinRoom({ code, elo = 800, name = 'Guest', deck = null } = {}) {
    const clean = String(code || '').trim().toUpperCase();
    if (clean.length < 4) {
      this.error = 'Enter a 4-letter room code.';
      this.notify();
      return;
    }
    this.error = null;
    this.rematchOffered = false;
    this.rematchSent = false;
    this.send({ type: 'JOIN_ROOM', code: clean, elo, name, deck });
  }

  leaveRoom() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    }
    this.status = 'disconnected';
    this.roomCode = null;
    this.side = null;
    this.opponent = null;
    this.rematchOffered = false;
    this.rematchSent = false;
    this.error = null;
    this.notify();
  }

  sendState(state) {
    if (this.status !== 'connected') return;
    this.send({ type: 'STATE', state });
  }

  sendEvent(ev) {
    if (this.status !== 'connected') return;
    this.send({ type: 'EVENT', ev });
  }

  sendCmd(cmd) {
    if (this.status !== 'connected') return;
    this.send({ type: 'CMD', cmd });
  }

  requestRematch() {
    if (this.status !== 'connected') return;
    this.rematchSent = true;
    this.send({ type: 'REMATCH_REQ' });
    this.notify();
  }

  onMessage(msg) {
    switch (msg.type) {
      case 'ROOM_CREATED':
        this.status = 'waiting';
        this.roomCode = msg.code;
        this.side = msg.side;
        this.mode = msg.mode || 'blitz';
        this.error = null;
        this.notify();
        break;

      case 'ROOM_ERROR':
        this.error = msg.message || 'Could not join room.';
        this.status = 'disconnected';
        this.notify();
        break;

      case 'MATCH_READY':
        this.status = 'connected';
        this.roomCode = msg.code;
        this.side = msg.side;
        this.mode = msg.mode || 'blitz';
        this.opponent = msg.opponent || { name: 'Opponent', elo: 800 };
        this.rematchOffered = false;
        this.rematchSent = false;
        this.error = null;
        this.notify();
        if (this.handlers.onMatchReady) {
          this.handlers.onMatchReady({
            side: this.side,
            mode: this.mode,
            opponent: this.opponent,
            guestDeck: msg.guestDeck || null,
          });
        }
        break;

      case 'STATE':
        if (this.handlers.onState) this.handlers.onState(msg.state);
        break;

      case 'EVENT':
        if (this.handlers.onRemoteEvent) this.handlers.onRemoteEvent(msg.ev);
        break;

      case 'CMD':
        if (this.handlers.onRemoteCmd) this.handlers.onRemoteCmd(msg.cmd);
        break;

      case 'REMATCH_OFFERED':
        this.rematchOffered = true;
        this.notify();
        break;

      case 'REMATCH_START':
        this.rematchOffered = false;
        this.rematchSent = false;
        this.notify();
        if (this.handlers.onRematchStart) this.handlers.onRematchStart();
        break;

      case 'OPPONENT_LEFT':
        this.status = 'disconnected';
        this.roomCode = null;
        this.side = null;
        this.opponent = null;
        this.error = 'Opponent left the room.';
        this.notify();
        if (this.handlers.onOpponentLeft) this.handlers.onOpponentLeft();
        break;

      default:
        break;
    }
  }

  notify() {
    if (this.handlers.onStatusChange) this.handlers.onStatusChange(this);
  }
}
