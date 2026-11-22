import {
  evaluateAchievements,
  type AchievementDef,
  type PlayerStats,
} from '../game/achievements';
import type { Card, SynergyResult } from '../types';
import { scheduleStatsSync } from './cloudSync';

const STATS_STORAGE_KEY = 'legacydraft:stats:v1';

const DEFAULT_STATS: PlayerStats = {
  tournamentWins: 0,
  tier3SynergyWins: 0,
  noSynergyWins: 0,
  unlockedAchievements: [],
};

export function normalizeStats(raw: unknown): PlayerStats {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_STATS, unlockedAchievements: [] };
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const unlocked = Array.isArray(r.unlockedAchievements)
    ? [...new Set(r.unlockedAchievements.filter((v): v is string => typeof v === 'string'))]
    : [];
  return {
    tournamentWins: num(r.tournamentWins),
    tier3SynergyWins: num(r.tier3SynergyWins),
    noSynergyWins: num(r.noSynergyWins),
    unlockedAchievements: unlocked,
  };
}

export function loadStats(): PlayerStats {
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS, unlockedAchievements: [] };
    return normalizeStats(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATS, unlockedAchievements: [] };
  }
}

export function saveLocalStats(stats: PlayerStats): void {
  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.warn('[stats] 저장 실패', e);
  }
}

export function checkAndUnlockAchievements(owned: ReadonlySet<string>): AchievementDef[] {
  const stats = loadStats();
  const prevSet = new Set(stats.unlockedAchievements);
  const progressList = evaluateAchievements(owned, stats);
  const newlyUnlocked = progressList.filter((p) => p.unlocked && !prevSet.has(p.def.id)).map((p) => p.def);

  if (newlyUnlocked.length > 0) {
    const next: PlayerStats = {
      ...stats,
      unlockedAchievements: [...prevSet, ...newlyUnlocked.map((d) => d.id)],
    };
    saveLocalStats(next);
    scheduleStatsSync(next);
  }

  return newlyUnlocked;
}

export function recordTournamentWin(
  cards: readonly Card[],
  synergy: SynergyResult,
  owned: ReadonlySet<string>,
): AchievementDef[] {
  const stats = loadStats();
  const hasAnySynergy = synergy.type !== 'none' || synergy.partial !== null;
  const allBaseTier3 = cards.length > 0 && cards.every((c) => c.baseTier === 3);

  const next: PlayerStats = {
    ...stats,
    tournamentWins: stats.tournamentWins + 1,
    tier3SynergyWins: stats.tier3SynergyWins + (allBaseTier3 && hasAnySynergy ? 1 : 0),
    noSynergyWins: stats.noSynergyWins + (!hasAnySynergy ? 1 : 0),
  };

  const prevSet = new Set(next.unlockedAchievements);
  const progressList = evaluateAchievements(owned, next);
  const newlyUnlocked = progressList.filter((p) => p.unlocked && !prevSet.has(p.def.id)).map((p) => p.def);

  if (newlyUnlocked.length > 0) {
    next.unlockedAchievements = [...prevSet, ...newlyUnlocked.map((d) => d.id)];
  }

  saveLocalStats(next);
  scheduleStatsSync(next);
  return newlyUnlocked;
}
