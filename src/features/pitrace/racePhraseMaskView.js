// Маска слов круга «Скажи» на широкой пилюле (racePhraseScene.js, mode 'say'): узел .racePhraseMask внутри пилюли пула — по <b> на слово, data-w = hidden / draft / full (racePhraseMask.js), стиль — race-phrase-rounds.css.
// Пилюля «Скажи» держит data-cap (полный текст: стиль заливки гонки), но её ::after скрыт — текст пишет этот узел. Пул про узел не знает: сцена снимает его сама (remove) — когда пилюля взлетела, ушла или сцена кончилась.
// В DOM пишет только изменившиеся слова (текст и data-w); без элемента (тесты на поддельном пуле) — тихо ничего, а слова для проверки отдаёт words().
// peek(pct) — подсказка следующего слова (data-w='peek', racePhraseMask.js): проявление по буквам — переменная --peek (0…100 %) у ОДНОЙ ячейки, её каждый кадр задаёт сцена (racePhrasePeek.js); пишет только при смене.
// edges() — границы слов для заливки (racePhraseFill.wordEdges): прямоугольники <b> слов и слоя кромки (.wlPillSparks — по нему едет кромка, он на 4 px шире клипа заливки с каждой стороны,
// как и слой заливки — на 8 px). Меряет лениво: при первом вызове, после смены слов (кирпичик → слово меняет ширину) и после загрузки шрифтов; пока пилюля не в DOM или не видна — null (доли 1/N), каждый кадр — из кэша.
import { maskPhrase } from './racePhraseMask.js'
import { wordEdges } from './racePhraseFill.js'

export function mountMask(el, text) {
  const doc = el?.ownerDocument
  const box = doc?.createElement?.('span') ?? null
  const cells = []
  let words = maskPhrase(text)
  if (box) {
    box.className = 'racePhraseMask'; box.setAttribute('data-testid', 'race-phrase-mask'); box.setAttribute('aria-hidden', 'true')
    words.forEach((w, i) => { if (i) box.appendChild(doc.createTextNode(' ')); const b = doc.createElement('b'); b.textContent = w.text; b.setAttribute('data-w', w.state); box.appendChild(b); cells.push(b) })
    el.appendChild(box)
  }
  let edges = null, dirty = true
  doc?.fonts?.ready?.then?.(() => { dirty = true }, () => {})
  const measure = () => {
    const sp = el.querySelector?.('.wlPillSparks')?.getBoundingClientRect?.(), cl = el.querySelector?.('.wlPillClip')?.getBoundingClientRect?.()
    const layer = sp?.width > 0 ? sp : cl?.width > 0 ? { left: cl.left - 4, width: cl.width + 8 } : null // слоя кромки нет (скрыт) — клип заливки ± 4 px: та же геометрия
    return wordEdges(cells.filter((b, i) => words[i].index >= 0).map(b => b.getBoundingClientRect()), layer)
  }
  return {
    /** Границы слов в долях слоя кромки [v1…vN] или null (не измерить: тесты без DOM, пилюля ещё не видна) */
    edges() { if (dirty && box) { edges = measure(); dirty = !edges } return edges },
    /** heard — Map номер слова → подтверждено ли; all — показать всю фразу; peek — номер подсказываемого слова (-1 — нет). Смена кирпичик ↔ текст — перемер границ (dirty) */
    set(heard, all = false, peek = -1) {
      const next = maskPhrase(text, heard, all, peek)
      next.forEach((w, i) => { const b = cells[i]; if (!b || (w.text === words[i].text && w.state === words[i].state)) return; b.textContent = w.text; b.setAttribute('data-w', w.state); dirty = true })
      words = next
    },
    /** Проявление подсказки: pct 0…100 — до какой доли ширины слова видны буквы (--peek ячейки с data-w='peek') */
    peek(pct) {
      const i = words.findIndex(w => w.state === 'peek'), b = cells[i], v = `${Math.round(Math.min(100, Math.max(0, pct)))}%`
      if (!b?.style || b.peekV === v) return
      b.peekV = v; b.style.setProperty('--peek', v)
    },
    words: () => words,
    remove() { box?.remove() },
  }
}
