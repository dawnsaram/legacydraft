import { CARD_POOL, ROSTER_INDEX, rosterKey } from '../data/cards';
import { BASE_TIERS, type Anchor, type BaseTier, type Card, type DrawPhase, type Position } from '../types';

// 기획서 4.2: 역방향 가중치 확률 모델 (단위: %)
export const TIER_WEIGHTS: Record<DrawPhase, Record<BaseTier, number>> = {
  initial: { 3: 50, 4: 40, 5: 10 },
  reroll: { 3: 70, 4: 25, 5: 5 },
};

export type Rng = () => number;

export function rollTier(phase: DrawPhase, rng: Rng = Math.random): BaseTier {
  const weights = TIER_WEIGHTS[phase];
  const total = BASE_TIERS.reduce((sum, t) => sum + weights[t], 0);
  let r = rng() * total;
  for (const tier of BASE_TIERS) {
    r -= weights[tier];
    if (r < 0) return tier;
  }
  return BASE_TIERS[0];
}

function pick<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 포지션에 맞는 카드 1장 드로우. 해당 티어 풀이 비어있으면 가까운 티어로 대체. */
export function drawCard(position: Position, phase: DrawPhase, rng: Rng = Math.random): Card {
  const tier = rollTier(phase, rng);
  const byTier = CARD_POOL[position];
  const fallbackOrder = [...BASE_TIERS].sort((a, b) => Math.abs(a - tier) - Math.abs(b - tier));
  for (const t of fallbackOrder) {
    if (byTier[t].length > 0) return pick(byTier[t], rng);
  }
  throw new Error(`[draw] ${position} 포지션 카드가 없습니다.`);
}

/**
 * 누적 앵커 보정: 리롤 n회차마다 각 슬롯이 앵커와 같은 팀·시즌 선수로 나올 확률.
 * 같은 팀·시즌 선수가 3명 이상 등장하면 추가 가산(+15%p)되어 레전더리 완성 확률이 더 올라간다.
 * 실패하면 기존 리롤 확률표(TIER_WEIGHTS.reroll)로 드로우.
 */
export const ANCHOR_CHANCE_BY_REROLL: readonly number[] = [0.1, 0.2, 0.3];
export const ANCHOR_BOOST_MIN_COUNT = 3;
export const ANCHOR_BOOST_BONUS = 0.15;

export function anchorChance(rerollIndex: number, matchCount = 1): number {
  const base = ANCHOR_CHANCE_BY_REROLL[Math.min(rerollIndex, ANCHOR_CHANCE_BY_REROLL.length - 1)] ?? 0;
  const boost = matchCount >= ANCHOR_BOOST_MIN_COUNT ? ANCHOR_BOOST_BONUS : 0;
  return Math.min(1, base + boost);
}

export function drawRerollCard(
  position: Position,
  anchor: Anchor | null,
  rerollIndex: number,
  rng: Rng = Math.random,
): Card {
  if (anchor && rng() < anchorChance(rerollIndex, anchor.count)) {
    const roster = ROSTER_INDEX.get(rosterKey(anchor.team, anchor.season, position));
    if (roster && roster.length > 0) return pick(roster, rng);
  }
  return drawCard(position, 'reroll', rng);
}

