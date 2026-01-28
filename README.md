# 🏙️ AI Town Simulation

An interactive virtual town simulation powered by local Large Language Models (LLMs) and a robust behavioral engine. Agents with unique roles, personalities, and survival needs live, work, and interact in a dynamic grid-based world.

![Next.js](https://img.shields.io/badge/Next.js-15+-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![Local LLM](https://img.shields.io/badge/Ollama-Qwen3-orange)

## 🌟 Features

### 🧠 Advanced Behavioral AI
*   **Survival Needs**: Agents manage hunger, health, and energy. Neglecting these can lead to starvation or illness.
*   **Daily Routines**: Built-in schedules for work (8 AM - 5 PM), leisure (5 PM - 10 PM), and sleep (10 PM - 8 AM).
*   **Dynamic State Machine**: Agents transition between `IDLE`, `WORKING`, `EATING`, `BANKING`, `SHOPPING`, `TREATING`, and `CRIMINAL` states.
*   **Unique Personalities**: Each resident has a specific role (Baker, Doctor, Police, etc.), distinct color, and emoji representation.

### 💰 Complex Economic System
*   **Interactive Banking**: Agents deposit savings, earn interest, and take out emergency loans to survive.
*   **Real-time Markets**: Buildings like the Bakery, Restaurant, and Mall have dynamic revenue tracking based on agent purchases.
*   **Global Variables**: Live sliders to adjust **Wages**, **Price Levels**, and **Accident Risk** multipliers.

### 🗣️ Dynamic Social Engine
*   **LLM Conversations**: Proximity-based interactions powered by local models (Ollama).
*   **Chat History**: Detailed logs of dialogues with the ability to view historical conversations between specific residents.
*   **Behavioral Impact**: Conversations and social states are reflective of the agent's current surroundings and status.

### 🗺️ Visual Town Engine
*   **Canvas Rendering**: High-performance HTML5 Canvas rendering for smooth movement and state visualization.
*   **Grid World**: A 2D town map featuring specialized locations (Bank, Hospital, Mall, Houses, etc.).
*   **Pathfinding**: Intelligent navigation for agents to reach their daily targets.

### 💀 The Tragedy System
*   **Life & Death**: Random illness, workplace accidents, and starvation risks controlled by the global Risk Level.
*   **Police & Crime**: Non-police agents may sporadically commit crimes, leading to arrests and jail time.
*   **Extinction Event**: A dedicated UI overlay tracks the "Final Census" and cause of death if the entire town population passes away.

## 🛠️ Tech Stack

*   **Framework**: Next.js 15+ (App Router)
*   **Language**: TypeScript
*   **State/Physics**: React Hooks + custom Behavioral Engine
*   **Rendering**: HTML5 Canvas API
*   **Styling**: TailwindCSS + Lucide Icons
*   **AI Core**: Ollama (Local LLM: Qwen3:0.6b)

## 🚀 Getting Started

### 1. Prerequisites
*   **Node.js**: 18.x or later.
*   **Ollama**: Install from [ollama.com](https://ollama.com/).

### 2. Configure Local LLM
The simulation requires a local LLM to handle agent dialogues.
```bash
# Pull the recommended model
ollama run qwen3:0.6b
```
*The application connects to Ollama at `http://localhost:11434` by default.*

### 3. Installation
```bash
# Clone the repository and install dependencies
npm install

# Start the development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the simulation.

## 📁 Project Structure

*   `src/engine/`: Core grid world (`World.ts`) and agent physics (`Agent.ts`).
*   `src/ai/`: Decision-making (`BehaviorSystem.ts`) and NPC dialogue (`DialogueSystem.ts`).
*   `src/components/`: UI components including the Game Canvas and Inspector Panels.
*   `src/data/`: Town scripts, building definitions, and initial world state.
*   `src/hooks/`: The `useGameLoop` hook that drives the entire simulation logic.
*   `src/lib/`: LLM connectivity and configuration.

## ⚙️ Simulation Controls

*   **Speed**: Toggle between 1x (Normal), 5x (Fast), and 20x (Super Fast) simulation speed.
*   **Economy**: 
    *   `Wages`: Higher wages increase agent income rates.
    *   `Prices`: Increases the cost of food, luxury items, and medical care.
    *   `Risk`: Multiplies the probability of sickness and sudden accidents.
*   **Census**: Add or remove residents dynamically via the header controls.

---
*Created for experimenting with agentic behavior and local AI systems.*

