import { InventoryUI } from './inventory.js';
import { MapUI } from './map.js';

export class Menu {
  constructor(game) {
    this.game = game;
    this.screens = { menu: document.querySelector('#main-menu'), loading: document.querySelector('#loading-screen'), paused: document.querySelector('#pause-menu'), inventory: document.querySelector('#inventory-menu'), settings: document.querySelector('#settings-menu'), map: document.querySelector('#map-menu'), 'room-view': document.querySelector('#room-view-menu'), 'game-over': document.querySelector('#game-over-menu') };
    this.gameFrame = document.querySelector('#game-frame');
    this.continueButton = document.querySelector('[data-action="continue"]');
    this.inventoryUI = new InventoryUI(game);
    this.mapUI = new MapUI(game);
    document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => this.handle(button.dataset.action)));
    this.refreshContinue();
    this.refreshMap();
  }

  handle(action) {
    if (action === 'continue') this.game.continueGame();
    if (action === 'new-game') this.game.newGame();
    if (action === 'retry') this.game.newGame();
    if (action === 'resume') this.game.setMode('playing');
    if (action === 'inventory') {
      this.game.inventoryReturnMode = this.game.mode;
      this.game.setMode('inventory');
    }
    if (action === 'settings') this.game.setMode('settings');
    if (action === 'back') this.game.setMode(this.game.inventoryReturnMode ?? (this.game.hasStarted ? 'paused' : 'menu'));
    if (action === 'main-menu') this.game.setMode('menu');
    if (action === 'builder') window.location.href = 'editor.html';
    this.refreshContinue();
  }

  refreshContinue() {
    this.continueButton.disabled = !this.game.saveSystem.hasSave();
  }

  refreshInventory() {
    this.inventoryUI.render(this.game.inventory);
  }

  refreshMap() {
    this.mapUI.render();
  }

  update(mode) {
    Object.entries(this.screens).forEach(([screenName, screen]) => screen.classList.toggle('is-visible', screenName === mode));
    this.gameFrame.classList.toggle('is-hidden', mode === 'menu' || mode === 'loading');
    if (mode === 'inventory') this.refreshInventory();
    if (mode === 'map') this.refreshMap();
  }
}