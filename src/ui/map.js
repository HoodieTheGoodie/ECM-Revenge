import { MARKER_TYPES } from '../core/map-system.js';

const markerIcons = { puzzle: '?', boss: '!', cleared: 'X' };

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

    document.querySelectorAll('[data-marker]').forEach((button) => button.addEventListener('click', () => {
      this.selectedMarker = button.dataset.marker;
      document.querySelectorAll('[data-marker]').forEach((entry) => entry.classList.toggle('is-selected', entry === button));
    }));
    this.mapRooms.addEventListener('click', (event) => {
      const room = event.target.closest('[data-map-room]');
      if (room && !this.suppressClick) this.game.mapSystem.setMarker(room.dataset.mapRoom, this.selectedMarker);
      this.render();
    });
    this.mapRooms.addEventListener('contextmenu', (event) => {
      const room = event.target.closest('[data-map-room]');
      if (!room) return;
      event.preventDefault();
      this.game.mapSystem.removeMarker(room.dataset.mapRoom);
      this.render();
    });
    this.mapViewport.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.zoom = Math.max(0.55, Math.min(2.5, this.zoom + (event.deltaY < 0 ? 0.1 : -0.1)));
      this.applyTransform();
    }, { passive: false });
    this.mapViewport.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.suppressClick = false;
      this.dragStart = { x: event.clientX, y: event.clientY, panX: this.pan.x, panY: this.pan.y };
      this.mapViewport.setPointerCapture(event.pointerId);
      this.mapViewport.classList.add('is-dragging');
    });
    this.mapViewport.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      const deltaX = event.clientX - this.dragStart.x;
      const deltaY = event.clientY - this.dragStart.y;
      if (Math.hypot(deltaX, deltaY) > 5) this.suppressClick = true;
      this.pan.x = this.dragStart.panX + deltaX;
      this.pan.y = this.dragStart.panY + deltaY;
      this.applyTransform();
    });
    this.mapViewport.addEventListener('pointerup', (event) => {
      this.dragging = false;
      this.mapViewport.releasePointerCapture(event.pointerId);
      this.mapViewport.classList.remove('is-dragging');
    });
  }

  render() {
    const map = this.game.mapSystem;
    const discoveredRooms = [...map.discovered];
    const positions = discoveredRooms.map((roomId) => map.positions[roomId]);
    const minX = Math.min(...positions.map((position) => position.x), 0);
    const maxX = Math.max(...positions.map((position) => position.x), 0);
    const minY = Math.min(...positions.map((position) => position.y), 0);
    const maxY = Math.max(...positions.map((position) => position.y), 0);
    const width = (maxX - minX + 1) * 112;
    const height = (maxY - minY + 1) * 92;
    const currentPosition = map.positions[this.game.roomManager.currentId] ?? { x: 0, y: 0 };
    const tileMarkup = discoveredRooms.map((roomId) => {
      const position = map.positions[roomId];
      const marker = map.markers[roomId];
      const current = roomId === this.game.roomManager.currentId;
      return `<button class="map-room ${current ? 'is-current' : ''}" data-map-room="${roomId}" style="left:${(position.x - minX) * 112}px;top:${(position.y - minY) * 92}px"><span>${current ? '●' : '□'}</span>${marker ? `<b>${markerIcons[marker]}</b>` : ''}</button>`;
    }).join('');
    this.mapRooms.style.width = `${width}px`;
    this.mapRooms.style.height = `${height}px`;
    this.mapRooms.innerHTML = tileMarkup;
    if (!this.hasPosition) {
      this.pan.x = this.mapViewport.clientWidth / 2 - ((currentPosition.x - minX) * 112 + 48);
      this.pan.y = this.mapViewport.clientHeight / 2 - ((currentPosition.y - minY) * 92 + 36);
      this.hasPosition = true;
    }
    this.applyTransform();
    this.miniMap.innerHTML = discoveredRooms.map((roomId) => {
      const position = map.positions[roomId];
      const marker = map.markers[roomId];
      const left = 53 + (position.x - currentPosition.x) * 16 - 7;
      const top = 37 + (position.y - currentPosition.y) * 16 - 7;
      return `<span class="mini-room ${roomId === this.game.roomManager.currentId ? 'is-current' : ''}" style="left:${left}px;top:${top}px">${marker ? markerIcons[marker] : ''}</span>`;
    }).join('');
  }

  applyTransform() {
    this.mapRooms.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
  }
}
