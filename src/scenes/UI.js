import Phaser from 'phaser';

const STAR_FULL  = '★';
const STAR_EMPTY = '☆';

export default class UI extends Phaser.Scene {
  constructor() {
    super({ key: 'UI' });
  }

  init(data) {
    this.gameScene = data.gameScene;
  }

  create() {
    const { width, height } = this.scale;
    this._isGameOver = false;

    // ── Score & cargo count ──────────────────────────────────────────────
    this.scoreText = this.add.text(18, 18, 'SCORE  0', {
      fontSize: '18px', color: '#00ffff', fontFamily: 'monospace',
    });
    this.cargoText = this.add.text(18, 44, 'CARGO  0 / 3', {
      fontSize: '15px', color: '#ffaa00', fontFamily: 'monospace',
    });

    // ── Fuel bar ─────────────────────────────────────────────────────────
    this.add.text(18, 70, 'FUEL', {
      fontSize: '12px', color: '#4488ff', fontFamily: 'monospace',
    });
    this._fuelBar = this.add.graphics();

    // ── Mission label ────────────────────────────────────────────────────
    this.missionText = this.add.text(width / 2, 18, '', {
      fontSize: '13px', color: '#aabbcc', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5, 0);

    // ── Centre notifications ─────────────────────────────────────────────
    this._notif = this.add.text(width / 2, height * 0.16, '', {
      fontSize: '22px', color: '#ffff00', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5).setAlpha(0);

    this._starText = this.add.text(width / 2, height * 0.24, '', {
      fontSize: '26px', color: '#ffdd00', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5).setAlpha(0);

    // ── Contextual popups ─────────────────────────────────────────────────
    this._slingshotText = this.add.text(width - 20, height * 0.20, '', {
      fontSize: '14px', color: '#00ffff', fontFamily: 'monospace', align: 'right',
    }).setOrigin(1, 0.5).setAlpha(0);

    this._wormholeText = this.add.text(width / 2, height * 0.30, '', {
      fontSize: '16px', color: '#cc44ff', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5).setAlpha(0);

    // ── Cargo-lost overlay ───────────────────────────────────────────────
    this._lostText = this.add.text(width / 2, height / 2 - 30, 'CARGO LOST', {
      fontSize: '30px', color: '#ff4444', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5).setAlpha(0);

    this._replayBtn = this.add.text(width / 2, height / 2 + 34, '[ RETRY MISSION ]', {
      fontSize: '22px', color: '#ffffff', fontFamily: 'monospace',
      backgroundColor: '#330000', padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setAlpha(0).setInteractive({ useHandCursor: true });
    this._replayBtn.on('pointerdown', () => this._onRestart());
    this._replayBtn.on('pointerover', () => this._replayBtn.setColor('#ff8888'));
    this._replayBtn.on('pointerout',  () => this._replayBtn.setColor('#ffffff'));

    this._retryHint = this.add.text(width / 2, height / 2 + 88, 'or press  R', {
      fontSize: '13px', color: '#664444', fontFamily: 'monospace',
    }).setOrigin(0.5).setAlpha(0);

    // ── Bottom hint ───────────────────────────────────────────────────────
    this.add.text(18, height - 28, 'W/↑ Thrust   A/D/←/→ Rotate   SPACE Pick/Drop   R Restart', {
      fontSize: '11px', color: '#334455', fontFamily: 'monospace',
    });

    if (this.sys.game.device.input.touch) this._buildMobileButtons(width, height);

    // ── Game-scene event bindings ─────────────────────────────────────────
    this.gameScene.events.on('mission_started',  this._onMissionStart,  this);
    this.gameScene.events.on('cargo_picked',     this._onCargoPicked,   this);
    this.gameScene.events.on('mission_completed', this._onDelivered,    this);
    this.gameScene.events.on('cargo_damaged',    this._onDamaged,       this);
    this.gameScene.events.on('cargo_lost',       this._onCargoLost,     this);
    this.gameScene.events.on('player_died',      this._onPlayerDied,    this);
    this.gameScene.events.on('slingshot_boost',  this._onSlingshot,     this);
    this.gameScene.events.on('wormhole_used',    this._onWormhole,      this);

    this.input.keyboard.on('keydown-R', () => {
      if (this._isGameOver) this._onRestart();
    });
  }

  _buildMobileButtons(W, H) {
    const style = {
      fontSize: '26px', color: '#ffffff', fontFamily: 'monospace',
      backgroundColor: '#003366', padding: { x: 14, y: 9 }, alpha: 0.72,
    };

    const thrust = this.add.text(W - 70, H - 100, '▲', style).setOrigin(0.5).setInteractive();
    thrust.on('pointerdown', () => this.gameScene.events.emit('mobile_thrust', true));
    thrust.on('pointerup',   () => this.gameScene.events.emit('mobile_thrust', false));
    thrust.on('pointerout',  () => this.gameScene.events.emit('mobile_thrust', false));

    const left = this.add.text(70, H - 80, '◄', style).setOrigin(0.5).setInteractive();
    left.on('pointerdown', () => this.gameScene.events.emit('mobile_left', true));
    left.on('pointerup',   () => this.gameScene.events.emit('mobile_left', false));
    left.on('pointerout',  () => this.gameScene.events.emit('mobile_left', false));

    const right = this.add.text(170, H - 80, '►', style).setOrigin(0.5).setInteractive();
    right.on('pointerdown', () => this.gameScene.events.emit('mobile_right', true));
    right.on('pointerup',   () => this.gameScene.events.emit('mobile_right', false));
    right.on('pointerout',  () => this.gameScene.events.emit('mobile_right', false));

    const action = this.add.text(W - 70, H - 178, '⚡', style).setOrigin(0.5).setInteractive();
    action.on('pointerdown', () => this.gameScene.events.emit('mobile_action'));
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  _onMissionStart(mission) {
    const sizes = { sm: 'Small', md: 'Medium', lg: 'Large' };
    const a = mission.pickupAsteroid;
    const b = mission.deliverAsteroid;
    this.missionText.setText(
      `[${(mission.type ?? 'BOX').toUpperCase()}]  ${sizes[a.size] ?? 'Asteroid'} → ${sizes[b.size] ?? 'Asteroid'}`
    );
  }

  _onCargoPicked(m) {
    this._flash(`${m.cargo.cfg.label} SECURED!`, '#00ff88');
  }

  _onDelivered(data) {
    this.scoreText.setText(`SCORE  ${data.score}`);
    const stars = STAR_FULL.repeat(data.stars) + STAR_EMPTY.repeat(5 - data.stars);
    this._flash(`DELIVERED!  +${data.points} pts`, '#ffff00');
    this._flashStars(stars, data.stars);
  }

  _onDamaged(cargo) {
    if (cargo.integrity < 30) this._flash(`${cargo.cfg.label} CRITICAL!`, '#ff2222');
  }

  _onCargoLost() {
    if (this._isGameOver) return;
    this._isGameOver = true;
    this._lostText.setText('CARGO LOST').setColor('#ff4444');
    this._lostText.setAlpha(1);
    this._replayBtn.setAlpha(1);
    this._retryHint.setAlpha(1);
  }

  _onPlayerDied() {
    if (this._isGameOver) return;
    this._isGameOver = true;
    this._lostText.setText('SHIP DESTROYED').setColor('#ff2200');
    this._lostText.setAlpha(1);
    this._replayBtn.setAlpha(1);
    this._retryHint.setAlpha(1);
  }

  _onSlingshot() {
    this._slingshotText.setText('⚡ GRAVITY BOOST!').setAlpha(1);
    this.tweens.killTweensOf(this._slingshotText);
    this.tweens.add({ targets: this._slingshotText, alpha: 0, delay: 1000, duration: 600 });
  }

  _onWormhole() {
    this._wormholeText.setText('✦ WORMHOLE ✦').setAlpha(1);
    this.tweens.killTweensOf(this._wormholeText);
    this.tweens.add({ targets: this._wormholeText, alpha: 0, delay: 900, duration: 700 });
  }

  _flashStars(starsStr, count) {
    const color = count >= 4 ? '#ffdd00' : count >= 2 ? '#88aaff' : '#ff6644';
    this._starText.setText(starsStr).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this._starText);
    this.tweens.add({ targets: this._starText, alpha: 0, delay: 2400, duration: 1000 });
  }

  _flash(msg, color) {
    this._notif.setText(msg).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this._notif);
    this.tweens.add({ targets: this._notif, alpha: 0, delay: 1200, duration: 900 });
  }

  _onRestart() {
    this.scene.get('Game').scene.restart();
    this.scene.stop();
  }

  // ── Fuel bar drawing ──────────────────────────────────────────────────────

  _drawFuelBar(ratio) {
    const BAR_X = 56, BAR_Y = 70, BAR_W = 88, BAR_H = 8;
    this._fuelBar.clear();
    this._fuelBar.fillStyle(0x111122, 0.8);
    this._fuelBar.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H);
    const color = ratio > 0.5 ? 0x4488ff : ratio > 0.25 ? 0xffaa22 : 0xff2222;
    this._fuelBar.fillStyle(color, 1);
    this._fuelBar.fillRect(BAR_X, BAR_Y, BAR_W * ratio, BAR_H);
    this._fuelBar.lineStyle(1, 0x334466, 0.8);
    this._fuelBar.strokeRect(BAR_X, BAR_Y, BAR_W, BAR_H);
  }

  update() {
    if (!this.gameScene.player) return;
    const n = this.gameScene.player.cargoItems.length;
    this.cargoText.setText(`CARGO  ${n} / 3`);
    this._drawFuelBar(this.gameScene.player.fuelRatio);
  }
}
