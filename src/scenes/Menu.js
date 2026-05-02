import Phaser from 'phaser';
import AuthManager from '../managers/AuthManager.js';

export default class Menu extends Phaser.Scene {
  constructor() {
    super({ key: 'Menu' });
    this._overlay = null;
  }

  async create() {
    const { width, height } = this.scale;
    this._createStarfield(width, height);

    await AuthManager.init();

    if (AuthManager.isLoggedIn()) {
      this._buildMenu(width, height);
    } else {
      this._showLoginOverlay(width, height);
    }
  }

  shutdown() {
    this._hideOverlay();
  }

  _showLoginOverlay(width, height) {
    this._overlay = document.getElementById('auth-overlay');
    this._overlay.classList.remove('hidden');

    AuthManager.renderButton(document.getElementById('google-signin-btn'));

    document.getElementById('guest-btn').onclick = () => {
      AuthManager.loginAsGuest();
    };

    AuthManager.onLogin(() => {
      this._hideOverlay();
      this._buildMenu(width, height);
    });
  }

  _hideOverlay() {
    if (this._overlay) {
      this._overlay.classList.add('hidden');
      this._overlay = null;
    }
  }

  _buildMenu(width, height) {
    const user = AuthManager.user;

    this.add.text(width / 2, height * 0.20, 'GRAVITY', {
      fontSize: `${Math.min(72, width * 0.14)}px`,
      color: '#00ffff',
      fontFamily: 'monospace',
      stroke: '#003366',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.33, 'COURIER', {
      fontSize: `${Math.min(72, width * 0.14)}px`,
      color: '#ff6600',
      fontFamily: 'monospace',
      stroke: '#330000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.47, 'Space Delivery in Zero-G', {
      fontSize: `${Math.min(20, width * 0.04)}px`,
      color: '#8899bb',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    if (user) {
      const label = AuthManager.isGuest()
        ? 'PILOT: GUEST'
        : `PILOT: ${user.name.toUpperCase()}`;
      const color = AuthManager.isGuest() ? '#aaaaaa' : '#00ff88';
      const bg    = AuthManager.isGuest() ? '#111111' : '#001a0d';
      this.add.text(width / 2, height * 0.58, label, {
        fontSize: `${Math.min(14, width * 0.028)}px`,
        color,
        fontFamily: 'monospace',
        backgroundColor: bg,
        padding: { x: 12, y: 6 },
      }).setOrigin(0.5);
    }

    const btn = this.add.text(width / 2, height * 0.70, '[ LAUNCH MISSION ]', {
      fontSize: `${Math.min(28, width * 0.055)}px`,
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#003366',
      padding: { x: 22, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#00ffff'));
    btn.on('pointerout', () => btn.setColor('#ffffff'));
    btn.on('pointerdown', () => this._launch());

    const logoutBtn = this.add.text(width / 2, height * 0.80, 'sign out', {
      fontSize: `${Math.min(12, width * 0.024)}px`,
      color: '#445566',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    logoutBtn.on('pointerover', () => logoutBtn.setColor('#ff4444'));
    logoutBtn.on('pointerout', () => logoutBtn.setColor('#445566'));
    logoutBtn.on('pointerdown', () => {
      AuthManager.logout();
      this.scene.restart();
    });

    this.add.text(width / 2, height * 0.91, 'W/A/D or Arrows · SPACE to pick/drop cargo', {
      fontSize: `${Math.min(13, width * 0.026)}px`,
      color: '#445566',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.input.keyboard.once('keydown-SPACE', () => this._launch());
    this.input.keyboard.once('keydown-ENTER', () => this._launch());
  }

  _launch() {
    // Store identity in the Phaser registry so Game scene can read it across restarts
    const stableId    = AuthManager.getStableId() ?? 'anon_' + Math.random().toString(36).slice(2, 8);
    const displayName = AuthManager.user?.name ?? 'Pilot';
    this.registry.set('playerId',    stableId);
    this.registry.set('playerName',  displayName);

    this.cameras.main.fadeOut(400, 0, 0, 17);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game'));
  }

  _createStarfield(width, height) {
    const g = this.add.graphics();
    for (let i = 0; i < 250; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const a = Phaser.Math.FloatBetween(0.2, 1.0);
      const r = Phaser.Math.FloatBetween(0.5, 2.0);
      g.fillStyle(0xffffff, a);
      g.fillCircle(x, y, r);
    }
  }
}
