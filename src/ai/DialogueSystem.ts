/**
 * 居民对话生成系统（支持中英文多语言智能提示词与对话）
 * @author hubin
 */

import { Agent } from '../engine/Agent';
import { generateResponse } from '@/lib/llm';
import { LLM_MODEL } from '@/lib/config';
import { getLanguage, t } from '@/lib/i18nCore';
import { loadModelSettings } from '@/lib/modelSettings';

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
        // 若系统配置关闭了对话功能，完全不触发居民交谈与大模型调用
        if (!loadModelSettings().llm.enabled) {
            return;
        }
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
    private getMood(agent: Agent, isZh: boolean): string {
        const moods: string[] = [];
        
        if (isZh) {
            // Health-based moods (中文)
            if (agent.health >= 90) moods.push("充满活力", "神清气爽", "精力充沛");
            else if (agent.health >= 70) moods.push("良好", "平和", "惬意");
            else if (agent.health >= 50) moods.push("略有疲惫", "有些困倦");
            else moods.push("身体虚弱", "有些不适");

            // Hunger-based moods (中文)
            if (agent.hunger >= 80) moods.push("饥肠辘辘", "饥饿难耐");
            else if (agent.hunger >= 50) moods.push("肚子有点饿", "想找点吃的");
            else moods.push("心满意足", "吃得很饱");

            // Relationship-based moods (中文)
            if (agent.lastSentiment === 'POS') moods.push("心情愉悦", "非常开心");
            else if (agent.lastSentiment === 'NEG') moods.push("有些低落", "略带沮丧");

            if (moods.length === 0) moods.push("平静从容", "闲适自在");
        } else {
            // Health-based moods (English)
            if (agent.health >= 90) moods.push("energetic", "vibrant", "lively");
            else if (agent.health >= 70) moods.push("good", "fine", "well");
            else if (agent.health >= 50) moods.push("tired", "weary", "fatigued");
            else moods.push("unwell", "sick", "weak");

            // Hunger-based moods (English)
            if (agent.hunger >= 80) moods.push("hungry", "starving", "ravenous");
            else if (agent.hunger >= 50) moods.push("peckish", "hungry");
            else moods.push("satisfied", "full", "content");

            // Relationship-based moods (English)
            if (agent.lastSentiment === 'POS') moods.push("happy", "pleased", "joyful");
            else if (agent.lastSentiment === 'NEG') moods.push("upset", "sad", "disappointed");

            if (moods.length === 0) moods.push("neutral", "calm", "relaxed");
        }
        
        return moods[Math.floor(Math.random() * moods.length)];
    }

    /**
     * Expose a small, human-readable slice of the latest decision to dialogue.
     */
    private getDecisionHint(agent: Agent, include: boolean, isZh: boolean): string {
        if (!include || !agent.jevIntent || agent.jevIntent.status === 'fallback' || agent.jevIntent.type === 'LOCAL_RULE') return '';
        
        if (isZh) {
            const labelsZh: Record<string, string> = {
                WORK: '努力工作赚钱',
                EAT: '去餐厅找点好吃的补充体力',
                SLEEP: '回家好好休息',
                SHOP: '去商场大购物提升魅力',
                LIBRARY: '去图书馆安静阅读提升个人素养',
                TREAT: '去医院找医生检查治疗',
                BANK: '去银行办理财务和资金存取',
                WANDER: '在小镇街道上散步漫游',
                WAIT: '稍作等待观察时机'
            };
            const plan = labelsZh[agent.jevIntent.type] || agent.jevIntent.type;
            return `你当前的个人打算正是${plan}。如果时机合适可以自然聊到，但绝不要提及这是AI决策。`;
        }

        const labelsEn: Record<string, string> = {
            WORK: 'work and earn money', EAT: 'find food and recover', SLEEP: 'rest at home',
            SHOP: 'shop at the Mall to grow charm', LIBRARY: 'read at the Library to grow charm steadily',
            TREAT: 'visit the Hospital to recover', BANK: 'manage money at the Bank',
            WANDER: 'wander around town', WAIT: 'wait for a better opportunity'
        };
        const plan = labelsEn[agent.jevIntent.type] || agent.jevIntent.type.toLowerCase();
        return `Your current personal plan is to ${plan}. You may mention it naturally if relevant, but do not describe it as an AI decision.`;
    }

    // Get random conversation topics based on roles, relationship, and time
    private getRandomTopics(roleA: string, roleB: string, relationship: string, hour: number, isZh: boolean): string[] {
        const allTopics: string[] = [];
        
        if (isZh) {
            if (roleA === 'Baker' || roleB === 'Baker') {
                allTopics.push(hour < 10 ? "早炉新鲜面包" : "今日特色烘焙糕点");
            }
            if (roleA === 'Librarian' || roleB === 'Librarian') {
                allTopics.push("新到的书卷典籍", "安静阅读的乐趣");
            }
            if (roleA === 'Doctor' || roleB === 'Doctor') {
                allTopics.push("换季健康保养", "居民身心状态");
            }
            if (roleA === 'Police' || roleB === 'Police') {
                allTopics.push("小镇近日治安", "社区巡逻轶事");
            }
            if (roleA === 'Mayor' || roleB === 'Mayor') {
                allTopics.push("小镇建设规划", "提升居民幸福感");
            }
            if (roleA === 'Gardener' || roleB === 'Gardener') {
                allTopics.push("花园花期与繁花", "植被修剪打理");
            }
            if (roleA === 'Artist' || roleB === 'Artist') {
                allTopics.push("艺术灵感与画作", "小镇光影之美");
            }

            if (relationship.includes('friend') || relationship.includes('友')) {
                allTopics.push("近来心境与打算", "共同的美好回忆");
            } else {
                allTopics.push("小镇晴好天气", "街头新鲜见闻");
            }

            if (hour < 11) allTopics.push("晨光微风", "香浓早咖啡");
            else if (hour < 15) allTopics.push("午餐打算", "午后闲适时光");
            else if (hour < 19) allTopics.push("傍晚余晖", "晚餐规划");
            else allTopics.push("小镇静谧夜色", "明日安排");
        } else {
            if (roleA === 'Baker' || roleB === 'Baker') {
                allTopics.push(hour < 10 ? "fresh bread" : "day's specials");
            }
            if (roleA === 'Librarian' || roleB === 'Librarian') {
                allTopics.push("new books", "library events");
            }
            if (roleA === 'Doctor' || roleB === 'Doctor') {
                allTopics.push("health tips", "medical advances");
            }
            if (roleA === 'Police' || roleB === 'Police') {
                allTopics.push("town safety", "community watch");
            }
            if (roleA === 'Mayor' || roleB === 'Mayor') {
                allTopics.push("town improvements", "local politics");
            }
            if (roleA === 'Gardener' || roleB === 'Gardener') {
                allTopics.push("plant care", "seasonal blooms");
            }
            if (roleA === 'Artist' || roleB === 'Artist') {
                allTopics.push("creative inspiration", "local art scene");
            }

            if (relationship.includes('friend')) {
                allTopics.push("personal life", "shared memories");
            } else {
                allTopics.push("weather", "local events");
            }

            if (hour < 11) allTopics.push("morning coffee", "daily plans");
            else if (hour < 15) allTopics.push("lunch plans", "midday activities");
            else if (hour < 19) allTopics.push("afternoon tea", "evening plans");
            else allTopics.push("late night", "tomorrow's plans");
        }

        this.shuffleArray(allTopics);
        return allTopics.slice(0, Math.min(3, allTopics.length));
    }

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

        // Set high TTL so agents stay in place for a few frames while LLM responds
        a.conversationTTL = 100;
        b.conversationTTL = 100;

        try {
            const lang = getLanguage();
            const isZh = lang === 'zh';

            const intimacyA = a.relationships[b.id] || 0;
            const intimacyB = b.relationships[a.id] || 0;

            const relationshipA = isZh
                ? (intimacyA > 80 ? "挚友" : intimacyA > 40 ? "朋友" : "熟人")
                : (intimacyA > 80 ? "best friend" : intimacyA > 40 ? "friend" : "acquaintance");

            const relationshipB = isZh
                ? (intimacyB > 80 ? "挚友" : intimacyB > 40 ? "朋友" : "熟人")
                : (intimacyB > 80 ? "best friend" : intimacyB > 40 ? "friend" : "acquaintance");

            const descA = isZh ? (t(`agent.descriptions.${a.name}`) || a.description) : a.description;
            const descB = isZh ? (t(`agent.descriptions.${b.name}`) || b.description) : b.description;
            const roleA = isZh ? (t(`agent.roles.${a.role}`) || a.role) : a.role;
            const roleB = isZh ? (t(`agent.roles.${b.role}`) || b.role) : b.role;

            const historyA = a.conversationHistory[b.id] || [];
            const historyStrA = historyA.length > 0 
                ? (isZh ? `你们以往的交流片段：${historyA.join('；')}` : `Your past interactions with ${b.name}: ${historyA.join('; ')}.`)
                : '';

            const hour = Math.floor(gameTime / 60) % 24;
            const minute = gameTime % 60;
            const timeDescZh = hour < 6 ? `凌晨 ${hour}:${minute}` : hour < 12 ? `上午 ${hour}:${minute}` : hour < 18 ? `下午 ${hour}:${minute}` : `傍晚 ${hour}:${minute}`;
            const timeDescEn = `${hour}:${minute.toString().padStart(2, '0')} ${hour < 6 ? "early morning" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}`;
            const timeDescription = isZh ? timeDescZh : timeDescEn;

            const topics = this.getRandomTopics(a.role, b.role, relationshipA, hour, isZh);
            const topicHint = topics.length > 0 
                ? (isZh ? `可以聊到的话题例如：${topics.join('、')}。` : `Consider topics like: ${topics.join(', ')}.`)
                : '';

            const includeDecisionHints = Math.random() < 0.6;
            const decisionHintA = this.getDecisionHint(a, includeDecisionHints, isZh);
            const decisionHintB = this.getDecisionHint(b, includeDecisionHints, isZh);

            let promptA = '';
            if (isZh) {
                promptA = `你是${a.name}（${descA}），职务是${roleA}。你当前心情${this.getMood(a, true)}。
现在是小镇时间${timeDescription}，你迎面遇到了你的${relationshipA}${b.name}（${descB}）。
${historyStrA}
${topicHint}
${decisionHintA}
请用生动自然简练的口语中文说一句话（严格控制在20个字以内），符合你的身份性格、当前心情与小镇时间。`;
            } else {
                promptA = `You are ${a.name} (${a.description}). You are feeling ${this.getMood(a, false)}. 
It's ${timeDescription}, and you meet ${b.name} (${b.description}), who is your ${relationshipA}. 
${historyStrA} 
${topicHint}
${decisionHintA}
Say something vivid and expressive (max 15 words) matching your personality, current mood, and the time of day.`;
            }

            const textA_Raw = await generateResponse(LLM_MODEL, promptA);
            const textA_Final = textA_Raw.trim();
            console.log('Agent A said:', textA_Final);

            const historyB = b.conversationHistory[a.id] || [];
            const historyStrB = historyB.length > 0 
                ? (isZh ? `你们以往的交流片段：${historyB.join('；')}` : `Your past interactions with ${a.name}: ${historyB.join('; ')}.`)
                : '';

            let promptB = '';
            if (isZh) {
                promptB = `你是${b.name}（${descB}），职务是${roleB}。你当前心情${this.getMood(b, true)}。
现在是小镇时间${timeDescription}，你的${relationshipB}${a.name}对你说：“${textA_Final}”。
${historyStrB}
${decisionHintB}
请用生动口语中文回应（严格控制在20个字以内），契合你的性格与当前心情。
【重要规则】必须且只能在回复最开头加上一个情感标签：[POS]（满意/开心/赞同）、[NEU]（平淡/中立）或 [NEG]（不满/生气/反感）。例如：[POS] 早上好呀！今天阳光真不错。`;
            } else {
                promptB = `You are ${b.name} (${b.description}). You are feeling ${this.getMood(b, false)}. 
It's ${timeDescription}, and ${a.name} (${a.description}), your ${relationshipB}, said: "${textA_Final}". 
${historyStrB}
${decisionHintB}
Reply vividly and expressively (max 15 words) matching your personality, current mood, and the time of day. 
Also, strictly start with a tag: [POS], [NEU], or [NEG] based on your reaction.`;
            }

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
