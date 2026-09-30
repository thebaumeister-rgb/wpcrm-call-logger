/* Only the installed Android package exposes this bridge. There is no cloud fallback. */
(() => {
  if (!window.OfflineAndroid) return;
  let nextId = 0;
  const sessions = new Map();
  window.receiveOfflineSpeech = message => sessions.get(message.id)?.receive(message);
  window.OfflineSpeechRecognition = class {
    constructor() { this.offline = true; this.results = []; this.id = String(++nextId); }
    start() { sessions.set(this.id, this); OfflineAndroid.start(this.id); }
    abort() { sessions.delete(this.id); OfflineAndroid.stop(this.id, false); }
    finish() { this.finishing = true; OfflineAndroid.stop(this.id, true); }
    receive(message) {
      if (message.type === 'start') { this.onstart?.(); return; }
      if (message.type === 'error') { this.onerror?.({ error: message.text }); return; }
      if (message.type === 'end') { sessions.delete(this.id); this.onend?.(); return; }
      if (message.type !== 'result') return;
      const last = this.results.at(-1);
      const index = last && !last.isFinal ? this.results.length - 1 : this.results.length;
      if (!message.text && index === this.results.length) return;
      const result = [{ transcript: message.text }]; result.isFinal = message.final;
      this.results[index] = result;
      // This is an indexed snapshot, not a transcript to append to the previous preview.
      this.onresult?.({ resultIndex: index, results: this.results.slice() });
    }
  };
})();
