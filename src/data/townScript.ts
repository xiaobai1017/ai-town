
import { Agent } from '../engine/Agent';
import { World } from '../engine/World';

export const INITIAL_AGENTS = [
    { id: '1', name: 'Alice', role: 'Baker', color: '#ffadad', emoji: '👩‍🍳', start: { x: 10, y: 10 } },
    { id: '2', name: 'Bob', role: 'Librarian', color: '#ffd6a5', emoji: '👨‍🏫', start: { x: 15, y: 10 } },
    { id: '3', name: 'Charlie', role: 'Mayor', color: '#fdffb6', emoji: '🤵', start: { x: 20, y: 10 } },
    { id: '4', name: 'Diana', role: 'Gardener', color: '#caffbf', emoji: '👩‍🌾', start: { x: 25, y: 10 } },
];

export function initializeWorld(): { world: World, agents: Agent[] } {
    const world = new World(30, 20); // 30x20 grid

    // Manually add specific locations if we want more control than the random generator
    // (The generator in World.ts does some basic stuff already)

    const agents = INITIAL_AGENTS.map(data =>
        new Agent(data.id, data.name, data.role, data.start, data.color, data.emoji)
    );

    return { world, agents };
}
