import { Entity } from './entity.js';
import { THIEF_SPEED } from '../core/constants.js';
import { distance, normalize } from '../core/utils.js';

export class Thief extends Entity {
  constructor({ id = 'thief', x, y }) {
    super({ id, name: 'G', x, y, speed: THIEF_SPEED, radius: 15, color: '#b9243c' });
    this.path = [];
    this.pathIndex = 0;
    this.role = 'thief';
  }

  setPath(nodes) {
    this.path = Array.isArray(nodes) ? nodes.slice() : [];
    this.pathIndex = 0;
  }

  hasPath() {
    return this.path && this.path.length > 0;
  }

  currentTarget() {
    return this.path?.[this.pathIndex] || null;
  }

  update(dt) {
    if (this.path && this.path.length > 0) {
      const target = this.path[this.pathIndex];
      if (!target) {
        this.path = [];
        this.pathIndex = 0;
        this.wanderRandomly(dt);
        super.update(dt);
        if (this.blocked) this.wanderTimer = 0;
        return;
      }
      
      const dist = distance(this.position, target);
      if (dist < 10) {
        if (this.pathIndex >= this.path.length - 1) {
          // 목적지 도착
          this.path = [];
          this.pathIndex = 0;
          this.wanderRandomly(dt);
          super.update(dt);
          if (this.blocked) this.wanderTimer = 0;
          return;
        } else {
          this.pathIndex += 1;
        }
      }
      
      const nextTarget = this.path[this.pathIndex];
      if (nextTarget) {
        const dir = normalize(nextTarget.x - this.position.x, nextTarget.y - this.position.y);
        this.velocity.x = dir.x * this.speed * 0.65;
        this.velocity.y = dir.y * this.speed * 0.65;
      } else {
        this.wanderRandomly(dt);
      }
      
      super.update(dt);
      
      // 경로를 따라가는 중에 벽에 막히면 경로 클리어하고 배회 모드
      if (this.blocked && this.lastDisplacement < 0.1) {
        this.path = [];
        this.pathIndex = 0;
        this.wanderTimer = 0;
      }
    } else {
      // 경로가 없으면 랜덤 배회
      this.wanderRandomly(dt);
      super.update(dt);
      if (this.blocked) this.wanderTimer = 0;
    }
  }

  wanderRandomly(dt) {
    // 랜덤 방향 변경 타이머
    if (!this.wanderTimer) this.wanderTimer = 0;
    this.wanderTimer -= dt;
    
    if (this.wanderTimer <= 0 || (this.velocity.x === 0 && this.velocity.y === 0)) {
      // 4방향 중 walkable한 방향 찾기
      const directions = [
        { x: 1, y: 0 },   // 오른쪽
        { x: -1, y: 0 },  // 왼쪽
        { x: 0, y: 1 },   // 아래
        { x: 0, y: -1 },  // 위
      ];
      
      // 랜덤하게 섞기
      for (let i = directions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [directions[i], directions[j]] = [directions[j], directions[i]];
      }
      
      // walkable한 첫 번째 방향 선택
      for (const dir of directions) {
        const testX = this.position.x + dir.x * 30;
        const testY = this.position.y + dir.y * 30;
        if (this.walkChecker && this.walkChecker(testX, testY, this.radius)) {
          this.velocity.x = dir.x * this.speed * 0.6;
          this.velocity.y = dir.y * this.speed * 0.6;
          this.wanderTimer = 0.5 + Math.random() * 1.5;
          return;
        }
      }
      
      // 모든 방향이 막혔으면 제자리
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.wanderTimer = 0.5;
    }
  }
}
