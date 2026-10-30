// «Ворота» запуска игры «Повтори за диктором»: как у уроков, все файлы озвучки готовятся заранее (wordLaneWarm.js качает и декодирует ВСЁ сразу — файлов немного), а тап «Начать» пускает в игру, когда готовы ПЕРВЫЕ N:
// всё, что нужно первым стадиям (реплики первых секунд + куски первой ступени, wordsPlan.firstCount), но не меньше GATE_MIN (5) буферов — или весь набор, если он короче. Остальное докачивается фоном.
//  • Пока ворота закрыты, кнопка показывает «Готовлю звук… 7/15» (warmLabel; прогресс по обработанным файлам — реестр wordLaneSettled.js); тап разрешён, игра ждёт готовности первых N.
//  • waitWarmGate({ items, firstCount }) → промис итога { by: 'first' | 'all' | 'timeout', done, total, firstN, ms, missing }: ворота открываются, когда обработаны первые N (by 'first') или все (by 'all'),
//    но не дольше GATE_MAX_MS с тапа (by 'timeout': стартуем с тем, что есть, в итоге missing — ключи необработанных файлов). Обработан = скачан и декодирован/измерен ИЛИ не вышло (fail): ждать то, что уже не придёт, незачем.
//    Строка журнала: «[warm] готово N/M за X мс, ворота открыты по: первые N / все / таймаут».
//  • Заменяет прежний WORDS_WAIT_MS (2,5 с на «все слоты разбужены тишиной», который на iPhone стабильно кончался словом timeout).
import { isSettled, settledOf, onSettled } from './wordLaneSettled.js'
import { pLog } from '../../../../shared/lib/debug.js'

export const GATE_MIN = 5       // минимум буферов, которые должны быть готовы к старту (или весь набор, если он короче)
export const GATE_MAX_MS = 8000 // дольше с тапа не ждём: стартуем с тем, что есть, и пишем в журнал, чего не хватило

/** Сколько файлов должно быть готово к старту: нужное первым стадиям, но не меньше GATE_MIN и не больше всего набора */
export const gateSize = (firstCount, total) => Math.min(total, Math.max(GATE_MIN, firstCount || 0))

/** Уникальные файлы списка по порядку (одна ссылка — один файл) */
const uniq = items => [...new Map((items ?? []).filter(i => i?.url).map(i => [i.url, i])).values()]

/** Прогресс прогрева: { done (обработано), ok (из них успешно), total, firstN, open (первые N готовы), all (готовы все) } */
export function warmProgress(items, firstCount = 0) {
  const list = uniq(items)
  const firstN = gateSize(firstCount, list.length)
  const done = list.filter(i => isSettled(i.url)).length
  return { done, ok: list.filter(i => settledOf(i.url) === 'ok').length, total: list.length, firstN, open: list.slice(0, firstN).every(i => isSettled(i.url)), all: done === list.length }
}

/** Подпись кнопки, пока ворота закрыты: «Готовлю звук… 7/15» (список файлов ещё неизвестен — без счётчика) */
export const warmLabel = p => (p.total > 0 ? `Готовлю звук… ${p.done}/${p.total}` : 'Готовлю звук…')

/**
 * Ждать ворота. items — [{ key, url }] ВСЕХ файлов игры в порядке важности (сначала нужное первым стадиям); firstCount — сколько из начала списка нужно первым стадиям; sinceTapMs — сколько уже прошло с тапа
 * (потолок GATE_MAX_MS считается от тапа). Таймеры и часы подставляются в тестах.
 */
export function waitWarmGate({ items, firstCount = 0, maxMs = GATE_MAX_MS, sinceTapMs = 0 }, { subscribe = onSettled, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, log = pLog } = {}) {
  const t0 = now()
  return new Promise(resolve => {
    let off = () => {}
    let timer = 0
    let closed = false
    const finish = by => {
      if (closed) return
      closed = true; off(); clearTimer(timer)
      const p = warmProgress(items, firstCount)
      const list = uniq(items)
      const missing = list.filter(i => !isSettled(i.url)).map(i => i.key ?? i.url)
      const failed = list.filter(i => settledOf(i.url) === 'fail').map(i => i.key ?? i.url)
      const r = { by, done: p.done, ok: p.ok, total: p.total, firstN: p.firstN, ms: Math.round(now() - t0), missing, failed }
      const text = by === 'first' ? `первые ${p.firstN}` : by === 'all' ? 'все' : 'таймаут'
      try { log(`[warm] готово ${p.ok}/${p.total} за ${r.ms} мс, ворота открыты по: ${text}${by === 'timeout' && missing.length ? `; не готово: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ` (+${missing.length - 12})` : ''}` : ''}${failed.length ? `; не вышло: ${failed.slice(0, 8).join(', ')}` : ''}`) } catch { /* журнал не мешает игре */ }
      resolve(r)
    }
    const check = () => { const p = warmProgress(items, firstCount); if (p.all) finish('all'); else if (p.open) finish('first') }
    off = subscribe(check)
    timer = setTimer(() => finish('timeout'), Math.max(0, maxMs - sinceTapMs))
    check()
  })
}
