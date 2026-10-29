import { Game } from './core/game.js';

const canvas = document.querySelector('#game');
export const game = new Game(canvas);
game.start();
if (new URLSearchParams(window.location.search).has('playtest')) game.newGame({ editorPlaytest: true });
