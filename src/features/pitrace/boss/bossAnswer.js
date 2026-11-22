// Финал «Шкала памяти»: где на шкале ставить отметку слова (владелец 2026-11-22: «треугольник фиксируется ниже, чем есть на самом деле: он едет ниже по линейке, хотя ответ был выше»).
// Слово засчитывается не в миг, когда ученик его сказал, а по итогу Vosk: голос → конец голоса (тишина 220 мс) → итог → кадр движка. По журналу владельца (iPhone, v3.3.339) от начала голоса до зачёта
// 549–698 мс; пилюля финала за это время проезжает ≈ 7–9 % высоты экрана (13 % в секунду) — на столько ниже вставали линия, треугольник и зона слова. Поправка честная, без констант: слушатель знает,
// когда началось высказывание (счётчик «голос / тишина» voskVoice: ms() — сколько шёл голос, quietMs() — сколько тишины после него), а шкала помнит путь линии этого слова по кадрам (след).
// В миг зачёта директор пишет сюда момент начала ответа, шкала в кадре, где увидела принятую пилюлю, ставит отметку туда, где линия была в тот момент. Тап (голоса нет) и старый голос — без поправки.
export const VOICE_STALE_MS = 3000 // голос кончился раньше — это не тот ответ (итог приходит не позже WAIT_MAX_MS = 2,5 с после слова, wordEarRule.js)
export const TRAIL_MS = 6000       // сколько мс пути линии шкала помнит
export const TRAIL_STEP_MS = 30    // точки следа не чаще

/** Сколько мс назад началось высказывание, в котором слово принято: voice — счётчик слушателя (listener.voice), life — сколько мс пилюля на экране (ответ не может начаться раньше её выезда). 0 — поправки нет */
export function answerBackMs(voice, life = Infinity) {
  const quiet = voice?.quietMs?.(), spoke = voice?.ms?.()
  if (quiet == null || !(spoke >= 0) || !(quiet >= 0) || quiet > VOICE_STALE_MS) return 0
  return Math.max(0, Math.min(spoke + quiet, life))
}

let at = null // когда начался ответ на слово, принятое последним (performance.now); шкала забирает один раз
export const setBossAnswerAt = t => { at = Number.isFinite(t) ? t : null }
export const takeBossAnswerAt = () => { const t = at; at = null; return t }

/** Директор, слово финала принято: запомнить момент начала ответа (now − поправка) → поправка, мс (для журнала) */
export function markBossAnswer(voice, life, now = performance.now()) {
  const back = answerBackMs(voice, life)
  setBossAnswerAt(back > 0 ? now - back : null)
  return Math.round(back)
}

/** След линии одного слова: push(id, t, y) — точка пути (новое слово — след с нуля), yAt(t, y) — где линия была в момент t (между точками — по прямой; раньше первой точки — первая точка: ответ начат,
 *  когда пилюля ещё не коснулась шкалы; t нет или он позже последней точки — y как есть) */
export function createTrail() {
  let id = null, pts = []
  return {
    push(pid, t, y) {
      if (pid !== id) { id = pid; pts = [] }
      const last = pts.at(-1)
      if (last && t - last.t < TRAIL_STEP_MS) return
      pts.push({ t, y })
      while (pts.length > 2 && t - pts[0].t > TRAIL_MS) pts.shift()
    },
    yAt(t, y) {
      if (t == null || !pts.length || t >= pts.at(-1).t) return y
      if (t <= pts[0].t) return Math.min(y, pts[0].y)
      const i = pts.findIndex(p => p.t >= t), a = pts[i - 1], b = pts[i]
      return Math.min(y, a.y + ((b.y - a.y) * (t - a.t)) / (b.t - a.t))
    },
  }
}

/** Слово принято: состояние линии tr (bossScale.trackStep, done) → то же, но на высоте, где линия была в момент начала ответа; поправки нет — tr как есть. Отметка только поднимается (ответ не позже зачёта) */
export function lockAtAnswer(tr, trail, answerAt) {
  const y = trail.yAt(answerAt, tr.y)
  return y < tr.y ? { ...tr, y, fixed: true } : tr
}
