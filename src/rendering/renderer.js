export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.world = world;
  }

  draw(player, camera, sword = null, chest = null, droppedItem = null, enemies = [], xpOrbs = [], doors = [], keys = []) {
    const context = this.context;
    const { width, height } = this.canvas;
    context.fillStyle = '#0a1718';
    context.fillRect(0, 0, width, height);
    context.save();
    context.translate(-camera.position.x, -camera.position.y);
    this.drawWorld(context);
    this.drawDoors(context, doors);
    keys.forEach((key) => this.drawKey(context, key));
    xpOrbs.forEach((orb) => this.drawExperienceOrb(context, orb));
    enemies.filter((enemy) => enemy.health > 0).forEach((enemy) => this.drawChaser(context, enemy));
    if (droppedItem && !chest) this.drawDroppedItem(context, droppedItem);
    if (chest) this.drawChest(context, chest);
    this.drawInteractionHint(context, player, chest, droppedItem, keys, doors);
    if (sword) this.drawSword(context, player, sword);
    this.drawPlayer(context, player);
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

    this.world.walls.forEach((wall) => {
      context.fillStyle = '#183b39';
      context.fillRect(wall.x, wall.y, wall.width, wall.height);
      context.strokeStyle = '#5b958b';
      context.strokeRect(wall.x, wall.y, wall.width, wall.height);
    });
  }

  drawDoors(context, doors) {
    doors.forEach((door) => {
      const color = door.lockedColor || '#d8f36a';
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(door.x + 1, door.y + 1, door.width - 2, door.height - 2);
      if (door.lockedColor) {
        context.fillStyle = door.lockedColor;
        context.fillRect(door.x + door.width / 2 - 5, door.y + door.height / 2 - 6, 10, 12);
      }
    });
  }

  drawKey(context, key) {
    context.save();
    context.translate(key.x, key.y);
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
    context.globalAlpha = player.invulnerability > 0 && Math.floor(player.invulnerability * 14) % 2 === 0 ? 0.35 : 1;
    context.beginPath();
    context.arc(player.position.x, player.position.y, player.radius, 0, Math.PI * 2);
    context.fillStyle = '#8ddcff';
    context.shadowColor = '#8ddcff';
    context.shadowBlur = 18;
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = 2;
    context.strokeStyle = '#d9f6ff';
    context.stroke();
    context.restore();
  }

  drawExperienceOrb(context, orb) {
    const bob = Math.sin(orb.bob) * 3;
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
    context.save();
    context.globalAlpha = enemy.isStunned && Math.floor(enemy.stunTimer * 12) % 2 === 0 ? 0.45 : 1;
    const enemyColor = enemy.jumpTelegraph > 0 ? '#ff8b3d' : enemy.state === 'spinning' ? '#f4dc58' : '#d94b58';
    context.fillStyle = enemyColor;
    context.shadowColor = enemyColor;
    context.shadowBlur = enemy.jumpTelegraph > 0 || enemy.state === 'spinning' ? 20 : 10;
    context.beginPath();
    context.arc(enemy.position.x, enemy.position.y, enemy.radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
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
    if (enemy.state === 'attacking' || enemy.state === 'spinning') {
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
  }

  drawSword(context, player, sword) {
    context.save();
    const swordAngle = sword.isSwinging ? sword.angle : sword.aimAngle;
    const sideAngle = swordAngle + Math.PI / 2;
    const sideOffset = sword.isSwinging ? 0 : 12;
    context.translate(player.position.x + Math.cos(sideAngle) * sideOffset, player.position.y + Math.sin(sideAngle) * sideOffset);
    context.rotate(swordAngle);
    context.strokeStyle = '#8b5a36';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(18, 0);
    context.stroke();
    context.strokeStyle = '#dcecff';
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(14, 0);
    context.lineTo(58, 0);
    context.stroke();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(20, -2);
    context.lineTo(57, -2);
    context.stroke();
    context.restore();
  }

  drawChest(context, chest) {
    const burst = chest.state === 'burst';
    const opened = chest.state === 'opened';
    const offsetX = chest.shake;
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
    chest.particles.forEach((particle) => { context.fillStyle = particle.size > 5 ? '#d8f36a' : '#f0b35d'; context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size); });
    context.restore();
  }

  drawDroppedItem(context, item) {
    context.save();
    const bob = Math.sin(item.bob) * 6;
    context.translate(item.x, item.y + bob);
    context.fillStyle = '#d8f36a55';
    context.shadowColor = '#d8f36a';
    context.shadowBlur = 18;
    context.beginPath();
    context.ellipse(0, 10, 32, 13, 0, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
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

  drawInteractionHint(context, player, chest, droppedItem, keys = [], doors = []) {
    const nearbyKey = keys.find((key) => Math.hypot(player.position.x - key.x, player.position.y - key.y) < 85);
    const nearbyDoor = doors.find((door) => door.lockedColor && Math.hypot(player.position.x - (door.x + door.width / 2), player.position.y - (door.y + door.height / 2)) < 85);
    const target = chest && chest.state === 'closed' ? chest.position : !chest ? droppedItem ?? nearbyKey ?? nearbyDoor : null;
    if (!target || Math.hypot(player.position.x - target.x, player.position.y - target.y) > 85) return;
    context.save();
    context.translate(target.x, target.y - 48);
    context.fillStyle = '#effff0';
    context.font = '700 10px Space Mono, monospace';
    context.textAlign = 'center';
    const text = droppedItem ? 'PICK UP' : nearbyKey ? 'PICK UP KEY' : nearbyDoor ? `UNLOCK ${nearbyDoor.lockedColor.toUpperCase()}` : 'OPEN';
    context.fillText(`E  ${text}`, 0, 0);
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