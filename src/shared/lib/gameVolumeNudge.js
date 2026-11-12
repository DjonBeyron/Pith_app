// «Встряска громкости» (замечание владельца, iPhone, v3.3.192: «игра тише, чем может играть телефон; помогает кнопка громкости: тише, потом громче на миг — и игра громкая, как надо»).
// Что вероятно происходит: пока микрофон открыт, iOS держит аудиосессию в режиме записи + воспроизведения и применяет к выходу своё ослабление; нажатие кнопки громкости заставляет систему
// применить громкость к текущему маршруту заново. Из страницы кнопку не нажать, поэтому — способы «дёрнуть» вывод, НЕ трогая микрофон (поток и контекст захвата остаются как есть):
//  • 'ctx'      — игровой AudioContext: suspend() → resume() (вывод на миг останавливается и запускается заново; только если контекст сейчас 'running');
//  • 'session'  — navigator.audioSession.type: 'auto' → 150 мс → прежний тип (так делает «Сказать фразу», SESSION_RESET_MS);
//  • 'playback' — тип 'playback' на 150 мс и назад (риск: iOS может на миг заглушить дорожку микрофона — игра это переживает: mute без паузы);
//  • 'media'    — короткий беззвучный элемент <audio>: play() → конец (медиасессия страницы заново применяет громкость маршрута);
//  • 'all'      — ctx → session → media по очереди.
// Настройка pithy_game_volume_nudge_v1 (Админ → «Голос» → «Громкость на iPhone»): 'off' (по умолчанию) или способ — тогда встряска идёт сама через NUDGE_WAIT_MS после открытия
// микрофона игры (gameMic.js, 'granted'). Те же способы — кнопками в админке для проверки на слух. Каждое действие — строка «[audio] встряска громкости: …» в журнале игры.
// Зависимости подставляются (тесты без браузера).
import { peekGameCtx } from './gameAudioCtx.js'
import { createAudioSession } from './speech/speechAudioSession.js'
import { pLog } from './debug.js'

export const VOLUME_NUDGE_KEY = 'pithy_game_volume_nudge_v1'
export const NUDGE_MODES = ['off', 'ctx', 'session', 'playback', 'media', 'all']
export const NUDGE_WAIT_MS = 400   // после открытия микрофона маршрут успокаивается — потом встряхиваем
export const NUDGE_GAP_MS = 150    // тип сессии на столько мс уходит в сторону и возвращается
const CTX_WAIT_MS = 500            // suspend / resume контекста дольше — не ждём (iOS иногда повисает)

export const readNudgeMode = (store = globalThis.localStorage) => { try { const v = store?.getItem(VOLUME_NUDGE_KEY); return NUDGE_MODES.includes(v) ? v : 'off' } catch { return 'off' } }
export const writeNudgeMode = (value, store = globalThis.localStorage) => { try { if (NUDGE_MODES.includes(value) && value !== 'off') store?.setItem(VOLUME_NUDGE_KEY, value); else store?.removeItem(VOLUME_NUDGE_KEY) } catch { /* приватный режим */ } }

/** Беззвучный WAV (8 кГц, 8 бит, моно) для <audio>: data-URL */
export function silentWavUrl(ms = 250) {
  const n = Math.round(8 * ms), b = new Uint8Array(44 + n)
  const dv = new DataView(b.buffer), w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i) }
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true)
  b.fill(128, 44)
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return `data:audio/wav;base64,${globalThis.btoa(s)}`
}

const raceMs = (p, ms, setTimer) => Promise.race([Promise.resolve(p).catch(() => {}), new Promise(r => setTimer(r, ms))])

function defaults() {
  return {
    ctx: () => peekGameCtx(),
    session: createAudioSession(),
    audio: () => { try { return new globalThis.Audio(silentWavUrl()) } catch { return null } },
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    setTimer: (f, ms) => setTimeout(f, ms), // не голый setTimeout в свойстве: вызов как метод объекта — Illegal invocation (nativeTimerGuard.test.js)
    log: pLog,
  }
}

/** Одна встряска. → { how, ok, ms, steps: [строки] }; ничего не бросает */
export async function nudgeVolume(how, deps = {}) {
  const d = { ...defaults(), ...deps }, steps = [], t0 = performance.now()
  const sessionLine = () => `audioSession=${d.session.supported() ? d.session.current() ?? '—' : 'нет API'}`
  const ctxStep = async () => {
    const c = d.ctx()
    if (!c || c.state !== 'running') { steps.push(`контекст: ${c ? c.state : 'нет'} — пропуск`); return false }
    await raceMs(c.suspend(), CTX_WAIT_MS, d.setTimer)
    await raceMs(c.resume(), CTX_WAIT_MS, d.setTimer)
    steps.push(`контекст: suspend→resume, теперь ${c.state}`)
    return c.state === 'running'
  }
  const sessionStep = async away => {
    if (!d.session.supported()) { steps.push('сессия: нет API (нужен Safari 16.4+)'); return false }
    const back = d.session.current() ?? 'auto'
    if (back === away) { steps.push(`сессия: уже ${away} — пропуск`); return false }
    const ok1 = d.session.set(away)
    await d.sleep(NUDGE_GAP_MS)
    const ok2 = d.session.set(back)
    steps.push(`сессия: ${back}→${away}→${back}${ok1 && ok2 ? '' : ' (не всё удалось)'}`)
    return ok1 && ok2
  }
  const mediaStep = async () => {
    const a = d.audio()
    if (!a) { steps.push('<audio>: не создаётся'); return false }
    try {
      await raceMs(new Promise(res => { a.onended = res; a.onerror = res; Promise.resolve(a.play()).catch(res) }), 1500, d.setTimer)
      try { a.pause() } catch { /* уже закончил */ }
      steps.push('<audio>: беззвучный проигран')
      return true
    } catch { steps.push('<audio>: не сыграл'); return false }
  }
  let ok = false
  try {
    if (how === 'ctx') ok = await ctxStep()
    else if (how === 'session') ok = await sessionStep('auto')
    else if (how === 'playback') ok = await sessionStep('playback')
    else if (how === 'media') ok = await mediaStep()
    else if (how === 'all') { const a = await ctxStep(); const b = await sessionStep('auto'); const c = await mediaStep(); ok = a || b || c }
    else steps.push(`неизвестный способ «${how}»`)
  } catch (e) { steps.push(`ошибка: ${e?.message ?? e}`) }
  const res = { how, ok, ms: Math.round(performance.now() - t0), steps }
  try { d.log(`[audio] встряска громкости: ${how} — ${ok ? 'сделано' : 'не вышло'}, ${res.ms} мс; ${steps.join('; ')}; ${sessionLine()}`) } catch { /* журнал не мешает */ }
  return res
}

/** Микрофон игры открыт: если в настройке выбран способ — встряхнуть вывод через NUDGE_WAIT_MS (не блокирует). → true, если запланировано */
export function autoNudgeAfterMic(deps = {}) {
  const mode = (deps.mode ?? readNudgeMode)()
  if (mode === 'off') return false
  const later = deps.setTimer ?? ((f, ms) => setTimeout(f, ms))
  later(() => { nudgeVolume(mode, deps).catch(() => {}) }, deps.waitMs ?? NUDGE_WAIT_MS)
  return true
}

/** Тест-звук для проверки на слух: три коротких тона (уровень как у звуков игры, RMS −18 dBFS) через игровой контекст. → AudioBuffer или null */
export function testToneBuffer(ctx) {
  if (!ctx?.createBuffer) return null
  const rate = ctx.sampleRate || 44100, len = Math.round(rate * 1.5), buf = ctx.createBuffer(1, len, rate), ch = buf.getChannelData(0)
  ;[392, 523.25, 659.25].forEach((f, k) => {
    const from = Math.round(rate * 0.5 * k), n = Math.round(rate * 0.3)
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / (rate * 0.01)) * Math.min(1, (n - i) / (rate * 0.03))
      ch[from + i] = 0.18 * env * Math.sin(2 * Math.PI * f * i / rate)
    }
  })
  return buf
}
