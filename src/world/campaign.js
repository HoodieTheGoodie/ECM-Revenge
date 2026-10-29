// Additive starter campaign and an isolated feature-testing route. Legacy rooms stay intact.
function room(id, name, width = 1200, height = 800, extra = {}) {
  return { id, name, width, height, gridSize: 40, sectionId: 'section-1', sectionName: 'Section 1',
    walls: [{ x: 0, y: 0, width, height: 40 }, { x: 0, y: height - 40, width, height: 40 }, { x: 0, y: 0, width: 40, height }, { x: width - 40, y: 0, width: 40, height }],
    doors: [], keys: [], enemies: [], chests: [], ...extra };
}
function connect(collection, a, b, side, label) {
  const first = collection[a], second = collection[b];
  const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' }[side];
  const shape = (entry, direction) => ['left', 'right'].includes(direction)
    ? { x: direction === 'left' ? 0 : entry.width - 40, y: entry.height / 2 - 60, width: 40, height: 120 }
    : { x: entry.width / 2 - 60, y: direction === 'up' ? 0 : entry.height - 40, width: 120, height: 40 };
  first.doors.push({ id: `${a}-to-${b}`, kind: 'room', ...shape(first, side), targetRoom: b, targetDoor: `${b}-to-${a}`, label: label ?? second.name });
  second.doors.push({ id: `${b}-to-${a}`, kind: 'room', ...shape(second, opposite), targetRoom: a, targetDoor: `${a}-to-${b}`, label: first.name });
}
function gateAcross(entry, x, id, requirement, extra = {}) {
  entry.walls.push({ x, y: 40, width: 40, height: entry.height - 80 });
  entry.doors.push({ id, kind: 'barrier', x, y: entry.height / 2 - 60, width: 40, height: 120, requirement, ...extra });
}

export const campaignRooms = {
  'signal-hall': room('signal-hall', 'Tutorial Hallway', 480, 2000, { sectionId: 'tutorial', sectionName: 'Tutorial', tutorialStage: 'movement', spawn: { x: 240, y: 140 } }),
  'signal-cache': room('signal-cache', 'Recovery Cache', 800, 600, { sectionId: 'tutorial', sectionName: 'Tutorial', tutorialStage: 'equipment', chests: [{ id: 'starter', x: 400, y: 260, itemId: 'default-sword', starter: true }] }),
  'signal-lore': room('signal-lore', 'Tippy’s Relay', 800, 600, { sectionId: 'tutorial', sectionName: 'Tutorial', tutorialStage: 'lore' }),
  'main-hub': room('main-hub', 'Main Hub', 1200, 800, { type: 'hub', tutorialHub: true, sectionId: 'hub', sectionName: 'Hub', tipBox: { x: 600, y: 400 }, tutorialTrigger: { x: 600, y: 400, direction: { x: 0, y: 1 } } }),
  'section-one-entry': room('section-one-entry', 'Section 1 — Switch Hall', 1200, 800, {
    switches: [{ id: 'remote-switch', x: 55, y: 180, wallSide: 'right', targetRoomId: 'section-one-approach', targetDoorId: 'remote-barrier' }],
    keys: [{ id: 'blue-key', x: 350, y: 240, color: 'blue' }],
    chests: [{ id: 'gear-cache', x: 950, y: 250, itemId: 'random', rarity: 'rare' }],
    enemies: [{ type: 'chaser', x: 700, y: 400, level: 1, weaponType: 'sword' }]
  }),
  'section-one-approach': room('section-one-approach', 'Section 1 — Security Gates', 1200, 800, {
    enemies: [{ type: 'chaser', x: 700, y: 280, level: 2, weaponType: 'spear' }, { type: 'chaser', x: 740, y: 550, level: 2, weaponType: 'daggers' }]
  }),
  'section-one-challenge': room('section-one-challenge', 'Hidden Combat Cache', 800, 700, { type: 'challenge', parentRoomId: 'section-one-entry', dungeon: true,
    enemies: [{ type: 'chaser', x: 200, y: 350, level: 2 }, { type: 'chaser', x: 600, y: 350, level: 2 }, { type: 'chaser', x: 400, y: 540, level: 3 }]
  }),
  'flying-pig-arena': room('flying-pig-arena', 'Section 1 — Flying Pig', 1200, 900, { boss: { type: 'flying-pig', x: 600, y: 330 }, terminals: [{ id: 'terminal-one', number: 1, x: 600, y: 730 }] }),
  'aegis-crossing': room('aegis-crossing', 'Outer Relay — Crossing', 1200, 1000, { sectionId: 'shield-relay', sectionName: 'Outer Relay',
    enemies: [{ type: 'chaser', x: 350, y: 340, level: 2, weaponType: 'sword' }, { type: 'chaser', x: 850, y: 380, level: 2, weaponType: 'spear' }, { type: 'chaser', x: 650, y: 720, level: 2, weaponType: 'daggers' }],
    chests: [{ id: 'relay-dash', x: 200, y: 760, itemId: 'dash' }]
  }),
  'aegis-switchyard': room('aegis-switchyard', 'Outer Relay — Switchyard', 1600, 1200, { sectionId: 'shield-relay', sectionName: 'Outer Relay',
    switches: [{ id: 'vault-release', x: 1545, y: 240, targetRoomId: 'aegis-vault', targetDoorId: 'vault-seal' }],
    enemies: [{ type: 'chaser', x: 400, y: 300, level: 2, weaponType: 'daggers' }, { type: 'chaser', x: 800, y: 320, level: 3, weaponType: 'gun' }, { type: 'chaser', x: 1300, y: 400, level: 2, weaponType: 'spear' }, { type: 'chaser', x: 600, y: 800, level: 3, weaponType: 'sword' }, { type: 'chaser', x: 1200, y: 850, level: 2, weaponType: 'daggers' }]
  }),
  'aegis-trial': room('aegis-trial', 'Outer Relay — Guardian Trial', 1400, 1000, { sectionId: 'shield-relay', sectionName: 'Outer Relay', type: 'challenge',
    enemies: [{ type: 'chaser', x: 250, y: 350, level: 3, weaponType: 'sword' }, { type: 'chaser', x: 500, y: 260, level: 3, weaponType: 'spear' }, { type: 'chaser', x: 800, y: 300, level: 3, weaponType: 'gun' }, { type: 'chaser', x: 300, y: 730, level: 3, weaponType: 'daggers' }, { type: 'chaser', x: 650, y: 780, level: 3, weaponType: 'sword' }, { type: 'chaser', x: 900, y: 680, level: 3, weaponType: 'spear' }]
  }),
  'aegis-vault': room('aegis-vault', 'Outer Relay — Reflector Vault', 1000, 800, { sectionId: 'shield-relay', sectionName: 'Outer Relay',
    chests: [{ id: 'reflector-shield', x: 740, y: 400, itemId: 'shield', rarity: 'rare' }]
  }),
  'section-two-entry': room('section-two-entry', 'Section 2 — Reconnected', 1200, 800, { sectionId: 'section-2', sectionName: 'Section 2',
    enemies: [{ type: 'chaser', x: 500, y: 300, level: 4 }, { type: 'chaser', x: 900, y: 500, level: 5 }],
    chests: [{ id: 'section-two-cache', x: 950, y: 200, itemId: 'random', rarity: 'epic' }], terminals: [{ id: 'terminal-two', number: 2, x: 1000, y: 650 }]
  })
};
connect(campaignRooms, 'signal-hall', 'main-hub', 'down', 'Empty Hub');
connect(campaignRooms, 'main-hub', 'signal-cache', 'right', 'Starter Cache');
connect(campaignRooms, 'signal-cache', 'signal-lore', 'down');
connect(campaignRooms, 'signal-lore', 'main-hub', 'right', 'Main Hub — equip Sword + Map View');
campaignRooms['signal-lore'].doors.find((door) => door.targetRoom === 'main-hub').tutorialGate = true;
connect(campaignRooms, 'main-hub', 'section-one-entry', 'left', 'Section 1');
connect(campaignRooms, 'main-hub', 'section-two-entry', 'up', 'Section 2');
// Two distinct northern exits: the entrance hall and the later Section 2 gate.
campaignRooms['main-hub'].doors.find((door) => door.targetRoom === 'signal-hall').x = 180;
campaignRooms['main-hub'].doors.find((door) => door.targetRoom === 'section-two-entry').x = 900;
campaignRooms['main-hub'].doors.find((door) => door.targetRoom === 'signal-lore').y = 120;
// The relay passage is optional only after the first checkpoint.
campaignRooms['signal-cache'].doors.find((door) => door.targetRoom === 'signal-lore').afterTutorial = true;
connect(campaignRooms, 'main-hub', 'aegis-crossing', 'down', 'Outer Relay');
connect(campaignRooms, 'aegis-crossing', 'aegis-switchyard', 'right');
connect(campaignRooms, 'aegis-switchyard', 'aegis-trial', 'down');
connect(campaignRooms, 'aegis-trial', 'aegis-vault', 'right');
gateAcross(campaignRooms['aegis-trial'], 1100, 'trial-clear', 'all-enemies');
gateAcross(campaignRooms['aegis-vault'], 440, 'vault-seal', 'switches');
campaignRooms['aegis-switchyard'].walls.push({ x: 650, y: 40, width: 40, height: 420 }, { x: 650, y: 740, width: 40, height: 420 }, { x: 980, y: 440, width: 40, height: 380 });
Object.assign(campaignRooms['main-hub'].doors.find((door) => door.targetRoom === 'section-two-entry'), { lockedColor: 'green', requirement: 'key', hardmodeTerminal: 1 });
connect(campaignRooms, 'section-one-entry', 'section-one-approach', 'right');
connect(campaignRooms, 'section-one-entry', 'section-one-challenge', 'down', 'Unmarked passage');
connect(campaignRooms, 'section-one-approach', 'flying-pig-arena', 'right');
gateAcross(campaignRooms['section-one-entry'], 850, 'blue-barrier', 'key', { lockedColor: 'blue' });
gateAcross(campaignRooms['section-one-approach'], 480, 'remote-barrier', 'switches');
gateAcross(campaignRooms['section-one-approach'], 920, 'enemy-barrier', 'all-enemies');

export const playgroundRooms = {
  'feature-lab': room('feature-lab', 'Feature Playground — Tip Box', 1200, 800, { type: 'hub', tutorialAmbush: false, sectionId: 'hub', sectionName: 'Playground Hub', spawn: { x: 600, y: 470 },
    chests: [{ id: 'unique-scythe', x: 280, y: 300, itemId: 'scythe', rarity: 'unique' }, { id: 'unique-armor', x: 920, y: 300, itemId: 'tanker-armor', rarity: 'unique' }]
  }),
  'feature-locks': room('feature-locks', 'Keys, Switches & Terminals', 1600, 900, { sectionId: 'lab-puzzles', sectionName: 'Puzzle Lab',
    keys: [{ id: 'lab-green-key', color: 'green', x: 180, y: 350 }],
    switches: [{ id: 'lab-switch', x: 55, y: 240, targetRoomId: 'feature-locks-next', targetDoorId: 'lab-linked-door' }],
    terminals: [{ id: 'lab-terminal-three', number: 3, x: 700, y: 600 }],
    chests: [{ id: 'lab-loot', x: 1350, y: 600, itemId: 'random' }]
  }),
  'feature-locks-next': room('feature-locks-next', 'Cross-Room Switch Target', 1000, 700, { sectionId: 'lab-puzzles', sectionName: 'Puzzle Lab', chests: [{ id: 'linked-chest', x: 800, y: 350, itemId: 'spear', rarity: 'epic' }] }),
  'feature-combat': room('feature-combat', 'Combat & One-Time Reward', 1200, 900, { type: 'challenge', sectionId: 'lab-combat', sectionName: 'Combat Lab',
    enemies: [{ type: 'chaser', x: 350, y: 450, level: 1, weaponType: 'sword', armorType: null }, { type: 'chaser', x: 600, y: 450, level: 3, weaponType: 'spear', armorType: 'swift-armor' }, { type: 'chaser', x: 850, y: 450, level: 5, weaponType: 'gun', armorType: 'tanker-armor' }, { type: 'chaser', x: 600, y: 700, level: 2, weaponType: 'daggers', armorType: null }]
  }),
  'feature-boss': room('feature-boss', 'Flying Pig & Hardmode Test', 1200, 900, { sectionId: 'lab-boss', sectionName: 'Boss Lab', boss: { type: 'flying-pig', x: 600, y: 330 }, terminals: [{ id: 'lab-terminal-one', number: 1, x: 600, y: 730 }] })
};
connect(playgroundRooms, 'feature-lab', 'feature-locks', 'right', 'Puzzle Lab');
connect(playgroundRooms, 'feature-lab', 'feature-combat', 'down', 'Combat Lab');
connect(playgroundRooms, 'feature-lab', 'feature-boss', 'left', 'Flying Pig');
connect(playgroundRooms, 'feature-locks', 'feature-locks-next', 'right');
gateAcross(playgroundRooms['feature-locks'], 450, 'lab-key-door', 'key', { lockedColor: 'green' });
gateAcross(playgroundRooms['feature-locks'], 1000, 'lab-terminal-door-a', 'terminal', { terminalNumber: 3 });
gateAcross(playgroundRooms['feature-locks'], 1200, 'lab-terminal-door-b', 'terminal', { terminalNumber: 3 });
gateAcross(playgroundRooms['feature-locks-next'], 500, 'lab-linked-door', 'switches');
gateAcross(playgroundRooms['feature-combat'], 1000, 'lab-enemy-door', 'all-enemies');
