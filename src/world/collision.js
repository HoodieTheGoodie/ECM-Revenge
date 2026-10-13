function circleTouchesRect(circle, rectangle) {
  const closestX = Math.max(rectangle.x, Math.min(circle.x, rectangle.x + rectangle.width));
  const closestY = Math.max(rectangle.y, Math.min(circle.y, rectangle.y + rectangle.height));
  const distanceX = circle.x - closestX;
  const distanceY = circle.y - closestY;
  return distanceX * distanceX + distanceY * distanceY < circle.radius * circle.radius;
}

export function carveOpenings(walls, openings = []) {
  return walls.flatMap((wall) => openings.reduce((pieces, opening) => pieces.flatMap((piece) => subtractOpening(piece, opening)), [wall]));
}

function subtractOpening(wall, opening) {
  const left = Math.max(wall.x, opening.x);
  const right = Math.min(wall.x + wall.width, opening.x + opening.width);
  const top = Math.max(wall.y, opening.y);
  const bottom = Math.min(wall.y + wall.height, opening.y + opening.height);
  if (left >= right || top >= bottom) return [wall];
  const pieces = [];
  if (top > wall.y) pieces.push({ x: wall.x, y: wall.y, width: wall.width, height: top - wall.y });
  if (bottom < wall.y + wall.height) pieces.push({ x: wall.x, y: bottom, width: wall.width, height: wall.y + wall.height - bottom });
  if (left > wall.x) pieces.push({ x: wall.x, y: top, width: left - wall.x, height: bottom - top });
  if (right < wall.x + wall.width) pieces.push({ x: right, y: top, width: wall.x + wall.width - right, height: bottom - top });
  return pieces;
}

export function positionHitsWall(position, radius, walls) {
  const circle = { x: position.x, y: position.y, radius };
  return walls.some((wall) => circleTouchesRect(circle, wall));
}