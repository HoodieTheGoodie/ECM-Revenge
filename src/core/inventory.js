export function createInventory() {
  return {
    items: [],
    equipment: {
      armor: null,
      shield: null,
      trinket: null,
      weapons: [null, null, null],
      activeWeapon: 0
    },
    locked: ['Encrypted Core', 'Ghost Module', 'Antivirus Fragment']
  };
}

export function createSwordItem() {
  return { id: 'default-sword', name: 'Default Sword', slot: 'weapon', weaponIndex: 0, equipped: false, placeholder: false };
}

export function createKeyItem(color) {
  return { id: `key-${color}`, name: `${color[0].toUpperCase()}${color.slice(1)} Key`, slot: 'key', color, equipped: false, placeholder: false };
}

export function restoreInventory(savedInventory) {
  if (!savedInventory || Array.isArray(savedInventory)) return createInventory();
  return {
    ...createInventory(),
    ...savedInventory,
    equipment: { ...createInventory().equipment, ...savedInventory.equipment }
  };
}