import rawGallery from '../../gallery.json';
import { POSITIONS, type BaseTier, type Card } from '../types';
import { ALL_CARDS } from './cards';

export interface GalleryMeta {
  id: string;
  season: string;
  team: string;
  heroUrl: string;
  description: string;
}

export interface GalleryEntry {
  id: string;
  season: string;
  team: string;
  league: string;
  baseTier: BaseTier;
  heroUrl: string;
  description: string;
  cards: readonly Card[];
}

function isGalleryMeta(v: unknown): v is GalleryMeta {
  if (typeof v !== 'object' || v === null) return false;
  const g = v as Record<string, unknown>;
  return (
    typeof g.season === 'string' &&
    typeof g.team === 'string' &&
    typeof g.heroUrl === 'string' &&
    typeof g.description === 'string'
  );
}

/** 상대 경로(예: "assets/heroes/..." 또는 "/assets/heroes/...")를 BASE_URL 기준으로 보정 */
export function resolveAssetUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  const clean = trimmed.replace(/^\.?\//, '');
  return `${import.meta.env.BASE_URL}${clean}`;
}

const META_BY_KEY: ReadonlyMap<string, GalleryMeta> = (() => {
  const map = new Map<string, GalleryMeta>();
  if (Array.isArray(rawGallery)) {
    for (const item of rawGallery as unknown[]) {
      if (isGalleryMeta(item)) {
        map.set(`${item.season}|${item.team}`, item);
      }
    }
  }
  return map;
})();

const POS_ORDER: Record<string, number> = Object.fromEntries(POSITIONS.map((p, i) => [p, i]));

export const ALL_GALLERY_ENTRIES: readonly GalleryEntry[] = (() => {
  const grouped = new Map<string, Card[]>();
  for (const card of ALL_CARDS) {
    const key = `${card.season}|${card.team}`;
    const list = grouped.get(key);
    if (list) list.push(card);
    else grouped.set(key, [card]);
  }

  const entries: GalleryEntry[] = [];
  for (const [key, cards] of grouped) {
    const first = cards[0];
    const meta = META_BY_KEY.get(key);
    const sortedCards = [...cards].sort((a, b) => (POS_ORDER[a.position] ?? 99) - (POS_ORDER[b.position] ?? 99));
    entries.push({
      id: meta?.id || `${first.season.replace(/\s+/g, '_')}_${first.team}`,
      season: first.season,
      team: first.team,
      league: first.league,
      baseTier: first.baseTier,
      heroUrl: meta?.heroUrl ? resolveAssetUrl(meta.heroUrl) : '',
      description: meta?.description?.trim() ?? '',
      cards: sortedCards,
    });
  }
  return entries;
})();

