import { ALL_CARDS } from '../data/cards';
import { TEAM_SYNERGY_GROUPS } from './synergy';

export type AchievementCategory = 'collection' | 'tournament';

export interface PlayerStats {
  tournamentWins: number;
  tier3SynergyWins: number;
  noSynergyWins: number;
  unlockedAchievements: string[];
}

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  icon: string;
  title: string;
  description: string;
  target: number;
  progress: (owned: ReadonlySet<string>, stats: PlayerStats) => number;
}

export interface AchievementProgress {
  def: AchievementDef;
  current: number;
  target: number;
  unlocked: boolean;
}

const FRANCHISE_TITLES: Record<string, string> = {
  'SKT-T1': '최고의 선수가 있을 곳',
  'NBS-NWS': '이걸 나진이',
  'SSW-SSB-SSG-GEN': '갤럭시에서 호랑이까지',
  'DWG-DK': '쇼는 계속되어야 한다',
  'LZ-KZ-DRX': '꺾이지 않는 마음',
  'KOO-ROX-HLE': '전진하는 낭만의 전차',
  'SPY-MAD': '마드리드의 사자들',
  'SN-WBG': '사자의 각성',
  'SHR-RYL-RNG': '황실의 유산',
  'CLG-NRG': '북미의 반란',
};

const FRANCHISE_ACHIEVEMENTS: AchievementDef[] = TEAM_SYNERGY_GROUPS.map((group) => {
  const teamSet = new Set(group);
  const groupCards = ALL_CARDS.filter((c) => teamSet.has(c.team));
  const label = group.join('-');
  return {
    id: `franchise_${group.join('_')}`,
    category: 'collection',
    icon: '🏅',
    title: FRANCHISE_TITLES[label] ?? `${label} 프랜차이즈 완성`,
    description: `${label} 계보의 모든 카드(${groupCards.length}장)를 도감에 해금했습니다.`,
    target: groupCards.length,
    progress: (owned) => groupCards.filter((c) => owned.has(c.id)).length,
  };
});

const SINGLE_TEAM_TITLES: Record<string, string> = {
  G2: '유럽의 왕을 뵙습니다...',
  FNC: '태초에 프나틱이 있었다',
  BLG: '거침없는 진격',
  EDG: '은빛 기사의 영광',
  C9: '북미의 하늘빛 자존심',
  IG: '천하무적의 검',
  KT: '천장을 뚫는 롤러코스터',
  FW: '점멸 늑대!',
  TES: '대륙의 기상',
  JDG: '징동의 성장이 두렵습니까?',
  WE: '월드 엘리트',
  OMG: '오. 마이. 갓.',
  AHQ: '대만의 붉은 말',
  LNG: '기린의 도약',
  KC: '프랑스의 희망',
  AL: '전설을 향한 전진',
  LYON: '사자의 질주',
  AZF: '에욱'
};

const GROUPED_TEAMS = new Set(TEAM_SYNERGY_GROUPS.flat());

const SINGLE_TEAM_ACHIEVEMENTS: AchievementDef[] = (() => {
  const byTeam = new Map<string, { cards: typeof ALL_CARDS[number][]; seasons: Set<string> }>();
  for (const c of ALL_CARDS) {
    if (GROUPED_TEAMS.has(c.team)) continue;
    let entry = byTeam.get(c.team);
    if (!entry) {
      entry = { cards: [], seasons: new Set() };
      byTeam.set(c.team, entry);
    }
    entry.cards.push(c);
    entry.seasons.add(c.season);
  }

  return [...byTeam.entries()]
    .filter(([, v]) => v.seasons.size >= 2)
    .sort((a, b) => b[1].seasons.size - a[1].seasons.size || b[1].cards.length - a[1].cards.length)
    .map(([team, { cards, seasons }]) => ({
      id: `team_${team}`,
      category: 'collection' as const,
      icon: '🚩',
      title: SINGLE_TEAM_TITLES[team] ?? `${team} 프랜차이즈 완성`,
      description: `${team} 팀의 모든 시즌 카드(${seasons.size}시즌 · ${cards.length}장)를 도감에 해금했습니다.`,
      target: cards.length,
      progress: (owned: ReadonlySet<string>) => cards.filter((c) => owned.has(c.id)).length,
    }));
})();

const LEAGUES = [...new Set(ALL_CARDS.map((c) => c.league).filter(Boolean))].sort();

const LEAGUE_ACHIEVEMENTS: AchievementDef[] = LEAGUES.map((league) => {
  const leagueCards = ALL_CARDS.filter((c) => c.league === league);
  return {
    id: `league_${league}`,
    category: 'collection',
    icon: '🌐',
    title: `${league} 리그 정복`,
    description: `${league} 리그의 모든 카드(${leagueCards.length}장)를 도감에 해금했습니다.`,
    target: leagueCards.length,
    progress: (owned) => leagueCards.filter((c) => owned.has(c.id)).length,
  };
});

const TOURNAMENT_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'tourney_win_1',
    category: 'tournament',
    icon: '🏆',
    title: '첫 번째 우승컵',
    description: '8강 토너먼트에서 처음으로 우승을 차지했습니다.',
    target: 1,
    progress: (_owned, s) => s.tournamentWins,
  },
  {
    id: 'tourney_win_5',
    category: 'tournament',
    icon: '🏅',
    title: '왕조의 시작',
    description: '8강 토너먼트에서 통산 5회 우승을 달성했습니다.',
    target: 5,
    progress: (_owned, s) => s.tournamentWins,
  },
  {
    id: 'tourney_win_10',
    category: 'tournament',
    icon: '👑',
    title: '왕조의 완성',
    description: '8강 토너먼트에서 통산 10회 우승을 달성했습니다.',
    target: 10,
    progress: (_owned, s) => s.tournamentWins,
  },
  {
    id: 'tourney_win_50',
    category: 'tournament',
    icon: '💎',
    title: '불멸의 왕조',
    description: '8강 토너먼트에서 통산 50회 우승을 달성했습니다.',
    target: 50,
    progress: (_owned, s) => s.tournamentWins,
  },
  {
    id: 'tourney_tier3_win_1',
    category: 'tournament',
    icon: '⭐',
    title: '언더독의 반란',
    description: '기본 3성 카드만으로 구성된 시너지 팀으로 토너먼트에 우승했습니다.',
    target: 1,
    progress: (_owned, s) => s.tier3SynergyWins,
  },
  {
    id: 'tourney_tier3_win_10',
    category: 'tournament',
    icon: '🌟',
    title: '언더독 마스터',
    description: '기본 3성 카드 시너지 팀으로 토너먼트에서 10회 우승했습니다.',
    target: 10,
    progress: (_owned, s) => s.tier3SynergyWins,
  },
  {
    id: 'tourney_nosynergy_win_1',
    category: 'tournament',
    icon: '🃏',
    title: '순수 체급의 승리',
    description: '아무 시너지도 발동하지 않은 팀으로 토너먼트에 우승했습니다.',
    target: 1,
    progress: (_owned, s) => s.noSynergyWins,
  },
];

export const ALL_ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'all_cards',
    category: 'collection',
    icon: '🏛️',
    title: '드래프트 그랜드 마스터',
    description: `도감의 모든 카드(${ALL_CARDS.length}장)를 해금했습니다.`,
    target: ALL_CARDS.length,
    progress: (owned) => ALL_CARDS.filter((c) => owned.has(c.id)).length,
  },
  ...FRANCHISE_ACHIEVEMENTS,
  ...SINGLE_TEAM_ACHIEVEMENTS,
  ...LEAGUE_ACHIEVEMENTS,
  ...TOURNAMENT_ACHIEVEMENTS,
];

export function evaluateAchievements(
  owned: ReadonlySet<string>,
  stats: PlayerStats,
): AchievementProgress[] {
  const alreadyUnlocked = new Set(stats.unlockedAchievements);
  return ALL_ACHIEVEMENTS.map((def) => {
    const raw = def.progress(owned, stats);
    const current = Math.min(def.target, Math.max(0, raw));
    const unlocked = alreadyUnlocked.has(def.id) || (def.target > 0 && raw >= def.target);
    return { def, current, target: def.target, unlocked };
  });
}
