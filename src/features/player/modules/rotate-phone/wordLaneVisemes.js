// Рот кота по тексту: буква → форма рта (коды Rhubarb, они же в таблице рта маскота — mascotMouth.js): A — губы сомкнуты (м б п), B — зубы рядом (согласные, и), C — полуоткрыт (е э),
// D — широко (а я), E — округлён (о), F — «трубочка» (у ю w), G — зубы на губе (ф в), H — язык (л), X — рот закрыт. Раньше рот шёл только по громкости (закрыт / полуоткрыт / открыт), и на «о» он не круглился.
// Дорожка рта (mouthTrack) раскладывает текст по длине звучания: гласные длиннее согласных, английские слова — по сочетаниям букв (ear → округлый рот, th → язык, немое e молчит: shared/lib/visemeEnglish.js);
// если есть тайминги слов (ElevenLabs отдаёт их вместе с озвучкой) — каждое слово в своём отрезке, иначе текст растянут на всю длительность. Формы короче выдержки рта (70 мс) отдают время соседу.
// Чистые функции без DOM — проверяются тестами; реплики кота (wordLaneCatLines.js) и диктор ступеней (wordLaneDictor.js) берут рот отсюда.
import { LETTER, wordWeight, wordSegments } from '../../../../shared/lib/visemeLetters.js'
import { holdWord } from '../../../scene/v2/mouthVisemes.js'
import { MOUTH_MIN_HOLD_MS } from './wordLaneMouthHold.js'

export { codeOf } from '../../../../shared/lib/visemeLetters.js' // буква → код Rhubarb живёт в shared/lib/visemeLetters.js (его же берёт Пит сцен v2)

const GAP_W = 0.4          // вес короткой паузы между словами (в долях согласной)
const TAIL = 0.12          // доля слова в конце, где рот отдыхает перед следующим

// Отрезки слова с выдержкой: форма короче MOUTH_MIN_HOLD_MS отдаёт время более длинному соседу (иначе выдержка рта в WordLaneCat «проглотила» бы её — рисуется не чаще раза в 70 мс)
const segs = (word, from, to) => holdWord(wordSegments(word, from, to), MOUTH_MIN_HOLD_MS)

/**
 * Дорожка рта для текста text длиной ms. words — тайминги слов озвучки [{ w, t, e }] в секундах (необязательно): если слов столько же, сколько в тексте (знаки препинания отдельным «словом» не считаются),
 * каждое слово ставится на своё место, иначе текст растягивается равномерно по словам — на ВСЮ длительность ms, поэтому дорожка не пустая, даже если таймингов нет. total — длина озвучки в секундах
 * (line.duration): тогда тайминги ложатся на ms по долям файла и тишина в начале файла остаётся тишиной (без total слова растягиваются между первым и последним).
 */
export function mouthTrack(text, ms, words = null, total = null) {
  const list = String(text ?? '').split(/\s+/).filter(w => LETTER.test(w))
  if (!list.length || !(ms > 0)) return []
  const ws = Array.isArray(words) ? words.filter(x => LETTER.test(String(x?.w ?? 'a'))) : []
  if (ws.length === list.length && ws.every(x => Number.isFinite(x.t))) {
    const end = x => (Number.isFinite(x.e) && x.e > x.t ? x.e : x.t + 0.3)
    const byFile = total > 0 && end(ws.at(-1)) <= total * 1.05
    const base = byFile ? 0 : ws[0].t
    const span = byFile ? total : Math.max(1e-6, end(ws.at(-1)) - base)
    const k = (byFile ? 1 : 0.97) * ms / span
    return list.flatMap((w, i) => segs(w, (ws[i].t - base) * k, Math.min(ms, (end(ws[i]) - base) * k)))
  }
  const per = list.map(w => wordWeight(w) + GAP_W)
  const sum = per.reduce((a, b) => a + b, 0)
  let at = 0
  return list.flatMap((w, i) => { const to = at + (ms * per[i]) / sum; const seg = segs(w, at, to - (to - at) * TAIL); at = to; return seg })
}

/** Запасная дорожка, когда текста для рта нет (пустая реплика, цифры): рот «жуёт» циклом форм на всю длительность ms — кот говорит, а рот не стоит */
export function chatterTrack(ms, step = 110) {
  const cycle = ['C', 'B', 'D', 'B']
  const out = []
  for (let at = 0, i = 0; at < ms * 0.94; at += step, i++) out.push({ at, end: Math.min(at + step, ms * 0.94), code: cycle[i % cycle.length] })
  return out
}

/** Форма рта в момент t (мс от начала дорожки): между словами и за концом — закрыт (X) */
export function codeAt(track, t) {
  for (const s of track) { if (t >= s.at && t < s.end) return s.code; if (t < s.at) break }
  return 'X'
}
