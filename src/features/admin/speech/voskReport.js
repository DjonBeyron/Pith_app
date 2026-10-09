// «Тест закрытого словаря» Vosk: эталон «trying», словарь try / trying / [unk]. Чистые функции: разбор попытки, вывод и
// компактный текст «Скопировать результат Vosk». Без React.
import { fmtMb } from '../../../shared/lib/vosk/voskDownload.js'

export const TEST_REFERENCE = 'trying'
export const TEST_WORDS = ['try', 'trying']
export const TEST_GRAMMAR = JSON.stringify([...TEST_WORDS, '[unk]'])

const num = (n, d = 2) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(d)) : null)

/** Попытка: что сказали, что услышали, уверенность и время по слову (words:true) */
export function makeAttempt(say, text, stats = {}) {
  const w = (stats.words || [])[0] || null
  const confs = (stats.words || []).map(x => x.conf).filter(c => typeof c === 'number')
  return {
    say, heard: (text || '').trim(),
    conf: confs.length ? num(confs.reduce((a, b) => a + b, 0) / confs.length) : null,
    start: num(w?.start), end: num((stats.words || []).at(-1)?.end ?? w?.end),
    firstPartialMs: stats.firstPartialMs ?? null, resultMs: stats.resultMs ?? null,
  }
}

/** Услышанное совпало с сказанным? ([unk] и пусто — нет) */
export const isHit = a => !!a && a.heard.toLowerCase() === a.say

/** Вывод по сделанным попыткам. Главный вопрос: сказали «try» — получили «try», а не исправленное «trying»? */
export function verdict(attempts) {
  const tr = attempts.find(a => a.say === 'try')
  if (!tr) return 'Скажите «try» и «trying» по очереди'
  if (tr.heard.toLowerCase() === 'try') return 'Сказали «try» — услышано «try»: закрытый словарь НЕ исправляет try → trying'
  if (tr.heard.toLowerCase() === TEST_REFERENCE) return 'Сказали «try» — услышано «trying»: словарь всё равно подменил форму'
  return `Сказали «try» — услышано «${tr.heard || 'ничего'}» (не из списка или пусто): повторите громче/ближе`
}

/** Строка одной попытки для экрана и отчёта */
export function attemptLine(a) {
  const extra = [a.conf != null && `уверенность ${a.conf}`, a.start != null && a.end != null && `слово ${a.start}–${a.end} с`].filter(Boolean).join(', ')
  return `сказал «${a.say}» → услышали «${a.heard || '—'}»${extra ? ` (${extra})` : ''}, итог ${a.resultMs ?? '—'} мс, первый partial ${a.firstPartialMs ?? '—'} мс`
}

/** Компактный текст для копирования: модель / адрес / размер / загрузка / задержка / что услышали */
export function buildVoskReport({ url = '', size = null, from = '', downloadMs = null, libMs = null, modelMs = null, heap = null, attempts = [] }) {
  const file = String(url).split('/').pop() || 'модель'
  const host = (() => { try { return new URL(url).host } catch { return '?' } })()
  const src = from === 'cache' ? 'из кеша устройства' : from === 'network' ? `скачана${downloadMs != null ? ` за ${(downloadMs / 1000).toFixed(1)} с` : ''}` : '—'
  return [
    `Vosk, закрытый словарь ${TEST_GRAMMAR} (эталон «${TEST_REFERENCE}»)`,
    `Модель: ${file} @ ${host}, ${fmtMb(size)}, ${src}`,
    `Загрузка: библиотека ${libMs ?? '—'} мс, модель в память ${modelMs ?? '—'} мс${heap != null ? `, память страницы ≈${heap} МБ (без воркера)` : ''}`,
    ...attempts.map((a, i) => `${i + 1}. ${attemptLine(a)}`),
    `Вывод: ${verdict(attempts)}`,
  ].join('\n')
}
