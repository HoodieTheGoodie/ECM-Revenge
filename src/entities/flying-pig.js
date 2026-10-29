import { positionHitsWall } from '../world/collision.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const EPSILON = 0.000001;

// Slams stop at walls even though the pig can fly over them.
function clearGroundPath(from, to, walls) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / 5));
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    if (positionHitsWall({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }, 1, walls)) return false;
  }
  return true;
}

export class FlyingPig {
  constructor(config = {}, world = {}) {
    this.id = config.id ?? 'flying-pig';
    this.level = config.level ?? 1;
    this.world = world;
    this.width = world.width ?? 1200;
    this.height = world.height ?? 1000;
    this.position = { x: config.x ?? this.width / 2, y: config.y ?? this.height / 2 };
    this.anchor = { x: this.width / 2, y: this.height / 2 };
    this.radius = 42;
    this.maxHealth = 350 + (this.level - 1) * 80;
    this.health = this.maxHealth;
    this.phase = 'flying';
    this.phaseTimer = 0;
    this.phaseDuration = 7.5;
    this.time = 0;
    this.shotTimer = 1.5;
    this.pendingProjectiles = [];
    this.pendingSummons = 0;
    this.defeated = false;
    this.hitFlash = 0;
    this.shotFlash = 0;
    this.targetAngle = 0;
    this.stage = 1;
    this.volleyCount = 0;
    this.aimLocked = false;
    this.phaseTransition = 0;
    this.altitude = 1;
    this.slamTarget = null;
    this.slamRadius = 130;
    this.slamWarning = 0;
    this.slamFlash = 0;
    this.slamCount = 0;
    this.flightWaypoint = 0;
    const insetX = Math.min(170, this.width * 0.2);
    const insetY = Math.min(170, this.height * 0.2);
    this.flightRoute = [
      { x: this.width - insetX, y: insetY },
      { x: this.width - insetX, y: this.height - insetY },
      { x: insetX, y: this.height - insetY },
      { x: insetX, y: insetY }
    ];
    const towerX = Math.min(120, this.width * 0.15);
    const towerY = Math.min(120, this.height * 0.15);
    const corners = [[towerX, towerY], [this.width - towerX, towerY], [towerX, this.height - towerY], [this.width - towerX, this.height - towerY]];
    this.towers = corners.map(([x, y], index) => {
      const tower = { x, y, ...config.towers?.[index] };
      return { id: `${this.id}-tower-${index}`, x: clamp(tower.x, 50, this.width - 50), y: clamp(tower.y, 50, this.height - 50), radius: 23, health: tower.health ?? 60, maxHealth: tower.health ?? 60 };
    });
  }

  update(deltaTime, player, world = this.world) {
    if (this.defeated || !Number.isFinite(deltaTime) || deltaTime <= 0) return;
    this.world = world;
    // Keep transitions and impact checks consistent when a frame takes longer.
    let remaining = deltaTime;
    while (remaining > EPSILON) {
      const step = Math.min(remaining, 1 / 30);
      this.step(step, player);
      remaining -= step;
    }
  }

  step(deltaTime, player) {
    this.time += deltaTime;
    this.phaseTimer += deltaTime;
    this.hitFlash = Math.max(0, this.hitFlash - deltaTime);
    this.shotFlash = Math.max(0, this.shotFlash - deltaTime);
    this.slamFlash = Math.max(0, this.slamFlash - deltaTime);
    this.phaseTransition = Math.max(0, this.phaseTransition - deltaTime);
    this.towers.forEach((tower) => { tower.hitFlash = Math.max(0, (tower.hitFlash ?? 0) - deltaTime); });
    const activeTowers = this.towers.filter((tower) => tower.health > 0).length;
    this.health = Math.min(this.maxHealth, this.health + activeTowers * 2 * deltaTime);

    if (this.phase === 'flying' || this.phase === 'enraged') {
      this.moveAcrossArena(deltaTime);
      this.updateVolley(deltaTime, player);
      if (this.phaseTimer + EPSILON >= this.phaseDuration) this.beginSlam(player);
    } else if (this.phase === 'dive') {
      const progress = clamp(this.phaseTimer / this.phaseDuration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      this.position.x = this.diveStart.x + (this.slamTarget.x - this.diveStart.x) * eased;
      this.position.y = this.diveStart.y + (this.slamTarget.y - this.diveStart.y) * eased;
      this.altitude = 1 + Math.sin(progress * Math.PI) * 0.3;
      this.slamWarning = 0.2;
      if (progress + EPSILON >= 1) {
        this.position = { ...this.slamTarget };
        this.setPhase('hover', 1);
        this.altitude = 1.3;
      }
    } else if (this.phase === 'hover') {
      this.slamWarning = 0.2 + 0.8 * clamp(this.phaseTimer / this.phaseDuration, 0, 1);
      if (this.phaseTimer + EPSILON >= this.phaseDuration) this.landSlam(player);
    } else if (this.phase === 'slam') {
      this.altitude = 0;
      if (this.phaseTimer + EPSILON >= this.phaseDuration) {
        this.setPhase('grounded', this.stage === 2 ? 0.8 : 1.25);
        this.pendingSummons += 2;
      }
    } else if (this.phase === 'grounded') {
      this.altitude = clamp((this.phaseTimer / this.phaseDuration - 0.6) / 0.4, 0, 1);
      if (this.phaseTimer + EPSILON >= this.phaseDuration) {
        this.setPhase(this.stage === 2 ? 'enraged' : 'flying', this.stage === 2 ? 5.5 : 7.5);
        this.altitude = 1;
        this.slamTarget = null;
        this.slamWarning = 0;
        this.shotTimer = 1.2;
        this.aimLocked = false;
      }
    }
  }

  setPhase(phase, duration) {
    this.phase = phase;
    this.phaseTimer = 0;
    this.phaseDuration = duration;
  }

  moveAcrossArena(deltaTime) {
    const target = this.flightRoute[this.flightWaypoint];
    const dx = target.x - this.position.x;
    const dy = target.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    const travel = (this.stage === 2 ? 250 : 190) * deltaTime;
    if (distance <= travel) {
      this.position = { ...target };
      this.flightWaypoint = (this.flightWaypoint + 1) % this.flightRoute.length;
    } else {
      this.position.x += dx / distance * travel;
      this.position.y += dy / distance * travel;
    }
  }

  updateVolley(deltaTime, player) {
    if (!this.aimLocked) this.targetAngle = Math.atan2(player.position.y - this.position.y, player.position.x - this.position.x);
    this.shotTimer -= deltaTime;
    if (this.shotTimer <= 0.55) this.aimLocked = true;
    if (this.shotTimer > EPSILON) return;
    const speed = (this.stage === 2 ? 315 : 250) + this.level * 8;
    this.volleyOffsets.forEach((offset) => {
      const angle = this.targetAngle + offset;
      this.pendingProjectiles.push({ x: this.position.x, y: this.position.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 9, life: 8, owner: 'enemy', kind: 'pig', damage: (this.stage === 2 ? 18 : 14) + this.level * 2, color: this.stage === 2 ? '#ffb36a' : '#ff92bc' });
    });
    this.volleyCount += 1;
    this.shotFlash = 0.18;
    this.shotTimer = this.stage === 2 ? 1.35 : 1.5;
    this.aimLocked = false;
  }

  beginSlam(player) {
    this.slamTarget = this.findLandingPoint(player.position);
    this.diveStart = { ...this.position };
    this.slamCount += 1;
    this.slamRadius = this.stage === 2 ? 155 : 130;
    const distance = Math.hypot(this.slamTarget.x - this.position.x, this.slamTarget.y - this.position.y);
    this.setPhase('dive', clamp(distance / 520, 0.45, 1.6));
    this.aimLocked = false;
    this.shotTimer = Infinity;
    this.slamWarning = 0.2;
  }

  findLandingPoint(point) {
    const margin = Math.min(85, this.width / 4, this.height / 4);
    const preferred = { x: clamp(point.x, margin, this.width - margin), y: clamp(point.y, margin, this.height - margin) };
    if (!positionHitsWall(preferred, this.radius, this.world.walls ?? [])) return preferred;
    for (let radius = 40; radius <= 320; radius += 40) {
      for (let index = 0; index < 16; index += 1) {
        const angle = index / 16 * Math.PI * 2;
        const candidate = { x: clamp(preferred.x + Math.cos(angle) * radius, margin, this.width - margin), y: clamp(preferred.y + Math.sin(angle) * radius, margin, this.height - margin) };
        if (!positionHitsWall(candidate, this.radius, this.world.walls ?? [])) return candidate;
      }
    }
    return preferred;
  }

  landSlam(player) {
    this.setPhase('slam', 0.3);
    this.altitude = 0;
    this.slamWarning = 0;
    this.slamFlash = 0.5;
    const attack = { kind: 'slam', attacker: this, origin: { ...this.slamTarget }, range: this.slamRadius, arc: Math.PI, parryable: false, dodgeable: true, attackId: `${this.id}-slam-${this.slamCount}` };
    const walls = this.world.walls ?? [];
    const clearPath = clearGroundPath(this.slamTarget, player.position, walls);
    // Observe an avoided impact too, so a precisely timed dash can earn evasion.
    if (clearPath) player.observeAttack?.(attack);
    if (clearPath && Math.hypot(player.position.x - this.slamTarget.x, player.position.y - this.slamTarget.y) <= this.slamRadius + (player.radius ?? 14)) {
      player.takeDamage((this.stage === 2 ? 34 : 26) + this.level * 2, attack);
    }
  }

  get volleyOffsets() {
    if (this.stage !== 2) return [0];
    return this.volleyCount % 2 ? [-0.56, -0.28, 0, 0.28, 0.56] : [-0.28, 0, 0.28];
  }

  enterSecondPhase() {
    if (this.stage === 2) return;
    this.stage = 2;
    this.setPhase('enraged', 5.5);
    this.phaseTransition = 1.2;
    this.shotTimer = 1.2;
    this.aimLocked = false;
    this.altitude = 1;
    this.slamTarget = null;
    this.slamWarning = 0;
    this.pendingSummons += 2;
  }

  hitTower(tower, damage) {
    if (tower.health <= 0 || this.defeated) return false;
    tower.health = Math.max(0, tower.health - damage);
    tower.hitFlash = 0.18;
    if (this.towers.every((entry) => entry.health <= 0)) this.enterSecondPhase();
    return true;
  }

  hitReflected(damage) {
    if (this.defeated || this.towers.some((tower) => tower.health > 0)) return false;
    this.health = Math.max(0, this.health - damage);
    this.hitFlash = 0.16;
    this.defeated = this.health <= 0;
    return true;
  }
}
