const SAVE_KEY = 'echo-maze-2-save';

export class SaveSystem {
  constructor(slot = 'campaign') {
    this.key = slot === 'campaign' ? SAVE_KEY : `${SAVE_KEY}-${slot}`;
  }
  hasSave() {
    return Boolean(this.load());
  }

  save(game) {
    localStorage.setItem(this.key, JSON.stringify({
      inventoryVersion: 3,
      roomId: game.roomManager.currentId,
      player: game.player.serialize(),
      inventory: game.inventory,
      chestStates: game.chestStates,
      collectedChests: [...game.collectedChests],
      enemyStates: game.enemyStates,
      doorStates: game.doorStates,
      collectedKeys: [...game.collectedKeys],
      map: game.mapSystem.serialize(),
      switchStates: game.switchStates ?? {},
      terminalsOffline: game.terminalsOffline ?? {},
      challengeStates: game.challengeStates ?? {},
      bossStates: game.bossStates ?? {},
      story: game.storyState ?? {},
      hardmode: Boolean(game.hardmode),
      hardmodePending: Boolean(game.hardmodePending),
      playground: Boolean(game.playground),
      editorPlaytest: Boolean(game.editorPlaytest),
      weaponState: game.sword?.serialize?.(),
      combatState: game.combat?.serialize?.()
    }));
    return true;
  }

  load() {
    try {
      const rawSave = localStorage.getItem(this.key);
      const save = rawSave ? JSON.parse(rawSave) : null;
      return save && typeof save === 'object' && save.roomId && save.player ? save : null;
    } catch { return null; }
  }
}
