// Small, transient effects. Particles never affect collision or saved game data.
export class ParticleSystem {
  constructor(limit = 320) {
    this.limit = limit;
    this.particles = [];
  }

  burst(x, y, color = '#8ddcff', count = 12, options = {}) {
    const available = Math.max(0, this.limit - this.particles.length);
    for (let index = 0; index < Math.min(count, available); index += 1) {
      const angle = options.angle == null ? Math.random() * Math.PI * 2 : options.angle + (Math.random() - 0.5) * (options.spread ?? 1.2);
      const speed = (options.speed ?? 120) * (0.35 + Math.random() * 0.65);
      const life = (options.life ?? 0.45) * (0.65 + Math.random() * 0.35);
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size: options.size ?? 2 + Math.random() * 3, color, shape: options.shape ?? 'dot' });
    }
  }

  ring(x, y, color, size = 35, life = 0.3) {
    if (this.particles.length >= this.limit) return;
    this.particles.push({ x, y, vx: 0, vy: 0, color, size, life, maxLife: life, shape: 'ring' });
  }

  update(deltaTime) {
    this.particles.forEach((particle) => {
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      const drag = Math.exp(-3 * deltaTime);
      particle.vx *= drag;
      particle.vy *= drag;
      particle.life -= deltaTime;
    });
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  clear() {
    this.particles = [];
  }
}
