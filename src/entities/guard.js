import { Entity } from './entity.js';
import { GUARD_SPEED } from '../core/constants.js';
import { distance, normalize } from '../core/utils.js';

export class Guard extends Entity {
  constructor({ id = 'guard', x, y }) {
    super({ id, name: 'H', x, y, speed: GUARD_SPEED, radius: 16, color: '#f5f1ff' });
    this.path = [];
    this.pathIndex = 0;
    this.orientation = { x: 1, y: 0 };
    this.fovAngle = 120;
    this.fovRange = 160;
    this.investigating = false;
    this.role = 'guard';
    this.scanning = false;
    this.scanTimer = 0;
    this.scanRotation = 0;
    this.blockedCount = 0; // 연속으로 막힌 횟수
    this.stuckTimer = 0;   // 같은 위치에 머문 시간
    this.lastPosition = { x, y };
    this.baseSpeed = GUARD_SPEED; // 기본 속도 저장
  }

  setPatrolPath(nodes) {
    if (!nodes || nodes.length === 0) {
      console.warn('Guard received empty patrol path');
      this.patrolPath = [];
      this.path = [];
      this.pathIndex = 0;
      this.investigating = false;
      this.speed = this.baseSpeed; // 순찰 모드로 복귀 시 속도 복원
      return;
    }
    this.patrolPath = nodes;
    this.path = nodes.slice();
    this.pathIndex = 0;
    this.investigating = false;
    this.speed = this.baseSpeed; // 순찰 모드로 복귀 시 속도 복원
    // 순찰 경로 시작 시 blocked 상태 리셋
    this.blockedCount = 0;
    this.stuckTimer = 0;
    this.blocked = false;
    console.log(`Guard patrol path set: ${nodes.length} waypoints`);
  }

  followPath(path, investigating = false) {
    if (!path || path.length === 0) return;
    // 조사 중이면 스캔 중단
    this.scanning = false;
    this.scanTimer = 0;
    // A* 경로는 단순 이동 노드들로 구성
    this.path = path.map(node => ({ ...node, action: 'move' }));
    this.pathIndex = 0;
    this.investigating = investigating;
    
    // 조사 모드일 때 속도 2배 증가
    if (investigating) {
      this.speed = this.baseSpeed * 2;
      console.log(`🚨 Guard investigating: speed increased to ${this.speed.toFixed(1)}`);
    } else {
      this.speed = this.baseSpeed;
    }
    
    // 새 경로 시작 시 blocked 상태 리셋
    this.blockedCount = 0;
    this.stuckTimer = 0;
    this.blocked = false;
  }

  hasPath() {
    return this.path && this.path.length > 0;
  }

  currentTarget() {
    return this.path?.[this.pathIndex] || null;
  }

  update(dt) {
    // 스캔 중이면 제자리에서 회전만
    if (this.scanning) {
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.scanTimer -= dt;
      this.scanRotation += dt * Math.PI; // 초당 180도 회전
      
      // 회전 방향 업데이트
      this.orientation = {
        x: Math.cos(this.scanRotation),
        y: Math.sin(this.scanRotation),
      };
      
      if (this.scanTimer <= 0) {
        this.scanning = false;
        this.scanRotation = 0;
        // 스캔 완료 시 blocked 카운터 리셋
        this.blockedCount = 0;
        this.stuckTimer = 0;
        // 다음 웨이포인트로
        if (this.pathIndex < this.path.length - 1) {
          this.pathIndex += 1;
        } else {
          // 순찰 루프
          this.pathIndex = 0;
        }
      }
      super.update(dt);
      return;
    }
    
    // 경로가 없으면 정지
    if (!this.path || this.path.length === 0) {
      this.velocity.x = 0;
      this.velocity.y = 0;
      super.update(dt);
      return;
    }
    
    const target = this.path[this.pathIndex];
    if (!target) {
      this.velocity.x = 0;
      this.velocity.y = 0;
      super.update(dt);
      return;
    }
    
    // 이동 거리 체크 (stuck 감지)
    const moved = distance(this.position, this.lastPosition);
    this.lastPosition = { x: this.position.x, y: this.position.y };
    
    // 벽에 막혔는지 체크
    if (this.blocked) {
      this.blockedCount++;
      this.stuckTimer += dt;
      
      // 조사 모드일 때는 절대 포기하지 않음!
      if (this.investigating) {
        // 웨이포인트 건너뛰기만 (이벤트는 유지)
        if (this.blockedCount >= 5 || this.stuckTimer > 1.5) {
          if (this.pathIndex < this.path.length - 1) {
            const currentTarget = this.path[this.pathIndex];
            const nextTarget = this.path[this.pathIndex + 1];
            console.warn(`🚫 STUCK: Waypoint ${this.pathIndex + 1}/${this.path.length} unreachable!`);
            console.warn(`   From: (${Math.round(this.position.x)}, ${Math.round(this.position.y)})`);
            console.warn(`   To: (${Math.round(currentTarget.x)}, ${Math.round(currentTarget.y)}) [${currentTarget.debug || 'unknown'}]`);
            console.warn(`   Next: (${Math.round(nextTarget.x)}, ${Math.round(nextTarget.y)}) [${nextTarget.debug || 'unknown'}]`);
            console.warn(`   Distance to target: ${Math.round(dist)}px`);
            console.warn(`   Skipping to waypoint ${this.pathIndex + 2}/${this.path.length}`);
            this.pathIndex += 1;
            this.blockedCount = 0;
            this.stuckTimer = 0;
          }
        }
        this.blocked = false;
      } else {
        // 순찰 모드일 때만 경로 리셋 허용
        if (this.blockedCount >= 3 || this.stuckTimer > 1.0) {
          if (this.pathIndex < this.path.length - 1) {
            this.pathIndex += 1;
            this.blockedCount = 0;
            this.stuckTimer = 0;
            this.blocked = false;
          } else {
            // 순찰 경로 루프
            this.pathIndex = 0;
            this.blockedCount = 0;
            this.stuckTimer = 0;
            this.blocked = false;
          }
        } else {
          this.blocked = false;
        }
      }
    } else {
      // 움직이고 있으면 카운터 리셋
      if (moved > 1) {
        this.blockedCount = 0;
        this.stuckTimer = 0;
      }
    }
    
    const dist = distance(this.position, target);
    
    // 목표 지점에 도착 (조사 모드에서는 더 먼 거리에서도 도착으로 인정)
    const arrivalThreshold = this.investigating ? 15 : 10;
    if (dist < arrivalThreshold) {
      // 웨이포인트 도착 시 blocked 카운터 리셋
      this.blockedCount = 0;
      this.stuckTimer = 0;
      
      // 디버깅: 웨이포인트 도착 로그
      if (this.investigating) {
        const debugInfo = target.debug ? ` [${target.debug}]` : '';
        console.log(`✅ Guard reached waypoint ${this.pathIndex + 1}/${this.path.length} at (${Math.round(this.position.x)}, ${Math.round(this.position.y)})${debugInfo}`);
      }
      
      // scan 액션이면 스캔 시작
      if (target.action === 'scan') {
        this.scanning = true;
        this.scanTimer = target.duration || 2.0;
        this.scanRotation = Math.atan2(this.orientation.y, this.orientation.x);
      } else {
        // 일반 이동이면 다음 웨이포인트로
        if (this.pathIndex >= this.path.length - 1) {
          // 경로 끝에 도달
          // 조사 모드일 때는 제자리에서 대기 (main.js의 안전 장치가 처리)
          // 순찰 모드일 때만 루프
          if (!this.investigating) {
            this.pathIndex = 0;
          }
        } else {
          this.pathIndex += 1;
        }
      }
    }
    
    // 다음 목표로 이동
    const nextTarget = this.path[this.pathIndex];
    if (nextTarget && !this.scanning) {
      const dir = normalize(nextTarget.x - this.position.x, nextTarget.y - this.position.y);
      this.velocity.x = dir.x * this.speed;
      this.velocity.y = dir.y * this.speed;
      this.orientation = dir;
    } else if (!this.scanning) {
      this.velocity.x = 0;
      this.velocity.y = 0;
    }
    
    super.update(dt);
  }

  isPointInCone(point) {
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;
    const distanceToPoint = Math.hypot(dx, dy);
    if (distanceToPoint > this.fovRange) return false;
    const dot = dx * this.orientation.x + dy * this.orientation.y;
    const cosAngle = dot / (distanceToPoint || 1);
    const angle = (Math.acos(Math.min(Math.max(cosAngle, -1), 1)) * 180) / Math.PI;
    return angle <= this.fovAngle / 2;
  }
}
