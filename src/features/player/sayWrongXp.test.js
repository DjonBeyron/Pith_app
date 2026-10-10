import { describe, it, expect, vi } from 'vitest'
import { SAY_DONE, SAY_WRONG, SAY_CANT } from '../../shared/lib/speech/sayTriggers.js'
import { text, word, say, makePlayer, playLesson } from './sayCantXpModel.js'

// XP при трёх неудачах (say_wrong, ветка «неверный») = как при «Я не могу говорить» и при верном прохождении модуля (решение владельца 2026-10-10).
// Те же приёмы, что в sayCantXp.test.js: хук без React-рантайма, модель плеера на настоящих buildXpMap / sayExit / хуке / реестре.
vi.mock('react', () => ({ useState: init => [typeof init === 'function' ? init() : init], useCallback: fn => fn }))

const oneModule = () => [
  text('t0', 's'), say('s', 'ok', 'bad'), text('ok', 'w'), text('bad', 'w'), word('w', 'end'), text('end'),
]

describe('XP при трёх неудачах (say_wrong) = как при верном прохождении модуля', () => {
  it('say_wrong (три неудачи) начисляет долю модуля так же тихо: XP и звёзды как у say_done, путь — по ветке «неверный»', () => {
    const done = playLesson(oneModule(), 30, { s: SAY_DONE })
    const wrong = playLesson(oneModule(), 30, { s: SAY_WRONG })
    expect(wrong.xp).toBe(30) // 15 за модуль (тихо) + 15 за слово
    expect(wrong.xp).toBe(done.xp)
    expect(wrong.p.deltas).toEqual([15, 15])
    expect(wrong.stars).toBe(done.stars)
    expect(wrong.wrong).toBe(0) // say_wrong по-прежнему не ошибка для звёзд
    expect(wrong.shown).toEqual(['t0', 's', 'bad', 'w', 'end'])
  })

  it('say_wrong и say_cant дают одинаковый XP; reward:false — 0, как у успеха', () => {
    const cant = playLesson(oneModule(), 30, { s: SAY_CANT })
    expect(playLesson(oneModule(), 30, { s: SAY_WRONG }).xp).toBe(cant.xp)
    const nodes = [text('t0', 's'), say('s', 'ok', 'bad', { reward: false }), text('ok', 'w'), text('bad', 'w'), word('w')]
    const wrong = playLesson(nodes, 20, { s: SAY_WRONG })
    expect(wrong.xp).toBe(20)
    expect(wrong.p.deltas).toEqual([20])
  })

  it('XP начисляется в момент закрытия модуля, не на конце: чекпойнт и гостевой итог (earnedXpRef) видят его сразу', () => {
    const w = makePlayer(oneModule(), 30)
    w.sayPanel('s', SAY_WRONG)
    expect(w.earned).toBe(15)
    expect(w.deltas).toEqual([15])
  })
})

describe('say_wrong: без двойного начисления', () => {
  it('двойной onNodeDone(say_wrong) — доля ровно один раз', () => {
    const p = makePlayer(oneModule(), 30)
    p.sayPanel('s', SAY_WRONG)
    p.sayPanel('s', SAY_WRONG)
    p.sx.onNodeDone('s', SAY_WRONG, null, true)
    expect(p.deltas).toEqual([15])
    expect(p.earned).toBe(15)
    expect(p.log.moves).toHaveLength(1) // переход графа тоже один
  })

  it('say_wrong, затем say_done той же ноды (цикл сценария возвращает на модуль и ученик справился): счётчик не растёт второй раз', () => {
    const p = makePlayer(oneModule(), 30)
    p.sayPanel('s', SAY_WRONG)
    p.sayPanel('s', SAY_DONE) // панель начислила обычным путём — доля уже в счётчике
    expect(p.deltas).toEqual([15])
    expect(p.earned).toBe(15)
  })

  it('настоящий успех, затем say_wrong той же ноды: тоже не задваивается', () => {
    const p = makePlayer(oneModule(), 30)
    p.sayPanel('s', SAY_DONE)
    p.sayPanel('s', SAY_WRONG)
    expect(p.deltas).toEqual([15])
  })

  it('say_wrong, затем say_cant (и наоборот) той же ноды: доля одна', () => {
    const a = makePlayer(oneModule(), 30)
    a.sayPanel('s', SAY_WRONG); a.sayPanel('s', SAY_CANT)
    const b = makePlayer(oneModule(), 30)
    b.sayPanel('s', SAY_CANT); b.sayPanel('s', SAY_WRONG)
    expect(a.deltas).toEqual([15])
    expect(b.deltas).toEqual([15])
  })

  it('шаг назад админа после say_wrong: rollbackNode снимает долю и сбрасывает реестр — повторные три неудачи засчитываются заново, один раз', () => {
    const p = makePlayer(oneModule(), 30)
    p.sayPanel('s', SAY_WRONG)
    expect(p.earned).toBe(15)
    p.rollbackNode('s')
    expect(p.earned).toBe(0)
    p.sx.onNodeDone('s', SAY_WRONG)
    p.sx.onNodeDone('s', SAY_WRONG)
    expect(p.deltas).toEqual([15, 15]) // первое прохождение + одно новое, не три (расхождение state/ref после rollbackNode — известная мелочь режима правки, см. PROJECT.md)
  })

  it('повтор урока после say_wrong — новый плеер: реестр и счётчик свои', () => {
    const a = makePlayer(oneModule(), 30)
    a.sayPanel('s', SAY_WRONG)
    const b = makePlayer(oneModule(), 30)
    expect(b.earned).toBe(0)
    b.sayPanel('s', SAY_WRONG)
    expect(b.deltas).toEqual([15])
  })
})
