import { positionHitsWall } from '../world/collision.js';
import { findPath, hasClearPath } from '../world/pathfinding.js';

function angleDifference(first, second) {
  return Math.atan2(Math.sin(first - second), Math.cos(first - second));
}

function hasLineOfSight(from, to, world) {
  return hasClearPath(from, to, world, 0);
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
    this.chaseSpeed = 270;
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
    const weapons = ['sword', 'spear', 'gun', 'daggers'];
    this.weaponType = config.weaponType === undefined ? (Math.random() < 0.25 ? weapons[Math.floor(Math.random() * weapons.length)] : null) : config.weaponType;
    if (this.weaponType === 'laser-gun') this.weaponType = 'gun';
    const armorRoll = Math.random();
    this.armorType = config.armorType === undefined ? (armorRoll < 0.5 ? null : armorRoll < 0.75 ? 'swift-armor' : 'tanker-armor') : config.armorType;
    const speedMultiplier = this.armorType === 'swift-armor' ? 1.08 : this.armorType === 'tanker-armor' ? 0.85 : 1;
    this.walkSpeed *= speedMultiplier * (this.weaponType === 'daggers' ? 1.12 : 1);
    this.chaseSpeed *= speedMultiplier * (this.weaponType === 'daggers' ? 1.12 : 1);
    this.defense = this.armorType === 'tanker-armor' ? 0.25 : this.armorType === 'swift-armor' ? 0.08 : 0;
    this.pendingProjectiles = [];
    this.hitFlash = 0;
    this.ammo = 10;
    this.rechargeTimer = 0;
    this.shotFlash = 0;
    this.shotAngle = this.facing;
    this.shotKind = null;
    this.attackHand = -1;
    this.pendingShot = null;
    this.awareness = 0;
    this.lastSeen = null;
    this.searchTimer = 0;
    this.visionRange = config.visionRange ?? 340;
    this.visionHalfAngle = Math.PI / 3;
    this.strafeDirection = String(this.id).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 ? 1 : -1;
    this.tacticTimer = 0;
    this.attackSequence = 0;
    this.attackObserved = false;
  }

  update(deltaTime, player, world) {
    if (this.health <= 0) return;
    this.hitFlash = Math.max(0, this.hitFlash - deltaTime);
    this.shotFlash = Math.max(0, this.shotFlash - deltaTime);
    if (this.weaponType === 'gun' && this.ammo < 10) {
      this.rechargeTimer += deltaTime;
      while (this.rechargeTimer >= 4 && this.ammo < 10) {
        this.rechargeTimer -= 4;
        this.ammo += 1;
      }
    } else this.rechargeTimer = 0;
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
    if (this.stunTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - deltaTime);
      if (this.stunTimer === 0) this.state = this.alertTimer > 0 ? 'chasing' : 'roaming';
      return;
    }
    if (!['attacking', 'aiming', 'dash-windup', 'spin-windup', 'dagger-dash', 'spinning'].includes(this.state)) this.separateFromPeers(deltaTime, world);
    if (this.actionRecovery > 0) return;
    const distanceX = player.position.x - this.position.x;
    const distanceY = player.position.y - this.position.y;
    const distance = Math.hypot(distanceX, distanceY) || 1;
    const targetAngle = Math.atan2(distanceY, distanceX);
    const clearSight = hasLineOfSight(this.position, player.position, world);
    const inVision = distance < this.visionRange && (Math.abs(angleDifference(targetAngle, this.facing)) < this.visionHalfAngle || distance < 85 || this.alertTimer > 0);
    const seesPlayer = clearSight && inVision;
    const hearsPlayer = player.isSprinting && distance < 180 && clearSight;
    if (seesPlayer) {
      this.awareness = Math.min(1, this.awareness + deltaTime * (distance < 100 ? 100 : 4));
      if (this.awareness >= 1 || this.alertTimer > 0) {
        this.alertTimer = 3.5;
        this.lastSeen = { ...player.position };
        this.searchTimer = 2.2;
      }
    } else {
      this.awareness = Math.max(0, this.awareness - deltaTime * 0.55);
      this.alertTimer = Math.max(0, this.alertTimer - deltaTime);
      if (hearsPlayer) { this.lastSeen = { ...player.position }; this.searchTimer = 2.2; this.awareness = Math.max(this.awareness, 0.5); }
    }
    // Explicit scripted/hit alerts acquire their first visible target, never track through walls.
    if (this.alertTimer > 0 && clearSight) this.lastSeen = { ...player.position };

    if (this.state === 'attacking') {
      const previousTimer = this.stateTimer;
      this.stateTimer += deltaTime;
      const { range, windup, strike, duration, arc } = this.attackProfile;
      if (this.stateTimer >= windup && previousTimer < windup + strike && !this.attackObserved) {
        this.attackObserved = true;
        player.observeAttack?.({ origin: this.position, range, arc, angle: this.facing, attackId: `${this.id}:${this.attackSequence}` });
      }
      if (this.stateTimer >= windup && previousTimer < windup + strike && !this.spinHitApplied && distance < range && Math.abs(angleDifference(targetAngle, this.facing)) <= arc && hasLineOfSight(this.position, player.position, world)) {
        const weaponDamage = this.weaponType === 'spear' ? 1.5 : this.weaponType === 'daggers' ? 0.7 : 1;
        this.spinHitApplied = true;
        player.takeDamage((10 + (this.level - 1) * 3) * weaponDamage, { kind: 'melee', attacker: this, attackId: `${this.id}:${this.attackSequence}`, range: this.attackProfile.range, angle: this.facing, arc: this.attackProfile.arc });
        if (this.isStunned) return;
      }
      if (this.stateTimer >= duration) { this.state = 'chasing'; this.actionRecovery = this.weaponType === 'daggers' ? 0.3 : 0.6; }
      return;
    }
    if (this.state === 'aiming') {
      this.stateTimer += deltaTime;
      if (this.stateTimer >= 0.55) {
        this.fire(this.shotAngle, this.pendingShot);
        this.pendingShot = null;
        this.state = 'chasing';
        this.actionRecovery = this.weaponType === 'gun' ? 0.6 : 0.9;
      }
      return;
    }
    if (this.state === 'dash-windup' || this.state === 'spin-windup') {
      this.stateTimer += deltaTime;
      if (this.stateTimer >= 0.42) {
        this.state = this.state === 'dash-windup' ? 'dagger-dash' : 'spinning';
        this.stateTimer = 0;
      }
      return;
    }
    if (this.state === 'dagger-dash') {
      this.stateTimer += deltaTime;
      this.moveToward(this.spinDirection, 540 * deltaTime, world);
      player.observeAttack?.({ origin: this.position, range: 46, arc: Math.PI, angle: this.spinDirection, attackId: `${this.id}:${this.attackSequence}` });
      if (Math.hypot(player.position.x - this.position.x, player.position.y - this.position.y) < 46 && !this.spinHitApplied && hasLineOfSight(this.position, player.position, world)) {
        this.spinHitApplied = true;
        player.takeDamage(14 + this.level * 3, { kind: 'melee', attacker: this, attackId: `${this.id}:${this.attackSequence}`, range: this.attackProfile.range, angle: this.facing, arc: this.attackProfile.arc });
        if (this.isStunned) return;
      }
      if (this.stateTimer >= 0.25) { this.state = 'chasing'; this.actionRecovery = 0.65; }
      return;
    }
    if (this.state === 'spinning') {
      this.stateTimer += deltaTime;
      if (!this.moveToward(this.spinDirection, (160 + this.stateTimer * 380) * deltaTime, world)) {
        this.state = 'stunned';
        this.stunTimer = 1.4;
        this.stateTimer = 0;
        return;
      }
      if (this.stateTimer > 1.1) { this.state = 'chasing'; this.actionRecovery = 1.5; }
      if (this.stateTimer > 0.25) player.observeAttack?.({ origin: this.position, range: 42, attackId: `${this.id}:${this.attackSequence}` });
      if (this.stateTimer > 0.25 && !this.spinHitApplied && distance < 42) {
        this.spinHitApplied = true;
        player.takeDamage(30 + (this.level - 1) * 8, { kind: 'melee', attacker: this, attackId: `${this.id}:${this.attackSequence}`, range: this.attackProfile.range, angle: this.facing, arc: this.attackProfile.arc });
        if (this.isStunned) return;
      }
      return;
    }

    if (this.alertTimer > 0) {
      if (clearSight) this.facing = targetAngle;
      if (this.weaponType === 'gun' && this.ammo > 0 && distance < 450 && this.attackCooldown === 0 && hasLineOfSight(this.position, player.position, world)) {
        this.aimShot(targetAngle, this.spinCooldown === 0 ? 'explosive' : 'laser');
        if (this.spinCooldown === 0) this.spinCooldown = 6;
        this.attackCooldown = 1.7;
        return;
      }
      const attackRange = this.attackProfile.range;
      if (this.weaponType !== 'gun' && distance < attackRange * 0.92 && this.attackCooldown === 0 && clearSight) {
        this.state = 'attacking';
        this.attackSequence += 1;
        this.attackObserved = false;
        this.attackHand *= -1;
        this.stateTimer = 0;
        this.spinHitApplied = false;
        this.attackCooldown = this.weaponType === 'daggers' ? 0.7 : this.weaponType === 'spear' ? 1.8 : 1.45;
        return;
      }
      if (distance < 230 && distance > attackRange && this.spinCooldown === 0 && clearSight) {
        if (this.weaponType === 'gun') return;
        if (this.weaponType === 'spear') {
          this.aimShot(targetAngle, 'spear');
          this.spinCooldown = 5;
          return;
        }
        this.state = this.weaponType === 'daggers' ? 'dash-windup' : 'spin-windup';
        this.attackSequence += 1;
        this.attackObserved = false;
        this.stateTimer = 0;
        this.spinDirection = targetAngle;
        this.spinCooldown = 5;
        this.attackCooldown = 1.5;
        this.spinHitApplied = false;
        return;
      }
      if (clearSight) {
        const desired = this.weaponType === 'gun' ? 260 : this.weaponType === 'spear' ? 100 : this.weaponType === 'daggers' ? 42 : 53;
        this.state = 'chasing';
        if (distance < desired - 12) this.moveToward(targetAngle + Math.PI, this.walkSpeed * 0.85 * deltaTime, world);
        else if (distance < desired + 40 && this.attackCooldown > 0) {
          this.tacticTimer -= deltaTime;
          if (this.tacticTimer <= 0) { this.strafeDirection *= -1; this.tacticTimer = 1.2; }
          if (!this.moveToward(targetAngle + Math.PI / 2 * this.strafeDirection, this.walkSpeed * 0.65 * deltaTime, world)) this.strafeDirection *= -1;
        } else if (distance > desired) this.followTarget(player.position, deltaTime, world);
        this.facing = targetAngle;
      } else if (this.lastSeen) this.followTarget(this.lastSeen, deltaTime, world);
      return;
    }
    if (this.lastSeen && this.searchTimer > 0) {
      this.state = 'searching';
      if (Math.hypot(this.lastSeen.x - this.position.x, this.lastSeen.y - this.position.y) > 25) this.followTarget(this.lastSeen, deltaTime, world, this.walkSpeed);
      else { this.searchTimer = Math.max(0, this.searchTimer - deltaTime); this.facing += deltaTime * 1.8 * this.strafeDirection; }
      if (this.searchTimer === 0) { this.lastSeen = null; this.awareness = 0; }
      return;
    }
    this.state = 'roaming';
    if (this.awareness > 0 && seesPlayer) { this.facing = targetAngle; return; }

    this.roamTimer -= deltaTime;
    if (this.roamTimer <= 0) {
      this.facing += (Math.random() - 0.5) * 1.8;
      this.roamTimer = 1.2 + Math.random() * 2;
    }
    this.moveToward(this.facing, this.walkSpeed * deltaTime, world);
  }

  separateFromPeers(deltaTime, world) {
    let pushX = 0; let pushY = 0;
    for (const peer of world.enemies ?? []) {
      if (peer === this || peer.health <= 0) continue;
      const dx = this.position.x - peer.position.x;
      const dy = this.position.y - peer.position.y;
      const distance = Math.hypot(dx, dy);
      const spacing = this.radius + peer.radius + 10;
      if (distance >= spacing) continue;
      const angle = distance > 0.01 ? Math.atan2(dy, dx) : this.strafeDirection * Math.PI / 2;
      const force = (spacing - distance) / spacing;
      pushX += Math.cos(angle) * force; pushY += Math.sin(angle) * force;
    }
    const strength = Math.min(1, Math.hypot(pushX, pushY));
    if (strength > 0) {
      const facing = this.facing;
      this.moveToward(Math.atan2(pushY, pushX), strength * 110 * deltaTime, world);
      this.facing = facing;
    }
  }

  followTarget(target, deltaTime, world, speed = this.chaseSpeed) {
    if (this.pathTimer === 0 || !this.pathTarget || Math.hypot(this.pathTarget.x - target.x, this.pathTarget.y - target.y) > 35) {
      this.path = findPath(this.position, target, world, this.radius);
      this.pathTarget = { ...target };
      this.pathTimer = 0.35;
    }
    while (this.path[0] && Math.hypot(this.path[0].x - this.position.x, this.path[0].y - this.position.y) < 8) this.path.shift();
    const waypoint = this.path[0];
    if (!waypoint) return;
    const distance = Math.hypot(waypoint.x - this.position.x, waypoint.y - this.position.y);
    if (!this.moveToward(Math.atan2(waypoint.y - this.position.y, waypoint.x - this.position.x), Math.min(distance, speed * deltaTime), world)) this.pathTimer = 0;
  }

  moveToward(angle, distance, world) {
    // Sweep each step: no teleporting over thin walls and no random reverse jumps.
    const steps = Math.max(1, Math.ceil(distance / 8));
    let moved = false;
    for (let step = 0; step < steps; step += 1) {
      const next = {
        x: Math.max(this.radius, Math.min(world.width - this.radius, this.position.x + Math.cos(angle) * distance / steps)),
        y: Math.max(this.radius, Math.min(world.height - this.radius, this.position.y + Math.sin(angle) * distance / steps))
      };
      if (positionHitsWall(next, this.radius, world.walls, world.openings)) return false;
      moved ||= Math.hypot(next.x - this.position.x, next.y - this.position.y) > 0.01;
      this.position = next;
    }
    if (moved && !['attacking', 'spinning', 'dagger-dash'].includes(this.state)) this.facing = angle;
    return moved;
  }

  takeDamage(amount, sneakAttack = false) {
    if (this.state === 'dagger-dash') return false;
    const damage = (this.state === 'stunned' ? amount * 2 : amount) * (sneakAttack ? 3 : 1) * (1 - this.defense);
    this.health -= damage;
    this.hitFlash = 0.15;
    return this.health <= 0;
  }

  fire(angle, kind) {
    if (this.weaponType === 'gun') {
      if (this.ammo <= 0) return false;
      this.ammo -= 1;
    }
    const speed = kind === 'spear' ? 380 : 420;
    this.shotFlash = 0.18;
    this.shotAngle = angle;
    this.shotKind = kind;
    this.pendingProjectiles.push({ x: this.position.x + Math.cos(angle) * 24, y: this.position.y + Math.sin(angle) * 24, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: kind === 'explosive' ? 9 : 5, life: 2, owner: 'enemy', attacker: this, kind, damage: (10 + this.level * 3) * (kind === 'spear' ? 1.5 : 1), color: '#ff6578' });
    return true;
  }

  aimShot(angle, kind) {
    this.state = 'aiming';
    this.stateTimer = 0;
    this.shotAngle = angle;
    this.pendingShot = kind;
  }

  get attackProfile() {
    if (this.weaponType === 'spear') return { range: 120, windup: 0.48, strike: 0.12, duration: 0.85, arc: 0.3 };
    if (this.weaponType === 'daggers') return { range: 48, windup: 0.23, strike: 0.1, duration: 0.44, arc: 0.7 };
    return { range: 62, windup: 0.32, strike: 0.14, duration: 0.68, arc: 0.85 };
  }

  receiveParry(duration) {
    this.state = 'parried';
    this.stunTimer = duration;
    this.stateTimer = 0;
    this.spinHitApplied = true;
    this.pendingShot = null;
    this.actionRecovery = 0;
    this.alertTimer = 3;
    this.hitFlash = 0.16;
  }

  alertFromHit() {
    this.alertTimer = 3.5;
    this.awareness = 1;
    // An ordinary hit alerts the enemy without cancelling a committed attack.
    if (['roaming', 'chasing', 'searching'].includes(this.state)) this.state = 'chasing';
  }

  get isStunned() {
    return this.stunTimer > 0;
  }

  serialize() {
    return { position: { ...this.position }, health: this.health, state: this.state, alertTimer: this.alertTimer, facing: this.facing, awareness: this.awareness, lastSeen: this.lastSeen, searchTimer: this.searchTimer };
  }

  restore(data) {
    if (!data) return;
    this.position = { ...this.position, ...data.position };
    this.health = data.health ?? this.health;
    this.state = data.state ?? this.state;
    this.alertTimer = data.alertTimer ?? this.alertTimer;
    this.facing = data.facing ?? this.facing;
    this.awareness = data.awareness ?? 0;
    this.lastSeen = data.lastSeen ? { ...data.lastSeen } : null;
    this.searchTimer = data.searchTimer ?? 0;
    if (!['roaming', 'chasing', 'searching'].includes(this.state)) this.state = this.alertTimer > 0 ? 'chasing' : 'roaming';
  }
}
