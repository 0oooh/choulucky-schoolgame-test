import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../core/constants.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const circleIntersectsRect = (x, y, radius, rect) => {
  const closestX = clamp(x, rect.x, rect.x + rect.width);
  const closestY = clamp(y, rect.y, rect.y + rect.height);
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy < radius * radius;
};

const pointInRect = (point, rect) =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;

export class ChorokiRoomMap {
  constructor() {
    const roomWidth = 640;
    const roomHeight = 420;
    this.wallThickness = 28;
    this.roomRect = {
      x: (CANVAS_WIDTH - roomWidth) / 2,
      y: (CANVAS_HEIGHT - roomHeight) / 2,
      width: roomWidth,
      height: roomHeight,
    };
    
    this.floorRect = {
      x: this.roomRect.x + this.wallThickness,
      y: this.roomRect.y + this.wallThickness,
      width: this.roomRect.width - this.wallThickness * 2,
      height: this.roomRect.height - this.wallThickness * 2,
    };
    
    this.bedRect = {
      x: this.floorRect.x + this.floorRect.width - 180,
      y: this.floorRect.y + 60,
      width: 150,
      height: 90,
    };
    
    this.bedPillowRect = {
      x: this.bedRect.x + 10,
      y: this.bedRect.y + 10,
      width: this.bedRect.width - 40,
      height: 30,
    };
    
    this.exitRect = {
      x: this.floorRect.x + this.floorRect.width / 2 - 90,
      y: this.floorRect.y + this.floorRect.height - 24,
      width: 180,
      height: 18,
    };
    
    this.tableRect = {
      x: this.floorRect.x + 40,
      y: this.floorRect.y + 60,
      width: 140,
      height: 80,
    };
    
    this.spawnPoint = {
      x: this.floorRect.x + this.floorRect.width / 2 - 60,
      y: this.floorRect.y + this.floorRect.height / 2,
    };
    
    this.decor = [
      this.bedRect,
      this.tableRect,
    ];
    
    this.obstacles = [
      this.bedRect,
      this.tableRect,
    ];
    
    this.isMorningState = false;
  }
  
  getPlayerSpawn() {
    return { ...this.spawnPoint };
  }
  
  isMorning() {
    return this.isMorningState;
  }
  
  isWalkableCircle(point, radius) {
    const inner = {
      x: this.floorRect.x + radius,
      y: this.floorRect.y + radius,
      width: this.floorRect.width - radius * 2,
      height: this.floorRect.height - radius * 2,
    };
    
    const insideRoom =
      point.x >= inner.x &&
      point.x <= inner.x + inner.width &&
      point.y >= inner.y &&
      point.y <= inner.y + inner.height;
    
    if (!insideRoom) return false;
    
    return !this.decor.some((rect) => circleIntersectsRect(point.x, point.y, radius, rect));
  }
  
  isNearBed(point) {
    const expanded = {
      x: this.bedRect.x - 30,
      y: this.bedRect.y - 30,
      width: this.bedRect.width + 60,
      height: this.bedRect.height + 60,
    };
    return pointInRect(point, expanded);
  }
  
  isNearExit(point) {
    const expanded = {
      x: this.exitRect.x - 40,
      y: this.exitRect.y - 40,
      width: this.exitRect.width + 80,
      height: this.exitRect.height + 80,
    };
    return pointInRect(point, expanded);
  }
  
  setMorning(enabled = true) {
    this.isMorningState = enabled;
  }
  
  render(ctx) {
    const wallColor = this.isMorningState ? '#f6eadc' : '#16141d';
    const floorGradientTop = this.isMorningState ? '#f5d3a5' : '#2d2b3b';
    const floorGradientBottom = this.isMorningState ? '#f0bc7b' : '#242130';
    const bedMainColor = this.isMorningState ? '#f8f0ff' : '#b9b1ff';
    const bedAccentColor = this.isMorningState ? '#f2c4d4' : '#a28ef5';
    const tableColor = this.isMorningState ? '#f3e0cf' : '#3d334f';
    const tableInsetColor = this.isMorningState ? '#d4c1b0' : '#1d1a27';
    const exitTextColor = this.isMorningState ? '#6a4b2e' : '#f5f1ff';
    const exitFill = this.isMorningState ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)';

    // 방 전체 배경 (벽)
    ctx.save();
    ctx.fillStyle = wallColor;
    ctx.fillRect(this.roomRect.x, this.roomRect.y, this.roomRect.width, this.roomRect.height);
    
    // 바닥
    const gradient = ctx.createLinearGradient(this.floorRect.x, this.floorRect.y, this.floorRect.x, this.floorRect.y + this.floorRect.height);
    gradient.addColorStop(0, floorGradientTop);
    gradient.addColorStop(1, floorGradientBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(this.floorRect.x, this.floorRect.y, this.floorRect.width, this.floorRect.height);
    
    // 벽선
    ctx.strokeStyle = this.isMorningState ? '#e3c9ad' : '#3b3750';
    ctx.lineWidth = this.wallThickness;
    ctx.strokeRect(
      this.floorRect.x - this.wallThickness / 2,
      this.floorRect.y - this.wallThickness / 2,
      this.floorRect.width + this.wallThickness,
      this.floorRect.height + this.wallThickness,
    );
    
    // 침대
    ctx.fillStyle = bedMainColor;
    ctx.fillRect(this.bedRect.x, this.bedRect.y, this.bedRect.width, this.bedRect.height);
    ctx.fillStyle = this.isMorningState ? '#fffdf8' : '#f6f5ff';
    ctx.fillRect(this.bedPillowRect.x, this.bedPillowRect.y, this.bedPillowRect.width, this.bedPillowRect.height);
    ctx.fillStyle = bedAccentColor;
    ctx.fillRect(this.bedRect.x, this.bedRect.y + this.bedRect.height - 24, this.bedRect.width, 24);
    
    // 탁자 + 노트북
    ctx.fillStyle = tableColor;
    ctx.fillRect(this.tableRect.x, this.tableRect.y, this.tableRect.width, this.tableRect.height);
    ctx.fillStyle = tableInsetColor;
    ctx.fillRect(this.tableRect.x + 20, this.tableRect.y + 20, this.tableRect.width - 40, this.tableRect.height - 40);
    
    // 출구 표시
    ctx.fillStyle = exitFill;
    ctx.fillRect(this.exitRect.x, this.exitRect.y, this.exitRect.width, this.exitRect.height);
    ctx.fillStyle = exitTextColor;
    ctx.font = '600 20px Pretendard';
    ctx.textAlign = 'center';
    ctx.fillText('출구', this.exitRect.x + this.exitRect.width / 2, this.exitRect.y - 12);
    
    ctx.restore();
  }
}

