/**
 * 财务规划与预算安全线分析
 * @author hubin
 */

import { Agent } from '../engine/Agent';

export interface FinancialPlan {
  liquidFunds: number;
  totalWealth: number;
  foodReserve: number;
  healthReserve: number;
  debtReserve: number;
  emergencyReserve: number;
  safeReserve: number;
  disposableFunds: number;
  canEat: boolean;
  canTreat: boolean;
  canShop: boolean;
  shouldWork: boolean;
  shouldBank: boolean;
}

/** Shared affordability rules for local behavior and JEV context. */
export function planFinances(agent: Agent, priceMultiplier: number, hour: number): FinancialPlan {
  const foodCost = 0.05 * priceMultiplier;
  const treatmentCost = 0.2 * priceMultiplier;
  const shoppingCost = Math.max(5, 0.5 * priceMultiplier);
  const liquidFunds = agent.cash + ((hour >= 9 && hour < 18) ? agent.bankBalance : 0);
  const totalWealth = agent.cash + agent.bankBalance;
  const foodReserve = foodCost * 3;
  const healthReserve = treatmentCost;
  const debtReserve = Math.min(agent.loanBalance, Math.max(0.1, agent.loanBalance * 0.02));
  const emergencyReserve = Math.max(1, foodCost * 5);
  const safeReserve = foodReserve + healthReserve + debtReserve + emergencyReserve;
  const disposableFunds = liquidFunds - safeReserve;

  return {
    liquidFunds, totalWealth, foodReserve, healthReserve, debtReserve,
    emergencyReserve, safeReserve, disposableFunds,
    canEat: liquidFunds >= foodCost,
    canTreat: liquidFunds >= treatmentCost,
    canShop: liquidFunds >= shoppingCost + safeReserve,
    shouldWork: disposableFunds < 0 || agent.hunger > 35 || agent.health < 80,
    shouldBank: hour >= 9 && hour < 18 && agent.cash > safeReserve + foodCost
  };
}
