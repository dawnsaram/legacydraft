import { POSITIONS, type Anchor, type Card, type GameState } from '../types';
import { ANCHOR_BOOST_MIN_COUNT, drawCard, drawRerollCard, type Rng } from './probability';

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
 * 앵커 선정:
 * 1) 보드 전체에서 같은 팀·시즌 선수가 3명 이상 등장해 있거나,
 * 2) 유저가 HOLD한 카드가 있는 팀·시즌 중
 * 보드 등장 장수(boardCount) → HOLD 장수(lockedCount) → 기본 티어 순으로 가장 유리한 팀·시즌을 선택.
 */
export function findAnchor(state: GameState): Anchor | null {
  const groups = new Map<
    string,
    { team: string; season: string; boardCount: number; lockedCount: number; tier: number }
  >();
  for (const { card, isLocked } of state.slots) {
    const key = `${card.team}|${card.season}`;
    const g = groups.get(key) ?? {
      team: card.team,
      season: card.season,
      boardCount: 0,
      lockedCount: 0,
      tier: card.baseTier,
    };
    g.boardCount += 1;
    if (isLocked) g.lockedCount += 1;
    groups.set(key, g);
  }

  let best: { team: string; season: string; boardCount: number; lockedCount: number; tier: number } | null = null;
  for (const g of groups.values()) {
    if (g.lockedCount === 0 && g.boardCount < ANCHOR_BOOST_MIN_COUNT) continue;
    if (
      !best ||
      g.boardCount > best.boardCount ||
      (g.boardCount === best.boardCount && g.lockedCount > best.lockedCount) ||
      (g.boardCount === best.boardCount && g.lockedCount === best.lockedCount && g.tier > best.tier)
    ) {
      best = g;
    }
  }
  return best ? { team: best.team, season: best.season, count: best.boardCount } : null;
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

/** 공유 링크 등으로 전달받은 5장의 카드로 확정된 게임 상태 생성 */
export function createSharedGame(cards: readonly Card[]): GameState {
  return {
    slots: POSITIONS.map((position, i) => ({
      position,
      card: cards[i],
      isLocked: false,
    })),
    rerollsUsed: MAX_REROLLS,
    phase: 'finished',
  };
}

export function cardsOf(state: GameState): Card[] {
  return state.slots.map((s) => s.card);
}

