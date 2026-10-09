import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { exportLesson } from './exportLesson.js'
import { importLesson } from './importLesson.js'
import { buildLegend } from './lessonSchema.js'
import { lintLesson, fromCanvasNodes } from './lessonLint.js'
import { PRINCIPLES } from './lessonRulesDefaults.js'
import { readSayData } from '../../../shared/lib/speech/sayPhraseData.js'
import { collectLessonWords } from '../../../shared/lib/wordAudio/collectLessonWords.js'
import { makeNode } from '../nodeGraph.js'
import { makeDefaultTriggers, TYPED_PAIRS } from '../nodeDefaults.js'
import { NODE_TYPES } from '../nodeTypes.js'

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const ex = (ref, seq, type, data, triggers = []) => ({ ref, seq, type, data, triggers })

describe('say_phrase — линтер урока', () => {
  const good = [
    ex('n1', 1, 'text', { content: 'Скажем вслух' }, [{ if: 'timer', then: 'n2' }]),
    ex('n2', 2, 'say_phrase', { phrase: 'I am trying to please both', keywords: 'please', threshold: 70 }, [{ if: 'say_done', then: 'n3' }, { if: 'say_skip', then: 'n3' }]),
    ex('n3', 3, 'text', { content: 'Дальше' }, []),
  ]

  it('чистый урок: пояснение перед нодой, всё заполнено → замечаний нет', () => {
    expect(lintLesson(good)).toEqual([])
  })

  it('пустая фраза, порог вне диапазона и ключевое слово не из фразы', () => {
    const w = lintLesson([good[0], ex('n2', 2, 'say_phrase', { phrase: '', threshold: 20, keywords: 'banana' }, []), good[2]]).join('\n')
    expect(w).toMatch(/n2 say_phrase: пустая phrase/)
    expect(w).toMatch(/threshold 20 вне 50–100/)
    expect(w).toMatch(/ключевых слов нет во фразе/)
  })

  it('перевод при скрытой фразе (showPhrase=false) — предупреждение: пузыря нет, перевод не покажется', () => {
    const hidden = [good[0], ex('n2', 2, 'say_phrase', { phrase: 'I am trying to please both', translation: 'Я пытаюсь', showPhrase: false }, []), good[2]]
    expect(lintLesson(hidden).join('\n')).toMatch(/n2 say_phrase: showPhrase=false/)
    hidden[1] = ex('n2', 2, 'say_phrase', { phrase: 'I am trying to please both', showPhrase: false }, [])
    expect(lintLesson(hidden).join('\n')).not.toMatch(/showPhrase=false/)
  })

  it('нет пояснения перед нодой / две подряд / первая нода урока', () => {
    const noIntro = [ex('n1', 1, 'audio', { text: 'x' }, [{ if: 'played', then: 'n2' }]), good[1], good[2]]
    expect(lintLesson(noIntro).join('\n')).toMatch(/n2 say_phrase: перед ней нет текстовой ноды-пояснения/)
    const twice = [good[0], good[1], ex('n3', 3, 'say_phrase', { phrase: 'Hello there' }, [])]
    twice[1] = { ...good[1], triggers: [{ if: 'say_done', then: 'n3' }] }
    expect(lintLesson(twice).join('\n')).toMatch(/n3 say_phrase: идёт сразу после другой say_phrase/)
    expect(lintLesson([ex('n1', 1, 'say_phrase', { phrase: 'Hello there' }, [])]).join('\n')).toMatch(/стоит первой нодой урока/)
  })
})

describe('say_phrase — обмен JSON', () => {
  const node = () => {
    const n = makeNode(1, 0, 0, 'say_phrase')
    n.typeData.say_phrase = { ...n.typeData.say_phrase, phrase: 'I am trying to please both', translation: 'Я пытаюсь угодить обоим', keywords: 'please, both', threshold: 80, lang: 'en-GB', listenAudio: false }
    return n
  }

  it('узел есть в списке типов, у него пара триггеров say_done/say_skip', () => {
    expect(NODE_TYPES.find(t => t.value === 'say_phrase')).toMatchObject({ label: 'Сказать фразу', group: 'interactive' })
    expect(TYPED_PAIRS.say_phrase).toEqual(['say_done', 'say_skip'])
    expect(makeDefaultTriggers('say_phrase').map(t => t.if)).toEqual(['say_done', 'say_skip'])
  })

  it('экспорт → импорт: поля phrase/translation/keywords/threshold/lang/listenAudio и переходы сохраняются', () => {
    const a = node()
    const b = makeNode(2, 400, 0, 'text')
    b.typeData.text.content = 'Дальше'
    a.triggers = [{ id: 't1', if: 'say_done', then: b.id }, { id: 't2', if: 'say_skip', then: b.id }]
    const out = exportLesson([a, b], { title: 'Say' })
    const exported = out.nodes[0]
    expect(exported.type).toBe('say_phrase')
    expect(exported.data).toMatchObject({ phrase: 'I am trying to please both', translation: 'Я пытаюсь угодить обоим', keywords: 'please, both', threshold: 80, lang: 'en-GB', listenAudio: false })
    expect(exported.triggers.map(t => t.if)).toEqual(['say_done', 'say_skip'])
    const back = importLesson(JSON.parse(JSON.stringify(out)))
    const n = back.nodes.find(x => x.type === 'say_phrase')
    expect(n.typeData.say_phrase).toMatchObject({ phrase: 'I am trying to please both', keywords: 'please, both', threshold: 80, lang: 'en-GB', listenAudio: false })
    expect(n.triggers.map(t => t.if)).toEqual(['say_done', 'say_skip'])
    expect(n.triggers.every(t => t.then)).toBe(true)
    expect(back.warnings.filter(w => /неизвестный тип/.test(w))).toEqual([])
    expect(lintLesson(fromCanvasNodes(back.nodes)).filter(w => /say_phrase.*(пуст|threshold|ключев)/.test(w))).toEqual([])
  })

  it('showPhrase=false и strict=true: поля сохраняются туда и обратно; отсутствие полей = showPhrase true / strict false', () => {
    const a = makeNode(1, 0, 0, 'say_phrase')
    a.typeData.say_phrase = { ...a.typeData.say_phrase, phrase: "I'm trying to please both", showPhrase: false, strict: true }
    const out = exportLesson([a], { title: 'Say' })
    expect(out.nodes[0].data).toMatchObject({ showPhrase: false, strict: true })
    const back = importLesson(JSON.parse(JSON.stringify(out))).nodes[0].typeData.say_phrase
    expect(back).toMatchObject({ showPhrase: false, strict: true })
    expect(readSayData(back)).toMatchObject({ showPhrase: false, strict: true, threshold: 100 })
    const plain = makeNode(2, 0, 0, 'say_phrase')
    plain.typeData.say_phrase.phrase = 'Hello there'
    const p = importLesson(JSON.parse(JSON.stringify(exportLesson([plain], { title: 'Say' })))).nodes[0].typeData.say_phrase
    expect(readSayData(p)).toMatchObject({ showPhrase: true, strict: false })
  })

  it('легенда описывает тип, поля и триггеры; правило автора про say_phrase есть в зашитых принципах', () => {
    const legend = buildLegend()
    expect(Object.keys(legend.nodes.say_phrase.fields)).toEqual(expect.arrayContaining(['phrase', 'translation', 'keywords', 'threshold', 'lang', 'listenAudio', 'showPhrase', 'strict']))
    expect(Object.keys(legend.triggers)).toEqual(expect.arrayContaining(['say_done', 'say_skip']))
    expect(PRINCIPLES.some(p => p.startsWith('say_phrase («Сказать фразу»)'))).toBe(true)
  })
})

describe('say_phrase — слова для озвучки (collectLessonWords)', () => {
  const nodes = on => [{ type: 'say_phrase', typeData: { say_phrase: { phrase: "I'm here, please.", ...(on ? {} : { listenAudio: false }) } } }]

  it('фраза целиком (если чистая латиница) и каждое слово — для прогрева и списка «нужна озвучка»', () => {
    const keys = [...collectLessonWords([{ type: 'say_phrase', typeData: { say_phrase: { phrase: 'I am here' } } }]).keys()]
    expect(keys).toEqual(expect.arrayContaining(['i am here', 'i', 'am', 'here']))
    expect([...collectLessonWords(nodes(true)).keys()]).toEqual(expect.arrayContaining(["i'm", 'here', 'please']))
  })

  it('listenAudio=false — слов нет', () => {
    expect(collectLessonWords(nodes(false)).size).toBe(0)
  })
})

describe('say_phrase — миграция правила автору', () => {
  it('текст правила в миграции дословно равен зашитому принципу (БД и код не расходятся)', () => {
    const sql = readFileSync(fileURLToPath(new URL('../../../../supabase/migrations/20261009110000_say_phrase_module.sql', import.meta.url)), 'utf8')
    const rule = PRINCIPLES.find(p => p.startsWith('say_phrase («Сказать фразу»)'))
    expect(rule).toBeTruthy()
    expect(sql).toContain(`'${rule.replace(/'/g, "''")}'`)
    expect(sql).toMatch(/where not exists/) // идемпотентно
    expect(sql).not.toMatch(/\b(create|alter|drop)\s+(table|policy|function)/i) // таблиц и политик не трогаем
  })
})
