import { positionHitsWall } from './collision.js';

export function findPath(start, goal, world) {
  const cellSize = world.gridSize ?? 100;
  const columns = Math.ceil(world.width / cellSize);
  const rows = Math.ceil(world.height / cellSize);
  const toCell = (point) => ({ x: Math.max(0, Math.min(columns - 1, Math.floor(point.x / cellSize))), y: Math.max(0, Math.min(rows - 1, Math.floor(point.y / cellSize))) });
  const startCell = toCell(start);
  const goalCell = toCell(goal);
  const key = (cell) => `${cell.x}:${cell.y}`;
  const queue = [startCell];
  const previous = new Map([[key(startCell), null]]);
  const directions = [{ x:1, y:0 }, { x:-1, y:0 }, { x:0, y:1 }, { x:0, y:-1 }];

  while (queue.length) {
    const current = queue.shift();
    if (current.x === goalCell.x && current.y === goalCell.y) break;
    directions.forEach((direction) => {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (next.x < 0 || next.y < 0 || next.x >= columns || next.y >= rows || previous.has(key(next))) return;
      const center = { x: next.x * cellSize + cellSize / 2, y: next.y * cellSize + cellSize / 2 };
      if (positionHitsWall(center, 18, world.walls)) return;
      previous.set(key(next), current);
      queue.push(next);
    });
  }

  const path = [];
  let cursor = goalCell;
  while (cursor && key(cursor) !== key(startCell)) {
    if (!previous.has(key(cursor))) return [];
    path.unshift({ x: cursor.x * cellSize + cellSize / 2, y: cursor.y * cellSize + cellSize / 2 });
    cursor = previous.get(key(cursor));
  }
  return path;
}
