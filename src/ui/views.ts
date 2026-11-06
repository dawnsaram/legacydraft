import { ALL_CARDS } from '../data/cards';
import { MAX_REROLLS, canReroll, cardsOf, findAnchor, rerollsLeft } from '../game/draft';
import { ANCHOR_BOOST_BONUS, ANCHOR_BOOST_MIN_COUNT, ANCHOR_CHANCE_BY_REROLL, TIER_WEIGHTS, anchorChance } from '../game/probability';
import { evaluateSynergy, finalTier, teamScore, topMatch } from '../game/synergy';
import { POSITIONS, type Card, type GameState, type Position, type Slot, type SynergyResult } from '../types';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

const POSITION_LABEL: Record<string, string> = {
  TOP: '탑',
  JGL: '정글',
  MID: '미드',
  BOT: '원딜',
  SUP: '서포터',
};

function stars(n: number): string {
  return `<span class="stars stars-${n}">${'★'.repeat(n)}</span>`;
}

function synergyClass(card: Card, s: SynergyResult): string {
  switch (s.type) {
    case 'legendary':
      return 'card-prestige card-legendary';
    case 'prestige':
      return 'card-prestige';
    case 'league':
    case 'season':
      return 'card-synergy';
  }
  if (s.partial?.cardIds.includes(card.id)) {
    return s.partial.count >= 4 ? 'card-partial card-partial-4' : 'card-partial';
  }
  return '';
}

function leagueClass(league: string): string {
  switch (league.toUpperCase()) {
    case 'LCK':
      return 'league-lck';
    case 'LPL':
      return 'league-lpl';
    case 'LEC':
      return 'league-lec';
    case 'LCS':
      return 'league-lcs';
    case 'LCP':
      return 'league-lcp';
    default:
      return '';
  }
}

function seasonClass(season: string): string {
  const s = season.toUpperCase();
  if (s.includes('WORLDS')) return 'season-worlds';
  if (s.includes('MSI')) return 'season-msi';
  if (s.includes('FST')) return 'season-fst';
  return '';
}

export const KIT_FALLBACK_URL = `${import.meta.env.BASE_URL}assets/kits/fallback.svg`;

/** 시즌과 팀명으로 유니폼(Kit) 아이콘 경로 반환 (예: "2026 MSI" + "BLG" → "assets/kits/2026_blg.svg") */
export function kitUrl(card: Card): string {
  const year = card.season.trim().split(/\s+/)[0] ?? '';
  const team = card.team.trim().toLowerCase();
  if (!year || !team) return KIT_FALLBACK_URL;
  return `${import.meta.env.BASE_URL}assets/kits/${year}_${team}.svg`;
}

function cardArt(card: Card): string {
  return `
    <div class="card-art ${leagueClass(card.league)}">
      <img class="card-kit" src="${esc(kitUrl(card))}" alt="${esc(card.team)} 유니폼" data-kit-fallback loading="lazy" draggable="false" />
    </div>`;
}

function particles(): string {
  return Array.from(
    { length: 10 },
    (_, i) => `<span class="particle" style="--x:${8 + i * 9}%;--d:${(i * 0.17).toFixed(2)}s"></span>`,
  ).join('');
}

// ─────────────────────────────────────────────
// 카드
// ─────────────────────────────────────────────

/**
 * 카드 뒤집기 연출 상태
 *  - in : 뒷면 → 앞면 (최초 드래프트 / 리롤 결과 공개)
 *  - out: 앞면 → 뒷면 (리롤 직전, 기존 카드 덮기)
 */
export interface FlipState {
  mode: 'in' | 'out';
  indices: ReadonlySet<number>;
}

export const FLIP_STAGGER_MS = 110;
/** CSS의 .flip-in / .flip-out 애니메이션 시간과 맞춰야 함 */
export const FLIP_IN_MS = 600;
export const FLIP_OUT_MS = 280;

/** n장을 시차를 두고 뒤집을 때 마지막 카드까지 끝나는 시간 */
export function flipDurationMs(count: number, mode: 'in' | 'out' = 'in'): number {
  if (count <= 0) return 0;
  return (count - 1) * FLIP_STAGGER_MS + (mode === 'in' ? FLIP_IN_MS : FLIP_OUT_MS);
}

/** 포지션 아이콘 (public/assets/icons) */
export const POSITION_ICON: Record<Position, string> = {
  TOP: `${import.meta.env.BASE_URL}assets/icons/top.svg`,
  JGL: `${import.meta.env.BASE_URL}assets/icons/jgl.svg`,
  MID: `${import.meta.env.BASE_URL}assets/icons/mid.svg`,
  BOT: `${import.meta.env.BASE_URL}assets/icons/bot.svg`,
  SUP: `${import.meta.env.BASE_URL}assets/icons/spt.svg`,
};

function cardBack(position: Position): string {
  return `
    <div class="card-back" aria-hidden="true">
      <div class="card-back-emblem">
        <img class="card-back-icon" src="${POSITION_ICON[position]}" alt="" draggable="false" />
      </div>
      <div class="card-back-label">${position}</div>
    </div>`;
}

export function renderCard(
  slot: Slot,
  index: number,
  synergy: SynergyResult,
  interactive: boolean,
  flip?: FlipState,
  isNew = false,
): string {
  const { card } = slot;
  const tier = finalTier(card, synergy);
  const bonus = tier - card.baseTier;
  const isFx = synergy.type === 'prestige' || synergy.type === 'legendary';

  // 연출 대상 슬롯끼리만 순서대로 시차를 준다
  const flipOrder = flip ? [...flip.indices].sort((a, b) => a - b).indexOf(index) : -1;
  const flipClass = flipOrder >= 0 ? `flip-${flip!.mode}` : '';
  const flipStyle = flipOrder >= 0 ? `style="--flip-delay:${flipOrder * FLIP_STAGGER_MS}ms"` : '';

  return `
  <button type="button" class="card-slot"
    ${interactive ? `data-action="toggle-lock" data-index="${index}"` : 'disabled'}
    aria-pressed="${slot.isLocked}">
    <div class="card-flipper ${flipClass}" ${flipStyle}>
      <div class="card tier-${tier} ${seasonClass(card.season)} ${synergyClass(card, synergy)} ${slot.isLocked ? 'is-locked' : ''}">
        <div class="card-inner">
          <div class="flex items-center justify-between px-2 pt-1.5 text-[10px] font-bold tracking-wider sm:px-3 sm:pt-2 sm:text-[11px]">
            <span class="card-pos-badge rounded px-1 py-0.5 sm:px-1.5">${slot.position}</span>
            <span class="card-meta truncate">${esc(card.league || '—')}</span>
          </div>
          ${cardArt(card)}
          <div class="px-2 pb-2 text-left sm:px-3 sm:pb-3">
            <div class="card-name truncate text-xs font-extrabold leading-tight sm:text-lg">${esc(card.playerName)}</div>
            <div class="card-meta truncate text-[10px] sm:text-xs">${esc(card.team)} · ${esc(card.season)}</div>
            <div class="mt-0.5 flex items-center gap-1 text-xs sm:mt-1 sm:text-sm">
              ${stars(tier)}
              ${bonus > 0 ? `<span class="card-bonus text-[9px] font-bold sm:text-[10px]">+${bonus}</span>` : ''}
            </div>
          </div>
        </div>
        ${isFx ? '<div class="holo-overlay"></div>' : ''}
        ${synergy.type === 'legendary' ? `<div class="glare"></div>${particles()}` : ''}
        ${isNew ? '<div class="new-badge">NEW</div>' : ''}
        ${slot.isLocked ? '<div class="lock-badge">HOLD</div>' : ''}
      </div>
      ${cardBack(slot.position)}
    </div>
  </button>`;
}

// ─────────────────────────────────────────────
// 화면: 홈
// ─────────────────────────────────────────────

export function renderHome(ownedCount: number): string {
  const pct = (w: Record<number, number>) => `3성 ${w[3]}% · 4성 ${w[4]}% · 5성 ${w[5]}%`;
  return `
  <main class="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 py-16 text-center">
    <div>
      <p class="mb-2 text-sm font-semibold tracking-[0.3em] text-amber-400">LoL ESPORTS CARD DRAFT</p>
      <h1 class="title-glow text-5xl font-black tracking-tight sm:text-7xl">LEGACY DRAFT</h1>
      <p class="mt-4 text-slate-400">역대 레전드를 뽑아 5인 드림팀을 완성하세요.</p>
    </div>

    <div class="flex w-full max-w-xs flex-col gap-3">
      <button data-action="start" class="btn-primary">드래프트 시작</button>
      <button data-action="collection" class="btn-secondary">도감 (${ownedCount} / ${ALL_CARDS.length})</button>
    </div>

    <section class="grid w-full gap-3 text-left text-sm text-slate-300 sm:grid-cols-3">
      <div class="panel"><b class="text-slate-100">1. 드래프트</b><br/>5개 포지션에 카드가 1장씩 배치됩니다.<br/><span class="text-xs text-slate-500">${pct(TIER_WEIGHTS.initial)}</span></div>
      <div class="panel"><b class="text-slate-100">2. 홀드 &amp; 리롤</b><br/>카드를 클릭해 고정하고, 나머지를 최대 ${MAX_REROLLS}회 다시 뽑습니다. 리롤할수록 같은 팀·시즌 확률 ↑ (${ANCHOR_CHANCE_BY_REROLL.map((p) => `${p * 100}%`).join('→')}, ${ANCHOR_BOOST_MIN_COUNT}명 모이면 +${Math.round(ANCHOR_BOOST_BONUS * 100)}%p)<br/><span class="text-xs text-slate-500">${pct(TIER_WEIGHTS.reroll)}</span></div>
      <div class="panel"><b class="text-slate-100">3. 시너지</b><br/>같은 팀 <span class="text-emerald-300">3~4장</span> 해당 카드 +1, 같은 리그/시즌 +1, 같은 팀 <span class="text-amber-300">프레스티지</span> +1, 같은 팀+시즌 <span class="text-fuchsia-300">레전더리</span> +2</div>
    </section>
  </main>`;
}

// ─────────────────────────────────────────────
// 화면: 게임
// ─────────────────────────────────────────────

function synergyPanel(state: GameState, synergy: SynergyResult): string {
  const cards = cardsOf(state);
  const hint = (['team', 'season', 'league'] as const)
    .map((k) => {
      const m = topMatch(cards, k);
      const label = { team: '팀', season: '시즌', league: '리그' }[k];
      return m ? `<span class="chip">${label}: ${esc(m.value)} <b>${m.count}/5</b></span>` : '';
    })
    .join('');
  const color =
    synergy.type === 'legendary'
      ? 'text-fuchsia-300'
      : synergy.type === 'prestige'
        ? 'text-amber-300'
        : synergy.type === 'none'
          ? 'text-slate-400'
          : 'text-sky-300';

  const partial = synergy.partial
    ? `<div class="mt-1 text-sm font-bold text-emerald-300">
         TEAM ${synergy.partial.count}/5 · ${esc(synergy.partial.team)} ${synergy.partial.count}장 +${synergy.partial.tierBonus}성
       </div>`
    : '';
  const anchor = state.phase === 'drafting' ? findAnchor(state) : null;
  const boostBadge =
    anchor && anchor.count >= ANCHOR_BOOST_MIN_COUNT
      ? ` <span class="font-bold text-amber-300">(${anchor.count}명 집결 확률 UP!)</span>`
      : '';
  const anchorHint =
    anchor && canReroll(state)
      ? `<div class="mt-1 text-xs text-cyan-300/80">다음 리롤: 슬롯마다 ${Math.round(anchorChance(state.rerollsUsed, anchor.count) * 100)}% 확률로 ${esc(anchor.season)} ${esc(anchor.team)} 선수 등장${boostBadge}</div>`
      : '';

  return `
  <div class="panel reveal-after flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div class="text-lg font-black ${color}">${synergy.label}</div>
      <div class="text-sm text-slate-400">${esc(synergy.description)}</div>
      ${partial}
      ${anchorHint}
    </div>
    <div class="flex flex-wrap gap-2 text-xs">${hint}</div>
  </div>`;
}

export function renderGame(
  state: GameState,
  flip?: FlipState,
  isSharedView = false,
  newCardIds?: ReadonlySet<string>,
): string {
  const cards = cardsOf(state);
  const synergy = evaluateSynergy(cards);
  const finished = state.phase === 'finished';
  const left = rerollsLeft(state);
  const dots = Array.from(
    { length: MAX_REROLLS },
    (_, i) => `<span class="reroll-dot ${i < left ? 'is-on' : ''}"></span>`,
  ).join('');
  // 카드가 다 뒤집힌 뒤에 점수/시너지 공개 (스포일러 방지)
  const revealing = flip?.mode === 'in';
  const revealDelay = revealing ? flipDurationMs(flip.indices.size) : 0;

  return `
  <main class="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6">
    <header class="flex items-center justify-between">
      <button data-action="home" class="text-sm text-slate-400 hover:text-white">← 메인</button>
      <h1 class="text-xl font-black tracking-tight">LEGACY DRAFT</h1>
      <div class="flex items-center gap-2 text-sm text-slate-400">
        ${isSharedView ? '<span class="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300">공유된 드림팀</span>' : `리롤 <span class="flex gap-1">${dots}</span>`}
      </div>
    </header>

    <section id="team-board" class="flex flex-col gap-3 rounded-2xl bg-slate-900/60 p-3 sm:gap-4 sm:p-6 ${revealing ? 'is-revealing' : ''}"
      style="--reveal-delay:${revealDelay}ms">
      <div class="flex items-end justify-between px-1 sm:px-0">
        <div class="reveal-after">
          <div class="text-[10px] tracking-widest text-slate-500 sm:text-xs">${isSharedView ? 'SHARED ROSTER' : finished ? 'FINAL ROSTER' : 'DRAFTING'}</div>
          <div class="text-xl font-black sm:text-2xl">팀 점수 <span class="text-amber-300">${teamScore(cards, synergy)}</span></div>
        </div>
        <div class="text-right text-[11px] text-slate-500 sm:text-xs">${finished ? new Date().toLocaleDateString('ko-KR') : '카드를 탭해 HOLD'}</div>
      </div>
      <div class="roster-grid">
        ${state.slots.map((s, i) => renderCard(s, i, synergy, !finished, flip, Boolean(newCardIds?.has(s.card.id)))).join('')}
      </div>
      ${synergyPanel(state, synergy)}
    </section>

    <footer class="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:justify-center sm:gap-3">
      ${
        finished
          ? `
        <button data-action="save" class="btn-primary">이미지 저장</button>
        <button data-action="share" class="btn-secondary">링크 공유</button>
        <button data-action="start" class="btn-secondary col-span-2 sm:col-span-1">${isSharedView ? '나도 드래프트 하기' : '다시 드래프트'}</button>`
          : `
        <button data-action="reroll" class="btn-primary" ${canReroll(state) ? '' : 'disabled'}>
          리롤 (${left}회 남음)
        </button>
        <button data-action="finalize" class="btn-secondary">이 팀으로 확정</button>`
      }
    </footer>
  </main>`;
}

// ─────────────────────────────────────────────
// 화면: 도감
// ─────────────────────────────────────────────

export interface CollectionFilter {
  position: string;
  league: string;
  ownedOnly: boolean;
}

const LEAGUES = [...new Set(ALL_CARDS.map((c) => c.league).filter(Boolean))].sort();

function option(value: string, label: string, selected: string): string {
  return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
}

export function renderCollection(owned: Set<string>, filter: CollectionFilter): string {
  const list = ALL_CARDS.filter(
    (c) =>
      (filter.position === 'ALL' || c.position === filter.position) &&
      (filter.league === 'ALL' || c.league === filter.league) &&
      (!filter.ownedOnly || owned.has(c.id)),
  );
  const ownedTotal = ALL_CARDS.filter((c) => owned.has(c.id)).length;
  const pct = ((ownedTotal / ALL_CARDS.length) * 100).toFixed(1);

  const items = list
    .map((c) => {
      const has = owned.has(c.id);
      return has
        ? `<div class="dex-item tier-${c.baseTier} ${seasonClass(c.season)}">
            ${cardArt(c)}
            <div class="p-2 text-left">
              <div class="card-name truncate text-sm font-bold">${esc(c.playerName)}</div>
              <div class="card-meta truncate text-[10px]">${c.position} · ${esc(c.team)} · ${esc(c.season)}</div>
              ${stars(c.baseTier)}
            </div>
          </div>`
        : `<div class="dex-item is-unknown">
            <div class="card-art"><div class="card-art-fallback">?</div></div>
            <div class="p-2 text-left">
              <div class="text-sm font-bold text-slate-600">???</div>
              <div class="truncate text-[10px] text-slate-600">${c.position} · ${esc(c.season)}</div>
            </div>
          </div>`;
    })
    .join('');

  return `
  <main class="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6">
    <header class="flex items-center justify-between">
      <button data-action="home" class="text-sm text-slate-400 hover:text-white">← 메인</button>
      <h1 class="text-xl font-black">도감</h1>
      <div class="text-sm text-slate-400">${ownedTotal} / ${ALL_CARDS.length} (${pct}%)</div>
    </header>

    <div class="h-2 overflow-hidden rounded-full bg-slate-800">
      <div class="h-full bg-gradient-to-r from-amber-500 to-fuchsia-500" style="width:${pct}%"></div>
    </div>

    <div class="flex flex-wrap items-center gap-3 text-sm">
      <select data-filter="position" class="select">
        ${option('ALL', '전체 포지션', filter.position)}
        ${POSITIONS.map((p) => option(p, `${p} (${POSITION_LABEL[p]})`, filter.position)).join('')}
      </select>
      <select data-filter="league" class="select">
        ${option('ALL', '전체 리그', filter.league)}
        ${LEAGUES.map((l) => option(l, l, filter.league)).join('')}
      </select>
      <label class="flex items-center gap-2 text-slate-300">
        <input type="checkbox" data-filter="ownedOnly" ${filter.ownedOnly ? 'checked' : ''} /> 보유 카드만
      </label>
      <span class="ml-auto text-slate-500">${list.length}장 표시</span>
    </div>

    <div class="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">${items}</div>
  </main>`;
}

