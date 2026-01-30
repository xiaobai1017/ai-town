import { Coordinate, World } from './World';
import { OptimizedAgent, AgentState } from './OptimizedAgent';

export class AntiDeadlockOptimizedAgent extends OptimizedAgent {
    private waitTime: number = 0;  // 等待时间，用于避免永久阻塞
    private lastPositions: Coordinate[] = []; // 记录最近的位置，用于检测循环移动
    private maxWaitTime: number = 20; // 最大等待时间

    constructor(id: string, name: string, role: string, startPos: Coordinate, color: string, emoji: string, world: World, description: string = "A resident of AI Town.") {
        super(id, name, role, startPos, color, emoji, world, description);
    }

    moveOptimized(agents: OptimizedAgent[]) {
        if (this.state !== 'MOVING' || this.path.length === 0) {
            this._stopMoving();
            return;
        }

        const nextStep = this.path[0];
        
        // 检测位置是否被占用
        if (this._isPositionOccupied(nextStep, agents)) {
            this._handleObstacleAdvanced(agents);
            return;
        }

        // 清除等待时间
        this.waitTime = 0;
        
        // 检查是否会导致死锁：如果路径中的下一步与另一个移动中的智能体的目标位置相同
        const potentialConflict = this._checkPathConflict(nextStep, agents);
        if (potentialConflict) {
            // 尝试等待或重新规划路径
            this._handlePotentialConflict(potentialConflict, agents);
            return;
        }

        // 记录当前位置用于循环检测
        this._recordCurrentPosition();
        
        // 检查是否陷入循环
        if (this._isInCircularPath()) {
            this._breakCircularPath(agents);
            return;
        }

        // 移动成功
        this._completeMove(nextStep);
    }

    private _recordCurrentPosition() {
        // 记录当前位置，限制数量以节省内存
        this.lastPositions.push({...this.position});
        if (this.lastPositions.length > 10) {
            this.lastPositions.shift();
        }
    }

    private _isInCircularPath(): boolean {
        // 检查最近的位置是否形成了循环
        if (this.lastPositions.length < 5) return false;
        
        // 检查当前位置是否在最近的位置中出现过
        for (let i = 0; i < this.lastPositions.length - 2; i++) {
            if (this.lastPositions[i].x === this.position.x && 
                this.lastPositions[i].y === this.position.y) {
                return true;
            }
        }
        return false;
    }

    private _breakCircularPath(agents: OptimizedAgent[]) {
        // 如果陷入循环，尝试随机移动或停止
        if (Math.random() < 0.7) {
            // 重新规划路径
            if (this.targetPosition) {
                const newPath = this.world.findPath(this.position, this.targetPosition);
                if (newPath && newPath.length > 0) {
                    this.path = newPath;
                } else {
                    // 如果找不到路径，停止移动
                    this.stop();
                }
            } else {
                this.stop();
            }
        } else {
            // 随机选择一个方向移动
            this._tryRandomMove(agents);
        }
    }

    private _tryRandomMove(agents: OptimizedAgent[]) {
        // 尝试在周围随机移动一步
        const directions = [
            {x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}
        ];
        
        for (const dir of directions) {
            const newX = this.position.x + dir.x;
            const newY = this.position.y + dir.y;
            
            // 检查是否可行走
            if (this.getWorld().isWalkable(newX, newY)) {
                const newCoord: Coordinate = {x: newX, y: newY};
                
                // 检查是否被占用
                if (!this._isPositionOccupied(newCoord, agents)) {
                    // 临时更新位置，然后还原
                    const oldPos = {...this.position};
                    this.position = newCoord;
                    
                    // 尝试移动到新位置
                    this.path = [newCoord];
                    this._completeMove(newCoord);
                    return;
                }
            }
        }
        
        // 如果周围都被占用，停止移动
        this.stop();
    }
    
    // 添加一个方法来获取世界实例
    protected getWorld() {
        return (this as any).world;
    }

    private _checkPathConflict(nextStep: Coordinate, agents: OptimizedAgent[]): OptimizedAgent | null {
        // 检查是否有其他正在移动的智能体的目标位置与我们的下一步冲突
        for (const other of agents) {
            if (other.id !== this.id && other.state === 'MOVING' && other.path.length > 0) {
                // 检查对方路径的第一步是否与我们的下一步相同
                if (other.path[0].x === nextStep.x && other.path[0].y === nextStep.y) {
                    return other;
                }
                
                // 检查是否会发生交叉碰撞（交换位置）
                if (other.path[0].x === this.position.x && other.path[0].y === this.position.y &&
                    nextStep.x === other.position.x && nextStep.y === other.position.y) {
                    return other;
                }
            }
        }
        return null;
    }

    private _handlePotentialConflict(conflictingAgent: OptimizedAgent, agents: OptimizedAgent[]) {
        // 策略1：等待一小段时间，让对方先行
        this.waitTime++;
        
        if (this.waitTime < 3) {
            // 短暂等待
            return;
        }
        
        // 策略2：尝试重新规划路径
        if (this.targetPosition) {
            const newPath = this.world.findPath(this.position, this.targetPosition);
            if (newPath && newPath.length > 0) {
                this.path = newPath;
                this.waitTime = 0;
                return;
            }
        }
        
        // 策略3：如果等待时间过长，尝试侧移
        if (this.waitTime > 5) {
            this._attemptSidestep(agents);
        }
        
        // 策略4：如果还是不行，放弃移动
        if (this.waitTime > this.maxWaitTime) {
            this.stop();
            this.conversation = "Stuck! Can't get through.";
            this.conversationTTL = 30;
        }
    }

    private _attemptSidestep(agents: OptimizedAgent[]) {
        // 尝试向旁边移动一步以避开冲突
        const directions = [
            {x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}
        ];
        
        // 获取目标方向
        if (this.path.length > 0) {
            const target = this.path[this.path.length - 1];
            const dx = target.x - this.position.x;
            const dy = target.y - this.position.y;
            
            // 优先尝试垂直于目标方向的移动
            const sidestepDirections: {x: number, y: number}[] = [];
            
            // 如果主要是水平移动，尝试垂直侧移
            if (Math.abs(dx) > Math.abs(dy)) {
                sidestepDirections.push({x: 0, y: 1}, {x: 0, y: -1});
            } else {
                // 如果主要是垂直移动，尝试水平侧移
                sidestepDirections.push({x: 1, y: 0}, {x: -1, y: 0});
            }
            
            // 添加其他方向作为备选
            sidestepDirections.push(...directions.filter(d => 
                !sidestepDirections.some(sd => sd.x === d.x && sd.y === d.y)
            ));
            
            for (const dir of sidestepDirections) {
                const newX = this.position.x + dir.x;
                const newY = this.position.y + dir.y;
                
                if (this.getWorld().isWalkable(newX, newY)) {
                    const newCoord: Coordinate = {x: newX, y: newY};
                    
                    if (!this._isPositionOccupied(newCoord, agents)) {
                        // 插入新的步骤到路径开头
                        this.path.unshift(newCoord);
                        return;
                    }
                }
            }
        }
    }

    private _handleObstacleAdvanced(agents: OptimizedAgent[]) {
        this.blockedTicks++;

        // 如果被阻挡太久，尝试多种策略
        if (this.blockedTicks > 10 && this.targetPosition) {
            // 策略1：重新规划路径
            const newPath = this.world.findPath(this.position, this.targetPosition);
            if (newPath && newPath.length > 0) {
                this.path = newPath;
                this.blockedTicks = 0;
                return;
            }
        }

        // 策略2：如果仍然被阻挡，尝试侧移
        if (this.blockedTicks > 15) {
            this._attemptSidestep(agents);
        }

        // 策略3：如果还是不行，放弃并重置
        if (this.blockedTicks > 30) {
            this.stop();
            this.conversation = "Too crowded! Finding alternative route...";
            this.conversationTTL = 30;
            
            // 可能尝试一个附近的随机位置
            if (this.targetPosition) {
                this._findNearbyAlternative(this.targetPosition);
            }
        }
    }

    private _findNearbyAlternative(target: Coordinate) {
        // 寻找目标位置附近的替代位置
        const maxDistance = 3;
        for (let distance = 1; distance <= maxDistance; distance++) {
            // 尝试四个方向
            const alternatives = [
                {x: target.x + distance, y: target.y},
                {x: target.x - distance, y: target.y},
                {x: target.x, y: target.y + distance},
                {x: target.x, y: target.y - distance}
            ];
            
            for (const alt of alternatives) {
                if (this.getWorld().isWalkable(alt.x, alt.y)) {
                    // 设置一个新的目标位置
                    this.moveTo(alt);
                    return;
                }
            }
        }
    }
}