import { esc } from './views';

/** 인라인 마크다운 변환 (이미 HTML 이스케이프된 문자열 기준) */
function renderInline(escaped: string): string {
  // 1) 인라인 코드를 먼저 보호해 내부의 *, ~ 등이 변환되지 않도록 한다
  const codes: string[] = [];
  let s = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    const idx = codes.length;
    codes.push(
      `<code class="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-amber-200">${code}</code>`,
    );
    return `\u0000CODE${idx}\u0000`;
  });

  // 2) 링크 [text](https://...)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text: string, url: string) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="font-semibold text-sky-400 underline underline-offset-2 hover:text-sky-300">${text}</a>`;
  });

  // 3) 굵게 / 기울임 / 취소선
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-extrabold text-slate-100">$1</strong>');
  s = s.replace(/~~([^~]+)~~/g, '<del class="text-slate-500">$1</del>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em class="italic text-slate-200">$2</em>');

  // 4) 보호했던 인라인 코드 복원
  s = s.replace(/\u0000CODE(\d+)\u0000/g, (_m, i: string) => codes[Number(i)] ?? '');
  return s;
}

/** 안전한 경량 Markdown → HTML 변환기 (공지사항 본문용) */
export function renderMarkdown(raw: string): string {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];

  let inCodeBlock = false;
  let codeLines: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let quoteLines: string[] = [];
  let paraLines: string[] = [];

  const flushPara = () => {
    if (paraLines.length === 0) return;
    out.push(
      `<p class="text-sm leading-relaxed text-slate-300">${paraLines.map((l) => renderInline(esc(l))).join('<br/>')}</p>`,
    );
    paraLines = [];
  };

  const flushList = () => {
    if (!listType) return;
    out.push(listType === 'ul' ? '</ul>' : '</ol>');
    listType = null;
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    out.push(
      `<blockquote class="border-l-2 border-amber-400/70 bg-slate-950/50 px-3 py-2 text-sm italic text-slate-300">${quoteLines.map((l) => renderInline(esc(l))).join('<br/>')}</blockquote>`,
    );
    quoteLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushPara();
      flushList();
      flushQuote();
      if (inCodeBlock) {
        out.push(
          `<pre class="overflow-x-auto rounded-lg bg-slate-950/80 p-3 font-mono text-xs text-slate-200"><code>${esc(codeLines.join('\n'))}</code></pre>`,
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (trimmed === '') {
      flushPara();
      flushList();
      flushQuote();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushPara();
      flushList();
      flushQuote();
      out.push('<hr class="border-slate-800" />');
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushPara();
      flushList();
      flushQuote();
      const level = heading[1].length;
      const cls =
        level === 1
          ? 'text-lg font-black text-amber-300'
          : level === 2
            ? 'text-base font-extrabold text-slate-100'
            : 'text-sm font-bold text-slate-100';
      out.push(`<h${level + 1} class="${cls}">${renderInline(esc(heading[2]))}</h${level + 1}>`);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      flushPara();
      flushList();
      quoteLines.push(quote[1]);
      continue;
    }
    flushQuote();

    const ul = /^(\s*)[-*•]\s+(.+)$/.exec(line);
    if (ul) {
      flushPara();
      if (listType !== 'ul') {
        flushList();
        out.push('<ul class="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">');
        listType = 'ul';
      }
      const nestedCls = ul[1].length >= 2 ? ' class="ml-4 list-[circle]"' : '';
      out.push(`<li${nestedCls}>${renderInline(esc(ul[2]))}</li>`);
      continue;
    }

    const ol = /^(\s*)\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      flushPara();
      if (listType !== 'ol') {
        flushList();
        out.push('<ol class="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-300">');
        listType = 'ol';
      }
      out.push(`<li>${renderInline(esc(ol[2]))}</li>`);
      continue;
    }

    flushList();
    paraLines.push(line);
  }

  if (inCodeBlock && codeLines.length > 0) {
    out.push(
      `<pre class="overflow-x-auto rounded-lg bg-slate-950/80 p-3 font-mono text-xs text-slate-200"><code>${esc(codeLines.join('\n'))}</code></pre>`,
    );
  }
  flushPara();
  flushList();
  flushQuote();

  return `<div class="space-y-2.5">${out.join('')}</div>`;
}
