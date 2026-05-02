// Gravity scales inverse-square from each asteroid's designed surface gravity.
// At the asteroid surface: force = surfaceGravity * mass (as designed in Asteroid.js).
// At distance d: force = surfaceGravity * mass * (radius / d)^2
// This produces noticeable pull at mid-range and dominant pull near the surface,
// which is the intended "black hole" feel.

export default class GravityManager {
  constructor(scene) {
    this.scene = scene;
  }

  update(player, cargoItems, asteroids) {
    this._applyToBody(player.gameObject, asteroids);
    // Cargo follows via constraints; only the player receives gravitational pull.
  }

  _applyToBody(body, asteroids) {
    for (const asteroid of asteroids) {
      const dx = asteroid.x - body.x;
      const dy = asteroid.y - body.y;
      const distSq = dx * dx + dy * dy;
      const dist   = Math.sqrt(distSq);

      if (dist >= asteroid.gravRadius || dist < 1) continue;

      // Inverse-square from surface: F = surfaceGravity * m * (radius / dist)^2
      const ratio    = asteroid.radius / dist;
      const forceMag = asteroid.surfaceGravity * body.body.mass * ratio * ratio;

      body.applyForce({
        x: (dx / dist) * forceMag,
        y: (dy / dist) * forceMag,
      });
    }
  }
}
