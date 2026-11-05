// ─────────────────────────────────────────────
// 핵심 데이터 타입 (기획서 3장)
// ─────────────────────────────────────────────

export const POSITIONS = ['TOP', 'JGL', 'MID', 'BOT', 'SUP'] as const;
export type Position = (typeof POSITIONS)[number];

export const BASE_TIERS = [3, 4, 5] as const;
export type BaseTier = (typeof BASE_TIERS)[number];

export interface Card {
  id: string; // 도감 저장용 고유 식별자 (예: LCK_2023_T1_MID_Faker)
  playerName: string; // 표시될 선수 이름
  position: Position; // 엄격한 포지션 타입
  team: string; // 소속 팀 (시너지 조건)
  league: string; // 소속 리그 (시너지 조건)
  season: string; // 활동 시즌 (시너지 조건)
  baseTier: BaseTier; // 기본 티어 (3/4/5성)
}

// ─────────────────────────────────────────────
// 게임 상태
// ─────────────────────────────────────────────

export interface Slot {
  position: Position;
  card: Card;
  isLocked: boolean;
}

export type GamePhase = 'drafting' | 'finished';

export interface GameState {
  slots: Slot[];
  rerollsUsed: number;
  phase: GamePhase;
}

/** 확률 테이블 선택용: 최초 드래프트 / 리롤 */
export type DrawPhase = 'initial' | 'reroll';

// ─────────────────────────────────────────────
// 시너지
// ─────────────────────────────────────────────

export type SynergyType = 'none' | 'league' | 'season' | 'prestige' | 'legendary';

/** 부분 시너지: 5장 중 일부(3~4장)가 같은 팀일 때 해당 카드에만 적용 */
export interface PartialSynergy {
  team: string;
  count: number;
  cardIds: string[];
  tierBonus: number;
}

export interface SynergyResult {
  /** 5장 전체에 적용되는 시너지 */
  type: SynergyType;
  label: string;
  description: string;
  tierBonus: number;
  /** 이 시너지에서 허용되는 최대 티어 */
  tierCap: number;
  /** 부분 시너지 (전체 시너지와 중첩되지 않고, 카드별로 더 큰 보너스 하나만 적용) */
  partial: PartialSynergy | null;
}

/** 리롤 앵커: HOLD한 카드의 팀·시즌 */
export interface Anchor {
  team: string;
  season: string;
}

