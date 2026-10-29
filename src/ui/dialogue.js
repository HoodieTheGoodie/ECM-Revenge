// Dialogue owns its clock so Tippy can keep talking while the simulation is paused.
export class TippyDialogue {
  constructor({ settings, onActiveChange, panel, requestFrame, cancelFrame } = {}) {
    this.settings = settings;
    this.onActiveChange = onActiveChange;
    this.panel = panel ?? document.querySelector('#tippy-panel');
    this.text = this.panel.querySelector('#tippy-text');
    this.button = this.panel.querySelector('#tippy-next');
    this.label = this.panel.querySelector('#tippy-label');
    this.progress = this.panel.querySelector('#tippy-progress');
    this.announcement = this.panel.querySelector('#tippy-announcement');
    this.shade = document.querySelector('#tippy-shade');
    this.requestFrame = requestFrame ?? ((callback) => globalThis.requestAnimationFrame?.(callback));
    this.cancelFrame = cancelFrame ?? ((id) => globalThis.cancelAnimationFrame?.(id));
    this.active = false;
    this.lines = [];
    this.index = 0;
    this.frame = null;
    this.button.addEventListener('click', () => this.continue());
    this.text.addEventListener('click', () => { if (this.typing) this.reveal(); });
    this.keyHandler = (event) => {
      if (!this.active || (!this.blocking && !this.panel.contains(document.activeElement))) return;
      if (!['Enter', ' '].includes(event.key) || event.repeat) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.continue();
    };
    globalThis.window?.addEventListener('keydown', this.keyHandler, true);
  }

  show(messages, { blocking = false, onComplete } = {}) {
    this.hide();
    this.lines = (Array.isArray(messages) ? messages : [messages]).map((line) => typeof line === 'string' ? { text: line } : line).filter((line) => line?.text != null);
    if (!this.lines.length) { onComplete?.(); return; }
    this.index = 0;
    this.active = true;
    this.blocking = blocking;
    this.onComplete = onComplete;
    this.previousFocus = document.activeElement;
    this.panel.hidden = false;
    this.panel.classList.toggle('is-blocking', blocking);
    this.panel.setAttribute('role', blocking ? 'dialog' : 'region');
    this.panel.setAttribute('aria-modal', String(blocking));
    if (this.shade) this.shade.hidden = !blocking;
    this.onActiveChange?.(true, blocking);
    this.showLine();
    if (blocking) this.button.focus({ preventScroll: true });
  }

  showLine() {
    this.stopClock();
    const line = this.lines[this.index];
    // Array.from keeps surrogate pairs together as the line is revealed.
    this.characters = Array.from(String(line.text));
    this.visibleCharacters = 0;
    this.elapsed = 0;
    this.text.textContent = '';
    this.typing = this.characters.length > 0;
    this.panel.classList.toggle('is-speaking', this.typing);
    this.button.textContent = this.typing ? 'REVEAL TEXT' : this.nextLabel();
    if (this.label) this.label.textContent = line.label ?? (this.blocking ? 'SIGNAL PAUSED / LISTENING' : 'RUNNER COMMS / CONNECTED');
    if (this.progress) this.progress.textContent = this.lines.length > 1 ? `${String(this.index + 1).padStart(2, '0')} / ${String(this.lines.length).padStart(2, '0')}` : this.blocking ? 'TIME PAUSED' : 'LIVE SIGNAL';
    // Screen readers receive one complete sentence, never a stream of letters.
    if (this.announcement) this.announcement.textContent = String(line.text);
    line.onShow?.();
    if (this.settings?.reducedMotion ?? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) this.reveal();
    else if (this.typing) this.startClock();
  }

  nextLabel() { return this.index + 1 < this.lines.length ? 'CONTINUE →' : this.blocking ? 'CONTINUE →' : 'GOT IT'; }

  startClock() {
    let previous;
    const tick = (now) => {
      this.frame = null;
      if (!this.active || !this.typing) return;
      this.update(previous == null ? 0 : Math.min((now - previous) / 1000, 0.1));
      previous = now;
      if (this.active && this.typing) this.frame = this.requestFrame(tick);
    };
    this.frame = this.requestFrame(tick);
  }

  update(deltaTime) {
    if (!this.active || !this.typing) return;
    if (this.settings?.reducedMotion) { this.reveal(); return; }
    this.elapsed += Math.max(0, deltaTime);
    while (this.visibleCharacters < this.characters.length) {
      const previous = this.characters[this.visibleCharacters - 1];
      const interval = /[.!?]/.test(previous ?? '') ? 0.14 : /[,;:]/.test(previous ?? '') ? 0.075 : 0.018;
      if (this.elapsed < interval) break;
      this.elapsed -= interval;
      this.visibleCharacters += 1;
    }
    this.text.textContent = this.characters.slice(0, this.visibleCharacters).join('');
    if (this.visibleCharacters >= this.characters.length) this.reveal();
  }

  reveal() {
    this.stopClock();
    this.visibleCharacters = this.characters?.length ?? 0;
    this.text.textContent = this.characters?.join('') ?? '';
    this.typing = false;
    this.panel.classList.remove('is-speaking');
    this.button.textContent = this.nextLabel();
  }

  continue() {
    if (!this.active) return;
    if (this.typing) { this.reveal(); return; }
    if (++this.index < this.lines.length) { this.showLine(); return; }
    const complete = this.onComplete;
    this.hide();
    complete?.();
  }

  stopClock() {
    if (this.frame != null) this.cancelFrame(this.frame);
    this.frame = null;
  }

  hide() {
    this.stopClock();
    const wasActive = this.active;
    this.active = false;
    this.typing = false;
    this.onComplete = null;
    this.panel.hidden = true;
    this.panel.classList.remove('is-speaking', 'is-blocking');
    if (this.shade) this.shade.hidden = true;
    if (wasActive) {
      this.onActiveChange?.(false, this.blocking);
      if (this.panel.contains(document.activeElement) && this.previousFocus?.isConnected) this.previousFocus.focus?.({ preventScroll: true });
    }
    this.blocking = false;
  }

  destroy() {
    this.hide();
    globalThis.window?.removeEventListener('keydown', this.keyHandler, true);
  }
}
