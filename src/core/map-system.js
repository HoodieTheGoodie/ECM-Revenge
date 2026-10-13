export const MARKER_TYPES = Object.freeze({ puzzle: 'puzzle', boss: 'boss', cleared: 'cleared' });

export class MapSystem {
  constructor() {
    this.discovered = new Set(['recovery']);
    this.positions = { recovery: { x: 0, y: 0 } };
    this.markers = {};
  }

  discover(roomId, fromRoomId, direction) {
    if (!this.discovered.has(roomId)) {
      const origin = this.positions[fromRoomId] ?? { x: 0, y: 0 };
      const offset = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } }[direction] ?? { x: 0, y: 0 };
      this.positions[roomId] = { x: origin.x + offset.x, y: origin.y + offset.y };
      this.discovered.add(roomId);
    }
  }

  setMarker(roomId, marker) {
    if (!this.discovered.has(roomId)) return;
    this.markers[roomId] = marker;
  }

  removeMarker(roomId) {
    delete this.markers[roomId];
  }

  serialize() {
    return { discovered: [...this.discovered], positions: this.positions, markers: this.markers };
  }

  restore(data) {
    if (!data) return;
    this.discovered = new Set(data.discovered ?? ['recovery']);
    this.positions = data.positions ?? { recovery: { x: 0, y: 0 } };
    this.markers = data.markers ?? {};
  }
}