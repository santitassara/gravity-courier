const SIZE_MAP = {
  sm: { diameter: 32, gravMass: 60, surfaceGravity: 0.00035 },
  md: { diameter: 56, gravMass: 120, surfaceGravity: 0.00060 },
  lg: { diameter: 88, gravMass: 220, surfaceGravity: 0.00095 },
};

export default class Asteroid {
  constructor(scene, x, y, size, gravRadius) {
    this.scene = scene;
    this.gravRadius = gravRadius;
    this.size = size;

    const cfg = SIZE_MAP[size];
    this.gravMass = cfg.gravMass;
    this.surfaceGravity = cfg.surfaceGravity;
    this.radius = cfg.diameter / 2;

    // Gravity field ring (visual only)
    const ring = scene.add.graphics();
    ring.lineStyle(1, 0x2244ff, 0.12);
    ring.strokeCircle(0, 0, gravRadius);
    ring.setPosition(x, y).setDepth(-2);

    // Static physics body
    this.gameObject = scene.matter.add.image(x, y, `asteroid_${size}`);
    this.gameObject.setCircle(this.radius - 2);
    this.gameObject.setStatic(true);
    this.gameObject.setFriction(0.8);
    this.gameObject.setDepth(0);
    // Label via Matter body property — setLabel() doesn't exist in Phaser 3
    this.gameObject.body.label = 'asteroid';

    // Landing pad indicator
    const pad = scene.add.graphics();
    pad.lineStyle(2, 0x4488ff, 0.45);
    pad.strokeCircle(0, 0, this.radius + 6);
    pad.setPosition(x, y).setDepth(1);
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }
}
