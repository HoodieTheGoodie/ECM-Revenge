import { positionHitsWall } from '../world/collision.js';
import { findPath } from '../world/pathfinding.js';

function angleDifference(first, second) {
  return Math.atan2(Math.sin(first - second), Math.cos(first - second));
}

function hasLineOfSight(from, to, world) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.ceil(distance / 18);
  for (let index = 1; index < steps; index += 1) {
    const ratio = index / steps;
    const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    if (positionHitsWall(point, 8, world.walls)) return false;
  }
  return true;
}

export class Chaser {
  constructor(config) {
    this.position = { x: config.x, y: config.y };
    this.id = config.id;
    this.level = config.level ?? 1;
    this.radius = 17;
    this.maxHealth = 50 + (this.level - 1) * 25;
    this.health = this.maxHealth;
    this.walkSpeed = 155;
    this.chaseSpeed = 315;
    this.facing = config.facing ?? Math.PI;
    this.state = 'roaming';
    this.stateTimer = 0;
    this.alertTimer = 0;
    this.attackCooldown = 0;
    this.jumpCooldown = 0;
    this.spinCooldown = 2.5;
    this.spinDirection = 0;
    this.spinHitApplied = false;
    this.stunTimer = 0;
    this.roamTimer = 1.5;
    this.pathTimer = 0;
    this.path = [];
    this.pathTarget = null;
    this.actionRecovery = 0;
    this.jumpTelegraph = 0;
    this.jumpAngle = 0;
  }

  update(deltaTime, player, world) {
    if (this.health <= 0) return;
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - deltaTime);
    this.spinCooldown = Math.max(0, this.spinCooldown - deltaTime);
    this.pathTimer = Math.max(0, this.pathTimer - deltaTime);
    this.actionRecovery = Math.max(0, this.actionRecovery - deltaTime);
    if (this.jumpTelegraph > 0) {
      this.jumpTelegraph -= deltaTime;
      if (this.jumpTelegraph <= 0) this.moveToward(this.jumpAngle, 92, world, true);
      return;
    }
    if (this.actionRecovery > 0) return;
    if (this.stunTimer > 0) {
      this.stunTimer -= deltaTime;
      return;
    }
    const distanceX = player.position.x - this.position.x;
    const distanceY = player.position.y - this.position.y;
    const distance = Math.hypot(distanceX, distanceY) || 1;
    const targetAngle = Math.atan2(distanceY, distanceX);
    const seesPlayer = distance < 280 && Math.abs(angleDifference(targetAngle, this.facing)) < 0.28 && (hasLineOfSight(this.position, player.position, world) || (player.isSprinting && distance < 140));
    if (seesPlayer) this.alertTimer = 3;
    else this.alertTimer = Math.max(0, this.alertTimer - deltaTime);

    if (this.state === 'attacking') {
      this.stateTimer += deltaTime;
      if (this.stateTimer > 0.18 && this.stateTimer < 0.24 && !this.spinHitApplied && distance < 62) {
        player.takeDamage(10 + (this.level - 1) * 3);
        this.spinHitApplied = true;
      }
      if (this.stateTimer >= 0.45) this.state = 'chasing';
      if (this.stateTimer >= 0.45) this.actionRecovery = 1.5;
      return;
    }
    if (this.state === 'spinning') {
      this.stateTimer += deltaTime;
      this.position.x += Math.cos(this.spinDirection) * (160 + this.stateTimer * 380) * deltaTime;
      this.position.y += Math.sin(this.spinDirection) * (160 + this.stateTimer * 380) * deltaTime;
      this.position.x = Math.max(this.radius, Math.min(world.width - this.radius, this.position.x));
      this.position.y = Math.max(this.radius, Math.min(world.height - this.radius, this.position.y));
      if (positionHitsWall(this.position, this.radius, world.walls, world.openings)) {
        this.state = 'stunned';
        this.stunTimer = 1.4;
        this.stateTimer = 0;
        return;
      }
      if (this.stateTimer > 1.1) { this.state = 'chasing'; this.actionRecovery = 1.5; }
      if (this.stateTimer > 0.25 && !this.spinHitApplied && distance < 42) {
        player.takeDamage(30 + (this.level - 1) * 8);
        this.spinHitApplied = true;
      }
      return;
    }

    if (this.alertTimer > 0) {
      this.facing = targetAngle;
      if (distance < 62 && this.attackCooldown === 0) {
        this.state = 'attacking';
        this.stateTimer = 0;
        this.spinHitApplied = false;
        this.attackCooldown = 1.45;
        return;
      }
      if (distance < 180 && this.spinCooldown === 0) {
        this.state = 'spinning';
        this.stateTimer = 0;
        this.spinDirection = targetAngle;
        this.spinCooldown = 5;
        this.attackCooldown = 1.5;
        this.spinHitApplied = false;
        return;
      }
      if (this.pathTimer === 0 || !this.pathTarget || Math.hypot(this.pathTarget.x - player.position.x, this.pathTarget.y - player.position.y) > (world.gridSize ?? 100) * 0.75) {
        this.path = findPath(this.position, player.position, world);
        this.pathTarget = { ...player.position };
        this.pathTimer = 0.25;
      }
      const waypoint = this.path[0];
      if (waypoint && Math.hypot(waypoint.x - this.position.x, waypoint.y - this.position.y) < 24) this.path.shift();
      const chaseTarget = this.path[0] ?? player.position;
      this.moveToward(Math.atan2(chaseTarget.y - this.position.y, chaseTarget.x - this.position.x), this.chaseSpeed * deltaTime, world);
      return;
    }

    this.roamTimer -= deltaTime;
    if (this.roamTimer <= 0) {
      this.facing += (Math.random() - 0.5) * 1.8;
      this.roamTimer = 1.2 + Math.random() * 2;
    }
    this.moveToward(this.facing, this.walkSpeed * deltaTime, world);
  }

  moveToward(angle, distance, world, isJump = false) {
    const candidates = [angle, angle + 0.7, angle - 0.7, angle + Math.PI];
    for (const candidate of candidates) {
      const next = {
        x: Math.max(this.radius, Math.min(world.width - this.radius, this.position.x + Math.cos(candidate) * distance)),
        y: Math.max(this.radius, Math.min(world.height - this.radius, this.position.y + Math.sin(candidate) * distance))
      };
      if (!positionHitsWall(next, this.radius, world.walls, world.openings)) {
        this.position = next;
        this.facing = candidate;
        if (isJump) this.actionRecovery = 1.5;
        return;
      }
    }
    if (this.jumpCooldown === 0 && !isJump) {
      const jump = {
        x: Math.max(this.radius, Math.min(world.width - this.radius, this.position.x + Math.cos(angle) * 92)),
        y: Math.max(this.radius, Math.min(world.height - this.radius, this.position.y + Math.sin(angle) * 92))
      };
      if (!positionHitsWall(jump, this.radius, world.walls, world.openings)) {
        this.position = jump;
        this.jumpCooldown = 5;
        this.jumpAngle = angle;
        this.jumpTelegraph = 2;
        return;
      }
    }
    this.facing += Math.PI * 0.65;
  }

  takeDamage(amount, sneakAttack = false) {
    const damage = (this.state === 'stunned' ? amount * 2 : amount) * (sneakAttack ? 3 : 1);
    this.health -= damage;
    return this.health <= 0;
  }

  alertFromHit() {
    this.alertTimer = 3;
    this.state = 'chasing';
  }

  get isStunned() {
    return this.stunTimer > 0;
  }

  serialize() {
    return { position: { ...this.position }, health: this.health, state: this.state, alertTimer: this.alertTimer, facing: this.facing };
  }

  restore(data) {
    if (!data) return;
    this.position = { ...this.position, ...data.position };
    this.health = data.health ?? this.health;
    this.state = data.state ?? this.state;
    this.alertTimer = data.alertTimer ?? this.alertTimer;
    this.facing = data.facing ?? this.facing;
  }
}