import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEquipmentStats, collectLevelTokens, createAbilityItem, createGearItem, createInventory, createKeyItem, createSwordItem, restoreInventory } from '../src/core/inventory.js';
import { getItemHint } from '../src/core/item-hints.js';
import { itemIcon } from '../src/ui/item-icons.js';
import { allocateSkill, buyShopItem, grindItem, improveGear, resetSkills } from '../src/core/progression.js';
import { Player } from '../src/entities/player.js';
import { Menu } from '../src/ui/menu.js';

test('legacy inventory restores its sword, new slots and new progression defaults', () => {
  const inventory = restoreInventory({ items: [{ id: 'default-sword', name: 'Default Sword', slot: 'weapon', equipped: true }], equipment: { weapons: ['default-sword', 'missing'], activeWeapon: 0 } });
  assert.equal(inventory.items[0].type, 'sword');
  assert.equal(inventory.items[0].stats.damage, 10);
  assert.deepEqual(inventory.equipment.weapons, ['default-sword', null, null]);
  assert.deepEqual(inventory.equipment.abilities, [null, null, null, null, null]);
  assert.equal(inventory.tokens, 0);
  const player = new Player(100, 100);
  applyEquipmentStats(player, inventory);
  assert.equal(player.health, 100);
  assert.equal(player.damageMultiplier, 1);
});

test('gear scales when it drops and Unique base stats last across several levels', () => {
  const common = createGearItem('sword', 1, 'common');
  const rare = createGearItem('sword', 1, 'rare');
  const epic = createGearItem('sword', 1, 'epic');
  const unique = createGearItem('sword', 1, 'unique');
  assert.equal(common.buffs.length, 0);
  assert.equal(rare.buffs.length, 0);
  assert.equal(epic.buffs.length, 1);
  assert.ok(common.stats.damage < rare.stats.damage && rare.stats.damage < epic.stats.damage);
  assert.ok(unique.stats.damage > createGearItem('sword', 6, 'common').stats.damage);
  assert.ok(unique.stats.damage > createGearItem('sword', 9, 'common').stats.damage);
  assert.ok(unique.stats.damage < createGearItem('sword', 11, 'common').stats.damage);
  assert.equal(createGearItem('scythe', 1, 'common').rarity, 'unique');
});

test('only the held weapon contributes buffs and its Unique passive', () => {
  const inventory = createInventory();
  const sword = createSwordItem();
  const scythe = createGearItem('scythe', 1, 'unique', { buffs: [{ stat: 'damage', value: 0.1 }] });
  const armor = createGearItem('swift-armor', 1, 'epic', { buffs: [{ stat: 'damage', value: 0.1 }] });
  const shield = createGearItem('shield');
  inventory.items.push(sword, scythe, armor, shield);
  inventory.equipment.weapons = [sword.id, scythe.id, null];
  inventory.equipment.armor = armor.id;
  inventory.equipment.shield = shield.id;
  const player = new Player(100, 100);
  applyEquipmentStats(player, inventory);
  assert.equal(player.damageMultiplier, 1.1);
  assert.equal(player.shielding, 0);
  assert.equal(player.defense, armor.stats.defense + shield.stats.defense);
  assert.equal(player.shieldEquipped, true);
  inventory.equipment.activeWeapon = 1;
  applyEquipmentStats(player, inventory);
  assert.equal(player.damageMultiplier, 1.2);
  assert.equal(player.shielding, 0);
  assert.equal(player.lifeSteal, 0.04);
  inventory.equipment.activeWeapon = 2;
  applyEquipmentStats(player, inventory);
  assert.equal(player.damageMultiplier, 1.1);
  assert.equal(player.shielding, 0);
});

test('gear upgrades and rerolls spend permanent tokens and preserve Unique passives', () => {
  const inventory = createInventory();
  inventory.tokens = 5;
  const unique = createGearItem('scythe', 1);
  const passive = structuredClone(unique.passive);
  const common = createSwordItem();
  const rare = createGearItem('spear', 1, 'rare');
  inventory.items.push(unique, common, rare);
  assert.equal(improveGear(inventory, common.id, 5, 'upgrade').ok, false);
  assert.equal(improveGear(inventory, rare.id, 5, 'upgrade').ok, false);
  assert.equal(inventory.tokens, 5);
  assert.equal(improveGear(inventory, unique.id, 5, 'upgrade').ok, true);
  assert.equal(unique.level, 5);
  assert.equal(unique.stats.damage, createGearItem('scythe', 5).stats.damage);
  assert.equal(improveGear(inventory, unique.id, 5, 'upgrade').ok, false);
  assert.equal(improveGear(inventory, unique.id, 5, 'reroll').ok, true);
  assert.deepEqual(unique.passive, passive);
  assert.equal(unique.buffs.length, 1);
  assert.equal(improveGear(inventory, rare.id, 5, 'upgrade', 'rare').ok, true);
  assert.equal(improveGear(inventory, rare.id, 5, 'reroll', 'rare').ok, true);
  assert.equal(rare.buffs.length, 1);
  assert.equal(inventory.tokens, 1);
  assert.equal(inventory.permanentTokensSpent, 4);
  resetSkills(inventory);
  assert.equal(inventory.tokens, 1);
});

test('skill reset refunds only allocated points and cooldown reductions have a cap', () => {
  const inventory = createInventory();
  inventory.tokens = 30;
  for (let i = 0; i < 25; i += 1) assert.equal(allocateSkill(inventory, 'cooldownReduction').ok, true);
  assert.equal(allocateSkill(inventory, 'cooldownReduction').ok, false);
  for (const skill of ['maxHealth', 'maxStamina', 'damage']) assert.equal(allocateSkill(inventory, skill).ok, true);
  const player = new Player(100, 100);
  applyEquipmentStats(player, inventory);
  assert.equal(player.maxHealth, 110);
  assert.equal(player.maxStamina, 110);
  assert.equal(player.cooldownReduction, 0.5);
  assert.equal(player.damageMultiplier, 1.05);
  assert.equal(buyShopItem(inventory, 'gun', 7).ok, true);
  assert.equal(inventory.items[0].level, 7);
  assert.equal(inventory.tokens, 0);
  resetSkills(inventory);
  assert.equal(inventory.tokens, 28);
  assert.equal(inventory.permanentTokensSpent, 2);
  applyEquipmentStats(player, inventory);
  assert.equal(player.maxHealth, 100);
  assert.equal(player.cooldownReduction, 0);
  resetSkills(inventory);
  assert.equal(inventory.tokens, 28);
});

test('grinder awards each rarity amount, clears equipment and retains overflow', () => {
  const inventory = createInventory();
  inventory.grinderProgress = 95;
  for (const [rarity, amount] of Object.entries({ common: 5, rare: 15, epic: 25, unique: 50 })) {
    const item = createGearItem('sword', 1, rarity);
    inventory.items.push(item);
    inventory.equipment.weapons[0] = item.id;
    const before = inventory.grinderProgress;
    assert.equal(grindItem(inventory, item.id).ok, true);
    assert.equal(inventory.grinderProgress, (before + amount) % 100);
    assert.equal(inventory.equipment.weapons[0], null);
    assert.equal(inventory.items.some((entry) => entry.id === item.id), false);
  }
  assert.equal(inventory.tokens, 1);
  assert.equal(inventory.grinderProgress, 90);
  const finalItem = createGearItem('trinket', 1, 'rare');
  inventory.items.push(finalItem);
  inventory.equipment.trinket = finalItem.id;
  grindItem(inventory, finalItem.id);
  assert.equal(inventory.tokens, 2);
  assert.equal(inventory.grinderProgress, 5);
  assert.equal(inventory.equipment.trinket, null);
  for (const item of [createKeyItem('green'), createAbilityItem('map-view'), createGearItem('shield'), { ...createSwordItem(), protected: true }]) {
    inventory.items.push(item);
    assert.equal(grindItem(inventory, item.id).ok, false);
    assert.ok(inventory.items.includes(item));
  }
});

test('multiple level ups grant one token each and collecting twice cannot duplicate them', () => {
  const player = new Player(100, 100);
  const inventory = createInventory();
  player.addExperience(347);
  assert.equal(player.level, 4);
  assert.equal(player.experience, 0);
  assert.equal(player.levelTokensEarned, 3);
  assert.ok(player.experienceToNext > 132);
  assert.equal(collectLevelTokens(player, inventory), 3);
  assert.equal(collectLevelTokens(player, inventory), 0);
  assert.equal(inventory.tokens, 3);
});

test('equipped abilities use individual cooldowns, retain them after switching, and restore from saves', () => {
  const inventory = createInventory();
  const dash = createAbilityItem('dash');
  const heal = createAbilityItem('heal');
  const map = createAbilityItem('map-view');
  inventory.items.push(dash, heal, map);
  inventory.equipment.abilities = [dash.id, heal.id, map.id, null, null];
  const player = new Player(100, 100);
  applyEquipmentStats(player, inventory);
  assert.equal(player.useAbility('barrier', { x: 1, y: 0 }), false);
  assert.equal(player.useAbility('map-view'), false);
  assert.equal(player.useAbility('dash', { x: 1, y: 0 }), true);
  assert.equal(player.abilityCooldowns.dash, 2);
  assert.ok(player.invulnerability > 0);
  player.health = 50;
  assert.equal(player.useAbility('heal'), true);
  assert.equal(player.health, 70);
  assert.equal(player.useAbility('heal'), false);
  inventory.equipment.abilities[0] = null;
  applyEquipmentStats(player, inventory);
  inventory.equipment.abilities[0] = dash.id;
  applyEquipmentStats(player, inventory);
  assert.equal(player.useAbility('dash', { x: 1, y: 0 }), false);
  const restored = new Player(0, 0);
  restored.restore(JSON.parse(JSON.stringify(player.serialize())));
  assert.deepEqual(restored.abilityCooldowns, { dash: 2, heal: 12 });
});

function menuFixture(mode = 'menu', hasStarted = false) {
  const calls = [];
  const game = { mode, hasStarted, player: { health: 100 }, inventoryReturnMode: 'playing', mapReturnMode: 'playing',
    setMode(next) { this.mode = next; }, continueGame() { calls.push('continue'); }, newGame() { calls.push('new-game'); },
    startPlayground() { calls.push('playground'); }, retryGame() { calls.push('retry'); }, returnToMenu() { calls.push('main-menu'); this.mode = 'menu'; } };
  const menu = Object.assign(Object.create(Menu.prototype), { game, settingsReturnMode: 'menu', refreshContinue() {} });
  return { game, menu, calls };
}

test('menu actions start the campaign, continue, retry, and the isolated playground', () => {
  const { menu, calls } = menuFixture();
  for (const action of ['new-game', 'continue', 'retry', 'playground', 'main-menu']) menu.handle(action);
  assert.deepEqual(calls, ['new-game', 'continue', 'retry', 'playground', 'main-menu']);
});

test('Settings Back returns to the main menu or Pause without resuming gameplay', () => {
  const { game, menu } = menuFixture();
  menu.handle('settings');
  assert.equal(game.mode, 'settings');
  menu.handle('back');
  assert.equal(game.mode, 'menu');
  game.hasStarted = true;
  game.mode = 'paused';
  menu.handle('settings');
  menu.handle('back');
  assert.equal(game.mode, 'paused');
  menu.handle('resume');
  assert.equal(game.mode, 'playing');
});

test('inventory and map close return to their own origins', () => {
  const { game, menu } = menuFixture('paused', true);
  menu.handle('inventory');
  assert.equal(game.mode, 'inventory');
  menu.handle('back');
  assert.equal(game.mode, 'paused');
  game.mode = 'map';
  game.mapReturnMode = 'inventory';
  game.inventoryReturnMode = 'playing';
  menu.handle('back');
  assert.equal(game.mode, 'inventory');
  menu.handle('back');
  assert.equal(game.mode, 'playing');
});

test('HUD inventory and resume cannot leave game over, loading, cutscene or an inactive session', () => {
  const { game, menu } = menuFixture('game-over', true);
  game.player.health = 0;
  for (const action of ['inventory', 'resume', 'back', 'settings']) { menu.handle(action); assert.equal(game.mode, 'game-over'); }
  game.player.health = 100;
  for (const mode of ['cutscene', 'loading']) {
    game.mode = mode;
    menu.handle('inventory');
    menu.handle('resume');
    assert.equal(game.mode, mode);
  }
  game.hasStarted = false;
  game.mode = 'menu';
  menu.handle('resume');
  menu.handle('inventory');
  assert.equal(game.mode, 'menu');
});


test('Clear Sight has a distinct icon, persists its identity, and its hint names the equipped key', () => {
  const inventory = createInventory();
  const sight = createAbilityItem('clear-sight');
  inventory.items.push(sight);
  inventory.equipment.abilities[3] = sight.id;
  assert.equal(sight.name, 'Clear Sight');
  assert.equal(sight.cooldown, 18);
  assert.match(sight.description, /five seconds/);
  assert.match(itemIcon(sight), /item-icon-clear-sight/);
  assert.notEqual(itemIcon(sight), itemIcon(createAbilityItem('map-view')));
  assert.match(getItemHint(sight, inventory), /Press C in your current loadout/);
  assert.match(getItemHint(sight, inventory), /five seconds/);
  const restored = restoreInventory(JSON.parse(JSON.stringify(inventory)));
  assert.equal(restored.items[0].type, 'clear-sight');
  assert.equal(restored.equipment.abilities[3], sight.id);
});

test('Tippy teaches parry recovery for every weapon and the earned evasion mechanic for Dash', () => {
  const inventory = createInventory();
  for (const type of ['sword', 'spear', 'daggers', 'gun', 'scythe']) {
    const weapon = createGearItem(type);
    inventory.items.push(weapon);
    inventory.equipment.weapons[1] = weapon.id;
    const hint = getItemHint(weapon, inventory);
    assert.match(hint, /Press 2 to hold it/);
    assert.match(hint, /Every weapon can parry/);
    assert.match(hint, /0.32 seconds/);
    assert.match(hint, /20% more damage/);
  }
  assert.match(getItemHint(createAbilityItem('dash'), inventory), /Evasion charge/);
  assert.match(getItemHint(createGearItem('shield'), inventory), /TAP B/);
});
