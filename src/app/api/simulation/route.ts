/**
 * 仿真运行时路由处理
 * @author hubin
 */

import { NextResponse } from 'next/server';
import { SimulationRuntime } from '@/server/simulation/SimulationRuntime';

export const runtime = 'nodejs';

const globalForSimulation = globalThis as typeof globalThis & { aiTownSimulation?: SimulationRuntime };

function getSimulation(): SimulationRuntime {
  if (!globalForSimulation.aiTownSimulation) {
    globalForSimulation.aiTownSimulation = new SimulationRuntime();
  }
  return globalForSimulation.aiTownSimulation;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('reset') === '1') {
    if (globalForSimulation.aiTownSimulation) {
      try {
        globalForSimulation.aiTownSimulation.destroy();
      } catch {}
    }
    globalForSimulation.aiTownSimulation = new SimulationRuntime();
  }
  const simulation = getSimulation();
  return NextResponse.json(simulation.snapshot());
}

export async function POST(request: Request) {
  const command = await request.json();
  if (command.type === 'reset') {
    if (globalForSimulation.aiTownSimulation) {
      try {
        globalForSimulation.aiTownSimulation.destroy();
      } catch {}
    }
    const newSimulation = new SimulationRuntime();
    globalForSimulation.aiTownSimulation = newSimulation;
    return NextResponse.json(newSimulation.snapshot());
  }

  const simulation = getSimulation();
  return NextResponse.json(simulation.command(command));
}
