/**
 * 仿真世界地图与寻路模块，支持双格宽门与动态避障寻路
 * @author hubin
 */

export interface Coordinate {
  x: number;
  y: number;
}

export type TileType = 'grass' | 'road' | 'wall' | 'floor';

export interface Location {
  name: string;
  entry: Coordinate;
  doors?: Coordinate[];
  interior?: Coordinate;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  type: 'residential' | 'commercial' | 'public';
  stats: {
    visits: number;
    revenue: number;
    transactions: { amount: number, description: string, timestamp: number }[];
    sessionRevenue?: Record<string, number>; // agentId -> current session amount
    extra?: Record<string, number>; // For bank: deposits, withdrawals; For Police: arrests, bailCollected
  };
}

export class World {
  width: number;
  height: number;
  grid: TileType[][];
  locations: Location[];

  constructor(width: number = 30, height: number = 20) {
    this.width = width;
    this.height = height;
    this.grid = Array(height).fill(null).map(() => Array(width).fill('grass'));
    this.locations = [];
    this.generateMap();
  }

  generateMap() {
    // Add roads (simple grid pattern)
    for (let x = 0; x < this.width; x++) {
      this.grid[10][x] = 'road';
    }
    for (let y = 0; y < this.height; y++) {
      this.grid[y][15] = 'road';
    }

    // Add buildings
    this.addBuilding(2, 2, 5, 5, 'My House');
    this.addBuilding(8, 2, 5, 5, 'Restaurant');
    this.addBuilding(20, 2, 5, 5, 'Library');
    this.addBuilding(26, 2, 5, 5, 'Bank');
    this.addBuilding(2, 12, 5, 5, 'Bakery');
    this.addBuilding(8, 12, 5, 5, 'Police Station');
    this.addBuilding(20, 12, 5, 5, 'Hospital');
    this.addBuilding(26, 12, 5, 5, 'Mall');

    // Add Park (Just an area) - placed in open space to the right of Bank
    this.locations.push({
      name: 'Park',
      x: 35, y: 2, width: 5, height: 5,
      entry: { x: 37, y: 7 },
      doors: [{ x: 37, y: 7 }],
      type: 'public',
      stats: { visits: 0, revenue: 0, transactions: [] }
    });
  }

  addBuilding(x: number, y: number, w: number, h: number, name: string) {
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        if (i === 0 || i === h - 1 || j === 0 || j === w - 1) {
          this.grid[y + i][x + j] = 'wall';
        } else {
          this.grid[y + i][x + j] = 'floor';
        }
      }
    }

    // 拓宽为双格大门（宽 2 格），避免进出对顶死锁
    const doorY = y + h - 1;
    const doorX1 = x + Math.max(1, Math.floor(w / 2) - 1);
    const doorX2 = x + Math.min(w - 2, Math.floor(w / 2));

    this.grid[doorY][doorX1] = 'floor';
    this.grid[doorY][doorX2] = 'floor';

    const doors: Coordinate[] = [
      { x: doorX1, y: doorY },
      { x: doorX2, y: doorY }
    ];

    this.locations.push({
      name,
      x, y,
      entry: { x: doorX2, y: doorY }, // Primary door
      doors,
      interior: { x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) }, // Center of building
      width: w,
      height: h,
      type: 'public',
      stats: {
        visits: 0,
        revenue: 0,
        transactions: [],
        extra: name === 'Bank' ? { deposits: 0, withdrawals: 0, loans: 0 } : 
             name === 'Police Station' ? { arrests: 0, bailCollected: 0 } : undefined
      }
    });
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const tile = this.grid[y][x];
    return tile !== 'wall';
  }

  /**
   * 广度优先寻路算法，支持传入动态避障坐标列表 avoidPositions
   */
  findPath(start: Coordinate, end: Coordinate, avoidPositions?: Coordinate[]): Coordinate[] | null {
    // 首先尝试避开动态障碍物寻路
    if (avoidPositions && avoidPositions.length > 0) {
      const pathWithAvoidance = this._bfsPath(start, end, avoidPositions);
      if (pathWithAvoidance) {
        return pathWithAvoidance;
      }
    }

    // 若避障后无路可走，回退到基础寻路
    return this._bfsPath(start, end);
  }

  private _bfsPath(start: Coordinate, end: Coordinate, avoidPositions?: Coordinate[]): Coordinate[] | null {
    const queue: { pos: Coordinate; path: Coordinate[] }[] = [{ pos: start, path: [] }];
    const visited = new Set<string>();
    visited.add(`${start.x},${start.y}`);

    if (avoidPositions) {
      for (const obs of avoidPositions) {
        // 起点与终点自身不应作为障碍过滤
        if ((obs.x !== start.x || obs.y !== start.y) && (obs.x !== end.x || obs.y !== end.y)) {
          visited.add(`${obs.x},${obs.y}`);
        }
      }
    }

    while (queue.length > 0) {
      const { pos, path } = queue.shift()!;

      if (pos.x === end.x && pos.y === end.y) {
        return path;
      }

      const directions = [
        { x: 0, y: -1 }, // Up
        { x: 0, y: 1 },  // Down
        { x: -1, y: 0 }, // Left
        { x: 1, y: 0 },  // Right
      ];

      // 打乱探索方向以增加随机性
      for (let i = directions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [directions[i], directions[j]] = [directions[j], directions[i]];
      }

      for (const dir of directions) {
        const nextX = pos.x + dir.x;
        const nextY = pos.y + dir.y;
        const key = `${nextX},${nextY}`;

        if (this.isWalkable(nextX, nextY) && !visited.has(key)) {
          visited.add(key);
          queue.push({
            pos: { x: nextX, y: nextY },
            path: [...path, { x: nextX, y: nextY }],
          });
        }
      }
    }
    return null;
  }
}
