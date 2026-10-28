import { describe, it, expect } from 'vitest'
import { lintLesson } from './lessonLint.js'

const ex = (ref, seq, type, data, triggers = []) => ({ ref, seq, type, data, triggers })
const txt = (ref, seq, then) => ex(ref, seq, 'text', { content: 'Давай' }, then ? [{ if: 'timer', then }] : [])

describe('линтер: несколько верных ответов и лимит времени', () => {
  const pa = (extra = {}, triggers) => [
    txt('n1', 1, 'n2'),
    ex('n2', 2, 'phrase_assembly', { words: ['We', 'try', 'every', 'day'], distractors: [{ text: 'tried' }, { text: 'they' }], ...extra },
      triggers ?? [{ if: 'phrase_correct', then: 'n3' }, { if: 'phrase_wrong', then: 'n3' }]),
    txt('n3', 3),
  ]

  it('чистый урок с вторым верным ответом и лимитом — замечаний нет', () => {
    expect(lintLesson(pa({ answers: [['Every', 'day', 'we', 'try']], timeLimitSec: 8 }))).toEqual([])
  })

  it('ловушка из верного ответа, дубль и пустой ответ', () => {
    const w = lintLesson(pa({ answers: [['we', 'try', 'every', 'day'], [], ['Tried', 'we']] })).join('\n')
    expect(w).toMatch(/повторяется — лишний/)
    expect(w).toMatch(/пустой ответ/)
    expect(w).toMatch(/ловушка «tried» входит в один из верных ответов/)
  })

  it('лимит: вне диапазона, без соединённого выхода «неверно», у неподдерживаемого типа', () => {
    expect(lintLesson(pa({ timeLimitSec: 1 })).join('\n')).toMatch(/timeLimitSec 1 вне 3–60/)
    const noWrong = lintLesson(pa({ timeLimitSec: 8 }, [{ if: 'phrase_correct', then: 'n3' }, { if: 'phrase_wrong', then: null }])).join('\n')
    expect(noWrong).toMatch(/выход phrase_wrong не соединён/)
    const bad = [txt('n1', 1, 'n2'), ex('n2', 2, 'text', { content: 'x', timeLimitSec: 5 })].flatMap(x => x)
    expect(lintLesson(bad).join('\n')).toMatch(/поддерживают только word_choice и phrase_assembly/)
  })
})

describe('линтер: свободная фраза и сигнал у «Сказать фразу»', () => {
  const say = data => [
    txt('n1', 1, 'n2'),
    ex('n2', 2, 'say_phrase', { phrase: 'I try to relax', ...data }, [{ if: 'say_done', then: 'n3' }, { if: 'say_wrong', then: 'n3' }]),
    txt('n3', 3),
    ex('n4', 4, 'audio', { text: 'Слушай слово: {g:relax}' }),
  ]

  it('чистая нода с шаблоном и сигналом на слот 0', () => {
    expect(lintLesson(say({ pattern: 'I (try|am trying) to **', hintMismatch: 'Добавь любое слово', signals: [{ slot: 0, ref: 'n4' }] }))).toEqual([])
  })

  it('подсказка-сигнал не должна произносить всю фразу: слово можно, фразу целиком нет', () => {
    const withHint = text => [...say({ phrase: 'We will try pottery', signals: [{ slot: 0, ref: 'n4' }] }).slice(0, 3), ex('n4', 4, 'audio', { text })]
    expect(lintLesson(withHint('Гончарное дело — {g:pottery}. Слушай слово: {g:pottery}'))).toEqual([])
    expect(lintLesson(withHint('Слушай: We will try pottery!')).join('\n')).toMatch(/произносит всю фразу/)
  })

  it('битый шаблон, voiceReply у шаблона разрешён (Vosk), чужой слот и сигнал в никуда', () => {
    const w = lintLesson(say({ pattern: 'I (try', signals: [{ slot: 2, ref: 'n9' }] })).join('\n')
    expect(w).toMatch(/шаблон pattern не разобрался/)
    expect(w).toMatch(/один слот сигнала/)
    expect(w).toMatch(/несуществующую ноду n9/)
    expect(lintLesson(say({ pattern: 'I try to **', voiceReply: true })).join('\n')).not.toMatch(/voiceReply/)
  })
})

describe('линтер: R-pronoun-trap — в сборке с местоимением нужна ловушка-местоимение', () => {
  const pa = (words, distractors) => [
    txt('n1', 1, 'n2'),
    ex('n2', 2, 'phrase_assembly', { words, distractors }, [{ if: 'phrase_correct', then: 'n3' }, { if: 'phrase_wrong', then: 'n3' }]),
    txt('n3', 3),
  ]
  const hit = nodes => lintLesson(nodes).some(w => w.includes('[R-pronoun-trap]'))
  it('местоимение во фразе и ни одного местоимения среди ловушек — замечание', () => {
    expect(hit(pa(['I', 'want', 'to', 'travel'], [{ text: 'too' }, { text: 'traveling' }]))).toBe(true)
    expect(hit(pa(['We', 'try'], []))).toBe(true)
  })
  it('есть другое местоимение — чисто; местоимение, уже стоящее во фразе, ловушкой не считается', () => {
    expect(hit(pa(['I', 'want', 'to', 'travel'], [{ text: 'too' }, { text: 'we' }]))).toBe(false)
    expect(hit(pa(['I', 'want', 'to', 'travel'], [{ text: 'I' }]))).toBe(true)
  })
  it('во фразе нет местоимения (имя, существительное) — правило молчит', () => {
    expect(hit(pa(['Kate', 'tries', 'sushi'], [{ text: 'try' }]))).toBe(false)
  })
})
