import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../core/constants.js';
import { degToRad } from '../core/utils.js';

const RAY_STEPS = 90;
const EPSILON = 0.0004;

const rectCorners = (rect) => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.width, y: rect.y },
  { x: rect.x + rect.width, y: rect.y + rect.height },
  { x: rect.x, y: rect.y + rect.height },
];

const sliceAngles = (start, end, steps) => {
  const list = [];
  for (let i = 0; i <= steps; i += 1) {
    const ratio = i / steps;
    list.push(start + (end - start) * ratio);
  }
  return list;
};

const angleWithin = (angle, start, end) => angle >= start - EPSILON && angle <= end + EPSILON;

const rayRectIntersection = (origin, dir, rect, maxDist) => {
  let tMin = 0;
  let tMax = maxDist;
  const axisCheck = (axis, minBound, maxBound) => {
    const o = origin[axis];
    const d = dir[axis];
    if (Math.abs(d) < 1e-6) {
      return o >= minBound && o <= maxBound;
    }
    let t1 = (minBound - o) / d;
    let t2 = (maxBound - o) / d;
    if (t1 > t2) {
      const temp = t1;
      t1 = t2;
      t2 = temp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    return tMax >= tMin;
  };

  if (!axisCheck('x', rect.x, rect.x + rect.width)) return null;
  if (!axisCheck('y', rect.y, rect.y + rect.height)) return null;

  if (tMax < 0) return null;
  const hit = tMin >= 0 ? tMin : tMax;
  if (hit < 0 || hit > maxDist) return null;
  return hit;
};

const castRay = (origin, angle, range, obstacles) => {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  let nearest = range;
  obstacles.forEach((rect) => {
    const dist = rayRectIntersection(origin, dir, rect, range);
    if (dist !== null && dist < nearest) {
      nearest = dist;
    }
  });
  return {
    x: origin.x + dir.x * nearest,
    y: origin.y + dir.y * nearest,
    distance: nearest,
    angle,
  };
};

const buildAngles = (guard, start, end, obstacles) => {
  const angles = sliceAngles(start, end, RAY_STEPS);
  obstacles.forEach((rect) => {
    rectCorners(rect).forEach((corner) => {
      const angle = Math.atan2(corner.y - guard.position.y, corner.x - guard.position.x);
      if (angleWithin(angle, start, end)) {
        angles.push(angle - EPSILON, angle, angle + EPSILON);
      }
    });
  });
  const unique = [];
  const seen = new Set();
  angles.forEach((angle) => {
    const clamped = Math.max(start, Math.min(end, angle));
    const key = clamped.toFixed(5);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(clamped);
    }
  });
  unique.sort((a, b) => a - b);
  return unique;
};

const buildFovPolygon = (guard, obstacles) => {
  const baseAngle = Math.atan2(guard.orientation.y, guard.orientation.x);
  const spread = degToRad(guard.fovAngle);
  const start = baseAngle - spread / 2;
  const end = baseAngle + spread / 2;
  const angles = buildAngles(guard, start, end, obstacles);
  return angles.map((angle) => castRay(guard.position, angle, guard.fovRange, obstacles));
};

const drawPolygon = (ctx, guard, points) => {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(guard.position.x, guard.position.y);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
};

export function renderNightLighting(ctx, guard, obstacles = [], dayTexture = null) {
  const polygon = guard ? buildFovPolygon(guard, obstacles) : [];

  if (polygon.length > 1 && dayTexture) {
    ctx.save();
    drawPolygon(ctx, guard, polygon);
    ctx.clip();
    ctx.drawImage(dayTexture, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const gradient = ctx.createRadialGradient(
      guard.position.x,
      guard.position.y,
      20,
      guard.position.x,
      guard.position.y,
      guard.fovRange
    );
    gradient.addColorStop(0, 'rgba(255,255,255,0.18)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.08)');
    gradient.addColorStop(1, 'rgba(255,255,255,0.01)');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(
      guard.position.x - guard.fovRange,
      guard.position.y - guard.fovRange,
      guard.fovRange * 2,
      guard.fovRange * 2
    );
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = 'rgba(3, 5, 15, 0.75)'; // 0.94 → 0.75로 밝게 조정
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (polygon.length > 1) {
    ctx.globalCompositeOperation = 'destination-out';
    drawPolygon(ctx, guard, polygon);
    ctx.fill();
  }
  ctx.restore();

  if (polygon.length > 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawPolygon(ctx, guard, polygon);
    ctx.clip();
    const halo = ctx.createRadialGradient(
      guard.position.x,
      guard.position.y,
      10,
      guard.position.x,
      guard.position.y,
      guard.fovRange * 0.7
    );
    halo.addColorStop(0, 'rgba(255,255,200,0.15)');
    halo.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(
      guard.position.x - guard.fovRange,
      guard.position.y - guard.fovRange,
      guard.fovRange * 2,
      guard.fovRange * 2
    );
    ctx.restore();
  }
}
