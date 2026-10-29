import { positionHitsWall } from '../world/collision.js';
import { ABILITY_KEYS, ABILITY_TYPES } from '../core/inventory.js';

export class Player {
  constructor(x, y) {
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.radius = 14;
    this.health = 100;
    this.maxHealth = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.maxSpeed = 280;
    this.sprintMultiplier = 1.65;
    this.staminaDrainRate = 34;
    this.staminaRechargeRate = 20;
    this.rechargeDelay = 0;
    this.exhaustionLock = 0;
    this.acceleration = 1500;
    this.friction = 0.82;
    this.level = 1;
    this.experience = 0;
    this.experienceToNext = 100;
    this.invulnerability = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashVelocity = { x: 0, y: 0 };
    this.isSprinting = false;
    this.equippedAbilities = [];
    this.equippedAbilityTypes = [];
    this.abilityCooldowns = {};
    this.damageMultiplier = 1;
    this.cooldownReduction = 0;
    this.healthRegen = 0;
    this.defense = 0;
    this.shielding = 0;
    this.shieldEquipped = false;
    this.levelTokensEarned = 0;
    this.abilitySequence = 0;
    this.hinderedTimer = 0;
    this.damageGuard = null;
    this.observeAttack = null;
    this.perfectDodgeWindow = 0;
    this.dashSequence = 0;
    this.dashOrigin = { x, y };
    this.evasionCharges = 0;
    this.parryRecovery = 0;
    this.fogRevealRemaining = 0;
  }

  update(deltaTime, input, world, aimDirection) {
    this.invulnerability = Math.max(0, this.invulnerability - deltaTime);
    this.perfectDodgeWindow = Math.max(0, this.perfectDodgeWindow - deltaTime);
    this.fogRevealRemaining = Math.max(0, this.fogRevealRemaining - deltaTime);
    this.hinderedTimer = Math.max(0, this.hinderedTimer - deltaTime);
    for (const type of Object.keys(this.abilityCooldowns)) this.abilityCooldowns[type] = Math.max(0, this.abilityCooldowns[type] - deltaTime);
    this.dashCooldown = this.abilityCooldowns.dash ?? 0;
    this.health = Math.min(this.maxHealth, this.health + this.healthRegen * deltaTime);
    const legacyDash = input.wasPressed('q') && input.isDown('shift') && this.equippedAbilityTypes.includes('dash');
    if (legacyDash) this.useAbility('dash', aimDirection);
    this.equippedAbilities.forEach((ability, index) => {
      if (ability && !(legacyDash && index === 0) && input.wasPressed(ABILITY_KEYS[index])) this.useAbility(ability.type, aimDirection);
    });
    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - deltaTime);
      const hinder = this.hinderedTimer > 0 ? 0.55 : 1;
      this.move(this.dashVelocity.x * deltaTime * hinder, this.dashVelocity.y * deltaTime * hinder, world);
      return;
    }
    const direction = input.axis();
    const length = Math.hypot(direction.x, direction.y) || 1;
    const canSprint = this.stamina > 0 && this.exhaustionLock <= 0;
    const sprinting = input.isDown('shift') && (direction.x || direction.y) && canSprint;
    this.isSprinting = Boolean(sprinting);
    const movementSpeed = (sprinting ? this.maxSpeed * this.sprintMultiplier : this.maxSpeed) * (this.hinderedTimer > 0 ? 0.55 : 1) * (this.parryRecovery > 0 ? 0.7 : 1);
    const targetX = (direction.x / length) * movementSpeed;
    const targetY = (direction.y / length) * movementSpeed;
    const response = Math.min(1, this.acceleration * deltaTime / this.maxSpeed);

    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * deltaTime);
      this.rechargeDelay = 2;
      if (this.stamina === 0) this.exhaustionLock = 3;
    } else {
      this.exhaustionLock = Math.max(0, this.exhaustionLock - deltaTime);
      this.rechargeDelay = Math.max(0, this.rechargeDelay - deltaTime);
      if (this.rechargeDelay === 0) {
        this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRechargeRate * deltaTime);
      }
    }

    if (direction.x || direction.y) {
      this.velocity.x += (targetX - this.velocity.x) * response;
      this.velocity.y += (targetY - this.velocity.y) * response;
    } else {
      this.velocity.x *= this.friction;
      this.velocity.y *= this.friction;
    }

    this.move(this.velocity.x * deltaTime, this.velocity.y * deltaTime, world);
  }

  move(deltaX, deltaY, world) {
    const steps = Math.max(1, Math.ceil(Math.hypot(deltaX, deltaY) / 8));
    for (let step = 0; step < steps; step += 1) {
      const boundedX = Math.max(this.radius, Math.min(world.width - this.radius, this.position.x + deltaX / steps));
      const boundedY = Math.max(this.radius, Math.min(world.height - this.radius, this.position.y + deltaY / steps));
      if (!positionHitsWall({ x: boundedX, y: this.position.y }, this.radius, world.walls, world.openings)) this.position.x = boundedX;
      else this.velocity.x = 0;
      if (!positionHitsWall({ x: this.position.x, y: boundedY }, this.radius, world.walls, world.openings)) this.position.y = boundedY;
      else this.velocity.y = 0;
    }
  }

  takeDamage(amount, context = {}) {
    if (!context.guarded) amount = this.damageGuard?.(amount, context) ?? amount;
    if (this.invulnerability > 0) return false;
    if (amount <= 0) return false;
    const reducedDamage = amount * (100 / (100 + this.defense)) * (1 - this.shielding);
    this.health = Math.max(0, this.health - reducedDamage);
    this.invulnerability = 1;
    return true;
  }

  addExperience(amount) {
    this.experience += amount;
    while (this.experience >= this.experienceToNext) {
      this.experience -= this.experienceToNext;
      this.level += 1;
      this.levelTokensEarned += 1;
      this.experienceToNext = Math.round(this.experienceToNext * 1.15);
    }
  }

  useAbility(type, aimDirection) {
    if (!this.equippedAbilityTypes.includes(type) || (this.abilityCooldowns[type] ?? 0) > 0 || type === 'map-view') return false;
    const definition = ABILITY_TYPES[type];
    if (!definition) return false;
    if (type === 'dash') {
      if (!aimDirection) return false;
      if (this.parryRecovery > 0) return false;
      const length = Math.hypot(aimDirection.x, aimDirection.y);
      if (!length) return false;
      this.dashVelocity = { x: aimDirection.x / length * 760, y: aimDirection.y / length * 760 };
      this.dashOrigin = { ...this.position };
      this.dashSequence += 1;
      this.perfectDodgeWindow = 0.12;
      this.dashTimer = 0.18;
      this.invulnerability = Math.max(this.invulnerability, 0.24);
    }
    if (type === 'clear-sight') this.fogRevealRemaining = 5;
    if (type === 'heal') this.health = Math.min(this.maxHealth, this.health + this.maxHealth * 0.2);
    if (type === 'barrier') this.invulnerability = Math.max(this.invulnerability, 1.5);
    if (type === 'stamina') this.stamina = Math.min(this.maxStamina, this.stamina + this.maxStamina * 0.35);
    this.abilityCooldowns[type] = definition.cooldown * (1 - this.cooldownReduction);
    if (type === 'dash') this.dashCooldown = this.abilityCooldowns.dash;
    this.lastAbilityUsed = type;
    this.abilitySequence += 1;
    return true;
  }

  serialize() {
    return { health: this.health, stamina: this.stamina, level: this.level, experience: this.experience, experienceToNext: this.experienceToNext, position: { ...this.position }, abilityCooldowns: { ...this.abilityCooldowns }, levelTokensEarned: this.levelTokensEarned };
  }

  restore(data) {
    if (!data) return;
    this.health = data.health ?? this.maxHealth;
    this.stamina = data.stamina ?? this.maxStamina;
    this.level = data.level ?? 1;
    this.experience = data.experience ?? 0;
    this.experienceToNext = data.experienceToNext ?? 100;
    this.position = { ...this.position, ...data.position };
    this.abilityCooldowns = { ...(data.abilityCooldowns ?? {}) };
    this.levelTokensEarned = data.levelTokensEarned ?? 0;
  }
}
