import {
  ROUND_LABELS,
  displayedScore,
  findPlayerMatch,
  type TournamentMatch,
  type TournamentState,
  type TournamentTeam,
} from '../game/tournament';
import { finalTier } from '../game/synergy';
import { KIT_FALLBACK_URL, esc, kitUrl } from './views';

function teamRosterRows(team: TournamentTeam): string {
  return team.cards
    .map((c) => {
      const tier = finalTier(c, team.synergy);
      return `
      <div class="flex items-center justify-between gap-2 rounded-lg bg-slate-950/55 px-2.5 py-1 text-xs">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class="w-7 shrink-0 font-bold text-slate-400">${c.position}</span>
          <span class="truncate font-bold text-slate-100">${esc(c.playerName)}</span>
        </div>
        <span class="shrink-0 font-bold text-amber-300">${'★'.repeat(tier)}</span>
      </div>`;
    })
    .join('');
}

function renderTeamCard(team: TournamentTeam, align: 'left' | 'right', isWinner: boolean): string {
  const sample = team.cards[0];
  const kitSrc = sample ? kitUrl(sample) : KIT_FALLBACK_URL;

  const headerBg = team.heroUrl
    ? `<img class="tournament-hero-img" src="${esc(team.heroUrl)}" alt="${esc(team.name)}" data-hero-fallback draggable="false" />
       <div class="tournament-hero-overlay"></div>`
    : `<div class="tournament-hero-overlay is-player"></div>`;

  return `
  <div class="tournament-team-card ${team.isPlayer ? 'is-player' : ''} ${isWinner ? 'is-winner' : ''}">
    <div class="tournament-team-banner">
      ${headerBg}
      <div class="relative z-10 flex w-full items-center gap-3 p-3 ${align === 'right' ? 'flex-row-reverse text-right' : 'text-left'}">
        ${
          team.isPlayer
            ? `<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-400/50 bg-amber-500/20 text-xl font-black text-amber-300">★</div>`
            : `<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-slate-900/75 p-1">
                 <img class="h-full w-full object-contain" src="${esc(kitSrc)}" alt="${esc(team.shortName)}" data-kit-fallback draggable="false" />
               </div>`
        }
        <div class="min-w-0 flex-1">
          <div class="text-[11px] font-bold tracking-wider ${team.isPlayer ? 'text-amber-300' : 'text-slate-300'}">
            ${team.isPlayer ? 'PLAYER · ' + esc(team.synergy.label) : `${esc(team.season ?? '')} · ${esc(team.league ?? '')}`}
          </div>
          <div class="truncate text-lg font-black text-white">${esc(team.isPlayer ? 'MY DREAM TEAM' : team.shortName)}</div>
        </div>
        <div class="shrink-0 rounded-lg bg-slate-950/75 px-2.5 py-1 text-center">
          <div class="text-[9px] font-bold text-slate-400">SCORE</div>
          <div class="text-base font-black text-amber-300">${team.score}</div>
        </div>
      </div>
    </div>
    <div class="flex flex-col gap-1 p-2.5">
      ${teamRosterRows(team)}
    </div>
  </div>`;
}

function renderSetFeed(match: TournamentMatch): string {
  const shown = match.sets.slice(0, match.revealedSets);
  if (shown.length === 0) {
    return `<div class="py-3 text-center text-xs text-slate-500">경기 시작 버튼을 누르면 Bo5 세트별 경기가 진행됩니다.</div>`;
  }

  return `
  <div class="flex flex-col gap-1.5">
    ${shown
      .map((s, idx) => {
        const aWon = s.winnerId === match.teamA?.id;
        const winnerName = aWon ? match.teamA?.shortName : match.teamB?.shortName;
        const isLatest = idx === shown.length - 1;
        return `
        <div class="tournament-set-row ${isLatest ? 'is-latest' : ''} ${aWon ? 'is-left' : 'is-right'}">
          <span class="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-black text-slate-300">SET ${s.setNumber}</span>
          <span class="shrink-0 text-xs font-extrabold ${aWon ? 'text-amber-300' : 'text-sky-300'}">${esc(winnerName ?? '')} 승</span>
          <span class="min-w-0 flex-1 truncate text-xs text-slate-300">${esc(s.summary)}</span>
        </div>`;
      })
      .join('')}
  </div>`;
}

function renderArena(state: TournamentState): string {
  const roundLabel = ROUND_LABELS[state.currentRound];
  const match = findPlayerMatch(state);

  if (!match || !match.teamA || !match.teamB) {
    return '';
  }

  const { a, b } = displayedScore(match);
  const doneMatch = state.phase !== 'ready' && state.phase !== 'playing';
  const aWinner = doneMatch && match.winnerId === match.teamA.id;
  const bWinner = doneMatch && match.winnerId === match.teamB.id;

  const statusBanner =
    state.phase === 'champion'
      ? `<div class="rounded-xl border border-amber-400/60 bg-gradient-to-r from-amber-500/20 via-fuchsia-500/20 to-amber-500/20 px-4 py-3 text-center">
           <div class="text-lg font-black text-amber-300 sm:text-xl">🏆 LEGACY CUP 최종 우승!</div>
           <div class="text-xs text-slate-200">역대 최강 로스터들을 모두 꺾고 정상에 올랐습니다.</div>
         </div>`
      : state.phase === 'eliminated'
        ? `<div class="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-center">
             <div class="text-base font-black text-rose-300 sm:text-lg">${roundLabel}에서 아쉽게 탈락했습니다</div>
             <div class="text-xs text-slate-400">새로운 드래프트로 다시 우승에 도전해보세요!</div>
           </div>`
        : '';

  const controls = (() => {
    switch (state.phase) {
      case 'ready':
        return `<button data-action="tournament-play" class="btn-primary w-full sm:w-auto">⚔️ ${roundLabel} 경기 시작 (Bo5)</button>`;
      case 'playing':
        return `<button data-action="tournament-skip" class="btn-secondary w-full sm:w-auto">결과 바로 보기 ⏭</button>`;
      case 'round_done':
        return `<button data-action="tournament-next" class="btn-primary w-full sm:w-auto">${ROUND_LABELS[state.currentRound + 1]} 진출! 다음 라운드 →</button>`;
      case 'champion':
      case 'eliminated':
        return `
          <button data-action="start" class="btn-primary flex-1 sm:flex-initial">다시 드래프트</button>
          <button data-action="tournament-back" class="btn-secondary flex-1 sm:flex-initial">← 내 로스터로</button>`;
    }
  })();

  return `
  <section class="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:p-5">
    <div class="flex items-center justify-between">
      <span class="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black tracking-wider text-amber-300">${roundLabel} · 5전 3선승제</span>
      <span class="text-xs text-slate-400">${state.phase === 'playing' ? '세트 진행 중...' : doneMatch ? '경기 종료' : '대진 확정'}</span>
    </div>

    ${statusBanner}

    <div class="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
      ${renderTeamCard(match.teamA, 'left', aWinner)}

      <div class="flex flex-row items-center justify-center gap-4 rounded-xl bg-slate-950/65 px-5 py-3 lg:flex-col">
        <div class="text-[11px] font-bold tracking-widest text-slate-500">BO5</div>
        <div class="flex items-center gap-3 text-3xl font-black sm:text-4xl">
          <span class="${a > b ? 'text-amber-300' : 'text-slate-100'}">${a}</span>
          <span class="text-lg text-slate-600">:</span>
          <span class="${b > a ? 'text-sky-300' : 'text-slate-100'}">${b}</span>
        </div>
        <div class="text-[10px] font-bold text-slate-400">3선승</div>
      </div>

      ${renderTeamCard(match.teamB, 'right', bWinner)}
    </div>

    <div class="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3">
      ${renderSetFeed(match)}
    </div>

    <div class="flex flex-wrap justify-center gap-2.5">
      ${controls}
    </div>
  </section>`;
}

function bracketSlot(
  team: TournamentTeam | null,
  score: number,
  hasResult: boolean,
  isWinner: boolean,
): string {
  if (!team) {
    return `<div class="flex items-center justify-between px-2.5 py-1.5 text-xs text-slate-600"><span>TBD</span><span>-</span></div>`;
  }
  return `
  <div class="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs ${
    team.isPlayer ? 'bg-amber-500/10 font-black text-amber-200' : 'text-slate-200'
  } ${isWinner ? 'font-bold' : hasResult ? 'opacity-50' : ''}">
    <div class="flex min-w-0 items-center gap-1.5">
      ${team.isPlayer ? '<span class="text-amber-400">★</span>' : ''}
      <span class="truncate">${esc(team.isPlayer ? 'MY DREAM TEAM' : `${team.season ?? ''} ${team.shortName}`)}</span>
    </div>
    <span class="shrink-0 font-black ${isWinner ? 'text-amber-300' : 'text-slate-400'}">${hasResult ? score : team.score}</span>
  </div>`;
}

function renderBracketMatch(match: TournamentMatch, state: TournamentState): string {
  const isPlayerMatch =
    match.teamA?.id === state.playerTeamId || match.teamB?.id === state.playerTeamId;
  const isCurrentRound = match.round === state.currentRound;
  const isRevealedDone = match.winnerId !== null && match.revealedSets >= match.sets.length;
  const { a, b } = isPlayerMatch && isCurrentRound ? displayedScore(match) : { a: match.scoreA, b: match.scoreB };

  return `
  <div class="overflow-hidden rounded-xl border ${
    isPlayerMatch && isCurrentRound
      ? 'border-amber-400/70 shadow-lg shadow-amber-500/10'
      : 'border-slate-800'
  } bg-slate-900/85 divide-y divide-slate-800/80">
    ${bracketSlot(match.teamA, a, isRevealedDone || (isPlayerMatch && match.revealedSets > 0), isRevealedDone && match.winnerId === match.teamA?.id)}
    ${bracketSlot(match.teamB, b, isRevealedDone || (isPlayerMatch && match.revealedSets > 0), isRevealedDone && match.winnerId === match.teamB?.id)}
  </div>`;
}

export function renderTournament(state: TournamentState): string {
  const qf = state.matches.filter((m) => m.round === 0);
  const sf = state.matches.filter((m) => m.round === 1);
  const finalMatch = state.matches.filter((m) => m.round === 2);

  return `
  <main class="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6">
    <header class="flex items-center justify-between">
      <button data-action="tournament-back" class="text-xs text-slate-400 hover:text-white sm:text-sm">← 로스터</button>
      <h1 class="text-base font-black tracking-tight sm:text-xl">LEGACY CUP · 8강 토너먼트</h1>
      <span class="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-amber-300">${ROUND_LABELS[state.currentRound]}</span>
    </header>

    ${renderArena(state)}

    <section class="panel flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-black tracking-wider text-slate-200">토너먼트 대진표</h2>
        <span class="text-[11px] text-slate-500">경기 전에는 팀 점수, 종료 후에는 세트 스코어 표시</span>
      </div>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="flex flex-col gap-2">
          <div class="text-xs font-bold text-slate-400">8강 (Quarterfinals)</div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
            ${qf.map((m) => renderBracketMatch(m, state)).join('')}
          </div>
        </div>
        <div class="flex flex-col justify-around gap-2">
          <div class="text-xs font-bold text-slate-400">4강 (Semifinals)</div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
            ${sf.map((m) => renderBracketMatch(m, state)).join('')}
          </div>
        </div>
        <div class="flex flex-col justify-center gap-2">
          <div class="text-xs font-bold text-amber-300">결승 (Finals)</div>
          ${finalMatch.map((m) => renderBracketMatch(m, state)).join('')}
        </div>
      </div>
    </section>
  </main>`;
}

