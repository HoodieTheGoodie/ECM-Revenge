import { positionHitsWall } from './collision.js';

// Both route planning and motion use the actor's footprint, including door openings.
export function hasClearPath(from, to, world, radius = 0) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(4, Math.min(12, radius || 8))));
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    if (point.x < radius || point.y < radius || point.x > world.width - radius || point.y > world.height - radius || positionHitsWall(point, radius, world.walls, world.openings)) return false;
  }
  return true;
}

export function findPath(start, goal, world, radius = 17) {
  if (hasClearPath(start, goal, world, radius)) return [{ ...goal }];
  const cellSize = Math.min(40, world.gridSize ?? 40);
  const columns = Math.ceil(world.width / cellSize);
  const rows = Math.ceil(world.height / cellSize);
  const key = (cell) => cell.y * columns + cell.x;
  const center = (cell) => ({ x: Math.min(world.width - radius, cell.x * cellSize + cellSize / 2), y: Math.min(world.height - radius, cell.y * cellSize + cellSize / 2) });
  const toCell = (point) => ({ x: Math.max(0, Math.min(columns - 1, Math.floor(point.x / cellSize))), y: Math.max(0, Math.min(rows - 1, Math.floor(point.y / cellSize))) });
  const startCell = toCell(start);
  const goalCell = toCell(goal);
  const nodes = new Map();
  const open = [];
  // An off-center spawn can connect to any nearby reachable grid center.
  for (let y = -1; y <= 1; y += 1) for (let x = -1; x <= 1; x += 1) {
    const cell = { x: startCell.x + x, y: startCell.y + y };
    if (cell.x < 0 || cell.y < 0 || cell.x >= columns || cell.y >= rows) continue;
    const point = center(cell);
    if (!hasClearPath(start, point, world, radius)) continue;
    const node = { ...cell, g: Math.hypot(point.x - start.x, point.y - start.y) / cellSize, previous: null };
    node.f = node.g + Math.hypot(goalCell.x - cell.x, goalCell.y - cell.y);
    nodes.set(key(node), node); open.push(node);
  }
  const closed = new Set();
  let reached = null;
  while (open.length) {
    let bestIndex = 0;
    for (let index = 1; index < open.length; index += 1) if (open[index].f < open[bestIndex].f) bestIndex = index;
    const current = open.splice(bestIndex, 1)[0];
    if (closed.has(key(current))) continue;
    closed.add(key(current));
    const from = center(current);
    if (Math.hypot(from.x - goal.x, from.y - goal.y) <= cellSize * 1.5 && hasClearPath(from, goal, world, radius)) { reached = current; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (next.x < 0 || next.y < 0 || next.x >= columns || next.y >= rows || closed.has(key(next))) continue;
      if (!hasClearPath(from, center(next), world, radius)) continue;
      const g = current.g + Math.hypot(dx, dy);
      if (nodes.has(key(next)) && nodes.get(key(next)).g <= g) continue;
      const node = { ...next, g, f: g + Math.hypot(goalCell.x - next.x, goalCell.y - next.y), previous: current };
      nodes.set(key(next), node); open.push(node);
    }
  }
  if (!reached) return [];
  const path = [{ ...goal }];
  for (let cursor = reached; cursor; cursor = cursor.previous) path.unshift(center(cursor));
  // Skip intermediate cells only when the entire body can safely follow the shortcut.
  const smoothed = [];
  let anchor = start;
  for (let index = 0; index < path.length;) {
    let farthest = index;
    for (let next = index + 1; next < path.length; next += 1) {
      if (!hasClearPath(anchor, path[next], world, radius)) break;
      farthest = next;
    }
    smoothed.push(path[farthest]); anchor = path[farthest]; index = farthest + 1;
  }
  return smoothed;
}
