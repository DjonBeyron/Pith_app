// Заливка ЖИВОГО повтора ученика за один кадр (шаг wordLaneStudent.stepStudent зовёт её, пока пилюли повтора видны) и защёлкивание куска. Чистая логика: время — аргументом t (мс ступени), dt — секунды.
// Модель: слово куска ещё не распознано — пилюля показывает только голос (breathStep: до подтверждения речи распознаванием — не выше PRE_CONFIRM_CAP, после — до FILL_CAP), распознанный кусок зеленеет (piece-ok),
// следующий до своего первого слова не наливается. Слив (drain) после чужого слова — у ещё не защёлкнутых кусков.
// «Аванс»: черновик распознавания пришёл после того, как повтор стал слышен (heardT ≥ openAt), а ученик говорит — цель текущего куска не ниже (сказанные слова куска + FILL_ADVANCE) / слов куска
// (первый partial сразу двигает заливку, а не ждёт следующего partial маленькой русской модели через 0,4–0,65 с; слова недосказанной цели — по одному). Экран догоняет цель плавно (wordLaneFillView.js).
// БЕЗ ОТКАТА ПОСРЕДИ РЕЧИ (2026-11-10, отчёт владельца со стенда, цель «window»: черновики-ловушки «win» → «wind» подняли заливку до 0,83, голос кончился — она упала до 0,40, и только потом пришёл зачёт;
// замер настоящим Vosk: 0,83 → 0,47 за 230 мс ожидания итога). Заливка «дышала» с громкостью: спад начинался в тот же кадр, где голос стих, хотя распознаватель ещё не ответил. Теперь, пока идёт высказывание —
// голос есть сейчас или был не дольше SPEECH_HOLD_MS назад (за это время приходит итог Vosk: 150 мс тишины + разбор), — заливка текущего куска только растёт (держит пик); стекает она, когда слово
// не подтвердилось: чужое слово (drain — сразу) или тишина дольше SPEECH_HOLD_MS без зачёта (мягкий спад, как раньше). Цель, «договорённая» только черновиком (хвост слушателя: русская выдержка, правило слова
// wordEarRule), а зачёта так и нет SPEECH_HOLD_MS после того, как хвост пропал, — слова снимаются, пилюля стекает (раньше оставалась на PENDING_TOP до конца повтора).
import { FILL_CAP, PRE_CONFIRM_CAP, PRE_CONFIRM_LONG_CAP, PRE_CONFIRM_LONG_MS, VOICE_THRESHOLD, isListening, breathStep, fillTo, drainStep } from './wordLaneTimeline.js'
import { FILL_ADVANCE } from './wordLaneFillView.js'

export const PENDING_TOP = 0.96         // слова последнего куска сказаны, ждём принятия (русская выдержка RU_SETTLE_MS + перерисовка): заливка не стоит на FILL_CAP, а дальше ползёт до этого уровня…
export const PENDING_MS = 450           // …за столько мс; принятие доводит до 100 %
export const SPEECH_HOLD_MS = 700       // высказывание «ещё идёт» столько мс после последнего голоса: заливка держит пик и ждёт ответа распознавателя, потом стекает

/** Защёлкнуть пилюлю: с момента at (+ delay, мс) заливка доезжает до 100 % за LOCK_MS (fin — доля доезда для экрана), щелчок и нота — когда она дойдёт (wordLaneStudent.stepLocks) */
export const lockPill = (p, at, delay = 0) => { p.state = 'lock'; p.from = p.p; p.lockAt = at + delay; p.snapped = false; p.fin = 0 }

export function stepFill(rep, dt, { level, confirmed, spoken, t, events, heardT = -Infinity }) {
  rep.openAt ??= t
  const open = rep.pills.filter(p => p.state === 'fly')
  const base = rep.cum[rep.pills.length - open.length]      // слова защёлкнутых кусков остаются произнесёнными
  if (rep.drain) {
    open.forEach(p => { p.p = drainStep(p.p, dt) })
    if (open.every(p => p.p <= 0.01)) { rep.drain = false; rep.tk = base; open.forEach(p => { p.p = 0; p.doneAt = null }) }
    return
  }
  const tok = confirmed && spoken && spoken.target === rep.target ? spoken.tokens : 0   // устаревший хвост (речи давно нет) куски не защёлкивает
  const all = rep.cum.at(-1)
  if (tok >= all) rep.saidAt = t                                                  // цель договорена черновиком — ждём принятия
  else if (rep.tk >= all && t - rep.saidAt >= SPEECH_HOLD_MS) { rep.tk = base; open.forEach(p => { p.doneAt = null }) } // хвост пропал, а зачёта нет — слово не подтвердилось
  rep.tk = Math.max(rep.tk, tok)                                                  // слова произнесены — не откатываются, пока распознаватель не отказал
  const active = rep.cum.findIndex((c, i) => i < rep.parts.length && rep.tk < rep.cum[i + 1])  // первый кусок, чьи слова ещё не все произнесены
  const settled = active <= 0 || rep.pills.slice(0, active).every(p => p.state === 'won')       // предыдущие куски зелёные до конца: две пилюли повтора голосом не наливаются
  const voice = settled && (active === 0 || rep.tk > rep.cum[active]) ? level : 0   // голос наливает текущий кусок; следующий — когда его первое слово услышано
  if (voice > VOICE_THRESHOLD) rep.voiceAt = t
  const hold = t - (rep.voiceAt ?? -Infinity) < SPEECH_HOLD_MS                      // высказывание идёт: заливка только растёт
  if (!hold) rep.voiceFrom = null; else rep.voiceFrom ??= t                         // сколько уже идёт звук (кашель — доли секунды, слово — дольше)
  const long = rep.voiceFrom != null && t - rep.voiceFrom >= PRE_CONFIRM_LONG_MS
  const cap = confirmed ? FILL_CAP : long ? PRE_CONFIRM_LONG_CAP : PRE_CONFIRM_CAP                                // речь подтверждена распознаванием — до FILL_CAP; ещё нет (шум, эхо, лаг partial) — лишь слегка
  const ahead = settled && active >= 0 && confirmed && heardT >= rep.openAt && (voice > 0 || tok > rep.cum[active]) ? Math.min(FILL_CAP, (rep.tk - rep.cum[active] + FILL_ADVANCE) / (rep.cnt[active] || 1)) : 0 // «аванс» по черновику
  rep.pills.forEach((p, i) => {
    if (p.state !== 'fly') return
    rep.peak = Math.max(rep.peak ?? 0, p.p) // самая полная заливка повтора — журнал «не успел» прохода B (уровень)
    const done = rep.tk >= rep.cum[i + 1]
    if (done && i < rep.parts.length - 1) { lockPill(p, t); events.push({ type: 'piece-ok', rep, pill: p, piece: i }); return } // слова куска произнесены — зелёный сразу, не ждём конца повтора
    if (!isListening(p.y)) p.p = fillTo(p.p, dt, 0)                                 // пилюля за краем экрана на 80 % и больше не наливается
    else if (done) p.p = Math.max(fillTo(p.p, dt, FILL_CAP), FILL_CAP + (PENDING_TOP - FILL_CAP) * Math.min(1, (t - (p.doneAt ??= t)) / PENDING_MS)) // последний кусок договорён (ждём принятия повтора) — FILL_CAP и дальше ползёт к PENDING_TOP
    else if (i !== active) p.p = fillTo(p.p, dt, 0)                                 // остальные ждут
    else { const b = Math.max(breathStep(p.p, dt, voice, cap), ahead); p.p = hold ? Math.max(p.p, b) : b } // текущий кусок: голос и «аванс»; пока высказывание идёт — без отката
  })
}
