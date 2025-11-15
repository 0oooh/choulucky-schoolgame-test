import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../core/constants.js';

export class Camera {
  constructor({ target = null, zoom = 1.5, smoothing = 0.15 }) {
    this.target = target; // 추적할 대상 (플레이어)
    this.zoom = zoom; // 현재 확대 레벨
    this.baseZoom = zoom; // 기본 확대 레벨
    this.targetZoom = zoom; // 목표 확대 레벨
    this.zoomSmoothing = 0.08; // 줌 변화 부드러움 (낮을수록 부드러움)
    this.smoothing = smoothing; // 카메라 부드러움 (0~1, 낮을수록 부드러움)
    
    // 카메라의 현재 위치 (월드 좌표)
    this.x = CANVAS_WIDTH / 2;
    this.y = CANVAS_HEIGHT / 2;
    
    // 목표 위치
    this.targetX = this.x;
    this.targetY = this.y;
  }
  
  setTarget(target) {
    this.target = target;
    if (target) {
      // 즉시 타겟 위치로 이동
      this.x = target.position.x;
      this.y = target.position.y;
      this.targetX = this.x;
      this.targetY = this.y;
    }
  }
  
  setZoom(zoom, immediate = false) {
    this.targetZoom = Math.max(0.5, Math.min(3, zoom)); // 0.5배 ~ 3배 제한
    if (immediate) {
      this.zoom = this.targetZoom;
    }
  }
  
  setBaseZoom(zoom) {
    this.baseZoom = zoom;
    this.setZoom(zoom);
  }
  
  // 긴장 모드: 줌 증가
  setTenseMode(enabled) {
    if (enabled) {
      this.setZoom(this.baseZoom + 0.5); // 기본 줌에서 +0.5
    } else {
      this.setZoom(this.baseZoom); // 원래 줌으로 복귀
    }
  }
  
  update(dt) {
    if (!this.target) return;
    
    // 타겟의 현재 위치
    this.targetX = this.target.position.x;
    this.targetY = this.target.position.y;
    
    // 부드럽게 카메라 이동 (lerp)
    this.x += (this.targetX - this.x) * this.smoothing;
    this.y += (this.targetY - this.y) * this.smoothing;
    
    // 부드럽게 줌 전환 (lerp)
    this.zoom += (this.targetZoom - this.zoom) * this.zoomSmoothing;
  }
  
  // 월드 좌표를 스크린 좌표로 변환
  worldToScreen(worldX, worldY) {
    const screenX = (worldX - this.x) * this.zoom + CANVAS_WIDTH / 2;
    const screenY = (worldY - this.y) * this.zoom + CANVAS_HEIGHT / 2;
    return { x: screenX, y: screenY };
  }
  
  // 스크린 좌표를 월드 좌표로 변환
  screenToWorld(screenX, screenY) {
    const worldX = (screenX - CANVAS_WIDTH / 2) / this.zoom + this.x;
    const worldY = (screenY - CANVAS_HEIGHT / 2) / this.zoom + this.y;
    return { x: worldX, y: worldY };
  }
  
  // 렌더링 컨텍스트에 카메라 변환 적용
  applyTransform(ctx) {
    ctx.save();
    // 1. 캔버스 중심으로 이동
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    // 2. 줌 적용
    ctx.scale(this.zoom, this.zoom);
    // 3. 카메라 위치로 이동 (음수로)
    ctx.translate(-this.x, -this.y);
  }
  
  // 카메라 변환 해제
  resetTransform(ctx) {
    ctx.restore();
  }
  
  // 화면에 보이는 영역인지 체크 (컬링용)
  isVisible(x, y, radius = 50) {
    const screenPos = this.worldToScreen(x, y);
    const margin = radius * this.zoom + 100;
    
    return (
      screenPos.x > -margin &&
      screenPos.x < CANVAS_WIDTH + margin &&
      screenPos.y > -margin &&
      screenPos.y < CANVAS_HEIGHT + margin
    );
  }
}

