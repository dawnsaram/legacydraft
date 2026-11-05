import { POSITIONS, type Anchor, type Card, type GameState } from '../types';
import { drawCard, drawRerollCard, type Rng } from './probability';

export const MAX_REROLLS = 3;

/** 최초 드래프트: 5개 포지션에 1장씩 (initial 확률표) */
export function createGame(rng: Rng = Math.random): GameState {
  return {
    slots: POSITIONS.map((position) => ({
      position,
      card: drawCard(position, 'initial', rng),
      isLocked: false,
    })),
    rerollsUsed: 0,
    phase: 'drafting',
  };
}

export function rerollsLeft(state: GameState): number {
  return MAX_REROLLS - state.rerollsUsed;
}

export function canReroll(state: GameState): boolean {
  return state.phase === 'drafting' && rerollsLeft(state) > 0 && state.slots.some((s) => !s.isLocked);
}

/** Hold 토글 */
export function toggleLock(state: GameState, index: number): GameState {
  if (state.phase !== 'drafting') return state;
  return {
    ...state,
    slots: state.slots.map((s, i) => (i === index ? { ...s, isLocked: !s.isLocked } : s)),
  };
}

/**
 * 앵커 = HOLD한 카드 중 가장 많이 겹치는 팀·시즌 (동률이면 높은 티어 → 앞 슬롯 우선).
 * HOLD한 카드가 없으면 앵커 없음 → 일반 리롤.
 */
export function findAnchor(state: GameState): Anchor | null {
  const groups = new Map<string, { anchor: Anchor; count: number; tier: number }>();
  for (const { card, isLocked } of state.slots) {
    if (!isLocked) continue;
    const key = `${card.team}|${card.season}`;
    const g = groups.get(key) ?? { anchor: { team: card.team, season: card.season }, count: 0, tier: card.baseTier };
    g.count += 1;
    groups.set(key, g);
  }
  let best: { anchor: Anchor; count: number; tier: number } | null = null;
  for (const g of groups.values()) {
    if (!best || g.count > best.count || (g.count === best.count && g.tier > best.tier)) best = g;
  }
  return best?.anchor ?? null;
}

/** Re-roll: 고정되지 않은 슬롯만 다시 뽑기 (리롤 확률표 + 누적 앵커 보정). 마지막 리롤 후 자동 확정(HOLD 해제). */
export function reroll(state: GameState, rng: Rng = Math.random): GameState {
  if (!canReroll(state)) return state;
  const anchor = findAnchor(state);
  const rerollIndex = state.rerollsUsed;
  const rerollsUsed = rerollIndex + 1;
  const finished = rerollsUsed >= MAX_REROLLS;
  return {
    slots: state.slots.map((s) => {
      const card = s.isLocked ? s.card : drawRerollCard(s.position, anchor, rerollIndex, rng);
      return { ...s, card, isLocked: finished ? false : s.isLocked };
    }),
    rerollsUsed,
    phase: finished ? 'finished' : 'drafting',
  };
}

/** 리롤이 남아있어도 조기 확정 */
export function finalize(state: GameState): GameState {
  return { ...state, phase: 'finished', slots: state.slots.map((s) => ({ ...s, isLocked: false })) };
}

export function cardsOf(state: GameState): Card[] {
  return state.slots.map((s) => s.card);
}

