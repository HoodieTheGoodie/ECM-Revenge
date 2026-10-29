import test from 'node:test';
import assert from 'node:assert/strict';
import { FlyingPig } from '../src/entities/flying-pig.js';
import { Player } from '../src/entities/player.js';
import { campaignRooms, playgroundRooms } from '../src/world/campaign.js';
import { positionHitsWall } from '../src/world/collision.js';

function fixture(extra = {}) {
  const world = { width: 1200, height: 900, walls: [], ...extra };
  const boss = new FlyingPig({ x: 600, y: 330 }, world);
  const player = new Player(600, 450);
  return { boss, player, world };
}

function advanceTo(boss, player, phase, limit = 20) {
  let elapsed = 0;
  while (boss.phase !== phase && elapsed < limit) {
    boss.update(1 / 60, player);
    elapsed += 1 / 60;
  }
  assert.equal(boss.phase, phase, `Boss should reach ${phase} within ${limit} seconds`);
}

test('both built-in arenas put their four healing towers near separate room corners', () => {
  for (const room of [campaignRooms['flying-pig-arena'], playgroundRooms['feature-boss']]) {
    const boss = new FlyingPig(room.boss, room);
    assert.deepEqual(boss.towers.map(({ x, y }) => [x, y]), [[120, 120], [1080, 120], [120, 780], [1080, 780]]);
    assert.ok(boss.towers.every((tower) => !positionHitsWall(tower, tower.radius, room.walls)));
  }
  const custom = new FlyingPig({ towers: [{ x: 240, y: 260, health: 95 }] }, { width: 1200, height: 900 });
  assert.deepEqual([custom.towers[0].x, custom.towers[0].y, custom.towers[0].health], [240, 260, 95]);
});

test('flight crosses the arena instead of orbiting a small central cluster', () => {
  const { boss, player } = fixture();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let step = 0; step < 60 * 40; step += 1) {
    player.invulnerability = 100;
    boss.update(1 / 60, player);
    minX = Math.min(minX, boss.position.x); maxX = Math.max(maxX, boss.position.x);
    minY = Math.min(minY, boss.position.y); maxY = Math.max(maxY, boss.position.y);
    assert.ok(boss.position.x >= boss.radius && boss.position.x <= 1200 - boss.radius);
    assert.ok(boss.position.y >= boss.radius && boss.position.y <= 900 - boss.radius);
  }
  assert.ok(maxX - minX > 750, `Horizontal flight covered ${maxX - minX}`);
  assert.ok(maxY - minY > 500, `Vertical flight covered ${maxY - minY}`);
});

test('fly-over locks its target, hovers for a full second, and only hits once on landing', () => {
  const { boss, player } = fixture();
  advanceTo(boss, player, 'dive');
  const target = { ...boss.slamTarget };
  assert.deepEqual(target, player.position);
  player.position.x += 20;
  boss.update(0.1, player);
  assert.deepEqual(boss.slamTarget, target, 'The warning must not chase the player after it locks');
  advanceTo(boss, player, 'hover');
  boss.pendingProjectiles.length = 0;
  const health = player.health;
  boss.update(0.9, player);
  assert.equal(player.health, health);
  assert.equal(boss.phase, 'hover');
  assert.equal(boss.pendingProjectiles.length, 0, 'Do not obscure the ground-slam tell with another volley');
  boss.update(0.11, player);
  assert.equal(boss.phase, 'slam');
  assert.equal(player.health, health - 28);
  assert.equal(boss.altitude, 0);
  player.invulnerability = 0;
  boss.update(0.25, player);
  assert.equal(player.health, health - 28, 'The lingering impact graphic is not another damage hit');
  advanceTo(boss, player, 'grounded');
  assert.equal(boss.pendingSummons, 2);
  advanceTo(boss, player, 'flying');
  assert.equal(boss.slamTarget, null);
});

test('moving out of the warning or using dash invulnerability avoids the slam', () => {
  const { boss, player } = fixture();
  boss.beginSlam(player);
  advanceTo(boss, player, 'hover');
  player.position.x += boss.slamRadius + player.radius + 1;
  boss.update(1, player);
  assert.equal(player.health, 100);

  const second = fixture();
  second.boss.beginSlam(second.player);
  advanceTo(second.boss, second.player, 'hover');
  second.player.invulnerability = 0.24;
  second.boss.update(1, second.player);
  assert.equal(second.player.health, 100);
});

test('slam damage context marks an unparryable, dodgeable attack and observes near misses', () => {
  const { boss, player } = fixture();
  const observed = [], damage = [];
  player.observeAttack = (context) => observed.push(context);
  player.takeDamage = (amount, context) => damage.push({ amount, context });
  boss.beginSlam(player);
  advanceTo(boss, player, 'hover');
  boss.update(1, player);
  assert.equal(observed.length, 1);
  assert.equal(damage.length, 1);
  assert.equal(damage[0].context.kind, 'slam');
  assert.equal(damage[0].context.parryable, false);
  assert.equal(damage[0].context.dodgeable, true);
  assert.equal(damage[0].context.attackId, observed[0].attackId);
  const firstId = observed[0].attackId;
  boss.beginSlam(player);
  advanceTo(boss, player, 'hover');
  player.position.y += 180;
  boss.update(1, player);
  assert.equal(observed.length, 2, 'Dash timing can observe an impact that the player just escaped');
  assert.notEqual(observed[1].attackId, firstId);
  assert.equal(damage.length, 1);
});

test('solid walls stop slam damage and landing moves away from obstructed ground', () => {
  const { boss, player, world } = fixture();
  world.walls = [{ x: 640, y: 200, width: 20, height: 500 }];
  boss.beginSlam(player);
  advanceTo(boss, player, 'hover');
  player.position.x = 690;
  const observed = [];
  player.observeAttack = (attack) => observed.push(attack);
  boss.update(1, player);
  assert.equal(player.health, 100, 'Shockwave must not pass through a solid wall');
  assert.equal(observed.length, 0, 'A wall-protected player should not earn a dodge charge');
  player.position.x = 630;
  boss.beginSlam(player);
  assert.equal(positionHitsWall(boss.slamTarget, boss.radius, world.walls), false);
});

test('last tower starts a faster second phase, preserving shield reflection as the damage gate', () => {
  const { boss, player } = fixture();
  assert.equal(boss.hitReflected(100), false);
  boss.towers.slice(0, 3).forEach((tower) => boss.hitTower(tower, 100));
  assert.equal(boss.hitReflected(100), false);
  boss.hitTower(boss.towers[3], 100);
  assert.equal(boss.stage, 2);
  assert.equal(boss.phase, 'enraged');
  assert.equal(boss.pendingSummons, 2);
  boss.update(0.7, player);
  assert.equal(boss.pendingProjectiles.length, 0);
  assert.equal(boss.aimLocked, true);
  const lockedAngle = boss.targetAngle;
  player.position.x += 150;
  boss.update(0.5, player);
  assert.equal(boss.pendingProjectiles.length, 3);
  assert.ok(Math.abs(Math.atan2(boss.pendingProjectiles[1].vy, boss.pendingProjectiles[1].vx) - lockedAngle) < 0.00001);
  boss.update(1.35, player);
  assert.equal(boss.pendingProjectiles.length, 8);
  advanceTo(boss, player, 'hover');
  assert.equal(boss.slamRadius, 155);
  boss.update(1, player);
  assert.equal(player.health, 64);
  assert.equal(boss.hitReflected(100), true);
  assert.equal(boss.health, boss.maxHealth - 100);
  boss.hitReflected(boss.maxHealth);
  const position = { ...boss.position };
  boss.update(30, player);
  assert.deepEqual(boss.position, position);
  assert.equal(boss.defeated, true);
});
