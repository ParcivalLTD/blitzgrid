// Lightweight WebSocket 1v1, Matchmaking Queue, Live Spectator & Reconnect client for server.py (/ws).

const SESSION_KEY = 'dropchess_session_v1';

export class MultiplayerClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.ws = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'idle' | 'queuing' | 'waiting' | 'connected' | 'watching'
    this.roomCode = null;
    this.side = null; // 'white' | 'black' | 'spectator'
    this.mode = 'blitz';
    this.opponent = null;
    this.spectatorMeta = null;
    this.error = null;
    this.rematchOffered = false;
    this.rematchSent = false;
    this.inQueue = false;
    this.spectating = false;
    this.onlineCount = 0;
    this.inQueueCount = 0;
    this.reconnectToken = null;
    this.reconnectingBanner = null;
    this.pendingQueue = [];
    this.passiveMode = false;
    this.reconnectTimer = null;
  }

  getWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  saveSession() {
    if (!this.roomCode || !this.reconnectToken || this.spectating) return;
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ code: this.roomCode, token: this.reconnectToken, side: this.side, ts: Date.now() })
      );
    } catch {
      // Ignore storage errors
    }
  }

  clearSession() {
    this.reconnectToken = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  getSavedSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.code || !parsed.token || Date.now() - (parsed.ts || 0) > 20000) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  connectPassive() {
    this.passiveMode = true;
    this.ensureConnected(true);
  }

  ensureConnected(passive = false) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (!passive) {
      this.passiveMode = false;
      this.status = 'connecting';
      this.error = null;
      this.notify();
    }

    try {
      this.ws = new WebSocket(this.getWsUrl());
    } catch {
      this.status = 'disconnected';
      if (!passive) this.error = 'WebSocket unavailable. Run server.py.';
      this.notify();
      return;
    }

    this.ws.addEventListener('open', () => {
      if (this.status === 'connecting' || this.status === 'disconnected') {
        this.status = 'idle';
      }
      while (this.pendingQueue.length > 0) {
        this.ws.send(JSON.stringify(this.pendingQueue.shift()));
      }
      this.notify();
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
      const wasActiveMatch = this.status === 'connected' && this.roomCode && this.reconnectToken && !this.spectating;
      const wasInRoom = this.status === 'connected' || this.status === 'waiting' || this.status === 'watching';
      const savedCode = this.roomCode;
      const savedToken = this.reconnectToken;

      this.ws = null;
      this.inQueue = false;

      if (wasActiveMatch && savedCode && savedToken) {
        this.reconnectingBanner = 'Reconnecting to match...';
        this.notify();
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.tryReconnect(savedCode, savedToken);
        }, 1200);
        return;
      }

      this.status = 'disconnected';
      this.roomCode = null;
      this.side = null;
      this.opponent = null;
      this.spectating = false;
      this.spectatorMeta = null;
      this.rematchOffered = false;
      this.rematchSent = false;
      this.reconnectingBanner = null;
      if (wasInRoom) {
        this.error = 'Disconnected from server.';
        if (this.handlers.onOpponentLeft) this.handlers.onOpponentLeft();
      }
      this.notify();
    });

    this.ws.addEventListener('error', () => {
      if (!this.passiveMode) {
        this.error = 'Server unreachable. Start python server.py.';
        this.notify();
      }
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    } else {
      this.pendingQueue.push(obj);
      this.ensureConnected(false);
    }
  }

  joinQueue({ mode = 'blitz', elo = 800, name = 'Player', deck = null } = {}) {
    this.error = null;
    this.spectating = false;
    this.rematchOffered = false;
    this.rematchSent = false;
    this.send({ type: 'QUEUE_JOIN', mode, elo, name, deck });
  }

  leaveQueue() {
    this.inQueue = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'QUEUE_LEAVE' }));
    }
    if (this.status === 'queuing') this.status = 'idle';
    this.notify();
  }

  createRoom({ mode = 'blitz', elo = 800, name = 'Host', deck = null } = {}) {
    this.error = null;
    this.inQueue = false;
    this.spectating = false;
    this.rematchOffered = false;
    this.rematchSent = false;
    this.send({ type: 'CREATE_ROOM', mode, elo, name, deck });
  }

  joinRoom({ code, elo = 800, name = 'Guest', deck = null } = {}) {
    const clean = String(code || '').trim().toUpperCase();
    if (clean.length < 4) {
      this.error = 'Enter a 4-letter room code.';
      this.notify();
      return;
    }
    this.error = null;
    this.inQueue = false;
    this.spectating = false;
    this.rematchOffered = false;
    this.rematchSent = false;
    this.send({ type: 'JOIN_ROOM', code: clean, elo, name, deck });
  }

  watchRoom(code) {
    const clean = String(code || '').trim().toUpperCase();
    if (clean.length < 4) {
      this.error = 'Enter a 4-letter room code to watch.';
      this.notify();
      return;
    }
    this.error = null;
    this.inQueue = false;
    this.send({ type: 'WATCH_ROOM', code: clean });
  }

  tryReconnect(code, token) {
    this.error = null;
    this.send({ type: 'RECONNECT', code, token });
  }

  leaveRoom() {
    clearTimeout(this.reconnectTimer);
    this.clearSession();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    }
    this.status = this.ws && this.ws.readyState === WebSocket.OPEN ? 'idle' : 'disconnected';
    this.roomCode = null;
    this.side = null;
    this.opponent = null;
    this.inQueue = false;
    this.spectating = false;
    this.spectatorMeta = null;
    this.rematchOffered = false;
    this.rematchSent = false;
    this.reconnectingBanner = null;
    this.error = null;
    this.notify();
  }

  sendState(state) {
    if (this.status !== 'connected' || this.spectating) return;
    this.send({ type: 'STATE', state });
  }

  sendEvent(ev) {
    if (this.status !== 'connected' || this.spectating) return;
    this.send({ type: 'EVENT', ev });
  }

  sendCmd(cmd) {
    if (this.status !== 'connected' || this.spectating) return;
    this.send({ type: 'CMD', cmd });
  }

  requestRematch() {
    if (this.status !== 'connected' || this.spectating) return;
    this.rematchSent = true;
    this.send({ type: 'REMATCH_REQ' });
    this.notify();
  }

  onMessage(msg) {
    switch (msg.type) {
      case 'PING':
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('{"type":"PONG"}');
        }
        break;

      case 'PRESENCE':
        this.onlineCount = Number(msg.online) || 0;
        this.inQueueCount = Number(msg.inQueue) || 0;
        this.notify();
        break;

      case 'QUEUE_WAITING':
        this.inQueue = true;
        this.status = 'queuing';
        this.mode = msg.mode || 'blitz';
        this.error = null;
        this.notify();
        break;

      case 'QUEUE_LEFT':
        this.inQueue = false;
        if (this.status === 'queuing') this.status = 'idle';
        this.notify();
        break;

      case 'ROOM_CREATED':
        this.status = 'waiting';
        this.roomCode = msg.code;
        this.side = msg.side;
        this.mode = msg.mode || 'blitz';
        this.reconnectToken = msg.token || null;
        this.error = null;
        this.notify();
        break;

      case 'ROOM_ERROR':
        this.error = msg.message || 'Could not join room.';
        this.inQueue = false;
        this.spectating = false;
        this.reconnectingBanner = null;
        this.clearSession();
        if (this.status !== 'connected') {
          this.status = this.ws && this.ws.readyState === WebSocket.OPEN ? 'idle' : 'disconnected';
        }
        this.notify();
        break;

      case 'MATCH_READY':
        this.status = 'connected';
        this.roomCode = msg.code;
        this.side = msg.side;
        this.mode = msg.mode || 'blitz';
        this.opponent = msg.opponent || { name: 'Opponent', elo: 800 };
        this.reconnectToken = msg.token || this.reconnectToken;
        this.inQueue = false;
        this.spectating = false;
        this.spectatorMeta = null;
        this.rematchOffered = false;
        this.rematchSent = false;
        this.reconnectingBanner = null;
        this.error = null;
        this.saveSession();
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

      case 'WATCH_JOINED':
        this.status = 'watching';
        this.roomCode = msg.code;
        this.side = 'spectator';
        this.mode = msg.mode || 'blitz';
        this.spectating = true;
        this.inQueue = false;
        this.spectatorMeta = {
          white: msg.white || { name: 'White', elo: 800 },
          black: msg.black || { name: 'Black', elo: 800 },
        };
        this.error = null;
        this.notify();
        if (this.handlers.onWatchJoined) this.handlers.onWatchJoined(msg);
        break;

      case 'RECONNECTED':
        this.status = 'connected';
        this.roomCode = msg.code;
        this.side = msg.side;
        this.mode = msg.mode || 'blitz';
        this.opponent = msg.opponent || { name: 'Opponent', elo: 800 };
        this.reconnectingBanner = null;
        this.error = null;
        this.saveSession();
        this.notify();
        if (this.handlers.onReconnected) this.handlers.onReconnected(msg);
        break;

      case 'OPPONENT_RECONNECTING':
        this.reconnectingBanner = `Opponent reconnecting (${msg.seconds || 15}s)...`;
        this.notify();
        if (this.handlers.onOpponentReconnecting) this.handlers.onOpponentReconnecting(msg.seconds || 15);
        break;

      case 'OPPONENT_RECONNECTED':
        this.reconnectingBanner = null;
        this.notify();
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
        this.clearSession();
        this.status = this.ws && this.ws.readyState === WebSocket.OPEN ? 'idle' : 'disconnected';
        this.roomCode = null;
        this.side = null;
        this.opponent = null;
        this.spectating = false;
        this.spectatorMeta = null;
        this.reconnectingBanner = null;
        this.error = 'Match ended (player disconnected).';
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
