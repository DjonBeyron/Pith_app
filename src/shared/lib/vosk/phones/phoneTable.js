// Таблица произношений для фонетических ловушек правила слова (phoneNeighbors.js): грузится ЛЕНИВО отдельным чанком (enPhones.js, ≈150 КБ gzip) — только когда в память встаёт английская
// модель Vosk (voskRuntime.js зовёт loadPhones); в основной бандл и в кеш оболочки не входит. Правило слова (wordEarRule.js) берёт таблицу перед каждым заходом (phonesOf). Пока таблицы нет (или язык не английский) — phonesOf() отдаёт null,
// и ловушки строятся по буквам, как до v3.3.185. Русская модель — без таблицы (там свой механизм: начала длинных слов и выдержка черновика).
let table = null, pending = null

/** Текст таблицы («слово:КОД[,КОД2] …») → { prons: Map(слово → [коды], первое — основное), words: Map(код → [слова] в порядке таблицы: сначала частые) } */
export function parsePhones(text) {
  const prons = new Map(), words = new Map()
  for (const entry of String(text ?? '').split(/\s+/)) {
    const i = entry.indexOf(':')
    if (i < 1) continue
    const w = entry.slice(0, i), codes = entry.slice(i + 1).split(',')
    prons.set(w, codes)
  }
  const add = (c, w) => { const list = words.get(c); if (list) list.push(w); else words.set(c, [w]) }
  for (const [w, codes] of prons) add(codes[0], w) // сначала слова, у которых это произношение основное (win), потом — запасное (when → «win»)
  for (const [w, codes] of prons) for (const c of codes.slice(1)) add(c, w)
  return { prons, words }
}

/** Таблица языка, если уже загружена (иначе null — ловушки по буквам) */
export const phonesOf = lang => (lang === 'en' ? table : null)

/** Начать загрузку таблицы (повторный вызов — та же загрузка). Сбой сети не ошибка: останутся буквенные ловушки, следующая попытка — при следующем вызове */
export function loadPhones(lang = 'en') {
  if (lang !== 'en') return Promise.resolve(null)
  if (table) return Promise.resolve(table)
  pending ??= import('./enPhones.js').then(m => { table = parsePhones(m.EN_PHONES); return table }).catch(() => { pending = null; return null })
  return pending
}

/** Только тесты: подставить (или убрать) таблицу */
export function setPhonesForTest(next) { table = next; pending = null }
