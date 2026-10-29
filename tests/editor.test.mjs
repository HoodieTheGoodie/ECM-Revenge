import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../editor.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../editor.html', import.meta.url), 'utf8');

// Keep the DOM surface small, but resolve IDs against the real HTML so missing
// required elements (the original room-tab regression) fail during startup.
function editor(savedRooms) {
  class Element {
    constructor() {
      Object.assign(this, { value: '', children: [], style: {}, dataset: {}, handlers: {}, attributes: {}, hidden:false, scrollLeft: 0, scrollTop: 0, clientWidth:600, clientHeight:500, width: 960, height: 600, textContent: '' });
      this.classList = { toggle() {} };
    }
    addEventListener(type, callback) { this.handlers[type] = callback; }
    setAttribute(name, value) { this.attributes[name] = value; }
    replaceChildren(...items) { this.children = items; if (items.length && !items.some((item) => item.value === this.value)) this.value = items[0].value; }
    append(item) { this.children.push(item); }
    contains(item) { return this.children.includes(item) || this.children.some((child) => child.contains(item)); }
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
  }
  const ids = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => `#${match[1]}`));
  const elements = new Map([...ids, '.canvas-wrap'].map((id) => [id, new Element()]));
  const el = (selector) => elements.get(selector) ?? null;
  const draws = [];
  el('#editor-canvas').getContext = () => new Proxy({}, { get: (_, method) => (...args) => draws.push([method, ...args]), set: () => true });
  for (const [id, value] of Object.entries({ 'lock-rule': 'key', 'lock-color': 'blue', 'terminal-number': '1', 'enemy-level': '1', 'chest-loot': 'default-sword', 'chest-rarity': 'auto' })) el(`#${id}`).value = value;
  const storage = new Map(savedRooms === undefined ? [] : [['echo-maze-2-editor-rooms-v2', savedRooms]]);
  const alerts = [];
  let confirmations = 0;
  const sandbox = vm.createContext({
    document: { querySelector: el, querySelectorAll: () => [], createElement: () => new Element(), addEventListener() {} },
    Option: class extends Element { constructor(label, value) { super(); this.textContent = label; this.value = value; } },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    FileReader: class { readAsText(file) { this.result = file.text; this.onload(); } },
    window: { requestAnimationFrame: (callback) => callback(), addEventListener() {}, confirm() { confirmations++; return true; }, alert(message) { alerts.push(message); } }
  });
  const run = (code) => vm.runInContext(code, sandbox);
  run(source);
  const click = (tool, x, y) => { run(`tool = ${JSON.stringify(tool)}`); el('#editor-canvas').handlers.pointerdown({ clientX: x, clientY: y }); };
  const importRooms = (collection) => el('#import-file').handlers.change({ target: { files: [{ text: JSON.stringify(collection) }] } });
  return { run, el, click, storage, draws, alerts, importRooms, confirmations: () => confirmations };
}

test('editor starts against real HTML and room tabs redraw immediately while preserving scrolling', () => {
  const { run, el } = editor();
  assert.match(el('#room-status').textContent, /Tutorial Hallway/);
  run("ensureRoom('second', 'Second'); renderRoomList()");
  el('.canvas-wrap').scrollLeft = 120; el('.canvas-wrap').scrollTop = 700;
  const button = el('#room-list').children.find((item) => item.dataset.roomId === 'second');
  el('#room-list').handlers.click({ target: { closest: (selector) => selector === '[data-room-id]' ? button : null } });
  assert.match(el('#room-status').textContent, /Second/);
  assert.equal(el('#editor-canvas').height, 1200);
  run("openRoom('tutorial-hall')");
  assert.equal(el('#editor-canvas').height, 3600);
  assert.equal(el('.canvas-wrap').scrollLeft, 120);
  assert.equal(el('.canvas-wrap').scrollTop, 700);
});

test('room settings preserve existing contents, reject unsafe shrinking, and support undo', () => {
  const { run, el, storage } = editor();
  el('#room-name').value = 'New name'; el('#room-section').value = 'Section 2';
  el('#room-width').value = 1600; el('#room-height').value = 4000;
  el('#room-type').value = 'challenge'; el('#tutorial-stage').value = 'lore';
  run('applyRoomSettings()');
  const saved = JSON.parse(storage.get('echo-maze-2-editor-rooms-v2'))['tutorial-hall'];
  assert.equal(saved.name, 'New name'); assert.equal(saved.sectionName, 'Section 2');
  assert.equal(saved.type, 'challenge'); assert.equal(saved.tutorialStage, 'lore');
  assert.equal(saved.walls[1].y, 3960); assert.equal(saved.walls[3].x, 1560);
  run('room().chests.push({ x: 1400, y: 3800 })');
  el('#room-width').value = 1200; el('#room-height').value = 1200;
  run('applyRoomSettings()');
  assert.equal(run('room().width'), 1600); assert.match(el('#settings-feedback').textContent, /Move or erase/);
  run('undo()'); assert.equal(run('room().name'), 'Tutorial Hallway');
  run('redo()'); assert.equal(run('room().name'), 'New name');
});

test('switches mount beside walls and retain explicit cross-room links without becoming transition doors', () => {
  const { run, el, confirmations } = editor();
  run("ensureRoom('later', 'Later'); openRoom('later')");
  el('#lock-rule').value = 'switches'; run('addLockedDoor({ x: 300, y: 300 })');
  assert.equal(run('room().doors[0].kind'), 'barrier');
  assert.equal(run('room().doors[0].targetRoom'), undefined);
  const target = run('JSON.stringify([currentRoomId, room().doors[0].id])');
  run("openRoom('tutorial-hall')"); el('#switch-target').value = target;
  run('addSwitch({ x: 60, y: 200 })');
  assert.equal(run('room().switches[0].targetRoomId'), 'later');
  assert.equal(run('room().switches[0].x'), 56);
  run("openRoom('later'); removeDoor(room().doors[0])");
  assert.equal(confirmations(), 0);
  assert.equal(run("rooms['tutorial-hall'].switches[0].targetDoorId"), null);
  assert.equal(run("Boolean(rooms['tutorial-hall'])"), true);
});

test('one terminal per number can control any number of matching barriers', () => {
  const { run, el } = editor();
  run('addTerminal({ x: 100, y: 300 })');
  run("ensureRoom('later', 'Later'); openRoom('later'); addTerminal({ x: 200, y: 300 })");
  assert.equal(run('(room().terminals ?? []).length'), 0);
  assert.match(el('#tool-feedback').textContent, /already exists/);
  el('#lock-rule').value = 'terminal';
  run('addLockedDoor({ x: 400, y: 300 }); addLockedDoor({ x: 480, y: 300 })');
  assert.equal(run('room().doors.length'), 2);
  assert.equal(run('room().doors.every((door) => door.terminalNumber === 1)'), true);
  el('#terminal-number').value = '2'; run('addTerminal({ x: 200, y: 300 })');
  assert.equal(run('room().terminals[0].number'), 2);
});

test('enemy markers carry the selected level and equipment without a four-enemy cap', () => {
  const { run, el, click } = editor();
  el('#enemy-level').value = '10';
  el('#enemy-weapon').value = 'spear'; el('#enemy-armor').value = 'tanker';
  for (let index = 0; index < 12; index++) click('chaser', 200 + index * 40, 200);
  assert.equal(run('room().enemies.length'), 12);
  assert.equal(run('room().enemies.every((enemy) => enemy.level === 10)'), true);
  assert.equal(run("room().enemies.every((enemy) => enemy.config.weaponType === 'spear' && enemy.config.armorType === 'tanker')"), true);
  run('room().enemies = []'); el('#enemy-level').value = '11'; click('chaser', 200, 200);
  assert.equal(run('room().enemies.length'), 0);
});

test('selected enemies preserve fixed weapon and armor overrides, and Random removes overrides', () => {
  const { run, el, click } = editor();
  el('#enemy-weapon').value = 'daggers'; el('#enemy-armor').value = 'none';
  click('chaser', 200, 200); click('select', 220, 220);
  assert.equal(el('#enemy-weapon').value, 'daggers'); assert.equal(el('#enemy-armor').value, 'none');
  assert.equal(run('room().enemies[0].config.armorType'), null);
  el('#enemy-weapon').value = 'gun'; el('#enemy-armor').value = 'swift'; run('applyObjectChanges()');
  assert.equal(run('room().enemies[0].config.weaponType'), 'gun'); assert.equal(run('room().enemies[0].config.armorType'), 'swift');
  el('#enemy-weapon').value = 'random'; el('#enemy-armor').value = 'random'; run('applyObjectChanges()');
  assert.equal(run("Object.hasOwn(room().enemies[0].config, 'weaponType')"), false);
  assert.equal(run("Object.hasOwn(room().enemies[0].config, 'armorType')"), false);
  run('undo()'); assert.equal(run('room().enemies[0].config.weaponType'), 'gun');
});

test('dungeons nest under their parent, collapse, search through descendants, and retain hierarchy on reload', () => {
  const { run, el, storage } = editor();
  run('addMazeDoor({x:300,y:300}); addMazeDoor({x:400,y:300})');
  const childId = run('room().doors[0].targetRoom');
  assert.equal(run(`rooms[${JSON.stringify(childId)}].parentRoomId`), 'tutorial-hall');
  assert.equal(el('#room-list').children.length, 1);
  let node = el('#room-list').children[0];
  assert.equal(node.children[1].hidden, true); assert.equal(node.children[1].children.length, 2);
  const toggle = node.children[0].children[0];
  el('#room-list').handlers.click({ target: { closest: (selector) => selector === '[data-dungeon-parent]' ? toggle : null } });
  assert.equal(el('#room-list').children[0].children[1].hidden, false);
  run('expandedDungeonRooms.clear()'); el('#room-search').value = run(`rooms[${JSON.stringify(childId)}].name`); el('#room-search').handlers.input();
  node = el('#room-list').children[0]; assert.equal(node.children[1].hidden, false); assert.equal(node.children[1].children.length, 1);
  assert.equal(node.children[1].children[0].dataset.roomId, childId);
  run(`openRoom(${JSON.stringify(childId)}); addDoor({x:1180,y:300})`);
  assert.equal(run('rooms[room().doors[1].targetRoom].parentRoomId'), childId);
  const reloaded = editor(storage.get('echo-maze-2-editor-rooms-v2'));
  assert.equal(reloaded.run('dungeonParents().size'), 3);
});

test('legacy maze links infer nesting without hiding rooms with invalid or cyclic parent data', () => {
  const rooms = { __meta:{startRoomId:'hub'}, hub:{id:'hub',doors:[{kind:'maze',x:200,y:200,width:40,height:40,targetRoom:'dungeon'}]}, dungeon:{id:'dungeon',doors:[{kind:'maze',x:0,y:580,width:40,height:40,targetRoom:'hub'}]}, orphan:{id:'orphan',parentRoomId:'missing'}, a:{id:'a',parentRoomId:'b'}, b:{id:'b',parentRoomId:'a'} };
  const { run, el } = editor(JSON.stringify(rooms));
  assert.equal(run("dungeonParents().get('dungeon')"), 'hub');
  assert.equal(run("dungeonParents().has('orphan')"), false);
  assert.equal(run('dungeonParents().size'), 2);
  const collectIds = (entry) => [entry.dataset.roomId, ...entry.children.flatMap(collectIds)].filter(Boolean);
  assert.deepEqual(new Set(collectIds(el('#room-list'))), new Set(['hub','dungeon','orphan','a','b']));
  assert.equal(run("typeof rooms.hub.doors[0].id"), 'string');
});

test('switch targets filter by room, show link counts, focus the target, and return to the source', () => {
  const { run, el } = editor();
  el('#lock-rule').value = 'switches'; run('addLockedDoor({x:300,y:300})');
  run("ensureRoom('far','Far room'); openRoom('far'); addLockedDoor({x:800,y:800})");
  run("openRoom('tutorial-hall'); setTool('switch')");
  el('#switch-room-filter').value = 'far'; el('#switch-room-filter').handlers.change();
  assert.equal(el('#switch-target').children.length, 2);
  const target = run("JSON.stringify(['far',rooms.far.doors[0].id])"); el('#switch-target').value = target;
  run('addSwitch({x:60,y:200})');
  assert.match(el('#link-status').textContent, /Tutorial Hallway.*→ Far room/);
  assert.match(el('#link-status').textContent, /1 linked switch/);
  run('focusSwitchTarget()');
  assert.equal(run('currentRoomId'), 'far'); assert.equal(run('selectedObject.kind'), 'doors');
  assert.ok(el('.canvas-wrap').scrollTop > 0);
  el('#linked-switches').children[0].handlers.click();
  assert.equal(run('currentRoomId'), 'tutorial-hall'); assert.equal(run('selectedObject.kind'), 'switches');
  el('#switch-target').value = run('JSON.stringify([currentRoomId,room().doors[0].id])'); el('#switch-target').handlers.change();
  assert.match(el('#link-status').textContent, /Unsaved target/);
  run('linkSelectedSwitch()'); assert.equal(run('room().switches[0].targetRoomId'), 'tutorial-hall');
  run('undo()'); assert.equal(run('room().switches[0].targetRoomId'), 'far');
});

test('hub tutorial ambush can be disabled and survives save and undo', () => {
  const { run, el, storage } = editor();
  el('#room-type').value = 'hub'; el('#room-type').handlers.change();
  assert.equal(el('#tutorial-ambush').checked, true);
  run('applyRoomSettings()');
  assert.equal(run('room().tutorialAmbush'), true);
  el('#tutorial-ambush').checked = false; run('applyRoomSettings()');
  assert.equal(JSON.parse(storage.get('echo-maze-2-editor-rooms-v2'))['tutorial-hall'].tutorialAmbush, false);
  run('undo()'); assert.equal(run('room().tutorialAmbush'), true);
});

test('chests preserve author-selected loot and rarity, including unique-only scythes', () => {
  const { run, el, click } = editor();
  click('chest', 100, 200);
  assert.equal(run('room().chests[0].itemId'), 'default-sword');
  assert.equal(run('room().chests[0].rarity'), undefined);
  el('#chest-loot').value = 'spear'; el('#chest-rarity').value = 'epic'; click('chest', 200, 200);
  assert.equal(run('room().chests[1].itemId'), 'spear'); assert.equal(run('room().chests[1].rarity'), 'epic');
  el('#chest-loot').value = 'scythe'; el('#chest-rarity').value = 'common'; click('chest', 300, 200);
  assert.equal(run('room().chests[2].rarity'), 'unique');
  assert.equal(run('new Set(room().chests.map((chest) => chest.id)).size'), 3);
});

test('invalid saved rooms recover without overwriting storage and invalid imports preserve authored work', () => {
  for (const raw of ['{}', '{broken', '{"room":{"id":"room","doors":{}}}']) {
    const { run, el, storage } = editor(raw);
    assert.equal(run('room().name'), 'Tutorial Hallway');
    assert.match(el('#room-status').textContent, /Tutorial Hallway/);
    assert.equal(storage.get('echo-maze-2-editor-rooms-v2'), raw);
  }
  const { run, importRooms, alerts } = editor();
  run("room().notes = 'Keep this authored work'; saveRooms()");
  const before = run('snapshot()');
  for (const invalid of [{}, { bad: { id: 'bad', walls: {} } }, { wrong: { id: 'other' } }]) importRooms(invalid);
  assert.equal(run('snapshot()'), before);
  assert.equal(alerts.length, 3);
  assert.equal(run('undoStack.length'), 0);
  importRooms({ room: { id: 'room', name: 'Imported room' }, __meta: { startRoomId: 'missing' } });
  assert.equal(run('currentRoomId'), 'room');
  assert.equal(run('room().width'), 1200);
  run('undo()');
  assert.equal(run('snapshot()'), before);
});

test('creating a room after deleting another never reuses a surviving room or its door IDs', () => {
  const { run } = editor();
  run('addDoor({x:10,y:300}); addDoor({x:1180,y:300})');
  const survivor = run('room().doors[1].targetRoom');
  const survivorBefore = run(`JSON.stringify(rooms[${JSON.stringify(survivor)}])`);
  run('removeDoor(room().doors[0]); addDoor({x:10,y:300})');
  assert.equal(run(`JSON.stringify(rooms[${JSON.stringify(survivor)}])`), survivorBefore);
  assert.equal(run('Object.values(rooms).filter((entry) => entry?.id).length'), 3);
  assert.equal(run('new Set(room().doors.map((door) => door.id)).size'), 2);
  assert.equal(run('new Set(room().doors.map((door) => door.targetRoom)).size'), 2);
});

test('section filters hide older rooms without changing them and imported terminal numbers stay unique', () => {
  const { run, el } = editor();
  run("ensureRoom('second', 'Second'); rooms.second.sectionId='section-2'; rooms.second.sectionName='Section 2'; renderRoomList()");
  el('#section-filter').value = 'section-2'; el('#section-filter').handlers.change();
  assert.equal(el('#room-list').children.length, 1);
  assert.equal(el('#room-list').children[0].dataset.roomId, 'second');
  run("openRoom('second'); room().terminals=[{id:'old-terminal',x:100,y:100,number:'1'}]; openRoom('tutorial-hall'); addTerminal({x:200,y:200})");
  assert.equal(run('room().terminals.length'), 0);
  assert.match(el('#tool-feedback').textContent, /already exists/);
  assert.equal(el('#section-filter').value, 'section-1');
});

test('resizing a room keeps switches attached to moved boundary walls and preserves their links', () => {
  const { run, el } = editor();
  el('#lock-rule').value = 'switches'; run('addLockedDoor({x:300,y:300})');
  el('#switch-target').value = run('JSON.stringify([currentRoomId, room().doors[0].id])');
  run('addSwitch({x:1140,y:200})');
  const target = run('room().switches[0].targetDoorId');
  assert.equal(run('room().switches[0].x'), 1144);
  el('#room-width').value = 1600;
  run('applyRoomSettings()');
  assert.equal(run('room().switches[0].x'), 1544);
  assert.equal(run('room().switches[0].targetDoorId'), target);
  run('undo()');
  assert.equal(run('room().switches[0].x'), 1144);
});

test('inspector shows only the active tool properties and selected chests can be edited and undone', () => {
  const { run, el, click } = editor();
  run("setTool('select')");
  assert.equal(el('#enemy-properties').hidden, true); assert.equal(el('#chest-properties').hidden, true);
  run("setTool('locked-door')");
  assert.equal(el('#barrier-properties').hidden, false); assert.equal(el('#color-properties').hidden, false);
  el('#lock-rule').value = 'terminal'; el('#lock-rule').handlers.change();
  assert.equal(el('#color-properties').hidden, true); assert.equal(el('#terminal-properties').hidden, false);
  run("setTool('chest')");
  assert.equal(el('#barrier-properties').hidden, true); assert.equal(el('#terminal-properties').hidden, true);
  assert.equal(el('#chest-properties').hidden, false);
  click('chest', 200, 200); click('select', 220, 220);
  assert.equal(el('#inspector-mode').textContent, 'Selected object');
  assert.equal(el('#selection-actions').hidden, false);
  el('#chest-loot').value = 'scythe'; el('#chest-loot').handlers.change();
  assert.equal(el('#chest-rarity').disabled, true);
  run('applyObjectChanges()');
  assert.equal(run('room().chests[0].itemId'), 'scythe'); assert.equal(run('room().chests[0].rarity'), 'unique');
  run('undo()'); assert.equal(run('room().chests[0].itemId'), 'default-sword');
  assert.equal(el('#selection-actions').hidden, true);
  run('redo()'); assert.equal(run('room().chests[0].rarity'), 'unique');
});

test('editing a linked barrier updates cross-room switch targets safely and undo restores the link', () => {
  const { run, el, click } = editor();
  el('#lock-rule').value = 'switches'; run('addLockedDoor({x:300,y:300})');
  const target = run('JSON.stringify([currentRoomId, room().doors[0].id])');
  run("ensureRoom('other','Other'); openRoom('other')");
  el('#switch-target').value = target; run('addSwitch({x:60,y:200})');
  run("openRoom('tutorial-hall')"); click('select', 300, 300);
  el('#lock-rule').value = 'terminal'; el('#terminal-number').value = '3'; run('applyObjectChanges()');
  assert.equal(run('room().doors[0].terminalNumber'), 3);
  assert.equal(run('rooms.other.switches[0].targetDoorId'), null);
  run('undo()'); assert.equal(run('room().doors[0].requirement'), 'switches');
  assert.equal(run('rooms.other.switches[0].targetDoorId === room().doors[0].id'), true);
});

test('selected enemies validate levels and terminal edits preserve globally unique numbers', () => {
  const { run, el, click } = editor();
  click('chaser', 200, 200); click('select', 220, 220);
  el('#enemy-level').value = '4'; run('applyObjectChanges()'); assert.equal(run('room().enemies[0].level'), 4);
  el('#enemy-level').value = '11'; run('applyObjectChanges()'); assert.equal(run('room().enemies[0].level'), 4);
  run('addTerminal({x:300,y:300})');
  el('#terminal-number').value = '2'; run('addTerminal({x:500,y:300})');
  click('select', 300, 300); el('#terminal-number').value = '2'; run('applyObjectChanges()');
  assert.equal(run('room().terminals[0].number'), 1); assert.match(el('#tool-feedback').textContent, /already exists/);
  el('#terminal-number').value = '0'; run('applyObjectChanges()'); assert.equal(run('room().terminals[0].number'), 1);
  el('#terminal-number').value = '3'; run('applyObjectChanges()'); assert.equal(run('room().terminals[0].number'), 3);
  run('removeSelectedObject()'); assert.equal(run('room().terminals.length'), 1);
  run('undo()'); assert.equal(run('room().terminals.length'), 2);
});

test('room filtering keeps unsaved notes and settings, and switching rooms clears object selection', () => {
  const { run, el, click } = editor();
  run("ensureRoom('side','Side room'); renderRoomList()");
  el('#room-notes').value = 'Draft notes'; el('#room-name').value = 'Draft name';
  el('#room-search').value = 'side'; el('#room-search').handlers.input();
  assert.equal(el('#room-list').children.length, 1); assert.equal(el('#room-list').children[0].dataset.roomId, 'side');
  assert.equal(el('#room-notes').value, 'Draft notes'); assert.equal(el('#room-name').value, 'Draft name');
  el('#room-search').value = 'missing'; el('#room-search').handlers.input(); assert.equal(el('#room-empty').hidden, false);
  click('chest', 200, 200); click('select', 220, 220); assert.equal(el('#selection-actions').hidden, false);
  run("openRoom('side')"); assert.equal(el('#selection-actions').hidden, true); assert.equal(el('#room-search').value, '');
});

test('wall drags preview without saving, clamp to room bounds, and fit keeps large rooms navigable', () => {
  const { run, el, click } = editor();
  click('wall', 1160, 3580);
  el('#editor-canvas').handlers.pointermove({clientX:1300,clientY:3700,buttons:1});
  assert.equal(run('room().walls.length'), 4); assert.equal(run('Boolean(dragPreview)'), true);
  el('#editor-canvas').handlers.pointerup({clientX:1300,clientY:3700});
  assert.equal(run('room().walls.length'), 5);
  assert.equal(run('room().walls[4].x + room().walls[4].width'), 1200);
  assert.equal(run('room().walls[4].y + room().walls[4].height'), 3600);
  assert.equal(run('dragPreview'), null);
  run('fitRoom()'); assert.ok(run('zoom') < .14); assert.ok(run('zoom') > .13);
  run('undo()'); assert.equal(run('room().walls.length'), 4);
});
