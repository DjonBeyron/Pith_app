// «Скопировать итог Vosk-серии»: сводки, таблица порога уверенности, затем последние прогоны одной строкой (≤ 6000 символов:
// сначала выбрасываем самые старые прогоны, потом обрезаем хвост). Чистые функции без React.
import { STYLE_LABEL } from './voskGrammar.js'
import { condLabel } from './voskSeries.js'
import { summaryLines } from './voskSummary.js'
import { thresholdLines } from './voskThreshold.js'
import { verdictOf } from './voskClassify.js'
import { sec, STOP_BY } from './voskTiming.js'

export const VOSK_SERIES_MAX = 6000

const KIND = { ctx: 'A', pair: 'C', trap: 'B', silence: 'B' }

/** Одна строка прогона: «3. A шаг 2 · ошибка · обычно · фразы: сказал «I'm try» → «I'm trying» (0.93) ⚠ принял за «trying» · partial 1.2 с, итог 2.4 с (авто-стоп)» */
export function runLine(r, i) {
  const mode = r.kind === 'ctx' || r.kind === 'pair' ? ` · ${r.mode === 'control' ? 'контроль' : 'ошибка'}` : ''
  const conf = r.kc != null ? ` (${r.kc})` : ''
  const said = r.kind === 'silence' ? 'тишина 3 с' : `сказал «${r.said}»`
  const tm = r.tm ?? {}
  const t = [tm.fp != null && `partial ${sec(tm.fp)}`, tm.res != null && `итог ${sec(tm.res)}`, tm.end != null && `после слова ${sec(tm.end)}`, tm.by && `(${STOP_BY[tm.by] ?? tm.by})`].filter(Boolean).join(', ')
  return `${i}. ${KIND[r.kind] ?? '?'} ${r.tag}${mode} · ${condLabel(r.cond)} · ${STYLE_LABEL[r.style]}: ${said} → «${r.heard || '—'}»${conf} ${verdictOf(r).text}${t ? ` · ${t}` : ''}`
}

/** meta: { model: 'файл модели', modelMs } — необязательно */
export function buildSeriesReport(state, meta = {}, max = VOSK_SERIES_MAX) {
  const head = [
    'VOSK-СЕРИЯ (усложнённый тест, закрытый словарь)',
    `Модель: ${meta.model || '—'}${meta.modelMs != null ? `, в память ${meta.modelMs} мс` : ''}. Настройки сейчас: словарь «${STYLE_LABEL[state.style]}», авто-стоп ${state.autoStop ? `${state.autoStop} мс` : 'выкл.'}, аудиосессия ${state.session ? 'play-and-record' : 'auto'}`,
    `Прогонов всего: ${state.runs.length}`,
    ...summaryLines(state).map(l => l.text),
    ...thresholdLines(state.runs),
  ]
  if (!state.runs.length) return `${head.join('\n')}\nрезультатов пока нет`
  const lines = state.runs.map((r, i) => runLine(r, i + 1))
  for (let from = 0; from <= lines.length; from++) {
    const body = lines.slice(from)
    const text = [...head, ...(body.length ? [`ПРОГОНЫ (${from ? `последние ${body.length} из ${lines.length}` : `все ${lines.length}`}):`, ...body] : [])].join('\n')
    if (text.length <= max) return text
  }
  const t = head.join('\n')
  return t.length <= max ? t : `${t.slice(0, max - 12)}\n…(обрезано)`
}
