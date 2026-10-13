import { Camera } from './camera.js';
import { GAME_MODES } from './game-state.js';
import { createInventory, createKeyItem, createSwordItem, restoreInventory } from './inventory.js';
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

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input(canvas);
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
    this.mapReturnMode = GAME_MODES.PLAYING;
    this.mode = GAME_MODES.MENU;
    this.inventoryReturnMode = GAME_MODES.PLAYING;
    this.hasStarted = false;
    this.initialLoadingTimer = 0;
    this.previousTime = 0;
    this.menu = new Menu(this);
  }

  start() {
    this.setMode(GAME_MODES.MENU);
    requestAnimationFrame((time) => this.loop(time));
  }

  newGame() {
    this.roomManager = new RoomManager();
    this.player = new Player(480, 300);
    this.inventory = createInventory();
    this.chestStates = {};
    this.collectedChests = new Set();
    this.enemies = [];
    this.xpOrbs = [];
    this.mapSystem = new MapSystem();
    this.loadCurrentRoom();
    if (this.roomManager.current.spawn) this.player.position = { ...this.roomManager.current.spawn };
    this.hasStarted = true;
    this.beginInitialLoad();
  }

  continueGame() {
    const save = this.saveSystem.load();
    if (!save) return this.newGame();
    this.roomManager.currentId = save.roomId;
    this.player.restore(save.player);
    this.inventory = restoreInventory(save.inventory);
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
    this.mapSystem.restore(save.map);
    this.loadCurrentRoom();
    this.hasStarted = true;
    this.beginInitialLoad();
  }

  setMode(mode) {
    this.mode = mode;
    this.menu.update(mode);
    if (mode === GAME_MODES.PAUSED && this.hasStarted) this.saveSystem.save(this);
  }

  equipItem(itemId) {
    const item = this.inventory.items.find((entry) => entry.id === itemId);
    if (!item || item.placeholder || item.slot === 'key') return;
    const equipmentSlot = item.slot === 'weapon' ? 'weapons' : item.slot;
    const weaponIndex = item.slot === 'weapon' ? item.weaponIndex ?? this.inventory.equipment.activeWeapon : null;
    const previousId = item.slot === 'weapon' ? this.inventory.equipment.weapons[weaponIndex] : this.inventory.equipment[equipmentSlot];
    const previousItem = this.inventory.items.find((entry) => entry.id === previousId);
    if (previousItem) previousItem.equipped = false;
    if (item.slot === 'weapon') this.inventory.equipment.weapons[weaponIndex] = item.id;
    else this.inventory.equipment[equipmentSlot] = item.id;
    item.equipped = true;
    this.menu.refreshInventory();
  }

  unequipItem(itemId) {
    const item = this.inventory.items.find((entry) => entry.id === itemId);
    if (!item || item.placeholder) return;
    if (item.slot === 'weapon') {
      const weaponIndex = this.inventory.equipment.weapons.indexOf(item.id);
      if (weaponIndex >= 0) this.inventory.equipment.weapons[weaponIndex] = null;
    } else if (this.inventory.equipment[item.slot] === item.id) {
      this.inventory.equipment[item.slot] = null;
    }
    item.equipped = false;
    this.menu.refreshInventory();
  }

  dropItem(itemId) {
    const item = this.inventory.items.find((entry) => entry.id === itemId);
    if (!item) return;
    if (item.slot === 'weapon') {
      const weaponIndex = this.inventory.equipment.weapons.indexOf(item.id);
      if (weaponIndex >= 0) this.inventory.equipment.weapons[weaponIndex] = null;
    } else if (this.inventory.equipment[item.slot] === item.id) this.inventory.equipment[item.slot] = null;
    this.inventory.items = this.inventory.items.filter((entry) => entry.id !== itemId);
    this.menu.refreshInventory();
  }

  selectWeapon(index) {
    if (index < 0 || index > 2) return;
    this.inventory.equipment.activeWeapon = index;
    this.menu.refreshInventory();
  }

  isSwordEquipped() {
    const activeWeaponId = this.inventory.equipment.weapons[this.inventory.equipment.activeWeapon];
    return activeWeaponId === 'default-sword';
  }

  currentWorld() {
    const room = this.roomManager.current;
    const lockedWalls = (room.doors ?? []).filter((door) => door.lockedColor && !this.isDoorUnlocked(door)).map((door) => ({ x: door.x, y: door.y, width: door.width, height: door.height }));
    const openings = (room.doors ?? []).filter((door) => !door.lockedColor || this.isDoorUnlocked(door)).map((door) => ({ x: door.x, y: door.y, width: door.width, height: door.height }));
    return { ...room, walls: [...carveOpenings(room.walls, openings), ...lockedWalls], openings: [] };
  }

  isDoorUnlocked(door) {
    return Boolean(this.doorStates[this.roomManager.currentId]?.[door.id]);
  }

  loadCurrentRoom() {
    const room = this.roomManager.current;
    this.camera.worldWidth = room.width;
    this.camera.worldHeight = room.height;
    this.renderer.world = room;
    this.hud.setRoomName(room.name);
    this.menu.refreshMap();
    this.enemies = (room.enemies ?? []).filter((enemy) => enemy.type === 'chaser').map((enemy, index) => this.spawnChaser(enemy, room, index));
    this.xpOrbs = [];
    this.keys = (room.keys ?? []).filter((key) => !this.collectedKeys.has(`${room.id}:${key.id}`));
    this.droppedItem = null;
    const roomChest = room.chest ?? room.chests?.[0];
    const savedChest = this.chestStates[room.id];
    this.chest = roomChest && !this.collectedChests.has(room.id) && savedChest?.state !== 'opened' ? new Chest(roomChest.x, roomChest.y, roomChest.itemId) : null;
    if (this.chest) {
      this.chest.restore(savedChest);
    }
    if (roomChest && !this.collectedChests.has(room.id) && (savedChest?.hasDropped || savedChest?.state === 'opened')) {
      this.droppedItem = { x: roomChest.x, y: roomChest.y, bob: 0, itemId: roomChest.itemId };
    }
  }

  spawnChaser(config, room, index) {
    const level = config.level ?? this.rollChaserLevel();
    const spawn = { x: config.x, y: config.y };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = { x: config.x + (Math.random() - 0.5) * 120, y: config.y + (Math.random() - 0.5) * 120 };
      if (!positionHitsWall(candidate, 17, room.walls)) { spawn.x = candidate.x; spawn.y = candidate.y; break; }
    }
    return new Chaser({ ...config, id: config.id ?? `${room.id}-chaser-${index}`, level, x: spawn.x, y: spawn.y });
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
      const mouse = this.input.mouseWorld(this.camera);
      this.sword.update(deltaTime, Math.atan2(mouse.y - this.player.position.y, mouse.x - this.player.position.x));
      const aimDirection = { x: Math.cos(this.sword.aimAngle), y: Math.sin(this.sword.aimAngle) };
      this.player.update(deltaTime, this.input, this.currentWorld(), aimDirection);
      if (this.input.wasMousePressed('mouse1') && this.isSwordEquipped() && this.sword.attack()) this.resolveSwordHit();
      this.updateEnemies(deltaTime);
      this.updateDoorRequirements();
      this.updateKeysAndDoors();
      this.updateChest(deltaTime);
      if (this.player.health <= 0) {
        this.setMode(GAME_MODES.GAME_OVER);
        return;
      }
      this.roomManager.checkExit(this.player);
      if (this.roomManager.loading) this.setMode(GAME_MODES.LOADING);
      this.camera.follow(this.player.position, deltaTime);
      this.saveSystem.save(this);
    }

    if (this.mode === GAME_MODES.LOADING) {
      if (this.roomManager.loading && this.roomManager.update(deltaTime, this.player)) {
        const enteredRoomId = this.roomManager.currentId;
        this.loadCurrentRoom();
        this.mapSystem.discover(enteredRoomId, this.roomManager.previousRoomId, this.roomManager.spawnSide);
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

  updateEnemies(deltaTime) {
    this.enemies.forEach((enemy) => enemy.update(deltaTime, this.player, this.currentWorld()));
    this.xpOrbs.forEach((orb) => {
      orb.bob += deltaTime * 4;
      if (Math.hypot(this.player.position.x - orb.x, this.player.position.y - orb.y) < 28) {
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
    const nearbyKey = this.keys.find((key) => Math.hypot(this.player.position.x - key.x, this.player.position.y - key.y) < 60);
    if (nearbyKey) {
      if (!this.inventory.items.some((item) => item.id === `key-${nearbyKey.color}`)) this.inventory.items.push(createKeyItem(nearbyKey.color));
      this.collectedKeys.add(`${roomId}:${nearbyKey.id}`);
      this.keys = this.keys.filter((key) => key !== nearbyKey);
      this.menu.refreshInventory();
      return;
    }
    const lockedDoor = (this.roomManager.current.doors ?? []).find((door) => door.lockedColor && !this.doorStates[roomId]?.[door.id] && Math.hypot(this.player.position.x - (door.x + door.width / 2), this.player.position.y - (door.y + door.height / 2)) < 70);
    if (!lockedDoor) return;
    const keyIndex = this.inventory.items.findIndex((item) => item.id === `key-${lockedDoor.lockedColor}`);
    if (keyIndex < 0) return;
    this.inventory.items.splice(keyIndex, 1);
    this.doorStates[roomId] = { ...(this.doorStates[roomId] ?? {}), [lockedDoor.id]: true };
    this.menu.refreshInventory();
  }

  updateDoorRequirements() {
    const roomId = this.roomManager.currentId;
    (this.roomManager.current.doors ?? []).forEach((door) => {
      if (door.requirement !== 'all-enemies' || this.isDoorUnlocked(door)) return;
      if (!this.enemies.some((enemy) => enemy.health > 0)) this.doorStates[roomId] = { ...(this.doorStates[roomId] ?? {}), [door.id]: true };
    });
  }

  spawnExperience(x, y) {
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      this.xpOrbs.push({ x: x + Math.cos(angle) * (14 + index * 2), y: y + Math.sin(angle) * (14 + index * 2), bob: index, value: 1, collected: false });
    }
  }

  updateChest(deltaTime) {
    if (this.droppedItem) this.droppedItem.bob += deltaTime * 3;
    if (this.chest) {
      this.chest.update(deltaTime);
      this.chestStates[this.roomManager.currentId] = this.chest.serialize();
      if (this.chest.hasDropped && !this.droppedItem) this.droppedItem = { x: this.chest.position.x, y: this.chest.position.y, bob: 0, itemId: this.chest.itemId };
      if (this.chest.state === 'opened') this.chest = null;
    }
    if (this.droppedItem && Math.hypot(this.player.position.x - this.droppedItem.x, this.player.position.y - this.droppedItem.y) < 60) {
      if (!this.input.wasPressed('e')) return;
      if (!this.inventory.items.some((item) => item.id === 'default-sword')) this.inventory.items.push(createSwordItem());
      this.droppedItem = null;
      this.collectedChests.add(this.roomManager.currentId);
      this.chest = null;
      this.menu.refreshInventory();
      return;
    }
    if (!this.chest || !this.input.wasPressed('e')) return;
    if (this.chest.state === 'closed' && Math.hypot(this.player.position.x - this.chest.position.x, this.player.position.y - this.chest.position.y) < 70) this.chest.interact();
  }

  draw() {
    const room = this.roomManager.current;
    const doors = (room.doors ?? []).filter((door) => !door.lockedColor || !this.isDoorUnlocked(door));
    this.renderer.draw(this.player, this.camera, this.isSwordEquipped() ? this.sword : null, this.chest, this.droppedItem, this.enemies, this.xpOrbs, doors, this.keys);
    if (this.mode === GAME_MODES.ROOM_VIEW) this.renderer.drawRoomOverview(this.player, this.chest, this.droppedItem, this.enemies, this.xpOrbs);
    this.hud.update(this.player);
    if (this.mode === GAME_MODES.LOADING) this.renderer.drawLoading(1 - this.roomManager.transitionTimer / 0.75);
  }

  loop(time) {
    const deltaTime = Math.min((time - this.previousTime) / 1000 || 0, 0.05);
    this.previousTime = time;
    if (this.input.wasPressed('escape')) {
      if (this.mode === GAME_MODES.PLAYING) this.setMode(GAME_MODES.PAUSED);
      else if (this.mode === GAME_MODES.PAUSED) this.setMode(GAME_MODES.PLAYING);
    }
    if (this.hasStarted && this.input.wasPressed('m') && this.mode !== GAME_MODES.LOADING) {
      if (this.mode === GAME_MODES.MAP) this.setMode(this.mapReturnMode);
      else {
        this.mapReturnMode = this.mode;
        this.setMode(GAME_MODES.MAP);
      }
    }
    if (this.hasStarted && this.input.wasPressed('n') && (this.mode === GAME_MODES.PLAYING || this.mode === GAME_MODES.ROOM_VIEW)) {
      this.setMode(this.mode === GAME_MODES.ROOM_VIEW ? GAME_MODES.PLAYING : GAME_MODES.ROOM_VIEW);
    }
    if (this.input.wasPressed('i') && this.hasStarted && this.mode !== GAME_MODES.LOADING) {
      if (this.mode === GAME_MODES.INVENTORY) {
        this.setMode(this.inventoryReturnMode);
      } else {
        this.inventoryReturnMode = this.mode;
        this.setMode(GAME_MODES.INVENTORY);
      }
    }
    if (this.hasStarted && this.mode !== GAME_MODES.LOADING && this.input.wasPressed('1')) this.selectWeapon(0);
    if (this.hasStarted && this.mode !== GAME_MODES.LOADING && this.input.wasPressed('2')) this.selectWeapon(1);
    if (this.hasStarted && this.mode !== GAME_MODES.LOADING && this.input.wasPressed('3')) this.selectWeapon(2);
    this.update(deltaTime);
    this.draw();
    this.input.endFrame();
    requestAnimationFrame((nextTime) => this.loop(nextTime));
  }
}