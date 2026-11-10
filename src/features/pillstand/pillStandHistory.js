// История целей под пилюлей стенда пилюль (v3.3.180, замечание владельца: «в логах сказанное слово затирается при нажатии „Следующая“, а не автоматом на него переходить» — панель слуха (pillStandEar.js)
// сбрасывается с каждой новой целью, и при «авто» владелец не успевал увидеть, что услышал Vosk). Здесь — последние HIST_KEEP прошлых целей + текущая: что Vosk отдал последним (итог, иначе черновик), исход
// (✓ зачёт / ✗ нет / — без исхода), задержка «конец голоса → зачёт» и засчитанные слова (для раскраски). Строка цели дописывается событиями её отрезка; на появлении следующей цели — закрывается с тем, что
// панель слуха знала к этому мигу (задержка с «концом голоса», засчитанное). Ничего не стирается само: только «очистить» (clearHist). histStep меняет h на месте. Чистые функции.
import { wordState } from './pillStandColor.js'

export const HIST_KEEP = 5
export const emptyHist = () => ({ list: [] })

const close = (row, ear) => {
  if (!row || !ear) return
  if (ear.result?.endMs != null) row.ms = ear.result.endMs
  row.state = wordState([...(ear.words ?? []).map(w => ({ t: w.t, text: w.text })), ...(ear.backs ?? []).map(b => ({ t: b.t, text: b.text, gone: true }))])
}

/** Событие трассы → h (на месте); ear — панель слуха ДО этого события (закрыть строку прошлой цели). → true, если строки изменились */
export function histStep(h, e, ear = null) {
  const cur = h.list.at(-1)
  if (e.k === 'target') {
    if (cur && cur.n === e.n && cur.say === e.say && cur.gen === e.gen && !cur.partial && !cur.final && cur.ok == null) { cur.t = e.t; return false } // повтор той же цели (двойной монтаж StrictMode)
    close(cur, ear)
    h.list.push({ n: e.n ?? 0, say: e.say ?? '', shown: e.shown ?? '', gen: e.gen, t: e.t, partial: '', final: '', ok: null, ms: null, state: null })
    if (h.list.length > HIST_KEEP + 1) h.list.splice(0, h.list.length - HIST_KEEP - 1)
    return true
  }
  if (!cur) return false
  if (e.k === 'vosk-partial' && e.raw?.partial) { cur.partial = e.raw.partial; return true }
  if (e.k === 'vosk-final' && e.raw?.text) { cur.final = e.raw.text; cur.partial = ''; return true }
  if (e.k === 'result') { cur.ok = !!e.ok; cur.ms = e.afterVoiceMs ?? cur.ms; return true }
  return false
}

/** «очистить»: прошлые строки убираются, текущая цель остаётся */
export const clearHist = h => { h.list = h.list.slice(-1) }

/** Прошлые цели, новая сверху */
export const pastRows = h => h.list.slice(0, -1).reverse()

/** Исход строки: ✓ / ✗ / — */
export const rowMark = row => (row.ok == null ? '—' : row.ok ? '✓' : '✗')
