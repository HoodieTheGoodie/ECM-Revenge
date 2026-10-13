export class Camera {
  constructor(viewportWidth, viewportHeight, worldWidth, worldHeight) {
    this.position = { x: 0, y: 0 };
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.followStrength = 8;
  }

  follow(target, deltaTime) {
    const desiredX = target.x - this.viewportWidth / 2;
    const desiredY = target.y - this.viewportHeight / 2;
    const smoothing = 1 - Math.exp(-this.followStrength * deltaTime);

    this.position.x += (desiredX - this.position.x) * smoothing;
    this.position.y += (desiredY - this.position.y) * smoothing;
    this.position.x = Math.max(0, Math.min(this.worldWidth - this.viewportWidth, this.position.x));
    this.position.y = Math.max(0, Math.min(this.worldHeight - this.viewportHeight, this.position.y));
  }
}