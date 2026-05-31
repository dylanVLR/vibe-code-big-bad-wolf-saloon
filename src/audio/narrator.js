/**
 * @module narrator
 * @description The BIG BAD WOLF's play-by-play voice — a gruff cowboy wolf who
 * narrates every spin. Plays pre-rendered MP3s from assets/audio/narrator/ named
 * `<category>_<index>.mp3`. The script (what each clip says) lives in js/phrases.js
 * so the generator tool and the game share one source; here we only need the
 * category names and how many clips each has, to pick a valid random index.
 * Exports a single shared `narrator` instance.
 *
 * Game code calls the on*() event hooks (onSpin, onWin, onBonusTrigger, …); the
 * narrator decides whether/what to say, respecting a cooldown so it doesn't talk
 * over itself, and fills silence with idle chatter.
 */
'use strict';

import { PHRASES } from './phrases.js';

class Narrator {
  constructor() {
    this.audio = new Audio();
    this.audio.addEventListener('ended', () => this._onClipDone());
    this.audio.addEventListener('error', () => this._onClipDone());

    // ── Sequential voice queue ──
    // Clips NEVER overlap: each one plays fully, then a short "breath" pause,
    // then the next. We keep at most one clip waiting (the most recent request),
    // so the wolf finishes his thought without falling far behind the action.
    this._queue = [];
    this._playing = false;
    this._gapMs = 550;        // breath pause between clips (ms)
    this._maxQueue = 1;       // pending clips kept while one plays
    this._gapTimer = null;

    this.enabled = true;
    this._volume = 0.8;
    this._lastSpoke = 0;
    this._cooldownMs = 1500;    // short cooldown — talks constantly
    this._speaking = false;
    this._spinCount = 0;
    this._lossStreak = 0;
    this._winStreak = 0;
    this._totalSpins = 0;
    this._sessionWins = 0;
    this._lastEvent = '';
    this._lastPhraseIndex = -1;
    this._excitement = 0;      // 0-10 excitement meter

    // Phrase banks — one array per game event, loaded from the shared script in
    // js/phrases.js. Each line maps to <category>_<index>.mp3 on disk.
    this.phrases = PHRASES;

    this._idleTimer = null;
    this._resetIdleTimer();
  }

  setVolume(v) { this._volume = Math.max(0, Math.min(1, v)); this.audio.volume = this._volume; }

  /** Queue a clip. Never interrupts what's playing; the most recent request wins. */
  _enqueue(filename) {
    if (!this.enabled || this._volume === 0) return;
    while (this._queue.length >= this._maxQueue) this._queue.shift();  // keep only the newest pending
    this._queue.push(filename);
    if (!this._playing && !this._gapTimer) this._drain();
  }

  /** Start the next queued clip (if any) — only when nothing is playing. */
  _drain() {
    if (this._playing || this._gapTimer) return;
    const next = this._queue.shift();
    if (!next) return;
    this._playing = true;
    this._speaking = true;
    try {
      this.audio.src = `assets/audio/narrator/${next}`;
      this.audio.volume = this._volume;
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => this._onClipDone());
    } catch (e) { this._onClipDone(); }
  }

  /** A clip finished (or errored): hold a breath, then play the next one. */
  _onClipDone() {
    if (!this._playing) return;                  // guard against ended+error double-fire
    this._playing = false;
    this._speaking = false;
    if (this._gapTimer) clearTimeout(this._gapTimer);
    this._gapTimer = setTimeout(() => { this._gapTimer = null; this._drain(); }, this._gapMs);
  }

  /** Pick and play a random clip from a category, respecting the cooldown. */
  say(category, forceCooldown = null, excitementBoost = 0) {
    if (!this.enabled || this._volume === 0) return;
    const cooldown = forceCooldown ?? this._cooldownMs;
    if (Date.now() - this._lastSpoke < cooldown) return;

    const pool = this.phrases[category];
    if (!pool || !pool.length) return;

    let index;
    if (pool.length === 1) {
      index = 0;
    } else {
      do { index = Math.floor(Math.random() * pool.length); }
      while (index === this._lastPhraseIndex && pool.length > 1 && category === this._lastEvent);
    }
    this._lastPhraseIndex = index;
    this._lastEvent = category;
    this._lastSpoke = Date.now();
    this._enqueue(`${category}_${index}.mp3`);
    this._resetIdleTimer();
  }

  sayNow(category, excitementBoost = 0) { this.say(category, 0, excitementBoost); }

  _hype(d) { this._excitement = Math.max(0, Math.min(10, this._excitement + d)); }
  _decayExcitement() { if (this._excitement > 0) this._excitement = Math.max(0, this._excitement - 0.5); }

  /* ── game event hooks ── */
  onSpin() {
    this._totalSpins++;
    this._spinCount++;
    this._resetIdleTimer();
    this._decayExcitement();
    if (this._totalSpins === 1) { this._hype(2); this.sayNow('firstSpin', 2); return; }
    if (Math.random() < 0.75) this.say('spin');
  }

  onWin(amount, bet) {
    this._lossStreak = 0;
    this._winStreak++;
    this._sessionWins++;
    const ratio = amount / bet;
    if (ratio >= 8) {
      this._hype(5);
      this.sayNow('bigWin', 5);
      setTimeout(() => { if (this.enabled) this.say('postWin', 2000, 3); }, 3500);
    } else if (ratio >= 2) {
      this._hype(3);
      this.sayNow('mediumWin', 3);
    } else {
      this._hype(1);
      this.say('smallWin', 800, 1);
    }
    if (this._winStreak >= 3) {
      setTimeout(() => { if (this.enabled) this.say('winStreak', 1500, 2); }, 2500);
    }
  }

  onLoss() {
    this._winStreak = 0;
    this._lossStreak++;
    this._decayExcitement();
    if (this._lossStreak >= 6) this.say('lossStreak', 1000);
    else if (this._lossStreak >= 3 && Math.random() < 0.70) this.say('lossStreak');
    else if (Math.random() < 0.60) this.say('loss');
  }

  onNearMiss() { this._hype(2); this.sayNow('nearMiss', 2); }
  onBonusTrigger() { this._hype(8); this.sayNow('bonusTrigger', 6); }
  onFreeSpin() { if (Math.random() < 0.60) this.say('freeSpin', 1000, 1); }
  onFrameUpgrade(tier) {
    if (tier === 3) { this._hype(5); this.sayNow('brickAchieved', 4); }
    else { this._hype(1); if (Math.random() < 0.70) this.say('frameUpgrade', 1000, 1); }
  }
  onWolfReveal() { this._hype(6); this.sayNow('wolfReveal', 4); }
  onWolfBlow(tier) {
    const cats = ['', 'wolfStraw', 'wolfStick', 'wolfBrick'];
    this._hype(tier * 2);
    this.say(cats[tier], 800, tier * 2);
  }
  onMansionJackpot() { this._excitement = 10; this.sayNow('mansionJackpot', 8); }
  onMiniJackpot() { this._hype(6); this.sayNow('miniJackpot', 5); }
  onRetrigger() { this._hype(5); this.sayNow('retrigger', 4); }
  onBonusComplete(totalWin) { this._hype(4); this.sayNow('bonusComplete', 3); }
  onBetChange(direction) { this.say(direction === 'up' ? 'betUp' : 'betDown', 500, 1); }
  onLowBalance() { this.say('lowBalance', 8000); }
  onInsufficientFunds() { this.sayNow('noFunds', 0); }

  _resetIdleTimer() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      if (this.enabled && this._volume > 0) { this.say('idle', 0); this._resetIdleTimer(); }
    }, 8000 + Math.random() * 7000); // 8-15 seconds idle
  }

  stop() {
    if (this._gapTimer) { clearTimeout(this._gapTimer); this._gapTimer = null; }
    this._queue.length = 0;
    this._playing = false;
    this._speaking = false;
    try { this.audio.pause(); this.audio.currentTime = 0; } catch (e) {}
  }
}

export const narrator = new Narrator();
