import { campaignRooms, playgroundRooms } from './campaign.js';

function boundaryWalls(width, height, exits) {
  const openingStart = height / 2 - 100;
  const openingSize = 200;
  const walls = [
    { x: 0, y: 0, width, height: 40 },
    { x: 0, y: height - 40, width, height: 40 }
  ];
  if (exits.left) {
    walls.push({ x: 0, y: 0, width: 40, height: openingStart });
    walls.push({ x: 0, y: openingStart + openingSize, width: 40, height: height - openingStart - openingSize });
  } else walls.push({ x: 0, y: 0, width: 40, height });
  if (exits.right) {
    walls.push({ x: width - 40, y: 0, width: 40, height: openingStart });
    walls.push({ x: width - 40, y: openingStart + openingSize, width: 40, height: height - openingStart - openingSize });
  } else walls.push({ x: width - 40, y: 0, width: 40, height });
  return walls;
}

const recoveryMaze = [
  { x: 260, y: 360, width: 720, height: 34 },
  { x: 260, y: 360, width: 34, height: 330 },
  { x: 1120, y: 180, width: 34, height: 430 },
  { x: 1120, y: 610, width: 520, height: 34 },
  { x: 1640, y: 610, width: 34, height: 360 },
  { x: 700, y: 860, width: 34, height: 420 },
  { x: 700, y: 1280, width: 700, height: 34 },
  { x: 1780, y: 1080, width: 760, height: 34 },
  { x: 1780, y: 1080, width: 34, height: 360 },
  { x: 2180, y: 460, width: 34, height: 430 }
];

const archiveMaze = [
  { x: 300, y: 300, width: 720, height: 34 },
  { x: 300, y: 300, width: 34, height: 460 },
  { x: 1020, y: 300, width: 34, height: 620 },
  { x: 1240, y: 760, width: 720, height: 34 },
  { x: 1960, y: 500, width: 34, height: 294 },
  { x: 420, y: 1160, width: 620, height: 34 },
  { x: 420, y: 1160, width: 34, height: 360 },
  { x: 1320, y: 1360, width: 720, height: 34 },
  { x: 2040, y: 1120, width: 34, height: 274 }
];

const relayMaze = [
  { x: 360, y: 280, width: 620, height: 34 },
  { x: 360, y: 280, width: 34, height: 440 },
  { x: 980, y: 280, width: 34, height: 620 },
  { x: 1180, y: 620, width: 620, height: 34 },
  { x: 1800, y: 620, width: 34, height: 440 },
  { x: 480, y: 1180, width: 780, height: 34 },
  { x: 1260, y: 1180, width: 34, height: 380 },
  { x: 1560, y: 1480, width: 640, height: 34 }
];

export const rooms = {
  __meta: { startRoomId: 'signal-hall' },
  ...campaignRooms,
  ...playgroundRooms,
  recovery: { id: 'recovery', name: 'Recovery Sector', width: 3200, height: 2200, gridSize: 100, exits: { right: 'archive' }, chest: { x: 680, y: 520, itemId: 'default-sword' }, keys: [{ id: 'recovery-blue-key', x: 1160, y: 800, color: 'blue' }], doors: [{ id: 'recovery-blue-door', kind: 'maze', x: 1400, y: 800, width: 40, height: 40, lockedColor: 'blue' }], enemies: [{ type: 'chaser', x: 900, y: 520, level: 1 }, { type: 'chaser', x: 1900, y: 1540, level: 1 }], walls: [...boundaryWalls(3200, 2200, { right: true }), ...recoveryMaze] },
  archive: { id: 'archive', name: 'Dead Archive', width: 3200, height: 2200, gridSize: 100, exits: { left: 'recovery', right: 'relay' }, keys: [], doors: [], enemies: [{ type: 'chaser', x: 760, y: 520, level: 1 }, { type: 'chaser', x: 1540, y: 860, level: 1 }, { type: 'chaser', x: 2450, y: 1500, level: 1 }], walls: [...boundaryWalls(3200, 2200, { left: true, right: true }), ...archiveMaze] },
  relay: { id: 'relay', name: 'Signal Relay', width: 3200, height: 2200, gridSize: 100, exits: { left: 'archive' }, keys: [], doors: [], enemies: [{ type: 'chaser', x: 850, y: 720, level: 1 }, { type: 'chaser', x: 2020, y: 1480, level: 1 }], walls: [...boundaryWalls(3200, 2200, { left: true }), ...relayMaze] }
};
