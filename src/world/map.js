import { CANVAS_WIDTH, CANVAS_HEIGHT, PRINCIPAL_OFFICE } from '../core/constants.js';
import { rand, randInt } from '../core/utils.js';

const ROOM_COLORS = ['#39415b', '#30374e', '#353c54'];
const CLASSROOMS = [
  { name: '1-B', rect: { x: 60, y: 70, width: 220, height: 130 } },
  { name: '1-C', rect: { x: 360, y: 70, width: 220, height: 130 } },
  { name: '2-A', rect: { x: 660, y: 70, width: 220, height: 130 } },
  { name: '2-B', rect: { x: 960, y: 70, width: 220, height: 130 } },
  { name: '3-A', rect: { x: 60, y: 520, width: 220, height: 150 } },
  { name: '3-B', rect: { x: 360, y: 520, width: 220, height: 150 } },
  { name: '예체능실', rect: { x: 660, y: 520, width: 220, height: 150 } },
  { name: '과학실', rect: { x: 960, y: 520, width: 220, height: 150 } },
];

const HALLWAY_RECT = { x: 40, y: 40, width: CANVAS_WIDTH - 80, height: CANVAS_HEIGHT - 80 };
const CLASSROOM_WALL_STROKE = 3;
const CLASSROOM_WALL_HALF = CLASSROOM_WALL_STROKE / 2;
const OFFICE_WALL_STROKE = 5;
const OFFICE_WALL_HALF = OFFICE_WALL_STROKE / 2;

export class SchoolMap {
  constructor() {
    this.classrooms = CLASSROOMS;
    this.hallwayRect = HALLWAY_RECT;
    this.office = PRINCIPAL_OFFICE;
    this.doors = this.buildDoors();
    this.obstacles = this.createObstacleRects();
    this.guardRoute = this.buildGuardRoute();
    this.navigationGrid = this.buildNavigationGrid();
  }

  createObstacleRects() {
    const walls = [];
    const addRect = (rect) => {
      if (rect.width <= 0 || rect.height <= 0) return;
      walls.push(rect);
    };
    const addHorizontal = (rect) => {
      this.subtractDoors(rect).forEach((segment) => addRect(segment));
    };

    // Office walls (콜라이더를 strokeRect lineWidth와 정확히 일치시킴)
    const officeWallThickness = OFFICE_WALL_STROKE;
    const officeOffset = OFFICE_WALL_HALF;
    addHorizontal({ x: this.office.x, y: this.office.y - officeOffset, width: this.office.width, height: officeWallThickness });
    addHorizontal({
      x: this.office.x,
      y: this.office.y + this.office.height - officeOffset,
      width: this.office.width,
      height: officeWallThickness,
    });
    addRect({ x: this.office.x - officeOffset, y: this.office.y, width: officeWallThickness, height: this.office.height });
    addRect({
      x: this.office.x + this.office.width - officeOffset,
      y: this.office.y,
      width: officeWallThickness,
      height: this.office.height,
    });

    // Classroom walls (콜라이더를 strokeRect lineWidth와 정확히 일치시킴)
    const classroomWallThickness = CLASSROOM_WALL_STROKE;
    const classroomOffset = CLASSROOM_WALL_HALF;
    CLASSROOMS.forEach((room) => {
      addHorizontal({ x: room.rect.x, y: room.rect.y - classroomOffset, width: room.rect.width, height: classroomWallThickness });
      addHorizontal({
        x: room.rect.x,
        y: room.rect.y + room.rect.height - classroomOffset,
        width: room.rect.width,
        height: classroomWallThickness,
      });
      addRect({ x: room.rect.x - classroomOffset, y: room.rect.y, width: classroomWallThickness, height: room.rect.height });
      addRect({
        x: room.rect.x + room.rect.width - classroomOffset,
        y: room.rect.y,
        width: classroomWallThickness,
        height: room.rect.height,
      });
    });

    return walls;
  }

  buildDoors() {
    const doors = [];
    const doorWidth = 90;
    const classroomDoorHeight = CLASSROOM_WALL_STROKE;
    this.classrooms.forEach((room) => {
      const isTopRow = room.rect.y + room.rect.height / 2 < CANVAS_HEIGHT / 2;
      const wallY = isTopRow ? room.rect.y + room.rect.height - CLASSROOM_WALL_HALF : room.rect.y - CLASSROOM_WALL_HALF;
      doors.push({
        x: room.rect.x + room.rect.width / 2 - doorWidth / 2,
        y: wallY,
        width: doorWidth,
        height: classroomDoorHeight,
      });
    });
    const officeDoorWidth = 140;
    const officeDoorHeight = OFFICE_WALL_STROKE;
    doors.push({
      x: this.office.x + this.office.width / 2 - officeDoorWidth / 2,
      y: this.office.y - OFFICE_WALL_HALF,
      width: officeDoorWidth,
      height: officeDoorHeight,
    });
    doors.push({
      x: this.office.x + this.office.width / 2 - officeDoorWidth / 2,
      y: this.office.y + this.office.height - OFFICE_WALL_HALF,
      width: officeDoorWidth,
      height: officeDoorHeight,
    });
    return doors;
  }

  subtractDoors(rect) {
    if (!this.doors?.length) return [rect];
    const overlaps = this.doors
      .filter(
        (door) =>
          door.y < rect.y + rect.height &&
          door.y + door.height > rect.y &&
          door.x < rect.x + rect.width &&
          door.x + door.width > rect.x
      )
      .sort((a, b) => a.x - b.x);
    if (!overlaps.length) return [rect];
    const pieces = [];
    let cursor = rect.x;
    const limit = rect.x + rect.width;
    overlaps.forEach((door) => {
      const start = Math.max(door.x, rect.x);
      const end = Math.min(door.x + door.width, limit);
      if (end <= rect.x || start >= limit) return;
      if (start > cursor) {
        pieces.push({ x: cursor, y: rect.y, width: start - cursor, height: rect.height });
      }
      cursor = Math.max(cursor, end);
    });
    if (cursor < limit) {
      pieces.push({ x: cursor, y: rect.y, width: limit - cursor, height: rect.height });
    }
    return pieces.filter((piece) => piece.width > 0.5 && piece.height > 0.5);
  }

  buildNavigationGrid() {
    const guardRadius = 16;
    const gridNodes = [];
    
    // 복도 중앙 Y 좌표 (유일한 가로선)
    const hallwayY_center = this.hallwayRect.y + this.hallwayRect.height / 2;
    // 교장실 벽 모서리에서 일정 거리까지만 확장해서 위험한 대각선만 차단 (과도하게 확장하면 상/하 복도가 단절됨)
    const officeClearance = guardRadius + 10; // 살짝 더 확장해서 북측 복도를 지나는 경로를 안전하게 확보
    const expandedOfficeRect = {
      x: this.office.x - officeClearance,
      y: this.office.y - officeClearance,
      width: this.office.width + officeClearance * 2,
      height: this.office.height + officeClearance * 2,
    };
    
    // 1. 상단 교실들 (4개) - 각 교실마다 문 앞 + 교실 사이 골목
    const topRooms = this.classrooms.slice(0, 4);
    
    topRooms.forEach((room, index) => {
      const roomCenterX = room.rect.x + room.rect.width / 2;
      const doorY = room.rect.y + room.rect.height + 35; // 문 아래 복도
      
      // 교실 문 앞 노드 (복도)
      if (this.isWalkableCircle({ x: roomCenterX, y: doorY }, guardRadius)) {
        gridNodes.push({ x: roomCenterX, y: doorY, type: 'door', room: room.name });
      }
      
      // 교실 문 앞과 복도 중앙 사이 (수직선 중간 지점)
      const midY = (doorY + hallwayY_center) / 2;
      if (this.isWalkableCircle({ x: roomCenterX, y: midY }, guardRadius)) {
        gridNodes.push({ x: roomCenterX, y: midY, type: 'hallway', room: `${room.name}-mid` });
      }
      
      // 복도 중앙 노드 (가로선 위)
      if (this.isWalkableCircle({ x: roomCenterX, y: hallwayY_center }, guardRadius)) {
        gridNodes.push({ x: roomCenterX, y: hallwayY_center, type: 'hallway-center', room: `${room.name}-center` });
      }
      
      // 교실 사이 골목 노드 (마지막 교실 제외)
      if (index < topRooms.length - 1) {
        const nextRoom = topRooms[index + 1];
        const alleyX = (room.rect.x + room.rect.width + nextRoom.rect.x) / 2;
        
        // 골목 상단 (문 라인)
        if (this.isWalkableCircle({ x: alleyX, y: doorY }, guardRadius)) {
          gridNodes.push({ x: alleyX, y: doorY, type: 'alley', room: `alley-${room.name}-${nextRoom.name}` });
        }
        
        // 골목 중간
        if (this.isWalkableCircle({ x: alleyX, y: midY }, guardRadius)) {
          gridNodes.push({ x: alleyX, y: midY, type: 'alley', room: `alley-${room.name}-${nextRoom.name}-mid` });
        }
        
        // 골목 복도 중앙
        if (this.isWalkableCircle({ x: alleyX, y: hallwayY_center }, guardRadius)) {
          gridNodes.push({ x: alleyX, y: hallwayY_center, type: 'alley-center', room: `alley-${room.name}-${nextRoom.name}-center` });
        }
      }
    });
    
    // 2. 교장실 (복도 중앙에 위치) - 좌우 우회 경로
    const officeCenterX = this.office.x + this.office.width / 2;
    const officeLeftX = this.office.x - 40; // 교장실 왼쪽 우회 경로
    const officeRightX = this.office.x + this.office.width + 40; // 교장실 오른쪽 우회 경로
    const officeTopY = this.office.y - 35;
    const officeBottomY = this.office.y + this.office.height + 35;
    const bypassTopDrop = 18;   // 상단 우회 노드를 복도 안쪽으로 끌어내려 벽에서 여유 확보
    const bypassCenterDrop = 12; // 센터 노드도 약간 아래로 내려 경비 동선 완화
    
    // 교장실 상단 문
    if (this.isWalkableCircle({ x: officeCenterX, y: officeTopY }, guardRadius)) {
      gridNodes.push({ x: officeCenterX, y: officeTopY, type: 'door', room: 'Office-Top' });
    }
    
    // 교장실 하단 문
    if (this.isWalkableCircle({ x: officeCenterX, y: officeBottomY }, guardRadius)) {
      gridNodes.push({ x: officeCenterX, y: officeBottomY, type: 'door', room: 'Office-Bottom' });
    }
    
    // 교장실 좌측 우회 수직 경로 (상/중/하)
    const officeLeftTopY = officeTopY + bypassTopDrop;
    const officeLeftCenterY = hallwayY_center + bypassCenterDrop;
    const officeLeftBottomY = officeBottomY - bypassTopDrop;
    if (this.isWalkableCircle({ x: officeLeftX, y: officeLeftTopY }, guardRadius)) {
      gridNodes.push({ x: officeLeftX, y: officeLeftTopY, type: 'bypass', room: 'Office-Left-Top' });
    }
    if (this.isWalkableCircle({ x: officeLeftX, y: officeLeftCenterY }, guardRadius)) {
      gridNodes.push({ x: officeLeftX, y: officeLeftCenterY, type: 'bypass-center', room: 'Office-Left-Center' });
    }
    if (this.isWalkableCircle({ x: officeLeftX, y: officeLeftBottomY }, guardRadius)) {
      gridNodes.push({ x: officeLeftX, y: officeLeftBottomY, type: 'bypass', room: 'Office-Left-Bottom' });
    }
    
    // 교장실 우측 우회 수직 경로 (상/중/하)
    const officeRightTopY = officeTopY + bypassTopDrop;
    const officeRightCenterY = hallwayY_center + bypassCenterDrop;
    const officeRightBottomY = officeBottomY - bypassTopDrop;
    if (this.isWalkableCircle({ x: officeRightX, y: officeRightTopY }, guardRadius)) {
      gridNodes.push({ x: officeRightX, y: officeRightTopY, type: 'bypass', room: 'Office-Right-Top' });
    }
    if (this.isWalkableCircle({ x: officeRightX, y: officeRightCenterY }, guardRadius)) {
      gridNodes.push({ x: officeRightX, y: officeRightCenterY, type: 'bypass-center', room: 'Office-Right-Center' });
    }
    if (this.isWalkableCircle({ x: officeRightX, y: officeRightBottomY }, guardRadius)) {
      gridNodes.push({ x: officeRightX, y: officeRightBottomY, type: 'bypass', room: 'Office-Right-Bottom' });
    }
    
    // 3. 하단 교실들 (4개) - 동일 구조
    const bottomRooms = this.classrooms.slice(4, 8);
    
    bottomRooms.forEach((room, index) => {
      const roomCenterX = room.rect.x + room.rect.width / 2;
      const doorY = room.rect.y - 35; // 문 위 복도
      
      // 복도 중앙 노드
      if (this.isWalkableCircle({ x: roomCenterX, y: hallwayY_center }, guardRadius)) {
        gridNodes.push({ x: roomCenterX, y: hallwayY_center, type: 'hallway-center', room: `${room.name}-center` });
      }
      
      // 중간 지점
      const midY = (hallwayY_center + doorY) / 2;
      if (this.isWalkableCircle({ x: roomCenterX, y: midY }, guardRadius)) {
        gridNodes.push({ x: roomCenterX, y: midY, type: 'hallway', room: `${room.name}-mid` });
      }
      
      // 교실 문 앞
      if (this.isWalkableCircle({ x: roomCenterX, y: doorY }, guardRadius)) {
        gridNodes.push({ x: roomCenterX, y: doorY, type: 'door', room: room.name });
      }
      
      // 교실 사이 골목
      if (index < bottomRooms.length - 1) {
        const nextRoom = bottomRooms[index + 1];
        const alleyX = (room.rect.x + room.rect.width + nextRoom.rect.x) / 2;
        
        // 골목 복도 중앙
        if (this.isWalkableCircle({ x: alleyX, y: hallwayY_center }, guardRadius)) {
          gridNodes.push({ x: alleyX, y: hallwayY_center, type: 'alley-center', room: `alley-${room.name}-${nextRoom.name}-center` });
        }
        
        // 골목 중간
        if (this.isWalkableCircle({ x: alleyX, y: midY }, guardRadius)) {
          gridNodes.push({ x: alleyX, y: midY, type: 'alley', room: `alley-${room.name}-${nextRoom.name}-mid` });
        }
        
        // 골목 하단
        if (this.isWalkableCircle({ x: alleyX, y: doorY }, guardRadius)) {
          gridNodes.push({ x: alleyX, y: doorY, type: 'alley', room: `alley-${room.name}-${nextRoom.name}` });
        }
      }
    });
    
    // 4. 좌우 끝 복도 노드 (순환 경로용)
    const leftX = this.hallwayRect.x + 70;
    const rightX = this.hallwayRect.x + this.hallwayRect.width - 70;
    
    if (this.isWalkableCircle({ x: leftX, y: hallwayY_center }, guardRadius)) {
      gridNodes.push({ x: leftX, y: hallwayY_center, type: 'edge', room: 'left-edge' });
    }
    if (this.isWalkableCircle({ x: rightX, y: hallwayY_center }, guardRadius)) {
      gridNodes.push({ x: rightX, y: hallwayY_center, type: 'edge', room: 'right-edge' });
    }
    
    // 5. ID 부여 및 이웃 연결
    gridNodes.forEach((node, i) => {
      node.id = i;
      node.neighbors = [];
    });
    
    const maxDistance = 400;
    
    gridNodes.forEach((node, i) => {
      gridNodes.forEach((other, j) => {
        if (i === j) return;
        
        const dx = Math.abs(node.x - other.x);
        const dy = Math.abs(node.y - other.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // 가로 또는 세로로 정렬된 노드만 연결
        const isAligned = (dy < 40 && dx < maxDistance) || (dx < 40 && dy < maxDistance);
        
        if (!isAligned || dist >= maxDistance) {
          return;
        }
        
        // 노드 사이에 벽이 있으면 연결 안 함 (guard 반경 16px 고려)
        if (!this.isPathClear(node, other, guardRadius)) {
          return;
        }
        
        const bothOutsideOffice = !this.isInsideOffice(node) && !this.isInsideOffice(other);
        const bothBelowOffice = node.y >= this.office.y + this.office.height && other.y >= this.office.y + this.office.height;
        const bothAboveOffice = node.y <= this.office.y && other.y <= this.office.y;
        if (
          bothOutsideOffice &&
          (bothBelowOffice || bothAboveOffice) &&
          this.lineIntersectsRect(node, other, expandedOfficeRect)
        ) {
          return;
        }
        
        node.neighbors.push({ id: j, distance: dist });
      });
    });
    
    console.log(`✅ Built navigation grid with ${gridNodes.length} nodes`);
    return gridNodes;
  }

  buildGuardRoute() {
    const nodes = [];
    const margin = 100;
    
    // 복도의 주요 지점들
    const hallwayY_top = this.hallwayRect.y + margin;
    const hallwayY_bottom = this.hallwayRect.y + this.hallwayRect.height - margin;
    const hallwayX_left = this.hallwayRect.x + margin;
    const hallwayX_right = this.hallwayRect.x + this.hallwayRect.width - margin;
    const hallwayX_center = this.hallwayRect.x + this.hallwayRect.width / 2;
    const hallwayY_center = this.hallwayRect.y + this.hallwayRect.height / 2;
    
    const officeCenterX = this.office.x + this.office.width / 2;
    const officeCenterY = this.office.y + this.office.height / 2;
    const officeTopDoorY = this.office.y - 30;
    const officeBottomDoorY = this.office.y + this.office.height + 30;
    
    // 시작: 좌측 상단
    nodes.push({ x: hallwayX_left, y: hallwayY_top, action: 'move' });
    
    // 1번 교실 (1-B)
    const room1 = this.classrooms[0];
    nodes.push({ x: room1.rect.x + room1.rect.width / 2, y: room1.rect.y + room1.rect.height + 20, action: 'move' });
    nodes.push({ x: room1.rect.x + room1.rect.width / 2, y: room1.rect.y + room1.rect.height / 2, action: 'scan', duration: 2.0 });
    nodes.push({ x: room1.rect.x + room1.rect.width / 2, y: room1.rect.y + room1.rect.height + 20, action: 'move' });
    
    // 2번 교실 (1-C)
    const room2 = this.classrooms[1];
    nodes.push({ x: room2.rect.x + room2.rect.width / 2, y: room2.rect.y + room2.rect.height + 20, action: 'move' });
    nodes.push({ x: room2.rect.x + room2.rect.width / 2, y: room2.rect.y + room2.rect.height / 2, action: 'scan', duration: 2.0 });
    nodes.push({ x: room2.rect.x + room2.rect.width / 2, y: room2.rect.y + room2.rect.height + 20, action: 'move' });
    
    // 5번 교장실 (상단 문으로 진입)
    nodes.push({ x: officeCenterX, y: officeTopDoorY, action: 'move' });
    nodes.push({ x: officeCenterX, y: officeCenterY, action: 'scan', duration: 2.5 });
    nodes.push({ x: officeCenterX, y: officeTopDoorY, action: 'move' });
    
    // 3번 교실 (2-A)
    const room3 = this.classrooms[2];
    nodes.push({ x: room3.rect.x + room3.rect.width / 2, y: room3.rect.y + room3.rect.height + 20, action: 'move' });
    nodes.push({ x: room3.rect.x + room3.rect.width / 2, y: room3.rect.y + room3.rect.height / 2, action: 'scan', duration: 2.0 });
    nodes.push({ x: room3.rect.x + room3.rect.width / 2, y: room3.rect.y + room3.rect.height + 20, action: 'move' });
    
    // 4번 교실 (2-B)
    const room4 = this.classrooms[3];
    nodes.push({ x: room4.rect.x + room4.rect.width / 2, y: room4.rect.y + room4.rect.height + 20, action: 'move' });
    nodes.push({ x: room4.rect.x + room4.rect.width / 2, y: room4.rect.y + room4.rect.height / 2, action: 'scan', duration: 2.0 });
    nodes.push({ x: room4.rect.x + room4.rect.width / 2, y: room4.rect.y + room4.rect.height + 20, action: 'move' });
    
    // 9번 교실 (과학실) - 4번 바로 아래, x축 동일
    const room9 = this.classrooms[7];
    const room9DoorY = room9.rect.y - 30;
    nodes.push({ x: room9.rect.x + room9.rect.width / 2, y: room9DoorY, action: 'move' });
    nodes.push({ x: room9.rect.x + room9.rect.width / 2, y: room9.rect.y + room9.rect.height / 2, action: 'scan', duration: 2.0 });
    nodes.push({ x: room9.rect.x + room9.rect.width / 2, y: room9DoorY, action: 'move' });
    
    // 8번 교실 (예체능실)
    const room8 = this.classrooms[6];
    const room8DoorY = room8.rect.y - 30;
    nodes.push({ x: room8.rect.x + room8.rect.width / 2, y: room8DoorY, action: 'move' });
    nodes.push({ x: room8.rect.x + room8.rect.width / 2, y: room8.rect.y + room8.rect.height / 2, action: 'scan', duration: 2.0 });
    nodes.push({ x: room8.rect.x + room8.rect.width / 2, y: room8DoorY, action: 'move' });
    
    // 7번 교실 (3-B)
    const room7 = this.classrooms[5];
    const room7DoorY = room7.rect.y - 30;
    nodes.push({ x: room7.rect.x + room7.rect.width / 2, y: room7DoorY, action: 'move' });
    nodes.push({ x: room7.rect.x + room7.rect.width / 2, y: room7.rect.y + room7.rect.height / 2, action: 'scan', duration: 2.0 });
    nodes.push({ x: room7.rect.x + room7.rect.width / 2, y: room7DoorY, action: 'move' });
    
    // 5번 교장실 (하단 문으로 진입)
    nodes.push({ x: officeCenterX, y: officeBottomDoorY, action: 'move' });
    nodes.push({ x: officeCenterX, y: officeCenterY, action: 'scan', duration: 2.5 });
    nodes.push({ x: officeCenterX, y: officeBottomDoorY, action: 'move' });
    
    // 6번 교실 (3-A)
    const room6 = this.classrooms[4];
    const room6DoorY = room6.rect.y - 30;
    nodes.push({ x: room6.rect.x + room6.rect.width / 2, y: room6DoorY, action: 'move' });
    nodes.push({ x: room6.rect.x + room6.rect.width / 2, y: room6.rect.y + room6.rect.height / 2, action: 'scan', duration: 2.0 });
    nodes.push({ x: room6.rect.x + room6.rect.width / 2, y: room6DoorY, action: 'move' });
    
    // 좌측으로 복귀해서 다시 1번 교실로 루프
    nodes.push({ x: hallwayX_left, y: hallwayY_bottom, action: 'move' });
    nodes.push({ x: hallwayX_left, y: hallwayY_center, action: 'move' });
    
    console.log(`Built guard route with ${nodes.length} waypoints (순찰: 1→2→5→3→4→9→8→7→5→6→1)`);
    return nodes;
  }

  isWalkable(point) {
    const insideHall =
      point.x >= this.hallwayRect.x &&
      point.x <= this.hallwayRect.x + this.hallwayRect.width &&
      point.y >= this.hallwayRect.y &&
      point.y <= this.hallwayRect.y + this.hallwayRect.height;
    const inRoom = this.classrooms.some(
      (room) =>
        point.x >= room.rect.x &&
        point.x <= room.rect.x + room.rect.width &&
        point.y >= room.rect.y &&
        point.y <= room.rect.y + room.rect.height
    );
    const inOffice = this.isInsideOffice(point);
    const withinSchool = insideHall || inRoom || inOffice;
    if (!withinSchool) return false;
    const hitsWall = this.obstacles.some(
      (rect) =>
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
    );
    return !hitsWall;
  }

  isWalkableCircle(point, radius = 12) {
    const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];
    const innerRadius = radius * 0.65;
    const samples = [{ x: point.x, y: point.y }];
    for (const angle of angles) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      samples.push({ x: point.x + cos * radius, y: point.y + sin * radius });
      samples.push({ x: point.x + cos * innerRadius, y: point.y + sin * innerRadius });
    }
    if (!samples.every((sample) => this.isWalkable(sample))) {
      return false;
    }
    for (const obstacle of this.obstacles) {
      const closestX = Math.max(obstacle.x, Math.min(point.x, obstacle.x + obstacle.width));
      const closestY = Math.max(obstacle.y, Math.min(point.y, obstacle.y + obstacle.height));
      const dx = point.x - closestX;
      const dy = point.y - closestY;
      if (dx * dx + dy * dy < radius * radius) {
        return false;
      }
    }
    return true;
  }

  lineIntersectsRect(from, to, rect) {
    // 선분이 사각형과 교차하는지 체크
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    
    // 선분의 양 끝이 사각형 안에 있는지
    if ((from.x >= left && from.x <= right && from.y >= top && from.y <= bottom) ||
        (to.x >= left && to.x <= right && to.y >= top && to.y <= bottom)) {
      return true;
    }
    
    // 선분이 사각형의 네 변과 교차하는지
    const intersectsLine = (p1, p2, p3, p4) => {
      const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
      if (Math.abs(denom) < 0.0001) return false;
      
      const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
      const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;
      
      return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
    };
    
    const corners = {
      tl: { x: left, y: top },
      tr: { x: right, y: top },
      bl: { x: left, y: bottom },
      br: { x: right, y: bottom }
    };
    
    return intersectsLine(from, to, corners.tl, corners.tr) ||
           intersectsLine(from, to, corners.tr, corners.br) ||
           intersectsLine(from, to, corners.br, corners.bl) ||
           intersectsLine(from, to, corners.bl, corners.tl);
  }

  isPathClear(from, to, radius = 16) {
    // 두 노드 사이에 벽이 있는지 직접 체크 (엔티티 반경 고려)
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const samples = Math.max(3, Math.ceil(dist / 20)); // 20px마다 샘플링
    
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const sample = {
        x: from.x + dx * t,
        y: from.y + dy * t
      };
      
      // 엔티티 반경을 고려한 샘플링 (원형 체크)
      const samplePoints = [
        { x: sample.x, y: sample.y },
        { x: sample.x + radius, y: sample.y },
        { x: sample.x - radius, y: sample.y },
        { x: sample.x, y: sample.y + radius },
        { x: sample.x, y: sample.y - radius },
      ];
      
      for (const point of samplePoints) {
        for (const obstacle of this.obstacles) {
          if (point.x >= obstacle.x && point.x <= obstacle.x + obstacle.width &&
              point.y >= obstacle.y && point.y <= obstacle.y + obstacle.height) {
            return false;
          }
        }
      }
    }
    
    // 선분 교차 체크도 수행 (반경 고려)
    if (dist > 0.1) {
      for (const obstacle of this.obstacles) {
        // 선분에서 반경만큼 떨어진 거리도 체크
        const perpX = -dy / dist * radius;
        const perpY = dx / dist * radius;
        const offset1 = { x: from.x + perpX, y: from.y + perpY };
        const offset2 = { x: from.x - perpX, y: from.y - perpY };
        const offset3 = { x: to.x + perpX, y: to.y + perpY };
        const offset4 = { x: to.x - perpX, y: to.y - perpY };
        
        if (this.lineIntersectsRect(from, to, obstacle) ||
            this.lineIntersectsRect(offset1, offset3, obstacle) ||
            this.lineIntersectsRect(offset2, offset4, obstacle)) {
          return false;
        }
      }
    } else {
      // 거리가 매우 짧으면 기본 선분 교차만 체크
      for (const obstacle of this.obstacles) {
        if (this.lineIntersectsRect(from, to, obstacle)) {
          return false;
        }
      }
    }
    return true;
  }

  randomPointInRoom(room, margin = 20) {
    return {
      x: rand(room.rect.x + margin, room.rect.x + room.rect.width - margin),
      y: rand(room.rect.y + margin, room.rect.y + room.rect.height - margin),
    };
  }

  randomClassroom() {
    return this.classrooms[randInt(0, this.classrooms.length)];
  }

  render(ctx, mode, debugColliders = false) {
    ctx.save();
    ctx.fillStyle = mode === 'day' ? '#cfd9ef' : '#3a4555'; // 밤 배경 더 밝게 (#2a3545 → #3a4555)
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // hallway base
    ctx.fillStyle = mode === 'day' ? '#b6c1e0' : '#405060'; // 복도 더 밝게 (#303d52 → #405060)
    ctx.fillRect(this.hallwayRect.x, this.hallwayRect.y, this.hallwayRect.width, this.hallwayRect.height);

    // classrooms
    this.classrooms.forEach((room, index) => {
      ctx.fillStyle = ROOM_COLORS[index % ROOM_COLORS.length];
      ctx.fillRect(room.rect.x, room.rect.y, room.rect.width, room.rect.height);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(
        room.rect.x + 12,
        room.rect.y + 12,
        room.rect.width - 24,
        room.rect.height - 24
      );
    });

    // principal office floor
    ctx.fillStyle = '#663230';
    ctx.fillRect(this.office.x, this.office.y, this.office.width, this.office.height);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(this.office.x + 30, this.office.y + 30, this.office.width - 60, this.office.height - 60);

    // door visuals
    ctx.fillStyle = '#b58a5c';
    this.doors.forEach((door) => {
      ctx.fillRect(door.x, door.y, door.width, door.height);
    });

    // outlines
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(this.hallwayRect.x, this.hallwayRect.y, this.hallwayRect.width, this.hallwayRect.height);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 3;
    this.classrooms.forEach((room) => ctx.strokeRect(room.rect.x, room.rect.y, room.rect.width, room.rect.height));
    ctx.strokeStyle = '#2a1b1a';
    ctx.lineWidth = 5;
    ctx.strokeRect(this.office.x, this.office.y, this.office.width, this.office.height);
    
    // 디버그: 콜라이더 시각화
    if (debugColliders) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.lineWidth = 1;
      this.obstacles.forEach((obstacle) => {
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      });
      
      // 문 영역 표시 (초록색)
      ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
      this.doors.forEach((door) => {
        ctx.fillRect(door.x, door.y, door.width, door.height);
        ctx.strokeRect(door.x, door.y, door.width, door.height);
      });
    }
    
    ctx.restore();
  }

  findPathOnGrid(startPos, endPos, pathfinder) {
    // 그리드 네트워크를 따라 경로 찾기 (Dijkstra 알고리즘)
    if (!this.navigationGrid || this.navigationGrid.length === 0) {
      console.error('Navigation grid not initialized');
      return null;
    }
    
    // 1. 시작점에서 가장 가까운 그리드 노드 찾기
    let startNode = null;
    let minStartDist = Infinity;
    this.navigationGrid.forEach((node) => {
      const dist = Math.sqrt((node.x - startPos.x) ** 2 + (node.y - startPos.y) ** 2);
      if (dist < minStartDist) {
        minStartDist = dist;
        startNode = node;
      }
    });
    
    // 2. 목표점에서 가장 가까운 그리드 노드 찾기
    let endNode = null;
    let minEndDist = Infinity;
    this.navigationGrid.forEach((node) => {
      const dist = Math.sqrt((node.x - endPos.x) ** 2 + (node.y - endPos.y) ** 2);
      if (dist < minEndDist) {
        minEndDist = dist;
        endNode = node;
      }
    });
    
    const fallbackToAStar = () => {
      if (!pathfinder) return null;
      const astarPath = pathfinder.findPath(startPos, endPos);
      if (astarPath && astarPath.length > 0) {
        console.warn('⚠️ Grid path unavailable, using direct A* fallback');
        return astarPath.map((point, idx) => ({
          ...point,
          action: 'move',
          debug: idx === 0 ? 'fallback-start' : 'fallback-astar',
        }));
      }
      return null;
    };
    
    if (!startNode || !endNode) {
      console.error('Could not find grid nodes near start/end positions');
      return fallbackToAStar();
    }
    
    console.log(`Grid pathfinding: node ${startNode.id} (${Math.round(minStartDist)}px away) → node ${endNode.id} (${Math.round(minEndDist)}px away)`);
    
    // 3. Dijkstra 알고리즘으로 그리드 노드들 사이의 최단 경로 찾기
    const distances = new Array(this.navigationGrid.length).fill(Infinity);
    const previous = new Array(this.navigationGrid.length).fill(null);
    const visited = new Array(this.navigationGrid.length).fill(false);
    
    distances[startNode.id] = 0;
    
    for (let i = 0; i < this.navigationGrid.length; i++) {
      // 방문하지 않은 노드 중 거리가 가장 짧은 노드 찾기
      let minDist = Infinity;
      let currentId = -1;
      
      for (let j = 0; j < this.navigationGrid.length; j++) {
        if (!visited[j] && distances[j] < minDist) {
          minDist = distances[j];
          currentId = j;
        }
      }
      
      if (currentId === -1 || minDist === Infinity) break;
      if (currentId === endNode.id) break; // 목표 도달
      
      visited[currentId] = true;
      const currentNode = this.navigationGrid[currentId];
      
      // 이웃 노드들의 거리 업데이트
      currentNode.neighbors.forEach((neighbor) => {
        const newDist = distances[currentId] + neighbor.distance;
        if (newDist < distances[neighbor.id]) {
          distances[neighbor.id] = newDist;
          previous[neighbor.id] = currentId;
        }
      });
    }
    
    // 4. 경로 재구성
    if (distances[endNode.id] === Infinity) {
      console.error(`No path found on grid from node ${startNode.id} to node ${endNode.id}`);
      return fallbackToAStar();
    }
    
    const gridPath = [];
    let currentId = endNode.id;
    
    while (currentId !== null) {
      gridPath.unshift(this.navigationGrid[currentId]);
      currentId = previous[currentId];
    }
    
    // 그리드 경로의 각 노드 쌍이 실제로 이웃 관계인지 확인 (벽 체크)
    for (let i = 0; i < gridPath.length - 1; i++) {
      const curr = gridPath[i];
      const next = gridPath[i + 1];
      const isNeighbor = curr.neighbors.some(n => n.id === next.id);
      const isClear = this.isPathClear(curr, next, 16); // guard 반경 16px 고려
      
      if (!isNeighbor) {
        console.error(`❌ Invalid grid path: nodes ${curr.id} and ${next.id} are not neighbors`);
        return fallbackToAStar();
      }
      if (!isClear) {
        console.error(`❌ Invalid grid path: nodes ${curr.id} (${Math.round(curr.x)}, ${Math.round(curr.y)}) and ${next.id} (${Math.round(next.x)}, ${Math.round(next.y)}) are blocked by wall`);
        return fallbackToAStar();
      }
    }
    
    // 노드 경로를 문자열로 출력
    const nodePathStr = gridPath.map(n => n.id).join(' → ');
    console.log(`📍 Grid node path: ${nodePathStr}`);
    console.log(`Grid path found: ${gridPath.length} nodes, total distance: ${Math.round(distances[endNode.id])}`);
    
    // 5. 최종 경로 조립: 시작점 → 첫 그리드 노드 (A*) → 그리드 경로 → 마지막 그리드 노드 → 목표점 (A*)
    const fullPath = [];
    
    // 시작점이 첫 그리드 노드와 가까우면 직접 연결, 멀면 A*
    if (minStartDist > 50 && pathfinder) {
      console.log(`Using A* for entry: ${Math.round(minStartDist)}px`);
      const entryPath = pathfinder.findPath(startPos, { x: startNode.x, y: startNode.y });
      if (entryPath && entryPath.length > 0) {
        fullPath.push(...entryPath.map(p => ({ ...p, debug: 'entry-astar' })));
      } else {
        console.warn('Entry A* failed, using direct');
        fullPath.push({ x: startPos.x, y: startPos.y, debug: 'entry-direct' });
      }
    } else {
      fullPath.push({ x: startPos.x, y: startPos.y, debug: 'entry-direct' });
    }
    
    // 그리드 경로 추가 (시작 노드는 이미 포함되어 있을 수 있으니 중복 제거)
    const lastPoint = fullPath[fullPath.length - 1];
    const gridPathPoints = gridPath.map(n => ({ x: n.x, y: n.y, debug: `grid-node-${n.id}` }));
    if (gridPathPoints.length > 0) {
      const firstGrid = gridPathPoints[0];
      if (Math.abs(lastPoint.x - firstGrid.x) < 5 && Math.abs(lastPoint.y - firstGrid.y) < 5) {
        gridPathPoints.shift();
      }
      fullPath.push(...gridPathPoints);
    }
    
    // 마지막 그리드 노드에서 목표점까지 (가까우면 직접, 멀면 A*)
    if (minEndDist > 50 && pathfinder) {
      console.log(`Using A* for exit: ${Math.round(minEndDist)}px`);
      const exitPath = pathfinder.findPath({ x: endNode.x, y: endNode.y }, endPos);
      if (exitPath && exitPath.length > 1) {
        exitPath.shift(); // 첫 점은 endNode와 중복
        fullPath.push(...exitPath.map(p => ({ ...p, debug: 'exit-astar' })));
      } else {
        console.warn('Exit A* failed, using direct');
        fullPath.push({ x: endPos.x, y: endPos.y, debug: 'exit-direct' });
      }
    } else {
      fullPath.push({ x: endPos.x, y: endPos.y, debug: 'exit-direct' });
    }
    
    console.log(`Final path: ${fullPath.length} waypoints total`);
    // 웨이포인트별 타입 요약
    const entryCount = fullPath.filter(p => p.debug && p.debug.includes('entry')).length;
    const gridCount = fullPath.filter(p => p.debug && p.debug.includes('grid')).length;
    const exitCount = fullPath.filter(p => p.debug && p.debug.includes('exit')).length;
    console.log(`   Entry: ${entryCount}, Grid: ${gridCount}, Exit: ${exitCount}`);
    return fullPath;
  }

  isInsideOffice(point) {
    return (
      point.x >= this.office.x &&
      point.x <= this.office.x + this.office.width &&
      point.y >= this.office.y &&
      point.y <= this.office.y + this.office.height
    );
  }

  getOfficeSeat() {
    return {
      x: this.office.x + this.office.width / 2,
      y: this.office.y + this.office.height / 2 - 20,
    };
  }

  getHallwaySpots() {
    const spots = [];
    const { x, y, width, height } = this.hallwayRect;
    for (let i = 0; i < 20; i += 1) {
      spots.push({ x: rand(x + 40, x + width - 40), y: rand(y + 40, y + height - 40) });
    }
    return spots;
  }
}
