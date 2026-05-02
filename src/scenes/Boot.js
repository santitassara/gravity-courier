import Phaser from 'phaser';

export default class Boot extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  create() {
    this._createPlayerTexture();
    this._createAsteroidTexture('asteroid_sm', 32, 0x8899aa, 0x556677);
    this._createAsteroidTexture('asteroid_md', 56, 0x7788aa, 0x445566);
    this._createAsteroidTexture('asteroid_lg', 88, 0x6677aa, 0x334455);
    this._createCargoTexture();
    this._createParticleTexture();
    this._createDebrisTexture();
    this.scene.start('Menu');
  }

  _createPlayerTexture() {
    const W = 32, H = 40;
    const g = this.add.graphics();

    // Main body (cyan triangle pointing up)
    g.fillStyle(0x00ccff, 1);
    g.fillTriangle(W / 2, 2, 2, H - 8, W - 2, H - 8);

    // Cockpit
    g.fillStyle(0x003366, 1);
    g.fillCircle(W / 2, H / 2 - 4, 7);

    // Engine nacelles
    g.fillStyle(0x0077aa, 1);
    g.fillRect(2, H - 12, 8, 8);
    g.fillRect(W - 10, H - 12, 8, 8);

    // Engine glow
    g.fillStyle(0xff6600, 1);
    g.fillRect(4, H - 6, 5, 4);
    g.fillRect(W - 9, H - 6, 5, 4);

    g.generateTexture('player', W, H);
    g.destroy();
  }

  _createAsteroidTexture(key, diameter, baseColor, shadowColor) {
    const g = this.add.graphics();
    const r = diameter / 2;

    // Base rock
    g.fillStyle(baseColor, 1);
    g.fillCircle(r, r, r);

    // Shadow for depth
    g.fillStyle(shadowColor, 0.7);
    g.fillCircle(r + r * 0.15, r + r * 0.15, r * 0.75);

    // Surface highlights (craters)
    g.fillStyle(0xaabbcc, 0.3);
    g.fillCircle(r - r * 0.3, r - r * 0.3, r * 0.2);

    g.generateTexture(key, diameter, diameter);
    g.destroy();
  }

  _createCargoTexture() {
    const g = this.add.graphics();
    const W = 26, H = 22;

    // Box body
    g.fillStyle(0xdd9900, 1);
    g.fillRect(0, 0, W, H);

    // Dark inner
    g.fillStyle(0x442200, 1);
    g.fillRect(2, 2, W - 4, H - 4);

    // Cross straps
    g.fillStyle(0xdd9900, 1);
    g.fillRect(W / 2 - 2, 2, 4, H - 4);
    g.fillRect(2, H / 2 - 2, W - 4, 4);

    g.generateTexture('cargo', W, H);
    g.destroy();
  }

  _createParticleTexture() {
    const g = this.add.graphics();
    g.fillStyle(0xff8800, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('particle', 8, 8);
    g.destroy();
  }

  _createDebrisTexture() {
    const g = this.add.graphics();
    g.fillStyle(0x776655, 1);
    g.fillCircle(5, 5, 5);
    g.fillStyle(0x443322, 0.65);
    g.fillCircle(6, 6, 3);
    g.generateTexture('debris', 10, 10);
    g.destroy();
  }
}
