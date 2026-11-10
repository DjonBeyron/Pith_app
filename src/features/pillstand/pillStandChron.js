// Строки хроники отчёта «📤 Отправить» стенда пилюль (CONCEPT_PILLSTAND.md, «Отправка по теме»): одно событие трассы (уже отобранное пакетом темы, pillStandPacks.js) → короткая строка по-русски
// без «t» и «k» (их ставит отчёт: «+мс от появления цели»). Сырой JSON Vosk остаётся сырым (тема «Распознавание»), сокращённые события («heard» — только момент и слова Vosk) — словами. Чистые функции.
import { grammarText } from './pillStandCompact.js'

export const JSON_CUT = 400
const num = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d).replace('.', ',') : v == null ? '—' : String(v))
const q = t => `«${t ?? ''}»`
const STOP = { endpoint: 'движок сам', manual: 'кнопка «Стоп»', auto: 'авто-стоп', full: 'все слова', max: 'потолок записи', ear: 'правило слова (конец голоса)' }

/** JSON без t / k, обрезанный до JSON_CUT */
export function rest(e, cut = JSON_CUT) {
  const { t: _t, k: _k, ...o } = e
  let s = ''
  try { s = JSON.stringify(o) ?? '' } catch { s = String(o) }
  return s.length > cut ? `${s.slice(0, cut)}…` : s
}

const stats = e => ['firstPartialMs', 'resultMs', 'afterStopMs', 'tailMs', 'gatedMs', 'maxGapMs'].filter(k => e[k] != null).map(k => `${k} ${e[k]}`).join(', ')

const LINES = {
  target: e => `── цель #${(e.n ?? 0) + 1} ${q(e.say)}${e.shown && e.shown !== e.say ? ` (на пилюле ${q(e.shown)})` : ''} · ${e.mode ?? '?'} · ${String(e.lang ?? '?').toUpperCase()}`,
  run: e => `пилюля и слушатель запущены (${e.mode ?? '?'})`,
  'run-stop': () => 'пилюля и слушатель остановлены',
  'target-run': e => `запуск: ${rest(e, 160)}`,
  'vosk-start': e => `словарь Vosk: ${e.gref ? grammarText(e) : JSON.stringify(e.grammar ?? null).slice(0, JSON_CUT)}${e.gate ? ' · затвор тишины' : ''}`,
  'vosk-ready': e => `Vosk готов (микрофон ${e.micMs ?? '—'} мс)`,
  'vosk-error': e => `ошибка Vosk: ${e.msg}`,
  'vosk-partial': e => `черновик ${JSON.stringify(e.raw ?? {})}`,
  'vosk-final': e => `итог ${JSON.stringify(e.raw ?? {}).slice(0, JSON_CUT * 2)} · закрыл: ${STOP[e.stopBy] ?? e.stopBy ?? '?'}${stats(e) ? ` · ${stats(e)}` : ''}`,
  heard: e => `Vosk ${e.src}: ${q(e.text)}${e.fresh?.length ? ` (новые слова: ${e.fresh.join(' ')})` : ''}`,
  gate: e => `затвор ${e.open ? 'открыт' : 'закрыт'} (rms ${num(e.rms, 4)})`,
  level: e => `rms ${num(e.rms, 4)}${e.voice != null ? (e.voice ? ' ▲ голос' : ' ▽ тишина') : ''}`,
  wl: e => (e.kind === 'ear' ? `[word-ear] ${e.text}` : e.kind === 'grammar' && e.gref ? `слушатель слов: ${grammarText(e)}, цели ${JSON.stringify(e.targets ?? []).slice(0, 160)}` : `слушатель слов: ${e.kind} ${rest({ ...e, kind: undefined }, 240)}`),
  listen: e => `слушатель: ${e.status}, seq [${(e.seq ?? []).join(',')}], промахов ${e.misses ?? 0}${e.heard ? `, услышал ${q(e.heard)}` : ''}`,
  word: e => (e.gone ? `откат слова ${(e.index ?? 0) + 1} ${q(e.text)}` : `слово ${(e.index ?? 0) + 1} ${q(e.text)} засчитано ${e.draft ? 'черновиком' : 'итогом'}`),
  phrase: e => `фраза: ratio ${num(e.ratio)} ${rest({ ...e, ratio: undefined }, 240)}`,
  ear: e => `слух фраз: ${rest(e, 200)}`,
  pill: e => `пилюля: ${e.type}${e.text ? ` ${q(e.text)}` : ''}${e.ms != null ? ` ${e.ms} мс` : ''}${e.wrong ? ' (неверно)' : ''}${e.res ? ` ${rest({ res: e.res }, 200)}` : ''}`,
  pre: e => `перед ходом ${q(e.text)} (проход ${e.pass ?? '?'})`,
  fill: e => `заливка: цель ${num(e.goal)} · экран ${num(e.shown)}${e.level != null ? ` · уровень ${num(e.level, 3)}` : ''}${e.confirmed != null ? ` · речь ${e.confirmed ? 'да' : 'нет'}` : ''}`,
  reach: e => `заливка дошла: ${q(e.word)} за ${e.ms} мс`,
  result: e => `${e.ok ? 'зачёт ✓' : 'нет зачёта ✗'}${e.ratio != null ? ` ratio ${num(e.ratio)}` : ''}${e.clean != null ? `, ${e.clean ? 'чисто' : 'нечисто'}` : ''}${e.afterVoiceMs != null ? `, ${e.afterVoiceMs} мс от конца голоса` : ''}`,
  log: e => e.text,
  'mic-dead': e => `МИКРОФОН ОГЛОХ: ${e.why}${e.signal && e.signal !== e.why ? ` (сигнал ${e.signal})` : ''} · readyState ${e.readyState ?? '—'} · muted ${e.muted ?? '—'} · попыток ${e.attempts ?? 0}`,
  'mic-revive': e => `микрофон ожил (${e.how}) за ${e.ms ?? '—'} мс · readyState ${e.readyState ?? '—'} · muted ${e.muted ?? '—'} · попыток ${e.attempts ?? 0}`,
  'mic-revive-fail': e => `микрофон не ожил (${e.how}): ${e.result ?? '?'} — нужна плашка (тап)`,
  mark: e => `◆ МЕТКА ${e.n}${e.i != null ? ` (кадр ${e.i + 1})` : ''}${e.note ? ` — ${e.note}` : ''}`,
}

/** Событие → строка без времени */
export const eventText = e => (LINES[e.k] ? LINES[e.k](e) : `${e.k} ${rest(e, 240)}`)

/** «+1234» — мс от t0 со знаком */
export const plus = (t, t0) => { const v = Math.round(t - t0); return `${v >= 0 ? '+' : ''}${v}` }

/** Строка хроники: «  +1234  событие» */
export const chronLine = (e, t0) => `${plus(e.t, t0).padStart(7)}  ${eventText(e)}`
