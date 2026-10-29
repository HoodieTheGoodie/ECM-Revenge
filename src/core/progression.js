import { createGearItem, createAbilityItem, upgradeItem, enchantItem } from './inventory.js';

export const SKILLS = Object.freeze({
  maxHealth: { label: 'Max HP', description: '+10 base HP per token' },
  maxStamina: { label: 'Max stamina', description: '+10 base stamina per token' },
  cooldownReduction: { label: 'Cooldown reduction', description: '−2% cooldown per token; maximum 50%', cap: 25 },
  damage: { label: 'Damage', description: '+5% damage per token' }
});
export const SHOP_ITEMS = Object.freeze([
  { type: 'sword', name: 'Sword', cost: 1 }, { type: 'spear', name: 'Spear', cost: 2 },
  { type: 'daggers', name: 'Daggers', cost: 2 }, { type: 'gun', name: 'Laser Gun', cost: 2 },
  { type: 'swift-armor', name: 'Swift Armor', cost: 1 }, { type: 'tanker-armor', name: 'Tanker Armor', cost: 1 },
  { type: 'trinket', name: 'Signal Trinket', cost: 1 },
  { type: 'dash', name: 'Dash', slot: 'ability', cost: 1 }, { type: 'heal', name: 'Repair Pulse', slot: 'ability', cost: 1 },
  { type: 'barrier', name: 'Phase Barrier', slot: 'ability', cost: 1 }, { type: 'stamina', name: 'Energy Surge', slot: 'ability', cost: 1 },
  { type: 'clear-sight', name: 'Clear Sight', slot: 'ability', cost: 1 }
]);
function result(ok, message) { return { ok, message }; }
function spend(inventory, cost, permanent = true) {
  if ((inventory.tokens ?? 0) < cost) return false;
  inventory.tokens -= cost;
  if (permanent) inventory.permanentTokensSpent = (inventory.permanentTokensSpent ?? 0) + cost;
  return true;
}
export function improveGear(inventory, itemId, level, action, rarityScope = 'tip-box') {
  const item = inventory.items.find((entry) => entry.id === itemId);
  const allowed = rarityScope === 'rare' ? ['rare'] : ['epic', 'unique'];
  if (!item || !allowed.includes(item.rarity) || ['ability', 'key'].includes(item.slot)) return result(false, 'Choose eligible gear first.');
  if (action !== 'upgrade' && action !== 'reroll') return result(false, 'Unknown gear action.');
  if (action === 'upgrade' && item.level >= level) return result(false, 'This item already matches your level.');
  if ((inventory.tokens ?? 0) < 1) return result(false, 'You need one Level Token.');
  const changed = action === 'upgrade' ? upgradeItem(item, level) : enchantItem(item);
  if (!changed) return result(false, 'This item cannot be modified.');
  spend(inventory, 1);
  return result(true, action === 'upgrade' ? `${item.name} upgraded to level ${level}.` : `${item.name} received a new buff.`);
}
export function allocateSkill(inventory, skill) {
  const definition = SKILLS[skill];
  if (!definition) return result(false, 'Unknown skill.');
  if ((inventory.skillPoints[skill] ?? 0) >= (definition.cap ?? Infinity)) return result(false, 'This skill is at its maximum.');
  if (!spend(inventory, 1, false)) return result(false, 'You need one Level Token.');
  inventory.skillPoints[skill] = (inventory.skillPoints[skill] ?? 0) + 1;
  return result(true, `${definition.label} increased.`);
}
export function resetSkills(inventory) {
  const refunded = Object.keys(SKILLS).reduce((sum, skill) => sum + (inventory.skillPoints[skill] ?? 0), 0);
  for (const skill of Object.keys(SKILLS)) inventory.skillPoints[skill] = 0;
  inventory.tokens += refunded;
  return result(true, `${refunded} skill token${refunded === 1 ? '' : 's'} refunded. Gear and shop purchases are not refundable.`);
}
export function buyShopItem(inventory, type, level) {
  const offer = SHOP_ITEMS.find((entry) => entry.type === type);
  if (!offer) return result(false, 'Unknown shop item.');
  if (!spend(inventory, offer.cost)) return result(false, `You need ${offer.cost} Level Tokens.`);
  inventory.items.push(offer.slot === 'ability' ? createAbilityItem(type, level) : createGearItem(type, level, 'common'));
  return result(true, `${offer.name} added to your inventory.`);
}
export function removeInventoryItem(inventory, itemId) {
  const item = inventory.items.find((entry) => entry.id === itemId);
  if (!item || item.protected) return false;
  for (const slot of ['weapons', 'abilities']) inventory.equipment[slot] = inventory.equipment[slot].map((id) => id === itemId ? null : id);
  for (const slot of ['armor', 'shield', 'trinket']) if (inventory.equipment[slot] === itemId) inventory.equipment[slot] = null;
  inventory.items = inventory.items.filter((entry) => entry.id !== itemId);
  return true;
}
export function grindItem(inventory, itemId) {
  const item = inventory.items.find((entry) => entry.id === itemId);
  if (!item || item.slot === 'key' || item.protected || ['map-view', 'shield'].includes(item.type)) return result(false, 'This item cannot be ground.');
  const amount = { common: 5, rare: 15, epic: 25, unique: 50 }[item.rarity ?? 'common'] ?? 5;
  if (!removeInventoryItem(inventory, itemId)) return result(false, 'This item cannot be ground.');
  const total = (inventory.grinderProgress ?? 0) + amount;
  const earned = Math.floor(total / 100);
  inventory.grinderProgress = total % 100;
  inventory.tokens += earned;
  return result(true, `${item.name} destroyed: +${amount}% grinder progress.${earned ? ' One Level Token earned.' : ''}`);
}

export { collectLevelTokens } from './inventory.js';
