import { rooms } from './rooms.js';
import { carveOpenings, positionHitsWall } from './collision.js';

export class RoomManager {
  constructor() {
    try {
      const authored = JSON.parse(localStorage.getItem('echo-maze-2-editor-rooms-v2'));
      if (authored && typeof authored === 'object') Object.assign(rooms, authored);
    } catch { /* Keep built-in rooms when no authored collection exists. */ }
    const playtestRoom = new URLSearchParams(window.location.search).get('playtest');
    const authoredStart = rooms.__meta?.startRoomId;
    this.currentId = playtestRoom && rooms[playtestRoom] ? playtestRoom : authoredStart && rooms[authoredStart] ? authoredStart : 'recovery';
    this.loading = false;
    this.transitionTimer = 0;
    this.pendingRoom = null;
    this.pendingDoorId = null;
    this.spawnSide = null;
    this.previousRoomId = null;
  }

  get current() {
    const room = rooms[this.currentId];
    if (!room || room.exits) return room;
    const exits = {};
    (room.doors ?? []).forEach((door) => {
      if (!door.targetRoom) return;
      if (door.x <= 0) exits.left = door.targetRoom;
      else if (door.x + door.width >= room.width) exits.right = door.targetRoom;
      else if (door.y <= 0) exits.up = door.targetRoom;
      else if (door.y + door.height >= room.height) exits.down = door.targetRoom;
    });
    return { ...room, exits };
  }

  beginTransition(side) {
    const nextRoomId = this.current.exits[side];
    if (!nextRoomId || this.loading) return false;
    this.loading = true;
    this.transitionTimer = 0.75;
    this.pendingRoom = nextRoomId;
    this.spawnSide = side;
    return true;
  }

  beginDoorTransition(door) {
    if (!door.targetRoom || this.loading) return false;
    this.loading = true;
    this.transitionTimer = 0.75;
    this.pendingRoom = door.targetRoom;
    this.pendingDoorId = door.targetDoor;
    this.spawnSide = null;
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
    const targetDoor = nextRoom.doors?.find((door) => door.id === this.pendingDoorId);
    if (targetDoor) {
      const clearance = player.radius + 22;
      const centerX = targetDoor.x + targetDoor.width / 2;
      const centerY = targetDoor.y + targetDoor.height / 2;
      const candidates = [
        { x: centerX, y: targetDoor.y - clearance },
        { x: centerX, y: targetDoor.y + targetDoor.height + clearance },
        { x: targetDoor.x - clearance, y: centerY },
        { x: targetDoor.x + targetDoor.width + clearance, y: centerY },
        { x: centerX, y: centerY }
      ];
      const openings = (nextRoom.doors ?? []).filter((door) => !door.lockedColor).map((door) => ({ x:door.x, y:door.y, width:door.width, height:door.height }));
      const walls = carveOpenings(nextRoom.walls ?? [], openings);
      const safePosition = candidates.find((candidate) => candidate.x >= player.radius && candidate.x <= nextRoom.width - player.radius && candidate.y >= player.radius && candidate.y <= nextRoom.height - player.radius && !positionHitsWall(candidate, player.radius, walls));
      player.position = safePosition ?? { x: nextRoom.width / 2, y: nextRoom.height / 2 };
    } else {
      player.position.x = this.spawnSide === 'right' ? 80 : nextRoom.width - 80;
      player.position.y = nextRoom.height / 2;
    }
    this.pendingDoorId = null;
    return true;
  }

  checkExit(player) {
    const interiorDoor = (this.current.doors ?? []).find((door) => door.targetRoom && !door.lockedColor && Math.hypot(player.position.x - (door.x + door.width / 2), player.position.y - (door.y + door.height / 2)) < 30);
    if (interiorDoor && this.beginDoorTransition(interiorDoor)) return;
    const side = player.position.x >= this.current.width - player.radius ? 'right' : player.position.x <= player.radius ? 'left' : null;
    if (side) this.beginTransition(side);
  }
}