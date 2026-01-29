
import { Agent } from '../engine/Agent';
import { generateResponse } from '@/lib/llm';
import { LLM_MODEL } from '@/lib/config';

export interface DialoguePacket {
    speaker: string;
    listener: string;
    text: string;
    timestamp: string;
}

export class DialogueSystem {
    dialogueLog: DialoguePacket[] = [];
    isGenerating: boolean = false;

    constructor() { }

    // Check if agents are close enough to talk and if they should talk
    update(agents: Agent[], gameTime: number) {
        if (this.isGenerating) return; // Don't start new ones if busy (simple throttle)

        for (let i = 0; i < agents.length; i++) {
            for (let j = i + 1; j < agents.length; j++) {
                const a = agents[i];
                const b = agents[j];

                // Check distance and random chance, and ensure they are not sleeping
                if (this.isClose(a, b) &&
                    a.state !== 'TALKING' && b.state !== 'TALKING' &&
                    a.state !== 'SLEEPING' && b.state !== 'SLEEPING' &&
                    a.state !== 'DEAD' && b.state !== 'DEAD' &&
                    Math.random() < 0.02) {
                    this.startConversation(a, b, gameTime);
                    return; // One per tick to avoid spam
                }
            }
        }
    }

    isClose(a: Agent, b: Agent): boolean {
        const dist = Math.abs(a.position.x - b.position.x) + Math.abs(a.position.y - b.position.y);
        return dist <= 2;
    }

    // Get agent's current mood based on health, hunger, and recent interactions
    private getMood(agent: Agent): string {
        const moods = [];
        
        // Health-based moods
        if (agent.health >= 90) moods.push("energetic", "vibrant", "lively");
        else if (agent.health >= 70) moods.push("good", "fine", "well");
        else if (agent.health >= 50) moods.push("tired", "weary", "fatigued");
        else moods.push("unwell", "sick", "weak");
        
        // Hunger-based moods
        if (agent.hunger >= 80) moods.push("hungry", "starving", "ravenous");
        else if (agent.hunger >= 50) moods.push("peckish", "hungry");
        else moods.push("satisfied", "full", "content");
        
        // Relationship-based moods
        if (agent.lastSentiment === 'POS') moods.push("happy", "pleased", "joyful");
        else if (agent.lastSentiment === 'NEG') moods.push("upset", "sad", "disappointed");
        
        // Random mood if no specific conditions
        if (moods.length === 0) {
            moods.push("neutral", "calm", "relaxed");
        }
        
        return moods[Math.floor(Math.random() * moods.length)];
    }

    // Get random conversation topics based on roles, relationship, and time
    private getRandomTopics(roleA: string, roleB: string, relationship: string, hour: number): string[] {
        const allTopics = [];
        
        // Role-specific topics
        if (roleA === 'Baker' || roleB === 'Baker') {
            if (hour < 10) {
                allTopics.push("fresh bread", "morning baking", "breakfast pastries");
            } else {
                allTopics.push("day's specials", "baking techniques", "customer favorites");
            }
        }
        if (roleA === 'Librarian' || roleB === 'Librarian') {
            allTopics.push("new books", "reading recommendations", "library events");
        }
        if (roleA === 'Doctor' || roleB === 'Doctor') {
            allTopics.push("health tips", "community wellness", "medical advances");
        }
        if (roleA === 'Police' || roleB === 'Police') {
            allTopics.push("town safety", "community watch", "recent incidents");
        }
        if (roleA === 'Mayor' || roleB === 'Mayor') {
            allTopics.push("town improvements", "community events", "local politics");
        }
        if (roleA === 'Gardener' || roleB === 'Gardener') {
            if (hour < 12) {
                allTopics.push("morning gardening", "plant care", "seasonal blooms");
            } else {
                allTopics.push("garden maintenance", "landscape design", "flower arrangements");
            }
        }
        if (roleA === 'Artist' || roleB === 'Artist') {
            allTopics.push("art projects", "creative inspiration", "local art scene");
        }
        
        // Relationship-based topics
        if (relationship === "best friend") {
            allTopics.push("personal life", "shared memories", "future plans");
        } else if (relationship === "friend") {
            allTopics.push("hobbies", "town news", "mutual interests");
        } else {
            allTopics.push("weather", "local events", "recent happenings");
        }
        
        // Time-specific topics (game time)
        if (hour < 6) {
            allTopics.push("late night", "sleep", "early morning plans");
        } else if (hour < 10) {
            allTopics.push("morning coffee", "breakfast", "daily plans", "commute", "work start");
        } else if (hour < 14) {
            allTopics.push("lunch plans", "work progress", "midday activities", "meeting", "projects");
        } else if (hour < 18) {
            allTopics.push("afternoon tea", "workday", "evening plans", "shopping", "errands");
        } else if (hour < 22) {
            allTopics.push("dinner", "evening activities", "tomorrow's plans", "relaxation", "entertainment");
        } else {
            allTopics.push("late night", "sleep", "rest", "tomorrow's plans");
        }
        
        // Shuffle and return up to 3 topics
        this.shuffleArray(allTopics);
        return allTopics.slice(0, Math.min(3, allTopics.length));
    }

    // Helper method to shuffle arrays
    private shuffleArray(array: any[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    async startConversation(a: Agent, b: Agent, gameTime: number) {
        this.isGenerating = true;
        a.state = 'TALKING';
        b.state = 'TALKING';

        // Placeholder while generating
        a.conversation = "...";
        b.conversation = "...";
        a.conversationTTL = 100;
        b.conversationTTL = 100;

        try {
            const intimacyA = a.relationships[b.id] || 0;
            const intimacyB = b.relationships[a.id] || 0;

            const relationshipA = intimacyA > 80 ? "best friend" : intimacyA > 40 ? "friend" : "acquaintance";
            const relationshipB = intimacyB > 80 ? "best friend" : intimacyB > 40 ? "friend" : "acquaintance";

            const historyA = a.conversationHistory[b.id] || [];
            const historyStrA = historyA.length > 0 ? `Your past interactions with ${b.name}: ${historyA.join('; ')}.` : '';

            // Get game time context (gameTime is in minutes)
            const hour = Math.floor(gameTime / 60) % 24;
            const minute = gameTime % 60;
            const timeOfDay = hour < 6 ? "early morning" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
            const timeDescription = `${hour}:${minute.toString().padStart(2, '0')} ${timeOfDay}`;

            // Add random conversation topics based on relationship, roles, and time
            const topics = this.getRandomTopics(a.role, b.role, relationshipA, hour);
            const topicHint = topics.length > 0 ? `Consider topics like: ${topics.join(', ')}.` : '';

            const promptA = `You are ${a.name} (${a.description}). You are feeling ${this.getMood(a)}. 
            It's ${timeDescription}, and you meet ${b.name} (${b.description}), who is your ${relationshipA}. 
            ${historyStrA} 
            ${topicHint}
            Say something vivid and expressive (max 15 words) matching your personality, current mood, and the time of day.`;
            const textA_Raw = await generateResponse(LLM_MODEL, promptA);
            const textA_Final = textA_Raw.trim();
            console.log('Agent A said:', textA_Final);

            const historyB = b.conversationHistory[a.id] || [];
            const historyStrB = historyB.length > 0 ? `Your past interactions with ${a.name}: ${historyB.join('; ')}.` : '';

            const promptB = `You are ${b.name} (${b.description}). You are feeling ${this.getMood(b)}. 
            It's ${timeDescription}, and ${a.name} (${a.description}), your ${relationshipB}, said: "${textA_Final}". 
            ${historyStrB}
            Reply vividly and expressively (max 15 words) matching your personality, current mood, and the time of day. 
            Also, strictly start with a tag: [POS], [NEU], or [NEG] based on your reaction.`;
            const textB_Raw = await generateResponse(LLM_MODEL, promptB);

            let sentiment: 'POS' | 'NEG' | 'NEU' = 'NEU';
            let textB_Final = textB_Raw.trim();

            if (textB_Final.includes('[POS]')) { sentiment = 'POS'; }
            else if (textB_Final.includes('[NEG]')) { sentiment = 'NEG'; }

            // Clean all possible sentiment tags from the text
            textB_Final = textB_Final.replace(/\[POS\]|\[NEG\]|\[NEU\]/g, '').trim();

            console.log('Agent B reaction:', sentiment);
            a.lastSentiment = sentiment;
            b.lastSentiment = sentiment;

            // Change intimacy based on sentiment
            let delta = sentiment === 'POS' ? 6 : sentiment === 'NEG' ? -4 : 1;
            delta += Math.floor(Math.random() * 3) - 1; // Random noise

            a.relationships[b.id] = Math.max(0, Math.min(100, (a.relationships[b.id] || 0) + delta));
            b.relationships[a.id] = Math.max(0, Math.min(100, (b.relationships[a.id] || 0) + delta));

            // Update conversation history (keep last 5)
            const updateHistory = (agent: Agent, otherId: string, message: string) => {
                const h = agent.conversationHistory[otherId] || [];
                h.push(message);
                if (h.length > 5) h.shift();
                agent.conversationHistory[otherId] = h;
            };
            updateHistory(a, b.id, `${a.name}: ${textA_Final}`);
            updateHistory(a, b.id, `${b.name}: ${textB_Final}`);
            updateHistory(b, a.id, `${a.name}: ${textA_Final}`);
            updateHistory(b, a.id, `${b.name}: ${textB_Final}`);

            this.dialogueLog.push({
                speaker: a.name,
                listener: b.name,
                text: textA_Final,
                timestamp: new Date().toLocaleTimeString()
            });

            this.dialogueLog.push({
                speaker: b.name,
                listener: a.name,
                text: textB_Final,
                timestamp: new Date().toLocaleTimeString()
            });

            a.conversation = textA_Final;
            b.conversation = textB_Final;
            a.conversationTTL = 80;
            b.conversationTTL = 80;

        } catch (e) {
            console.error(e);
            a.state = 'IDLE';
            b.state = 'IDLE';
        } finally {
            this.isGenerating = false;
        }
    }
}
