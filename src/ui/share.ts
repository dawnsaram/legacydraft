import html2canvas from 'html2canvas';

/**
 * html2canvas(1.4.1)는 Tailwind v4가 사용하는 oklch() / oklab() / color-mix() 색상 함수를 파싱하지 못해
 * "Attempting to parse an unsupported color function" 에러를 던진다.
 * 캡처 전에 원본 DOM의 계산된 스타일을 2D canvas로 sRGB 변환해 복제본에 인라인 주입한다.
 */
const COLOR_PROPS = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  '-webkit-text-stroke-color',
  'caret-color',
  'column-rule-color',
] as const;

let colorCtx: CanvasRenderingContext2D | null = null;
function toRgb(cssColor: string): string {
  if (!cssColor || (!cssColor.includes('okl') && !cssColor.includes('color(') && !cssColor.includes('color-mix'))) {
    return cssColor;
  }
  if (!colorCtx) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    colorCtx = c.getContext('2d', { willReadFrequently: true });
  }
  if (!colorCtx) return '#000000';
  colorCtx.clearRect(0, 0, 1, 1);
  colorCtx.fillStyle = '#000000';
  colorCtx.fillStyle = cssColor;
  colorCtx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
  if (a === 0) return 'rgba(0, 0, 0, 0)';
  if (a === 255) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

function replaceModernColorTokens(text: string): string {
  // oklch(...), oklab(...), color(...) 토큰을 캔버스로 평가한 rgb/rgba 문자열로 치환
  return text.replace(/\b(?:oklch|oklab|color)\([^)]+\)/gi, (match) => toRgb(match));
}

function sanitizeColorsForHtml2Canvas(clonedDoc: Document, clonedRoot: HTMLElement): void {
  // 1) 복제된 문서의 <style> 태그 내부에 있는 oklch/oklab/color-mix를 sRGB로 치환
  clonedDoc.querySelectorAll('style').forEach((styleEl) => {
    if (styleEl.textContent) {
      styleEl.textContent = replaceModernColorTokens(styleEl.textContent);
    }
  });

  // 2) 루트(html/body) 배경/전경색을 안전한 sRGB로 고정
  clonedDoc.documentElement.style.color = '#f1f5f9';
  clonedDoc.documentElement.style.backgroundColor = '#020617';
  clonedDoc.body.style.color = '#f1f5f9';
  clonedDoc.body.style.backgroundColor = '#020617';

  // 3) 캡처 대상 트리 전체를 순회하며 남은 모던 색상 함수를 모두 sRGB 인라인 스타일로 덮어쓴다
  const view = clonedDoc.defaultView ?? window;
  const nodes = [clonedRoot, ...clonedRoot.querySelectorAll<HTMLElement>('*')];

  for (const node of nodes) {
    const cs = view.getComputedStyle(node);
    for (const prop of COLOR_PROPS) {
      const val = cs.getPropertyValue(prop);
      if (val && (val.includes('okl') || val.includes('color(') || val.includes('color-mix'))) {
        node.style.setProperty(prop, toRgb(val), 'important');
      }
    }
    for (const prop of ['background-image', 'box-shadow', 'text-shadow'] as const) {
      const val = cs.getPropertyValue(prop);
      if (val && (val.includes('okl') || val.includes('color(') || val.includes('color-mix'))) {
        node.style.setProperty(prop, replaceModernColorTokens(val), 'important');
      }
    }
  }
}

async function captureToBlob(el: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(el, {
    backgroundColor: '#020617',
    scale: 2,
    useCORS: true,
    onclone: (doc, clonedEl) => {
      doc.querySelectorAll('.card-back, .lock-badge').forEach((n) => n.remove());
      doc.querySelectorAll('.is-locked').forEach((n) => n.classList.remove('is-locked'));
      doc.querySelectorAll('.card-flipper').forEach((n) => n.classList.remove('flip-in', 'flip-out'));
      doc.querySelectorAll('.is-revealing').forEach((n) => n.classList.remove('is-revealing'));
      sanitizeColorsForHtml2Canvas(doc, clonedEl);
    },
  });
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

const filename = () => `legacy-draft-${Date.now()}.png`;

export async function saveTeamImage(el: HTMLElement): Promise<void> {
  download(await captureToBlob(el), filename());
}

export type ShareResult = 'shared' | 'copied' | 'downloaded';

/**
 * 1순위: Web Share API (모바일/지원 브라우저 공유 시트)
 * 2순위: 클립보드에 이미지 복사 (데스크톱에서 Ctrl+V로 바로 붙여넣기 가능)
 * 3순위: 파일 다운로드
 */
export async function shareTeamImage(el: HTMLElement): Promise<ShareResult> {
  const blob = await captureToBlob(el);
  const file = new File([blob], filename(), { type: 'image/png' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Legacy Draft', text: '나의 Legacy Draft 드림팀!' });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'shared';
    }
  }

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch {
      // 클립보드 권한 실패 시 다운로드로 폴백
    }
  }

  download(blob, file.name);
  return 'downloaded';
}
