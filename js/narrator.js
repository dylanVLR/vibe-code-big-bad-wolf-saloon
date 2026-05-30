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
    this.audio.addEventListener('play',  () => { this._speaking = true; });
    this.audio.addEventListener('ended', () => { this._speaking = false; });
    this.audio.addEventListener('error', () => { this._speaking = false; });

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

  _playAudio(filename) {
    if (!this.enabled || this._volume === 0) return;
    this.audio.pause();
    this.audio.src = `assets/audio/narrator/${filename}`;
    this.audio.volume = this._volume;
    this.audio.play().catch(() => {});   // play() can be interrupted; ignore
    this._lastSpoke = Date.now();
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
    this._playAudio(`${category}_${index}.mp3`);
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

  stop() { this.audio.pause(); this.audio.currentTime = 0; this._speaking = false; }
}

export const narrator = new Narrator();
