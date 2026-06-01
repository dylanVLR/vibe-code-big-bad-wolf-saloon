/**
 * @module sound
 * @description Sound for Big Bad Wolf. Exports two ready-to-use singletons:
 *   `synth` – one-shot sound effects (pre-rendered MP3s in assets/audio/sfx/)
 *   `bgm`   – looping background music (base-game + bonus tracks, crossfaded)
 * Both are created once here and shared via ES-module caching.
 */
'use strict';

/* ── Sound effects ── */
class Synth {
  constructor() {
    this.enabled = true;
    this._volume = 0.7;       // 0..1
    this._spinAudio = null;   // the looping reel-spin sound
    this._windAudio = null;   // the looping tornado-wind sound
    this._active = new Set();
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

  /** Stop all currently playing one-shot sounds. */
  stopAll() {
    for (const a of this._active) {
      try { a.pause(); a.currentTime = 0; } catch (e) {}
    }
    this._active.clear();
    this.stopSpin();
    this.windStop();
  }

  /** Play a one-shot SFX that may overlap others. */
  _oneShot(filename, vol = 1.0) { return this._play(filename, vol, false); }

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

  // ── coins ──
  coinTick() {
    if (!this.enabled) return;
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

export const synth = new Synth();
export const bgm = new BGMusic();
