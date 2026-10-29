import { ABILITY_KEYS } from '../core/inventory.js';
import { itemIcon } from './item-icons.js';

export class Hud {
  constructor() {
    this.healthBar = document.querySelector('#health-bar');
    this.healthValue = document.querySelector('#health-value');
    this.staminaBar = document.querySelector('#stamina-bar');
    this.staminaValue = document.querySelector('#stamina-value');
    this.experienceBar = document.querySelector('#experience-bar');
    this.experienceValue = document.querySelector('#experience-value');
    this.levelValue = document.querySelector('#player-level');
    this.weaponName = document.querySelector('#held-weapon-name');
    this.specialStatus = document.querySelector('#special-status');
    this.specialMeter = document.querySelector('#special-meter');
    this.ammoReadout = document.querySelector('#ammo-readout');
    this.ammoStatus = document.querySelector('#ammo-status');
    this.ammoMeter = document.querySelector('#ammo-meter');
    this.defenseStatus = document.querySelector('#defense-status');
    this.defenseMeter = document.querySelector('#defense-meter');
    this.evasionStatus = document.querySelector('#evasion-status');
    this.sightStatus = document.querySelector('#sight-status');
  }

  update(player, inventory, combat) {
    const healthPercent = Math.round((player.health / player.maxHealth) * 100);
    const staminaPercent = Math.round((player.stamina / player.maxStamina) * 100);
    const experiencePercent = Math.round((player.experience / player.experienceToNext) * 100);
    this.healthBar.style.width = `${healthPercent}%`;
    this.healthValue.textContent = `${healthPercent}%`;
    this.staminaBar.style.width = `${staminaPercent}%`;
    this.staminaValue.textContent = `${staminaPercent}%`;
    this.experienceBar.style.width = `${experiencePercent}%`;
    this.experienceValue.textContent = `${experiencePercent}%`;
    this.levelValue.textContent = player.level;
    const abilities = player.equippedAbilities ?? [];
    document.querySelectorAll('[data-ability-slot]').forEach((slot, index) => {
      const ability = abilities[index];
      const remaining = ability ? player.abilityCooldowns[ability.type] ?? 0 : 0;
      const total = ability ? (ability.cooldown ?? 0) * (1 - (player.cooldownReduction ?? 0)) : 0;
      if (slot.dataset.itemId !== (ability?.id ?? 'empty')) {
        slot.innerHTML = `${itemIcon(ability)}<span class="ability-readiness"></span><b>${ability?.type === 'map-view' ? 'M/N' : ABILITY_KEYS[index].toUpperCase()}</b>`;
        slot.dataset.itemId = ability?.id ?? 'empty';
      }
      const text = slot.querySelector('.ability-readiness');
      const activeSight = ability?.type === 'clear-sight' && (combat?.effects?.fogRevealRemaining ?? player.fogRevealRemaining ?? 0) > 0;
      const label = activeSight ? 'ON' : ability && remaining > 0 ? remaining.toFixed(1) : '';
      if (text.textContent !== label) text.textContent = label;
      slot.classList.toggle('is-cooling', remaining > 0);
      slot.classList.toggle('is-active-ability', activeSight);
      slot.classList.toggle('has-ability', Boolean(ability));
      slot.style.setProperty('--cooldown', `${total > 0 ? Math.min(100, remaining / total * 100) : 0}%`);
      slot.title = ability ? `${ability.name} · ${ability.type === 'map-view' ? 'M / N' : ABILITY_KEYS[index].toUpperCase()}${remaining > 0 ? ` · ${remaining.toFixed(1)}s` : ''}` : `Empty ability slot ${index + 1}`;
      slot.setAttribute('aria-label', slot.title);
    });
    if (this.weaponName && inventory) {
      const weapon = inventory.items.find((item) => item.id === inventory.equipment.weapons[inventory.equipment.activeWeapon]);
      const effects = combat?.effects ?? {};
      const remaining = effects.specialCooldown ?? 0;
      const maximum = effects.specialCooldownMax ?? 1;
      this.weaponName.textContent = weapon?.name ?? 'Unarmed';
      this.specialStatus.textContent = !weapon ? 'Equip a weapon in inventory' : remaining > 0 ? `RMB special · ${remaining.toFixed(1)}s` : 'RMB special · READY';
      this.specialMeter.style.width = `${weapon ? Math.max(0, Math.min(100, (1 - remaining / maximum) * 100)) : 0}%`;
      const weaponHeld = Boolean(weapon);
      const shieldEquipped = Boolean(inventory.equipment.shield);
      const parryCooldown = effects.parryCooldown ?? 0;
      const shieldCooldown = effects.shieldCooldown ?? 0;
      const recovery = effects.parryRecovery ?? 0;
      const parryText = weaponHeld ? `G parry ${effects.parryActive ? 'ACTIVE' : parryCooldown > 0 ? `${parryCooldown.toFixed(1)}s` : player.stamina < 18 ? 'LOW STAMINA' : 'READY'}` : '';
      const shieldText = shieldEquipped ? `B shield ${effects.shieldActive ? 'ACTIVE' : shieldCooldown > 0 ? `${shieldCooldown.toFixed(1)}s` : 'READY'}` : '';
      this.defenseStatus.textContent = recovery > 0 ? `MISSED PARRY · RECOVER ${recovery.toFixed(1)}s` : effects.hindered ? 'HINDERED · SHIELD BREACHED' : effects.riposteTimer > 0 ? 'RIPOSTE READY · ATTACK NOW' : [parryText, shieldText].filter(Boolean).join(' / ') || 'EQUIP A WEAPON TO PARRY';
      this.defenseStatus.parentElement.classList.toggle('is-hindered', Boolean(effects.hindered));
      this.defenseStatus.parentElement.classList.toggle('is-riposte', effects.riposteTimer > 0);
      this.defenseStatus.parentElement.classList.toggle('is-recovering', recovery > 0);
      const defenseRemaining = recovery > 0 ? recovery / (effects.parryRecoveryMax || .32) : shieldEquipped && shieldCooldown > 0 ? shieldCooldown / (effects.shieldCooldownMax || 1.6) : weaponHeld ? parryCooldown / (effects.parryCooldownMax || .65) : 0;
      this.defenseMeter.style.width = `${weaponHeld || shieldEquipped ? Math.max(0, Math.min(100, 100 - defenseRemaining * 100)) : 0}%`;
      if (this.evasionStatus) {
        const evasion = effects.evasionCharges ?? player.evasionCharges ?? 0;
        const readout = this.evasionStatus.parentElement;
        this.evasionStatus.textContent = effects.perfectDodgeFlash > 0 ? 'PERFECT DODGE · +1 EVASION' : effects.evasionFlash > 0 ? 'EVASION USED · HIT AVOIDED' : evasion > 0 ? 'EVASION READY · 1 BLOCK' : 'EVASION · 0 / 1';
        readout.classList.toggle('is-ready', evasion > 0);
        readout.classList.toggle('is-flashing', effects.perfectDodgeFlash > 0 || effects.evasionFlash > 0);
      }
      if (this.sightStatus) {
        const sight = effects.fogRevealRemaining ?? player.fogRevealRemaining ?? 0;
        this.sightStatus.parentElement.hidden = sight <= 0;
        this.sightStatus.textContent = `CLEAR SIGHT · ${sight.toFixed(1)}s`;
      }
      const isGun = weapon && ['gun', 'laser-gun'].includes(weapon.type);
      this.ammoReadout.hidden = !isGun;
      if (isGun) {
        const ammo = effects.ammo ?? combat?.game?.sword?.ammo ?? 0;
        const maxAmmo = effects.maxAmmo ?? combat?.game?.sword?.maxAmmo ?? 10;
        const progress = effects.rechargeProgress ?? 0;
        this.ammoStatus.textContent = `${ammo}/${maxAmmo} ammo${ammo < maxAmmo ? ` · +1 in ${Math.max(0, (1 - progress) * 4).toFixed(1)}s` : ' · CHARGED'}`;
        this.ammoMeter.style.width = `${ammo < maxAmmo ? Math.max(0, Math.min(100, progress * 100)) : 100}%`;
        if (ammo === 0 && remaining <= 0) this.specialStatus.textContent = 'RMB special · WAIT FOR AMMO';
      }
    }
  }

  setRoomName(name) {
    document.title = `Echo Maze 2 // ${name}`;
  }
}
