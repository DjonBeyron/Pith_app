// Сохранение «Прогона громкости» (v3.3.205): iPhone выгружает страницу, когда приложение свёрнуто (человек ушёл сравнивать звук в Telegram) — без сохранения прогон терялся.
// Храним только то, что нельзя восстановить: номер захода, ответы, настройки «до прогона» и строки журнала. План строится заново (buildPlan детерминирован). Хранилище подставляется (тесты).
export const RUN_KEY = 'pithy_volume_run_v2'
export const LINES_MAX = 1500

export function loadRun(store = globalThis.localStorage) {
  try {
    const v = JSON.parse(store?.getItem(RUN_KEY) ?? 'null')
    if (!v || v.v !== 1 || !Number.isInteger(v.idx) || !v.orig || !Array.isArray(v.results) || !Array.isArray(v.lines)) return null
    return v
  } catch { return null }
}
export function saveRun({ idx, orig, results, lines, done = false }, store = globalThis.localStorage) {
  try { store?.setItem(RUN_KEY, JSON.stringify({ v: 1, idx, orig, done, results: results.map(r => ({ n: r.item.n, answers: r.answers, ok: r.ok })), lines: lines.slice(-LINES_MAX) })); return true } catch { return false }
}
export function clearRun(store = globalThis.localStorage) { try { store?.removeItem(RUN_KEY) } catch { /* без хранилища */ } }
