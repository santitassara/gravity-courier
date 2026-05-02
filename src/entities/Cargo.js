const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const CARGO_TYPES = {
  box:    { label: 'BOX',    color: 0x8899ff, mass: 0.50, w: 24, h: 20, dmgMin: 2.5, dmgMult: 4 },
  pizza:  { label: 'PIZZA',  color: 0xff7722, mass: 0.30, w: 28, h: 10, dmgMin: 1.5, dmgMult: 9 },
  nitro:  { label: 'NITRO',  color: 0xff2200, mass: 0.90, w: 18, h: 28, dmgMin: 2.5, dmgMult: 6, explodeAt: 7 },
  magnet: { label: 'MAGNET', color: 0x00aaff, mass: 0.60, w: 22, h: 22, dmgMin: 2.5, dmgMult: 3 },
  liquid: { label: 'LIQUID', color: 0x00ffcc, mass: 0.75, w: 30, h: 24, dmgMin: 2.0, dmgMult: 5 },
};

// box appears 3× to make it the most common drop
export const CARGO_TYPE_KEYS = ['box', 'box', 'box', 'pizza', 'nitro', 'magnet', 'liquid'];

export default class Cargo {
  constructor(scene, x, y, id, type = 'box') {
    this.scene      = scene;
    this.id         = id;
    this.type       = type;
    this.cfg        = CARGO_TYPES[type] ?? CARGO_TYPES.box;
    this.integrity  = 100;
    this.constraint = null;
    this.isPickedUp = false;
    this._slosh     = 0;
    this._sloshV    = 0;

    this.gameObject = scene.matter.add.image(x, y, 'cargo');
    this.gameObject.setRectangle(this.cfg.w, this.cfg.h);
    this.gameObject.setMass(this.cfg.mass);
    this.gameObject.setFrictionAir(0.02);
    this.gameObject.setDepth(1);
    this.gameObject.setTint(this.cfg.color);
    this.gameObject.body.label = 'cargo';
    this.gameObject.setStatic(true);

    this._bar = scene.add.graphics().setDepth(4);
    this._typeLabel = scene.add.text(x, y - 22, this.cfg.label, {
      fontSize: '9px',
      color: '#' + this.cfg.color.toString(16).padStart(6, '0'),
      fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5).setDepth(4);

    this._redrawBar();
  }

  _redrawBar() {
    this._bar.clear();
    const ratio = this.integrity / 100;
    const color = ratio > 0.5 ? 0x00ee44 : ratio > 0.25 ? 0xffaa00 : 0xff2200;
    this._bar.fillStyle(color, 0.9);
    this._bar.fillRect(-13, -18, 26 * ratio, 3);
  }

  onImpact(relativeSpeed) {
    if (relativeSpeed < this.cfg.dmgMin) return;
    // Nitro explodes instantly above threshold
    if (this.type === 'nitro' && relativeSpeed >= (this.cfg.explodeAt ?? 7)) {
      this.scene.events.emit('cargo_exploded', this);
      return;
    }
    const damage = Math.min(relativeSpeed * this.cfg.dmgMult, 35);
    this.integrity = Math.max(0, this.integrity - damage);
    this._redrawBar();
    this.scene.events.emit('cargo_damaged', this);
    if (this.integrity <= 0) this.scene.events.emit('cargo_destroyed', this);
  }

  // Called every frame for picked-up cargo with special physics behaviour
  updatePhysics(shipAngVel, asteroids) {
    if (this.type === 'liquid') this._updateSlosh(shipAngVel);
    if (this.type === 'magnet' && this.isPickedUp) this._applyMagnetPull(asteroids);
  }

  // Liquid: internal mass shifts with ship rotation, creating lateral inertia
  _updateSlosh(angVel) {
    this._sloshV += angVel * 0.3;
    this._sloshV *= 0.84;
    this._slosh   = clamp(this._slosh + this._sloshV, -10, 10);
    if (!this.isPickedUp || Math.abs(this._slosh) < 0.3) return;
    const angle   = this.gameObject.rotation + Math.PI / 2;
    const lateral = this._slosh * 0.0000045;
    this.gameObject.applyForce({
      x: Math.cos(angle) * lateral,
      y: Math.sin(angle) * lateral,
    });
  }

  // Magnet: attracted toward nearby asteroids
  _applyMagnetPull(asteroids) {
    const K = 0.003, RANGE_SQ = 260 * 260;
    for (const a of asteroids) {
      const dx     = a.x - this.gameObject.x;
      const dy     = a.y - this.gameObject.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > RANGE_SQ || distSq < 1) continue;
      const dist  = Math.sqrt(distSq);
      const force = K / distSq;
      this.gameObject.applyForce({ x: (dx / dist) * force, y: (dy / dist) * force });
    }
  }

  syncBar() {
    this._bar.setPosition(this.gameObject.x, this.gameObject.y);
    this._typeLabel.setPosition(this.gameObject.x, this.gameObject.y - 22);
  }

  destroy() {
    this.gameObject.destroy();
    this._bar.destroy();
    this._typeLabel.destroy();
  }

  get body() { return this.gameObject.body; }
  get x()    { return this.gameObject.x; }
  get y()    { return this.gameObject.y; }
}
