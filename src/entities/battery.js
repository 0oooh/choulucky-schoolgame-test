import { Entity } from './entity.js';

export class Battery extends Entity {
  constructor({ id, x, y }) {
    super({ id, name: '배터리', x, y, speed: 0, radius: 10, color: '#6df36f' });
    this.collected = false;
  }

  draw(ctx) {
    if (this.collected) return;
    ctx.save();
    
    // 밤에 더 밝게 빛나는 효과 추가
    ctx.shadowColor = '#6df36f';
    ctx.shadowBlur = 15;
    
    ctx.fillStyle = '#8fff91'; // 더 밝은 초록색
    ctx.strokeStyle = '#2a5a2c'; // 더 밝은 테두리
    ctx.lineWidth = 2;
    ctx.fillRect(this.position.x - 10, this.position.y - 16, 20, 32);
    ctx.strokeRect(this.position.x - 10, this.position.y - 16, 20, 32);
    ctx.fillStyle = '#2a5a2c';
    ctx.fillRect(this.position.x - 4, this.position.y - 22, 8, 6);
    ctx.restore();
  }
}
