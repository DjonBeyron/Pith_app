// Захват звука «Записи набора» (v3.3.188, CONCEPT_VOICESET.md) — ТОТ ЖЕ путь, что у слушателя игры: игровой поток микрофона (gameMic.js: те же ограничения getUserMedia, второго запроса нет),
// контекст захвата игры (voskCapture.acquireCaptureContext keep — один на игру, родная частота устройства), куски по 2048 кадров через ScriptProcessor (voskEngine: chunk 2048 у слушателя слов).
// Снимаются СЫРЫЕ отсчёты (MediaRecorder сжимает — не годится). Один узел с двумя входами держит оба звука отсчёт в отсчёт:
//  • канал 0 — сырой поток (он и пишется в WAV);
//  • канал 1 — поток после «Чувствительности микрофона» игры (voskGain.wireInput: GainNode ×gain + ограничитель) — то, что видит движок слушателя: по нему счётчик голоса и gamePeak манифеста.
// Автоусиление voskAgc.js здесь не применяется (оно в движке, при прогоне). onChunk({ data (копия сырых отсчётов), rms, game, ms }) — на каждый кусок; уровни — voskEngine.bufferRms.
import { acquireCaptureContext, releaseCapture } from '../../../shared/lib/vosk/voskCapture.js'
import { bufferRms } from '../../../shared/lib/vosk/voskEngine.js'
import { wireInput } from '../../../shared/lib/vosk/voskGain.js'
import { readMicGain } from '../../../shared/lib/gameMicGain.js'

export const CHUNK = 2048

const mono = (ctx) => { const g = ctx.createGain(); try { g.channelCount = 1; g.channelCountMode = 'explicit' } catch { /* старый WebKit: и так моно */ } return g }
const asBuf = d => ({ getChannelData: () => d })

/** «Заранее» — СИНХРОННО из нажатия («Начать», плашка «нажми»): контекст захвата игры создаётся и продолжается в жесте. На iPhone контекст, созданный позже (после await), остаётся
 *  'suspended' — кусков звука нет, сторож считает микрофон оглохшим. startCapture потом берёт тот же оставленный контекст. → состояние контекста или null */
export function primeCapture({ Ctx = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  try {
    const ctx = acquireCaptureContext(Ctx, { keep: true })
    Promise.resolve(ctx.resume?.()).catch(() => {})
    releaseCapture({ stream: null, nodes: [], ctx }) // счётчик пользователей назад, сам контекст остаётся (один на игру)
    return ctx.state ?? null
  } catch { return null }
}

/** stream — игровой поток (getGameMic). → { rate, gain, state(), lastAt(), stop() }; onState(state) — контекст захвата сменил состояние (iOS: 'interrupted' при звонке) */
export function startCapture({ stream, onChunk, onState = () => {}, gain = readMicGain(), Ctx = globalThis.AudioContext || globalThis.webkitAudioContext, now = () => performance.now() }) {
  const ctx = acquireCaptureContext(Ctx, { keep: true })
  let nodes = [], stopped = false, lastAt = now()
  try {
    const src = ctx.createMediaStreamSource(stream), raw = mono(ctx), game = mono(ctx), merge = ctx.createChannelMerger(2), node = ctx.createScriptProcessor(CHUNK, 2, 1)
    src.connect(raw); raw.connect(merge, 0, 0)
    const chain = wireInput(ctx, src, game, gain) // как у слушателя: источник → [усиление → ограничитель →] узел
    game.connect(merge, 0, 1)
    merge.connect(node)
    node.connect(ctx.destination) // без выхода ScriptProcessor в части браузеров не вызывается (на выход идёт тишина)
    node.onaudioprocess = ev => {
      if (stopped) return
      lastAt = now()
      const b = ev.inputBuffer, data = b.getChannelData(0).slice()
      try { onChunk({ data, rms: bufferRms(asBuf(data)), game: bufferRms(asBuf(b.getChannelData(1))), ms: b.duration * 1000 }) } catch { /* запись клипа не должна ронять захват */ }
    }
    nodes = [node, merge, raw, game, src, ...chain]
  } catch (e) { releaseCapture({ stream: null, nodes, ctx }); throw e }
  const onstate = () => { if (!stopped) onState(ctx.state) }
  try { ctx.addEventListener?.('statechange', onstate) } catch { /* без событий контекста: остаётся сторож по времени */ }
  return {
    rate: ctx.sampleRate, gain,
    state: () => ctx.state,
    /** Когда пришёл последний кусок звука (performance.now): давно — контекст встал */
    lastAt: () => lastAt,
    /** Попросить контекст продолжить (из тапа: после прерывания iOS) */
    resume() { try { return Promise.resolve(ctx.resume?.()).catch(() => {}) } catch { return Promise.resolve() } },
    stop() {
      if (stopped) return
      stopped = true
      try { ctx.removeEventListener?.('statechange', onstate) } catch { /* ничего */ }
      const node = nodes[0]
      if (node) node.onaudioprocess = null
      releaseCapture({ stream: null, nodes, ctx }) // контекст игры остаётся (один на игру), поток — тоже: им владеет gameMic
    },
  }
}
