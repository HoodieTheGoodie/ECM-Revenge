import { rooms } from './rooms.js';
import { carveOpenings, positionHitsWall } from './collision.js';

export class RoomManager {
  constructor(options = {}) {
    const playground = options.startRoomId === 'feature-lab' || options.playground;
    this.rooms = Object.fromEntries(Object.entries(rooms).filter(([id]) => playground || !id.startsWith('feature-')));
    if (playground) this.rooms = Object.fromEntries(Object.entries(this.rooms).filter(([id]) => id.startsWith('feature-') || ['__meta', 'signal-hall', 'signal-cache', 'signal-lore', 'main-hub', 'section-two-entry'].includes(id)));
    if (playground) {
      for (const [id, entry] of Object.entries(this.rooms)) {
        if (entry?.id) this.rooms[id] = { ...entry, doors: (entry.doors ?? []).filter((door) => !door.targetRoom || this.rooms[door.targetRoom]) };
      }
    }
    try {
      const authored = JSON.parse(localStorage.getItem('echo-maze-2-editor-rooms-v2'));
      if (!options.ignoreAuthored && authored && typeof authored === 'object' && !Array.isArray(authored) && Object.values(authored).some((entry) => entry?.id && Number(entry.width) > 0 && Number(entry.height) > 0)) {
        // The editor owns its collection; avoid duplicate numbered terminals from another campaign.
        this.rooms = { ...authored };
        if (!this.rooms.__meta?.startRoomId || !this.rooms[this.rooms.__meta.startRoomId]) this.rooms.__meta = { ...this.rooms.__meta, startRoomId: Object.values(authored).find((entry) => entry?.id)?.id };
      }
    } catch { /* Keep built-in rooms when no authored collection exists. */ }
    const playtestRoom = options.ignorePlaytest ? null : new URLSearchParams(window.location.search).get('playtest');
    const authoredStart = this.rooms.__meta?.startRoomId;
    this.currentId = options.startRoomId && this.rooms[options.startRoomId] ? options.startRoomId : playtestRoom && this.rooms[playtestRoom] ? playtestRoom : authoredStart && this.rooms[authoredStart] ? authoredStart : 'recovery';
    this.startId = this.currentId;
    this.isPlaytest = Boolean(playtestRoom);
    this.loading = false;
    this.transitionTimer = 0;
    this.pendingRoom = null;
    this.pendingDoorId = null;
    this.spawnSide = null;
    this.previousRoomId = null;
  }

  get current() {
    const room = this.rooms[this.currentId] ?? this.rooms[this.startId];
    if (!room) return null;
    const exits = { ...(room.exits ?? {}) };
    (room.doors ?? []).forEach((door) => {
      if (!door.targetRoom) return;
      if (door.x <= 0) exits.left = door.targetRoom;
      else if (door.x + door.width >= room.width) exits.right = door.targetRoom;
      else if (door.y <= 0) exits.up = door.targetRoom;
      else if (door.y + door.height >= room.height) exits.down = door.targetRoom;
    });
    return { gridSize: 40, walls: [], sectionId: 'section-1', sectionName: 'Section 1', ...room, exits };
  }

  beginTransition(side) {
    const nextRoomId = this.current.exits[side];
    if (!nextRoomId || !this.rooms[nextRoomId] || this.loading) return false;
    this.loading = true;
    this.transitionTimer = 0.75;
    this.pendingRoom = nextRoomId;
    this.spawnSide = side;
    return true;
  }

  beginDoorTransition(door) {
    if (!door.targetRoom || !this.rooms[door.targetRoom] || this.loading) return false;
    this.loading = true;
    this.transitionTimer = 0.75;
    this.pendingRoom = door.targetRoom;
    this.pendingDoorId = door.targetDoor;
    this.spawnSide = door.x <= 0 ? 'left' : door.x + door.width >= this.current.width ? 'right' : door.y <= 0 ? 'up' : 'down';
    return true;
  }

  update(deltaTime, player) {
    if (!this.loading) return false;
    this.transitionTimer -= deltaTime;
    if (this.transitionTimer > 0) return false;
    this.previousRoomId = this.currentId;
    this.currentId = this.pendingRoom;
    this.pendingRoom = null;
    this.loading = false;
    const nextRoom = this.current;
    const targetDoor = nextRoom.doors?.find((door) => door.id === this.pendingDoorId)
      ?? nextRoom.doors?.find((door) => door.targetRoom === this.previousRoomId);
    if (targetDoor) {
      const grid = nextRoom.gridSize ?? 40;
      const cellCenter = (value) => Math.floor(value / grid) * grid + grid / 2;
      const centerX = cellCenter(targetDoor.x + targetDoor.width / 2);
      const centerY = cellCenter(targetDoor.y + targetDoor.height / 2);
      const adjacent = {
        right: { x: cellCenter(targetDoor.x + targetDoor.width), y: centerY },
        left: { x: Math.ceil(targetDoor.x / grid) * grid - grid / 2, y: centerY },
        down: { x: centerX, y: cellCenter(targetDoor.y + targetDoor.height) },
        up: { x: centerX, y: Math.ceil(targetDoor.y / grid) * grid - grid / 2 }
      };
      const inward = targetDoor.x <= 0 ? 'right' : targetDoor.x + targetDoor.width >= nextRoom.width ? 'left' : targetDoor.y <= 0 ? 'down' : targetDoor.y + targetDoor.height >= nextRoom.height ? 'up' : targetDoor.entrySide ?? this.spawnSide ?? 'down';
      const preferred = adjacent[inward] ?? adjacent.down;
      const candidates = [preferred, ...Object.values(adjacent).filter((point) => point !== preferred)];
      // If the adjacent cell was edited into a wall, search nearby tile centers rather than straddling tiles.
      for (let distance = 1; distance <= 6; distance++) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) candidates.push({ x: preferred.x + dx * distance * grid, y: preferred.y + dy * distance * grid });
      const openings = (nextRoom.doors ?? []).filter((door) => !door.lockedColor && !door.requirement || door.id === targetDoor.id).map((door) => ({ x:door.x, y:door.y, width:door.width, height:door.height }));
      const walls = carveOpenings(nextRoom.walls ?? [], openings);
      const safePosition = candidates.find((candidate) => candidate.x >= player.radius && candidate.x <= nextRoom.width - player.radius && candidate.y >= player.radius && candidate.y <= nextRoom.height - player.radius && !positionHitsWall(candidate, player.radius, walls));
      player.position = safePosition ?? { x: nextRoom.width / 2, y: nextRoom.height / 2 };
    } else {
      const sideSpawn = {
        left: { x: nextRoom.width - 80, y: nextRoom.height / 2 },
        right: { x: 80, y: nextRoom.height / 2 },
        up: { x: nextRoom.width / 2, y: nextRoom.height - 80 },
        down: { x: nextRoom.width / 2, y: 80 }
      }[this.spawnSide];
      player.position = sideSpawn ?? { x: nextRoom.width / 2, y: nextRoom.height / 2 };
    }
    player.velocity = { x: 0, y: 0 };
    player.dashTimer = 0;
    this.pendingDoorId = null;
    return true;
  }

  checkExit(player, canUseDoor = (door) => !door.lockedColor && !door.requirement) {
    const interiorDoor = (this.current.doors ?? []).find((door) => door.targetRoom && canUseDoor(door) && Math.hypot(player.position.x - (door.x + door.width / 2), player.position.y - (door.y + door.height / 2)) < 34);
    if (interiorDoor && this.beginDoorTransition(interiorDoor)) return;
    const side = player.position.x >= this.current.width - player.radius ? 'right' : player.position.x <= player.radius ? 'left' : player.position.y <= player.radius ? 'up' : player.position.y >= this.current.height - player.radius ? 'down' : null;
    // Authored doors are checked by position above; never bypass their locks via exits.
    const authoredSide = (this.current.doors ?? []).some((door) => door.targetRoom && (side === 'left' ? door.x <= 0 : side === 'right' ? door.x + door.width >= this.current.width : side === 'up' ? door.y <= 0 : side === 'down' ? door.y + door.height >= this.current.height : false));
    if (side && !authoredSide) this.beginTransition(side);
  }
}
