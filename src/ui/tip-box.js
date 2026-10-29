import { applyEquipmentStats, createAbilityItem, createGearItem, upgradeItem } from '../core/inventory.js';
import { SKILLS, SHOP_ITEMS, improveGear, allocateSkill, resetSkills, buyShopItem, grindItem, collectLevelTokens } from '../core/progression.js';
import { buffSummary, equippedLabel, escapeHTML, formatStat, itemIcon, itemStats } from './item-icons.js';

const servicePaths = {
  save: '<path d="M5 3h12l4 4v14H3V3zm2 0v7h10V3M7 21v-7h10v7"/>',
  gear: '<path d="m14 3 2 2 4-1 2 4-3 3 1 3-3 2-3-1-9 8-4-4 9-8-1-3 2-4zm2 5-4 4"/>',
  skills: '<path d="M12 3v7M5 16v-3h14v3M12 13v3"/><circle cx="12" cy="3" r="2"/><circle cx="5" cy="19" r="3"/><circle cx="12" cy="19" r="3"/><circle cx="19" cy="19" r="3"/>',
  shop: '<path d="m3 9 3-6h12l3 6v3H3zm2 3v9h14v-9M9 21v-6h6v6M9 3l-1 9m7-9 1 9"/>',
  grinder: '<path d="M3 3h18l-3 10-6 6-6-6zm3 10h12M8 8l3 4 3-4 3 4M8 22h8"/>'
};
function serviceIcon(service) {
  return `<svg class="service-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${servicePaths[service]}</svg>`;
}
function serviceHeading(number, title, description) {
  return `<div class="service-heading"><span>SERVICE / ${number}</span><h3>${title}</h3><p>${description}</p></div>`;
}

function itemPreview(item, badge = '') {
  return `<div class="tip-item-preview"><div class="item-name">${itemIcon(item)}<div><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.slot.toUpperCase())} · LV ${item.level ?? 1} · ${(item.rarity ?? 'common').toUpperCase()}${badge ? ` · ${escapeHTML(badge)}` : ''}</small></div></div>${itemStats(item)}${item.description ? `<p class="item-description">${escapeHTML(item.description)}</p>` : ''}${item.buffs?.length ? `<p class="item-buffs">${escapeHTML(buffSummary(item))}</p>` : ''}${item.passive?.description ? `<p class="item-passive">${escapeHTML(item.passive.description)}</p>` : ''}</div>`;
}

function upgradePreview(item, level) {
  const next = { ...item, stats: { ...item.stats } };
  if (!upgradeItem(next, level)) return '<p class="gear-comparison">Base stats already match your level.</p>';
  const changes = Object.entries(next.stats).filter(([stat, value]) => value !== item.stats[stat]);
  return `<div class="gear-comparison"><strong>LEVEL ${item.level} → ${level}</strong>${changes.map(([stat, value]) => `<span>${escapeHTML(formatStat(stat, item.stats[stat]))} <b>→ ${escapeHTML(value)}</b></span>`).join('')}</div>`;
}

export class TipBoxUI {
  constructor(game) {
    this.game = game;
    this.tab = 'save';
    this.message = '';
    this.feedback = '';
    this.panel = document.querySelector('#tip-box-menu');
    this.panel.querySelectorAll('[data-tip-tab]').forEach((button, index) => {
      button.innerHTML = `${serviceIcon(button.dataset.tipTab)}<span>${button.textContent}</span><small>0${index + 1}</small>`;
      button.id = `tip-tab-${button.dataset.tipTab}`;
      button.setAttribute('aria-controls', 'tip-box-content');
    });
    this.panel.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tip-tab]');
      if (tab) { this.tab = tab.dataset.tipTab; this.message = ''; this.messageOK = true; this.feedback = ''; this.render(); return; }
      const button = event.target.closest('[data-tip-action]');
      if (button) this.handle(button.dataset.tipAction, button.dataset.itemId ?? button.dataset.skill ?? button.dataset.offer);
    });
    this.panel.querySelector('.tip-tabs').addEventListener('keydown', (event) => {
      const tabs = [...this.panel.querySelectorAll('[data-tip-tab]')];
      const current = tabs.indexOf(event.target);
      if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click();
      tabs[next].focus();
    });
  }

  handle(action, value) {
    const { inventory, player } = this.game;
    let result;
    if (action === 'save') {
      const saved = this.game.saveProgress();
      this.message = saved === false ? 'Save failed. Your progress is still in this session; try saving again.' : 'Progress saved: inventory, equipment, rooms, discoveries, doors, and tokens.';
      this.messageOK = saved !== false;
      this.feedback = saved !== false ? 'save' : '';
      this.render();
      if (saved !== false) this.game.story?.onCheckpointSaved?.();
      return;
    }
    if (action === 'upgrade' || action === 'reroll') {
      const item = inventory.items.find((entry) => entry.id === value);
      const previous = buffSummary(item);
      result = improveGear(inventory, value, player.level, action);
      if (result.ok && action === 'reroll') result.message += ` ${previous} → ${buffSummary(item)}.${item.passive ? ' Unique passive kept.' : ''}`;
    }
    if (action === 'skill') result = allocateSkill(inventory, value);
    if (action === 'reset-skills') result = resetSkills(inventory);
    if (action === 'buy') {
      result = buyShopItem(inventory, value, player.level);
      if (result.ok) result.message += ` ${inventory.tokens} token${inventory.tokens === 1 ? '' : 's'} left. Close the Tip Box, then press I to equip it.`;
    }
    if (action === 'grind') {
      const item = inventory.items.find((entry) => entry.id === value);
      if (this.game.story?.isRequiredTutorialItem?.(item)) result = { ok: false, message: 'Keep this item to finish the tutorial.' };
      else result = grindItem(inventory, value);
    }
    if (result) { this.message = result.message; this.messageOK = result.ok; this.feedback = result.ok ? action : ''; }
    applyEquipmentStats(player, inventory);
    this.game.refreshEquipmentStats?.();
    this.game.menu.refreshInventory();
    this.render();
  }

  render() {
    const { inventory, player } = this.game;
    collectLevelTokens(player, inventory);
    document.querySelector('#tip-box-tokens').innerHTML = `<span class="token-symbol" aria-hidden="true">⬡</span><b>${inventory.tokens ?? 0}</b><span>LEVEL<br>TOKENS</span>`;
    document.querySelectorAll('[data-tip-tab]').forEach((button) => { const selected = button.dataset.tipTab === this.tab; button.classList.toggle('is-active', selected); button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
    let content = '';
    if (this.tab === 'save') content = `<div class="checkpoint-card"><div class="checkpoint-visual" aria-hidden="true">${serviceIcon('save')}<span class="checkpoint-orbit"></span></div><div>${serviceHeading('01', this.game.playground ? 'Playground checkpoint' : 'Secure your progress', 'Save here to keep your equipment, discoveries, and progress. Death returns you to your last Tip Box save.')}<p class="checkpoint-location">${escapeHTML(this.game.roomManager?.current?.name ?? 'Tip Box checkpoint')}</p></div></div><div class="checkpoint-summary"><span>RUNNER <b>LEVEL ${player.level}</b></span><span>CARRIED <b>${inventory.items.length} ITEMS</b></span><span>MODE <b>${this.game.hardmode ? 'HARDMODE' : 'NORMAL'}</b></span></div><div class="checkpoint-vitals"><label>HEALTH <b>${Math.ceil(player.health)} / ${player.maxHealth}</b><meter min="0" max="${player.maxHealth}" value="${player.health}"></meter></label><label>STAMINA <b>${Math.ceil(player.stamina)} / ${player.maxStamina}</b><meter min="0" max="${player.maxStamina}" value="${player.stamina}"></meter></label></div><button class="checkpoint-save" data-tip-action="save">${serviceIcon('save')} SAVE ${this.game.playground ? 'PLAYGROUND' : 'PROGRESS'} <span>→</span></button><p class="tip-note">${this.game.playground ? 'This checkpoint belongs to the Playground. Your campaign save stays separate. ' : ''}Leaving for the main menu also discards unsaved progress. Hardmode activation on your return to the hub is the only autosave.</p>`;
    if (this.tab === 'gear') {
      const items = inventory.items.filter((item) => ['epic', 'unique'].includes(item.rarity) && !['key', 'ability'].includes(item.slot));
      content = `${serviceHeading('02', 'Tune your equipment', 'Epic and Unique gear only. Upgrade base stats to your level or reroll a random buff for 1 Level Token. Unique passives stay.')}<div class="service-badges"><span>EPIC + UNIQUE</span><span>1 TOKEN / ACTION</span><span>PASSIVES PRESERVED</span></div>${items.length ? items.map((item) => `<article class="tip-item-card rarity-${item.rarity}">${itemPreview(item, equippedLabel(inventory, item))}${upgradePreview(item, player.level)}<div class="tip-item-actions"><button data-tip-action="upgrade" data-item-id="${escapeHTML(item.id)}" ${item.level >= player.level || !inventory.tokens ? 'disabled' : ''}>UPGRADE · 1 TOKEN</button><button data-tip-action="reroll" data-item-id="${escapeHTML(item.id)}" ${!inventory.tokens ? 'disabled' : ''}>REROLL BUFF · 1 TOKEN</button></div></article>`).join('') : '<p class="empty-inventory service-empty">No Epic or Unique gear carried.<br><span>Rare gear can be upgraded and enchanted in your inventory.</span></p>'}`;
    }
    if (this.tab === 'skills') content = `${serviceHeading('03', 'Build your runner', 'One Level Token per point. Reset returns all skill tokens; gear, rerolls, and shop purchases are permanent.')}<div class="skill-grid">${Object.entries(SKILLS).map(([id, skill]) => `<div class="tip-row skill-card">${itemIcon({ type: { maxHealth: 'heal', maxStamina: 'stamina', cooldownReduction: 'dash', damage: 'sword' }[id] })}<span><strong>${skill.label}</strong><small>${skill.description}</small></span><b class="skill-points">${inventory.skillPoints[id] ?? 0}<small>POINTS${skill.cap ? ` / ${skill.cap}` : ''}</small></b><button data-tip-action="skill" data-skill="${id}" ${!inventory.tokens || (inventory.skillPoints[id] ?? 0) >= (skill.cap ?? Infinity) ? 'disabled' : ''}>+1 · 1 TOKEN</button></div>`).join('')}</div><button class="reset-skills" data-tip-action="reset-skills">↶ RESET SKILL POINTS</button>`;
    if (this.tab === 'shop') content = `${serviceHeading('04', 'Runner supplies', 'Equipment scales to your current level. Review the stats, then purchase and equip it from your inventory.')}<div class="shop-items">${SHOP_ITEMS.map((offer) => {
      const item = offer.slot === 'ability' ? createAbilityItem(offer.type, player.level, { id: `preview-${offer.type}` }) : createGearItem(offer.type, player.level, 'common', { id: `preview-${offer.type}`, buffs: [] });
      const owned = inventory.items.filter((entry) => entry.type === offer.type).length;
      return `<article class="tip-item-card rarity-common">${itemPreview(item)}<div class="tip-item-actions"><span class="owned-count">${owned ? `${owned} carried` : 'Not carried'}</span><button data-tip-action="buy" data-offer="${offer.type}" ${(inventory.tokens ?? 0) < offer.cost ? 'disabled' : ''}>BUY · ${offer.cost} TOKEN${offer.cost === 1 ? '' : 'S'}</button></div></article>`;
    }).join('')}</div>`;
    if (this.tab === 'grinder') {
      const items = inventory.items.filter((item) => item.slot !== 'key' && !['map-view', 'shield'].includes(item.type) && !item.protected && !this.game.story?.isRequiredTutorialItem?.(item));
      content = `${serviceHeading('05', 'Salvage into tokens', 'Feed unwanted items into the grinder. This permanently destroys them and clears any equipped slot. Every 100% yields one token; overflow carries over.')}<div class="grinder-console${this.feedback === 'grind' ? ' is-processing' : ''}"><div class="grinder-machine" aria-hidden="true">${serviceIcon('grinder')}<i></i><i></i><i></i></div><div><div class="grinder-label"><span>NEXT LEVEL TOKEN</span><b>${inventory.grinderProgress ?? 0}<small>%</small></b></div><div class="grinder-meter" role="progressbar" aria-label="Level Token progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${inventory.grinderProgress ?? 0}"><span style="width:${inventory.grinderProgress ?? 0}%"></span></div><div class="salvage-values"><span>COMMON <b>5%</b></span><span>RARE <b>15%</b></span><span>EPIC <b>25%</b></span><span>UNIQUE <b>50%</b></span></div></div></div>${items.length ? items.map((item) => `<article class="tip-item-card rarity-${escapeHTML(item.rarity ?? 'common')}">${itemPreview(item, equippedLabel(inventory, item))}<div class="tip-item-actions"><button class="grind-action" data-tip-action="grind" data-item-id="${escapeHTML(item.id)}">DESTROY · +${{common:5,rare:15,epic:25,unique:50}[item.rarity ?? 'common'] ?? 5}%</button></div></article>`).join('') : '<p class="empty-inventory service-empty">No items available to grind.</p>'}`;
    }
    document.querySelector('#tip-box-content').innerHTML = content;
    document.querySelector('#tip-box-content').setAttribute('aria-labelledby', `tip-tab-${this.tab}`);
    document.querySelector('#tip-box-message').textContent = this.message;
    document.querySelector('#tip-box-message').classList.toggle('is-error', this.messageOK === false);
  }
}
