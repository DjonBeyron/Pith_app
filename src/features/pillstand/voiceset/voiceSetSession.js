// Ход «Записи набора» (v3.3.188, CONCEPT_VOICESET.md) — автомат без лишних нажатий: пауза с показом задания (gap) → окно записи (rec: длина — по отсчётам звука, а не по таймеру) → клип
// сохраняется (saving) → следующее незаписанное задание. Звук приходит кусками (chunk): последние PRE_MS всегда лежат в кольце и входят в клип как предзапись.
// Команды: pause / resume (прерванный клип переписывается с паузы-показа), redoPrev («Переписать прошлый»: ближайшее назад записанное или пропущенное задание — клип удаляется, потом ход
// возвращается к первому незаписанному), skip («Пропустить»: в набор не попадёт, при «Продолжить набор» не спрашивается), finish. Задание с hold (блок «на вытянутой руке») само встаёт на паузу.
// Предупреждение о прошлом клипе (warn: 'novoice' — голоса не было, 'late' — слово не уместилось в окно) держит следующую паузу-показ дольше — человек успевает нажать «Переписать прошлый».
// Чистая логика: сохранение (save / drop / onSkip), таймеры и onState подставляются; React-обёртка — useVoiceSetRun.js.
import { GAP_MS, PRE_MS } from './voiceSetPlan.js'
import { clipStats } from './voiceSetMeter.js'

export const WARN_GAP_MS = 2600    // пауза-показ после клипа с предупреждением
export const SECTION_GAP_MS = 2000 // пауза-показ перед первым заданием нового раздела и после «Начать» / «Продолжить»

export function createVoiceSetSession({ plan, done: doneIn = [], skipped: skippedIn = [], save, drop = async () => {}, onSkip = () => {}, onState = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, gapMs = GAP_MS, preMs = PRE_MS }) {
  const done = new Set(doneIn), skipped = new Set(skippedIn), held = new Set()
  let phase = 'idle', pos = null, clip = null, timer = 0, recKey = 0, warn = null, pauseWhy = '', error = '', ring = [], ringMs = 0, busy = false

  const pending = from => { for (let i = Math.max(0, from); i < plan.length; i++) if (!done.has(i) && !skipped.has(i)) return i; return null }
  const prevHandled = from => { for (let i = Math.min(plan.length, from) - 1; i >= 0; i--) if (done.has(i) || skipped.has(i)) return i; return null }
  const state = () => {
    const after = pos == null ? null : pending(pos + 1)
    return { phase, i: pos, item: pos == null ? null : plan[pos], after: after == null ? null : plan[after], done: done.size, skipped: skipped.size, total: plan.length, left: plan.length - done.size - skipped.size,
      warn, recKey, pauseWhy, error, canRedo: !busy && prevHandled(pos ?? plan.length) != null }
  }
  const set = (p, extra = {}) => { phase = p; pauseWhy = extra.pauseWhy ?? ''; error = extra.error ?? ''; onState(state()) }
  const stopClip = () => { clearTimer(timer); timer = 0; clip = null }

  function goto(i, fresh = false) { // fresh — после «Начать» / «Продолжить»: пауза-показ длиннее (человек готовится, счётчик голоса успевает оценить шум заново открытого микрофона)
    stopClip()
    pos = i
    if (i == null) { set('done'); return }
    const it = plan[i]
    if (it.hold && !held.has(i)) { held.add(i); set('hold'); return }
    const first = fresh || i === 0 || plan[i - 1].section !== it.section
    set('gap')
    timer = setTimer(beginRec, warn ? WARN_GAP_MS : first ? Math.max(gapMs, SECTION_GAP_MS) : gapMs)
  }
  function beginRec() {
    timer = 0
    clip = { chunks: ring.slice(), pre: ringMs, got: 0 }
    recKey += 1; warn = null
    set('rec')
  }
  function finishClip() {
    const it = plan[pos], c = clip
    clip = null; busy = true
    set('saving')
    const stats = clipStats(c.chunks, { preMs: c.pre })
    Promise.resolve().then(() => save(it, { chunks: c.chunks, stats, preMs: Math.round(c.pre) })).then(() => {
      busy = false
      done.add(it.i)
      warn = it.voiced && stats.noVoice ? { kind: 'novoice', i: it.i } : (it.kind === 'word' || it.kind === 'phrase') && stats.late ? { kind: 'late', i: it.i } : null // кашель и стук в окно умещаться не обязаны
      if (phase === 'saving') goto(pending(it.i + 1) ?? pending(0))
      else onState(state())
    }, e => { busy = false; if (phase === 'saving') set('paused', { pauseWhy: e?.mic ? 'mic' : 'save', error: String(e?.message ?? e) }); else onState(state()) }) // e.mic — в клипе ровный ноль: микрофон оглох, клип не сохранён
  }

  return {
    state,
    /** Начать (или продолжить набор) с первого незаписанного задания */
    start() { if (phase === 'idle' || phase === 'done') goto(pending(0), true) },
    /** Кусок звука { data: Float32Array, rms, game, ms, voice, noise } — приходит всегда, пока открыт захват */
    chunk(c) {
      ring.push(c); ringMs += c.ms
      while (ring.length > 1 && ringMs - ring[0].ms >= preMs) { ringMs -= ring[0].ms; ring.shift() }
      if (phase !== 'rec' || !clip) return
      clip.chunks.push(c); clip.got += c.ms
      if (clip.got >= plan[pos].ms) finishClip()
    },
    /** Захват перезапущен (микрофон оживал): старый звук в предзапись не идёт */
    resetRing() { ring = []; ringMs = 0 },
    /** Пауза: why — 'user' | 'mic' | 'hidden'. Идущий клип выбрасывается */
    pause(why = 'user') {
      if (phase === 'idle' || phase === 'done') return
      if (phase === 'hold') return // ждём «Продолжить» и так; плашку микрофона экран покажет сам
      if (phase === 'paused') { if (why === 'mic' && pauseWhy !== 'mic') set('paused', { pauseWhy: 'mic' }); return }
      stopClip()
      set('paused', { pauseWhy: why })
    },
    resume() { if (phase === 'paused' || phase === 'hold') goto(pos ?? pending(0), true) },
    /** «Переписать прошлый» → Promise (клип удалён из хранилища) */
    async redoPrev() {
      const i = prevHandled(pos ?? plan.length)
      if (i == null || busy) return false
      stopClip(); busy = true
      const was = done.has(i)
      done.delete(i); skipped.delete(i); warn = null
      try { if (was) await drop(i); else onSkip([...skipped]) } finally { busy = false }
      goto(i)
      return true
    },
    /** «Пропустить» текущее задание */
    skip() {
      if (pos == null || phase === 'idle' || phase === 'done' || phase === 'saving') return
      stopClip()
      skipped.add(pos); warn = null
      onSkip([...skipped])
      goto(pending(pos + 1) ?? pending(0))
    },
    /** «Закончить»: запись остановлена, набор остаётся в хранилище */
    finish() { stopClip(); pos = null; set('done') },
    dispose() { stopClip(); phase = 'idle' },
  }
}
