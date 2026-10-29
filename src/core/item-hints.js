import { ABILITY_KEYS } from './inventory.js';

export function getItemHint(item, inventory) {
  if (!item) return 'Choose an item and I’ll explain how to use it.';
  const weaponIndex = inventory.equipment.weapons.indexOf(item.id);
  const abilityIndex = inventory.equipment.abilities.indexOf(item.id);
  const equip = item.slot === 'weapon' ? weaponIndex >= 0 ? `Press ${weaponIndex + 1} to hold it. ` : 'Equip it in a red weapon slot, then press that slot’s number. ' : item.slot === 'ability' && abilityIndex < 0 ? 'Equip it in a blue ability slot first. ' : '';
  const hints = {
    sword: 'Aim with the mouse. Left click or Space swings; right click spins. Stay just outside enemy reach and strike during their recovery.',
    spear: 'Left click or Space thrusts along your aim. Keep enemies at the tip of your reach. Right click throws the spear; the special has a cooldown.',
    daggers: 'Left click or Space makes quick short-range cuts. Right click performs an invulnerable thrust-dash that damages enemies along the path. Aim where you want to dash.',
    gun: 'Left click or Space fires a laser. You have 10 rounds; each missing round takes four seconds to recharge. Right click spends one round on an explosive shot. Watch the ammo display.',
    scythe: 'Left click or Space sweeps the blade. Right click throws a scythe that stops and spins, hitting repeatedly. Keep enemies in the spinning blade’s path.',
    shield: 'Equip this in the Shield slot, then TAP B to raise it for 0.6 seconds. Its cooldown is 1.6 seconds. Reflecting a projectile in the first 0.16 seconds is a perfect reflect and resets that cooldown. Reflected shots follow your mouse aim. Melee attacks inside the shield deal 35% more damage and slow you briefly, so create space before raising it.',
    'map-view': 'Keep Map View equipped in a blue slot. M opens your discovered section map; N opens the room overview. The section selector lets you revisit saved maps. This is passive: its blue slot key does not need to be pressed.',
    dash: 'Dash follows your mouse aim and gives brief invulnerability. It has a two-second cooldown. Shift + Q also activates an equipped Dash. Avoid an actual attack in the first 0.12 seconds to earn one Evasion charge. That charge automatically dodges the next attack that would hit you; it does not stack. Watch the Evasion diamond on your HUD.',
    'clear-sight': 'Clear Sight removes the maze fog for five seconds, then visibility returns. It has an eighteen-second cooldown. Watch the violet Sight timer on your HUD and plan your route before the pulse fades. It does not unlock unexplored rooms on your map.',
    heal: 'Repair Pulse restores 20% of maximum HP, then needs twelve seconds to recharge.',
    barrier: 'Phase Barrier gives 1.5 seconds of invulnerability with a ten-second cooldown. It does not reflect projectiles like the Shield does.',
    stamina: 'Energy Surge restores 35% of maximum stamina, with an eight-second cooldown.',
    'swift-armor': 'Equip this in Armor. It reduces damage and gives a small movement-speed boost automatically. There is no activation button.',
    'tanker-armor': 'Equip this in Armor. It provides heavier defense but reduces movement speed. There is no activation button.',
    trinket: 'Equip this in Trinket. Its listed stats and passive work automatically while equipped.'
  };
  const type = item.type === 'laser-gun' ? 'gun' : item.type;
  const abilityKey = item.slot === 'ability' && type !== 'map-view' ? abilityIndex >= 0 ? `Press ${ABILITY_KEYS[abilityIndex].toUpperCase()} in your current loadout. ` : 'The key printed on its chosen blue slot activates it. ' : '';
  if (item.slot === 'key') return `Carry this ${item.color} key to a matching colored barrier and press E beside the door. The key is consumed when it opens that barrier.`;
  const parry = item.slot === 'weapon' ? ' Every weapon can parry: aim at the attacker and tap G just before impact. The 0.18-second window costs 18 stamina and also deflects projectiles. Success refunds 9 stamina, staggers melee attackers, and gives your next normal hit 75% bonus damage for 0.8 seconds. A missed parry leaves you recovering for 0.32 seconds: attacks and defenses are locked, movement slows, and you take 20% more damage. Parry again after the 0.65-second cooldown.' : '';
  return `${equip}${abilityKey}${hints[type] ?? 'Equip this in its matching slot. The item’s stats and perks explain its effect.'}${parry}`;
}
