/**
 * @module narrator
 * @description The BIG BAD WOLF's voice — now a CONTEXT-AWARE manager. He still
 * plays pre-rendered MP3s from assets/audio/narrator/ (one per line in
 * phrases.js, named `<category>_<index>.mp3`), but WHICH line he picks and WHEN
 * is driven by real game state: the visible symbols, win tier, win/loss streaks,
 * bonus vs base mode, reel expansions, anticipation, and how long the player has
 * sat idle. He never overlaps himself, respects per-category cooldowns and
 * spin-gaps so he isn't annoying, lets important moments interrupt idle chatter,
 * and keeps a little "memory" so idle lines reference what just happened.
 *
 * Responsible play: lines never promise a win, never say "you're due", never
 * pressure. Cold-streak lines are gentle and rare (see phrases.js).
 *
 * Existing public hooks are unchanged for current call sites; NEW ones
 * (onExpandingWilds, onReelsSettled, onBonusEnter, onAnticipation, onMenuReturn)
 * are additive. Toggle verbose logging with  window.WOLF_VO_DEBUG = true.
 */
'use strict';

import { PHRASES } from './phrases.js';
import { state } from '../core/state.js';
import { WIN_TIERS } from '../math/par-sheet.js';   // shared celebration thresholds (audio = visual)

// What the player VISUALLY sees ↔ internal symbol ids (see par-sheet.js).
const SYM = {
  shotGlass: ['toolbox'],
  horseshoe: ['pig-contractor'],
  badge:     ['pig-suit'],
  wild:      ['wild'],
  hats:      ['hat-yellow', 'hat-green', 'hat-red'],
};

// Tap a reel symbol → the wolf cracks a joke about that object. Maps each symbol
// id to its joke pool (by what the player sees on the reels).
const SYM_JOKE = {
  'hat-yellow': 'clickHat', 'hat-green': 'clickHat', 'hat-red': 'clickHat',
  'pig-suit': 'sheriffBadge', 'pig-contractor': 'clickHorseshoe',
  'pig-nature': 'clickTornado', 'toolbox': 'clickShotGlass',
  'wolf': 'clickWolf', 'buzzard': 'clickBuzzard', 'wild': 'clickWild',
  'royal-a': 'clickRoyals', 'royal-k': 'clickRoyals', 'royal-q': 'clickRoyals',
  'royal-j': 'clickRoyals', 'royal-10': 'clickRoyals',
};

// Priority floor per category — higher beats lower; a high one can cut off idle.
const PRIORITY = {
  mansionJackpot: 100, noFunds: 100,
  bonusTrigger: 95, bonusEnter: 90, retrigger: 88, miniJackpot: 88,
  brickAchieved: 86, wolfReveal: 84, bonusBigWin: 84, bigWin: 82,
  expandingReels: 80, extremeAnticipation: 78, nearMiss: 70, anticipation: 70,
  wolfBrick: 76, wolfStick: 74, wolfStraw: 72,
  bonusComplete: 62, bonusEnd: 62, winStreak: 64, threeWinStreak: 66, hotStreak: 66,
  bonusWin: 60, firstSpin: 60,
  mediumWin: 55, twoWinStreak: 52, symShotGlassMulti: 52, symHorseshoeMulti: 52,
  symShotGlass: 48, symHorseshoe: 48, symHats: 46, frameUpgrade: 46, menuReturn: 42,
  bonusSpin: 40, freeSpin: 40, lowBalance: 40, streakEnded: 40, betUp: 36, betDown: 36,
  saloonHeader: 58, vlrMedallion: 58, sheriffBadge: 58, spinHover: 42,
  buyBonus: 56, maxBet: 44, richIdle: 22,
  clickWolf: 50, clickBuzzard: 50, clickHat: 50, clickHorseshoe: 50,
  clickTornado: 50, clickShotGlass: 50, clickRoyals: 50, clickWild: 50,
  spin: 35, lossStreak: 34, coldStreak: 34, smallWin: 32, loss: 30, postWin: 28,
  idle: 18, idleAfterWin: 20, idleAfterLoss: 20, ambient: 14,
};

class Narrator {
  constructor() {
    this.audio = new Audio();
    this.audio.addEventListener('ended', () => this._onClipDone());
    this.audio.addEventListener('error', () => this._onClipDone());

    // ── Sequential voice queue (never overlaps) ──
    this._queue = [];          // [{ file, priority, category }]
    this._playing = false;
    this._playingPriority = 0;
    this._gapMinMs = 1000;
    this._gapMaxMs = 5000;
    this._maxQueue = 1;
    this._gapTimer = null;

    this.enabled = true;
    this._volume = 0.8;
    this._lastSpoke = 0;
    this._cooldownMs = 1500;   // global floor between any two lines
    this._speaking = false;

    // counters / memory
    this._totalSpins = 0;
    this._winStreak = 0;
    this._lossStreak = 0;
    this._inBonus = false;
    this._lastOutcome = 'none';   // 'win' | 'loss' | 'none'

    this._catLastSpin = {};       // category → _totalSpins when last used (spin-gap caps)
    this._catLastMs = {};         // category → timestamp (ms cooldowns)
    this._recent = {};            // category → recent indices (avoid repeats)

    this.phrases = PHRASES;
    this._idleTimer = null;
    this._idleCount = 0;
    this.ENABLE_ROASTS = false;   // L&W parody pool — off by default

    this._resetIdleTimer();
  }

  setVolume(v) { this._volume = Math.max(0, Math.min(1, v)); this.audio.volume = this._volume; }
  getVolume() { return this._volume; }
  _log(...a) { if (typeof window !== 'undefined' && window.WOLF_VO_DEBUG) console.log('%c[WolfVO]', 'color:#F5C400', ...a); }

  /* ════════ context helpers ════════ */
  _grid() { return Array.isArray(state.currentGrid) ? state.currentGrid : null; }
  _countVisible(ids) {
    const g = this._grid(); if (!g) return 0;
    let n = 0;
    for (const col of g) for (const s of col) if (ids.includes(s)) n++;
    return n;
  }
  winTier(amount, bet) {
    const r = bet > 0 ? amount / bet : 0;
    if (r >= WIN_TIERS.epic) return 'huge';     // ≥ EPIC (50×) — the wolf's biggest reaction
    if (r >= WIN_TIERS.mega) return 'mega';      // ≥ MEGA (25×)
    if (r >= WIN_TIERS.big)  return 'big';       // ≥ BIG  (10×)
    if (r >= WIN_TIERS.nice) return 'medium';    // ≥ NICE (2×)
    if (r > 0)   return 'small';
    return 'none';
  }

  /* ════════ selection ════════ */
  _pick(category) {
    const pool = this.phrases[category];
    if (!pool || !pool.length) return -1;
    if (pool.length === 1) return 0;
    const recent = this._recent[category] || [];
    let idx, tries = 0;
    do { idx = Math.floor(Math.random() * pool.length); tries++; }
    while (recent.includes(idx) && tries < 8);
    this._recent[category] = [idx, ...recent].slice(0, Math.min(3, pool.length - 1));
    return idx;
  }

  /**
   * Central trigger. Decides whether the wolf says a line from `category`.
   *  opts: { priority, cooldownMs, minSpinGap, chance, interrupt, bypassGlobal }
   */
  _trigger(category, opts = {}) {
    if (!this.enabled || this._volume === 0) return false;
    const pool = this.phrases[category];
    if (!pool || !pool.length) return false;
    if (category === 'roasts' && !this.ENABLE_ROASTS) return false;

    const priority = opts.priority ?? PRIORITY[category] ?? 20;
    const now = Date.now();

    if (opts.chance != null && Math.random() > opts.chance) { this._log('skip(chance)', category); return false; }
    if (!opts.bypassGlobal && priority < 60 && now - this._lastSpoke < (opts.cooldownMs ?? this._cooldownMs)) {
      this._log('skip(global-cd)', category); return false;
    }
    const catCd = opts.catCooldownMs ?? opts.cooldownMs;   // per-category gate (separate from global)
    if (catCd && now - (this._catLastMs[category] || 0) < catCd) { this._log('skip(cat-cd)', category); return false; }
    if (opts.minSpinGap && this._totalSpins - (this._catLastSpin[category] ?? -999) < opts.minSpinGap) { this._log('skip(spin-gap)', category); return false; }

    let idx;
    if (opts.forceIndex != null && pool[opts.forceIndex] != null) { idx = opts.forceIndex; this._recent[category] = [idx]; }
    else idx = this._pick(category);
    if (idx < 0) return false;

    this._catLastMs[category] = now;
    this._catLastSpin[category] = this._totalSpins;
    this._lastSpoke = now;
    this._enqueue(`${category}_${idx}.mp3`, priority, category, !!opts.interrupt);
    this._resetIdleTimer();
    this._log('PLAY', category, idx, 'p' + priority);
    return true;
  }

  /* ════════ playback queue ════════ */
  _enqueue(file, priority, category, interrupt) {
    // a higher-priority line can cut off low-priority idle/ambient chatter
    if (this._playing && interrupt && priority >= this._playingPriority + 12 && this._playingPriority <= 24) {
      try { this.audio.pause(); } catch (e) {}
      this._playing = false; this._speaking = false;
    }
    if (this._playing) {
      if (this._queue.length && priority < this._queue[this._queue.length - 1].priority) return;  // keep the better pending one
      while (this._queue.length >= this._maxQueue) this._queue.shift();
      this._queue.push({ file, priority, category });
      return;
    }
    this._queue.push({ file, priority, category });
    if (!this._gapTimer) this._drain();
  }

  _drain() {
    if (this._playing || this._gapTimer) return;
    const next = this._queue.shift();
    if (!next) return;
    this._playing = true; this._speaking = true; this._playingPriority = next.priority;
    try {
      this.audio.src = `assets/audio/narrator/${next.file}`;
      this.audio.volume = this._volume;
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => this._onClipDone());
    } catch (e) { this._onClipDone(); }
  }

  _onClipDone() {
    if (!this._playing) return;
    this._playing = false; this._speaking = false; this._playingPriority = 0;
    if (this._gapTimer) clearTimeout(this._gapTimer);
    const gap = this._gapMinMs + Math.random() * (this._gapMaxMs - this._gapMinMs);
    this._gapTimer = setTimeout(() => { this._gapTimer = null; this._drain(); }, gap);
  }

  /** Legacy simple API kept for any old call sites. */
  say(category, forceCooldown = null) { return this._trigger(category, { cooldownMs: forceCooldown ?? this._cooldownMs }); }
  sayNow(category) { return this._trigger(category, { bypassGlobal: true, interrupt: true }); }

  /* ════════ game event hooks ════════ */
  onSpin() {
    this._totalSpins++;
    this._idleCount = 0;
    this._resetIdleTimer();
    this._queue = this._queue.filter(q => q.priority > 24);   // drop stale idle chatter on spin
    if (this._totalSpins === 1) { this._trigger('firstSpin', { bypassGlobal: true }); return; }
    if (Date.now() - this._lastSpoke > 8000) this._trigger('spin', { chance: 0.12, minSpinGap: 6 });
  }

  /** Called after the reels settle (grid visible) BEFORE win resolution. */
  onReelsSettled() {
    if (this._inBonus) return;
    const shot = this._countVisible(SYM.shotGlass);
    const shoe = this._countVisible(SYM.horseshoe);
    const hats = this._countVisible(SYM.hats);
    if (hats >= 3 && hats < 6) { this._trigger('symHats', { minSpinGap: 5, chance: 0.7 }); return; }
    if (shoe >= 2) { this._trigger('symHorseshoeMulti', { minSpinGap: 4 }); return; }
    if (shot >= 2) { this._trigger('symShotGlassMulti', { minSpinGap: 4 }); return; }
    if (shoe === 1) { this._trigger('symHorseshoe', { minSpinGap: 6, chance: 0.45 }); return; }
    if (shot === 1) { this._trigger('symShotGlass', { minSpinGap: 6, chance: 0.45 }); return; }
  }

  onExpandingWilds() { this._trigger('expandingReels', { bypassGlobal: true, interrupt: true }); }
  onAnticipation() { this._trigger('anticipation', { interrupt: true, minSpinGap: 1 }); }

  onWin(amount, bet) {
    this._lossStreak = 0;
    this._winStreak++;
    this._lastOutcome = 'win';
    const tier = this.winTier(amount, bet);
    const streakCat = this._winStreak >= 4 ? 'hotStreak'
                    : this._winStreak === 3 ? 'threeWinStreak'
                    : this._winStreak === 2 ? 'twoWinStreak' : null;

    if (this._inBonus) {
      const cat = (tier === 'big' || tier === 'mega' || tier === 'huge') ? 'bonusBigWin' : 'bonusWin';
      this._trigger(cat, { bypassGlobal: true, interrupt: true });
      return;
    }
    if (tier === 'huge' || tier === 'mega' || tier === 'big') {
      this._trigger('bigWin', { bypassGlobal: true, interrupt: true });
      // celebrate a 3+ streak right after the big-win line; otherwise a postWin beat
      if (this._winStreak >= 3) setTimeout(() => this._trigger(streakCat, { bypassGlobal: true }), 3200);
      else setTimeout(() => this._trigger('postWin', { cooldownMs: 2000 }), 3500);
    } else if (streakCat) {
      // 2nd/3rd/4+ consecutive win → the streak line takes the spotlight
      // (bypass the global cooldown so it still lands on fast/turbo spins)
      this._trigger(streakCat, { bypassGlobal: true, interrupt: true });
    } else if (tier === 'medium') {
      this._trigger('mediumWin', { minSpinGap: 2 });
    } else {
      this._trigger('smallWin', { minSpinGap: 5, chance: 0.55 });
    }
  }

  onLoss() {
    const hadStreak = this._winStreak;
    this._winStreak = 0;
    this._lossStreak++;
    this._lastOutcome = 'loss';
    if (this._inBonus) return;
    if (hadStreak >= 3) { this._trigger('streakEnded', { chance: 0.7 }); return; }
    if (this._lossStreak >= 5) this._trigger('coldStreak', { cooldownMs: 30000, chance: 0.6 });  // gentle, rare
    else if (Math.random() < 0.4) this._trigger('loss', { minSpinGap: 2, chance: 0.7 });
  }

  onNearMiss() { this._trigger('nearMiss', { bypassGlobal: true, interrupt: true }); }
  onBonusTrigger() { this._inBonus = true; this._trigger('bonusTrigger', { bypassGlobal: true, interrupt: true }); }
  onBonusEnter() { this._inBonus = true; setTimeout(() => this._trigger('bonusEnter', { bypassGlobal: true }), 700); }
  onFreeSpin() { this._trigger('bonusSpin', { chance: 0.3, minSpinGap: 2 }); }
  onFrameUpgrade(tier) {
    if (tier === 3) this._trigger('brickAchieved', { bypassGlobal: true });
    else this._trigger('frameUpgrade', { chance: 0.6, minSpinGap: 1 });
  }
  onWolfReveal() { this._trigger('wolfReveal', { bypassGlobal: true, interrupt: true }); }
  onWolfBlow(tier) { this._trigger(['', 'wolfStraw', 'wolfStick', 'wolfBrick'][tier], { bypassGlobal: true }); }
  onMansionJackpot() { this._trigger('mansionJackpot', { bypassGlobal: true, interrupt: true }); }
  onMiniJackpot() { this._trigger('miniJackpot', { bypassGlobal: true, interrupt: true }); }
  onRetrigger() { this._trigger('retrigger', { bypassGlobal: true, interrupt: true }); }
  onBonusComplete() { this._inBonus = false; this._trigger('bonusEnd', { bypassGlobal: true, interrupt: true }); }
  onBetChange(direction) { this._trigger(direction === 'up' ? 'betUp' : 'betDown', { cooldownMs: 500, chance: 0.5 }); }
  onMaxBet() { this._trigger('maxBet', { bypassGlobal: true, interrupt: true, catCooldownMs: 8000 }); }
  onBuyBonusOpen() { this._trigger('buyBonus', { bypassGlobal: true, interrupt: true, catCooldownMs: 6000 }); }
  onLowBalance() { this._trigger('lowBalance', { cooldownMs: 30000 }); }
  onInsufficientFunds() { this._trigger('noFunds', { bypassGlobal: true }); }
  onMenuReturn() { this._trigger('menuReturn', { cooldownMs: 25000, chance: 0.6 }); }
  /** Player tapped a reel symbol → joke about that object (not during the bonus). */
  onSymbolClick(symId) {
    if (this._inBonus) return;
    const cat = SYM_JOKE[symId];
    if (cat) this._trigger(cat, { bypassGlobal: true, interrupt: true, catCooldownMs: 6000 });
  }
  /** Mouse lingered over SPIN without clicking → a gentle razz (not too often). */
  onSpinHover() { this._trigger('spinHover', { interrupt: true, catCooldownMs: 14000 }); }
  /** Player clicked the "BIG BAD WOLF SALOON" sign → brag about the joint. */
  onSaloonClick() { this._trigger('saloonHeader', { bypassGlobal: true, interrupt: true, cooldownMs: 700 }); }
  /** Player clicked the "Vegas Low Roller Approved" medallion → tip the hat to VLR.
   *  First click always plays the signature line; repeats vary. */
  onVlrClick() {
    const opts = { bypassGlobal: true, interrupt: true, cooldownMs: 700 };
    if (!this._vlrClicked) { this._vlrClicked = true; opts.forceIndex = 0; }
    this._trigger('vlrMedallion', opts);
  }
  /** Player clicked the sheriff's star badge → he lays down the law. */
  onSheriffClick() {
    const opts = { bypassGlobal: true, interrupt: true, cooldownMs: 700 };
    if (!this._sheriffClicked) { this._sheriffClicked = true; opts.forceIndex = 0; }
    this._trigger('sheriffBadge', opts);
  }

  /* ════════ idle (contextual) ════════ */
  _resetIdleTimer() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    const schedule = [12000, 28000, 55000];
    const wait = this._idleCount < schedule.length ? schedule[this._idleCount] : 75000 + Math.random() * 15000;
    this._idleTimer = setTimeout(() => this._onIdleTick(), wait);
  }
  _onIdleTick() {
    if (!this.enabled || this._volume === 0 || this._inBonus || state.spinning) { this._resetIdleTimer(); return; }
    this._idleCount++;
    let cat;
    if ((state.balance || 0) >= 2500 && Math.random() < 0.4) cat = 'richIdle';   // sitting on a big stack
    else if (this._lastOutcome === 'win') cat = Math.random() < 0.6 ? 'idleAfterWin' : 'ambient';
    else if (this._lastOutcome === 'loss') cat = Math.random() < 0.5 ? 'idleAfterLoss' : 'ambient';
    else cat = Math.random() < 0.5 ? 'ambient' : 'idle';
    this._trigger(cat, { bypassGlobal: true });
    this._resetIdleTimer();
  }

  stop() {
    if (this._gapTimer) { clearTimeout(this._gapTimer); this._gapTimer = null; }
    this._queue.length = 0;
    this._playing = false; this._speaking = false; this._playingPriority = 0;
    try { this.audio.pause(); this.audio.currentTime = 0; } catch (e) {}
  }
}

export const narrator = new Narrator();

// QA handle: window.__wolfVO.onWin(100,1), set window.WOLF_VO_DEBUG=true for logs.
if (typeof window !== 'undefined') window.__wolfVO = narrator;
