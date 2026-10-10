import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createXpLedger } from './xpLedger.js'
import { SAY_DONE, SAY_WRONG, SAY_CANT } from '../../shared/lib/speech/sayTriggers.js'
import { text, word, say, makePlayer, playLesson } from './sayCantXpModel.js'

// Хук без React-рантайма: useState отдаёт значение, useCallback — саму функцию (тот же приём, что в useGraphStepControls.test.js)
vi.mock('react', () => ({ useState: init => [typeof init === 'function' ? init() : init], useCallback: fn => fn }))
const { useSayCantXp } = await import('./useSayCantXp.js')

// Задание → модуль → [верный] успех → слово → конец;  [неверный] → разбор → слово
const oneModule = () => [
  text('t0', 's'), say('s', 'ok', 'bad'), text('ok', 'w'), text('bad', 'w'), word('w', 'end'), text('end'),
]

describe('XP при «Я не могу говорить» = как при верном прохождении модуля', () => {
  it('один модуль: say_cant даёт те же XP, звёзды и показанный путь без сообщения-успеха, что и say_done', () => {
    const done = playLesson(oneModule(), 30, { s: SAY_DONE })
    const cant = playLesson(oneModule(), 30, { s: SAY_CANT })
    expect(done.xp).toBe(30) // 15 за модуль + 15 за слово — весь XP урока
    expect(cant.xp).toBe(done.xp)
    expect(cant.stars).toBe(done.stars)
    expect(cant.wrong).toBe(done.wrong)
    expect(done.shown).toEqual(['t0', 's', 'ok', 'w', 'end'])
    expect(cant.shown).toEqual(['t0', 's', 'w', 'end']) // сообщение-успех пропущено (оно XP не давало)
  })

  it('say_wrong (три неудачи) не получает компенсации: XP как и раньше только за остальные ноды', () => {
    const wrong = playLesson(oneModule(), 30, { s: SAY_WRONG })
    expect(wrong.xp).toBe(15)
    expect(wrong.p.deltas).toEqual([15])
    expect(wrong.shown).toEqual(['t0', 's', 'bad', 'w', 'end'])
  })

  it('XP начисляется в момент закрытия модуля, не на конце: чекпойнт и гостевой итог (earnedXpRef) видят его сразу', () => {
    const p = makePlayer(oneModule(), 30)
    p.sayPanel('s', SAY_CANT)
    expect(p.earned).toBe(15)
    expect(p.deltas).toEqual([15])
  })

  it('делится XP урока с остатком: доля ноды та же, что у успеха (xpMap)', () => {
    // 3 наградные ноды, 10 XP → 4/3/3; модуль — первая наградная (4)
    const nodes = [text('t0', 's'), say('s', 'ok'), text('ok', 'w1'), word('w1', 'w2'), word('w2', 'end'), text('end')]
    const done = playLesson(nodes, 10, { s: SAY_DONE })
    const cant = playLesson(nodes, 10, { s: SAY_CANT })
    expect(cant.p.xpMap.get('s')).toBe(4)
    expect(cant.xp).toBe(done.xp)
    expect(cant.xp).toBe(10)
  })

  it('два модуля подряд: первый скипнут, второй пройден — итог как при двух успехах', () => {
    const nodes = [
      text('t0', 's1'), say('s1', 'ok1'), text('ok1', 's2'), say('s2', 'ok2'), text('ok2', 'w'), word('w', 'end'), text('end'),
    ]
    const base = playLesson(nodes, 30, { s1: SAY_DONE, s2: SAY_DONE })
    const mix = playLesson(nodes, 30, { s1: SAY_CANT, s2: SAY_DONE })
    const rev = playLesson(nodes, 30, { s1: SAY_DONE, s2: SAY_CANT })
    const both = playLesson(nodes, 30, { s1: SAY_CANT, s2: SAY_CANT })
    for (const r of [mix, rev, both]) expect(r.xp).toBe(base.xp)
    expect(base.xp).toBe(30)
    expect(mix.p.deltas).toEqual([10, 10, 10]) // компенсация первого — сразу, остальное как обычно
  })

  it('последний модуль урока скипнут (после него ничего нет): XP всё равно засчитан до конца урока', () => {
    const nodes = [text('t0', 'w'), word('w', 's'), say('s')]
    const end = playLesson(nodes, 20, { s: SAY_CANT })
    expect(end.xp).toBe(20)
    expect(end.p.log.moves).toEqual([]) // выходов нет — плеер идёт к финишу урока
    expect(end.xp).toBe(playLesson(nodes, 20, { s: SAY_DONE }).xp)
  })

  it('модуль без «Получить награду» (reward:false): say_cant XP не добавляет — как и успех', () => {
    const nodes = [text('t0', 's'), say('s', 'ok', null, { reward: false }), text('ok', 'w'), word('w')]
    const cant = playLesson(nodes, 20, { s: SAY_CANT })
    expect(cant.p.xpMap.has('s')).toBe(false)
    expect(cant.xp).toBe(20) // весь XP урока достаётся слову, лишнего не добавлено
    expect(cant.p.deltas).toEqual([20])
  })

  it('урок без say_phrase не затронут: итоги не меняются, вызовы уходят графу как есть', () => {
    const nodes = [text('t0', 'w1'), word('w1', 'w2'), word('w2', 'end'), text('end')]
    const r = playLesson(nodes, 20, {})
    expect(r.xp).toBe(20)
    expect(r.p.deltas).toEqual([10, 10])
    const seen = []
    const sx = useSayCantXp({ onNodeDone: (...a) => { seen.push(a); return 'r' }, xpMap: new Map([['w1', 10]]), earnedXpRef: { current: 0 }, setEarnedXp: () => {} })
    expect(sx.onNodeDone('w1', 'word_correct', 'v1', true)).toBe('r')
    expect(seen).toEqual([['w1', 'word_correct', 'v1', true]])
  })
})

describe('без двойного начисления', () => {
  it('двойной onNodeDone(say_cant) по той же ноде (двойной тап, повторный вызов) — доля ровно один раз', () => {
    const p = makePlayer(oneModule(), 30)
    p.sayPanel('s', SAY_CANT)
    p.sayPanel('s', SAY_CANT)
    p.sx.onNodeDone('s', SAY_CANT, null, true)
    expect(p.deltas).toEqual([15])
    expect(p.earned).toBe(15)
    expect(p.log.moves).toHaveLength(1) // переход графа тоже один (дедуп firedRef)
  })

  it('say_cant, затем настоящий успех той же ноды (цикл сценария): счётчик не растёт второй раз', () => {
    const p = makePlayer(oneModule(), 30)
    p.sayPanel('s', SAY_CANT)
    p.sayPanel('s', SAY_DONE) // панель начислила обычным путём — доля уже в счётчике
    expect(p.deltas).toEqual([15])
    expect(p.earned).toBe(15)
  })

  it('настоящий успех, затем say_cant той же ноды: тоже не задваивается', () => {
    const p = makePlayer(oneModule(), 30)
    p.sayPanel('s', SAY_DONE)
    p.sayPanel('s', SAY_CANT)
    expect(p.deltas).toEqual([15])
  })

  it('шаг назад админа: rollbackNode снимает долю и сбрасывает реестр — повторный say_cant засчитывается один раз заново', () => {
    const p = makePlayer(oneModule(), 30)
    p.sayPanel('s', SAY_CANT)
    expect(p.earned).toBe(15)
    p.rollbackNode('s')
    expect(p.earned).toBe(0)
    p.sx.onNodeDone('s', SAY_CANT) // снова «не могу» на той же ноде (дедуп графа сбросил stepBack — здесь важен только реестр)
    p.sx.onNodeDone('s', SAY_CANT)
    expect(p.deltas).toEqual([15, 15]) // первое прохождение + одно новое, не три
  })

  it('say_wrong не помечает ноду: последующий say_cant получит свою долю, а say_wrong сам XP не даёт', () => {
    const p = makePlayer(oneModule(), 30)
    p.sayPanel('s', SAY_WRONG)
    expect(p.deltas).toEqual([])
    p.sayPanel('s', SAY_CANT)
    expect(p.deltas).toEqual([15])
  })

  it('повтор урока — новый плеер: реестр и счётчик свои, ничего не переносится', () => {
    const a = makePlayer(oneModule(), 30)
    a.sayPanel('s', SAY_CANT)
    const b = makePlayer(oneModule(), 30)
    expect(b.earned).toBe(0)
    b.sayPanel('s', SAY_CANT)
    expect(b.deltas).toEqual([15])
  })
})

describe('реестр xpLedger', () => {
  it('quiet: один раз на ноду, ноль/без id/уже засчитанное — 0', () => {
    const l = createXpLedger()
    expect(l.quiet('a', 5)).toBe(5)
    expect(l.quiet('a', 5)).toBe(0)
    expect(l.quiet('b', 0)).toBe(0)
    expect(l.quiet(null, 5)).toBe(0)
    expect(l.has('b')).toBe(false)
  })

  it('real: после тихого — 0, иначе полная сумма; повторное настоящее — как раньше (полная сумма)', () => {
    const l = createXpLedger()
    expect(l.real('a', 5)).toBe(5)
    expect(l.real('a', 5)).toBe(5)
    expect(l.quiet('a', 5)).toBe(0)
    const m = createXpLedger()
    m.quiet('x', 5)
    expect(m.real('x', 5)).toBe(0)
    expect(m.real(null, 5)).toBe(5) // без id ноды — как раньше
  })

  it('revoke возвращает ноду в «не засчитана»', () => {
    const l = createXpLedger()
    l.quiet('a', 5)
    l.revoke('a')
    expect(l.quiet('a', 5)).toBe(5)
  })
})

describe('подключение в LessonPlayer.jsx', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url))
  const read = p => readFileSync(dir + p, 'utf8').replace(/\r\n/g, '\n')
  const player = read('LessonPlayer.jsx')

  it('onNodeDone, который получают панели/лента/мгновенные ноды, — обёртка useSayCantXp, а не голый граф', () => {
    expect(player).toContain("import { useSayCantXp } from './useSayCantXp.js'")
    expect(player).toContain('onNodeDone: graphNodeDone')
    expect(player).toContain('useSayCantXp({ onNodeDone: graphNodeDone, xpMap, earnedXpRef, setEarnedXp })')
  })

  it('настоящее начисление учитывается в реестре, шаг назад — снимает отметку', () => {
    const xpFn = player.slice(player.indexOf('function handleXpEarned'), player.indexOf('function dismissXpEvent'))
    expect(xpFn).toContain('creditXp(nodeId, amount)')
    expect(xpFn).toContain('setEarnedXp(prev =>')
    const back = player.slice(player.indexOf('function rollbackNode'), player.indexOf('const { forgetPaused }'))
    expect(back).toContain('revokeXp(nodeId)')
  })

  it('сам хук ловит только итог say_cant и берёт долю из xpMap', () => {
    const hook = read('useSayCantXp.js')
    expect(hook).toContain('result === SAY_CANT')
    expect(hook).toContain('xpMap.get(nodeId)')
    expect(hook).not.toContain('SAY_WRONG')
  })
})
