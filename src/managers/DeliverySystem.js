import Cargo, { CARGO_TYPE_KEYS } from '../entities/Cargo.js';
import {
  PICKUP_RANGE, DELIVERY_RANGE,
  BASE_POINTS, TIME_BONUS_WINDOW, TIME_BONUS_MULT,
  STAR_THRESHOLD_5, STAR_THRESHOLD_4, STAR_THRESHOLD_3, STAR_THRESHOLD_2,
} from '../config/constants.js';

function calcStars(integrity) {
  if (integrity >= STAR_THRESHOLD_5) return 5;
  if (integrity >= STAR_THRESHOLD_4) return 4;
  if (integrity >= STAR_THRESHOLD_3) return 3;
  if (integrity >= STAR_THRESHOLD_2) return 2;
  if (integrity >  0)                return 1;
  return 0;
}

export default class DeliverySystem {
  constructor(scene) {
    this.scene    = scene;
    this.missions = [];   // MissionRecord[]
    this.score    = 0;
    this._markers = {};

    // Solo-mode counters
    this._cargoId    = 0;

    // Network state
    this._pendingPickupMissionId = null; // waiting for pickup_granted/denied
  }

  // ── Solo mode ────────────────────────────────────────────────────────────────

  startMission() {
    const asteroids  = this.scene.asteroids;
    const pickupIdx  = Math.floor(Math.random() * asteroids.length);
    let deliverIdx;
    do { deliverIdx = Math.floor(Math.random() * asteroids.length); }
    while (deliverIdx === pickupIdx);

    const id       = ++this._cargoId;
    const type     = CARGO_TYPE_KEYS[Math.floor(Math.random() * CARGO_TYPE_KEYS.length)];
    const missionId = id; // same as cargoId in solo

    const cargo = this._spawnCargo(asteroids[pickupIdx], id, type);
    const record = this._makeRecord(missionId, id, cargo, asteroids[pickupIdx], asteroids[deliverIdx], type);
    this.missions.push(record);

    this._addMarker(`p_${missionId}`, asteroids[pickupIdx], 0x00ff88, `PICKUP [${type.toUpperCase()}]`);
    this._addMarker(`d_${missionId}`, asteroids[deliverIdx], 0xff4400, 'DELIVER');
    this.scene.events.emit('mission_started', record);
    return record;
  }

  // ── Network mode ──────────────────────────────────────────────────────────────

  // Called by Game.js when 'net_mission_started' arrives
  addNetworkMission(data) {
    const { missionId, cargoId, pickupIdx, deliverIdx, cargoType } = data;
    const asteroids = this.scene.asteroids;

    const cargo  = this._spawnCargo(asteroids[pickupIdx], cargoId, cargoType);
    const record = this._makeRecord(missionId, cargoId, cargo, asteroids[pickupIdx], asteroids[deliverIdx], cargoType);
    this.missions.push(record);

    this._addMarker(`p_${missionId}`, asteroids[pickupIdx], 0x00ff88, `PICKUP [${cargoType.toUpperCase()}]`);
    this._addMarker(`d_${missionId}`, asteroids[deliverIdx], 0xff4400, 'DELIVER');
    this.scene.events.emit('mission_started', record);
    return record;
  }

  // Called when server grants a pickup to playerId
  onPickupGranted(missionId, cargoId, playerId) {
    const net     = this.scene.networkManager;
    const record  = this._findByMission(missionId);
    if (!record) return;

    record.picked   = true;
    record.pickTime = this.scene.time.now;
    this._removeMarker(`p_${missionId}`);
    this._pendingPickupMissionId = null;

    if (net && net.myId === playerId) {
      // My request was granted — attach cargo to local player
      this.scene.player._attach(record.cargo);
      this.scene.player._actionCooldown = 500;
      this.scene.events.emit('cargo_picked', record);
    } else {
      // Another player picked it — hide from world (they carry it)
      record.cargo.gameObject.setVisible(false);
      record.cargo.gameObject.setStatic(true);
      record.cargo._bar.setVisible(false);
      record.cargo._typeLabel.setVisible(false);
    }
  }

  // Called when server rejects our pickup request (someone else was faster)
  onPickupDenied() {
    this._pendingPickupMissionId = null;
  }

  // Called when server says a mission was completed
  onMissionCompleted(data) {
    const { missionId, playerId, points, stars, integrity } = data;
    const net    = this.scene.networkManager;
    const record = this._findByMission(missionId);
    if (!record) return;

    const isMe = net && net.myId === playerId;
    if (isMe) this.score += points;

    this._removeMarker(`d_${missionId}`);
    if (record.cargo.isPickedUp) this.scene.player.detach(record.cargo);
    record.cargo.destroy();
    this.missions = this.missions.filter(m => m !== record);

    if (isMe) {
      this.scene.events.emit('mission_completed', { points, score: this.score, stars, integrity });
    } else {
      this.scene.events.emit('rival_delivered', { playerId, points, stars });
    }
  }

  // Called when server says a mission was lost (cargo destroyed)
  onMissionFailed(missionId) {
    const record = this._findByMission(missionId);
    if (!record) return;

    this._removeMarker(`p_${missionId}`);
    this._removeMarker(`d_${missionId}`);
    if (record.cargo.isPickedUp) this.scene.player.detach(record.cargo);
    record.cargo.destroy();
    this.missions = this.missions.filter(m => m !== record);
    this.scene.events.emit('cargo_lost');
  }

  // Called when a carrier disconnected and their cargo is back on the asteroid
  onCargoReleased(data) {
    const { missionId, pickupIdx } = data;
    const record = this._findByMission(missionId);
    if (!record) return;

    const ast = this.scene.asteroids[pickupIdx];
    record.picked = false;
    record.cargo.gameObject.setPosition(ast.x, ast.y - ast.radius - 14);
    record.cargo.gameObject.setVisible(true);
    record.cargo.gameObject.setStatic(true);
    record.cargo._bar.setVisible(true);
    record.cargo._typeLabel.setVisible(true);

    this._addMarker(`p_${missionId}`, ast, 0x00ff88,
      `PICKUP [${record.type.toUpperCase()}]`);
  }

  // ── Shared pickup / deliver (both modes) ─────────────────────────────────────

  tryPickup(player) {
    const net = this.scene.networkManager;

    if (net && net.connected) {
      // Network mode: prevent duplicate requests
      if (this._pendingPickupMissionId !== null) return null;
      for (const record of this.missions) {
        if (record.picked) continue;
        const dx = player.x - record.cargo.x;
        const dy = player.y - record.cargo.y;
        if (Math.sqrt(dx * dx + dy * dy) < PICKUP_RANGE) {
          this._pendingPickupMissionId = record.missionId;
          net.requestPickup(record.missionId);
          return null; // attach happens async in onPickupGranted
        }
      }
      return null;
    }

    // Solo mode — immediate pickup
    for (const record of this.missions) {
      if (record.picked) continue;
      const dx = player.x - record.cargo.x;
      const dy = player.y - record.cargo.y;
      if (Math.sqrt(dx * dx + dy * dy) < PICKUP_RANGE) {
        record.picked   = true;
        record.pickTime = this.scene.time.now;
        this._removeMarker(`p_${record.missionId}`);
        this.scene.events.emit('cargo_picked', record);
        return record.cargo;
      }
    }
    return null;
  }

  tryDeliver(player, cargo) {
    const net    = this.scene.networkManager;
    const record = this.missions.find(r => r.cargo === cargo && r.picked);
    if (!record) return false;

    const a  = record.deliverAsteroid;
    const dx = player.x - a.x;
    const dy = player.y - a.y;
    if (Math.sqrt(dx * dx + dy * dy) > DELIVERY_RANGE) return false;

    if (net && net.connected) {
      net.requestDeliver(record.missionId);
      return true; // detach happens async in onMissionCompleted
    }

    this._completeSolo(record, player);
    return true;
  }

  // ── Solo completion ───────────────────────────────────────────────────────────

  _completeSolo(record, player) {
    const elapsed        = this.scene.time.now - record.pickTime;
    const timeBonus      = Math.max(0, Math.floor((TIME_BONUS_WINDOW - elapsed) / 1000) * TIME_BONUS_MULT);
    const integrity      = record.cargo.integrity;
    const integrityBonus = Math.floor(integrity);
    const stars          = calcStars(integrity);
    const points         = BASE_POINTS + timeBonus + integrityBonus;

    this.score += points;
    this._removeMarker(`d_${record.missionId}`);
    player.detach(record.cargo);
    record.cargo.destroy();
    this.missions = this.missions.filter(r => r !== record);

    this.scene.events.emit('mission_completed', { points, score: this.score, stars, integrity });
    this.scene.time.delayedCall(1800, () => this.startMission());
  }

  // Remove a failed mission in solo mode
  removeMission(record, spawnNew = true) {
    this._removeMarker(`p_${record.missionId}`);
    this._removeMarker(`d_${record.missionId}`);
    this.missions = this.missions.filter(r => r !== record);
    if (spawnNew) this.scene.time.delayedCall(2500, () => this.startMission());
  }

  update() {
    const net = this.scene.networkManager;
    for (const record of this.missions) {
      if (!record.picked || !record.cargo.isPickedUp) continue;
      record.cargo.syncBar();
      // Carrier broadcasts integrity at low frequency
      if (net && net.connected && record.cargo.isPickedUp) {
        net.sendIntegrity(record.cargo.id, record.cargo.integrity);
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  _makeRecord(missionId, cargoId, cargo, pickupAsteroid, deliverAsteroid, type) {
    return { missionId, id: cargoId, cargo, pickupAsteroid, deliverAsteroid, picked: false, pickTime: 0, type };
  }

  _spawnCargo(asteroid, cargoId, type) {
    return new Cargo(
      this.scene,
      asteroid.x,
      asteroid.y - asteroid.radius - 14,
      cargoId,
      type
    );
  }

  _findByMission(missionId) {
    return this.missions.find(r => r.missionId === missionId) ?? null;
  }

  _addMarker(key, asteroid, color, label) {
    const g = this.scene.add.graphics().setDepth(3);
    g.lineStyle(2, color, 0.9);
    g.strokeCircle(0, 0, 52);
    g.setPosition(asteroid.x, asteroid.y);
    const txt = this.scene.add.text(asteroid.x, asteroid.y - 60, label, {
      fontSize: '11px',
      color: '#' + color.toString(16).padStart(6, '0'),
      fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5).setDepth(3);
    this.scene.tweens.add({ targets: g, alpha: 0.15, duration: 700, yoyo: true, repeat: -1 });
    this._markers[key] = { g, txt };
  }

  _removeMarker(key) {
    const m = this._markers[key];
    if (!m) return;
    m.g.destroy();
    m.txt.destroy();
    delete this._markers[key];
  }
}
