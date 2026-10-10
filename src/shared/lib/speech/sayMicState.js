// Вид круга-микрофона «Сказать фразу» одним словом (чистая логика, без React и DOM). Состояние уходит в CSS классом `.sayMicBox--{state}` (SayStage.jsx),
// анимации — чистый CSS (say-phrase-state.css). Движки, ветки и попытки (sayFlow.js, sayRecognizer.js) здесь НЕ участвуют — только как показать кнопку.
//  locked — нет доступа к микрофону (ещё не разрешали) ИЛИ ученик ещё ни разу не видел вводный попап (introSeen=false, на любой платформе): серый круг 0,765, перечёркнутая иконка,
//           серая бегущая дуга, без пульса и волн; тап открывает попап (разрешения / вводный)
//  ready  — доступ выдан, запись не идёт: тёмный круг 1,0, зелёная иконка, зелёное кольцо СПЛОШНОЕ (без дуги и пульса — покой); волн нет
//  active — идёт запись (тап был): круг 1,15 с пружиной, плавно (≈0,6 с) заливается салатовым, иконка темнеет, три волны активации, затем живой эквалайзер; кольцо остаётся зелёным (приглушено)
//  done   — «Готово»: салатовый круг 1,0 с галочкой (кольцо целиком зелёное)
//  off    — микрофона не будет (отказ / не поддерживается / «не могу говорить»): как locked, но без дуги и без нажатия
export const MIC_STATES = ['locked', 'ready', 'active', 'done', 'off']
export const MIC_SCALE = { locked: 0.765, ready: 1, active: 1.15, done: 1, off: 0.765 } // locked/off = 0,85 × 0,9: на 10 % меньше прежнего (кольцо в них — ×0,9, say-phrase-state.css)

/**
 * Есть ли доступ к микрофону (для вида кнопки). Чистая функция.
 *  permission — последний ответ Permissions API: granted | prompt | denied | unavailable (iPhone Safari часто «unavailable»);
 *  flag — микрофон на этом устройстве уже успешно открывался (localStorage, sayPermission.MIC_GRANTED_KEY); sessionOk — работал в ЭТОМ запуске.
 * denied → нет; granted → да; prompt → да только если микрофон уже работал в этом запуске (иначе диалог ОС ещё будет — доступа нет);
 * unavailable/неизвестно → да по флагу «уже открывался» или по этому запуску.
 */
export function hasMicAccess({ permission, flag = false, sessionOk = false } = {}) {
  if (permission === 'denied') return false
  if (permission === 'granted') return true
  if (permission === 'prompt') return !!sessionOk
  return !!(flag || sessionOk)
}

/**
 * Состояние кнопки: фаза панели (sayFlow) важнее доступа. phase: idle | explain | run | passed | failed | fallback.
 * explain (идёт попап) и failed (неудача) — как «до нажатия»: locked или ready по доступу. Пока вводный попап не видели (introSeen=false), «до нажатия» — всегда locked,
 * даже если доступ уже есть (Android: отдельного шага разрешения нет). introSeen по умолчанию true: вызовы без поля работают как раньше.
 */
export function micVisualState({ permission, flag = false, sessionOk = false, introSeen = true, phase = 'idle' } = {}) {
  if (phase === 'fallback') return 'off'
  if (phase === 'passed') return 'done'
  if (phase === 'run') return 'active'
  return introSeen && hasMicAccess({ permission, flag, sessionOk }) ? 'ready' : 'locked'
}
