import { WORMHOLE_COOLDOWN } from '../config/constants.js';

export default class EnvironmentManager {
  constructor(scene) {
    this.scene     = scene;
    this._winds    = [];
    this._wormholes = [];
    this._cooldown  = 0;

    this._buildWindZones();
    this._buildWormholes();
  }

  _buildWindZones() {
    const defs = [
      { cx:  400, cy: -300, w: 380, h: 560, fx:  0.000055, fy:  0.000018 },
      { cx: -550, cy:  220, w: 320, h: 480, fx: -0.000048, fy:  0.000022 },
    ];
    for (const d of defs) {
      const g = this.scene.add.graphics().setDepth(-1);
      g.fillStyle(0xffcc22, 0.05);
      g.fillRect(d.cx - d.w / 2, d.cy - d.h / 2, d.w, d.h);
      g.lineStyle(1, 0xffcc22, 0.2);
      g.strokeRect(d.cx - d.w / 2, d.cy - d.h / 2, d.w, d.h);
      this.scene.add.text(d.cx, d.cy - d.h / 2 - 14, '☀ SOLAR WIND', {
        fontSize: '10px', color: '#ffcc44', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(-1).setAlpha(0.55);
      this._winds.push(d);
    }
  }

  _buildWormholes() {
    const A = { x:  720, y: -650 };
    const B = { x: -750, y:  560 };
    this._wormholes = [
      this._makePortal(A.x, A.y, B, 'A'),
      this._makePortal(B.x, B.y, A, 'B'),
    ];
  }

  _makePortal(x, y, exitPos, tag) {
    // Graphics drawn at origin, graphics object positioned at (x, y)
    // so tween scaling happens around the portal centre
    const g = this.scene.add.graphics().setDepth(2).setPosition(x, y);
    g.fillStyle(0x220044, 0.45);
    g.fillCircle(0, 0, 36);
    g.lineStyle(3, 0xcc22ff, 0.9);
    g.strokeCircle(0, 0, 36);
    g.lineStyle(1.5, 0xff88ff, 0.55);
    g.strokeCircle(0, 0, 22);

    this.scene.add.text(x, y - 48, `WORMHOLE ${tag}`, {
      fontSize: '10px', color: '#dd44ff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2).setAlpha(0.85);

    this.scene.tweens.add({
      targets: g, scaleX: 1.1, scaleY: 1.1,
      duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    return { x, y, exitPos, radius: 36 };
  }

  // Apply constant wind forces to all game objects inside each zone
  applyWinds(gameObjects) {
    for (const z of this._winds) {
      const hW = z.w / 2, hH = z.h / 2;
      for (const go of gameObjects) {
        if (go.x > z.cx - hW && go.x < z.cx + hW &&
            go.y > z.cy - hH && go.y < z.cy + hH) {
          go.applyForce({ x: z.fx, y: z.fy });
        }
      }
    }
  }

  // Returns exit position if player enters a wormhole, null otherwise
  checkWormhole(player, delta) {
    if (this._cooldown > 0) { this._cooldown -= delta; return null; }
    for (const wh of this._wormholes) {
      const dx = player.x - wh.x;
      const dy = player.y - wh.y;
      if (dx * dx + dy * dy < wh.radius * wh.radius) {
        this._cooldown = WORMHOLE_COOLDOWN;
        return wh.exitPos;
      }
    }
    return null;
  }
}
