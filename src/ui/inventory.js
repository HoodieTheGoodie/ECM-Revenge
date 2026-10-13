const slotLabels = { armor: 'ARMOR', shield: 'SHIELD', trinket: 'TRINKET' };

export class InventoryUI {
  constructor(game) {
    this.game = game;
    this.itemList = document.querySelector('#inventory-items');
    document.querySelector('#inventory-menu').addEventListener('click', (event) => {
      const button = event.target.closest('[data-inventory-action]');
      if (!button) return;
      const itemId = button.dataset.itemId;
      if (button.dataset.inventoryAction === 'equip') this.game.equipItem(itemId);
      if (button.dataset.inventoryAction === 'unequip') this.game.unequipItem(itemId);
      if (button.dataset.inventoryAction === 'drop') this.game.dropItem(itemId);
    });
    document.querySelector('#weapon-quickbar').addEventListener('click', (event) => {
      const button = event.target.closest('[data-weapon-slot]');
      if (button) this.game.selectWeapon(Number(button.dataset.weaponSlot));
    });
  }

  render(inventory) {
    this.itemList.innerHTML = inventory.items.length ? inventory.items.map((item) => `
      <div class="inventory-row">
          <div class="item-name"><span class="item-icon ${item.id === 'default-sword' ? 'sword-icon' : 'placeholder-circle'}"></span><div><strong>${item.name}</strong><small>${item.slot.toUpperCase()}</small></div></div>
          ${item.placeholder ? '<span class="placeholder-tag">PLACEHOLDER</span>' : item.slot === 'key' ? `<div class="inventory-actions"><span class="key-tag">KEY</span><button data-inventory-action="drop" data-item-id="${item.id}">DROP</button></div>` : `<div class="inventory-actions"><button data-inventory-action="${item.equipped ? 'unequip' : 'equip'}" data-item-id="${item.id}">${item.equipped ? 'UNEQUIP' : 'EQUIP'}</button><button data-inventory-action="drop" data-item-id="${item.id}">DROP</button></div>`}
      </div>`).join('') : '<p class="empty-inventory">No items carried.</p>';

    Object.entries(slotLabels).forEach(([slot, label]) => {
      const itemId = inventory.equipment[slot];
      const item = inventory.items.find((entry) => entry.id === itemId);
      const equipmentSlot = document.querySelector(`[data-equipment-slot="${slot}"]`);
      equipmentSlot.innerHTML = item ? '<span class="item-icon placeholder-circle"></span>' : '<span class="item-icon placeholder-circle"></span>';
      equipmentSlot.title = item ? item.name : `Empty ${label.toLowerCase()} slot`;
    });
    inventory.equipment.weapons.forEach((itemId, index) => {
      const item = inventory.items.find((entry) => entry.id === itemId);
      const slot = document.querySelector(`[data-inventory-weapon-slot="${index}"]`);
      slot.innerHTML = item ? '<span class="item-icon sword-icon"></span>' : '<span class="item-icon placeholder-circle"></span>';
      slot.title = item ? item.name : `Empty slot ${index + 1}`;
    });
    document.querySelectorAll('[data-weapon-slot]').forEach((button) => button.classList.toggle('is-active', Number(button.dataset.weaponSlot) === inventory.equipment.activeWeapon));
    inventory.equipment.weapons.forEach((itemId, index) => {
      const button = document.querySelector(`.weapon-slot-button[data-weapon-slot="${index}"]`);
      const hasWeapon = Boolean(itemId);
      button.classList.toggle('has-weapon', hasWeapon);
      button.title = hasWeapon ? inventory.items.find((item) => item.id === itemId)?.name ?? 'Weapon' : `Empty weapon slot ${index + 1}`;
    });
  }
}