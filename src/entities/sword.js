export class Sword {
  constructor() {
    this.damage = 10;
    this.attackDuration = 0.32;
    this.cooldown = 0;
    this.swingProgress = 1;
    this.aimAngle = 0;
    this.swingAngle = 0;
    this.type = 'sword';
    this.range = 105;
    this.attackSpeed = 1;
    this.specialTimer = 0;
    this.specialDuration = 0;
    this.specialAngle = 0;
    this.specialType = null;
    this.attackHand = -1;
    this.ammo = 10;
    this.maxAmmo = 10;
    this.rechargeTimer = 0;
    this.parryTimer = 0;
    this.parryAngle = 0;
  }

  configure(item) {
    this.type = item?.type === 'laser-gun' ? 'gun' : item?.type ?? 'sword';
    this.damage = item?.stats?.damage ?? 10;
    this.range = item?.stats?.range ?? ({ sword: 105, spear: 155, daggers: 65, gun: 650, scythe: 125 }[this.type] ?? 105);
    this.attackSpeed = Math.max(0.1, item?.stats?.attackSpeed ?? 1);
    this.attackDuration = ({ sword: 0.32, spear: 0.42, daggers: 0.16, gun: 0.14, scythe: 0.24 }[this.type] ?? 0.32) / this.attackSpeed;
  }

  update(deltaTime, aimAngle) {
    this.aimAngle = aimAngle;
    this.cooldown = Math.max(0, this.cooldown - deltaTime);
    this.specialTimer = Math.max(0, this.specialTimer - deltaTime);
    this.parryTimer = Math.max(0, this.parryTimer - deltaTime);
    if (this.ammo < this.maxAmmo) {
      this.rechargeTimer += deltaTime;
      while (this.rechargeTimer >= 4 && this.ammo < this.maxAmmo) {
        this.rechargeTimer -= 4;
        this.ammo += 1;
      }
    } else this.rechargeTimer = 0;
    if (this.swingProgress < 1) this.swingProgress = Math.min(1, this.swingProgress + deltaTime / this.attackDuration);
  }

  attack() {
    if (this.cooldown > 0 || this.swingProgress < 1) return false;
    if (this.type === 'gun' && this.ammo <= 0) return false;
    if (this.type === 'gun') this.ammo -= 1;
    this.cooldown = ({ sword: 0.48, spear: 0.7, daggers: 0.24, gun: 0.38, scythe: 0.34 }[this.type] ?? 0.48) / this.attackSpeed;
    this.swingProgress = 0;
    this.swingAngle = this.aimAngle;
    this.attackHand *= -1;
    return true;
  }

  beginSpecial(duration) {
    this.specialDuration = duration;
    this.specialTimer = duration;
    this.specialAngle = this.aimAngle;
    this.specialType = this.type;
  }

  beginParry(duration, angle) {
    this.parryTimer = duration;
    this.parryAngle = angle;
  }

  // Visual poses use the existing attack clocks; they never schedule damage.
  get pose() {
    const special = this.specialTimer > 0 && this.specialType === this.type;
    const active = special || this.isSwinging;
    const progress = special ? 1 - this.specialTimer / this.specialDuration : this.swingProgress;
    const aim = special ? this.specialAngle : this.isSwinging ? this.swingAngle : this.aimAngle;
    const ease = (value) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    const strike = progress < 0.36 ? ease(progress / 0.36) : 1 - ease((progress - 0.36) / 0.64);
    const pose = { angle: aim, extension: 0, recoil: 0, flash: 0, trail: 0, hand: this.attackHand, progress, special, phase: 'idle' };
    if (this.parryTimer > 0 && !active) return { ...pose, angle: this.parryAngle + 0.9, extension: 5, phase: 'parry' };
    if (!active) return pose;
    pose.phase = progress < 0.14 ? 'windup' : progress < 0.65 ? 'strike' : 'recovery';
    if (this.type === 'gun') {
      pose.recoil = Math.sin(Math.PI * Math.min(1, progress / 0.85)) * (special ? 12 : 8);
      pose.angle -= pose.recoil * 0.01;
      pose.flash = Math.max(0, 1 - progress / 0.35);
    } else if (this.type === 'spear') {
      pose.extension = special ? Math.sin(progress * Math.PI) * 24 : strike * 55 - (1 - strike) * 6;
      pose.trail = strike;
    } else if (this.type === 'daggers') {
      pose.extension = special ? 23 : strike * 24;
      pose.angle += special ? 0 : this.attackHand * (ease(progress) - 0.5) * 1.15;
      pose.trail = special ? 1 : strike;
    } else if (this.type === 'sword' && special) {
      // Coil, complete a full turn, then settle back into the aiming stance.
      pose.angle = aim - 0.6 + ease(progress / 0.82) * (Math.PI * 2 + 0.6);
      pose.trail = progress < 0.9 ? 1 : (1 - progress) * 10;
    } else {
      const sweep = this.type === 'scythe' ? 3.2 : 2.3;
      const swing = progress < 0.14 ? -0.1 * ease(progress / 0.14) : ease((progress - 0.14) / 0.66);
      pose.angle = aim - sweep / 2 + swing * sweep;
      if (progress > 0.8) pose.angle += (aim - pose.angle) * ease((progress - 0.8) / 0.2);
      pose.trail = Math.sin(progress * Math.PI);
      if (special) pose.extension = Math.sin(progress * Math.PI) * 18;
    }
    return pose;
  }

  serialize() {
    return { ammo: this.ammo, rechargeTimer: this.rechargeTimer };
  }

  restore(data) {
    this.ammo = Number.isFinite(data?.ammo) ? Math.max(0, Math.min(this.maxAmmo, Math.floor(data.ammo))) : this.maxAmmo;
    this.rechargeTimer = this.ammo < this.maxAmmo && Number.isFinite(data?.rechargeTimer) ? Math.max(0, Math.min(3.999, data.rechargeTimer)) : 0;
    this.cooldown = 0;
    this.swingProgress = 1;
    this.specialTimer = 0;
    this.parryTimer = 0;
  }

  get angle() {
    const sweep = Math.sin(this.swingProgress * Math.PI / 2);
    return this.swingAngle - 1.15 + sweep * 2.3;
  }

  get isSwinging() {
    return this.swingProgress < 1;
  }
}
