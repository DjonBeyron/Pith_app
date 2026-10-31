// Звук отсчёта «Репетиции» (план — rehearsalCountdown.js): три короткие ноты до — ми — соль. Играет тот же игровой AudioContext и тот же плеер (playGameBuffer), что и мяу награды: ноты синтезируются в AudioBuffer
// сразу (rehearsalCountdownSynth.js — без асинхронного декодирования), ГРОМКОСТЬ — GainNode с СВОЕЙ фиксированной величиной COUNT_GAIN: ни выбор «мяу / ноты / без звука», ни ползунок награды отсчёт не трогают (отсчёт — не награда).
// Тишину гасит только «без звука» урока (как у мяу). «Полная тишина приложения» (soundQuiet.isSilenced) здесь НЕ учитывается: её держит вкладка админки «Голос», из которой запускается шлифовка, — игра идёт поверх неё,
// и из-за этой проверки (v3.3.82) отсчёт молчал на iPhone, а мяу (проверки нет) играло. Каждая нота пишет в журнал игры строку `[countdown] …`: сыграна или причина тишины (контекст не запущен, «без звука», нет буфера).
// Нет Web Audio (pithy_game_web_audio_v1 выключен) — запасной <audio> с blob-ссылкой на WAV (звук громче нот награды; iOS volume игнорирует). Голоса системы здесь нет (синтез речи в игре запрещён).
import { getLessonMuted } from '../player/lessonVolume.js'
import { webAudioOn, getGameCtx, gameCtxState } from '../../shared/lib/gameAudioCtx.js'
import { playGameBuffer } from '../../shared/lib/gameBufferPlay.js'
import { pLog } from '../../shared/lib/debug.js'
import { makeNoteWav } from '../player/modules/rotate-phone/wordLaneNotes.js'
import { countdownPlan, countdownMs } from './rehearsalCountdown.js'
import { noteBuffer, dropNoteBuffers } from './rehearsalCountdownSynth.js'

export const COUNT_GAIN = 1      // громкость отсчёта в GainNode: фиксированная, от награды не зависит
const WAV_LOUD = 2.3             // запасной WAV: уровень относительно нот награды (RMS 0,08 → ≈ 0,18; makeNoteWav сам держит пик)
const wavOf = n => makeNoteWav(n.freq, n.ms, n.level * WAV_LOUD)
const els = new Map() // запасной путь: k → { a, url }
const say = (log, text) => { try { log(`[countdown] ${text}`) } catch { /* журнал не мешает звуку */ } }
const label = n => `нота ${n.k + 1}/3`

/** Подготовить ноты заранее (без жеста; безопасно звать много раз) и разбудить контекст, если он не 'running'. Нет Web Audio — ничего (запасной <audio> создаётся при первой ноте) */
export function warmCountdown() {
  if (!webAudioOn()) return
  const c = getGameCtx()
  if (!c) return
  for (const n of countdownPlan()) noteBuffer(c, n)
  if (c.state !== 'running') { try { Promise.resolve(c.resume()).catch(() => {}) } catch { /* вне жеста iOS может не пустить: нота сама попробует ещё раз */ } }
}

function playElement(n, log) {
  if (typeof Audio === 'undefined') { say(log, `${label(n)} НЕ сыграна: нет ни Web Audio, ни <audio>`); return false }
  try {
    let e = els.get(n.k)
    if (!e) { const url = URL.createObjectURL(new Blob([wavOf(n)], { type: 'audio/wav' })); e = { a: new Audio(url), url }; els.set(n.k, e) }
    e.a.volume = Math.min(1, COUNT_GAIN)
    e.a.currentTime = 0
    e.a.play().then(() => say(log, `${label(n)} сыграна через <audio> (Web Audio выключен)`), err => say(log, `${label(n)} НЕ сыграна: <audio> отказал (${err?.name ?? err})`))
    return true
  } catch (err) { say(log, `${label(n)} НЕ сыграна: ${err?.message ?? err}`); return false }
}

/** Сыграть ноту n плана (countdownPlan). false — не сыграла: «без звука» урока, нет буфера, нечем. Итог (сыграна / контекст не запустился) уходит в журнал `[countdown]` */
export function playCountdownNote(n, { log = pLog } = {}) {
  if (getLessonMuted()) { say(log, `${label(n)} НЕ сыграна: «без звука» в уроке`); return false }
  if (!webAudioOn()) return playElement(n, log)
  const c = getGameCtx()
  const buf = c ? noteBuffer(c, n) : null
  if (!buf) { say(log, `${label(n)} НЕ сыграна: нет буфера (контекст ${gameCtxState() ?? 'не создан'})`); return false }
  const was = c.state
  const ok = playGameBuffer(buf, {
    gain: COUNT_GAIN,
    onResult: res => say(log, res.play === 'started'
      ? `${label(n)} сыграна (контекст ${res.ctx}${was !== 'running' ? `, был ${was}` : ''}, старт за ${res.ms} мс, громкость ${COUNT_GAIN})`
      : `${label(n)} НЕ сыграна: ${res.play === 'ctx-stuck' ? `контекст не запустился (${res.ctx})` : `Web Audio отказал (${res.error ?? res.play})`}`),
  })
  if (!ok) say(log, `${label(n)} НЕ сыграна: плеер отказал`)
  return ok
}

/**
 * Отсчёт целиком по таймерам: ноты по плану от момента вызова. → функция «отменить» (смена стадии, пауза, выход). onDone() — когда отсчёт доиграл вместе с хвостом (стадия ждёт этого, rehearsalCountdownRun.js).
 * play/setTimer/log подставляются в тестах
 */
export function startCountdown({ plan = countdownPlan(), play = playCountdownNote, setTimer = setTimeout, clearTimer = clearTimeout, onDone = null, log = pLog } = {}) {
  warmCountdown()
  const played = []
  const ids = plan.map(n => setTimer(() => { played.push(!!play(n)) }, n.at))
  ids.push(setTimer(() => { say(log, `отсчёт: сыграно ${played.filter(Boolean).length} из ${plan.length}`); onDone?.() }, countdownMs(plan)))
  say(log, `отсчёт начат (контекст ${gameCtxState() ?? 'нет Web Audio'})`)
  return () => ids.forEach(t => clearTimer(t))
}

/** Игра закрыта: отпустить blob-ссылки запасного пути и буферы нот */
export function releaseCountdown() {
  for (const { a, url } of els.values()) { try { a.pause(); a.removeAttribute('src') } catch { /* уже свободен */ } URL.revokeObjectURL(url) }
  els.clear()
  dropNoteBuffers()
}
