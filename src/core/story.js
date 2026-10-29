import { GAME_MODES } from './game-state.js';
import { createInventory, getActiveWeapon, createSwordItem, createAbilityItem } from './inventory.js';
import { MapSystem } from './map-system.js';
import { Player } from '../entities/player.js';
import { Sword } from '../entities/sword.js';
import { TippyDialogue } from '../ui/dialogue.js';

const VIRUS_WARNING = "How did you come back?! I'm tired of you always messing around... Just a little warning showing you that I basically control this whole game... If you really want to stop me then this will make it a little harder for you.";

export class StorySystem {
  constructor(game) {
    this.game = game;
    this.frozen = false;
    this.panel = document.querySelector('#tippy-panel');
    this.text = document.querySelector('#tippy-text');
    this.virusPanel = document.querySelector('#virus-panel');
    this.dialogue = new TippyDialogue({ settings: game.settings, onActiveChange: (active, blocking) => { this.frozen = active && blocking; } });
    document.querySelector('#virus-next').addEventListener('click', () => {
      this.virusPanel.hidden = true;
      const after = this.afterVirus;
      this.afterVirus = null;
      this.game.setMode(GAME_MODES.PLAYING);
      after?.();
    });
  }

  say(message, freeze = false, onComplete) {
    this.dialogue.show(message, { blocking: freeze, onComplete });
  }

  hide() { this.dialogue.hide(); this.frozen = false; this.touring = false; }

  get tutorialActive() { return Boolean(this.game.storyState.tutorialActive && !this.game.hardmode); }

  tipBoxAvailable(room = this.game.roomManager.current) {
    if (room.type !== 'hub') return false;
    if (this.game.hardmodePending && !this.hasStarterEquipment()) return false;
    return !this.tutorialActive || Boolean(this.game.storyState.tipBoxSpawned);
  }

  requiresCheckpoint() { return this.tutorialActive && this.game.storyState.tipBoxSpawned && !this.game.storyState.tutorialSaved; }

  canLeaveTipBox() { return !this.requiresCheckpoint() && !this.touring; }

  allowsDoor(door) {
    const game = this.game, state = game.storyState;
    if (door.afterTutorial && this.tutorialActive && !state.tutorialSaved) return false;
    if (!door.targetRoom || !this.tutorialActive || state.tutorialSaved) return true;
    const room = game.roomManager.current;
    const target = game.roomManager.rooms[door.targetRoom];
    if (room.type === 'hub') {
      if (state.starterCollected) return false;
      return target?.tutorialStage === 'equipment' && Boolean(state.sprintStarted);
    }
    if (room.tutorialStage === 'equipment' && state.starterCollected) return target?.type === 'hub' && this.hasStarterEquipment();
    return true;
  }

  hasStarterEquipment() {
    const { inventory } = this.game;
    const hasAbility = (type) => inventory.equipment.abilities.some((id) => inventory.items.some((item) => item.id === id && item.type === type));
    return getActiveWeapon(inventory)?.type === 'sword' && hasAbility('map-view') && (!this.tutorialActive || hasAbility('dash'));
  }

  isRequiredTutorialItem(item) {
    return item && (this.game.hardmodePending || this.tutorialActive && !this.game.storyState.tutorialSaved || !this.game.storyState.reachedHub) && ['sword', 'map-view', 'dash'].includes(item.type);
  }

  enterRoom() {
    const game = this.game;
    const room = game.roomManager.current;
    const state = game.storyState;
    this.hide();
    this.virusPanel.hidden = true;
    if (room.tutorialStage === 'movement' && !state.movementIntro) {
      state.movementIntro = true;
      this.say('I’m Tippy. I found a way in! Use WASD or the arrow keys to follow this hallway into the hub. Hold Shift to sprint. Press Continue to reveal my message, then Continue again when you’re ready to move.', true);
    } else if (room.tutorialStage === 'equipment') {
      this.say(game.hardmodePending ? 'Recover your Sword and Map View. Press E to open the chest, wait for it to open, then E again to collect. Equip both in I and return to the hub.' : 'You made it! Press E beside the chest, wait for it to open, then E again to collect your Sword, Map View and Dash. The Chasers cannot follow you into this cache.');
    } else if (room.type === 'hub') {
      state.reachedHub = true;
      if (!state.sprintStarted && !state.starterCollected && room.tutorialAmbush !== false && !state.hubApproach) {
        const trigger = room.tutorialTrigger ?? room.tipBox ?? { x: room.width / 2, y: room.height / 2 };
        const dx = trigger.x - game.player.position.x, dy = trigger.y - game.player.position.y;
        const length = Math.hypot(dx, dy);
        state.hubApproach = { roomId: room.id, ...(trigger.direction ?? { x: length > 20 ? dx / length : 1, y: length > 20 ? dy / length : 0 }) };
      }
      if (game.hardmodePending && !this.hasStarterEquipment()) {
        this.say('The hub signal is still unstable. Go to the Starter Cache on the right, recover and equip your Sword and Map View, then return here to finish the Hardmode checkpoint.');
      } else if (game.hardmodePending) {
        game.hardmodePending = false;
        state.hardmodeCommitted = true;
        const saved = game.saveProgress();
        if (!saved) { game.hardmodePending = true; state.hardmodeCommitted = false; }
        this.say(`Wait what happened? I feel like we've done this before..? ${saved ? 'Hardmode is now saved permanently. Terminal 1 opened the way to Section 2.' : 'The Hardmode save failed. Use the Tip Box to save before leaving.'}`);
      } else if (this.tutorialActive && state.starterCollected && !state.tutorialSaved) {
        state.tipBoxSpawned = true;
        this.say('You’re back. I’ve built a Tip Box in the hub. We must save your new equipment before going farther. Continue to open the checkpoint, then press SAVE PROGRESS.', true, () => {
          if (game.roomManager.currentId !== room.id) return;
          if (game.menu.tipBoxUI) game.menu.tipBoxUI.tab = 'save';
          game.openTipBox();
        });
      } else if (this.tutorialActive && !state.starterCollected) this.say('This hub is empty for now. Move past its center. The starter cache is through the door on the right.');
      else if (this.tutorialActive && state.tutorialSaved && !state.tutorialTourComplete) this.say('Your checkpoint is safe. Let’s finish the Tip Box tour before you head out.', true, () => this.onCheckpointSaved());
      else this.say('The glowing Tip Box is our checkpoint. Stand beside it and press E to save, upgrade gear, spend skill points, shop, or grind items. Unsaved progress is lost when you die or leave.');
    } else if (room.boss) {
      this.say(game.inventory.items.some((item) => item.type === 'shield') ? 'The Flying Pig’s four towers heal it. Equip your Shield and tap B to reflect shots toward your mouse. Perfect timing resets its cooldown. Break the towers first; then its second phase begins.' : 'Your sword cannot break those healing towers. We need a Reflector Shield. Explore the Outer Relay south of the hub; its sealed vault holds one. You can leave this fight and come back.');
    }
  }

  update(deltaTime) {
    const game = this.game;
    const room = game.roomManager.current;
    const state = game.storyState;
    if (this.frozen || game.hardmode || room.type !== 'hub' || room.tutorialAmbush === false || state.starterCollected || state.hubApproach?.roomId !== room.id) return;
    const tip = room.tutorialTrigger ?? room.tipBox ?? { x: room.width / 2, y: room.height / 2 };
    const direction = state.hubApproach;
    const dx = game.player.position.x - tip.x, dy = game.player.position.y - tip.y;
    if (Math.hypot(dx, dy) < 150) state.passedNearTipBox = true;
    const passedBox = state.passedNearTipBox && dx * direction.x + dy * direction.y > 85;
    if (!state.sprintStarted && passedBox) {
      state.sprintStarted = true;
      state.sprintTimer = 0;
      const ambush = [-55, 0, 55].map((offset, index) => {
        const x = game.player.position.x - direction.x * 180 - direction.y * offset;
        const y = game.player.position.y - direction.y * 180 + direction.x * offset;
        const enemy = game.spawnChaser({ type: 'chaser', id: `${room.id}-tutorial-ambush-${index}`, x, y, exactSpawn: true, level: 1, weaponType: null, armorType: null, facing: Math.atan2(direction.y, direction.x) }, room, index);
        enemy.alertFromHit();
        return enemy;
      });
      game.enemies.push(...ambush);
      this.say('Three Chasers are behind you! I’ve paused their signal so you can get ready. Hold Shift to sprint toward the door on the right: the Starter Cache. You don’t have a weapon yet. They will chase as soon as you continue.', true);
    }
    if (state.sprintStarted && !state.sprintPassed) {
      state.sprintTimer = (state.sprintTimer ?? 0) + deltaTime;
      if (game.player.isSprinting) state.sprintPassed = true;
    }
  }

  starterCollected() {
    if (!this.tutorialActive) return false;
    this.say('Sword, Map View and Dash recovered! Open I: equip the sword in a red slot and both abilities in blue slots. M opens your map; the key on Dash’s blue slot activates it. G parries with any weapon. Return through the hub door next — I need to create our checkpoint before we explore.', true);
    return true;
  }

  onCheckpointSaved() {
    const game = this.game, state = game.storyState;
    if (!this.tutorialActive || !state.tutorialSaved || state.tutorialTourComplete || this.touring) return;
    this.touring = true;
    const tab = (id, text) => ({ text, label: `TIP BOX / ${id.toUpperCase()}`, onShow: () => {
      if (game.mode !== 'tip-box') game.openTipBox();
      if (game.menu.tipBoxUI) { game.menu.tipBoxUI.tab = id; game.menu.tipBoxUI.render(); }
    } });
    this.say([
      tab('save', 'Checkpoint secured. Save keeps your equipment, discoveries and opened doors. Death or leaving returns you to the last save. Come back to this tab whenever you want to keep progress.'),
      tab('gear', 'Gear upgrades Epic and Unique items to your current level or rerolls their random buff. Each action costs one Level Token. Rare gear is improved from your inventory; Unique passives stay intact.'),
      tab('skills', 'Skills spends Level Tokens on health, stamina, damage or cooldown reduction. You gain a token each level. Reset refunds skill points so you can experiment.'),
      tab('shop', 'Shop sells equipment and abilities. Clear Sight removes the fog for five seconds. Buy it with one token, equip it in a blue slot, then use that slot’s key. The Reflector Shield must be earned in the Outer Relay.'),
      tab('grinder', 'Grinder destroys spare gear to build token progress. Common, Rare, Epic and Unique gear contribute 5%, 15%, 25% and 50%. Your map, shield and protected quest items stay safe.'),
      { label: 'TIPPY / THE VIRUS', text: 'Now that your signal is safe, you need to know what happened. The Virus took over this environment. I hacked it into a game so you could fight back. Its numbered terminals hold the maze together. Take them offline to break its control. I can guide you, but the Virus is watching.' }
    ], true, () => {
      this.touring = false;
      state.tutorialTourComplete = true;
      state.loreHeard = true;
      // Finish the same requested checkpoint with its onboarding state included.
      try { game.saveSystem.save(game); } catch { /* The successful checkpoint remains valid; its tour repeats on reload. */ }
      game.setMode(GAME_MODES.PLAYING);
      this.say('Section 1 is through the left door. Use I → Ask Tippy whenever you need controls. Watch enemy vision and attack windups, then commit to your parry or dash.');
    });
  }

  terminalOffline(number) {
    const game = this.game;
    if (Number(number) === 1 && game.storyState.pigDefeated && !game.hardmode) this.startResetCutscene();
    else this.showVirus(`Terminal ${number} is offline. Every door linked to it has opened. ${Number(number) === 1 && !game.storyState.pigDefeated ? 'But my Flying Pig is still in your way.' : 'You think switching off one terminal will stop me?'}`);
  }

  bossDefeated() {
    if (this.game.terminalsOffline[1] && !this.game.hardmode) this.startResetCutscene();
    else this.say('The towers are gone and the Flying Pig is down. Find Terminal 1 and press E to take it offline.');
  }

  showVirus(message, after) {
    this.hide();
    document.querySelector('#virus-text').textContent = message;
    this.virusPanel.hidden = false;
    this.afterVirus = after;
    this.game.setMode(GAME_MODES.CUTSCENE);
  }

  startResetCutscene() { this.showVirus(VIRUS_WARNING, () => this.resetForHardmode()); }

  resetForHardmode() {
    const game = this.game;
    const tutorial = Object.values(game.roomManager.rooms).find((room) => room?.tutorialStage === 'movement');
    const recoveryItems = [game.inventory.items.find((item) => item.type === 'sword') ?? createSwordItem(), game.inventory.items.find((item) => item.type === 'map-view') ?? createAbilityItem('map-view')].map((item) => ({ ...structuredClone(item), equipped: false }));
    game.hardmode = true;
    game.hardmodePending = true;
    game.inventory = createInventory();
    game.player = new Player(240, 140);
    game.sword = new Sword();
    game.combat.specialCooldowns = {};
    game.mapSystem = new MapSystem();
    game.chestStates = {};
    game.collectedChests = new Set();
    game.collectedKeys = new Set();
    game.doorStates = {};
    game.switchStates = {};
    game.challengeStates = {};
    game.enemyStates = {};
    game.storyState = { pigDefeated: true, recoveryItems };
    game.terminalsOffline = { 1: true };
    game.roomManager.currentId = tutorial?.id ?? game.roomManager.startId;
    game.roomManager.loading = false;
    game.roomManager.pendingRoom = null;
    game.roomManager.previousRoomId = null;
    if (game.roomManager.current.spawn) game.player.position = { ...game.roomManager.current.spawn };
    game.loadCurrentRoom();
    game.hasStarted = true;
    game.beginInitialLoad();
  }
}
