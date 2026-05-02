import Phaser from 'phaser';
import { LERP_POS, LERP_ROT } from '../config/constants.js';

const TINTS = [0xff8844, 0xff44aa, 0x44ffaa, 0xffff44, 0xaa44ff, 0x44aaff];
let _tintIndex = 0;

export default class RemotePlayer {
  constructor(scene, data) {
    this.scene = scene;
    this.id    = data.id;
    this._tint = TINTS[_tintIndex++ % TINTS.length];

    this._tx = data.x ?? 0;
    this._ty = data.y ?? 0;
    this._tr = data.rotation ?? 0;

    this.sprite = scene.add.image(this._tx, this._ty, 'player')
      .setTint(this._tint)
      .setDepth(2)
      .setAlpha(0.85);

    const shortId = data.id.slice(0, 4).toUpperCase();
    this._label = scene.add.text(this._tx, this._ty - 28, shortId, {
      fontSize:   '9px',
      color:      '#' + this._tint.toString(16).padStart(6, '0'),
      fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(4);
  }

  // Called when a position packet arrives from the server
  applyUpdate(data) {
    this._tx = data.x;
    this._ty = data.y;
    this._tr = data.rotation;
  }

  // Called every frame — smooth interpolation toward latest server position
  interpolate() {
    this.sprite.x        = Phaser.Math.Linear(this.sprite.x, this._tx, LERP_POS);
    this.sprite.y        = Phaser.Math.Linear(this.sprite.y, this._ty, LERP_POS);
    this.sprite.rotation = Phaser.Math.Angle.RotateTo(
      this.sprite.rotation, this._tr, LERP_ROT
    );
    this._label.setPosition(this.sprite.x, this.sprite.y - 28);
  }

  destroy() {
    this.sprite.destroy();
    this._label.destroy();
  }
}
