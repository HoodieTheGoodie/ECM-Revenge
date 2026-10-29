import { ABILITY_KEYS, applyEquipmentStats, getItemDescription } from '../core/inventory.js';
import { improveGear } from '../core/progression.js';
import { buffSummary, equippedLabel, escapeHTML, itemIcon, itemStats } from './item-icons.js';

export { escapeHTML } from './item-icons.js';
const slotLabels = { armor: 'ARMOR', shield: 'SHIELD', trinket: 'TRINKET' };
const categories = [ ['weapon', 'Weapons'], ['ability', 'Abilities'], ['armor', 'Armor'], ['shield', 'Shields'], ['trinket', 'Trinkets'], ['key', 'Keys'] ];

export class InventoryUI {
  constructor(game) {
    this.game = game;
    this.itemList = document.querySelector('#inventory-items');
    this.selectedAbilitySlot = null;
    this.category = 'all';
    document.querySelector('#inventory-menu').addEventListener('click', (event) => {
      const category = event.target.closest('[data-inventory-category]');
      if (category) { this.category = category.dataset.inventoryCategory; this.render(this.game.inventory); return; }
      const abilitySlot = event.target.closest('[data-inventory-ability-slot]');
      if (abilitySlot) { this.selectedAbilitySlot = Number(abilitySlot.dataset.inventoryAbilitySlot); this.render(this.game.inventory); return; }
      const weaponSlot = event.target.closest('[data-inventory-weapon-slot]');
      if (weaponSlot) { this.game.selectWeapon(Number(weaponSlot.dataset.inventoryWeaponSlot)); return; }
      const button = event.target.closest('[data-inventory-action]');
      if (!button) return;
      if (button.dataset.inventoryAction === 'dismiss-hint') { document.querySelector('#inventory-tippy-hint').hidden = true; return; }
      const itemId = button.dataset.itemId;
      const item = this.game.inventory.items.find((entry) => entry.id === itemId);
      if (button.dataset.inventoryAction === 'hint') { this.game.showItemHint(itemId); return; }
      if (button.dataset.inventoryAction === 'equip') this.game.equipItem(itemId, item?.slot === 'ability' ? this.selectedAbilitySlot ?? undefined : undefined);
      if (button.dataset.inventoryAction === 'unequip') this.game.unequipItem(itemId);
      if (button.dataset.inventoryAction === 'drop') this.game.dropItem(itemId);
      if (['upgrade', 'reroll'].includes(button.dataset.inventoryAction)) {
        const before = buffSummary(item);
        const result = improveGear(this.game.inventory, itemId, this.game.player.level, button.dataset.inventoryAction, 'rare');
        applyEquipmentStats(this.game.player, this.game.inventory);
        this.game.refreshEquipmentStats?.();
        const message = document.querySelector('#inventory-message');
        if (message) message.textContent = result.message + (result.ok && button.dataset.inventoryAction === 'reroll' ? ` ${before} → ${buffSummary(item)}.` : '');
        this.render(this.game.inventory);
      }
    });
    document.querySelector('#weapon-quickbar').addEventListener('click', (event) => {
      const button = event.target.closest('[data-weapon-slot]');
      if (button) this.game.selectWeapon(Number(button.dataset.weaponSlot));
    });
  }

  render(inventory) {
    const categoryButtons = document.querySelector('#inventory-categories');
    categoryButtons.innerHTML = [['all', 'All'], ...categories].map(([slot, label]) => {
      const count = slot === 'all' ? inventory.items.length : inventory.items.filter((item) => item.slot === slot).length;
      return `<button type="button" data-inventory-category="${slot}" aria-pressed="${this.category === slot}" class="${this.category === slot ? 'is-active' : ''}">${label}<span>${count}</span></button>`;
    }).join('');
    document.querySelector('#inventory-count').textContent = `${inventory.items.length} items`;
    this.itemList.innerHTML = categories.filter(([slot]) => this.category === 'all' || this.category === slot).map(([slot, label]) => {
      const items = inventory.items.filter((item) => item.slot === slot);
      return `<section class="inventory-section" data-item-section="${slot}" aria-label="${label}"><h4>${label}<span>${items.length}</span></h4><div class="inventory-section-items">${items.length ? items.map((item) => this.renderItem(inventory, item)).join('') : `<p class="empty-inventory">No ${label.toLowerCase()} carried.</p>`}</div></section>`;
    }).join('');
    const tokens = document.querySelector('#inventory-tokens');
    if (tokens) tokens.textContent = `${inventory.tokens ?? 0} LEVEL TOKENS`;
    const target = this.selectedAbilitySlot ?? Math.max(0, inventory.equipment.abilities.indexOf(null));
    const weaponName = inventory.items.find((item) => item.id === inventory.equipment.weapons[inventory.equipment.activeWeapon])?.name;
    const abilityName = inventory.items.find((item) => item.id === inventory.equipment.abilities[target])?.name;
    document.querySelector('#inventory-slot-hint').innerHTML = `<span>Weapon target <b>${inventory.equipment.activeWeapon + 1}</b> · ${escapeHTML(weaponName ?? 'Empty')}</span><span>Ability target <b>${ABILITY_KEYS[target].toUpperCase()}</b> · ${escapeHTML(abilityName ?? 'Empty')}</span>`;
    Object.entries(slotLabels).forEach(([slot, label]) => {
      const item = inventory.items.find((entry) => entry.id === inventory.equipment[slot]);
      const equipmentSlot = document.querySelector(`[data-equipment-slot="${slot}"]`);
      equipmentSlot.innerHTML = `${itemIcon(item ?? { type: slot === 'armor' ? 'tanker-armor' : slot })}<span>${escapeHTML(item?.name ?? 'Empty')}</span>`;
      equipmentSlot.classList.toggle('is-empty', !item);
      equipmentSlot.title = item ? `${item.name}\n${getItemDescription(item)}` : `Empty ${label.toLowerCase()} slot`;
    });
    inventory.equipment.weapons.forEach((itemId, index) => {
      const item = inventory.items.find((entry) => entry.id === itemId);
      const slot = document.querySelector(`[data-inventory-weapon-slot="${index}"]`);
      slot.innerHTML = `${itemIcon(item)}<span>${escapeHTML(item?.name ?? 'Empty')}</span><small>${index + 1}</small>`;
      slot.title = item ? `${item.name}\n${getItemDescription(item)}` : `Select weapon slot ${index + 1}`;
      slot.classList.toggle('is-active', index === inventory.equipment.activeWeapon);
      slot.setAttribute('aria-pressed', String(index === inventory.equipment.activeWeapon));
    });
    (inventory.equipment.abilities ?? []).forEach((itemId, index) => {
      const item = inventory.items.find((entry) => entry.id === itemId);
      const slot = document.querySelector(`[data-inventory-ability-slot="${index}"]`);
      if (!slot) return;
      slot.innerHTML = `${itemIcon(item)}<span>${escapeHTML(item?.name ?? 'Empty')}</span><small>${ABILITY_KEYS[index].toUpperCase()}</small>`;
      slot.title = item ? `${item.name}\n${getItemDescription(item)}` : `Select ability slot ${index + 1} (${ABILITY_KEYS[index].toUpperCase()})`;
      slot.classList.toggle('is-active', index === target);
      slot.setAttribute('aria-pressed', String(index === target));
    });
    document.querySelectorAll('[data-weapon-slot]').forEach((button) => button.classList.toggle('is-active', Number(button.dataset.weaponSlot) === inventory.equipment.activeWeapon));
    inventory.equipment.weapons.forEach((itemId, index) => {
      const item = inventory.items.find((entry) => entry.id === itemId);
      const button = document.querySelector(`.weapon-slot-button[data-weapon-slot="${index}"]`);
      button.classList.toggle('has-weapon', Boolean(item));
      button.innerHTML = `${itemIcon(item)}<b>${index + 1}</b>`;
      button.title = item ? item.name : `Empty weapon slot ${index + 1}`;
      button.setAttribute('aria-label', `Weapon slot ${index + 1}: ${item?.name ?? 'Empty'}`);
    });
  }

  renderItem(inventory, item) {
    const id = escapeHTML(item.id);
    const rarity = ['common', 'rare', 'epic', 'unique'].includes(item.rarity) ? item.rarity : 'common';
    const equipped = equippedLabel(inventory, item);
    const target = item.slot === 'weapon' ? String(inventory.equipment.activeWeapon + 1) : item.slot === 'ability' ? ABILITY_KEYS[this.selectedAbilitySlot ?? Math.max(0, inventory.equipment.abilities.indexOf(null))].toUpperCase() : '';
    return `<article class="inventory-row rarity-${rarity}" data-item-id="${id}">
      <div class="item-name">${itemIcon(item)}<div><strong>${escapeHTML(item.name)}</strong><small>${item.slot !== 'key' ? `LV ${item.level ?? 1} · ${rarity.toUpperCase()}` : 'DOOR ACCESS'}${equipped ? ` <b class="equipped-tag">${escapeHTML(equipped)}</b>` : ''}</small></div></div>
      ${itemStats(item)}
      ${item.buffs?.length ? `<p class="item-buffs">${escapeHTML(buffSummary(item))}</p>` : ''}
      ${item.passive?.description ? `<p class="item-passive">${escapeHTML(item.passive.description)}</p>` : ''}
      ${item.description ? `<p class="item-description">${escapeHTML(item.description)}</p>` : ''}
      <div class="inventory-actions">${item.placeholder ? '<span class="placeholder-tag">UNAVAILABLE</span>' : item.slot === 'key' ? '<span class="key-tag">Opens matching locks automatically</span>' : `<button data-inventory-action="${equipped ? 'unequip' : 'equip'}" data-item-id="${id}">${equipped ? 'UNEQUIP' : `EQUIP${target ? ` → ${target}` : ''}`}</button>`}
      <button class="item-hint-button" data-inventory-action="hint" data-item-id="${id}" title="Ask Tippy how to use ${escapeHTML(item.name)}">? ASK TIPPY</button>
      ${!item.protected && item.slot !== 'key' && item.type !== 'map-view' ? `<button class="item-delete" data-inventory-action="drop" data-item-id="${id}" title="Permanently remove this item">DELETE</button>` : ''}
      ${item.rarity === 'rare' ? `<button data-inventory-action="upgrade" data-item-id="${id}" ${item.level >= this.game.player.level || !inventory.tokens ? 'disabled' : ''} title="Upgrade to player level ${this.game.player.level}">UPGRADE · 1 TOKEN</button><button data-inventory-action="reroll" data-item-id="${id}" ${!inventory.tokens ? 'disabled' : ''}>ENCHANT · 1 TOKEN</button>` : ''}</div>
    </article>`;
  }
}
