// Звук отсчёта «Репетиции» (план — rehearsalCountdown.js): три короткие ноты до — ми — соль. Играет тот же игровой AudioContext, что и остальные звуки игры: синтезированный WAV (makeNoteWav, как у нот награды) декодируется в AudioBuffer
// (loadSoundBuffer), играет playGameBuffer, ГРОМКОСТЬ — GainNode (getRewardVolume, как у плашки и нот). «Без звука» в уроке и полная тишина приложения отсчёт гасят; выбор «мяу / ноты / без звука» у награды его НЕ меняет (отсчёт — не награда).
// Нет Web Audio (pithy_game_web_audio_v1 выключен) — запасной <audio> с blob-ссылкой на тот же WAV. Голоса системы здесь нет (системный синтез речи в игре запрещён).
import { getLessonMuted } from '../player/lessonVolume.js'
import { isSilenced } from '../../shared/lib/soundQuiet.js'
import { webAudioOn } from '../../shared/lib/gameAudioCtx.js'
import { playGameBuffer } from '../../shared/lib/gameBufferPlay.js'
import { getRewardVolume } from '../../shared/lib/rewardSound.js'
import { makeNoteWav } from '../player/modules/rotate-phone/wordLaneNotes.js'
import { loadSoundBuffer, soundBuffer, bytesOfWav } from '../player/modules/rotate-phone/wordLaneBuffers.js'
import { countdownPlan } from './rehearsalCountdown.js'

const id = k => `rh-count:${k}`
const wavOf = n => makeNoteWav(n.freq, n.ms, n.level)
const els = new Map() // запасной путь: k → { a, url }

/** Декодировать три ноты заранее (без жеста; безопасно звать много раз): к моменту отсчёта буферы готовы. Нет Web Audio — ничего (запасной <audio> создаётся при первой ноте) */
export function warmCountdown() {
  if (!webAudioOn()) return
  for (const n of countdownPlan()) loadSoundBuffer(id(n.k), () => bytesOfWav(wavOf(n)))
}

function playElement(n) {
  if (typeof Audio === 'undefined') return false
  try {
    let e = els.get(n.k)
    if (!e) { const url = URL.createObjectURL(new Blob([wavOf(n)], { type: 'audio/wav' })); e = { a: new Audio(url), url }; els.set(n.k, e) }
    e.a.volume = Math.min(1, getRewardVolume())
    e.a.currentTime = 0
    e.a.play().catch(() => {})
    return true
  } catch { return false }
}

/** Сыграть ноту n плана (countdownPlan). false — не сыграла: тишина урока / приложения, буфер ещё декодируется (догружаем на следующую), нечем */
export function playCountdownNote(n) {
  if (getLessonMuted() || isSilenced()) return false
  if (webAudioOn()) {
    const buf = soundBuffer(id(n.k))
    if (!buf) { warmCountdown(); return false }
    return playGameBuffer(buf, { gain: getRewardVolume() })
  }
  return playElement(n)
}

/** Отсчёт целиком по таймерам: ноты по плану от момента вызова; → функция «отменить» (смена стадии, пауза, выход). play подставляется в тестах */
export function startCountdown({ plan = countdownPlan(), play = playCountdownNote, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  warmCountdown()
  const ids = plan.map(n => setTimer(() => play(n), n.at))
  return () => ids.forEach(t => clearTimer(t))
}

/** Игра закрыта: отпустить blob-ссылки запасного пути (буферы Web Audio отпускает dropSoundBuffers вместе с остальными) */
export function releaseCountdown() {
  for (const { a, url } of els.values()) { try { a.pause(); a.removeAttribute('src') } catch { /* уже свободен */ } URL.revokeObjectURL(url) }
  els.clear()
}
