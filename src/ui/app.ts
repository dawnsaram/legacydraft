import { findNewlyCompletedGalleryEntries } from '../data/gallery';
import { signInWithGoogle, signOutUser, subscribeAuth, type AuthUser } from '../firebase/auth';
import {
  deleteBugReport,
  fetchBugReports,
  fetchNotices,
  submitBugReport,
  type BugReportItem,
  type NoticeItem,
} from '../firebase/boards';
import type { AchievementCategory, AchievementDef } from '../game/achievements';
import { canReroll, cardsOf, createGame, createSharedGame, finalize, reroll, toggleLock } from '../game/draft';
import {
  advanceToNextRound,
  createTournament,
  revealNextSet,
  skipSetReveal,
  startCurrentRound,
  type TournamentState,
} from '../game/tournament';
import {
  checkAndUnlockAchievements,
  loadStats,
  recordTournamentWin,
  setStatsUser,
  syncStatsWithCloud,
} from '../storage/achievements';
import { addToCollection, loadCollection, setCollectionUser, syncCollectionWithCloud } from '../storage/collection';
import type { GameState } from '../types';
import { renderAchievements, type AchievementFilter } from './achievementView';
import { renderBugReports, renderNotices } from './boardView';
import { clearShareUrlParam, parseSharedCardsFromUrl, saveTeamImage, shareTeamLink } from './share';
import { showAchievementToast, showGalleryUnlockToast } from './toast';
import { renderTournament } from './tournamentView';
import {
  FLIP_STAGGER_MS,
  KIT_FALLBACK_URL,
  POSITION_ICON,
  flipDurationMs,
  renderCollection,
  renderGallery,
  renderGame,
  renderHome,
  type CollectionFilter,
  type FlipState,
  type GalleryFilter,
  type OwnershipFilter,
} from './views';

type Screen = 'home' | 'game' | 'collection' | 'gallery' | 'tournament' | 'notices' | 'bugs' | 'achievements';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const motionAllowed = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SET_REVEAL_INTERVAL_MS = 850;

export class App {
  private screen: Screen = 'home';
  private game: GameState | null = null;
  private tournament: TournamentState | null = null;
  private tournamentTimer: number | null = null;
  private isSharedView = false;
  private newCardIds = new Set<string>();
  private flip: FlipState | undefined;
  private filter: CollectionFilter = { position: 'ALL', league: 'ALL', ownership: 'ALL' };
  private galleryFilter: GalleryFilter = { league: 'ALL', tier: 'ALL', ownership: 'ALL' };
  private achievementFilter: AchievementFilter = { category: 'ALL', unlockedOnly: false };
  private homeCarouselIndex = 0;
  private touchStartX: number | null = null;
  private user: AuthUser | null = null;
  private authBusy = false;
  private notices: NoticeItem[] = [];
  private noticesLoading = false;
  private noticesError: string | null = null;
  private bugReports: BugReportItem[] = [];
  private bugsLoading = false;
  private bugsSubmitting = false;
  private bugsError: string | null = null;
  private busy = false;

  constructor(private readonly root: HTMLElement) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onFilterChange(e));
    root.addEventListener('submit', (e) => void this.onSubmit(e));
    // 유니폼 아이콘이 없는 시즌·팀이면 fallback.svg로 대체, 히어로 이미지 로드 실패 시 숨김 처리
    root.addEventListener(
      'error',
      (e) => {
        const t = e.target;
        if (t instanceof HTMLImageElement && t.hasAttribute('data-kit-fallback')) {
          t.removeAttribute('data-kit-fallback');
          t.src = KIT_FALLBACK_URL;
        } else if (t instanceof HTMLImageElement && t.hasAttribute('data-hero-fallback')) {
          t.removeAttribute('data-hero-fallback');
          t.style.display = 'none';
        }
      },
      true,
    );
    // 레전더리 카드: 마우스 위치에 따른 빛반사/틸트
    root.addEventListener('pointermove', (e) => this.onPointerMove(e));
    root.addEventListener('pointerleave', (e) => this.onPointerLeave(e), true);
    // 홈 캐러셀 모바일 스와이프
    root.addEventListener(
      'touchstart',
      (e) => {
        if ((e.target as HTMLElement).closest('[data-home-carousel]')) {
          this.touchStartX = e.touches[0]?.clientX ?? null;
        }
      },
      { passive: true },
    );
    root.addEventListener(
      'touchend',
      (e) => {
        if (this.touchStartX === null) return;
        const endX = e.changedTouches[0]?.clientX;
        const diff = endX !== undefined ? endX - this.touchStartX : 0;
        this.touchStartX = null;
        if (Math.abs(diff) >= 40) {
          this.setHomeCarousel(this.homeCarouselIndex + (diff < 0 ? 1 : -1));
        }
      },
      { passive: true },
    );
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

    subscribeAuth((user) => {
      void this.onAuthChanged(user);
    });
  }

  private async onAuthChanged(user: AuthUser | null): Promise<void> {
    this.user = user;
    setCollectionUser(user?.uid ?? null);
    setStatsUser(user?.uid ?? null);
    if (user) {
      try {
        const mergedOwned = await syncCollectionWithCloud(user.uid);
        await syncStatsWithCloud(user.uid, mergedOwned);
      } catch (err) {
        console.warn('[auth] 클라우드 도감 동기화 실패', err);
      }
    }
    if (
      this.screen === 'home' ||
      this.screen === 'collection' ||
      this.screen === 'gallery' ||
      this.screen === 'achievements' ||
      this.screen === 'bugs'
    ) {
      this.render();
    }
  }

  private render(): void {
    switch (this.screen) {
      case 'home':
        this.root.innerHTML = renderHome(
          loadCollection(),
          this.user,
          this.authBusy,
          loadStats(),
          this.homeCarouselIndex,
        );
        break;
      case 'game':
        if (this.game) this.root.innerHTML = renderGame(this.game, this.flip, this.isSharedView, this.newCardIds);
        break;
      case 'collection':
        this.root.innerHTML = renderCollection(loadCollection(), this.filter);
        break;
      case 'gallery':
        this.root.innerHTML = renderGallery(loadCollection(), this.galleryFilter);
        break;
      case 'tournament':
        if (this.tournament) this.root.innerHTML = renderTournament(this.tournament);
        break;
      case 'notices':
        this.root.innerHTML = renderNotices(this.notices, this.noticesLoading, this.noticesError);
        break;
      case 'bugs':
        this.root.innerHTML = renderBugReports(
          this.bugReports,
          this.user,
          this.bugsLoading,
          this.bugsSubmitting,
          this.bugsError,
        );
        break;
      case 'achievements':
        this.root.innerHTML = renderAchievements(loadCollection(), loadStats(), this.achievementFilter);
        break;
    }
    // 뒤집기 연출은 직후 1회 렌더에만 적용
    this.flip = undefined;
  }

  private stopTournamentTimer(): void {
    if (this.tournamentTimer !== null) {
      window.clearInterval(this.tournamentTimer);
      this.tournamentTimer = null;
    }
  }

  private go(screen: Screen): void {
    this.stopTournamentTimer();
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
    const ownedAfter = loadCollection();
    const unlockedEntries = findNewlyCompletedGalleryEntries(added, ownedAfter);
    const unlockedAchievements = added.length > 0 ? checkAndUnlockAchievements(ownedAfter) : [];
    const hasFlip = Boolean(flipIndices?.length && motionAllowed());
    if (hasFlip) this.flip = { mode: 'in', indices: new Set(flipIndices) };
    this.render();

    const baseDelay = hasFlip ? flipDurationMs(flipIndices!.length, 'in') : 0;
    unlockedEntries.forEach((entry, idx) => {
      showGalleryUnlockToast(entry, {
        delayMs: baseDelay + idx * 250,
        onOpenGallery: () => {
          if (!this.busy) this.go('gallery');
        },
      });
    });
    this.notifyAchievements(unlockedAchievements, baseDelay + unlockedEntries.length * 250);
  }

  private notifyAchievements(list: readonly AchievementDef[], baseDelay = 0): void {
    list.forEach((ach, idx) => {
      showAchievementToast(ach, {
        delayMs: baseDelay + idx * 250,
        onOpenAchievements: () => {
          if (!this.busy) this.go('achievements');
        },
      });
    });
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
    this.stopTournamentTimer();
    this.tournament = null;
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
      case 'gallery':
        this.go('gallery');
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
      case 'tournament-start':
        if (this.game) {
          this.stopTournamentTimer();
          this.tournament = createTournament(cardsOf(this.game));
          this.screen = 'tournament';
          this.render();
          window.scrollTo({ top: 0 });
        }
        break;
      case 'tournament-play':
        this.playTournamentRound();
        break;
      case 'tournament-skip':
        this.stopTournamentTimer();
        if (this.tournament) {
          const prevPhase = this.tournament.phase;
          this.tournament = skipSetReveal(this.tournament);
          this.handleTournamentResult(prevPhase);
          this.render();
        }
        break;
      case 'tournament-next':
        if (this.tournament) {
          this.tournament = advanceToNextRound(this.tournament);
          this.render();
        }
        break;
      case 'tournament-back':
        this.go('game');
        break;
      case 'login':
        await this.handleLogin();
        break;
      case 'logout':
        await this.handleLogout();
        break;
      case 'notices':
        this.go('notices');
        await this.loadNotices();
        break;
      case 'notices-refresh':
        await this.loadNotices();
        break;
      case 'bugs':
        this.go('bugs');
        await this.loadBugReports();
        break;
      case 'bugs-refresh':
        await this.loadBugReports();
        break;
      case 'bug-delete':
        if (el.dataset.id) await this.handleDeleteBug(el.dataset.id);
        break;
      case 'achievements':
        this.go('achievements');
        break;
      case 'set-ownership': {
        const val = el.dataset.value as OwnershipFilter | undefined;
        if (!val) break;
        if (el.dataset.target === 'collection') this.filter.ownership = val;
        else if (el.dataset.target === 'gallery') this.galleryFilter.ownership = val;
        this.render();
        break;
      }
      case 'home-carousel-prev':
        this.setHomeCarousel(this.homeCarouselIndex - 1);
        break;
      case 'home-carousel-next':
        this.setHomeCarousel(this.homeCarouselIndex + 1);
        break;
      case 'home-carousel-dot':
        this.setHomeCarousel(Number(el.dataset.index ?? 0));
        break;
    }
  }

  private setHomeCarousel(nextIndex: number): void {
    const count = 3;
    this.homeCarouselIndex = ((nextIndex % count) + count) % count;
    const track = this.root.querySelector<HTMLElement>('.home-carousel-track');
    if (track) {
      track.style.transform = `translateX(-${this.homeCarouselIndex * 100}%)`;
      this.root.querySelectorAll<HTMLElement>('.home-carousel-dot').forEach((dot, idx) => {
        dot.classList.toggle('is-active', idx === this.homeCarouselIndex);
      });
    } else if (this.screen === 'home') {
      this.render();
    }
  }

  private async loadNotices(): Promise<void> {
    this.noticesLoading = true;
    this.noticesError = null;
    if (this.screen === 'notices') this.render();
    try {
      this.notices = await fetchNotices();
    } catch (err) {
      console.error('[notices] 로드 실패', err);
      this.noticesError = '공지사항을 불러오지 못했습니다. Firestore 규칙을 확인해주세요.';
    } finally {
      this.noticesLoading = false;
      if (this.screen === 'notices') this.render();
    }
  }

  private async loadBugReports(): Promise<void> {
    this.bugsLoading = true;
    this.bugsError = null;
    if (this.screen === 'bugs') this.render();
    try {
      this.bugReports = await fetchBugReports();
    } catch (err) {
      console.error('[bugs] 로드 실패', err);
      this.bugsError = '버그 제보 목록을 불러오지 못했습니다. Firestore 규칙을 확인해주세요.';
    } finally {
      this.bugsLoading = false;
      if (this.screen === 'bugs') this.render();
    }
  }

  private async onSubmit(e: Event): Promise<void> {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.form !== 'bug-report') return;
    e.preventDefault();
    if (!this.user || this.bugsSubmitting) return;

    const fd = new FormData(form);
    const title = String(fd.get('title') ?? '').trim();
    const content = String(fd.get('content') ?? '').trim();
    if (!title || !content) return;

    this.bugsSubmitting = true;
    this.render();
    try {
      await submitBugReport(this.user, title, content);
      await this.loadBugReports();
    } catch (err) {
      console.error('[bugs] 등록 실패', err);
      alert('버그 제보 등록에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      this.bugsSubmitting = false;
      if (this.screen === 'bugs') this.render();
    }
  }

  private async handleDeleteBug(id: string): Promise<void> {
    if (!confirm('이 버그 제보를 삭제할까요?')) return;
    try {
      await deleteBugReport(id);
      await this.loadBugReports();
    } catch (err) {
      console.error('[bugs] 삭제 실패', err);
      alert('삭제에 실패했습니다.');
    }
  }

  private async handleLogin(): Promise<void> {
    if (this.authBusy) return;
    this.authBusy = true;
    if (this.screen === 'home') this.render();
    try {
      await signInWithGoogle();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'FIREBASE_NOT_CONFIGURED') {
        alert('Firebase 환경변수(.env)가 설정되지 않아 로그인할 수 없습니다.');
      } else {
        console.error('[auth] 로그인 실패', err);
        alert('로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      this.authBusy = false;
      if (this.screen === 'home') this.render();
    }
  }

  private async handleLogout(): Promise<void> {
    if (this.authBusy) return;
    this.authBusy = true;
    if (this.screen === 'home') this.render();
    try {
      await signOutUser();
    } finally {
      this.authBusy = false;
      if (this.screen === 'home') this.render();
    }
  }

  private handleTournamentResult(prevPhase: TournamentState['phase']): void {
    if (!this.tournament || prevPhase === 'champion' || this.tournament.phase !== 'champion') return;
    const playerTeam = this.tournament.teams.find((t) => t.isPlayer);
    if (!playerTeam) return;
    const newly = recordTournamentWin(playerTeam.cards, playerTeam.synergy, loadCollection());
    this.notifyAchievements(newly, 200);
  }

  private playTournamentRound(): void {
    if (!this.tournament || this.tournament.phase !== 'ready') return;
    this.stopTournamentTimer();
    this.tournament = startCurrentRound(this.tournament);

    if (!motionAllowed()) {
      const prevPhase = this.tournament.phase;
      this.tournament = skipSetReveal(this.tournament);
      this.handleTournamentResult(prevPhase);
      this.render();
      return;
    }

    // 1세트를 즉시 공개한 뒤, 이후 세트를 일정 간격으로 순차 공개
    const prevPhase = this.tournament.phase;
    this.tournament = revealNextSet(this.tournament);
    this.handleTournamentResult(prevPhase);
    this.render();
    if (this.tournament.phase !== 'playing') return;

    this.tournamentTimer = window.setInterval(() => {
      if (!this.tournament || this.tournament.phase !== 'playing') {
        this.stopTournamentTimer();
        return;
      }
      const prev = this.tournament.phase;
      this.tournament = revealNextSet(this.tournament);
      this.handleTournamentResult(prev);
      this.render();
      if (this.tournament.phase !== 'playing') {
        this.stopTournamentTimer();
      }
    }, SET_REVEAL_INTERVAL_MS);
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
    if (key) {
      if (key === 'position' || key === 'league') this.filter[key] = t.value;
      this.render();
      return;
    }
    const galleryKey = t.dataset.galleryFilter;
    if (galleryKey) {
      if (galleryKey === 'league' || galleryKey === 'tier') this.galleryFilter[galleryKey] = t.value;
      this.render();
      return;
    }
    const achKey = t.dataset.achievementFilter;
    if (achKey) {
      if (achKey === 'unlockedOnly') this.achievementFilter.unlockedOnly = (t as HTMLInputElement).checked;
      else if (achKey === 'category') this.achievementFilter.category = t.value as 'ALL' | AchievementCategory;
      this.render();
    }
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

