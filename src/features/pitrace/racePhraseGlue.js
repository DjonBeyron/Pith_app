// «Склейка» в итоге захода Vosk (проход 1 «Скажи», v3.3.325). Журнал владельца 2026-11-21 13:31, «I'm trying to learn»: пять неверных слов отклонены, шестое — итог «trying [unk]» (conf 1,0) — засчитано:
// длинное чужое слово Vosk с закрытым словарём разрезал на «начало похоже на слово цели» + «[unk]». Признак виден во временах слов итога: кусок-слово КОРОТКИЙ («trying» 0,31 с при настоящих 0,69) и стоит
// ВПЛОТНУЮ к «[unk]» (зазор 0,14 с). По всем журналам 20–21.11 картина двугорбая: склейки — зазор ≤ 0,15 с и слово 0,10–0,31 с («to [unk]», «i'm [unk]», «from [unk]», «[unk] you»); честные «слово, пауза,
// чужое слово» — зазор ≥ 0,33 с и слово ≥ 0,39 с («where [unk]», «are [unk]», «you [unk]»). Правило: слово итога короче GLUE_DUR_S, стоящее ближе GLUE_GAP_S к «[unk]», — часть чужого слова → «[unk]».
// Слитное «where is you from» (правило 4 владельца: засчитывается «where») не страдает: настоящее слово длиннее GLUE_DUR_S. Чистая функция; времён нет (тесты, старый движок) — текст как есть.
export const GLUE_GAP_S = 0.2
export const GLUE_DUR_S = 0.33
const UNK = '[unk]'

/** raw — текст итога («trying [unk]»), words — слова итога Vosk [{ word, start, end }] в том же порядке; → текст, где склеенные куски заменены на «[unk]». log — строка журнала на каждую замену */
export function unglue(raw, words, log = null) {
  const toks = String(raw ?? '').trim().split(/\s+/).filter(Boolean)
  if (!Array.isArray(words) || words.length !== toks.length) return String(raw ?? '')
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : null)
  const out = toks.map((t, i) => {
    const w = words[i], s = num(w?.start), e = num(w?.end)
    if (t === UNK || s == null || e == null || e - s >= GLUE_DUR_S) return t
    const prev = words[i - 1], next = words[i + 1]
    const before = toks[i - 1] === UNK && num(prev?.end) != null ? s - num(prev.end) : Infinity, after = toks[i + 1] === UNK && num(next?.start) != null ? num(next.start) - e : Infinity
    const gap = Math.min(before, after)
    if (gap >= GLUE_GAP_S) return t
    log?.(`[phrase-ear] «${t}» в итоге — кусок чужого слова: длится ${(e - s).toFixed(2).replace('.', ',')} с и стоит вплотную к «[unk]» (зазор ${Math.max(0, gap).toFixed(2).replace('.', ',')} с) — не засчитываю`)
    return UNK
  })
  return out.join(' ')
}
