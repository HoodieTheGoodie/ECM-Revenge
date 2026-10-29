import { InventoryUI } from './inventory.js';
import { MapUI } from './map.js';
import { TipBoxUI } from './tip-box.js';
import { SaveSystem } from '../core/save-system.js';

export class Menu {
  constructor(game) {
    this.game = game;
    this.screens = { menu: document.querySelector('#main-menu'), loading: document.querySelector('#loading-screen'), paused: document.querySelector('#pause-menu'), inventory: document.querySelector('#inventory-menu'), settings: document.querySelector('#settings-menu'), map: document.querySelector('#map-menu'), 'room-view': document.querySelector('#room-view-menu'), 'game-over': document.querySelector('#game-over-menu'), 'tip-box': document.querySelector('#tip-box-menu') };
    this.gameFrame = document.querySelector('#game-frame');
    this.continueButton = document.querySelector('[data-action="continue"]');
    this.settingsReturnMode = 'menu';
    this.inventoryUI = new InventoryUI(game);
    this.mapUI = new MapUI(game);
    this.tipBoxUI = new TipBoxUI(game);
    document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => this.handle(button.dataset.action)));
    document.querySelector('#debug-fog')?.addEventListener('change', (event) => {
      if (this.game.playground || this.game.editorPlaytest) this.game.debugFog = event.target.checked;
    });
    this.refreshContinue();
    this.refreshMap();
  }

  handle(action) {
    if (['resume', 'back'].includes(action) && this.game.mode === 'tip-box' && this.game.story?.canLeaveTipBox?.() === false) return;
    if (action === 'continue') this.game.continueGame();
    if (action === 'new-game') this.game.newGame();
    if (action === 'playground') this.game.startPlayground();
    if (action === 'continue-playground') this.game.continuePlayground();
    if (action.startsWith('test-')) this.game.runPlaygroundAction(action);
    if (action.startsWith('debug-')) this.game.runDebugAction(action);
    if (action === 'retry') this.game.retryGame();
    if (action === 'resume' && this.game.hasStarted && this.game.player.health > 0 && ['paused', 'tip-box'].includes(this.game.mode)) this.game.setMode('playing');
    if (action === 'inventory' && this.game.hasStarted && this.game.player.health > 0 && ['playing', 'paused', 'room-view'].includes(this.game.mode)) {
      this.game.inventoryReturnMode = this.game.mode;
      this.game.setMode('inventory');
    }
    if (action === 'settings' && ['menu', 'paused'].includes(this.game.mode)) {
      this.settingsReturnMode = this.game.mode;
      this.game.setMode('settings');
    }
    if (action === 'back') {
      const destination = { settings: this.settingsReturnMode, inventory: this.game.inventoryReturnMode, map: this.game.mapReturnMode, 'tip-box': 'playing', 'room-view': 'playing' }[this.game.mode];
      if (destination) this.game.setMode(!this.game.hasStarted ? 'menu' : this.game.player.health <= 0 ? 'game-over' : destination);
    }
    if (action === 'main-menu') this.game.returnToMenu();
    if (action === 'builder') window.location.href = 'editor.html';
    this.refreshContinue();
  }

  refreshContinue() {
    this.continueButton.disabled = !new SaveSystem().hasSave();
    const playgroundContinue = document.querySelector('[data-action="continue-playground"]');
    if (playgroundContinue) playgroundContinue.disabled = !new SaveSystem('playground').hasSave();
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
    if (mode === 'tip-box') this.tipBoxUI.render();
  }
}
