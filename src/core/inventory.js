export const RARITIES = Object.freeze({ common: 1, rare: 1.25, epic: 1.6, unique: 2.25 });
export const ABILITY_KEYS = ['q', 'r', 'f', 'c', 'v'];
export const GEAR_TYPES = Object.freeze({
  sword: { name: 'Sword', slot: 'weapon', stats: { damage: 10, range: 105, attackSpeed: 1 } },
  spear: { name: 'Spear', slot: 'weapon', stats: { damage: 18, range: 150, attackSpeed: 0.68 } },
  daggers: { name: 'Daggers', slot: 'weapon', stats: { damage: 6, range: 75, attackSpeed: 1.65, moveSpeed: 0.1 } },
  gun: { name: 'Laser Gun', slot: 'weapon', stats: { damage: 12, range: 650, attackSpeed: 1, magazine: 10 } },
  scythe: { name: 'Scythe', slot: 'weapon', stats: { damage: 20, range: 125, attackSpeed: 1.3 } },
  'swift-armor': { name: 'Swift Armor', slot: 'armor', stats: { defense: 12, moveSpeed: 0.08 } },
  'tanker-armor': { name: 'Tanker Armor', slot: 'armor', stats: { defense: 35, moveSpeed: -0.15 } },
  shield: { name: 'Reflector Shield', slot: 'shield', stats: { defense: 8 } },
  trinket: { name: 'Signal Trinket', slot: 'trinket', stats: { maxStamina: 10 } }
});
export const ABILITY_TYPES = Object.freeze({
  dash: { name: 'Dash', cooldown: 2, description: 'Dash toward your aim with brief invulnerability. Shift + Q also works while Dash is equipped.' },
  'map-view': { name: 'Map View', cooldown: 0, description: 'Passive scanner: M opens the discovered map; N shows the room overview.' },
  'clear-sight': { name: 'Clear Sight', cooldown: 18, description: 'Clear the fog for five seconds. Visibility returns when the pulse fades.' },
  heal: { name: 'Repair Pulse', cooldown: 12, description: 'Restore 20% of maximum HP.' },
  barrier: { name: 'Phase Barrier', cooldown: 10, description: 'Become invulnerable for 1.5 seconds.' },
  stamina: { name: 'Energy Surge', cooldown: 8, description: 'Restore 35% of maximum stamina.' }
});
const BUFFS = [
  { stat: 'healthRegen', label: 'HP regen / 5 seconds', min: 1, max: 15 },
  { stat: 'moveSpeed', label: 'Move speed', min: 5, max: 20 },
  { stat: 'staminaRegen', label: 'Stamina regen', min: 10, max: 30 },
  { stat: 'damage', label: 'Damage', min: 5, max: 10 },
  { stat: 'maxHealth', label: 'Max HP', min: 1, max: 10 },
  { stat: 'maxStamina', label: 'Max stamina', min: 1, max: 10 }
];
let itemSequence = 0;
function itemId(type) {
  return `${type}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++itemSequence}`}`;
}
function scaledStats(type, level, rarity) {
  const template = GEAR_TYPES[type] ?? GEAR_TYPES.sword;
  const multiplier = Math.pow(1.1, Math.max(0, level - 1)) * (RARITIES[rarity] ?? 1);
  return Object.fromEntries(Object.entries(template.stats).map(([key, value]) => [key, ['damage', 'defense', 'maxHealth', 'maxStamina'].includes(key) ? Math.round(value * multiplier * 10) / 10 : value]));
}
export function rollItemBuff() {
  const definition = BUFFS[Math.floor(Math.random() * BUFFS.length)];
  return { stat: definition.stat, label: definition.label, value: (definition.min + Math.floor(Math.random() * (definition.max - definition.min + 1))) / 100 };
}
export function createInventory() {
  return {
    items: [],
    equipment: { armor: null, shield: null, trinket: null, weapons: [null, null, null], activeWeapon: 0, abilities: [null, null, null, null, null] },
    tokens: 0,
    grinderProgress: 0,
    permanentTokensSpent: 0,
    skillPoints: { maxHealth: 0, maxStamina: 0, cooldownReduction: 0, damage: 0 },
    locked: ['Encrypted Core', 'Ghost Module', 'Antivirus Fragment']
  };
}
export function createGearItem(type = 'sword', level = 1, rarity = 'common', options = {}) {
  if (type === 'laser-gun') type = 'gun';
  if (!GEAR_TYPES[type]) type = 'sword';
  if (type === 'scythe') rarity = 'unique';
  if (!RARITIES[rarity]) rarity = 'common';
  level = Math.max(1, Math.floor(Number(level) || 1));
  const template = GEAR_TYPES[type];
  const passives = {
    scythe: { type: 'life-steal', value: 0.04, description: 'Reaper’s return: recover 4% of damage dealt as HP while held.' },
    'swift-armor': { type: 'move-speed', value: 0.12, description: 'Slipstream: an additional 12% movement speed while equipped.' },
    'tanker-armor': { type: 'shielding', value: 0.2, description: 'Bulwark: persistent shielding absorbs 20% of incoming damage while equipped.' },
    trinket: { type: 'health-regen', value: 0.025, description: 'Renewal: restore 2.5% of maximum HP every five seconds while equipped.' }
  };
  return {
    id: options.id ?? itemId(type), type, name: options.name ?? template.name, slot: template.slot,
    level, rarity, stats: scaledStats(type, level, rarity),
    buffs: options.buffs ?? (['epic', 'unique'].includes(rarity) ? [rollItemBuff()] : []),
    ...(rarity === 'unique' ? { passive: passives[type] ?? { type: 'shielding', value: 0.15, description: 'Persistent shielding: absorb 15% of incoming damage while this item is active.' } } : {}),
    equipped: false, placeholder: false
  };
}
export function createAbilityItem(type = 'dash', level = 1, options = {}) {
  if (!ABILITY_TYPES[type]) type = 'dash';
  return { id: options.id ?? itemId(type), type, name: ABILITY_TYPES[type].name, slot: 'ability', rarity: 'common', level: Math.max(1, level), cooldown: ABILITY_TYPES[type].cooldown, description: ABILITY_TYPES[type].description, stats: {}, buffs: [], equipped: false, placeholder: false };
}
export function createSwordItem(level = 1) {
  return createGearItem('sword', level, 'common', { id: 'default-sword', name: 'Default Sword' });
}
export function createKeyItem(color) {
  return { id: `key-${color}`, name: `${color[0].toUpperCase()}${color.slice(1)} Key`, slot: 'key', color, equipped: false, placeholder: false };
}
export function getActiveWeapon(inventory) {
  const id = inventory.equipment.weapons[inventory.equipment.activeWeapon];
  return inventory.items.find((item) => item.id === id) ?? null;
}
export function upgradeItem(item, level) {
  if (!item || !GEAR_TYPES[item.type] || item.rarity === 'common' || level <= item.level) return false;
  item.level = level;
  item.stats = scaledStats(item.type, level, item.rarity);
  return true;
}
export function enchantItem(item) {
  if (!item || !GEAR_TYPES[item.type] || item.rarity === 'common') return false;
  item.buffs = [rollItemBuff()];
  return true;
}
export function restoreInventory(savedInventory) {
  const defaults = createInventory();
  if (!savedInventory || Array.isArray(savedInventory)) return defaults;
  const inventory = { ...defaults, ...savedInventory, equipment: { ...defaults.equipment, ...savedInventory.equipment }, skillPoints: { ...defaults.skillPoints, ...savedInventory.skillPoints } };
  inventory.items = (Array.isArray(savedInventory.items) ? savedInventory.items : []).map((item) => {
    if (item.id === 'default-sword') return { ...createSwordItem(item.level ?? 1), ...item, type: item.type ?? 'sword' };
    if (GEAR_TYPES[item.type]) return { ...createGearItem(item.type, item.level, item.rarity), ...item };
    if (item.slot === 'ability') return { ...createAbilityItem(item.type, item.level), ...item };
    return { ...item };
  });
  for (const [slot, length] of [['weapons', 3], ['abilities', 5]]) {
    inventory.equipment[slot] = Array.from({ length }, (_, index) => inventory.items.some((item) => item.id === inventory.equipment[slot]?.[index]) ? inventory.equipment[slot][index] : null);
  }
  for (const slot of ['armor', 'shield', 'trinket']) if (!inventory.items.some((item) => item.id === inventory.equipment[slot])) inventory.equipment[slot] = null;
  inventory.equipment.activeWeapon = Math.max(0, Math.min(2, Math.floor(Number(inventory.equipment.activeWeapon) || 0)));
  inventory.tokens = Math.max(0, Math.floor(Number(inventory.tokens) || 0));
  inventory.grinderProgress = Math.max(0, Math.min(99, Number(inventory.grinderProgress) || 0));
  return inventory;
}
export function applyEquipmentStats(player, inventory) {
  const skills = { ...createInventory().skillPoints, ...inventory.skillPoints };
  const bonuses = { healthRegen: 0, moveSpeed: 0, staminaRegen: 0, damage: 0, maxHealth: 0, maxStamina: 0 };
  let defense = 0;
  let flatHealth = 0;
  let flatStamina = 0;
  let shielding = 0;
  let lifeSteal = 0;
  const active = getActiveWeapon(inventory);
  const activeIds = [active?.id, inventory.equipment.armor, inventory.equipment.shield, inventory.equipment.trinket].filter(Boolean);
  for (const item of inventory.items.filter((entry) => activeIds.includes(entry.id))) {
    defense += item.stats?.defense ?? 0;
    flatHealth += item.stats?.maxHealth ?? 0;
    flatStamina += item.stats?.maxStamina ?? 0;
    bonuses.moveSpeed += item.stats?.moveSpeed ?? 0;
    for (const buff of item.buffs ?? []) if (Object.hasOwn(bonuses, buff.stat)) bonuses[buff.stat] += buff.value;
    if (item.passive?.type === 'shielding') shielding += item.passive.value;
    if (item.passive?.type === 'move-speed') bonuses.moveSpeed += item.passive.value;
    if (item.passive?.type === 'health-regen') bonuses.healthRegen += item.passive.value;
    if (item.passive?.type === 'life-steal') lifeSteal += item.passive.value;
  }
  player.maxHealth = Math.round((100 + skills.maxHealth * 10 + flatHealth) * (1 + bonuses.maxHealth));
  player.maxStamina = Math.round((100 + skills.maxStamina * 10 + flatStamina) * (1 + bonuses.maxStamina));
  player.maxSpeed = 280 * Math.max(0.25, 1 + bonuses.moveSpeed);
  player.staminaRechargeRate = 20 * (1 + bonuses.staminaRegen);
  player.damageMultiplier = 1 + skills.damage * 0.05 + bonuses.damage;
  player.cooldownReduction = Math.min(0.5, skills.cooldownReduction * 0.02);
  player.healthRegen = bonuses.healthRegen * player.maxHealth / 5;
  player.defense = defense;
  player.shielding = Math.min(0.75, shielding);
  player.lifeSteal = lifeSteal;
  player.shieldEquipped = Boolean(inventory.equipment.shield);
  player.equippedAbilities = (inventory.equipment.abilities ?? []).map((id) => inventory.items.find((item) => item.id === id) ?? null);
  player.equippedAbilityTypes = player.equippedAbilities.filter(Boolean).map((item) => item.type);
  player.health = Math.min(player.health, player.maxHealth);
  player.stamina = Math.min(player.stamina, player.maxStamina);
  return active;
}
export function getItemDescription(item) {
  const lines = [`${item.rarity ?? 'common'} • Level ${item.level ?? 1} • ${item.slot}`];
  for (const [stat, value] of Object.entries(item.stats ?? {})) {
    const label = { damage: 'Damage', defense: 'Defense', range: 'Range', attackSpeed: 'Attack speed', moveSpeed: 'Move speed', maxHealth: 'Max HP', maxStamina: 'Max stamina', magazine: 'Magazine' }[stat] ?? stat;
    lines.push(`${label}: ${stat === 'moveSpeed' ? `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%` : stat === 'attackSpeed' ? `${value}×` : value}`);
  }
  for (const buff of item.buffs ?? []) lines.push(`+${Math.round(buff.value * 100)}% ${buff.label ?? buff.stat}`);
  if (item.passive?.description) lines.push(item.passive.description);
  if (item.description) lines.push(item.description);
  if (item.slot === 'weapon' && ((item.buffs?.length ?? 0) > 0 || item.passive)) lines.push('Weapon perks apply only while held.');
  return lines.join('\n');
}

export function collectLevelTokens(player, inventory) {
  const earned = Math.max(0, Math.floor(player.levelTokensEarned ?? 0));
  inventory.tokens = (inventory.tokens ?? 0) + earned;
  player.levelTokensEarned = 0;
  return earned;
}
