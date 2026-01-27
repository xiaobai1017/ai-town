
import { Agent } from '../engine/Agent';
import { generateResponse } from '@/lib/llm';

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

                // Check distance and random chance
                if (this.isClose(a, b) && a.state !== 'TALKING' && b.state !== 'TALKING' && Math.random() < 0.02) {
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
            const promptA = `You are ${a.name}, a ${a.role}. You meet ${b.name}, a ${b.role}. Say something short (max 10 words) to them.`;
            const textA_Final = await generateResponse('qwen3:4b', promptA);
            console.log('Agent A said:', textA_Final);

            const promptB = `You are ${b.name}, a ${b.role}. ${a.name} just said: "${textA_Final}". meaningful reply (max 10 words).`;
            const textB_Final = await generateResponse('qwen3:4b', promptB);
            console.log('Agent B said:', textB_Final);

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
