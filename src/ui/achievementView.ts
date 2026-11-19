import {
  evaluateAchievements,
  type AchievementCategory,
  type PlayerStats,
} from '../game/achievements';
import { esc, type OwnershipFilter } from './views';

export interface AchievementFilter {
  category: 'ALL' | AchievementCategory;
  ownership: OwnershipFilter;
}

function renderAchievementStatusToggle(current: OwnershipFilter): string {
  const opts: [OwnershipFilter, string][] = [
    ['ALL', '전체'],
    ['OWNED', '달성'],
    ['MISSING', '미달성'],
  ];
  return `
  <div class="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs font-bold" role="group" aria-label="달성 여부 필터">
    ${opts
      .map(
        ([val, label]) => `
      <button type="button" data-action="set-ownership" data-target="achievements" data-value="${val}"
        class="rounded-md px-2.5 py-1.5 transition ${
          current === val ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
        }">${label}</button>`,
      )
      .join('')}
  </div>`;
}

export function renderAchievements(
  owned: ReadonlySet<string>,
  stats: PlayerStats,
  filter: AchievementFilter,
): string {
  const all = evaluateAchievements(owned, stats);
  const unlockedTotal = all.filter((a) => a.unlocked).length;
  const pct = ((unlockedTotal / Math.max(1, all.length)) * 100).toFixed(1);

  const filtered = all.filter((a) => {
    const matchStatus =
      filter.ownership === 'ALL' ||
      (filter.ownership === 'OWNED' && a.unlocked) ||
      (filter.ownership === 'MISSING' && !a.unlocked);
    return (filter.category === 'ALL' || a.def.category === filter.category) && matchStatus;
  });

  // 달성 완료된 업적을 위쪽에, 미달성 업적은 진행률 높은 순으로 정렬
  const sorted = [...filtered].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return Number(b.unlocked) - Number(a.unlocked);
    const ratioA = a.current / Math.max(1, a.target);
    const ratioB = b.current / Math.max(1, b.target);
    return ratioB - ratioA;
  });

  const cardsHtml =
    sorted.length > 0
      ? sorted
        .map(({ def, current, target, unlocked }) => {
          const barPct = Math.min(100, Math.round((current / Math.max(1, target)) * 100));
          return `
            <article class="panel flex flex-col justify-between gap-3 text-left ${unlocked ? 'border-amber-400/60 bg-amber-500/5 shadow-lg shadow-amber-500/5' : 'opacity-85'
            }">
              <div class="flex items-start gap-3">
                <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-lg ${unlocked
              ? 'border-amber-400/50 bg-amber-500/15'
              : 'border-slate-700 bg-slate-800/70 grayscale'
            }">${def.icon}</div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center justify-between gap-1.5">
                    <h2 class="truncate text-sm font-extrabold ${unlocked ? 'text-amber-200' : 'text-slate-100'}">${esc(def.title)}</h2>
                    <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${unlocked
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-slate-800 text-slate-400'
            }">${unlocked ? '✓ 달성' : `${current} / ${target}`}</span>
                  </div>
                  <p class="mt-0.5 text-xs leading-relaxed text-slate-400">${esc(def.description)}</p>
                </div>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div class="h-full transition-all ${unlocked ? 'bg-gradient-to-r from-amber-400 to-fuchsia-400' : 'bg-sky-500/70'
            }" style="width:${unlocked ? 100 : barPct}%"></div>
              </div>
            </article>`;
        })
        .join('')
      : `<div class="panel col-span-full py-12 text-center text-sm text-slate-400">조건에 맞는 업적이 없습니다.</div>`;

  return `
  <main class="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-6">
    <header class="flex items-center justify-between">
      <button data-action="home" class="text-sm text-slate-400 hover:text-white">← 메인</button>
      <h1 class="text-xl font-black">업적</h1>
      <div class="text-sm text-slate-400">${unlockedTotal} / ${all.length} (${pct}%)</div>
    </header>

    <div class="h-2 overflow-hidden rounded-full bg-slate-800">
      <div class="h-full bg-gradient-to-r from-amber-500 to-fuchsia-500" style="width:${pct}%"></div>
    </div>

    <div class="flex flex-wrap gap-2 text-xs">
      <span class="chip">토너먼트 우승 <b class="text-amber-300">${stats.tournamentWins}회</b></span>
    </div>

    <div class="flex flex-wrap items-center gap-3 text-sm">
      <select data-achievement-filter="category" class="select">
        <option value="ALL" ${filter.category === 'ALL' ? 'selected' : ''}>전체 업적</option>
        <option value="collection" ${filter.category === 'collection' ? 'selected' : ''}>도감 수집</option>
        <option value="tournament" ${filter.category === 'tournament' ? 'selected' : ''}>토너먼트</option>
      </select>
      ${renderAchievementStatusToggle(filter.ownership)}
      <span class="ml-auto text-slate-500">${sorted.length}개 표시</span>
    </div>

    <section class="grid grid-cols-1 gap-3 md:grid-cols-2">
      ${cardsHtml}
    </section>
  </main>`;
}
