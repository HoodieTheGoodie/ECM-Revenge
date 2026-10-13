export class Chest {
  constructor(x, y, itemId) {
    this.position = { x, y };
    this.itemId = itemId;
    this.state = 'closed';
    this.timer = 0;
    this.hasDropped = false;
    this.shake = 0;
    this.particles = [];
  }

  interact() {
    if (this.state !== 'closed') return false;
    this.state = 'opening';
    this.timer = 0;
    return true;
  }

  update(deltaTime) {
    if (this.state === 'closed' || this.state === 'opened') return;
    this.timer += deltaTime;
    if (this.state === 'opening' && this.timer >= 0.85) {
      this.state = 'burst';
      this.timer = 0;
      this.hasDropped = true;
      this.particles = Array.from({ length: 28 }, (_, index) => {
        const angle = (index / 28) * Math.PI * 2;
        const speed = 70 + Math.random() * 160;
        return { x: 0, y: 0, velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed, life: 0.55, size: 3 + Math.random() * 4 };
      });
    }
    if (this.state === 'burst' && this.timer >= 0.55) this.state = 'opened';
    this.shake = this.state === 'opening' ? Math.sin(this.timer * (10 + this.timer * 28)) * Math.min(7, this.timer * 8) : 0;
    this.particles.forEach((particle) => {
      particle.x += particle.velocityX * deltaTime;
      particle.y += particle.velocityY * deltaTime;
      particle.velocityY += 180 * deltaTime;
      particle.life -= deltaTime;
    });
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  serialize() {
    return { state: this.state, timer: this.timer, hasDropped: this.hasDropped };
  }

  restore(data) {
    if (!data) return;
    this.state = data.state ?? this.state;
    this.timer = data.timer ?? this.timer;
    this.hasDropped = data.hasDropped ?? this.hasDropped;
  }
}