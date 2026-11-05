import rawCards from '../../data.json';
import { BASE_TIERS, POSITIONS, type BaseTier, type Card, type Position } from '../types';

/** JSON 런타임 검증: 오탈자/누락 데이터가 게임 로직에 섞이지 않도록 걸러낸다. */
function isCard(value: unknown): value is Card {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.playerName === 'string' &&
    typeof c.team === 'string' &&
    typeof c.league === 'string' &&
    typeof c.season === 'string' &&
    POSITIONS.includes(c.position as Position) &&
    BASE_TIERS.includes(c.baseTier as BaseTier)
  );
}

function loadCards(): Card[] {
  const valid: Card[] = [];
  const seen = new Set<string>();
  for (const item of rawCards as unknown[]) {
    if (!isCard(item)) {
      console.warn('[cards] 잘못된 카드 데이터 무시:', item);
      continue;
    }
    if (seen.has(item.id)) {
      console.warn('[cards] 중복 id 무시:', item.id);
      continue;
    }
    seen.add(item.id);
    valid.push(item);
  }
  return valid;
}

export const ALL_CARDS: readonly Card[] = loadCards();

export type CardPool = Record<Position, Record<BaseTier, Card[]>>;

/** 포지션 → 티어 → 카드 목록 인덱스 (드로우 시 O(1) 조회) */
export const CARD_POOL: CardPool = (() => {
  const pool = Object.fromEntries(
    POSITIONS.map((p) => [p, { 3: [], 4: [], 5: [] }]),
  ) as unknown as CardPool;
  for (const card of ALL_CARDS) pool[card.position][card.baseTier].push(card);
  return pool;
})();

export const CARD_BY_ID: ReadonlyMap<string, Card> = new Map(ALL_CARDS.map((c) => [c.id, c]));

export const rosterKey = (team: string, season: string, position: Position) => `${team}|${season}|${position}`;

/** 팀·시즌·포지션 → 카드 목록 (앵커 보정 드로우용) */
export const ROSTER_INDEX: ReadonlyMap<string, Card[]> = (() => {
  const map = new Map<string, Card[]>();
  for (const c of ALL_CARDS) {
    const key = rosterKey(c.team, c.season, c.position);
    map.set(key, [...(map.get(key) ?? []), c]);
  }
  return map;
})();

