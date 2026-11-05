import { ALL_CARDS, CARD_BY_ID, CARD_INDEX_BY_ID } from '../data/cards';
import { cardsOf } from '../game/draft';
import { evaluateSynergy, finalTier, teamScore, topMatch } from '../game/synergy';
import type { Card, GameState, Slot, SynergyResult } from '../types';
import { KIT_FALLBACK_URL, kitUrl } from './views';

// ─────────────────────────────────────────────
// 1. 고정 해상도 Canvas 2D 팀 이미지 렌더러
//    (html2canvas 없이 어떤 화면/브라우저에서도 100% 동일한 비율·레이아웃 보장)
// ─────────────────────────────────────────────

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';

interface CardTheme {
  bgStart: string;
  bgEnd: string;
  nameColor: string;
  metaColor: string;
  badgeBg: string;
  badgeFg: string;
  bonusColor: string;
  starColors: Record<number, string>;
}

function getSeasonTheme(season: string): CardTheme {
  const s = season.toUpperCase();
  if (s.includes('FST')) {
    return {
      bgStart: '#ebe5e7',
      bgEnd: '#ebe5e7',
      nameColor: '#0f172a',
      metaColor: '#334155',
      badgeBg: 'rgba(15, 23, 42, 0.85)',
      badgeFg: '#f8fafc',
      bonusColor: '#b45309',
      starColors: { 3: '#475569', 4: '#7e22ce', 5: '#d97706', 6: '#c026d3' },
    };
  }
  if (s.includes('MSI')) {
    return {
      bgStart: '#191919',
      bgEnd: '#e93323',
      nameColor: '#f8fafc',
      metaColor: '#cbd5e1',
      badgeBg: 'rgba(0, 0, 0, 0.45)',
      badgeFg: '#f8fafc',
      bonusColor: '#fcd34d',
      starColors: { 3: '#94a3b8', 4: '#c084fc', 5: '#fbbf24', 6: '#f0abfc' },
    };
  }
  if (s.includes('WORLDS')) {
    return {
      bgStart: '#020b65',
      bgEnd: '#091047',
      nameColor: '#f8fafc',
      metaColor: '#cbd5e1',
      badgeBg: 'rgba(0, 0, 0, 0.45)',
      badgeFg: '#f8fafc',
      bonusColor: '#fcd34d',
      starColors: { 3: '#94a3b8', 4: '#c084fc', 5: '#fbbf24', 6: '#f0abfc' },
    };
  }
  return {
    bgStart: '#1e293b',
    bgEnd: '#0f172a',
    nameColor: '#f8fafc',
    metaColor: '#cbd5e1',
    badgeBg: 'rgba(0, 0, 0, 0.45)',
    badgeFg: '#f8fafc',
    bonusColor: '#fcd34d',
    starColors: { 3: '#94a3b8', 4: '#c084fc', 5: '#fbbf24', 6: '#f0abfc' },
  };
}

function getLeagueStops(league: string): [string, string, string] {
  switch (league.toUpperCase()) {
    case 'LCK':
      return ['#2b2842', '#1b192a', '#0f0e18'];
    case 'LPL':
      return ['#f25244', '#e13325', '#a31b10'];
    case 'LEC':
      return ['#8ef0d5', '#68e1c0', '#3bb596'];
    case 'LCS':
      return ['#fbfaf8', '#eeece7', '#cfcac0'];
    case 'LCP':
      return ['#f3ab7c', '#e88f56', '#bf6630'];
    default:
      return ['#334155', '#1e293b', '#0b1220'];
  }
}

function getFrameColor(card: Card, tier: number, synergy: SynergyResult): string {
  if (synergy.type === 'legendary') return '#f0abfc';
  if (synergy.type === 'prestige') return '#fbbf24';
  if (synergy.type === 'league' || synergy.type === 'season') return '#38bdf8';
  if (synergy.partial?.cardIds.includes(card.id)) return '#34d399';
  switch (tier) {
    case 6:
      return '#f0abfc';
    case 5:
      return '#f59e0b';
    case 4:
      return '#a855f7';
    default:
      return '#64748b';
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

async function loadKitImage(card: Card): Promise<HTMLImageElement | null> {
  try {
    return await loadImage(kitUrl(card));
  } catch {
    try {
      return await loadImage(KIT_FALLBACK_URL);
    } catch {
      return null;
    }
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

async function drawSlotCard(
  ctx: CanvasRenderingContext2D,
  slot: Slot,
  synergy: SynergyResult,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<void> {
  const { card } = slot;
  const tier = finalTier(card, synergy);
  const bonus = tier - card.baseTier;
  const theme = getSeasonTheme(card.season);
  const frameColor = getFrameColor(card, tier, synergy);

  ctx.save();

  // 카드 그림자 및 배경
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  const bgGrad = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  bgGrad.addColorStop(0, theme.bgStart);
  bgGrad.addColorStop(1, theme.bgEnd);
  ctx.fillStyle = bgGrad;
  ctx.shadowColor =
    synergy.type === 'legendary'
      ? 'rgba(240, 171, 252, 0.45)'
      : synergy.type === 'prestige'
        ? 'rgba(251, 191, 36, 0.35)'
        : 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = synergy.type === 'legendary' || synergy.type === 'prestige' ? 26 : 16;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // 상단: 포지션 배지 & 리그
  const padX = 16;
  const topY = y + 14;
  ctx.font = `700 14px ${FONT}`;
  const posW = ctx.measureText(slot.position).width + 16;
  ctx.fillStyle = theme.badgeBg;
  ctx.beginPath();
  ctx.roundRect(x + padX, topY, posW, 24, 6);
  ctx.fill();

  ctx.fillStyle = theme.badgeFg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(slot.position, x + padX + 8, topY + 12.5);

  ctx.fillStyle = theme.metaColor;
  ctx.textAlign = 'right';
  ctx.fillText(card.league || '—', x + w - padX, topY + 12.5);

  // 중앙 아트 영역 (3:4 비율)
  const artX = x + padX;
  const artY = topY + 34;
  const artW = w - padX * 2;
  const artH = Math.round((artW * 4) / 3);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(artX, artY, artW, artH, 12);
  ctx.clip();

  const [c0, c1, c2] = getLeagueStops(card.league);
  const artGrad = ctx.createLinearGradient(artX, artY, artX + artW, artY + artH);
  artGrad.addColorStop(0, c0);
  artGrad.addColorStop(0.55, c1);
  artGrad.addColorStop(1, c2);
  ctx.fillStyle = artGrad;
  ctx.fillRect(artX, artY, artW, artH);

  // 은은한 중앙 하이라이트
  const radGrad = ctx.createRadialGradient(
    artX + artW * 0.5,
    artY + artH * 0.35,
    4,
    artX + artW * 0.5,
    artY + artH * 0.35,
    artW * 0.7,
  );
  radGrad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  radGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = radGrad;
  ctx.fillRect(artX, artY, artW, artH);

  // 유니폼 SVG 그리기
  const kitImg = await loadKitImage(card);
  if (kitImg) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(kitImg, artX, artY, artW, artH);
    ctx.shadowColor = 'transparent';
  }
  ctx.restore();

  // 하단: 선수 이름, 팀·시즌, 별(티어)
  const textY = artY + artH + 22;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `900 22px ${FONT}`;
  ctx.fillStyle = theme.nameColor;
  ctx.fillText(fitText(ctx, card.playerName, artW), x + padX, textY);

  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = theme.metaColor;
  ctx.fillText(fitText(ctx, `${card.team} · ${card.season}`, artW), x + padX, textY + 22);

  // 별 표시
  const starStr = '★'.repeat(tier);
  ctx.font = `700 18px ${FONT}`;
  if (tier >= 6) {
    const sg = ctx.createLinearGradient(x + padX, 0, x + padX + 110, 0);
    sg.addColorStop(0, '#f0abfc');
    sg.addColorStop(0.5, '#fde68a');
    sg.addColorStop(1, '#67e8f9');
    ctx.fillStyle = sg;
  } else {
    ctx.fillStyle = theme.starColors[tier] ?? '#94a3b8';
  }
  ctx.fillText(starStr, x + padX, textY + 46);

  if (bonus > 0) {
    const starW = ctx.measureText(starStr).width;
    ctx.font = `800 13px ${FONT}`;
    ctx.fillStyle = theme.bonusColor;
    ctx.fillText(`+${bonus}`, x + padX + starW + 6, textY + 45);
  }

  // 프레스티지 / 레전더리 홀로그램 광택 오버레이
  if (synergy.type === 'prestige' || synergy.type === 'legendary') {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 20);
    ctx.clip();
    const holo = ctx.createLinearGradient(x, y, x + w, y + h);
    holo.addColorStop(0.2, 'rgba(255, 255, 255, 0)');
    holo.addColorStop(0.38, 'rgba(255, 0, 170, 0.12)');
    holo.addColorStop(0.52, 'rgba(0, 255, 255, 0.12)');
    holo.addColorStop(0.68, 'rgba(255, 240, 0, 0.12)');
    holo.addColorStop(0.85, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = holo;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // 카드 외곽 프레임
  ctx.beginPath();
  ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 19);
  ctx.lineWidth = synergy.type === 'legendary' || synergy.type === 'prestige' ? 3.5 : 2.5;
  if (synergy.type === 'prestige' || synergy.type === 'legendary') {
    const borderGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    borderGrad.addColorStop(0, '#fcd34d');
    borderGrad.addColorStop(0.5, synergy.type === 'legendary' ? '#f0abfc' : '#fffbeb');
    borderGrad.addColorStop(1, '#d97706');
    ctx.strokeStyle = borderGrad;
  } else {
    ctx.strokeStyle = frameColor;
  }
  ctx.stroke();

  ctx.restore();
}

export async function renderTeamBlob(state: GameState): Promise<Blob> {
  const cards = cardsOf(state);
  const synergy = evaluateSynergy(cards);
  const score = teamScore(cards, synergy);

  const W = 1480;
  const H = 740;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context 생성 실패');
  ctx.scale(2, 2);

  // 전체 배경
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#090d16');
  bg.addColorStop(1, '#020617');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 보드 컨테이너
  const boardX = 36;
  const boardY = 28;
  const boardW = W - 72;
  const boardH = H - 56;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(boardX, boardY, boardW, boardH, 24);
  ctx.fill();
  ctx.stroke();

  // 헤더: 좌측 타이틀 & 팀 점수 / 우측 브랜드 & 날짜
  const padX = boardX + 32;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 13px ${FONT}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText('FINAL ROSTER', padX, boardY + 42);

  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('팀 점수 ', padX, boardY + 78);
  const labelW = ctx.measureText('팀 점수 ').width;
  ctx.fillStyle = '#fcd34d';
  ctx.fillText(String(score), padX + labelW, boardY + 78);

  ctx.textAlign = 'right';
  ctx.font = `900 20px ${FONT}`;
  ctx.fillStyle = '#fcd34d';
  ctx.fillText('LEGACY DRAFT', boardX + boardW - 32, boardY + 50);
  ctx.font = `500 13px ${FONT}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText(new Date().toLocaleDateString('ko-KR'), boardX + boardW - 32, boardY + 74);

  // 5개 슬롯 카드 그리기 (5열 고정)
  const gap = 18;
  const cardsAreaW = boardW - 64;
  const cardW = Math.floor((cardsAreaW - gap * 4) / 5);
  const cardH = 430;
  const cardY = boardY + 102;

  for (let i = 0; i < state.slots.length; i++) {
    const cx = padX + i * (cardW + gap);
    await drawSlotCard(ctx, state.slots[i], synergy, cx, cardY, cardW, cardH);
  }

  // 하단 시너지 패널
  const synY = cardY + cardH + 20;
  const synH = 98;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(padX, synY, cardsAreaW, synH, 16);
  ctx.fill();
  ctx.stroke();

  const synColor =
    synergy.type === 'legendary'
      ? '#f0abfc'
      : synergy.type === 'prestige'
        ? '#fcd34d'
        : synergy.type === 'none'
          ? '#94a3b8'
          : '#7dd3fc';

  ctx.textAlign = 'left';
  ctx.font = `900 20px ${FONT}`;
  ctx.fillStyle = synColor;
  ctx.fillText(synergy.label, padX + 22, synY + 38);

  if (synergy.partial) {
    const lw = ctx.measureText(synergy.label).width;
    ctx.font = `800 15px ${FONT}`;
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText(
      `  ·  TEAM ${synergy.partial.count}/5 (${synergy.partial.team} ${synergy.partial.count}장 +${synergy.partial.tierBonus}성)`,
      padX + 22 + lw,
      synY + 37,
    );
  }

  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(synergy.description, padX + 22, synY + 68);

  // 우측 진행도 칩 (팀 / 시즌 / 리그)
  const chips = (['league', 'season', 'team'] as const)
    .map((k) => {
      const m = topMatch(cards, k);
      const label = { team: '팀', season: '시즌', league: '리그' }[k];
      return m ? `${label}: ${m.value} ${m.count}/5` : '';
    })
    .filter(Boolean);

  let chipRight = padX + cardsAreaW - 22;
  ctx.font = `700 13px ${FONT}`;
  for (const text of chips) {
    const tw = ctx.measureText(text).width + 24;
    const chipX = chipRight - tw;
    const chipY = synY + (synH - 32) / 2;
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(chipX, chipY, tw, 32, 16);
    ctx.fill();

    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, chipX + tw / 2, chipY + 16.5);
    chipRight = chipX - 10;
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 생성 실패'))), 'image/png'),
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveTeamImage(state: GameState): Promise<void> {
  const blob = await renderTeamBlob(state);
  download(blob, `legacy-draft-${Date.now()}.png`);
}

// ─────────────────────────────────────────────
// 2. 링크(URL)를 통한 드림팀 공유 및 복원
// ─────────────────────────────────────────────

const SHARE_PARAM = 'team';

/** 현재 5장의 카드를 짧은 인덱스 코드(예: "a1.b2.c3.d4.e5")로 직렬화한 공유 URL 생성 */
export function buildShareUrl(state: GameState): string {
  const code = state.slots
    .map((s) => {
      const idx = CARD_INDEX_BY_ID.get(s.card.id);
      return idx !== undefined ? idx.toString(36) : s.card.id;
    })
    .join('.');
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(SHARE_PARAM, code);
  return url.toString();
}

/** URL에 ?team=... 파라미터가 있으면 5장의 카드를 복원 */
export function parseSharedCardsFromUrl(): Card[] | null {
  const raw = new URLSearchParams(window.location.search).get(SHARE_PARAM);
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 5) return null;

  const cards: Card[] = [];
  for (const token of parts) {
    if (/^[0-9a-z]+$/i.test(token)) {
      const idx = parseInt(token, 36);
      if (idx >= 0 && idx < ALL_CARDS.length) {
        cards.push(ALL_CARDS[idx]);
        continue;
      }
    }
    const byId = CARD_BY_ID.get(token);
    if (byId) cards.push(byId);
  }
  return cards.length === 5 ? cards : null;
}

export function clearShareUrlParam(): void {
  if (!window.location.search.includes(`${SHARE_PARAM}=`)) return;
  const url = new URL(window.location.href);
  url.searchParams.delete(SHARE_PARAM);
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

export type LinkShareResult = 'shared' | 'copied';

/**
 * 링크 공유:
 *  - 모바일 등 Web Share API 지원 시 공유 시트로 링크+요약 텍스트 전달
 *  - 데스크톱에서는 클립보드에 공유 링크 복사
 */
export async function shareTeamLink(state: GameState): Promise<{ result: LinkShareResult; url: string }> {
  const url = buildShareUrl(state);
  const cards = cardsOf(state);
  const synergy = evaluateSynergy(cards);
  const score = teamScore(cards, synergy);
  const roster = cards.map((c) => `${c.team} ${c.playerName}`).join(' / ');
  const text = `나의 Legacy Draft 드림팀 (${score}점 · ${synergy.label})\n${roster}`;

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Legacy Draft 드림팀', text, url });
      return { result: 'shared', url };
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return { result: 'shared', url };
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return { result: 'copied', url };
  }

  // 구형 브라우저 폴백
  const ta = document.createElement('textarea');
  ta.value = url;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return { result: 'copied', url };
}
