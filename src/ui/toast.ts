import type { GalleryEntry } from '../data/gallery';
import { KIT_FALLBACK_URL, esc, kitUrl } from './views';

const AUTO_DISMISS_MS = 6000;
const LEAVE_ANIM_MS = 260;

function ensureToastStack(): HTMLElement {
  let stack = document.querySelector<HTMLElement>('.gallery-toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'gallery-toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  return stack;
}

function dismissToast(toast: HTMLElement): void {
  if (toast.dataset.dismissed === '1') return;
  toast.dataset.dismissed = '1';
  toast.classList.add('is-leaving');
  window.setTimeout(() => toast.remove(), LEAVE_ANIM_MS);
}

export interface GalleryToastOptions {
  delayMs?: number;
  onOpenGallery?: () => void;
}

/** 갤러리 5인 로스터 첫 해금 시 우측 상단(모바일은 상단 중앙)에 히어로 이미지 알림 표시 */
export function showGalleryUnlockToast(entry: GalleryEntry, options: GalleryToastOptions = {}): void {
  const { delayMs = 0, onOpenGallery } = options;

  const spawn = () => {
    const stack = ensureToastStack();
    const sampleCard = entry.cards[0];
    const kitSrc = sampleCard ? kitUrl(sampleCard) : KIT_FALLBACK_URL;

    const toast = document.createElement('aside');
    toast.className = 'gallery-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <div class="gallery-toast-hero">
        ${
          entry.heroUrl
            ? `<img class="gallery-toast-hero-img" src="${esc(entry.heroUrl)}" alt="${esc(entry.season)} ${esc(entry.team)}" draggable="false" />`
            : `<img class="gallery-toast-kit-fallback" src="${esc(kitSrc)}" alt="${esc(entry.team)}" draggable="false" />`
        }
        <div class="gallery-toast-hero-overlay"></div>
        <span class="gallery-toast-badge">★ GALLERY UNLOCKED</span>
        <button type="button" class="gallery-toast-close" aria-label="알림 닫기">✕</button>
      </div>
      <div class="gallery-toast-body">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-[11px] font-bold tracking-wider text-amber-300/90">${esc(entry.season)} · ${esc(entry.league)}</div>
            <div class="truncate text-base font-black text-white">${esc(entry.team)} 로스터 완성!</div>
          </div>
          ${
            onOpenGallery
              ? '<button type="button" class="gallery-toast-action">갤러리 →</button>'
              : ''
          }
        </div>
        ${
          entry.description
            ? `<p class="mt-1 line-clamp-2 text-xs italic leading-relaxed text-slate-300">${esc(entry.description)}</p>`
            : ''
        }
      </div>
    `;

    const heroImg = toast.querySelector<HTMLImageElement>('.gallery-toast-hero-img');
    heroImg?.addEventListener('error', () => {
      heroImg.style.display = 'none';
    });

    toast.querySelector('.gallery-toast-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissToast(toast);
    });

    toast.querySelector('.gallery-toast-action')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissToast(toast);
      onOpenGallery?.();
    });

    stack.appendChild(toast);

    let timer = window.setTimeout(() => dismissToast(toast), AUTO_DISMISS_MS);
    toast.addEventListener('mouseenter', () => window.clearTimeout(timer));
    toast.addEventListener('mouseleave', () => {
      if (toast.dataset.dismissed !== '1') {
        timer = window.setTimeout(() => dismissToast(toast), 2500);
      }
    });
  };

  if (delayMs > 0) {
    window.setTimeout(spawn, delayMs);
  } else {
    spawn();
  }
}

