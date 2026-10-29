const SETTINGS_KEY = 'echo-maze-2-settings';

export class Settings {
  constructor() {
    this.audio = true;
    this.screenShake = false;
    this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      for (const key of ['audio', 'screenShake', 'reducedMotion']) if (typeof saved?.[key] === 'boolean') this[key] = saved[key];
    } catch { /* Storage is optional for preferences. */ }
    this.apply();
  }

  bind() {
    for (const [id, key] of [['settings-audio', 'audio'], ['settings-shake', 'screenShake'], ['settings-reduced-motion', 'reducedMotion']]) {
      const control = document.querySelector(`#${id}`);
      if (!control) continue;
      control.checked = this[key];
      control.addEventListener('change', () => {
        this[key] = control.checked;
        this.apply();
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ audio: this.audio, screenShake: this.screenShake, reducedMotion: this.reducedMotion })); } catch { /* Keep this session's preferences. */ }
      });
    }
  }

  apply() { document.documentElement.classList.toggle('reduced-motion', this.reducedMotion); }
}

// Small synthesized cues keep the prototype self-contained and respect browser audio policies.
export class SoundEffects {
  constructor(settings) {
    this.settings = settings;
    this.lastPlayed = {};
    this.context = null;
    const unlock = () => {
      if (!this.settings.audio) return;
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return;
      try { this.context ??= new AudioContext(); this.context.resume().catch(() => {}); } catch { /* Game remains playable without sound. */ }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  play(name) {
    if (!this.settings.audio || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (now - (this.lastPlayed[name] ?? -Infinity) < 0.07) return;
    this.lastPlayed[name] = now;
    const cues = { attack: [390, 120, 0.08], gun: [900, 150, 0.09], special: [180, 720, 0.19], hit: [140, 60, 0.08], hurt: [100, 45, 0.18], pickup: [520, 1040, 0.14], save: [660, 1320, 0.24], unlock: [350, 700, 0.16], reflect: [800, 1400, 0.12], 'boss-hit': [150, 340, 0.14] };
    const [start, end, duration] = cues[name] ?? cues.pickup;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = ['hit', 'hurt', 'gun'].includes(name) ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
