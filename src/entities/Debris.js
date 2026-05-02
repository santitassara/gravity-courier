export default class Debris {
  constructor(scene, cx, cy, orbitRadius, orbitSpeed) {
    this.scene  = scene;
    this._cx    = cx;
    this._cy    = cy;
    this._r     = orbitRadius;
    this._omega = orbitSpeed; // radians per second (negative = clockwise)
    this._angle = Math.random() * Math.PI * 2;

    const sx = cx + Math.cos(this._angle) * orbitRadius;
    const sy = cy + Math.sin(this._angle) * orbitRadius;

    this.gameObject = scene.matter.add.image(sx, sy, 'debris');
    this.gameObject.setCircle(5);
    this.gameObject.setStatic(true);
    this.gameObject.setDepth(1);
    this.gameObject.body.label = 'debris';
    this.gameObject.setScale(0.55 + Math.random() * 0.7);
  }

  update(delta) {
    this._angle += this._omega * delta / 1000;
    const x = this._cx + Math.cos(this._angle) * this._r;
    const y = this._cy + Math.sin(this._angle) * this._r;
    this.gameObject.setPosition(x, y);
  }

  destroy() {
    this.gameObject.destroy();
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }
}
