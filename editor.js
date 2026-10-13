const canvas = document.querySelector('#editor-canvas');
const context = canvas.getContext('2d');
const roomList = document.querySelector('#room-list');
const notes = document.querySelector('#room-notes');
const roomStatus = document.querySelector('#room-status');
const doorList = document.querySelector('#door-list');
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

function starterRooms() {
  const width = 1200;
  const height = 3600;
  return {
    __meta: { startRoomId:'tutorial-hall' },
    'tutorial-hall': { id:'tutorial-hall', name:'Tutorial Hallway', width, height, notes:'Tutorial: show Use WASD to move. Hide the tip after the player moves. Chasers spawn behind the player and show the Shift sprint tip. The player runs to the bottom door for the first weapon room.', walls:[{x:0,y:0,width,height:40},{x:0,y:height-40,width,height:40},{x:0,y:0,width:40,height},{x:width-40,y:0,width:40,height}], doors:[], enemies:[], chests:[] }
  };
}
function normalizeRooms(collection) {
  if (!collection || typeof collection !== 'object' || Array.isArray(collection)) return starterRooms();
  collection.__meta = collection.__meta ?? { startRoomId:'tutorial-hall' };
  Object.values(collection).forEach((entry) => {
    if (!entry || !entry.id) return;
    entry.walls = entry.walls ?? [];
    entry.doors = entry.doors ?? [];
    entry.keys = entry.keys ?? [];
    entry.enemies = entry.enemies ?? [];
    entry.chests = entry.chests ?? [];
    entry.notes = entry.notes ?? '';
    entry.name = entry.name ?? entry.id;
    entry.width = entry.width ?? 1200;
    entry.height = entry.height ?? 1200;
  });
  if (!collection[currentRoomId] && collection[collection.__meta.startRoomId]) currentRoomId = collection.__meta.startRoomId;
  return collection;
}
function loadRooms() { try { return normalizeRooms(JSON.parse(localStorage.getItem(storageKey)) ?? starterRooms()); } catch { return starterRooms(); } }
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
function restoreSnapshot(value) { const state = JSON.parse(value); rooms = state.rooms; currentRoomId = state.currentRoomId; saveRooms(); renderRoomList(); render(); }
function beginEdit() { undoStack.push(snapshot()); redoStack = []; }
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restoreSnapshot(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restoreSnapshot(redoStack.pop()); }
function snapCenter(value) { return Math.floor(value / gridSize) * gridSize + gridSize / 2; }
function snapEdge(value) { return Math.round(value / gridSize) * gridSize; }
function toWorld(event) { const bounds = canvas.getBoundingClientRect(); return { x:(event.clientX - bounds.left) * canvas.width / bounds.width, y:(event.clientY - bounds.top) * canvas.height / bounds.height }; }
function doorAt(point) { return room().doors.find((door) => point.x >= door.x && point.x <= door.x + door.width && point.y >= door.y && point.y <= door.y + door.height); }
function roomAtPoint(point, list) { return list.find((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) < 28); }
function setCanvasSize() { canvas.width = room().width; canvas.height = room().height; }
function setZoom(nextZoom) { zoom = Math.max(0.1, Math.min(3, nextZoom)); canvas.style.width = `${room().width * zoom}px`; canvas.style.height = `${room().height * zoom}px`; document.querySelector('#zoom-value').textContent = `${Math.round(zoom * 100)}%`; }

function render() {
  const current = room();
  if (!current) return;
  setCanvasSize();
  context.fillStyle = '#050d0e'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#102a29'; context.fillRect(0, 0, current.width, current.height);
  context.strokeStyle = '#173b39'; context.lineWidth = Math.max(1, 1 / zoom);
  for (let x=0;x<=current.width;x+=gridSize) { context.beginPath(); context.moveTo(x,0); context.lineTo(x,current.height); context.stroke(); }
  for (let y=0;y<=current.height;y+=gridSize) { context.beginPath(); context.moveTo(0,y); context.lineTo(current.width,y); context.stroke(); }
  (current.walls ?? []).forEach((wall) => { context.fillStyle='#183b39'; context.fillRect(wall.x,wall.y,wall.width,wall.height); context.strokeStyle='#5b958b'; context.strokeRect(wall.x,wall.y,wall.width,wall.height); });
  (current.doors ?? []).forEach((door) => { const color = door.lockedColor || '#d8f36a'; context.strokeStyle=color; context.lineWidth=4; context.strokeRect(door.x+2,door.y+2,door.width-4,door.height-4); if (door.lockedColor) { context.fillStyle=door.lockedColor; context.fillRect(door.x+14,door.y+14,12,12); } });
  (current.keys ?? []).forEach((key) => { context.fillStyle=key.color; context.beginPath(); context.arc(key.x,key.y,12,0,Math.PI*2); context.fill(); });
  (current.enemies ?? []).forEach((enemy) => { context.fillStyle='#d94b58'; context.beginPath(); context.arc(enemy.x,enemy.y,14,0,Math.PI*2); context.fill(); });
  (current.chests ?? []).forEach((chest) => { context.fillStyle='#b8753c'; context.fillRect(chest.x-20,chest.y-12,40,24); context.strokeStyle='#f0b35d'; context.strokeRect(chest.x-20,chest.y-12,40,24); });
  if (current.spawn) { context.fillStyle='#8ddcff'; context.beginPath(); context.arc(current.spawn.x,current.spawn.y,16,0,Math.PI*2); context.fill(); }
  setZoom(zoom); roomStatus.textContent = `${current.name}  //  ${current.width} x ${current.height}  //  ${(current.doors ?? []).length} doors`;
}
function renderRoomList() {
  roomList.innerHTML = Object.values(rooms).filter((entry) => entry.id).map((entry) => `<button class="room-button ${entry.id===currentRoomId?'is-current':''}" data-room-id="${entry.id}">${entry.name}${rooms.__meta?.startRoomId === entry.id ? ' [START]' : ''}</button>`).join('');
  document.querySelectorAll('[data-room-id]').forEach((button) => button.addEventListener('click', () => openRoom(button.dataset.roomId)));
  notes.value = room().notes ?? '';
  renderDoorList();
}
function renderDoorList() { doorList.innerHTML = ''; }
function openRoom(roomId) { currentRoomId = roomId; renderRoomList(); render(); scheduleRender(); }
function ensureRoom(id, name) { if (!rooms[id]) rooms[id] = { id, name, width:1200, height:1200, notes:'', walls:[{x:0,y:0,width:1200,height:40},{x:0,y:1160,width:1200,height:40},{x:0,y:0,width:40,height:1200},{x:1160,y:0,width:40,height:1200}], doors:[], keys:[], enemies:[], chests:[] }; }
function childRooms(rootId) { const found = new Set(); const visit = (roomId) => { if (found.has(roomId) || !rooms[roomId]) return; found.add(roomId); rooms[roomId].doors.forEach((door) => { if (door.targetRoom !== currentRoomId) visit(door.targetRoom ?? door.childRoom); }); }; visit(rootId); return found; }
function removeDoor(door) {
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
  const x = side === 'left' ? 0 : side === 'right' ? current.width - doorSize : snapEdge(point.x);
  const y = side === 'up' ? 0 : side === 'down' ? current.height - doorSize : snapEdge(point.y);
  const width = side === 'left' || side === 'right' ? doorSize : doorSize;
  const height = side === 'up' || side === 'down' ? doorSize : doorSize;
  if (current.doors.some((door) => door.x === x && door.y === y)) return;
  beginEdit();
  const id = `${current.id}-room-door-${current.doors.length + 1}`;
  const childId = `${current.id}-room-${Object.keys(rooms).filter((key) => key !== '__meta').length + 1}`;
  ensureRoom(childId, `New Room ${Object.keys(rooms).filter((key) => key !== '__meta').length + 1}`);
  const child = rooms[childId];
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
  const doorId = `${current.id}-maze-door-${current.doors.length+1}`;
  const childId = `${current.id}-dungeon-${Object.keys(rooms).filter((key) => key !== '__meta').length + 1}`;
  ensureRoom(childId, `Dungeon ${Object.keys(rooms).filter((key) => key !== '__meta').length + 1}`);
  const child = rooms[childId];
  const childDoorId = `${childId}-entry`;
  current.doors.push({ id:doorId, kind:'maze', x, y, width:gridSize, height:gridSize, targetRoom:childId, targetDoor:childDoorId });
  child.doors.push({ id:childDoorId, kind:'maze', x:0, y:child.height / 2 - gridSize / 2, width:gridSize, height:gridSize, targetRoom:current.id, targetDoor:doorId });
  saveRooms(); renderRoomList(); render();
}
function addLockedDoor(point) {
  const current = room(); const x=snapEdge(point.x); const y=snapEdge(point.y); const color=document.querySelector('#lock-color').value; const requirement=document.querySelector('#lock-rule').value;
  if (current.doors.some((door) => door.x === x && door.y === y)) return;
  beginEdit(); current.doors.push({id:`${current.id}-locked-door-${current.doors.length+1}`,kind:'maze',x,y,width:gridSize,height:gridSize,lockedColor:color,requirement}); saveRooms(); render();
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
  const wall=current.walls.find((entry)=>entry.x <= point.x && point.x <= entry.x+entry.width && entry.y <= point.y && point.y <= entry.y+entry.height);
  if (!enemy && !chest && !key && !wall) return;
  if (!lastErasedCell) beginEdit();
  current.enemies=current.enemies.filter((entry)=>entry!==enemy); current.chests=current.chests.filter((entry)=>entry!==chest); current.keys=(current.keys ?? []).filter((entry)=>entry!==key);
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
  if (event.pointerType === 'touch') { activePointers.add(event.pointerId); if (activePointers.size > 1) return; }
  const point = toWorld(event);
  if (tool === 'select') { const door = doorAt(point); if (door?.targetRoom) openRoom(door.targetRoom); else if (door?.childRoom) openRoom(door.childRoom); return; }
  if (tool === 'spawn') { beginEdit(); room().spawn={x:snapCenter(point.x),y:snapCenter(point.y)}; rooms.__meta.startRoomId=currentRoomId; saveRooms(); renderRoomList(); render(); return; }
  if (tool === 'door') { addDoor(point); return; }
  if (tool === 'maze-door') { addMazeDoor(point); return; }
  if (tool === 'locked-door') { addLockedDoor(point); return; }
  if (tool === 'key') { beginEdit(); const color = document.querySelector('#lock-color').value; room().keys = room().keys ?? []; room().keys.push({ id:`${room().id}-key-${room().keys.length+1}`, x:snapCenter(point.x), y:snapCenter(point.y), color }); saveRooms(); render(); return; }
  if (tool === 'wall') { dragStart = { x:snapEdge(point.x), y:snapEdge(point.y) }; return; }
  if (tool === 'chaser') { beginEdit(); room().enemies.push({type:'chaser',x:snapCenter(point.x),y:snapCenter(point.y),level:1}); saveRooms(); render(); return; }
  if (tool === 'chest') { beginEdit(); room().chests.push({x:snapCenter(point.x),y:snapCenter(point.y),itemId:'default-sword'}); saveRooms(); render(); return; }
  if (tool === 'erase') {
    erasing = true; lastErasedCell = null; eraseAt(point);
  }
});
canvas.addEventListener('pointermove', (event) => { if (tool === 'erase' && erasing && (event.buttons & 1)) eraseAt(toWorld(event)); });
canvas.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch') activePointers.delete(event.pointerId);
  if (tool === 'erase') { erasing=false; lastErasedCell=null; }
  if (tool !== 'wall' || !dragStart) return;
  const point = toWorld(event); const end = { x:snapEdge(point.x), y:snapEdge(point.y) };
  const x=Math.min(dragStart.x,end.x); const y=Math.min(dragStart.y,end.y); const width=Math.max(gridSize,Math.abs(end.x-dragStart.x)); const height=Math.max(gridSize,Math.abs(end.y-dragStart.y));
  beginEdit(); room().walls.push({x,y,width,height}); dragStart=null; saveRooms(); render();
});

document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => { tool=button.dataset.tool; document.querySelectorAll('[data-tool]').forEach((entry)=>entry.classList.toggle('is-selected',entry===button)); }));
document.querySelector('#zoom-out').addEventListener('click', () => setZoom(zoom - 0.25));
document.querySelector('#zoom-in').addEventListener('click', () => setZoom(zoom + 0.25));
document.querySelector('#zoom-reset').addEventListener('click', () => setZoom(1));
document.querySelector('#generate-maze').addEventListener('click', generateMaze);
document.querySelector('#playtest-room').addEventListener('click', () => { saveRooms(); localStorage.setItem('echo-maze-2-playtest-room', currentRoomId); window.location.href = `index.html?playtest=${encodeURIComponent(currentRoomId)}`; });
document.querySelector('#import-room').addEventListener('click', () => document.querySelector('#import-file').click());
document.querySelector('#import-file').addEventListener('change', (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(reader.result); if (!imported || typeof imported !== 'object' || Array.isArray(imported)) throw new Error('Invalid room collection'); beginEdit(); rooms = normalizeRooms(imported); currentRoomId = rooms.__meta?.startRoomId ?? Object.keys(rooms).find((key) => rooms[key]?.id); saveRooms(); renderRoomList(); render(); } catch { window.alert('That file is not a valid Echo Maze room export.'); } event.target.value = ''; }; reader.readAsText(file); });
document.querySelector('#save-notes').addEventListener('click', () => { beginEdit(); room().notes=notes.value; saveRooms(); });
document.querySelector('#undo-edit').addEventListener('click', undo);
document.querySelector('#redo-edit').addEventListener('click', redo);
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); } });
document.querySelector('#reset-builder').addEventListener('click', () => { if (!window.confirm('Reset all builder rooms and start over?')) return; beginEdit(); rooms=starterRooms(); currentRoomId='tutorial-hall'; saveRooms(); renderRoomList(); render(); });
document.querySelector('#export-room').addEventListener('click', () => { const blob=new Blob([JSON.stringify(rooms,null,2)],{type:'application/json'}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download='echo-maze-rooms.json'; link.click(); URL.revokeObjectURL(link.href); });
window.addEventListener('resize', scheduleRender);
window.addEventListener('load', scheduleRender);
renderRoomList(); scheduleRender();
