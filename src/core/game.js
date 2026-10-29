import { Camera } from './camera.js';
import { GAME_MODES } from './game-state.js';
import { createInventory, createKeyItem, createSwordItem, restoreInventory, createGearItem, createAbilityItem, getActiveWeapon, applyEquipmentStats, collectLevelTokens, ABILITY_TYPES, GEAR_TYPES } from './inventory.js';
import { Input } from './input.js';
import { MapSystem } from './map-system.js';
import { SaveSystem } from './save-system.js';
import { Player } from '../entities/player.js';
import { Chest } from '../entities/chest.js';
import { Chaser } from '../entities/chaser.js';
import { Sword } from '../entities/sword.js';
import { Renderer } from '../rendering/renderer.js';
import { Hud } from '../ui/hud.js';
import { Menu } from '../ui/menu.js';
import { RoomManager } from '../world/room-manager.js';
import { carveOpenings } from '../world/collision.js';
import { positionHitsWall } from '../world/collision.js';
import { isBarrier, doorIsOpen, unlockDoor, activateSwitch, takeTerminalOffline } from './puzzles.js';
import { CombatSystem } from './combat.js';
import { StorySystem } from './story.js';
import { Settings, SoundEffects } from './settings.js';
import { getItemHint } from './item-hints.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input(canvas);
    this.settings = new Settings();
    this.settings.bind();
    this.audio = new SoundEffects(this.settings);
    this.saveSystem = new SaveSystem();
    this.mapSystem = new MapSystem();
    this.roomManager = new RoomManager();
    this.player = new Player(480, 300);
    this.camera = new Camera(canvas.width, canvas.height, this.roomManager.current.width, this.roomManager.current.height);
    this.renderer = new Renderer(canvas, this.roomManager.current);
    this.hud = new Hud();
    this.inventory = createInventory();
    this.sword = new Sword();
    this.chest = null;
    this.droppedItem = null;
    this.chestStates = {};
    this.collectedChests = new Set();
    this.enemies = [];
    this.enemyStates = {};
    this.doorStates = {};
    this.collectedKeys = new Set();
    this.xpOrbs = [];
    this.chests = [];
    this.droppedItems = [];
    this.switchStates = {};
    this.terminalsOffline = {};
    this.challengeStates = {};
    this.bossStates = {};
    this.storyState = {};
    this.hardmode = false;
    this.hardmodePending = false;
    this.mapReturnMode = GAME_MODES.PLAYING;
    this.mode = GAME_MODES.MENU;
    this.inventoryReturnMode = GAME_MODES.PLAYING;
    this.hasStarted = false;
    this.initialLoadingTimer = 0;
    this.previousTime = 0;
    this.menu = new Menu(this);
    this.combat = new CombatSystem(this);
    this.story = new StorySystem(this);
  }

  start() {
    this.setMode(GAME_MODES.MENU);
    requestAnimationFrame((time) => this.loop(time));
  }

  newGame(options = {}) {
    this.playground = Boolean(options.playground);
    this.editorPlaytest = !this.playground && Boolean(options.editorPlaytest);
    this.roomManager = new RoomManager(this.playground ? { ignoreAuthored: true, ignorePlaytest: true, startRoomId: 'feature-lab' } : { ignorePlaytest: !this.editorPlaytest });
    this.debugFog = true;
    this.saveSystem = new SaveSystem(this.playground ? 'playground' : this.editorPlaytest ? 'playtest' : 'campaign');
    this.player = new Player(480, 300);
    this.inventory = createInventory();
    this.chestStates = {};
    this.collectedChests = new Set();
    this.enemies = [];
    this.xpOrbs = [];
    this.enemyStates = {};
    this.doorStates = {};
    this.collectedKeys = new Set();
    this.switchStates = {};
    this.terminalsOffline = {};
    this.challengeStates = {};
    this.bossStates = {};
    this.storyState = {};
    this.hardmode = false;
    this.hardmodePending = false;
    this.sword = new Sword();
    const campaignRooms = Object.values(this.roomManager.rooms);
    this.storyState.tutorialActive = !this.playground && !this.editorPlaytest && this.roomManager.current.tutorialStage === 'movement' && campaignRooms.some((room) => room?.type === 'hub') && campaignRooms.some((room) => room?.tutorialStage === 'equipment');
    this.mapSystem = new MapSystem();
    this.combat = new CombatSystem(this);
    if (this.roomManager.current.spawn) this.player.position = { ...this.roomManager.current.spawn };
    this.loadCurrentRoom();
    this.hasStarted = true;
    this.beginInitialLoad();
  }

  startPlayground() {
    this.newGame({ playground: true });
    this.story.say('The Playground starts empty and uses a separate save. Open Debug Tools to give yourself items or a test loadout, spawn each Chaser type, preview attacks, or test Hardmode. E opens the Tip Box.');
  }

  continuePlayground() {
    this.playground = true;
    this.saveSystem = new SaveSystem('playground');
    this.continueGame();
  }

  runPlaygroundAction(action) {
    if (!this.playground || !this.hasStarted || !['playing', 'paused', 'inventory', 'map', 'room-view', 'game-over'].includes(this.mode)) return false;
    if (action === 'test-restore-save') {
      if (!this.saveSystem.hasSave()) { this.story.say('No Playground checkpoint yet. Save at the Tip Box, or complete the Hardmode return to the hub.'); return false; }
      this.continueGame();
      return true;
    }
    if (this.player.health <= 0) return false;
    if (action === 'test-hardmode') {
      if (this.hardmode) { this.story.say('Hardmode is already active. Start a fresh Playground from the main menu to repeat the reset.'); return false; }
      this.storyState.pigDefeated = true;
      this.bossStates['feature-boss'] = true;
      takeTerminalOffline(this, { number: 1 });
      this.story.terminalOffline(1);
      return true;
    }
    if (action === 'test-recovery') {
      if (!this.hardmodePending) { this.story.say('Start the Hardmode reset first. Recovery is available before its hub checkpoint.'); return false; }
      return this.visitPlaygroundRoom('signal-cache');
    }
    if (action === 'test-hub-return') {
      if (!this.hardmodePending || !this.story.hasStarterEquipment()) {
        this.story.say('Recover the Sword and Map View from the chest, then equip both. Only then can the hub commit Hardmode.');
        return false;
      }
      return this.visitPlaygroundRoom('main-hub');
    }
    if (action === 'test-lab-return') {
      if (this.hardmodePending) { this.story.say('Finish recovering your equipment and return to the main hub before returning to the lab.'); return false; }
      return this.visitPlaygroundRoom('feature-lab');
    }
    return false;
  }

  visitPlaygroundRoom(roomId) {
    if (!this.playground || !this.roomManager.rooms[roomId]) return false;
    this.roomManager.previousRoomId = this.roomManager.currentId;
    this.roomManager.currentId = roomId;
    this.roomManager.loading = false;
    this.roomManager.pendingRoom = null;
    this.roomManager.spawnSide = null;
    const room = this.roomManager.current;
    this.player.position = { ...(room.spawn ?? { x: room.width / 2, y: room.height / 2 }) };
    this.player.velocity = { x: 0, y: 0 };
    this.loadCurrentRoom();
    this.beginInitialLoad();
    return true;
  }

  giveTestEquipment() {
    this.player.level = 5;
    this.player.experienceToNext = Math.round(100 * 1.15 ** 4);
    const sword = createSwordItem(5);
    const spear = createGearItem('spear', 5, 'rare');
    const gun = createGearItem('gun', 5, 'epic');
    const dash = createAbilityItem('dash', 5);
    const map = createAbilityItem('map-view', 5);
    const shield = createGearItem('shield', 5);
    const extra = [createGearItem('daggers', 5), createGearItem('sword', 1, 'epic'), createGearItem('swift-armor', 5), createGearItem('tanker-armor', 5), createAbilityItem('heal', 5), createAbilityItem('barrier', 5), createAbilityItem('stamina', 5), createAbilityItem('clear-sight', 5)];
    this.inventory.items = [sword, spear, gun, dash, map, shield, ...extra];
    this.inventory.tokens = 20;
    this.inventory.equipment.weapons = [sword.id, spear.id, gun.id];
    this.inventory.equipment.abilities = [dash.id, map.id, ...extra.filter((item) => item.slot === 'ability').slice(0, 3).map((item) => item.id)];
    this.inventory.equipment.shield = shield.id;
    for (const item of this.inventory.items) item.equipped = [...this.inventory.equipment.weapons, ...this.inventory.equipment.abilities, shield.id].includes(item.id);
    this.storyState.reachedHub = true;
    this.storyState.starterCollected = true;
    applyEquipmentStats(this.player, this.inventory);
  }

  showItemHint(itemId) {
    const item = this.inventory.items.find((entry) => entry.id === itemId);
    if (!item) return;
    const message = getItemHint(item, this.inventory);
    const panel = document.querySelector('#inventory-tippy-hint');
    const text = document.querySelector('#inventory-tippy-text');
    if (this.mode === GAME_MODES.INVENTORY && panel && text) {
      text.textContent = `${item.name}: ${message}`;
      panel.hidden = false;
    } else this.story.say(message);
  }

  runDebugAction(action) {
    if (!(this.playground || this.editorPlaytest) || !this.hasStarted || !['playing', 'paused'].includes(this.mode)) return false;
    const value = (id) => document.querySelector(`#${id}`)?.value;
    if (action === 'debug-loadout') { this.giveTestEquipment(); this.refreshEquipmentStats(); }
    else if (action === 'debug-give-item') {
      const type = value('debug-item-type');
      if (!GEAR_TYPES[type] && !ABILITY_TYPES[type]) return false;
      const rarity = value('debug-rarity');
      const item = ABILITY_TYPES[type] ? createAbilityItem(type, this.player.level) : createGearItem(type, this.player.level, rarity);
      if (type === 'shield') item.protected = true;
      this.inventory.items.push(item);
      this.refreshEquipmentStats();
      this.story.say(`${item.name} added by Debug Tools. Equip it in I; Ask Tippy explains its controls.`);
    } else if (action === 'debug-spawn-enemy') {
      const type = value('debug-enemy-type');
      const weaponType = ['sword', 'spear', 'daggers', 'gun'].includes(type) ? type : null;
      const level = Math.max(1, Math.min(50, Math.floor(Number(value('debug-enemy-level')) || 1)));
      const world = this.currentWorld();
      const aim = this.sword.aimAngle;
      const candidates = Array.from({ length: 16 }, (_, index) => ({ x: this.player.position.x + Math.cos(aim + index * Math.PI / 8) * 220, y: this.player.position.y + Math.sin(aim + index * Math.PI / 8) * 220 }));
      const point = candidates.find((point) => point.x > 40 && point.y > 40 && point.x < world.width - 40 && point.y < world.height - 40 && !positionHitsWall(point, 17, world.walls));
      if (!point) { this.story.say('No clear spawn position nearby. Move into an open area.'); return false; }
      const enemy = new Chaser({ id: `debug-${Date.now()}-${this.enemies.length}`, ...point, level, weaponType, armorType: null, facing: Math.atan2(this.player.position.y - point.y, this.player.position.x - point.x) });
      enemy.alertFromHit();
      this.enemies.push(enemy);
      this.story.say(`Spawned a level ${level} ${weaponType ?? 'unarmed'} Chaser.`);
    } else if (action === 'debug-clear-enemies') this.enemies = [];
    else if (action === 'debug-heal') { this.player.health = this.player.maxHealth; this.player.stamina = this.player.maxStamina; }
    else if (action === 'debug-tokens') { this.inventory.tokens += 10; this.menu.refreshInventory(); }
    else if (action === 'debug-preview-animation') {
      const animation = value('debug-animation');
      this.combat.update(0);
      if (animation === 'attack') this.combat.attack();
      else if (animation === 'special') this.combat.special();
      else if (animation === 'parry' || animation === 'shield') {
        this.input.pressed.add(animation === 'parry' ? 'g' : 'b');
        this.combat.update(0);
      } else return false;
      if (this.mode === GAME_MODES.PAUSED) this.setMode(GAME_MODES.PLAYING);
    } else return false;
    return true;
  }

  continueGame() {
    const save = this.saveSystem.load();
    if (!save) return this.playground ? this.startPlayground() : this.newGame();
    this.playground = Boolean(save.playground);
    this.editorPlaytest = Boolean(save.editorPlaytest);
    this.roomManager = new RoomManager(this.playground ? { ignoreAuthored: true, playground: true, ignorePlaytest: true } : { ignorePlaytest: !this.editorPlaytest });
    if (this.roomManager.rooms[save.roomId]) this.roomManager.currentId = save.roomId;
    this.player = new Player(480, 300);
    this.player.restore(save.player);
    this.inventory = restoreInventory(save.inventory);
    if ((save.inventoryVersion ?? 1) < 3 && !this.inventory.items.some((item) => item.type === 'map-view')) {
      const scanner = createAbilityItem('map-view');
      scanner.equipped = true;
      this.inventory.items.push(scanner);
      this.inventory.equipment.abilities[0] = scanner.id;
    }
    if (!save.inventoryVersion) {
      const oldSword = this.inventory.items.find((item) => item.id === 'default-sword');
      if (oldSword) oldSword.equipped = false;
      this.inventory.equipment.weapons = [null, null, null];
    }
    this.chestStates = save.chestStates ?? {};
    this.collectedChests = new Set(save.collectedChests ?? []);
    this.enemyStates = save.enemyStates ?? {};
    this.doorStates = save.doorStates ?? {};
    this.collectedKeys = new Set(save.collectedKeys ?? []);
    this.switchStates = save.switchStates ?? {};
    this.terminalsOffline = save.terminalsOffline ?? {};
    this.challengeStates = save.challengeStates ?? {};
    this.bossStates = save.bossStates ?? {};
    this.storyState = save.story ?? {};
    this.hardmode = Boolean(save.hardmode);
    this.hardmodePending = Boolean(save.hardmodePending);
    this.sword = new Sword();
    this.combat = new CombatSystem(this);
    this.mapSystem = new MapSystem();
    this.mapSystem.restore(save.map);
    applyEquipmentStats(this.player, this.inventory);
    this.loadCurrentRoom();
    this.sword.restore?.(save.weaponState);
    this.combat.restore?.(save.combatState);
    this.hasStarted = true;
    this.beginInitialLoad();
  }

  setMode(mode) {
    this.mode = mode;
    this.menu.update(mode);
    this.updatePlaygroundTools();
  }

  updatePlaygroundTools() {
    const panel = document.querySelector('#playground-tools');
    if (!panel) return;
    panel.hidden = !(this.playground || this.editorPlaytest) || !this.hasStarted || !['playing', 'paused', 'game-over'].includes(this.mode);
    const hardmodeControls = document.querySelector('#hardmode-test-controls');
    if (hardmodeControls) hardmodeControls.hidden = !this.playground;
    const status = document.querySelector('#playground-status');
    if (status) status.textContent = this.hardmodePending ? 'Reset in progress · Recover and equip Sword + Map View, then return to the hub.' : this.hardmode ? 'Hardmode committed · Reload the Playground save to verify it persists.' : 'Separate test save · Start the reset without fighting the boss.';
    const reset = panel.querySelector?.('[data-action="test-hardmode"]');
    if (reset) reset.disabled = this.hardmode || this.player.health <= 0;
    const recovery = panel.querySelector?.('[data-action="test-recovery"]');
    if (recovery) recovery.disabled = !this.hardmodePending || this.player.health <= 0;
    const hub = panel.querySelector?.('[data-action="test-hub-return"]');
    if (hub) hub.disabled = !this.hardmodePending || this.player.health <= 0;
    const restore = panel.querySelector?.('[data-action="test-restore-save"]');
    if (restore) restore.disabled = !this.saveSystem.hasSave();
  }

  saveProgress() {
    if (this.roomManager.current.type !== 'hub' || this.player.health <= 0) return false;
    if (!this.story.tipBoxAvailable()) return false;
    const pending = this.hardmodePending;
    const previousTutorialSaved = this.storyState.tutorialSaved;
    if (this.story.requiresCheckpoint()) this.storyState.tutorialSaved = true;
    if (pending) { this.hardmodePending = false; this.storyState.hardmodeCommitted = true; }
    try {
      this.saveSystem.save(this);
      this.audio?.play('save');
      this.menu.refreshContinue();
      this.updatePlaygroundTools();
      if (!this.story.touring) this.story.say('Progress saved. Your inventory, discovered rooms, and opened chests are safe.');
      return true;
    } catch {
      this.storyState.tutorialSaved = previousTutorialSaved;
      if (pending) { this.hardmodePending = true; this.storyState.hardmodeCommitted = false; }
      this.story.say('Save failed: browser storage is unavailable. Your progress has not been saved.'); return false;
    }
  }

  returnToMenu() {
    this.hasStarted = false;
    this.playground = false;
    this.editorPlaytest = false;
    this.saveSystem = new SaveSystem();
    this.setMode(GAME_MODES.MENU);
    this.story.hide();
  }

  retryGame() {
    this.continueGame();
  }

  openTipBox() {
    if (!this.story.tipBoxAvailable()) return false;
    this.inventoryReturnMode = GAME_MODES.PLAYING;
    this.setMode('tip-box');
  }

  refreshEquipmentStats() {
    applyEquipmentStats(this.player, this.inventory);
    this.menu.refreshInventory();
  }

  equipItem(itemId, slotIndex) {
    const item = this.inventory.items.find((entry) => entry.id === itemId);
    if (!item || item.placeholder || item.slot === 'key') return;
    const equipmentSlot = item.slot === 'weapon' ? 'weapons' : item.slot === 'ability' ? 'abilities' : item.slot;
    const slots = this.inventory.equipment[equipmentSlot];
    const weaponIndex = item.slot === 'weapon' ? slotIndex ?? this.inventory.equipment.activeWeapon : item.slot === 'ability' ? slotIndex ?? Math.max(0, slots.indexOf(null)) : null;
    if (Array.isArray(slots) && (weaponIndex < 0 || weaponIndex >= slots.length)) return;
    this.unequipItem(itemId, false);
    const previousId = Array.isArray(slots) ? slots[weaponIndex] : this.inventory.equipment[equipmentSlot];
    const previousItem = this.inventory.items.find((entry) => entry.id === previousId);
    if (previousItem) previousItem.equipped = false;
    if (Array.isArray(slots)) slots[weaponIndex] = item.id;
    else this.inventory.equipment[equipmentSlot] = item.id;
    item.equipped = true;
    this.refreshEquipmentStats();
  }

  unequipItem(itemId, refresh = true) {
    const item = this.inventory.items.find((entry) => entry.id === itemId);
    if (!item || item.placeholder) return;
    if (item.slot === 'weapon' || item.slot === 'ability') {
      const slots = this.inventory.equipment[item.slot === 'weapon' ? 'weapons' : 'abilities'];
      slots.forEach((id, index) => { if (id === item.id) slots[index] = null; });
    } else if (this.inventory.equipment[item.slot] === item.id) {
      this.inventory.equipment[item.slot] = null;
    }
    item.equipped = false;
    if (refresh) this.refreshEquipmentStats();
  }

  dropItem(itemId) {
    const item = this.inventory.items.find((entry) => entry.id === itemId);
    if (!item) return;
    if (item.slot === 'key' || item.type === 'map-view' || item.type === 'shield' || item.protected) return;
    if (this.story?.isRequiredTutorialItem(item)) { this.story.say('Keep your sword and Map View equipped until you reach the hub.'); return; }
    this.unequipItem(itemId);
    if (item.slot === 'weapon') {
      const weaponIndex = this.inventory.equipment.weapons.indexOf(item.id);
      if (weaponIndex >= 0) this.inventory.equipment.weapons[weaponIndex] = null;
    } else if (this.inventory.equipment[item.slot] === item.id) this.inventory.equipment[item.slot] = null;
    this.inventory.items = this.inventory.items.filter((entry) => entry.id !== itemId);
    this.refreshEquipmentStats();
  }

  selectWeapon(index) {
    if (index < 0 || index > 2) return;
    this.inventory.equipment.activeWeapon = index;
    this.refreshEquipmentStats();
  }

  isSwordEquipped() {
    return Boolean(getActiveWeapon(this.inventory));
  }

  currentWorld() {
    const room = this.roomManager.current;
    const lockedWalls = (room.doors ?? []).filter((door) => !this.canUseDoor(door)).map((door) => ({ x: door.x, y: door.y, width: door.width, height: door.height }));
    const openings = (room.doors ?? []).filter((door) => this.canUseDoor(door)).map((door) => ({ x: door.x, y: door.y, width: door.width, height: door.height }));
    return { ...room, walls: [...carveOpenings(room.walls, openings), ...lockedWalls], openings: [] };
  }

  isDoorUnlocked(door) {
    return doorIsOpen(this, door);
  }

  canUseDoor(door) {
    if (this.story?.allowsDoor && !this.story.allowsDoor(door)) return false;
    if (this.hardmodePending && this.roomManager.current.type === 'hub' && !this.story?.hasStarterEquipment() && !['movement', 'equipment', 'lore'].includes(this.roomManager.rooms[door.targetRoom]?.tutorialStage)) return false;
    if (door.tutorialGate && !this.story?.hasStarterEquipment()) return false;
    if (door.hardmodeOnly && !this.hardmode) return false;
    if (this.hardmode && door.hardmodeTerminal) return Boolean(this.terminalsOffline[door.hardmodeTerminal]);
    return this.isDoorUnlocked(door);
  }

  loadCurrentRoom() {
    const room = this.roomManager.current;
    this.camera.worldWidth = room.width;
    this.camera.worldHeight = room.height;
    this.renderer.world = room;
    this.hud.setRoomName(room.name);
    this.mapSystem.discover(room.id, this.roomManager.previousRoomId, this.roomManager.spawnSide, room.type === 'hub' ? 'hub' : room.sectionId);
    this.menu.refreshMap();
    this.enemies = (room.enemies ?? []).filter((enemy) => enemy.type === 'chaser').map((enemy, index) => this.spawnChaser(enemy, room, index));
    this.xpOrbs = [];
    this.keys = (room.keys ?? []).filter((key) => !this.collectedKeys.has(`${room.id}:${key.id}`));
    this.chests = [];
    this.droppedItems = [];
    const configs = room.chests?.length ? room.chests : room.chest ? [room.chest] : [];
    configs.forEach((config, index) => this.loadChest(config, index));
    if (this.challengeStates[room.id]) this.loadChest({ id: 'challenge-reward', x: room.width / 2, y: room.height / 2, itemId: 'random' }, 'challenge');
    this.syncChestAliases();
    this.combat.onRoomEnter();
    this.story.enterRoom();
    this.camera.position.x = Math.max(0, Math.min(room.width - this.canvas.width, this.player.position.x - this.canvas.width / 2));
    this.camera.position.y = Math.max(0, Math.min(room.height - this.canvas.height, this.player.position.y - this.canvas.height / 2));
    this.refreshEquipmentStats();
  }

  loadChest(config, index) {
    const roomId = this.roomManager.currentId;
    const id = `${roomId}:${config.id ?? `chest-${index}`}`;
    if (this.collectedChests.has(id) || (index === 0 && this.collectedChests.has(roomId))) return;
    const saved = this.chestStates[id] ?? (index === 0 ? this.chestStates[roomId] : null);
    const chest = new Chest(config.x, config.y, config.itemId ?? 'random');
    chest.id = id;
    chest.config = config;
    chest.restore(saved);
    if (chest.hasDropped || chest.state === 'opened') {
      const loot = saved?.loot ?? this.createChestLoot(config);
      this.droppedItems.push({ id, x: config.x, y: config.y, bob: 0, items: loot, chestId: id });
    } else this.chests.push(chest);
  }

  syncChestAliases() {
    this.chest = this.chests[0] ?? null;
    this.droppedItem = this.droppedItems[0] ?? null;
  }

  createChestLoot(config) {
    const level = this.player.level;
    if (config.starter || config.itemId === 'default-sword' && !this.storyState.starterCollected) {
      if (this.hardmodePending) return this.storyState.recoveryItems ?? [createSwordItem(level), createAbilityItem('map-view', level)];
      return [createSwordItem(level), createAbilityItem('map-view', level), createAbilityItem('dash', level)];
    }
    const roll = Math.random();
    const rarity = config.rarity ?? (roll < 0.05 ? 'unique' : roll < 0.25 ? 'epic' : roll < 0.55 ? 'rare' : 'common');
    const types = rarity === 'unique' ? ['scythe', 'swift-armor', 'tanker-armor', 'trinket'] : ['sword', 'spear', 'daggers', 'gun', 'swift-armor', 'tanker-armor', 'trinket'];
    const type = config.itemId && !['random', 'default-sword'].includes(config.itemId) ? config.itemId : types[Math.floor(Math.random() * types.length)];
    if (ABILITY_TYPES[type]) return [createAbilityItem(type, level)];
    const item = createGearItem(type, level, rarity);
    if (type === 'shield') item.protected = true;
    return [item];
  }

  spawnChaser(config, room, index) {
    const level = config.level ?? this.rollChaserLevel();
    const spawn = { x: config.x, y: config.y };
    for (let attempt = 0; !config.exactSpawn && attempt < 8; attempt += 1) {
      const candidate = { x: config.x + (Math.random() - 0.5) * 120, y: config.y + (Math.random() - 0.5) * 120 };
      if (candidate.x > 57 && candidate.x < room.width - 57 && candidate.y > 57 && candidate.y < room.height - 57 && !positionHitsWall(candidate, 17, this.currentWorld().walls)) { spawn.x = candidate.x; spawn.y = candidate.y; break; }
    }
    return new Chaser({ ...config, id: config.id ?? `${room.id}-chaser-${index}`, level: this.hardmode ? level + 2 : level, x: spawn.x, y: spawn.y });
  }

  rollChaserLevel() {
    const roll = Math.random();
    if (roll < 0.72) return 1;
    if (roll < 0.9) return 2;
    if (roll < 0.97) return 3;
    if (roll < 0.995) return 4;
    return 5;
  }

  beginInitialLoad() {
    this.initialLoadingTimer = 0.9;
    this.setMode(GAME_MODES.LOADING);
  }

  update(deltaTime) {
    if (this.mode === GAME_MODES.PLAYING) {
      if (this.story.frozen) return;
      const mouse = this.input.mouseWorld(this.camera);
      const aimAngle = Math.atan2(mouse.y - this.player.position.y, mouse.x - this.player.position.x);
      const aimDirection = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
      this.interactionConsumed = false;
      this.player.update(deltaTime, this.input, this.currentWorld(), aimDirection);
      this.combat.update(deltaTime);
      if (this.mode !== GAME_MODES.PLAYING) return;
      if (this.input.wasMousePressed('mouse1') || this.input.wasPressed('space')) {
        if (this.combat.attack()) this.audio?.play(this.sword.type === 'gun' ? 'gun' : 'attack');
      }
      if (this.input.wasMousePressed('mouse2') && this.combat.special()) this.audio?.play('special');
      this.story.update(deltaTime);
      if (this.story.frozen || this.mode !== GAME_MODES.PLAYING) return;
      this.updateEnemies(deltaTime);
      collectLevelTokens(this.player, this.inventory);
      this.updateDoorRequirements();
      this.updateKeysAndDoors();
      this.updateChest(deltaTime);
      if (this.player.health <= 0) {
        this.setMode(GAME_MODES.GAME_OVER);
        return;
      }
      if (this.mode !== GAME_MODES.PLAYING) return;
      this.roomManager.checkExit(this.player, (door) => this.canUseDoor(door));
      if (this.roomManager.loading) this.setMode(GAME_MODES.LOADING);
      this.camera.follow(this.player.position, deltaTime);
    }

    if (this.mode === GAME_MODES.LOADING) {
      if (this.roomManager.loading && this.roomManager.update(deltaTime, this.player)) {
        const enteredRoomId = this.roomManager.currentId;
        this.loadCurrentRoom();
        this.menu.refreshMap();
        this.setMode(GAME_MODES.PLAYING);
      } else if (!this.roomManager.loading) {
        this.initialLoadingTimer -= deltaTime;
        if (this.initialLoadingTimer <= 0) this.setMode(GAME_MODES.PLAYING);
      }
    }
  }

  resolveSwordHit() {
    const swingAngle = this.sword.swingAngle;
    this.enemies.forEach((enemy) => {
      const distance = Math.hypot(enemy.position.x - this.player.position.x, enemy.position.y - this.player.position.y);
      const targetAngle = Math.atan2(enemy.position.y - this.player.position.y, enemy.position.x - this.player.position.x);
      const sneakAttack = enemy.alertTimer <= 0 && enemy.state === 'roaming';
      if (enemy.health > 0 && distance < 105 && Math.abs(Math.atan2(Math.sin(targetAngle - swingAngle), Math.cos(targetAngle - swingAngle))) < 1.15) {
        const defeated = enemy.takeDamage(this.sword.damage, sneakAttack);
        if (sneakAttack && !defeated) enemy.alertFromHit();
        if (defeated && !enemy.xpDropped) {
          enemy.xpDropped = true;
          this.spawnExperience(enemy.position.x, enemy.position.y);
        }
      }
    });
  }

  damageEnemy(enemy, amount, sneakAttack = false) {
    if (enemy.health <= 0) return;
    const previousHealth = enemy.health;
    const defeated = enemy.takeDamage(amount, sneakAttack);
    if (enemy.health === previousHealth) return;
    if (this.player.lifeSteal) this.player.health = Math.min(this.player.maxHealth, this.player.health + Math.min(previousHealth, previousHealth - enemy.health) * this.player.lifeSteal);
    this.audio?.play('hit');
    if (!defeated) enemy.alertFromHit();
    this.combat.emitHit(enemy.position.x, enemy.position.y, defeated);
    if (!defeated || enemy.xpDropped) return;
    enemy.xpDropped = true;
    this.spawnExperience(enemy.position.x, enemy.position.y, enemy.level);
    const worn = [enemy.weaponType, enemy.armorType].filter(Boolean);
    if (worn.length && Math.random() < 0.3) {
      const type = worn[Math.floor(Math.random() * worn.length)];
      const rarityRoll = Math.random();
      const item = createGearItem(type, this.player.level, rarityRoll < 0.1 ? 'epic' : rarityRoll < 0.35 ? 'rare' : 'common');
      this.droppedItems.push({ x: enemy.position.x, y: enemy.position.y, bob: 0, items: [item] });
    }
  }

  onBossDefeated() {
    this.bossStates[this.roomManager.currentId] = true;
    this.storyState.pigDefeated = true;
    this.spawnExperience(this.player.position.x, this.player.position.y, 10);
    this.story.bossDefeated();
  }

  updateEnemies(deltaTime) {
    const world = this.currentWorld();
    world.enemies = this.enemies;
    this.enemies.forEach((enemy) => enemy.update(deltaTime, this.player, world));
    this.xpOrbs.forEach((orb) => {
      orb.bob += deltaTime * 4;
      const distance = Math.hypot(this.player.position.x - orb.x, this.player.position.y - orb.y);
      if (distance < 260 && distance > 0) {
        const speed = Math.min(distance, (140 + (260 - distance) * 2) * deltaTime);
        orb.x += (this.player.position.x - orb.x) / distance * speed;
        orb.y += (this.player.position.y - orb.y) / distance * speed;
      }
      if (distance < 28) {
        orb.collected = true;
        this.player.addExperience(orb.value);
      }
    });
    this.xpOrbs = this.xpOrbs.filter((orb) => !orb.collected);
    this.enemyStates[this.roomManager.currentId] = Object.fromEntries(this.enemies.map((enemy) => [enemy.id, enemy.serialize()]));
  }

  updateKeysAndDoors() {
    if (!this.input.wasPressed('e')) return;
    const roomId = this.roomManager.currentId;
    const current = this.roomManager.current;
    const near = (object, range = 70) => Math.hypot(this.player.position.x - object.x, this.player.position.y - object.y) < range;
    if (this.story.tipBoxAvailable(current) && near(current.tipBox ?? { x: current.width / 2, y: current.height / 2 }, 85)) {
      this.interactionConsumed = true;
      this.openTipBox();
      return;
    }
    const wallSwitch = (current.switches ?? []).find((entry) => near(entry));
    if (wallSwitch) {
      this.interactionConsumed = true;
      this.story.say(activateSwitch(this, wallSwitch) ? 'Switch activated. Its linked door is now open.' : 'This switch is not linked to a door.');
      return;
    }
    const terminal = (current.terminals ?? []).find((entry) => near(entry));
    if (terminal) {
      this.interactionConsumed = true;
      if (takeTerminalOffline(this, terminal)) this.story.terminalOffline(terminal.number);
      else this.story.say(`Terminal ${terminal.number} is already offline.`);
      return;
    }
    const nearbyKey = this.keys.find((key) => Math.hypot(this.player.position.x - key.x, this.player.position.y - key.y) < 60);
    if (nearbyKey) {
      this.interactionConsumed = true;
      const carriedKey = this.inventory.items.find((item) => item.id === `key-${nearbyKey.color}`);
      if (carriedKey) carriedKey.quantity = (carriedKey.quantity ?? 1) + 1;
      else this.inventory.items.push(createKeyItem(nearbyKey.color));
      this.collectedKeys.add(`${roomId}:${nearbyKey.id}`);
      this.keys = this.keys.filter((key) => key !== nearbyKey);
      this.menu.refreshInventory();
      return;
    }
    const lockedDoor = (this.roomManager.current.doors ?? []).find((door) => door.lockedColor && (!door.requirement || door.requirement === 'key') && !this.isDoorUnlocked(door) && Math.hypot(this.player.position.x - (door.x + door.width / 2), this.player.position.y - (door.y + door.height / 2)) < 70);
    if (!lockedDoor) return;
    const keyIndex = this.inventory.items.findIndex((item) => item.id === `key-${lockedDoor.lockedColor}`);
    if (keyIndex < 0) return;
    if ((this.inventory.items[keyIndex].quantity ?? 1) > 1) this.inventory.items[keyIndex].quantity -= 1;
    else this.inventory.items.splice(keyIndex, 1);
    this.interactionConsumed = true;
    unlockDoor(this, lockedDoor);
    this.audio?.play('unlock');
    this.menu.refreshInventory();
  }

  updateDoorRequirements() {
    const roomId = this.roomManager.currentId;
    (this.roomManager.current.doors ?? []).forEach((door) => {
      if (door.requirement !== 'all-enemies' || this.isDoorUnlocked(door)) return;
      if (!this.enemies.some((enemy) => enemy.health > 0) && !this.combat.boss?.health) unlockDoor(this, door);
    });
    const room = this.roomManager.current;
    if (room.type === 'challenge' && !this.challengeStates[roomId] && this.enemies.length && !this.enemies.some((enemy) => enemy.health > 0) && !this.combat.boss?.health) {
      this.challengeStates[roomId] = true;
      this.loadChest({ id: 'challenge-reward', x: this.player.position.x, y: this.player.position.y, itemId: 'random' }, 'challenge');
      this.story.say('Challenge cleared. A one-use loot chest has appeared.');
    }
  }

  spawnExperience(x, y, level = 1) {
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      this.xpOrbs.push({ x: x + Math.cos(angle) * (14 + index * 2), y: y + Math.sin(angle) * (14 + index * 2), bob: index, value: Math.max(1, level), collected: false });
    }
  }

  updateChest(deltaTime) {
    this.droppedItems.forEach((item) => { item.bob += deltaTime * 3; });
    for (const chest of this.chests) {
      chest.update(deltaTime);
      let loot = this.chestStates[chest.id]?.loot;
      if (chest.hasDropped && !loot) {
        loot = this.createChestLoot(chest.config);
        this.droppedItems.push({ id: chest.id, x: chest.position.x, y: chest.position.y, bob: 0, items: loot, chestId: chest.id });
      }
      this.chestStates[chest.id] = { ...chest.serialize(), ...(loot ? { loot } : {}) };
    }
    this.chests = this.chests.filter((chest) => chest.state !== 'opened');
    if (this.input.wasPressed('e') && !this.interactionConsumed) {
      const drop = this.droppedItems.find((item) => Math.hypot(this.player.position.x - item.x, this.player.position.y - item.y) < 60);
      if (drop) {
        this.audio?.play('pickup');
        for (const item of drop.items) if (!this.inventory.items.some((existing) => existing.id === item.id)) this.inventory.items.push(item);
        if (drop.items.some((item) => item.type === 'shield')) this.storyState.shieldUnlocked = true;
        if (drop.chestId) {
          this.collectedChests.add(drop.chestId);
          this.chests = this.chests.filter((chest) => chest.id !== drop.chestId);
          if (drop.items.some((item) => item.id === 'default-sword')) this.storyState.starterCollected = true;
        }
        this.droppedItems = this.droppedItems.filter((item) => item !== drop);
        this.refreshEquipmentStats();
        const starter = drop.items.some((item) => item.id === 'default-sword');
        if (!starter || !this.story.starterCollected()) this.story.say(`Picked up ${drop.items.map((item) => item.name).join(', ')}. Open I to equip.`);
      } else {
        const chest = this.chests.find((entry) => entry.state === 'closed' && Math.hypot(this.player.position.x - entry.position.x, this.player.position.y - entry.position.y) < 70);
        chest?.interact();
      }
    }
    this.syncChestAliases();
  }

  draw() {
    const room = this.roomManager.current;
    const doors = (room.doors ?? []).filter((door) => !isBarrier(door) || !this.canUseDoor(door)).map((door) => this.hardmode && door.hardmodeTerminal ? { ...door, lockedColor: null, requirement: 'terminal', terminalNumber: door.hardmodeTerminal } : door);
    const interactables = [
      ...(room.switches ?? []).map((entry) => ({ ...entry, type: 'switch', active: Boolean(this.switchStates[`${room.id}:${entry.id}`]) })),
      ...(room.terminals ?? []).map((entry) => ({ ...entry, type: 'terminal', offline: Boolean(this.terminalsOffline[entry.number]) })),
      ...(this.story.tipBoxAvailable(room) ? [{ ...(room.tipBox ?? { x: room.width / 2, y: room.height / 2 }), type: 'tip-box' }] : [])
    ];
    const loot = this.droppedItems.map((drop) => ({ ...drop, item: drop.items[0] }));
    this.renderer.world = this.currentWorld();
    this.renderer.draw(this.player, this.camera, this.isSwordEquipped() ? this.sword : null, this.chest, null, this.enemies, this.xpOrbs, doors, this.keys, { ...this.combat.effects, fog: this.debugFog !== false, roomType: room.type, reducedMotion: this.settings?.reducedMotion, screenShake: this.settings?.screenShake && !this.settings?.reducedMotion ? this.combat.effects.screenShake : false, interactables, loot, chests: this.chests.slice(1) });
    if (this.mode === GAME_MODES.ROOM_VIEW) this.renderer.drawRoomOverview(this.player, this.chest, this.droppedItem, this.enemies, this.xpOrbs);
    this.hud.update(this.player, this.inventory, this.combat);
    if (this.mode === GAME_MODES.LOADING) this.renderer.drawLoading(1 - this.roomManager.transitionTimer / 0.75);
  }

  loop(time) {
    const deltaTime = Math.min((time - this.previousTime) / 1000 || 0, 0.05);
    this.previousTime = time;
    if (this.input.wasPressed('escape')) {
      if (this.mode === GAME_MODES.PLAYING) this.setMode(GAME_MODES.PAUSED);
      else if (this.mode === GAME_MODES.PAUSED) this.setMode(GAME_MODES.PLAYING);
      else if ([GAME_MODES.INVENTORY, GAME_MODES.SETTINGS, GAME_MODES.MAP].includes(this.mode)) this.menu.handle('back');
      else if ([GAME_MODES.TIP_BOX, GAME_MODES.ROOM_VIEW].includes(this.mode)) this.menu.handle('back');
    }
    const interactiveMode = [GAME_MODES.PLAYING, GAME_MODES.PAUSED, GAME_MODES.INVENTORY, GAME_MODES.MAP, GAME_MODES.ROOM_VIEW].includes(this.mode);
    const hasMap = this.player.equippedAbilityTypes?.includes('map-view');
    if (this.hasStarted && interactiveMode && hasMap && this.input.wasPressed('m')) {
      if (this.mode === GAME_MODES.MAP) this.setMode(this.mapReturnMode);
      else {
        this.mapReturnMode = this.mode;
        this.setMode(GAME_MODES.MAP);
      }
    }
    if (this.hasStarted && hasMap && this.input.wasPressed('n') && (this.mode === GAME_MODES.PLAYING || this.mode === GAME_MODES.ROOM_VIEW)) {
      this.setMode(this.mode === GAME_MODES.ROOM_VIEW ? GAME_MODES.PLAYING : GAME_MODES.ROOM_VIEW);
    }
    if (this.input.wasPressed('i') && this.hasStarted && interactiveMode) {
      if (this.mode === GAME_MODES.INVENTORY) {
        this.setMode(this.inventoryReturnMode);
      } else {
        this.inventoryReturnMode = this.mode;
        this.setMode(GAME_MODES.INVENTORY);
      }
    }
    if (this.hasStarted && interactiveMode && this.input.wasPressed('1')) this.selectWeapon(0);
    if (this.hasStarted && interactiveMode && this.input.wasPressed('2')) this.selectWeapon(1);
    if (this.hasStarted && interactiveMode && this.input.wasPressed('3')) this.selectWeapon(2);
    this.update(deltaTime);
    this.draw();
    this.input.endFrame();
    requestAnimationFrame((nextTime) => this.loop(nextTime));
  }
}
