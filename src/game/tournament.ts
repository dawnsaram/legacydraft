import { ALL_GALLERY_ENTRIES, type GalleryEntry } from '../data/gallery';
import type { Card, Position, SynergyResult } from '../types';
import { DEFAULT_TIER_CAP, evaluateSynergy, finalTier, teamScore } from './synergy';

export interface TournamentTeam {
  id: string;
  name: string;
  shortName: string;
  season?: string;
  league?: string;
  heroUrl?: string;
  cards: readonly Card[];
  synergy: SynergyResult;
  score: number;
  isPlayer: boolean;
}

export interface SetResult {
  setNumber: number;
  winnerId: string;
  mvpPosition: Position;
  mvpPlayer: string;
  summary: string;
}

export interface TournamentMatch {
  id: string;
  round: 0 | 1 | 2;
  teamA: TournamentTeam | null;
  teamB: TournamentTeam | null;
  sets: SetResult[];
  scoreA: number;
  scoreB: number;
  winnerId: string | null;
  revealedSets: number;
}

export type TournamentPhase = 'ready' | 'playing' | 'round_done' | 'champion' | 'eliminated';

export interface TournamentState {
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  currentRound: 0 | 1 | 2;
  phase: TournamentPhase;
  playerTeamId: string;
}

export const ROUND_LABELS = ['8강', '4강', '결승'] as const;

const SET_PLAY_BY_PLAY: Record<Position, readonly string[]> = {
  TOP: ['사이드 스플릿 압박으로 포탑을 밀어내며 승리', '탑 다이브 설계로 초반 주도권을 완전히 장악'],
  JGL: ['오브젝트 스틸과 날카로운 갱킹으로 협곡을 지배', '바론 교전 완벽한 강타 싸움으로 역전승'],
  MID: ['미드 슈퍼 플레이로 상대 진영을 붕괴', '클러치 로밍과 암살로 경기 흐름을 뒤집음'],
  BOT: ['후반 한타 폭딜로 펜타급 캐리를 선보임', '라인전 완승 후 드래곤 영혼을 손쉽게 확보'],
  SUP: ['결정적인 이니시에이팅으로 한타 대승을 견인', '시야 장악과 슈퍼 세이브로 팀을 구원'],
};

function pickRandom<T>(arr: readonly T[], count: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

const OPPONENT_NO_SYNERGY: SynergyResult = {
  type: 'none',
  label: '시너지 미적용',
  description: '',
  tierBonus: 0,
  tierCap: DEFAULT_TIER_CAP,
  partial: null,
};

function makeGalleryTeam(entry: GalleryEntry): TournamentTeam {
  return {
    id: entry.id,
    name: `${entry.season} ${entry.team}`,
    shortName: entry.team,
    season: entry.season,
    league: entry.league,
    heroUrl: entry.heroUrl,
    cards: entry.cards,
    synergy: OPPONENT_NO_SYNERGY,
    score: teamScore(entry.cards, OPPONENT_NO_SYNERGY),
    isPlayer: false,
  };
}

function pickSetMvp(team: TournamentTeam): Card {
  const weights = team.cards.map((c) => Math.max(1, finalTier(c, team.synergy) - 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < team.cards.length; i++) {
    r -= weights[i];
    if (r <= 0) return team.cards[i];
  }
  return team.cards[0];
}

function simulateBo5(match: TournamentMatch): TournamentMatch {
  const { teamA, teamB } = match;
  if (!teamA || !teamB) return match;

  const diff = teamA.score - teamB.score;
  const winProbA = Math.min(0.85, Math.max(0.15, 1 / (1 + Math.exp(-diff * 0.22))));

  const sets: SetResult[] = [];
  let scoreA = 0;
  let scoreB = 0;
  let setNumber = 1;

  while (scoreA < 3 && scoreB < 3) {
    const aWon = Math.random() < winProbA;
    if (aWon) scoreA++;
    else scoreB++;

    const winner = aWon ? teamA : teamB;
    const mvp = pickSetMvp(winner);
    const lines = SET_PLAY_BY_PLAY[mvp.position];
    const line = lines[Math.floor(Math.random() * lines.length)];

    sets.push({
      setNumber,
      winnerId: winner.id,
      mvpPosition: mvp.position,
      mvpPlayer: mvp.playerName,
      summary: `${mvp.playerName} (${mvp.position}) — ${line}`,
    });
    setNumber++;
  }

  return {
    ...match,
    sets,
    scoreA,
    scoreB,
    winnerId: scoreA === 3 ? teamA.id : teamB.id,
    revealedSets: 0,
  };
}

export function createTournament(playerCards: readonly Card[]): TournamentState {
  const playerSynergy = evaluateSynergy(playerCards);
  const playerTeam: TournamentTeam = {
    id: 'PLAYER',
    name: 'MY DREAM TEAM',
    shortName: 'MY TEAM',
    cards: playerCards,
    synergy: playerSynergy,
    score: teamScore(playerCards, playerSynergy),
    isPlayer: true,
  };

  const candidates = ALL_GALLERY_ENTRIES.filter((e) => e.cards.length === 5);
  const opponents = pickRandom(candidates, 7).map(makeGalleryTeam);
  const teams = [playerTeam, ...opponents];

  const matches: TournamentMatch[] = [
    // 8강 (QF 0~3)
    { id: 'qf-0', round: 0, teamA: teams[0], teamB: teams[1], sets: [], scoreA: 0, scoreB: 0, winnerId: null, revealedSets: 0 },
    { id: 'qf-1', round: 0, teamA: teams[2], teamB: teams[3], sets: [], scoreA: 0, scoreB: 0, winnerId: null, revealedSets: 0 },
    { id: 'qf-2', round: 0, teamA: teams[4], teamB: teams[5], sets: [], scoreA: 0, scoreB: 0, winnerId: null, revealedSets: 0 },
    { id: 'qf-3', round: 0, teamA: teams[6], teamB: teams[7], sets: [], scoreA: 0, scoreB: 0, winnerId: null, revealedSets: 0 },
    // 4강 (SF 4~5)
    { id: 'sf-0', round: 1, teamA: null, teamB: null, sets: [], scoreA: 0, scoreB: 0, winnerId: null, revealedSets: 0 },
    { id: 'sf-1', round: 1, teamA: null, teamB: null, sets: [], scoreA: 0, scoreB: 0, winnerId: null, revealedSets: 0 },
    // 결승 (Final 6)
    { id: 'final', round: 2, teamA: null, teamB: null, sets: [], scoreA: 0, scoreB: 0, winnerId: null, revealedSets: 0 },
  ];

  return {
    teams,
    matches,
    currentRound: 0,
    phase: 'ready',
    playerTeamId: playerTeam.id,
  };
}

export function findPlayerMatch(state: TournamentState, round = state.currentRound): TournamentMatch | undefined {
  return state.matches.find(
    (m) => m.round === round && (m.teamA?.id === state.playerTeamId || m.teamB?.id === state.playerTeamId),
  );
}

export function displayedScore(match: TournamentMatch): { a: number; b: number } {
  const revealed = match.sets.slice(0, match.revealedSets);
  let a = 0;
  let b = 0;
  for (const s of revealed) {
    if (s.winnerId === match.teamA?.id) a++;
    else if (s.winnerId === match.teamB?.id) b++;
  }
  return { a, b };
}

function getWinnerTeam(match: TournamentMatch): TournamentTeam | null {
  if (!match.winnerId) return null;
  if (match.teamA?.id === match.winnerId) return match.teamA;
  if (match.teamB?.id === match.winnerId) return match.teamB;
  return null;
}

/** 현재 라운드 경기들을 시뮬레이션하고, 플레이어 경기는 세트별 연출을 위해 revealedSets=0으로 둔다 */
export function startCurrentRound(state: TournamentState): TournamentState {
  if (state.phase !== 'ready') return state;

  const matches = state.matches.map((m) => {
    if (m.round !== state.currentRound) return m;
    const simulated = simulateBo5(m);
    const isPlayerMatch = m.teamA?.id === state.playerTeamId || m.teamB?.id === state.playerTeamId;
    return {
      ...simulated,
      revealedSets: isPlayerMatch ? 0 : simulated.sets.length,
    };
  });

  return {
    ...state,
    matches,
    phase: 'playing',
  };
}

function finalizeRoundState(state: TournamentState, matches: TournamentMatch[]): TournamentState {
  const playerMatch = matches.find(
    (m) => m.round === state.currentRound && (m.teamA?.id === state.playerTeamId || m.teamB?.id === state.playerTeamId),
  );
  const playerWon = playerMatch?.winnerId === state.playerTeamId;

  // 다음 라운드 대진표에 승자 배치
  let updatedMatches = matches;
  if (state.currentRound === 0) {
    updatedMatches = matches.map((m) => {
      if (m.id === 'sf-0') return { ...m, teamA: getWinnerTeam(matches[0]), teamB: getWinnerTeam(matches[1]) };
      if (m.id === 'sf-1') return { ...m, teamA: getWinnerTeam(matches[2]), teamB: getWinnerTeam(matches[3]) };
      return m;
    });
  } else if (state.currentRound === 1) {
    updatedMatches = matches.map((m) => {
      if (m.id === 'final') return { ...m, teamA: getWinnerTeam(matches[4]), teamB: getWinnerTeam(matches[5]) };
      return m;
    });
  }

  let phase: TournamentPhase = 'round_done';
  if (!playerWon) phase = 'eliminated';
  else if (state.currentRound === 2) phase = 'champion';

  return {
    ...state,
    matches: updatedMatches,
    phase,
  };
}

/** 플레이어 경기의 다음 세트를 1개 공개한다 */
export function revealNextSet(state: TournamentState): TournamentState {
  if (state.phase !== 'playing') return state;
  const playerMatch = findPlayerMatch(state);
  if (!playerMatch) return finalizeRoundState(state, state.matches);

  const nextCount = Math.min(playerMatch.sets.length, playerMatch.revealedSets + 1);
  const matches = state.matches.map((m) =>
    m.id === playerMatch.id ? { ...m, revealedSets: nextCount } : m,
  );

  if (nextCount >= playerMatch.sets.length) {
    return finalizeRoundState(state, matches);
  }
  return { ...state, matches };
}

/** 플레이어 경기의 모든 세트를 즉시 공개한다 */
export function skipSetReveal(state: TournamentState): TournamentState {
  if (state.phase !== 'playing') return state;
  const playerMatch = findPlayerMatch(state);
  if (!playerMatch) return finalizeRoundState(state, state.matches);

  const matches = state.matches.map((m) =>
    m.id === playerMatch.id ? { ...m, revealedSets: m.sets.length } : m,
  );
  return finalizeRoundState(state, matches);
}

/** 다음 라운드(4강/결승)로 이동한다 */
export function advanceToNextRound(state: TournamentState): TournamentState {
  if (state.phase !== 'round_done' || state.currentRound >= 2) return state;
  return {
    ...state,
    currentRound: (state.currentRound + 1) as 0 | 1 | 2,
    phase: 'ready',
  };
}

