// Рот кота по тексту: буква → форма рта (коды Rhubarb, они же в таблице рта маскота — mascotMouth.js): A — губы сомкнуты (м б п), B — зубы рядом (согласные, и), C — полуоткрыт (е э),
// D — широко (а я), E — округлён (о), F — «трубочка» (у ю w), G — зубы на губе (ф в), H — язык (л), X — рот закрыт. Раньше рот шёл только по громкости (закрыт / полуоткрыт / открыт), и на «о» он не круглился.
// Дорожка рта (mouthTrack) раскладывает буквы текста по длине звучания: гласные длиннее согласных; если есть тайминги слов (ElevenLabs отдаёт их вместе с озвучкой) — каждое слово в своём отрезке.
// Чистые функции без DOM — проверяются тестами; реплики кота (wordLaneCatLines.js) и диктор ступеней (wordLaneDictor.js) берут рот отсюда.
const MAP = {
  a: 'D', 'а': 'D', 'я': 'D',
  e: 'C', 'э': 'C', 'е': 'C',
  i: 'B', 'и': 'B', 'ы': 'B', y: 'B',
  o: 'E', 'о': 'E', 'ё': 'E',
  u: 'F', 'у': 'F', 'ю': 'F', w: 'F',
  m: 'A', b: 'A', p: 'A', 'м': 'A', 'б': 'A', 'п': 'A',
  f: 'G', v: 'G', 'ф': 'G', 'в': 'G',
  l: 'H', 'л': 'H',
}
const VOWELS = /[aeiouyаеёиоуыэюя]/i
const LETTER = /[a-zа-яё]/i
const CONSONANT_W = 0.55

/** Форма рта для буквы (нет буквы — null) */
export const codeOf = ch => (LETTER.test(ch) ? MAP[ch.toLowerCase()] ?? 'B' : null)

const weight = ch => (VOWELS.test(ch) ? 1 : CONSONANT_W) // гласные звучат дольше согласных

/** Отрезки { at, end, code } слова word на [from, to) мс: буквы с весами, подряд идущие одинаковые формы склеены */
function wordSegments(word, from, to) {
  const letters = [...word].filter(ch => LETTER.test(ch))
  if (!letters.length || to <= from) return []
  const total = letters.reduce((a, ch) => a + weight(ch), 0)
  const out = []
  let at = from
  for (const ch of letters) {
    const end = at + ((to - from) * weight(ch)) / total
    const code = codeOf(ch)
    const last = out.at(-1)
    if (last && last.code === code) last.end = end
    else out.push({ at, end, code })
    at = end
  }
  return out
}

/**
 * Дорожка рта для текста text длиной ms. words — тайминги слов озвучки [{ w, t, e }] в секундах (необязательно): если слов столько же, сколько в тексте, каждое слово ставится на своё место,
 * иначе текст растягивается равномерно по словам.
 */
export function mouthTrack(text, ms, words = null) {
  const list = String(text ?? '').split(/\s+/).filter(w => LETTER.test(w))
  if (!list.length || !(ms > 0)) return []
  const timed = Array.isArray(words) && words.length === list.length && words.every(w => Number.isFinite(w.t))
  if (timed) {
    const base = words[0].t
    const span = Math.max(1e-6, (words.at(-1).e ?? words.at(-1).t + 0.3) - base)
    return list.flatMap((w, i) => wordSegments(w, ((words[i].t - base) / span) * ms * 0.97, (((words[i].e ?? words[i].t + 0.3) - base) / span) * ms * 0.97))
  }
  const per = list.map(w => [...w].filter(ch => LETTER.test(ch)).reduce((a, ch) => a + weight(ch), 0) + 0.4) // +0.4 — короткая пауза между словами
  const sum = per.reduce((a, b) => a + b, 0)
  let at = 0
  return list.flatMap((w, i) => { const to = at + (ms * per[i]) / sum; const seg = wordSegments(w, at, to - (to - at) * 0.12); at = to; return seg })
}

/** Форма рта в момент t (мс от начала дорожки): между словами и за концом — закрыт (X) */
export function codeAt(track, t) {
  for (const s of track) { if (t >= s.at && t < s.end) return s.code; if (t < s.at) break }
  return 'X'
}
