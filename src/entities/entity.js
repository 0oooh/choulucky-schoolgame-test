import { clamp } from '../core/utils.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../core/constants.js';

export class Entity {
  constructor({ id, name, x, y, speed = 50, radius = 12, color = '#fff' }) {
    this.id = id;
    this.name = name;
    this.position = { x, y };
    this.speed = speed;
    this.radius = radius;
    this.color = color;
    this.velocity = { x: 0, y: 0 };
    this.affinity = 0;
    this.visible = true;
    this.direction = 'down';
    this.sprite = null;
    this.markerColor = color;
    this.walkChecker = null;
    this.prevPosition = { x, y };
    this.lastDisplacement = 0;
  }

  update(dt) {
    const movingHoriz = Math.abs(this.velocity.x) > 0.1;
    const movingVert = Math.abs(this.velocity.y) > 0.1;
    const prevX = this.prevPosition.x;
    const prevY = this.prevPosition.y;
    
    if (movingHoriz || movingVert) {
      if (Math.abs(this.velocity.x) > Math.abs(this.velocity.y)) {
        this.direction = this.velocity.x > 0 ? 'right' : 'left';
      } else {
        this.direction = this.velocity.y > 0 ? 'down' : 'up';
      }
    }
    
    this.prevPosition.x = this.position.x;
    this.prevPosition.y = this.position.y;
    
    const nextX = clamp(this.position.x + this.velocity.x * dt, 20, CANVAS_WIDTH - 20);
    const nextY = clamp(this.position.y + this.velocity.y * dt, 20, CANVAS_HEIGHT - 20);
    
    let blockedX = false;
    let blockedY = false;
    
    // X축 이동 시도
    if (!this.walkChecker || this.walkChecker(nextX, this.position.y, this.radius)) {
      this.position.x = nextX;
    } else {
      blockedX = true;
      this.velocity.x = 0; // 벽에 막히면 즉시 속도 0
    }
    
    // Y축 이동 시도
    if (!this.walkChecker || this.walkChecker(this.position.x, nextY, this.radius)) {
      this.position.y = nextY;
    } else {
      blockedY = true;
      this.velocity.y = 0; // 벽에 막히면 즉시 속도 0
    }
    
    // 벽 충돌 플래그 저장
    this.blocked = blockedX || blockedY;
    
    this.sprite?.update(dt, movingHoriz || movingVert);
    this.lastDisplacement = Math.hypot(this.position.x - prevX, this.position.y - prevY);
  }

  draw(ctx, mode = 'day') {
    if (!this.visible) return;
    ctx.save();
    ctx.fillStyle = this.markerColor || this.color;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(this.position.x, this.position.y - 6, this.radius + 6, this.radius / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (this.sprite) {
      this.sprite.draw(ctx, this.position, this.direction);
    } else {
      ctx.save();
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = mode === 'day' ? '#111' : '#fdf2f2';
      ctx.stroke();
      ctx.restore();
    }
  }
}
