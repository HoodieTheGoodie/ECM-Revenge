const SAVE_KEY = 'echo-maze-2-save';

export class SaveSystem {
  hasSave() {
    return Boolean(localStorage.getItem(SAVE_KEY));
  }

  save(game) {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      inventoryVersion: 2,
      roomId: game.roomManager.currentId,
      player: game.player.serialize(),
      inventory: game.inventory,
      chestStates: game.chestStates,
      collectedChests: [...game.collectedChests],
      enemyStates: game.enemyStates,
      doorStates: game.doorStates,
      collectedKeys: [...game.collectedKeys],
      map: game.mapSystem.serialize()
    }));
  }

  load() {
    const rawSave = localStorage.getItem(SAVE_KEY);
    return rawSave ? JSON.parse(rawSave) : null;
  }
}