/**
 * JEV 决策核心模块
 * @author hubin
 */

import { choice, TypeSafeClient } from '@typesafe-ai/sdk';
import type { JevAction, JevDecisionContext, CharmCompetitionInfo } from './JevDecisionProvider';
import type { JevConfig } from '@/lib/modelSettings';
import { WeatherType, WEATHER_CONFIGS } from '../engine/Weather';

const envApiKey = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY;

// TypeSafeClient 实例缓存池，复用底层 TCP/TLS 与 HTTP Keep-Alive 连接
const clientCache = new Map<string, TypeSafeClient>();

function getOrCreateClient(
  apiKey: string,
  baseURL?: string,
  defaultModel?: string,
  timeoutMs: number = 15000
): TypeSafeClient {
  const model = defaultModel?.trim() || process.env.TYPESAFE_DEFAULT_MODEL || 'jev-latest';
  const url = baseURL?.trim() || process.env.TYPESAFE_BASE_URL || undefined;
  const key = `${apiKey}::${url || ''}::${model}::${timeoutMs}`;

  let client = clientCache.get(key);
  if (!client) {
    client = new TypeSafeClient({
      apiKey,
      baseURL: url,
      defaultModel: model,
      timeout: timeoutMs,
      retry: {
        maxRetries: 1,
        backoffInitialMs: 1000,
        backoffMaxMs: 3000,
      },
    });
    clientCache.set(key, client);
  }
  return client;
}

const defaultClient = envApiKey
  ? getOrCreateClient(envApiKey, process.env.TYPESAFE_BASE_URL, process.env.TYPESAFE_DEFAULT_MODEL, 15000)
  : null;

const DESCRIPTIONS: Record<string, string> = {
  WORK: 'Report to your designated workplace and perform professional duties during work hours to earn steady wages and maintain town services.',
  EAT: 'Have a meal at the Restaurant or Bakery to relieve hunger and regain health. Note: Regular dining maintains stamina, but only extreme starvation (hunger >= 75) is critical.',
  SLEEP: 'Return home to sleep and recharge physical energy.',
  SHOP: 'Visit the Mall to convert accumulated money into Charm. EFFICIENCY: HIGHEST (+2.0 to +18.0 Charm per trip, NO UPPER LIMIT up to 100!). Reaching 100 Charm wins the Championship and abolishes the death decree, and shopping is the ONLY effective way to surge charm and escape the recurring lowest-charm execution decree.',
  LIBRARY: 'Read books quietly at the Library for steady, low-cost study. EFFICIENCY: LOW (~+0.2 Charm per session, HARD CAPPED AT 20 CHARM MAX). Once charm reaches 20, reading CANNOT grant any more charm and CANNOT win the 100-charm championship or escape high-level competition.',
  TREAT: 'Visit the Hospital to recover health and cure disease.',
  BANK: 'Visit the Bank to deposit surplus cash for interest, or take a loan if short on funds.',
  WANDER: 'Stroll pleasantly around the Park or town streets to relax and observe the community.',
  WAIT: 'Pause briefly to assess the surroundings.',
  CRIME: 'Attempt an illicit act (shoplifting, dine-and-dash, or theft) to quickly gain food or cash, risking police arrest.'
};

export function formatJevReason(
  type: string,
  location?: string,
  confidence?: number,
  agent?: { name?: string; role?: string; hunger?: number; health?: number; cash?: number; bankBalance?: number; charm?: number },
  weather?: WeatherType,
  competition?: CharmCompetitionInfo
): string {
  const confText = typeof confidence === 'number' ? ` (置信度 ${(confidence * 100).toFixed(0)}%)` : '';
  switch (type) {
    case 'EAT':
      if (weather === 'SNOWY') {
        return `外面飘着小雪寒气袭人，前往${location || '面包房'}点一份刚出炉的热食暖饮，驱散寒意补充能量。${confText}`;
      }
      return location === 'Bakery'
        ? `腹中微饥，前往面包房买些新鲜出炉的美味点心垫垫肚子。${confText}`
        : `饥饿感上升，前往餐厅享用一份热气腾腾的丰盛餐品补充能量。${confText}`;
    case 'SHOP': {
      const wealth = ((agent?.cash ?? 0) + (agent?.bankBalance ?? 0));
      const myCharm = Math.round(agent?.charm ?? 0);
      const daysToNext = competition?.daysToNextElimination ?? competition?.daysRemaining ?? 5;
      const nextDay = competition?.nextEliminationDay || 15;
      const victimName = competition?.executedVictims?.[0]?.name;
      const precedentMsg = victimName ? `目睹 ${victimName} 因魅力垫底已被处决的前车之鉴，` : '';

      if (competition && competition.isBottomDanger) {
        if (competition.myRank === competition.totalResidents || competition.isDeadLast) {
          return `【生死存亡大绝境】${precedentMsg}得知距离第 ${nextDay} 天处决仅剩 ${daysToNext} 天，惊觉自己竟以 ${myCharm} 魅力倒数垫底成为下一名处决目标！求生本能彻底爆发，火速赶往商场疯狂消费选购好物，誓死刷高魅力摆脱死刑！${confText}`;
        }
        return `【处决边缘紧急自救】${precedentMsg}距离第 ${nextDay} 天末位处决仅剩 ${daysToNext} 天，排名倒数第二徘徊在死亡悬崖边缘，绝不能沦为下一个牺牲品，火速前往商场血拼拉开安全差距！${confText}`;
      }
      if (competition && competition.totalResidents > 1) {
        if (competition.myRank === 1) {
          const runnerUpText = competition.runnerUp ? `紧随其后的 ${competition.runnerUp.name} (${competition.runnerUp.charm} 魅力)` : '身后对手';
          return `以 ${myCharm} 魅力领跑全镇！前往商场选购奢品乘胜追击，全力拉开与${runnerUpText}的差距冲刺 100 魅力总冠军，彻底终结处决令！${confText}`;
        } else {
          const leaderText = `${competition.leader.name} (${competition.leader.charm} 魅力)`;
          const leaderUrgency = competition.leader.charm >= 60 ? '逼近百点大关' : '暂居榜首领跑';
          if (wealth >= 50) {
            return `眼看领跑者 ${leaderText} ${leaderUrgency}，手握 $${wealth.toFixed(0)} 资产绝不甘居人后，火速前往商场血拼奢品，誓要发起冲击反超夺冠！${confText}`;
          } else {
            return `受到榜首 ${leaderText} 竞逐激励，且末位处决令步步紧逼，前往商场消费大幅提升个人魅力，为自保与反超对手积蓄声望。${confText}`;
          }
        }
      }
      if (wealth >= 100) {
        return `手握 $${wealth.toFixed(0)} 丰厚资产，前往商场豪掷千金选购奢品，将金钱转化为魅力冲刺 100 魅力赢取小镇总冠军！${confText}`;
      }
      if (weather === 'RAINY' || weather === 'STORMY') {
        return `室外阴雨绵绵，前往商场室内漫步选购品质好物，避雨的同时提升生活品质与社交魅力。${confText}`;
      }
      return `前往商场随心选购心仪好物，丰俭由人，通过消费提升魅力值向冠军迈进。${confText}`;
    }
    case 'LIBRARY': {
      const daysToNext = competition?.daysToNextElimination ?? 5;
      const nextDay = competition?.nextEliminationDay || 15;
      if (competition && competition.isBottomDanger) {
        return `【危机自救】资金有限且面临第 ${nextDay} 天末位淘汰威胁（倒计时 ${daysToNext} 天），争分夺秒前往图书馆阅读书籍，竭力提升基础修养与魅力自救！${confText}`;
      }
      if (weather === 'RAINY' || weather === 'STORMY') {
        return `窗外细雨蒙蒙，前往图书馆静心研读图书借以避雨，在墨香中提升修养与心境。${confText}`;
      }
      return `向往知识与宁静，前往图书馆静心研读图书，陶冶情操提升修养。${confText}`;
    }
    case 'WORK':
      return `作为一名敬业的${agent?.role || '居民'}，前往${location || '工作岗位'}专心工作，赚取稳定报酬。${confText}`;
    case 'BANK':
      return `出于理财规划与资金安全考量，前往银行办理存取款或贷款业务。${confText}`;
    case 'TREAT':
      return `感觉身体健康状态有所欠佳，前往医院接受医生诊断与康复治疗。${confText}`;
    case 'SLEEP':
      if (weather === 'STORMY') {
        return `外面雷雨交加，决定尽快返回家中就寝安歇避雨，养精蓄锐。${confText}`;
      }
      return `感到有些疲惫困倦，决定返回家中就寝休息，养精蓄锐。${confText}`;
    case 'WANDER':
      if (weather === 'SUNNY') {
        return `今日艳阳高照微风和煦，前往小镇公园惬意漫步赏景，享受美好日光。${confText}`;
      }
      if (weather === 'RAINY') {
        return `撑着雨伞在细雨霏霏的街头信步漫游，享受雨中小镇别样的清幽宁静。${confText}`;
      }
      return location === 'Park'
        ? `忙里偷闲，前往小镇公园惬意漫步赏景，放松身心。${confText}`
        : `在小镇街头悠闲漫步，享受轻松自由的街区时光。${confText}`;
    case 'WAIT':
      if (weather === 'STORMY') {
        return `外面突降大雷雨，先在屋檐或室内稍事避雨休整。${confText}`;
      }
      return `周围状态平稳，在原地稍作休整与观察。${confText}`;
    case 'CRIME':
      return location === 'Restaurant' || location === 'Bakery'
        ? `腹中饥肠辘辘囊中羞涩，心存侥幸前往${location}吃霸王餐填饱肚子。${confText}`
        : `受贪念与侥幸投机心理驱使，决定前往${location || '商场'}铤而走险实施盗窃。${confText}`;
    default:
      return `综合权衡当前生理状态与发展目标，决定执行 ${type} 行动。${confText}`;
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof candidate.name === 'string' ? candidate.name.toLowerCase() : '';
  const code = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return name.includes('timeout') || name.includes('abort') || code === 'timeout_err' ||
    code.includes('timeout') || message.includes('timed out') || message.includes('timeout');
}

/**
 * 批量执行 JEV 决策，单次 systemOne 请求聚合当前批次中所有小人的状态和问题
 * @author hubin
 */
export async function callJevBatch(
  contexts: JevDecisionContext[],
  overrideConfig?: Partial<JevConfig>
): Promise<Map<string, JevAction | null>> {
  const resultMap = new Map<string, JevAction | null>();
  if (!contexts || contexts.length === 0) return resultMap;

  for (const ctx of contexts) {
    if (ctx.agent?.id) {
      resultMap.set(ctx.agent.id, null);
    }
  }

  const apiKey = overrideConfig?.apiKey?.trim() || envApiKey;
  const timeoutSec = overrideConfig?.timeout && overrideConfig.timeout > 0 ? overrideConfig.timeout : 15;
  const timeoutMs = timeoutSec * 1000;

  let activeClient = defaultClient;
  if (apiKey) {
    activeClient = getOrCreateClient(
      apiKey,
      overrideConfig?.baseUrl,
      overrideConfig?.model,
      timeoutMs
    );
  }

  if (!activeClient) {
    if (typeof window === 'undefined') console.warn('[JEV] callJevBatch invoked but client is null (API key not loaded)');
    return resultMap;
  }

  const firstWorld = contexts[0]?.world;
  const hour = firstWorld?.hour ?? 12;
  const weather = firstWorld?.weather || 'SUNNY';
  const weatherMeta = WEATHER_CONFIGS[weather] || WEATHER_CONFIGS.SUNNY;
  const isNight = hour >= 22 || hour < 7;

  const questions: Record<string, any> = {};
  const agentCandidatesMap = new Map<string, Array<{ type?: string; location?: string }>>();

  for (const ctx of contexts) {
    const agent = ctx.agent;
    if (!agent?.id) continue;
    const candidates: Array<{ type?: string; location?: string }> = Array.isArray(ctx?.candidates) ? ctx.candidates : [];
    agentCandidatesMap.set(agent.id, candidates);

    const availableTypes = new Set<string>(
      candidates.map(c => c.type).filter((t): t is string => Boolean(t))
    );
    if (availableTypes.size === 0) {
      availableTypes.add('WAIT');
    }
    const criteria = Object.fromEntries(
      [...availableTypes].map(type => [type, DESCRIPTIONS[type] || 'A safe available action.'])
    );

    const totalWealth = (agent.cash ?? 0) + (agent.bankBalance ?? 0);
    const charm = agent.charm ?? 0;
    const hunger = Math.round(agent.hunger ?? 0);
    const health = Math.round(agent.health ?? 100);
    const isUltraWealthy = totalWealth >= 100 && charm < 100;
    const isWealthyAndSafe = totalWealth >= 25 && health >= 55 && hunger <= 60;
    const isWorkShift = (hour >= 8 && hour < 12) || (hour >= 13 && hour < 18);
    const isLunchBreak = hour >= 12 && hour < 13;
    const isEveningLeisure = hour >= 18 && hour < 22;
    const isMorningPrep = hour >= 7 && hour < 8;

    const statusCard = `[Resident Status: ${agent.name} (${agent.role}) | Hunger: ${hunger}/100, Health: ${health}/100, Total Wealth: $${totalWealth.toFixed(1)}, Charm: ${Math.round(charm)}/100] `;

    let physiologicalAlert = '';
    if (hunger >= 75 && availableTypes.has('EAT')) {
      physiologicalAlert = `🚨 CRITICAL STARVATION: ${agent.name} is starving (${hunger}/100)! Having a meal (EAT) is urgently required to prevent health loss! `;
    } else if (hunger >= 55 && availableTypes.has('EAT')) {
      physiologicalAlert = `🍴 Mild hunger (${hunger}/100) — can have a meal (EAT) if schedule permits, or push through if higher priorities beckon. `;
    }
    if (health < 45 && availableTypes.has('TREAT')) {
      physiologicalAlert += `🚨 CRITICAL HEALTH: Health is critically low (${health}/100). Receiving treatment (TREAT) at Hospital is urgently needed! `;
    } else if (health < 65 && availableTypes.has('TREAT')) {
      physiologicalAlert += `⚠️ Low health (${health}/100) — medical checkup (TREAT) recommended when convenient. `;
    }

    const comp = ctx.competition;
    let compSummary = '';
    let isBottomPanic = false;
    if (comp && comp.totalResidents > 1) {
      const daysToNext = comp.daysToNextElimination ?? comp.daysRemaining ?? 5;
      const nextDay = comp.nextEliminationDay || 15;
      const executedList = comp.executedVictims || [];
      const pastVictimNote = executedList.length > 0
        ? `⚠️ FATAL PRECEDENT: ${executedList.map(v => `${v.name} (executed on Day ${v.day || 16} for lowest charm)`).join(', ')} has ALREADY been EXECUTED! The decree is REAL and fatal! `
        : '';

      if (comp.isDeadLast || comp.myRank === comp.totalResidents) {
        compSummary = `${pastVictimNote}☠️ MORTAL EXECUTION PANIC: AI Town decree executes the resident with the LOWEST charm every 5 days! Next execution is in ${daysToNext} day(s) (Day ${nextDay} 22:00)! ${agent.name} is DEAD LAST in the town (Rank #${comp.myRank}/${comp.totalResidents}, ${Math.round(charm)} Charm, gap to escape: ${comp.gapToEscapeBottom}). ${agent.name} is the DIRECT TARGET TO BE EXECUTED! Desperately shopping at the Mall (SHOP) to boost charm is their ONLY salvation from death! `;
        isBottomPanic = true;
      } else if (comp.isBottomDanger) {
        compSummary = `${pastVictimNote}⚠️ HIGH EXECUTION DANGER: Town decree executes the lowest charm resident in ${daysToNext} day(s) (Day ${nextDay} 22:00)! ${agent.name} is dangerously close to the bottom (Rank #${comp.myRank}/${comp.totalResidents}, ${Math.round(charm)} Charm, buffer over dead last: ${comp.gapToEscapeBottom}). Slipping even slightly means facing the executioner! Must aggressively boost charm at the Mall (SHOP) to survive! `;
        isBottomPanic = true;
      } else if (comp.myRank === 1) {
        compSummary = `${pastVictimNote}🏆 LEADER'S SPRINT TO 100: Next execution in ${daysToNext} day(s) (Day ${nextDay}). ${agent.name} leads in 1st place with ${Math.round(charm)}/100 Charm! Reaching 100 Charm wins the Championship and abolishes the death decree forever! ${comp.runnerUp ? `${comp.runnerUp.name} is chasing at ${comp.runnerUp.charm} Charm.` : ''} Keep visiting the Mall (SHOP) to seal the 100-Charm victory! `;
      } else {
        compSummary = `${pastVictimNote}[SURVIVAL & CHAMPIONSHIP RACE: Next execution Day ${nextDay}, ${daysToNext}d left] ${agent.name} is Rank #${comp.myRank}/${comp.totalResidents} with ${Math.round(charm)} Charm (Leader: ${comp.leader.name} at ${comp.leader.charm}). Mall shopping (+2.0~+18.0 Charm) is essential to stay ahead of execution and sprint toward the 100 Charm championship! `;
      }
    }

    const efficiencyNotice = (availableTypes.has('SHOP') || availableTypes.has('LIBRARY'))
      ? ` [CHARM EFFICIENCY: Mall Shopping has HIGH efficiency (+2.0 to +18.0 Charm/trip, NO UPPER LIMIT, unlocks 100-Charm Victory). Library reading has LOW efficiency (~+0.2 Charm/session) and is HARD CAPPED AT 20 CHARM MAX. If Charm >= 20, reading gives ZERO charm gains, so Shopping at the Mall is the only viable path.]`
      : '';

    let promptText: string;
    if (isNight) {
      promptText = `${statusCard}It is currently late night in AI Town (${hour}:00) and the weather is ${weatherMeta.nameEn} (${weatherMeta.emoji}). ${physiologicalAlert}${compSummary}Resident ${agent.name} (${agent.role}) should rest or take essential care. Choose the best candidate action.`;
    } else if (isWorkShift) {
      if (hunger >= 75 && availableTypes.has('EAT')) {
        promptText = `${statusCard}It is currently ${hour}:00 in AI Town. ${physiologicalAlert}${compSummary}Starvation is critical (${hunger}/100)! Eating a meal (EAT) now is essential before continuing duties. Choose the best candidate action.`;
      } else if (isBottomPanic && availableTypes.has('SHOP')) {
        promptText = `${statusCard}It is currently ${hour}:00 in AI Town. ${physiologicalAlert}${compSummary}SURVIVAL OVERRIDE: Facing town execution decree! Resident ${agent.name} is in imminent danger of elimination! SHOPPING at the Mall is life-or-death priority to raise charm (+2.0~+18.0) and escape execution! Choose the best candidate action.`;
      } else if (isBottomPanic && availableTypes.has('LIBRARY')) {
        promptText = `${statusCard}It is currently ${hour}:00 in AI Town. ${physiologicalAlert}${compSummary}SURVIVAL OVERRIDE: Facing execution danger with limited funds! Studying at the Library (LIBRARY) to squeeze out charm points to survive! Choose the best candidate action.`;
      } else if (availableTypes.has('SHOP') && (totalWealth >= 10 || isUltraWealthy)) {
        promptText = `${statusCard}It is currently ${hour}:00 in AI Town. ${physiologicalAlert}${compSummary}Resident ${agent.name} has savings ($${totalWealth.toFixed(1)}) and ${Math.round(charm)}/100 Charm. Visiting the Mall (SHOP) to convert cash into massive Charm (+2.0~+18.0) is the winning strategy to surge ahead or claim the 100 Charm championship trophy! Choose the best candidate action.`;
      } else if (hunger >= 55 && availableTypes.has('EAT')) {
        promptText = `${statusCard}It is currently ${hour}:00 in AI Town. ${physiologicalAlert}${compSummary}Resident ${agent.name} feels hungry (${hunger}/100). Taking a meal break (EAT) now to restore stamina is an option before returning to work. Choose the best candidate action.`;
      } else {
        promptText = `${statusCard}It is currently ${hour}:00 (work shift) in AI Town and the weather is ${weatherMeta.nameEn}. ${physiologicalAlert}${compSummary}As a dedicated ${agent.role}, resident ${agent.name} is on duty and can diligently perform professional duties at their workplace to earn wages. Choose the best candidate action.`;
      }
    } else if (isLunchBreak) {
      if (isBottomPanic && availableTypes.has('SHOP')) {
        promptText = `${statusCard}It is 12:00 noon (lunch break). ${physiologicalAlert}${compSummary}SURVIVAL EMERGENCY: Facing execution danger! Using the lunch break to rush to the Mall (SHOP) to raise charm (+2.0~+18.0) and survive! Choose the best candidate action.`;
      } else if (availableTypes.has('SHOP') && totalWealth >= 10) {
        promptText = `${statusCard}It is 12:00 noon (lunch break) in AI Town. ${physiologicalAlert}${compSummary}Resident ${agent.name} has funds ($${totalWealth.toFixed(1)}). Visiting the Mall (SHOP) during lunch to boost charm or having lunch (EAT) are both great choices. Choose the best candidate action.`;
      } else {
        promptText = `${statusCard}It is 12:00 noon (lunch break) in AI Town. ${physiologicalAlert}Resident ${agent.name} (${agent.role}) should take a break from work to have lunch (EAT) and replenish stamina. Choose the best candidate action.`;
      }
    } else if (isEveningLeisure) {
      if (hunger >= 75 && availableTypes.has('EAT')) {
        promptText = `${statusCard}It is currently ${hour}:00 (evening leisure) in AI Town. ${physiologicalAlert}${compSummary}Starvation is critical (${hunger}/100)! Having dinner (EAT) to refuel stamina is urgently needed. Choose the best candidate action.`;
      } else if (isBottomPanic && availableTypes.has('SHOP')) {
        promptText = `${statusCard}It is currently ${hour}:00 (evening leisure) in AI Town. ${physiologicalAlert}${compSummary}SURVIVAL OVERRIDE: Town execution decree has created a deadly panic! Resident ${agent.name} must prioritize raising charm right now (SHOP at the Mall is highest efficiency +2.0~+18.0) to escape execution! Choose the best candidate action.`;
      } else if (availableTypes.has('SHOP') && (totalWealth >= 8 || isUltraWealthy)) {
        promptText = `${statusCard}It is currently ${hour}:00 (evening leisure) in AI Town. ${physiologicalAlert}${compSummary}VICTORY OBJECTIVE: Reaching 100 Charm is the ULTIMATE VICTORY CONDITION! Resident ${agent.name} has accumulated funds ($${totalWealth.toFixed(1)}) and currently has ${Math.round(charm)}/100 Charm. They should aggressively spend at the Mall (SHOP, +2.0~+18.0 Charm/trip) to surge their Charm toward 100 and win the Town Championship! Choose the best candidate action.`;
      } else if (hunger >= 50 && availableTypes.has('EAT')) {
        promptText = `${statusCard}It is currently ${hour}:00 (evening leisure) in AI Town. ${physiologicalAlert}${compSummary}Resident ${agent.name} has finished work and feels hungry (${hunger}/100). Having dinner (EAT) to refuel stamina is recommended. Choose the best candidate action.`;
      } else if (isWealthyAndSafe) {
        promptText = `${statusCard}It is currently ${hour}:00 (evening leisure, after work) in AI Town. ${physiologicalAlert}${compSummary}Resident ${agent.name} (${agent.role}) has completed their workday with healthy savings ($${totalWealth.toFixed(1)}). Reaching 100 Charm is the town victory goal. They should enjoy their evening: treat themselves at the Mall to boost charm (+2.0~+18.0), visit the library (capped at 20), or relax in the park. Choose the best candidate action.`;
      } else {
        promptText = `${statusCard}It is currently ${hour}:00 (evening leisure, after work) in AI Town. ${physiologicalAlert}Resident ${agent.name} (${agent.role}) has completed their workday and can enjoy evening activities such as visiting the library, strolling the park, or having dinner. Choose the best candidate action.`;
      }
    } else if (isMorningPrep) {
      if (isBottomPanic && availableTypes.has('SHOP')) {
        promptText = `${statusCard}It is currently ${hour}:00 (early morning) in AI Town. ${physiologicalAlert}${compSummary}SURVIVAL OVERRIDE: Desperately heading to the Mall (SHOP) to boost charm before the day begins! Choose the best candidate action.`;
      } else {
        promptText = `${statusCard}It is currently ${hour}:00 (early morning) in AI Town. ${physiologicalAlert}Resident ${agent.name} (${agent.role}) should prepare for the day with breakfast or a light stroll before the 8:00 AM work shift begins. Choose the best candidate action.`;
      }
    } else {
      promptText = `${statusCard}The weather in AI Town is currently ${weatherMeta.nameEn} (${weatherMeta.emoji}: ${weatherMeta.descriptionEn}). ${physiologicalAlert}${compSummary}Choose the best candidate action for resident ${agent.name} (${agent.role}) balancing health, hunger, financial security, charm (100 Charm wins the championship!), and current weather.`;
    }

    if (efficiencyNotice) {
      promptText += efficiencyNotice;
    }

    const qKey = `action_${agent.id}`;
    questions[qKey] = choice(promptText, criteria);
  }

  if (Object.keys(questions).length === 0) {
    return resultMap;
  }

  const state = {
    world: firstWorld,
    townLeaderboard: contexts.find(c => c.competition?.leaderboard)?.competition?.leaderboard,
    residents: contexts.map(ctx => ({
      agent: ctx.agent,
      objective: ctx.objective,
      competition: ctx.competition,
      candidateActions: ctx.candidates?.map(c => c.type)
    }))
  };

  if (typeof window === 'undefined') {
    const names = contexts.map(c => c.agent?.name).join(', ');
    console.log(`[JEV] calling systemOne batch for ${contexts.length} agents (weather: ${weather}): [${names}]`);
  }

  try {
    const result = await activeClient.systemOne({
      state: state as any,
      questions
    });

    const answers = result?.answers as Record<string, any> | undefined;
    if (answers) {
      for (const ctx of contexts) {
        const agent = ctx.agent;
        if (!agent?.id) continue;
        const qKey = `action_${agent.id}`;
        const answer = answers[qKey];
        if (!answer) continue;
        const chosenType = answer.choice;
        const candidates = agentCandidatesMap.get(agent.id) ?? [];
        const matchingCandidate = candidates.find(c => c.type === chosenType);
        const confidence = answer.confidence;

        if (chosenType) {
          resultMap.set(agent.id, {
            type: chosenType as JevAction['type'],
            location: matchingCandidate?.location,
            reason: formatJevReason(chosenType, matchingCandidate?.location, confidence, agent, weather, ctx.competition)
          });
        }
      }
    }
  } catch (error) {
    if (isTimeoutError(error)) {
      if (typeof window === 'undefined') {
        console.warn(`[JEV] batch decision timed out (${timeoutSec}s) for ${contexts.length} agents; using local fallback.`);
      }
    } else {
      console.error('[JEV] batch decision failed:', error);
    }
  }

  return resultMap;
}

/** Returns null if JEV is not configured or the request fails. */
export async function callJev(context: JevDecisionContext, overrideConfig?: Partial<JevConfig>): Promise<JevAction | null> {
  if (!context?.agent?.id) return null;
  const resultMap = await callJevBatch([context], overrideConfig);
  return resultMap.get(context.agent.id) ?? null;
}

export function isJevConfigured(overrideConfig?: Partial<JevConfig>): boolean {
  if (overrideConfig?.apiKey?.trim()) return true;
  return defaultClient !== null;
}
