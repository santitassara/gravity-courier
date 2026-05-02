import Phaser from 'phaser';
import Player        from '../entities/Player.js';
import Asteroid      from '../entities/Asteroid.js';
import Debris        from '../entities/Debris.js';
import RemotePlayer  from '../entities/RemotePlayer.js';
import GravityManager     from '../managers/GravityManager.js';
import DeliverySystem     from '../managers/DeliverySystem.js';
import EnvironmentManager from '../managers/EnvironmentManager.js';
import NetworkManager     from '../managers/NetworkManager.js';
import {
  ZOOM_MAX, ZOOM_MIN, ZOOM_LERP, ZOOM_INITIAL, SPEED_ZOOM_MAX,
  SLINGSHOT_ZONE, SLINGSHOT_MIN_V,
  BLAST_R, BLAST_F, BLAST_CARGO_DMG,
} from '../config/constants.js';

const ASTEROID_CONFIGS = [
  { x:    0, y:    0, size: 'lg', gravRadius: 310 },
  { x:  620, y: -380, size: 'md', gravRadius: 230 },
  { x: -680, y:  370, size: 'md', gravRadius: 230 },
  { x:  280, y:  740, size: 'sm', gravRadius: 160 },
  { x: -390, y: -650, size: 'sm', gravRadius: 160 },
  { x:  940, y:  210, size: 'md', gravRadius: 230 },
  { x: -880, y: -230, size: 'sm', gravRadius: 160 },
  { x:  180, y: -920, size: 'lg', gravRadius: 290 },
];

const DEBRIS_CONFIGS = [
  [0, 115,  0.55], [0, 128, -0.42], [0, 142,  0.37],
  [1,  88,  0.65], [1, 102, -0.58],
  [2,  92, -0.52], [2, 107,  0.46],
  [5,  96,  0.61], [5, 112, -0.44],
  [7, 118,  0.50], [7, 132, -0.35],
];


export default class Game extends Phaser.Scene {
  constructor() {
    super({ key: 'Game' });
  }

  async create() {
    this._buildStarfield();
    this._buildAsteroids();
    this._buildDebris();
    this._buildPlayer();

    this.gravityManager = new GravityManager(this);
    this.deliverySystem = new DeliverySystem(this);
    this.envManager     = new EnvironmentManager(this);

    // NetworkManager is a singleton stored in the Phaser registry so it survives
    // scene restarts (crash → retry) without opening a new socket connection.
    let net = this.game.registry.get('networkManager');
    if (!net) {
      net = new NetworkManager();
      this.game.registry.set('networkManager', net);
    }
    net.setScene(this);          // always point to the current scene instance
    this.networkManager = net;

    this._remotePlayers   = new Map(); // socketId → RemotePlayer
    this._slingshotState  = this.asteroids.map(() => ({ inZone: false, peakV: 0 }));
    this._justHitAsteroid = false;
    this._playerDead      = false;
    this._targetZoom      = ZOOM_INITIAL;
    this._isMultiplayer   = false;

    this.cameras.main.startFollow(this.player.gameObject, false, 0.07, 0.07);
    this.cameras.main.setZoom(ZOOM_INITIAL);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.mobileInput = { thrust: false, left: false, right: false };
    this.events.on('mobile_thrust', v => { this.mobileInput.thrust = v; });
    this.events.on('mobile_left',   v => { this.mobileInput.left   = v; });
    this.events.on('mobile_right',  v => { this.mobileInput.right  = v; });
    this.events.on('mobile_action', () => this.player.tryPickupOrDrop(this.deliverySystem));

    this.matter.world.on('collisionstart', this._onCollision, this);

    this.input.keyboard.on('keydown-SPACE', () => {
      this.player.tryPickupOrDrop(this.deliverySystem);
    });

    this.events.on('cargo_damaged',   this._onCargoDamaged,  this);
    this.events.on('cargo_exploded',  this._onCargoExploded, this);
    this.events.on('cargo_destroyed', this._onCargoDestroyed, this);

    this._registerNetworkEvents();
    this.scene.launch('UI', { gameScene: this });

    if (net.connected) {
      // Scene restarted after crash — same socket, same identity.
      // Release held cargo server-side and get a fresh state snapshot.
      this._isMultiplayer = true;
      net.requestRejoin();
    } else {
      // First launch — open the socket with the stable identity from Menu.
      const userId      = this.game.registry.get('playerId')    ?? 'anon';
      const displayName = this.game.registry.get('playerName')  ?? 'Pilot';
      this._isMultiplayer = await net.connect(userId, displayName);
      if (!this._isMultiplayer) this.deliverySystem.startMission();
    }
  }

  // ── Network event registration ────────────────────────────────────────────────

  _registerNetworkEvents() {
    // Initial world state — fires both on first connect and after rejoin
    this.events.on('net_game_state', (data) => {
      // Restore accumulated score (server tracks it across restarts)
      if (data.myScore != null) this.deliverySystem.score = data.myScore;

      for (const p of data.players) this._addRemotePlayer(p);

      for (const m of data.missions) {
        if (m.pickedBy === null) this.deliverySystem.addNetworkMission(m);
        // Missions already picked by others stay invisible until cargo_released
      }
    });

    this.events.on('net_player_joined', (data) => {
      this._addRemotePlayer(data);
    });

    this.events.on('net_player_left', ({ id }) => {
      const rp = this._remotePlayers.get(id);
      if (rp) { rp.destroy(); this._remotePlayers.delete(id); }
    });

    this.events.on('net_player_update', (data) => {
      const rp = this._remotePlayers.get(data.id);
      if (rp) rp.applyUpdate(data);
    });

    this.events.on('net_mission_started', (data) => {
      this.deliverySystem.addNetworkMission(data);
    });

    this.events.on('net_pickup_granted', ({ missionId, cargoId, playerId }) => {
      this.deliverySystem.onPickupGranted(missionId, cargoId, playerId);
    });

    this.events.on('net_pickup_denied', () => {
      this.deliverySystem.onPickupDenied();
    });

    this.events.on('net_mission_completed', (data) => {
      this.deliverySystem.onMissionCompleted(data);
    });

    this.events.on('net_mission_failed', ({ missionId }) => {
      this.deliverySystem.onMissionFailed(missionId);
    });

    this.events.on('net_cargo_released', (data) => {
      this.deliverySystem.onCargoReleased(data);
    });

    this.events.on('net_disconnected', () => {
      this._showNetStatus('OFFLINE — SOLO MODE');
    });
  }

  _addRemotePlayer(data) {
    if (this._remotePlayers.has(data.id)) return;
    const rp = new RemotePlayer(this, data);
    this._remotePlayers.set(data.id, rp);
  }

  _showNetStatus(msg) {
    const { width } = this.scale;
    const t = this.add.text(width / 2, 24, msg, {
      fontSize: '11px', color: '#ff4444', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10);
    this.time.delayedCall(3000, () => t.destroy());
  }

  // ── Collision handling ────────────────────────────────────────────────────────

  _onCollision(event) {
    this._justHitAsteroid = false;
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      const relSpeed = Math.hypot(
        bodyA.velocity.x - bodyB.velocity.x,
        bodyA.velocity.y - bodyB.velocity.y
      );

      if ((bodyA.label === 'asteroid' || bodyB.label === 'asteroid') &&
          (bodyA.label === 'player'   || bodyB.label === 'player')) {
        this._justHitAsteroid = true;
        if (relSpeed > 1.5) this._onPlayerDied();
      }

      for (const cargo of [...this.player.cargoItems]) {
        if (cargo.body === bodyA || cargo.body === bodyB) {
          cargo.onImpact(relSpeed);
          // Let server know about integrity change
          if (this._isMultiplayer) {
            this.networkManager.sendIntegrity(cargo.id, cargo.integrity);
          }
        }
      }

      const lbls = [bodyA.label, bodyB.label];
      if (lbls.includes('player') && lbls.includes('debris') && relSpeed > 1.5) {
        this.cameras.main.shake(120, 0.007);
        for (const cargo of [...this.player.cargoItems]) {
          cargo.onImpact(relSpeed * 0.6);
        }
      }
    }
  }

  // ── Cargo event handlers ──────────────────────────────────────────────────────

  _onCargoDamaged(cargo) {
    this._spawnSparks(cargo.x, cargo.y, 0xff6600, 10);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
  }

  _onCargoExploded(cargo) {
    const affectedGOs = [
      this.player.gameObject,
      ...this.player.cargoItems.filter(c => c !== cargo).map(c => c.gameObject),
    ];
    for (const go of affectedGOs) {
      const dx   = go.x - cargo.x;
      const dy   = go.y - cargo.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < BLAST_R && dist > 0) {
        const f = BLAST_F * (1 - dist / BLAST_R);
        go.applyForce({ x: (dx / dist) * f, y: (dy / dist) * f });
      }
    }
    for (const c of [...this.player.cargoItems].filter(c => c !== cargo)) c.onImpact(BLAST_CARGO_DMG);

    const record = this.deliverySystem.missions.find(r => r.cargo === cargo);
    if (record) {
      if (this._isMultiplayer) {
        this.networkManager.reportCargoLost(record.missionId);
        // onMissionFailed will clean up when server echoes back
      } else {
        this.deliverySystem.removeMission(record);
      }
    }

    this.player.detach(cargo);
    this._spawnSparks(cargo.x, cargo.y, 0xff2200, 24);
    this._spawnSparks(cargo.x, cargo.y, 0xffaa00, 14);
    this.cameras.main.shake(300, 0.022);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([50, 30, 80]);

    if (!this._isMultiplayer) {
      cargo.destroy();
      this.events.emit('cargo_lost');
    }
  }

  _onCargoDestroyed(cargo) {
    this._spawnSparks(cargo.x, cargo.y, 0xff4400, 12);
    this.cameras.main.shake(180, 0.014);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 20, 50]);

    const record = this.deliverySystem.missions.find(r => r.cargo === cargo);
    if (record) {
      this.player.detach(cargo);
      if (this._isMultiplayer) {
        this.networkManager.reportCargoLost(record.missionId);
      } else {
        this.deliverySystem.removeMission(record);
        cargo.destroy();
        this.events.emit('cargo_lost');
      }
    }
  }

  _onPlayerDied() {
    if (this._playerDead) return;
    this._playerDead = true;

    const { x, y } = this.player;
    this._spawnSparks(x, y, 0xffffff, 20);
    this._spawnSparks(x, y, 0xff3300, 32);
    this._spawnSparks(x, y, 0xffbb00, 18);

    this.cameras.main.flash(120, 255, 80, 0);
    this.cameras.main.shake(550, 0.045);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([80, 40, 120, 40, 80]);
    }

    this.player.gameObject.setVisible(false);
    this.player.gameObject.setVelocity(0, 0);
    this.time.delayedCall(700, () => this.events.emit('player_died'));
  }

  _spawnSparks(x, y, tint = 0xff6600, count = 12) {
    const em = this.add.particles(x, y, 'particle', {
      speed:    { min: 55, max: 165 },
      lifespan: { min: 140, max: 380 },
      scale:    { start: 0.75, end: 0 },
      alpha:    { start: 1,    end: 0 },
      tint:     [tint, 0xffffff, tint],
      blendMode: 'ADD',
      emitting:  false,
    });
    em.setDepth(6);
    em.explode(count, x, y);
    this.time.delayedCall(500, () => em.destroy());
  }

  // ── Slingshot detection ───────────────────────────────────────────────────────

  _checkSlingshot() {
    const body  = this.player.gameObject.body;
    const speed = Math.hypot(body.velocity.x, body.velocity.y);

    for (let i = 0; i < this.asteroids.length; i++) {
      const a   = this.asteroids[i];
      const s   = this._slingshotState[i];
      const dx  = this.player.x - a.x;
      const dy  = this.player.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const zone = a.gravRadius * SLINGSHOT_ZONE;

      if (dist < zone) {
        s.inZone = true;
        if (speed > s.peakV) s.peakV = speed;
      } else if (s.inZone) {
        s.inZone = false;
        if (!this._justHitAsteroid && s.peakV >= SLINGSHOT_MIN_V) {
          this.player.triggerBoost();
          this.events.emit('slingshot_boost');
        }
        s.peakV = 0;
      }
    }
  }

  // ── Dynamic camera zoom ───────────────────────────────────────────────────────

  _updateCameraZoom() {
    const speed = Math.hypot(
      this.player.gameObject.body.velocity.x,
      this.player.gameObject.body.velocity.y
    );
    const t = Math.min(speed / SPEED_ZOOM_MAX, 1);
    this._targetZoom = ZOOM_MAX - t * (ZOOM_MAX - ZOOM_MIN);
    const cur  = this.cameras.main.zoom;
    const next = cur + (this._targetZoom - cur) * ZOOM_LERP;
    this.cameras.main.setZoom(next);
  }

  // ── Wormhole teleport ─────────────────────────────────────────────────────────

  _checkWormhole(delta) {
    const exit = this.envManager.checkWormhole(this.player, delta);
    if (!exit) return;

    const dx = exit.x - this.player.x;
    const dy = exit.y - this.player.y;
    this.player.gameObject.setPosition(exit.x, exit.y);
    for (const c of this.player.cargoItems) {
      c.gameObject.setPosition(c.x + dx, c.y + dy);
    }
    const v   = this.player.gameObject.body.velocity;
    const spd = Math.hypot(v.x, v.y) * 1.4;
    const dir = Math.atan2(v.y, v.x);
    this.player.gameObject.setVelocity(Math.cos(dir) * spd, Math.sin(dir) * spd);

    this.cameras.main.flash(220, 170, 0, 255);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([40, 20, 40]);
    this.events.emit('wormhole_used');
  }

  // ── Builders ──────────────────────────────────────────────────────────────────

  _buildStarfield() {
    const g = this.add.graphics().setDepth(-10);
    for (let i = 0; i < 700; i++) {
      const x = Phaser.Math.Between(-2200, 2200);
      const y = Phaser.Math.Between(-2200, 2200);
      const a = Phaser.Math.FloatBetween(0.15, 0.9);
      const r = Phaser.Math.FloatBetween(0.5, 2.2);
      g.fillStyle(0xffffff, a);
      g.fillCircle(x, y, r);
    }
  }

  _buildAsteroids() {
    this.asteroids = ASTEROID_CONFIGS.map(
      cfg => new Asteroid(this, cfg.x, cfg.y, cfg.size, cfg.gravRadius)
    );
  }

  _buildDebris() {
    this.debrisList = DEBRIS_CONFIGS.map(([ai, extraR, speed]) => {
      const a = this.asteroids[ai];
      return new Debris(this, a.x, a.y, a.radius + extraR, speed);
    });
  }

  _buildPlayer() {
    this.player = new Player(this, 0, -450);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────────

  update(_time, delta) {
    this.player.update(this.cursors, this.wasd, this.mobileInput, delta);
    this.gravityManager.update(this.player, this.player.cargoItems, this.asteroids);

    const shipAngVel = this.player.gameObject.body.angularVelocity;
    for (const c of this.player.cargoItems) {
      c.updatePhysics(shipAngVel, this.asteroids);
    }

    const windTargets = [this.player.gameObject, ...this.player.cargoItems.map(c => c.gameObject)];
    this.envManager.applyWinds(windTargets);

    this._checkWormhole(delta);
    this._checkSlingshot();
    this._updateCameraZoom();

    for (const d of this.debrisList) d.update(delta);

    this.deliverySystem.update();

    // Network
    if (this._isMultiplayer) {
      this.networkManager.update(delta);
      for (const rp of this._remotePlayers.values()) rp.interpolate();
    }
  }
}
