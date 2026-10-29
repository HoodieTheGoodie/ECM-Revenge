import { ParticleSystem } from '../rendering/particles.js';
import { FlyingPig } from '../entities/flying-pig.js';
import { Chaser } from '../entities/chaser.js';
import { positionHitsWall } from '../world/collision.js';

function angleDifference(first, second) {
  return Math.atan2(Math.sin(first - second), Math.cos(first - second));
}

function pointSegmentDistance(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - from.x - dx * t, point.y - from.y - dy * t);
}

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.particles = new ParticleSystem();
    this.projectiles = [];
    this.boss = null;
    this.time = 0;
    this.specialCooldowns = {};
    this.trailTimer = 0;
    this.daggerDash = null;
    this.previousHealth = game.player.health;
    this.previousLevel = game.player.level;
    this.screenShake = 0;
    this.shieldTimer = 0;
    this.shieldCooldown = 0;
    this.perfectFlash = 0;
    this.parryTimer = 0;
    this.parryCooldown = 0;
    this.parryAngle = 0;
    this.riposteTimer = 0;
    this.parryFlash = 0;
    this.parryRecovery = 0;
    this.evasionFlash = 0;
    this.perfectDodgeFlash = 0;
    this.dodgedAttack = null;
    this.rewardedDash = -1;
    this.damageGuard = (amount, context) => this.guardPlayerDamage(amount, context);
    game.player.damageGuard = this.damageGuard;
    game.player.observeAttack = (context) => this.observeAttack(context);
  }

  get activeWeapon() {
    const { inventory } = this.game;
    const id = inventory.equipment.weapons[inventory.equipment.activeWeapon];
    return inventory.items.find((item) => item.id === id && item.slot === 'weapon') ?? null;
  }

  get effects() {
    const sword = this.game.sword;
    return {
      particles: this.particles.particles, projectiles: this.projectiles, boss: this.boss, time: this.time,
      shieldActive: this.shieldActive, screenShake: this.screenShake, daggerDash: this.daggerDash,
      shieldCooldown: this.shieldCooldown, shieldCooldownMax: 1.6, shieldRemaining: this.shieldTimer,
      shieldPerfect: this.shieldActive && this.shieldTimer > 0.44, perfectFlash: this.perfectFlash,
      parryActive: this.parryTimer > 0, parryAngle: this.parryAngle, parryCooldown: this.parryCooldown,
      parryCooldownMax: 0.65, parryRecovery: this.parryRecovery, parryRecoveryMax: 0.32, evasionCharges: this.game.player.evasionCharges, evasionFlash: this.evasionFlash, perfectDodgeFlash: this.perfectDodgeFlash, fogRevealRemaining: this.game.player.fogRevealRemaining, riposteTimer: this.riposteTimer, parryFlash: this.parryFlash,
      hindered: this.game.player.hinderedTimer > 0,
      specialCooldown: this.specialCooldowns[sword.type] ?? 0, specialCooldownMax: this.specialCooldownFor(sword.type),
      weaponType: sword.type, ammo: sword.ammo, maxAmmo: sword.maxAmmo, rechargeProgress: sword.ammo >= sword.maxAmmo ? 1 : sword.rechargeTimer / 4
    };
  }

  specialCooldownFor(type) {
    return ({ sword: 4, spear: 4, daggers: 3, gun: 5, scythe: 6 }[type] ?? 4) * (1 - Math.min(0.7, this.game.player.cooldownReduction ?? 0));
  }

  serialize() {
    return { specialCooldowns: { ...this.specialCooldowns }, shieldCooldown: this.shieldCooldown, parryCooldown: this.parryCooldown };
  }

  restore(data) {
    this.specialCooldowns = {};
    for (const type of ['sword', 'spear', 'daggers', 'gun', 'scythe']) {
      const remaining = data?.specialCooldowns?.[type];
      if (Number.isFinite(remaining) && remaining > 0) this.specialCooldowns[type] = Math.min(this.specialCooldownFor(type), remaining);
    }
    this.screenShake = 0;
    this.shieldCooldown = Number.isFinite(data?.shieldCooldown) ? Math.max(0, Math.min(1.6, data.shieldCooldown)) : 0;
    this.parryCooldown = Number.isFinite(data?.parryCooldown) ? Math.max(0, Math.min(0.65, data.parryCooldown)) : 0;
    this.shieldTimer = this.parryTimer = this.riposteTimer = this.perfectFlash = this.parryFlash = this.parryRecovery = 0;
    this.game.player.parryRecovery = 0;
  }

  get shieldActive() {
    return Boolean(this.game.inventory.equipment.shield && this.shieldTimer > 0);
  }

  activateShield() {
    if (!this.game.inventory.equipment.shield || this.shieldTimer > 0 || this.shieldCooldown > 0 || this.parryTimer > 0 || this.parryRecovery > 0) return false;
    this.shieldTimer = 0.6;
    this.shieldCooldown = 1.6;
    this.particles.ring(this.game.player.position.x, this.game.player.position.y, '#91f7e1', 38, 0.2);
    return true;
  }

  parry() {
    const { player, sword } = this.game;
    if (!this.activeWeapon || this.parryRecovery > 0 || this.parryCooldown > 0 || this.shieldActive || player.stamina < 18 || sword.isSwinging || sword.specialTimer > 0) return false;
    player.stamina -= 18;
    player.rechargeDelay = Math.max(player.rechargeDelay ?? 0, 0.8);
    this.parryTimer = 0.18;
    this.parryCooldown = 0.65;
    this.parryAngle = sword.aimAngle;
    sword.beginParry(this.parryTimer, this.parryAngle);
    return true;
  }

  completeParry(attacker) {
    const { player, sword } = this.game;
    attacker?.receiveParry?.(0.9);
    player.stamina = Math.min(player.maxStamina, player.stamina + 9);
    this.parryTimer = this.parryRecovery = player.parryRecovery = 0;
    this.parryFlash = 0.4;
    this.riposteTimer = 0.8;
    sword.cooldown = 0;
    sword.parryTimer = 0;
    this.particles.burst(player.position.x, player.position.y, '#ffe29a', 22, { speed: 160, shape: 'spark' });
    this.particles.ring(player.position.x, player.position.y, '#ffe29a', 48, 0.24);
    this.game.audio?.play('reflect');
  }

  observeAttack({ origin, range, arc = Math.PI, angle = 0, attackId, projectile } = {}) {
    const { player } = this.game;
    if (player.perfectDodgeWindow <= 0 || player.dashTimer <= 0 || this.rewardedDash === player.dashSequence) return false;
    const start = player.dashOrigin;
    if (!start || Math.hypot(player.position.x - start.x, player.position.y - start.y) < 4) return false;
    let threatened = false;
    if (projectile) {
      threatened = pointSegmentDistance(projectile, start, player.position) < player.radius + (projectile.radius ?? 5) && this.clearAttackPath(projectile, start);
    } else if (origin && Number.isFinite(range)) {
      const bearing = Math.atan2(start.y - origin.y, start.x - origin.x);
      threatened = Math.hypot(start.x - origin.x, start.y - origin.y) < range + player.radius && Math.abs(angleDifference(bearing, angle)) <= arc && this.clearAttackPath(origin, start);
    }
    if (!threatened) return false;
    this.rewardedDash = player.dashSequence;
    this.dodgedAttack = attackId ?? projectile;
    player.evasionCharges = 1;
    this.perfectDodgeFlash = 0.8;
    this.particles.ring(player.position.x, player.position.y, '#8ddcff', 62, 0.35);
    this.particles.burst(player.position.x, player.position.y, '#c8efff', 18, { speed: 140, shape: 'spark' });
    this.game.audio?.play('reflect');
    return true;
  }

  guardPlayerDamage(amount, context = {}) {
    const { kind, attacker, projectile, attackId } = context;
    const { player } = this.game;
    if (player.perfectDodgeWindow > 0) this.observeAttack({ ...context, projectile, origin: context.origin ?? attacker?.position, range: context.range ?? attacker?.attackProfile?.range });
    // Invulnerable contacts cannot spend a stored dodge charge or grant a parry.
    if (player.invulnerability > 0) return 0;
    if (this.parryTimer > 0 && context.parryable !== false && ['melee', 'projectile'].includes(kind)) {
      const origin = projectile ?? attacker?.position;
      if (origin) {
        const angle = Math.atan2(origin.y - player.position.y, origin.x - player.position.x);
        if (Math.abs(angleDifference(angle, this.parryAngle)) <= 55 * Math.PI / 180) {
          this.completeParry(attacker);
          if (projectile) this.reflectProjectile(projectile, false);
          return 0;
        }
      }
    }
    if (amount > 0 && player.evasionCharges > 0 && ['melee', 'projectile', 'slam'].includes(kind) && (!attackId || attackId !== this.dodgedAttack)) {
      player.evasionCharges = 0;
      this.evasionFlash = 0.65;
      player.invulnerability = 0.18;
      this.particles.ring(player.position.x, player.position.y, '#8ddcff', 50, 0.25);
      return 0;
    }
    if (this.parryRecovery > 0) amount *= 1.2;
    if (kind === 'melee' && this.shieldActive) {
      player.hinderedTimer = Math.max(player.hinderedTimer ?? 0, 0.8);
      player.velocity.x *= 0.55;
      player.velocity.y *= 0.55;
      this.particles.burst(player.position.x, player.position.y, '#d7a6ff', 14, { speed: 65 });
      return amount * 1.35;
    }
    return amount;
  }

  onRoomEnter() {
    this.projectiles = [];
    this.particles.clear();
    this.daggerDash = null;
    this.screenShake = 0;
    this.shieldTimer = this.parryTimer = this.riposteTimer = this.parryRecovery = 0;
    this.game.player.parryRecovery = 0;
    this.game.player.observeAttack = (context) => this.observeAttack(context);
    this.game.player.damageGuard = this.damageGuard;
    this.previousHealth = this.game.player.health;
    this.previousLevel = this.game.player.level;
    const room = this.game.roomManager.current;
    const config = typeof room.boss === 'string' ? { type: room.boss } : room.boss;
    const savedBoss = this.game.bossStates?.[room.id];
    this.boss = config?.type === 'flying-pig' && !room.bossDefeated && savedBoss !== true && !savedBoss?.defeated ? new FlyingPig(config, room) : null;
  }

  update(deltaTime) {
    const { game } = this;
    this.time += deltaTime;
    this.screenShake = Math.max(0, this.screenShake - deltaTime * 30);
    this.particles.update(deltaTime);
    game.player.damageGuard = this.damageGuard;
    this.shieldTimer = Math.max(0, this.shieldTimer - deltaTime);
    this.shieldCooldown = Math.max(0, this.shieldCooldown - deltaTime);
    this.perfectFlash = Math.max(0, this.perfectFlash - deltaTime);
    const previousParryTimer = this.parryTimer;
    const missedParry = previousParryTimer > 0 && previousParryTimer <= deltaTime;
    this.parryTimer = Math.max(0, this.parryTimer - deltaTime);
    this.parryRecovery = missedParry ? Math.max(0, 0.32 - (deltaTime - previousParryTimer)) : Math.max(0, this.parryRecovery - deltaTime);
    game.player.parryRecovery = this.parryRecovery;
    this.evasionFlash = Math.max(0, this.evasionFlash - deltaTime);
    this.perfectDodgeFlash = Math.max(0, this.perfectDodgeFlash - deltaTime);
    this.parryCooldown = Math.max(0, this.parryCooldown - deltaTime);
    this.riposteTimer = Math.max(0, this.riposteTimer - deltaTime);
    this.parryFlash = Math.max(0, this.parryFlash - deltaTime);
    for (const type of Object.keys(this.specialCooldowns)) this.specialCooldowns[type] = Math.max(0, this.specialCooldowns[type] - deltaTime);
    const mouse = game.input.mouseWorld(game.camera);
    game.sword.configure(this.activeWeapon);
    game.sword.update(deltaTime, Math.atan2(mouse.y - game.player.position.y, mouse.x - game.player.position.x));
    if (game.input.wasPressed?.('b')) this.activateShield();
    if (game.input.wasPressed?.('g')) this.parry();
    if (this.previousHealth > game.player.health) {
      this.particles.burst(game.player.position.x, game.player.position.y, '#ff6578', 18, { shape: 'spark' });
      this.screenShake = Math.max(this.screenShake, 5);
    }
    if (this.previousLevel < game.player.level) this.particles.burst(game.player.position.x, game.player.position.y, '#e1fc89', 32, { speed: 180, life: 0.8 });
    this.previousHealth = game.player.health;
    this.previousLevel = game.player.level;
    this.trailTimer -= deltaTime;
    if (this.trailTimer <= 0 && (game.player.dashTimer > 0 || game.player.isSprinting)) {
      this.particles.burst(game.player.position.x, game.player.position.y, this.daggerDash ? '#bca4ff' : '#8ddcff', this.daggerDash ? 4 : 2, { speed: 16, life: 0.22, size: this.daggerDash ? 5 : 3 });
      this.trailTimer = 0.035;
    }
    if (this.daggerDash) {
      game.enemies.filter((enemy) => enemy.health > 0 && !this.daggerDash.hit.has(enemy.id)).forEach((enemy) => {
        if (pointSegmentDistance(enemy.position, this.daggerDash.previous, game.player.position) < enemy.radius + game.player.radius + 8 && this.clearAttackPath(game.player.position, enemy.position)) {
          this.daggerDash.hit.add(enemy.id);
          game.damageEnemy(enemy, this.daggerDash.damage, false);
        }
      });
      this.daggerDash.previous = { ...game.player.position };
      this.daggerDash.time -= deltaTime;
      if (this.daggerDash.time <= 0) this.daggerDash = null;
    }
    game.enemies.forEach((enemy) => {
      if (enemy.pendingProjectiles?.length) this.projectiles.push(...enemy.pendingProjectiles.splice(0));
    });
    if (this.boss && !this.boss.defeated) {
      this.boss.update(deltaTime, game.player, game.currentWorld());
      this.projectiles.push(...this.boss.pendingProjectiles.splice(0));
      this.spawnBossChasers();
    }
    this.updateProjectiles(deltaTime);
    if (this.boss?.defeated && !this.boss.reportedDefeat) {
      this.boss.reportedDefeat = true;
      this.particles.burst(this.boss.position.x, this.boss.position.y, '#ffb3cf', 60, { speed: 240, life: 1 });
      this.particles.ring(this.boss.position.x, this.boss.position.y, '#ffb3cf', 100, 0.65);
      this.screenShake = 9;
      game.onBossDefeated?.(this.boss);
    }
  }

  attack() {
    if (!this.activeWeapon || this.parryTimer > 0 || this.parryRecovery > 0) return false;
    const { game } = this;
    game.sword.configure(this.activeWeapon);
    if (!game.sword.attack()) return false;
    const riposte = this.riposteTimer > 0;
    const damage = game.sword.damage * (game.player.damageMultiplier ?? 1) * (riposte ? 1.75 : 1);
    if (riposte) {
      this.riposteTimer = 0;
      this.particles.burst(game.player.position.x, game.player.position.y, '#ffe29a', 12, { angle: game.sword.aimAngle, spread: 0.5, speed: 180, shape: 'spark' });
    }
    if (game.sword.type === 'gun') this.fire('laser', damage, 850, 0.9);
    else this.melee(damage, game.sword.range, game.sword.type === 'spear' ? 0.42 : 1.15);
    return true;
  }

  special() {
    if (!this.activeWeapon || this.parryTimer > 0 || this.parryRecovery > 0) return false;
    const { game } = this;
    game.sword.configure(this.activeWeapon);
    const { type } = game.sword;
    if ((this.specialCooldowns[type] ?? 0) > 0) return false;
    if (type === 'gun' && game.sword.ammo <= 0) return false;
    const damage = game.sword.damage * (game.player.damageMultiplier ?? 1);
    this.specialCooldowns[type] = this.specialCooldownFor(type);
    game.sword.beginSpecial(type === 'sword' ? 0.45 : 0.25);
    if (type === 'spear') this.fire('spear', damage * 2, 650, 1.2);
    else if (type === 'gun') { game.sword.ammo -= 1; this.fire('explosive', damage * 1.6, 570, 1.5); }
    else if (type === 'scythe') this.fire('scythe', damage * 0.8, 500, 2.6);
    else if (type === 'daggers') {
      game.player.dashVelocity = { x: Math.cos(game.sword.aimAngle) * 780, y: Math.sin(game.sword.aimAngle) * 780 };
      game.player.dashTimer = 0.23;
      game.player.invulnerability = Math.max(game.player.invulnerability, 0.3);
      this.daggerDash = { previous: { ...game.player.position }, time: 0.3, damage: damage * 1.8, hit: new Set() };
    } else {
      this.melee(damage * 1.7, game.sword.range * 1.15, Math.PI);
      this.particles.burst(game.player.position.x, game.player.position.y, '#dcecff', 20, { speed: 210, life: 0.3 });
    }
    return true;
  }

  melee(damage, range, arc) {
    const { game } = this;
    game.enemies.filter((enemy) => enemy.health > 0).forEach((enemy) => {
      const angle = Math.atan2(enemy.position.y - game.player.position.y, enemy.position.x - game.player.position.x);
      if (Math.hypot(enemy.position.x - game.player.position.x, enemy.position.y - game.player.position.y) <= range && Math.abs(angleDifference(angle, game.sword.aimAngle)) <= arc && this.clearAttackPath(game.player.position, enemy.position)) {
        game.damageEnemy(enemy, damage, enemy.alertTimer <= 0 && enemy.state === 'roaming');
      }
    });
  }

  clearAttackPath(from, to) {
    const world = this.game.currentWorld();
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 12);
    for (let index = 1; index < steps; index += 1) {
      if (positionHitsWall({ x: from.x + (to.x - from.x) * index / steps, y: from.y + (to.y - from.y) * index / steps }, 1, world.walls, world.openings)) return false;
    }
    return true;
  }

  fire(kind, damage, speed, life) {
    const angle = this.game.sword.aimAngle;
    const { x, y } = this.game.player.position;
    this.projectiles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: kind === 'scythe' ? 24 : kind === 'explosive' ? 9 : 5, life, age: 0, owner: 'player', kind, damage, color: kind === 'scythe' ? '#eeb4ff' : '#a9edff', hitTimes: {} });
    this.particles.burst(x + Math.cos(angle) * 42, y + Math.sin(angle) * 42, kind === 'explosive' ? '#ffbd65' : '#a9edff', 7, { angle, spread: 0.6, speed: 100, life: 0.18, shape: 'spark' });
  }

  emitHit(x, y, defeated = false) {
    this.particles.burst(x, y, defeated ? '#ffb575' : '#ffe2ad', defeated ? 24 : 9, { speed: defeated ? 180 : 105, shape: 'spark' });
    this.particles.ring(x, y, defeated ? '#ffb575' : '#ffe2ad', defeated ? 35 : 20, 0.18);
    this.screenShake = Math.max(this.screenShake, defeated ? 4 : 2);
  }

  updateProjectiles(deltaTime) {
    const { game } = this;
    const world = game.currentWorld();
    this.projectiles.forEach((projectile) => {
      projectile.life -= deltaTime;
      projectile.age = (projectile.age ?? 0) + deltaTime;
      if (projectile.life <= 0) { if (projectile.kind === 'explosive') this.explode(projectile); return; }
      if (projectile.kind === 'scythe' && projectile.age > 0.32) { projectile.vx = 0; projectile.vy = 0; }
      const distance = Math.hypot(projectile.vx, projectile.vy) * deltaTime;
      const steps = Math.max(1, Math.ceil(distance / 10));
      for (let step = 0; step < steps && projectile.life > 0; step += 1) {
        projectile.x += projectile.vx * deltaTime / steps;
        projectile.y += projectile.vy * deltaTime / steps;
        if (projectile.x < 0 || projectile.x > world.width || projectile.y < 0 || projectile.y > world.height || positionHitsWall(projectile, projectile.radius, world.walls, world.openings)) {
          if (projectile.kind === 'explosive') this.explode(projectile);
          else this.particles.burst(projectile.x, projectile.y, projectile.color, 5, { speed: 50 });
          projectile.life = 0;
          break;
        }
        if (projectile.owner === 'enemy') this.hitPlayer(projectile);
        else this.hitEnemies(projectile);
      }
    });
    this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0);
  }

  reflectProjectile(projectile, shield = true) {
    const perfect = shield && this.shieldTimer > 0.44;
    if (perfect) { this.shieldCooldown = 0; this.perfectFlash = 0.5; }
    projectile.owner = 'reflected';
    projectile.vx = Math.cos(this.game.sword.aimAngle) * 520;
    projectile.vy = Math.sin(this.game.sword.aimAngle) * 520;
    // Pig tower progress remains the shield's unique purpose.
    projectile.shieldReflected = shield;
    projectile.damage = shield ? Math.max(35, projectile.damage * 3) : projectile.damage * 1.75;
    projectile.life = 4;
    projectile.color = shield ? '#91f7e1' : '#ffe29a';
    projectile.perfect = perfect;
    this.particles.burst(projectile.x, projectile.y, projectile.color, 14, { speed: 150 });
    this.particles.ring(projectile.x, projectile.y, projectile.color, 35, 0.22);
    this.game.audio?.play('reflect');
  }

  hitPlayer(projectile) {
    const { player } = this.game;
    const distance = Math.hypot(player.position.x - projectile.x, player.position.y - projectile.y);
    this.observeAttack({ projectile, attackId: projectile });
    if (this.shieldActive && distance < player.radius + projectile.radius + 25) {
      this.reflectProjectile(projectile);
      return;
    }
    if (distance < player.radius + projectile.radius) {
      const context = { kind: 'projectile', projectile, attackId: projectile };
      if (projectile.kind === 'explosive') {
        // Resolve a direct guard before detonating; an evaded shot fizzles safely.
        const guarded = this.guardPlayerDamage(projectile.damage, context);
        if (projectile.owner === 'reflected') return;
        if (guarded > 0) this.explode(projectile, guarded);
      } else player.takeDamage(projectile.damage, context);
      if (projectile.owner !== 'reflected') projectile.life = 0;
    }
  }

  hitEnemies(projectile) {
    const { game } = this;
    if (projectile.owner === 'reflected' && projectile.shieldReflected !== false && this.boss && !this.boss.defeated) {
      const tower = this.boss.towers.find((entry) => entry.health > 0 && Math.hypot(entry.x - projectile.x, entry.y - projectile.y) < entry.radius + projectile.radius);
      if (tower) {
        this.boss.hitTower(tower, projectile.damage);
        this.emitHit(tower.x, tower.y, tower.health <= 0);
        projectile.life = 0;
        return;
      }
      if (Math.hypot(this.boss.position.x - projectile.x, this.boss.position.y - projectile.y) < this.boss.radius + projectile.radius) {
        const hit = this.boss.hitReflected(projectile.damage);
        this.particles.burst(projectile.x, projectile.y, hit ? '#ffb3cf' : '#91f7e1', 12);
        if (hit) this.screenShake = Math.max(this.screenShake, 5);
        projectile.life = 0;
        return;
      }
    }
    for (const enemy of game.enemies) {
      if (enemy.health <= 0 || Math.hypot(enemy.position.x - projectile.x, enemy.position.y - projectile.y) >= enemy.radius + projectile.radius) continue;
      if (projectile.kind === 'scythe') {
        projectile.hitTimes ??= {};
        if (this.time < (projectile.hitTimes[enemy.id] ?? 0)) continue;
        projectile.hitTimes[enemy.id] = this.time + 0.22;
        game.damageEnemy(enemy, projectile.damage, false);
      } else {
        if (projectile.kind === 'explosive') this.explode(projectile);
        else game.damageEnemy(enemy, projectile.damage, false);
        projectile.life = 0;
        break;
      }
    }
  }

  explode(projectile, guardedDamage = null) {
    if (projectile.exploded) return;
    projectile.exploded = true;
    this.particles.burst(projectile.x, projectile.y, '#ffbd65', 28, { speed: 220, life: 0.45 });
    this.particles.ring(projectile.x, projectile.y, '#ffbd65', 105, 0.35);
    this.screenShake = Math.max(this.screenShake, 6);
    if (projectile.owner === 'enemy') {
      if (Math.hypot(this.game.player.position.x - projectile.x, this.game.player.position.y - projectile.y) < 105 && this.clearAttackPath(projectile, this.game.player.position)) this.game.player.takeDamage(guardedDamage ?? projectile.damage, { kind: 'projectile', projectile, attackId: projectile, guarded: guardedDamage !== null });
    } else {
      this.game.enemies.filter((enemy) => enemy.health > 0 && Math.hypot(enemy.position.x - projectile.x, enemy.position.y - projectile.y) < 105 && this.clearAttackPath(projectile, enemy.position)).forEach((enemy) => this.game.damageEnemy(enemy, projectile.damage, false));
    }
  }

  spawnBossChasers() {
    if (!this.boss.pendingSummons) return;
    const { game } = this;
    const world = game.currentWorld();
    const count = this.boss.pendingSummons;
    this.boss.pendingSummons = 0;
    for (let index = 0; index < count; index += 1) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const angle = Math.random() * Math.PI * 2;
        const position = { x: this.boss.position.x + Math.cos(angle) * 110, y: this.boss.position.y + Math.sin(angle) * 110 };
        if (position.x < 20 || position.y < 20 || position.x > world.width - 20 || position.y > world.height - 20 || positionHitsWall(position, 17, world.walls, world.openings)) continue;
        game.enemies.push(new Chaser({ ...position, id: `pig-summon-${this.time}-${index}`, level: this.boss.level, weaponType: this.boss.stage === 2 ? ['spear', 'daggers'][index % 2] : index % 2 ? 'sword' : null }));
        this.particles.burst(position.x, position.y, '#ff6e9d', 20);
        break;
      }
    }
  }
}
