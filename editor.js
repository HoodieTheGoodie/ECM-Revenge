const canvas = document.querySelector('#editor-canvas');
const context = canvas.getContext('2d');
const roomList = document.querySelector('#room-list');
const canvasWrap = document.querySelector('.canvas-wrap');
const notes = document.querySelector('#room-notes');
const roomStatus = document.querySelector('#room-status');
const doorList = document.querySelector('#door-list');
const sectionFilter = document.querySelector('#section-filter');
const roomScrollPositions = new Map();
const storageKey = 'echo-maze-2-editor-rooms-v2';
const gridSize = 40;
let tool = 'select';
let currentRoomId = 'tutorial-hall';
let dragStart = null;
let rooms = loadRooms();
let undoStack = [];
let redoStack = [];
let zoom = 1;
let pendingDoor = null;
let activePointers = new Set();
let erasing = false;
let lastErasedCell = null;
let renderQueued = false;
let selectedSwitch = null;
let entitySerial = 0;
let selectedObject = null;
let dragPreview = null;
const expandedDungeonRooms = new Set();
const toolDetails = {
  select: ['Select', 'Click a chest, enemy, key, barrier, switch, or terminal to inspect and edit it. Click a room door to enter its connected room.'],
  wall: ['Wall', 'Drag a rectangle to build a wall. The outline previews its size. Adjacent walls merge visually.'],
  spawn: ['Player start point', 'Click to place the player start. This also makes the current room the starting room for your world.'],
  erase: ['Erase', 'Click or drag to erase objects and individual wall tiles. Removing a room door also removes its connected room tree after confirmation.'],
  door: ['Room door', 'Click near a room edge to create a door and a connected room. Each wall supports one room exit. Use Select to enter it.'],
  'maze-door': ['Dungeon entrance', 'Place an entrance to a new offshoot. Dungeons are grouped beneath this room in the room browser. Use Select to enter it.'],
  'locked-door': ['Locked barrier', 'Place a solid barrier inside this room. It opens when its condition is met; it does not lead to another room.'],
  key: ['Key', 'Choose a color, then click to place a matching key for a color-locked barrier.'],
  switch: ['Wall switch', 'Choose a switch barrier in any room, then click beside an exposed wall to mount its switch.'],
  terminal: ['Terminal', 'Choose a number, then click to place its terminal. Each number has one terminal and can control many matching barriers.'],
  chaser: ['Chaser spawn', 'Choose a level, weapon, and armor, then click to place enemy markers. Random equipment is rolled when the room loads.'],
  boss: ['Flying Pig boss', 'Click to place the boss encounter. Placing it again moves the boss in this room.'],
  chest: ['Loot chest', 'Choose the contents and rarity, then click to place a chest. Scythes are always Unique.']
};

function starterRooms() {
  const width = 1200;
  const height = 3600;
  return {
    __meta: { startRoomId:'tutorial-hall' },
    'tutorial-hall': { id:'tutorial-hall', name:'Tutorial Hallway', width, height, notes:'Tutorial: show Use WASD to move. Hide the tip after the player moves. The first chest gives the sword and Map View. The chaser ambush begins after passing the Tip Box in the hub.', walls:[{x:0,y:0,width,height:40},{x:0,y:height-40,width,height:40},{x:0,y:0,width:40,height},{x:width-40,y:0,width:40,height}], doors:[], enemies:[], chests:[] }
  };
}
function normalizeRooms(collection) {
  if (!collection || typeof collection !== 'object' || Array.isArray(collection)) throw new Error('Invalid room collection');
  const entries = Object.entries(collection).filter(([key]) => key !== '__meta');
  if (!entries.length || entries.some(([id, entry]) => !entry || entry.id !== id || !['walls','doors','keys','enemies','chests','switches','terminals'].every((key) => entry[key] == null || Array.isArray(entry[key])))) throw new Error('Invalid room data');
  collection.__meta = collection.__meta && typeof collection.__meta === 'object' ? collection.__meta : {};
  if (!collection[collection.__meta.startRoomId]?.id) collection.__meta.startRoomId = collection['tutorial-hall'] ? 'tutorial-hall' : entries[0][0];
  Object.values(collection).forEach((entry) => {
    if (!entry || !entry.id) return;
    entry.walls = entry.walls ?? [];
    entry.doors = entry.doors ?? [];
    const doorIds = new Set(entry.doors.map((door) => door.id).filter(Boolean));
    entry.doors.forEach((door, index) => { if (!door.id) { let id = `${entry.id}-legacy-door-${index}`; while (doorIds.has(id)) id += '-import'; door.id = id; doorIds.add(id); } });
    entry.keys = entry.keys ?? [];
    entry.enemies = entry.enemies ?? [];
    entry.chests = entry.chests ?? [];
    entry.switches = entry.switches ?? [];
    entry.terminals = entry.terminals ?? [];
    entry.notes = entry.notes ?? '';
    entry.name = entry.name ?? entry.id;
    entry.width = entry.width ?? 1200;
    entry.height = entry.height ?? 1200;
    entry.sectionId = entry.sectionId ?? 'section-1';
    entry.sectionName = entry.sectionName ?? 'Section 1';
    entry.type = entry.type ?? 'room';
  });
  if (!collection[currentRoomId] && collection[collection.__meta.startRoomId]) currentRoomId = collection.__meta.startRoomId;
  return collection;
}
function loadRooms() { try { return normalizeRooms(JSON.parse(localStorage.getItem(storageKey)) ?? starterRooms()); } catch { return normalizeRooms(starterRooms()); } }
function saveRooms() { localStorage.setItem(storageKey, JSON.stringify(rooms)); scheduleRender(); }
function room() { return rooms[currentRoomId]; }
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}
function snapshot() { return JSON.stringify({ rooms, currentRoomId }); }
function restoreSnapshot(value) { const state = JSON.parse(value); rooms = state.rooms; currentRoomId = state.currentRoomId; selectedObject = null; selectedSwitch = null; saveRooms(); renderRoomList(); render(); }
function beginEdit() { undoStack.push(snapshot()); redoStack = []; }
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restoreSnapshot(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restoreSnapshot(redoStack.pop()); }
function snapCenter(value) { return Math.floor(value / gridSize) * gridSize + gridSize / 2; }
function snapEdge(value) { return Math.round(value / gridSize) * gridSize; }
function toWorld(event) { const bounds = canvas.getBoundingClientRect(); return { x:(event.clientX - bounds.left) * canvas.width / bounds.width, y:(event.clientY - bounds.top) * canvas.height / bounds.height }; }
function doorAt(point) { return room().doors.find((door) => point.x >= door.x && point.x <= door.x + door.width && point.y >= door.y && point.y <= door.y + door.height); }
function roomAtPoint(point, list) { return list.find((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) < 28); }
function setCanvasSize() { if (canvas.width !== room().width) canvas.width = room().width; if (canvas.height !== room().height) canvas.height = room().height; }
function setZoom(nextZoom) { zoom = Math.max(0.05, Math.min(3, nextZoom)); canvas.style.width = `${room().width * zoom}px`; canvas.style.height = `${room().height * zoom}px`; document.querySelector('#zoom-value').textContent = `${Math.round(zoom * 100)}%`; }
function fitRoom() { setZoom(Math.min((canvasWrap.clientWidth - 12) / room().width, (canvasWrap.clientHeight - 12) / room().height)); canvasWrap.scrollLeft = 0; canvasWrap.scrollTop = 0; scheduleRender(); }

function selectionEntry() {
  if (!selectedObject || selectedObject.roomId !== currentRoomId) return null;
  const { kind, index, id } = selectedObject;
  if (kind === 'boss' || kind === 'spawn') return room()[kind] ?? null;
  const entries = room()[kind] ?? [];
  return (id ? entries.find((entry) => entry.id === id) : entries[index]) ?? null;
}
function inspectorTool() {
  if (!selectionEntry()) return tool;
  return { enemies:'chaser', chests:'chest', doors:'locked-door', keys:'key', switches:'switch', terminals:'terminal', boss:'boss', spawn:'spawn' }[selectedObject.kind] ?? tool;
}
function renderInspector() {
  const entry = selectionEntry(); const active = inspectorTool(); const [title, description] = toolDetails[active];
  document.querySelector('#inspector-mode').textContent = entry ? 'Selected object' : 'Active tool';
  document.querySelector('#inspector-title').textContent = title;
  document.querySelector('#tool-description').textContent = entry ? ['boss','spawn'].includes(selectedObject.kind) ? 'Use its placement tool to move this object, or remove it below. Undo restores the previous position.' : 'Edit the properties below and apply your changes. Undo is available for every saved change.' : description;
  document.querySelector('#active-tool-label').textContent = toolDetails[tool][0].toUpperCase();
  document.querySelector('#canvas-help').textContent = toolDetails[tool][1];
  document.querySelector('#enemy-properties').hidden = active !== 'chaser';
  document.querySelector('#chest-properties').hidden = active !== 'chest';
  document.querySelector('#barrier-properties').hidden = active !== 'locked-door';
  document.querySelector('#color-properties').hidden = active !== 'key' && !(active === 'locked-door' && document.querySelector('#lock-rule').value === 'key');
  document.querySelector('#terminal-properties').hidden = active !== 'terminal' && !(active === 'locked-door' && document.querySelector('#lock-rule').value === 'terminal');
  document.querySelector('#switch-properties').hidden = active !== 'switch';
  document.querySelector('#link-switch').hidden = active !== 'switch' || !rooms[selectedSwitch?.roomId]?.switches?.some((item) => item.id === selectedSwitch.id);
  document.querySelector('#selection-info').hidden = !entry;
  document.querySelector('#selection-info').textContent = entry ? `Position ${Math.round(entry.x)}, ${Math.round(entry.y)} · ${title}` : '';
  document.querySelector('#selection-actions').hidden = !entry;
  document.querySelector('#apply-object').hidden = !entry || ['switches','spawn','boss'].includes(selectedObject.kind);
  document.querySelector('#clear-selection').hidden = !entry;
  const uniqueChest = document.querySelector('#chest-loot').value === 'scythe';
  document.querySelector('#chest-rarity').disabled = uniqueChest;
  document.querySelector('#chest-help').textContent = uniqueChest ? 'Scythes always drop as Unique, regardless of the rarity setting.' : 'Automatic uses the normal chest rarity roll.';
  document.querySelector('#undo-edit').disabled = !undoStack.length;
  document.querySelector('#redo-edit').disabled = !redoStack.length;
  renderLinkStatus();
  canvas.style.cursor = tool === 'select' ? 'default' : tool === 'erase' ? 'cell' : 'crosshair';
}
function setTool(nextTool) {
  tool = nextTool; selectedObject = null; selectedSwitch = null; dragStart = null; dragPreview = null;
  document.querySelectorAll('[data-tool]').forEach((button) => { const active = button.dataset.tool === tool; button.classList.toggle('is-selected', active); button.setAttribute('aria-pressed', String(active)); });
  toolFeedback(''); render();
}
function selectObject(kind, entry) {
  selectedObject = { roomId:currentRoomId, kind, index:Array.isArray(room()[kind]) ? room()[kind].indexOf(entry) : -1, id:entry.id };
  selectedSwitch = kind === 'switches' ? { roomId:currentRoomId, id:entry.id } : null;
  if (kind === 'enemies') { document.querySelector('#enemy-level').value = entry.level ?? 1; document.querySelector('#enemy-weapon').value = entry.config?.weaponType ?? 'random'; document.querySelector('#enemy-armor').value = entry.config?.armorType === null ? 'none' : entry.config?.armorType ?? 'random'; }
  if (kind === 'chests') { document.querySelector('#chest-loot').value = entry.itemId ?? 'random'; document.querySelector('#chest-rarity').value = entry.rarity ?? 'auto'; }
  if (kind === 'keys') document.querySelector('#lock-color').value = entry.color ?? 'blue';
  if (kind === 'doors') { document.querySelector('#lock-rule').value = entry.requirement ?? 'key'; document.querySelector('#lock-color').value = entry.lockedColor ?? 'blue'; document.querySelector('#terminal-number').value = entry.terminalNumber ?? 1; }
  if (kind === 'terminals') document.querySelector('#terminal-number').value = entry.number;
  if (kind === 'switches') { document.querySelector('#switch-room-filter').value = 'all'; renderSwitchTargets(); }
  toolFeedback(''); render();
}
function applyObjectChanges() {
  const entry = selectionEntry(); if (!entry) return;
  const kind = selectedObject.kind;
  const level = Number(document.querySelector('#enemy-level').value);
  const number = Number(document.querySelector('#terminal-number').value);
  if (kind === 'enemies' && (!Number.isInteger(level) || level < 1 || level > 10)) { toolFeedback('Enemy levels must be whole numbers from 1 to 10.'); return; }
  if ((kind === 'terminals' || (kind === 'doors' && document.querySelector('#lock-rule').value === 'terminal')) && (!Number.isInteger(number) || number < 1 || number > 10)) { toolFeedback('Terminal numbers must be from 1 to 10.'); return; }
  if (kind === 'terminals' && Object.values(rooms).some((current) => (current?.terminals ?? []).some((terminal) => terminal !== entry && Number(terminal.number) === number))) { toolFeedback(`Terminal ${number} already exists. Choose a different number.`); return; }
  beginEdit();
  if (kind === 'enemies') { entry.level = level; applyEnemyEquipment(entry); }
  if (kind === 'chests') { entry.itemId = document.querySelector('#chest-loot').value; const rarity = document.querySelector('#chest-rarity').value; if (entry.itemId === 'scythe') entry.rarity = 'unique'; else if (rarity === 'auto') delete entry.rarity; else entry.rarity = rarity; }
  if (kind === 'keys') entry.color = document.querySelector('#lock-color').value;
  if (kind === 'terminals') entry.number = number;
  if (kind === 'doors') {
    entry.requirement = document.querySelector('#lock-rule').value;
    delete entry.lockedColor; delete entry.terminalNumber;
    if (entry.requirement === 'key') entry.lockedColor = document.querySelector('#lock-color').value;
    if (entry.requirement === 'terminal') entry.terminalNumber = number;
    if (entry.requirement !== 'switches') Object.values(rooms).filter((current) => current?.id).forEach((current) => (current.switches ?? []).forEach((item) => { if (item.targetRoomId === currentRoomId && item.targetDoorId === entry.id) { item.targetRoomId = null; item.targetDoorId = null; } }));
  }
  saveRooms(); renderDoorList(); renderSwitchTargets(); render(); toolFeedback('Object changes saved.');
}
function removeSelectedObject() {
  const entry = selectionEntry(); if (!entry) return;
  if (selectedObject.kind === 'doors') removeDoor(entry);
  else { beginEdit(); if (['boss','spawn'].includes(selectedObject.kind)) delete room()[selectedObject.kind]; else room()[selectedObject.kind] = room()[selectedObject.kind].filter((item) => item !== entry); saveRooms(); }
  selectedObject = null; selectedSwitch = null; render(); toolFeedback('Object removed. Undo restores it.');
}

function render() {
  const current = room();
  if (!current) return;
  setCanvasSize();
  context.fillStyle = '#050d0e'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#102a29'; context.fillRect(0, 0, current.width, current.height);
  context.strokeStyle = '#173b39'; context.lineWidth = Math.max(1, 1 / zoom);
  for (let x=0;x<=current.width;x+=gridSize) { context.beginPath(); context.moveTo(x,0); context.lineTo(x,current.height); context.stroke(); }
  for (let y=0;y<=current.height;y+=gridSize) { context.beginPath(); context.moveTo(0,y); context.lineTo(current.width,y); context.stroke(); }
  // Fill the union after outlining: adjoining/overlapping walls cover internal seams.
  context.strokeStyle='#5b958b'; context.lineWidth=2;
  (current.walls ?? []).forEach((wall) => context.strokeRect(wall.x,wall.y,wall.width,wall.height));
  context.fillStyle='#183b39';
  (current.walls ?? []).forEach((wall) => context.fillRect(wall.x,wall.y,wall.width,wall.height));
  (current.doors ?? []).forEach((door) => {
    const barrier = door.kind === 'barrier' || (!door.targetRoom && door.requirement);
    const color = door.lockedColor || (barrier ? '#e78cbe' : '#d8f36a'); context.strokeStyle=color; context.lineWidth=4; context.strokeRect(door.x+2,door.y+2,door.width-4,door.height-4);
    if (door.lockedColor) { context.fillStyle=door.lockedColor; context.fillRect(door.x+14,door.y+14,12,12); }
    if (barrier) { context.fillStyle=color; context.font='bold 15px monospace'; context.textAlign='center'; context.fillText(door.requirement === 'terminal' ? `T${door.terminalNumber}` : door.requirement === 'all-enemies' ? 'E' : door.requirement === 'switches' ? `S${current.doors.filter((entry) => entry.requirement === 'switches').indexOf(door) + 1}` : '',door.x+door.width/2,door.y+door.height/2+5); }
  });
  (current.keys ?? []).forEach((key) => { context.fillStyle=key.color; context.beginPath(); context.arc(key.x,key.y,12,0,Math.PI*2); context.fill(); });
  (current.enemies ?? []).forEach((enemy) => { context.fillStyle=enemy.config?.armorType === 'tanker' ? '#c48761' : enemy.config?.armorType === 'swift' ? '#b06fbb' : '#d94b58'; context.beginPath(); context.arc(enemy.x,enemy.y,14,0,Math.PI*2); context.fill(); context.fillStyle='#fff2db'; context.font='bold 12px monospace'; context.textAlign='center'; context.fillText(({unarmed:'U',sword:'S',spear:'P',daggers:'D',gun:'G'})[enemy.config?.weaponType] ?? '?',enemy.x,enemy.y+4); });
  (current.chests ?? []).forEach((chest) => { context.fillStyle='#b8753c'; context.fillRect(chest.x-20,chest.y-12,40,24); context.strokeStyle='#f0b35d'; context.strokeRect(chest.x-20,chest.y-12,40,24); });
  (current.switches ?? []).forEach((entry) => { context.fillStyle='#ffce70'; context.fillRect(entry.x-8,entry.y-12,16,24); context.strokeStyle=selectedSwitch?.id === entry.id ? '#fff' : '#765b2c'; context.lineWidth=2; context.strokeRect(entry.x-9,entry.y-13,18,26); });
  (current.terminals ?? []).forEach((entry) => { context.fillStyle='#184651'; context.fillRect(entry.x-18,entry.y-18,36,36); context.strokeStyle='#8ddcff'; context.lineWidth=2; context.strokeRect(entry.x-18,entry.y-18,36,36); context.fillStyle='#8ddcff'; context.font='bold 16px monospace'; context.textAlign='center'; context.fillText(`T${entry.number}`,entry.x,entry.y+5); });
  if (current.type === 'hub') { context.fillStyle='#8de9db'; context.fillRect(current.width/2-20,current.height/2-20,40,40); context.fillStyle='#071013'; context.font='bold 12px monospace'; context.textAlign='center'; context.fillText('TIP',current.width/2,current.height/2+4); }
  if (current.boss) { context.fillStyle='#ec8ac3'; context.beginPath(); context.arc(current.boss.x,current.boss.y,28,0,Math.PI*2); context.fill(); context.fillStyle='#071013'; context.font='bold 12px monospace'; context.textAlign='center'; context.fillText('PIG',current.boss.x,current.boss.y+4); }
  if (current.spawn) { context.fillStyle='#8ddcff'; context.beginPath(); context.arc(current.spawn.x,current.spawn.y,16,0,Math.PI*2); context.fill(); }
  const selected = selectionEntry();
  if (selectedObject?.kind === 'switches' && selected?.targetRoomId === currentRoomId) {
    const target = current.doors.find((entry) => entry.id === selected.targetDoorId);
    if (target) { context.strokeStyle='#ffce7099'; context.lineWidth=2 / zoom; context.setLineDash([5 / zoom,5 / zoom]); context.beginPath(); context.moveTo(selected.x,selected.y); context.lineTo(target.x+target.width/2,target.y+target.height/2); context.stroke(); context.setLineDash([]); }
  }
  if (selected) { context.strokeStyle='#e3f999'; context.lineWidth=2 / zoom; context.setLineDash([6 / zoom, 4 / zoom]); const rect = selectedObject.kind === 'doors' ? {x:selected.x-5,y:selected.y-5,width:selected.width+10,height:selected.height+10} : {x:selected.x-26,y:selected.y-26,width:52,height:52}; context.strokeRect(rect.x,rect.y,rect.width,rect.height); context.setLineDash([]); }
  if (dragPreview) { context.fillStyle='#d8f36a33'; context.fillRect(dragPreview.x,dragPreview.y,dragPreview.width,dragPreview.height); context.strokeStyle='#d8f36a'; context.lineWidth=2 / zoom; context.strokeRect(dragPreview.x,dragPreview.y,dragPreview.width,dragPreview.height); }
  setZoom(zoom); roomStatus.textContent = `${current.name}  //  ${current.width} x ${current.height}  //  ${(current.doors ?? []).length} doors`;
  document.querySelector('#workspace-title').textContent = current.name;
  document.querySelector('#workspace-section').textContent = current.sectionName ?? 'Section 1';
  document.querySelector('#room-size-summary').textContent = `${current.width} × ${current.height}`;
  document.querySelector('#door-count').textContent = String(current.doors.length);
  renderInspector();
}
// Older exports recorded only reciprocal maze doors. Infer their offshoots for
// browsing without changing the authored data or following return doors.
function dungeonParents() {
  const parents = new Map();
  const entries = Object.values(rooms).filter((entry) => entry?.id);
  const assign = (childId, parentId) => {
    if (!rooms[childId]?.id || !rooms[parentId]?.id || childId === parentId || parents.has(childId)) return;
    let ancestor = parentId;
    const seen = new Set([childId]);
    while (ancestor) { if (seen.has(ancestor)) return; seen.add(ancestor); ancestor = parents.get(ancestor); }
    parents.set(childId, parentId);
  };
  entries.forEach((entry) => { if (entry.parentRoomId) assign(entry.id, entry.parentRoomId); });
  entries.forEach((entry) => (entry.doors ?? []).forEach((door) => {
    const targetId = door.targetRoom ?? door.childRoom;
    if (!['maze','maze-door'].includes(door.kind) || door.isReturn || door.id?.endsWith('-entry') || !rooms[targetId]?.id || rooms[targetId].parentRoomId || targetId === rooms.__meta?.startRoomId) return;
    const atBoundary = door.x <= 0 || door.y <= 0 || door.x + door.width >= entry.width || door.y + door.height >= entry.height;
    const returnDoor = rooms[targetId].doors?.find((other) => (other.targetRoom ?? other.childRoom) === entry.id);
    const targetAtBoundary = returnDoor && (returnDoor.x <= 0 || returnDoor.y <= 0 || returnDoor.x + returnDoor.width >= rooms[targetId].width || returnDoor.y + returnDoor.height >= rooms[targetId].height);
    if (atBoundary && returnDoor && !targetAtBoundary) return;
    assign(targetId, entry.id);
  }));
  // Retain the internal room branches of dungeons made by older editor versions.
  // The generated return-door ID provides direction; ambiguous old links stay flat.
  let previousSize;
  do {
    previousSize = parents.size;
    entries.filter((entry) => parents.has(entry.id) || entry.isDungeon).forEach((entry) => (entry.doors ?? []).forEach((door) => {
      const target = rooms[door.targetRoom];
      if (door.kind !== 'room' || door.id?.endsWith('-entry') || !target?.id || target.parentRoomId || target.id === rooms.__meta?.startRoomId) return;
      const returnDoor = target.doors?.find((other) => other.targetRoom === entry.id && other.id?.endsWith('-entry'));
      if (returnDoor) assign(target.id, entry.id);
    }));
  } while (parents.size !== previousSize);
  return parents;
}
function expandDungeonAncestors(roomId) {
  const parents = dungeonParents();
  for (let parent = parents.get(roomId); parent; parent = parents.get(parent)) expandedDungeonRooms.add(parent);
}
function renderRoomList(updateFields = true) {
  const sections = new Map(Object.values(rooms).filter((entry) => entry?.id).map((entry) => [entry.sectionId ?? 'section-1', entry.sectionName ?? 'Section 1']));
  const selected = sectionFilter.value || room().sectionId || 'section-1';
  sectionFilter.replaceChildren(new Option('All sections', 'all'), ...Array.from(sections, ([id, name]) => new Option(name, id)));
  sectionFilter.value = selected === 'all' || sections.has(selected) ? selected : room().sectionId ?? 'section-1';
  document.querySelector('#section-names').replaceChildren(...Array.from(sections.values(), (name) => new Option(name, name)));
  roomList.replaceChildren();
  const query = document.querySelector('#room-search').value.trim().toLowerCase();
  const entries = Object.values(rooms).filter((entry) => entry?.id);
  const parents = dungeonParents();
  const visibleRooms = entries.filter((entry) => (sectionFilter.value === 'all' || (entry.sectionId ?? 'section-1') === sectionFilter.value) && entry.name.toLowerCase().includes(query));
  const included = new Set(visibleRooms.map((entry) => entry.id));
  visibleRooms.forEach((entry) => { for (let parent = parents.get(entry.id); parent; parent = parents.get(parent)) included.add(parent); });
  const appendRoom = (entry, container) => {
    const button = document.createElement('button');
    button.className = `room-button ${entry.id === currentRoomId ? 'is-current' : ''}`;
    button.dataset.roomId = entry.id;
    button.textContent = `${entry.name}${rooms.__meta?.startRoomId === entry.id ? ' [START]' : ''}`;
    button.title = `${entry.name} · ${entry.width} × ${entry.height}`;
    button.setAttribute('aria-current', entry.id === currentRoomId ? 'true' : 'false');
    const children = entries.filter((child) => parents.get(child.id) === entry.id && included.has(child.id));
    if (!children.length) { container.append(button); return; }
    const node = document.createElement('div'); node.className = 'room-tree-node';
    const row = document.createElement('div'); row.className = 'room-tree-row';
    const toggle = document.createElement('button'); toggle.className = 'dungeon-toggle'; toggle.dataset.dungeonParent = entry.id;
    const expanded = Boolean(query) || expandedDungeonRooms.has(entry.id);
    toggle.textContent = expanded ? '▾' : '▸'; toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} dungeons in ${entry.name}`);
    const badge = document.createElement('span'); badge.className = 'dungeon-count'; badge.textContent = String(children.length); badge.title = `${children.length} dungeon rooms`;
    row.append(toggle); row.append(button); row.append(badge); node.append(row);
    const group = document.createElement('div'); group.className = 'dungeon-rooms'; group.hidden = !expanded; group.setAttribute('role', 'group'); group.setAttribute('aria-label', `Dungeons in ${entry.name}`);
    children.forEach((child) => appendRoom(child, group)); node.append(group); container.append(node);
  };
  entries.filter((entry) => included.has(entry.id) && !parents.has(entry.id)).forEach((entry) => appendRoom(entry, roomList));
  document.querySelector('#room-count').textContent = String(visibleRooms.length);
  document.querySelector('#room-empty').hidden = visibleRooms.length > 0;
  if (updateFields) {
  notes.value = room().notes ?? '';
  document.querySelector('#room-name').value = room().name;
  document.querySelector('#room-section').value = room().sectionName ?? 'Section 1';
  document.querySelector('#room-width').value = room().width;
  document.querySelector('#room-height').value = room().height;
  document.querySelector('#room-type').value = room().type ?? 'room';
  document.querySelector('#tutorial-stage').value = room().tutorialStage ?? '';
  document.querySelector('#tutorial-ambush').checked = room().tutorialAmbush ?? room().type === 'hub';
  document.querySelector('#settings-feedback').textContent = '';
  document.querySelector('#notes-feedback').textContent = '';
  }
  renderDoorList();
  renderSwitchTargets();
}
function renderDoorList() {
  if (!doorList) return;
  doorList.replaceChildren();
  if (!room().doors.length) { const empty = document.createElement('p'); empty.className = 'empty-doors'; empty.textContent = 'No doors yet. Place a Room door on an edge to create your next room.'; doorList.append(empty); }
  (room().doors ?? []).forEach((door) => {
    const row = document.createElement('div'); row.className = 'door-row';
    const label = document.createElement('span'); label.textContent = rooms[door.targetRoom]?.name ?? (door.requirement === 'terminal' ? `Terminal ${door.terminalNumber} barrier` : door.requirement === 'switches' ? `S${room().doors.filter((entry) => entry.requirement === 'switches').indexOf(door) + 1} · ${switchSources(currentRoomId,door.id).length} switches · ${door.x}, ${door.y}` : door.requirement === 'all-enemies' ? 'Clear enemies barrier' : `${door.lockedColor ?? 'Key'} barrier`); label.title = door.id;
    row.append(label);
    if (rooms[door.targetRoom]) { const button = document.createElement('button'); button.textContent = 'Open'; button.addEventListener('click', () => openRoom(door.targetRoom)); row.append(button); }
    else { const button = document.createElement('button'); button.textContent = 'Edit'; button.addEventListener('click', () => { setTool('select'); selectObject('doors', door); }); row.append(button); }
    doorList.append(row);
  });
}
function renderSwitchTargets() {
  const select = document.querySelector('#switch-target'); const previous = select.value;
  const filter = document.querySelector('#switch-room-filter'); const previousRoom = filter.value || 'all';
  const targets = Object.values(rooms).filter((entry) => entry?.id && entry.doors.some((door) => door.requirement === 'switches'));
  filter.replaceChildren(new Option('All rooms', 'all'), ...targets.map((entry) => new Option(entry.name, entry.id)));
  filter.value = previousRoom === 'all' || targets.some((entry) => entry.id === previousRoom) ? previousRoom : 'all';
  const choices = targets.filter((entry) => filter.value === 'all' || filter.value === entry.id).flatMap((entry) => (entry.doors ?? []).filter((door) => door.requirement === 'switches').map((door, index) => new Option(`${entry.name} · S${index + 1} (${door.x}, ${door.y})`, JSON.stringify([entry.id,door.id]))));
  select.replaceChildren(new Option('Choose a switch barrier', ''), ...choices);
  const selected = rooms[selectedSwitch?.roomId]?.switches?.find((entry) => entry.id === selectedSwitch.id);
  const value = selected ? JSON.stringify([selected.targetRoomId,selected.targetDoorId]) : previous;
  select.value = choices.some((option) => option.value === value) ? value : '';
  renderLinkStatus();
}
function switchSources(roomId, doorId) {
  return Object.values(rooms).filter((entry) => entry?.id).flatMap((source) => (source.switches ?? []).filter((entry) => entry.targetRoomId === roomId && entry.targetDoorId === doorId).map((entry) => ({ source, entry })));
}
function renderLinkStatus() {
  const selected = selectionEntry(); const active = inspectorTool();
  const status = document.querySelector('#link-status'); const sources = document.querySelector('#linked-switches');
  sources.replaceChildren();
  const target = active === 'switch' ? chosenSwitchTarget() : selectedObject?.kind === 'doors' && selected?.requirement === 'switches' ? {targetRoomId:currentRoomId,targetDoorId:selected.id} : null;
  const wallSwitch = rooms[selectedSwitch?.roomId]?.switches?.find((entry) => entry.id === selectedSwitch.id);
  document.querySelector('#focus-switch-target').disabled = !target;
  status.hidden = active !== 'switch' && !target;
  sources.hidden = !target;
  if (!target) { status.textContent = wallSwitch ? 'This switch has no linked barrier. Choose a room and barrier below, then save the link.' : '1. Choose the target room. 2. Choose a barrier. 3. Place a switch beside a wall.'; return; }
  const targetRoom = rooms[target.targetRoomId]; const door = targetRoom.doors.find((entry) => entry.id === target.targetDoorId);
  const linked = switchSources(target.targetRoomId, target.targetDoorId);
  const sourceName = wallSwitch ? `${rooms[selectedSwitch.roomId].name} (${Math.round(wallSwitch.x)}, ${Math.round(wallSwitch.y)})` : room().name;
  const unsaved = wallSwitch && (wallSwitch.targetRoomId !== target.targetRoomId || wallSwitch.targetDoorId !== target.targetDoorId);
  status.textContent = `${active === 'switch' ? `${sourceName} → ` : ''}${targetRoom.name} · barrier (${door.x}, ${door.y})\n${linked.length} linked switch${linked.length === 1 ? '' : 'es'}${unsaved ? ' · Unsaved target — save the link to apply.' : ''}`;
  linked.forEach(({source, entry}) => { const button = document.createElement('button'); button.className = 'linked-switch'; button.textContent = `↗ ${source.name} · switch ${Math.round(entry.x)}, ${Math.round(entry.y)}`; button.addEventListener('click', () => { openRoom(source.id); setTool('select'); selectObject('switches', entry); focusObject(entry); }); sources.append(button); });
}
function focusObject(entry) {
  canvasWrap.scrollLeft = Math.max(0, (entry.x + (entry.width ?? 0) / 2) * zoom - canvasWrap.clientWidth / 2);
  canvasWrap.scrollTop = Math.max(0, (entry.y + (entry.height ?? 0) / 2) * zoom - canvasWrap.clientHeight / 2);
}
function focusSwitchTarget() {
  const target = chosenSwitchTarget(); if (!target) return;
  openRoom(target.targetRoomId); setTool('select');
  const entry = room().doors.find((door) => door.id === target.targetDoorId);
  selectObject('doors', entry); focusObject(entry);
}
function applyEnemyEquipment(entry) {
  entry.config ??= {};
  const weapon = document.querySelector('#enemy-weapon').value; const armor = document.querySelector('#enemy-armor').value;
  if (!weapon || weapon === 'random') delete entry.config.weaponType; else entry.config.weaponType = weapon;
  if (!armor || armor === 'random') delete entry.config.armorType; else entry.config.armorType = armor === 'none' ? null : armor;
}
function toolFeedback(message) { document.querySelector('#tool-feedback').textContent = message; }
function entityId(kind) { return `${room().id}-${kind}-${Date.now().toString(36)}-${++entitySerial}`; }
roomList.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-dungeon-parent]');
  if (toggle && roomList.contains(toggle)) { const id = toggle.dataset.dungeonParent; if (expandedDungeonRooms.has(id)) expandedDungeonRooms.delete(id); else expandedDungeonRooms.add(id); renderRoomList(false); return; }
  const button = event.target.closest('[data-room-id]');
  if (button && roomList.contains(button)) openRoom(button.dataset.roomId);
});
function openRoom(roomId) {
  if (!rooms[roomId]) return;
  roomScrollPositions.set(currentRoomId, { x:canvasWrap.scrollLeft, y:canvasWrap.scrollTop });
  currentRoomId = roomId;
  expandDungeonAncestors(roomId);
  selectedObject = null; selectedSwitch = null; dragStart = null; dragPreview = null;
  document.querySelector('#room-search').value = '';
  toolFeedback('');
  const targetSection = room().sectionId ?? 'section-1';
  if (sectionFilter.value !== 'all') sectionFilter.value = targetSection;
  renderRoomList();
  render();
  const position = roomScrollPositions.get(roomId);
  canvasWrap.scrollLeft = position?.x ?? 0;
  canvasWrap.scrollTop = position?.y ?? 0;
  scheduleRender();
}
function ensureRoom(id, name) { if (!rooms[id]) rooms[id] = { id, name, sectionId:room().sectionId ?? 'section-1', sectionName:room().sectionName ?? 'Section 1', width:1200, height:1200, notes:'', walls:[{x:0,y:0,width:1200,height:40},{x:0,y:1160,width:1200,height:40},{x:0,y:0,width:40,height:1200},{x:1160,y:0,width:40,height:1200}], doors:[], keys:[], enemies:[], chests:[] }; }

function applyRoomSettings() {
  const current = room(); const name = document.querySelector('#room-name').value.trim(); const sectionName = document.querySelector('#room-section').value.trim();
  const width = Number(document.querySelector('#room-width').value); const height = Number(document.querySelector('#room-height').value);
  const feedback = document.querySelector('#settings-feedback');
  if (!name || !sectionName || ![width,height].every((value) => Number.isInteger(value) && value >= 120 && value <= 8000 && value % gridSize === 0)) { feedback.textContent = 'Enter names and dimensions from 120 to 8000 in steps of 40.'; return; }
  const walls = current.walls.map((wall) => {
    const resized = { ...wall };
    if (wall.width === current.width && wall.x === 0) resized.width = width;
    if (wall.height === current.height && wall.y === 0) resized.height = height;
    if (wall.x + wall.width === current.width && wall.width <= gridSize) resized.x = width - wall.width;
    if (wall.y + wall.height === current.height && wall.height <= gridSize) resized.y = height - wall.height;
    return resized;
  });
  const doors = current.doors.map((door) => ({ ...door, x:door.x + door.width === current.width ? width - door.width : door.x, y:door.y + door.height === current.height ? height - door.height : door.y }));
  const switches = (current.switches ?? []).map((entry) => {
    const index = current.walls.findIndex((wall) => entry.wallSide === 'right' ? entry.x === wall.x - 16 && entry.y >= wall.y && entry.y <= wall.y + wall.height : entry.wallSide === 'left' ? entry.x === wall.x + wall.width + 16 && entry.y >= wall.y && entry.y <= wall.y + wall.height : entry.wallSide === 'down' ? entry.y === wall.y - 16 && entry.x >= wall.x && entry.x <= wall.x + wall.width : entry.wallSide === 'up' ? entry.y === wall.y + wall.height + 16 && entry.x >= wall.x && entry.x <= wall.x + wall.width : false);
    if (index < 0) return entry;
    const wall = walls[index];
    return { ...entry, ...(entry.wallSide === 'right' ? { x: wall.x - 16 } : entry.wallSide === 'left' ? { x: wall.x + wall.width + 16 } : entry.wallSide === 'down' ? { y: wall.y - 16 } : { y: wall.y + wall.height + 16 }) };
  });
  const pointObjects = [...(current.keys ?? []), ...(current.enemies ?? []), ...(current.chests ?? []), ...switches, ...(current.terminals ?? []), ...(current.spawn ? [current.spawn] : []), ...(current.boss ? [current.boss] : [])];
  if ([...walls,...doors].some((entry) => entry.x < 0 || entry.y < 0 || entry.x + entry.width > width || entry.y + entry.height > height) || pointObjects.some((entry) => entry.x < 0 || entry.y < 0 || entry.x >= width || entry.y >= height)) { feedback.textContent = 'Move or erase objects outside the new bounds before shrinking this room.'; return; }
  beginEdit();
  const existingSection = Object.values(rooms).find((entry) => entry?.id && entry.sectionName === sectionName);
  current.sectionId = existingSection?.sectionId ?? `section-${Date.now().toString(36)}`;
  current.sectionName = sectionName; current.name = name; current.width = width; current.height = height; current.walls = walls; current.doors = doors; current.switches = switches;
  current.type = document.querySelector('#room-type').value;
  current.tutorialStage = document.querySelector('#tutorial-stage').value;
  current.tutorialAmbush = document.querySelector('#tutorial-ambush').checked;
  if (sectionFilter.value !== 'all') sectionFilter.value = current.sectionId;
  saveRooms(); renderRoomList(); render(); feedback.textContent = 'Room settings saved.';
}
function childRooms(rootId) { const found = new Set(); const visit = (roomId) => { if (found.has(roomId) || !rooms[roomId]) return; found.add(roomId); rooms[roomId].doors.forEach((door) => { if (door.targetRoom !== currentRoomId) visit(door.targetRoom ?? door.childRoom); }); }; visit(rootId); return found; }
function removeDoor(door) {
  if (!door.targetRoom && !door.childRoom) {
    beginEdit(); room().doors = room().doors.filter((entry) => entry !== door);
    Object.values(rooms).filter((entry) => entry?.id).forEach((entry) => (entry.switches ?? []).forEach((item) => { if (item.targetRoomId === currentRoomId && item.targetDoorId === door.id) { item.targetRoomId = null; item.targetDoorId = null; } }));
    saveRooms(); renderDoorList(); renderSwitchTargets(); render(); return;
  }
  if (!window.confirm('Delete this door and the connected room with all of its contents?')) return;
  beginEdit();
  const deleted = childRooms(door.targetRoom ?? door.childRoom);
  room().doors = room().doors.filter((entry) => entry !== door);
  deleted.forEach((roomId) => { if (roomId !== currentRoomId) delete rooms[roomId]; });
  saveRooms(); renderRoomList(); render();
}
function addDoor(point) {
  const current = room();
  const side = point.x < 80 ? 'left' : point.x > current.width - 80 ? 'right' : point.y < 80 ? 'up' : 'down';
  const doorSize = gridSize;
  const x = side === 'left' ? 0 : side === 'right' ? current.width - doorSize : Math.max(0,Math.min(current.width-doorSize,snapEdge(point.x)));
  const y = side === 'up' ? 0 : side === 'down' ? current.height - doorSize : Math.max(0,Math.min(current.height-doorSize,snapEdge(point.y)));
  const width = side === 'left' || side === 'right' ? doorSize : doorSize;
  const height = side === 'up' || side === 'down' ? doorSize : doorSize;
  if (current.doors.some((door) => door.x === x && door.y === y)) return;
  if (current.doors.some((door) => door.targetRoom && (side === 'left' ? door.x <= 0 : side === 'right' ? door.x + door.width >= current.width : side === 'up' ? door.y <= 0 : door.y + door.height >= current.height))) { toolFeedback('This wall already has a room exit. Use a different wall to keep the minimap clear.'); return; }
  beginEdit();
  const id = entityId('room-door');
  const childId = entityId('room');
  ensureRoom(childId, `New Room ${Object.keys(rooms).filter((key) => key !== '__meta').length + 1}`);
  const child = rooms[childId];
  if (current.isDungeon || dungeonParents().has(current.id)) { child.parentRoomId = current.id; child.isDungeon = true; }
  const childDoorId = `${childId}-entry`;
  const oppositeSide = side === 'left' ? 'right' : side === 'right' ? 'left' : side === 'up' ? 'down' : 'up';
  const childX = oppositeSide === 'left' ? 0 : oppositeSide === 'right' ? child.width - doorSize : snapEdge(child.width / 2);
  const childY = oppositeSide === 'up' ? 0 : oppositeSide === 'down' ? child.height - doorSize : snapEdge(child.height / 2);
  current.doors.push({id, kind:'room', x,y,width,height,targetRoom:childId,targetDoor:childDoorId});
  child.doors.push({id:childDoorId, kind:'room', x:childX, y:childY, width:doorSize, height:doorSize, targetRoom:current.id, targetDoor:id});
  saveRooms(); renderRoomList(); render();
}
function addMazeDoor(point) {
  const current = room(); const x = snapEdge(point.x); const y = snapEdge(point.y);
  if (current.doors.some((door) => door.x === x && door.y === y)) return;
  beginEdit();
  const doorId = entityId('maze-door');
  const childId = entityId('dungeon');
  ensureRoom(childId, `Dungeon ${Object.keys(rooms).filter((key) => key !== '__meta').length + 1}`);
  const child = rooms[childId];
  child.parentRoomId = current.id; child.isDungeon = true;
  const childDoorId = `${childId}-entry`;
  current.doors.push({ id:doorId, kind:'maze', x, y, width:gridSize, height:gridSize, targetRoom:childId, targetDoor:childDoorId });
  child.doors.push({ id:childDoorId, kind:'maze', isReturn:true, x:0, y:Math.floor(child.height / 2 / gridSize) * gridSize, width:gridSize, height:gridSize, targetRoom:current.id, targetDoor:doorId });
  saveRooms(); renderRoomList(); render();
}
function addLockedDoor(point) {
  const current = room(); const x=Math.floor(point.x/gridSize)*gridSize; const y=Math.floor(point.y/gridSize)*gridSize; const color=document.querySelector('#lock-color').value; const requirement=document.querySelector('#lock-rule').value;
  if (current.doors.some((door) => door.x === x && door.y === y)) return;
  beginEdit();
  const door = {id:entityId('barrier'),kind:'barrier',x,y,width:gridSize,height:gridSize,requirement};
  if (requirement === 'key') door.lockedColor=color;
  if (requirement === 'terminal') door.terminalNumber=Number(document.querySelector('#terminal-number').value);
  current.doors.push(door); saveRooms(); renderDoorList(); renderSwitchTargets(); render();
}
function chosenSwitchTarget() {
  try { const [roomId,doorId] = JSON.parse(document.querySelector('#switch-target').value); const door = rooms[roomId]?.doors?.find((entry) => entry.id === doorId && entry.requirement === 'switches'); return door ? {targetRoomId:roomId,targetDoorId:doorId} : null; } catch { return null; }
}
function addSwitch(point) {
  const target = chosenSwitchTarget(); if (!target) { toolFeedback('Place a switch barrier and choose its target before placing the switch.'); return; }
  const current = room();
  const candidates = current.walls.flatMap((wall) => {
    const x = Math.max(wall.x,Math.min(wall.x+wall.width,point.x)); const y = Math.max(wall.y,Math.min(wall.y+wall.height,point.y));
    return [{x:wall.x-16,y,wallSide:'right'},{x:wall.x+wall.width+16,y,wallSide:'left'},{x,y:wall.y-16,wallSide:'down'},{x,y:wall.y+wall.height+16,wallSide:'up'}];
  }).filter((candidate) => candidate.x > 12 && candidate.x < current.width-12 && candidate.y > 12 && candidate.y < current.height-12 && Math.hypot(candidate.x-point.x,candidate.y-point.y) <= 80 && !current.walls.some((wall) => candidate.x >= wall.x && candidate.x <= wall.x+wall.width && candidate.y >= wall.y && candidate.y <= wall.y+wall.height));
  candidates.sort((a,b) => Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y));
  if (!candidates[0]) { toolFeedback('Place a switch beside an exposed wall face.'); return; }
  if (roomAtPoint(candidates[0],current.switches ?? [])) return;
  beginEdit(); const entry = {id:entityId('switch'),...candidates[0],...target}; current.switches ??= []; current.switches.push(entry); selectedSwitch={roomId:current.id,id:entry.id};
  saveRooms(); renderDoorList(); render(); toolFeedback('Switch linked. Its target can be in any room.');
}
function linkSelectedSwitch() {
  const entry = rooms[selectedSwitch?.roomId]?.switches?.find((item) => item.id === selectedSwitch.id); const target = chosenSwitchTarget();
  if (!entry || !target) { toolFeedback('Select a wall switch on the canvas and choose a target barrier.'); return; }
  beginEdit(); Object.assign(entry,target); saveRooms(); renderDoorList(); render(); toolFeedback('Switch link saved.');
}
function addTerminal(point) {
  const number = Number(document.querySelector('#terminal-number').value);
  if (!Number.isInteger(number) || number < 1 || number > 10) { toolFeedback('Terminal numbers must be from 1 to 10.'); return; }
  if (Object.values(rooms).some((entry) => (entry?.terminals ?? []).some((terminal) => Number(terminal.number) === number))) { toolFeedback(`Terminal ${number} already exists. Each number has one terminal and any number of barriers.`); return; }
  beginEdit(); room().terminals ??= []; room().terminals.push({id:entityId('terminal'),x:snapCenter(point.x),y:snapCenter(point.y),number}); saveRooms(); render(); toolFeedback(`Terminal ${number} placed.`);
}
function generateMaze() {
  const current = room(); const boundaryDoors = current.doors.filter((door) => door.kind === 'room' || door.targetRoom);
  if (boundaryDoors.length < 2) { window.alert('Place at least two Room Doors before generating a maze.'); return; }
  beginEdit();
  const columns = Math.floor(current.width / gridSize); const rows = Math.floor(current.height / gridSize);
  const cells = []; const visited = new Set(); const passages = new Set();
  for (let y=1;y<rows-1;y+=2) for (let x=1;x<columns-1;x+=2) cells.push({x,y});
  const start = cells[0]; const stack=[start]; visited.add(`${start.x}:${start.y}`); passages.add(`${start.x}:${start.y}`);
  while (stack.length) {
    const currentCell=stack[stack.length-1]; const neighbors=[{x:currentCell.x+2,y:currentCell.y},{x:currentCell.x-2,y:currentCell.y},{x:currentCell.x,y:currentCell.y+2},{x:currentCell.x,y:currentCell.y-2}].filter((cell)=>cell.x>0&&cell.x<columns-1&&cell.y>0&&cell.y<rows-1&&!visited.has(`${cell.x}:${cell.y}`));
    if (!neighbors.length) { stack.pop(); continue; }
    const next=neighbors[Math.floor(Math.random()*neighbors.length)]; const between={x:(currentCell.x+next.x)/2,y:(currentCell.y+next.y)/2};
    visited.add(`${next.x}:${next.y}`); passages.add(`${next.x}:${next.y}`); passages.add(`${between.x}:${between.y}`); stack.push(next);
  }
  current.doors.forEach((door) => {
    const doorCellX = Math.floor((door.x + door.width / 2) / gridSize);
    const doorCellY = Math.floor((door.y + door.height / 2) / gridSize);
    if (door.x <= 0) for (let x=0;x<=2;x+=1) passages.add(`${x}:${doorCellY}`);
    else if (door.x + door.width >= current.width) for (let x=columns-3;x<columns;x+=1) passages.add(`${x}:${doorCellY}`);
    else if (door.y <= 0) for (let y=0;y<=2;y+=1) passages.add(`${doorCellX}:${y}`);
    else if (door.y + door.height >= current.height) for (let y=rows-3;y<rows;y+=1) passages.add(`${doorCellX}:${y}`);
  });
  current.walls = current.walls.filter((wall) => wall.x === 0 || wall.y === 0 || wall.x + wall.width === current.width || wall.y + wall.height === current.height);
  for (let y=1;y<rows-1;y+=1) for (let x=1;x<columns-1;x+=1) if (!passages.has(`${x}:${y}`)) current.walls.push({x:x*gridSize,y:y*gridSize,width:gridSize,height:gridSize});
  current.pockets = cells.filter((cell,index)=>index%7===0).slice(0,6).map((cell)=>({x:cell.x*gridSize,y:cell.y*gridSize,width:gridSize*3,height:gridSize*3}));
  current.doors.forEach((door)=>{ const cellX=Math.floor(door.x/gridSize)*gridSize; const cellY=Math.floor(door.y/gridSize)*gridSize; current.walls=current.walls.flatMap((wall)=>subtractWallTile(wall,cellX,cellY)); });
  saveRooms(); render();
}
function subtractWallTile(wall, cellX, cellY) {
  const cell = { x:cellX, y:cellY, width:gridSize, height:gridSize };
  const left=Math.max(wall.x,cell.x); const right=Math.min(wall.x+wall.width,cell.x+cell.width); const top=Math.max(wall.y,cell.y); const bottom=Math.min(wall.y+wall.height,cell.y+cell.height);
  if (left >= right || top >= bottom) return [wall];
  const pieces=[];
  if (top > wall.y) pieces.push({x:wall.x,y:wall.y,width:wall.width,height:top-wall.y});
  if (bottom < wall.y+wall.height) pieces.push({x:wall.x,y:bottom,width:wall.width,height:wall.y+wall.height-bottom});
  if (left > wall.x) pieces.push({x:wall.x,y:top,width:left-wall.x,height:bottom-top});
  if (right < wall.x+wall.width) pieces.push({x:right,y:top,width:wall.x+wall.width-right,height:bottom-top});
  return pieces;
}
function eraseAt(point) {
  const current=room(); const cellX=Math.floor(point.x/gridSize)*gridSize; const cellY=Math.floor(point.y/gridSize)*gridSize; const cellKey=`${cellX}:${cellY}`;
  if (cellKey === lastErasedCell) return;
  const door=doorAt(point); if (door) { removeDoor(door); lastErasedCell=cellKey; return; }
  const enemy=roomAtPoint(point,current.enemies); const chest=roomAtPoint(point,current.chests); const key=roomAtPoint(point,current.keys ?? []);
  const wallSwitch=roomAtPoint(point,current.switches ?? []); const terminal=roomAtPoint(point,current.terminals ?? []); const boss=current.boss && roomAtPoint(point,[current.boss]);
  const wall=current.walls.find((entry)=>entry.x <= point.x && point.x <= entry.x+entry.width && entry.y <= point.y && point.y <= entry.y+entry.height);
  if (!enemy && !chest && !key && !wall && !wallSwitch && !terminal && !boss) return;
  if (!lastErasedCell) beginEdit();
  current.enemies=current.enemies.filter((entry)=>entry!==enemy); current.chests=current.chests.filter((entry)=>entry!==chest); current.keys=(current.keys ?? []).filter((entry)=>entry!==key);
  current.switches=(current.switches ?? []).filter((entry)=>entry!==wallSwitch); current.terminals=(current.terminals ?? []).filter((entry)=>entry!==terminal); if (boss) delete current.boss;
  if (wall) current.walls=current.walls.flatMap((entry)=>entry===wall ? subtractWallTile(entry,cellX,cellY) : [entry]);
  lastErasedCell=cellKey; saveRooms(); render();
}
function connectDoor(door) {
  if (!window.pendingDoor) { window.pendingDoor={roomId:currentRoomId,doorId:door.id}; if (door.targetRoom && rooms[door.targetRoom]) openRoom(door.targetRoom); return; }
  const pendingRoom=rooms[window.pendingDoor.roomId]; const pending=pendingRoom?.doors.find((entry)=>entry.id===window.pendingDoor.doorId);
  if (!pending || currentRoomId === window.pendingDoor.roomId) return;
  beginEdit(); pending.target=currentRoomId; pending.label=room().name; door.target=window.pendingDoor.roomId; door.label=pendingRoom.name; window.pendingDoor=null; saveRooms(); renderRoomList(); render();
}
function selectDoorForLink(doorId) {
  if (!pendingDoor) { pendingDoor = { roomId: currentRoomId, doorId }; renderDoorList(); return; }
  if (pendingDoor.roomId === currentRoomId && pendingDoor.doorId === doorId) return;
  const firstRoom = rooms[pendingDoor.roomId]; const first = firstRoom?.doors.find((entry) => entry.id === pendingDoor.doorId); const second = room().doors.find((entry) => entry.id === doorId);
  if (!first || !second) return;
  beginEdit(); first.targetRoom = currentRoomId; first.targetDoor = second.id; second.targetRoom = pendingDoor.roomId; second.targetDoor = first.id; pendingDoor = null; saveRooms(); renderRoomList(); render();
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button != null && event.button !== 0) return;
  if (event.pointerType === 'touch') { activePointers.add(event.pointerId); if (activePointers.size > 1) return; }
  const point = toWorld(event);
  if (tool === 'select') {
    const door = doorAt(point);
    if (door?.targetRoom) { openRoom(door.targetRoom); return; }
    if (door?.childRoom) { openRoom(door.childRoom); return; }
    if (door) { selectObject('doors', door); return; }
    for (const kind of ['switches','terminals','chests','enemies','keys']) { const entry = roomAtPoint(point,room()[kind] ?? []); if (entry) { selectObject(kind,entry); return; } }
    for (const kind of ['boss','spawn']) { if (room()[kind] && roomAtPoint(point,[room()[kind]])) { selectObject(kind,room()[kind]); return; } }
    selectedObject = null; selectedSwitch = null; render(); return;
  }
  if (tool === 'spawn') { beginEdit(); room().spawn={x:snapCenter(point.x),y:snapCenter(point.y)}; rooms.__meta.startRoomId=currentRoomId; saveRooms(); renderRoomList(); render(); return; }
  if (tool === 'door') { addDoor(point); return; }
  if (tool === 'maze-door') { addMazeDoor(point); return; }
  if (tool === 'locked-door') { addLockedDoor(point); return; }
  if (tool === 'switch') { addSwitch(point); return; }
  if (tool === 'terminal') { addTerminal(point); return; }
  if (tool === 'boss') { beginEdit(); room().boss={type:'flying-pig',x:snapCenter(point.x),y:snapCenter(point.y)}; saveRooms(); render(); return; }
  if (tool === 'key') { beginEdit(); const color = document.querySelector('#lock-color').value; room().keys = room().keys ?? []; room().keys.push({ id:entityId('key'), x:snapCenter(point.x), y:snapCenter(point.y), color }); saveRooms(); render(); return; }
  if (tool === 'wall') { dragStart = { x:Math.min(room().width-gridSize,Math.max(0,snapEdge(point.x))), y:Math.min(room().height-gridSize,Math.max(0,snapEdge(point.y))) }; dragPreview = wallRectangle(point); if (event.pointerId != null) canvas.setPointerCapture?.(event.pointerId); render(); return; }
  if (tool === 'chaser') { const level=Number(document.querySelector('#enemy-level').value); if (!Number.isInteger(level) || level < 1 || level > 10) { toolFeedback('Enemy levels must be whole numbers from 1 to 10.'); return; } beginEdit(); const enemy = {type:'chaser',x:snapCenter(point.x),y:snapCenter(point.y),level}; applyEnemyEquipment(enemy); room().enemies.push(enemy); saveRooms(); render(); return; }
  if (tool === 'chest') { beginEdit(); const itemId=document.querySelector('#chest-loot').value; const rarity=document.querySelector('#chest-rarity').value; const chest={id:entityId('chest'),x:snapCenter(point.x),y:snapCenter(point.y),itemId}; if (itemId === 'scythe') chest.rarity='unique'; else if (rarity !== 'auto') chest.rarity=rarity; room().chests.push(chest); saveRooms(); render(); return; }
  if (tool === 'erase') {
    if (event.pointerId != null) canvas.setPointerCapture?.(event.pointerId);
    erasing = true; lastErasedCell = null; eraseAt(point);
  }
});
function wallRectangle(point) {
  const end = { x:Math.max(0,Math.min(room().width,snapEdge(point.x))), y:Math.max(0,Math.min(room().height,snapEdge(point.y))) };
  return { x:Math.min(dragStart.x,end.x), y:Math.min(dragStart.y,end.y), width:Math.max(gridSize,Math.abs(end.x-dragStart.x)), height:Math.max(gridSize,Math.abs(end.y-dragStart.y)) };
}
canvas.addEventListener('pointermove', (event) => {
  const point = toWorld(event);
  document.querySelector('#cursor-position').textContent = `${Math.floor(point.x / gridSize) * gridSize}, ${Math.floor(point.y / gridSize) * gridSize} · 40 px`;
  if (tool === 'erase' && erasing && (event.buttons & 1) && point.x >= 0 && point.y >= 0 && point.x < room().width && point.y < room().height) eraseAt(point);
  if (tool === 'wall' && dragStart) { dragPreview = wallRectangle(point); scheduleRender(); }
});
canvas.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch') activePointers.delete(event.pointerId);
  if (tool === 'erase') { erasing=false; lastErasedCell=null; }
  if (tool !== 'wall' || !dragStart) return;
  const wall = wallRectangle(toWorld(event));
  beginEdit(); room().walls.push(wall); dragStart=null; dragPreview=null; saveRooms(); render();
});
canvas.addEventListener('pointercancel', (event) => { activePointers.delete(event.pointerId); erasing=false; lastErasedCell=null; dragStart=null; dragPreview=null; render(); });

document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
document.querySelector('#zoom-out').addEventListener('click', () => { setZoom(zoom / 1.25); scheduleRender(); });
document.querySelector('#zoom-in').addEventListener('click', () => { setZoom(zoom * 1.25); scheduleRender(); });
document.querySelector('#zoom-reset').addEventListener('click', () => { setZoom(1); scheduleRender(); });
document.querySelector('#zoom-fit').addEventListener('click', fitRoom);
document.querySelector('#lock-rule').addEventListener('change', renderInspector);
document.querySelector('#chest-loot').addEventListener('change', renderInspector);
document.querySelector('#apply-object').addEventListener('click', applyObjectChanges);
document.querySelector('#remove-object').addEventListener('click', removeSelectedObject);
document.querySelector('#clear-selection').addEventListener('click', () => { selectedObject=null; selectedSwitch=null; toolFeedback(''); render(); });
document.querySelector('#generate-maze').addEventListener('click', generateMaze);
document.querySelector('#save-room-settings').addEventListener('click', applyRoomSettings);
document.querySelector('#link-switch').addEventListener('click', linkSelectedSwitch);
document.querySelector('#switch-room-filter').addEventListener('change', renderSwitchTargets);
document.querySelector('#switch-target').addEventListener('change', renderLinkStatus);
document.querySelector('#focus-switch-target').addEventListener('click', focusSwitchTarget);
document.querySelector('#room-type').addEventListener('change', () => { document.querySelector('#tutorial-ambush').checked = room().tutorialAmbush ?? document.querySelector('#room-type').value === 'hub'; });
sectionFilter.addEventListener('change', () => renderRoomList(false));
document.querySelector('#room-search').addEventListener('input', () => renderRoomList(false));
document.querySelector('#playtest-room').addEventListener('click', () => { saveRooms(); localStorage.setItem('echo-maze-2-playtest-room', currentRoomId); window.location.href = `index.html?playtest=${encodeURIComponent(currentRoomId)}`; });
document.querySelector('#import-room').addEventListener('click', () => document.querySelector('#import-file').click());
document.querySelector('#import-file').addEventListener('change', (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(reader.result); const previousRoomId = currentRoomId; const normalized = normalizeRooms(imported); currentRoomId = previousRoomId; beginEdit(); rooms = normalized; currentRoomId = rooms.__meta.startRoomId; selectedSwitch = null; selectedObject = null; document.querySelector('#room-search').value = ''; roomScrollPositions.clear(); saveRooms(); renderRoomList(); render(); } catch { window.alert('That file is not a valid Echo Maze room export.'); } event.target.value = ''; }; reader.readAsText(file); });
document.querySelector('#save-notes').addEventListener('click', () => { beginEdit(); room().notes=notes.value; saveRooms(); document.querySelector('#notes-feedback').textContent='Notes saved.'; });
document.querySelector('#undo-edit').addEventListener('click', undo);
document.querySelector('#redo-edit').addEventListener('click', redo);
document.addEventListener('keydown', (event) => { if (['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)) return; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); } if (event.key === 'Escape') setTool('select'); });
document.querySelector('#reset-builder').addEventListener('click', () => { if (!window.confirm('Reset all builder rooms and start over?')) return; beginEdit(); currentRoomId='tutorial-hall'; rooms=normalizeRooms(starterRooms()); selectedSwitch=null; selectedObject=null; document.querySelector('#room-search').value=''; roomScrollPositions.clear(); saveRooms(); renderRoomList(); render(); });
document.querySelector('#export-room').addEventListener('click', () => { const blob=new Blob([JSON.stringify(rooms,null,2)],{type:'application/json'}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download='echo-maze-rooms.json'; link.click(); URL.revokeObjectURL(link.href); });
window.addEventListener('resize', scheduleRender);
window.addEventListener('load', scheduleRender);
expandDungeonAncestors(currentRoomId); renderRoomList(); scheduleRender();
