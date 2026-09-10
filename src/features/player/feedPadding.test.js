import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const feed  = read('../../styles/player/feed.css')
const table = read('../../styles/player/modules/table.css')

// Боковое поле чата. Замеры на реальных ширинах айфонов ДО правки:
//   375 → 8px, 393 → 8px, 402 → 12px, 430 → 12px
// Порог max-width:400px делил модельный ряд пополам: 393 (15/16) получал
// узкое поле, 402 (16 Pro) — широкое. В приложении страница идёт под
// скруглённые углы экрана (viewport-fit=cover), и 8px ставили кромку
// сообщения прямо в зону скругления — она читалась как подрезанная.
// После: 16px на всех этих ширинах, 12px только ниже 360.
describe('боковое поле чата', () => {
  const padOf = css => css.match(/--feed-pad:\s*(\d+)px/)?.[1]

  it('базовое поле — 16px', () => {
    expect(padOf(feed)).toBe('16')
  })

  it('порог сужения ниже всего модельного ряда айфонов', () => {
    // 360 и меньше — это уже совсем узкие экраны. Любой порог выше 375
    // снова разрежет айфоны на «широкие» и «узкие»
    const breakpoints = [...feed.matchAll(/@media \(max-width:\s*(\d+)px\)/g)].map(m => +m[1])
    expect(breakpoints.length).toBeGreaterThan(0)
    for (const bp of breakpoints) expect(bp).toBeLessThanOrEqual(360)
  })

  it('индикатор «печатает» держит то же поле и тот же порог', () => {
    // Он лежит ВНЕ ленты и переменную не наследует — значения продублированы
    // руками, и разъехавшись, точки встанут не по одной линии с сообщениями
    expect(feed).toContain('padding: 0 var(--feed-pad, 16px)')
    const narrow = feed.slice(feed.lastIndexOf('@media (max-width: 360px)'))
    expect(narrow).toContain('.playerWaitingRow { padding: 0 12px; }')
    // Узкое значение ленты и индикатора — одно и то же число
    const feedNarrow = feed.match(/@media \(max-width: 360px\) \{\s*\.playerFeedInner \{ --feed-pad: (\d+)px/)?.[1]
    expect(feedNarrow).toBe('12')
  })

  it('таблица в чате остаётся во всю ширину — она равняется по панели', () => {
    // Панель превращается в это сообщение (flyPanelToChat). Пока ширины
    // расходились, таблица весь переход пересчитывала колонки. Поле ленты
    // компенсируется наружу, поэтому его величина на таблицу не влияет
    expect(table).toContain('width: calc(100% + var(--feed-pad, 16px) * 2)')
    expect(table).toContain('margin-left: calc(var(--feed-pad, 16px) * -1)')
    expect(table).toContain('margin-right: calc(var(--feed-pad, 16px) * -1)')
  })

  it('запасные значения переменной совпадают с базовым', () => {
    // var(--feed-pad, N) срабатывает там, где переменная не наследуется.
    // Разные N в разных файлах = разные поля у соседних элементов
    const fallbacks = [...(feed + table).matchAll(/var\(--feed-pad,\s*(\d+)px\)/g)].map(m => m[1])
    expect(fallbacks.length).toBeGreaterThan(0)
    expect([...new Set(fallbacks)]).toEqual(['16'])
  })
})
