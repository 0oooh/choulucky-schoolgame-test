export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;
export const TILE_SIZE = 20;
export const WORLD_COLS = CANVAS_WIDTH / TILE_SIZE;
export const WORLD_ROWS = CANVAS_HEIGHT / TILE_SIZE;
export const MODES = {
  DAY: 'day',
  NIGHT: 'night',
  ROOM: 'room',
};

export const PLAYER_SPEED = 110;
export const NPC_SPEED = 60;
export const THIEF_SPEED = 70;
export const GUARD_SPEED = 55;

export const HEARING_RINGS = [70, 120, 180, 240];
export const CONVERSATION_RANGE = 80;
export const PRINCIPAL_OFFICE = {
  x: (CANVAS_WIDTH / 2) - 140,
  y: (CANVAS_HEIGHT / 2) - 100,
  width: 280,
  height: 200,
};

export const GEMINI_CONFIG = {
  apiKey: 'AIzaSyChwBbGG8ZdisdoX6xlHCgBgua88kkIGIk',
  model: 'models/gemini-2.5-flash',
};

export const HEARING_NOISE = ['...', '...'];

export const BATTERY_COUNT = 5;

// 카메라 설정
export const CAMERA_ZOOM = 1.8; // 기본 줌 레벨 (1.8 = 180% 확대, 뱀서라이크 스타일)
export const CAMERA_SMOOTHING = 0.12; // 카메라 부드러움 (0~1, 낮을수록 부드러움)
