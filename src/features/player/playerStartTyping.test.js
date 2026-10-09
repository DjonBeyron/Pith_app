import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { FIRST_TYPING_MS } from './useGraphPlayer.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const GRAPH  = read('./useGraphPlayer.js')
const PLAYER = read('./LessonPlayer.jsx')
const STEPS  = read('./useGraphStepControls.js')

// Старт урока: лента пустая → точки «учитель печатает» ≈ 1 с → первая нода
// (любого типа) въезжает снизу со звуком — тем же путём, что и все следующие.
// Жалоба: «у кружка не вижу анимацию появления снизу» — первая нода клалась
// в visibleNodes при инициализации и для ленты (PlayerFeed: новизна строки —
// по набору элементов) была «уже существующей». Инспекторы по живому коду —
// как в соседних тестах useGraphPlayer
describe('старт урока: точки перед первой нодой', () => {
  it('точки перед первой нодой — 1 секунда, короче обычных 1,4 с', () => {
    expect(FIRST_TYPING_MS).toBe(1000)
    const typing = Number(GRAPH.match(/const TYPING_DELAY_MS = (\d+)/)[1])
    expect(FIRST_TYPING_MS).toBeLessThan(typing)
  })

  it('инициализация кладёт в ленту только историю, а entry назначает через scheduleReveal', () => {
    const init = GRAPH.slice(GRAPH.indexOf('useLayoutEffect(() => {'), GRAPH.indexOf('const requestMoreHistory'))
    expect(init).toContain('setVisibleNodes(initialPage)')
    expect(init).toContain('scheduleReveal.current(entry.id, !firstTyping, FIRST_TYPING_MS)')
    // entry больше не кладётся в ленту и не запускает таймер-триггер напрямую —
    // всё это делает revealNode, как у остальных нод
    expect(init).not.toContain('setVisibleNodes([...initialPage, entry])')
    expect(init).not.toContain('activateTimerTrigger.current(entry)')
    // История восстанавливается до первого кадра (useLayoutEffect), без анимации
    expect(init.indexOf('setVisibleNodes(initialPage)')).toBeLessThan(init.indexOf('scheduleReveal.current(entry.id'))
  })

  it('порядок показа/чекпойнт не задваивают entry: revealNode сам допишет её id', () => {
    const init = GRAPH.slice(GRAPH.indexOf('const entry = findEntry'), GRAPH.indexOf('const requestMoreHistory'))
    expect(init).toContain('visitedIdsRef.current = historyNodes.map(n => n.id)')
    expect(init).toContain('seenIdsRef.current = new Set(visitedIdsRef.current)')
    const reveal = GRAPH.slice(GRAPH.indexOf('function revealNode'), GRAPH.indexOf('scheduleReveal.current = ('))
    expect(reveal).toContain('visitedIdsRef.current = [...visitedIdsRef.current.filter(id => id !== next.id), next.id]')
    expect(reveal).toContain('seenIdsRef.current.add(next.id)')
    expect(reveal).toContain('activateTimerTrigger.current(next)')
  })

  it('scheduleReveal принимает свою длину точек и помнит её для снятия паузы', () => {
    expect(GRAPH).toContain('scheduleReveal.current = (nextNodeId, force = false, delayMs = null, hops = 0) => {')
    expect(GRAPH).toContain('const delay = delayMs ?? (isReaction ? REACTION_DELAY_MS : TYPING_DELAY_MS)')
    expect(GRAPH).toContain("scheduledRef.current = { type: 'reveal', nodeId: nextNodeId, delayMs }")
    expect(GRAPH).toContain('scheduleReveal.current(planned.nodeId, false, planned.delayMs ?? null)')
    // Та же пауза уходит и в счётчик stepTime — дебаг-тулбар «докручивает» 1 с
    const paused = GRAPH.slice(GRAPH.indexOf('if (pausedRef.current && !force) {'), GRAPH.indexOf('setPendingNode(next)'))
    expect(paused).toContain('pendingMsRef.current = delay')
  })

  it('точки идут через тот же гейт прогрева и холд XP, что и у остальных нод', () => {
    // Один путь показа: после delay — tryReveal с дедлайном WARM_MAX_MS
    expect(GRAPH).toContain('addTimer(() => tryReveal(Date.now() + WARM_MAX_MS, false), delay)')
    expect(GRAPH.match(/(?<!function )revealNode\(next\)/g).length).toBe(2) // force и tryReveal — других входов нет
  })

  it('лента: обёртка едет и без истории — первая нода выше TRAVEL въезжает на весь путь', () => {
    const feed = read('./PlayerFeed.jsx')
    // Замер на стенде: кружок 205px при TRAVEL 200 въезжал на 5px — вторая
    // фаза пути (вместе с обёрткой) пропадала, пока обёртку анимировали
    // только при существующих строках
    expect(feed).toContain('if (shiftPx > 0) {')
    expect(feed).not.toContain('if (existingRows.length && shiftPx > 0)')
  })

  it('админ: «показать сейчас» во время стартовых точек показывает первую ноду, «назад» ниже неё не откатывает', () => {
    const fn = STEPS.slice(STEPS.indexOf('const revealNow'))
    expect(fn).toContain("if (planned.type === 'reveal') {")
    expect(fn).toContain('revealNode(next)')
    expect(STEPS).toContain('if (prev.length <= 1) return null')
    expect(GRAPH).toContain('canStepBack: visibleNodes.length > 1')
  })

  it('LessonPlayer: проп startTyping → firstTyping; пустая лента на старте — не «нод нет»', () => {
    expect(PLAYER).toContain('startTyping = true,')
    expect(PLAYER).toContain('firstTyping: startTyping,')
    // Первую секунду visibleNodes пуст намеренно — заглушка только когда нет самих нод
    expect(PLAYER).toContain('{!holdForResume && nodes.length === 0 && (')
    expect(PLAYER).not.toContain('visibleNodes.length === 0 && (')
  })

  it('повторение и предпросмотр карточки — без стартовых точек (у карточки свои)', () => {
    expect(read('../review/ReviewTurn.jsx')).toContain('startTyping={false}')
    expect(read('../reviewCards/ReviewCardPreview.jsx')).toContain('startTyping={false}')
    // Обычные уроки, гонка, запуск из канваса — по умолчанию с точками
    for (const rel of ['../lessons/CurriculumView.jsx', '../lessons/StandaloneLessonRunner.jsx', '../race/RaceRunner.jsx', '../canvas/CanvasPage.jsx']) {
      expect(read(rel), rel).not.toContain('startTyping=')
    }
  })
})
