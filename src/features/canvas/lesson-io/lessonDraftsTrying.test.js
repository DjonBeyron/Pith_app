import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { importLesson } from './importLesson.js'
import { lintLesson } from './lessonLint.js'
import { typeWordSlots } from '../../../shared/lib/signalSlots.js'
import { cleanExtraLetters, wordLetters } from '../../../shared/lib/typeWordKeys.js'

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const load = name => JSON.parse(readFileSync(
  fileURLToPath(new URL(`../../../../lesson-drafts/${name}`, import.meta.url)), 'utf8'))

// Обновлённый скрипт урока trying (lesson-drafts/trying.full.json): к присланному автором уроку
// (247 нод) добавлены 8 нод «Напечатай слово» в основной урок и в тренировку и новая колода
// карточек повтора. Файл подкладывается в редактор («Поделиться / Импорт» → «Заменить урок»);
// тест следит, чтобы он оставался рабочим при любых правках легенды, линта и модуля.
const full = load('trying.full.json')
const deckFile = load('trying.reviewCards.json')
const TASK_TYPES = ['word_choice', 'phrase_assembly', 'fill_blanks', 'type_word', 'photo_choice', 'table']
const SOUND_TYPES = ['audio', 'voice_record', 'circle', 'video', 'rotate_phone']

describe('trying.full.json — урок', () => {
  it('читается импортом без предупреждений; seq в файле совпадает с тем, что посчитает редактор', () => {
    const r = importLesson(full)
    expect(r.warnings).toEqual([])
    expect(r.nodes).toHaveLength(full.nodes.length)
    const seqAt = new Map(r.nodes.map(n => [`${n.x},${n.y}`, n.seq]))
    for (const n of full.nodes) expect(seqAt.get(`${n.pos[0]},${n.pos[1]}`), n.ref).toBe(n.seq)
  })

  it('новые ноды ничего не добавили к замечаниям проверки правил (старые замечания автора не трогаем)', () => {
    const own = new Set(full.nodes.filter(n => /^[mt]\d_/.test(n.ref)).map(n => n.ref))
    const warnings = lintLesson(full.nodes)
    expect(warnings.filter(w => [...own].some(ref => w.includes(ref)))).toEqual([])
    expect(warnings.some(w => w.includes('Недостижимо'))).toBe(false)
    expect(warnings.some(w => w.includes('replyToSeq'))).toBe(false)
  })

  it('8 нод type_word: пояснение перед каждой, сигналы на реальные буквы, ловушки — не буквы слова', () => {
    const tws = full.nodes.filter(n => n.type === 'type_word')
    expect(tws.map(n => n.data.word)).toEqual(
      expect.arrayContaining(['try', 'tries', 'tried', 'trying']))
    expect(tws).toHaveLength(8)
    for (const n of tws) {
      const before = full.nodes.filter(x => (x.triggers ?? []).some(t => t.then === n.ref))
      expect(before.length, `${n.ref}: на ноду никто не ведёт`).toBeGreaterThan(0)
      for (const b of before) expect(b.type, `${b.ref} перед ${n.ref}`).toBe('text')
      const slots = typeWordSlots(n.data.word).map(s => s.index)
      expect(n.data.signals?.length, `${n.ref}: нет signals`).toBeGreaterThan(0)
      for (const s of n.data.signals) {
        expect(slots, `${n.ref}: слот ${s.slot} вне слова`).toContain(s.slot)
        expect(full.nodes.find(x => x.ref === s.ref), `${n.ref}: сигнал в никуда`).toBeTruthy()
      }
      const own = new Set(wordLetters(n.data.word))
      for (const ch of cleanExtraLetters(n.data.extraLetters ?? '')) {
        expect(own.has(ch), `${n.ref}: «${ch}» уже в слове`).toBe(false)
      }
    }
  })

  it('перенаправленные переходы ведут в новые блоки и возвращаются в урок; старые связи целы', () => {
    const byRef = new Map(full.nodes.map(n => [n.ref, n]))
    const then = (ref, i = 0) => byRef.get(ref).triggers[i].then
    expect(then('n5')).toBe('m0_in')
    expect(then('m0_ok')).toBe('n6')
    expect(then('n48')).toBe('m1_in')
    expect(then('m1_ok')).toBe('n49')
    expect([then('n64'), then('n201'), then('n200', 1)]).toEqual(['m2_in', 'm2_in', 'm2_in'])
    expect(then('m2_ok')).toBe('n65')
    expect(then('n109')).toBe('m3_in')
    expect(then('m3_th')).toBe('n110')
    expect([then('n139'), then('n188')]).toEqual(['t2_in', 't2_in'])
    expect([then('n163'), then('n185')]).toEqual(['t4_in', 't4_in'])
    expect(then('t4_ok')).toBe('n164')
    // ветка ошибки в задании n18 и прочие старые связи не тронуты
    expect(then('n18', 1)).toBe('n211')
    expect(then('n192')).toBe('n107')
  })

  it('у каждой текстовой ноды базовая подложка, у новых нод — на весь текст', () => {
    for (const n of full.nodes.filter(x => /^[mt]\d_/.test(x.ref) && x.type === 'text')) {
      const base = n.data.highlights.find(h => h.mode === 'text' && h.opacity === 0.75)
      expect(base, n.ref).toMatchObject({ start: 0, end: n.data.content.length })
      expect(n.data.content.length, `${n.ref} длиннее 130 знаков`).toBeLessThanOrEqual(130)
    }
  })

  it('новые ноды не накладываются на старые (шаг холста как в правилах легенды)', () => {
    const ns = full.nodes
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const hit = Math.abs(ns[i].pos[0] - ns[j].pos[0]) < 296 && Math.abs(ns[i].pos[1] - ns[j].pos[1]) < 252
        expect(hit, `${ns[i].ref} и ${ns[j].ref}`).toBe(false)
      }
    }
  })
})

describe('trying — колода карточек повтора', () => {
  const cards = full.reviewCards

  it('колода лежит и в полном файле, и отдельным файлом; импорт без предупреждений', () => {
    expect(deckFile.reviewCards).toEqual(cards)
    expect(deckFile.nodes).toBeUndefined()
    const r = importLesson(deckFile)
    expect(r.warnings).toEqual([])
    expect(r.reviewCards).toHaveLength(cards.length)
  })

  it('не меньше трёх карточек, в каждой ровно одно задание, звука не больше половины', () => {
    expect(cards.length).toBeGreaterThanOrEqual(3)
    expect(cards.length).toBeLessThanOrEqual(8)
    let withSound = 0
    for (const [i, c] of cards.entries()) {
      expect(c.nodes.filter(n => TASK_TYPES.includes(n.type)), `карточка ${i + 1}`).toHaveLength(1)
      if (c.nodes.some(n => SOUND_TYPES.includes(n.type))) withSound++
    }
    expect(withSound).toBeLessThanOrEqual(cards.length / 2)
  })

  it('есть карточка «Напечатай слово», сигналы лежат в той же карточке', () => {
    const tw = cards.filter(c => c.nodes.some(n => n.type === 'type_word'))
    expect(tw.length).toBeGreaterThan(0)
    for (const c of cards) {
      for (const n of c.nodes) {
        for (const s of n.data?.signals ?? []) {
          expect(c.nodes.find(x => x.ref === s.ref), `сигнал ${s.ref} вне карточки`).toBeTruthy()
        }
      }
    }
  })

  it('карточки не повторяют задания урока: ни один ответ не совпадает с ответом задания урока', () => {
    const answerOf = n => {
      const d = n.data ?? {}
      if (n.type === 'phrase_assembly') return d.words?.join(' ')
      if (n.type === 'table') return d.answer
      if (n.type === 'type_word') return null // слово одно и то же допустимо: другой контекст
      if (n.type === 'word_choice') return d.options?.find(o => o.isCorrect)?.text
      if (n.type === 'fill_blanks') return d.template
      return null
    }
    const norm = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
    const lesson = new Set(full.nodes.map(answerOf).filter(Boolean).map(norm))
    for (const [i, c] of cards.entries()) {
      for (const n of c.nodes) {
        const a = answerOf(n)
        if (a) expect(lesson.has(norm(a)), `карточка ${i + 1} повторяет задание урока: ${a}`).toBe(false)
      }
    }
  })
})
