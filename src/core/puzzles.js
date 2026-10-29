// Progress uses room + object IDs so existing room exports retain their identity.
export function isBarrier(door) {
  return door.kind === 'barrier' || Boolean(door.requirement || door.lockedColor || door.terminalNumber);
}

export function doorIsOpen(game, door, roomId = game.roomManager.currentId) {
  if (!isBarrier(door)) return true;
  if (game.doorStates[roomId]?.[door.id]) return true;
  if (door.requirement === 'terminal' || door.terminalNumber) return Boolean(game.terminalsOffline?.[door.terminalNumber]);
  return false;
}

export function unlockDoor(game, door, roomId = game.roomManager.currentId) {
  game.doorStates[roomId] = { ...(game.doorStates[roomId] ?? {}), [door.id]: true };
}

export function activateSwitch(game, wallSwitch) {
  const targetRoomId = wallSwitch.targetRoomId ?? game.roomManager.currentId;
  const targetRoom = game.roomManager.rooms[targetRoomId];
  const target = targetRoom?.doors?.find((door) => door.id === wallSwitch.targetDoorId && door.requirement === 'switches');
  if (!target) return false;
  game.switchStates[`${game.roomManager.currentId}:${wallSwitch.id}`] = true;
  unlockDoor(game, target, targetRoomId);
  return true;
}

export function takeTerminalOffline(game, terminal) {
  const number = Number(terminal.number);
  if (!Number.isInteger(number) || number < 1 || number > 10 || game.terminalsOffline[number]) return false;
  game.terminalsOffline[number] = true;
  // Flags are global; every barrier with this number opens in every section.
  return true;
}
