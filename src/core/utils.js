export const rand = (min, max) => Math.random() * (max - min) + min;
export const randInt = (min, max) => Math.floor(rand(min, max));
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const distanceXY = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
export const lerp = (a, b, t) => a + (b - a) * t;

export const pointInRect = (point, rect) =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;

export const chance = (p) => Math.random() < p;

export const guid = (() => {
  let i = 0;
  return () => `id-${++i}`;
})();

export const degToRad = (deg) => (deg * Math.PI) / 180;

export const radToDeg = (rad) => (rad * 180) / Math.PI;

export const normalize = (x, y) => {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
};

export const wrapIndex = (index, length) => {
  if (length === 0) return 0;
  return ((index % length) + length) % length;
};

export const pickRandom = (arr) => arr[randInt(0, arr.length)];
