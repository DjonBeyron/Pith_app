// Админская диагностика «Сказать фразу» в уроке — СТРОКИ окна и текст отчёта (чистые функции, без React). Контекст c собирает useSayDiag.js из живых источников
// (voskRuntime, голосовые настройки админа, фоновая загрузка, журнал последней попытки, среда телефона); здесь только превращение его в строки «статус — пояснение»
// с метками ✅ / ⚠️ / ❌ и в текст для копирования. Группы: engine (движок), raw (сырой результат последней попытки по словам — sayDiagRaw.js), vosk, phone (телефон / браузер), app.
import { SAY_ENGINE_LABEL } from './sayEngineMode.js'
import { STOP_TEXT } from './sayAttemptLast.js'
import { explainPick, explainBackground, explainMemory, explainGate, clock, sec, MARK } from './sayDiagExplain.js'
import { warmStageRow, warmWhoRow, warmTail } from './sayDiagWarm.js'
import { rawRows } from './sayDiagRaw.js'
import { voiceRow } from './sayVoiceLast.js'

export const GROUP_TITLE = { engine: 'Движок', raw: 'Последняя попытка: сырой результат', vosk: 'Vosk', warm: 'Прогрев Vosk', phone: 'Телефон и браузер', app: 'Приложение' }
const MB = b => `${(b / 1048576).toFixed(1).replace('.', ',')} МБ`
const PERM = { granted: ['ok', 'разрешён'], prompt: ['info', 'спросит при первой попытке'], denied: ['bad', 'запрещён в настройках телефона'], unavailable: ['info', 'неизвестно (браузер не говорит)'] }
const URL_SRC = { saved: 'сохранён админом в лаборатории', env: 'из настройки VITE_VOSK_MODEL_URL', builtin: 'встроенный запасной (github.io)' }

// Последняя попытка одной строкой
function attemptRow(a) {
  if (!a) return { level: 'info', text: 'ещё не было попыток в этом запуске приложения' }
  const eng = a.engine === 'vosk' ? 'Vosk' : 'системное'
  const head = `${eng}, попытка №${a.n} в ${clock(a.startedAt)}`
  if (a.status === 'run') return { level: 'info', text: `${head}: идёт…${a.heard ? ` слышно «${a.heard}»` : ''}` }
  const parts = [
    a.heard ? `услышали «${a.heard}»` : 'текста нет',
    a.firstWordMs != null ? `первые слова через ${sec(a.firstWordMs)}` : null,
    a.resultMs != null ? `итог через ${sec(a.resultMs)}` : null,
    `${STOP_TEXT[a.stop] ?? a.stop}${a.error && a.stop === 'error' ? ` (${a.error})` : ''}`,
  ].filter(Boolean)
  const level = a.status === 'failed' ? (a.stop === 'silence' || a.stop === 'interrupted' ? 'warn' : 'bad') : a.engine === 'vosk' ? 'ok' : 'warn'
  return { level, text: `${head}: ${parts.join('; ')}` }
}

function cacheRow(c) {
  if (c.cache === undefined) return { level: 'info', text: 'проверяем…' }
  if (!c.cacheApi) return { level: 'bad', text: 'в браузере нет Cache Storage (нужен https) — модель негде хранить' }
  if (!c.cache) return { level: 'bad', text: 'нет — модели нет в кэше этого телефона (iOS может сам чистить кэш редко открываемых сайтов)' }
  return { level: 'ok', text: `да${c.cache.size ? ` — ${MB(c.cache.size)}` : ''}${c.cache.savedAt ? `, сохранена в ${clock(c.cache.savedAt)}` : ''}` }
}

function brokenRow(c) {
  const { snap, info } = c
  if (snap.broken) return { level: 'bad', text: `пауза до ${clock(snap.brokenUntil)}. Причина: ${snap.brokenWhy || info.lastError || 'не записана'}` }
  return { level: info.lastError ? 'warn' : 'ok', text: info.lastError ? `паузы нет; последняя ошибка прогрева: ${info.lastError}` : 'нет' }
}

/** Все строки окна: [{ id, group, label, level, text, hint? }] */
export function buildDiagRows(c) {
  const e = c.env
  const inCache = !!c.cache
  const pick = explainPick(c.pick, { mode: c.mode, phrase: c.phrase, snap: c.snap, info: c.info, bg: c.bg, inCache, bgStopped: c.bgStopped })
  const bg = explainBackground(c.bg, inCache, c.bgStopped)
  const mem = explainMemory({ snap: c.snap, info: c.info })
  const gate = explainGate(c.gate)
  const perm = PERM[c.perm] ?? PERM.unavailable
  const net = !e.online ? ['bad', 'офлайн — модель не скачать, библиотека Vosk не подгрузится'] : e.saveData ? ['warn', 'онлайн, включена экономия трафика — фоновая загрузка модели не стартует'] : ['ok', `онлайн${e.netType ? ` (${e.netType})` : ''}`]
  const rows = [
    { id: 'next', group: 'engine', label: 'Следующая попытка', ...pick },
    { id: 'gate', group: 'engine', label: 'Панель', ...gate },
    { id: 'mode', group: 'engine', label: 'Режим админа', level: c.mode === 'system' ? 'warn' : 'info', text: SAY_ENGINE_LABEL[c.mode] ?? c.mode },
    { id: 'last', group: 'engine', label: 'Последняя попытка', ...attemptRow(c.attempt) },
    { id: 'voice', group: 'engine', label: 'Голосовое', ...voiceRow(c.voice?.on, c.voice?.attempt) },
    ...rawRows(c.attempt).map(r => ({ group: 'raw', ...r })),
    { id: 'cache', group: 'vosk', label: 'Модель в кэше', ...cacheRow(c) },
    { id: 'bg', group: 'vosk', label: 'Фоновая загрузка', ...bg },
    { id: 'url', group: 'vosk', label: 'Адрес модели', level: 'info', text: `${URL_SRC[c.urlSource] ?? c.urlSource}${c.urlHost ? ` (${c.urlHost})` : ''}` },
    { id: 'mem', group: 'vosk', label: 'Модель в памяти', ...mem },
    { id: 'lib', group: 'vosk', label: 'Библиотека Vosk', level: c.snap.libReady ? 'ok' : 'info', text: c.snap.libReady ? 'загружена' : 'не загружена (подгружается вместе с моделью: при входе в урок с модулем или открытии панели)' },
    { id: 'broken', group: 'vosk', label: 'Пауза после сбоя', ...brokenRow(c) },
    { id: 'warm', group: 'warm', label: 'Этап', ...warmStageRow(c) },
    { id: 'warmwho', group: 'warm', label: 'Запуск', ...warmWhoRow(c.info) },
    { id: 'warmlog', group: 'warm', label: 'Последние события', ...warmTail(c.info) },
    { id: 'sys', group: 'phone', label: 'Системное распознавание', level: e.recognition ? 'ok' : 'bad', text: e.recognition ? 'поддерживается браузером' : 'браузер его не поддерживает' },
    { id: 'session', group: 'phone', label: 'Аудиосессия', level: e.audioSession ? 'ok' : 'warn', text: e.audioSession ? `включена (${e.sessionType})${e.sessionApi ? '' : ' — но браузер этого API не знает'}` : 'выключена админом' },
    { id: 'mic', group: 'phone', label: 'Микрофон', level: perm[0], text: perm[1] },
    { id: 'net', group: 'phone', label: 'Сеть', level: net[0], text: net[1] },
    { id: 'browser', group: 'phone', label: 'Браузер', level: 'info', text: `${e.browser}, ${e.platform}, ${e.pwa ? 'режим PWA (с экрана «Домой»)' : 'вкладка браузера'}${e.secure ? '' : '; НЕ https'}` },
    { id: 'version', group: 'app', label: 'Версия приложения', level: 'info', text: c.version },
  ]
  return rows
}

/** Текст отчёта для отправки разработчику (то же, что в окне, плюс журнал этапов прогрева — journal = warmJournal(info) — и User-Agent) */
export function diagReport(rows, { now = Date.now(), ua = '', journal = [] } = {}) {
  const lines = [`Диагностика «Сказать фразу», ${clock(now)}`]
  let group = ''
  for (const r of rows) {
    if (r.group !== group) { group = r.group; lines.push('', `${GROUP_TITLE[group] ?? group}:`) }
    lines.push(`${MARK[r.level] ?? MARK.info} ${r.label} — ${r.text}${r.hint ? ` (${r.hint})` : ''}`)
  }
  if (journal.length) lines.push('', 'Журнал прогрева Vosk (этапы по времени):', ...journal.map(l => `  ${l}`))
  if (ua) lines.push('', `UA: ${ua}`)
  return lines.join('\n')
}

export { MARK }
