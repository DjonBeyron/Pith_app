// Подмена Web Audio для тестов игры «Повтори за диктором» (в сборку не входит, импортируют только *.test.js): AudioContext с состояниями ('running' | 'suspended' | 'interrupted' | 'closed'), источники и усилители,
// которые запоминают, что с ними сделали, и OfflineAudioContext с decodeAudioData. Использование: const fake = makeFakeWebAudio({ state: 'running' }); vi.stubGlobal('AudioContext', fake.Ctx);
// vi.stubGlobal('window', { AudioContext: fake.Ctx, OfflineAudioContext: fake.Offline }).
//  • fake.resumeMode: 'ok' — resume() переводит контекст в 'running' сразу; 'hang' — промис висит, состояние не меняется (iOS: прерывание не кончилось); 'reject' — resume() отклоняется.
//  • fake.sources — все созданные AudioBufferSourceNode: { buffer, rate, gain, startedAt, stopped }; fake.ctxs — все контексты; fake.decodeSeconds — длина «декодированного» файла; fake.failDecode — decodeAudioData отклоняется.
export function makeFakeWebAudio({ state = 'running', decodeSeconds = 1.2 } = {}) {
  const fake = { ctxs: [], sources: [], resumeMode: 'ok', decodeSeconds, failDecode: false, decodes: 0, startState: state }

  class Ctx {
    constructor() { this.state = fake.startState; this.currentTime = 1.5; this.sampleRate = 48000; this.destination = { dest: true }; this.resumes = 0; this.closed = false; fake.ctxs.push(this) }
    setState(s) { this.state = s; this.onstatechange?.() }
    resume() {
      this.resumes += 1
      if (fake.resumeMode === 'hang') return new Promise(() => {})
      if (fake.resumeMode === 'reject') return Promise.reject(new Error('resume'))
      if (this.state !== 'closed') this.setState('running')
      return Promise.resolve()
    }
    close() { this.closed = true; this.setState('closed'); return Promise.resolve() }
    createBuffer(ch, len, rate) { return { duration: len / rate, length: len, sampleRate: rate, numberOfChannels: ch } }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} } }
    createBufferSource() {
      const src = {
        buffer: null, playbackRate: { value: 1 }, onended: null, stopped: false, startedAt: null,
        connect(g) { this.gainNode = g }, disconnect() {},
        start(when) { this.startedAt = when; fake.sources.push(this) },
        stop() { this.stopped = true },
      }
      Object.defineProperty(src, 'rate', { get: () => src.playbackRate.value })
      Object.defineProperty(src, 'gain', { get: () => src.gainNode?.gain.value })
      return src
    }
  }

  class Offline {
    decodeAudioData() {
      fake.decodes += 1
      if (fake.failDecode) return Promise.reject(new Error('decode'))
      const seconds = fake.decodeSeconds, rate = 8000, n = Math.round(seconds * rate)
      return Promise.resolve({ numberOfChannels: 1, length: n, sampleRate: rate, duration: seconds, getChannelData: () => Float32Array.from({ length: n }, (_, i) => (i > n * 0.1 && i < n * 0.8 ? Math.sin(i / 10) : 0)) })
    }
  }

  fake.Ctx = Ctx
  fake.Offline = Offline
  return fake
}
