export class Sword {
  constructor() {
    this.damage = 10;
    this.attackDuration = 0.32;
    this.cooldown = 0;
    this.swingProgress = 1;
    this.aimAngle = 0;
    this.swingAngle = 0;
  }

  update(deltaTime, aimAngle) {
    this.aimAngle = aimAngle;
    this.cooldown = Math.max(0, this.cooldown - deltaTime);
    if (this.swingProgress < 1) this.swingProgress = Math.min(1, this.swingProgress + deltaTime / this.attackDuration);
  }

  attack() {
    if (this.cooldown > 0 || this.swingProgress < 1) return false;
    this.cooldown = 0.48;
    this.swingProgress = 0;
    this.swingAngle = this.aimAngle;
    return true;
  }

  get angle() {
    const sweep = Math.sin(this.swingProgress * Math.PI / 2);
    return this.swingAngle - 1.15 + sweep * 2.3;
  }

  get isSwinging() {
    return this.swingProgress < 1;
  }
}