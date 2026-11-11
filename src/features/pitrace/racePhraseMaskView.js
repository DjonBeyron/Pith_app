// Маска слов круга «Скажи» на широкой пилюле (racePhraseScene.js, mode 'say'): узел .racePhraseMask внутри пилюли пула — по <b> на слово, data-w = hidden / draft / full (racePhraseMask.js), стиль — race-phrase-rounds.css.
// Пилюля «Скажи» держит data-cap (полный текст: стиль заливки гонки), но её ::after скрыт — текст пишет этот узел. Пул про узел не знает: сцена снимает его сама (remove) — когда пилюля взлетела, ушла или сцена кончилась.
// ГЕОМЕТРИЯ НЕ МЕНЯЕТСЯ (v3.3.184, отчёт владельца со стенда: «зашифрованная форма исчезает, правая сторона фразы едет влево»): в ячейке <b><i>слово</i></b> ВСЕГДА лежит само слово — оно и держит ширину,
// а кирпичик — слой b::before поверх (race-phrase-rounds.css): спрятанное слово — текст (<i>) невидим, кирпичик виден; подсказка и сказанное слово — кирпичик гаснет, текст проявляется (у каждого слоя своя opacity). До v3.3.184 в ячейку
// писались фигурные пробелы и при подсказке подменялись словом другой ширины — вся строка (она по центру) съезжала. Знаки по краям слова («you?») теперь прячутся под кирпичиком вместе со словом.
// В DOM пишет только data-w изменившихся слов; без элемента (тесты на поддельном пуле) — тихо ничего, а слова для проверки (с плашками, как в журнале) отдаёт words().
// ТЁМНАЯ КОПИЯ (v3.3.186): жидкость пилюли — чистый яркий цвет, светлые слова на ней не читаются, поэтому маска лежит под жидкостью, а в слое заливки (.wlPillInkIn, word-lane-pill-ink.css) — её копия
// тёмным: видна только там, где жидкость. Копия получает те же data-w и --peek; ширину и границы слов меряет только основная маска.
// peek(level) — подсказка следующего слова (data-w='peek', racePhraseMask.js): проявление целым словом — переменная --peek (opacity 0…1) у ОДНОЙ ячейки, её каждый кадр задаёт сцена (racePhrasePeek.js); пишет только при смене.
// edges() — границы слов для заливки (racePhraseFill.wordEdges): прямоугольники <b> слов и слоя кромки (.wlPillSparks — по нему едет кромка, он на 4 px шире клипа заливки с каждой стороны,
// как и слой заливки — на 8 px). Меряет лениво: при первом вызове и после загрузки шрифтов (смена состояния слова ширину не меняет); пока пилюля не в DOM или не видна — null (доли 1/N), каждый кадр — из кэша.
import { maskPhrase } from './racePhraseMask.js'
import { wordEdges } from './racePhraseFill.js'

/** Ячейка слова: <b><i>слово</i></b> — текст в своём слое, чтобы его opacity не гасила кирпичик b::before. Её же строит просмотр записи стенда (pillStandSnap.js) */
export function maskCell(doc, text) { const b = doc.createElement('b'), i = doc.createElement('i'); i.textContent = text; b.appendChild(i); return b }

export function mountMask(el, text) {
  const doc = el?.ownerDocument
  const box = doc?.createElement?.('span') ?? null
  const cells = []
  let words = maskPhrase(text)
  const open = maskPhrase(text, undefined, true) // сами слова: текст ячеек (держит ширину)
  if (box) {
    box.className = 'racePhraseMask'; box.setAttribute('data-testid', 'race-phrase-mask'); box.setAttribute('aria-hidden', 'true')
    words.forEach((w, i) => { if (i) box.appendChild(doc.createTextNode(' ')); const b = maskCell(doc, open[i].text); b.setAttribute('data-w', w.state); box.appendChild(b); cells.push(b) })
    el.appendChild(box)
  }
  const inkHost = box?.cloneNode ? el.querySelector?.('.wlPillInkIn') : null, ink = inkHost ? box.cloneNode(true) : null, inkCells = ink ? [...ink.querySelectorAll('b')] : []
  if (ink) { ink.removeAttribute('data-testid'); inkHost.appendChild(ink) }
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
    /** heard — Map номер слова → подтверждено ли; all — показать всю фразу; peek — номер подсказываемого слова (-1 — нет). Меняется только data-w: текст и ширина ячеек постоянны */
    set(heard, all = false, peek = -1) {
      const next = maskPhrase(text, heard, all, peek)
      next.forEach((w, i) => { const b = cells[i]; if (!b || w.state === words[i].state) return; b.setAttribute('data-w', w.state); inkCells[i]?.setAttribute('data-w', w.state) })
      words = next
    },
    /** Проявление подсказки: level 0…1 — opacity слова целиком (--peek ячейки с data-w='peek'), с точностью 0,01 */
    peek(level) {
      const i = words.findIndex(w => w.state === 'peek'), b = cells[i], v = String(Math.round(Math.min(1, Math.max(0, level)) * 100) / 100)
      if (!b?.style || b.peekV === v) return
      b.peekV = v; b.style.setProperty('--peek', v); inkCells[i]?.style.setProperty('--peek', v)
    },
    words: () => words,
    remove() { box?.remove(); ink?.remove() },
  }
}
