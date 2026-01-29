# 🏙️ AI Town Simulation

An interactive virtual town simulation powered by local Large Language Models (LLMs) and a robust behavioral engine. Agents with unique roles, personalities, and survival needs live, work, and interact in a dynamic grid-based world. Now featuring a new Charm system for social status competition!

![Next.js](https://img.shields.io/badge/Next.js-16+-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![Local LLM](https://img.shields.io/badge/Ollama-Qwen3-orange)
![Charm System](https://img.shields.io/badge/Charm-Competition-purple)

## 🌟 Features

### 🧠 Advanced Behavioral AI
*   **Survival Needs**: Agents manage hunger, health, and energy. Neglecting these can lead to starvation or illness.
*   **Hunger System**: Optimized to take approximately 3 days to reach maximum hunger, allowing for more balanced gameplay.
*   **Priority System**: Hunger now takes priority over all other needs, ensuring agents always seek food when hungry.
*   **Daily Routines**: Built-in schedules for work (8 AM - 5 PM), leisure (5 PM - 10 PM), and sleep (10 PM - 8 AM).
*   **Dynamic State Machine**: Agents transition between `IDLE`, `WORKING`, `EATING`, `BANKING`, `SHOPPING`, `TREATING`, and `CRIMINAL` states.
*   **Unique Personalities**: Each resident has a specific role (Baker, Doctor, Police, etc.), distinct color, and emoji representation.

### 💰 Complex Economic System
*   **Interactive Banking**: Agents deposit savings, earn interest, and take out emergency loans to survive.
*   **Real-time Markets**: Buildings like the Bakery, Restaurant, and Mall have dynamic revenue tracking based on agent purchases.
*   **Global Variables**: Live sliders to adjust **Wages**, **Price Levels**, and **Accident Risk** multipliers.

### 👑 Charm System (New!)
*   **Social Status**: Agents increase their charm level by shopping at the Mall.
*   **Rankings**: Real-time charm leaderboard displays the top 3 residents with the highest social status.
*   **Game End Condition**: The simulation ends when any resident reaches maximum charm (100 points).
*   **Final Ranking**: Complete leaderboard at game end, including deceased residents, sorted by charm level.
*   **Priority Shopping**: Wealthy agents with basic needs met will prioritize shopping to increase their social status.

### 🗣️ Dynamic Social Engine
*   **LLM Conversations**: Proximity-based interactions powered by local models (Ollama).
*   **Context-Aware Dialogue**: Conversations now consider game time, agent mood, and relationship status.
*   **Chat History**: Detailed logs of dialogues with the ability to view historical conversations between specific residents.
*   **Behavioral Impact**: Conversations and social states are reflective of the agent's current surroundings and status.

### 🗺️ Visual Town Engine
*   **Canvas Rendering**: High-performance HTML5 Canvas rendering for smooth movement and state visualization.
*   **Grid World**: A 2D town map featuring specialized locations (Bank, Hospital, Mall, Houses, etc.).
*   **Optimized Layout**: Park relocated to open space for better navigation and building placement.
*   **Pathfinding**: Intelligent navigation for agents to reach their daily targets.

### 💀 The Tragedy System
*   **Life & Death**: Random illness, workplace accidents, and starvation risks controlled by the global Risk Level.
*   **Police & Crime**: Non-police agents may sporadically commit crimes, leading to arrests and jail time.
*   **Extinction Event**: A dedicated UI overlay tracks the "Final Census" and cause of death if the entire town population passes away.
*   **Death Inclusion**: Deceased residents still participate in the final charm rankings.

## 🛠️ Tech Stack

*   **Framework**: Next.js 16.1.5 (App Router)
*   **Language**: TypeScript 5.0
*   **State/Physics**: React Hooks + custom Behavioral Engine
*   **Rendering**: HTML5 Canvas API
*   **Styling**: TailwindCSS 4.0 + Lucide Icons
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
*   **Charm Rankings**: View real-time charm leaderboard in the header section.

## 🎯 Game Objectives

1. **Survival**: Keep residents alive by ensuring they eat, work, and maintain their health.
2. **Prosperity**: Help residents accumulate wealth through work and smart financial decisions.
3. **Social Status**: Watch residents compete to increase their charm level through shopping.
4. **Victory**: Be the first resident to reach maximum charm (100 points) and become the Charm Champion!

---
*Created for experimenting with agentic behavior, local AI systems, and social status dynamics.*

