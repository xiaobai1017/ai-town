import { NextResponse } from 'next/server';
import { SimulationRuntime } from '@/server/simulation/SimulationRuntime';

export const runtime = 'nodejs';

const globalForSimulation = globalThis as typeof globalThis & { aiTownSimulation?: SimulationRuntime };
const simulation = globalForSimulation.aiTownSimulation ?? new SimulationRuntime();
globalForSimulation.aiTownSimulation = simulation;

export async function GET() {
  return NextResponse.json(simulation.snapshot());
}

export async function POST(request: Request) {
  const command = await request.json();
  return NextResponse.json(simulation.command(command));
}
