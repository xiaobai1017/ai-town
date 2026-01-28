# AI Town Simulation

An interactive virtual town simulation powered by local Large Language Models (LLMs). Agents with unique roles and personalities live, work, and converse with each other based on a simulated daily cycle.

## Features

- **Autonomous Agents**: Characters like Bakers and Librarians follow daily routines (working, sleeping, wandering).
- **Interactive Dialogue**: Agents engage in conversations when they are in close proximity, using LLM-generated speech.
- **Dynamic World**: A grid-based map with locations (Bakery, Library, Park, etc.) and real-time pathfinding.
- **Visual Interface**: A high-performance HTML5 Canvas rendering engine for smooth gameplay and state visualization.

## Architecture

- **Engine**: Handles the grid system, pathfinding, and agent state management.
- **Behavior System**: Manages time-based decision making for all agents.
- **Dialogue System**: Coordinates LLM-driven interactions between characters.
- **Frontend**: Built with Next.js and React for a modern, responsive experience.

## LLM Configuration

This project relies on **Ollama** to serve local Large Language Models for agent dialogue.

### 1. Install Ollama
Download and install Ollama from [ollama.com](https://ollama.com/).

### 2. Download the Model
The simulation is currently optimized for **Qwen3 (0.6B)**. Run the following command in your terminal:

```bash
ollama run qwen3:0.6b
```

### 3. API Access
The application expects Ollama to be running on its default local endpoint: `http://localhost:11434`.

## Getting Started

### Prerequisites
- Node.js 18.x or later
- Ollama (running qwen3:0.6b)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript
- **State/Rendering**: React Hooks + HTML5 Canvas
- **AI Core**: Ollama (Qwen3:0.6b)
