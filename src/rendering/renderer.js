import { positionHitsWall } from '../world/collision.js';

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.world = world;
  }

  draw(player, camera, sword = null, chest = null, droppedItem = null, enemies = [], xpOrbs = [], doors = [], keys = [], effects = {}) {
    const context = this.context;
    this.animationTime = effects.time ?? (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    this.effects = effects;
    const { width, height } = this.canvas;
    context.fillStyle = '#0a1718';
    context.fillRect(0, 0, width, height);
    context.save();
    const shake = effects.reducedMotion || effects.screenShake === false ? 0 : typeof effects.screenShake === 'number' ? effects.screenShake : 0;
    context.translate(-camera.position.x + Math.sin(this.animationTime * 83) * shake, -camera.position.y + Math.cos(this.animationTime * 97) * shake * 0.65);
    this.drawWorld(context);
    this.drawDoors(context, doors);
    (effects.interactables ?? []).forEach((entry) => this.drawInteractable(context, entry));
    keys.forEach((key) => this.drawKey(context, key));
    xpOrbs.forEach((orb) => this.drawExperienceOrb(context, orb));
    if (effects.boss) this.drawBoss(context, effects.boss);
    enemies.filter((enemy) => enemy.health > 0).forEach((enemy) => this.drawChaser(context, enemy));
    if (droppedItem && !chest) this.drawDroppedItem(context, droppedItem);
    if (chest) this.drawChest(context, chest);
    (effects.chests ?? []).filter((entry) => entry !== chest).forEach((entry) => this.drawChest(context, entry));
    (effects.loot ?? []).forEach((entry) => this.drawDroppedItem(context, entry));
    this.drawInteractionHint(context, player, chest, droppedItem, keys, doors, effects);
    if (sword) this.drawSword(context, player, sword);
    this.drawPlayer(context, player);
    if (effects.shieldActive) {
      context.save();
      context.strokeStyle = effects.shieldPerfect ? '#eafff9' : '#91f7e1';
      context.fillStyle = effects.shieldPerfect ? '#91f7e12b' : '#91f7e111';
      context.lineWidth = effects.shieldPerfect ? 4 : 2;
      context.shadowColor = '#91f7e1';
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(player.position.x, player.position.y, player.radius + 20, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }
    this.drawDefense(context, player, effects);
    this.drawProjectiles(context, effects.projectiles ?? []);
    this.drawParticles(context, effects.particles ?? []);
    context.restore();
    if (effects.fog && !(effects.fogRevealRemaining > 0)) this.drawFog(context, player, camera, effects);
  }

  drawDefense(context, player, effects) {
    const { x, y } = player.position;
    context.save();
    if (effects.parryActive || effects.parryFlash > 0) {
      context.strokeStyle = effects.parryFlash > 0 ? '#ffe29a' : '#dcecff';
      context.fillStyle = '#ffe29a1a';
      context.lineWidth = 4;
      context.beginPath();
      context.arc(x, y, 42, (effects.parryAngle ?? 0) - 55 * Math.PI / 180, (effects.parryAngle ?? 0) + 55 * Math.PI / 180);
      context.stroke();
    }
    if (effects.hindered) {
      context.strokeStyle = '#d7a6ff';
      context.lineWidth = 2;
      context.setLineDash([3, 4]);
      context.beginPath(); context.ellipse(x, y + player.radius, 22, 7, 0, 0, Math.PI * 2); context.stroke();
      context.setLineDash([]);
    }
    if (effects.evasionCharges > 0 || effects.evasionFlash > 0) {
      context.strokeStyle = '#8ddcff'; context.lineWidth = 2;
      context.setLineDash(effects.evasionCharges ? [12, 7] : []);
      context.beginPath(); context.arc(x, y, player.radius + 11, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
    }
    if (effects.parryRecovery > 0) {
      context.strokeStyle = '#ff8b83'; context.lineWidth = 3;
      context.beginPath(); context.arc(x, y, player.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * effects.parryRecovery / 0.32); context.stroke();
    }
    const label = effects.perfectDodgeFlash > 0 ? 'PERFECT DODGE · EVASION READY' : effects.evasionFlash > 0 ? 'EVADED' : effects.parryRecovery > 0 ? 'MISSED · EXPOSED' : effects.perfectFlash > 0 ? 'PERFECT · RECHARGED' : effects.riposteTimer > 0 ? 'RIPOSTE · ATTACK' : effects.hindered ? 'HINDERED' : '';
    if (label) {
      context.font = '700 10px monospace';
      context.textAlign = 'center';
      context.fillStyle = effects.evasionFlash > 0 || effects.perfectDodgeFlash > 0 ? '#8ddcff' : effects.parryRecovery > 0 ? '#ff8b83' : effects.perfectFlash > 0 ? '#c7fff1' : effects.hindered ? '#d7a6ff' : '#ffe29a';
      context.fillText(label, x, y - 49);
    }
    context.restore();
  }

  drawFog(context, player, camera, effects) {
    const x = player.position.x - camera.position.x;
    const y = player.position.y - camera.position.y;
    const radius = effects.roomType === 'hub' ? 480 : effects.boss ? 430 : effects.roomType === 'tutorial' ? 380 : 310;
    context.save();
    const darkness = context.createRadialGradient(x, y, 70, x, y, radius);
    darkness.addColorStop(0, '#06121600');
    darkness.addColorStop(0.38, '#06121614');
    darkness.addColorStop(0.72, '#0612168c');
    darkness.addColorStop(1, '#061216f7');
    context.fillStyle = darkness;
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // A gentle peripheral mist never covers the immediate combat space.
    const time = effects.reducedMotion ? 0 : this.animationTime * 0.12;
    for (let index = 0; index < 3; index += 1) {
      const angle = time + index * Math.PI * 2 / 3;
      const mistX = x + Math.cos(angle) * radius * 0.82;
      const mistY = y + Math.sin(angle) * radius * 0.82;
      const mist = context.createRadialGradient(mistX, mistY, 0, mistX, mistY, radius * 0.6);
      mist.addColorStop(0, '#527b7430');
      mist.addColorStop(1, '#527b7400');
      context.fillStyle = mist;
      context.fillRect(mistX - radius, mistY - radius, radius * 2, radius * 2);
    }
    context.restore();
  }

  drawParticles(context, particles) {
    if (this.effects?.reducedMotion) return;
    context.save();
    particles.forEach((particle) => {
      context.globalAlpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
      context.fillStyle = particle.color;
      context.strokeStyle = particle.color;
      if (particle.shape === 'ring') {
        context.lineWidth = 1 + context.globalAlpha * 2;
        context.beginPath();
        context.arc(particle.x, particle.y, Math.max(1, particle.size * (1 - context.globalAlpha)), 0, Math.PI * 2);
        context.stroke();
        return;
      }
      if (particle.shape === 'spark') {
        context.lineWidth = Math.max(1, particle.size * context.globalAlpha * 0.5);
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(particle.x - particle.vx * 0.04, particle.y - particle.vy * 0.04);
        context.stroke();
        return;
      }
      context.beginPath();
      context.arc(particle.x, particle.y, Math.max(0.5, particle.size * context.globalAlpha), 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  drawWorld(context) {
    context.fillStyle = '#102a29';
    context.fillRect(0, 0, this.world.width, this.world.height);
    context.strokeStyle = '#173b39';
    context.lineWidth = 1;

    for (let x = 0; x <= this.world.width; x += this.world.gridSize) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, this.world.height);
      context.stroke();
    }
    for (let y = 0; y <= this.world.height; y += this.world.gridSize) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(this.world.width, y);
      context.stroke();
    }

    context.fillStyle = '#183b39';
    context.beginPath();
    this.world.walls.forEach((wall) => context.rect(wall.x, wall.y, wall.width, wall.height));
    context.fill();
    context.strokeStyle = '#5b958b';
    context.beginPath();
    this.wallOutline().forEach(([x1, y1, x2, y2]) => {
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
    });
    context.stroke();
  }

  wallOutline() {
    const walls = this.world.walls;
    // Worlds are reconstructed after doors open; cache geometry rather than array identity.
    const signature = walls.map((wall) => `${wall.x},${wall.y},${wall.width},${wall.height}`).join(';');
    if (signature === this.wallSignature) return this.wallSegments;
    this.wallSignature = signature;
    this.wallSegments = [];
    walls.forEach((wall) => {
      const right = wall.x + wall.width;
      const bottom = wall.y + wall.height;
      const edges = [
        { horizontal: true, fixed: wall.y, start: wall.x, end: right, outside: (other) => other.y < wall.y && other.y + other.height >= wall.y },
        { horizontal: true, fixed: bottom, start: wall.x, end: right, outside: (other) => other.y <= bottom && other.y + other.height > bottom },
        { horizontal: false, fixed: wall.x, start: wall.y, end: bottom, outside: (other) => other.x < wall.x && other.x + other.width >= wall.x },
        { horizontal: false, fixed: right, start: wall.y, end: bottom, outside: (other) => other.x <= right && other.x + other.width > right }
      ];
      edges.forEach((edge) => {
        let intervals = [[edge.start, edge.end]];
        walls.forEach((other) => {
          if (!intervals.length || other === wall || !edge.outside(other)) return;
          const start = edge.horizontal ? other.x : other.y;
          const end = start + (edge.horizontal ? other.width : other.height);
          intervals = intervals.flatMap(([from, to]) => {
            if (end <= from || start >= to) return [[from, to]];
            return [...(start > from ? [[from, start]] : []), ...(end < to ? [[end, to]] : [])];
          });
        });
        intervals.forEach(([from, to]) => this.wallSegments.push(edge.horizontal ? [from, edge.fixed, to, edge.fixed] : [edge.fixed, from, edge.fixed, to]));
      });
    });
    return this.wallSegments;
  }

  drawDoors(context, doors) {
    doors.forEach((door) => {
      const color = door.lockedColor || (door.requirement === 'all-enemies' ? '#ff6578' : door.requirement === 'terminal' ? '#c49aff' : '#d8f36a');
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(door.x + 1, door.y + 1, door.width - 2, door.height - 2);
      if (door.lockedColor) {
        context.fillStyle = door.lockedColor;
        context.fillRect(door.x + door.width / 2 - 5, door.y + door.height / 2 - 6, 10, 12);
      }
      if (door.requirement && door.requirement !== 'key' && door.requirement !== 'none') {
        context.save();
        context.fillStyle = color;
        context.font = '700 13px monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(door.requirement === 'terminal' ? `T${door.terminalNumber ?? door.terminal ?? 1}` : ['switch', 'switches'].includes(door.requirement) ? 'S' : '×', door.x + door.width / 2, door.y + door.height / 2);
        context.restore();
      }
    });
  }

  drawKey(context, key) {
    context.save();
    context.translate(key.x, key.y + (this.effects?.reducedMotion ? 0 : Math.sin((this.animationTime ?? 0) * 3) * 3));
    context.fillStyle = key.color;
    context.shadowColor = key.color;
    context.shadowBlur = 14;
    context.beginPath();
    context.arc(0, 0, 9, 0, Math.PI * 2);
    context.fill();
    context.fillRect(6, -2, 18, 4);
    context.fillRect(18, 2, 4, 7);
    context.restore();
  }

  drawPlayer(context, player) {
    context.save();
    const speed = Math.hypot(player.velocity.x, player.velocity.y);
    const pulse = this.effects?.reducedMotion ? 0 : Math.sin((this.animationTime ?? 0) * (speed > 30 ? 12 : 3));
    context.fillStyle = '#020b0b55';
    context.beginPath();
    context.ellipse(player.position.x, player.position.y + player.radius + 3, player.radius, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = player.invulnerability > 0 ? this.effects?.reducedMotion ? 0.7 : Math.floor(player.invulnerability * 14) % 2 === 0 ? 0.35 : 1 : 1;
    context.beginPath();
    context.arc(player.position.x, player.position.y, player.radius, 0, Math.PI * 2);
    context.fillStyle = '#8ddcff';
    context.shadowColor = '#8ddcff';
    context.shadowBlur = 18 + pulse * 3;
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = 2;
    context.strokeStyle = '#d9f6ff';
    context.stroke();
    context.restore();
  }

  drawExperienceOrb(context, orb) {
    const bob = this.effects?.reducedMotion ? 0 : Math.sin(orb.bob) * 3;
    context.save();
    context.translate(orb.x, orb.y + bob);
    context.fillStyle = '#68f58d';
    context.shadowColor = '#68f58d';
    context.shadowBlur = 12;
    context.beginPath();
    context.arc(0, 0, 5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  drawChaser(context, enemy) {
    this.drawVision(context, enemy);
    this.drawEnemyTell(context, enemy);
    context.save();
    context.globalAlpha = enemy.isStunned ? this.effects?.reducedMotion ? 0.6 : Math.floor(enemy.stunTimer * 12) % 2 === 0 ? 0.45 : 1 : 1;
    const enemyColor = enemy.hitFlash > 0 ? '#fff1d6' : enemy.jumpTelegraph > 0 ? '#ff8b3d' : enemy.state === 'spinning' ? '#f4dc58' : ({ spear: '#c68b4e', daggers: '#a667d8', gun: '#bc526e', sword: '#d86955' }[enemy.weaponType] ?? '#d94b58');
    context.fillStyle = enemyColor;
    context.shadowColor = enemyColor;
    context.shadowBlur = enemy.jumpTelegraph > 0 || enemy.state === 'spinning' ? 20 : 10;
    context.beginPath();
    context.arc(enemy.position.x, enemy.position.y, enemy.radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    if (enemy.armorType) {
      context.strokeStyle = enemy.armorType === 'tanker-armor' ? '#ccd6e6' : '#76e4bc';
      context.lineWidth = enemy.armorType === 'tanker-armor' ? 6 : 3;
      context.beginPath();
      context.arc(enemy.position.x, enemy.position.y, enemy.radius - 3, enemy.facing + 0.5, enemy.facing + Math.PI * 2 - 0.5);
      context.stroke();
      context.lineWidth = 1;
    }
    context.strokeStyle = '#ffb0a5';
    context.stroke();
    context.fillStyle = '#071013';
    context.beginPath();
    context.arc(enemy.position.x, enemy.position.y, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#effff0';
    context.font = '700 8px Space Mono, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(enemy.level, enemy.position.x, enemy.position.y);
    context.restore();
    if (enemy.weaponType) {
      const profile = enemy.attackProfile;
      const progress = Math.max(0, Math.min(1, enemy.stateTimer / profile.duration));
      const strike = enemy.stateTimer < profile.windup ? -0.12 * enemy.stateTimer / profile.windup : Math.sin(Math.min(1, (enemy.stateTimer - profile.windup) / (profile.duration - profile.windup)) * Math.PI);
      const attacking = enemy.state === 'attacking';
      const pose = { extension: attacking && enemy.weaponType === 'spear' ? strike * 68 : attacking && enemy.weaponType === 'daggers' ? strike * 18 : 0, hand: enemy.attackHand ?? 1, flash: enemy.weaponType === 'gun' ? (enemy.shotFlash ?? 0) / 0.18 : 0, recoil: (enemy.shotFlash ?? 0) * 40 };
      const angle = enemy.state === 'spinning' ? enemy.spinDirection + enemy.stateTimer * 8 : enemy.state === 'dagger-dash' ? enemy.spinDirection : enemy.facing + (attacking && !['gun', 'spear'].includes(enemy.weaponType) ? (progress - 0.5) * 2.3 * (enemy.weaponType === 'daggers' ? pose.hand : 1) : 0);
      this.drawWeaponGlyph(context, enemy.weaponType, enemy.position.x, enemy.position.y, angle, enemy.weaponType === 'spear' ? 0.9 : 0.82, pose);
    }
    if (!enemy.weaponType && (enemy.state === 'attacking' || enemy.state === 'spinning')) {
      context.save();
      context.translate(enemy.position.x, enemy.position.y);
      context.rotate(enemy.state === 'spinning' ? enemy.spinDirection + enemy.stateTimer * 8 : enemy.facing);
      context.strokeStyle = '#ff405c';
      context.shadowColor = '#ff405c';
      context.shadowBlur = 12;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(8, 0);
      context.lineTo(48, 0);
      context.stroke();
      context.restore();
    }
    context.fillStyle = '#071013';
    const healthWidth = 36;
    const healthRatio = Math.min(1, Math.max(0, enemy.health / enemy.maxHealth));
    context.fillRect(enemy.position.x - healthWidth / 2, enemy.position.y - 27, healthWidth, 4);
    context.fillStyle = '#e34f5d';
    context.fillRect(enemy.position.x - healthWidth / 2, enemy.position.y - 27, healthWidth * healthRatio, 4);
    context.strokeStyle = '#ffb0a5';
    context.strokeRect(enemy.position.x - healthWidth / 2, enemy.position.y - 27, healthWidth, 4);
    if (enemy.weaponType) {
      context.save();
      context.font = '700 8px monospace';
      context.textAlign = 'center';
      context.fillStyle = enemy.weaponType === 'daggers' ? '#dcc0ff' : enemy.weaponType === 'spear' ? '#ffe2ad' : '#ffd6da';
      context.fillText(enemy.weaponType.toUpperCase(), enemy.position.x, enemy.position.y - 33);
      context.restore();
    }
  }

  drawVision(context, enemy) {
    if (enemy.isStunned || !this.world) return;
    const range = enemy.visionRange ?? 340;
    const halfAngle = enemy.visionHalfAngle ?? Math.PI / 3;
    const cacheKey = `${Math.round(enemy.position.x / 3)},${Math.round(enemy.position.y / 3)},${Math.round(enemy.facing * 35)},${Math.floor((this.animationTime ?? 0) * 8)}`;
    if (enemy.visionCache?.key !== cacheKey) {
      const points = [];
      for (let ray = 0; ray <= 20; ray += 1) {
        const angle = enemy.facing - halfAngle + halfAngle * 2 * ray / 20;
        let last = { ...enemy.position };
        for (let distance = 12; distance <= range; distance += 12) {
          const point = { x: enemy.position.x + Math.cos(angle) * distance, y: enemy.position.y + Math.sin(angle) * distance };
          if (point.x < 0 || point.y < 0 || point.x > this.world.width || point.y > this.world.height || positionHitsWall(point, 0, this.world.walls, this.world.openings)) break;
          last = point;
        }
        points.push(last);
      }
      enemy.visionCache = { key: cacheKey, points };
    }
    context.save();
    const alerted = enemy.alertTimer > 0;
    context.fillStyle = alerted ? '#ff80520a' : enemy.awareness > 0 ? '#ffcf731c' : '#8ddcff0c';
    context.strokeStyle = alerted ? '#ff80521c' : '#8ddcff23';
    context.lineWidth = 1;
    context.beginPath(); context.moveTo(enemy.position.x, enemy.position.y);
    enemy.visionCache.points.forEach((point) => context.lineTo(point.x, point.y));
    context.closePath(); context.fill(); context.stroke();
    if (enemy.awareness > 0 || enemy.state === 'searching' || enemy.actionRecovery > 0 || enemy.isStunned) {
      context.font = '700 10px monospace'; context.textAlign = 'center';
      context.fillStyle = enemy.actionRecovery > 0 ? '#8ddcff' : alerted ? '#ff8b83' : '#ffcf73';
      context.fillText(enemy.actionRecovery > 0 ? 'OPEN' : enemy.state === 'searching' ? 'SEARCHING ?' : alerted ? '!' : '?', enemy.position.x, enemy.position.y - 49);
      if (!alerted && enemy.awareness > 0) { context.fillStyle = '#ffcf73'; context.fillRect(enemy.position.x - 14, enemy.position.y - 44, 28 * enemy.awareness, 2); }
    }
    context.restore();
  }

  drawEnemyTell(context, enemy) {
    if (enemy.isStunned) return;
    context.save();
    context.translate(enemy.position.x, enemy.position.y);
    context.rotate(enemy.state === 'aiming' ? enemy.shotAngle : ['dagger-dash', 'spinning', 'dash-windup', 'spin-windup'].includes(enemy.state) ? enemy.spinDirection : enemy.facing);
    context.strokeStyle = '#ffb36a';
    context.fillStyle = '#ff926522';
    context.lineWidth = 2;
    if (enemy.state === 'attacking') {
      const { range, arc, windup, strike } = enemy.attackProfile;
      const recovering = enemy.stateTimer >= windup + strike;
      if (recovering) { context.restore(); return; }
      context.beginPath();
      context.moveTo(0, 0); context.arc(0, 0, range, -arc, arc); context.closePath();
      context.fill();
      context.strokeStyle = enemy.stateTimer < windup ? '#ffb36a' : '#ff6578';
      context.stroke();
      context.fillStyle = enemy.stateTimer < windup ? '#ffb36a' : '#ff6578';
      context.fillRect(-16, -40, 32 * Math.min(1, enemy.stateTimer / windup), 3);
    } else if (enemy.state === 'aiming') {
      context.strokeStyle = enemy.pendingShot === 'explosive' ? '#ffc16a' : '#ff92bc';
      context.setLineDash([5, 6]);
      context.beginPath(); context.moveTo(25, 0); context.lineTo(280, 0); context.stroke();
      context.setLineDash([]);
      context.beginPath(); context.arc(0, 0, 29, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, enemy.stateTimer / 0.55)); context.stroke();
    } else if (enemy.state === 'dash-windup' || enemy.state === 'spin-windup') {
      context.strokeStyle = enemy.state === 'dash-windup' ? '#e4a0ff' : '#f4dc58';
      context.setLineDash([5, 5]);
      context.strokeRect(12, -18, 140, 36);
      context.setLineDash([]);
      context.beginPath(); context.arc(0, 0, 29, 0, Math.PI * 2 * Math.min(1, enemy.stateTimer / 0.42)); context.stroke();
    } else if (enemy.state === 'spinning') {
      context.strokeStyle = '#f4dc58';
      context.beginPath(); context.arc(0, 0, 44, 0, Math.PI * 2); context.stroke();
    } else if (enemy.state === 'dagger-dash') {
      context.strokeStyle = '#e4a0ff';
      [-12, 12].forEach((offset) => {
        context.beginPath(); context.moveTo(-55, offset); context.lineTo(25, offset); context.stroke();
      });
    } else if (enemy.alertTimer > 0 && ((enemy.weaponType === 'gun' && enemy.ammo > 0 && enemy.attackCooldown < 0.55) || (enemy.weaponType === 'spear' && enemy.spinCooldown < 0.5))) {
      context.setLineDash([6, 7]);
      context.beginPath(); context.moveTo(28, 0); context.lineTo(enemy.weaponType === 'gun' ? 190 : 130, 0); context.stroke();
      context.setLineDash([]);
      context.beginPath(); context.arc(34, 0, 6, 0, Math.PI * 2); context.stroke();
    }
    if (enemy.jumpTelegraph > 0) {
      context.strokeStyle = '#ffb36a';
      context.beginPath(); context.arc(0, 0, enemy.radius + 8, 0, Math.PI * 2 * Math.min(1, enemy.jumpTelegraph / 2)); context.stroke();
    }
    context.restore();
  }

  drawSword(context, player, sword) {
    const pose = sword.pose;
    context.save();
    context.translate(player.position.x, player.position.y);
    context.rotate(pose.angle);
    if (pose.trail > 0 && !this.effects?.reducedMotion) {
      context.strokeStyle = sword.type === 'scythe' || sword.type === 'daggers' ? '#d7a6ff66' : '#c9efff66';
      context.lineWidth = pose.special && sword.type === 'sword' ? 14 : 7;
      context.globalAlpha = pose.trail;
      context.beginPath();
      if (sword.type === 'spear') {
        context.moveTo(35, 9); context.lineTo(80 + pose.extension, 9);
      } else if (sword.type === 'daggers') {
        [-14, 14].forEach((side) => { context.moveTo(pose.special ? -50 : 5, side); context.lineTo(38 + pose.extension, side); });
      } else context.arc(0, 0, sword.type === 'scythe' ? 74 : 57, pose.special ? -2.5 : -0.95, 0.1);
      context.stroke();
      context.globalAlpha = 1;
    }
    this.drawWeaponGlyph(context, sword.type, 0, pose.phase === 'idle' && sword.type === 'sword' ? 3 : -9, 0, 1, pose);
    context.restore();
  }

  drawChest(context, chest) {
    const burst = chest.state === 'burst';
    const opened = chest.state === 'opened';
    const offsetX = this.effects?.reducedMotion ? 0 : chest.shake;
    context.save();
    context.translate(chest.position.x + offsetX, chest.position.y);
    context.shadowColor = burst ? '#d8f36a' : '#000000';
    context.shadowBlur = burst ? 24 : 0;
    context.fillStyle = '#8c542d';
    context.fillRect(-22, -2, 44, 24);
    context.strokeStyle = '#f0b35d';
    context.lineWidth = 2;
    context.strokeRect(-22, -2, 44, 24);
    if (opened) {
      context.fillStyle = '#b8753c';
      context.fillRect(-22, -28, 44, 8);
      context.strokeRect(-22, -28, 44, 8);
      context.fillStyle = '#dcecff';
      context.fillRect(-3, -16, 6, 22);
      context.strokeStyle = '#8b5a36';
      context.fillRect(-8, 3, 16, 4);
    } else {
      context.fillStyle = '#b8753c';
      context.beginPath();
      context.arc(0, -3, 22, Math.PI, 0);
      context.lineTo(22, 3);
      context.lineTo(-22, 3);
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = '#d8f36a';
      context.fillRect(-4, 5, 8, 10);
    }
    if (burst) context.globalAlpha = Math.max(0, 1 - chest.timer / 0.55);
    if (!this.effects?.reducedMotion) chest.particles.forEach((particle) => { context.fillStyle = particle.size > 5 ? '#d8f36a' : '#f0b35d'; context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size); });
    context.restore();
  }

  drawDroppedItem(context, item) {
    context.save();
    const bob = this.effects?.reducedMotion ? 0 : Math.sin(item.bob ?? this.animationTime ?? 0) * 6;
    context.translate(item.x, item.y + bob);
    const rarityColor = { common: '#d8f36a', rare: '#73c9ff', epic: '#c690ff', unique: '#ffd477' }[item.item?.rarity ?? item.rarity] ?? '#d8f36a';
    context.fillStyle = `${rarityColor}55`;
    context.shadowColor = rarityColor;
    context.shadowBlur = 18;
    context.beginPath();
    context.ellipse(0, 10, 32, 13, 0, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    const type = item.item?.type ?? item.type;
    if (type && type !== 'sword') {
      if (['spear', 'daggers', 'gun', 'laser-gun', 'scythe'].includes(type)) this.drawWeaponGlyph(context, type, -15, 0, -0.45, 0.7);
      else {
        context.fillStyle = rarityColor;
        context.font = '700 16px monospace';
        context.textAlign = 'center';
        context.fillText(type === 'dash' ? '»' : type === 'map-view' ? 'M' : type.includes('armor') ? 'A' : type.includes('shield') ? '◈' : '◆', 0, 4);
      }
      context.restore();
      return;
    }
    context.rotate(-0.45);
    context.strokeStyle = '#8b5a36';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(-12, 8);
    context.lineTo(2, 8);
    context.stroke();
    context.strokeStyle = '#dcecff';
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(0, 8);
    context.lineTo(34, 8);
    context.stroke();
    context.restore();
  }

  drawWeaponGlyph(context, type, x, y, angle, scale = 1, pose = {}) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.scale(scale, scale);
    context.translate((pose.extension ?? 0) - (pose.recoil ?? 0), 0);
    context.lineCap = 'round';
    context.strokeStyle = '#8b5a36';
    context.lineWidth = 5;
    if (!['daggers', 'gun', 'laser-gun'].includes(type)) {
      context.beginPath();
      context.moveTo(8, 9);
      context.lineTo(type === 'spear' ? 64 : 24, 9);
      context.stroke();
    }
    context.strokeStyle = '#dcecff';
    context.fillStyle = '#dcecff';
    if (type === 'gun' || type === 'laser-gun') {
      context.fillStyle = '#548ba2';
      context.fillRect(13, 2, 27, 14);
      context.fillStyle = '#a9edff';
      context.fillRect(30, 5, 17, 7);
      context.fillRect(17, 14, 7, 9);
      context.fillStyle = '#d9f6ff';
      context.fillRect(16, 4, 9, 3);
      if (pose.flash > 0) {
        context.globalAlpha *= Math.min(1, pose.flash);
        context.fillStyle = pose.special ? '#ffdd91' : '#e8fbff';
        const flash = this.effects?.reducedMotion ? 6 : 7 + pose.flash * 11;
        context.beginPath();
        context.moveTo(47, 9); context.lineTo(50 + flash, 2); context.lineTo(48 + flash * 0.7, 9); context.lineTo(50 + flash, 16); context.closePath(); context.fill();
      }
    } else if (type === 'spear') {
      context.beginPath();
      context.moveTo(82, 9); context.lineTo(60, 2); context.lineTo(60, 16); context.closePath(); context.fill();
    } else if (type === 'daggers') {
      [-1, 1].forEach((hand) => {
        const offset = hand * 14;
        const advance = pose.special ? 0 : hand === (pose.hand ?? 1) ? 0 : -(pose.extension ?? 0) * 1.5;
        context.fillStyle = '#9b6d48';
        context.fillRect(5 + advance, offset - 3, 12, 6);
        context.fillStyle = hand === (pose.hand ?? 1) ? '#f5edff' : '#b9c8e8';
        context.beginPath(); context.moveTo(16 + advance, offset - 4); context.lineTo(42 + advance, offset); context.lineTo(16 + advance, offset + 4); context.closePath(); context.fill();
      });
    } else if (type === 'scythe') {
      context.strokeStyle = '#d7a6ff';
      context.lineWidth = 5;
      context.beginPath(); context.moveTo(12, 9); context.lineTo(60, 9); context.stroke();
      context.fillStyle = '#e6c8ff';
      context.beginPath(); context.moveTo(56, -17); context.quadraticCurveTo(87, -10, 71, 37); context.quadraticCurveTo(72, 2, 52, -3); context.closePath(); context.fill();
    } else {
      context.lineWidth = 7;
      context.beginPath(); context.moveTo(22, 9); context.lineTo(58, 9); context.stroke();
      context.lineWidth = 3;
      context.strokeStyle = '#e2b56a';
      context.beginPath(); context.moveTo(20, 1); context.lineTo(20, 17); context.stroke();
      context.lineWidth = 1.5;
      context.strokeStyle = '#ffffff';
      context.beginPath(); context.moveTo(25, 7); context.lineTo(57, 7); context.stroke();
    }
    context.restore();
  }

  drawProjectiles(context, projectiles) {
    context.save();
    projectiles.forEach((projectile) => {
      context.save();
      const angle = Math.atan2(projectile.vy, projectile.vx);
      const color = projectile.color ?? '#a9edff';
      if (!this.effects?.reducedMotion && projectile.kind !== 'scythe') {
        context.strokeStyle = color;
        context.globalAlpha = 0.35;
        context.lineWidth = projectile.kind === 'laser' ? 4 : 3;
        context.beginPath();
        context.moveTo(projectile.x, projectile.y);
        context.lineTo(projectile.x - Math.cos(angle) * (projectile.kind === 'laser' ? 30 : 16), projectile.y - Math.sin(angle) * (projectile.kind === 'laser' ? 30 : 16));
        context.stroke();
        context.globalAlpha = 1;
      }
      if (projectile.kind === 'scythe' || projectile.kind === 'spear') {
        if (projectile.kind === 'scythe') {
          context.strokeStyle = '#d7a6ff66';
          context.lineWidth = 2;
          context.beginPath(); context.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2); context.stroke();
        }
        this.drawWeaponGlyph(context, projectile.kind, projectile.x, projectile.y, projectile.kind === 'scythe' ? (projectile.age ?? 0) * 18 : angle, 0.7, { extension: -42 });
        context.restore();
        return;
      }
      context.fillStyle = color;
      context.shadowColor = context.fillStyle;
      context.shadowBlur = this.effects?.reducedMotion ? 0 : 10;
      context.beginPath();
      context.arc(projectile.x, projectile.y, projectile.radius ?? 5, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      if (projectile.kind === 'explosive') {
        context.strokeStyle = '#ffdf89';
        context.lineWidth = 2;
        context.beginPath(); context.arc(projectile.x, projectile.y, (projectile.radius ?? 9) + 3, 0, Math.PI * 2); context.stroke();
        context.fillStyle = '#fff4c9';
        context.fillRect(projectile.x - 3, projectile.y - 3, 6, 6);
      } else if (projectile.kind === 'pig') {
        context.strokeStyle = projectile.owner === 'reflected' ? '#e3fff6' : '#ffe0eb';
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(projectile.x, projectile.y - 4); context.lineTo(projectile.x + 4, projectile.y); context.lineTo(projectile.x, projectile.y + 4); context.lineTo(projectile.x - 4, projectile.y); context.closePath(); context.stroke();
      }
      context.restore();
    });
    context.restore();
  }

  drawInteractable(context, entry) {
    context.save();
    context.translate(entry.x, entry.y);
    const active = entry.active || entry.offline;
    const color = entry.type === 'tip-box' ? '#8ddcff' : active ? '#76e4bc' : '#c49aff';
    context.fillStyle = '#142b36';
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.shadowColor = color;
    context.shadowBlur = entry.type === 'tip-box' ? 18 + (this.effects?.reducedMotion ? 0 : Math.sin((this.animationTime ?? 0) * 3) * 5) : 8;
    if (entry.type === 'switch') {
      context.fillRect(-11, -17, 22, 34);
      context.strokeRect(-11, -17, 22, 34);
      context.beginPath(); context.moveTo(0, 8); context.lineTo(active ? 6 : -6, -9); context.stroke();
    } else {
      context.fillRect(-25, -22, 50, 44);
      context.strokeRect(-25, -22, 50, 44);
      context.fillStyle = color;
      context.font = '700 12px monospace';
      context.textAlign = 'center';
      context.fillText(entry.type === 'tip-box' ? 'TIP' : `T${entry.number ?? entry.terminalNumber ?? 1}`, 0, 4);
    }
    context.shadowBlur = 0;
    context.fillStyle = color;
    context.font = '10px monospace';
    context.textAlign = 'center';
    context.fillText(entry.label ?? (entry.type === 'tip-box' ? 'E · TIP BOX' : active ? 'OFFLINE' : entry.type === 'switch' ? 'E · SWITCH' : 'E · TERMINAL'), 0, -31);
    context.restore();
  }

  drawBoss(context, boss) {
    context.save();
    const livingTowers = boss.towers.filter((tower) => tower.health > 0).length;
    boss.towers.forEach((tower, index) => {
      const alive = tower.health > 0;
      context.fillStyle = tower.hitFlash > 0 ? '#e4fff2' : alive ? '#305b4e' : '#243333';
      context.strokeStyle = alive ? '#91f7e1' : '#546260';
      context.lineWidth = 3;
      context.fillRect(tower.x - 19, tower.y - 27, 38, 54);
      context.strokeRect(tower.x - 19, tower.y - 27, 38, 54);
      context.fillStyle = alive ? '#91f7e1' : '#778984';
      context.font = '700 13px monospace'; context.textAlign = 'center';
      context.fillText(alive ? `${index + 1}` : '×', tower.x, tower.y + 5);
      if (alive && !boss.defeated) {
        context.save();
        context.globalAlpha = 0.2 + (this.effects?.reducedMotion ? 0 : Math.sin((this.animationTime ?? 0) * 5) * 0.08);
        context.setLineDash([5, 9]);
        context.lineDashOffset = this.effects?.reducedMotion ? 0 : -(this.animationTime ?? 0) * 20;
        context.beginPath(); context.moveTo(tower.x, tower.y); context.lineTo(boss.position.x, boss.position.y); context.stroke();
        context.restore();
        context.fillStyle = '#91f7e1';
        context.fillRect(tower.x - 19, tower.y - 36, 38 * tower.health / tower.maxHealth, 4);
      }
    });
    if (boss.defeated) { context.restore(); return; }
    const x = boss.position.x;
    const groundY = boss.position.y;
    const y = groundY - (boss.altitude ?? 0) * 35;
    if (boss.slamTarget && ['dive', 'hover', 'slam'].includes(boss.phase)) {
      const target = boss.slamTarget;
      const warning = Math.min(1, boss.slamWarning ?? 0);
      context.fillStyle = boss.phase === 'slam' ? '#ff8b8344' : '#ff8b831c';
      context.strokeStyle = '#ff8b83'; context.lineWidth = 3;
      context.beginPath(); context.arc(target.x, target.y, boss.slamRadius, 0, Math.PI * 2); context.fill(); context.stroke();
      context.strokeStyle = '#ffe2ad'; context.lineWidth = 4;
      context.beginPath(); context.arc(target.x, target.y, Math.max(6, boss.slamRadius * (1 - warning)), 0, Math.PI * 2); context.stroke();
      context.font = '700 12px monospace'; context.textAlign = 'center'; context.fillStyle = '#ffe2ad';
      context.fillText('SLAM · DASH OUT', target.x, target.y + boss.slamRadius + 20);
      if (boss.slamFlash > 0) {
        context.strokeStyle = '#ffcf8a'; context.lineWidth = 5;
        context.beginPath(); context.arc(target.x, target.y, boss.slamRadius * (1 + (1 - boss.slamFlash) * 0.4), 0, Math.PI * 2); context.stroke();
      }
    }
    const enraged = boss.stage === 2;
    const landing = boss.phase === 'dive' || boss.phase === 'hover';
    const perched = boss.phase === 'grounded' || boss.phase === 'slam';
    context.fillStyle = '#020b0b66';
    context.beginPath(); context.ellipse(x, groundY + 33, perched ? 42 : 32, 9, 0, 0, Math.PI * 2); context.fill();
    if (landing || perched) {
      context.strokeStyle = '#ffcf8a';
      context.lineWidth = 2;
      context.setLineDash([5, 5]);
      context.beginPath(); context.ellipse(x, y + 25, 62, 30, 0, 0, Math.PI * 2); context.stroke();
      context.setLineDash([]);
    }
    if (['flying', 'enraged'].includes(boss.phase) && boss.shotTimer < 0.65) {
      context.save();
      context.translate(x, y); context.rotate(boss.targetAngle ?? 0);
      context.strokeStyle = enraged ? '#ffb36a' : '#ff92bc';
      context.lineWidth = 2;
      context.setLineDash([4, 7]);
      (boss.volleyOffsets ?? [0]).forEach((offset) => {
        context.beginPath();
        context.moveTo(Math.cos(offset) * 46, Math.sin(offset) * 46);
        context.lineTo(Math.cos(offset) * (enraged ? 240 : 170), Math.sin(offset) * (enraged ? 240 : 170));
        context.stroke();
      });
      context.setLineDash([]);
      context.beginPath(); context.arc(0, 0, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - boss.shotTimer / 0.65)); context.stroke();
      context.restore();
    }
    const wing = !perched ? Math.sin((this.animationTime ?? 0) * (landing ? 8 : enraged ? 22 : 16)) * (this.effects?.reducedMotion ? 3 : 12) : -9;
    context.fillStyle = enraged ? '#ffe0c2' : '#efdbfa';
    [-1, 1].forEach((direction) => {
      context.beginPath();
      context.ellipse(x + direction * (perched ? 36 : 47), y - 12, perched ? 18 : 30, 12, direction * (0.4 + wing / 30), 0, Math.PI * 2);
      context.fill();
    });
    context.fillStyle = boss.hitFlash > 0 ? '#fff7fc' : enraged ? '#e67c68' : '#e997b9';
    context.beginPath(); context.ellipse(x, y, 45 + (perched ? 3 : 0), perched ? 30 : 34, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#efb4ce';
    [-1, 1].forEach((direction) => {
      context.beginPath(); context.moveTo(x + direction * 18, y - 26); context.lineTo(x + direction * 34, y - 43); context.lineTo(x + direction * 33, y - 18); context.closePath(); context.fill();
    });
    if (enraged) {
      context.strokeStyle = '#843845';
      context.lineWidth = 4;
      [-1, 1].forEach((direction) => {
        context.beginPath(); context.moveTo(x + direction * 7, y - 10); context.lineTo(x + direction * 23, y - 16); context.stroke();
      });
      if (boss.phaseTransition > 0) {
        context.strokeStyle = '#ffb36a';
        context.lineWidth = 3;
        const radius = this.effects?.reducedMotion ? 65 : 55 + (1 - boss.phaseTransition / 1.2) * 150;
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke();
        context.font = '700 14px monospace'; context.textAlign = 'center';
        context.fillStyle = '#ffe0c2';
        context.fillText('PHASE II · ENRAGED', x, y - 118);
      }
    }
    context.fillStyle = '#f7c3d9';
    context.beginPath(); context.ellipse(x, y + 13, 20, 13, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#703c60';
    [-1, 1].forEach((direction) => {
      context.beginPath(); context.arc(x + direction * 15, y - 7, 4, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.arc(x + direction * 7, y + 13, 3, 0, Math.PI * 2); context.fill();
    });
    context.fillStyle = '#142b36'; context.fillRect(x - 65, y - 68, 130, 7);
    context.fillStyle = '#ff92bc'; context.fillRect(x - 65, y - 68, 130 * boss.health / boss.maxHealth, 7);
    context.fillStyle = '#f7c3d9'; context.font = '700 11px monospace'; context.textAlign = 'center';
    context.fillText(enraged ? 'FLYING PIG · PHASE II' : 'FLYING PIG · PHASE I', x, y - 78);
    boss.towers.forEach((tower, index) => {
      context.fillStyle = tower.health > 0 ? '#91f7e1' : '#465b57';
      context.fillRect(x - 25 + index * 14, y - 99, 9, 6);
    });
    context.font = '9px monospace';
    context.fillStyle = '#09171de6';
    context.fillRect(x - 115, y + 50, 230, 42);
    context.fillStyle = livingTowers ? '#91f7e1' : '#ffcc7a';
    context.fillText(livingTowers ? `TOWERS ${livingTowers}/4 · SHIELDED` : 'ENRAGED · REFLECTIONS HURT IT', x, y + 63);
    context.fillStyle = '#f7c3d9';
    context.fillText(livingTowers ? 'TAP B + AIM · REFLECT AT TOWERS' : 'TIME B · REFLECT / DODGE VOLLEYS', x, y + 75);
    context.fillStyle = '#ffcf8a';
    context.fillText(landing ? 'LOCKED SLAM · DASH OUT OF THE RING' : perched ? 'RECOVERING · AIM YOUR REFLECTION' : enraged ? `${boss.volleyOffsets.length}-SHOT SPREAD · WATCH THE AIM` : 'PATROLLING THE ARENA', x, y + 87);
    context.restore();
  }

  drawInteractionHint(context, player, chest, droppedItem, keys = [], doors = [], effects = {}) {
    // Match E interaction order and reach, including extra chests and enemy loot.
    const candidates = [
      ...(effects.interactables ?? []).filter((entry) => entry.type === 'tip-box').map((entry) => ({ ...entry, text: 'TIP BOX', reach: 85 })),
      ...(effects.interactables ?? []).filter((entry) => entry.type === 'switch').map((entry) => ({ ...entry, text: entry.active ? 'SWITCH ACTIVE' : 'ACTIVATE SWITCH', reach: 70 })),
      ...(effects.interactables ?? []).filter((entry) => entry.type === 'terminal').map((entry) => ({ ...entry, text: entry.offline ? 'TERMINAL OFFLINE' : `TAKE TERMINAL ${entry.number ?? 1} OFFLINE`, reach: 70 })),
      ...keys.map((key) => ({ ...key, text: 'PICK UP KEY', reach: 60 })),
      ...doors.filter((door) => door.lockedColor && (!door.requirement || door.requirement === 'key')).map((door) => ({ x: door.x + door.width / 2, y: door.y + door.height / 2, text: `UNLOCK ${door.lockedColor.toUpperCase()}`, reach: 70 })),
      ...[droppedItem, ...(effects.loot ?? [])].filter(Boolean).map((entry) => ({ ...entry, text: 'PICK UP', reach: 60 })),
      ...[chest, ...(effects.chests ?? [])].filter((entry) => entry?.state === 'closed').map((entry) => ({ ...entry.position, text: 'OPEN CHEST', reach: 70 }))
    ];
    const target = candidates.find((entry) => Math.hypot(player.position.x - entry.x, player.position.y - entry.y) < entry.reach);
    if (!target) return;
    context.save();
    context.translate(target.x, target.y - 48);
    context.fillStyle = '#effff0';
    context.font = '700 10px Space Mono, monospace';
    context.textAlign = 'center';
    context.fillText(`E  ${target.text}`, 0, 0);
    context.restore();
  }

  drawLoading(progress) {
    const context = this.context;
    context.fillStyle = '#071013ee';
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    context.fillStyle = '#8de9db';
    context.font = '700 14px Space Mono, monospace';
    context.fillText('LOADING ROOM', 40, this.canvas.height / 2 - 18);
    context.strokeStyle = '#4e8079';
    context.strokeRect(40, this.canvas.height / 2, 240, 8);
    context.fillStyle = '#d8f36a';
    context.fillRect(40, this.canvas.height / 2, 240 * progress, 8);
  }

  drawRoomOverview(player, chest, droppedItem, enemies = [], xpOrbs = []) {
    const context = this.context;
    const scale = Math.min(this.canvas.width / this.world.width, this.canvas.height / this.world.height) * 0.86;
    context.save();
    context.fillStyle = '#07101355';
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    context.translate((this.canvas.width - this.world.width * scale) / 2, (this.canvas.height - this.world.height * scale) / 2);
    context.scale(scale, scale);
    this.drawWorld(context);
    xpOrbs.forEach((orb) => this.drawExperienceOrb(context, orb));
    enemies.filter((enemy) => enemy.health > 0).forEach((enemy) => this.drawChaser(context, enemy));
    if (droppedItem) this.drawDroppedItem(context, droppedItem);
    if (chest) this.drawChest(context, chest);
    this.drawPlayer(context, player);
    context.restore();
  }
}
