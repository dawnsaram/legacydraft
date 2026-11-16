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

const FRANCHISE_ACHIEVEMENTS: AchievementDef[] = TEAM_SYNERGY_GROUPS.map((group) => {
  const teamSet = new Set(group);
  const groupCards = ALL_CARDS.filter((c) => teamSet.has(c.team));
  const label = group.join('-');
  return {
    id: `franchise_${group.join('_')}`,
    category: 'collection',
    icon: '🏅',
    title: `${label} 프랜차이즈 완성`,
    description: `${label} 계보의 모든 카드(${groupCards.length}장)를 도감에 해금했습니다.`,
    target: groupCards.length,
    progress: (owned) => groupCards.filter((c) => owned.has(c.id)).length,
  };
});

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
    icon: '🏆',
    title: '토너먼트 5회 우승',
    description: '8강 토너먼트에서 통산 5회 우승을 달성했습니다.',
    target: 5,
    progress: (_owned, s) => s.tournamentWins,
  },
  {
    id: 'tourney_win_10',
    category: 'tournament',
    icon: '👑',
    title: '토너먼트 10회 우승',
    description: '8강 토너먼트에서 통산 10회 우승을 달성했습니다.',
    target: 10,
    progress: (_owned, s) => s.tournamentWins,
  },
  {
    id: 'tourney_win_50',
    category: 'tournament',
    icon: '💎',
    title: '불멸의 왕조 (50회 우승)',
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
    title: '3성 시너지 마스터',
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
    icon: '📚',
    title: '레거시 그랜드 마스터',
    description: `도감의 모든 카드(${ALL_CARDS.length}장)를 해금했습니다.`,
    target: ALL_CARDS.length,
    progress: (owned) => ALL_CARDS.filter((c) => owned.has(c.id)).length,
  },
  ...FRANCHISE_ACHIEVEMENTS,
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
