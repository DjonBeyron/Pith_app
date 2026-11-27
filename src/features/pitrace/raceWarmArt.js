// Прогрев картинок-узоров игры ЗАРАНЕЕ (журнал слабого Android v3.3.389: «стадия → catch-rev» 267 мс, «стадия → catch-ann» 7 кадров, плашка Мии при входе в «Допрос» — кадры по 150–280 мс, «стили и раскладка»).
// Причина: ушки и усы плашек Пита/Мии, узор плашки (--wl-plate-tex), текстура сцены, стрелка «разворота» на пилюле — это SVG в CSS (data:image/svg+xml). Браузер делает из каждого отдельный маленький документ
// (разбор, стили, раскладка) и только потом рисует; делает он это В КАДРЕ, где картинка впервые понадобилась — то есть в момент появления плашки / смены стадии. Замер стенда (CPU 4×, слабое): плашка Мии,
// первое появление — кадр 283 мс; та же плашка после прогрева картинок — 16,7 мс (как при повторном показе).
// Здесь картинки берутся из подключённых таблиц стилей (правила с селектором «.wl…») и по одной, с паузой между ними, загружаются и декодируются (Image + decode). Картинка остаётся в списке kept, пока открыта страница:
// пока на неё есть ссылка, браузер держит готовый ресурс, и CSS берёт его из памяти, а не собирает заново в кадре. Вид не меняется — те же самые картинки, только готовые раньше.
import { pLog } from '../../shared/lib/debug.js'

const URL_RE = /url\(\s*(?:"(data:image\/svg\+xml[^"]*)"|'(data:image\/svg\+xml[^']*)')\s*\)/g
export const ART_GAP_MS = 120 // пауза между картинками: каждая — отдельный небольшой документ, подряд они дали бы тот же затык, только раньше
const kept = []
let started = false

/** Все SVG-картинки в стилях игры (правила с «.wl» в селекторе): массив уникальных адресов */
export function collectGameArt(sheets = globalThis.document?.styleSheets ?? []) {
  const found = new Set()
  const walk = rules => {
    for (const r of rules ?? []) {
      if (r.cssRules?.length) walk(r.cssRules) // @media и т. п.; у обычного правила в Chromium тоже есть cssRules (вложенный CSS) — пустой
      if (!r.selectorText?.includes('.wl')) continue // только игра: остальные узоры приложения (лента, оболочка) здесь не нужны
      const text = r.cssText ?? ''
      if (!text.includes('data:image/svg+xml')) continue
      for (const m of text.matchAll(URL_RE)) found.add(m[1] ?? m[2])
    }
  }
  for (const s of Array.from(sheets)) { try { walk(s.cssRules) } catch { /* чужая таблица — не читается */ } }
  return [...found]
}

/** Загрузить и декодировать картинки игры по одной. Один раз за страницу. → промис (число готовых) */
export async function warmGameArt({ sheets, make = () => new Image(), wait = ms => new Promise(r => setTimeout(r, ms)), gap = ART_GAP_MS, log = pLog, now = () => performance.now() } = {}) {
  if (started) return 0
  started = true
  let ok = 0, total = 0
  const t0 = now()
  try {
    await wait(0) // сначала даём кадру жеста «Начать» уйти, потом читаем таблицы
    const urls = collectGameArt(sheets)
    total = urls.length
    for (const url of urls) {
      const img = make()
      img.src = url
      kept.push(img)
      try { await img.decode?.(); ok++ } catch { /* не декодировалась — браузер соберёт в кадре, как раньше */ }
      await wait(gap)
    }
  } catch { /* прогрев только ускоряет */ }
  try { log(`[warm] картинки игры (узоры плашек, стрелка разворота): готово ${ok}/${total} за ${Math.round(now() - t0)} мс`) } catch { /* журнал не мешает */ }
  return ok
}
export const resetGameArt = () => { started = false; kept.length = 0 }

