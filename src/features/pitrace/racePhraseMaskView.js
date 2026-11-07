// Маска слов круга «Скажи» на широкой пилюле (racePhraseScene.js, mode 'say'): узел .racePhraseMask внутри пилюли пула — по <b> на слово, data-w = hidden / draft / full (racePhraseMask.js), стиль — race-phrase-rounds.css.
// Пилюля «Скажи» держит data-cap (полный текст: стиль заливки гонки), но её ::after скрыт — текст пишет этот узел. Пул про узел не знает: сцена снимает его сама (remove) — когда пилюля взлетела, ушла или сцена кончилась.
// В DOM пишет только изменившиеся слова (текст и data-w); без элемента (тесты на поддельном пуле) — тихо ничего, а слова для проверки отдаёт words().
import { maskPhrase } from './racePhraseMask.js'

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
  return {
    /** heard — Map номер слова → подтверждено ли; all — показать всю фразу */
    set(heard, all = false) {
      const next = maskPhrase(text, heard, all)
      next.forEach((w, i) => { const b = cells[i]; if (!b || (w.text === words[i].text && w.state === words[i].state)) return; b.textContent = w.text; b.setAttribute('data-w', w.state) })
      words = next
    },
    words: () => words,
    remove() { box?.remove() },
  }
}
