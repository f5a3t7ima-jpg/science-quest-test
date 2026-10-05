/* Science at Home V8: recorded dialogue only. No synthesis or voice discovery. */
class RecordedDialogueAudio {
  constructor(manifest, options = {}) {
    this.manifest = manifest;
    this.options = options;
    this.serial = 0;
    this.current = null;
    this.lastFailure = null;
    this.audio = options.audio || new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = 0.85;
    this.audio.setAttribute?.('playsinline', '');
    this.preloads = new Map();
    this.lastRequest = null;
    this.unlocking = null;
    this.unlocked = false;
  }
  alias(speaker) {
    if (/^(Mariam|main girl|girl|Me)$/i.test(speaker)) return 'Me';
    if (/question|review|narrator/i.test(speaker)) return 'Question';
    if (/saqr|AI/i.test(speaker)) return 'Saqr';
    if (/brother|sibling/i.test(speaker)) return 'Brother';
    if (/^mother$/i.test(speaker)) return 'Mom';
    if (/^father$/i.test(speaker)) return 'Dad';
    return Object.keys(this.manifest.cast).find(k => k.toLowerCase() === String(speaker).toLowerCase()) || 'Question';
  }
  resolve(text, speaker = 'Me') {
    const id = this.manifest.lookup[JSON.stringify([this.alias(speaker), String(text).trim()])];
    return id ? this.manifest.clips[id] : null;
  }
  status() {
    return this.manifest.ready ? 'Recorded character voices' : 'Recordings pending';
  }
  snapshot() {
    return {busy:!!this.current, speaker:this.current?.speaker || null,
      lineId:this.current?.lineId || null, clipId:this.current?.clipId || null,
      failure:this.lastFailure,
      cast:Object.fromEntries(Object.entries(this.manifest.cast).map(([key,value]) => [key,value.voiceName || value.name])),
      available:Object.keys(this.manifest.clips).length, recorded:true};
  }
  changed() { this.options.onChange?.(this.current); }
  clearHandlers() {
    for (const name of ['onplaying','onended','onerror','onwaiting','onstalled']) this.audio[name] = null;
  }
  clearTimers() {
    clearTimeout(this.loadingTimer);
    clearInterval(this.progressTimer);
    this.loadingTimer = this.progressTimer = null;
  }
  // Called synchronously from the existing START / resume button interaction.
  unlock() {
    if (this.unlocked || this.current) return;
    if (this.unlocking) return this.unlocking;
    const token = this.serial;
    // Short silent WAV unlocks this same media element, without a second button.
    this.audio.src = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
    try {
      const promise = this.audio.play();
      this.unlocking = Promise.resolve(promise).then(() => {
        this.unlocked = true;
        if (token === this.serial && !this.current) {
          this.audio.pause();
          this.audio.currentTime = 0;
        }
      }).catch(() => {
        // A later deliberate replay can retry. Never leave an unhandled promise.
      }).finally(() => { this.unlocking = null; });
      return this.unlocking;
    } catch { this.unlocking = null; }
  }
  stop() {
    this.serial++;
    this.clearTimers();
    this.clearHandlers();
    this.audio.pause();
    this.audio.removeAttribute?.('src');
    this.audio.load?.();
    this.current = null;
    this.lastFailure = null;
    this.changed();
  }
  speak(text, speaker = 'Me', onDone, lineId = '') {
    this.stop();
    const token = this.serial;
    const role = this.alias(speaker);
    if (!text || this.options.muted?.()) { onDone?.(); return; }
    const clip = this.resolve(text, role);
    let finished = false;
    const finish = (reason = null) => {
      if (token !== this.serial || finished) return;
      finished = true;
      this.clearTimers();
      this.clearHandlers();
      this.audio.pause();
      if (reason) {
        this.audio.removeAttribute?.('src');
        this.audio.load?.();
        console.warn('[Science at Home audio]', {lineId,clipId:clip?.id,reason});
      }
      this.current = null;
      this.lastFailure = reason;
      this.changed();
      onDone?.();
    };
    if (!clip || clip.status !== 'ready') { finish('Recording not ready'); return; }
    // Paths must be same-site relative assets, never third-party voice APIs.
    if (!/^audio\/[a-z0-9_-]+\/[a-z0-9_-]+\.mp3$/.test(clip.src)) {
      finish('Invalid audio asset path'); return;
    }
    this.lastRequest = {text, speaker:role, lineId};
    this.current = {busy:true,speaker:role,text,started:false,clipId:clip.id,lineId};
    this.changed();
    this.audio.src = clip.src;
    const expected = this.audio.src;
    const valid = () => token === this.serial && !finished && this.audio.src === expected;
    this.audio.onplaying = () => {
      if (!valid()) return;
      clearTimeout(this.loadingTimer);
      this.current.started = true;
      this.unlocked = true;
      this.changed();
    };
    this.audio.onended = () => { if (valid() && this.audio.ended) finish(); };
    this.audio.onerror = () => { if (valid()) finish('Audio could not load'); };
    // No four-second cut-off. Watch for a stalled clock, not a long recording.
    let lastTime = -1;
    let lastProgress = Date.now();
    this.progressTimer = setInterval(() => {
      if (!valid()) return;
      if (this.audio.currentTime !== lastTime) {
        lastTime = this.audio.currentTime;
        lastProgress = Date.now();
      } else if (Date.now() - lastProgress > 12000) finish('Audio playback stalled');
    }, 500);
    this.loadingTimer = setTimeout(() => finish('Audio loading timed out'), 10000);
    try {
      const promise = this.audio.play();
      if (promise?.catch) promise.catch(error => {
        if (valid()) finish(error.name === 'NotAllowedError' ? 'Playback needs a tap to retry' : 'Audio could not play');
      });
    } catch { finish('Audio could not play'); }
  }
  replay() {
    if (!this.lastRequest) return;
    const {text,speaker,lineId} = this.lastRequest;
    this.speak(text,speaker,null,lineId);
  }
  preloadDialogue(lines) {
    const clips = [];
    for (const {text,speaker} of lines) {
      const clip = this.resolve(text,speaker);
      if (clip?.status === 'ready' && clip.id !== this.current?.clipId && !clips.some(c => c.id === clip.id)) clips.push(clip);
      if (clips.length === 2) break;
    }
    const wanted = new Set(clips.map(c => c.id));
    for (const [id,element] of this.preloads) if (!wanted.has(id)) {
      element.pause();element.removeAttribute('src');element.load();this.preloads.delete(id);
    }
    for (const clip of clips) if (!this.preloads.has(clip.id)) {
      const element = this.options.createPreload ? this.options.createPreload() : new Audio();
      element.preload = 'auto';
      element.src = clip.src;
      this.preloads.set(clip.id,element);
      element.load();
    }
  }
  test(onDone) {
    this.unlock();
    const lines = Object.values(this.manifest.tests).map(id => this.manifest.clips[id]);
    let index = 0;
    const next = () => {
      if (index >= lines.length) { onDone?.();return; }
      const clip=lines[index++];
      this.preloadDialogue(lines.slice(index,index+2));
      this.speak(clip.text,clip.speaker,next,'teacher-test.'+clip.id);
    };
    next();
  }
  cleanup() {
    this.stop();
    this.preloadDialogue([]);
    this.lastRequest = null;
  }
}
