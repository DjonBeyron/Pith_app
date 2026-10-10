import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { exportLesson } from './exportLesson.js'
import { importLesson } from './importLesson.js'
import { buildLegend } from './lessonSchema.js'
import { lintLesson, fromCanvasNodes } from './lessonLint.js'
import { PRINCIPLES } from './lessonRulesDefaults.js'
import { readSayData } from '../../../shared/lib/speech/sayPhraseData.js'
import { makeNode } from '../nodeGraph.js'

// Режим ответа ученика «Голосовое с текстом» (voiceReply): поле ноды say_phrase, JSON туда-обратно, обратная совместимость, линтер,
// легенда, правило автору и миграция v5 (текст в $rule$ дословно равен зашитому принципу).
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const ex = (ref, seq, type, data, triggers = []) => ({ ref, seq, type, data, triggers })
const rule = () => PRINCIPLES.find(p => p.startsWith('say_phrase («Сказать фразу»)'))

describe('say_phrase — voiceReply (голосовое с текстом)', () => {
  const sayNode = extra => {
    const n = makeNode(1, 0, 0, 'say_phrase')
    n.typeData.say_phrase = { ...n.typeData.say_phrase, phrase: 'I am trying to please both', ...extra }
    return n
  }

  it('обратная совместимость: нет поля / мусор = «Текст» (false); только true включает режим', () => {
    expect(readSayData({ phrase: 'x' }).voiceReply).toBe(false)
    expect(readSayData(undefined).voiceReply).toBe(false)
    for (const v of [false, 0, '', 'true', 1, null]) expect(readSayData({ voiceReply: v }).voiceReply, String(v)).toBe(false)
    expect(readSayData({ voiceReply: true }).voiceReply).toBe(true)
    expect(makeNode(1, 0, 0, 'say_phrase').typeData.say_phrase.voiceReply).toBeUndefined() // у новой ноды поля нет — режим «Текст»
  })

  it('voiceReply идёт туда и обратно через JSON, дубликат ноды его не теряет', () => {
    const out = exportLesson([sayNode({ voiceReply: true })], { title: 'Say' })
    expect(out.nodes[0].data.voiceReply).toBe(true)
    const back = importLesson(JSON.parse(JSON.stringify(out))).nodes[0].typeData.say_phrase
    expect(back.voiceReply).toBe(true)
    expect(readSayData(back).voiceReply).toBe(true)
    const copy = JSON.parse(JSON.stringify(sayNode({ voiceReply: true }).typeData))
    expect(copy.say_phrase.voiceReply).toBe(true)
  })

  it('старый урок без поля импортируется как «Текст»', () => {
    const out = exportLesson([sayNode({})], { title: 'Say' })
    expect(out.nodes[0].data).not.toHaveProperty('voiceReply')
    const back = importLesson(JSON.parse(JSON.stringify(out))).nodes[0].typeData.say_phrase
    expect(readSayData(back).voiceReply).toBe(false)
  })

  it('линтер не ругается на voiceReply (ни true, ни false)', () => {
    const task = ex('n1', 1, 'text', { content: 'Скажите: I am trying to please both' }, [{ if: 'next', then: 'n2' }])
    const done = ex('n3', 3, 'text', { content: 'Получилось!' })
    for (const v of [true, false]) {
      const say = ex('n2', 2, 'say_phrase', { phrase: 'I am trying to please both', voiceReply: v }, [{ if: 'say_done', then: 'n3' }, { if: 'say_wrong', then: 'n3' }])
      const w = lintLesson([task, say, done]).filter(x => /say_phrase|voiceReply/.test(x))
      expect(w, String(v)).toEqual([])
    }
    expect(lintLesson(fromCanvasNodes([sayNode({ voiceReply: true })])).join('\n')).not.toMatch(/voiceReply/)
  })

  it('легенда и правило автору описывают voiceReply: нет поля = текст, нужен Vosk', () => {
    const f = buildLegend().nodes.say_phrase.fields
    expect(Object.keys(f)).toContain('voiceReply')
    expect(f.voiceReply).toMatch(/Vosk/)
    expect(f.voiceReply).toMatch(/Нет поля = false = только текст/)
    for (const w of ['voiceReply: true', 'голосовым сообщением', 'нет поля = только текст', 'Vosk']) expect(rule(), w).toContain(w)
  })

  it('миграция v5 (текущая): текст правила дословно равен PRINCIPLES (одна копия в $rule$); update по префиксу, вставка, если строки нет; идемпотентно', () => {
    const v5 = read('../../../../supabase/migrations/20261011100000_say_phrase_rules_v5.sql')
    expect(rule()).not.toContain('$rule$')
    expect(v5.split(`$rule$${rule()}$rule$`)).toHaveLength(2)
    expect(v5).toMatch(/update public\.lesson_rules\s+set rule_text = t\s+where rule_text like 'say_phrase \(«Сказать фразу»\) — ученик ПРОИЗНОСИТ%'/)
    expect(v5).toMatch(/if not found then\s+insert into public\.lesson_rules \(rule_text, sort_order, category\) values \(t, 250, 'principle'\)/)
    expect(v5).not.toMatch(/\b(create|alter|drop)\s+(table|policy|function)/i)
    expect(v5.split('\n').length).toBeLessThan(90)
  })
})
