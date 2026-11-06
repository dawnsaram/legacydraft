import { canReroll, cardsOf, createGame, createSharedGame, finalize, reroll, toggleLock } from '../game/draft';
import { addToCollection, loadCollection } from '../storage/collection';
import type { GameState } from '../types';
import { clearShareUrlParam, parseSharedCardsFromUrl, saveTeamImage, shareTeamLink } from './share';
import {
  FLIP_STAGGER_MS,
  KIT_FALLBACK_URL,
  POSITION_ICON,
  flipDurationMs,
  renderCollection,
  renderGame,
  renderHome,
  type CollectionFilter,
  type FlipState,
} from './views';

type Screen = 'home' | 'game' | 'collection';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const motionAllowed = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class App {
  private screen: Screen = 'home';
  private game: GameState | null = null;
  private isSharedView = false;
  private newCardIds = new Set<string>();
  private flip: FlipState | undefined;
  private filter: CollectionFilter = { position: 'ALL', league: 'ALL', ownedOnly: false };
  private busy = false;

  constructor(private readonly root: HTMLElement) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onFilterChange(e));
    // 유니폼 아이콘이 없는 시즌·팀이면 fallback.svg로 대체
    root.addEventListener(
      'error',
      (e) => {
        const t = e.target;
        if (t instanceof HTMLImageElement && t.hasAttribute('data-kit-fallback')) {
          t.removeAttribute('data-kit-fallback');
          t.src = KIT_FALLBACK_URL;
        }
      },
      true,
    );
    // 레전더리 카드: 마우스 위치에 따른 빛반사/틸트
    root.addEventListener('pointermove', (e) => this.onPointerMove(e));
    root.addEventListener('pointerleave', (e) => this.onPointerLeave(e), true);
  }

  start(): void {
    // 첫 드래프트 때 뒷면 아이콘과 기본 유니폼이 비어 보이지 않도록 미리 로드
    [...Object.values(POSITION_ICON), KIT_FALLBACK_URL].forEach((src) => {
      new Image().src = src;
    });
    // 공유 링크(?team=...)로 접속한 경우 해당 드림팀을 즉시 표시 (도감에는 기록하지 않음)
    const sharedCards = parseSharedCardsFromUrl();
    if (sharedCards) {
      this.screen = 'game';
      this.isSharedView = true;
      this.game = createSharedGame(sharedCards);
    }
    this.render();
  }

  private render(): void {
    switch (this.screen) {
      case 'home':
        this.root.innerHTML = renderHome(loadCollection().size);
        break;
      case 'game':
        if (this.game) this.root.innerHTML = renderGame(this.game, this.flip, this.isSharedView, this.newCardIds);
        break;
      case 'collection':
        this.root.innerHTML = renderCollection(loadCollection(), this.filter);
        break;
    }
    // 뒤집기 연출은 직후 1회 렌더에만 적용
    this.flip = undefined;
  }

  private go(screen: Screen): void {
    clearShareUrlParam();
    this.isSharedView = false;
    this.screen = screen;
    this.render();
    window.scrollTo({ top: 0 });
  }

  /** 상태 반영 + 도감 기록. flipIndices가 있으면 해당 슬롯은 뒷면에서 앞면으로 뒤집히며 등장 */
  private setGame(next: GameState, flipIndices?: number[]): void {
    this.isSharedView = false;
    this.game = next;
    const added = addToCollection(cardsOf(next).map((c) => c.id));
    added.forEach((id) => this.newCardIds.add(id));
    if (flipIndices?.length && motionAllowed()) this.flip = { mode: 'in', indices: new Set(flipIndices) };
    this.render();
  }

  /** 연출 중에는 입력을 막는다 */
  private async animate(task: () => Promise<void>): Promise<void> {
    this.busy = true;
    try {
      await task();
    } finally {
      this.busy = false;
    }
  }

  private startGame(): Promise<void> {
    clearShareUrlParam();
    this.newCardIds.clear();
    return this.animate(async () => {
      this.screen = 'game';
      window.scrollTo({ top: 0 });
      const all = [0, 1, 2, 3, 4];
      this.setGame(createGame(), all);
      if (motionAllowed()) await wait(flipDurationMs(all.length, 'in'));
    });
  }

  private rerollGame(): Promise<void> {
    const game = this.game;
    if (!game || !canReroll(game)) return Promise.resolve();
    const targets = game.slots.flatMap((s, i) => (s.isLocked ? [] : [i]));

    return this.animate(async () => {
      // 1) 기존 카드 덮기 (앞면 → 뒷면): 현재 DOM에 직접 클래스 부여
      if (motionAllowed()) {
        const flippers = this.root.querySelectorAll<HTMLElement>('.card-flipper');
        targets.forEach((slotIndex, order) => {
          const el = flippers[slotIndex];
          el?.style.setProperty('--flip-delay', `${order * FLIP_STAGGER_MS}ms`);
          el?.classList.add('flip-out');
        });
        await wait(flipDurationMs(targets.length, 'out'));
      }
      // 2) 새 카드 공개 (뒷면 → 앞면)
      this.setGame(reroll(game), targets);
      if (motionAllowed()) await wait(flipDurationMs(targets.length, 'in'));
    });
  }

  private async onClick(e: Event): Promise<void> {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el || this.busy) return;

    switch (el.dataset.action) {
      case 'start':
        await this.startGame();
        break;
      case 'home':
        this.go('home');
        break;
      case 'collection':
        this.go('collection');
        break;
      case 'toggle-lock':
        if (this.game) {
          this.game = toggleLock(this.game, Number(el.dataset.index));
          this.render();
        }
        break;
      case 'reroll':
        await this.rerollGame();
        break;
      case 'finalize':
        if (this.game) this.setGame(finalize(this.game));
        break;
      case 'save':
      case 'share':
        await this.capture(el.dataset.action);
        break;
    }
  }

  private async capture(kind: 'save' | 'share'): Promise<void> {
    if (!this.game) return;
    this.busy = true;
    try {
      if (kind === 'save') {
        await saveTeamImage(this.game);
      } else {
        const { result } = await shareTeamLink(this.game);
        if (result === 'copied') alert('드림팀 공유 링크가 클립보드에 복사되었습니다!');
      }
    } catch (err) {
      console.error(err);
      alert(kind === 'save' ? '이미지 저장에 실패했습니다.' : '링크 공유에 실패했습니다.');
    } finally {
      this.busy = false;
    }
  }

  private onFilterChange(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const key = t.dataset.filter;
    if (!key) return;
    if (key === 'ownedOnly') this.filter.ownedOnly = (t as HTMLInputElement).checked;
    else if (key === 'position' || key === 'league') this.filter[key] = t.value;
    this.render();
  }

  private onPointerMove(e: PointerEvent): void {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.card-legendary');
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    card.style.setProperty('--ry', `${((x - 0.5) * 18).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${((0.5 - y) * 18).toFixed(2)}deg`);
  }

  private onPointerLeave(e: PointerEvent): void {
    const t = e.target;
    if (t instanceof HTMLElement && t.classList.contains('card-legendary')) {
      ['--mx', '--my', '--rx', '--ry'].forEach((p) => t.style.removeProperty(p));
    }
  }
}

