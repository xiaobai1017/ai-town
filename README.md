# AI Town Simulation

[中文文档](README.zh-CN.md)

An interactive virtual-town simulator where residents work, eat, shop, talk, manage money, and respond to changing needs in a living grid-based world.

The project combines deterministic local rules with optional TypeSafe Jev AI decisions. Jev suggests ordinary next actions; safety-critical behavior remains controlled by the local simulation engine.

## Features

- Resident needs: hunger, health, cash, savings, loans, and charm.
- State machine: `IDLE`, `WORKING`, `EATING`, `BANKING`, `SHOPPING`, `TREATING`, `SLEEPING`, `CRIMINAL`, and more.
- Schedules and economy: work hours, wages, prices, interest, loans, and business revenue.
- Social simulation: local LLM conversations based on proximity, time, mood, and relationships.
- Charm competition: shopping increases charm; reaching 100 ends the simulation and creates a final ranking.
- Risk events: illness, workplace accidents, starvation, crime, arrests, and town-wide extinction.
- Canvas grid map with buildings, pathfinding, and real-time resident movement.
- Optional JEV AI: structured `jev-latest` decisions shown in each resident's inspector panel.

## Tech stack

- Next.js 16.1.5 (App Router)
- React 19 and TypeScript
- Tailwind CSS 4 and Lucide React
- HTML5 Canvas
- Ollama with `qwen3:0.6b` for local dialogue
- `@typesafe-ai/sdk` for server-side TypeSafe Jev requests

## Quick start

### Requirements

- Node.js 20 or newer (required by the TypeSafe SDK)
- npm
- Ollama, if resident dialogue is enabled

### Install and run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

### Configure Ollama

```bash
ollama run qwen3:0.6b
```

The default Ollama endpoint is `http://localhost:11434`.

## Enable JEV AI

JEV is opt-in. The simulation runs with local rules even when no API key is configured.

Create or edit `.env.local` in the project root:

```env
# Server-side only; never expose this key in client code
TYPESAFE_API_KEY=your_typesafe_api_key
TYPESAFE_DEFAULT_MODEL=jev-latest
```

Restart the development server after changing environment variables:

```bash
npm run dev
```

## Server-side simulation

The default local configuration runs the authoritative simulation in the Next.js Node server:

```env
NEXT_PUBLIC_SIMULATION_MODE=server
```

The browser now renders snapshots from `/api/simulation` and sends control commands to the server. The server owns the game clock, residents, behavior rules, dialogue, JEV calls, and financial state, so switching browser tabs no longer pauses the simulation. In a multi-instance deployment, use a dedicated persistent Node service or shared state store; a single Next.js instance is suitable for local development and single-process deployments.

Then enable the **JEV AI** checkbox in the top toolbar. For ordinary `IDLE` residents, Jev chooses one of:

`WORK`, `EAT`, `SLEEP`, `SHOP`, `TREAT`, `BANK`, `WANDER`, `WAIT`

The resident inspector shows the selected action, destination, reason, and confidence. Timeouts, invalid responses, and API errors automatically fall back to local rules.

### Safety boundary

- The API key is read only by `/api/jev/decision` on the server.
- Hunger, low health, arrests, pathfinding, and money validation stay local.
- Never commit a real API key. `.env.local` is ignored by Git.

## Commands

```bash
npm run dev       # Development server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint
npx tsc --noEmit  # TypeScript check
```

## Controls

- **Speed**: 1x, 5x, or 20x simulation speed.
- **Wages / Prices / Risk**: tune the global economy and event risk.
- **Census**: add or remove residents.
- **JEV AI**: toggle AI decisions; disabling it uses local rules only.
- **Resident inspector**: view status, finances, charm, conversations, and the latest JEV plan.

## Project layout

```text
src/
├─ ai/                         # Behavior, dialogue, and JEV providers
├─ app/api/jev/decision/       # Server-side TypeSafe SDK route
├─ components/                 # Map, controls, inspector, and rankings
├─ engine/                     # World, agents, movement, and simulation
├─ hooks/useGameLoop.ts        # React game loop and global state
└─ lib/                        # External services and utilities
```

## Troubleshooting

### `/api/jev/decision` returns 503

The server did not load `TYPESAFE_API_KEY`. Check that `.env.local` is in the project root, verify the variable name, and restart Next.js.

### `/api/jev/decision` returns 502

The request reached the TypeSafe API but failed, timed out, or returned an invalid response. Check the development-server log for `JEV decision failed`, then verify the key, account access, and network.

### Dialogue is not generated

Make sure Ollama is running and the model is installed:

```bash
ollama list
ollama run qwen3:0.6b
```

### Production build cannot download fonts

`next/font` fetches Google Fonts during the build. In an offline environment, replace the remote font in `src/app/layout.tsx` with a local font or remove that dependency. This is unrelated to JEV.

## Design goal

AI Town explores a hybrid architecture: AI provides contextual judgment, while the simulation engine owns world rules, resource constraints, and safety guarantees.
