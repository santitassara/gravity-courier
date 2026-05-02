import Phaser from 'phaser';
import {
  THRUST, ROTATION_SPEED, MAX_CARGO, MAX_FUEL,
  FUEL_DRAIN, FUEL_REGEN, COM_TORQUE_K,
} from '../config/constants.js';

export default class Player {
  constructor(scene, x, y) {
    this.scene          = scene;
    this.cargoItems     = [];
    this._actionCooldown = 0;
    this.fuel           = MAX_FUEL;
    this._boostTimer    = 0;

    this.gameObject = scene.matter.add.image(x, y, 'player');
    this.gameObject.setCircle(13);
    this.gameObject.setMass(1);
    this.gameObject.setFrictionAir(0.008);
    this.gameObject.setDepth(2);
    this.gameObject.body.label = 'player';

    // Engine exhaust particles
    this._thruster = scene.add.particles(x, y, 'particle', {
      speed:    { min: 40,  max: 90 },
      lifespan: { min: 120, max: 280 },
      scale:    { start: 0.55, end: 0 },
      alpha:    { start: 0.9, end: 0 },
      blendMode: 'ADD',
      quantity:  2,
      emitting:  false,
    });
    this._thruster.setDepth(3);

    // Retro-thruster (braking) — fires from the nose, vapor-like spray
    this._retroThruster = scene.add.particles(x, y, 'particle', {
      speed:    { min: 30, max: 80 },
      lifespan: { min: 90,  max: 230 },
      scale:    { start: 0.38, end: 0 },
      alpha:    { start: 0.85, end: 0 },
      tint:     [0xaaddff, 0xffffff, 0xddeeff],
      blendMode: 'ADD',
      quantity:  2,
      angle:     { min: -20, max: 20 },
      emitting:  false,
    });
    this._retroThruster.setDepth(3);

    // Slingshot / gravity-boost speed trail
    this._trail = scene.add.particles(x, y, 'particle', {
      speed:    { min: 8,  max: 28 },
      lifespan: { min: 200, max: 520 },
      scale:    { start: 0.9, end: 0 },
      alpha:    { start: 0.7, end: 0 },
      tint:     [0x00ffff, 0x4488ff, 0xffffff],
      blendMode: 'ADD',
      quantity:  4,
      emitting:  false,
    });
    this._trail.setDepth(1);
  }

  update(cursors, wasd, mobileInput, delta) {
    const go    = this.gameObject;
    const angle = go.rotation;

    const wantThrust   = cursors.up.isDown   || wasd.up.isDown   || mobileInput.thrust;
    const wantReverse  = cursors.down.isDown || wasd.down.isDown;
    const rotLeft      = cursors.left.isDown  || wasd.left.isDown  || mobileInput.left;
    const rotRight     = cursors.right.isDown || wasd.right.isDown || mobileInput.right;

    const thrusting  = wantThrust  && this.fuel > 0;
    const reversing  = wantReverse && this.fuel > 0 && !thrusting;

    if (thrusting) {
      this.fuel = Math.max(0, this.fuel - FUEL_DRAIN * delta);
      const massScale = 1 / (1 + this.cargoItems.length * 0.28);
      go.applyForce({
        x:  Math.sin(angle) * THRUST * massScale,
        y: -Math.cos(angle) * THRUST * massScale,
      });
      const behind = {
        x: go.x - Math.sin(angle) * 22,
        y: go.y + Math.cos(angle) * 22,
      };
      this._thruster.setPosition(behind.x, behind.y);
      if (!this._thruster.emitting) this._thruster.start();
    } else {
      if (this._thruster.emitting) this._thruster.stop();
      if (!reversing && this.fuel < MAX_FUEL) {
        this.fuel = Math.min(MAX_FUEL, this.fuel + FUEL_REGEN * delta);
      }
    }

    if (reversing) {
      this.fuel = Math.max(0, this.fuel - FUEL_DRAIN * delta * 0.5);
      const massScale = 1 / (1 + this.cargoItems.length * 0.28);
      go.applyForce({
        x: -Math.sin(angle) * THRUST * 0.55 * massScale,
        y:  Math.cos(angle) * THRUST * 0.55 * massScale,
      });
      const nose = {
        x: go.x + Math.sin(angle) * 18,
        y: go.y - Math.cos(angle) * 18,
      };
      // Spray direction: forward cone (ship's heading in Phaser particle degrees)
      const forwardDeg = Phaser.Math.RadToDeg(angle) - 90;
      this._retroThruster.setPosition(nose.x, nose.y);
      this._retroThruster.angle = { min: forwardDeg - 22, max: forwardDeg + 22 };
      if (!this._retroThruster.emitting) this._retroThruster.start();
    } else {
      if (this._retroThruster.emitting) this._retroThruster.stop();
    }

    if (rotLeft)       go.setAngularVelocity(-ROTATION_SPEED);
    else if (rotRight) go.setAngularVelocity(ROTATION_SPEED);

    // Gravity-boost speed trail
    if (this._boostTimer > 0) {
      this._boostTimer -= delta;
      this._trail.setPosition(go.x, go.y);
      if (!this._trail.emitting) this._trail.start();
    } else if (this._trail.emitting) {
      this._trail.stop();
    }

    // Carried cargo shifts the ship's centre of mass → applies a destabilising torque
    this._applyCOMTorque();

    if (this._actionCooldown > 0) this._actionCooldown -= delta;
  }

  // Multiply current velocity by ~1.25 and activate the speed trail
  triggerBoost() {
    const v = this.gameObject.body.velocity;
    const speed = Math.hypot(v.x, v.y);
    if (speed < 0.005) return;
    this.gameObject.setVelocity(v.x * 1.25, v.y * 1.25);
    this._boostTimer = 1500;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(60);
  }

  // Cargo swinging to one side shifts the CoM laterally → applies torque to ship
  _applyCOMTorque() {
    if (this.cargoItems.length === 0) return;
    const angle = this.gameObject.rotation;
    const cos   = Math.cos(-angle);
    const sin   = Math.sin(-angle);
    let totalMass = 0, weightedLateral = 0;
    for (const c of this.cargoItems) {
      const dx  = c.x - this.x;
      const dy  = c.y - this.y;
      const lx  = dx * cos - dy * sin; // ship-local lateral offset
      const m   = c.gameObject.body.mass;
      weightedLateral += lx * m;
      totalMass       += m;
    }
    if (totalMass > 0) {
      this.gameObject.body.torque += (weightedLateral / totalMass) * COM_TORQUE_K;
    }
  }

  tryPickupOrDrop(deliverySystem) {
    if (this._actionCooldown > 0) return;
    if (this.cargoItems.length > 0) {
      const last = this.cargoItems[this.cargoItems.length - 1];
      if (deliverySystem.tryDeliver(this, last)) {
        this._actionCooldown = 500;
        return;
      }
    }
    if (this.cargoItems.length < MAX_CARGO) {
      const cargo = deliverySystem.tryPickup(this);
      if (cargo) {
        this._attach(cargo);
        this._actionCooldown = 500;
      }
    }
  }

  _attach(cargo) {
    const anchorBody = this.cargoItems.length === 0
      ? this.gameObject.body
      : this.cargoItems[this.cargoItems.length - 1].gameObject.body;
    const anchorPointA = this.cargoItems.length === 0 ? { x: 0, y: 16 } : { x: 0, y: 12 };
    const constraint = this.scene.matter.add.constraint(
      anchorBody, cargo.gameObject.body, 40, 0.45,
      { pointA: anchorPointA, pointB: { x: 0, y: -11 }, damping: 0.06 }
    );
    cargo.constraint = constraint;
    cargo.isPickedUp = true;
    cargo.gameObject.setStatic(false);
    this.cargoItems.push(cargo);
  }

  detach(cargo) {
    if (cargo.constraint) {
      this.scene.matter.world.removeConstraint(cargo.constraint);
      cargo.constraint = null;
    }
    cargo.isPickedUp = false;
    this.cargoItems  = this.cargoItems.filter(c => c !== cargo);
    return cargo;
  }

  get fuelRatio() { return this.fuel / MAX_FUEL; }
  get x()         { return this.gameObject.x; }
  get y()         { return this.gameObject.y; }
}
