import test from 'node:test';
import assert from 'node:assert/strict';
import { MapSystem } from '../src/core/map-system.js';
import { SaveSystem } from '../src/core/save-system.js';
import { activateSwitch, doorIsOpen, isBarrier, takeTerminalOffline, unlockDoor } from '../src/core/puzzles.js';

test('section maps start at entry, preserve discovery, and keep parallel doors distinct', () => {
  const map = new MapSystem();
  map.discover('a', null, null, 'one');
  map.discover('b', 'a', 'right', 'one');
  map.discover('c', 'a', 'right', 'one');
  assert.notDeepEqual(map.positions.b, map.positions.c);
  map.setMarker('b', 'boss');
  map.discover('x', 'b', 'right', 'two');
  assert.deepEqual(map.positions.x, { x: 0, y: 0 });
  assert.equal(map.discovered.has('a'), false);
  const restored = new MapSystem();
  restored.restore(JSON.parse(JSON.stringify(map.serialize())));
  restored.activate('one');
  assert.equal(restored.markers.b, 'boss');
  assert.equal(restored.discovered.size, 3);
  assert.equal(restored.connections.length, 2);
});

test('switches link across rooms and terminal doors all share the numbered state', () => {
  const door = { id: 'switch-door', requirement: 'switches', kind: 'barrier' };
  const game = { roomManager: { currentId: 'a', rooms: { b: { doors: [door] } } }, doorStates: {}, switchStates: {}, terminalsOffline: {} };
  assert.equal(isBarrier(door), true);
  assert.equal(doorIsOpen(game, door, 'b'), false);
  assert.equal(activateSwitch(game, { id: 's', targetRoomId: 'b', targetDoorId: door.id }), true);
  assert.equal(doorIsOpen(game, door, 'b'), true);
  assert.equal(activateSwitch(game, { id: 'missing', targetDoorId: 'bad' }), false);
  assert.equal(takeTerminalOffline(game, { number: 1 }), true);
  assert.equal(takeTerminalOffline(game, { number: 1 }), false);
  for (const id of ['one', 'two']) assert.equal(doorIsOpen(game, { id, terminalNumber: 1 }), true);
  const enemyDoor = { id: 'enemy', requirement: 'all-enemies' };
  unlockDoor(game, enemyDoor);
  game.enemies = [{ health: 100 }];
  assert.equal(doorIsOpen(game, enemyDoor), true);
});

test('save snapshots isolate unsaved chest, inventory, map, and hardmode progress', () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const system = new SaveSystem();
  const game = { roomManager: { currentId: 'hub' }, player: { serialize: () => ({ health: 100 }) }, inventory: { items: [] }, collectedChests: new Set(), collectedKeys: new Set(), chestStates: {}, mapSystem: new MapSystem(), hardmode: true };
  system.save(game);
  game.collectedChests.add('room:chest');
  game.inventory.items.push({ id: 'loot' });
  assert.deepEqual(system.load().collectedChests, []);
  assert.deepEqual(system.load().inventory.items, []);
  assert.equal(system.load().hardmode, true);
  storage.set('echo-maze-2-save', '{bad json');
  assert.equal(system.hasSave(), false);
});

test('browsing and marking another discovered section keeps live discovery in the current section', () => {
  const map = new MapSystem();
  map.discover('old', null, null, 'one');
  map.discover('current', null, null, 'two');
  map.setMarker('old', 'boss', 'one');
  assert.equal(map.activeSection, 'two');
  assert.equal(map.discovered.has('old'), false);
  assert.equal(map.viewSection('one').markers.old, 'boss');
  map.removeMarker('old', 'one');
  assert.equal(map.viewSection('one').markers.old, undefined);
  map.setMarker('unseen', 'boss', 'one');
  assert.equal(map.viewSection('one').markers.unseen, undefined);
});
