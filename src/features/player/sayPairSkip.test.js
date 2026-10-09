import { describe, it, expect, beforeEach } from 'vitest'
import { sayRevealJump, saySuccessSkip, successOf, afterSkip, incomingCount } from './sayPairSkip.js'
import { CANT_SPEAK_KEY, isCantSpeakSession, setCantSpeakSession } from '../../shared/lib/speech/cantSpeakFlag.js'

// Карта нод {id → нода}. Триггеры коротко: [если, куда]
const node = (id, type, ...trs) => ({ id, type, triggers: trs.map(([iff, then]) => ({ if: iff, then })) })
const mapOf = (...nodes) => Object.fromEntries(nodes.map(n => [n.id, n]))

// Нормальная тройка: задание t1 → модуль s → успех t2 → дальше t3
const triple = (sayTriggers = [['say_done', 't2']]) => mapOf(
  node('t0', 'text', ['timer', 't1']),
  node('t1', 'text', ['timer', 's']),
  node('s', 'say_phrase', ...sayTriggers),
  node('t2', 'text', ['timer', 't3']),
  node('t3', 'text'),
)

describe('пара сообщений вокруг say_phrase при включённом флаге «Не могу говорить»', () => {
  it('нормальная тройка: показ задания → пропуск задания, модуля и успеха, идём к узлу ПОСЛЕ успеха', () => {
    expect(sayRevealJump(triple(), 't1', true)).toEqual({ goto: 't3' })
  })

  it('флаг выключен — ничего не пропускаем (ни тройку, ни модуль)', () => {
    expect(sayRevealJump(triple(), 't1', false)).toBe(null)
    expect(sayRevealJump(triple(), 's', false)).toBe(null)
    expect(saySuccessSkip(triple(), triple().s, 'say_done', false)).toBe(null)
  })

  it('до ноды-задания не относящиеся к паре ноды показываются как обычно', () => {
    expect(sayRevealJump(triple(), 't0', true)).toBe(null)
    expect(sayRevealJump(triple(), 't3', true)).toBe(null)
    expect(sayRevealJump(triple(), 'нет-такой', true)).toBe(null)
  })

  it('say_skip соединён: приоритет у него — задание и модуль пропускаются, идём по say_skip (узла-успеха после него нет)', () => {
    const m = triple([['say_done', 't2'], ['say_skip', 'tSkip']])
    m.tSkip = node('tSkip', 'text', ['timer', 't3'])
    expect(sayRevealJump(m, 't1', true)).toEqual({ goto: 'tSkip' })
    // сам модуль, если до него дошли без задания: закрываем по say_skip
    expect(sayRevealJump(m, 's', true)).toEqual({ done: { nodeId: 's', result: 'say_skip' } })
    // успех здесь «успехом» не считается: say_done.then пропускать не нужно
    expect(successOf(m, m.s)).toBe(null)
    expect(afterSkip(m, m.s)).toBe('tSkip')
  })

  it('разветвление: у задания два выхода или на него есть другой вход — задание остаётся, пропускается только сам модуль', () => {
    const twoOut = triple()
    twoOut.t1.triggers.push({ if: 'played', then: 't3' })
    expect(sayRevealJump(twoOut, 't1', true)).toBe(null)
    const twoIn = triple()
    twoIn.t0.triggers.push({ if: 'played', then: 't1' })
    expect(incomingCount(twoIn, 't1')).toBe(2)
    expect(sayRevealJump(twoIn, 't1', true)).toBe(null)
    // но сам модуль закрывается и без задания, мимо успеха
    expect(sayRevealJump(twoIn, 's', true)).toEqual({ done: { nodeId: 's', result: 'say_done' } })
    // задание — единственный вход: допустим ноль входов (первая нода) и ровно один
    expect(incomingCount(triple(), 't0')).toBe(0)
  })

  it('успех — не обычный текст / на него есть другой вход / нет следующего: тройка не пропускается, модуль закрывается и показывает узел', () => {
    const notText = triple(); notText.t2 = node('t2', 'audio', ['played', 't3'])
    expect(sayRevealJump(notText, 't1', true)).toBe(null)
    expect(saySuccessSkip(notText, notText.s, 'say_done', true)).toBe(null)
    const shared = triple(); shared.t0.triggers.push({ if: 'played', then: 't2' })
    expect(sayRevealJump(shared, 't1', true)).toBe(null)
    expect(saySuccessSkip(shared, shared.s, 'say_done', true)).toBe(null)
    const last = triple(); last.t2 = node('t2', 'text') // нечего показывать после успеха
    expect(sayRevealJump(last, 't1', true)).toBe(null)
    expect(afterSkip(last, last.s)).toBe('t2')
  })

  it('нет сообщения-успеха (say_done ведёт на модуль/в никуда/не соединён): задание остаётся, модуль закрывается сам', () => {
    const none = triple([]) // нет ни say_done, ни say_skip
    expect(sayRevealJump(none, 't1', true)).toBe(null)
    expect(sayRevealJump(none, 's', true)).toEqual({ done: { nodeId: 's', result: 'say_done' } })
    expect(afterSkip(none, none.s)).toBe(null)
    const toSay = mapOf(node('t1', 'text', ['timer', 's']), node('s', 'say_phrase', ['say_done', 's2']), node('s2', 'say_phrase', ['say_done', 't9']), node('t9', 'text'))
    expect(sayRevealJump(toSay, 't1', true)).toBe(null)
  })

  it('задание — не текст (аудио/фото) или ведёт не в модуль: не трогаем', () => {
    const audio = triple(); audio.t1 = node('t1', 'audio', ['played', 's'])
    expect(sayRevealJump(audio, 't1', true)).toBe(null)
    const notSay = triple(); notSay.t1.triggers = [{ if: 'timer', then: 't2' }]
    expect(sayRevealJump(notSay, 't1', true)).toBe(null)
  })

  it('нажали «Я не могу говорить» в этом модуле (say_skip не соединён): вместо сообщения-успеха идём сразу дальше', () => {
    const m = triple()
    expect(saySuccessSkip(m, m.s, 'say_done', true)).toBe('t3')
    expect(saySuccessSkip(m, m.s, 'say_skip', true)).toBe(null)   // по say_skip идём как обычно
    expect(saySuccessSkip(m, m.t1, 'say_done', true)).toBe(null)  // не модуль
  })

  it('две тройки подряд: после пропуска первой следующее задание снова распознаётся', () => {
    const m = mapOf(
      node('a1', 'text', ['timer', 's1']), node('s1', 'say_phrase', ['say_done', 'a2']), node('a2', 'text', ['timer', 'b1']),
      node('b1', 'text', ['timer', 's2']), node('s2', 'say_phrase', ['say_done', 'b2']), node('b2', 'text', ['timer', 'end']),
      node('end', 'text'),
    )
    expect(sayRevealJump(m, 'a1', true)).toEqual({ goto: 'b1' })   // a1 + s1 + a2 пропущены
    expect(sayRevealJump(m, 'b1', true)).toEqual({ goto: 'end' })  // b1 + s2 + b2 пропущены
  })
})

describe('сессионный флаг «Не могу говорить» (cantSpeakFlag.js)', () => {
  beforeEach(() => {
    const store = new Map()
    globalThis.sessionStorage = {
      getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k),
    }
  })

  it('ключ общий с sayPermission; по умолчанию выключен; включается и выключается; без флага плеер ничего не пропускает', () => {
    expect(CANT_SPEAK_KEY).toBe('pithy_cant_speak_session')
    expect(isCantSpeakSession()).toBe(false)
    expect(sayRevealJump(triple(), 't1')).toBe(null)          // флаг берётся из sessionStorage
    setCantSpeakSession(true)
    expect(isCantSpeakSession()).toBe(true)
    expect(globalThis.sessionStorage.getItem('pithy_cant_speak_session')).toBe('1')
    expect(sayRevealJump(triple(), 't1')).toEqual({ goto: 't3' })
    setCantSpeakSession(false)
    expect(isCantSpeakSession()).toBe(false)
  })

  it('недоступный sessionStorage не ломает плеер', () => {
    globalThis.sessionStorage = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
    expect(isCantSpeakSession()).toBe(false)
    expect(() => setCantSpeakSession(true)).not.toThrow()
  })
})
