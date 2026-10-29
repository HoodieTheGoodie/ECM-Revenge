// Shared silhouettes keep the loadout, quickbars, and Tip Box recognizable.
const paths = {
  sword: '<path d="m10 23 13-13 2-7-7 2L5 18zm-3-7 9 9M7 25l-3 3m0-6 6 6"/>',
  spear: '<path d="m5 28 17-17m-6 0 6-8 5-1-1 5-8 6zm-6 9 3 3"/>',
  daggers: '<path d="m5 17 5-12 3-2 2 5-5 12zm-1-1 8 4m-6 0-2 6m14-8 5-12 3-2 2 5-5 12zm-1-1 8 4m-6 0-2 6"/>',
  gun: '<path d="M4 10h18l5 3v5H13l-2 8H5l2-10H4zm18 2h7v4h-7M9 10V7h10v3m-5 8v4h4l2-4"/>',
  scythe: '<path d="m10 29 9-25m-7 2c10-7 17-2 17 9-4-7-9-8-17-4m0 9 4 2"/>',
  'swift-armor': '<path d="m11 4-7 4 2 8 4-2-1 14h14l-1-14 4 2 2-8-7-4c-1 5-9 5-10 0Zm1 10 4 5 4-5m-8 9h8"/>',
  'tanker-armor': '<path d="m10 3-7 5 1 11 5-2v12h14V17l5 2 1-11-7-5-3 4h-6zm0 8h12v9l-6 5-6-5zm-6 0h5m14 0h5"/>',
  shield: '<path d="m16 3 11 4v9c0 6-7 11-11 13C12 27 5 22 5 16V7zm0 5-6 2v6c0 3 3 6 6 8 3-2 6-5 6-8v-6z"/>',
  trinket: '<path d="m11 4 5 6 5-6M16 10l9 8-9 11-9-11zm0 5-4 4 4 5 4-5zm-9-7 3 3m15-3-3 3"/>',
  dash: '<path d="m16 6 10 10-10 10m-7-18 8 8-8 8M3 12h7m-9 8h9"/>',
  'map-view': '<path d="m3 7 8-3 10 4 8-3v22l-8 3-10-4-8 3zm8-3v22m10-18v22M6 17l4-3 5 4 5-3 5 4"/>',
  'clear-sight': '<path d="M2 16s5-8 14-8 14 8 14 8-5 8-14 8S2 16 2 16zm14-14v3m0 22v3M3 5l3 3m20 16 3 3M3 27l3-3M26 8l3-3"/><circle cx="16" cy="16" r="4"/>',
  heal: '<path d="M12 4h8v8h8v8h-8v8h-8v-8H4v-8h8z"/>',
  barrier: '<path d="M16 3C4 5 1 14 7 23l9 6 9-6c6-9 3-18-9-20zm0 5-6 4v8l6 4 6-4v-8z"/>',
  stamina: '<path d="m19 2-15 18h10l-2 10 16-19H18z"/>',
  key: '<circle cx="10" cy="10" r="6"/><path d="m14 14 14 14m-8-8 4-4m0 8 4-4"/>',
  empty: '<path d="M7 11V7h4m10 0h4v4m0 10v4h-4m-10 0H7v-4m6-5h6"/>'
};

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function itemIcon(item) {
  const type = item?.slot === 'key' ? 'key' : item?.type === 'laser-gun' ? 'gun' : item?.type;
  const shape = Object.hasOwn(paths, type ?? '') ? type : 'empty';
  const colors = { red: '#ff827e', green: '#8ce59a', blue: '#8ac5ff', yellow: '#ffe17d', purple: '#d39bff', orange: '#ffb77b' };
  const keyColor = item?.slot === 'key' ? colors[item.color] : null;
  return `<svg class="item-icon item-icon-${shape}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${keyColor ? ` style="color:${keyColor}"` : ''}>${paths[shape]}</svg>`;
}

export function formatStat(stat, value) {
  const label = { damage: 'Damage', defense: 'Defense', range: 'Range', attackSpeed: 'Speed', moveSpeed: 'Move', maxHealth: 'Max HP', maxStamina: 'Stamina', magazine: 'Ammo' }[stat] ?? stat;
  const amount = stat === 'moveSpeed' ? `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%` : stat === 'attackSpeed' ? `${value}×` : value;
  return `${label} ${amount}`;
}

export function itemStats(item) {
  const stats = Object.entries(item.stats ?? {}).map(([stat, value]) => `<span>${escapeHTML(formatStat(stat, value))}</span>`);
  if (item.slot === 'ability') stats.push(`<span>${item.cooldown ? `${item.cooldown}s cooldown` : 'Passive'}</span>`);
  return stats.length ? `<div class="item-stats">${stats.join('')}</div>` : '';
}

export function buffSummary(item) {
  return (item?.buffs ?? []).map((buff) => `+${Math.round(buff.value * 100)}% ${buff.label ?? buff.stat}`).join(' · ') || 'No random buff';
}

export function equippedLabel(inventory, item) {
  if (item.slot === 'weapon') {
    const index = inventory.equipment.weapons.indexOf(item.id);
    return index >= 0 ? `${index === inventory.equipment.activeWeapon ? 'Held' : 'Equipped'} · ${index + 1}` : '';
  }
  if (item.slot === 'ability') {
    const index = inventory.equipment.abilities.indexOf(item.id);
    return index >= 0 ? `Equipped · ${['Q', 'R', 'F', 'C', 'V'][index]}` : '';
  }
  return inventory.equipment[item.slot] === item.id ? 'Equipped' : '';
}
