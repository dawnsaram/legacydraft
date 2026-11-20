import type { AuthUser } from '../firebase/auth';
import type { BugReportItem, NoticeItem } from '../firebase/boards';
import { renderMarkdown } from './markdown';
import { GOOGLE_LOGO_SVG, esc } from './views';

function formatDate(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function renderNotices(
  notices: readonly NoticeItem[],
  loading: boolean,
  error: string | null,
): string {
  const body = loading
    ? `<div class="panel py-12 text-center text-sm text-slate-400">공지사항을 불러오는 중...</div>`
    : error
      ? `<div class="panel border-rose-500/40 py-8 text-center text-sm text-rose-300">${esc(error)}</div>`
      : notices.length === 0
        ? `<div class="panel py-12 text-center text-sm text-slate-400">등록된 공지사항이 없습니다.</div>`
        : notices
            .map(
              (n) => `
          <details class="group panel text-left ${n.pinned ? 'border-amber-400/50 bg-amber-500/5' : ''}">
            <summary class="flex cursor-pointer list-none items-center justify-between gap-3 select-none [&::-webkit-details-marker]:hidden">
              <div class="flex min-w-0 items-center gap-2">
                ${n.pinned ? '<span class="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-black text-amber-300">공지</span>' : ''}
                <h2 class="truncate text-sm font-extrabold text-slate-100 transition group-hover:text-amber-300 sm:text-base">${esc(n.title)}</h2>
              </div>
              <div class="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                <span>${formatDate(n.createdAtMs)}</span>
                <span class="inline-block text-[10px] transition-transform duration-200 group-open:rotate-180">▼</span>
              </div>
            </summary>
            <div class="mt-3 border-t border-slate-800/80 pt-3">${renderMarkdown(n.content)}</div>
          </details>`,
            )
            .join('');

  return `
  <main class="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-6">
    <header class="flex items-center justify-between">
      <button data-action="home" class="text-sm text-slate-400 hover:text-white">← 메인</button>
      <h1 class="text-xl font-black">공지사항</h1>
      <button data-action="notices-refresh" class="text-xs font-bold text-slate-400 hover:text-white" ${loading ? 'disabled' : ''}>새로고침</button>
    </header>
    <section class="flex flex-col gap-3">
      ${body}
    </section>
  </main>`;
}

export function renderBugReports(
  reports: readonly BugReportItem[],
  user: AuthUser | null,
  loading: boolean,
  submitting: boolean,
  error: string | null,
): string {
  const formHtml = user
    ? `
    <form data-form="bug-report" class="panel flex flex-col gap-3 text-left">
      <div class="flex items-center justify-between">
        <span class="text-sm font-extrabold text-slate-100">새 버그 제보 작성</span>
        <span class="text-xs text-slate-400">작성자: ${esc(user.displayName || user.email || '플레이어')}</span>
      </div>
      <input
        type="text"
        name="title"
        required
        maxlength="80"
        placeholder="어떤 문제가 발생했나요? (제목)"
        class="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
      />
      <textarea
        name="content"
        required
        rows="3"
        maxlength="1000"
        placeholder="재현 방법, 사용 기기(모바일/PC) 등을 적어주시면 빠르게 수정할 수 있습니다."
        class="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
      ></textarea>
      <div class="flex justify-end">
        <button type="submit" class="btn-primary !rounded-lg !px-4 !py-2 text-xs sm:text-sm" ${submitting ? 'disabled' : ''}>
          ${submitting ? '등록 중...' : '버그 제보 등록'}
        </button>
      </div>
    </form>`
    : `
    <div class="panel flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
      <div class="text-sm text-slate-300">
        <b class="text-slate-100">버그를 제보하려면 Google 로그인이 필요합니다.</b>
        <p class="text-xs text-slate-400">로그인 후 새로운 버그를 등록하고 내 제보 내역을 관리할 수 있습니다.</p>
      </div>
      <button type="button" data-action="login" class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-100 transition hover:border-amber-400/60 hover:bg-slate-700">
        ${GOOGLE_LOGO_SVG}
        <span>Google 로그인</span>
      </button>
    </div>`;

  const listHtml = loading
    ? `<div class="panel py-12 text-center text-sm text-slate-400">제보 목록을 불러오는 중...</div>`
    : error
      ? `<div class="panel border-rose-500/40 py-8 text-center text-sm text-rose-300">${esc(error)}</div>`
      : reports.length === 0
        ? `<div class="panel py-12 text-center text-sm text-slate-400">아직 등록된 버그 제보가 없습니다.</div>`
        : reports
            .map((r) => {
              const isMine = Boolean(user && r.authorUid === user.uid);
              const badge =
                r.status === 'resolved'
                  ? '<span class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">해결됨</span>'
                  : '<span class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">접수됨</span>';
              return `
              <article class="panel flex flex-col gap-2 text-left">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-2">
                    ${badge}
                    <h2 class="truncate text-sm font-extrabold text-slate-100 sm:text-base">${esc(r.title)}</h2>
                  </div>
                  <div class="flex items-center gap-2 text-xs text-slate-500">
                    <span>${esc(r.authorName)}</span>
                    <span>·</span>
                    <span>${formatDate(r.createdAtMs)}</span>
                    ${
                      isMine
                        ? `<button type="button" data-action="bug-delete" data-id="${esc(r.id)}" class="ml-1 rounded px-1.5 py-0.5 text-[11px] font-bold text-rose-400 hover:bg-rose-500/15 hover:text-rose-300">삭제</button>`
                        : ''
                    }
                  </div>
                </div>
                <p class="whitespace-pre-line text-sm leading-relaxed text-slate-300">${esc(r.content)}</p>
              </article>`;
            })
            .join('');

  return `
  <main class="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-6">
    <header class="flex items-center justify-between">
      <button data-action="home" class="text-sm text-slate-400 hover:text-white">← 메인</button>
      <h1 class="text-xl font-black">버그 제보</h1>
      <button data-action="bugs-refresh" class="text-xs font-bold text-slate-400 hover:text-white" ${loading ? 'disabled' : ''}>새로고침</button>
    </header>

    ${formHtml}

    <section class="flex flex-col gap-3">
      ${listHtml}
    </section>
  </main>`;
}
