// Контрольная серия против ложных срабатываний (проба «Голос», «Тест 1»). Режим «с ошибкой»: говорим неверную форму («I'm try») — правило «первое увиденное»
// должно её ПОЙМАТЬ (форма мелькнула в interim). Режим «контроль»: говорим ПРАВИЛЬНО («I'm trying») — правило НЕ должно срабатывать; если оно срабатывает —
// это ложная тревога. По всем прогонам считаем для каждого порога выдержки (0, 100, 200, 300, 500 мс): сколько ошибок поймано, сколько ложных тревог —
// и советуем порог. «Поймано» = ошибочная форма мелькала в потоке дольше порога (или стоит в итоге / на конце речи): правило судит только по мельканию,
// а не по тому, что движок выдал в итоге. Чистые функции без React.
import { THRESHOLDS, unpackForms, catchesAt } from '../../../shared/lib/speech/flashDwell.js'
import { wrongPhrase, rowsOf, modeLines } from './contextSeries.js'

export const MODES = ['errors', 'control']
export const MODE_LABEL = { errors: 'говорю С ОШИБКОЙ', control: 'говорю ПРАВИЛЬНО (контроль)' }
export const SERIES_TEXT_MAX = 6000 // потолок «Скопировать итог серии» (чтобы чат не обрезал)

/** Что говорить на шаге: с ошибкой — ошибочная фраза (null — ключевого слова нет в эталоне), контроль — сам эталон */
export const phraseFor = (cfg, i, mode) => (mode === 'control' ? cfg.refs[i] : wrongPhrase(cfg.refs[i], cfg.word, cfg.wrong))

/** Языки, где есть результаты в любом из режимов */
export const langsWithData = state => [...new Set([...Object.keys(state.langs ?? {}), ...Object.keys(state.control ?? {}), ...(state.runs ?? []).map(r => r.lang)])]
  .filter(l => MODES.some(m => rowsOf(state, l, m).length || (state.runs ?? []).some(r => r.lang === l && r.mode === m)))

/**
 * Таблица порогов по прогонам языка lang (null — все языки): { nErr, nCtl, rows: [{ d, caught, falseAlarms }] }.
 * caught — прогонов «с ошибкой», где правило поймало ошибочную форму при пороге d; falseAlarms — «правильных» прогонов, где оно сработало зря
 */
export function thresholdTable(state, lang = null) {
  const runs = (state.runs ?? []).filter(r => !lang || r.lang === lang)
  const err = runs.filter(r => r.mode === 'errors')
  const ctl = runs.filter(r => r.mode === 'control')
  const hit = (list, d) => list.filter(r => catchesAt(unpackForms(r.forms), d)).length
  return { nErr: err.length, nCtl: ctl.length, rows: THRESHOLDS.map(d => ({ d, caught: hit(err, d), falseAlarms: hit(ctl, d) })) }
}

/**
 * Совет простыми словами: максимум пойманных ошибок при НУЛЕ ложных тревог (при равенстве — больший порог: меньше риск для верной речи).
 * Если без ложных тревог не обойтись — лучший компромисс и честное «неизбежны». Возвращает { d, text }
 */
export function recommend({ nErr, nCtl, rows }) {
  if (!nErr || !nCtl) {
    return { d: null, text: `рекомендации пока нет: нужны оба режима (прогонов с ошибкой: ${nErr}, контрольных: ${nCtl})` }
  }
  const best = list => list.reduce((b, r) => (!b || r.caught > b.caught || (r.caught === b.caught && r.d > b.d) ? r : b), null)
  const clean = rows.filter(r => r.falseAlarms === 0)
  if (clean.length) {
    const b = best(clean)
    return b.caught > 0
      ? { d: b.d, text: `рекомендуемый порог: ${b.d} мс — ловит ${b.caught} из ${nErr} ошибок, ложных тревог нет (0 из ${nCtl})` }
      : { d: null, text: `рекомендуемого порога нет: ни при одном пороге ошибка не поймана (0 из ${nErr}) — мелькание её не выдаёт` }
  }
  const low = Math.min(...rows.map(r => r.falseAlarms))
  const b = best(rows.filter(r => r.falseAlarms === low))
  return { d: b.d, text: `ложные тревоги неизбежны: при любом пороге правило срабатывает и на правильной речи. Лучший компромисс — ${b.d} мс: ловит ${b.caught} из ${nErr} ошибок, но ${b.falseAlarms} из ${nCtl} правильных прогонов признаны ошибкой` }
}

const tableLines = (label, tab) => [
  `ПОРОГИ ${label}: прогонов с ошибкой ${tab.nErr}, контрольных ${tab.nCtl}`,
  ...tab.rows.map(r => `  порог ${r.d} мс: поймали ${r.caught}/${tab.nErr} · ложных тревог ${r.falseAlarms}/${tab.nCtl}`),
  `  ${recommend(tab).text}`,
]

/**
 * Строки «Скопировать итог серии»: таблица порогов и совет (в начале — при обрезке пропадает хвост), затем оба режима: по шагу «Услышали …» и «ошибочная форма мелькала … мс».
 * detail — ещё звуки, правила, выводы по длине контекста
 */
export function seriesFullLines(state, langs = langsWithData(state), detail = true) {
  const have = langs.filter(l => langsWithData(state).includes(l))
  const out = [`СЕРИЯ «длина контекста»: слово ${state.cfg.word}, говорим «${state.cfg.wrong}»`]
  if (!have.length) return [...out, 'результатов пока нет']
  for (const l of have) out.push(...tableLines(l, thresholdTable(state, l)))
  if (have.length > 1) out.push(...tableLines('все языки', thresholdTable(state)))
  out.push('', 'РЕЖИМ «С ОШИБКОЙ» (говорили неверную форму):', ...modeLines(state, have, 'errors', detail))
  out.push('', 'РЕЖИМ «КОНТРОЛЬ» (говорили правильно):', ...modeLines(state, have, 'control', detail))
  if (detail && have.length > 1) {
    const start = l => rowsOf(state, l).find(r => r.kind === 'ref')?.n
    out.push(`Сравнение: ${have.map(l => `${l} — исправление ${start(l) ? `с ${start(l)} сл.` : 'нет'}`).join('; ')}`)
  }
  return out
}

/** Готовый текст не длиннее max: сначала полный, потом без подробностей (звуки, правила, выводы), потом обрезка по строкам */
export function seriesText(state, langs, max = SERIES_TEXT_MAX) {
  for (const detail of [true, false]) {
    const text = seriesFullLines(state, langs, detail).join('\n')
    if (text.length <= max) return text
  }
  const lines = seriesFullLines(state, langs, false)
  while (lines.length > 1 && lines.join('\n').length > max - 20) lines.pop()
  return `${lines.join('\n')}\n…(обрезано)`
}
