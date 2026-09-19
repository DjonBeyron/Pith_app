import { useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'

// «Виртуализация-лайт» ленты: строки, уехавшие дальше чем на полтора экрана
// от видимой области, замораживаются — content-visibility: hidden с явно
// зафиксированной высотой. Браузер перестаёт считать раскладку и рисовать их
// содержимое: рост пузыря голосового или прилёт новой ноды больше не тянут
// layout по всем 80 сообщениям выше (замер на iPhone: худший кадр на новой
// ноде рос с 50 до 380 мс к концу урока). Вернулись в окно — размораживаем,
// высота снова авто. React-дерево не трогаем: состояние сообщений живёт.
//
// Именно hidden с явной высотой, а не content-visibility:auto на всех
// строках: auto включает paint-containment и у ВИДИМЫХ строк — обрезал бы
// тень пузыря и реакцию-эмодзи, торчащую за край строки (reaction.css).
// Здесь трогаем только то, чего на экране нет.
//
// Порог симметричный (сверху и снизу): лента перевёрнута scaleY(-1)
// (PlayerFeed.jsx), и «верх» в геометрии IntersectionObserver — не всегда
// верх на экране. Снизу дальше полутора экранов ничего не бывает (новая
// строка стартует на MSG_TRAVEL=200px ниже места), так что это безопасно.
//
// PlayerBubble.jsx знает о заморозке: у содержимого замороженной строки нет
// боксов, его ResizeObserver приносит ноль — это не смена высоты.
const MARGIN = '150% 0px'

function freeze(row) {
  const h = row.getBoundingClientRect().height
  if (!h) return
  row.dataset.frozen = '1'
  row.style.height = h + 'px'
  row.style.contentVisibility = 'hidden'
}

function thaw(row) {
  delete row.dataset.frozen
  row.style.height = ''
  row.style.contentVisibility = ''
}

export function useFeedRowFreeze(outerRef, innerRef) {
  useEffect(() => {
    const root = outerRef.current, inner = innerRef.current
    if (!root || !inner || typeof IntersectionObserver === 'undefined') return
    if (!globalThis.CSS?.supports?.('content-visibility', 'hidden')) {
      pLog('[freeze] content-visibility не поддерживается — заморозка строк выключена')
      return
    }
    pLog('[freeze] включена: строки дальше полутора экранов выводятся из раскладки')

    const io = new IntersectionObserver(entries => {
      let frozen = 0, thawed = 0
      for (const e of entries) {
        const row = e.target
        if (e.isIntersecting) { if (row.dataset.frozen) { thaw(row); thawed++ } }
        else if (!row.dataset.frozen) { freeze(row); frozen++ }
      }
      // Одна строка на пачку, не на строку: проверка в логе, что заморозка
      // вообще работает на устройстве (Safari < 18 её не умеет) и сколько
      // строк реально выведено из раскладки
      if (frozen || thawed) {
        const all = inner.querySelectorAll('.playerMsgRow').length
        const now = inner.querySelectorAll('.playerMsgRow[data-frozen]').length
        pLog(`[freeze] заморожено +${frozen}, разморожено -${thawed} → замороженных ${now} из ${all} строк`)
      }
    }, { root, rootMargin: MARGIN, threshold: 0 })

    // Строки появляются по ходу урока — подхватываем новые через MutationObserver
    const seen = new WeakSet()
    const scan = () => {
      inner.querySelectorAll('.playerMsgRow').forEach(row => {
        if (seen.has(row)) return
        seen.add(row)
        io.observe(row)
      })
    }
    scan()
    const mo = new MutationObserver(scan)
    mo.observe(inner, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      io.disconnect()
      inner.querySelectorAll('.playerMsgRow[data-frozen]').forEach(thaw)
    }
  }, [outerRef, innerRef])
}
