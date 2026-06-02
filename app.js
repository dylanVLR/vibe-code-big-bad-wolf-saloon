/* ════════════════════════════════════════════════════════════════
   AUTO-GENERATED — do not edit by hand.
   Bundled from src/ by tools/build.js so the game runs from a double-clicked
   file:// page (and on static hosts). Edit the modules under src/, then rebuild:
       node tools/build.js
════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const __cache = {};
  const __mods = {};
  function require(name) {
    if (__cache[name]) return __cache[name];
    const exports = {};
    __cache[name] = exports;       // set before running, to tolerate cycles
    __mods[name](exports, require);
    return __cache[name];
  }

  __mods["narrator"] = function (exports, require) {
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

const { PHRASES } = require("phrases");
const { state } = require("state");
const { WIN_TIERS } = require("par-sheet");   // shared celebration thresholds (audio = visual)

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

const narrator = new Narrator();

// QA handle: window.__wolfVO.onWin(100,1), set window.WOLF_VO_DEBUG=true for logs.
if (typeof window !== 'undefined') window.__wolfVO = narrator;

Object.assign(exports, { narrator });

  };

  __mods["phrases"] = function (exports, require) {
/**
 * @module phrases
 * @description Every line the narrator can say, in the voice of the BIG BAD WOLF —
 * a gruff cowboy wolf straight out of the Three Little Pigs. Grouped by game event.
 *
 * This is the SINGLE source of truth for the narrator script. It's imported by:
 *   • narrator.js      – picks a random line per event and plays the matching MP3
 *   • tools/voice.js   – generates the MP3s from ElevenLabs (one file per line)
 *
 * Files live at  assets/audio/narrator/<category>_<index>.mp3  where <index> is the
 * line's position in its array. So the array order here defines which file is which —
 * if you re-order or change counts, re-run `node tools/voice.js all <voiceId>`.
 */

const PHRASES = {
  spin: [
    "Alright partner, let's give them reels a spin!",
    "Heeere we go now — round and round she goes!",
    "Spin 'em up, and let's see what the wind blows in!",
    "Ooo-wee! Let's rattle them reels, partner!",
    "Come on now, daddy needs a new pair o' boots!",
    "Awooo! Let 'er rip!",
    "Let's huff up a storm and spin this thing!",
    "Round the reels go — where they stop, heh, only I know!",
    "Crank 'er up, partner — I got a hankerin' for a win!",
    "Spinnin' faster'n a tumbleweed in a twister!",
    "Let's see if them pigs left us anything good!",
    "Hold onto your hat — here she spins!",
    "I feel a lucky wind a-blowin', partner!",
    "Saddle up! These reels are about to ride!",
    "One good huff oughta get these reels movin'!",
    "Come on, sugar — show ol' Wolf somethin' sweet!",
    "Reels a-turnin', and my belly's a-rumblin'!",
    "Yeehaw! Down the trail we go!",
    "Spin it like you mean it, partner!",
    "Let's blow the doors off this one!",
    "Here comes the big bad spin, little piggies!",
    "My whiskers are twitchin' — that means money!",
    "Let's kick up some dust on these here reels!",
    "Come on now, line 'em up like ducks in a row!",
    "Easy does it... and... SPIN!",
    "Wind's at our back, partner — let 'er fly!",
    "Give 'er a whirl! Fortune favors the hungry!",
    "Round we go — I can almost taste them winnins!",
  ],
  smallWin: [
    "Well lookie there — a lil' nibble!",
    "Heh, ain't much, but a wolf don't turn down a snack!",
    "A few coins for the den! I'll take it!",
    "That there's an appetizer, partner!",
    "Small bite, but tasty all the same!",
    "Cha-ching — that's some kibble money!",
    "Not a feast, but it'll hold me over!",
    "A lil' somethin' for the chinny-chin-chin!",
    "Coins in the coat, partner — every bit counts!",
    "Heh heh, them pigs dropped a few on the way out!",
    "A modest haul, but ol' Wolf is patient!",
    "That'll buy me a new neckerchief at least!",
    "Small win, big appetite — keep 'em comin'!",
    "Pocket change, but my pockets run deep!",
    "A nibble here, a nibble there — adds up, partner!",
    "Yeehaw, a little drizzle 'fore the storm!",
    "I've et smaller, partner — we'll take it!",
    "Couple coins jingle-jangle — music to my ears!",
  ],
  mediumWin: [
    "Now we're cookin' with bacon grease!",
    "Ooo-wee! That's a proper meal right there!",
    "Heh heh HEH! The pigs are payin' up!",
    "Now THAT'S a haul worth howlin' about! Awooo!",
    "Look at them coins runnin' like scared piggies!",
    "That's the good stuff, partner — sink yer teeth in!",
    "A solid bite outta this here game!",
    "Yeehaw! The wind's blowin' our way!",
    "That'll fill the den AND the belly!",
    "Mighty fine payout, partner — mighty fine!",
    "Them reels finally came to their senses!",
    "Oh, I'm lickin' my chops over this one!",
    "Now we're talkin' real wolf money!",
    "That's a wagon-load of coins, partner!",
    "Huff, puff, and PAYDAY! Beautiful!",
    "The pigs are squealin' and I'm grinnin'!",
    "A fine cut of winnins, served up hot!",
    "Ringin' the dinner bell on that one!",
  ],
  bigWin: [
    "AWOOOOO! Now THAT is a feast, partner!",
    "WELL SLAP MY TAIL AND CALL ME LUCKY!",
    "HOO-WEE! The whole dang henhouse just paid out!",
    "I HUFFED, I PUFFED, AND I BLEW THE BANK WIDE OPEN!",
    "GREAT GALLOPIN' GOLD! LOOK AT THEM COINS!",
    "NOT BY THE HAIR — THIS HERE'S A MONSTER, PARTNER!",
    "YEEEEHAW! BIGGEST HAUL THIS SIDE O' THE FOREST!",
    "THEM PIGS DONE LEFT THE WHOLE TREASURE BEHIND!",
    "I'M HOWLIN' AT THE MOON OVER THIS ONE! AWOOO!",
    "STAMPEDE OF COINS, PARTNER — GET OUTTA THE WAY!",
    "MY CHINNY-CHIN-CHIN IS TREMBLIN' WITH JOY!",
    "BLOW ME DOWN — THAT'S A FORTUNE!",
    "HOT DIGGITY WOLF, WE STRUCK IT RICH!",
    "RING THE DINNER BELL — IT'S A BANQUET!",
    "I AIN'T NEVER SEEN SO MANY COINS IN ALL MY DAYS!",
    "THE BIG BAD WOLF HITS THE BIG BAD JACKPOT!",
    "GRAB A BUCKET, PARTNER — IT'S RAININ' GOLD!",
    "MY WHISKERS 'BOUT FELL OFF — WHAT A WIN!",
    "WOOOO! TELL THE WHOLE FOREST WE DONE IT!",
    "THIS HERE'S A WIN FER THE STORYBOOKS!",
  ],
  loss: [
    "Aw, shucks — empty as a pig pen at suppertime.",
    "Nothin' but tumbleweeds on that one, partner.",
    "Hmph. Them pigs got away clean that round.",
    "Dry as the desert. Shake it off, partner.",
    "No bacon this time. We huff again!",
    "Ah well — even a wolf misses a meal now and then.",
    "The wind died down on that one. Reload them lungs!",
    "Nothin' in the henhouse. Onward!",
    "Them reels are playin' coy. I like a challenge.",
    "Missed 'em by a whisker. We'll get 'em next time.",
    "No coins, no problem — a wolf is patient.",
    "That house didn't budge. Bigger huff next round!",
    "Empty-pawed, but not for long, partner.",
    "Heh, them pigs think they're safe. Cute.",
    "Dust in the wind. Let's spin her again.",
    "A swing and a miss. Sharpen them claws!",
    "Not a crumb that time. My belly grumbles on.",
    "Quiet round. Calm 'fore the big bad storm.",
  ],
  lossStreak: [
    "Come on now — them pigs can't hide forever!",
    "Dang it all, this dry spell's testin' my patience!",
    "A wolf's gotta eat! Throw me a bone here!",
    "Been a long, dusty trail without a meal...",
    "I've huffed till I'm blue — somethin's gotta give!",
    "Them three pigs are gettin' cocky. Won't last!",
    "Every drought ends in a downpour, partner. Hold fast!",
    "I can smell a big win comin' over the ridge!",
    "These reels OWE me — and a wolf always collects!",
    "Lean times, partner — but the wolf endures!",
    "I've gone hungrier'n this and still ate good!",
    "The bricks are holdin' for now. Keep huffin'!",
    "Patience, partner. Even the moon takes its time.",
    "My luck's 'bout to turn like the prairie wind!",
    "Storm's been brewin' — any spin now she breaks!",
    "Keep the faith — the big bad payday's comin'!",
  ],
  nearMiss: [
    "Ooo! Nearly had them pigs by the tail!",
    "One whisker away! ONE! Dadgummit!",
    "So close I could smell the bacon fryin'!",
    "Argh — that house near 'bout came down!",
    "Them pigs slipped out the back door, partner!",
    "A hair! Not by the hair of my chinny-chin-chin!",
    "Teasin' me, are ya? Them reels are cruel!",
    "I had 'em cornered and they wriggled free!",
    "Almost blew it down! One more gust!",
    "My chops were waterin' — and POOF, gone!",
    "Right there! It was RIGHT there, partner!",
    "Close enough to feel the wind change!",
  ],
  extremeAnticipation: [
    "Ooooh! Five hats! One more and we blow the house down!",
    "Hold yer breath partner... we just need one more!",
    "Five hats! Come on, number six! Awooo!",
    "One more hat and it's bonus time! Let's go!",
    "The anticipation is killin' me! Drop that hat!"
  ],
  bonusTrigger: [
    "AWOOO! Them hard hats opened the gate — FREE SPINS!",
    "WELL BUST MY BRITCHES — IT'S THE BONUS, PARTNER!",
    "THE PIGS ARE BUILDIN' AND WE'RE COMIN' FOR 'EM!",
    "SIX HATS! TIME TO HUFF AND PUFF FER REAL!",
    "BONUS ROUND, PARTNER — THE HUNT IS ON!",
    "YEEHAW! THE BIG BAD BONUS DONE TRIGGERED!",
    "RING THE BELL — FREE SPINS AT THE PIG FARM!",
    "I BEEN WAITIN' ALL DAY FER THIS — BONUS TIME!",
    "GRAB YER HAT — WE'RE GOIN' HOUSE TO HOUSE!",
    "THE WHOLE FOREST HEARD THAT ONE! BONUS, BABY!",
    "HOO-WEE! Now the real huffin' begins!",
  ],
  freeSpin: [
    "Another free one — build them houses, piggies!",
    "Free spin a-comin' — more straw to blow down!",
    "On the house, partner — just how I like it!",
    "Stack them frames up — I'll huff 'em all down!",
    "Come on, hard hats — show yer faces!",
    "Free spin! Let's fatten up that prize!",
    "More bricks, more loot — keep 'em comin'!",
    "Round on the house — yeehaw!",
    "Let's see them pigs work fer MY supper!",
    "Another crack at the henhouse — free!",
    "Spin's on me, partner — well, on the pigs!",
  ],
  frameUpgrade: [
    "A hat! That house just got a sight bigger!",
    "Buildin' up, partner — more to blow down later!",
    "Ooo, them walls are risin'! Good, GOOD!",
    "Upgrade! The bigger they are, the harder I huff!",
    "Another hat on the pile — keep stackin'!",
    "Them pigs are workin' hard fer my benefit!",
    "Walls goin' up means winnins goin' up!",
  ],
  brickAchieved: [
    "A BRICK HOUSE! Oh, that's the GOOD eatin' right there!",
    "FULL BRICK, partner — top dollar inside!",
    "Them pigs built it solid — and I built it RICH!",
    "Brick by brick, that's a fortune waitin'!",
    "Solid as a mountain — and twice as valuable!",
    "Now THAT house has somethin' worth blowin' fer!",
  ],
  wolfReveal: [
    "Step aside — the BIG BAD WOLF is here!",
    "Heh heh... I'll huff, and I'll puff, partner!",
    "Time to do what a wolf does best!",
    "Knock knock, little pigs — guess who?",
    "The wind's got teeth now, partner!",
    "Here comes the huffin', here comes the puffin'!",
    "Awooo! Let me at them houses!",
  ],
  wolfStraw: [
    "HUFF! And the straw goes flyin'! Easy pickins!",
    "One puff and that straw house is GONE!",
    "Ha! Straw don't stand a chance against me!",
    "Down she goes — straw all over the prairie!",
    "Barely a breath and POOF — straw's history!",
  ],
  wolfStick: [
    "PUFF! Them sticks are scatterin' ever' which way!",
    "A bigger blow and TIMBER — sticks down!",
    "Heh, had to put a little muscle in that one!",
    "Stick house crumbles like a dry biscuit!",
    "Whoosh! Kindlin' fer my campfire now!",
  ],
  wolfBrick: [
    "HUFF AND PUFF — I'm givin' her all I got!",
    "Them bricks are stubborn... but the PRIZE inside, ooo-wee!",
    "Not by the hair of my chinny-chin-chin — but LOOK at that payout!",
    "The brick house stands... and pays a wolf's ransom!",
    "Couldn't blow it down, but I'll take the treasure!",
    "Solid bricks, solid GOLD, partner!",
  ],
  // The "Wanted Reward" reveal speaks ONE fixed line over the full-frame poster.
  mansionJackpot: [
    "Congratulations, partner! You just won the Wanted Reward!",
  ],
  miniJackpot: [
    "JACKPOT, partner! Treasure in the chimney!",
    "Well lookie — a pot o' gold in that house!",
    "Mini jackpot! Them pigs were hidin' loot!",
    "Found the stash, partner! Heh heh heh!",
  ],
  retrigger: [
    "MORE free spins?! Don't mind if I DO!",
    "Retrigger! The hunt keeps on goin'!",
    "Three more hats — extra spins on the house!",
    "Awooo! We ain't done feastin' yet!",
    "The bonus keeps givin' like a generous pig!",
  ],
  bonusComplete: [
    "And that's a wrap, partner — fine huntin' today!",
    "Bonus done — the pigs live to build another day!",
    "Belly's full, den's richer — what a round!",
    "We blew through them houses good, partner!",
    "Last puff's been puffed — let's count the loot!",
  ],
  idle: [
    "Reels are quiet... too quiet fer my likin', partner.",
    "I can smell them three little pigs from here...",
    "Go on, give 'er a spin — the wolf gets restless!",
    "Just me, the moon, and a hankerin' fer bacon.",
    "Press that button, partner — daylight's burnin'!",
    "I hear them pigs hammerin' away... let 'em build.",
    "A wolf waits... but not too patient-like, ya hear?",
    "Tumbleweed just rolled by. That's your cue, partner.",
    "The henhouse ain't gonna raid itself, ya know.",
    "I been sharpenin' my huffin' fer the next round.",
    "Quiet as a church mouse out here — spin somethin'!",
    "My whiskers are gettin' dusty. Let's ride!",
    "Them reels are just sittin' there, tauntin' me.",
    "Story goes the wolf always gets his supper. Eventually.",
    "Take yer time, partner. The pigs sure are.",
    "I could go fer a spin... and a snack.",
    "Wind's pickin' up. Perfect weather fer huffin'.",
    "Fortune favors the hungry — and I'm STARVIN'.",
    "Out here narratin' to the cactus again, I see.",
    "Even the moon's waitin' on ya, partner.",
    "A good wolf knows patience. A great one knows when to POUNCE.",
    "Reckon them pigs think they're safe. Reckon they're wrong.",
    "Spin the reels 'fore I start chewin' the furniture!",
    "Long as there's pigs to chase, ol' Wolf's stickin' around.",
  ],
  firstSpin: [
    "Well howdy, partner — welcome to BIG BAD WOLF! Let's hunt!",
    "Saddle up! First spin of the day — make it a good 'un!",
    "The wolf is hungry and the pigs are nervous — here we GO!",
    "Welcome to my neck o' the woods, partner! First spin's a-comin'!",
  ],
  lowBalance: [
    "Careful now, partner — the purse is gettin' light.",
    "We're runnin' lean, like a wolf in winter...",
    "Balance is thin as straw. Need a big huff soon!",
    "Pockets near empty, partner — time fer a comeback!",
    "Low on coin, but a wolf's luck can turn quick!",
  ],
  betUp: [
    "Raisin' the stakes! I LIKE yer appetite, partner!",
    "Bigger bet, bigger bacon! Now yer talkin'!",
    "Ooo-wee, goin' for the whole hog, are ya?",
    "More on the line — that's the wolf spirit!",
  ],
  betDown: [
    "Easin' off a touch — smart, partner, smart.",
    "Playin' it cagey. A wise wolf does the same.",
    "Smaller bet, longer hunt. I respect it.",
    "Dialin' it back to live and huff another day.",
  ],
  postWin: [
    "Look at them coins pile up — purty as a sunset!",
    "Keep 'em comin', partner — fill the den!",
    "That counter's climbin' like a cat up a tree!",
    "Sweetest sound there is — coins and squealin' pigs!",
    "I could watch this all dang day, partner!",
    "The loot just keeps a-rollin' in! Yeehaw!",
    "My belly AND my coin purse are happy now!",
    "That's a payout worth howlin' over! Awooo!",
  ],
  winStreak: [
    "Another'n?! We're on a TEAR, partner!",
    "Back to back — this machine's runnin' scared!",
    "Hotter'n a brandin' iron! Keep it up!",
    "The pigs can't build fast enough fer us!",
    "Win after win — the wolf is on the PROWL!",
    "Don't nobody touch nothin' — we're blazin'!",
    "Three in a row! I'm howlin' at the moon!",
    "This here's a winnin' streak fer the ages!",
    "Stampede o' luck, partner — ride it!",
  ],
  noFunds: [
    "Aw, partner — the purse is plumb empty.",
    "Den's bare and the pockets are dry. Reload to ride!",
    "That's all she wrote — outta coin, partner.",
    "Even a big bad wolf runs outta supper sometime.",
    "Empty-handed, but full of stories! Refill to hunt again!",
  ],

  /* ═══════════════════════════════════════════════════════════════════════
     CONTEXTUAL POOLS — selected by the Wolf VO manager based on real game
     state (visible symbols, win tier, streaks, idle, bonus mode, expansions).
     Symbol callouts are mapped to what the player actually SEES:
       shot glass = 'toolbox'   horseshoe = 'pig-suit'/'pig-contractor'
       wolf wild  = 'wild'       hard hats  = the bonus-building 'hat-*'.
     Responsible play: no "you're due", no pressure, no guaranteed wins.
  ═══════════════════════════════════════════════════════════════════════ */

  // Base-game saloon ambience (rare idle flavor)
  ambient: [
    "Place yer bet, partner. The wolf's watchin' the door.",
    "This saloon's got three rules: spin fair, count fast, and don't build with straw.",
    "I smell coin dust, hoof tracks, and just enough trouble to keep me interested.",
    "Round here, even the tumbleweeds know when the reels are warm.",
    "Pull up a stool. Ol' Wolf's got eyes on the whole saloon.",
    "The bar's open, the reels are restless, and I'm in a generous mood.",
    "Careful now. This place smiles before it bites.",
    "Dusty reels, shiny coins, nervous little pigs upstairs. My kind o' evenin'.",
    "The piano stopped playin'. Usually means somethin' expensive is comin'.",
    "I've blown down straw, sticks, and bad alibis. Let's see what these reels are made of.",
    "Quiet saloon, restless reels. Dangerous little combination.",
    "Somewhere upstairs, a little pig just locked his door.",
  ],
  idleAfterWin: [
    "Admirin' the win? Can't blame ya. I'd frame it over the bar.",
    "That one had some bite. Take yer second, partner.",
    "Coins still smell warm from here.",
    "A haul like that makes the pigs peek through the curtains.",
    "Not a bad little pile. The saloon noticed.",
    "Sit with it. Good wins deserve a slow whiskey.",
  ],
  idleAfterLoss: [
    "No rush, partner. The saloon ain't runnin' off.",
    "Quiet result, loud possibilities.",
    "Dust it off. Take yer time.",
    "Even wolves miss a hoofprint now and then.",
    "Take a breath. The reels'll keep.",
    "Easy does it. No trail's in a hurry.",
  ],
  coldStreak: [
    "Dry patch. Keep yer head, partner.",
    "Dusty trail right now. No shame in slowin' down.",
    "Reels are playin' hard to get. That's their bad habit.",
    "Cold wind through the saloon. Happens to the best boots.",
    "No need to chase every tumbleweed.",
    "Quiet stretch. Stretch yer legs if ya like.",
  ],
  twoWinStreak: [
    "That's two in a row. Somebody bolt the pig pen.",
    "Back to back? The chimney's startin' to rattle.",
    "Two wins walkin' side by side.",
    "The reels are startin' to recognize ya.",
    "Two knocks at the same door.",
    "Second win, and the wolf is listenin'.",
    "That's two. Even the horseshoe blinked.",
    "A little streak just found its boots.",
  ],
  threeWinStreak: [
    "Three runnin'. Straw, sticks, bricks — don't matter. I'm at the door.",
    "Three in a row. Now the pigs are holdin' a meetin'.",
    "That streak's got teeth now.",
    "That ain't luck knockin'. That's luck kickin'.",
    "Three bites in a row. Clean work.",
    "Now we've got a proper trail.",
    "The reels are warmin' their paws.",
    "That streak just ordered a drink.",
  ],
  hotStreak: [
    "Win streak's got spurs on it.",
    "This run's huffin' hotter than a desert forge.",
    "The saloon's leanin' in now.",
    "That trail's turnin' into a stampede.",
    "Keep this up and the pigs'll file a noise complaint.",
    "Now the reels are dancin' on the bar.",
    "Hot run, cool head.",
    "The whole room smells like coin dust.",
  ],
  streakEnded: [
    "Streak took a bow. Even wolves tip their hat.",
    "Trail cooled off. Happens to the best boots.",
    "That run had style while it lasted.",
    "Dust settles after every stampede.",
    "Streak's done, but the saloon remembers.",
  ],
  anticipation: [
    "Hold up. Last reel's draggin' its boots.",
    "Easy now. That reel's makin' a meal of it.",
    "Don't blink. This last reel's got drama in its pockets.",
    "Somethin's knockin' behind that reel.",
    "I hear floorboards creakin'.",
    "Come on now. Show yer teeth.",
    "The dust just stopped movin'.",
    "Careful. This is where the saloon holds its breath.",
    "Last reel's got a secret. Let's see if it talks.",
    "One more step, little piggy.",
    "That reel's stallin' like a pig at rent time.",
    "The saloon went quiet. That's luck or a sneaky pig.",
  ],
  expandingReels: [
    "Walls are stretchin'. Somebody built this place with wolf-sized plans.",
    "Reels are openin' up. More room for trouble.",
    "That's an expansion, partner. Bigger floor, bigger dance.",
    "The saloon just kicked out a wall.",
    "More reels, more room to huff.",
    "Look at that — the reels grew teeth.",
    "That wall came down easier than straw.",
    "The place is stretchin' like it heard my name.",
    "Bigger reels, bigger shadow.",
    "Now we've got elbow room.",
    "Wolf wild on the floorboards. Respect it.",
    "When the wolf goes wild, the saloon checks the locks.",
  ],
  bonusEnter: [
    "Bonus round, partner. Bigger chances, bigger teeth.",
    "Keep yer hat low. The bonus can kick harder than a mule.",
    "This is the back room, where the real coin smoke curls.",
    "Don't count the bricks yet. Let the bonus breathe.",
    "Now we're in bonus country. Pigs lock the windows out here.",
    "This is where straw houses become cautionary tales.",
    "Step inside. The floorboards know my name.",
    "Bonus round. Same wolf, bigger shadow.",
    "The bonus is open, and I brought lungs.",
    "Now the saloon gets honest.",
  ],
  bonusSpin: [
    "Bonus reels turnin'. That sound never gets old.",
    "Every bonus spin's a fresh bootprint.",
    "Let's see what the back room pays.",
    "The pigs are countin' bricks. I'm countin' chances.",
    "This bonus still has dust to kick up.",
    "Keep one eye on the wilds.",
    "Let it breathe. Let it bite.",
    "Bonus country's got sharp teeth.",
    "More room for the wolf in here.",
    "That reel's got back-room manners.",
  ],
  bonusWin: [
    "Now that's a bonus with bite.",
    "Piggy bank just heard hoofbeats.",
    "That one rattled the rafters.",
    "Coins on the floor, smoke in the air.",
    "The back room pays when it's in the mood.",
    "That hit had spurs.",
    "I felt that one in my whiskers.",
    "Now we're cookin' with wolf breath.",
    "Bonus teeth, right there.",
    "That win kicked the saloon doors off.",
  ],
  bonusBigWin: [
    "That's the kind o' bonus that makes brick houses nervous.",
    "The pigs just moved to a safer county.",
    "That win didn't knock. It kicked the door clean in.",
    "I'd huff for that one twice.",
    "Somebody check the roof. I think it lifted.",
    "Now the saloon's payin' attention.",
    "A bonus like that leaves claw marks.",
    "That pile's got its own shadow.",
  ],
  bonusEnd: [
    "Bonus is over. Check yer pockets for scorch marks.",
    "Back to the bar. I left claw marks on that bonus.",
    "The back room closes, but the wolf remembers.",
    "That bonus took a bow.",
    "Doors shut, dust settles, coins tell the story.",
    "That was a ride through wolf country.",
    "Back to base game. Same saloon, fresh trouble.",
    "The bonus is done. The pigs can stop whisperin'.",
    "Put that one in the ledger.",
    "Bonus trail ends here, partner.",
  ],
  symShotGlass: [
    "Shot glass on the rail. Tiny cup, big attitude.",
    "I see the shot glass. Bartender's pretendin' not to.",
    "That shot glass looks guilty.",
    "Glass on the reels. Somebody's buyin' trouble.",
    "That little glass has seen things.",
    "Shot glass showin'. Saloon's in session.",
    "Careful with that glass. It bites back.",
    "That glass is small, but it walks loud.",
  ],
  symShotGlassMulti: [
    "More than one shot glass? Now the piano's nervous.",
    "Two glasses showin'. Trouble's pourin'.",
    "That's a rowdy little shelf o' glass.",
    "The bartender just looked over.",
    "Glasses stackin' up. The night got interestin'.",
  ],
  symHorseshoe: [
    "Lucky horseshoe showin'. Let's see if it remembers its job.",
    "There's that horseshoe, shinin' like it owes ya money.",
    "Horseshoe on deck. Superstition just put on boots.",
    "That horseshoe's got a smug little shine.",
    "Iron luck on the reels.",
    "A horseshoe in the window. That'll make a wolf curious.",
    "That horseshoe better not be all hat and no cattle.",
    "Horseshoe flashin'. The saloon noticed.",
  ],
  symHorseshoeMulti: [
    "Two horseshoes? Now luck's wearin' both boots.",
    "That's a lot o' lucky iron.",
    "Horseshoes stackin' up. The floorboards feel fortunate.",
    "Three horseshoes? Even I'd call that suspicious.",
    "Luck just walked in wearin' spurs.",
  ],
  symHats: [
    "Hard hats pilin' up. Six of 'em opens the back room.",
    "Look at them hard hats. The bonus is sniffin' around.",
    "Hats on the reels. The pigs put on their helmets.",
    "Construction crew's clockin' in. Hard hats everywhere.",
    "Them hard hats mean business when they crowd in.",
    "I count hard hats like I count piggies — hungrily.",
    "Hats gatherin'. Six opens the bonus doors.",
    "That's a brave little crew of hard hats.",
  ],
  menuReturn: [
    "Back from the paperwork? Good. The reels missed us.",
    "Rules read, boots dusted, wolf ready.",
    "Paytable's got the map. I've got the teeth.",
    "Settings settled. Saloon's still standin'.",
    "Welcome back. The pigs got nervous while ya were gone.",
    "Took yer time in there. The whiskey's still cold.",
  ],
  // Friendly teasing of the "other" huff-and-puff act — OFF by default in the manager.
  roasts: [
    "I heard some other puff act needed a whole machine to blow a house down. Cute.",
    "Huff and more puff? Please. Round here, one good breath gets the job done.",
    "Some wolves need fireworks. I just need a door hinge and bad construction.",
    "Tell that other puff parlor the bricks still look nervous.",
    "There's puff, then there's performance. Mine comes with teeth.",
    "Some games huff. Some games puff. This one bites.",
    "I don't need a fancy sign. I got lungs and a grudge.",
    "Other wolves make noise. I make renovations.",
    "More puff? Partner, I brought plenty.",
    "I've seen puff acts with less bite than a saloon napkin.",
  ],
  // Click the "BIG BAD WOLF SALOON" sign → the wolf brags about his joint.
  saloonHeader: [
    "Big Bad Wolf Saloon. My name's on the door 'cause I huffed down the last three.",
    "Welcome to my saloon, partner. Finest whiskey, worst-built houses in the territory.",
    "This here's the Big Bad Wolf Saloon. Pigs drink free — if they can outrun the tab.",
    "Every board in this place, I blew in from somewhere else.",
    "Big Bad Wolf Saloon, where the piano's honest and the pigs ain't.",
    "Built it myself. Well — I huffed, the pigs built, then I moved in.",
    "My saloon, my rules, my reels. Pull up a stool.",
    "They named it after me. Only fair — I'm the one with the lungs.",
    "No straw, no sticks in this saloon. Just good solid trouble.",
    "Finest saloon west of the brick house. Only one, too. Funny how that works.",
    "Step careful, partner. This saloon bites back, and so do I.",
  ],
  // Click the "Vegas Low Roller Approved" medallion → a friendly nod to VLR.
  vlrMedallion: [
    "Ah, Vegas Low Roller... I know him. Mighty fine YouTube channel.",
    "Vegas Low Roller approved, partner. That fella knows his slots.",
    "That's the Vegas Low Roller seal. Tell him the wolf says howdy.",
    "Vegas Low Roller — a low roller with a big heart. Good company to keep.",
  ],
  // Click the sheriff's star badge → the wolf claims the law.
  sheriffBadge: [
    "Careful, partner. That's the Sheriff's badge, and there is only one Sheriff in this town. That's me, Big Bad Wolf.",
    "That star's the Sheriff's badge. Round here, the law's got fur and a temper.",
    "Sheriff's badge, partner. I pinned it on myself. Nobody argued twice.",
    "Easy with that badge. The last fella who wore it... well, the pigs don't ask about him.",
  ],
  // Mouse hovers over SPIN for 3+ seconds without clicking → the wolf razzes 'em.
  spinHover: [
    "You gonna click it? Or just stare at it all day?",
    "That button ain't gonna press itself, partner.",
    "Go on, push it. It don't bite — that's my job.",
    "Starin' contest with the spin button? Bold strategy.",
    "Push it, partner. The reels are gettin' lonely.",
    "I've seen molasses move quicker than that trigger finger.",
    "It's shiny, I know. But it's prettier when it's spinnin'.",
    "You hoverin' or proposin'? Either way, do somethin'.",
    "Quit pettin' that button and give it a spin.",
    "Your hand's right there. The button's right there. You do the math.",
    "Take yer time. The pigs ain't goin' anywhere... probably.",
    "Any day now, partner. The whiskey's gettin' warm.",
  ],
  // Opening the BUY BONUS confirmation
  buyBonus: [
    "Buyin' yer way into the back room? Bold. I respect bold.",
    "Skippin' the line straight to the bonus, eh? Big spender.",
    "Payin' to kick the doors open? That's the spirit, partner.",
    "Why wait for the bonus when ya can drag it in by the collar?",
    "Cash on the bar for a shortcut to trouble. I like yer style.",
    "Buyin' the back room. Now that's a wolf-sized decision.",
    "Straight to the bonus, no dilly-dallyin'. My kind of partner.",
    "The pigs hate this option. That's how I know it's a good one.",
  ],
  // Bet raised to the maximum level
  maxBet: [
    "Max bet! Now yer huntin' like a real wolf.",
    "All the chips on the table — I LIKE it, partner.",
    "Bettin' the whole henhouse, are we? Bold.",
    "Max stakes. The pigs just got a lot more nervous.",
    "Now THAT'S an appetite. Top of the bettin' line.",
    "Goin' for the whole hog. Respect.",
    "Maxed 'er out. No straw houses for big spenders.",
    "Top dollar, partner. The saloon's payin' attention now.",
  ],
  // Idling while sitting on a big balance
  richIdle: [
    "Sittin' on a fat stack and starin' at the wall? Livin' the dream, partner.",
    "That's a healthy pile o' coin. Whiskey's on you tonight.",
    "Look at all that loot. Even the pigs are impressed.",
    "Big balance, calm hands. That's how a wolf does it.",
    "That pile's got its own gravity, partner.",
    "Coin like that, ya could buy yer own saloon. Oh wait — I already did.",
    "Restin' on a mountain of money. Can't say I blame ya.",
    "That's a stack worth guardin'. Good thing ya got a wolf for that.",
  ],

  /* ═══════ CLICK-A-SYMBOL JOKES — tap a reel symbol, the wolf riffs on it ═══════ */
  clickWolf: [
    "That handsome devil on the reel? Yeah, he gets it from me.",
    "Two wolves in one saloon? The pigs are officially doomed.",
    "Click me all ya want, partner. I don't break character.",
    "I'd recognize that snarl anywhere. It's my good side.",
    "That's my reel cousin. Still owes me twenty bucks.",
    "Careful pokin' the wolf. I bite back... affectionately.",
    "A wolf symbol. Finally, some good-lookin' competition.",
  ],
  clickBuzzard: [
    "That buzzard shows up when somethin's about to die. Usually a straw house.",
    "Ol' buzzard's just waitin' for the pigs to slip up. Patient fella.",
    "That bird's got worse manners than me, and that's sayin' somethin'.",
    "Buzzard pays the least 'cause he eats the leftovers. Even the reels know it.",
    "A buzzard. Circlin', circlin'... cheap date, though.",
    "That buzzard once tried to outwait a wolf. Lost. Badly.",
    "Don't mind the buzzard. He's just here for the scraps.",
  ],
  clickHat: [
    "Hard hat! Six of them little helmets and we kick the bonus doors open.",
    "Pigs wear hard hats thinkin' they'll save the house. Adorable.",
    "A hard hat. Safety first... right before I huff the whole thing down.",
    "Them pigs unionized. Now they got hard hats AND a mortgage.",
    "Collect six hard hats and the back room opens. I'll bring the lungs.",
    "A hard hat won't stop a wolf. But it's cute that they try.",
    "Construction crew's clockin' in. Six hats and the real fun starts.",
  ],
  clickHorseshoe: [
    "Lucky horseshoe! Stole it off a nervous pony. Don't tell.",
    "That horseshoe's upside down. All the luck's pourin' out. Tragic.",
    "Hang a horseshoe over the saloon door, they say. I just hang the pigs.",
    "Found a horseshoe once. The horse weren't usin' it... anymore.",
    "Iron luck on the reels. Shinier than the sheriff's badge — which is mine.",
    "That horseshoe's seen more miles than my boots, and that's a lot.",
    "A horseshoe. Good luck for you, bad luck for the pigs.",
  ],
  clickTornado: [
    "A tornado! That's just me sneezin', partner. Allergies.",
    "Twister on the reels. I huffed a little too hard last Tuesday.",
    "That tornado took a straw house clean to the next county. Saved me the trip.",
    "Don't worry 'bout the tornado. It's on my payroll.",
    "Nature's way of doin' my job for me. I respect the hustle.",
    "Pigs see a tornado. I see a coworker.",
    "That's a lot of wind, partner. And I'm the windiest thing in this saloon.",
  ],
  clickShotGlass: [
    "Shot glass! Bartender, leave the bottle. The wolf's thirsty.",
    "A little glass with a big attitude. Reminds me of the smallest pig.",
    "One shot for courage, partner. Two for a bad decision.",
    "That glass is empty. Somebody fix that immediately.",
    "Whiskey in a glass that small? That's just a tease.",
    "A shot glass on the reels. The night's officially gettin' interesting.",
    "Careful — one glass leads to ten, and ten leads to singin'.",
  ],
  clickRoyals: [
    "Playin' cards? In a saloon? Now somebody's definitely cheatin'.",
    "Ace, King, Queen... fancy letters for the low-payin' folks.",
    "Them royals don't pay much. Even the buzzard looks down on 'em.",
    "Last fella who played cards with me left in a real hurry.",
    "A face card. At least it's got a face — unlike that buzzard's personality.",
    "Them letters pay the least, partner. But they sure crowd in.",
    "Queen of hearts? In this town she runs the place. Don't cross her.",
  ],
  clickWild: [
    "That's the Wolf Wild — my finest work. Fills the whole reel, like my ego.",
    "The wild's all me, partner. When it lands, the saloon checks the locks.",
    "Click the wild all ya like. It's basically a portrait of yours truly.",
    "That snarl in the middle? Pure wolf. Accept no substitutes — 'cept that one.",
  ],

  // High-noon easter egg — the wolf narrates the standoff title card aloud.
  // Keep this line in sync with the #noon-card text in index.html.
  highNoon: [
    "Well, well... a stranger just moseyed into town on the stroke of twelve. But these here parts ain't big enough for the both of us — there's only one Big Bad Wolf in this saloon.",
  ],

  // High-noon STORYBOOK — read aloud after the standoff clip, one page at a time,
  // over the showdown music, then the gunshots. Each entry is ONE page: it is both
  // shown on screen (src/scenes/high-noon.js) and the text of its voiceover clip
  // (assets/audio/narrator/highNoonStory_<i>.mp3). Keep the two in sync.
  highNoonStory: [
    `For one very long moment, nobody moved.`,
    `A pig poked his head out from behind a rain barrel. "Can we maybe not do the huffing and puffing today?"`,
    `As the Sheriff in these parts, I gestured towards the pig and said, "Relax. He's already at Huff N' Even More Puff. There's nowhere left for him to go, end of line, partner, unless you really want more."`,
    `The town gasped. The sheriff wolf's ears twitched. A tumbleweed stopped rolling just to watch.`,
  ],
};

Object.assign(exports, { PHRASES });

  };

  __mods["sound"] = function (exports, require) {
/**
 * @module sound
 * @description Sound for Big Bad Wolf. Exports two ready-to-use singletons:
 *   `synth` – one-shot sound effects (pre-rendered MP3s in assets/audio/sfx/)
 *   `bgm`   – looping background music (base-game + bonus tracks, crossfaded)
 * Both are created once here and shared via ES-module caching.
 */

// Touch devices (iPhone/Android) hitch when many `new Audio()` elements decode
// the same clip at once — e.g. the rapid coin-ticks during a win count-up, or the
// reel-stop cascade. On touch we reuse a tiny pool of pre-decoded elements per
// file instead of allocating a fresh one each call, and rate-limit the fastest
// ticks. Desktop keeps the simple per-call path (plenty of headroom there).
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia &&
                 window.matchMedia('(pointer: coarse)').matches;

/* ── Sound effects ── */
class Synth {
  constructor() {
    this.enabled = true;
    this._volume = 0.7;       // 0..1
    this._spinAudio = null;   // the looping reel-spin sound
    this._windAudio = null;   // the looping tornado-wind sound
    this._active = new Set();
    this._pool = new Map();   // filename → { els:[Audio…], idx } (touch only)
    this._lastTick = 0;       // throttle clock for the rapid coin-tick
  }

  /** Play an MP3 from assets/audio/sfx/. Returns the Audio element. */
  _play(filename, vol = 1.0, loop = false) {
    if (!this.enabled) return null;
    const audio = new Audio(`assets/audio/sfx/${filename}`);
    audio.volume = this._volume * vol;
    audio.loop = loop;
    this._active.add(audio);
    audio.addEventListener('ended', () => this._active.delete(audio));
    audio.play().catch(() => {});
    return audio;
  }

  /** Lazily build (once) and round-robin a small pool of decoded elements for a
      file, so repeated one-shots reuse buffers instead of re-decoding. */
  _poolGet(filename) {
    let p = this._pool.get(filename);
    if (!p) {
      const els = [];
      for (let i = 0; i < 3; i++) {       // 3 ⇒ a few may overlap without cutting out
        const a = new Audio(`assets/audio/sfx/${filename}`);
        a.preload = 'auto';
        els.push(a);
      }
      p = { els, idx: 0 };
      this._pool.set(filename, p);
    }
    const a = p.els[p.idx];
    p.idx = (p.idx + 1) % p.els.length;
    return a;
  }

  /** Stop all currently playing one-shot sounds. */
  stopAll() {
    for (const a of this._active) {
      try { a.pause(); a.currentTime = 0; } catch (e) {}
    }
    this._active.clear();
    for (const p of this._pool.values()) {
      for (const a of p.els) { try { a.pause(); a.currentTime = 0; } catch (e) {} }
    }
    this.stopSpin();
    this.windStop();
  }

  /** Play a one-shot SFX that may overlap others. On touch this reuses a pooled,
      pre-decoded element to avoid the iOS multi-decode hitch. */
  _oneShot(filename, vol = 1.0) {
    if (!IS_TOUCH) return this._play(filename, vol, false);
    if (!this.enabled) return null;
    const a = this._poolGet(filename);
    a.volume = this._volume * vol;
    try { a.currentTime = 0; } catch (e) {}
    a.play().catch(() => {});
    return a;
  }

  // ── reels ──
  spinLever() { this._oneShot('spin_lever.mp3', 0.45); }
  startSpin() { if (this.enabled) { this.stopSpin(); this._spinAudio = this._play('reel_spin.mp3', 0.3, true); } }
  stopSpin() {
    if (this._spinAudio) { this._spinAudio.pause(); this._spinAudio.currentTime = 0; this._spinAudio = null; }
  }
  reelStop(index) {
    if (!this.enabled) return;
    const files = ['reel_stop_1.mp3','reel_stop_2.mp3','reel_stop_3.mp3','reel_stop_4.mp3','reel_stop_5.mp3'];
    this._oneShot(files[index] || files[0], 0.6);
  }
  anticipation() { this._oneShot('anticipation.mp3', 0.5); }

  // ── wins ──
  win(totalWin, bet) {
    if (!this.enabled) return;
    const ratio = totalWin / bet;
    if (ratio >= 8)      this._oneShot('win_big.mp3', 0.8);
    else if (ratio >= 3) this._oneShot('win_medium.mp3', 0.7);
    else                 this._oneShot('win_small.mp3', 0.6);
  }
  bonusSiren()  { this._oneShot('bonus_siren.mp3', 0.7); }
  bigWinAlarm() { this._oneShot('win_big.mp3', 0.9); }
  wildExpand()  { this._oneShot('wild_expand.mp3', 0.85); }
  boltLock()    { this._oneShot('bolt_lock.mp3', 0.7); }

  // ── wolf & houses ──
  wolfHuff()    { this._oneShot('wolf_huff.mp3', 0.8); }
  wolfHowl()    { this._oneShot('wolf_howl.mp3', 0.6); }

  // ── wind / tornado (the wolf's big blow in the bonus reveal) ──
  windStart()    { if (this.enabled) { this.windStop(); this._windAudio = this._play('wind_storm.mp3', 0.55, true); } }
  windStop()     { if (this._windAudio) { try { this._windAudio.pause(); this._windAudio.currentTime = 0; } catch (e) {} this._windAudio = null; } }
  windGust()     { this._oneShot('wind_gust.mp3', 0.5); }
  leavesRustle() { this._oneShot('leaves_rustle.mp3', 0.4); }
  strawBreak()  { this._oneShot('straw_break.mp3', 0.7); }
  stickBreak()  { this._oneShot('stick_break.mp3', 0.7); }
  brickImpact() { this._oneShot('brick_impact.mp3', 0.7); }
  brickLay()    { this._oneShot('brick_lay.mp3', 0.5); }
  /** A house frame being built as it upgrades: straw woven / wood nailed / brick laid. */
  frameBuild(tier) {
    if (!this.enabled) return;
    const files = { 1: 'frame_straw.mp3', 2: 'frame_wood.mp3', 3: 'frame_brick.mp3' };
    this._oneShot(files[tier] || files[1], 0.7);
  }
  /** The gust hitting a house: straw scatters, sticks crash, bricks hold firm. */
  houseBreak(tier) {
    if (!this.enabled) return;
    const files = { 1: 'straw_break.mp3', 2: 'stick_break.mp3', 3: 'brick_impact.mp3' };
    this._oneShot(files[tier] || files[1], 0.75);
  }
  houseAward(tier) {
    if (!this.enabled) return;
    const files = { 1: 'house_award_1.mp3', 2: 'house_award_2.mp3', 3: 'house_award_3.mp3' };
    this._oneShot(files[tier] || files[1], 0.6);
  }
  retriggerChime() { this._oneShot('retrigger_chime.mp3', 0.6); }
  mansionFanfare() { this._oneShot('mansion_fanfare.mp3', 0.8); }
  trainWhistle()   { this._oneShot('train_whistle.mp3', 0.7); }

  // ── coins ──
  coinTick() {
    if (!this.enabled) return;
    // The win count-up fires this every animation frame (~30% of frames). On touch
    // that's a burst of decodes; cap it to ~1 every 90ms so it stays a pleasant
    // patter without flooding the audio pipeline.
    if (IS_TOUCH) {
      const now = Date.now();
      if (now - this._lastTick < 90) return;
      this._lastTick = now;
    }
    const files = ['coin_clink_1.mp3', 'coin_clink_2.mp3'];
    this._oneShot(files[Math.floor(Math.random() * files.length)], 0.25);
  }
  coinClink() {
    if (!this.enabled) return;
    const files = ['coin_clink_1.mp3', 'coin_clink_2.mp3', 'coin_clink_3.mp3'];
    this._oneShot(files[Math.floor(Math.random() * files.length)], 0.35);
  }
  coinShower() { this._oneShot('coin_shower.mp3', 0.6); }

  // ── ui ──
  buttonClick() { this._oneShot('button_click.mp3', 0.3); }
  betChange()   { this._oneShot('bet_change.mp3', 0.3); }

  // ── volume ──
  toggle() { this.enabled = !this.enabled; return this.enabled; }
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._spinAudio) this._spinAudio.volume = this._volume * 0.3;
    if (this._windAudio) this._windAudio.volume = this._volume * 0.55;
  }
  getVolume() { return this._volume; }
}

/* ── Background music ──
   Two looping tracks that crossfade: a whimsical Western score for the base game
   and a bigger, more epic cinematic piece during the bonus. The bonus feature
   calls switchToBonus()/switchToBase(); everything else uses the same start/stop/
   setVolume API as before. */
class BGMusic {
  constructor() {
    this.tracks = {
      base:  new Audio('assets/audio/music/bgm_base.mp3'),
      bonus: new Audio('assets/audio/music/bgm_bonus.mp3'),
    };
    for (const a of Object.values(this.tracks)) { a.loop = true; a.volume = 0; }
    // base music is wanted right away; the bonus track is rare — don't eager-load
    // it (≈2.4 MB), it's warmed in the background by lazy-assets.js instead.
    this.tracks.base.preload = 'auto';
    this.tracks.bonus.preload = 'none';
    this.current = 'base';
    this.playing = false;
    this._volume = 0.5;        // 0..1 (user-facing)
    this._fadeTimer = null;
  }

  get audio() { return this.tracks[this.current]; }   // back-compat accessor

  // 0.5 multiplier keeps music under the SFX
  _effective() { return Math.max(0, Math.min(1, this._volume * 0.5)); }

  /** Crossfade: ramp `targetName` up to volume, everything else down to 0. */
  _fadeTo(targetName, ms = 800) {
    if (this._fadeTimer) clearInterval(this._fadeTimer);
    const target = this._effective();
    const steps = Math.max(1, Math.round(ms / 40));
    const start = {};
    for (const [name, a] of Object.entries(this.tracks)) start[name] = a.volume;
    let i = 0;
    this._fadeTimer = setInterval(() => {
      const t = ++i / steps;
      for (const [name, a] of Object.entries(this.tracks))
        a.volume = start[name] + ((name === targetName ? target : 0) - start[name]) * t;
      if (i >= steps) {
        clearInterval(this._fadeTimer); this._fadeTimer = null;
        for (const [name, a] of Object.entries(this.tracks)) if (name !== targetName) a.pause();
      }
    }, 40);
  }

  /**
   * Try to start playback of the current track.
   * @returns {Promise<boolean>} true if it actually started, false if the
   *   browser blocked autoplay (caller keeps the gesture fallback armed).
   */
  start() {
    if (this.playing) return Promise.resolve(true);
    this.playing = true;                 // optimistic guard against re-entrancy
    const a = this.tracks[this.current];
    a.volume = 0;
    const p = a.play();
    if (p) {
      return p.then(() => { this._fadeTo(this.current); return true; }).catch(err => {
        console.warn('[BGM] Play blocked:', err.message, '— will retry on next interaction');
        this.playing = false;
        return false;
      });
    }
    this._fadeTo(this.current);
    return Promise.resolve(true);
  }

  /** Crossfade to a different track (base ⇄ bonus). */
  switchTo(name, ms = 1200) {
    if (!this.tracks[name] || this.current === name) { this.current = name; return; }
    this.current = name;
    if (!this.playing) return;           // start() will pick up the new current track
    const a = this.tracks[name];
    try { a.currentTime = 0; } catch (e) {}
    a.volume = 0;
    a.play().catch(() => {});
    this._fadeTo(name, ms);
  }
  switchToBonus(ms) { this.switchTo('bonus', ms); }
  switchToBase(ms)  { this.switchTo('base', ms); }

  /**
   * Silence the music while a cutscene with its own audio plays (e.g. the bonus
   * intro video), without forgetting that it was playing. A later switchTo()/
   * start() resumes cleanly. If music was off (muted), this stays a no-op.
   */
  pauseForCutscene() {
    if (this._fadeTimer) { clearInterval(this._fadeTimer); this._fadeTimer = null; }
    for (const a of Object.values(this.tracks)) a.pause();   // `playing` stays as-is
  }

  /** Resume the current track after a cutscene that called pauseForCutscene(). */
  resumeFromCutscene(ms = 600) {
    if (!this.playing) return;            // music was off — leave it off
    const a = this.tracks[this.current];
    a.play().catch(() => {});
    this._fadeTo(this.current, ms);
  }

  stop() {
    this.playing = false;
    if (this._fadeTimer) { clearInterval(this._fadeTimer); this._fadeTimer = null; }
    for (const a of Object.values(this.tracks)) { a.pause(); a.currentTime = 0; a.volume = 0; }
  }
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (!this._fadeTimer && this.playing) this.tracks[this.current].volume = this._effective();
  }
  getVolume() { return this._volume; }
  isPlaying() { return this.playing; }
}

const synth = new Synth();
const bgm = new BGMusic();

Object.assign(exports, { synth, bgm });

  };

  __mods["state"] = function (exports, require) {
/**
 * @module state
 * @description Shared, mutable runtime state for the base game.
 *
 * ES module imports are read-only *bindings*, so modules can't reassign each
 * other's `let` variables. Instead we export one plain object and everyone reads
 * and writes its properties — that mutation is visible everywhere. Bonus-only
 * state lives privately inside bonus.js; this is just the cross-module stuff.
 */

const { DEFAULT_BALANCE, DEFAULT_BET_INDEX, ACTIVE_MODEL_ID } = require("par-sheet");

const state = {
  balance: DEFAULT_BALANCE,   // player's cash
  betIndex: DEFAULT_BET_INDEX, // index into BET_LEVELS
  spinning: false,            // a base-game spin is animating
  turbo: false,               // turbo (fast spin) toggle
  autoActive: false,          // auto-spin is on
  autoTimer: null,            // setTimeout handle for auto-spin
  currentGrid: null,          // the symbols currently shown (for spin scroll buffer)
  musicAutoStarted: false,    // background music has been kicked off
  rtpModelId: ACTIVE_MODEL_ID,   // the RTP math model the game is currently running (see par-sheet.js)
  forceExtremeNextSpin: false,   // dev tool to force extreme anticipation on next spin
  forceWildNextSpin: false,      // dev tool to force an expanding Wolf Wild on next spin
};

Object.assign(exports, { state });

  };

  __mods["utils"] = function (exports, require) {
/**
 * @module utils
 * @description Shared utility functions used across multiple modules.
 */

/**
 * Async sleep — pauses execution for the given duration.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format a number as $X,XXX.XX currency string.
 * @param {number} n - The amount to format
 * @returns {string}
 */
function fmt(n) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Schedule DOM element removal after a delay.
 * Safely checks parentNode before removing.
 * @param {HTMLElement} el - Element to remove
 * @param {number} ms - Delay in milliseconds
 */
function scheduleRemove(el, ms) {
  setTimeout(() => { if (el.parentNode) el.remove(); }, ms);
}

Object.assign(exports, { sleep, fmt, scheduleRemove });

  };

  __mods["base-game"] = function (exports, require) {
/**
 * @module base-game
 * @description The normal spin: take the bet, spin the reels, then present the
 * result (loss, small/medium/big/mega win, or bonus trigger). Also handles the
 * bet +/- buttons, turbo toggle, auto-spin, and the spin keyboard shortcuts.
 * Wins are computed by mathcore; this file is presentation + flow.
 */

const { BET_LEVELS, WILD_ID, WIN_TIERS } = require("par-sheet");
const { DEV_MODE } = require("dev-mode");
const { state } = require("state");
const { sleep, fmt } = require("utils");
const { synth } = require("sound");
const { narrator } = require("narrator");
const { generateGrid, evaluateGrid, countHats, shouldAnticipate, shouldExtremeAnticipate, expandWilds } = require("mathcore");
const { animateReel, getReelStrips, highlightWinners, clearHighlights, animateWinCount, expandWildReel } = require("reels");
const {
  spawnStarbursts, spawnSideWaterfall, spawnWinVignette, spawnWinPopText,
  playWinPresentation, spawnSparkles
} = require("particles");
const { setStatus, updateDisplays, elWin, buttons, stopAuto } = require("readouts");
const { startBonus, isBonusActive } = require("bonus");

const cabinet    = document.getElementById('cabinet');
const winFlash   = document.getElementById('win-flash');
const bigWinOver = document.getElementById('big-win-overlay');
const bigWinLabel = document.getElementById('big-win-label');
const bigWinAmt  = document.getElementById('big-win-amount');
const spinVideo  = document.getElementById('spin-video');   // animated SPIN badge

const shake = ms => { cabinet.classList.add('screen-shake'); setTimeout(() => cabinet.classList.remove('screen-shake'), ms); };

/* Win-celebration banners, biggest first. `min` is the win÷bet threshold (from
   WIN_TIERS), `cls` the label style ('' = the base BIG-WIN gold look), `heavy`
   selects the louder coin/fanfare presentation, `count`/`hold` are the count-up
   and on-screen durations (ms). One table drives both the live win and the dev
   preview, so they always match. */
const WIN_BANNERS = [
  { key: 'colossal', min: WIN_TIERS.colossal, label: 'Wild Wolf Windfall!', cls: 'colossal-win', heavy: true,  count: 3600, hold: 5000 },
  { key: 'epic',     min: WIN_TIERS.epic,     label: 'Big Bad Wolf Win!',   cls: 'epic-win',     heavy: true,  count: 3200, hold: 4500 },
  { key: 'mega',     min: WIN_TIERS.mega,     label: 'Big Bad Win!',        cls: 'mega-win',     heavy: true,  count: 2500, hold: 3800 },
  { key: 'big',      min: WIN_TIERS.big,      label: 'Big Win',             cls: '',             heavy: false, count: 1800, hold: 3500 },
];
const bannerForRatio = r => WIN_BANNERS.find(b => r >= b.min);     // highest tier reached (or undefined)

// Rest the badge on its first frame; replay it from the start on each spin.
if (spinVideo) {
  spinVideo.addEventListener('loadeddata', () => { try { spinVideo.currentTime = 0; } catch (e) {} });
  spinVideo.addEventListener('ended', () => { try { spinVideo.pause(); spinVideo.currentTime = 0; } catch (e) {} });
}
function playSpinBadge() {
  if (spinVideo) { try { spinVideo.currentTime = 0; spinVideo.play().catch(() => {}); } catch (e) {} }
}

/* ══════════════════════════════════════════
   SPIN
══════════════════════════════════════════ */
function triggerSpin() {
  if (state.spinning || isBonusActive()) return;

  const bet = BET_LEVELS[state.betIndex];
  if (state.balance < bet) {
    setStatus('INSUFFICIENT FUNDS!', 'error');
    narrator.onInsufficientFunds();
    stopAuto();
    return;
  }

  state.spinning = true;
  state.balance -= bet;
  elWin.textContent = '$0.00';
  elWin.classList.remove('win-glow');
  updateDisplays();
  setStatus('SPINNING…');
  bigWinOver.classList.add('hidden');
  clearHighlights();

  buttons.spin.disabled = buttons.betUp.disabled = buttons.betDown.disabled = true;

  synth.spinLever();
  synth.startSpin();
  playSpinBadge();
  narrator.onSpin();
  if (state.balance < bet * 3) narrator.onLowBalance();

  const targetGrid = generateGrid();
  
  if (state.forceExtremeNextSpin) {
    state.forceExtremeNextSpin = false;
    targetGrid[0][0] = 'hat-yellow';
    targetGrid[1][0] = 'hat-yellow';
    targetGrid[2][0] = 'hat-yellow';
    targetGrid[3][0] = 'hat-yellow';
    targetGrid[3][1] = 'hat-yellow';
    for (let i = 0; i < 3; i++) {
      if (targetGrid[4][i].startsWith('hat')) targetGrid[4][i] = 'royal-a';
    }
  }

  // gaff: force an expanding Wolf Wild onto the center reel this spin
  if (state.forceWildNextSpin) {
    state.forceWildNextSpin = false;
    targetGrid[2][1] = WILD_ID;   // one wild on the center reel → it fills the whole reel
  }

  const anticipate = shouldAnticipate(targetGrid);
  const extremeAnticipate = shouldExtremeAnticipate(targetGrid);

  let stopped = 0;
  for (let r = 0; r < 5; r++) {
    // Pass extremeAnticipate flag to reel 4 (the 5th reel)
    const isExtreme = extremeAnticipate && r === 4;
    animateReel(r, targetGrid[r], () => { if (++stopped === 5) finalizeSpin(targetGrid, bet); }, anticipate, isExtreme);
  }
}

async function finalizeSpin(targetGrid, bet) {
  synth.stopSpin();

  // Expanding Wolf Wild: any reel that landed a wild fills with wilds (hats kept).
  // Animate the expansion before anything pays, and evaluate the expanded screen.
  const { grid: shownGrid, wildReels } = expandWilds(targetGrid);
  state.currentGrid = shownGrid;
  const reelStrips = getReelStrips();
  if (wildReels.length > 0) {
    synth.wolfHowl();
    setStatus(wildReels.length > 1 ? 'WOLF WILDS!' : 'WOLF WILD!', 'win');
    narrator.onExpandingWilds(wildReels.length);
    wildReels.forEach(r => expandWildReel(r, shownGrid[r]));
    await sleep(750);
  }

  // bonus trigger takes priority over line wins (hats survive the wild expansion)
  const { count: hatCount, hatCells } = countHats(shownGrid);
  if (hatCount >= 6) {
    hatCells.forEach(([r, row]) => {
      const cell = reelStrips[r].querySelectorAll('.sym-cell')[row];
      if (cell) cell.classList.add('is-winner');
    });
    shake(600);
    playWinPresentation(WIN_TIERS.big, false); // big-win-level celebration for the bonus trigger
    spawnWinVignette(); spawnStarbursts(hatCells);
    narrator.onBonusTrigger();
    state.spinning = false;
    await sleep(800);
    startBonus(bet, targetGrid);
    return;
  }

  const { totalWin, winners } = evaluateGrid(targetGrid, bet);

  if (totalWin > 0) {
    highlightWinners(winners);
    spawnWinVignette();
    winFlash.classList.remove('hidden');
    setTimeout(() => winFlash.classList.add('hidden'), 500);
    cabinet.classList.add('win-flash-active');
    setTimeout(() => cabinet.classList.remove('win-flash-active'), 500);
    spawnStarbursts(winners.flatMap(w => w.cells));
    spawnWinPopText(totalWin);

    const ratio = totalWin / bet;
    if (ratio >= WIN_TIERS.big) {
      const b = bannerForRatio(ratio);                  // BIG / MEGA / EPIC / COLOSSAL
      bigWinLabel.textContent = b.label;
      bigWinLabel.className = b.cls;                     // '' keeps the base BIG-WIN gold style
      shake(b.heavy ? 900 : 600);
      playWinPresentation(ratio, b.heavy);
      synth.bigWinAlarm();
      narrator.onWin(totalWin, bet);
      await animateWinCount(totalWin, b.count);
      bigWinAmt.textContent = fmt(totalWin);
      bigWinOver.classList.remove('hidden');
      state.balance += totalWin;
      updateDisplays();
      setStatus(`YOU WON ${fmt(totalWin)}!`, 'win');
      setTimeout(() => bigWinOver.classList.add('hidden'), b.hold);
    } else if (ratio >= WIN_TIERS.nice) {
      playWinPresentation(ratio);
      synth.win(totalWin, bet);
      narrator.onWin(totalWin, bet);
      await animateWinCount(totalWin, 1000);
      state.balance += totalWin;
      updateDisplays();
      setStatus(`YOU WON ${fmt(totalWin)}!`, 'win');
    } else {
      playWinPresentation(ratio);
      synth.win(totalWin, bet);
      narrator.onWin(totalWin, bet);
      await animateWinCount(totalWin, 800);
      state.balance += totalWin;
      updateDisplays();
      setStatus(`YOU WON ${fmt(totalWin)}!`, 'win');
    }
  } else {
    setStatus('GOOD LUCK – PRESS SPIN!');
    narrator.onReelsSettled();   // symbol-aware flavor (shot glass / horseshoe / hats) on a no-win spin
    narrator.onLoss();
  }

  // unlock (auto-spin continues, otherwise re-enable buttons)
  const delay = totalWin > 0 ? (totalWin / bet >= 8 ? 3800 : 1200) : 350;
  setTimeout(() => {
    state.spinning = false;
    if (state.autoActive) {
      state.autoTimer = setTimeout(triggerSpin, state.turbo ? 500 : 1400);
    } else {
      buttons.spin.disabled = buttons.betUp.disabled = buttons.betDown.disabled = false;
    }
  }, delay);
}

/**
 * DEV preview: replay a win celebration banner on demand (banner, shake, coins,
 * fanfare) WITHOUT changing the balance or touching spin state — so the team can
 * review how each tier looks. Amount shown = the tier's threshold × the current
 * bet. Wired to the dev "WINS" panel; uses the same WIN_BANNERS table as live play.
 * @param {'big'|'mega'|'epic'|'colossal'} tier
 */
function previewWin(tier) {
  if (state.spinning) return;                       // don't collide with a live spin
  const b = WIN_BANNERS.find(x => x.key === tier);
  if (!b) return;
  const amount = b.min * (BET_LEVELS[state.betIndex] || 1);

  bigWinLabel.textContent = b.label;
  bigWinLabel.className = b.cls;
  bigWinAmt.textContent = fmt(amount);
  shake(b.heavy ? 900 : 600);
  spawnWinVignette();
  playWinPresentation(b.min, b.heavy);               // coins / sparkles / fanfare particles
  synth.bigWinAlarm();
  bigWinOver.classList.remove('hidden');
  clearTimeout(previewWin._t);
  previewWin._t = setTimeout(() => bigWinOver.classList.add('hidden'), b.hold);
}

/* ══════════════════════════════════════════
   AUTO-SPIN  (stopAuto lives in ui.js)
══════════════════════════════════════════ */
function startAuto() {
  state.autoActive = true;
  buttons.auto.textContent = 'STOP';
  buttons.auto.classList.add('is-active');
  if (!state.spinning && !isBonusActive()) triggerSpin();
}

/* ══════════════════════════════════════════
   CONTROL WIRING
══════════════════════════════════════════ */
buttons.spin.addEventListener('click', () => { if (!state.spinning && !isBonusActive()) triggerSpin(); });

// Razz the player if the MOUSE lingers over SPIN 3s+ without clicking (desktop only).
if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
  let hoverTimer = null;
  const clearHover = () => { if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; } };
  buttons.spin.addEventListener('mouseenter', () => {
    clearHover();
    if (buttons.spin.disabled || state.spinning || isBonusActive()) return;
    hoverTimer = setTimeout(() => {
      if (!buttons.spin.disabled && !state.spinning && !isBonusActive()) narrator.onSpinHover();
    }, 3000);
  });
  buttons.spin.addEventListener('mouseleave', clearHover);
  buttons.spin.addEventListener('pointerdown', clearHover);   // they're clicking → no taunt
}

buttons.betUp.addEventListener('click', () => {
  if (state.spinning || isBonusActive()) return;
  state.betIndex = Math.min(BET_LEVELS.length - 1, state.betIndex + 1);
  updateDisplays();
  synth.betChange();
  if (state.betIndex === BET_LEVELS.length - 1) narrator.onMaxBet();   // hit the ceiling → special line
  else narrator.onBetChange('up');
});

buttons.betDown.addEventListener('click', () => {
  if (state.spinning || isBonusActive()) return;
  state.betIndex = Math.max(0, state.betIndex - 1);
  updateDisplays();
  synth.betChange();
  narrator.onBetChange('down');
});

buttons.auto.addEventListener('click', () => {
  if (isBonusActive()) return;
  if (state.autoActive) stopAuto(); else startAuto();
});

const chkTurbo = document.getElementById('chk-turbo');
if (chkTurbo) chkTurbo.addEventListener('change', () => { state.turbo = chkTurbo.checked; });

// Keyboard shortcuts are centralised in src/system/shortcuts.js (they drive these
// same buttons), so there's no per-key handler here anymore.

const btnForceExtreme = document.getElementById('btn-force-extreme');
if (btnForceExtreme) {
  btnForceExtreme.addEventListener('click', () => {
    if (state.spinning || isBonusActive()) return;
    state.forceExtremeNextSpin = true;
    triggerSpin();
  });
}

// gaff: arm a forced Wolf Wild and spin straight away so it shows itself off
const btnForceWild = document.getElementById('btn-force-wild');
if (btnForceWild) {
  btnForceWild.addEventListener('click', () => {
    if (state.spinning || isBonusActive()) return;
    state.forceWildNextSpin = true;
    triggerSpin();
  });
}

const vlrMedallion = document.getElementById('vlr-medallion');
if (vlrMedallion) {
  vlrMedallion.addEventListener('click', () => {
    // Jump animation
    vlrMedallion.classList.remove('medallion-jump');
    void vlrMedallion.offsetWidth; // trigger reflow
    vlrMedallion.classList.add('medallion-jump');
    
    // Sparks
    const rect = vlrMedallion.getBoundingClientRect();
    const particleContainer = document.getElementById('particle-container');
    const cRect = particleContainer.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - cRect.left;
    const y = rect.top + rect.height / 2 - cRect.top;
    spawnSparkles(x, y, 15);
    
    // Sound
    synth.buttonClick();
  });
}

Object.assign(exports, { triggerSpin, previewWin, startAuto });

  };

  __mods["bonus"] = function (exports, require) {
/**
 * @module bonus
 * @description The Hard Hat Free Spins feature — the whole show:
 *   1. trigger intro  →  2. free spins that build straw/stick/brick houses
 *   →  3. the wolf blows each house down for a prize  →  4. mansion jackpot for
 *   3+ bricks  →  5. pay out the total.
 *
 * Award magnitudes come from BONUS_CONFIG via mathcore's rollHouseAward /
 * rollMansionAward, so this file controls the *show* and mathcore controls the
 * *money* (kept identical to the headless simulateBonusOutcome).
 */

const { HAT_IDS, MAX_FRAME_TIER, BONUS_CONFIG, BET_LEVELS } = require("par-sheet");
const { DEV_MODE } = require("dev-mode");
const { alphaSrc, IS_MOBILE } = require("video-format");   // WebM → HEVC-alpha .mp4 on Safari
const { state } = require("state");
const { sleep, fmt } = require("utils");
const { synth, bgm } = require("sound");
const { narrator } = require("narrator");
const { generateGrid, evaluateGrid, rollHouseAward, rollMansionAward, expandWilds } = require("mathcore");
const { animateAllReels, highlightWinners, clearHighlights, animateWinCount, getReelStrips, expandWildReel } = require("reels");
const {
  spawnCoinShower, spawnCoinFountain, spawnDollarBills, spawnConfetti, spawnSparkles,
  spawnStarbursts, spawnWinVignette, spawnWinPopText,
  playWinPresentation, startWindStorm
} = require("particles");
const { setStatus, updateDisplays, setControlsEnabled, stopAuto, elWin } = require("readouts");

/* ── DOM ── */
const cabinet         = document.getElementById('cabinet');
const particleContainer = document.getElementById('particle-container');
const bonusHud        = document.getElementById('bonus-hud');
const bonusOverlay    = document.getElementById('bonus-overlay');
const bonusTitle      = document.getElementById('bonus-title');
const bonusPhaseLabel = document.getElementById('bonus-phase-label');
const bonusSpinsLeft  = document.getElementById('bonus-spins-left');
const bonusWinDisplay = document.getElementById('bonus-win-display');
const mansionOverlay  = document.getElementById('mansion-overlay');
const mansionPoster   = document.getElementById('mansion-poster');   // Wanted-poster reveal video
const wolfTornadoOverlay = document.getElementById('wolf-tornado-overlay');
const wolfTornadoVideo   = document.getElementById('wolf-tornado-video');
const bigWinOver      = document.getElementById('big-win-overlay');
const bigWinLabel     = document.getElementById('big-win-label');
const bigWinAmt       = document.getElementById('big-win-amount');
const bonusIntroOverlay = document.getElementById('bonus-intro-overlay');
const bonusIntroVideo   = document.getElementById('bonus-intro-video');

/* ── bonus-only state ── */
let bonusActive    = false;
let bonusFreeSpins = 0;
let bonusTotalWin  = 0;
let bonusBet       = 0;
let frameTiers     = makeGrid();
let prevFrameTiers = makeGrid();

function makeGrid() { return Array.from({ length: 5 }, () => [0, 0, 0]); }
function isBonusActive() { return bonusActive; }

/**
 * Bonus intro video, contained inside the reel window. Resolves when it ends, is
 * clicked (skip), errors, or hits a safety timeout — so the bonus can never get
 * stuck behind it.
 */
function playBonusIntro() {
  return new Promise(resolve => {
    if (!bonusIntroOverlay || !bonusIntroVideo) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      bonusIntroOverlay.classList.add('fade-out');
      try { bonusIntroVideo.pause(); } catch (e) {}
      setTimeout(() => {
        bonusIntroOverlay.classList.add('hidden');
        bonusIntroOverlay.classList.remove('fade-out');
        resolve();
      }, 500);
    };
    bonusIntroVideo.addEventListener('ended', finish, { once: true });
    bonusIntroVideo.addEventListener('error', finish, { once: true });
    bonusIntroOverlay.addEventListener('click', finish, { once: true });
    bonusIntroOverlay.classList.remove('hidden');
    try { bonusIntroVideo.currentTime = 0; } catch (e) {}
    // Try with sound (the player has already interacted); fall back to muted so it always shows.
    bonusIntroVideo.muted = false;
    bonusIntroVideo.play().catch(() => {
      bonusIntroVideo.muted = true;
      bonusIntroVideo.play().catch(finish);
    });
    setTimeout(finish, 30000);   // hard safety cap
  });
}

/**
 * Wolf-blow video (the tornado huff). Plays once, contained inside the reel
 * window — same containment as the bonus intro. Resolves when it ends, is
 * errors, or hits a safety timeout, then fades out. Not click-skippable — it's
 * the climactic blow, so it always plays through.
 */
function playWolfTornado() {
  return new Promise(resolve => {
    if (!wolfTornadoOverlay || !wolfTornadoVideo) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      wolfTornadoOverlay.classList.add('fade-out');
      try { wolfTornadoVideo.pause(); } catch (e) {}
      setTimeout(() => {
        wolfTornadoOverlay.classList.add('hidden');
        wolfTornadoOverlay.classList.remove('fade-out');
        resolve();
      }, 500);
    };
    wolfTornadoVideo.addEventListener('ended', finish, { once: true });
    wolfTornadoVideo.addEventListener('error', finish, { once: true });
    // NB: no click-to-skip here — this is the climactic "can the wolf blow the
    // house down?" moment, so a stray click on the reels must not dismiss it.
    wolfTornadoOverlay.classList.remove('hidden');
    try { wolfTornadoVideo.currentTime = 0; } catch (e) {}
    // Try with sound; fall back to muted so it always shows.
    wolfTornadoVideo.muted = false;
    wolfTornadoVideo.play().catch(() => {
      wolfTornadoVideo.muted = true;
      wolfTornadoVideo.play().catch(finish);
    });
    setTimeout(finish, 12000);                     // hard safety cap
  });
}

/* ══════════════════════════════════════════
   ENTRY
══════════════════════════════════════════ */
async function startBonus(bet, triggerGrid) {
  stopAuto();
  bonusActive = true;
  bonusFreeSpins = BONUS_CONFIG.freeSpins;
  bonusTotalWin = 0;
  bonusBet = bet;
  frameTiers = makeGrid();
  prevFrameTiers = makeGrid();
  setControlsEnabled(false);

  // silence the base music so it doesn't clash with the intro video's own audio
  bgm.pauseForCutscene();
  synth.stopAll();
  narrator.stop();

  // bonus intro video plays inside the reel window as soon as the bonus triggers
  await playBonusIntro();

  // music comes back right away (skip or finish) as the bigger, epic bonus score
  bgm.switchToBonus(700);

  // trigger hats become the first straw frames
  const triggerUpgrades = [];
  for (let r = 0; r < 5; r++)
    for (let row = 0; row < 3; row++)
      if (HAT_IDS.includes(triggerGrid[r][row])) {
        const old = frameTiers[r][row];
        frameTiers[r][row] = Math.min(old + 1, MAX_FRAME_TIER);
        if (frameTiers[r][row] > old) triggerUpgrades.push({ reel: r, row, tier: frameTiers[r][row] });
      }

  synth.bonusSiren();
  showBonusOverlay('BONUS REEL FEATURE!', 'FREE SPINS STARTING');
  narrator.onBonusEnter();   // "Bonus round, partner…" once the title is up
  if (bonusHud) bonusHud.classList.remove('hidden');
  shake(600);
  await sleep(2800);
  hideBonusOverlay();

  renderFrameLayers();
  updateBonusHUD();
  await animateFrameUpgrades(triggerUpgrades);   // play the straw-frame morph on the trigger cells
  await runFreeSpins();
}

/* ══════════════════════════════════════════
   FREE SPINS
══════════════════════════════════════════ */
async function runFreeSpins() {
  const reelStrips = getReelStrips();
  while (bonusFreeSpins > 0) {
    bonusFreeSpins--;
    updateBonusHUD();
    setStatus(`FREE SPIN — ${bonusFreeSpins + 1} remaining`, 'win');
    narrator.onFreeSpin();
    await sleep(600);

    const targetGrid = generateGrid();
    synth.startSpin();
    await animateAllReels(targetGrid);
    synth.stopSpin();

    // expanding wilds during free spins too
    const { grid: shownGrid, wildReels } = expandWilds(targetGrid);
    state.currentGrid = shownGrid;
    if (wildReels.length > 0) {
      synth.wolfHowl();
      wildReels.forEach(r => expandWildReel(r, shownGrid[r]));
      await sleep(650);
    }

    // line wins still pay during free spins
    const { totalWin, winners } = evaluateGrid(shownGrid, bonusBet);
    if (totalWin > 0) {
      highlightWinners(winners);
      synth.win(totalWin, bonusBet);
      bonusTotalWin += totalWin;
      spawnWinVignette();
      spawnStarbursts(winners.flatMap(w => w.cells));
      spawnWinPopText(totalWin);
      const ratio = totalWin / bonusBet;
      if (ratio > 0) {
        playWinPresentation(ratio, false);
      }
      await animateWinCount(bonusTotalWin, 600);
      updateBonusHUD();
      await sleep(400);
      clearHighlights();
    }

    // hats upgrade houses; track new bricks
    let newHats = 0;
    const newBrickCells = [];
    const upgradedCells = [];
    for (let r = 0; r < 5; r++)
      for (let row = 0; row < 3; row++)
        if (HAT_IDS.includes(targetGrid[r][row])) {
          const old = frameTiers[r][row];
          frameTiers[r][row] = Math.min(old + 1, MAX_FRAME_TIER);
          newHats++;
          if (frameTiers[r][row] > old) upgradedCells.push({ reel: r, row, tier: frameTiers[r][row] });
          if (old === 2 && frameTiers[r][row] === 3) newBrickCells.push({ reel: r, row });
        }
    renderFrameLayers();
    await animateFrameUpgrades(upgradedCells);   // morph each upgraded house in place (straw/wood/brick)

    if (newHats > 0) {
      if (newBrickCells.length > 0) narrator.onFrameUpgrade(3);
      else narrator.onFrameUpgrade(Math.min(frameTiers.flat().filter(t => t > 0).slice(-1)[0] || 1, 2));
    }

    const brickCount = countBrickFrames();
    if (brickCount >= BONUS_CONFIG.mansion.minBricks && newBrickCells.length > 0) {
      await triggerMansionsJackpot(brickCount);
    }

    if (newHats >= BONUS_CONFIG.retriggerHats) {
      bonusFreeSpins += BONUS_CONFIG.retriggerSpins;
      synth.retriggerChime();
      narrator.onRetrigger();
      setStatus(`+1 FREE SPIN RETRIGGER! (${newHats} Hats)`, 'win');
      showBonusOverlay('+1 FREE SPIN!', 'RETRIGGER');
      spawnCoinShower(15, 1500);
      await sleep(1800);
      hideBonusOverlay();
    }

    updateBonusHUD();
    await sleep(400);
  }
  await wolfEndGameReveal();
}

/* ══════════════════════════════════════════
   WOLF REVEAL — pay out every house
══════════════════════════════════════════ */
async function wolfEndGameReveal() {
  const reelStrips = getReelStrips();
  setStatus('THE WOLF IS COMING...', 'win');
  narrator.onWolfReveal();
  cabinet.classList.add('wolf-reveal-active');

  // the wolf huffs & puffs — tornado video plays contained inside the reel window
  bgm.pauseForCutscene();
  synth.stopAll();
  narrator.stop();
  await playWolfTornado();
  bgm.resumeFromCutscene(400);

  const framedCells = [];
  for (let r = 0; r < 5; r++)
    for (let row = 0; row < 3; row++)
      if (frameTiers[r][row] > 0) framedCells.push({ reel: r, row, tier: frameTiers[r][row] });
  framedCells.sort((a, b) => a.tier - b.tier);   // straw first

  // The blow becomes a screen-wide tornado: wind, leaves and debris everywhere
  // while each house is tested by it (straw/wood scatter, brick stands firm).
  const storm = framedCells.length ? startWindStorm() : null;
  let gustTimer, leafTimer, shakeTimer;
  if (storm) {
    synth.windStart();
    synth.windGust();
    gustTimer  = setInterval(() => synth.windGust(), 2300);
    leafTimer  = setInterval(() => synth.leavesRustle(), 1500);
    shakeTimer = setInterval(() => shake(220), 1900);   // periodic gusts rattle the cabinet
  }

  for (const { reel, row, tier } of framedCells) {
    const cellEl = reelStrips[reel].querySelectorAll('.sym-cell')[row];
    if (!cellEl) continue;
    const slot = frameSlotFor(reel, row, false);   // the persistent locked frame

    narrator.onWolfBlow(tier);

    cellEl.classList.add('bonus-shake');
    if (slot) slot.classList.add('bonus-shake');   // the locked frame rattles, then breaks
    synth.houseBreak(tier);          // straw scatters / sticks crash / bricks hold
    if (tier === 3) shake(600);
    await sleep(800);
    cellEl.classList.remove('bonus-shake');
    removeFrameSlot(reel, row);                     // house blown down — the frame is gone

    // award (formula from mathcore; presentation here)
    const { amount, isJackpot } = rollHouseAward(tier, bonusBet);
    const award = Math.round(amount * 100) / 100;
    if (isJackpot && tier === 2) {
      setStatus('⭐ MINI JACKPOT! ⭐', 'win'); narrator.onMiniJackpot(); playWinPresentation(3);
    } else if (isJackpot && tier === 3) {
      setStatus('🏆 MINOR JACKPOT! 🏆', 'win'); narrator.onMiniJackpot(); shake(600); playWinPresentation(8);
    } else if (tier === 3) {
      spawnCoinShower(20, 1500);
    }

    updateCellToHouse(cellEl, tier);
    synth.houseAward(tier);
    sparkleAt(cellEl, 12);

    bonusTotalWin += award;
    setStatus(`${['', 'STRAW', 'STICK', 'BRICK'][tier]} HOUSE → ${fmt(award)}`, 'win');
    await animateWinCount(bonusTotalWin, 500);
    updateBonusHUD();
    await sleep(800);
  }

  // the storm dies down once every house has been tested
  if (storm) {
    clearInterval(gustTimer); clearInterval(leafTimer); clearInterval(shakeTimer);
    synth.windStop();
    storm.stop();
  }

  cabinet.classList.remove('wolf-reveal-active');
  await endBonus();
}

/* ══════════════════════════════════════════
   MANSION JACKPOT
══════════════════════════════════════════ */
async function triggerMansionsJackpot(brickCount) {
  setStatus('⭐ WANTED REWARD! ⭐', 'win');
  shake(600);
  synth.trainWhistle();         // the reward train rolls in…
  synth.coinShower();
  narrator.onMansionJackpot();  // "Congratulations, partner! You just won the Wanted Reward!"
  showMansionOverlay();
  spawnCoinShower(40, 3000);
  await sleep(3000);
  hideMansionOverlay();

  const award = Math.round(rollMansionAward(brickCount, bonusBet) * 100) / 100;
  bonusTotalWin += award;
  setStatus(`⭐ WANTED REWARD: ${fmt(award)}! ⭐`, 'win');
  bigWinLabel.textContent = 'WANTED ⭐ REWARD!';
  bigWinLabel.className = '';   // clear any base-game tier class (mega/epic/colossal)
  bigWinAmt.textContent = fmt(award);
  bigWinOver.classList.remove('hidden');
  shake(600);
  spawnCoinShower(60, 4000);
  await animateWinCount(bonusTotalWin, 2000);
  updateBonusHUD();
  await sleep(3500);
  bigWinOver.classList.add('hidden');
}

/* ── Dev-only: preview the Mansion feature without playing a whole bonus ──
   Runs the exact MANSIONS overlay → jackpot big-win presentation with a sample
   award (scaled to the current bet), then cleans up. Does NOT touch the player's
   balance or any real bonus state. Wired to the dev "🏰 Mansion Feature" button. */
async function demoMansion() {
  if (bonusActive || state.spinning) return;          // never collide with live play

  const bet = BET_LEVELS[state.betIndex] || 1;
  const brickCount = BONUS_CONFIG.mansion.minBricks + 2;   // a healthy 5-brick board
  const award = Math.round(rollMansionAward(brickCount, bet) * 100) / 100;

  state.spinning = true;                               // lock the controls during the show
  setControlsEnabled(false);

  // Beat 1 — the WANTED REWARD overlay
  setStatus('⭐ WANTED REWARD! ⭐', 'win');
  shake(600);
  synth.trainWhistle();
  synth.coinShower();
  narrator.onMansionJackpot();  // "Congratulations, partner! You just won the Wanted Reward!"
  showMansionOverlay();
  spawnCoinShower(40, 3000);
  await sleep(3000);
  hideMansionOverlay();

  // Beat 2 — the reward big-win count-up
  setStatus(`⭐ WANTED REWARD: ${fmt(award)}! ⭐`, 'win');
  bigWinLabel.textContent = 'WANTED ⭐ REWARD!';
  bigWinLabel.className = '';
  bigWinAmt.textContent = fmt(award);
  bigWinOver.classList.remove('hidden');
  shake(600);
  spawnCoinShower(60, 4000);
  await animateWinCount(award, 2000);
  await sleep(3000);
  bigWinOver.classList.add('hidden');

  // Clean up — it was only a preview, so leave balance/win untouched.
  elWin.textContent = fmt(0);
  setStatus('GOOD LUCK – PRESS SPIN!');
  state.spinning = false;
  setControlsEnabled(true);
}

// Dev "🏰 Mansion Feature" button → play the preview on demand.
const btnDemoMansion = document.getElementById('btn-demo-mansion');
if (btnDemoMansion) btnDemoMansion.addEventListener('click', () => demoMansion());

/* ══════════════════════════════════════════
   FINISH
══════════════════════════════════════════ */
async function endBonus() {
  bonusTotalWin = Math.round(bonusTotalWin * 100) / 100;
  showBonusOverlay(`BONUS WIN: ${fmt(bonusTotalWin)}`, 'CONGRATULATIONS!');
  synth.bonusSiren();
  spawnCoinShower(60, 3500);
  shake(600);
  await sleep(3500);
  hideBonusOverlay();

  state.balance += bonusTotalWin;
  updateDisplays();
  elWin.textContent = fmt(bonusTotalWin);
  elWin.classList.add('win-glow');
  setStatus(`BONUS COMPLETE — WON ${fmt(bonusTotalWin)}!`, 'win');
  narrator.onBonusComplete(bonusTotalWin);

  clearFrameLayers();
  if (bonusHud) bonusHud.classList.add('hidden');
  document.querySelectorAll('.house-icon').forEach(el => el.remove());
  document.querySelectorAll('.is-house-revealed').forEach(el => el.classList.remove('is-house-revealed'));
  document.querySelectorAll('.house-straw, .house-stick, .house-brick, .house-mansion')
    .forEach(el => el.classList.remove('house-straw', 'house-stick', 'house-brick', 'house-mansion'));

  // crossfade back to the whimsical base-game theme
  bgm.switchToBase();

  bonusActive = false;
  state.spinning = false;
  setControlsEnabled(true);
}

/* ══════════════════════════════════════════
   FRAME / HOUSE VISUALS

   Huff-&-Puff "hold" frames: once a house frame is built on a cell it STAYS
   locked in that grid position for the rest of the bonus and upgrades in place
   (straw → wood → brick). To make it truly persistent we render the frames on a
   per-column overlay LAYER (a child of .reel-col, NOT of the spinning strip), so
   the symbols can keep spinning behind a frame that never moves or flickers. The
   `frameTiers` grid stays the single source of truth and matches the headless
   math in mathcore.simulateBonusOutcome (so RTP is unchanged).
══════════════════════════════════════════ */
const FRAME_TIER_CLASS = ['', 'frame-tier-1', 'frame-tier-2', 'frame-tier-3'];

/* The upgrade-morph videos — transparent center (the symbol shows through) with
   edges that animate from nothing into the new frame material. Keyed by the tier
   they PRODUCE, so future materials drop in by adding a file here. */
const FRAME_UPGRADE_VIDEOS = {
  1: 'assets/webm/F1-straw.webm',
  2: 'assets/webm/F2-wood.webm',
  3: 'assets/webm/F3-brick.webm',
};

/* Resolution at which a morph's last frame is snapshotted onto its persistent
   still canvas. The frame is 720² source; this is plenty crisp for a reel cell
   while staying light (one small bitmap per built frame, no video kept alive). */
const STILL_CAPTURE_PX = 384;

/** The persistent frame layer for a reel column (lazily created, lives on the col). */
function frameLayerFor(reel) {
  const col = document.getElementById('reel-' + reel);
  if (!col) return null;
  let layer = col.querySelector('.frame-layer');
  if (!layer) { layer = document.createElement('div'); layer.className = 'frame-layer'; col.appendChild(layer); }
  return layer;
}

/** The frame slot for a given cell (one fixed grid position), created on demand. */
function frameSlotFor(reel, row, create = false) {
  const layer = frameLayerFor(reel);
  if (!layer) return null;
  let slot = layer.querySelector('.frame-slot[data-row="' + row + '"]');
  if (!slot && create) {
    slot = document.createElement('div');
    slot.className = 'frame-slot';
    slot.dataset.row = row;
    slot.style.top = 'calc(var(--cell-size) * ' + row + ')';   // pinned to its row, resize-safe
    const overlay = document.createElement('div');
    overlay.className = 'frame-overlay';
    slot.appendChild(overlay);
    layer.appendChild(slot);
  }
  return slot;
}

function removeFrameSlot(reel, row) {
  const slot = frameSlotFor(reel, row, false);
  if (slot) slot.remove();
}

/**
 * Sync the persistent frame layers to `frameTiers`. Frames already on screen stay
 * put (the layer is never torn down by a spin); this only adds new slots and sets
 * each slot's material. Cells that UPGRADED this step keep showing their OLD frame
 * here — animateFrameUpgrades plays the morph and reveals the new frame on landing,
 * so the upgrade reads as a smooth straw→wood→brick transition.
 */
function renderFrameLayers() {
  for (let r = 0; r < 5; r++)
    for (let row = 0; row < 3; row++) {
      const tier = frameTiers[r][row];
      const prev = prevFrameTiers[r][row];
      if (tier === 0) { removeFrameSlot(r, row); continue; }
      const slot = frameSlotFor(r, row, true);
      const overlay = slot.querySelector('.frame-overlay');
      // The persistent still (PNG/frozen video) is the real visual; the CSS frame
      // is only a placeholder shown until a still exists for this cell.
      const hasStill = !!slot.querySelector('.frame-still');
      const showTier = tier > prev ? prev : tier;              // hold the old material until the morph lands
      overlay.className = 'frame-overlay' + (!hasStill && showTier > 0 ? ' ' + FRAME_TIER_CLASS[showTier] : '');
      if (tier > prev) { slot.classList.remove('frame-pop'); void slot.offsetWidth; slot.classList.add('frame-pop'); }
    }
  prevFrameTiers = frameTiers.map(col => [...col]);
}

function clearFrameLayers() {
  document.querySelectorAll('.frame-layer').forEach(el => el.remove());
}

/**
 * Play the upgrade-morph video on each freshly-upgraded cell, on the persistent
 * frame layer. While the video plays the cell shows its previous material (or
 * nothing, for a brand-new straw frame); when the video lands we reveal the new
 * material underneath as the video cross-fades out. Resolves once every video has
 * finished (or a safety timeout fires).
 */
async function animateFrameUpgrades(cells) {
  if (!cells || !cells.length) return;
  await Promise.all(cells.map(({ reel, row, tier }) => new Promise(resolve => {
    const slot = frameSlotFor(reel, row, true);
    const overlay = slot && slot.querySelector('.frame-overlay');
    const src = FRAME_UPGRADE_VIDEOS[tier];
    if (!src || !slot) {                                         // defensive: no morph for this tier
      if (overlay) overlay.className = 'frame-overlay ' + FRAME_TIER_CLASS[tier];
      return resolve();
    }

    synth.frameBuild(tier);                                      // straw woven / wood nailed / brick laid

    const vid = document.createElement('video');
    vid.className = 'frame-upgrade-vid';
    vid.src = alphaSrc(src);                                     // .mp4 (HEVC-alpha) on Safari, .webm elsewhere
    vid.muted = true;
    vid.playsInline = true;
    vid.setAttribute('playsinline', '');
    vid.preload = 'auto';
    slot.appendChild(vid);

    let done = false;
    const land = () => {
      if (done) return; done = true;
      try { vid.pause(); } catch (e) {}      // stop on the very last frame
      setFrameStill(slot, tier, vid);         // snapshot that last frame → persistent still; drop the video
      sparkleAt(slot, 9);                      // a little burst so each upgrade reads as a reward
      resolve();
    };
    vid.addEventListener('ended', land);
    vid.addEventListener('error', land);
    // Start the morph once it actually has data (don't .catch→land, which would
    // snapshot the blank first frame if play() rejects). Muted autoplay is allowed.
    const begin = () => { const p = vid.play(); if (p) p.catch(() => {}); };
    if (vid.readyState >= 2) begin();
    else vid.addEventListener('loadeddata', begin, { once: true });
    setTimeout(land, 7000);                   // safety net: by now the morph has played through
  })));
}

/**
 * Lock in a frame's persistent end-state after its upgrade morph finishes, and
 * hold it until the next upgrade (or until the bonus ends). We snapshot the
 * morph's LAST frame onto a lightweight <canvas> — which preserves the transparent
 * center so the reel symbol shows through — and then drop the video, so no PNG
 * asset is needed and no video decoder is kept alive. If the snapshot ever fails
 * (e.g. the frame isn't decoded yet) we fall back to freezing the paused video.
 */
function setFrameStill(slot, tier, morphVid) {
  if (!slot) return;
  const oldStill = slot.querySelector('.frame-still');
  const overlay  = slot.querySelector('.frame-overlay');

  const freezeVideo = () => {                 // fallback: keep the morph video, paused on its last frame
    if (!morphVid) return;
    if (oldStill) oldStill.remove();
    try { morphVid.pause(); } catch (e) {}
    morphVid.classList.remove('fading', 'frame-upgrade-vid');
    morphVid.classList.add('frame-still');    // demote to the persistent layer (below the next morph)
    if (overlay) overlay.className = 'frame-overlay';
  };

  if (!morphVid) return;
  try {
    const w = morphVid.videoWidth, h = morphVid.videoHeight;
    if (!w || !h) { freezeVideo(); return; }
    const cv = document.createElement('canvas');
    cv.className = 'frame-still';
    cv.width = STILL_CAPTURE_PX;
    cv.height = STILL_CAPTURE_PX;
    const ctx = cv.getContext('2d');          // alpha:true by default → transparent center is kept
    ctx.clearRect(0, 0, STILL_CAPTURE_PX, STILL_CAPTURE_PX);
    ctx.drawImage(morphVid, 0, 0, STILL_CAPTURE_PX, STILL_CAPTURE_PX);

    // Guard: make sure we actually captured the built frame and not a blank first
    // frame (which would happen if the morph never played). The frame's edges are
    // opaque, so at least one border sample must have alpha.
    const S = STILL_CAPTURE_PX;
    const pts = [[S >> 1, 2], [S >> 1, S - 3], [2, S >> 1], [S - 3, S >> 1], [4, 4], [S - 4, S - 4]];
    let maxA = 0;
    for (const [x, y] of pts) { const a = ctx.getImageData(x, y, 1, 1).data[3]; if (a > maxA) maxA = a; }
    if (maxA < 8) {                           // blank snapshot → show the CSS frame instead of nothing
      if (oldStill) oldStill.remove();
      morphVid.remove();
      if (overlay) overlay.className = 'frame-overlay ' + FRAME_TIER_CLASS[tier];
      return;
    }

    slot.appendChild(cv);                     // the frozen bitmap slots in beneath the paused video…
    if (oldStill) oldStill.remove();
    morphVid.remove();                        // …then the video (and its decoder) is released
    if (overlay) overlay.className = 'frame-overlay';
  } catch (e) {
    freezeVideo();                            // any capture failure → just freeze the video
  }
}

function countBrickFrames() {
  let count = 0;
  for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) if (frameTiers[r][row] === 3) count++;
  return count;
}

/** Blow a built frame down and show its house/prize on the cell. */
function updateCellToHouse(cellEl, tier) {
  cellEl.classList.add('is-house-revealed');
  cellEl.classList.add(['', 'house-straw', 'house-stick', 'house-brick'][tier]);
  const houseDiv = document.createElement('div');
  houseDiv.className = 'house-icon' + (tier === 3 ? ' mansion-house' : '');
  const houseImg = document.createElement('img');
  // the blown-down house shows its bonus pig: straw → wood → brick
  houseImg.src = ['', 'assets/bonus_pig_straw.webp', 'assets/bonus_pig_wood.webp', 'assets/bonus_pig_brick.webp'][tier];
  houseImg.style.width = '85%';
  houseImg.style.height = '85%';
  houseImg.style.objectFit = 'contain';
  houseImg.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))';
  houseDiv.appendChild(houseImg);
  cellEl.appendChild(houseDiv);
  if (tier === 3) cellEl.classList.add('house-mansion');
}

/* ══════════════════════════════════════════
   OVERLAYS / HUD / small helpers
══════════════════════════════════════════ */
function showBonusOverlay(title, phase) {
  if (!bonusOverlay) return;
  bonusTitle.textContent = title;
  bonusPhaseLabel.textContent = phase;
  bonusOverlay.classList.remove('hidden');
}
function hideBonusOverlay() { if (bonusOverlay) bonusOverlay.classList.add('hidden'); }

function showMansionOverlay() {
  if (!mansionOverlay) return;
  // Image-only reveal — the poster fills the frame and the wolf narrates the win.
  // Play the clip on capable browsers; iOS shows the still poster image instead.
  if (mansionPoster && !IS_MOBILE) {
    if (!mansionPoster.getAttribute('src')) mansionPoster.src = 'assets/webm/Wanted_poster.webm';
    try { mansionPoster.currentTime = 0; mansionPoster.play().catch(() => {}); } catch (e) {}
  }
  mansionOverlay.classList.remove('hidden');
}
function hideMansionOverlay() {
  if (mansionOverlay) mansionOverlay.classList.add('hidden');
  if (mansionPoster && !IS_MOBILE) { try { mansionPoster.pause(); } catch (e) {} }   // free the decoder
}

function updateBonusHUD() {
  if (bonusSpinsLeft) bonusSpinsLeft.textContent = bonusFreeSpins;
  if (bonusWinDisplay) bonusWinDisplay.textContent = fmt(bonusTotalWin);
}

function shake(ms) {
  cabinet.classList.add('screen-shake');
  setTimeout(() => cabinet.classList.remove('screen-shake'), ms);
}
function sparkleAt(cellEl, n) {
  const rect = cellEl.getBoundingClientRect();
  const cr = particleContainer.getBoundingClientRect();
  spawnSparkles(rect.left + rect.width / 2 - cr.left, rect.top + rect.height / 2 - cr.top, n);
}

/* ── Dev-only test hook (DEV_MODE) ──
   Drives the real frame render/upgrade/persist functions so the Huff-&-Puff
   hold-frame behaviour can be exercised without a live reel spin (headless test
   harnesses can't run the rAF-driven reels). No effect on gameplay. */
if (DEV_MODE && typeof window !== 'undefined') {
  window.__frames = {
    grid:       () => frameTiers.map(c => [...c]),
    setTier:    (r, row, t) => { frameTiers[r][row] = t; },
    render:     () => renderFrameLayers(),
    upgrade:    (cells) => animateFrameUpgrades(cells),
    removeSlot: (r, row) => removeFrameSlot(r, row),
    clear:      () => clearFrameLayers(),
    reset:      () => { frameTiers = makeGrid(); prevFrameTiers = makeGrid(); clearFrameLayers(); },
    wind:       () => startWindStorm(),    // returns a controller with stop()
    windSound:  () => { synth.windStart(); synth.windGust(); },
    slots: () => [...document.querySelectorAll('.frame-layer .frame-slot')].map(s => {
      const ov = s.querySelector('.frame-overlay');
      const still = s.querySelector('.frame-still');
      return {
        reel: s.parentElement.parentElement.id,
        row: +s.dataset.row,
        overlay: ov ? ov.className.replace('frame-overlay', '').trim() : null,
        still: still ? still.tagName : null,
      };
    }),
  };
}

Object.assign(exports, { isBonusActive, startBonus, demoMansion });

  };

  __mods["buy-bonus"] = function (exports, require) {
/**
 * @module buy-bonus
 * @description "Buy Bonus": pay buyCostMult × bet (80×) to skip the base game
 * and go straight into the feature. Priced (in config) so the buy's RTP matches
 * the game's ~97% — see PARSHEET.md. The trigger screen is rejection-sampled
 * from real spins so a bought bonus is worth exactly what a natural one is.
 */

const { BET_LEVELS, BONUS_CONFIG, HAT_IDS } = require("par-sheet");
const { state } = require("state");
const { fmt } = require("utils");
const { synth } = require("sound");
const { narrator } = require("narrator");
const { generateGrid, countHats } = require("mathcore");
const { animateReel, getReelStrips } = require("reels");
const { spawnCoinShower } = require("particles");
const { setStatus, updateDisplays, elWin, buttons } = require("readouts");
const { startBonus, isBonusActive } = require("bonus");

const cabinet      = document.getElementById('cabinet');
const buyModal     = document.getElementById('buy-modal');
const btnCloseBuy  = document.getElementById('btn-close-buy');
const btnConfirmBuy = document.getElementById('btn-confirm-buy');
const btnCancelBuy = document.getElementById('btn-cancel-buy');
const buyCostEl    = document.getElementById('buy-cost');
const buyBetEl     = document.getElementById('buy-bet');

/** Current cost to buy the bonus, in dollars. */
function bonusBuyCost() {
  return Math.round(BET_LEVELS[state.betIndex] * BONUS_CONFIG.buyCostMult * 100) / 100;
}

function executeBonusBuy() {
  if (state.spinning || isBonusActive()) return;
  const bet = BET_LEVELS[state.betIndex];
  const cost = bonusBuyCost();
  if (state.balance < cost) {
    setStatus('NOT ENOUGH CASH TO BUY THE BONUS!', 'error');
    narrator.onInsufficientFunds();
    return;
  }

  // rejection-sample a real screen until it has 6+ hats (matches natural triggers)
  let mockGrid, guard = 0;
  do { mockGrid = generateGrid(); }
  while (countHats(mockGrid).count < BONUS_CONFIG.triggerHats && ++guard < 100000);

  state.spinning = true;
  state.balance -= cost;
  elWin.textContent = '$0.00';
  elWin.classList.remove('win-glow');
  updateDisplays();
  setStatus(`BONUS PURCHASED — ${fmt(cost)}`, 'win');
  buttons.spin.disabled = buttons.betUp.disabled = buttons.betDown.disabled = true;

  synth.startSpin();
  const reelStrips = getReelStrips();
  let stopped = 0;
  for (let r = 0; r < 5; r++) {
    animateReel(r, mockGrid[r], () => {
      if (++stopped !== 5) return;
      synth.stopSpin();
      state.currentGrid = mockGrid;
      for (let ri = 0; ri < 5; ri++)
        for (let row = 0; row < 3; row++)
          if (HAT_IDS.includes(mockGrid[ri][row])) {
            const cell = reelStrips[ri].querySelectorAll('.sym-cell')[row];
            if (cell) cell.classList.add('is-winner');
          }
      state.spinning = false;
      cabinet.classList.add('screen-shake');
      setTimeout(() => cabinet.classList.remove('screen-shake'), 600);
      spawnCoinShower(30, 2000);
      setTimeout(() => startBonus(bet, mockGrid), 1000);
    }, true); // anticipation on
  }
}

function openBuyConfirm() {
  if (state.spinning || isBonusActive()) return;
  if (buyCostEl) buyCostEl.textContent = fmt(bonusBuyCost());
  if (buyBetEl) buyBetEl.textContent = fmt(BET_LEVELS[state.betIndex]);
  if (buyModal) buyModal.classList.remove('hidden');
  narrator.onBuyBonusOpen();
}
function closeBuyConfirm() { if (buyModal) buyModal.classList.add('hidden'); }

/* ── wiring ── */
if (buttons.buy) buttons.buy.addEventListener('click', openBuyConfirm);
if (btnCloseBuy) btnCloseBuy.addEventListener('click', closeBuyConfirm);
if (btnCancelBuy) btnCancelBuy.addEventListener('click', closeBuyConfirm);
if (buyModal) buyModal.addEventListener('click', e => { if (e.target === buyModal) closeBuyConfirm(); });
if (btnConfirmBuy) btnConfirmBuy.addEventListener('click', () => { closeBuyConfirm(); executeBonusBuy(); });

// The "B" shortcut lives in src/system/shortcuts.js (it clicks #btn-buy-bonus).

Object.assign(exports, { bonusBuyCost });

  };

  __mods["main"] = function (exports, require) {
/**
 * @module main
 * @description Entry point for Big Bad Wolf. Importing the feature modules runs
 * their setup (each wires its own buttons), then init() renders the starting
 * screen, wires the volume/paytable/sound controls, and kicks off ambient
 * effects + music.
 *
 * The source tree (see README.md for the full tour):
 *   math/    par-sheet (the par sheet) + mathcore (243-ways & bonus math)
 *   core/    state (shared runtime state) + utils (helpers)
 *   audio/   sound (sfx + music), narrator, phrases
 *   render/  reels (reel animation), particles (eye-candy), readouts (HUD)
 *   game/    base-game, bonus, buy-bonus
 *   panels/  the drawer pop-ups: options-drawer, deposit, rtp-picker,
 *            game-size, simulator (📊 SIM), math-breakdown (🧮 MATH)
 *   scenes/  intro, reveal, day-night, high-noon, idle-poster
 *   system/  dev-mode (hides admin tools on the public build)
 */

const { INITIAL_GRID, SYMBOLS } = require("par-sheet");
const { state } = require("state");
const { synth, bgm } = require("sound");
const { narrator } = require("narrator");
const { renderReel } = require("reels");
const { startAmbientParticles } = require("particles");
const { updateDisplays, setStatus } = require("readouts");

// Side-effect imports: these wire up their own controls on load.
require("mobile-media"); // mobile: swap the base-game videos for static images (must run first)
require("shortcuts");   // central keyboard map (Space=spin, ↑/↓=bet, O=panel, arrows navigate…)
require("dev-mode");    // hide dev/admin tools on the public build (?dev=1 to show)
require("web-push");    // dev "Web Push" button → opens the live deployed site
require("intro");      // full-screen intro splash
require("day-night");   // time-of-day background darkening
require("reveal");     // post-intro: hold on the background, then fade the game in
require("high-noon");       // hidden "High Noon" easter egg at exactly 12:00 PM
require("options-drawer");    // right-side slide-out options drawer
require("deposit");    // add-credit popup
require("rtp-picker");        // RTP / math-model picker popup
require("game-size");   // folder-size breakdown popup
require("idle-poster"); // idle "attract mode" — glows up the Wanted poster
require("side-wolf");  // SideWolf character: idle loop ×3 → random reaction → repeat
require("base-game");
require("bonus");
require("buy-bonus");
require("simulator");
require("math-breakdown");
require("help");        // 📖 HELP / RULES / PAYTABLE (built from the par sheet)
require("seo-info");    // 🔍 SEO report (dev-only)
require("wins-info");   // 🎉 WINS — win-tier breakdown (dev-only)
const { initFitScreen } = require("fit-screen");   // scale-to-fit for mobile / iPhone landscape
const { initLazyAssets } = require("lazy-assets");  // defer heavy/rare assets for instant first play
const { initBackgroundLoop } = require("background-loop");  // keep the bg video looping (iOS-safe)
const { initInstallHint } = require("install-hint");   // one-time "Add to Home Screen" nudge on iOS
const { initAlphaVideos } = require("video-format");  // serve HEVC-alpha .mp4 to Safari, WebM elsewhere

/* ══════════════════════════════════════════
   VOLUME / SOUND CONTROLS
══════════════════════════════════════════ */
function wireSoundControls() {
  const btnSound     = document.getElementById('btn-sound');
  const volumePanel  = document.getElementById('volume-panel');
  const sliderSfx    = document.getElementById('slider-sfx');
  const sliderMusic  = document.getElementById('slider-music');
  const sliderNarr   = document.getElementById('slider-narrator');
  const sfxPct       = document.getElementById('sfx-pct');
  const musicPct     = document.getElementById('music-pct');
  const narrPct      = document.getElementById('narrator-pct');
  const iconOn       = document.getElementById('icon-sound-on');
  const iconOff      = document.getElementById('icon-sound-off');

  btnSound.addEventListener('click', e => { e.stopPropagation(); volumePanel.classList.toggle('hidden'); });
  document.addEventListener('click', e => {
    if (!volumePanel.classList.contains('hidden') && !volumePanel.contains(e.target) && !btnSound.contains(e.target)) {
      volumePanel.classList.add('hidden');
    }
  });
  volumePanel.addEventListener('click', e => e.stopPropagation());

  sliderSfx.addEventListener('input', () => {
    const v = parseInt(sliderSfx.value);
    sfxPct.textContent = v + '%';
    synth.setVolume(v / 100);
    const off = v === 0;
    iconOn.classList.toggle('hidden', off);
    iconOff.classList.toggle('hidden', !off);
    btnSound.classList.toggle('sound-on', !off);
    synth.enabled = !off;
  });

  sliderMusic.addEventListener('input', () => {
    const v = parseInt(sliderMusic.value);
    musicPct.textContent = v + '%';
    bgm.setVolume(v / 100);
    if (v === 0) bgm.stop();
    else if (!bgm.isPlaying()) bgm.start();
  });

  sliderNarr.addEventListener('input', () => {
    const v = parseInt(sliderNarr.value);
    narrPct.textContent = v + '%';
    narrator.setVolume(v / 100);
    if (v === 0) { narrator.enabled = false; narrator.stop(); }
    else narrator.enabled = true;
  });

  const btnVolMute  = document.getElementById('btn-vol-mute');
  const btnVolReset = document.getElementById('btn-vol-reset');
  const ALL_SLIDERS = [sliderSfx, sliderMusic, sliderNarr];

  // Push a value into a slider AND run its input handler so audio + the % label
  // + the speaker icon all update exactly as if the user dragged it.
  const applySlider = (slider, value) => {
    slider.value = value;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // MUTE ALL is a toggle: first press silences all three and remembers the
  // levels; pressing again (now "UNMUTE") restores them. Defaults are used if a
  // saved level was itself 0, so unmuting always brings sound back.
  let mutedLevels = null;
  const refreshMuteLabel = () => {
    if (!btnVolMute) return;
    const muted = mutedLevels !== null;
    btnVolMute.textContent = muted ? 'UNMUTE' : 'MUTE ALL';
    btnVolMute.classList.toggle('is-active', muted);
  };

  if (btnVolMute) {
    btnVolMute.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mutedLevels === null) {
        // mute: stash current levels, then zero everything
        mutedLevels = ALL_SLIDERS.map(s => parseInt(s.value, 10) || 0);
        ALL_SLIDERS.forEach(s => applySlider(s, 0));
      } else {
        // unmute: restore stashed levels (fall back to defaults if they were 0)
        const fallback = [100, 50, 80];
        ALL_SLIDERS.forEach((s, i) => applySlider(s, mutedLevels[i] || fallback[i]));
        mutedLevels = null;
      }
      refreshMuteLabel();
    });
  }

  if (btnVolReset) {
    btnVolReset.addEventListener('click', (e) => {
      e.stopPropagation();
      applySlider(sliderSfx, 100);
      applySlider(sliderMusic, 50);
      applySlider(sliderNarr, 80);
      mutedLevels = null;        // clear any mute state so the label is correct
      refreshMuteLabel();
    });
  }

  refreshMuteLabel();
}

/* ══════════════════════════════════════════
   MUSIC AUTOSTART (browsers block audible autoplay until a gesture)
══════════════════════════════════════════ */
function wireMusicAutostart() {
  function tryStart() {
    if (state.musicAutoStarted) return;
    bgm.start().then(started => {
      if (started) {
        state.musicAutoStarted = true;
        document.removeEventListener('click', tryStart);
        document.removeEventListener('keydown', tryStart);
      }
    });
  }
  tryStart();                                  // attempt immediately…
  document.addEventListener('click', tryStart); // …fall back to first interaction
  document.addEventListener('keydown', tryStart);
}

/* The HELP / RULES / PAYTABLE screen lives in src/panels/help.js (built from the
   par sheet, opened by the 📖 HELP button). It wires itself on import. */

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
function init() {
  initAlphaVideos();          // pick WebM vs HEVC-alpha for transparent videos (Safari fix)
  state.currentGrid = INITIAL_GRID.map(col => [...col]);
  updateDisplays();
  for (let r = 0; r < 5; r++) renderReel(r, state.currentGrid[r]);
  setStatus('GOOD LUCK – PRESS SPIN!');

  wireSoundControls();
  wireMusicAutostart();

  // close the big-win overlay on click
  const bigWin = document.getElementById('big-win-overlay');
  if (bigWin) bigWin.addEventListener('click', () => bigWin.classList.add('hidden'));

  // click the saloon sign → the wolf brags about his joint
  const logoText = document.getElementById('logo-text');
  if (logoText) {
    logoText.classList.add('clickable-sign');
    logoText.addEventListener('click', () => narrator.onSaloonClick());
  }
  // click the Vegas Low Roller medallion → friendly shout-out
  const vlr = document.getElementById('vlr-medallion');
  if (vlr) {
    vlr.classList.add('clickable-sign');
    vlr.addEventListener('click', () => narrator.onVlrClick());
  }
  // click the sheriff's star badge → the wolf claims the law
  const badge = document.querySelector('.logo-badge img');
  if (badge) {
    badge.classList.add('clickable-sign');
    badge.addEventListener('click', () => narrator.onSheriffClick());
  }

  startAmbientParticles();
  initFitScreen();            // fit the cabinet to short / mobile (iPhone landscape) viewports
  initLazyAssets();           // stream in decorative/bonus assets after first play
  initBackgroundLoop();       // keep the background video reliably looping (iOS-safe)
  initInstallHint();          // gentle one-time "Add to Home Screen" prompt on iPhone
}

// Module scripts run after the DOM is parsed, so it's safe to init now.
init();

  };

  __mods["mathcore"] = function (exports, require) {
/**
 * @module mathcore
 * @description The math of Big Bad Wolf — and nothing else.
 *
 * This module is intentionally PURE: no DOM, no audio, no animation. That means
 * the browser game AND the headless verifier (tools/sim.js) import the SAME
 * functions, so what you test is exactly what players get. If a number feels
 * wrong, it is decided here or in the par sheet (par-sheet.js) — nowhere else.
 *
 * Contents:
 *   generateGrid()            – draw a random 5×3 screen from the reel strips
 *   evaluateGrid()            – the 243-ways payout calculation
 *   countHats()               – how many scatter hats are showing
 *   shouldAnticipate()        – cosmetic "near win" slow-down hint
 *   rollHouseAward()          – value of one blown-down house in the bonus
 *   rollMansionAward()        – value of the mansion jackpot
 *   simulateBonusOutcome()    – headless play-through of a whole bonus
 */

const {
  SYMBOLS, SYMBOL_IDS, HAT_IDS, WILD_ID, REEL_STRIPS, BONUS_CONFIG,
  REEL_COUNT, ROWS_PER_REEL, MIN_WIN_SPAN, MAX_FRAME_TIER,
} = require("par-sheet");

/* ══════════════════════════════════════════
   DRAWING A SCREEN
══════════════════════════════════════════ */

/**
 * Pick a random visible 5×3 grid from the reel strips.
 * For each reel we pick a random stop position and take the 3 symbols there
 * (wrapping around the end of the strip). grid[reel][row] = symbol id.
 * @returns {string[][]}
 */
function generateGrid() {
  return REEL_STRIPS.map(strip => {
    const len = strip.length;
    const start = Math.floor(Math.random() * len);
    return [strip[start % len], strip[(start + 1) % len], strip[(start + 2) % len]];
  });
}

/* ══════════════════════════════════════════
   EXPANDING WILDS
   ─────────────────────────────────────────
   The Wolf Wild lands only on reel 3 (the centre reel — see REEL_COUNTS). When it
   shows on a reel, the WHOLE reel turns wild — except hat (scatter) cells, which
   are left alone so the bonus trigger is unaffected. A wild substitutes for every
   paying symbol but the hats. The wild has no pay of its own.
══════════════════════════════════════════ */

/**
 * Expand any reel that contains a wild so the whole reel reads as wild (hats kept).
 * Returns a NEW grid (the input is never mutated) plus which reels expanded.
 * @returns {{ grid: string[][], wildReels: number[] }}
 */
function expandWilds(grid) {
  const wildReels = [];
  const out = grid.map((col, r) => {
    if (!col.includes(WILD_ID)) return col.slice();
    wildReels.push(r);
    return col.map(s => (HAT_IDS.includes(s) ? s : WILD_ID));   // keep hats, fill the rest
  });
  return { grid: out, wildReels };
}

/* ══════════════════════════════════════════
   243-WAYS PAYOUT
   ─────────────────────────────────────────
   "Ways" (not paylines): a symbol pays when it lands on adjacent reels starting
   from reel 1, in ANY rows. The number of "ways" is the product of how many
   times the symbol shows on each of those reels.

       payout = ways × pays[span] × bet

   where `span` = how many consecutive reels (from reel 1) the symbol covers
   (3, 4, or 5). With 3 rows per reel the theoretical max is 3×3×3×3×3 = 243 ways.
══════════════════════════════════════════ */

/**
 * @typedef {Object} WinResult
 * @property {string} symId
 * @property {number} span       consecutive reels matched (≥ MIN_WIN_SPAN)
 * @property {number} ways       number of ways this symbol hit
 * @property {number} winAmount  ways × pays[span] × bet
 * @property {Array<[number,number]>} cells  [reel,row] of each contributing cell
 */

/**
 * Evaluate every winning symbol on a grid.
 * @param {string[][]} grid grid[reel][row] = symbol id
 * @param {number} bet
 * @returns {{ totalWin: number, winners: WinResult[] }}
 */
function evaluateGrid(grid, bet) {
  let totalWin = 0;
  const winners = [];

  // expand any wild reels first; wilds then substitute below (idempotent if the
  // grid was already expanded by the caller)
  const g = expandWilds(grid).grid;

  for (const symId of SYMBOL_IDS) {
    const sym = SYMBOLS[symId];
    if (symId === WILD_ID || !sym.pays) continue;   // the wild has no pay of its own
    const isHat = HAT_IDS.includes(symId);
    // a cell counts for this symbol if it IS the symbol, or is a wild that may
    // substitute for it (wilds don't substitute for the hat scatters)
    const matches = s => s === symId || (!isHat && s === WILD_ID);

    // how many times the symbol (incl. substituting wilds) appears on each reel
    const colCounts = g.map(col => col.filter(matches).length);

    // must be present on reel 1 to start a left-to-right win
    if (colCounts[0] === 0) continue;

    // extend the win across consecutive reels, multiplying the ways
    let span = 1;
    let ways = colCounts[0];
    for (let r = 1; r < REEL_COUNT; r++) {
      if (colCounts[r] === 0) break;
      span++;
      ways *= colCounts[r];
    }

    if (span < MIN_WIN_SPAN) continue;          // need 3+ in a row to pay
    const payout = sym.pays[span];
    if (!payout) continue;

    const winAmount = ways * payout * bet;
    totalWin += winAmount;

    // record the contributing cells (for highlighting in the UI)
    const cells = [];
    for (let r = 0; r < span; r++) {
      g[r].forEach((s, row) => { if (matches(s)) cells.push([r, row]); });
    }
    winners.push({ symId, span, ways, winAmount, cells });
  }

  return { totalWin, winners };
}

/* ══════════════════════════════════════════
   SCATTER HATS (bonus trigger)
══════════════════════════════════════════ */

/**
 * Count the hard hats anywhere on the grid (they are the bonus scatter).
 * @returns {{ count: number, hatCells: Array<[number,number]> }}
 */
function countHats(grid) {
  let count = 0;
  const hatCells = [];
  for (let r = 0; r < REEL_COUNT; r++) {
    for (let row = 0; row < ROWS_PER_REEL; row++) {
      if (HAT_IDS.includes(grid[r][row])) { count++; hatCells.push([r, row]); }
    }
  }
  return { count, hatCells };
}

/** Symbols that, when stacking across reels, trigger the anticipation slow-down. */
const ANTICIPATION_SYMS = ['hat-yellow', 'pig-suit', 'pig-contractor'];

/**
 * Cosmetic only: should later reels slow down for suspense? True when a big
 * symbol is building across the first reels, or a bonus is one hat away.
 */
function shouldAnticipate(grid) {
  for (const symId of ANTICIPATION_SYMS) {
    let consecutive = 0;
    for (let r = 0; r < REEL_COUNT; r++) {
      if (grid[r].includes(symId)) consecutive++;
      else break;
    }
    if (consecutive >= 3) return true;
  }
  return countHats(grid).count >= 4;
}

/**
 * Should the final reel spin in extreme anticipation?
 * True if exactly 5 hats have landed on the first 4 reels.
 */
function shouldExtremeAnticipate(grid) {
  let count = 0;
  for (let r = 0; r < REEL_COUNT - 1; r++) {
    for (let row = 0; row < 3; row++) {
      if (HAT_IDS.includes(grid[r][row])) count++;
    }
  }
  return count === 5;
}

/* ══════════════════════════════════════════
   BONUS AWARD MATH
   All magnitudes come from BONUS_CONFIG (the par sheet); these helpers are the
   ONE place the formulas live, shared by the live bonus and the simulators.
══════════════════════════════════════════ */

/**
 * Value of a single house when the wolf blows it down, in dollars.
 * tier 1 = straw, 2 = stick, 3 = brick. Tiers 2 & 3 have a small jackpot chance.
 * @returns {{ amount: number, isJackpot: boolean }}
 */
function rollHouseAward(tier, bet) {
  const t = BONUS_CONFIG.tiers[tier];
  if (t.jackpotChance && Math.random() < t.jackpotChance) {
    return { amount: bet * t.jackpotMult, isJackpot: true };
  }
  return { amount: bet * (t.min + Math.random() * (t.max - t.min)), isJackpot: false };
}

/** Value of the mansion jackpot for a given number of brick houses, in dollars. */
function rollMansionAward(brickCount, bet) {
  const m = BONUS_CONFIG.mansion;
  return bet * (m.baseMult + Math.random() * (m.perBrickMult * brickCount));
}

/* ══════════════════════════════════════════
   HEADLESS BONUS PLAY-THROUGH
   Mirrors the live feature (game/bonus.js) but with no animation — just the money.
   Used by the Monte-Carlo simulators. Keep in lock-step with game/bonus.js.
══════════════════════════════════════════ */

const round2 = n => Math.round(n * 100) / 100;

/**
 * Play a whole bonus and return what it paid.
 * @param {number} bet
 * @param {string[][]} triggerGrid the 6+ hat screen that started it
 * @returns {{ bonusWin: number, freeSpins: number, mansions: number }}
 */
function simulateBonusOutcome(bet, triggerGrid) {
  const C = BONUS_CONFIG;
  let freeSpins = C.freeSpins, bonusWin = 0, spinsPlayed = 0, mansions = 0;
  const frames = Array.from({ length: REEL_COUNT }, () => Array(ROWS_PER_REEL).fill(0));

  // trigger hats place the first straw frames
  for (let r = 0; r < REEL_COUNT; r++)
    for (let row = 0; row < ROWS_PER_REEL; row++)
      if (HAT_IDS.includes(triggerGrid[r][row]))
        frames[r][row] = Math.min(frames[r][row] + 1, MAX_FRAME_TIER);

  while (freeSpins > 0) {
    freeSpins--; spinsPlayed++;
    const grid = generateGrid();
    bonusWin += evaluateGrid(grid, bet).totalWin;       // free spins still pay lines

    // each hat upgrades its cell's house: straw → stick → brick
    let newHats = 0, newBricks = 0;
    for (let r = 0; r < REEL_COUNT; r++)
      for (let row = 0; row < ROWS_PER_REEL; row++)
        if (HAT_IDS.includes(grid[r][row])) {
          const old = frames[r][row];
          frames[r][row] = Math.min(old + 1, MAX_FRAME_TIER);
          newHats++;
          if (old === MAX_FRAME_TIER - 1 && frames[r][row] === MAX_FRAME_TIER) newBricks++;
        }

    // mansion jackpot fires when a fresh brick lands and 3+ bricks are up
    let bricks = 0;
    for (let r = 0; r < REEL_COUNT; r++)
      for (let row = 0; row < ROWS_PER_REEL; row++)
        if (frames[r][row] === MAX_FRAME_TIER) bricks++;
    if (bricks >= C.mansion.minBricks && newBricks > 0) {
      bonusWin += round2(rollMansionAward(bricks, bet));
      mansions++;
    }

    if (newHats >= C.retriggerHats) freeSpins += C.retriggerSpins;   // retrigger
  }

  // the wolf blows every built house down for its prize
  for (let r = 0; r < REEL_COUNT; r++)
    for (let row = 0; row < ROWS_PER_REEL; row++) {
      const tier = frames[r][row];
      if (tier) bonusWin += round2(rollHouseAward(tier, bet).amount);
    }

  return { bonusWin, freeSpins: spinsPlayed, mansions };
}

Object.assign(exports, { generateGrid, expandWilds, evaluateGrid, countHats, shouldAnticipate, shouldExtremeAnticipate, rollHouseAward, rollMansionAward, simulateBonusOutcome });

  };

  __mods["par-sheet"] = function (exports, require) {
/**
 * @module par-sheet
 * @description Game configuration, symbol definitions, reel strip layouts,
 *              and shared constants for Big Bad Wolf.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  THIS FILE IS THE CANONICAL PAR SHEET (single source of truth for math).
 *  Human-readable summary + expected RTP decomposition lives in PARSHEET.md.
 *  Re-verify any change with:   node tools/sim.js
 *  Both the live game (src/main.js → modules) and the verifier import from here,
 *  so there is exactly ONE copy of these numbers.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Design target: ~97% RTP, high volatility (real "Big Bad Wolf" feel).
 *   • Base game  ≈ 49% RTP  (243-ways line wins ≈ 30% + the expanding Wolf Wild
 *                            ≈ 19%; line pays were scaled to 0.51× so the wild's
 *                            extra return doesn't push the total over target)
 *   • Bonus      ≈ 47% RTP  (wolf/house feature drives most of the return)
 *   • Bonus trigger ≈ 1 in 180 spins (6+ hard-hat scatters)
 *   Measured total ≈ 96.8% (high-variance bonus → ±~0.5% per sim run).
 */

/* ══════════════════════════════════════════
   NAMED CONSTANTS
══════════════════════════════════════════ */

/** Number of reels on the machine */
const REEL_COUNT = 5;

/** Rows visible per reel */
const ROWS_PER_REEL = 3;

/** Minimum consecutive reels for a ways-win */
const MIN_WIN_SPAN = 3;

/** Number of scatter hats required to trigger the bonus */
const BONUS_TRIGGER_HATS = 6;

/** Free spins awarded on bonus trigger */
const FREE_SPINS_INITIAL = 6;

/** Hats needed during a free spin to retrigger +1 */
const RETRIGGER_HATS = 3;

/** Maximum frame tier (brick/mansion) */
const MAX_FRAME_TIER = 3;

/** Frame tier labels for display */
const TIER_NAMES = ['', 'STRAW', 'STICK', 'BRICK'];

/** Scroll symbols during normal spin animation */
const SCROLL_SYMBOLS = 22;

/** Scroll symbols during turbo spin animation */
const TURBO_SCROLL = 10;

/** Normal reel stop durations (ms) per reel index */
const SPIN_DURATIONS = [620, 820, 1020, 1220, 1420];

/** Turbo reel stop durations (ms) per reel index */
const TURBO_DURATIONS = [280, 360, 440, 520, 600];

/** Extra ms added to anticipation reels */
const ANTICIPATION_EXTRA = 800;

/** Bet levels available to the player */
const BET_LEVELS = [0.20, 0.50, 1.00, 2.00, 5.00, 10.00, 20.00, 50.00];

/** Default bet index (into BET_LEVELS) */
const DEFAULT_BET_INDEX = 2;

/**
 * Win-celebration tiers, expressed as a multiple of the total bet. A spin's win
 * ÷ bet decides which on-screen celebration plays. This is the single source of
 * truth for the win presentation (base-game.js), the wolf's voice reactions
 * (narrator.js) and the dev "WINS" panel, so they can never disagree.
 *
 * The ladder follows the US land-based convention (Big at the ~10× benchmark,
 * then escalating banners) but is tuned a touch for this game's high volatility.
 * NOTE: these are *celebration* thresholds (multiples of bet, so the dollar
 * trigger scales with the bet) — NOT a max-win cap. The game has no artificial
 * win cap; the bonus has its own dedicated jackpots on top of these.
 */
const WIN_TIERS = {
  nice:     2,    // 2×–10× bet — a "Nice Win": colour + count-up, no banner
  big:      10,   // ≥ 10× bet  — BIG WIN! banner (the industry benchmark)
  mega:     25,   // ≥ 25× bet  — MEGA WIN! banner
  epic:     50,   // ≥ 50× bet  — EPIC WIN! banner (the wolf's biggest voice reaction)
  colossal: 100,  // ≥ 100× bet — COLOSSAL WIN! banner (the top celebration)
};

/** Starting player balance */
const DEFAULT_BALANCE = 1000.00;

/* ══════════════════════════════════════════
   RTP MODELS  (selectable math models)
   The RTP picker in the options drawer renders one card per entry here, so to
   add a new model you only add an object to this list — the UI updates itself.

   Right now there is a single model ("standard", ~97%) and its math lives in the
   REEL_COUNTS / BONUS_CONFIG / SYMBOLS tables below. A future model will carry its
   OWN math tables on its entry (e.g. model.reelCounts, model.bonusConfig) and the
   game will swap the active set when the player picks it.
══════════════════════════════════════════ */

const RTP_MODELS = [
  {
    id:    'standard',
    label: 'Standard',
    rtp:   0.97,                         // 0–1; shown as a percentage
    scale: 1.00,                         // win-magnitude multiplier vs the canonical pays/awards
    blurb: 'High-volatility classic. A quiet base game with big, swingy bonus rounds.',
  },
  {
    id:    'lean',
    label: 'Lean',
    rtp:   0.85,
    scale: 0.880,                        // tuned so measured total ≈ 85% (rounding-adjusted)
    blurb: 'Same game, leaner pays — a lower 85% return for higher-margin placements.',
  },
];

/** Default selected RTP model id */
const DEFAULT_RTP_MODEL = 'standard';

/** localStorage key for the player's chosen RTP model. */
const RTP_MODEL_KEY = 'bbw_rtp_model';

/* ══════════════════════════════════════════
   SYMBOL DEFINITIONS  (PAYTABLE)
   pays[span] = per-WAY multiplier of the bet.
   Total cell payout = ways × pays[span] × bet  (243-ways, left-to-right).
══════════════════════════════════════════ */

const SYMBOLS = {
  // ── Image symbols (the mid/high pays) ──
  // NOTE FOR REVIEWERS: a few symbol **ids** are legacy names from the game's
  // original Three-Little-Pigs theme; the ART and the player-facing `label` were
  // later changed to Western objects. The id is internal only (never shown). The
  // `label` and `src` below are the source of truth for what the player sees:
  //     id 'pig-suit'       → Sheriff Badge   (assets/sheriff_badge.webp)
  //     id 'pig-contractor' → Horseshoe       (assets/horseshoe.webp)
  //     id 'pig-nature'     → Tornado         (assets/tornado.webp)
  //     id 'toolbox'        → Shot Glass      (assets/shotglass.webp)
  // Pays were scaled to 0.51× the pre-wild values: the expanding Wolf Wild adds a
  // big chunk of base RTP on its own, so the line pays come down to keep the base
  // game near ~49% (total ~97%). Re-verify any change with `node tools/sim.js`.
  'hat-yellow':     { id: 'hat-yellow',     src: 'assets/hat_yellow.webp',     label: 'Yellow Hat',    pays: { 3: 1.78, 4: 7.14, 5: 35.70 }, isHat: true },
  'hat-green':      { id: 'hat-green',      src: 'assets/hat_white.webp',      label: 'White Hat',     pays: { 3: 0.89, 4: 3.57, 5: 17.85 }, isHat: true },
  'hat-red':        { id: 'hat-red',        src: 'assets/hat_red.webp',        label: 'Red Hat',       pays: { 3: 0.71, 4: 2.86, 5: 14.28 }, isHat: true },
  'pig-suit':       { id: 'pig-suit',       src: 'assets/sheriff_badge.webp', label: 'Sheriff Badge', pays: { 3: 1.43, 4: 5.36, 5: 26.52 } },
  'pig-contractor': { id: 'pig-contractor', src: 'assets/horseshoe.webp',     label: 'Horseshoe',     pays: { 3: 1.07, 4: 4.28, 5: 21.42 } },
  'pig-nature':     { id: 'pig-nature',     src: 'assets/tornado.webp',       label: 'Tornado',       pays: { 3: 0.71, 4: 2.86, 5: 14.28 } },
  'toolbox':        { id: 'toolbox',        src: 'assets/shotglass.webp',     label: 'Shot Glass',    pays: { 3: 0.61, 4: 2.50, 5: 12.24 } },
  'wolf':           { id: 'wolf',           src: 'assets/wolf.webp',           label: 'Wolf',          pays: { 3: 0.46, 4: 1.79, 5: 8.67 } },
  'buzzard':        { id: 'buzzard',        src: 'assets/buzzard.webp',        label: 'Buzzard',       pays: { 3: 0.36, 4: 1.43, 5: 7.14 } },

  // ── WOLF WILD (expanding) ──
  // Lands only on reel 3 (the centre reel — see REEL_COUNTS below). When it lands
  // it fills its whole reel and substitutes for every paying symbol EXCEPT the
  // hats (scatters). It has no pay of its own — it only helps the other symbols
  // form wins.
  'wild':           { id: 'wild',           svgId: '#sym-wild',     label: 'Wolf Wild', pays: null, isWild: true },

  // ── Inline SVG Royals (low-pay filler) ──
  'royal-a':        { id: 'royal-a',        svgId: '#sym-royal-a',  label: 'Ace',    pays: { 3: 0.26, 4: 0.89, 5: 4.46 } },
  'royal-k':        { id: 'royal-k',        svgId: '#sym-royal-k',  label: 'King',   pays: { 3: 0.26, 4: 0.89, 5: 4.46 } },
  'royal-q':        { id: 'royal-q',        svgId: '#sym-royal-q',  label: 'Queen',  pays: { 3: 0.21, 4: 0.71, 5: 3.57 } },
  'royal-j':        { id: 'royal-j',        svgId: '#sym-royal-j',  label: 'Jack',   pays: { 3: 0.21, 4: 0.71, 5: 3.57 } },
  'royal-10':       { id: 'royal-10',       svgId: '#sym-royal-10', label: 'Ten',    pays: { 3: 0.18, 4: 0.54, 5: 2.68 } },
};

/** All hat symbol IDs for bonus detection */
const HAT_IDS = ['hat-yellow', 'hat-green', 'hat-red'];

/** The expanding wild symbol id (see SYMBOLS['wild']). */
const WILD_ID = 'wild';

/** All symbol IDs as an array (cached for perf) */
const SYMBOL_IDS = Object.keys(SYMBOLS);

/* ══════════════════════════════════════════
   BONUS PAR SHEET  (Hard Hat Free Spins)
   All bonus award magnitudes live here — the only place bonus math is stored.
   Awards are expressed as multiples of the (per-line) bet.
══════════════════════════════════════════ */

const BONUS_CONFIG = {
  triggerHats:    6,   // hats on the trigger spin to start the bonus
  freeSpins:      6,   // initial free spins
  retriggerHats:  3,   // hats in one free spin to award +1 spin
  retriggerSpins: 1,   // spins added per retrigger

  // BONUS BUY: cost = buyCostMult × bet. Set so the buy carries ~the same RTP as
  // the game (avg bonus ≈ 85.3× bet ÷ 0.968 ≈ 88×). Verified by tools/sim.js.
  buyCostMult:    88,

  /**
   * Per-house award when the wolf blows a frame down.
   * tier 1 = straw, 2 = stick, 3 = brick. Award = bet × U(min,max),
   * except with probability `jackpotChance` it pays bet × `jackpotMult`.
   */
  tiers: {
    1: { min: 0.46, max: 2.44 },
    2: { min: 2.44, max: 9.74,  jackpotChance: 0.04, jackpotMult: 29  },
    3: { min: 7.31, max: 44.08, jackpotChance: 0.04, jackpotMult: 146 },
  },

  /**
   * Mansion jackpot: awarded once when 3+ brick frames are built.
   * Award = bet × (baseMult + U(0, perBrickMult × brickCount)).
   */
  mansion: { minBricks: 3, baseMult: 24.4, perBrickMult: 19.7 },
};

/* ══════════════════════════════════════════
   ACTIVE RTP MODEL
   The tables above are the canonical (Standard, ~97%) math. A selectable model
   (e.g. "Lean", 85%) keeps the SAME reels, trigger rate, hit frequency and
   volatility shape, and simply scales every win magnitude (line pays + bonus
   awards) by its `scale` factor. We apply that scale ONCE, in place, at load —
   so every consumer (evaluation, simulator, the displayed paytable) reads the
   same active numbers. The bonus-buy price is unchanged: fair price =
   E[bonus]/RTP, and both E[bonus] and RTP scale by the same factor, so it cancels.

   The choice is read from localStorage (browser) or BBW_RTP_MODEL (Node), so the
   headless verifier checks the exact model the player selected:
       BBW_RTP_MODEL=lean node tools/sim.js
══════════════════════════════════════════ */
function resolveActiveModelId() {
  try { if (typeof localStorage !== 'undefined') { const v = localStorage.getItem(RTP_MODEL_KEY); if (v && RTP_MODELS.some(m => m.id === v)) return v; } } catch (e) {}
  try { if (typeof process !== 'undefined' && process.env && process.env.BBW_RTP_MODEL && RTP_MODELS.some(m => m.id === process.env.BBW_RTP_MODEL)) return process.env.BBW_RTP_MODEL; } catch (e) {}
  return DEFAULT_RTP_MODEL;
}

/** The active model id and object (resolved once at load). */
const ACTIVE_MODEL_ID = resolveActiveModelId();
const ACTIVE_MODEL = RTP_MODELS.find(m => m.id === ACTIVE_MODEL_ID) || RTP_MODELS[0];

(function applyModelScale() {
  const scale = ACTIVE_MODEL.scale ?? 1;
  if (scale === 1) return;                         // Standard — nothing to do
  const r2 = n => Math.round(n * 100) / 100;
  const r1 = n => Math.round(n * 10) / 10;
  for (const id of SYMBOL_IDS) {                   // scale every line pay
    const p = SYMBOLS[id].pays;
    if (p) for (const k in p) p[k] = r2(p[k] * scale);
  }
  for (const t of Object.values(BONUS_CONFIG.tiers)) {   // scale house awards
    t.min = r2(t.min * scale); t.max = r2(t.max * scale);
    if (t.jackpotMult) t.jackpotMult = Math.round(t.jackpotMult * scale);
  }
  BONUS_CONFIG.mansion.baseMult     = r1(BONUS_CONFIG.mansion.baseMult * scale);
  BONUS_CONFIG.mansion.perBrickMult = r1(BONUS_CONFIG.mansion.perBrickMult * scale);
})();

/* ══════════════════════════════════════════
   REEL STRIPS  —  PER-REEL SYMBOL COUNTS (the par sheet)
   REEL_COUNTS[reel][symbolId] = how many of that symbol live on that reel.
   This table IS the math model — change a number, re-run `node tools/sim.js`.

   buildStrip() turns each count column into a physical strip: it spreads the
   filler symbols evenly and drops the hard hats in 2-symbol CLUSTERS, so a
   3-cell window can show 2 hats at once. That clustering is what makes the
   "6+ hats" bonus trigger reachable, and total hat count tunes how often it
   fires. buildStrip() is deterministic, so the strips are identical every load.
══════════════════════════════════════════ */

const REEL_COUNTS = [
  // Reel 1 (leftmost — slightly looser)   ·   no wild
  { 'hat-yellow': 2, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 2, 'pig-contractor': 1, 'pig-nature': 1, 'toolbox': 2, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 5 },
  // Reel 2   ·   no wild
  { 'hat-yellow': 1, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 1, 'pig-contractor': 2, 'pig-nature': 1, 'toolbox': 2, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 4 },
  // Reel 3 (middle)   ·   1 expanding wild  (classic center-reel wild)
  { 'hat-yellow': 1, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 1, 'pig-contractor': 1, 'pig-nature': 1, 'toolbox': 1, 'wolf': 2, 'buzzard': 1, 'wild': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 6 },
  // Reel 4   ·   no wild
  { 'hat-yellow': 1, 'hat-green': 1, 'hat-red': 1, 'pig-suit': 1, 'pig-contractor': 1, 'pig-nature': 1, 'toolbox': 2, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 6 },
  // Reel 5 (rightmost — fewest premiums)   ·   no wild
  { 'hat-yellow': 1, 'hat-green': 1, 'hat-red': 0, 'pig-suit': 1, 'pig-contractor': 1, 'pig-nature': 1, 'toolbox': 1, 'wolf': 2, 'buzzard': 1, 'royal-a': 4, 'royal-k': 4, 'royal-q': 4, 'royal-j': 4, 'royal-10': 6 },
];

/**
 * Build a deterministic reel strip from a per-symbol count map.
 * Non-hat fillers are interleaved round-robin (even spread); hats are grouped
 * into clusters of 2 and woven in at evenly spaced gaps.
 */
function buildStrip(counts) {
  // hats, flattened — the cluster fuel
  const hats = [];
  for (const id of HAT_IDS) for (let i = 0; i < (counts[id] || 0); i++) hats.push(id);

  // non-hat fillers, round-robin across symbol types for an even spread
  const buckets = Object.keys(counts)
    .filter(id => !HAT_IDS.includes(id))
    .map(id => Array(counts[id]).fill(id));
  const fillers = [];
  for (let any = true; any; ) {
    any = false;
    for (const b of buckets) { if (b.length) { fillers.push(b.pop()); any = true; } }
  }

  // group hats into clusters of 2 (a trailing odd hat stays a single)
  const clusters = [];
  for (let i = 0; i < hats.length; i += 2) clusters.push(hats.slice(i, i + 2));

  // weave clusters into the fillers at even gaps
  const gap = Math.max(1, Math.floor(fillers.length / (clusters.length + 1)));
  const strip = [];
  let ci = 0;
  for (let i = 0; i < fillers.length; i++) {
    strip.push(fillers[i]);
    if (ci < clusters.length && (i + 1) % gap === 0) strip.push(...clusters[ci++]);
  }
  while (ci < clusters.length) strip.push(...clusters[ci++]);
  return strip;
}

/** Physical reel strips (flat arrays), derived from REEL_COUNTS. */
const REEL_STRIPS = REEL_COUNTS.map(buildStrip);

/* ══════════════════════════════════════════
   INITIAL GRID (visible on page load)
══════════════════════════════════════════ */

const INITIAL_GRID = [
  ['royal-a',    'pig-suit',   'royal-k' ],
  ['toolbox',    'royal-q',    'royal-j' ],
  ['pig-contractor', 'royal-a', 'royal-k'],
  ['royal-q',    'pig-nature', 'royal-j' ],
  ['royal-a',    'royal-k',    'toolbox' ],
];

Object.assign(exports, { REEL_COUNT, ROWS_PER_REEL, MIN_WIN_SPAN, BONUS_TRIGGER_HATS, FREE_SPINS_INITIAL, RETRIGGER_HATS, MAX_FRAME_TIER, TIER_NAMES, SCROLL_SYMBOLS, TURBO_SCROLL, SPIN_DURATIONS, TURBO_DURATIONS, ANTICIPATION_EXTRA, BET_LEVELS, DEFAULT_BET_INDEX, WIN_TIERS, DEFAULT_BALANCE, RTP_MODELS, DEFAULT_RTP_MODEL, RTP_MODEL_KEY, SYMBOLS, HAT_IDS, WILD_ID, SYMBOL_IDS, BONUS_CONFIG, ACTIVE_MODEL_ID, ACTIVE_MODEL, REEL_COUNTS, buildStrip, REEL_STRIPS, INITIAL_GRID });

  };

  __mods["deposit"] = function (exports, require) {
/**
 * @module deposit
 * @description "Add Credit" — a popup with $1 / $20 / $50 / $100 buttons that
 * each add their amount to the machine's balance. Stays open so you can stack
 * deposits; the balance updates live.
 */

const { state } = require("state");
const { updateDisplays } = require("readouts");
const { fmt } = require("utils");
const { synth } = require("sound");

const btnDeposit = document.getElementById('btn-deposit');
const modal      = document.getElementById('deposit-modal');
const closeBtn   = document.getElementById('btn-close-deposit');
const doneBtn    = document.getElementById('btn-deposit-done');
const balEl      = document.getElementById('deposit-balance');

function refresh() { if (balEl) balEl.textContent = fmt(state.balance); }
function openModal() { refresh(); modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); }

if (btnDeposit && modal) {
  btnDeposit.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (doneBtn) doneBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  modal.querySelectorAll('.deposit-amt').forEach(btn => {
    btn.addEventListener('click', () => {
      state.balance += parseFloat(btn.dataset.amt);
      updateDisplays();   // update the CASH readout
      refresh();          // update the balance shown in the popup
      synth.coinClink();  // little feedback chime
    });
  });
}

  };

  __mods["game-size"] = function (exports, require) {
/**
 * @module game-size
 * @description The "GAME SIZE" popup — opened from the options drawer. Shows the
 * total size of the whole game folder plus a color-coded breakdown (videos,
 * audio, images, code, other), styled to match the sim/math stat panels.
 *
 * The numbers come from SIZE_MANIFEST in src/panels/size-manifest.js, which is regenerated by
 * tools/build.js on every build — so the figure is accurate as of the last build.
 */

const { SIZE_MANIFEST } = require("size-manifest");

/* per-category icon + colour (matched to the manifest's category keys) */
const CAT_META = {
  video: { icon: '🎬', color: '#B07CF0' },
  audio: { icon: '🔊', color: '#2EE85A' },
  image: { icon: '🖼️', color: '#F5C400' },
  code:  { icon: '💻', color: '#40D8FF' },
  other: { icon: '📦', color: '#8899AA' },
};

const btnSize   = document.getElementById('btn-size');
const modal     = document.getElementById('size-modal');
const closeBtn  = document.getElementById('btn-close-size');
const doneBtn   = document.getElementById('btn-size-done');
const totalEl   = document.getElementById('size-total');
const scopeEl   = document.getElementById('size-scope');
const phasesEl  = document.getElementById('size-phases');
const barEl     = document.getElementById('size-bar');
const legendEl  = document.getElementById('size-legend');

const MB = bytes => bytes / 1048576;
function fmtSize(bytes) {
  const m = MB(bytes);
  if (m >= 1)  return `${m.toFixed(m >= 10 ? 1 : 2)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/** Build the popup contents from the manifest (once). */
function render() {
  const { totalBytes, fileCount, generatedAt, categories, player, dev,
          firstPlay, progressive } = SIZE_MANIFEST;
  if (!totalBytes) return;
  const pct = b => (b / totalBytes) * 100;

  // total headline
  if (totalEl) {
    totalEl.innerHTML =
      `<span class="size-total-num">${MB(totalBytes).toFixed(1)}</span>` +
      `<span class="size-total-unit">MB</span>` +
      `<span class="size-total-sub">${fileCount.toLocaleString()} files · snapshot ${generatedAt}</span>`;
  }

  // player-build vs dev/gaff-tools split (what ships to players vs dev-only)
  if (scopeEl && player && dev) {
    const wp = (player.bytes / totalBytes) * 100;
    scopeEl.innerHTML =
      `<div class="size-scope-bar">` +
        `<div class="size-scope-seg player" style="width:${wp}%"></div>` +
        `<div class="size-scope-seg dev" style="width:${100 - wp}%"></div>` +
      `</div>` +
      `<div class="size-scope-rows">` +
        `<div class="size-scope-row"><span class="size-scope-dot player"></span>` +
          `<span class="size-scope-name">📦 Player build</span>` +
          `<span class="size-scope-meta">${player.files.toLocaleString()}f</span>` +
          `<span class="size-scope-val">${fmtSize(player.bytes)}</span></div>` +
        `<div class="size-scope-row"><span class="size-scope-dot dev"></span>` +
          `<span class="size-scope-name">🛠 Dev tools</span>` +
          `<span class="size-scope-meta">${dev.files.toLocaleString()}f</span>` +
          `<span class="size-scope-val">${fmtSize(dev.bytes)}</span></div>` +
      `</div>`;
  }

  // download footprint — how much loads, and WHEN (bars relative to the on-disk total)
  if (phasesEl && player && firstPlay && progressive) {
    const max = totalBytes || 1;
    const firstPctOfWeb = player.bytes ? Math.round((firstPlay.bytes / player.bytes) * 100) : 0;
    const row = (cls, icon, name, b, files) =>
      `<div class="size-phase-row">` +
        `<div class="size-phase-head">` +
          `<span class="size-phase-name">${icon} ${name}</span>` +
          `<span class="size-phase-val">${fmtSize(b)}` +
            `<span class="size-phase-files">· ${files.toLocaleString()}f</span></span>` +
        `</div>` +
        `<div class="size-phase-track">` +
          `<div class="size-phase-fill ${cls}" style="width:${((b / max) * 100).toFixed(1)}%"></div>` +
        `</div>` +
      `</div>`;
    phasesEl.innerHTML =
      `<div class="size-phases-title">📡 What downloads, and when</div>` +
      row('machine', '💻', 'On your machine',       totalBytes,        fileCount) +
      row('web',     '🌐', 'On the web (deployed)',  player.bytes,      player.files) +
      row('first',   '⚡', 'First play',             firstPlay.bytes,   firstPlay.files) +
      row('lazy',    '🌙', 'Background / on demand', progressive.bytes, progressive.files) +
      `<p class="size-phases-note"><b>⚡ Only ${fmtSize(firstPlay.bytes)} (${firstPctOfWeb}%)</b> loads before you can spin.</p>`;
  }

  // stacked bar
  if (barEl) {
    barEl.innerHTML = '';
    categories.forEach(c => {
      const seg = document.createElement('div');
      seg.className = 'size-bar-seg';
      seg.style.width = `${pct(c.bytes)}%`;
      seg.style.background = (CAT_META[c.key] || CAT_META.other).color;
      seg.title = `${c.label}: ${fmtSize(c.bytes)}`;
      barEl.appendChild(seg);
    });
  }

  // legend rows
  if (legendEl) {
    legendEl.innerHTML = '';
    categories.forEach(c => {
      const meta = CAT_META[c.key] || CAT_META.other;
      const row = document.createElement('div');
      row.className = 'size-leg-row';
      row.innerHTML =
        `<span class="size-swatch" style="background:${meta.color}"></span>` +
        `<span class="size-leg-name">${meta.icon} ${c.label}</span>` +
        `<span class="size-leg-pct">${pct(c.bytes).toFixed(0)}%</span>` +
        `<span class="size-leg-files">${c.files.toLocaleString()}f</span>` +
        `<span class="size-leg-val">${fmtSize(c.bytes)}</span>`;
      legendEl.appendChild(row);
    });
  }
}

function openModal()  { modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); }

if (btnSize && modal) {
  render();
  btnSize.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (doneBtn) doneBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
}

  };

  __mods["help"] = function (exports, require) {
/**
 * @module help
 * @description Player-facing HELP / RULES / PAYTABLE screen — written so the
 * content is fully TRACEABLE to the game's configuration (par-sheet.js). It is a
 * paged, scrollable modal opened from the options drawer (📖 HELP).
 *
 * Source of truth, by page:
 *   • Paytable awards .......... SYMBOLS[id].pays            (par-sheet.js)
 *   • Bet levels / min / max ... BET_LEVELS                  (par-sheet.js)
 *   • Ways / reels / rows ...... REEL_COUNT, ROWS_PER_REEL, 243-ways (mathcore.js evaluateGrid)
 *   • Win rule (L→R, +3, adds) . evaluateGrid()              (mathcore.js)
 *   • Wild behaviour ........... expandWilds() + REEL_COUNTS (centre reel only)
 *   • Bonus trigger / spins .... BONUS_CONFIG                (par-sheet.js)
 *   • House / jackpot awards ... BONUS_CONFIG.tiers / mansion (active-model scaled)
 *   • Buy-bonus price .......... BONUS_CONFIG.buyCostMult
 *   • Theoretical RTP .......... ACTIVE_MODEL.rtp / .label
 * Numbers are read at runtime, so they always match the active math model and can
 * never drift from the game. NO RTP/odds are invented; nothing claims certification.
 *
 * Note: the Wolf Wild lands only on the CENTRE reel (reel 3) in REEL_COUNTS, and
 * every comment in the codebase now reflects that; this screen states the same.
 */

const {
  SYMBOLS, BET_LEVELS, BONUS_CONFIG, ACTIVE_MODEL,
  REEL_COUNT, ROWS_PER_REEL, BONUS_TRIGGER_HATS, FREE_SPINS_INITIAL,
  RETRIGGER_HATS, MIN_WIN_SPAN,
} = require("par-sheet");
const { fmt } = require("utils");
const { narrator } = require("narrator");

/* ── formatting + art helpers ── */
const x2 = n => `${(Math.round(n * 100) / 100).toFixed(2)}×`;          // 35.70×
const x1 = n => `${(Math.round(n * 10) / 10).toFixed(1)}×`;            // 24.4×
const pct = n => `${(n * 100).toFixed(2)}%`;

// Names that match the ART the player actually sees on the reels (not internal ids).
const SYM_NAME = {
  'hat-yellow': 'Yellow Hard Hat', 'hat-green': 'White Hard Hat', 'hat-red': 'Red Hard Hat',
  'pig-suit': 'Sheriff Badge', 'pig-contractor': 'Horseshoe', 'pig-nature': 'Tornado', 'toolbox': 'Shot Glass',
  'wolf': 'Wolf', 'buzzard': 'Buzzard', 'wild': 'Wolf Wild',
  'royal-a': 'Ace', 'royal-k': 'King', 'royal-q': 'Queen', 'royal-j': 'Jack', 'royal-10': 'Ten',
};
function symArt(id, cls) {
  const s = SYMBOLS[id]; const name = SYM_NAME[id] || s.label;
  if (s.src) return `<img class="${cls}" src="${s.src}" alt="${name}">`;
  if (s.svgId) return `<svg class="${cls}" viewBox="0 0 200 200" role="img" aria-label="${name}"><use href="${s.svgId}"/></svg>`;
  return '';
}

// Paytable order: premiums (high→low), then royals.
const PAY_ORDER = ['hat-yellow', 'pig-suit', 'pig-contractor', 'hat-green', 'hat-red',
  'pig-nature', 'toolbox', 'wolf', 'buzzard', 'royal-a', 'royal-k', 'royal-q', 'royal-j', 'royal-10'];

function paytableRows() {
  return PAY_ORDER.filter(id => SYMBOLS[id] && SYMBOLS[id].pays).map(id => {
    const p = SYMBOLS[id].pays;
    const hat = SYMBOLS[id].isHat ? ' <span class="help-tag">bonus symbol</span>' : '';
    return `<tr>
      <td class="help-ptsym">${symArt(id, 'help-sym')}</td>
      <td class="help-ptname">${SYM_NAME[id]}${hat}</td>
      <td>${p[5] != null ? x2(p[5]) : '—'}</td>
      <td>${p[4] != null ? x2(p[4]) : '—'}</td>
      <td>${p[3] != null ? x2(p[3]) : '—'}</td>
    </tr>`;
  }).join('');
}

/* ── build the pages (read once; config is static at load) ── */
function buildPages() {
  const t1 = BONUS_CONFIG.tiers[1], t2 = BONUS_CONFIG.tiers[2], t3 = BONUS_CONFIG.tiers[3], m = BONUS_CONFIG.mansion;
  const minBet = fmt(BET_LEVELS[0]), maxBet = fmt(BET_LEVELS[BET_LEVELS.length - 1]);
  const buyMult = BONUS_CONFIG.buyCostMult;

  const pages = [
    { nav: 'How to Play', title: 'How to Play', html: `
      <p>Big Bad Wolf Saloon is a <b>${REEL_COUNT}-reel, ${ROWS_PER_REEL}-row</b> video slot with <b>243 ways to win</b> and a Hard-Hat Free Spins bonus.</p>
      <h4>Objective</h4>
      <p>Land matching symbols on adjacent reels to form winning combinations. Collect <b>${BONUS_TRIGGER_HATS} or more Hard Hats</b> to enter the bonus, where the Big Bad Wolf blows down houses for prizes.</p>
      <h4>To play</h4>
      <ul>
        <li>Use the <b>&minus;</b> and <b>+</b> buttons to set your total bet.</li>
        <li>Press <b>SPIN</b> to play one spin at your selected bet.</li>
        <li>Use <b>AUTO SPIN</b> to spin repeatedly, and <b>TURBO</b> to speed up the reels.</li>
      </ul>
      <p class="help-note">This screen does not affect the game. While it is open, no spin, bet, win or feature can occur.</p>` },

    { nav: 'Bet & Credits', title: 'Betting &amp; Credits', html: `
      <p>Each spin costs your selected <b>total bet</b>. There are no separate line bets — your total bet covers all 243 ways.</p>
      <h4>Available bets</h4>
      <p class="help-bets">${BET_LEVELS.map(b => `<span>${fmt(b)}</span>`).join('')}</p>
      <p>Minimum bet <b>${minBet}</b> &nbsp;·&nbsp; Maximum bet <b>${maxBet}</b>. The bet changes one step at a time between these levels.</p>
      <h4>On-screen meters</h4>
      <ul>
        <li><b>CASH</b> — your available balance.</li>
        <li><b>BET</b> — your current total bet for the next spin.</li>
        <li><b>WIN</b> — the amount won on the most recent spin.</li>
      </ul>
      <p>All wins are added to your balance. All awards in this help are shown as multiples of your <b>total bet</b>.</p>` },

    { nav: 'How Wins Pay', title: 'How Wins Are Paid', html: `
      <ul>
        <li><b>243 ways:</b> wins are paid for matching symbols on <b>adjacent reels, left to right, starting from reel 1</b> — symbols may be in any row.</li>
        <li>A minimum of <b>${MIN_WIN_SPAN} matching symbols</b> is required (3, 4, or 5 of a kind).</li>
        <li>The number of <b>ways</b> a symbol wins is the product of how many times it appears on each winning reel.</li>
        <li><b>Win = (ways) &times; (the symbol's paytable value for that many reels) &times; (your total bet).</b></li>
        <li>Different symbols can win on the same spin; <b>all wins are added together</b>.</li>
        <li>Each symbol pays only its <b>longest</b> left-to-right combination.</li>
        <li>The <b>Wolf Wild</b> substitutes for all symbols except the Hard Hats (see the Wolf Wild page).</li>
      </ul>
      <p class="help-note">Symbols land independently on every spin; previous results do not influence future ones.</p>` },

    { nav: 'Paytable', title: 'Paytable', html: `
      <p>Values are the award for <b>5, 4, or 3</b> matching symbols on adjacent reels, <b>per way</b>, multiplied by your total bet. They reflect the current game configuration (<b>${ACTIVE_MODEL.label}</b>).</p>
      <table class="help-paytable">
        <thead><tr><th colspan="2">Symbol</th><th>5&times;</th><th>4&times;</th><th>3&times;</th></tr></thead>
        <tbody>${paytableRows()}</tbody>
      </table>` },

    { nav: 'Wolf Wild', title: 'The Wolf Wild', html: `
      <div class="help-feature">${symArt('wild', 'help-sym-lg')}
        <div>
          <p>The <b>Wolf Wild</b> appears on the <b>centre reel only</b>.</p>
          <ul>
            <li>When a Wolf Wild lands, the <b>entire centre reel becomes Wild</b>.</li>
            <li>It <b>substitutes for all symbols except the Hard Hats</b>.</li>
            <li>The Wolf Wild has <b>no award of its own</b> — it only helps other symbols form wins.</li>
          </ul>
        </div>
      </div>` },

    { nav: 'Hard Hats', title: 'Hard Hats &amp; Bonus Trigger', html: `
      <div class="help-hats">${symArt('hat-yellow', 'help-sym')}${symArt('hat-green', 'help-sym')}${symArt('hat-red', 'help-sym')}</div>
      <ul>
        <li>The <b>Hard Hats</b> (Yellow, White, Red) pay in combinations like other symbols <em>and</em> act as the <b>bonus symbol</b>.</li>
        <li>Land <b>${BONUS_TRIGGER_HATS} or more Hard Hats anywhere</b> on the reels to trigger the <b>Hard-Hat Free Spins</b> bonus.</li>
        <li>The Wolf Wild does <b>not</b> substitute for Hard Hats.</li>
      </ul>` },

    { nav: 'Bonus Feature', title: 'Hard-Hat Free Spins', html: `
      <p><b>Triggered by ${BONUS_TRIGGER_HATS}+ Hard Hats.</b> The feature awards <b>${FREE_SPINS_INITIAL} free spins</b>, played at the same bet as the triggering spin.</p>
      <h4>During the free spins</h4>
      <ul>
        <li>The triggering Hard Hats become <b>Straw houses</b> on their positions.</li>
        <li>Line wins still pay during free spins.</li>
        <li>Each Hard Hat that lands <b>upgrades the house</b> on its position: <b>Straw &rarr; Stick &rarr; Brick</b>.</li>
        <li>Land <b>${RETRIGGER_HATS} or more Hard Hats in a single free spin</b> to win <b>+1 free spin</b>.</li>
        <li><b>Mansion Feature:</b> when a new Brick house completes and <b>${m.minBricks}+ Brick houses</b> stand, you win <b>${x1(m.baseMult)} your bet, plus up to ${x1(m.perBrickMult)} per Brick house</b>. It can be awarded more than once.</li>
      </ul>
      <h4>End of the bonus — the wolf blows the houses down</h4>
      <table class="help-paytable help-bonustable">
        <thead><tr><th>House</th><th>Award (&times; your bet)</th></tr></thead>
        <tbody>
          <tr><td><img class="help-house" src="assets/bonus_pig_straw.webp" alt=""> Straw</td><td>${x2(t1.min)} to ${x2(t1.max)}</td></tr>
          <tr><td><img class="help-house" src="assets/bonus_pig_wood.webp" alt=""> Stick</td><td>${x2(t2.min)} to ${x2(t2.max)}${t2.jackpotMult ? ` &nbsp;·&nbsp; rare <b>MINI JACKPOT ${x2(t2.jackpotMult)}</b>` : ''}</td></tr>
          <tr><td><img class="help-house" src="assets/bonus_pig_brick.webp" alt=""> Brick</td><td>${x2(t3.min)} to ${x2(t3.max)}${t3.jackpotMult ? ` &nbsp;·&nbsp; rare <b>MINOR JACKPOT ${x2(t3.jackpotMult)}</b>` : ''}</td></tr>
        </tbody>
      </table>
      <p>When every house has been blown down, play returns to the base game.</p>` },

    { nav: 'Buy Bonus', title: 'Buy Bonus', html: `
      <p>Instead of waiting for ${BONUS_TRIGGER_HATS} Hard Hats, you may <b>buy the Hard-Hat Free Spins bonus</b> directly.</p>
      <ul>
        <li>Cost: <b>${buyMult}&times; your current total bet</b> (for example, at a ${fmt(1)} bet the cost is ${fmt(buyMult)}).</li>
        <li>A confirmation is shown before any purchase.</li>
        <li>The bought bonus plays <b>exactly like a triggered bonus</b>, with the same rules and awards.</li>
      </ul>` },

    { nav: 'Auto &amp; Turbo', title: 'Auto Spin &amp; Turbo', html: `
      <ul>
        <li><b>AUTO SPIN</b> spins repeatedly at your selected bet until you stop it or your balance is insufficient.</li>
        <li><b>TURBO</b> speeds up the reel animation only — it does not change the game outcome.</li>
      </ul>` },

    { nav: 'Rules', title: 'Additional Rules', html: `
      <ul>
        <li><b>Theoretical Return to Player (RTP):</b> ${pct(ACTIVE_MODEL.rtp)} (configuration: ${ACTIVE_MODEL.label}).</li>
        <li>Game outcomes are determined by a <b>random number generator</b>.</li>
        <li>All wins are multiplied by your <b>total bet</b>.</li>
        <li>Each symbol pays only its highest (longest) combination; wins from different symbols are added.</li>
        <li><b>Malfunction voids all pays and plays.</b></li>
        <li>Please play responsibly.</li>
      </ul>
      <p class="help-note">This help reflects the current game configuration: <b>${ACTIVE_MODEL.label} — RTP ${pct(ACTIVE_MODEL.rtp)}</b>.</p>` },
  ];
  // Split across two buttons so neither screen has too many tabs:
  //   HELP  = how to play, betting, buy bonus, auto/turbo  (indices 0,1,7,8)
  //   RULES = how wins pay, paytable, wild, hats, bonus, additional rules
  const HELP_PAGES = new Set([0, 1, 7, 8]);
  pages.forEach((p, i) => { p.group = HELP_PAGES.has(i) ? 'help' : 'rules'; });
  return pages;
}

/* ── modal wiring (one modal, two entry points: HELP and RULES) ── */
const modal = document.getElementById('help-modal');
const btnHelp = document.getElementById('btn-help');
const btnRules = document.getElementById('btn-rules');
const btnClose = document.getElementById('btn-close-help');
const contentEl = document.getElementById('help-content');
const tocEl = document.getElementById('help-toc');
const indEl = document.getElementById('help-pageind');
const prevBtn = document.getElementById('help-prev');
const nextBtn = document.getElementById('help-next');
const titleEl = document.getElementById('help-title');

if (modal && contentEl) {
  let PAGES = null;     // all pages
  let view = [];        // the current group's subset
  let group = 'help';
  let page = 0;
  const ICON = { help: '📖', rules: '📋' };

  function render() {
    const p = view[page]; if (!p) return;
    titleEl.innerHTML = `${ICON[group]} ${p.title}`;
    contentEl.innerHTML = p.html;
    contentEl.scrollTop = 0;
    indEl.textContent = `${page + 1} / ${view.length}`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page === view.length - 1;
    [...tocEl.children].forEach((chip, i) => chip.classList.toggle('active', i === page));
  }

  function buildToc() {
    tocEl.innerHTML = '';
    view.forEach((p, i) => {
      const chip = document.createElement('button');
      chip.className = 'help-chip';
      chip.type = 'button';
      chip.innerHTML = p.nav;
      chip.addEventListener('click', () => { page = i; render(); });
      tocEl.appendChild(chip);
    });
  }

  function open(g) {
    if (!PAGES) PAGES = buildPages();
    group = g;
    view = PAGES.filter(p => p.group === g);
    page = 0;
    buildToc();
    render();
    modal.classList.remove('hidden');
  }
  function close() { modal.classList.add('hidden'); narrator.onMenuReturn(); }

  if (btnHelp) btnHelp.addEventListener('click', () => open('help'));
  if (btnRules) btnRules.addEventListener('click', () => open('rules'));
  if (btnClose) btnClose.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  prevBtn.addEventListener('click', () => { if (page > 0) { page--; render(); } });
  nextBtn.addEventListener('click', () => { if (page < view.length - 1) { page++; render(); } });
  document.addEventListener('keydown', e => {
    if (modal.classList.contains('hidden')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && page > 0) { page--; render(); }
    else if (e.key === 'ArrowRight' && page < view.length - 1) { page++; render(); }
  });
}

  };

  __mods["math-breakdown"] = function (exports, require) {
/**
 * @module math-breakdown
 * @description The 🧮 MATH pop-up: a plain-English breakdown of RTP (base vs
 * bonus), the bonus trigger rate, and the reel composition. Everything is
 * derived from the live constants and a quick run of the shared simulation
 * engine, so it always reflects the real par sheet.
 */

const { SYMBOLS, HAT_IDS, REEL_STRIPS } = require("par-sheet");
const { runSimulation } = require("simulator");

const btnMath  = document.getElementById('btn-math');
const modal    = document.getElementById('math-modal');
const btnClose = document.getElementById('btn-close-math');

// The bonus is high-variance (rare mansion / brick jackpots), so a 1M-spin sample
// wobbles a few % between opens. 2M keeps the headline RTP steadier (±~0.6%) while
// still finishing quickly (see the larger CHUNK in simulator.js).
const RTP_SPINS = 2_000_000;
let lastResult = null;          // cache so re-opening is instant

function openPanel() {
  modal.classList.remove('hidden');
  renderComposition();          // instant — pure data
  if (lastResult) renderRtp(lastResult);
  runRtpEstimate();             // refresh RTP in the background
}

/* ── reel composition (instant) ── */
function renderComposition() {
  const total = REEL_STRIPS.reduce((sum, strip) => sum + strip.length, 0);
  document.getElementById('math-total-positions').textContent = total;

  const symIds = Object.keys(SYMBOLS);
  const counts = {};
  symIds.forEach(id => { counts[id] = 0; });
  REEL_STRIPS.forEach(strip => strip.forEach(id => { counts[id]++; }));

  let hatTotal = 0;
  HAT_IDS.forEach(id => { hatTotal += counts[id]; });
  document.getElementById('math-hat-callout').innerHTML =
    `🦺 <b>Hard hats</b> (the bonus trigger) are <b>${((hatTotal / total) * 100).toFixed(1)}%</b> of all ` +
    `reel positions — ${hatTotal} of ${total}. The rarer they are, the rarer the bonus.`;

  const rows = symIds
    .map(id => ({ label: SYMBOLS[id].label, count: counts[id], isHat: !!SYMBOLS[id].isHat }))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...rows.map(r => r.count));

  const body = document.getElementById('math-comp-body');
  body.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td class="mc-name">${r.label}${r.isHat ? ' <span class="mc-tag">HAT</span>' : ''}</td>` +
      `<td class="mc-count">${r.count}</td>` +
      `<td class="mc-barcell"><span class="mc-bar${r.isHat ? ' is-hat' : ''}" style="width:${(r.count / maxCount) * 100}%"></span></td>` +
      `<td class="mc-pct">${((r.count / total) * 100).toFixed(1)}%</td>`;
    body.appendChild(tr);
  }
}

/* ── RTP + trigger rate (async sim) ── */
async function runRtpEstimate() {
  const totalEl = document.getElementById('math-rtp-total');
  totalEl.classList.add('is-loading');
  document.getElementById('math-rtp-note').textContent = `Crunching ${RTP_SPINS.toLocaleString()} simulated spins…`;
  let R;
  try {
    R = await runSimulation(RTP_SPINS, 1, 1000);
  } catch (err) {
    document.getElementById('math-rtp-note').textContent = 'Could not estimate RTP: ' + err.message;
    totalEl.classList.remove('is-loading');
    return;
  }
  lastResult = R;
  totalEl.classList.remove('is-loading');
  renderRtp(R);
}

function renderRtp(R) {
  const base = R.baseWon / R.totalWagered;
  const bonus = R.bonusWon / R.totalWagered;
  const total = base + bonus;

  document.getElementById('math-rtp-total').textContent = (total * 100).toFixed(1) + '%';
  document.getElementById('math-rtp-base').textContent = (base * 100).toFixed(1) + '%';
  document.getElementById('math-rtp-bonus').textContent = (bonus * 100).toFixed(1) + '%';
  document.getElementById('math-bar-base').style.width = (total > 0 ? (base / total) * 100 : 0) + '%';
  document.getElementById('math-bar-bonus').style.width = (total > 0 ? (bonus / total) * 100 : 0) + '%';

  const edge = (1 - total) * 100;
  const noteEl = document.getElementById('math-rtp-note');
  if (edge >= 0) {
    noteEl.innerHTML = `For every <b>$100</b> wagered, players get back about <b>$${(total * 100).toFixed(0)}</b> ` +
      `over the long run. The house keeps about <b>${edge.toFixed(1)}%</b>.`;
  } else {
    noteEl.innerHTML = `⚠ Players currently get back <b>${(total * 100).toFixed(0)}%</b> — more than they wager. ` +
      `This game pays out too much and needs balancing.`;
  }

  const oneIn = R.bonusTriggers > 0 ? Math.round(RTP_SPINS / R.bonusTriggers) : 0;
  document.getElementById('math-trigger-rate').textContent =
    oneIn > 0 ? `about 1 in ${oneIn.toLocaleString()} spins` : 'effectively never';
}

if (btnMath && modal) {
  btnMath.addEventListener('click', openPanel);
  btnClose.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
}

  };

  __mods["options-drawer"] = function (exports, require) {
/**
 * @module options-drawer
 * @description The right-side options drawer. Clicking the edge handle slides the
 * panel open/closed; clicking anywhere outside closes it. The buttons inside keep
 * their original IDs, so their behaviour is wired by their own modules — this
 * module only handles the open/close of the drawer itself.
 */

const drawer = document.getElementById('options-drawer');
const tab    = document.getElementById('options-tab');

if (drawer && tab) {
  tab.addEventListener('click', e => { e.stopPropagation(); drawer.classList.toggle('open'); });

  // close when clicking outside the drawer
  document.addEventListener('click', e => {
    if (drawer.classList.contains('open') && !drawer.contains(e.target)) {
      drawer.classList.remove('open');
    }
  });

  // tidy up: close the drawer when an option opens a full-screen modal
  ['btn-rtp', 'btn-size', 'btn-deposit', 'btn-buy-bonus', 'btn-help', 'btn-rules', 'btn-simulate', 'btn-math', 'btn-seo', 'btn-force-extreme', 'btn-force-wild', 'btn-demo-mansion', 'btn-web-push'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', () => drawer.classList.remove('open'));
  });
}

  };

  __mods["rtp-picker"] = function (exports, require) {
/**
 * @module rtp-picker
 * @description The RTP picker — a popup (opened from the options drawer) that
 * lets the player choose which math model the game runs. The list of choices is
 * rendered straight from RTP_MODELS in par-sheet.js, so adding a model there makes
 * a new card appear here automatically; no UI edits needed.
 *
 * Selecting a card calls applyRtpModel(), which records the choice in shared
 * state. There is currently a single model, so switching is a no-op beyond the
 * UI; when a second model is added, applyRtpModel() is the one place to also
 * swap the active reel strips / bonus tables.
 */

const { RTP_MODELS, RTP_MODEL_KEY, ACTIVE_MODEL_ID } = require("par-sheet");
const { state } = require("state");
const { synth } = require("sound");

const btnRtp   = document.getElementById('btn-rtp');
const modal    = document.getElementById('rtp-modal');
const closeBtn = document.getElementById('btn-close-rtp');
const doneBtn  = document.getElementById('btn-rtp-done');
const optionsEl = document.getElementById('rtp-options');

const pct = rtp => `${(rtp * 100).toFixed(0)}%`;

/** Build one selectable card per model (once). */
function renderOptions() {
  if (!optionsEl) return;
  optionsEl.innerHTML = '';
  RTP_MODELS.forEach(model => {
    const card = document.createElement('button');
    card.className = 'rtp-option';
    card.dataset.id = model.id;
    card.innerHTML = `
      <span class="rtp-check" aria-hidden="true">✓</span>
      <span class="rtp-pct">${pct(model.rtp)}</span>
      <span class="rtp-text">
        <span class="rtp-name">${model.label}</span>
        <span class="rtp-blurb">${model.blurb}</span>
      </span>`;
    card.addEventListener('click', () => applyRtpModel(model.id));
    optionsEl.appendChild(card);
  });
  markSelected();
}

/** Highlight whichever card matches the active model. */
function markSelected() {
  if (!optionsEl) return;
  optionsEl.querySelectorAll('.rtp-option').forEach(card => {
    card.classList.toggle('selected', card.dataset.id === state.rtpModelId);
  });
}

/**
 * Select a model. Persists the choice and updates the UI. The active math is
 * applied at load (par-sheet.js scales the pays/awards to the chosen model), so
 * a switch only takes full effect after a reload — done from the DONE button.
 */
function applyRtpModel(id) {
  if (!RTP_MODELS.some(m => m.id === id)) return;
  const changed = state.rtpModelId !== id;
  state.rtpModelId = id;
  try { localStorage.setItem(RTP_MODEL_KEY, id); } catch (e) {}
  markSelected();
  if (changed) synth.coinClink();
}

function openModal()  { markSelected(); modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); }

/** Close — and if a different model was chosen, reload so the new math applies everywhere. */
function done() {
  if (state.rtpModelId !== ACTIVE_MODEL_ID) { try { location.reload(); return; } catch (e) {} }
  closeModal();
}

if (btnRtp && modal) {
  renderOptions();
  btnRtp.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (doneBtn) doneBtn.addEventListener('click', done);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
}

Object.assign(exports, { applyRtpModel });

  };

  __mods["seo-info"] = function (exports, require) {
/**
 * @module seo-info
 * @description Dev-only "🔍 SEO" popup. Explains, for the team, how the site is
 * optimized so search engines and social platforms can find, understand, and
 * rank it. Purely informational — it reads nothing and changes nothing. The
 * actual optimizations live in index.html (head + crawlable content), styles.css
 * (.sr-only), robots.txt and sitemap.xml.
 */

const SECTIONS = [
  ['Page metadata', [
    'Keyword-rich <code>&lt;title&gt;</code> and a compelling 160-character meta description.',
    'Canonical URL set, so duplicate/variant URLs don’t split ranking.',
    '<code>robots</code> directive allows indexing with large image previews.',
    '<code>keywords</code> + <code>author</code> tags for completeness.',
  ]],
  ['Indexable content (the big one for a JS game)', [
    'The game UI is drawn by JavaScript, which crawlers see as an empty page.',
    'So a real, accurate <code>&lt;h1&gt;</code> + description + feature list is in the HTML, hidden visually with the screen-reader <code>.sr-only</code> technique (not <code>display:none</code>, which Google ignores).',
    'Google now has genuine text to index for terms like “free online slot game” and “Wild-West slot” — and screen-reader users get a proper description too.',
  ]],
  ['Structured data (rich results)', [
    'Schema.org <code>VideoGame</code> JSON-LD describes the game: name, genre (Casino / Slot / Arcade), platform, single-player, free to play.',
    'Makes the page eligible for richer search listings and helps Google classify it correctly.',
  ]],
  ['Social sharing (link previews)', [
    'Open Graph + Twitter Card tags, so links unfurl with a title, description and image on Facebook, X, iMessage, Discord, Slack and LinkedIn.',
    'A purpose-built 1200×630 share image (assets/og-image.png) — the wolf + logo + tagline.',
  ]],
  ['Crawl directives', [
    '<code>robots.txt</code> allows crawling and points to the sitemap (dev-only /tools and /docs are disallowed).',
    '<code>sitemap.xml</code> lists the canonical URL for fast discovery.',
  ]],
  ['Speed & mobile (real ranking signals)', [
    'Core Web Vitals: only ~15 MB loads before first play; decorative/bonus assets are deferred.',
    'WebP art, lazy media, and a static-idle render path keep it smooth on phones.',
    'Responsive, installable PWA with viewport + theme-color — mobile-friendliness is a ranking factor.',
  ]],
  ['Honest & compliant', [
    'Described accurately as a <b>free, virtual-credit</b> game — fun casino-style play with <b>no real-money wagering</b>.',
    'No misleading claims, hidden keyword stuffing, or fake reviews — just genuine, relevant content.',
  ]],
];

const NEXT_STEPS = [
  'Verify the site in Google Search Console and submit the sitemap.',
  'If you add a custom domain, update the canonical URL, og:url, robots.txt and sitemap.xml to match.',
  'Earn a few inbound links (your channel, socials, game directories) — the strongest off-page ranking factor.',
];

function buildHTML() {
  let h = '<p class="seo-intro">Big Bad Wolf Saloon is a single-page HTML5 game. These on-page optimizations help search engines and social platforms <b>discover, understand and rank</b> it. Everything here is already live.</p>';
  for (const [title, items] of SECTIONS) {
    h += `<div class="seo-sec"><h4>${title}</h4><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
  }
  h += `<div class="seo-sec seo-next"><h4>To rank even higher (team to-do)</h4><ol>${NEXT_STEPS.map(i => `<li>${i}</li>`).join('')}</ol></div>`;
  return h;
}

const modal = document.getElementById('seo-modal');
const btnSeo = document.getElementById('btn-seo');
const btnClose = document.getElementById('btn-close-seo');
const contentEl = document.getElementById('seo-content');

if (modal && contentEl) {
  let built = false;
  const open = () => { if (!built) { contentEl.innerHTML = buildHTML(); built = true; } modal.classList.remove('hidden'); };
  const close = () => modal.classList.add('hidden');
  if (btnSeo) btnSeo.addEventListener('click', open);
  if (btnClose) btnClose.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
}

  };

  __mods["simulator"] = function (exports, require) {
/**
 * @module simulator
 * @description The 📊 SIM dashboard: a chunked Monte-Carlo run over the real
 * game math (from mathcore) plus zero-dependency Canvas 2D charts. Exports
 * `runSimulation` so the MATH panel can reuse the exact same engine.
 */

const { SYMBOLS, HAT_IDS, BONUS_CONFIG } = require("par-sheet");
const { generateGrid, evaluateGrid, simulateBonusOutcome } = require("mathcore");

const btnSim        = document.getElementById('btn-simulate');
const simModal      = document.getElementById('sim-modal');
const btnCloseSim   = document.getElementById('btn-close-sim');
const btnRunSim     = document.getElementById('btn-run-sim');
const runLabel      = document.getElementById('sim-run-label');
const simSpinsEl    = document.getElementById('sim-spins');
const simBetEl      = document.getElementById('sim-bet');
const simBankrollEl = document.getElementById('sim-bankroll');
const progressWrap  = document.getElementById('sim-progress-wrap');
const progressFill  = document.getElementById('sim-progress-fill');
const progressText  = document.getElementById('sim-progress-text');
const elapsedEl     = document.getElementById('sim-elapsed');
const dashboard     = document.getElementById('sim-dashboard');
const insightsEl    = document.getElementById('sim-insights');

/* ══════════════════════════════════════════
   MONTE CARLO ENGINE (chunked async, uses mathcore)
══════════════════════════════════════════ */
async function runSimulation(totalSpins, bet, startBankroll) {
  const CHUNK = 4000;   // spins per yield — bigger = fewer timer yields = faster runs
  const R = {
    totalWagered: 0, totalWon: 0, baseWon: 0, bonusWon: 0,
    wins: 0, losses: 0, bonusTriggers: 0, bonusTotalFS: 0,
    maxWin: 0, maxMult: 0, symbolWins: {}, balanceHistory: [],
    winsByTier: { dead: 0, tiny: 0, small: 0, medium: 0, big: 0, mega: 0 },
    winsByTierPaid: { dead: 0, tiny: 0, small: 0, medium: 0, big: 0, mega: 0 },
    allMultipliers: [],
    currentWinStreak: 0, currentLossStreak: 0, maxWinStreak: 0, maxLossStreak: 0,
    startBankroll, bankrollSurvived: true, bustSpin: -1,
    peakBalance: startBankroll, troughBalance: startBankroll,
  };
  Object.keys(SYMBOLS).forEach(id => { R.symbolWins[id] = { count: 0, totalPaid: 0 }; });

  let bal = startBankroll, processed = 0;
  const sampleRate = Math.max(1, Math.floor(totalSpins / 600));
  const startTime = performance.now();

  while (processed < totalSpins) {
    const end = Math.min(processed + CHUNK, totalSpins);
    for (let i = processed; i < end; i++) {
      R.totalWagered += bet;
      bal -= bet;

      const grid = generateGrid();
      let hatCount = 0;
      for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) if (HAT_IDS.includes(grid[r][row])) hatCount++;

      // Match the live game: a 6+-hat spin triggers the bonus and pays ONLY the
      // bonus — its base line/way wins are forfeited (base-game.js early-returns).
      let spinWin = 0;
      if (hatCount >= BONUS_CONFIG.triggerHats) {
        R.bonusTriggers++;
        const b = simulateBonusOutcome(bet, grid);
        spinWin = b.bonusWin;
        R.bonusWon += b.bonusWin;
        R.bonusTotalFS += b.freeSpins;
      } else {
        const { totalWin, winners } = evaluateGrid(grid, bet);
        spinWin = totalWin;
        R.baseWon += totalWin;
        winners.forEach(w => {
          if (R.symbolWins[w.symId]) { R.symbolWins[w.symId].count++; R.symbolWins[w.symId].totalPaid += w.winAmount; }
        });
      }

      R.totalWon += spinWin;
      bal += spinWin;
      const m = spinWin / bet;
      R.allMultipliers.push(m);

      if (spinWin > 0) {
        R.wins++;
        if (spinWin > R.maxWin) { R.maxWin = spinWin; R.maxMult = m; }
        R.currentWinStreak++; R.currentLossStreak = 0;
        if (R.currentWinStreak > R.maxWinStreak) R.maxWinStreak = R.currentWinStreak;
        if (m < 1)       { R.winsByTier.tiny++;   R.winsByTierPaid.tiny += spinWin; }
        else if (m < 3)  { R.winsByTier.small++;  R.winsByTierPaid.small += spinWin; }
        else if (m < 8)  { R.winsByTier.medium++; R.winsByTierPaid.medium += spinWin; }
        else if (m < 20) { R.winsByTier.big++;    R.winsByTierPaid.big += spinWin; }
        else             { R.winsByTier.mega++;   R.winsByTierPaid.mega += spinWin; }
      } else {
        R.losses++;
        R.winsByTier.dead++;
        R.currentLossStreak++; R.currentWinStreak = 0;
        if (R.currentLossStreak > R.maxLossStreak) R.maxLossStreak = R.currentLossStreak;
      }

      if (bal > R.peakBalance) R.peakBalance = bal;
      if (bal < R.troughBalance) R.troughBalance = bal;
      if (bal <= 0 && R.bankrollSurvived) { R.bankrollSurvived = false; R.bustSpin = i; }
      if (i % sampleRate === 0 || i === totalSpins - 1) R.balanceHistory.push({ spin: i, balance: bal });
    }
    processed = end;
    if (progressFill) {
      progressFill.style.width = Math.round((processed / totalSpins) * 100) + '%';
      progressText.textContent = `${processed.toLocaleString()} / ${totalSpins.toLocaleString()} spins`;
      elapsedEl.textContent = `${((performance.now() - startTime) / 1000).toFixed(1)}s`;
    }
    await new Promise(r => setTimeout(r, 0));
  }

  R.finalBalance = bal;
  R.elapsedMs = performance.now() - startTime;
  return R;
}

/* ══════════════════════════════════════════
   CANVAS CHART UTILITIES
══════════════════════════════════════════ */
function prepCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, w: rect.width, h: rect.height };
}

const CHART_FONT = "'Nunito', sans-serif";

function drawBarChart(canvas, labels, values, colors) {
  const { ctx, w, h } = prepCanvas(canvas);
  const pad = { top: 12, right: 16, bottom: 44, left: 52 };
  const cW = w - pad.left - pad.right, cH = h - pad.top - pad.bottom;
  const maxV = Math.max(...values, 1);
  const gap = cW / labels.length;
  const barW = Math.min(36, gap * 0.6);
  ctx.strokeStyle = 'rgba(0,191,255,.06)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + cH - (cH * i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = '#3A6A80'; ctx.font = `600 9px ${CHART_FONT}`; ctx.textAlign = 'right';
    ctx.fillText(maxV > 999 ? (maxV * i / 4 / 1000).toFixed(1) + 'k' : (maxV * i / 4).toFixed(0), pad.left - 6, y + 3);
  }
  labels.forEach((label, i) => {
    const x = pad.left + gap * i + (gap - barW) / 2;
    const bH = (values[i] / maxV) * cH;
    const y = pad.top + cH - bH;
    const grad = ctx.createLinearGradient(x, y, x, pad.top + cH);
    const c = colors[i % colors.length];
    grad.addColorStop(0, c); grad.addColorStop(1, c + '30');
    ctx.fillStyle = grad;
    const r = Math.min(3, barW / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + barW - r, y);
    ctx.arcTo(x + barW, y, x + barW, y + r, r);
    ctx.lineTo(x + barW, pad.top + cH); ctx.lineTo(x, pad.top + cH);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.fill();
    if (values[i] > 0) {
      ctx.fillStyle = c; ctx.font = `700 8px ${CHART_FONT}`; ctx.textAlign = 'center';
      ctx.fillText(values[i] > 999 ? (values[i] / 1000).toFixed(1) + 'k' : values[i], x + barW / 2, y - 4);
    }
    ctx.fillStyle = '#3A6A80'; ctx.font = `700 7.5px ${CHART_FONT}`; ctx.textAlign = 'center';
    ctx.save(); ctx.translate(x + barW / 2, h - pad.bottom + 14); ctx.rotate(-0.4);
    ctx.fillText(label, 0, 0); ctx.restore();
  });
}

function drawHBarChart(canvas, labels, values, colors, fmtVal) {
  const { ctx, w, h } = prepCanvas(canvas);
  const pad = { top: 6, right: 70, bottom: 6, left: 90 };
  const cW = w - pad.left - pad.right, cH = h - pad.top - pad.bottom;
  const maxV = Math.max(...values, 0.01);
  const barH = Math.min(20, (cH / labels.length) * 0.7);
  const gap = cH / labels.length;
  labels.forEach((label, i) => {
    const y = pad.top + gap * i + (gap - barH) / 2;
    const bW = (values[i] / maxV) * cW;
    const grad = ctx.createLinearGradient(pad.left, 0, pad.left + bW, 0);
    const c = colors[i % colors.length];
    grad.addColorStop(0, c); grad.addColorStop(1, c + '50');
    ctx.fillStyle = grad;
    const r = Math.min(3, barH / 2);
    ctx.beginPath();
    ctx.moveTo(pad.left, y + r); ctx.arcTo(pad.left, y, pad.left + r, y, r);
    ctx.lineTo(pad.left + bW - r, y); ctx.arcTo(pad.left + bW, y, pad.left + bW, y + r, r);
    ctx.lineTo(pad.left + bW, y + barH - r); ctx.arcTo(pad.left + bW, y + barH, pad.left + bW - r, y + barH, r);
    ctx.lineTo(pad.left, y + barH); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4A8899'; ctx.font = `700 9px ${CHART_FONT}`; ctx.textAlign = 'right';
    ctx.fillText(label.length > 12 ? label.slice(0, 12) + '…' : label, pad.left - 6, y + barH / 2 + 3);
    ctx.fillStyle = '#80C0D0'; ctx.font = `700 9px ${CHART_FONT}`; ctx.textAlign = 'left';
    ctx.fillText(fmtVal ? fmtVal(values[i]) : values[i].toLocaleString(), pad.left + bW + 6, y + barH / 2 + 3);
  });
}

function drawLineChart(canvas, points, startBankroll) {
  const { ctx, w, h } = prepCanvas(canvas);
  const pad = { top: 12, right: 16, bottom: 30, left: 58 };
  const cW = w - pad.left - pad.right, cH = h - pad.top - pad.bottom;
  if (points.length < 2) return;
  const minB = Math.min(...points.map(p => p.balance));
  const maxB = Math.max(...points.map(p => p.balance));
  const range = maxB - minB || 1;
  const maxS = points[points.length - 1].spin;
  const toX = s => pad.left + (s / maxS) * cW;
  const toY = b => pad.top + cH - ((b - minB) / range) * cH;
  ctx.strokeStyle = 'rgba(0,191,255,.05)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + cH * (1 - i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = '#3A6A80'; ctx.font = `600 9px ${CHART_FONT}`; ctx.textAlign = 'right';
    ctx.fillText('$' + (minB + range * i / 4).toFixed(0), pad.left - 6, y + 3);
  }
  const sY = toY(startBankroll);
  if (sY >= pad.top && sY <= pad.top + cH) {
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,170,0,.25)';
    ctx.beginPath(); ctx.moveTo(pad.left, sY); ctx.lineTo(w - pad.right, sY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,170,0,.4)'; ctx.font = `600 8px ${CHART_FONT}`; ctx.textAlign = 'left';
    ctx.fillText('START $' + startBankroll, pad.left + 4, sY - 4);
  }
  const finalBal = points[points.length - 1].balance;
  const lineColor = finalBal >= startBankroll ? '#2EE85A' : '#FF6060';
  ctx.beginPath();
  points.forEach((p, i) => { const x = toX(p.spin), y = toY(p.balance); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.strokeStyle = lineColor; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.lineTo(toX(maxS), pad.top + cH); ctx.lineTo(toX(0), pad.top + cH); ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
  grad.addColorStop(0, lineColor === '#2EE85A' ? 'rgba(46,232,90,.12)' : 'rgba(255,96,96,.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = grad; ctx.fill();
  const fx = toX(maxS), fy = toY(finalBal);
  ctx.fillStyle = lineColor; ctx.beginPath(); ctx.arc(fx, fy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lineColor; ctx.font = `800 10px ${CHART_FONT}`; ctx.textAlign = 'right';
  ctx.fillText('$' + finalBal.toFixed(0), fx - 8, fy - 6);
  ctx.fillStyle = '#3A6A80'; ctx.font = `600 9px ${CHART_FONT}`; ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) { const s = Math.round(maxS * i / 4); ctx.fillText(s.toLocaleString(), toX(s), h - pad.bottom + 16); }
}

function drawDonutChart(canvas, labels, values, colors) {
  const { ctx, w, h } = prepCanvas(canvas);
  const cx = w * 0.38, cy = h / 2;
  const outerR = Math.min(cx - 8, cy - 8);
  const innerR = outerR * 0.58;
  const total = values.reduce((a, b) => a + b, 0) || 1;
  let angle = -Math.PI / 2;
  labels.forEach((label, i) => {
    const slice = (values[i] / total) * Math.PI * 2;
    if (slice < 0.005) { angle += slice; return; }
    ctx.beginPath(); ctx.arc(cx, cy, outerR, angle, angle + slice);
    ctx.arc(cx, cy, innerR, angle + slice, angle, true); ctx.closePath();
    ctx.fillStyle = colors[i % colors.length]; ctx.fill();
    ctx.strokeStyle = 'rgba(8,14,20,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR); ctx.stroke();
    const mid = angle + slice / 2;
    const pct = (values[i] / total * 100);
    if (pct > 2.5) {
      const lx = cx + Math.cos(mid) * (outerR + 14);
      const ly = cy + Math.sin(mid) * (outerR + 14);
      ctx.fillStyle = '#5A9AAA'; ctx.font = `700 8px ${CHART_FONT}`;
      ctx.textAlign = lx > cx ? 'left' : 'right';
      ctx.fillText(label, lx, ly + 2);
      ctx.fillStyle = '#80C0D0';
      ctx.fillText(pct.toFixed(1) + '%', lx, ly + 13);
    }
    angle += slice;
  });
  ctx.fillStyle = '#40D8FF'; ctx.font = `800 13px 'Rye', serif`; ctx.textAlign = 'center';
  ctx.fillText(total.toLocaleString(), cx, cy + 4);
  ctx.fillStyle = '#3A6A80'; ctx.font = `700 7px ${CHART_FONT}`;
  ctx.fillText('TOTAL SPINS', cx, cy + 16);
}

/* ══════════════════════════════════════════
   STATS HELPERS
══════════════════════════════════════════ */
function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sortedArr[lo] : sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}
function confidenceInterval95(multipliers, n) {
  const mean = multipliers.reduce((a, b) => a + b, 0) / n;
  const variance = multipliers.reduce((s, m) => s + (m - mean) ** 2, 0) / n;
  const margin = 1.96 * Math.sqrt(variance / n);
  return { mean, lower: (mean - margin) * 100, upper: (mean + margin) * 100, margin: margin * 100 };
}

/* ══════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════ */
function renderDashboard(R, totalSpins, bet) {
  dashboard.classList.remove('hidden');
  const rtp = (R.totalWon / R.totalWagered) * 100;
  const hitRate = (R.wins / totalSpins) * 100;
  const bonusFreq = R.bonusTriggers > 0 ? totalSpins / R.bonusTriggers : Infinity;
  const avgWin = R.wins > 0 ? R.totalWon / R.wins : 0;
  const baseRtp = (R.baseWon / R.totalWagered) * 100;
  const bonusRtp = (R.bonusWon / R.totalWagered) * 100;

  const meanM = R.allMultipliers.reduce((a, b) => a + b, 0) / R.allMultipliers.length;
  const variance = R.allMultipliers.reduce((s, m) => s + (m - meanM) ** 2, 0) / R.allMultipliers.length;
  const stdDev = Math.sqrt(variance);
  let volLabel, volClass;
  if (stdDev < 2)       { volLabel = 'LOW';       volClass = 'is-good'; }
  else if (stdDev < 5)  { volLabel = 'MEDIUM';    volClass = 'is-warn'; }
  else if (stdDev < 15) { volLabel = 'HIGH';      volClass = 'is-warn'; }
  else                  { volLabel = 'VERY HIGH'; volClass = 'is-bad'; }

  const ci = confidenceInterval95(R.allMultipliers, totalSpins);
  const sorted = [...R.allMultipliers].sort((a, b) => a - b);
  const medianMult = percentile(sorted, 50);

  const set = (id, text, cls) => { const el = document.getElementById(id); if (el) { el.textContent = text; if (cls !== undefined) el.className = cls; } };
  const sub = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  set('kpi-rtp', rtp.toFixed(2) + '%', 'sim-kpi-value ' + (rtp >= 94 ? 'is-good' : rtp >= 88 ? 'is-warn' : 'is-bad'));
  sub('kpi-rtp-sub', `$${R.totalWon.toFixed(0)} won / $${R.totalWagered.toFixed(0)} wagered`);
  const ciEl = document.getElementById('kpi-rtp-ci');
  if (ciEl) ciEl.textContent = `95% CI: ${ci.lower.toFixed(2)}% – ${ci.upper.toFixed(2)}% (±${ci.margin.toFixed(2)}%)`;
  set('kpi-hitrate', hitRate.toFixed(1) + '%', 'sim-kpi-value');
  sub('kpi-hitrate-sub', `${R.wins.toLocaleString()} wins / ${totalSpins.toLocaleString()} spins`);
  set('kpi-bonus', bonusFreq === Infinity ? 'N/A' : `1 : ${Math.round(bonusFreq)}`, 'sim-kpi-value');
  sub('kpi-bonus-sub', `${R.bonusTriggers} triggers (${R.bonusTotalFS} free spins)`);
  set('kpi-volatility', volLabel, 'sim-kpi-value ' + volClass);
  sub('kpi-volatility-sub', `σ = ${stdDev.toFixed(2)} · Variance = ${variance.toFixed(2)}`);
  set('kpi-maxwin', R.maxMult.toFixed(1) + '×', 'sim-kpi-value-sm is-warn');
  sub('kpi-maxwin-sub', `$${R.maxWin.toFixed(2)}`);
  set('kpi-avgwin', (avgWin / bet).toFixed(2) + '×', 'sim-kpi-value-sm');
  sub('kpi-avgwin-sub', `$${avgWin.toFixed(2)} per hit`);
  set('kpi-medwin', medianMult.toFixed(2) + '×', 'sim-kpi-value-sm');
  sub('kpi-medwin-sub', medianMult === 0 ? 'Most spins lose' : `$${(medianMult * bet).toFixed(2)}`);
  set('kpi-base-rtp', baseRtp.toFixed(1) + '%', 'sim-kpi-value-sm');
  sub('kpi-base-rtp-sub', `$${R.baseWon.toFixed(0)} base wins`);
  set('kpi-bonus-rtp', bonusRtp.toFixed(1) + '%', 'sim-kpi-value-sm' + (bonusRtp > 5 ? ' is-warn' : ''));
  sub('kpi-bonus-rtp-sub', `$${R.bonusWon.toFixed(0)} bonus wins`);
  set('kpi-maxloss', R.maxLossStreak + ' spins', 'sim-kpi-value-sm');
  sub('kpi-maxloss-sub', `$${(R.maxLossStreak * bet).toFixed(2)} drawdown`);
  set('kpi-maxwinstreak', R.maxWinStreak + ' spins', 'sim-kpi-value-sm is-good');
  sub('kpi-maxwinstreak-sub', 'Consecutive wins');
  const survived = R.bankrollSurvived;
  set('kpi-survived', survived ? 'YES ✓' : 'NO ✗', 'sim-kpi-value-sm ' + (survived ? 'is-good' : 'is-bad'));
  sub('kpi-survived-sub', survived ? `Final: $${R.finalBalance.toFixed(0)}` : `Bust at spin #${R.bustSpin.toLocaleString()}`);

  const insights = [];
  insights.push({ icon: '📊', text: `Over <strong>${totalSpins.toLocaleString()} spins</strong>, this game returned <strong>${rtp.toFixed(2)}%</strong> of total wagers. ${rtp >= 96 ? 'This is a generous RTP.' : rtp >= 92 ? 'This is a typical RTP for this volatility.' : 'This is below average RTP, likely due to variance.'}` });
  if (R.bonusTriggers > 0) insights.push({ icon: '🎰', text: `The bonus triggered <strong>${R.bonusTriggers} times</strong> (1 in ${Math.round(bonusFreq)} spins), contributing <strong>${bonusRtp.toFixed(1)}%</strong> to total RTP — that's <strong>${(bonusRtp / rtp * 100).toFixed(0)}%</strong> of all returns.` });
  insights.push({ icon: '📉', text: `Worst dry spell: <strong>${R.maxLossStreak} consecutive losses</strong> ($${(R.maxLossStreak * bet).toFixed(2)} lost). A player would need at least ${Math.ceil(R.maxLossStreak * 1.5)} bets in reserve to survive this.` });
  if (!survived) insights.push({ icon: '💀', text: `Starting with <strong>$${R.startBankroll}</strong>, the bankroll was depleted at spin <strong>#${R.bustSpin.toLocaleString()}</strong>. This represents ${(R.bustSpin / totalSpins * 100).toFixed(0)}% of the simulation.` });
  else { const pnl = R.finalBalance - R.startBankroll; insights.push({ icon: pnl >= 0 ? '💰' : '📉', text: `Starting with $${R.startBankroll}, the final balance was <strong>$${R.finalBalance.toFixed(2)}</strong> (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}). Peak: $${R.peakBalance.toFixed(0)}, Trough: $${R.troughBalance.toFixed(0)}.` }); }
  insights.push({ icon: '⏱️', text: `Simulation completed in <strong>${(R.elapsedMs / 1000).toFixed(2)}s</strong> (${Math.round(totalSpins / (R.elapsedMs / 1000)).toLocaleString()} spins/sec).` });
  insightsEl.innerHTML = insights.map(i => `<div class="insight-item"><span class="insight-icon">${i.icon}</span><span>${i.text}</span></div>`).join('');

  const balMeta = document.getElementById('chart-balance-meta');
  if (balMeta) balMeta.textContent = `Start: $${R.startBankroll} · Final: $${R.finalBalance.toFixed(0)} · Peak: $${R.peakBalance.toFixed(0)}`;
  drawLineChart(document.getElementById('chart-balance'), R.balanceHistory, R.startBankroll);

  const buckets = [0, 0.5, 1, 2, 3, 5, 8, 15, 25, 50, 100, 500];
  const bLabels = ['0×', '<0.5×', '<1×', '<2×', '<3×', '<5×', '<8×', '<15×', '<25×', '<50×', '<100×', '100×+'];
  const bCounts = new Array(buckets.length).fill(0);
  R.allMultipliers.forEach(m => {
    if (m === 0) { bCounts[0]++; return; }
    let placed = false;
    for (let b = 1; b < buckets.length; b++) { if (m < buckets[b]) { bCounts[b]++; placed = true; break; } }
    if (!placed) bCounts[buckets.length - 1]++;
  });
  const distMeta = document.getElementById('chart-dist-meta');
  if (distMeta) distMeta.textContent = `Dead spins: ${((bCounts[0] / totalSpins) * 100).toFixed(1)}% · Any win: ${hitRate.toFixed(1)}%`;
  const dColors = ['#1A2A35', '#1878A0', '#20A0CC', '#40D8FF', '#2EE85A', '#60EE80', '#FFD040', '#FF8800', '#FF5050', '#FF3080', '#CC30CC', '#8844FF'];
  drawBarChart(document.getElementById('chart-win-dist'), bLabels, bCounts, dColors);

  const symEntries = Object.entries(R.symbolWins).filter(([, v]) => v.count > 0).sort((a, b) => b[1].totalPaid - a[1].totalPaid);
  const symLabels = symEntries.map(([id]) => (SYMBOLS[id] && SYMBOLS[id].label) || id);
  const symPcts = symEntries.map(([, v]) => v.totalPaid / R.totalWagered * 100);
  // all 6-digit hex — drawHBarChart appends an alpha suffix that needs 6-digit input
  const sColors = ['#FFD040', '#40D8FF', '#2EE85A', '#FF8800', '#CC30CC', '#FF5050', '#22AACC', '#8844FF', '#60EE80', '#FF3080', '#AAAACC', '#DDAA44', '#44BBAA', '#BB6688'];
  drawHBarChart(document.getElementById('chart-sym-freq'), symLabels, symPcts, sColors, v => v.toFixed(2) + '%');

  const tLabels = ['Dead (0×)', 'Tiny (<1×)', 'Small (1-3×)', 'Med (3-8×)', 'Big (8-20×)', 'Mega (20×+)'];
  const tValues = [R.winsByTier.dead, R.winsByTier.tiny, R.winsByTier.small, R.winsByTier.medium, R.winsByTier.big, R.winsByTier.mega];
  const tColors = ['#182838', '#1878A0', '#40D8FF', '#2EE85A', '#FFD040', '#FF5050'];
  drawDonutChart(document.getElementById('chart-win-type'), tLabels, tValues, tColors);

  // tables
  const sTable = document.getElementById('table-symbol-stats') && document.getElementById('table-symbol-stats').querySelector('tbody');
  if (sTable) {
    sTable.innerHTML = '';
    symEntries.forEach(([id, v]) => {
      const pctRtp = (v.totalPaid / R.totalWagered * 100).toFixed(2);
      const avg = v.count > 0 ? (v.totalPaid / v.count).toFixed(2) : '0.00';
      const maxSpan = SYMBOLS[id] && SYMBOLS[id].pays ? Object.keys(SYMBOLS[id].pays).length : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${(SYMBOLS[id] && SYMBOLS[id].label) || id}</td><td>${v.count.toLocaleString()}</td><td>$${v.totalPaid.toFixed(2)}</td><td>${pctRtp}%</td><td>$${avg}</td><td>${maxSpan} ways</td>`;
      sTable.appendChild(tr);
    });
  }
  const tTable = document.getElementById('table-win-tiers') && document.getElementById('table-win-tiers').querySelector('tbody');
  if (tTable) {
    tTable.innerHTML = '';
    const tierKeys = ['dead', 'tiny', 'small', 'medium', 'big', 'mega'];
    const tierNames = ['Dead Spin (0×)', 'Tiny (<1×)', 'Small (1-3×)', 'Medium (3-8×)', 'Big (8-20×)', 'Mega (20×+)'];
    tierKeys.forEach((key, i) => {
      const count = R.winsByTier[key], paid = R.winsByTierPaid[key] || 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${tierNames[i]}</td><td>${count.toLocaleString()}</td><td>${(count / totalSpins * 100).toFixed(1)}%</td><td>$${paid.toFixed(2)}</td><td>${(paid / R.totalWagered * 100).toFixed(2)}%</td><td>${count > 0 ? '$' + (paid / count).toFixed(2) : '—'}</td>`;
      tTable.appendChild(tr);
    });
  }
  const pTable = document.getElementById('table-percentiles') && document.getElementById('table-percentiles').querySelector('tbody');
  if (pTable) {
    pTable.innerHTML = '';
    [{ p: 10, interp: 'Worst 10% of spins' }, { p: 25, interp: 'Below average spin (Q1)' }, { p: 50, interp: 'Median spin outcome' },
     { p: 75, interp: 'Above average spin (Q3)' }, { p: 90, interp: 'Top 10% lucky spin' }, { p: 95, interp: 'Exceptionally good spin' },
     { p: 99, interp: 'Top 1% — rare event' }, { p: 99.9, interp: 'Jackpot territory' }].forEach(({ p, interp }) => {
      const m = percentile(sorted, p);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>P${p}</td><td>${m.toFixed(2)}×</td><td>$${(m * bet).toFixed(2)}</td><td>${interp}</td>`;
      pTable.appendChild(tr);
    });
  }
  const bTable = document.getElementById('table-bonus-stats') && document.getElementById('table-bonus-stats').querySelector('tbody');
  if (bTable) {
    bTable.innerHTML = '';
    const avgBonusWin = R.bonusTriggers > 0 ? R.bonusWon / R.bonusTriggers : 0;
    const avgFS = R.bonusTriggers > 0 ? R.bonusTotalFS / R.bonusTriggers : 0;
    [['Total Bonus Triggers', R.bonusTriggers.toLocaleString()],
     ['Trigger Rate', bonusFreq === Infinity ? 'N/A' : `1 in ${Math.round(bonusFreq)} spins (${(1 / bonusFreq * 100).toFixed(3)}%)`],
     ['Total Bonus Win', `$${R.bonusWon.toFixed(2)}`],
     ['Avg Bonus Win', `$${avgBonusWin.toFixed(2)} (${(avgBonusWin / bet).toFixed(1)}× bet)`],
     ['Total Free Spins Played', R.bonusTotalFS.toLocaleString()],
     ['Avg Free Spins per Trigger', avgFS.toFixed(1)],
     ['Bonus Contribution to RTP', `${bonusRtp.toFixed(2)}% (${(bonusRtp / rtp * 100).toFixed(0)}% of total)`],
     ['Base Game RTP (without bonus)', `${baseRtp.toFixed(2)}%`]].forEach(([metric, value]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${metric}</td><td>${value}</td>`;
      bTable.appendChild(tr);
    });
  }
}

/* ══════════════════════════════════════════
   WIRING
══════════════════════════════════════════ */
if (btnSim) {
  btnSim.addEventListener('click', () => simModal.classList.remove('hidden'));
  btnCloseSim.addEventListener('click', () => simModal.classList.add('hidden'));
  simModal.addEventListener('click', e => { if (e.target === simModal) simModal.classList.add('hidden'); });
  btnRunSim.addEventListener('click', async () => {
    const totalSpins = parseInt(simSpinsEl.value);
    const bet = parseFloat(simBetEl.value);
    const bankroll = parseFloat(simBankrollEl.value);
    btnRunSim.disabled = true;
    runLabel.textContent = 'RUNNING…';
    btnRunSim.classList.add('is-running');
    progressWrap.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = `0 / ${totalSpins.toLocaleString()} spins`;
    elapsedEl.textContent = '';
    dashboard.classList.add('hidden');
    try {
      const R = await runSimulation(totalSpins, bet, bankroll);
      renderDashboard(R, totalSpins, bet);
    } catch (err) {
      console.error('Simulation error:', err);
      insightsEl.innerHTML = `<div class="insight-item"><span class="insight-icon">❌</span><span>Simulation failed: ${err.message}</span></div>`;
      dashboard.classList.remove('hidden');
    }
    btnRunSim.disabled = false;
    runLabel.textContent = 'RUN SIMULATION';
    btnRunSim.classList.remove('is-running');
    progressWrap.classList.add('hidden');
  });
}

Object.assign(exports, { runSimulation });

  };

  __mods["size-manifest"] = function (exports, require) {
/* AUTO-GENERATED by tools/build.js — folder-size snapshot. Do not edit. */

const SIZE_MANIFEST = {
  "totalBytes": 163234647,
  "fileCount": 788,
  "generatedAt": "2026-06-02",
  "player": {
    "bytes": 159023897,
    "files": 711
  },
  "dev": {
    "bytes": 4210750,
    "files": 77
  },
  "firstPlay": {
    "bytes": 17970874,
    "files": 72
  },
  "progressive": {
    "bytes": 141053023,
    "files": 639
  },
  "categories": [
    {
      "key": "video",
      "label": "Videos",
      "bytes": 102994558,
      "files": 54
    },
    {
      "key": "audio",
      "label": "Audio",
      "bytes": 38618059,
      "files": 611
    },
    {
      "key": "image",
      "label": "Images",
      "bytes": 16834939,
      "files": 43
    },
    {
      "key": "other",
      "label": "Other",
      "bytes": 3834979,
      "files": 26
    },
    {
      "key": "code",
      "label": "Code",
      "bytes": 952112,
      "files": 54
    }
  ]
};

Object.assign(exports, { SIZE_MANIFEST });

  };

  __mods["wins-info"] = function (exports, require) {
/**
 * @module wins-info
 * @description Dev-only "🎉 WINS" popup. Breaks down the win-celebration tiers —
 * what each on-screen banner is, the win size (as a multiple of the bet) that
 * triggers it, and example dollar amounts at the lowest, default and highest
 * bets. Everything is read from WIN_TIERS / BET_LEVELS, so the table can never
 * drift from what the game actually does (the same WIN_TIERS drive base-game.js).
 */

const { WIN_TIERS, BET_LEVELS, DEFAULT_BET_INDEX } = require("par-sheet");
const { fmt } = require("utils");
const { previewWin } = require("base-game");

const MIN_BET = BET_LEVELS[0];
const DEF_BET = BET_LEVELS[DEFAULT_BET_INDEX];
const MAX_BET = BET_LEVELS[BET_LEVELS.length - 1];

// The on-screen tiers, smallest → biggest. `mult` is the win ÷ bet threshold.
const TIERS = [
  { key: 'small',    cls: '',              name: 'Win',                 mult: 0,                  banner: 'Coins + count-up (no banner)' },
  { key: 'nice',     cls: '',              name: 'Piggy Payday',        mult: WIN_TIERS.nice,     banner: 'Bigger count-up + coins (no banner)' },
  { key: 'big',      cls: 'tier-big',      name: 'Big Win',             mult: WIN_TIERS.big,      banner: 'Full-screen banner + coins' },
  { key: 'mega',     cls: 'tier-mega',     name: 'Big Bad Win!',        mult: WIN_TIERS.mega,     banner: 'Banner (rainbow), louder' },
  { key: 'epic',     cls: 'tier-epic',     name: 'Big Bad Wolf Win!',   mult: WIN_TIERS.epic,     banner: 'Banner (blazing gold)' },
  { key: 'colossal', cls: 'tier-colossal', name: 'Wild Wolf Windfall!', mult: WIN_TIERS.colossal, banner: 'Top banner (rainbow-gold supernova)' },
];

function buildHTML() {
  const PREVIEWABLE = new Set(['big', 'mega', 'epic', 'colossal']);
  const rows = TIERS.map(t => {
    const at = (bet) => t.mult === 0 ? '—' : fmt(t.mult * bet);
    const trig = t.mult === 0 ? 'any win' : `≥ ${t.mult}×`;
    const can = PREVIEWABLE.has(t.key);
    const screen = can
      ? `${t.banner} <span class="wins-preview">▶&nbsp;Preview</span>`
      : t.banner;
    return `<tr class="${t.cls}${can ? ' previewable' : ''}"${can ? ` data-preview="${t.key}"` : ''}>
      <td class="win-tier">${t.name}</td>
      <td class="win-mult">${trig}</td>
      <td>${at(MIN_BET)}</td>
      <td>${at(DEF_BET)}</td>
      <td>${at(MAX_BET)}</td>
      <td class="win-screen">${screen}</td>
    </tr>`;
  }).join('');

  return `
    <p class="wins-intro">Wins are celebrated in tiers based on how big the win is <b>relative to your bet</b>
      (win &divide; bet). Because the thresholds are multiples of the bet, the dollar trigger scales with how
      much you wager — so the same spin is a “Big Win” at a low bet only if it pays a lot more in dollars at a
      high bet. The default bet is <b>${fmt(DEF_BET)}</b>.
      <br><b>Tip:</b> click any of the four banner tiers below (<b>Big Win</b> and up) to preview that
      celebration in the game (it shows the threshold &times; your current bet, and changes nothing).</p>
    <table class="wins-table">
      <thead><tr>
        <th>Celebration</th><th>Win&nbsp;&ge;</th>
        <th>@ ${fmt(MIN_BET)}</th><th>@ ${fmt(DEF_BET)}</th><th>@ ${fmt(MAX_BET)}</th>
        <th style="text-align:left;">On screen</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="wins-note"><b>Wild Wolf Windfall!</b> is the top celebration tier (≥ ${WIN_TIERS.colossal}× bet);
      <b>Big Bad Wolf Win!</b> (≥ ${WIN_TIERS.epic}× bet) matches the wolf’s biggest voice reaction. The tiers are
      multiples of the bet, so the dollar trigger scales with the wager (the US land-based convention). The
      bonus round has its own dedicated celebrations on top of these — the Mini &amp; Minor house jackpots,
      the <b>Mansion Jackpot</b>, and the end-of-bonus total. In a 10,000,000-spin simulation the largest single
      win seen was about <b>1,239× bet</b>; the math engine imposes <b>no artificial max-win cap</b>.</p>`;
}

const modal = document.getElementById('wins-modal');
const btn = document.getElementById('btn-wins');
const btnClose = document.getElementById('btn-close-wins');
const contentEl = document.getElementById('wins-content');

if (modal && contentEl) {
  let built = false;
  const close = () => modal.classList.add('hidden');
  const open = () => {
    if (!built) {
      contentEl.innerHTML = buildHTML();
      // clicking a BIG/MEGA/MAX row closes the panel and replays that celebration
      contentEl.querySelectorAll('tr.previewable').forEach(tr => {
        tr.addEventListener('click', () => { close(); previewWin(tr.dataset.preview); });
      });
      built = true;
    }
    modal.classList.remove('hidden');
  };
  if (btn) btn.addEventListener('click', open);
  if (btnClose) btnClose.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
}

  };

  __mods["particles"] = function (exports, require) {
/**
 * @module particles
 * @description Pure eye-candy: coins, sparkles, confetti, dollar bills, wind,
 * and the ambient gold dust. Every function builds DOM nodes with CSS-animation
 * classes (defined in styles.css) and removes them when the animation ends.
 */

const { synth } = require("sound");
const { fmt } = require("utils");

const particleContainer = document.getElementById('particle-container');
const ambientContainer  = document.getElementById('ambient-particles');

// Touch devices (mobile Safari) pay a real compositor cost for a constant stream
// of animated DOM motes; the looping background already carries the ambience, so
// we run the idle dust at a much lower rate there (and skip the startup burst).
const TOUCH = typeof window !== 'undefined' && window.matchMedia &&
              window.matchMedia('(pointer: coarse)').matches;
const reelStrips = [0, 1, 2, 3, 4].map(i => document.getElementById(`strip-${i}`));

/** Coins raining down from the top of the reel window. */
function spawnCoinShower(count = 20, durationMs = 2000) {
  if (!particleContainer) return;
  for (let i = 0; i < count; i++) {
    const coin = document.createElement('div');
    coin.className = 'particle particle-coin';
    coin.style.left = (Math.random() * 90 + 5) + '%';
    coin.style.top = '-20px';
    const scale = 0.6 + Math.random() * 0.8;
    coin.style.width = (20 * scale) + 'px';
    coin.style.height = (20 * scale) + 'px';
    coin.style.animationDelay = (Math.random() * durationMs * 0.5) + 'ms';
    coin.style.animationDuration = (1200 + Math.random() * 1200) + 'ms';
    particleContainer.appendChild(coin);
    setTimeout(() => { if (coin.parentNode) coin.remove(); }, durationMs + 2000);
  }
}

/** Coins bursting upward from the bottom in physics arcs (with clink sounds). */
function spawnCoinFountain(count = 15, durationMs = 2000) {
  if (!particleContainer) return;
  for (let i = 0; i < count; i++) {
    const coin = document.createElement('div');
    coin.className = 'particle particle-coin-fountain';
    coin.style.left = ((0.3 + Math.random() * 0.4) * 100) + '%';   // center-biased
    const scale = 0.7 + Math.random() * 0.6;
    coin.style.width = (22 * scale) + 'px';
    coin.style.height = (22 * scale) + 'px';
    const driftDir = Math.random() > 0.5 ? 1 : -1;
    const driftMag = 20 + Math.random() * 80;
    coin.style.setProperty('--launch-y', -(200 + Math.random() * 200) + 'px');
    coin.style.setProperty('--peak-y', -(300 + Math.random() * 200) + 'px');
    coin.style.setProperty('--mid-y', -(100 + Math.random() * 150) + 'px');
    coin.style.setProperty('--drift-x1', (driftDir * driftMag * 0.3) + 'px');
    coin.style.setProperty('--drift-x2', (driftDir * driftMag * 0.6) + 'px');
    coin.style.setProperty('--drift-x3', (driftDir * driftMag * 0.8) + 'px');
    coin.style.setProperty('--drift-x4', (driftDir * driftMag) + 'px');
    const delay = Math.random() * durationMs * 0.4;
    coin.style.animationDelay = delay + 'ms';
    coin.style.animationDuration = (1400 + Math.random() * 800) + 'ms';
    particleContainer.appendChild(coin);
    setTimeout(() => synth.coinClink(), delay + 100 + Math.random() * 200);
    setTimeout(() => { if (coin.parentNode) coin.remove(); }, delay + 2500);
  }
}

/** A radial sparkle burst centered at (x, y) within the particle container. */
function spawnSparkles(x, y, count = 8) {
  if (!particleContainer) return;
  const colors = ['#FFE000', '#FFFFFF', '#FFB000', '#FF8800', '#88FF88'];
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('div');
    spark.className = 'particle particle-sparkle';
    spark.style.left = x + 'px';
    spark.style.top = y + 'px';
    const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
    const dist = 20 + Math.random() * 40;
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
    spark.style.setProperty('--dx', dx + 'px');
    spark.style.setProperty('--dy', dy + 'px');
    spark.style.setProperty('--dx2', dx * 1.5 + 'px');
    spark.style.setProperty('--dy2', (dy * 1.5 + 20) + 'px');
    spark.style.background = colors[Math.floor(Math.random() * colors.length)];
    particleContainer.appendChild(spark);
    setTimeout(() => { if (spark.parentNode) spark.remove(); }, 900);
  }
}

/** Dollar bills floating up from the bottom, swaying and spinning. */
function spawnDollarBills(count = 10, durationMs = 2500) {
  if (!particleContainer) return;
  for (let i = 0; i < count; i++) {
    const bill = document.createElement('div');
    bill.className = 'particle-dollar';
    bill.style.left = (10 + Math.random() * 80) + '%';
    const scale = 0.7 + Math.random() * 0.6;
    bill.style.width = (40 * scale) + 'px';
    bill.style.height = (20 * scale) + 'px';
    const dir = Math.random() > 0.5 ? 1 : -1;
    bill.style.setProperty('--rise-y1', -(80 + Math.random() * 120) + 'px');
    bill.style.setProperty('--rise-y2', -(200 + Math.random() * 150) + 'px');
    bill.style.setProperty('--rise-y3', -(300 + Math.random() * 150) + 'px');
    bill.style.setProperty('--rise-y4', -(400 + Math.random() * 150) + 'px');
    bill.style.setProperty('--sway-x1', (dir * (10 + Math.random() * 30)) + 'px');
    bill.style.setProperty('--sway-x2', (-dir * (15 + Math.random() * 40)) + 'px');
    bill.style.setProperty('--sway-x3', (dir * (10 + Math.random() * 50)) + 'px');
    bill.style.setProperty('--sway-x4', (-dir * (5 + Math.random() * 30)) + 'px');
    bill.style.setProperty('--spin1', (dir * (10 + Math.random() * 20)) + 'deg');
    bill.style.setProperty('--spin2', (-dir * (5 + Math.random() * 15)) + 'deg');
    bill.style.setProperty('--spin3', (dir * (15 + Math.random() * 25)) + 'deg');
    bill.style.setProperty('--spin4', (-dir * (10 + Math.random() * 20)) + 'deg');
    const delay = Math.random() * durationMs * 0.5;
    bill.style.animationDelay = delay + 'ms';
    bill.style.animationDuration = (2000 + Math.random() * 1500) + 'ms';
    particleContainer.appendChild(bill);
    setTimeout(() => { if (bill.parentNode) bill.remove(); }, delay + 4000);
  }
}

/** Confetti raining from the top. */
function spawnConfetti(count = 30, durationMs = 2500) {
  if (!particleContainer) return;
  const colors = ['#F5C400', '#FF4060', '#2EE85A', '#4488FF', '#FF8800', '#FF44FF', '#FFFFFF', '#00DDFF'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'particle-confetti';
    piece.style.left = (5 + Math.random() * 90) + '%';
    piece.style.setProperty('--conf-w', (4 + Math.random() * 8) + 'px');
    piece.style.setProperty('--conf-h', (8 + Math.random() * 12) + 'px');
    piece.style.setProperty('--conf-color', colors[Math.floor(Math.random() * colors.length)]);
    piece.style.setProperty('--conf-drift', ((Math.random() - 0.5) * 100) + 'px');
    const delay = Math.random() * durationMs * 0.4;
    piece.style.animationDelay = delay + 'ms';
    piece.style.animationDuration = (1800 + Math.random() * 1200) + 'ms';
    particleContainer.appendChild(piece);
    setTimeout(() => { if (piece.parentNode) piece.remove(); }, delay + 3500);
  }
}

/** Golden starburst flashes behind winning cells. cells = [[reel,row], …]. */
function spawnStarbursts(winnerCells) {
  if (!particleContainer) return;
  winnerCells.forEach(([reelIdx, rowIdx]) => {
    const cell = reelStrips[reelIdx] && reelStrips[reelIdx].querySelectorAll('.sym-cell')[rowIdx];
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    const cr = particleContainer.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'particle-starburst';
    burst.style.left = (rect.left + rect.width / 2 - cr.left - 40) + 'px';
    burst.style.top = (rect.top + rect.height / 2 - cr.top - 40) + 'px';
    particleContainer.appendChild(burst);
    setTimeout(() => { if (burst.parentNode) burst.remove(); }, 1000);
  });
}

/** Coins cascading down both side edges (big-win flourish). */
function spawnSideWaterfall(countPerSide = 15, durationMs = 3000) {
  if (!particleContainer) return;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < countPerSide; i++) {
      const coin = document.createElement('div');
      coin.className = 'particle-side-coin';
      if (side === 0) {
        coin.style.left = (Math.random() * 30) + 'px';
        coin.style.setProperty('--side-drift', (5 + Math.random() * 20) + 'px');
      } else {
        coin.style.right = (Math.random() * 30) + 'px';
        coin.style.left = 'auto';
        coin.style.setProperty('--side-drift', -(5 + Math.random() * 20) + 'px');
      }
      const scale = 0.6 + Math.random() * 0.8;
      coin.style.width = (16 * scale) + 'px';
      coin.style.height = (16 * scale) + 'px';
      const delay = Math.random() * durationMs * 0.7;
      coin.style.animationDelay = delay + 'ms';
      coin.style.animationDuration = (800 + Math.random() * 1200) + 'ms';
      particleContainer.appendChild(coin);
      setTimeout(() => synth.coinClink(), delay + 50 + Math.random() * 150);
      setTimeout(() => { if (coin.parentNode) coin.remove(); }, delay + 2500);
    }
  }
}

/** Flash a golden vignette inside the reel window. */
function spawnWinVignette() {
  const reelWindow = document.getElementById('reel-window');
  if (!reelWindow) return;
  const vig = document.createElement('div');
  vig.className = 'win-vignette';
  reelWindow.appendChild(vig);
  setTimeout(() => { if (vig.parentNode) vig.remove(); }, 800);
}

/** Floating "+$X.XX" text that pops and fades. */
function spawnWinPopText(amount) {
  if (!particleContainer) return;
  const pop = document.createElement('div');
  pop.className = 'win-pop-text';
  pop.textContent = '+' + fmt(amount);
  pop.style.left = (35 + Math.random() * 30) + '%';
  pop.style.top = (30 + Math.random() * 30) + '%';
  particleContainer.appendChild(pop);
  setTimeout(() => { if (pop.parentNode) pop.remove(); }, 1800);
}

/** Continuous background gold-dust motes. Call once at startup. */
function startAmbientParticles() {
  if (!ambientContainer) return;
  // Mobile: skip the floating gold-dust entirely. Each glowing mote repaints
  // every frame, and it was the ONLY thing animating at idle on phones — the main
  // remaining cause of mobile sluggishness. Decorative-only; nothing depends on it.
  if (TOUCH) return;
  const types = ['gold', 'gold', 'gold', 'green', 'white'];
  function spawnMote() {
    const mote = document.createElement('div');
    mote.className = `ambient-mote ${types[Math.floor(Math.random() * types.length)]}`;
    const size = 2 + Math.random() * 4;
    mote.style.width = size + 'px';
    mote.style.height = size + 'px';
    mote.style.left = (Math.random() > 0.3 ? 25 + Math.random() * 50 : Math.random() * 100) + '%';
    mote.style.bottom = '-10px';
    mote.style.setProperty('--mote-dx', ((Math.random() - 0.5) * 80) + 'px');
    mote.style.setProperty('--mote-dy', -(150 + Math.random() * 300) + 'px');
    const duration = 4000 + Math.random() * 6000;
    mote.style.animation = `mote-float ${duration}ms ease-out forwards`;
    ambientContainer.appendChild(mote);
    setTimeout(() => { if (mote.parentNode) mote.remove(); }, duration + 100);
  }
  // ~1 mote / 0.6s on desktop; ~1 / 3s on touch (≈5× fewer animating at once)
  const lo = TOUCH ? 2400 : 400;
  const hi = TOUCH ? 1600 : 400;
  (function scheduleNext() {
    setTimeout(() => { spawnMote(); scheduleNext(); }, lo + Math.random() * hi);
  })();
  if (!TOUCH) for (let i = 0; i < 5; i++) setTimeout(spawnMote, i * 200);   // skip the burst on mobile
}

/** 
 * Centralized win presentation logic to DRY up the game loop.
 * Plays the appropriate particles and coin clinks based on the win ratio.
 */
function playWinPresentation(ratio, isMega = false) {
  if (isMega) {
    spawnCoinShower(60, 3500);
    spawnCoinFountain(40, 3500);
    spawnDollarBills(20, 3500);
    spawnConfetti(50, 3500);
    spawnSideWaterfall(25, 3500);
    setTimeout(() => {
      spawnCoinFountain(20, 2000); 
      spawnDollarBills(10, 2000); 
      spawnConfetti(25, 2000);
      spawnWinVignette();
    }, 1500);
    for (let i = 0; i < 5; i++) setTimeout(() => synth.coinClink(), 200 + i * 150);
  } else if (ratio >= 8) {
    spawnCoinShower(40, 2500);
    spawnCoinFountain(25, 2500);
    spawnDollarBills(12, 2500);
    spawnConfetti(30, 2500);
    spawnSideWaterfall(15, 2500);
    for (let i = 0; i < 5; i++) setTimeout(() => synth.coinClink(), 200 + i * 150);
  } else if (ratio >= 3) {
    spawnCoinShower(15, 1500); 
    spawnCoinFountain(20, 1800); 
    spawnDollarBills(6, 1800); 
    spawnConfetti(15, 1800);
    for (let i = 0; i < 3; i++) setTimeout(() => synth.coinClink(), 100 + i * 120);
  } else if (ratio >= 2) {
    spawnCoinShower(15, 1500); 
    spawnCoinFountain(20, 1800); 
    spawnDollarBills(6, 1800); 
    spawnConfetti(15, 1800);
    for (let i = 0; i < 3; i++) setTimeout(() => synth.coinClink(), 100 + i * 120);
  } else if (ratio > 0) {
    spawnCoinFountain(12, 1500);
    spawnDollarBills(3, 1500);
  }
}

/**
 * Full-screen WIND / TORNADO storm — leaves, straw and debris blown clear across
 * the whole screen with whooshing speed-lines and a faint swirling dust haze, so
 * the wolf's big blow feels like a tornado everywhere (not just on the reels).
 * Spawns continuously until you call the returned controller's stop(); in-flight
 * particles then finish their flight and the layer cleans itself up.
 *
 * @returns {{ stop: (fadeMs?: number) => void }}
 */
function startWindStorm() {
  let layer = document.getElementById('wind-storm');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'wind-storm';
    layer.innerHTML = '<div class="wind-haze"></div>';
    document.body.appendChild(layer);
  }
  layer.classList.remove('fade-out');
  void layer.offsetWidth;            // restart the haze fade-in if re-used
  layer.classList.add('active');

  const LEAVES = ['🍂', '🍃', '🌿'];
  const TANS   = ['#caa45a', '#b5863c', '#9c6b2e', '#d8c089', '#8a6a34'];
  // autumn palettes for CSS-drawn leaves (guaranteed to render even where the
  // color-emoji font is missing) — [light, dark] for the leaf gradient
  const LEAF_COLORS = [
    ['#8FCF4F', '#3E7A24'], ['#E7B23A', '#B5751F'], ['#DD7A2E', '#9C4A18'],
    ['#CF5A3A', '#8A2F18'], ['#C7A95B', '#7A5A2A'], ['#B7C24A', '#6E7A1E'],
  ];

  const spawnLeaf = () => {
    const outer = document.createElement('div');
    outer.className = 'wind-leaf';
    const dur = 1.1 + Math.random() * 1.7;
    outer.style.top = (Math.random() * 100) + 'vh';
    outer.style.setProperty('--dur', dur + 's');

    // mix CSS-drawn leaves (always visible) with emoji leaves (richer on devices
    // that have a color-emoji font)
    const useEmoji = Math.random() < 0.45;
    const body = document.createElement(useEmoji ? 'span' : 'i');
    body.className = 'wind-leaf-body ' + (useEmoji ? 'emoji' : 'shape');
    body.style.setProperty('--dur', dur + 's');
    body.style.setProperty('--ty', ((Math.random() * 64 - 32) | 0) + 'px');
    if (useEmoji) {
      body.textContent = LEAVES[(Math.random() * LEAVES.length) | 0];
      body.style.fontSize = (15 + Math.random() * 26) + 'px';
    } else {
      const pal = LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0];
      body.style.setProperty('--c1', pal[0]);
      body.style.setProperty('--c2', pal[1]);
      const w = 11 + Math.random() * 17;
      body.style.width = w.toFixed(0) + 'px';
      body.style.height = (w * (0.68 + Math.random() * 0.3)).toFixed(0) + 'px';
    }
    outer.appendChild(body);
    layer.appendChild(outer);
    setTimeout(() => outer.remove(), dur * 1000 + 120);
  };

  const spawnDebris = () => {
    const d = document.createElement('div');
    d.className = 'wind-debris';
    const dur = 0.7 + Math.random() * 1.0;
    d.style.top = (Math.random() * 100) + 'vh';
    d.style.height = (3 + Math.random() * 4) + 'px';
    d.style.width = (8 + Math.random() * 18) + 'px';
    d.style.background = TANS[(Math.random() * TANS.length) | 0];
    d.style.setProperty('--dur', dur + 's');
    d.style.setProperty('--rot', ((200 + Math.random() * 900) | 0) + 'deg');
    layer.appendChild(d);
    setTimeout(() => d.remove(), dur * 1000 + 120);
  };

  const spawnLine = () => {
    const l = document.createElement('div');
    l.className = 'wind-line';
    const dur = 0.45 + Math.random() * 0.55;
    l.style.top = (Math.random() * 100) + 'vh';
    l.style.width = (12 + Math.random() * 28) + 'vw';
    l.style.setProperty('--dur', dur + 's');
    layer.appendChild(l);
    setTimeout(() => l.remove(), dur * 1000 + 120);
  };

  const tick = () => {
    spawnLeaf(); spawnLeaf();
    if (Math.random() < 0.6) spawnLeaf();
    if (Math.random() < 0.8) spawnDebris();
    if (Math.random() < 0.55) spawnLine();
  };
  tick(); tick();
  const timer = setInterval(tick, 140);

  return {
    stop(fadeMs = 700) {
      clearInterval(timer);
      layer.classList.add('fade-out');                       // fade the haze out…
      // …let in-flight leaves finish their flight (longest ~2.8s), then remove the layer
      setTimeout(() => { if (layer && layer.parentNode) layer.remove(); }, 2900 + fadeMs);
    },
  };
}

Object.assign(exports, { spawnCoinShower, spawnCoinFountain, spawnSparkles, spawnDollarBills, spawnConfetti, spawnStarbursts, spawnSideWaterfall, spawnWinVignette, spawnWinPopText, startAmbientParticles, playWinPresentation, startWindStorm });

  };

  __mods["readouts"] = function (exports, require) {
/**
 * @module readouts
 * @description Small shared UI helpers and control-button references used by the
 * base game, the bonus, and the buy-bonus flow: the cash/bet/win readouts, the
 * status line, and enabling/disabling the control buttons. Kept separate so
 * basegame and bonus can both use it without importing each other.
 */

const { BET_LEVELS, BONUS_CONFIG, REEL_COUNT } = require("par-sheet");
const { state } = require("state");
const { fmt } = require("utils");

const elBalance = document.getElementById('display-balance');
const elBet     = document.getElementById('display-bet');
const elWin     = document.getElementById('display-win');
const elStatus = document.getElementById('status-msg');

const buttons = {
  spin:    document.getElementById('btn-spin'),
  betUp:   document.getElementById('btn-bet-up'),
  betDown: document.getElementById('btn-bet-down'),
  auto:    document.getElementById('btn-auto'),
  buy:     document.getElementById('btn-buy-bonus'),
};

/** Refresh the cash and bet readouts from current state. */
function updateDisplays() {
  elBalance.textContent = fmt(state.balance);
  elBet.textContent = fmt(BET_LEVELS[state.betIndex]);
}

// The Mansion Jackpot tops out at baseMult + perBrickMult × (one Brick house per
// reel). Derived from BONUS_CONFIG so this marketing figure can never drift out
// of sync with the math (it was a hard-coded "126X" that no longer matched).
const MANSION_MAX = Math.round(
  BONUS_CONFIG.mansion.baseMult + BONUS_CONFIG.mansion.perBrickMult * REEL_COUNT
);
const IDLE_MESSAGES = [
  "GOOD LUCK – PRESS SPIN!",
  "243 WAYS TO WIN EVERY SPIN!",
  "6+ HARD HATS TRIGGER THE BONUS!",
  `BUILD BRICK HOUSES FOR A CHANCE AT A MASSIVE ${MANSION_MAX}X JACKPOT!`,
  "GET 3+ BRICK HOUSES IN THE BONUS FOR THE MANSION JACKPOT!",
  "3 HARD HATS IN THE BONUS AWARDS +1 FREE SPIN!",
  "HIGH VOLATILITY: THE BIGGEST WINS ARE HIDING IN THE BONUS!"
];
let idleIndex = 0;
let idleInterval = null;

/** Show a status message. `type` adds an `is-<type>` class (e.g. 'win','error'). */
function setStatus(msg, type = '') {
  elStatus.textContent = msg;
  elStatus.className = type ? `is-${type}` : '';
  
  // Manage the idle message ticker
  if (msg === 'GOOD LUCK – PRESS SPIN!') {
    if (!idleInterval) {
      idleIndex = 0; // Always start with the main greeting
      idleInterval = setInterval(() => {
        idleIndex = (idleIndex + 1) % IDLE_MESSAGES.length;
        elStatus.textContent = IDLE_MESSAGES[idleIndex];
      }, 3500);
    }
  } else {
    if (idleInterval) {
      clearInterval(idleInterval);
      idleInterval = null;
    }
  }
}

/** Enable/disable all the player controls at once (used around the bonus). */
function setControlsEnabled(on) {
  for (const b of Object.values(buttons)) if (b) b.disabled = !on;
}

/** Stop auto-spin and reset its button. (startAuto lives in basegame.) */
function stopAuto() {
  state.autoActive = false;
  if (buttons.auto) { buttons.auto.textContent = 'AUTO SPIN'; buttons.auto.classList.remove('is-active'); }
  clearTimeout(state.autoTimer);
  state.autoTimer = null;
}

Object.assign(exports, { elBalance, elBet, elWin, buttons, updateDisplays, setStatus, setControlsEnabled, stopAuto });

  };

  __mods["reels"] = function (exports, require) {
/**
 * @module reels
 * @description The reels' DOM + animation layer: building symbol cells, the
 * spin animation, win highlighting and the count-up. The actual win math lives
 * in mathcore.js — this module just shows it.
 */

const { SYMBOLS, SYMBOL_IDS, SPIN_DURATIONS, TURBO_DURATIONS, SCROLL_SYMBOLS, TURBO_SCROLL, ANTICIPATION_EXTRA } = require("par-sheet");
const { state } = require("state");
const { synth } = require("sound");
const { narrator } = require("narrator");
const { fmt } = require("utils");
const { spawnSparkles } = require("particles");

const reelCols   = [0, 1, 2, 3, 4].map(i => document.getElementById(`reel-${i}`));
const reelStrips = [0, 1, 2, 3, 4].map(i => document.getElementById(`strip-${i}`));
const particleContainer = document.getElementById('particle-container');
const elWin = document.getElementById('display-win');

function getReelStrips() { return reelStrips; }

// Tap any reel symbol → the wolf jokes about it (delegated; cells carry data-sym).
// Ignored while the reels are spinning; the narrator also skips it during the bonus.
const reelWindow = document.getElementById('reel-window');
if (reelWindow) {
  reelWindow.addEventListener('click', e => {
    if (state.spinning) return;
    const cell = e.target.closest('.sym-cell[data-sym]');
    if (cell && reelWindow.contains(cell)) narrator.onSymbolClick(cell.dataset.sym);
  });
}

/** A random symbol id, used only to fill the blurry scroll buffer. */
function randomSymbol() { return SYMBOL_IDS[Math.floor(Math.random() * SYMBOL_IDS.length)]; }

/** Read the cell pixel height from the CSS custom property. */
function getCellHeight() {
  const val = getComputedStyle(document.documentElement).getPropertyValue('--cell-size').trim();
  return parseInt(val, 10) || 130;
}

/** Build one symbol cell (PNG image, or inline-SVG for royals). */
function makeCell(symId) {
  const sym = SYMBOLS[symId];
  const div = document.createElement('div');
  div.className = 'sym-cell';
  div.dataset.sym = symId;
  if (sym.src) {
    const img = document.createElement('img');
    img.src = sym.src;
    img.alt = sym.label || symId;
    img.draggable = false;
    img.className = 'sym-img';
    div.appendChild(img);
  } else {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', sym.svgId);
    use.setAttribute('href', sym.svgId);
    svg.appendChild(use);
    div.appendChild(svg);
  }
  return div;
}

/** Instantly show 3 symbols on a reel (no animation). */
function renderReel(reelIndex, symbolIds) {
  const strip = reelStrips[reelIndex];
  strip.style.transition = 'none';
  strip.style.transform  = 'translateY(0)';
  strip.innerHTML = '';
  symbolIds.forEach(id => strip.appendChild(makeCell(id)));
}

/**
 * Spin one reel from its current symbols to the target symbols.
 * Builds a tall strip [target] + [random blur] + [current], snaps it to the
 * bottom, then transitions to the top so the target lands in view.
 */
function animateReel(reelIndex, targetSymIds, onDone, anticipate = false, isExtreme = false) {
  const strip = reelStrips[reelIndex];
  const col   = reelCols[reelIndex];
  clearWildReel(col);                    // drop any expanded-wild panel from last spin
  const cellH = getCellHeight();
  const scrollN = state.turbo ? TURBO_SCROLL : SCROLL_SYMBOLS;
  let duration  = state.turbo ? TURBO_DURATIONS[reelIndex] : SPIN_DURATIONS[reelIndex];

  if (anticipate && reelIndex >= 3) {        // suspense slow-down on later reels
    duration += ANTICIPATION_EXTRA;
    col.classList.add('is-anticipating');
    if (reelIndex === 3) { synth.anticipation(); narrator.onAnticipation(); }
  }
  
  if (isExtreme) {
    duration += 1500; // Extra long spin for the 6th hat
    col.classList.add('is-extreme-anticipating');
    narrator.sayNow('extremeAnticipation', 8);
  }

  const current = (state.currentGrid && state.currentGrid[reelIndex]) || ['royal-a', 'royal-k', 'royal-q'];
  const allIds = [...targetSymIds, ...Array.from({ length: scrollN }, randomSymbol), ...current];

  strip.innerHTML = '';
  allIds.forEach(id => strip.appendChild(makeCell(id)));

  const startY = (allIds.length - 3) * cellH;
  strip.style.transition = 'none';
  strip.style.transform  = `translateY(-${startY}px)`;
  col.classList.add('is-spinning');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const easing = anticipate && reelIndex >= 3
        ? 'cubic-bezier(0.05, 0.9, 0.35, 1.12)'
        : 'cubic-bezier(0.12, 0.85, 0.38, 1.08)';
      strip.style.transition = `transform ${duration}ms ${easing}`;
      strip.style.transform  = 'translateY(0)';

      let isDone = false;
      const finishAnimation = () => {
        if (isDone) return;
        isDone = true;
        col.classList.remove('is-spinning', 'is-anticipating', 'is-extreme-anticipating');
        renderReel(reelIndex, targetSymIds);
        strip.classList.add('bounce-stop');
        setTimeout(() => strip.classList.remove('bounce-stop'), 350);
        synth.reelStop(reelIndex);
        onDone();
      };

      const fallbackTimer = setTimeout(finishAnimation, duration + 50);

      strip.addEventListener('transitionend', function handler(e) {
        if (e.propertyName === 'transform') {
          strip.removeEventListener('transitionend', handler);
          clearTimeout(fallbackTimer);
          finishAnimation();
        }
      });
    });
  });
}

/** Spin all 5 reels; resolves once every reel has stopped. */
function animateAllReels(targetGrid, anticipate = false, extremeAnticipate = false) {
  return new Promise(resolve => {
    let stopped = 0;
    for (let r = 0; r < 5; r++) {
      const isExtreme = extremeAnticipate && r === 4;
      animateReel(r, targetGrid[r], () => { if (++stopped === 5) resolve(); }, anticipate, isExtreme);
    }
  });
}

/**
 * Show an expanding wild filling a reel as ONE unified brass plaque that
 * "expands open" vertically — instead of three separate icons. The three wild
 * cells stay underneath (for win highlighting + data); a single full-reel panel
 * is laid over them and animated.
 */
function expandWildReel(reelIndex, expandedCol) {
  const col = reelCols[reelIndex];
  if (!col) return;
  renderReel(reelIndex, expandedCol);   // wild cells underneath (data + highlight)
  col.classList.add('wild-reel');        // hide per-cell emblems; show the unified panel

  // one full-reel plaque: weathered texture + 4 corner bolts + the WILD emblem
  let panel = col.querySelector('.wild-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'wild-panel';
    panel.innerHTML =
      '<div class="wild-texture"></div>' +
      '<div class="wild-bolt tl"></div><div class="wild-bolt tr"></div>' +
      '<div class="wild-bolt bl"></div><div class="wild-bolt br"></div>';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#sym-wild');
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#sym-wild');
    svg.appendChild(use);
    panel.appendChild(svg);
    col.appendChild(panel);
  }
  panel.classList.remove('expand');
  void panel.offsetWidth;                // reflow so the entrance animation restarts
  panel.classList.add('expand');

  // celebrate inside the frame as it opens: cowboy SFX + coins + dust + sparks
  synth.wildExpand();
  setTimeout(() => wildBurst(panel), 230);

  // hammer the four corner bolts in, one at a time, each with a clank
  const bolts = panel.querySelectorAll('.wild-bolt');
  bolts.forEach(b => b.classList.remove('locked'));
  bolts.forEach((b, i) => setTimeout(() => { b.classList.add('locked'); synth.boltLock(); }, 430 + i * 150));
}

/**
 * Inject a one-off celebration inside an expanded-wild panel: a flash, a swirling
 * dust whirlwind, a burst of gold coins that rain down, and golden sparks. All
 * elements live inside the panel (overflow:hidden), so they stay in the frame and
 * remove themselves when their animation ends.
 */
function wildBurst(panel) {
  const add = (cls, style, life) => {
    const el = document.createElement('div');
    el.className = cls;
    if (style) for (const k in style) el.style.setProperty(k, style[k]);
    panel.appendChild(el);
    setTimeout(() => el.remove(), life);
    return el;
  };

  add('wild-flash', null, 700);                                  // bright pop
  add('wild-dust', { 'animation-delay': '0s' }, 2300);          // whirlwind
  add('wild-dust', { 'animation-delay': '0.18s' }, 2400);

  // flying dust specks for the dust-storm feel
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 110;
    add('wild-mote', {
      '--mx': (Math.cos(ang) * dist * 1.2).toFixed(0) + 'px',
      '--my': (Math.sin(ang) * dist).toFixed(0) + 'px',
      'animation-delay': (Math.random() * 0.4).toFixed(2) + 's',
    }, 1700);
  }

  // gold coins burst out from the badge then rain down
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 22 + Math.random() * 62;
    add('wild-coin', {
      '--tx': (Math.cos(ang) * dist).toFixed(0) + 'px',
      '--ty': (Math.sin(ang) * dist - 50 - Math.random() * 45).toFixed(0) + 'px',
      'animation-delay': (Math.random() * 0.22).toFixed(2) + 's',
    }, 1700);
  }
  // firework-style sparks shooting out from the centre
  for (let i = 0; i < 18; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 95;
    add('wild-spark', {
      '--sx': (Math.cos(ang) * dist).toFixed(0) + 'px',
      '--sy': (Math.sin(ang) * dist).toFixed(0) + 'px',
      'animation-delay': (Math.random() * 0.15).toFixed(2) + 's',
    }, 1000);
  }
}

/** Remove a reel's expanded-wild panel (called when the reel respins). */
function clearWildReel(col) {
  col.classList.remove('wild-reel');
  const panel = col.querySelector('.wild-panel');
  if (panel) panel.remove();
}

/** Add the winner glow + sparkles to every winning cell. */
function highlightWinners(winners) {
  clearHighlights();
  winners.forEach(({ cells }) => {
    cells.forEach(([reelIdx, rowIdx]) => {
      const cell = reelStrips[reelIdx].querySelectorAll('.sym-cell')[rowIdx];
      if (!cell) return;
      cell.classList.add('is-winner');
      const rect = cell.getBoundingClientRect();
      const cr = particleContainer.getBoundingClientRect();
      spawnSparkles(rect.left + rect.width / 2 - cr.left, rect.top + rect.height / 2 - cr.top, 6);
    });
  });
}

function clearHighlights() {
  document.querySelectorAll('.sym-cell.is-winner').forEach(el => el.classList.remove('is-winner'));
}

/** Count the WIN display up from 0 to targetAmount. Resolves when done. */
function animateWinCount(targetAmount, durationMs = 1200) {
  return new Promise(resolve => {
    const startTime = performance.now();
    elWin.classList.add('counting', 'win-glow');
    function tick(now) {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);  // ease-out cubic
      elWin.textContent = fmt(targetAmount * eased);
      if (progress < 0.9 && Math.random() < 0.30) synth.coinTick();
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        elWin.textContent = fmt(targetAmount);
        elWin.classList.remove('counting');
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

Object.assign(exports, { getReelStrips, makeCell, renderReel, animateReel, animateAllReels, expandWildReel, highlightWinners, clearHighlights, animateWinCount });

  };

  __mods["day-night"] = function (exports, require) {
/**
 * @module day-night
 * @description Darkens the background image based on the time of day.
 *
 * By default it follows the browser's real clock — brightest at noon, darkest
 * around midnight — and re-checks every minute. The clock button (🕐) opens a
 * slider to scrub the time of day manually; "USE REAL TIME" switches back to the
 * live clock.
 *
 * Mapping: a cosine of the hour gives a smooth day curve (1 = full light at
 * noon, 0 = full dark at midnight); the overlay opacity is MAX_DARK × (1 − light).
 */

const { playNoonStandoff } = require("high-noon");

const overlay = document.getElementById('day-night-overlay');
const btnTime = document.getElementById('btn-time');
const panel   = document.getElementById('time-panel');
const slider  = document.getElementById('time-slider');
const label   = document.getElementById('time-label');
const autoBtn = document.getElementById('time-auto');
const noonBtn = document.getElementById('btn-high-noon');

const MAX_DARK = 0.82;     // overlay opacity at the darkest point (midnight)
let autoMode = true;
let tick = null;

/** Overlay opacity for a minute-of-day (0..1439): 0 at noon … MAX_DARK at midnight. */
function darknessFor(minutes) {
  const hour = minutes / 60;                                          // 0..24
  const light = (1 + Math.cos(((hour - 12) / 24) * 2 * Math.PI)) / 2; // 1 noon, 0 midnight
  return MAX_DARK * (1 - light);
}

/** Pretty 12-hour clock string, e.g. 615 → "10:15 AM". */
function fmtTime(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = (h % 12) || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

function apply(minutes) {
  if (overlay) overlay.style.opacity = darknessFor(minutes).toFixed(3);
  if (label) label.textContent = fmtTime(minutes);
  if (slider) slider.value = String(minutes);
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Animate the day/night darkening from its current value to the correct one for
 * the current time. Used by the intro reveal, which first parks the overlay at 0
 * (clean background) and then calls this to fade the darkening back in.
 */
function revealDayNight(ms = 1100) {
  if (!overlay) return;
  overlay.style.transition = `opacity ${ms}ms ease`;
  apply(autoMode ? nowMinutes() : parseInt(slider.value, 10));
  setTimeout(() => { overlay.style.transition = ''; }, ms + 60);  // drop transition so the slider stays snappy
}

/** Follow the real clock and keep it updated each minute. */
function goAuto() {
  autoMode = true;
  if (autoBtn) autoBtn.classList.add('is-active');
  apply(nowMinutes());
  clearInterval(tick);
  tick = setInterval(() => { if (autoMode) apply(nowMinutes()); }, 60000);
}

/**
 * Slide the time-of-day up to 12:00 noon (the slider "walks" into the middle and
 * the scene brightens to full daylight), then fire the High Noon standoff —
 * no matter what the real local time is.
 */
function strikeHighNoon() {
  autoMode = false;                                   // manual override
  if (autoBtn) autoBtn.classList.remove('is-active');
  const NOON = 720;
  const startV = slider ? parseInt(slider.value, 10) : NOON;
  const dur = 700, t0 = performance.now();
  function step(now) {
    const k = Math.min(1, (now - t0) / dur);
    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;  // easeInOutQuad
    apply(Math.round(startV + (NOON - startV) * ease));
    if (k < 1) requestAnimationFrame(step);
    else { apply(NOON); playNoonStandoff(); }          // reached noon → showdown
  }
  requestAnimationFrame(step);
}

if (overlay) {
  if (slider) slider.addEventListener('input', () => {
    autoMode = false;                                  // manual override
    if (autoBtn) autoBtn.classList.remove('is-active');
    apply(parseInt(slider.value, 10));
  });
  if (autoBtn) autoBtn.addEventListener('click', goAuto);
  if (noonBtn) noonBtn.addEventListener('click', e => { e.stopPropagation(); strikeHighNoon(); });

  if (btnTime && panel) {
    btnTime.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('hidden'); });
    panel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', e => {
      if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !btnTime.contains(e.target)) {
        panel.classList.add('hidden');
      }
    });
  }

  goAuto();   // start on the real time of day
}

Object.assign(exports, { revealDayNight });

  };

  __mods["high-noon"] = function (exports, require) {
/**
 * @module high-noon
 * @description Hidden "High Noon" easter egg. At exactly 12:00 PM by the
 * browser's local clock the showdown plays out in three beats:
 *   1. A Western "a stranger rides into town" title card; the wolf reads it
 *      aloud in his own voice (no other narrator lines, no SFX — they'd overlap).
 *   2. The High_noon_standoff.webm clip (with its own audio).
 *   3. A STORYBOOK finale: the Western showdown theme loops while the wolf reads
 *      the rest of the tale a page at a time (highNoonStory), and on the last
 *      page the gunshots crack and we cut to black, back to gameplay.
 * All beats are contained inside the reel window (the side wolf and outer
 * borders stay visible). The game's own SFX + narrator are muted for the whole
 * sequence (so nothing bleeds in); every cutscene sound is played directly and
 * respects the SFX / MUSIC / VOICE sliders. The background music ducks out and
 * returns afterward. Dismisses on end, on click (skip), on error, or via a
 * safety timeout — and fires at most once per day.
 */

const { bgm, synth } = require("sound");
const { narrator } = require("narrator");
const { PHRASES } = require("phrases");   // highNoonStory pages (shown + spoken)

const overlay   = document.getElementById('noon-overlay');
const video     = document.getElementById('noon-video');
const card      = document.getElementById('noon-card');
const story     = document.getElementById('noon-story');
const storyText = document.getElementById('noon-story-text');
const storyDots = document.getElementById('noon-story-dots');

const CARD_HOLD_MS  = 4200;        // how long the card lingers if VOICE is off
const SHOWDOWN_MUSIC = 'assets/audio/music/showdown_theme.mp3';
const GUNSHOT_SFX    = 'assets/audio/sfx/showdown_shootout.mp3';
const WOLF_LINE      = 'assets/audio/narrator/highNoon_0.mp3';
const STORY_CLIP     = i => `assets/audio/narrator/highNoonStory_${i}.mp3`;

let playing  = false;
let firedKey = null;     // e.g. "Sat May 30 2026" — so noon only triggers once per day

let wasSynthEnabled = true;
let wasNarratorEnabled = true;

/**
 * Run the High-Noon cutscene (card + voice → clip → theme + gunshot → gameplay).
 * Exported so the time panel can trigger it on demand (regardless of the clock).
 */
function playNoonStandoff() {
  if (!overlay || !video || playing) return;
  playing = true;

  // Capture the channels, then mute the game's own SFX + narrator for the WHOLE
  // sequence so no ambient barks or idle lines overlap. Every cutscene sound is
  // played directly below (bypassing the channels) and respects the sliders.
  wasSynthEnabled = synth.enabled;
  wasNarratorEnabled = narrator.enabled;
  const voiceVol = narrator.getVolume();
  const musicVol = bgm.getVolume();
  const sfxVol   = synth.getVolume();
  const voiceOn  = wasNarratorEnabled && voiceVol > 0;
  const sfxOn    = wasSynthEnabled && sfxVol > 0;

  bgm.pauseForCutscene();          // silence the looping game music under the cutscene
  synth.stopAll();
  narrator.stop();
  synth.enabled = false;
  narrator.enabled = false;

  let done = false, rolled = false, outroStarted = false, gunFired = false;
  let cardTimer = null, speakTimer = null, storyTimer = null;
  let voAudio = null, musicAudio = null, gunAudio = null;

  const playClip = (src, vol) => {
    const a = new Audio(src);
    a.volume = Math.max(0, Math.min(1, vol));
    a.play().catch(() => {});
    return a;
  };
  const stopClip = (a) => { if (a) { try { a.pause(); } catch (e) {} } };

  const finish = () => {
    if (done) return;
    done = true;
    if (cardTimer)  { clearTimeout(cardTimer);  cardTimer = null; }
    if (speakTimer) { clearTimeout(speakTimer); speakTimer = null; }
    if (storyTimer) { clearTimeout(storyTimer); storyTimer = null; }
    stopClip(voAudio); stopClip(musicAudio); stopClip(gunAudio);
    voAudio = musicAudio = gunAudio = null;
    if (card)  card.classList.remove('show', 'leaving');
    if (story) story.classList.remove('show');
    overlay.classList.add('fade-out');
    try { video.pause(); } catch (e) {}
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('fade-out');
      if (card)  card.classList.add('hidden');
      if (story) story.classList.add('hidden');
      video.style.visibility = '';
      synth.enabled = wasSynthEnabled;
      narrator.enabled = wasNarratorEnabled;
      bgm.resumeFromCutscene();    // bring the looping music back
      playing = false;
    }, 600);
  };

  // Beat 3 — the STORYBOOK finale. The clip ends, the showdown theme loops under
  // a few pages of story (each read aloud by the wolf), and when the tale reaches
  // "He huffed. He puffed. And…" the gunshots crack, we cut hard to black, and
  // return to gameplay.

  // Stop the story, cut to black, fire the closing gunshot, then end.
  const fireGunThenEnd = () => {
    if (done || gunFired) return;
    gunFired = true;
    if (storyTimer) { clearTimeout(storyTimer); storyTimer = null; }
    stopClip(voAudio);   voAudio = null;
    stopClip(musicAudio); musicAudio = null;            // theme stops for the shot
    if (story) story.classList.remove('show');
    setTimeout(() => { if (story) story.classList.add('hidden'); }, 220);
    video.style.visibility = 'hidden';                  // cut to all black
    if (sfxOn) {
      gunAudio = playClip(GUNSHOT_SFX, Math.min(1, sfxVol * 0.9));
      gunAudio.addEventListener('ended', finish, { once: true });
      gunAudio.addEventListener('error', finish, { once: true });
      setTimeout(() => { if (!done) finish(); }, 7000);   // gunshot ~5s
    } else {
      finish();
    }
  };

  // Show the story pages one at a time (each spoken by the wolf), then onDone().
  const runStorybook = (onDone) => {
    const pages = (PHRASES && PHRASES.highNoonStory) || [];
    if (!story || !storyText || !pages.length) { onDone(); return; }
    storyDots.innerHTML = pages.map(() => '<span></span>').join('');
    const dots = [...storyDots.children];
    let i = 0;

    const advance = () => {
      if (done || gunFired) return;
      if (storyTimer) { clearTimeout(storyTimer); storyTimer = null; }
      stopClip(voAudio); voAudio = null;
      story.classList.remove('show');                   // fade the page out
      i += 1;
      storyTimer = setTimeout(showPage, 430);           // short beat between pages
    };

    const showPage = () => {
      if (done || gunFired) return;
      if (i >= pages.length) { onDone(); return; }
      storyText.textContent = pages[i];
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      story.classList.remove('hidden');
      void story.offsetWidth;                           // reflow → fade-in transition runs
      story.classList.add('show');
      if (voiceOn) {
        voAudio = playClip(STORY_CLIP(i), voiceVol);
        voAudio.addEventListener('ended', advance, { once: true });
        voAudio.addEventListener('error', advance, { once: true });
        storyTimer = setTimeout(advance, 15000);        // per-page hard cap
      } else {
        storyTimer = setTimeout(advance, 2600 + pages[i].length * 45);  // ~reading time
      }
    };
    showPage();
  };

  const startOutro = () => {
    if (done || outroStarted) return;
    outroStarted = true;
    try { video.pause(); } catch (e) {}
    if (card) card.classList.add('hidden');             // intro card is replaced by the storybook

    if (musicVol > 0) {                                 // theme loops quietly under the story
      musicAudio = playClip(SHOWDOWN_MUSIC, Math.min(1, musicVol * 0.8));
      if (musicAudio) musicAudio.loop = true;
    }
    runStorybook(fireGunThenEnd);
  };

  // Beat 2 — roll the standoff clip; when it ends, start the outro.
  const rollClip = () => {
    if (done || rolled) return;
    rolled = true;
    if (cardTimer)  { clearTimeout(cardTimer);  cardTimer = null; }
    if (speakTimer) { clearTimeout(speakTimer); speakTimer = null; }
    stopClip(voAudio); voAudio = null;
    // Fade the whole card (text + opaque background) out so the clip is visible.
    if (card) { card.classList.remove('show'); card.classList.add('leaving'); }
    video.addEventListener('ended', startOutro, { once: true });
    video.addEventListener('error', startOutro, { once: true });
    try { video.currentTime = 0; } catch (e) {}
    // Try with sound (the player has interacted by mid-day); fall back to muted.
    video.muted = false;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(startOutro);
    });
    setTimeout(() => { if (!outroStarted) startOutro(); }, 20000);  // clip safety cap
  };

  // A click anywhere skips straight back to gameplay, in any beat.
  overlay.addEventListener('click', finish, { once: true });

  // Beat 1 — reveal the card; the wolf reads it aloud (no gunfire, no other VO).
  overlay.classList.remove('hidden');
  video.style.visibility = '';       // reset (the outro hides it for the black cut)
  if (card) {
    card.classList.remove('hidden', 'leaving');
    void card.offsetWidth;         // reflow so the entrance transition runs
    card.classList.add('show');
  }
  // Let the card settle, then the wolf speaks; roll the clip when he finishes.
  speakTimer = setTimeout(() => {
    if (voiceOn) {
      voAudio = playClip(WOLF_LINE, voiceVol);
      voAudio.addEventListener('ended', rollClip, { once: true });
      voAudio.addEventListener('error', rollClip, { once: true });
      setTimeout(() => { if (!rolled) rollClip(); }, 16000);  // hard cap (line ~12.5s)
    } else {
      cardTimer = setTimeout(rollClip, CARD_HOLD_MS);          // VOICE off → time the card
    }
  }, 900);
}

/* ── Watch the real clock. Polling every 250ms reliably catches the 12:00:00
   second and self-corrects (no drift); the per-day key prevents repeats. ── */
if (overlay && video) {
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 12 && now.getMinutes() === 0 && now.getSeconds() === 0) {
      const key = now.toDateString();
      if (firedKey !== key) { firedKey = key; playNoonStandoff(); }
    }
  }, 250);
}

Object.assign(exports, { playNoonStandoff });

  };

  __mods["idle-poster"] = function (exports, require) {
/**
 * @module idle-poster
 * @description Attract-mode flourish for the reel-background "Wanted" poster
 * (Wanted_poster.webm). When the base game sits idle — nobody pressing anything,
 * no spin/auto/bonus running — the poster slowly glows up from its usual faint
 * 0.55 opacity to full 100%. The moment the player interacts again it snaps
 * straight back to its normal opacity.
 *
 * The two speeds (slow up, instant down) come from CSS: the `.poster-idle` class
 * carries a long transition; the base rule carries a short one. This module only
 * adds/removes that class based on activity + game state.
 */

const { state } = require("state");
const { isBonusActive } = require("bonus");

const video  = document.getElementById('reel-bg-video');
const IDLE_MS = 12000;   // how long with zero input before the poster glows up

let timer = null;

/** The reels are "busy" (so don't glow up) during a spin, auto-spin, or bonus. */
function isBusy() { return state.spinning || state.autoActive || isBonusActive(); }

function scheduleIdle() {
  clearTimeout(timer);
  timer = setTimeout(tick, IDLE_MS);
}

function tick() {
  if (!video) return;
  if (isBusy()) { scheduleIdle(); return; }   // not truly idle yet — check again later
  video.classList.add('poster-idle');          // slow ramp to 100%
}

/** Any interaction snaps the poster back and restarts the idle countdown. */
function onActivity() {
  if (video) video.classList.remove('poster-idle');
  scheduleIdle();
}

if (video) {
  // capture phase so we see every click/keypress, even ones that stopPropagation
  document.addEventListener('pointerdown', onActivity, true);
  document.addEventListener('keydown', onActivity, true);
  scheduleIdle();
}

  };

  __mods["intro"] = function (exports, require) {
/**
 * @module intro
 * @description Full-screen intro splash. Plays assets/webm/Big_Bad_Wolf_intro.webm
 * over everything on load, then fades into the game. Dismisses when the clip
 * ends, on click (skip), on error, or if autoplay is blocked — so the player
 * can never get stuck on the splash. Muted, because browsers block autoplay
 * with sound before any user interaction.
 */

const overlay = document.getElementById('intro-overlay');
const video   = document.getElementById('intro-video');

if (overlay && video) {
  let dismissed = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    overlay.classList.add('fade-out');     // CSS opacity transition
    try { video.pause(); } catch (e) {}
    setTimeout(() => {
      overlay.classList.add('hidden');                       // remove after fade
      window.dispatchEvent(new Event('intro:done'));         // cue the background hold + game reveal
    }, 700);
  }

  video.addEventListener('ended', dismiss);
  video.addEventListener('error', dismiss);
  overlay.addEventListener('click', dismiss);              // click/tap to skip

  // Backup: if 'ended' never fires, dismiss shortly after the clip's length.
  video.addEventListener('loadedmetadata', () => {
    if (isFinite(video.duration) && video.duration > 0) {
      setTimeout(dismiss, video.duration * 1000 + 1500);
    }
  });

  // Autoplay (muted). If the browser blocks it, skip the splash entirely.
  const p = video.play();
  if (p && typeof p.catch === 'function') p.catch(dismiss);

  // Hard safety cap in case the video can't load at all.
  setTimeout(dismiss, 20000);
}

  };

  __mods["reveal"] = function (exports, require) {
/**
 * @module reveal
 * @description Post-intro reveal sequence. The game loads hidden (body.pre-reveal)
 * with the background video shown clean and undimmed. After the intro splash
 * finishes we linger on that background for a beat, then fade the whole game —
 * cabinet/reels/character, the side panel, the ambient dust, and the day-night
 * darkening — in together.
 *
 * Order matters: this module imports AFTER daynight in main.js, so it can park
 * the day-night overlay at 0 (overriding daynight's initial value) for the hold.
 */

const { revealDayNight } = require("day-night");

const overlay = document.getElementById('day-night-overlay');
const HOLD_MS = 500;    // how long to linger on the clean background after the intro
let revealed = false;

// Start hidden, with the background full & undimmed (daynight already set the
// overlay opacity on load — override it to 0 so the hold looks clean).
document.body.classList.add('pre-reveal');
if (overlay) overlay.style.opacity = '0';

function reveal() {
  if (revealed) return;
  revealed = true;
  document.body.classList.remove('pre-reveal');   // fade the game in (CSS 1.1s)
  revealDayNight();                                // fade the darkening back in
}

// When the intro signals it's done, hold on the background, then reveal.
window.addEventListener('intro:done', () => setTimeout(reveal, HOLD_MS), { once: true });

// Safety net: reveal anyway if the intro never signals (missing/blocked splash).
setTimeout(reveal, 23000);

  };

  __mods["side-wolf"] = function (exports, require) {
/**
 * @module side-wolf
 * @description Gives the left-side SideWolf character a lively, dynamic feel.
 * He loops his default idle clip, then plays ONE randomly-chosen reaction
 * (dances, sniffs, fist-pump, tips his hat, …) once, and returns to idle —
 * forever. Every clip starts and ends in the same pose, so the swaps look
 * seamless.
 *
 * GAPLESS PRE-ROLL CROSSBUFFER — why two videos:
 * A single <video> blanks while it loads/decodes the next src, and on Safari a
 * finished transparent HEVC clip can briefly CLEAR (go transparent) the instant
 * it ends. So we keep TWO stacked, identical layers and cross over *before* the
 * current clip finishes, while it's still painting live frames:
 *   1. one layer plays while the other silently preloads the next clip to frame 0
 *   2. a short moment BEFORE the playing clip ends, we start the buffer and raise
 *      it on top (z-index) — still hidden
 *   3. the instant the buffer paints its first frame (requestVideoFrameCallback)
 *      we reveal it; being on top + opaque, it fully covers the still-live clip
 *   4. only then do we hide/pause the old layer
 * The visible layer is therefore never blank or cleared — no flicker, any browser.
 *
 * The clip list (default + reactions) is generated by tools/build.js from the
 * Sidewolf*.webm files in assets/webm/. (alphaSrc maps each to the .mp4 twin on
 * Safari — see src/system/video-format.js.)
 */

const { SIDEWOLF } = require("sidewolf-clips");
const { alphaSrc, IS_MOBILE } = require("video-format");   // WebM → HEVC-alpha .mp4 on Safari

const first = document.getElementById('side-wolf');
const IDLE_LOOPS = 1;          // loop the default this many times before a reaction
const LEAD = 0.18;             // start the next clip this many seconds before the current ends

// Gaff dev tool: the "Animations" button toggles a label showing the clip name.
const animLabel = document.getElementById('wolf-animation-label');
const animBtn   = document.getElementById('btn-show-animations');

/* ── MOBILE: skip the SideWolf entirely ─────────────────────────────────────
   On phones and tablets (iPhone, iPad, Android — every browser) the SideWolf
   character and the little platform he stands on are purely decorative and not
   worth the video/decoder cost. Remove the whole container so NONE of the
   ~40 MB of Sidewolf clips (nor the poster image) ever load. The game loses only
   a visual extra; everything else is unaffected. Desktop is left exactly as-is. */
if (IS_MOBILE) {
  const wc = document.getElementById('wolf-container');
  if (wc) wc.remove();
} else if (first && SIDEWOLF.default) {
  // ── DESKTOP (Chrome + Safari): gapless double-buffer with reaction swaps ──
  // The poster is set here (not in the HTML) so it never loads on mobile.
  first.setAttribute('poster', 'assets/wolf_poster.webp');

  // ── build the second, identical layer stacked on top of the first ──
  first.classList.add('side-wolf-layer');
  const second = first.cloneNode(false);
  second.removeAttribute('id');
  second.removeAttribute('src');
  second.removeAttribute('data-alpha-src');
  first.removeAttribute('data-alpha-src');      // we drive the src ourselves now
  first.after(second);

  const layers = [first, second];
  layers.forEach(v => {
    v.loop = false; v.muted = true; v.playsInline = true;
    v.setAttribute('playsinline', ''); v.preload = 'auto';
  });

  let active = first, buffer = second;          // active = visible & playing
  let activeMode = 'idle';                       // 'idle' | 'special'
  let idlesPlayed = 0;                           // idle loops in the current streak
  let lastSpecial = -1;
  let bufferKind = 'idle';                       // what's primed in `buffer`
  let swapping = false;
  let crossTimer = 0;

  const baseName = v => ((v && (v.__logical || v.getAttribute('src'))) || '').split('/').pop();
  function show(v) { v.style.opacity = '1'; }
  function hide(v) { v.style.opacity = '0'; }

  /** pick a random reaction clip, never repeating the previous one */
  function pickReaction() {
    const list = SIDEWOLF.specials;
    if (!list || !list.length) return SIDEWOLF.default;
    let i; do { i = Math.floor(Math.random() * list.length); }
    while (list.length > 1 && i === lastSpecial);
    lastSpecial = i;
    return list[i];
  }

  /** what should follow the current active clip */
  function predictNext() {
    if (activeMode === 'idle' && idlesPlayed < IDLE_LOOPS) return { src: SIDEWOLF.default, kind: 'idle' };
    if (activeMode === 'idle') return { src: pickReaction(), kind: 'special' };
    return { src: SIDEWOLF.default, kind: 'idle' };   // after a reaction → idle
  }

  /** load a clip into the hidden buffer layer, ready (paused) at frame 0 */
  function prime(src, kind) {
    bufferKind = kind;
    buffer.__logical = src;
    const real = alphaSrc(src);
    if (buffer.getAttribute('src') !== real) buffer.setAttribute('src', real);
    try { buffer.pause(); } catch (e) {}
    try { buffer.currentTime = 0; } catch (e) {}
    try { buffer.load(); } catch (e) {}
  }
  function primeNext() { const n = predictNext(); prime(n.src, n.kind); }

  /** arm the cross-over to fire LEAD seconds before the active clip ends */
  function scheduleCross() {
    clearTimeout(crossTimer); crossTimer = 0;
    const d = active.duration;
    if (!d || !isFinite(d)) return;                 // unknown duration → 'ended' fallback covers us
    const ms = Math.max(0, (d - (active.currentTime || 0) - LEAD) * 1000);
    crossTimer = setTimeout(beginCross, ms);
  }

  /**
   * Cross to the preloaded buffer while the active clip is STILL PLAYING live
   * frames, so the visible wolf never blanks. The buffer is raised on top and
   * only revealed once it has actually painted a frame.
   */
  function beginCross() {
    if (swapping) return;
    swapping = true;
    clearTimeout(crossTimer); crossTimer = 0;

    buffer.style.zIndex = '2';                      // buffer sits ON TOP of the live active
    active.style.zIndex = '1';
    try { buffer.play().catch(() => {}); } catch (e) {}

    let done = false;
    const reveal = () => {
      if (done) return; done = true;
      show(buffer);                                 // painting + on top → fully covers the live clip
      if (bufferKind === 'idle') { activeMode = 'idle'; idlesPlayed += 1; }
      else { activeMode = 'special'; idlesPlayed = 0; }
      if (animLabel) animLabel.textContent = baseName(buffer);

      hide(active);                                 // now safe to drop the old layer behind
      try { active.pause(); } catch (e) {}
      const justPlayed = active; active = buffer; buffer = justPlayed;   // swap roles
      swapping = false;
      primeNext();                                  // preload the following clip
      scheduleCross();                              // arm the next transition
    };

    if (typeof buffer.requestVideoFrameCallback === 'function') {
      buffer.requestVideoFrameCallback(() => reveal());   // fires when frame 0 is on screen
      setTimeout(reveal, 120);                            // safety net (< LEAD: active still live)
    } else {
      setTimeout(reveal, 40);
    }
  }

  // fallback: if a clip reaches its natural end before a cross was armed/fired
  function onEnded(e) { if (e.target === active && !swapping) beginCross(); }
  // once a (re)started clip knows its duration, (re)arm the cross
  function onMeta(e) { if (e.target === active && !swapping && !crossTimer) scheduleCross(); }
  layers.forEach(v => {
    v.addEventListener('ended', onEnded);
    v.addEventListener('loadedmetadata', onMeta);
  });

  // "Animations" gaff button → show/hide the current clip name under the wolf
  if (animBtn && animLabel) {
    animBtn.addEventListener('click', () => {
      const on = animLabel.style.display === 'none' || !animLabel.style.display;
      animLabel.style.display = on ? 'block' : 'none';
      animBtn.classList.toggle('is-active', on);
      if (on) animLabel.textContent = baseName(active);
    });
  }

  // ── start: play the idle on the active layer, preload what's next ──
  hide(buffer);
  active.style.zIndex = '2'; buffer.style.zIndex = '1';
  active.__logical = SIDEWOLF.default;
  active.setAttribute('src', alphaSrc(SIDEWOLF.default));
  activeMode = 'idle'; idlesPlayed = 1;            // first idle counts as played
  show(active);
  try { active.currentTime = 0; } catch (e) {}
  active.play().catch(() => {});
  if (animLabel) animLabel.textContent = baseName(active);
  primeNext();
  scheduleCross();                                 // arm the first cross (onMeta re-arms if duration is late)

  // muted autoplay can still be blocked until the first gesture — kick it then
  if (active.paused) {
    const kick = () => { active.play().catch(() => {}); };
    document.addEventListener('pointerdown', kick, { once: true });
    document.addEventListener('keydown', kick, { once: true });
  }
}

  };

  __mods["sidewolf-clips"] = function (exports, require) {
/* AUTO-GENERATED by tools/build.js — SideWolf animation clips. Do not edit. */

const SIDEWOLF = {
  "default": "assets/webm/Sidewolf.webm",
  "specials": [
    "assets/webm/Sidewolf_bandana.webm",
    "assets/webm/Sidewolf_blows.webm",
    "assets/webm/Sidewolf_chillin.webm",
    "assets/webm/Sidewolf_confused.webm",
    "assets/webm/Sidewolf_dances.webm",
    "assets/webm/Sidewolf_excited.webm",
    "assets/webm/Sidewolf_fighting.webm",
    "assets/webm/Sidewolf_fistpump.webm",
    "assets/webm/Sidewolf_grins.webm",
    "assets/webm/Sidewolf_hat.webm",
    "assets/webm/Sidewolf_headtilt.webm",
    "assets/webm/Sidewolf_jig.webm",
    "assets/webm/Sidewolf_laughing.webm",
    "assets/webm/Sidewolf_neck.webm",
    "assets/webm/Sidewolf_polite.webm",
    "assets/webm/Sidewolf_posture.webm",
    "assets/webm/Sidewolf_sniffing.webm",
    "assets/webm/Sidewolf_sniffs.webm",
    "assets/webm/Sidewolf_tilt.webm"
  ]
};

Object.assign(exports, { SIDEWOLF });

  };

  __mods["background-loop"] = function (exports, require) {
/**
 * @module background-loop
 * @description Guarantees the looping background video (#bg-video) keeps playing.
 *
 * The element already has the `loop` attribute, but iOS Safari is unreliable here:
 * it sometimes fires `ended` instead of re-looping, pauses the video when the tab
 * is backgrounded, and may hold autoplay until the first user gesture. This re-arms
 * playback on all of those, so the saloon backdrop never freezes.
 */

function initBackgroundLoop() {
  const v = document.getElementById('bg-video');
  if (!v || v.tagName !== 'VIDEO') return;   // on mobile it's a static <img> — nothing to loop
  v.loop = true;
  v.muted = true;            // required for autoplay on iOS

  const kick = () => { try { if (v.paused) v.play().catch(() => {}); } catch (e) {} };

  // iOS occasionally fires `ended` instead of looping — restart from the top.
  v.addEventListener('ended', () => { try { v.currentTime = 0; } catch (e) {} kick(); });
  // if it ever pauses (backgrounding, a decode hiccup), nudge it back to playing.
  v.addEventListener('pause', kick);
  // resume when the tab / app returns to the foreground.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  // first user interaction unblocks autoplay if the browser was holding it.
  ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
    window.addEventListener(ev, kick, { once: true, passive: true }));

  kick();
}

Object.assign(exports, { initBackgroundLoop });

  };

  __mods["dev-mode"] = function (exports, require) {
/**
 * @module dev-mode
 * @description Hides developer / admin tools on the public build. They are OFF
 * by default. To turn them on, add ?dev=1 (or #dev) to the URL once — the choice
 * is remembered in localStorage; ?dev=0 (or #nodev) turns it back off.
 *
 * When dev mode is OFF, anything tagged `.dev-tool` is hidden and the backtick
 * debug panel shortcut is inert (gated via DEV_MODE in base-game.js).
 *
 * NOTE: this is a convenience gate to keep tools out of normal players' way, not
 * hard security — these tools only hand out demo credits / change the local math
 * model and expose no secrets, so client-side hiding is appropriate.
 */

function compute() {
  try {
    const params = new URLSearchParams(location.search);
    const hash = location.hash.replace('#', '').toLowerCase();
    if (params.get('dev') === '1' || hash === 'dev')   localStorage.setItem('bbw_dev', '1');
    if (params.get('dev') === '0' || hash === 'nodev') localStorage.removeItem('bbw_dev');
    return localStorage.getItem('bbw_dev') === '1';
  } catch (e) {
    return false;   // localStorage blocked → default to the safe (public) state
  }
}

const DEV_MODE = compute();

if (DEV_MODE) {
  document.body.classList.add('dev-mode');
} else {
  // Remove every dev-only control from view for normal players.
  document.querySelectorAll('.dev-tool').forEach(el => el.classList.add('hidden'));
}

Object.assign(exports, { DEV_MODE });

  };

  __mods["fit-screen"] = function (exports, require) {
/**
 * @module fit-screen
 * @description Scales the whole game to fit short / mobile viewports without
 * scrolling — the key to a good iPhone-landscape experience.
 *
 * The game is authored at a fixed natural size (#game-root ≈ 920×663). This
 * module ALWAYS centres it in the viewport with equal margins top & bottom, and
 * — when the window is too small (phone landscape, short windows) — also applies
 * a uniform `scale()` so the whole cabinet still fits without scrolling. On a
 * roomy desktop the scale is simply 1, so it just sits perfectly centred.
 * Re-runs on resize / orientation change.
 */

const PAD = 6;   // breathing room around the scaled game (px)

// Touch devices: render the cabinet into a slightly smaller backing store. iOS
// Safari rasterises a scaled-down layer at its on-screen size, so shaving the
// effective scale ~10% cuts composited pixels ~19% (fewer to paint every frame
// during a spin) for a barely-perceptible loss of sharpness on a phone screen.
const TOUCH = typeof window !== 'undefined' && window.matchMedia &&
              window.matchMedia('(pointer: coarse)').matches;
const RENDER_SCALE = TOUCH ? 0.9 : 1;

/** Read the current safe-area insets (0 on desktop; non-zero on iOS with viewport-fit=cover). */
function safeInsets() {
  const p = document.createElement('div');
  p.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(p);
  const cs = getComputedStyle(p);
  const v = s => parseFloat(cs.getPropertyValue(s)) || 0;
  const out = { t: v('padding-top'), r: v('padding-right'), b: v('padding-bottom'), l: v('padding-left') };
  p.remove();
  return out;
}

/** Measure the game, compute the fit scale, and apply it (or restore natural layout). */
function fitScreen() {
  const g = document.getElementById('game-root');
  if (!g) return;

  // Reset to natural layout so we can measure the true unscaled size.
  document.body.classList.remove('fit-mode');
  g.style.transform = '';
  g.style.left = '';
  g.style.top = '';
  g.style.width = '';

  const gw = g.offsetWidth, gh = g.offsetHeight;
  if (!gw || !gh) return;

  const ins = safeInsets();
  const availW = Math.max(1, window.innerWidth  - ins.l - ins.r - PAD * 2);
  const availH = Math.max(1, window.innerHeight - ins.t - ins.b - PAD * 2);

  // Fit to the viewport (never upscale past natural), then apply the mobile
  // render-scale trim so phones composite fewer pixels.
  const scale = Math.min(availW / gw, availH / gh, 1) * RENDER_SCALE;

  // Always centre the game (fixed) inside the safe-area box so it has EQUAL
  // margins top & bottom and can never produce a scrollbar — even at natural
  // size (scale 1) on a roomy desktop.
  const sw = gw * scale, sh = gh * scale;
  const left = ins.l + PAD + Math.max(0, (availW - sw) / 2);
  const top  = ins.t + PAD + Math.max(0, (availH - sh) / 2);

  document.body.classList.add('fit-mode');
  g.style.width = gw + 'px';        // pin natural width (fixed pos would otherwise stretch to 100%)
  g.style.left = left + 'px';
  g.style.top = top + 'px';
  g.style.transform = `scale(${scale})`;
}

// Debounce with setTimeout (not requestAnimationFrame, which pauses in background
// tabs) so a rotate / resize always re-fits.
let timer = 0;
function schedule() { clearTimeout(timer); timer = setTimeout(fitScreen, 120); }

/** Wire up listeners and do an initial fit. Call once at startup. */
function initFitScreen() {
  fitScreen();
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(fitScreen, 250));
  // re-fit once late assets (fonts/videos) settle the natural size
  window.addEventListener('load', () => setTimeout(fitScreen, 150));
  setTimeout(fitScreen, 600);
}

Object.assign(exports, { fitScreen, initFitScreen });

  };

  __mods["install-hint"] = function (exports, require) {
/**
 * @module install-hint
 * @description A tasteful, one-time "Add to Home Screen" nudge on iOS Safari.
 *
 * Shown only when it makes sense: on an iPhone/iPad that is NOT already running
 * as an installed (standalone) app, and only once ever (remembered in
 * localStorage). Launching from the Home Screen, or tapping ✕, retires it.
 * Installing gives the player a fullscreen, landscape, native-feeling game with
 * its own icon — no Safari chrome.
 */

const { IS_IOS } = require("video-format");

const KEY = 'bbw_a2hs_seen';

/** Already launched as an installed app? Then never nudge. */
function isStandalone() {
  return window.navigator.standalone === true ||
         (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

function initInstallHint() {
  if (!IS_IOS || isStandalone()) return;              // not iOS, or already installed
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}   // already shown once

  // iOS share glyph (square with up-arrow) so the instruction is unmistakable.
  const shareIcon =
    '<svg class="a2hs-share" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 3l4 4-1.4 1.4L13 6.8V15h-2V6.8L9.4 8.4 8 7l4-4z" fill="currentColor"/>' +
      '<path d="M5 11h3v2H6v6h12v-6h-2v-2h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" fill="currentColor"/>' +
    '</svg>';

  const el = document.createElement('div');
  el.id = 'a2hs-hint';
  el.setAttribute('role', 'dialog');
  el.innerHTML =
    '<img class="a2hs-ico" src="assets/icon-180.png" alt="">' +
    '<div class="a2hs-text">' +
      '<b>Play fullscreen</b>' +
      '<span>Tap ' + shareIcon + ' <b>Share</b>, then <b>“Add to Home Screen.”</b></span>' +
    '</div>' +
    '<button class="a2hs-close" aria-label="Dismiss">&times;</button>';
  document.body.appendChild(el);

  // mark seen as soon as it appears → truly one-time
  try { localStorage.setItem(KEY, '1'); } catch (e) {}

  let gone = false;
  const close = () => {
    if (gone) return; gone = true;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  };
  el.querySelector('.a2hs-close').addEventListener('click', close);

  setTimeout(() => el.classList.add('show'), 1400);   // let the game settle first
  setTimeout(close, 13000);                            // auto-dismiss if ignored
}

Object.assign(exports, { initInstallHint });

  };

  __mods["lazy-assets"] = function (exports, require) {
/**
 * @module lazy-assets
 * @description Web load optimisation — keep FIRST PLAY instant.
 *
 * Only the essentials load up front: the code, the reel symbols, the intro splash
 * and the page/background videos, and the (tiny) core sound effects. Everything
 * decorative or rare is held back and brought in *after* the game is interactive:
 *
 *   1. Background videos flagged `data-lazy-src` (the 5 MB reel-window backdrop)
 *      are started once first paint is done — they stream in behind the intro
 *      splash, so the player never waits on them.
 *   2. Bonus-only media (the cutscene videos, frame-morph clips, bonus pigs and
 *      bonus music — only seen ~1 in 180 spins) is quietly warmed into the HTTP
 *      cache at low priority, so a bonus never stalls but nothing competes with
 *      the first spin.
 *
 * The SideWolf reaction clips (~40 MB) are deliberately NOT prefetched — they're
 * heavy and already stream in on demand as the idle wolf cycles through them.
 */

const { alphaSrc, IS_IOS } = require("video-format");   // warm the right format (Safari uses .mp4 for alpha)

/** Start any <video data-lazy-src> that was held back from the initial load.
 *  Skipped on iOS: the decorative reel backdrop is just another video competing
 *  for iOS's limited concurrent decoders — dropping it keeps the wolf + reels smooth. */
function activateLazyVideos() {
  if (IS_IOS) return;
  document.querySelectorAll('video[data-lazy-src]').forEach(v => {
    const src = v.dataset.lazySrc;
    if (!src || v.getAttribute('src')) return;
    v.setAttribute('src', src);
    v.removeAttribute('data-lazy-src');
    try { v.load(); } catch (e) {}
    if (v.hasAttribute('data-lazy-autoplay')) v.play().catch(() => {});
  });
}

/* Bonus-only media — warmed in the background, low priority, staggered. */
const WARM = [
  'assets/webm/Three_pigs_bonus_intro.webm',
  'assets/webm/Wolf_blowing_tornado.webm',
  'assets/webm/F1-straw.webm',
  'assets/webm/F2-wood.webm',
  'assets/webm/F3-brick.webm',
  'assets/bonus_pig_straw.webp',
  'assets/bonus_pig_wood.webp',
  'assets/bonus_pig_brick.webp',
  'assets/audio/music/bgm_bonus.mp3',
];
function warmExtras() {
  // the frame-morph clips (F1/F2/F3) are transparent → fetch the format this
  // browser will actually use (.mp4 on Safari). The rest are opaque / audio.
  WARM.forEach((u, i) => setTimeout(() => {
    const url = /F[123]-/.test(u) ? alphaSrc(u) : u;
    try { fetch(url, { cache: 'force-cache', priority: 'low' }).catch(() => {}); } catch (e) {}
  }, i * 500));   // stagger so the warm-up never saturates the connection
}

/** Run after the game is interactive (call once at startup). */
function initLazyAssets() {
  const go = () => {
    setTimeout(activateLazyVideos, 600);   // backdrop videos: stream in during the intro splash
    setTimeout(warmExtras, 2500);          // bonus extras: warm once first paint has settled
  };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

Object.assign(exports, { initLazyAssets });

  };

  __mods["mobile-media"] = function (exports, require) {
/**
 * @module mobile-media
 * @description On phones, the base game's three decorative videos are the main
 * source of sluggishness — they decode simultaneously, and one (the SPIN badge)
 * carries an alpha channel that iOS software-decodes:
 *     • #bg-video        the full-screen saloon background  (Background.webm)
 *     • #reel-bg-video   the "Wanted" poster reel backdrop  (Wanted_poster.webm)
 *     • #spin-video      the transparent SPIN badge         (Spin.webm)
 * On any mobile device we skip all three and show pre-optimized static images
 * (assets/mobile/*.webp) instead — zero video decoding on the base game. Desktop
 * is untouched. (The background video's src is held in a data-attribute so it
 * never even begins downloading on mobile; desktop wires it up here.)
 *
 * This module runs BEFORE the scene/game modules import, so they pick up the
 * swapped <img> elements (idle-poster's glow still works on the static poster;
 * the SPIN-badge code no-ops harmlessly on an <img>).
 */

const { IS_MOBILE } = require("video-format");

const bg     = document.getElementById('bg-video');
const reelBg = document.getElementById('reel-bg-video');
const spin   = document.getElementById('spin-video');

/** Replace a <video> with an <img> that keeps the same id + classes, so the
 *  existing CSS positions it identically and no video ever decodes. */
function toStatic(video, src) {
  if (!video) return;
  const img = document.createElement('img');
  img.id = video.id;
  img.className = video.className;
  img.alt = '';
  img.src = src;
  video.replaceWith(img);
}

if (IS_MOBILE) {
  toStatic(bg,     'assets/mobile/background.webp');
  toStatic(reelBg, 'assets/mobile/wanted_poster.webp');
  toStatic(spin,   'assets/mobile/spin.webp');
} else if (bg && bg.dataset.bgSrc && !bg.getAttribute('src')) {
  // Desktop: the background video's src was kept out of the HTML so it never
  // starts downloading on mobile — wire it up now and play.
  bg.setAttribute('src', bg.dataset.bgSrc);
  if (bg.play) bg.play().catch(() => {});
}

  };

  __mods["shortcuts"] = function (exports, require) {
/**
 * @module shortcuts
 * @description One central keyboard map for the whole game. It drives the real
 * controls (it clicks the actual buttons / nudges the real sliders) so every
 * shortcut inherits the exact same guards and side-effects as a mouse click —
 * no duplicated game logic lives here.
 *
 * Two contexts:
 *   • Panel CLOSED → game shortcuts (Space = spin, ↑/↓ = bet, A/T/B, etc.)
 *   • Panel OPEN   → arrow-key navigation between the drawer controls, with
 *                    ←/→ to drag the focused volume slider and Enter/Space to
 *                    activate the highlighted control.
 *
 * A summary table ships as docs/Keyboard_Shortcuts.pdf (tools/shortcuts-pdf.cjs).
 */

const $ = id => document.getElementById(id);
const drawerEl = () => $('options-drawer');
const panelEl  = () => $('options-panel');

const isDrawerOpen = () => { const d = drawerEl(); return !!d && d.classList.contains('open'); };
const openModal    = () => document.querySelector('.modal-overlay:not(.hidden)');

/** Fire a control's own click handler (keeps all its guards). */
function click(id) { const el = $(id); if (el && !el.disabled) el.click(); }

/** Visible, enabled, focusable controls inside the drawer, top-to-bottom. */
function focusables() {
  const p = panelEl();
  if (!p) return [];
  return [...p.querySelectorAll('button, input')].filter(el => el.offsetParent !== null && !el.disabled);
}

/** Roving focus: move the highlight up/down the drawer controls, wrapping around. */
function moveFocus(dir) {
  const items = focusables();
  if (!items.length) return;
  const cur = items.indexOf(document.activeElement);
  const next = cur === -1 ? (dir > 0 ? 0 : items.length - 1) : (cur + dir + items.length) % items.length;
  items[next].focus();
}

/** Drag a focused volume slider by ±delta (clamped 0–100) and fire its input handler. */
function nudgeSlider(slider, delta) {
  const v = Math.max(0, Math.min(100, (parseInt(slider.value, 10) || 0) + delta));
  slider.value = v;
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

function openDrawer()  { const d = drawerEl(); if (d) d.classList.add('open'); }
function closeDrawer() { const d = drawerEl(); if (d) d.classList.remove('open'); }
function toggleDrawer() {
  const d = drawerEl();
  if (!d) return;
  d.classList.toggle('open');
  if (d.classList.contains('open')) {
    requestAnimationFrame(() => { const f = focusables()[0]; if (f) f.focus(); });  // land on the first control
  }
}

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;            // never hijack browser / OS chords (⌘R, ⌘V…)

  const t = e.target, tag = t && t.tagName;
  const typing = (tag === 'INPUT' && t.type !== 'range') || tag === 'TEXTAREA' || (t && t.isContentEditable);
  if (typing) return;                                        // let people type in real fields

  const key = e.key;

  // ── Esc — close the top-most surface (popup → drawer) ──
  if (key === 'Escape') {
    const m = openModal();
    if (m) { const c = m.querySelector('.modal-close'); if (c) c.click(); return; }
    if (isDrawerOpen()) closeDrawer();
    return;
  }
  if (openModal()) return;   // a popup owns the keyboard (e.g. HELP's ←/→ page turns)

  // ── Panel OPEN — arrow-key navigation ──
  if (isDrawerOpen()) {
    if (key === 'ArrowDown') { e.preventDefault(); moveFocus(1);  return; }
    if (key === 'ArrowUp')   { e.preventDefault(); moveFocus(-1); return; }
    if ((key === 'ArrowRight' || key === 'ArrowLeft') && tag === 'INPUT' && t.type === 'range') {
      e.preventDefault(); nudgeSlider(t, key === 'ArrowRight' ? 5 : -5); return;
    }
    if (e.code === 'Space' || key === 'Enter') return;       // let the focused control activate natively
    if (key.toLowerCase() === 'o') { e.preventDefault(); closeDrawer(); return; }
    // any other key falls through to the global shortcuts below
  }

  // ── Global game shortcuts (panel closed, or letter keys while open) ──
  if ((e.code === 'Space' || key === 'Enter') && !isDrawerOpen()) { e.preventDefault(); click('btn-spin'); return; }
  if (!isDrawerOpen()) {
    if (key === 'ArrowUp')   { e.preventDefault(); click('btn-bet-up');   return; }
    if (key === 'ArrowDown') { e.preventDefault(); click('btn-bet-down'); return; }
  }
  if (key === '+' || key === '=') { click('btn-bet-up');   return; }
  if (key === '-' || key === '_') { click('btn-bet-down'); return; }

  switch (key.toLowerCase()) {
    case 'a': click('btn-auto'); break;                          // auto-spin on/off
    case 't': { const c = $('chk-turbo'); if (c) c.click(); break; }   // turbo on/off
    case 'b': click('btn-buy-bonus'); break;                     // buy bonus
    case 'h': click('btn-help'); break;                          // help
    case 'r': click('btn-rules'); break;                         // rules
    case 'm': openDrawer(); click('btn-vol-mute'); break;        // mute all / unmute
    case 'v': openDrawer(); click('btn-sound'); break;           // open/close the volume panel
    case 'o': toggleDrawer(); break;                             // open/close the side options panel
    default: return;
  }
}

document.addEventListener('keydown', onKey);

  };

  __mods["video-format"] = function (exports, require) {
/**
 * @module video-format
 * @description Picks the transparent-video format the current browser can
 * actually render WITH transparency.
 *
 * Safari — macOS and iOS, and in fact *every* iOS browser, since they're all
 * WebKit under the hood — does NOT support an alpha channel in WebM (VP8/VP9).
 * It draws the clip on a solid black box. WebKit's supported transparent format
 * is HEVC-with-alpha in an .mp4 (see tools/alpha-mp4.js, which makes one twin
 * per transparent clip). Chrome / Firefox / Edge are the mirror image: WebM
 * alpha works, HEVC-alpha doesn't. So WebKit is served the .mp4 and everyone
 * else the .webm.
 *
 * Apply alphaSrc() / data-alpha-src ONLY to genuinely transparent clips (the
 * SideWolf, the SPIN badge, the frame-morph overlays). Opaque clips have no
 * .mp4 twin and must keep their .webm.
 */

const ua = navigator.userAgent || '';
const isIOS = /iPad|iPhone|iPod/.test(ua) ||
              (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));   // iPadOS poses as a Mac
const isDesktopSafari = /Safari/.test(ua) &&
              !/Chrome|Chromium|CriOS|Android|Edg|OPR|Firefox|FxiOS/.test(ua);

/** True on iPhone / iPad (all iOS browsers are WebKit). iOS software-decodes
 *  HEVC-alpha and throttles concurrent videos, so callers lighten up here. */
const IS_IOS = isIOS;

/** True on any phone or tablet (iOS + Android, every browser). Mobile gets the
 *  lightest build: purely-decorative video extras (the SideWolf character) are
 *  skipped entirely there — see src/scenes/side-wolf.js. */
const IS_MOBILE = isIOS || /Android|Mobi/i.test(ua);

/** True when this browser needs HEVC-alpha .mp4 instead of WebM-alpha. */
const USE_HEVC_ALPHA = isIOS || isDesktopSafari;

/** Map a transparent-clip URL (`…/foo.webm`) to the format this browser can show with alpha. */
function alphaSrc(url) {
  if (!USE_HEVC_ALPHA || !url) return url;
  return url.replace(/\.webm(\?|#|$)/i, '.mp4$1');
}

/**
 * Set the right src on any `<video data-alpha-src="…/foo.webm">` element.
 * Call once at startup (before the players try to use those elements).
 */
function initAlphaVideos() {
  document.querySelectorAll('video[data-alpha-src]').forEach(v => {
    if (v.id === 'side-wolf') return;   // the SideWolf is managed by side-wolf.js
                                        // (and skipped outright on mobile) — never auto-load it here
    if (v.getAttribute('src')) return;
    v.setAttribute('src', alphaSrc(v.dataset.alphaSrc));
  });
}

Object.assign(exports, { IS_IOS, IS_MOBILE, USE_HEVC_ALPHA, alphaSrc, initAlphaVideos });

  };

  __mods["web-push"] = function (exports, require) {
/**
 * @module web-push
 * @description Dev-only "🔔 Web Push" button (hidden on the public build).
 *
 * Opens a styled popup (matching the other modals) that:
 *   • shows where the game is deployed live, with COPY LINK / OPEN SITE actions, and
 *   • offers a "🚀 PUSH TO WEB" button that builds + deploys your current local
 *     version straight to the live site.
 *
 * A browser page can't run a shell command on its own, so the push works via a
 * tiny hook on the LOCAL dev server (tools/serve.js → POST /__deploy, which runs
 * ./deploy.sh). That hook only exists locally — on the live site (or file://)
 * the capability ping fails and the button stays disabled. So you can push from
 * here while developing, but the public/client site can never trigger a deploy.
 *
 * When the deploy target changes, update LIVE_URL below (and the same URL in
 * deploy.sh).
 */

// The current public deploy target. Keep in sync with deploy.sh.
const LIVE_URL = 'https://super-lolly-c99fd8.netlify.app';

const btn      = document.getElementById('btn-web-push');
const modal    = document.getElementById('webpush-modal');
const closeBtn = document.getElementById('btn-close-webpush');
const linkEl   = document.getElementById('webpush-link');
const urlText  = document.getElementById('webpush-url-text');
const statusEl = document.getElementById('webpush-status');
const copyBtn  = document.getElementById('btn-webpush-copy');
const openBtn  = document.getElementById('btn-webpush-open');
const pushBtn  = document.getElementById('btn-webpush-push');

if (btn && modal) {
  // Fill in the link once (strip the protocol for a cleaner display).
  if (linkEl)  linkEl.href = LIVE_URL;
  if (urlText) urlText.textContent = LIVE_URL.replace(/^https?:\/\//, '');

  let canDeploy = false;

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.opacity = '1';
    statusEl.style.color = kind === 'err'  ? '#FF6B6B'
                         : kind === 'info' ? '#CFE8D6'
                         : '#2EE85A';
  }
  function clearStatus() { if (statusEl) { statusEl.innerHTML = '&nbsp;'; statusEl.style.color = ''; } }

  // Ask the local dev server whether it can deploy (only tools/serve.js answers).
  async function checkCapability() {
    if (!pushBtn) return;
    try {
      const res = await fetch('/__deploy', { method: 'GET' });
      if (!res.ok) throw 0;
      const data = await res.json();
      canDeploy = !!data.capable;
    } catch (e) { canDeploy = false; }
    pushBtn.disabled = !canDeploy;
    pushBtn.title = canDeploy
      ? 'Build and deploy your current local version to the live site'
      : 'Only works on the local dev server (node tools/serve.js)';
  }

  const openModal  = () => { clearStatus(); modal.classList.remove('hidden'); checkCapability(); };
  const closeModal = () => modal.classList.add('hidden');

  btn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  if (openBtn) openBtn.addEventListener('click', () => window.open(LIVE_URL, '_blank', 'noopener'));

  if (copyBtn) copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(LIVE_URL);
      setStatus('✓ Link copied to clipboard', 'ok');
    } catch (e) {
      setStatus('Copy failed — long-press the link to copy', 'err');
    }
    setTimeout(clearStatus, 1800);
  });

  if (pushBtn) pushBtn.addEventListener('click', async () => {
    if (pushBtn.disabled) return;
    pushBtn.disabled = true;
    pushBtn.classList.add('deploying');
    const label = pushBtn.textContent;
    pushBtn.textContent = '⏳ DEPLOYING…';
    setStatus('Building & uploading to Netlify… (~20–40s)', 'info');
    try {
      const res = await fetch('/__deploy', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setStatus(`✓ Pushed live! (${Math.round((data.durationMs || 0) / 1000)}s)`, 'ok');
      } else {
        setStatus(`✗ Deploy failed${data.code != null ? ` (exit ${data.code})` : ''} — check the terminal.`, 'err');
      }
    } catch (e) {
      setStatus('✗ Couldn’t reach the local deploy server.', 'err');
    } finally {
      pushBtn.textContent = label;
      pushBtn.classList.remove('deploying');
      pushBtn.disabled = !canDeploy;
    }
  });
}

Object.assign(exports, { LIVE_URL });

  };

  require('main');
})();
