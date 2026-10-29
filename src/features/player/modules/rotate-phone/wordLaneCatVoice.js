import { codeAt, chatterTrack } from './wordLaneVisemes.js'
import { mouthShape, HALF_AT } from './wordLaneMouth.js'
import { VOICE_AT } from './wordLaneCatPeek.js'
import { catDebug } from './wordLaneCatDebug.js'

// Кто ведёт рот кота — микрофон/диктор (mouth) или его реплика (speak). Чистая логика без DOM и React: рот, взгляд и выскакивание приходят аргументами (hold, look, peek), время и таймеры — тоже, поэтому проверяется тестами.
//  • mouth(level, code?) — громкость голоса 0…1 (+ форма по букве) → рот. Пока идёт реплика, он ничего не делает: ни рот, ни усы, ни выскакивание — микрофон (эхо динамика, шум) не должен перебить дорожку;
//    такие попытки считаются (micBlocked) и попадают в журнал отладки.
//  • speak(track, ms, meta?) — реплика: рот идёт по дорожке track ms мс. Дорожки нет (пустой текст) — рот «жуёт» запасным циклом (chatterTrack), а не стоит. Усы (talking) подтверждаются каждый кадр и держатся
//    до конца реплики; конец — по кадру ИЛИ по таймеру (если кадры не идут: вкладка в фоне, перегруз): что бы ни случилось, реплика закрывается и микрофон снова ведёт рот. Новых rAF сверх прежнего нет: один цикл на реплику.
//  • stop() — компонент размонтирован/пересобран: цикл и таймер сняты, реплика закрыта (раньше флаг «идёт реплика» оставался, и микрофон навсегда переставал двигать рот).
const END_SLACK_MS = 80 // таймер конца реплики срабатывает на столько позже расчётного конца: кадр успевает сам закрыть реплику

export function createCatVoice({
  hold, look, peek, drawn = () => 0, now = () => performance.now(), raf = f => requestAnimationFrame(f), caf = id => cancelAnimationFrame(id),
  setTimer = setTimeout, clearTimer = clearTimeout, log = catDebug,
}) {
  let line = null // { id, t0, ms, track, d0, micBlocked }
  let rafId = 0
  let endTimer = 0

  const unschedule = () => { caf(rafId); clearTimer(endTimer); endTimer = 0 }
  const close = why => {
    if (!line) return
    const l = line
    line = null
    unschedule()
    hold.set('closed'); look.lineEnd(); look.talking(false)
    log('cat-speak-end', { id: l.id, ms: Math.round(l.ms), played: Math.round(now() - l.t0), shapes: drawn() - l.d0, micBlocked: l.micBlocked, why })
  }

  const step = () => {
    if (!line) return
    const el = now() - line.t0
    if (el >= line.ms) { close('done'); return }
    look.talking(true) // каждый кадр: усы держатся до конца реплики, даже если кто-то снаружи попросил их снять
    hold.set(codeAt(line.track, el))
    rafId = raf(step)
  }

  return {
    mouth(level, code = null) {
      if (line) { line.micBlocked += 1; return }
      hold.set(code && level >= HALF_AT ? code : mouthShape(level))
      peek.voice(level)
      look.talking(level >= VOICE_AT)
    },
    speak(track, ms, meta = null) {
      if (!(ms > 0)) return
      if (line) close('replaced')
      const has = Array.isArray(track) && track.length > 0
      line = { id: meta?.id ?? null, t0: now(), ms, track: has ? track : chatterTrack(ms), d0: drawn(), micBlocked: 0 }
      log('cat-speak', { id: line.id, ms: Math.round(ms), trackLen: has ? track.length : 0, empty: !has, up: peek.isUp() })
      peek.hold(ms + 400)
      look.lineStart(); look.talking(true)
      hold.set(codeAt(line.track, 0))
      rafId = raf(step)
      endTimer = setTimer(() => close('timer'), ms + END_SLACK_MS)
    },
    /** Идёт ли реплика */
    busy: () => line !== null,
    stop() { close('stopped'); unschedule() },
  }
}
