import { Coordinate } from './World';

export type TileType = 'grass' | 'road' | 'wall' | 'floor';

export interface Location {
  name: string;
  entry: Coordinate;
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

// 使用位掩码优化地图存储
const TILE_TYPE_MASKS = {
  GRASS: 0b0001,
  ROAD: 0b0010,
  WALL: 0b0100,
  FLOOR: 0b1000
};

export class OptimizedWorld {
  width: number;
  height: number;
  // 优化：使用数字数组而不是字符串数组，减少内存占用
  grid: Uint8Array; // 用位掩码表示地形类型
  locations: Location[];

  constructor(width: number = 30, height: number = 20) {
    this.width = width;
    this.height = height;
    // 优化：使用 TypedArray 减少内存占用和提高访问速度
    this.grid = new Uint8Array(width * height);
    this.locations = [];
    this.generateMap();
  }

  generateMap() {
    // 用数字代替字符串存储地形
    const GRASS = TILE_TYPE_MASKS.GRASS;
    const ROAD = TILE_TYPE_MASKS.ROAD;
    
    // 填充草地
    this.grid.fill(GRASS);

    // 添加道路
    for (let x = 0; x < this.width; x++) {
      this._setTile(10, x, ROAD);
    }
    for (let y = 0; y < this.height; y++) {
      this._setTile(y, 15, ROAD);
    }

    // 添加建筑物
    this.addBuilding(2, 2, 5, 5, 'My House');
    this.addBuilding(8, 2, 5, 5, 'Restaurant');
    this.addBuilding(20, 2, 5, 5, 'Library');
    this.addBuilding(26, 2, 5, 5, 'Bank');
    this.addBuilding(2, 12, 5, 5, 'Bakery');
    this.addBuilding(8, 12, 5, 5, 'Police Station');
    this.addBuilding(20, 12, 5, 5, 'Hospital');
    this.addBuilding(26, 12, 5, 5, 'Mall');

    // 添加公园
    this.locations.push({
      name: 'Park',
      x: 35, y: 2, width: 5, height: 5,
      entry: { x: 37, y: 7 },
      type: 'public',
      stats: { visits: 0, revenue: 0, transactions: [] }
    });
  }

  addBuilding(x: number, y: number, w: number, h: number, name: string) {
    const WALL = TILE_TYPE_MASKS.WALL;
    const FLOOR = TILE_TYPE_MASKS.FLOOR;
    
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        if (i === 0 || i === h - 1 || j === 0 || j === w - 1) {
          this._setTile(y + i, x + j, WALL);
        } else {
          this._setTile(y + i, x + j, FLOOR);
        }
      }
    }
    
    // 添加门
    this._setTile(y + h - 1, x + Math.floor(w / 2), FLOOR);
    
    this.locations.push({
      name,
      x, y,
      entry: { x: x + Math.floor(w / 2), y: y + h - 1 },
      interior: { x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) },
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

  // 辅助函数：将二维坐标转换为一维索引
  _getIndex(y: number, x: number): number {
    return y * this.width + x;
  }

  // 辅助函数：设置瓷砖类型
  _setTile(y: number, x: number, type: number) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.grid[this._getIndex(y, x)] = type;
    }
  }

  // 辅助函数：获取瓷砖类型
  _getTile(y: number, x: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return TILE_TYPE_MASKS.WALL;
    return this.grid[this._getIndex(y, x)];
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const tile = this._getTile(y, x);
    return (tile & TILE_TYPE_MASKS.WALL) === 0;
  }

  // 优化：使用 A* 算法替代 BFS，提高寻路效率
  findPath(start: Coordinate, end: Coordinate): Coordinate[] | null {
    // 如果起点和终点相同，直接返回空路径
    if (start.x === end.x && start.y === end.y) {
      return [];
    }

    // 使用 A* 算法
    const openSet: { f: number; g: number; h: number; pos: Coordinate; parent?: Coordinate }[] = [];
    const closedSet: Set<string> = new Set();
    
    // 启发式函数（曼哈顿距离）
    const heuristic = (a: Coordinate, b: Coordinate): number => {
      return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    };

    // 初始节点
    const startNode = {
      pos: start,
      g: 0,
      h: heuristic(start, end),
      f: heuristic(start, end)
    };
    
    openSet.push(startNode);

    // 使用 Map 存储 openSet 中的节点，便于快速查找
    const openSetMap = new Map<string, typeof startNode>();
    openSetMap.set(`${start.x},${start.y}`, startNode);

    while (openSet.length > 0) {
      // 找到 f 值最小的节点
      openSet.sort((a, b) => a.f - b.f);
      const currentNode = openSet.shift()!;
      openSetMap.delete(`${currentNode.pos.x},${currentNode.pos.y}`);
      
      const posKey = `${currentNode.pos.x},${currentNode.pos.y}`;
      closedSet.add(posKey);

      // 到达目标
      if (currentNode.pos.x === end.x && currentNode.pos.y === end.y) {
        // 重构路径
        const path: Coordinate[] = [];
        let current: Coordinate | undefined = currentNode.pos;
        
        while (current) {
          path.unshift(current);
          
          // 在这里查找父节点
          if (current.x === start.x && current.y === start.y) break;
          
          // 简单回溯：查找与当前节点相邻的节点
          let parentFound = false;
          for (const loc of [...openSet, currentNode]) {
            if (loc.pos.x === current.x && loc.pos.y === current.y && loc.parent) {
              current = loc.parent;
              parentFound = true;
              break;
            }
          }
          if (!parentFound) break;
        }
        
        // 移除起始点，因为我们只需要移动到下一个位置
        if (path.length > 0) {
          path.shift();
        }
        
        return path;
      }

      // 探索邻居
      const neighbors = [
        { x: 0, y: -1 }, // 上
        { x: 0, y: 1 },  // 下
        { x: -1, y: 0 }, // 左
        { x: 1, y: 0 }   // 右
      ];

      for (const neighbor of neighbors) {
        const nextCoord = {
          x: currentNode.pos.x + neighbor.x,
          y: currentNode.pos.y + neighbor.y
        };

        const neighborKey = `${nextCoord.x},${nextCoord.y}`;

        // 检查是否可通行且不在关闭列表中
        if (!this.isWalkable(nextCoord.x, nextCoord.y) || closedSet.has(neighborKey)) {
          continue;
        }

        const tentativeG = currentNode.g + 1;

        // 检查是否已经在开放列表中，且当前路径更优
        const existingNode = openSetMap.get(neighborKey);
        if (existingNode && tentativeG >= existingNode.g) {
          continue;
        }

        // 创建新节点
        const newNode = {
          pos: nextCoord,
          g: tentativeG,
          h: heuristic(nextCoord, end),
          f: tentativeG + heuristic(nextCoord, end),
          parent: currentNode.pos
        };

        openSet.push(newNode);
        openSetMap.set(neighborKey, newNode);
      }
    }

    // 没有找到路径
    return null;
  }
}