
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
    update(agents: Agent[]) {
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
                    this.startConversation(a, b);
                    return; // One per tick to avoid spam
                }
            }
        }
    }

    isClose(a: Agent, b: Agent): boolean {
        const dist = Math.abs(a.position.x - b.position.x) + Math.abs(a.position.y - b.position.y);
        return dist <= 2;
    }

    async startConversation(a: Agent, b: Agent) {
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

            const promptA = `You are ${a.name} (${a.description}). You meet ${b.name} (${b.description}), who is your ${relationshipA}. 
            ${historyStrA} 
            Say something vivid and expressive (max 15 words) matching your personality.`;
            const textA_Raw = await generateResponse(LLM_MODEL, promptA);
            const textA_Final = textA_Raw.trim();
            console.log('Agent A said:', textA_Final);

            const historyB = b.conversationHistory[a.id] || [];
            const historyStrB = historyB.length > 0 ? `Your past interactions with ${a.name}: ${historyB.join('; ')}.` : '';

            const promptB = `You are ${b.name} (${b.description}). ${a.name} (${a.description}), your ${relationshipB}, said: "${textA_Final}". 
            ${historyStrB}
            Reply vividly and expressively (max 15 words). Also, strictly start with a tag: [POS], [NEU], or [NEG] based on your reaction.`;
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
