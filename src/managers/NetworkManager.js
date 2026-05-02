import { io } from 'socket.io-client';
import { NET_UPDATE_HZ, NET_CONNECT_TTL } from '../config/constants.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const UPDATE_MS  = 1000 / NET_UPDATE_HZ;

export default class NetworkManager {
  constructor() {
    this.scene     = null;   // updated each time a new scene instance takes over
    this.socket    = null;
    this.myId      = null;
    this.userId    = null;   // stable cross-session identity
    this.connected = false;
    this._timer    = 0;
  }

  // scene reference must be set before calling connect() or requestRejoin()
  setScene(scene) {
    this.scene = scene;
  }

  // First connection — pass stable userId and display name for server-side identity
  connect(userId, displayName) {
    this.userId = userId;

    return new Promise((resolve) => {
      const sock = io(SERVER_URL, {
        timeout: NET_CONNECT_TTL,
        auth: { userId, displayName },
      });
      this.socket = sock;

      const timeout = setTimeout(() => {
        if (!this.connected) {
          console.warn('[Net] Server unreachable — falling back to solo');
          sock.disconnect();
          resolve(false);
        }
      }, NET_CONNECT_TTL);

      sock.once('connect', () => {
        clearTimeout(timeout);
        this.connected = true;
        this.myId      = sock.id;
        console.log('[Net] Connected as', this.myId, '| user:', userId);
        resolve(true);
      });

      this._registerSocketEvents(sock);
    });
  }

  // Called when the Game scene restarts but the socket is still alive.
  // Releases any cargo this player held and requests a fresh game_state snapshot.
  requestRejoin() {
    if (!this.connected) return;
    this.socket.emit('rejoin');
  }

  _registerSocketEvents(sock) {
    const fwd = (event) =>
      sock.on(event, (d) => this.scene?.events.emit('net_' + event, d));

    fwd('game_state');
    fwd('player_joined');
    fwd('player_left');
    fwd('player_update');
    fwd('mission_started');
    fwd('pickup_granted');
    fwd('pickup_denied');
    fwd('cargo_integrity');
    fwd('mission_completed');
    fwd('mission_failed');
    fwd('cargo_released');
    sock.on('disconnect', () => this.scene?.events.emit('net_disconnected'));
  }

  // Called every frame from Game.update()
  update(delta) {
    if (!this.connected || !this.scene) return;
    this._timer += delta;
    if (this._timer >= UPDATE_MS) {
      this._timer = 0;
      this._broadcast();
    }
  }

  _broadcast() {
    const p  = this.scene.player;
    const go = p.gameObject;
    this.socket.emit('player_update', {
      x:         go.x,
      y:         go.y,
      rotation:  go.rotation,
      velocityX: go.body.velocity.x,
      velocityY: go.body.velocity.y,
      cargoIds:  p.cargoItems.map(c => c.id),
    });
  }

  // ── Game actions ──────────────────────────────────────────────────────────

  requestPickup(missionId)   { this.socket.emit('pickup_request',  { missionId }); }
  requestDeliver(missionId)  { this.socket.emit('deliver_request', { missionId }); }
  reportCargoLost(missionId) { this.socket.emit('cargo_lost',      { missionId }); }

  sendIntegrity(cargoId, integrity) {
    this.socket.emit('cargo_integrity', { cargoId, integrity });
  }

  disconnect() {
    if (this.socket) this.socket.disconnect();
    this.connected = false;
  }
}
