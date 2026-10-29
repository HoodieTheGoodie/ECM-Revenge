export const MARKER_TYPES = Object.freeze({ puzzle: 'puzzle', boss: 'boss', cleared: 'cleared' });

export class MapSystem {
  constructor() {
    this.discovered = new Set();
    this.positions = {};
    this.markers = {};
    this.sections = {};
    this.activeSection = null;
    this.connections = [];
  }

  activate(sectionId = 'section-1') {
    if (this.activeSection === sectionId) return;
    if (this.activeSection) this.sections[this.activeSection] = this.currentData();
    const section = this.sections[sectionId] ?? {};
    this.activeSection = sectionId;
    this.discovered = new Set(section.discovered ?? []);
    this.positions = section.positions ?? {};
    this.markers = section.markers ?? {};
    this.connections = section.connections ?? [];
  }

  discover(roomId, fromRoomId, direction, sectionId = this.activeSection ?? 'section-1') {
    this.activate(sectionId);
    if (!this.discovered.has(roomId)) {
      const origin = this.positions[fromRoomId] ?? { x: 0, y: 0 };
      const offset = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } }[direction] ?? { x: 0, y: 0 };
      const position = this.discovered.size ? { x: origin.x + offset.x, y: origin.y + offset.y } : { x: 0, y: 0 };
      // Multiple doors on one wall must not draw discovered rooms on top of each other.
      while (Object.values(this.positions).some((entry) => entry.x === position.x && entry.y === position.y)) {
        if (offset.y) position.x += 1;
        else position.y += 1;
      }
      this.positions[roomId] = position;
      this.discovered.add(roomId);
    }
    if (this.discovered.has(fromRoomId) && fromRoomId !== roomId && !this.connections.some(([a, b]) => a === fromRoomId && b === roomId || a === roomId && b === fromRoomId)) this.connections.push([fromRoomId, roomId]);
  }

  viewSection(sectionId = this.activeSection) {
    return sectionId === this.activeSection ? this.currentData() : this.sections[sectionId] ?? { discovered: [], positions: {}, markers: {}, connections: [] };
  }

  setMarker(roomId, marker, sectionId = this.activeSection) {
    const section = this.viewSection(sectionId);
    if (!section.discovered.includes(roomId) || !Object.values(MARKER_TYPES).includes(marker)) return;
    section.markers[roomId] = marker;
  }

  removeMarker(roomId, sectionId = this.activeSection) {
    delete this.viewSection(sectionId).markers[roomId];
  }

  serialize() {
    if (this.activeSection) this.sections[this.activeSection] = this.currentData();
    return { ...this.currentData(), activeSection: this.activeSection, sections: this.sections };
  }

  currentData() {
    return { discovered: [...this.discovered], positions: this.positions, markers: this.markers, connections: this.connections };
  }

  restore(data) {
    if (!data) return;
    this.sections = data.sections ?? { 'section-1': data };
    this.activeSection = null;
    this.activate(data.activeSection ?? 'section-1');
  }
}
