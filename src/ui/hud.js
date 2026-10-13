export class Hud {
  constructor() {
    this.healthBar = document.querySelector('#health-bar');
    this.healthValue = document.querySelector('#health-value');
    this.staminaBar = document.querySelector('#stamina-bar');
    this.staminaValue = document.querySelector('#stamina-value');
    this.experienceBar = document.querySelector('#experience-bar');
    this.experienceValue = document.querySelector('#experience-value');
    this.levelValue = document.querySelector('#player-level');
  }

  update(player) {
    const healthPercent = Math.round((player.health / player.maxHealth) * 100);
    const staminaPercent = Math.round((player.stamina / player.maxStamina) * 100);
    const experiencePercent = Math.round((player.experience / player.experienceToNext) * 100);
    this.healthBar.style.width = `${healthPercent}%`;
    this.healthValue.textContent = `${healthPercent}%`;
    this.staminaBar.style.width = `${staminaPercent}%`;
    this.staminaValue.textContent = `${staminaPercent}%`;
    this.experienceBar.style.width = `${experiencePercent}%`;
    this.experienceValue.textContent = `${experiencePercent}%`;
    this.levelValue.textContent = player.level;
  }

  setRoomName(name) {
    document.title = `Echo Maze 2 // ${name}`;
  }
}