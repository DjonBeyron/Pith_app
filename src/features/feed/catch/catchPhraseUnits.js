import { splitTitleTokens } from '../../../shared/lib/titleWords.js'

// Фраза полоски «Ловли слов» как цепочка «слово со своими знаками» (общая для CatchStripPhrase и CatchTypedLine, чтобы
// фраза и строка набранного строились одинаково). Знаки препинания прилипают к слову: «Hello, world!» → «Hello,» и
// «world!» — облачко накрывает слово вместе со знаком, а промежуток между облачками — только пробел (его растягивает
// word-spacing). Знак после слова — к нему (всё до пробела), знак перед словом — к следующему (всё после пробела);
// знаки в начале фразы — к первому слову, в конце — к последнему; знаки без пробела вокруг («a/b») — к предыдущему.
// Возвращает [{ index, text, gap }]: index — номер слова (как в splitTitleTokens), text — слово со знаками,
// gap — ' ' если после него в оригинале был пробел, иначе ''. Нет слов — []
export function phraseUnits(title) {
  const tokens = splitTitleTokens(title)
  const units = tokens.filter(t => t.word).map(t => ({ index: t.index, core: t.text, lead: '', trail: '', gap: '' }))
  const marks = parts => parts.filter(Boolean).join(' ')
  let k = 0 // сколько слов уже прошли
  for (const t of tokens) {
    if (t.word) { k++; continue }
    const prev = units[k - 1]
    const next = units[k]
    const parts = t.text.split(/\s+/)
    if (!prev) { if (next) next.lead = marks(parts); continue }
    if (!next) { prev.trail = marks(parts); continue }
    if (parts.length === 1) { prev.trail = parts[0]; continue }
    prev.trail = parts.slice(0, -1).map((m, i) => (i ? ` ${m}` : m)).join('') // «one - two» → «one -» (тире отдельно, но в облачке слова)
    prev.gap = ' '
    next.lead = parts[parts.length - 1]
  }
  return units.map(u => ({ index: u.index, text: u.lead + u.core + u.trail, gap: u.gap }))
}
