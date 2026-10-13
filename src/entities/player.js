import { positionHitsWall } from '../world/collision.js';

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
  }

  update(deltaTime, input, world, aimDirection) {
    this.invulnerability = Math.max(0, this.invulnerability - deltaTime);
    this.dashCooldown = Math.max(0, this.dashCooldown - deltaTime);
    if (input.wasPressed('q') && input.isDown('shift') && this.dashCooldown === 0 && aimDirection) {
      this.dashVelocity = { x: aimDirection.x * 760, y: aimDirection.y * 760 };
      this.dashTimer = 0.18;
      this.dashCooldown = 0.5;
      this.invulnerability = Math.max(this.invulnerability, 0.24);
    }
    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - deltaTime);
      this.move(this.dashVelocity.x * deltaTime, this.dashVelocity.y * deltaTime, world);
      return;
    }
    const direction = input.axis();
    const length = Math.hypot(direction.x, direction.y) || 1;
    const canSprint = this.stamina > 0 && this.exhaustionLock <= 0;
    const sprinting = input.isDown('shift') && (direction.x || direction.y) && canSprint;
    this.isSprinting = Boolean(sprinting);
    const movementSpeed = sprinting ? this.maxSpeed * this.sprintMultiplier : this.maxSpeed;
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
    const boundedX = Math.max(this.radius, Math.min(world.width - this.radius, this.position.x + deltaX));
    const boundedY = Math.max(this.radius, Math.min(world.height - this.radius, this.position.y + deltaY));
    if (!positionHitsWall({ x: boundedX, y: this.position.y }, this.radius, world.walls, world.openings)) this.position.x = boundedX;
    else this.velocity.x = 0;
    if (!positionHitsWall({ x: this.position.x, y: boundedY }, this.radius, world.walls, world.openings)) this.position.y = boundedY;
    else this.velocity.y = 0;
  }

  takeDamage(amount) {
    if (this.invulnerability > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.invulnerability = 1;
    return true;
  }

  addExperience(amount) {
    this.experience += amount;
    while (this.experience >= this.experienceToNext) {
      this.experience -= this.experienceToNext;
      this.level += 1;
      this.experienceToNext = Math.round(this.experienceToNext * 1.35);
    }
  }

  serialize() {
    return { health: this.health, stamina: this.stamina, level: this.level, experience: this.experience, experienceToNext: this.experienceToNext, position: { ...this.position } };
  }

  restore(data) {
    if (!data) return;
    this.health = data.health ?? this.maxHealth;
    this.stamina = data.stamina ?? this.maxStamina;
    this.level = data.level ?? 1;
    this.experience = data.experience ?? 0;
    this.experienceToNext = data.experienceToNext ?? 100;
    this.position = { ...this.position, ...data.position };
  }
}