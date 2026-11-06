// «Скачать журнал» / «Скопировать» в шестерёнке игры (WordLaneHud.jsx): общий журнал страницы (shared/lib/gameJournal.js) одним txt-файлом с заголовком — версия, устройство, режим «говорю / тапаю»,
// готовность русской и английской моделей Vosk, звук и микрофон в момент выгрузки. На iPhone скачивание из PWA бывает неудобно (лист «Поделиться» / новая вкладка) — поэтому рядом «Скопировать»:
// текст уходит в буфер обмена, владелец вставляет его в чат. Чистые функции: всё внешнее приходит аргументами (тесты).
import { gameJournal, journalFileName } from '../../../../shared/lib/gameJournal.js'
import { pageSnapshot } from '../../../../shared/lib/gameJournalPage.js'

/** Строки заголовка журнала */
export function journalHeader({ version = '', ua = '', tap = false, ru = false, en = '—', snap = '—', at = new Date() } = {}) {
  return [
    `Pithy — журнал игры, v${version}`,
    `выгружен: ${at.toLocaleString?.('ru-RU') ?? String(at)}`,
    `устройство: ${ua || '—'}`,
    `режим: ${tap ? 'тапаю (без микрофона)' : 'говорю (микрофон)'}`,
    `русская модель Vosk: ${ru ? 'готова (скачана)' : 'не готова'}; английская: ${en}`,
    `сейчас: ${snap}`,
    'метка строки: мс от загрузки страницы, время дня; группы: [start] старт Пита, [page] свернули/вернули, [pause] пауза, [audio] звук, [warm] прогрев, [race] гонка, [cat] Пит, [ru] русский, [speech] речь',
  ]
}

/** Текст и файл журнала: { name, text, blob } */
export function buildJournalFile({ header = [], journal = gameJournal, at = new Date() } = {}) {
  const text = journal.text(header)
  const name = journalFileName(at)
  const blob = typeof File === 'function' ? new File([text], name, { type: 'text/plain' }) : new Blob([text], { type: 'text/plain' })
  return { name, text, blob }
}

/** Заголовок из живых источников (шестерёнка вызывает при нажатии) */
export function liveHeader({ version, tap, ru, en, nav = globalThis.navigator }) {
  return journalHeader({ version, ua: String(nav?.userAgent ?? ''), tap, ru, en, snap: pageSnapshot({ nav }) })
}

/** Скопировать текст: clipboard API, нет его / отказ — скрытое поле + execCommand('copy'). → 'copied' | 'failed' */
export async function copyText(text, { nav = globalThis.navigator, doc = globalThis.document } = {}) {
  try {
    if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(text); return 'copied' }
  } catch { /* iOS может отказать — пробуем старый путь */ }
  try {
    const el = doc.createElement('textarea')
    el.value = text; el.setAttribute('readonly', ''); el.style.position = 'fixed'; el.style.opacity = '0'
    doc.body.appendChild(el); el.select(); el.setSelectionRange?.(0, text.length)
    const ok = doc.execCommand?.('copy')
    el.remove()
    return ok ? 'copied' : 'failed'
  } catch { return 'failed' }
}

export const COPY_HOW = { copied: 'Журнал скопирован — вставь его в чат', failed: 'Не получилось скопировать — попробуй «Скачать журнал»' }
