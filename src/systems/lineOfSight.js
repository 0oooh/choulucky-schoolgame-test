const intersects = (p1, p2, rect) => {
  const lines = [
    { x1: rect.x, y1: rect.y, x2: rect.x + rect.width, y2: rect.y },
    { x1: rect.x, y1: rect.y, x2: rect.x, y2: rect.y + rect.height },
    {
      x1: rect.x + rect.width,
      y1: rect.y,
      x2: rect.x + rect.width,
      y2: rect.y + rect.height,
    },
    {
      x1: rect.x,
      y1: rect.y + rect.height,
      x2: rect.x + rect.width,
      y2: rect.y + rect.height,
    },
  ];
  return lines.some((line) => segmentsIntersect(p1, p2, line));
};

const segmentsIntersect = (p1, p2, p3) => {
  const { x1, y1, x2, y2 } = p3;
  const d = (x, y) => (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  const o1 = Math.sign(d(p1.x, p1.y));
  const o2 = Math.sign(d(p2.x, p2.y));
  if (o1 === o2 && o1 !== 0) return false;
  const e = (x, y) => (x - p1.x) * (p2.y - p1.y) - (y - p1.y) * (p2.x - p1.x);
  const o3 = Math.sign(e(x1, y1));
  const o4 = Math.sign(e(x2, y2));
  if (o3 === o4 && o3 !== 0) return false;
  return true;
};

export const hasLineOfSight = (origin, target, obstacles = []) => {
  for (const rect of obstacles) {
    if (intersects(origin, target, rect)) {
      return false;
    }
  }
  return true;
};
