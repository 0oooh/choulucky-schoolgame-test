import { TILE_SIZE, WORLD_COLS, WORLD_ROWS } from '../core/constants.js';

// 대각선 이동을 고려한 유클리드 거리 휴리스틱
const heuristic = (a, b) => Math.sqrt((a.col - b.col) ** 2 + (a.row - b.row) ** 2);

export class Pathfinder {
  constructor(map) {
    this.map = map;
    this.grid = this.buildGrid();
  }

  buildGrid() {
    const grid = Array.from({ length: WORLD_ROWS }, () => Array(WORLD_COLS).fill(false));
    let walkableCount = 0;
    const entityRadius = 16; // 경비원/도둑 반경 고려
    
    for (let row = 0; row < WORLD_ROWS; row += 1) {
      for (let col = 0; col < WORLD_COLS; col += 1) {
        const x = col * TILE_SIZE + TILE_SIZE / 2;
        const y = row * TILE_SIZE + TILE_SIZE / 2;
        
        // 엔티티 반경을 고려한 walkable 체크
        if (this.map.isWalkable) {
          grid[row][col] = this.map.isWalkableCircle({ x, y }, entityRadius);
        } else {
          grid[row][col] = this.isInsideSchool({ x, y });
        }
        
        if (grid[row][col]) walkableCount++;
      }
    }
    console.log(`Pathfinding grid built: ${WORLD_COLS}x${WORLD_ROWS}, walkable cells: ${walkableCount} (radius: ${entityRadius}px)`);
    return grid;
  }

  isInsideSchool(point) {
    const { x, y } = point;
    const insideHall =
      x >= this.map.hallwayRect.x &&
      x <= this.map.hallwayRect.x + this.map.hallwayRect.width &&
      y >= this.map.hallwayRect.y &&
      y <= this.map.hallwayRect.y + this.map.hallwayRect.height;
    const inRoom = this.map.classrooms.some((room) =>
      x >= room.rect.x &&
      x <= room.rect.x + room.rect.width &&
      y >= room.rect.y &&
      y <= room.rect.y + room.rect.height
    );
    const inOffice =
      x >= this.map.office.x &&
      x <= this.map.office.x + this.map.office.width &&
      y >= this.map.office.y &&
      y <= this.map.office.y + this.map.office.height;
    return insideHall || inRoom || inOffice;
  }

  toCell(point) {
    return {
      col: Math.max(0, Math.min(WORLD_COLS - 1, Math.floor(point.x / TILE_SIZE))),
      row: Math.max(0, Math.min(WORLD_ROWS - 1, Math.floor(point.y / TILE_SIZE))),
    };
  }

  toPoint(cell) {
    return {
      x: cell.col * TILE_SIZE + TILE_SIZE / 2,
      y: cell.row * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  neighbors(cell) {
    // 8방향: 상하좌우 + 대각선
    const deltas = [
      { col: 1, row: 0, cost: 1 },     // 우
      { col: -1, row: 0, cost: 1 },    // 좌
      { col: 0, row: 1, cost: 1 },     // 하
      { col: 0, row: -1, cost: 1 },    // 상
      { col: 1, row: 1, cost: 1.414 }, // 우하 (대각선)
      { col: 1, row: -1, cost: 1.414 },// 우상 (대각선)
      { col: -1, row: 1, cost: 1.414 },// 좌하 (대각선)
      { col: -1, row: -1, cost: 1.414 },// 좌상 (대각선)
    ];
    const list = [];
    for (const delta of deltas) {
      const col = cell.col + delta.col;
      const row = cell.row + delta.row;
      if (col < 0 || col >= WORLD_COLS || row < 0 || row >= WORLD_ROWS) continue;
      if (!this.grid[row][col]) continue;
      
      // 대각선 이동 시 양쪽 직선 경로가 모두 walkable한지 확인 (벽 모서리 통과 방지)
      if (delta.col !== 0 && delta.row !== 0) {
        const checkCol = this.grid[cell.row][col]; // 좌우 먼저 이동
        const checkRow = this.grid[row][cell.col]; // 상하 먼저 이동
        if (!checkCol || !checkRow) continue; // 둘 중 하나라도 막혀있으면 대각선 불가
      }
      
      list.push({ col, row, cost: delta.cost });
    }
    return list;
  }

  findPath(startPoint, endPoint) {
    const start = this.toCell(startPoint);
    const goal = this.toCell(endPoint);
    
    // 시작점과 목표점이 walkable한지 확인
    if (!this.grid[start.row]?.[start.col]) {
      console.warn(`A* start point (${start.col}, ${start.row}) is not walkable`);
      return [];
    }
    if (!this.grid[goal.row]?.[goal.col]) {
      console.warn(`A* goal point (${goal.col}, ${goal.row}) is not walkable`);
      return [];
    }
    
    const open = [start];
    const cameFrom = new Map();
    const gScore = Array.from({ length: WORLD_ROWS }, () => Array(WORLD_COLS).fill(Infinity));
    const fScore = Array.from({ length: WORLD_ROWS }, () => Array(WORLD_COLS).fill(Infinity));
    const key = (cell) => `${cell.col},${cell.row}`;

    gScore[start.row][start.col] = 0;
    fScore[start.row][start.col] = heuristic(start, goal);
    
    let iterations = 0;
    const maxIterations = 10000;

    while (open.length && iterations < maxIterations) {
      iterations++;
      open.sort((a, b) => fScore[a.row][a.col] - fScore[b.row][b.col]);
      const current = open.shift();
      
      if (current.col === goal.col && current.row === goal.row) {
        const path = this.reconstructPath(cameFrom, current).map((cell) => this.toPoint(cell));
        console.log(`A* found path: ${path.length} waypoints, ${iterations} iterations`);
        return path;
      }
      
      for (const neighbor of this.neighbors(current)) {
        // 대각선 이동은 비용이 더 높음 (sqrt(2) ≈ 1.414)
        const moveCost = neighbor.cost || 1;
        const tentative = gScore[current.row][current.col] + moveCost;
        if (tentative < gScore[neighbor.row][neighbor.col]) {
          cameFrom.set(key(neighbor), current);
          gScore[neighbor.row][neighbor.col] = tentative;
          fScore[neighbor.row][neighbor.col] = tentative + heuristic(neighbor, goal);
          if (!open.find((node) => node.col === neighbor.col && node.row === neighbor.row)) {
            open.push(neighbor);
          }
        }
      }
    }
    
    if (iterations >= maxIterations) {
      console.error(`A* exceeded max iterations (${maxIterations})`);
    } else {
      console.warn(`A* failed to find path after ${iterations} iterations`);
    }
    return [];
  }

  reconstructPath(cameFrom, current) {
    const path = [current];
    const key = (cell) => `${cell.col},${cell.row}`;
    while (cameFrom.has(key(current))) {
      current = cameFrom.get(key(current));
      path.unshift(current);
    }
    return path;
  }
}
