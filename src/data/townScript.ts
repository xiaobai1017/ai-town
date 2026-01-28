
import { Agent } from '../engine/Agent';
import { World } from '../engine/World';

export const INITIAL_AGENTS = [
    { id: '1', name: 'Alice', role: 'Baker', color: '#ffadad', emoji: '👩‍🍳', start: { x: 10, y: 10 }, description: 'Loves fresh bread and early mornings.' },
    { id: '2', name: 'Bob', role: 'Librarian', color: '#ffd6a5', emoji: '👨‍🏫', start: { x: 15, y: 10 }, description: 'Knowledge is power, but silence is golden.' },
    { id: '3', name: 'Charlie', role: 'Mayor', color: '#fdffb6', emoji: '🤵', start: { x: 20, y: 10 }, description: 'Working hard to make AI Town the best place to live.' },
    { id: '4', name: 'Diana', role: 'Gardener', color: '#caffbf', emoji: '👩‍🌾', start: { x: 25, y: 10 }, description: 'Spends more time with flowers than people.' },
    { id: '5', name: 'Eve', role: 'Artist', color: '#9bf6ff', emoji: '🎨', start: { x: 5, y: 15 }, description: 'Seeing beauty in every pixel of this town.' },
    { id: '6', name: 'Frank', role: 'Doctor', color: '#a0c4ff', emoji: '👨‍⚕️', start: { x: 10, y: 15 }, description: 'Keeping the community healthy and strong.' },
    { id: '7', name: 'Officer Miller', role: 'Police', color: '#1e3a8a', emoji: '👮', start: { x: 15, y: 12 }, description: 'Vigilant protector of the peace.' },
];

export function initializeWorld(): { world: World, agents: Agent[] } {
    const world = new World(60, 40); // 60x40 grid

    // Manually add specific locations if we want more control than the random generator
    // (The generator in World.ts does some basic stuff already)

    const agents = INITIAL_AGENTS.map(data =>
        new Agent(data.id, data.name, data.role, data.start, data.color, data.emoji, data.description)
    );

    return { world, agents };
}
