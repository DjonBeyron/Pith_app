import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sayExit, successOf, incomingCount } from './sayPairSkip.js'
import { SAY_DONE, SAY_WRONG, SAY_CANT, SAY_WRONG_LEGACY, wrongTrigger } from '../../shared/lib/speech/sayTriggers.js'
import { CANT_SPEAK_KEY, isCantSpeakSession, setCantSpeakSession } from '../../shared/lib/speech/cantSpeakFlag.js'
import { sayOutcome } from '../../shared/lib/speech/sayResult.js'
import { pickStepAnswer } from './admin/stepAnswer.js'

// Карта нод {id → нода}. Триггеры коротко: [если, куда]
const node = (id, type, ...trs) => ({ id, type, triggers: trs.map(([iff, then]) => ({ if: iff, then })) })
const mapOf = (...nodes) => Object.fromEntries(nodes.map(n => [n.id, n]))

// Нормальная пара: задание t1 → модуль s → [верный] успех t2 → дальше t3;  [неверный] → w1 → t3
const pair = (sayTriggers = [['say_done', 't2'], ['say_wrong', 'w1']]) => mapOf(
  node('t0', 'text', ['timer', 't1']),
  node('t1', 'text', ['timer', 's']),
  node('s', 'say_phrase', ...sayTriggers),
  node('t2', 'text', ['timer', 't3']),
  node('w1', 'text', ['timer', 't3']),
  node('t3', 'text'),
)
const go = (m, result) => sayExit(m, m.s, result)

describe('два выхода «Сказать фразу»: верный / неверный / «Я не могу говорить» (sayExit)', () => {
  it('успех → «верный» (say_done), ничего не пропускается: сообщение-успех показывается', () => {
    expect(go(pair(), SAY_DONE)).toEqual({ then: 't2', skipped: null })
  })

  it('три неудачи → «неверный» (say_wrong), пропусков нет', () => {
    expect(go(pair(), SAY_WRONG)).toEqual({ then: 'w1', skipped: null })
  })

  it('«Я не могу говорить» → ВСЕГДА «верный», но сообщение-успех сразу после модуля пропускается: идём к узлу ПОСЛЕ него', () => {
    expect(go(pair(), SAY_CANT)).toEqual({ then: 't3', skipped: 't2' })
  })

  it('«Я не могу говорить» никогда не идёт по «неверному», даже если «верный» у модуля подключён вторым/без успеха', () => {
    const m = pair([['say_wrong', 'w1'], ['say_done', 't2']])
    expect(go(m, SAY_CANT).then).toBe('t3')
    expect(go(m, SAY_WRONG).then).toBe('w1')
  })

  it('пропуск не залипает: он целиком зависит от итога ЭТОГО закрытия — следующие закрытия (успех, неудачи) ведут как обычно, повтор «не могу» даёт то же самое', () => {
    const m = pair()
    const seq = [SAY_CANT, SAY_DONE, SAY_WRONG, SAY_DONE, SAY_CANT].map(r => go(m, r))
    expect(seq.map(x => x.then)).toEqual(['t3', 't2', 'w1', 't2', 't3'])
    expect(seq.map(x => x.skipped)).toEqual(['t2', null, null, null, 't2'])
  })

  it('не наш итог / не модуль / нет ни одного выхода → null: плеер идёт обычным путём (конец цепочки или урока)', () => {
    const m = pair()
    expect(sayExit(m, m.s, null)).toBe(null)
    expect(sayExit(m, m.s, 'word_correct')).toBe(null)
    expect(sayExit(m, m.t1, SAY_DONE)).toBe(null)
    expect(sayExit(m, undefined, SAY_DONE)).toBe(null)
    const none = pair([])
    for (const r of [SAY_DONE, SAY_WRONG, SAY_CANT]) expect(go(none, r)).toBe(null)
    const dangling = pair([['say_done', null], ['say_wrong', null]]) // выходы объявлены, но не соединены
    for (const r of [SAY_DONE, SAY_WRONG, SAY_CANT]) expect(go(dangling, r)).toBe(null)
  })
})

describe('соединён только один выход — идём по существующему', () => {
  it('только «верный»: при любом исходе урок идёт по нему; после неудач и «не могу» сообщение-успех не хвалит (пропускается)', () => {
    const m = pair([['say_done', 't2']])
    expect(go(m, SAY_DONE)).toEqual({ then: 't2', skipped: null })
    expect(go(m, SAY_WRONG)).toEqual({ then: 't3', skipped: 't2' })
    expect(go(m, SAY_CANT)).toEqual({ then: 't3', skipped: 't2' })
  })

  it('только «неверный»: идём по нему при любом исходе, ничего не пропуская', () => {
    const m = pair([['say_wrong', 'w1']])
    for (const r of [SAY_DONE, SAY_WRONG, SAY_CANT]) expect(go(m, r)).toEqual({ then: 'w1', skipped: null })
  })

  it('«верный» и «неверный» ведут в один узел: он общий (два входа) — не пропускается', () => {
    const m = pair([['say_done', 't2'], ['say_wrong', 't2']])
    expect(incomingCount(m, 't2')).toBe(2)
    for (const r of [SAY_DONE, SAY_WRONG, SAY_CANT]) expect(go(m, r)).toEqual({ then: 't2', skipped: null })
  })
})

describe('безопасность пропуска сообщения-успеха', () => {
  it('пропускается только обычная текстовая нода с одним входом (от модуля) и одним выходом дальше', () => {
    const m = pair()
    expect(successOf(m, m.s)).toEqual({ id: 't2', next: 't3' })
    const notText = pair(); notText.t2 = node('t2', 'audio', ['played', 't3'])
    expect(go(notText, SAY_CANT)).toEqual({ then: 't2', skipped: null })
    const shared = pair(); shared.t0.triggers.push({ if: 'played', then: 't2' })
    expect(go(shared, SAY_CANT)).toEqual({ then: 't2', skipped: null })
    const fork = pair(); fork.t2.triggers.push({ if: 'played', then: 'w1' })
    expect(go(fork, SAY_CANT)).toEqual({ then: 't2', skipped: null })
  })

  it('конец урока: после «верного» нечего показывать (успех — последняя нода или выход не соединён) — ничего не ломается, нода показывается как обычно', () => {
    const last = pair(); last.t2 = node('t2', 'text') // у сообщения-успеха нет следующей — пропускать нечего
    expect(go(last, SAY_CANT)).toEqual({ then: 't2', skipped: null })
    const nothing = pair([['say_wrong', 'w1']]) // «верный» не соединён, а ученик нажал «не могу»
    expect(go(nothing, SAY_CANT)).toEqual({ then: 'w1', skipped: null })
    const toMissing = pair([['say_done', 'нет-такой']]) // связь в никуда: пропускать нечего, плеер сам сообщит про «переход в никуда»
    expect(go(toMissing, SAY_CANT)).toEqual({ then: 'нет-такой', skipped: null })
  })

  it('«Получилось» после модуля — не текст, а следом сразу другой модуль: не трогаем', () => {
    const m = mapOf(node('s', 'say_phrase', ['say_done', 's2']), node('s2', 'say_phrase', ['say_done', 't9']), node('t9', 'text'))
    expect(go(m, SAY_CANT)).toEqual({ then: 's2', skipped: null })
  })
})

describe('старые уроки: второй выход назывался say_skip', () => {
  it('say_skip читается как «неверный»: три неудачи идут по нему; «не могу» по «верному» (раньше шло по say_skip)', () => {
    const old = pair([['say_done', 't2'], [SAY_WRONG_LEGACY, 'w1']])
    expect(wrongTrigger(old.s.triggers).then).toBe('w1')
    expect(go(old, SAY_WRONG)).toEqual({ then: 'w1', skipped: null })
    expect(go(old, SAY_CANT)).toEqual({ then: 't3', skipped: 't2' })
  })

  it('есть оба имени: приоритет у нового say_wrong; подключённый выигрывает у неподключённого', () => {
    const both = pair([['say_done', 't2'], [SAY_WRONG_LEGACY, 'w1'], ['say_wrong', 't3']])
    expect(go(both, SAY_WRONG).then).toBe('t3')
    const loose = pair([['say_done', 't2'], ['say_wrong', null], [SAY_WRONG_LEGACY, 'w1']])
    expect(go(loose, SAY_WRONG).then).toBe('w1')
  })

  it('старый урок с ОДНИМ выходом say_done работает как «верный» при любом исходе — без падений', () => {
    const one = pair([['say_done', 't2']])
    for (const r of [SAY_DONE, SAY_WRONG, SAY_CANT]) expect(() => go(one, r)).not.toThrow()
    expect(go(one, SAY_DONE).then).toBe('t2')
  })
})

describe('сквозной прогон по графу: разовый пропуск, без «залипания» между модулями и уроками', () => {
  // t1 → s1 → ok1 → t2 → s2 → ok2 → end;  s1.wrong → w1 → t2
  const lesson = () => mapOf(
    node('t1', 'text', ['timer', 's1']),
    node('s1', 'say_phrase', ['say_done', 'ok1'], ['say_wrong', 'w1']),
    node('ok1', 'text', ['timer', 't2']),
    node('w1', 'text', ['timer', 't2']),
    node('t2', 'text', ['timer', 's2']),
    node('s2', 'say_phrase', ['say_done', 'ok2'], ['say_wrong', 'w2']),
    node('ok2', 'text', ['timer', 'end']),
    node('w2', 'text', ['timer', 'end']),
    node('end', 'text'),
  )
  // Показанные ноды: идём по таймерам (text) и через sayExit на модулях по списку итогов
  function play(m, results) {
    const shown = []
    let id = 't1'
    const queue = [...results]
    for (let i = 0; i < 20 && id; i++) {
      const n = m[id]
      shown.push(id)
      if (n.type === 'say_phrase') { id = sayExit(m, n, queue.shift())?.then ?? null; continue }
      id = n.triggers.find(t => t.if === 'timer' && t.then)?.then ?? null
    }
    return shown
  }

  it('успех, успех: ничего не пропущено', () => {
    expect(play(lesson(), [SAY_DONE, SAY_DONE])).toEqual(['t1', 's1', 'ok1', 't2', 's2', 'ok2', 'end'])
  })

  it('«не могу» в первом модуле пропускает ровно ok1; второй модуль показывается и работает как обычно (успех → ok2 виден)', () => {
    expect(play(lesson(), [SAY_CANT, SAY_DONE])).toEqual(['t1', 's1', 't2', 's2', 'ok2', 'end'])
  })

  it('«не могу» в обоих модулях: пропущено по одному сообщению-успеху на модуль', () => {
    expect(play(lesson(), [SAY_CANT, SAY_CANT])).toEqual(['t1', 's1', 't2', 's2', 'end'])
  })

  it('три неудачи в первом (ветка «неверный»), «не могу» во втором', () => {
    expect(play(lesson(), [SAY_WRONG, SAY_CANT])).toEqual(['t1', 's1', 'w1', 't2', 's2', 'end'])
    expect(play(lesson(), [SAY_WRONG, SAY_WRONG])).toEqual(['t1', 's1', 'w1', 't2', 's2', 'w2', 'end'])
  })
})

describe('итоги панели и админский шаг', () => {
  it('панель отдаёт три итога: успех → say_done, три неудачи → say_wrong, «не могу» → say_cant (в т.ч. из запасного режима и Firefox)', () => {
    expect(sayOutcome({ kind: 'passed' }).trigger).toBe(SAY_DONE)
    expect(sayOutcome({ kind: 'solve' }).trigger).toBe(SAY_DONE)
    expect(sayOutcome({ kind: 'wrong' }).trigger).toBe(SAY_WRONG)
    expect(sayOutcome({ kind: 'skip' }).trigger).toBe(SAY_CANT)
  })

  it('шаг админа «вперёд»: «верно» → say_done, «неверно» → say_wrong; обе идут через sayExit — шаг назад забывает ключ `${nodeId}:${result}` и модуль можно пройти заново', () => {
    const n = { ...pair().s, typeData: { say_phrase: { phrase: 'Hi' } } }
    expect(pickStepAnswer(n, true).result).toBe(SAY_DONE)
    expect(pickStepAnswer(n, false).result).toBe(SAY_WRONG)
    const player = readFileSync(fileURLToPath(new URL('./useGraphPlayer.js', import.meta.url)), 'utf8')
    const back = readFileSync(fileURLToPath(new URL('./useGraphStepControls.js', import.meta.url)), 'utf8')
    expect(player).toContain('const key = `${nodeId}:${result}`')
    expect(back).toContain('key.startsWith(`${removed.id}:`) || key.startsWith(`${last.id}:`)')
  })

  it('старт урока: сессионный флаг прошлой версии сбрасывается; ни сам плеер, ни sayExit флаг не читают', () => {
    const player = readFileSync(fileURLToPath(new URL('./useGraphPlayer.js', import.meta.url)), 'utf8')
    expect(player).toMatch(/finishedRef\.current = false\n\s+setCantSpeakSession\(false\)/) // в эффекте старта урока (там же, где сбрасываются firedRef и счётчики показов)
    expect(player).not.toContain('isCantSpeakSession')
    const src = readFileSync(fileURLToPath(new URL('./sayPairSkip.js', import.meta.url)), 'utf8')
    expect(src.replace(/\/\/.*$/gm, '')).not.toMatch(/isCantSpeakSession|sessionStorage|cantSpeakFlag/)
  })
})

describe('старый сессионный флаг (cantSpeakFlag.js) — только сброс', () => {
  beforeEach(() => {
    const store = new Map()
    globalThis.sessionStorage = {
      getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k),
    }
  })

  it('ключ прежний; флаг включается и выключается (setCantSpeakSession(false) на старте урока); на sayExit он не влияет', () => {
    expect(CANT_SPEAK_KEY).toBe('pithy_cant_speak_session')
    expect(isCantSpeakSession()).toBe(false)
    setCantSpeakSession(true)
    expect(isCantSpeakSession()).toBe(true)
    expect(go(pair(), SAY_DONE)).toEqual({ then: 't2', skipped: null }) // флаг включён, а успех сообщение-успех не пропускает
    setCantSpeakSession(false)
    expect(isCantSpeakSession()).toBe(false)
  })

  it('недоступный sessionStorage не ломает плеер', () => {
    globalThis.sessionStorage = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
    expect(isCantSpeakSession()).toBe(false)
    expect(() => setCantSpeakSession(true)).not.toThrow()
    expect(() => setCantSpeakSession(false)).not.toThrow()
  })
})
