import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const feed     = read('../../styles/player/feed.css')
const table    = read('../../styles/player/modules/table.css')
const dictator = read('../../styles/player/panels/table-dictator.css')
const manual   = read('../../styles/player/panels/table-manual.css')
const fly      = read('./panels/flyPanelToChat.js')

const FEED_PAD   = +feed.match(/--feed-pad:\s*(\d+)px/)[1]
// Боковое поле пузыря с таблицей — второе число в padding: A B C
const TABLE_PAD  = +table.match(/\.playerMsgBubble--table \{[\s\S]*?padding:\s*\d+px (\d+)px/)[1]
const panelPad   = css => +css.match(/PanelInner \{[^}]*padding:\s*\d+px (\d+)px/)[1]

// Замеры на живом уроке (экран 393):
//   сетка в панели   16 / 361
//   сетка в сообщении 16 / 361   ← ширина и левый край совпадают до пикселя
//   края пузыря       10 / 10    ← ровно как у голосового
// Из трассы превращения: «сдвиг таблицы 0.00», «остаток после переезда 0,0»,
// «посадка → расхождение 0,0 высота 0».
describe('боковое поле чата и края таблицы', () => {
  it('поле одно на всю ленту, без порогов по ширине', () => {
    // Порог max-width:400px резал модельный ряд айфонов пополам: 393 (15/16)
    // получал узкое поле, 402 (16 Pro) — широкое
    expect(FEED_PAD).toBe(10)
    expect(feed).not.toMatch(/@media \(max-width:[^)]*\)\s*\{\s*\.playerFeedInner/)
    expect(feed).not.toMatch(/@media \(max-width:[^)]*\)\s*\{\s*\.playerWaitingRow/)
  })

  it('таблица стоит в тех же полях, что и остальные сообщения', () => {
    // Раньше она компенсировала поле наружу и упиралась в самый край экрана
    expect(table).not.toMatch(/margin-left:\s*calc\(var\(--feed-pad/)
    expect(table).toMatch(/\.playerMsgBubble--table \{[\s\S]*?width: 100%/)
  })

  it('ГЛАВНОЕ: ширина сетки в панели и в сообщении совпадает', () => {
    // Панель во всю ширину экрана, сообщение — уже на поле ленты с каждой
    // стороны. Чтобы сетка не поменяла ширину (а значит и не пересчитала
    // колонки прямо во время превращения), поле пузыря обязано быть ровно
    // на это же значение меньше поля панели.
    for (const [имя, css] of [['диктор', dictator], ['ручная', manual]]) {
      expect(panelPad(css), `${имя}: поле панели`).toBe(TABLE_PAD + FEED_PAD)
    }
  })

  it('клон возвращается по СЕТКЕ, а не по коробке', () => {
    // Коробка клона уже сузилась до пузыря. Вернуть её «туда, где стояла
    // панель» значит утащить таблицу за собой: в логе это было видно как
    // «сетка клона L=6» на первом кадре при L=16 в панели — прыжок на 10px
    // влево ровно в момент подмены. Двигать надо на расхождение СЕТОК:
    // по вертикали это высота распорки, по горизонтали — ноль
    expect(fly).toContain('const backX = gridAt.left - gridNow.left')
    expect(fly).toContain('const backY = gridAt.top - gridNow.top')
    expect(fly).not.toContain('const backX = at.left - to.left')
  })

  it('панель доигрывает свои анимации ДО снятия клона', () => {
    // Клон анимаций не наследует, а попавшие в него отменяются — то есть он
    // показывает КОНЕЧНОЕ состояние. Пока слова ответа ещё въезжали
    // (tdWordIn), панель и клон расходились: замер в кадр подмены давал
    // панель op0/серый/L416.5/рамка0.07 против клона op1/лайм/L413.9/0.22 —
    // собранный ответ вспыхивал. После правки все четыре значения совпадают.
    const head = fly.slice(0, fly.indexOf('const ghost = panelEl.cloneNode'))
    expect(head).toContain('panelEl.getAnimations({ subtree: true }).forEach')
    expect(head).toContain('a.finish()')
  })

  it('зависший полёт всё равно приземляется', () => {
    // Замечено вживую: анимация рамки остаётся running с currentTime 0 и не
    // двигается — onfinish не приходит никогда, клон висит поверх переписки
    // замороженной копией, а следующая нода не стартует (done зовётся из land)
    expect(fly).toContain('const landOnce = () =>')
    expect(fly).toContain('anim.onfinish = landOnce')
    expect(fly).toMatch(/setTimeout\(\(\) => \{[\s\S]*landOnce\(\)[\s\S]*\}, FLIGHT_MS \+ LAND_GRACE_MS\)/)
  })

  it('клон композитится с первого кадра — иначе текст перерастеризуется', () => {
    // Клон живёт несколько кадров до старта полёта: пока ищется пузырь
    // (whenSettled), он просто стоит на месте панели. Если слой появляется
    // только вместе с трансформом, весь текст в этот момент растеризуется
    // заново другим сглаживанием — заголовок таблицы и ячейки «моргают».
    // Зонд смены слоёв ловил это как единственное событие «нет → слой».
    expect(fly).toContain("ghost.style.willChange = 'transform'")
    expect(fly).toContain("ghost.style.transform  = 'translateZ(0)'")
  })

  it('клон при сужении коробки получает поле пузыря — иначе сетка ужмётся', () => {
    // Коробка клона едет с ширины панели на ширину сообщения, а внутренний
    // блок считает поля от неё. Без поправки сетка ужалась бы вместе с
    // коробкой — те самые «колонки пересчитываются весь переход»
    expect(fly).toContain("ghost.querySelector('.tdPanelInner, .tmPanelInner')")
    expect(fly).toContain('ghostInner.style.paddingLeft = cs.paddingLeft')
    expect(fly).toContain('ghostInner.style.paddingRight = cs.paddingRight')
  })

  it('индикатор «печатает» держит то же поле', () => {
    // Он лежит ВНЕ ленты и переменную не наследует — значение продублировано
    // руками, и разъехавшись, точки встанут не по одной линии с сообщениями
    expect(feed).toContain(`padding: 0 var(--feed-pad, ${FEED_PAD}px)`)
  })

  it('запасные значения переменной совпадают с базовым', () => {
    const fallbacks = [...(feed + table).matchAll(/var\(--feed-pad,\s*(\d+)px\)/g)].map(m => +m[1])
    expect(fallbacks.length).toBeGreaterThan(0)
    expect([...new Set(fallbacks)]).toEqual([FEED_PAD])
  })
})
