// Раздел «Почему первая реплика тихая» (iPhone: «в начале кот говорит без звука»): авто-вывод и временная шкала первых секунд игры из журнала отладки (dump.events). Идёт в файл «Скачать отладку»
// (wordLaneDebugExport.js → поле silentFirstLine) и в текстовый журнал плеера (gameLogSection.js). Чистые функции — проверяются тестами.
// Из чего считаем (всё пишется в журнал при включённой отладке):
//  • probe:start-mark { name: tap | mic | settle | wake | tap-wait | hint-tap | ready, sinceTap, ... } — шаги тапа «Начать» (gameStartTrace, wordLaneStart.js);
//  • probe:audio-warm { step: begin | settled | armed | rewarm, activation, why }, probe:audio-interrupt { n, ctx, session, activation } — прогрев и прерывания аудиосессии (gameAudioWarm);
//  • event:cat-voice { id, source, slot, play, error, activation, as, sinceTap, ... } — каждая реплика кота в первые 15 с (wordLaneCatVoiceLog.js), probe:plate-sound — «Теперь твоя очередь».
// Причины (cause), по убыванию приоритета; вторичные признаки лежат в causes:
//  gesture-expired        — жест истёк до прогрева (settle: activation=false / «ждём касания») и до реплики не было прогрева в жесте: слоты разбужены вне жеста;
//  slot-not-ready         — слот реплики не был готов к моменту реплики (не разбужен / звук не подставлен / ждали слот и не дождались — говорил голос системы);
//  interrupted-after-warm — iOS прервал аудиосессию уже ПОСЛЕ пробуждения слотов, повторного прогрева до реплики не было;
//  play-rejected          — play() отклонён (имя ошибки: NotAllowedError — нет жеста);
//  play-not-started       — play() принят, но 'playing' не пришло за 700 мс (элемент прерван / не загружен);
//  ducking                — play() ok и 'playing' было: код отработал, тишина — на стороне iOS/громкости (ducking при записи, громкость медиа, беззвучный режим);
//  no-voice               — у реплики нет озвучки (url) — тишина ожидаема;  no-lines — в первые 15 с реплик не было.
export const WINDOW_MS = 15000
const SOURCE_TEXT = { slot: 'слот библиотеки', synth: 'голос системы', none: 'нет озвучки' }
export const CAUSE_TITLE = {
  'gesture-expired': 'жест истёк до прогрева',
  'slot-not-ready': 'слот не готов к реплике',
  'interrupted-after-warm': 'прерывание после прогрева',
  'play-rejected': 'play() отклонён',
  'play-not-started': 'play() принят, но звук не заиграл',
  ducking: 'звук шёл, но тихо (ducking)',
  'no-voice': 'у реплики нет озвучки',
  'no-lines': 'реплик кота в первые 15 с не было',
  unknown: 'причина не определена',
}
export const CAUSE_TEXT = {
  'gesture-expired': 'Жест тапа «Начать» истёк, пока открывался микрофон, и слоты звука были разбужены вне жеста — iOS не даёт им играть. Нужно касание экрана до первой реплики («Тапни, чтобы начать»).',
  'slot-not-ready': 'К моменту реплики слот озвучки не был готов (не разбужен тишиной, звук не подставлен или не успел подгрузиться). Реплика ждала слот до 1,5 с, потом говорил голос системы.',
  'interrupted-after-warm': 'После пробуждения слотов iOS ещё раз прервал аудиосессию (смена типа сессии / микрофон) и пометил элементы прерванными; повторный прогрев до реплики не прошёл.',
  'play-rejected': 'Браузер отклонил play() слота реплики (обычно NotAllowedError — нет свежего жеста или элемент прерван).',
  'play-not-started': 'play() принят, но событие playing не пришло — элемент прерван аудиосессией или не загружен.',
  ducking: 'Код отработал: play() принят и playing было. Если звука всё равно не слышно — причина вне кода: iOS приглушает воспроизведение при открытом микрофоне (ducking), выключена громкость медиа или беззвучный режим.',
  'no-voice': 'Реплика показана подписью: у неё нет озвучки (url) или слот не подготовлен. Озвучь реплику в редакторе ноды.',
  'no-lines': 'Журнал не содержит событий cat-voice: реплик кота в первые 15 секунд не было (или отладка включилась позже).',
  unknown: 'Признаки не сошлись ни с одной причиной — смотри временную шкалу.',
}

const probeOf = (events, kind, pick = () => true) => events.filter(e => e.type === 'probe' && e.kind === kind && pick(e))
const mark = (events, name) => probeOf(events, 'start-mark', e => e.name === name)[0] ?? null

/** Подпись события шкалы (null — не показывать) */
function timelineText(e) {
  if (e.type === 'event' && e.kind === 'cat-voice') return `реплика ${e.id}: ${e.source === 'slot' ? 'слот библиотеки' : e.source === 'synth' ? 'голос системы' : 'нет озвучки'}, ${e.source === 'synth' ? 'speak()' : 'play()'} → ${e.play}${e.error ? ` (${e.error})` : ''}`
  if (e.type !== 'probe') return null
  if (e.kind === 'start-mark') {
    const m = {
      tap: 'тап «Начать»', mic: `микрофон: ${e.mic ?? '—'}`, wake: e.ok === false ? `прогрев звука упал: ${e.error ?? ''}` : 'прогрев звука запущен (wakeGameAudio)', 'tap-wait': `жест истёк — ждём касания (${e.why ?? ''})`, 'hint-tap': 'касание «Тапни, чтобы начать»',
      settle: `settle: ждали ${e.waitedMs ?? '—'} мс, прерываний ${e.interrupts ?? 0}, контекст ${e.ctx ?? '—'}, жест ${e.activation === false ? 'истёк' : 'жив'}`,
      ready: `прогрев закончен, озвучка слов: ${e.words ?? '—'}`,
    }
    return m[e.name] ?? `отметка ${e.name}`
  }
  if (e.kind === 'audio-interrupt') return `прерывание аудиосессии №${e.n}${e.self ? ' (своё: микрофон / тип сессии)' : ''}, контекст ${e.ctx ?? '—'}, жест ${e.activation === false ? 'истёк' : 'жив'}`
  if (e.kind === 'audio-warm' && e.step === 'rewarm') return `повторный прогрев (${e.why}), жест ${e.activation === false ? 'истёк' : 'жив'}${e.via ? `, событие ${e.via}` : ''}`
  if (e.kind === 'audio-warm' && e.step === 'armed') return `ждём касания для прогрева (${e.why})`
  if (e.kind === 'plate-sound') return e.wake ? `плашка: пробуждение ${e.wake} (${e.error ?? ''})` : `плашка: play() → ${e.play}${e.error ? ` (${e.error})` : ''}`
  return null
}

/** События журнала → { cause, title, text, causes, firstLine, lines, timeline: [{ ms, what }] }; events — dump.events (сортированные по t) */
export function diagnoseFirstLine(events = []) {
  const evs = Array.isArray(events) ? events.slice().sort((a, b) => a.t - b.t) : [] // dump уже отсортирован; на случай разбора чужого списка
  const tap = mark(evs, 'tap') ?? probeOf(evs, 'audio-warm', e => e.step === 'begin')[0] ?? null
  const base = tap ? tap.t : null
  const rel = e => (base == null ? e.t : e.t - base)
  const lines = evs.filter(e => e.type === 'event' && e.kind === 'cat-voice' && (base == null || rel(e) <= WINDOW_MS))
  const timeline = evs.filter(e => (base == null || (rel(e) >= -50 && rel(e) <= WINDOW_MS)) && timelineText(e)).map(e => ({ ms: Math.round(rel(e)), what: timelineText(e) }))
  const first = lines[0] ?? null
  if (!first) return { cause: 'no-lines', title: CAUSE_TITLE['no-lines'], text: CAUSE_TEXT['no-lines'], causes: ['no-lines'], firstLine: null, lines: [], timeline }

  const settle = mark(evs, 'settle')
  const wake = mark(evs, 'wake')
  const expired = (settle && settle.activation === false) || !!mark(evs, 'tap-wait')
  const goodRewarm = probeOf(evs, 'audio-warm', e => e.step === 'rewarm' && e.activation !== false && e.t > (settle?.t ?? -Infinity) && e.t <= first.t).length > 0
  const lastInt = probeOf(evs, 'audio-interrupt', e => e.t < first.t && e.t > (wake?.t ?? Infinity)).at(-1) ?? null
  const interrupted = first.slot?.interrupted === true || (!!lastInt && !probeOf(evs, 'audio-warm', e => e.step === 'rewarm' && e.t > lastInt.t && e.t <= first.t).length)
  const causes = []
  if (first.source === 'none') causes.push('no-voice')
  else if (first.play === 'ok') causes.push('ducking')
  else {
    if (expired && !goodRewarm) causes.push('gesture-expired')
    if (first.source === 'synth' || first.slot?.prepared === false || first.slot?.wokeErr || (first.waitedMs ?? 0) >= 1500) causes.push('slot-not-ready')
    if (interrupted) causes.push('interrupted-after-warm')
    if (first.play === 'rejected') causes.push('play-rejected')
    if (['no-playing', 'pending', 'no-start'].includes(first.play)) causes.push('play-not-started') // no-start — голос системы не начал говорить за 700 мс
  }
  if (!causes.length) causes.push('unknown')
  const cause = causes[0]
  return {
    cause, title: CAUSE_TITLE[cause], text: CAUSE_TEXT[cause], causes,
    firstLine: { id: first.id, ms: Math.round(rel(first)), source: first.source, play: first.play, error: first.error ?? null, slot: first.slot ?? null, activation: first.activation ?? null, why: first.why ?? null },
    lines: lines.map(l => ({ id: l.id, ms: Math.round(rel(l)), source: l.source, play: l.play, error: l.error ?? null })),
    timeline,
  }
}

/** Строки раздела для текстового журнала и файла */
export function silentDiagLines(diag) {
  if (!diag) return []
  const f = diag.firstLine
  const out = ['--- Почему первая реплика тихая ---', `Вывод: ${diag.title.toUpperCase()}. ${diag.text}`]
  if (diag.causes.length > 1) out.push(`Другие признаки: ${diag.causes.slice(1).map(c => CAUSE_TITLE[c]).join('; ')}`)
  if (f) out.push(`Первая реплика: ${f.id} через ${f.ms} мс после тапа — источник=${SOURCE_TEXT[f.source] ?? f.source}${f.why ? ` (${f.why})` : ''}, ${f.source === 'synth' ? 'speak()' : 'play()'} → ${f.play}${f.error ? ` (${f.error})` : ''}, жест ${f.activation === 'alive' ? 'жив' : f.activation === 'expired' ? 'истёк' : '—'}`)
  out.push('Шкала первых 15 с (мс от тапа):', ...diag.timeline.map(t => `${String(t.ms).padStart(7)}  ${t.what}`))
  return out
}
