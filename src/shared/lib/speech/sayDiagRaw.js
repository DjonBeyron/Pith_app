// Админская диагностика «Сказать фразу»: СЫРОЙ результат последней попытки по словам — что вернул Vosk, что отбросил наш фильтр и почему, что ушло в оценку, чем и как остановились,
// какое решение приняла оценка. Строки для окна (sayDiagRows.buildDiagRows) и для «Скопировать отчёт»; чистые функции, без React. Данные пишет sayAttemptLast.js (поля raw и verdict).
// Главный вопрос, на который это отвечает: слова «both» нет в итоге — Vosk его вообще не выдал (нет в сыром ответе) или выдал, а фильтр уверенности выбросил (строка «ОТБРОШЕНО»).
import { tokenize } from './speechMatch.js'

const q = t => `«${t}»`
const c2 = n => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null)
const span = w => (typeof w.start === 'number' && typeof w.end === 'number' ? `, время ${c2(w.start)}–${c2(w.end)} с` : '')

const STOP_BY_RU = { endpoint: 'движок сам (пауза в речи)', auto: 'авто-стоп (текст перестал меняться)', manual: 'нажатие на круг', max: 'потолок времени записи' }

function dropWhy(w, raw) {
  if (w.drop === 'unk') return 'это [unk] — Vosk услышал что-то не из нашего списка слов'
  const soft = w.need != null && raw.minConf != null && w.need < raw.minConf ? ' (для последнего слова фразы порог мягче)' : ''
  return `уверенность ${c2(w.conf)} ниже порога ${c2(w.need)}${soft}`
}

function wordRows(raw) {
  if (!raw.rows.length) {
    return [raw.rawText
      ? { id: 'rawword-0', label: 'Слова Vosk', level: 'info', text: `Vosk вернул текст ${q(raw.rawText)} без пословных меток — фильтра по уверенности не было` }
      : { id: 'rawword-0', label: 'Слова Vosk', level: 'warn', text: 'Vosk не вернул ни одного слова (тишина или звук оборвался)' }]
  }
  return raw.rows.map((w, i) => ({
    id: `rawword-${i}`, label: `Слово ${i + 1}`, level: w.drop === 'low' ? 'bad' : w.drop === 'unk' ? 'warn' : 'ok',
    text: `${q(w.word)} — уверенность ${c2(w.conf) ?? 'не указана'}${span(w)} — ${w.drop ? `ОТБРОШЕНО: ${dropWhy(w, raw)}` : `принято (порог ${c2(w.need) ?? '—'})`}`,
  }))
}

function stopText(raw) {
  const by = STOP_BY_RU[raw.stopBy] ?? raw.stopBy ?? 'неизвестно'
  const bits = [`остановка: ${by}`]
  if (raw.stopBy && raw.stopBy !== 'endpoint') {
    bits.push(raw.tailMs ? `тишины в хвост досылали ${raw.tailMs} мс` : 'тишину в хвост НЕ досылали')
    if (raw.drainMs != null) bits.push(`последний кусок звука ждали ${raw.drainMs} мс`)
    if (raw.afterStopMs != null) bits.push(`итог пришёл через ${raw.afterStopMs} мс после запроса`)
  } else bits.push('итог выдал сам Vosk, хвост тишины мы не досылали')
  return bits.join('; ')
}

function audioText(raw) {
  if (raw.chunkMs == null) return null
  const late = raw.lateChunks ?? 0
  return `кусок звука ${raw.chunkMs} мс, кусков ${raw.chunks ?? '—'}, самый долгий промежуток между кусками ${raw.maxGapMs ?? '—'} мс, опоздавших кусков ${late}${late ? ' — страница была занята, часть звука могла пропасть' : ' — провалов звука нет'}`
}

/** Почему не услышано слово: нет в сыром ответе Vosk или отброшено фильтром */
function missedWhy(word, raw) {
  const hit = raw?.rows?.find(w => tokenize(w.word).includes(word))
  if (!raw) return null
  return hit ? (hit.drop ? 'Vosk выдал, но отбросил наш фильтр' : 'Vosk выдал и принял, но слово не совпало по правилам оценки') : 'Vosk его не выдал'
}

function verdictRow(a) {
  const v = a.verdict
  const miss = v.missed.length ? `, не услышаны: ${v.missed.map(w => `${w} (${missedWhy(w, a.raw) ?? 'нет данных'})`).join('; ')}` : ''
  const text = `${v.passed ? 'засчитано' : 'не засчитано'}: совпало ${v.matched} из ${v.total} слов (${v.ratioPct}%), порог ${v.threshold}%${v.strict ? ' («Строго»)' : ''}${miss}`
  const level = v.passed ? (v.missed.length ? 'warn' : 'ok') : 'bad'
  return { id: 'rawverdict', label: 'Решение оценки', level, text, ...(v.passed && v.missed.length ? { hint: 'Порог допускает пропуск слов: ученику в чат уходит услышанное, а не эталон.' } : {}) }
}

/** Строки группы «raw» для последней попытки a (sayAttemptLast.get()). Пока попытки нет / идёт / данных нет — одна пояснительная строка (группа в окне видна всегда) */
export function rawRows(a) {
  const wait = text => [{ id: 'rawwait', label: 'Сырой результат', level: 'info', text }]
  if (!a) return wait('появится после первой попытки (сказать фразу и открыть это окно снова)')
  if (a.status === 'run') return wait('попытка идёт — результат появится после её конца')
  if (!a.raw && !a.verdict) return wait(`по этой попытке данных нет (${a.engine === 'vosk' ? 'Vosk не вернул результат' : 'системное распознавание не отдаёт слова с уверенностью'})`)
  const out = []
  const raw = a.raw
  if (raw) {
    out.push(...wordRows(raw))
    out.push({ id: 'rawpartial', label: 'Последний partial', level: 'info', text: raw.partial ? `${q(raw.partial)} (так слова шли по ходу речи, до итога)` : 'не было (до итога Vosk не показал ни слова)' })
    const dropped = raw.rows.filter(w => w.drop).length
    out.push({ id: 'rawkept', label: 'После фильтра → в оценку', level: raw.kept ? 'info' : 'warn', text: `${raw.kept ? q(raw.kept) : 'пусто'}${dropped ? `, отброшено слов: ${dropped}` : ''}` })
    out.push({ id: 'rawstop', label: 'Остановка', level: raw.stopBy && raw.stopBy !== 'endpoint' && !raw.tailMs ? 'warn' : 'info', text: stopText(raw) })
    const au = audioText(raw)
    if (au) out.push({ id: 'rawaudio', label: 'Звук', level: raw.lateChunks ? 'warn' : 'info', text: au })
  }
  if (a.verdict) out.push(verdictRow(a))
  return out
}
