// Подписи трассера лагов (lagTrace.js): как событие трассы сцены (sceneTrace.js) и строка журнала игры называются в строке «[lag] …». Чистые функции без DOM.
// У подписи два вида: text — что пишется в строке этого лага («реплика mia_ok_2 старт»), key — под каким именем лаг считается в итоговой сводке («старт реплики»: сводке важно «что чаще всего», а не какая именно реплика).
const short = (s, n = 28) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t }
const RES = { win: 'ответ верный', miss: 'ответ: чужое слово', fail: 'ответ: не успел' }

/** Событие трассы сцены → { key, text } или null (служебное: паузы-настройки, ожидания) */
export function sceneLabel(ev) {
  switch (ev?.k) {
    case 'stage-in': return { key: 'смена стадии', text: `стадия → ${ev.sid ?? ev.idx}` }
    case 'stage-out': return { key: 'смена стадии', text: `стадия ${ev.sid ?? ev.idx} кончилась` }
    case 'line-start': return { key: 'старт реплики', text: `реплика ${short(ev.id)} старт` }
    case 'line-end': return { key: 'конец реплики', text: `реплика ${short(ev.id)} конец` }
    case 'ask': return { key: 'вопрос (Пит говорит слово)', text: `вопрос №${ev.idx ?? '?'}` }
    case 'pill': return { key: 'выезд пилюли', text: `пилюля №${ev.idx ?? '?'} выезд` }
    case 'claim': return { key: 'слово принято', text: 'слово принято' }
    case 'answer': return { key: RES[ev.res] ?? `ответ ${ev.res}`, text: RES[ev.res] ?? `ответ ${ev.res}` }
    case 'note': return { key: 'нота за ответ', text: 'нота за ответ' }
    case 'count': return { key: 'отсчёт', text: 'отсчёт старт' }
    case 'count-end': return { key: 'отсчёт', text: 'отсчёт конец' }
    case 'resume': return { key: 'продолжить после паузы', text: 'продолжить после паузы' }
    case 'end': return { key: 'конец игры', text: 'конец игры' }
    default: return null
  }
}

// Строки журнала, которых нет в трассе сцены: итог распознавания, смена модели, счёт экзамена, уворот Пита. Первое совпадение — подпись (она же ключ сводки)
const JOURNAL = [
  [/\[(word-ear|phrase-ear|say-vosk)\] итог/, 'итог Vosk'],
  [/\[say-vosk\] прогрев: загружаем модель|\[race\] слух: \S+ модель/, 'смена модели Vosk'],
  [/\[boss\] экзамен: слово \d+ — (верно|не названо|неверно)/, 'экзамен: счёт и полёт «+N»'],
  [/\[dodge\] (прыжок|нырок)/, 'уворот Пита'],
  [/\[fill\] (?!(\+\d+ мс: .*→ цель|экран ))/, 'событие заливки «Скажи»'], // не построчное «цель / экран» (его пишет КАЖДЫЙ кадр заливки — раньше оно попадало в каждый лаг этапа фраз и выглядело причиной: журнал Android 2026-11-27, v3.3.392), а событие: слово, взлёт, итог хода, рывок
  [/\[mic\] (поток|контекст захвата)/, 'микрофон: открытие / закрытие'],
  [/\[pause\] «Продолжить»/, 'перезапуск звука'],
]
/** Текст строки журнала (без метки времени) → подпись или null */
export function journalLabel(text) {
  for (const [re, label] of JOURNAL) if (re.test(text)) return label
  return null
}

/** Метка времени строки журнала («   12345.6 09:24:18.713 текст») → [мс, текст] или null */
export function journalLine(line) {
  const m = /^\s*([\d.]+) \S+ (.*)$/.exec(line)
  return m ? [Number(m[1]), m[2]] : null
}

const sec = ms => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
/** Итог игры одной строкой. stats — { frames, bursts, worst, extra, playMs, keys: Map(ключ → в скольких сериях), blank } */
export function lagSummaryLine(stats, limit) {
  if (!stats.frames) return `[lag] итог: длинных кадров (от ${limit} мс) не было за ${sec(stats.playMs)} игры`
  const top = [...stats.keys].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ×${n}`)
  return `[lag] итог: ${stats.frames} длинных кадров (от ${limit} мс) в ${stats.bursts} местах за ${sec(stats.playMs)} игры; худший ${Math.round(stats.worst)} мс, всего лишних ${Math.round(stats.extra)} мс; чаще всего: ${top.join(', ') || '—'}${stats.blank ? `; без меток ×${stats.blank}` : ''}`
}
