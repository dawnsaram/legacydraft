import type { Card, PartialSynergy, SynergyResult } from '../types';

export const DEFAULT_TIER_CAP = 5;
export const LEGENDARY_TIER_CAP = 6; // 레전더리만 6성 한계 돌파

/** 부분 시너지 발동 최소 장수 (같은 팀 3장 / 4장) */
export const PARTIAL_MIN_COUNT = 3;
export const PARTIAL_TIER_BONUS = 1;

/**
 * 동일 계보(프랜차이즈)로 묶이는 팀 그룹.
 * 시너지 판정 시 같은 그룹 소속 팀들은 동일한 팀 시너지로 취급된다.
 */
export const TEAM_SYNERGY_GROUPS: readonly (readonly string[])[] = [
  ['SKT', 'T1'],
  ['NBS', 'NWS'],
  ['SSW', 'SSB', 'SSG', 'GEN'],
  ['DWG', 'DK'],
  ['LZ', 'KZ', 'DRX'],
  ['KOO', 'ROX', 'HLE'],
  ['SPY', 'MAD'],
  ['SN', 'WBG'],
  ['SHR', 'RYL', 'RNG'],
  ['CLG', 'NRG'],
];

const TEAM_TO_GROUP: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, readonly string[]>();
  for (const group of TEAM_SYNERGY_GROUPS) {
    for (const team of group) map.set(team, group);
  }
  return map;
})();

/** 팀의 시너지 그룹 식별자 반환 (그룹이 있으면 마지막 최신 팀명 기준, 없으면 원래 팀명) */
export function teamSynergyKey(team: string): string {
  const group = TEAM_TO_GROUP.get(team);
  return group ? group[group.length - 1] : team;
}

/** 카드 배열에서 해당 시너지 키에 속한 실제 등장 팀명들을 슬래시(/)로 묶어 표시 (예: "SKT / T1") */
export function formatSynergyTeams(cards: readonly Card[], synergyKey: string): string {
  const group = TEAM_TO_GROUP.get(synergyKey);
  if (!group) return synergyKey;
  const present = new Set(cards.filter((c) => teamSynergyKey(c.team) === synergyKey).map((c) => c.team));
  const ordered = group.filter((t) => present.has(t));
  return ordered.length > 0 ? ordered.join(' / ') : group.join(' / ');
}

type FullSynergy = Omit<SynergyResult, 'partial'>;

const NO_SYNERGY: FullSynergy = {
  type: 'none',
  label: '시너지 없음',
  description: '같은 팀 3장부터 부분 시너지! 5장을 리그·시즌·팀으로 맞추면 전체 시너지가 발동합니다.',
  tierBonus: 0,
  tierCap: DEFAULT_TIER_CAP,
};

function fieldKey(card: Card, key: 'team' | 'league' | 'season'): string {
  return key === 'team' ? teamSynergyKey(card.team) : card[key];
}

function allSame(cards: readonly Card[], key: 'team' | 'league' | 'season'): boolean {
  if (cards.length === 0) return false;
  const v = fieldKey(cards[0], key);
  return v !== '' && cards.every((c) => fieldKey(c, key) === v);
}

function allSameExact(cards: readonly Card[], key: 'team' | 'league' | 'season'): boolean {
  if (cards.length === 0) return false;
  const v = cards[0][key];
  return v !== '' && cards.every((c) => c[key] === v);
}

/**
 * 5장 전체 시너지: 가장 높은 단계 1개만 적용 (중첩 X)
 *  - 레전더리: 정확히 같은 단일 팀 + 같은 시즌 → +2 (최대 6성)
 *  - 프레스티지: 같은 팀(계보 포함) → +1
 *  - 기본 보상: 같은 시즌 or 같은 리그 → +1
 */
function evaluateFull(cards: readonly Card[]): FullSynergy {
  const sameExactTeam = allSameExact(cards, 'team');
  const sameTeamGroup = allSame(cards, 'team');
  const sameSeason = allSameExact(cards, 'season');
  const sameLeague = allSameExact(cards, 'league');

  if (sameExactTeam && sameSeason) {
    return {
      type: 'legendary',
      label: 'LEGENDARY',
      description: `${cards[0].season} ${cards[0].team} 완전체! 전 카드 +2성 (6성 한계 돌파)`,
      tierBonus: 2,
      tierCap: LEGENDARY_TIER_CAP,
    };
  }
  if (sameTeamGroup) {
    const teamLabel = formatSynergyTeams(cards, teamSynergyKey(cards[0].team));
    return {
      type: 'prestige',
      label: 'PRESTIGE',
      description: `${teamLabel} 로스터 통일! 전 카드 +1성`,
      tierBonus: 1,
      tierCap: DEFAULT_TIER_CAP,
    };
  }
  if (sameSeason) {
    return {
      type: 'season',
      label: 'SEASON SYNERGY',
      description: `${cards[0].season} 시즌 통일! 전 카드 +1성`,
      tierBonus: 1,
      tierCap: DEFAULT_TIER_CAP,
    };
  }
  if (sameLeague) {
    return {
      type: 'league',
      label: 'LEAGUE SYNERGY',
      description: `${cards[0].league} 리그 통일! 전 카드 +1성`,
      tierBonus: 1,
      tierCap: DEFAULT_TIER_CAP,
    };
  }
  return NO_SYNERGY;
}

/** 부분 시너지: 같은 팀(계보 포함) 3~4장 → 해당 카드만 +1 (4장은 강조 연출) */
function evaluatePartial(cards: readonly Card[]): PartialSynergy | null {
  const best = topMatch(cards, 'team');
  if (!best || best.count < PARTIAL_MIN_COUNT || best.count >= cards.length) return null;
  return {
    team: best.value,
    count: best.count,
    cardIds: cards.filter((c) => teamSynergyKey(c.team) === best.key).map((c) => c.id),
    tierBonus: PARTIAL_TIER_BONUS,
  };
}

export function evaluateSynergy(cards: readonly Card[], requiredCount = 5): SynergyResult {
  if (cards.length < requiredCount) return { ...NO_SYNERGY, partial: null };
  return { ...evaluateFull(cards), partial: evaluatePartial(cards) };
}

/** 카드별 보너스: 전체 시너지와 부분 시너지 중 큰 값 하나만 적용 */
export function cardBonus(card: Card, synergy: SynergyResult): number {
  const partial = synergy.partial?.cardIds.includes(card.id) ? synergy.partial.tierBonus : 0;
  return Math.max(synergy.tierBonus, partial);
}

export function finalTier(card: Card, synergy: SynergyResult): number {
  return Math.max(card.baseTier, Math.min(synergy.tierCap, card.baseTier + cardBonus(card, synergy)));
}

export function teamScore(cards: readonly Card[], synergy: SynergyResult): number {
  return cards.reduce((sum, c) => sum + finalTier(c, synergy), 0);
}

/** 시너지 진행도 힌트: 가장 많이 겹치는 값과 개수 */
export function topMatch(
  cards: readonly Card[],
  key: 'team' | 'league' | 'season',
): { key: string; value: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const c of cards) {
    const k = fieldKey(c, key);
    if (k === '') continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: { key: string; count: number } | null = null;
  for (const [k, count] of counts) {
    if (!best || count > best.count) best = { key: k, count };
  }
  if (!best) return null;
  const value = key === 'team' ? formatSynergyTeams(cards, best.key) : best.key;
  return { key: best.key, value, count: best.count };
}
