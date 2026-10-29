import { MARKER_TYPES } from '../core/map-system.js';

const markerIcons = { puzzle: '?', boss: '!', cleared: 'X' };
const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export class MapUI {
  constructor(game) {
    this.game = game;
    this.miniMap = document.querySelector('#mini-map');
    this.mapViewport = document.querySelector('#map-viewport');
    this.mapRooms = document.querySelector('#map-rooms');
    this.selectedMarker = MARKER_TYPES.puzzle;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.hasPosition = false;
    this.dragging = false;
    this.suppressClick = false;
    this.sectionControls = document.createElement('div');
    this.sectionControls.className = 'map-section-controls';
    this.sectionControls.innerHTML = '<label for="map-section-select">Discovered section</label><select id="map-section-select"></select><button id="map-center" type="button">Center</button>';
    this.mapViewport.before(this.sectionControls);
    this.sectionSelect = this.sectionControls.querySelector('select');
    this.sectionSelect.addEventListener('change', () => { this.selectedSection = this.sectionSelect.value; this.hasPosition = false; this.render(); });
    this.sectionControls.querySelector('button').addEventListener('click', () => { this.hasPosition = false; this.render(); });

    document.querySelectorAll('[data-marker]').forEach((button) => button.addEventListener('click', () => {
      this.selectedMarker = button.dataset.marker;
      document.querySelectorAll('[data-marker]').forEach((entry) => entry.classList.toggle('is-selected', entry === button));
    }));
    this.mapRooms.addEventListener('click', (event) => {
      const room = event.target.closest('[data-map-room]');
      if (room && !this.suppressClick) this.game.mapSystem.setMarker(room.dataset.mapRoom, this.selectedMarker, this.selectedSection);
      this.render();
    });
    this.mapRooms.addEventListener('contextmenu', (event) => {
      const room = event.target.closest('[data-map-room]');
      if (!room) return;
      event.preventDefault();
      this.game.mapSystem.removeMarker(room.dataset.mapRoom, this.selectedSection);
      this.render();
    });
    this.mapViewport.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.zoom = Math.max(0.55, Math.min(2.5, this.zoom + (event.deltaY < 0 ? 0.1 : -0.1)));
      this.applyTransform();
    }, { passive: false });
    this.mapViewport.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.dragging = true;
      this.suppressClick = false;
      this.dragStart = { x: event.clientX, y: event.clientY, panX: this.pan.x, panY: this.pan.y };
      this.mapViewport.classList.add('is-dragging');
    });
    this.mapViewport.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      const deltaX = event.clientX - this.dragStart.x;
      const deltaY = event.clientY - this.dragStart.y;
      if (Math.hypot(deltaX, deltaY) > 5) { this.suppressClick = true; this.mapViewport.setPointerCapture(event.pointerId); }
      this.pan.x = this.dragStart.panX + deltaX;
      this.pan.y = this.dragStart.panY + deltaY;
      this.applyTransform();
    });
    this.mapViewport.addEventListener('pointerup', (event) => {
      this.dragging = false;
      if (this.mapViewport.hasPointerCapture(event.pointerId)) this.mapViewport.releasePointerCapture(event.pointerId);
      this.mapViewport.classList.remove('is-dragging');
    });
    this.mapViewport.addEventListener('pointercancel', () => { this.dragging = false; this.mapViewport.classList.remove('is-dragging'); });
  }

  render() {
    const map = this.game.mapSystem;
    const currentRoom = this.game.roomManager.current;
    const sectionIds = [...new Set([...Object.keys(map.sections), map.activeSection])].filter((id) => id && map.viewSection(id).discovered.length);
    if (this.activeSection !== map.activeSection || !sectionIds.includes(this.selectedSection)) { this.hasPosition = false; this.activeSection = map.activeSection; this.selectedSection = map.activeSection; }
    const sectionName = (id) => id === 'hub' ? 'Hub' : Object.values(this.game.roomManager.rooms).find((room) => room?.sectionId === id)?.sectionName ?? id;
    this.sectionSelect.innerHTML = sectionIds.map((id) => `<option value="${escapeText(id)}" ${id === this.selectedSection ? 'selected' : ''}>${escapeText(sectionName(id))}</option>`).join('');
    const viewed = map.viewSection(this.selectedSection);
    const discoveredRooms = viewed.discovered.filter((id) => viewed.positions[id]);
    const tilePositions = { ...viewed.positions };
    const connections = [...(viewed.connections ?? [])];
    const destinations = {};
    if (this.selectedSection === 'hub') {
      for (const roomId of discoveredRooms) {
        const hub = this.game.roomManager.rooms[roomId];
        if (hub?.type !== 'hub') continue;
        for (const door of (hub.doors ?? []).filter((door) => this.game.roomManager.rooms[door.targetRoom])) {
          const key = `destination:${roomId}:${door.id}`;
          const offset = door.x <= 0 ? { x: -1, y: 0 } : door.x + door.width >= hub.width ? { x: 1, y: 0 } : door.y <= 0 ? { x: 0, y: -1 } : { x: 0, y: 1 };
          const origin = tilePositions[roomId];
          const position = { x: origin.x + offset.x, y: origin.y + offset.y };
          while (Object.values(tilePositions).some((other) => other.x === position.x && other.y === position.y)) { if (offset.x) position.y++; else position.x++; }
          tilePositions[key] = position;
          destinations[key] = { label: door.label ?? this.game.roomManager.rooms[door.targetRoom].name, locked: roomId === currentRoom.id && !this.game.canUseDoor(door) };
          connections.push([roomId, key]);
        }
      }
    }
    const positions = Object.values(tilePositions);
    document.querySelector('#map-menu h2').textContent = this.selectedSection === 'hub' ? 'HUB MAP' : `${sectionName(this.selectedSection) ?? 'SECTION'} MAP`;
    const minX = Math.min(...positions.map((position) => position.x), 0);
    const maxX = Math.max(...positions.map((position) => position.x), 0);
    const minY = Math.min(...positions.map((position) => position.y), 0);
    const maxY = Math.max(...positions.map((position) => position.y), 0);
    const width = (maxX - minX + 1) * 150;
    const height = (maxY - minY + 1) * 120;
    const currentPosition = tilePositions[this.game.roomManager.currentId] ?? positions[0] ?? { x: 0, y: 0 };
    const tileMarkup = [...discoveredRooms, ...Object.keys(destinations)].map((roomId) => {
      const position = tilePositions[roomId];
      const marker = viewed.markers[roomId];
      const current = roomId === this.game.roomManager.currentId;
      const destination = destinations[roomId];
      const label = destination?.label ?? this.game.roomManager.rooms[roomId]?.name ?? roomId;
      return `<button class="map-room ${current ? 'is-current' : ''} ${destination ? 'is-destination' : ''}" title="${escapeText(label)}" ${destination ? 'disabled' : `data-map-room="${escapeText(roomId)}"`} style="left:${(position.x - minX) * 150}px;top:${(position.y - minY) * 120}px"><span>${current ? '●' : destination ? '◇' : '□'}</span><small>${escapeText(label)}</small>${destination?.locked ? '<span class="map-room-state">LOCKED</span>' : ''}${marker ? `<b>${markerIcons[marker]}</b>` : ''}</button>`;
    }).join('');
    this.mapRooms.style.width = `${width}px`;
    this.mapRooms.style.height = `${height}px`;
    const lines = connections.filter(([a, b]) => tilePositions[a] && tilePositions[b]).map(([a, b]) => {
      const first = tilePositions[a], second = tilePositions[b];
      return `<line class="map-connection ${[a, b].includes(currentRoom.id) ? 'is-current' : ''}" x1="${(first.x - minX) * 150 + 44}" y1="${(first.y - minY) * 120 + 34}" x2="${(second.x - minX) * 150 + 44}" y2="${(second.y - minY) * 120 + 34}"/>`;
    }).join('');
    this.mapRooms.innerHTML = `<svg class="map-connections" aria-hidden="true">${lines}</svg>${tileMarkup}`;
    if (!this.hasPosition) {
      this.pan.x = this.mapViewport.clientWidth / 2 - ((currentPosition.x - minX) * 150 + 44) * this.zoom;
      this.pan.y = this.mapViewport.clientHeight / 2 - ((currentPosition.y - minY) * 120 + 34) * this.zoom;
      this.hasPosition = this.mapViewport.clientWidth > 0;
    }
    this.applyTransform();
    const livePosition = map.positions[currentRoom.id] ?? { x: 0, y: 0 };
    this.miniMap.innerHTML = `<span class="map-caption">${escapeText(currentRoom.type === 'hub' ? 'HUB' : currentRoom.sectionName)}</span>` + [...map.discovered].filter((id) => map.positions[id]).map((roomId) => {
      const position = map.positions[roomId];
      const marker = map.markers[roomId];
      const left = 76 + (position.x - livePosition.x) * 20 - 6;
      const top = 59 + (position.y - livePosition.y) * 20 - 6;
      return `<span class="mini-room ${roomId === this.game.roomManager.currentId ? 'is-current' : ''}" style="left:${left}px;top:${top}px">${marker ? markerIcons[marker] : ''}</span>`;
    }).join('');
    if (currentRoom.type === 'hub') {
      const hubDestinations = (currentRoom.doors ?? []).filter((door) => this.game.roomManager.rooms[door.targetRoom]).map((door) => {
        const target = this.game.roomManager.rooms[door.targetRoom];
        const left = 18 + (door.x / currentRoom.width) * 66;
        const top = 30 + (door.y / currentRoom.height) * 58;
        return `<span class="hub-map-door" style="left:${left}%;top:${top}%">${escapeText(door.label ?? target?.sectionName ?? target?.name ?? door.targetRoom)}</span>`;
      }).join('');
      this.miniMap.innerHTML = `<span class="map-caption">HUB · M TO EXPAND</span><span class="hub-map-hall"></span><span class="hub-map-player"></span>${hubDestinations}`;
    }
  }

  applyTransform() {
    this.mapRooms.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
  }
}
