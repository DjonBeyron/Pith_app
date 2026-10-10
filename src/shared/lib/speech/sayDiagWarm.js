// Админская диагностика «Сказать фразу»: СТРОКИ про прогрев Vosk — этап машины состояний (voskWarmStages.js), кто и когда его запустил / держит, журнал этапов. Чистые функции без React.
// Нужны, чтобы за одну попытку на телефоне было видно, где именно встал прогрев: «ни разу не просили» (урок / панель не вызвали), «проверяем кэш (25 с)» (зависло), «ошибка загрузки библиотеки: …».
import { STAGE_TEXT, STAGE_FAIL_TEXT, TRIGGER_TEXT } from '../vosk/voskWarmStages.js'
import { clock, sec } from './sayDiagExplain.js'

const whole = ms => `${Math.max(0, Math.round(ms / 1000))} с`
const pad = n => String(n).padStart(2, '0')
/** Время суток с секундами: «11:43:07» */
export const clockSec = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
export const WORKING = ['checking-cache', 'importing-lib', 'loading-model']
const HOLD_TEXT = { lesson: 'урок', panel: 'панель', manual: 'вручную' }

/** Этап прогрева одной строкой: «этап: загружаем библиотеку (4 с)» / «ошибка загрузки модели: …» / «готово». snap — runtime.snapshot(), info — runtime.info() */
export function warmStageRow({ snap, info }) {
  const stage = info.stage ?? snap.stage ?? 'idle'
  const now = info.now
  if (WORKING.includes(stage)) return { level: 'warn', text: `этап: ${STAGE_TEXT[stage]} (${whole(now - (info.stageAt || now))})` }
  if (stage === 'ready' && snap.loaded) {
    const l = info.lastLoad
    return { level: 'ok', text: `готово — модель в памяти${l ? ` (библиотека ${sec(l.libMs)}, модель ${sec(l.modelMs)})` : ''}` }
  }
  if (stage === 'failed') {
    const f = info.failure
    const when = f?.at ? ` в ${clockSec(f.at)}` : ''
    const retry = snap.broken ? `; пауза до ${clock(snap.brokenUntil)}, потом повтор сам` : ''
    return { level: 'bad', text: `ошибка ${STAGE_FAIL_TEXT[f?.stage] ?? 'прогрева'}${when}: ${f?.text || info.lastError || 'без подробностей'}${retry}`, hint: 'Нажмите «Прогреть сейчас», чтобы повторить сразу.' }
  }
  if (info.mode === 'system') return { level: 'info', text: 'не нужен: выбран режим «Только системное»' }
  if (info.acquires === 0) return { level: 'warn', text: 'не запускался: прогрев ещё ни разу не запрашивали', hint: 'Нажмите «Прогреть сейчас».' }
  if (snap.cached === false) return { level: 'info', text: 'не запускался: модели нет в кэше (после докачки начнётся сам)' }
  if (info.users === 0) return { level: 'info', text: 'не запущен: урок с модулем и панель закрыты — прогрева нет' }
  return { level: 'info', text: 'ждёт' }
}

/** Кто и когда запросил прогрев / кто его держит. info — runtime.info() */
export function warmWhoRow(info) {
  const holds = Object.entries(info.holds ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${HOLD_TEXT[k] ?? k} ×${n}`)
  if (info.acquires === 0) return { level: 'bad', text: 'прогрев ни разу не запрашивали — ни при входе в урок, ни при открытии панели (это и есть причина, если модель в кэше, а в памяти её нет)', hint: 'Пришлите отчёт.' }
  const last = info.lastAcquire ? `последний запрос ${whole(info.now - info.lastAcquire.at)} назад (${HOLD_TEXT[info.lastAcquire.why] ?? info.lastAcquire.why})` : ''
  const started = info.trigger ? `прогрев запущен: ${TRIGGER_TEXT[info.trigger] ?? info.trigger}` : 'прогрев ещё не запускался'
  const keep = holds.length ? `держат: ${holds.join(', ')}` : 'никто не держит'
  return { level: 'info', text: [started, keep, `запросов ${info.acquires ?? '—'}`, last].filter(Boolean).join('; ') }
}

/** Журнал этапов построчно: «11:43:07 загружаем библиотеку — подробность» (для отчёта) */
export function warmJournal(info) {
  return (info.trace ?? []).map(t => `${clockSec(t.at)} ${STAGE_TEXT[t.stage] ?? t.stage}${t.note ? ` — ${t.note}` : ''}`)
}

/** Короткий хвост журнала для окна (последние n событий одной строкой) */
export function warmTail(info, n = 3) {
  const lines = warmJournal(info).slice(-n)
  return lines.length ? { level: 'info', text: lines.join(' → ') } : { level: 'info', text: 'пусто (прогрев не запускался)' }
}
