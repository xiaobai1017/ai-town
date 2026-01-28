
export interface Coordinate {
  x: number;
  y: number;
}

export type TileType = 'grass' | 'road' | 'wall' | 'floor';

export interface Location {
  name: string;
  entry: Coordinate;
  interior?: Coordinate;
  width?: number;
  height?: number;
  type: 'residential' | 'commercial' | 'public';
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
    // Simple procedural generation or hardcoded layout
    // Fill with grass by default

    // Add roads (simple grid pattern)
    for (let x = 0; x < this.width; x++) {
      this.grid[10][x] = 'road';
    }
    for (let y = 0; y < this.height; y++) {
      this.grid[y][15] = 'road';
    }

    // Add some buildings/walls
    this.addBuilding(2, 2, 5, 5, 'My House');
    this.addBuilding(20, 2, 5, 5, 'Library');
    this.addBuilding(2, 12, 5, 5, 'Bakery');

    // Add Park (Just an area)
    this.locations.push({
      name: 'Park',
      entry: { x: 25, y: 15 },
      type: 'public'
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
    // Add door
    this.grid[y + h - 1][x + Math.floor(w / 2)] = 'floor';
    this.locations.push({
      name,
      entry: { x: x + Math.floor(w / 2), y: y + h - 1 }, // On the door tile
      interior: { x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) }, // Center of building
      width: w,
      height: h,
      type: 'public' // simplified
    });
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const tile = this.grid[y][x];
    return tile !== 'wall';
  }

  // Simple BFS for pathfinding (A* is better but BFS is fine for small grid)
  findPath(start: Coordinate, end: Coordinate): Coordinate[] | null {
    const queue: { pos: Coordinate; path: Coordinate[] }[] = [{ pos: start, path: [] }];
    const visited = new Set<string>();
    visited.add(`${start.x},${start.y}`);

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

      // Shuffle directions to make paths less predictable
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
