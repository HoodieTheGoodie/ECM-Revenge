import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { StorySystem } from '../src/core/story.js';
import { CombatSystem } from '../src/core/combat.js';
import { SaveSystem } from '../src/core/save-system.js';
import { MapSystem } from '../src/core/map-system.js';
import { Player } from '../src/entities/player.js';
import { createInventory, createGearItem } from '../src/core/inventory.js';
import { takeTerminalOffline } from '../src/core/puzzles.js';

// Exercise real game transitions and persistence with only browser presentation stubbed.
function fixture({ tutorial = false } = {}) {
  const storage = new Map();
  const writes = [];
  const browser = { failWrites: false };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem(key, value) {
      if (browser.failWrites) throw new Error('Storage unavailable');
      storage.set(key, value);
      writes.push(key);
    }
  };
  globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} };
  const elements = new Map();
  globalThis.document = { querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, { hidden: true, textContent: '', handlers: {}, classList: { toggle() {}, remove() {} }, setAttribute() {}, focus() {}, contains() { return false; }, querySelector: (id) => document.querySelector(id), addEventListener(event, callback) { this.handlers[event] = callback; } });
    return elements.get(selector);
  } };
  const pressed = new Set();
  const game = Object.assign(Object.create(Game.prototype), {
    player: new Player(240, 140), inventory: createInventory(), settings: { reducedMotion: true },
    saveSystem: new SaveSystem(), mapSystem: new MapSystem(),
    canvas: { width: 960, height: 600 }, camera: { position: { x: 0, y: 0 }, follow() {} },
    renderer: {}, hud: { setRoomName() {} },
    menu: { update() {}, refreshInventory() {}, refreshMap() {}, refreshContinue() {} },
    input: { wasPressed: (key) => pressed.has(key), isDown: () => false, wasMousePressed: () => false, mouseWorld: () => ({ x: 900, y: 100 }), axis: () => ({ x: 0, y: 0 }) }
  });
  game.combat = new CombatSystem(game);
  game.story = new StorySystem(game);
  game.newGame();
  // Persistence tests may visit rooms directly; the dedicated tutorial tests exercise its gates.
  game.storyState.tutorialActive = tutorial;
  const click = (selector) => elements.get(selector).handlers.click();
  const enter = (id) => {
    game.roomManager.currentId = id;
    game.player.position = { ...(game.roomManager.current.spawn ?? { x: game.roomManager.current.width / 2, y: game.roomManager.current.height / 2 }) };
    game.loadCurrentRoom();
    game.setMode('playing');
  };
  const collectChest = () => {
    assert.ok(game.chests[0], 'room contains an unopened chest');
    const id = game.chests[0].id;
    game.player.position = { ...game.chests[0].position };
    pressed.add('e'); game.updateChest(0); pressed.clear();
    game.updateChest(0.86);
    game.updateChest(0.56);
    pressed.add('e'); game.updateChest(0); pressed.clear();
    return id;
  };
  return { game, storage, writes, browser, elements, pressed, click, enter, collectChest };
}

test('tutorial ambush waits for passing the empty hub trigger, freezes immediately, and never repeats', () => {
  const { game, click, enter } = fixture({ tutorial: true });
  assert.equal(game.story.frozen, true);
  click('#tippy-next');
  assert.equal(game.story.frozen, false);
  game.player.position.y = 1100;
  game.story.update(0.1);
  assert.equal(game.enemies.length, 0, 'no hallway ambush on Continue or movement');
  enter('main-hub');
  assert.equal(game.story.tipBoxAvailable(), false);
  assert.equal(game.saveProgress(), false);
  game.player.position = { x: 600, y: 380 };
  game.story.update(.1);
  assert.equal(game.enemies.length, 0);
  game.player.position = { x: 600, y: 500 };
  game.story.update(.1);
  assert.equal(game.enemies.length, 3);
  assert.ok(game.enemies.every((enemy) => enemy.alertTimer > 0 && enemy.position.y < game.player.position.y));
  assert.equal(game.story.frozen, true);
  const positions = game.enemies.map((enemy) => ({ ...enemy.position }));
  game.update(1);
  assert.deepEqual(game.enemies.map((enemy) => enemy.position), positions);
  click('#tippy-next');
  assert.equal(game.story.frozen, false);
  game.story.update(3.5);
  assert.equal(game.player.health, 100, 'there is no scripted instant death');
  game.story.update(.1);
  assert.equal(game.enemies.length, 3);
});

test('starter chest, forced return, actual save, five-tab tour and lore complete in order', () => {
  const { game, click, enter, collectChest, writes, browser } = fixture({ tutorial: true });
  click('#tippy-next');
  enter('main-hub');
  const section = game.roomManager.current.doors.find((d) => d.targetRoom === 'section-one-entry');
  const cache = game.roomManager.current.doors.find((d) => d.targetRoom === 'signal-cache');
  assert.equal(game.canUseDoor(section), false);
  assert.equal(game.canUseDoor(cache), false);
  game.player.position = { x: 600, y: 500 }; game.story.update(.1); click('#tippy-next');
  assert.equal(game.canUseDoor(cache), true);
  enter('signal-cache'); collectChest();
  assert.deepEqual(game.inventory.items.map((item) => item.type).sort(), ['dash', 'map-view', 'sword']);
  assert.equal(game.story.frozen, true);
  const back = game.roomManager.current.doors.find((d) => d.targetRoom === 'main-hub');
  assert.equal(game.canUseDoor(back), false);
  click('#tippy-next');
  for (const item of game.inventory.items) game.equipItem(item.id);
  assert.equal(game.canUseDoor(back), true);
  enter('main-hub');
  assert.equal(game.story.tipBoxAvailable(), true);
  assert.equal(game.story.canLeaveTipBox(), false);
  click('#tippy-next');
  assert.equal(game.mode, 'tip-box');
  assert.equal(writes.length, 0);
  browser.failWrites = true;
  assert.equal(game.saveProgress(), false);
  assert.equal(game.story.canLeaveTipBox(), false);
  browser.failWrites = false;
  assert.equal(game.saveProgress(), true);
  game.story.onCheckpointSaved();
  assert.equal(game.story.touring, true);
  assert.equal(game.story.canLeaveTipBox(), false);
  for (let i = 0; i < 6; i++) click('#tippy-next');
  assert.equal(game.storyState.tutorialTourComplete, true);
  assert.equal(game.storyState.loreHeard, true);
  assert.equal(game.story.canLeaveTipBox(), true);
  assert.equal(game.mode, 'playing');
  assert.equal(game.canUseDoor(section), true);
  assert.equal(game.saveSystem.load().story.tutorialTourComplete, true);
  game.continueGame();
  assert.equal(game.story.touring, false);
  assert.equal(game.enemies.length, 0);
});

for (const order of ['terminal-first', 'boss-first']) {
  test(`Terminal 1 and pig defeat trigger the reset in either order: ${order}`, () => {
    const { game, click, enter, writes, elements } = fixture();
    enter('flying-pig-arena');
    const terminal = () => {
      assert.equal(takeTerminalOffline(game, { number: 1 }), true);
      game.story.terminalOffline(1);
    };
    if (order === 'terminal-first') {
      terminal();
      assert.equal(game.mode, 'cutscene');
      click('#virus-next');
      assert.equal(game.hardmode, false);
      game.onBossDefeated();
    } else {
      game.onBossDefeated();
      assert.equal(game.mode, 'playing');
      terminal();
    }
    assert.equal(game.mode, 'cutscene');
    assert.match(elements.get('#virus-text').textContent, /How did you come back/);
    click('#virus-next');
    assert.equal(game.hardmode, true);
    assert.equal(game.hardmodePending, true);
    assert.equal(game.roomManager.currentId, 'signal-hall');
    assert.equal(game.mode, 'loading');
    assert.equal(writes.length, 0);
  });
}

test('Hardmode clears gear and tokens, then requires recovered Sword and Map View at the hub gate', () => {
  const { game, enter, collectChest } = fixture();
  game.giveTestEquipment();
  game.collectedChests.add('old:reward');
  game.collectedKeys.add('old:key');
  game.doorStates = { old: { door: true } };
  game.story.resetForHardmode();
  assert.equal(game.inventory.items.length, 0);
  assert.equal(game.inventory.tokens, 0);
  assert.equal(game.player.level, 1);
  assert.equal(game.collectedChests.size, 0);
  assert.equal(game.collectedKeys.size, 0);
  assert.deepEqual(game.doorStates, {});
  assert.deepEqual(game.terminalsOffline, { 1: true });
  enter('signal-cache');
  collectChest();
  assert.deepEqual(game.inventory.items.map((item) => item.type).sort(), ['map-view', 'sword']);
  enter('signal-lore');
  const gate = game.roomManager.current.doors.find((door) => door.targetRoom === 'main-hub');
  assert.equal(game.canUseDoor(gate), false);
  const sword = game.inventory.items.find((item) => item.type === 'sword');
  const map = game.inventory.items.find((item) => item.type === 'map-view');
  game.equipItem(sword.id, 0);
  assert.equal(game.canUseDoor(gate), false);
  game.equipItem(map.id, 0);
  assert.equal(game.canUseDoor(gate), true);
  game.dropItem(sword.id);
  game.dropItem(map.id);
  assert.equal(game.inventory.items.length, 2);
});

test('only re-entering the hub commits Hardmode and permanently opens the Section 2 route', () => {
  const { game, enter, collectChest, writes } = fixture();
  const sectionTwoDoor = game.roomManager.rooms['main-hub'].doors.find((door) => door.targetRoom === 'section-two-entry');
  assert.equal(game.canUseDoor(sectionTwoDoor), false);
  game.story.resetForHardmode();
  assert.equal(game.saveProgress(), false);
  enter('signal-cache');
  collectChest();
  game.inventory.items.forEach((item) => game.equipItem(item.id, 0));
  enter('signal-lore');
  assert.equal(writes.length, 0);
  enter('main-hub');
  assert.equal(writes.length, 1);
  assert.equal(game.hardmodePending, false);
  assert.equal(game.storyState.hardmodeCommitted, true);
  assert.equal(game.canUseDoor(sectionTwoDoor), true);
  const saved = game.saveSystem.load();
  assert.equal(saved.hardmode, true);
  assert.equal(saved.hardmodePending, false);
  assert.equal(saved.story.hardmodeCommitted, true);
  enter('section-two-entry');
  enter('main-hub');
  assert.equal(writes.length, 1, 'later hub visits do not autosave');
  game.player.health = 0;
  game.retryGame();
  assert.equal(game.hardmode, true);
  assert.equal(game.canUseDoor(sectionTwoDoor), true);
  assert.equal(writes.length, 1, 'loading the committed hub does not autosave again');
});

test('unsaved chest rewards and map discovery roll back on death without duplication', () => {
  const { game, enter, collectChest } = fixture();
  enter('main-hub');
  game.inventory.tokens = 7;
  assert.equal(game.saveProgress(), true);
  enter('section-one-entry');
  const chestId = collectChest();
  assert.equal(game.inventory.items.length, 1);
  assert.ok(game.collectedChests.has(chestId));
  game.player.health = 0;
  game.retryGame();
  assert.equal(game.roomManager.currentId, 'main-hub');
  assert.equal(game.inventory.tokens, 7);
  assert.equal(game.inventory.items.length, 0);
  assert.equal(game.collectedChests.has(chestId), false);
  game.mapSystem.activate('section-1');
  assert.equal(game.mapSystem.discovered.has('section-one-entry'), false);
  enter('section-one-entry');
  assert.equal(collectChest(), chestId);
  assert.equal(game.inventory.items.length, 1);
  enter('main-hub');
  game.saveProgress();
  game.player.health = 0;
  game.retryGame();
  enter('section-one-entry');
  assert.equal(game.chests.length, 0);
  assert.equal(game.droppedItems.length, 0);
  assert.equal(game.inventory.items.length, 1);
});

test('saved opened chests with uncollected rewards restore the same single drop', () => {
  const { game, enter, pressed } = fixture();
  enter('section-one-entry');
  game.player.position = { ...game.chests[0].position };
  pressed.add('e'); game.updateChest(0); pressed.clear();
  game.updateChest(0.86);
  game.updateChest(0.56);
  const rewardId = game.droppedItems[0].items[0].id;
  enter('main-hub');
  game.saveProgress();
  game.continueGame();
  enter('section-one-entry');
  assert.equal(game.chests.length, 0);
  assert.equal(game.droppedItems.length, 1);
  assert.equal(game.droppedItems[0].items[0].id, rewardId);
  enter('main-hub');
  enter('section-one-entry');
  assert.equal(game.droppedItems.length, 1);
  assert.equal(game.droppedItems[0].items[0].id, rewardId);
});

test('returning to the menu discards unsaved progress when continuing the campaign', () => {
  const { game, enter } = fixture();
  enter('main-hub');
  game.inventory.tokens = 3;
  game.saveProgress();
  game.inventory.tokens = 30;
  game.inventory.items.push(createGearItem('spear', 10, 'epic'));
  game.returnToMenu();
  game.continueGame();
  assert.equal(game.inventory.tokens, 3);
  assert.equal(game.inventory.items.length, 0);
});

test('death before the Hardmode hub autosave restores the previous checkpoint', () => {
  const { game, enter, writes } = fixture();
  enter('main-hub');
  game.inventory.tokens = 7;
  game.saveProgress();
  game.story.resetForHardmode();
  game.player.health = 0;
  game.retryGame();
  assert.equal(game.roomManager.currentId, 'main-hub');
  assert.equal(game.hardmode, false);
  assert.equal(game.inventory.tokens, 7);
  assert.equal(writes.length, 1);
});

test('manual Tip Box save commits Hardmode after a failed hub autosave', () => {
  const { game, enter, browser, writes, collectChest } = fixture();
  game.story.resetForHardmode();
  enter('signal-cache'); collectChest();
  game.inventory.items.forEach((item) => game.equipItem(item.id));
  browser.failWrites = true;
  enter('main-hub');
  assert.equal(game.hardmodePending, true);
  assert.equal(game.storyState.hardmodeCommitted, false);
  assert.equal(writes.length, 0);
  browser.failWrites = false;
  assert.equal(game.saveProgress(), true);
  assert.equal(game.hardmodePending, false);
  assert.equal(game.storyState.hardmodeCommitted, true);
  const saved = game.saveSystem.load();
  assert.equal(saved.hardmodePending, false);
  assert.equal(saved.story.hardmodeCommitted, true);
  game.player.health = 0;
  game.retryGame();
  assert.equal(game.roomManager.currentId, 'main-hub');
  assert.equal(game.hardmode, true);
});

test('Playground shortcuts test the real reset and checkpoint without changing the campaign save', () => {
  const { game, storage, writes, click, enter, collectChest } = fixture();
  enter('main-hub');
  game.inventory.tokens = 8;
  game.saveProgress();
  const campaign = storage.get('echo-maze-2-save');
  assert.equal(game.runPlaygroundAction('test-hardmode'), false);
  game.startPlayground();
  game.setMode('playing');
  assert.equal(game.runPlaygroundAction('test-hardmode'), true);
  assert.equal(game.mode, 'cutscene');
  assert.equal(writes.length, 1, 'test shortcut itself does not save');
  click('#virus-next');
  game.setMode('playing');
  assert.equal(game.runPlaygroundAction('test-hub-return'), false);
  assert.equal(game.runPlaygroundAction('test-lab-return'), false);
  assert.equal(game.runPlaygroundAction('test-recovery'), true);
  game.setMode('playing');
  collectChest();
  assert.deepEqual(game.inventory.items.map((item) => item.type).sort(), ['map-view', 'sword']);
  assert.equal(game.runPlaygroundAction('test-hub-return'), false);
  game.inventory.items.forEach((item) => game.equipItem(item.id, 0));
  assert.equal(game.runPlaygroundAction('test-hub-return'), true);
  assert.equal(game.roomManager.currentId, 'main-hub');
  assert.equal(game.hardmodePending, false);
  assert.equal(writes.at(-1), 'echo-maze-2-save-playground');
  assert.equal(storage.get('echo-maze-2-save'), campaign);
  game.returnToMenu();
  game.continuePlayground();
  assert.equal(game.hardmode, true);
  assert.equal(game.roomManager.currentId, 'main-hub');
  assert.equal(storage.get('echo-maze-2-save'), campaign);
  game.returnToMenu();
  game.continueGame();
  assert.equal(game.hardmode, false);
  assert.equal(game.inventory.tokens, 8);
});

test('reloading a checkpoint restores ammunition and special cooldowns', () => {
  const { game, enter } = fixture();
  game.giveTestEquipment();
  enter('main-hub');
  game.sword.ammo = 3;
  game.sword.rechargeTimer = 2;
  game.combat.specialCooldowns = { spear: 2.5 };
  game.saveProgress();
  game.sword.ammo = 0;
  game.combat.specialCooldowns.spear = 0;
  game.continueGame();
  assert.equal(game.sword.ammo, 3);
  assert.equal(game.sword.rechargeTimer, 2);
  assert.equal(game.combat.specialCooldowns.spear, 2.5);
});
