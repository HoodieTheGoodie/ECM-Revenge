import test from 'node:test';
import assert from 'node:assert/strict';
import { Sword } from '../src/entities/sword.js';
import { Chaser } from '../src/entities/chaser.js';
import { FlyingPig } from '../src/entities/flying-pig.js';
import { CombatSystem } from '../src/core/combat.js';
import { ParticleSystem } from '../src/rendering/particles.js';
import { Renderer } from '../src/rendering/renderer.js';
import { Player } from '../src/entities/player.js';
import { findPath, hasClearPath } from '../src/world/pathfinding.js';
import { positionHitsWall } from '../src/world/collision.js';

function fixture(type = 'sword') {
  const world = { id: 'arena', width: 1400, height: 1000, walls: [], openings: [] };
  const held = new Set();
  const pressed = new Set();
  const hits = [];
  const game = {
    player: new Player(100, 100),
    sword: new Sword(),
    inventory: { items: [{ id: 'weapon', type, slot: 'weapon', stats: { damage: 10 } }], equipment: { weapons: ['weapon', null, null], activeWeapon: 0, shield: null } },
    input: { isDown: (key) => held.has(key), wasPressed: (key) => pressed.has(key), axis: () => ({ x: 0, y: 0 }), mouseWorld: () => ({ x: 900, y: 100 }) },
    camera: {}, enemies: [], currentWorld: () => world, roomManager: { current: world },
    damageEnemy(enemy, amount, sneak) { hits.push({ id: enemy.id, amount, sneak }); enemy.takeDamage(amount, sneak); }
  };
  const combat = new CombatSystem(game);
  combat.update(0);
  return { game, combat, world, held, pressed, hits };
}

function enemy(id, x, y, extra = {}) {
  return new Chaser({ id, x, y, weaponType: null, armorType: null, ...extra });
}

test('particle effects stay bounded and expire without leaving room data', () => {
  const particles = new ParticleSystem(8);
  particles.burst(10, 20, '#fff', 100);
  assert.equal(particles.particles.length, 8);
  particles.update(1);
  assert.equal(particles.particles.length, 0);
});

test('laser gun has ten rounds, rejects an empty shot, and recharges in four seconds', () => {
  const { game, combat } = fixture('laser-gun');
  for (let index = 0; index < 10; index += 1) {
    assert.equal(combat.attack(), true);
    game.sword.update(0.38, 0);
  }
  assert.equal(game.sword.ammo, 0);
  assert.equal(combat.attack(), false);
  game.sword.update(0.19, 0);
  assert.equal(game.sword.ammo, 0);
  game.sword.update(0.02, 0);
  assert.equal(game.sword.ammo, 1);
});

test('melee retains sneak hits and does not hit enemies behind a solid wall', () => {
  const { game, combat, world, hits } = fixture();
  game.enemies = [enemy('near', 145, 100), enemy('behind-wall', 185, 100), enemy('behind-player', 65, 100)];
  world.walls.push({ x: 160, y: 80, width: 10, height: 40 });
  assert.equal(combat.attack(), true);
  assert.deepEqual(hits.map((hit) => hit.id), ['near']);
  assert.equal(hits[0].sneak, true);
});

test('dagger special damages enemies along its path once and gives invulnerability', () => {
  const { game, combat, hits } = fixture('daggers');
  game.enemies = [enemy('crossed', 170, 100)];
  assert.equal(combat.special(), true);
  assert.ok(game.player.invulnerability >= 0.23);
  game.player.position.x = 260;
  combat.update(0.05);
  combat.update(0.05);
  assert.equal(hits.length, 1);
  assert.equal(combat.special(), false);
});

test('explosive gun shot damages multiple targets and consumes a round', () => {
  const { game, combat, hits } = fixture('gun');
  game.enemies = [enemy('first', 170, 100), enemy('second', 180, 150)];
  assert.equal(combat.special(), true);
  assert.equal(game.sword.ammo, 9);
  combat.update(0.15);
  assert.deepEqual(hits.map((hit) => hit.id).sort(), ['first', 'second']);
});

test('thrown scythe stays spinning and repeatedly damages targets', () => {
  const { game, combat, hits } = fixture('scythe');
  game.enemies = [enemy('target', 270, 100, { level: 10 })];
  combat.special();
  for (let index = 0; index < 16; index += 1) combat.update(0.05);
  assert.ok(hits.length >= 2);
  assert.equal(combat.projectiles[0].vx, 0);
});

test('tanker chasers visibly expose their armor and take reduced damage', () => {
  const plain = enemy('plain', 0, 0);
  const armored = enemy('tank', 0, 0, { armorType: 'tanker-armor', weaponType: 'spear' });
  plain.takeDamage(20);
  armored.takeDamage(20);
  assert.ok(armored.health > plain.health);
  assert.equal(armored.weaponType, 'spear');
  assert.ok(armored.chaseSpeed < plain.chaseSpeed);
});

test('gun chasers fire projectiles while unarmed chasers retain melee behavior', () => {
  const { game, world } = fixture();
  const gunner = enemy('gunner', 250, 100, { weaponType: 'gun', facing: Math.PI });
  gunner.update(0.26, game.player, world);
  assert.equal(gunner.state, 'aiming');
  assert.equal(gunner.pendingProjectiles.length, 0);
  gunner.update(0.55, game.player, world);
  assert.equal(gunner.pendingProjectiles.length, 1);
  const plain = enemy('plain', 145, 100, { facing: Math.PI });
  plain.update(0.1, game.player, world);
  assert.equal(plain.state, 'attacking');
  assert.equal(plain.pendingProjectiles.length, 0);
});

test('boss is protected until all four healing towers are destroyed', () => {
  const boss = new FlyingPig({ x: 500, y: 500 }, { width: 1000, height: 1000 });
  assert.equal(boss.towers.length, 4);
  assert.equal(boss.hitReflected(100), false);
  assert.equal(boss.health, boss.maxHealth);
  boss.towers.forEach((tower) => boss.hitTower(tower, 100));
  assert.equal(boss.hitReflected(100), true);
  assert.equal(boss.health, boss.maxHealth - 100);
});

test('pressing an equipped shield reflects a projectile toward the aim', () => {
  const { game, combat, pressed } = fixture();
  game.inventory.equipment.shield = 'shield';
  pressed.add('b');
  const projectile = { x: 125, y: 100, vx: -100, vy: 0, radius: 9, life: 2, owner: 'enemy', kind: 'pig', damage: 16 };
  combat.projectiles.push(projectile);
  combat.update(0.01);
  assert.equal(projectile.owner, 'reflected');
  assert.ok(projectile.vx > 0);
  assert.equal(game.player.health, 100);
});

test('reflected shots hit towers, then defeat the pig and report completion once', () => {
  const { game, combat, world } = fixture();
  world.boss = { type: 'flying-pig', x: 600, y: 500 };
  combat.onRoomEnter();
  let defeats = 0;
  game.onBossDefeated = () => { defeats += 1; };
  const reflect = (x, y) => combat.hitEnemies({ x, y, owner: 'reflected', kind: 'pig', damage: 500, radius: 9, life: 1 });
  combat.boss.towers.forEach((tower) => reflect(tower.x, tower.y));
  reflect(combat.boss.position.x, combat.boss.position.y);
  combat.update(0);
  combat.update(0);
  assert.equal(defeats, 1);
  game.bossStates = { arena: true };
  combat.onRoomEnter();
  assert.equal(combat.boss, null);
  assert.equal(combat.projectiles.length, 0);
});

test('sword spin hits behind the player and spear throw reaches beyond melee range', () => {
  const spinning = fixture();
  spinning.game.enemies = [enemy('behind', 40, 100), enemy('front', 170, 100)];
  assert.equal(spinning.combat.special(), true);
  assert.deepEqual(spinning.hits.map((hit) => hit.id), ['behind', 'front']);
  const throwing = fixture('spear');
  throwing.game.enemies = [enemy('distant', 380, 100)];
  throwing.combat.special();
  throwing.combat.update(0.45);
  assert.equal(throwing.hits[0].id, 'distant');
});

test('spear chasers cannot damage players through a closed barrier', () => {
  const { game, world } = fixture();
  const spearman = enemy('spear', 190, 100, { weaponType: 'spear', facing: Math.PI });
  spearman.alertTimer = 3;
  world.walls.push({ x: 140, y: 40, width: 20, height: 120 });
  spearman.update(0.1, game.player, world);
  spearman.update(0.2, game.player, world);
  assert.equal(game.player.health, 100);
});

test('gun chasers share the ten-round limit and slow recharge', () => {
  const { game, world } = fixture();
  const gunner = enemy('gunner', 1000, 800, { weaponType: 'gun' });
  for (let index = 0; index < 10; index += 1) assert.equal(gunner.fire(0, 'laser'), true);
  assert.equal(gunner.fire(0, 'explosive'), false);
  gunner.update(3.99, game.player, world);
  assert.equal(gunner.ammo, 0);
  gunner.update(0.01, game.player, world);
  assert.equal(gunner.ammo, 1);
});

test('boss summons are not constrained by the old four-enemy room limit', () => {
  const { game, combat, world } = fixture();
  world.boss = { type: 'flying-pig', x: 650, y: 500, towers: [{ x: 400, y: 300 }] };
  combat.onRoomEnter();
  assert.equal(combat.boss.towers.length, 4);
  combat.boss.pendingSummons = 2;
  game.enemies = [enemy('one', 300, 300), enemy('two', 300, 400), enemy('three', 300, 500)];
  combat.spawnBossChasers();
  assert.equal(game.enemies.filter((entry) => entry.health > 0).length, 5);
  combat.boss.pendingSummons = 2;
  combat.spawnBossChasers();
  assert.equal(game.enemies.length, 7);
});

test('shield expires while B is held and cannot be toggled through cooldown', () => {
  const { game, combat, pressed, held } = fixture();
  game.inventory.equipment.shield = 'shield';
  held.add('b');
  combat.update(0);
  assert.equal(combat.shieldActive, false, 'holding alone is not a new activation');
  pressed.add('b');
  combat.update(0);
  pressed.clear();
  assert.equal(combat.shieldActive, true);
  assert.equal(combat.activateShield(), false);
  combat.update(0.61);
  assert.equal(combat.shieldActive, false);
  assert.equal(combat.activateShield(), false);
  combat.update(1);
  assert.equal(combat.shieldActive, false, 'holding never automatically reactivates');
  assert.equal(combat.activateShield(), true);
});

test('perfect shield timing refunds cooldown while late reflections do not', () => {
  for (const [delay, perfect] of [[0.12, true], [0.22, false]]) {
    const { game, combat } = fixture();
    game.inventory.equipment.shield = 'shield';
    combat.activateShield();
    combat.update(delay);
    const projectile = { x: 125, y: 100, radius: 9, damage: 16, owner: 'enemy' };
    combat.hitPlayer(projectile);
    assert.equal(projectile.owner, 'reflected');
    assert.equal(projectile.perfect, perfect);
    assert.equal(combat.shieldCooldown === 0, perfect);
    combat.update(0.61 - delay);
    assert.equal(combat.activateShield(), perfect);
  }
});

test('melee bypasses the bubble with extra damage and movement hindrance', () => {
  const { game, combat, world } = fixture();
  game.inventory.equipment.shield = 'shield';
  combat.activateShield();
  const attacker = enemy('inside', 140, 100, { facing: Math.PI, weaponType: 'sword' });
  attacker.update(0.01, game.player, world);
  attacker.update(0.33, game.player, world);
  assert.equal(game.player.health, 86.5);
  assert.equal(game.player.hinderedTimer, 0.8);
  game.input.axis = () => ({ x: 1, y: 0 });
  game.player.update(0.2, game.input, world);
  assert.equal(game.player.velocity.x, 154);
  assert.ok(game.player.hinderedTimer > 0);
  game.player.update(0.7, game.input, world);
  assert.equal(game.player.hinderedTimer, 0);
});

test('front sword parry cancels a committed strike, staggers, and empowers one riposte', () => {
  const { game, combat, world, hits } = fixture();
  const attacker = enemy('swordsman', 145, 100, { facing: Math.PI, weaponType: 'sword' });
  game.enemies = [attacker];
  attacker.update(0.01, game.player, world);
  attacker.update(0.24, game.player, world);
  assert.equal(combat.parry(), true);
  assert.equal(game.player.stamina, 82);
  combat.update(0.08);
  attacker.update(0.08, game.player, world);
  assert.equal(game.player.health, 100);
  assert.equal(game.player.stamina, 91);
  assert.equal(attacker.state, 'parried');
  assert.equal(attacker.stunTimer, 0.9);
  assert.equal(combat.attack(), true);
  assert.equal(hits[0].amount, 17.5);
  assert.equal(combat.riposteTimer, 0);
  game.sword.update(0.5, 0);
  combat.attack();
  assert.equal(hits[1].amount, 10);
});

test('parry rejects rear hits and spam, and a missed window exposes the player', () => {
  const rear = fixture();
  rear.combat.parry();
  rear.game.player.takeDamage(10, { kind: 'melee', attacker: enemy('rear', 60, 100) });
  assert.equal(rear.game.player.health, 90);
  assert.equal(rear.combat.riposteTimer, 0);
  const late = fixture();
  late.combat.parry();
  assert.equal(late.combat.parry(), false);
  late.combat.update(0.19);
  late.game.player.takeDamage(10, { kind: 'melee', attacker: enemy('front', 140, 100) });
  assert.equal(late.game.player.health, 88);
  assert.ok(late.combat.parryRecovery > 0);
  assert.equal(late.combat.attack(), false);
  assert.equal(late.combat.special(), false);
  assert.equal(late.combat.parry(), false);
  late.combat.update(0.47);
  assert.equal(late.combat.parry(), true);
  assert.equal(late.game.player.stamina, 64);
  const spear = fixture('spear');
  assert.equal(spear.combat.parry(), true);
  const tired = fixture();
  tired.game.player.stamina = 17;
  assert.equal(tired.combat.parry(), false);
});

test('enemy tells match committed spear aim and ordinary hits cannot cancel an attack', () => {
  const { game, world } = fixture();
  const attacker = enemy('spear', 190, 100, { facing: Math.PI, weaponType: 'spear' });
  attacker.update(0.01, game.player, world);
  attacker.takeDamage(1);
  attacker.alertFromHit();
  assert.equal(attacker.state, 'attacking');
  attacker.update(0.4, game.player, world);
  assert.equal(game.player.health, 100);
  game.player.position = { x: 190, y: 180 };
  attacker.update(0.09, game.player, world);
  assert.equal(game.player.health, 100, 'stepping outside the telegraphed thrust avoids it');
});

test('boss enters phase two after the last tower and alternates telegraphed spread volleys', () => {
  const { game } = fixture();
  const boss = new FlyingPig({ x: 600, y: 500 }, { width: 1400, height: 1000 });
  boss.towers.slice(0, 3).forEach((tower) => boss.hitTower(tower, 100));
  assert.equal(boss.stage, 1);
  boss.hitTower(boss.towers[3], 100);
  assert.equal(boss.stage, 2);
  assert.equal(boss.phase, 'enraged');
  assert.equal(boss.pendingSummons, 2);
  boss.update(0.7, game.player);
  assert.equal(boss.pendingProjectiles.length, 0);
  assert.equal(boss.aimLocked, true);
  const lockedAngle = boss.targetAngle;
  game.player.position.y = 800;
  boss.update(0.5, game.player);
  assert.equal(boss.pendingProjectiles.length, 3);
  assert.ok(Math.abs(Math.atan2(boss.pendingProjectiles[1].vy, boss.pendingProjectiles[1].vx) - lockedAngle) < 0.000001);
  boss.update(1.35, game.player);
  assert.equal(boss.pendingProjectiles.length, 8);
  assert.equal(boss.hitReflected(100), true);
});

test('defense cooldown saves resume without carrying an active guard', () => {
  const { game, combat } = fixture();
  game.inventory.equipment.shield = 'shield';
  combat.activateShield();
  combat.update(0.2);
  const restored = new CombatSystem(game);
  restored.restore(combat.serialize());
  assert.ok(Math.abs(restored.shieldCooldown - 1.4) < 0.000001);
  assert.equal(restored.shieldActive, false);
  assert.equal(restored.activateShield(), false);
  restored.update(restored.shieldCooldown);
  assert.equal(restored.activateShield(), true);
});

test('wall auto-tiling removes adjoining seams and updates after a barrier opens', () => {
  const renderer = Object.create(Renderer.prototype);
  renderer.world = { walls: [{ x: 0, y: 0, width: 40, height: 40 }, { x: 40, y: 0, width: 40, height: 40 }] };
  const joined = renderer.wallOutline();
  assert.equal(joined.some(([x1, , x2]) => x1 === 40 && x2 === 40), false);
  renderer.world.walls = renderer.world.walls.map((wall) => ({ ...wall }));
  assert.equal(renderer.wallOutline(), joined);
  renderer.world.walls.pop();
  assert.ok(renderer.wallOutline().some(([x1, , x2]) => x1 === 40 && x2 === 40));
});

test('wall outlines retain exposed portions of partially adjoining tiles', () => {
  const renderer = Object.create(Renderer.prototype);
  renderer.world = { walls: [{ x: 0, y: 0, width: 40, height: 80 }, { x: 40, y: 20, width: 40, height: 40 }] };
  const rightEdges = renderer.wallOutline().filter(([x1, , x2]) => x1 === 40 && x2 === 40);
  assert.deepEqual(rightEdges, [[40, 0, 40, 20], [40, 60, 40, 80]]);
});

test('E hints find extra chests, loose loot, and terminals independently of the primary chest', () => {
  const renderer = Object.create(Renderer.prototype);
  const player = { position: { x: 100, y: 100 } };
  const labels = [];
  const context = { save() {}, restore() {}, translate() {}, fillText(text) { labels.push(text); } };
  const distantChest = { position: { x: 900, y: 900 }, state: 'closed' };
  const draw = (effects) => renderer.drawInteractionHint(context, player, distantChest, null, [], [], effects);
  draw({ chests: [{ position: { x: 145, y: 100 }, state: 'closed' }] });
  draw({ loot: [{ x: 145, y: 100 }] });
  draw({ interactables: [{ type: 'terminal', number: 2, x: 145, y: 100 }] });
  draw({ loot: [{ x: 165, y: 100 }] });
  assert.deepEqual(labels, ['E  OPEN CHEST', 'E  PICK UP', 'E  TAKE TERMINAL 2 OFFLINE']);
});

test('weapon animation completes without delaying cooldowns or resetting aim', () => {
  for (const type of ['sword', 'spear', 'daggers', 'gun', 'scythe']) {
    const { game, combat } = fixture(type);
    game.sword.aimAngle = 0.7;
    assert.equal(combat.attack(), true);
    const duration = game.sword.attackDuration;
    const remaining = game.sword.cooldown;
    const poses = [game.sword.pose];
    for (let index = 0; index < 5; index += 1) {
      game.sword.update(duration / 4, 1.3);
      poses.push(game.sword.pose);
    }
    assert.ok(poses.every((pose) => [pose.angle, pose.extension, pose.recoil, pose.flash].every(Number.isFinite)), type);
    assert.equal(game.sword.pose.phase, 'idle', type);
    assert.equal(game.sword.pose.angle, 1.3, type);
    assert.ok(Math.abs(game.sword.cooldown - Math.max(0, remaining - duration * 1.25)) < 0.000001, type);
    if (type === 'spear') assert.ok(poses.some((pose) => pose.extension > 30));
    if (type === 'gun') assert.ok(poses.some((pose) => pose.recoil > 3));
  }
});

test('dagger attacks alternate hands and sword spin settles back to aim', () => {
  const dagger = fixture('daggers');
  dagger.combat.attack();
  const firstHand = dagger.game.sword.pose.hand;
  dagger.game.sword.update(1, 0);
  dagger.combat.attack();
  assert.equal(dagger.game.sword.pose.hand, -firstHand);
  const sword = fixture();
  sword.combat.special();
  assert.equal(sword.game.sword.pose.phase, 'windup');
  sword.game.sword.update(0.2, 0);
  assert.equal(sword.game.sword.pose.phase, 'strike');
  const midpoint = sword.game.sword.pose.angle;
  sword.game.sword.update(0.15, 0);
  assert.equal(sword.game.sword.pose.phase, 'recovery');
  assert.ok(sword.game.sword.pose.angle > midpoint);
  sword.game.sword.update(0.11, 0.8);
  assert.equal(sword.game.sword.pose.phase, 'idle');
  assert.equal(sword.game.sword.pose.angle, 0.8);
});

test('saved gun charge resumes instead of refilling and old saves keep safe defaults', () => {
  const { game, combat } = fixture('gun');
  combat.attack();
  game.sword.update(2.5, 0);
  const restored = new Sword();
  restored.configure({ type: 'gun' });
  restored.restore(JSON.parse(JSON.stringify(game.sword.serialize())));
  assert.equal(restored.ammo, 9);
  assert.equal(restored.rechargeTimer, 2.5);
  restored.update(1.5, 0);
  assert.equal(restored.ammo, 10);
  restored.restore();
  assert.equal(restored.ammo, 10);
  restored.restore({ ammo: -5, rechargeTimer: -100 });
  assert.equal(restored.ammo, 0);
  assert.equal(restored.rechargeTimer, 0);
});

test('special cooldown save data resumes and HUD reports current gun charge', () => {
  const { game, combat } = fixture('gun');
  game.player.cooldownReduction = 0.25;
  combat.special();
  combat.update(1);
  assert.equal(combat.effects.specialCooldownMax, 3.75);
  assert.equal(combat.effects.specialCooldown, 2.75);
  assert.equal(combat.effects.weaponType, 'gun');
  assert.equal(combat.effects.ammo, 9);
  assert.equal(combat.effects.rechargeProgress, 0.25);
  const restored = new CombatSystem(game);
  restored.restore(JSON.parse(JSON.stringify(combat.serialize())));
  assert.equal(restored.special(), false);
  restored.update(2.75);
  assert.equal(restored.special(), true);
  restored.restore();
  assert.deepEqual(restored.specialCooldowns, {});
});

test('impact rings share the particle cap and expire with sparks', () => {
  const particles = new ParticleSystem(4);
  particles.ring(10, 20, '#fff', 100, 0.2);
  particles.burst(10, 20, '#fff', 10, { shape: 'spark', life: 0.2 });
  particles.ring(10, 20, '#fff');
  assert.equal(particles.particles.length, 4);
  assert.equal(particles.particles[0].shape, 'ring');
  particles.update(0.3);
  assert.equal(particles.particles.length, 0);
});

test('reduced motion hides particles while keeping attack poses and projectile rendering', () => {
  const renderer = Object.create(Renderer.prototype);
  renderer.effects = { reducedMotion: true };
  renderer.drawParticles({}, [{ life: 1, maxLife: 1, x: 0, y: 0, size: 5 }]);
  const operations = [];
  const context = new Proxy({}, { get: (_, key) => (...args) => operations.push([key, ...args]), set: () => true });
  renderer.drawProjectiles(context, [{ kind: 'scythe', x: 100, y: 100, vx: 0, vy: 0, radius: 24, age: 0.5 }]);
  assert.ok(operations.some(([operation, angle]) => operation === 'rotate' && angle === 9));
  const { game, combat } = fixture('spear');
  combat.attack();
  game.sword.update(0.15, 0);
  renderer.drawSword(context, game.player, game.sword);
  assert.ok(operations.some(([operation, x]) => operation === 'translate' && x > 30 && x < 60));
});

test('every equipped weapon can parry a committed melee attack and riposte', () => {
  for (const type of ['sword', 'spear', 'daggers', 'gun', 'scythe']) {
    const { game, combat } = fixture(type);
    const attacker = enemy('front', 140, 100, { weaponType: 'sword' });
    assert.equal(combat.parry(), true, type);
    assert.equal(game.player.takeDamage(10, { kind: 'melee', attacker }), false, type);
    assert.equal(game.player.health, 100, type);
    assert.equal(attacker.state, 'parried', type);
    assert.equal(combat.effects.riposteTimer, 0.8, type);
    assert.equal(combat.attack(), true, type);
    assert.equal(combat.riposteTimer, 0, type);
  }
});

test('parrying a projectile deflects it but cannot substitute for the boss shield unlock', () => {
  const { game, combat, world } = fixture('daggers');
  world.boss = { type: 'flying-pig', x: 600, y: 500 };
  combat.onRoomEnter();
  combat.parry();
  const projectile = { x: 110, y: 100, vx: -420, vy: 0, radius: 5, life: 2, owner: 'enemy', kind: 'pig', damage: 20 };
  combat.hitPlayer(projectile);
  assert.equal(projectile.owner, 'reflected');
  assert.equal(projectile.shieldReflected, false);
  assert.equal(projectile.life, 4);
  assert.equal(game.player.health, 100);
  const tower = combat.boss.towers[0];
  projectile.x = tower.x; projectile.y = tower.y;
  combat.hitEnemies(projectile);
  assert.equal(tower.health, tower.maxHealth);
});

test('miss recovery lasts the same duration across frame sizes and reduces mobility', () => {
  const small = fixture(); const large = fixture();
  small.combat.parry(); large.combat.parry();
  for (let index = 0; index < 20; index += 1) small.combat.update(0.01);
  large.combat.update(0.2);
  assert.ok(Math.abs(small.combat.parryRecovery - 0.3) < 1e-7);
  assert.ok(Math.abs(large.combat.parryRecovery - 0.3) < 1e-7);
  small.game.input.axis = () => ({ x: 1, y: 0 });
  small.game.player.update(0.2, small.game.input, small.world);
  assert.equal(small.game.player.velocity.x, 196);
  small.combat.update(0.31);
  assert.equal(small.game.player.parryRecovery, 0);
});

function startDash(fixture, direction = { x: -1, y: 0 }) {
  fixture.game.player.equippedAbilityTypes = ['dash'];
  fixture.game.player.useAbility('dash', direction);
  fixture.game.player.update(0.06, fixture.game.input, fixture.world, direction);
}

test('a perfect dash out of an actual committed melee strike earns one subsequent evasion', () => {
  const setup = fixture(); const { game, combat, world } = setup;
  const attacker = enemy('swordsman', 145, 100, { weaponType: 'sword', facing: Math.PI });
  attacker.update(0.01, game.player, world);
  attacker.update(0.27, game.player, world);
  startDash(setup);
  attacker.update(0.06, game.player, world);
  assert.equal(game.player.health, 100);
  assert.equal(combat.effects.evasionCharges, 1);
  assert.ok(combat.effects.perfectDodgeFlash > 0);
  game.player.update(0.3, game.input, world);
  game.player.takeDamage(40, { kind: 'melee', attacker, attackId: 'next-strike' });
  assert.equal(game.player.health, 100);
  assert.equal(game.player.evasionCharges, 0);
  game.player.update(0.2, game.input, world);
  game.player.takeDamage(40, { kind: 'melee', attacker, attackId: 'later-strike' });
  assert.equal(game.player.health, 60);
});

test('dashing freely or long before an attack cannot farm evasion charges', () => {
  const setup = fixture(); const { game, combat, world } = setup;
  startDash(setup);
  combat.update(0.06);
  assert.equal(game.player.evasionCharges, 0);
  game.player.update(0.07, game.input, world);
  assert.equal(combat.observeAttack({ origin: { x: 145, y: 100 }, range: 62, angle: Math.PI, arc: 0.85, attackId: 'late' }), false);
  assert.equal(game.player.evasionCharges, 0);
  game.player.perfectDodgeWindow = 0.1;
  assert.equal(combat.observeAttack({ origin: { x: 800, y: 800 }, range: 62, attackId: 'unrelated' }), false);
});

test('a projectile crossing the perfect dash path grants a charge without spending it on the same shot', () => {
  const setup = fixture(); const { game, combat } = setup;
  startDash(setup, { x: 0, y: 1 });
  const projectile = { x: 100, y: 106, vx: -420, vy: 0, radius: 5, life: 2, owner: 'enemy', kind: 'laser', damage: 20 };
  combat.hitPlayer(projectile);
  assert.equal(game.player.evasionCharges, 1);
  projectile.y = game.player.position.y;
  combat.hitPlayer(projectile);
  assert.equal(game.player.evasionCharges, 1);
  assert.equal(game.player.health, 100);
});

test('evasion protects against an unblockable slam and invulnerability does not consume it', () => {
  const { game, combat } = fixture();
  game.player.evasionCharges = 1;
  game.player.invulnerability = 1;
  game.player.takeDamage(40, { kind: 'melee', attacker: enemy('test', 140, 100) });
  assert.equal(game.player.evasionCharges, 1);
  game.player.invulnerability = 0;
  combat.parry();
  game.player.takeDamage(40, { kind: 'slam', parryable: false, attackId: 'slam-1' });
  assert.equal(game.player.health, 100);
  assert.equal(game.player.evasionCharges, 0);
  assert.equal(combat.riposteTimer, 0);
});

test('an explosive projectile can be parried and evaded without applying its blast', () => {
  for (const parry of [true, false]) {
    const { game, combat } = fixture('gun');
    if (parry) combat.parry(); else game.player.evasionCharges = 1;
    const projectile = { x: 110, y: 100, vx: -420, vy: 0, radius: 9, life: 2, owner: 'enemy', kind: 'explosive', damage: 25 };
    combat.hitPlayer(projectile);
    assert.equal(game.player.health, 100);
    assert.equal(projectile.owner === 'reflected', parry);
    assert.equal(Boolean(projectile.exploded), false);
  }
});

test('clear sight reveals the fog for five seconds and respects its eighteen-second cooldown', () => {
  const { game, combat, world } = fixture();
  game.player.equippedAbilityTypes = ['clear-sight'];
  assert.equal(game.player.useAbility('clear-sight'), true);
  assert.equal(combat.effects.fogRevealRemaining, 5);
  assert.equal(game.player.abilityCooldowns['clear-sight'], 18);
  assert.equal(game.player.useAbility('clear-sight'), false);
  game.player.update(5, game.input, world);
  assert.equal(combat.effects.fogRevealRemaining, 0);
  assert.equal(game.player.abilityCooldowns['clear-sight'], 13);
});

test('enemy awareness ramps in its cone, ignores blocked sight and remembers the last visible position', () => {
  const { game, world } = fixture();
  const scout = enemy('scout', 300, 100, { weaponType: 'sword', facing: Math.PI });
  scout.update(0.1, game.player, world);
  assert.ok(scout.awareness > 0 && scout.awareness < 1);
  assert.equal(scout.alertTimer, 0);
  scout.update(0.2, game.player, world);
  assert.ok(scout.alertTimer > 0);
  const seen = { ...scout.lastSeen };
  world.walls = [{ x: 160, y: 0, width: 20, height: 1000 }];
  game.player.position.y = 600;
  scout.update(0.1, game.player, world);
  assert.deepEqual(scout.lastSeen, seen);
  const unaware = enemy('unaware', 300, 100, { facing: Math.PI });
  unaware.update(1, game.player, world);
  assert.equal(unaware.awareness, 0);
});

test('a searching enemy stops pursuing the player once its last-seen search ends', () => {
  const { game, world } = fixture();
  const scout = enemy('scout', 700, 500, { facing: 0 });
  scout.lastSeen = { ...scout.position }; scout.searchTimer = 0.5;
  scout.update(0.2, game.player, world);
  assert.equal(scout.state, 'searching');
  scout.update(0.4, game.player, world);
  assert.equal(scout.lastSeen, null);
  scout.update(0.1, game.player, world);
  assert.equal(scout.state, 'roaming');
});

test('pathfinding routes a full-radius enemy around a wall and never cuts its corner', () => {
  const world = { width: 600, height: 400, gridSize: 40, walls: [{ x: 240, y: 0, width: 40, height: 280 }], openings: [] };
  const start = { x: 100, y: 100 }; const goal = { x: 420, y: 100 };
  const path = findPath(start, goal, world, 17);
  assert.ok(path.length >= 2);
  assert.ok(path.some((point) => point.y >= 300));
  let previous = start;
  for (const point of path) { assert.equal(hasClearPath(previous, point, world, 17), true); previous = point; }
  assert.deepEqual(path.at(-1), goal);
});

test('pathfinding respects door openings, unreachable routes and narrow gaps', () => {
  const world = { width: 400, height: 240, gridSize: 40, walls: [{ x: 180, y: 0, width: 40, height: 240 }], openings: [] };
  const start = { x: 100, y: 100 }; const goal = { x: 300, y: 100 };
  assert.deepEqual(findPath(start, goal, world), []);
  world.openings = [{ x: 180, y: 80, width: 40, height: 40 }];
  assert.ok(findPath(start, goal, world).length > 0);
  world.openings[0].height = 20;
  assert.deepEqual(findPath(start, goal, world), []);
});

test('enemy committed movement and player dash cannot tunnel through a thin wall', () => {
  const { game, world } = fixture();
  world.walls = [{ x: 160, y: 0, width: 5, height: 500 }];
  const attacker = enemy('dash', 100, 200, { weaponType: 'daggers' });
  attacker.moveToward(0, 250, world);
  game.player.move(250, 0, world);
  assert.ok(attacker.position.x <= 143);
  assert.ok(game.player.position.x <= 146);
  assert.equal(positionHitsWall(attacker.position, attacker.radius, world.walls), false);
});

test('nearby enemies separate safely instead of occupying the same attack point', () => {
  const { game, world } = fixture();
  const first = enemy('a', 500, 500); const second = enemy('b', 505, 500);
  world.enemies = [first, second];
  const before = Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y);
  first.separateFromPeers(0.1, world); second.separateFromPeers(0.1, world);
  assert.ok(Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y) > before);
});
