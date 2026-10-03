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

// Готовые вставки «Напечатай слово» для урока trying (lesson-drafts/): основной урок и тренировка.
// Файлы подкладываются в редактор через «Добавить к уроку» — тест следит, чтобы они оставались
// рабочими при любых правках легенды, линта и самого модуля.
describe.each([
  ['trying.typeWord-main.json', 2],
  ['trying.typeWord-training.json', 3],
])('вставка %s', (file, twCount) => {
  const json = load(file)

  it('читается импортом без предупреждений и проходит проверку правил урока', () => {
    const r = importLesson(json)
    expect(r.warnings).toEqual([])
    expect(r.nodes).toHaveLength(json.nodes.length)
    expect(lintLesson(json.nodes)).toEqual([])
  })

  it(`в ней ${twCount} нод type_word, у каждой есть сигналы ошибок на реальные буквы слова`, () => {
    const tws = json.nodes.filter(n => n.type === 'type_word')
    expect(tws).toHaveLength(twCount)
    for (const n of tws) {
      const slots = typeWordSlots(n.data.word).map(s => s.index)
      expect(n.data.signals?.length, `${n.ref}: нет signals`).toBeGreaterThan(0)
      for (const s of n.data.signals) {
        expect(slots, `${n.ref}: слот ${s.slot} вне слова`).toContain(s.slot)
        const target = json.nodes.find(x => x.ref === s.ref)
        expect(target, `${n.ref}: сигнал на несуществующую ноду`).toBeTruthy()
        expect(target.triggers, 'нода-сигнал — спутник, без переходов').toEqual([])
      }
      // ловушки — не буквы самого слова
      const own = new Set(wordLetters(n.data.word))
      for (const ch of cleanExtraLetters(n.data.extraLetters ?? '')) expect(own.has(ch), `${n.ref}: «${ch}» уже в слове`).toBe(false)
    }
  })

  it('перед каждой нодой type_word стоит короткая текстовая нода-пояснение', () => {
    for (const n of json.nodes.filter(x => x.type === 'type_word')) {
      const before = json.nodes.filter(x => (x.triggers ?? []).some(t => t.then === n.ref))
      expect(before.length).toBeGreaterThan(0)
      for (const b of before) expect(b.type, `${b.ref} перед ${n.ref}`).toBe('text')
    }
  })

  it('у каждой текстовой ноды базовая подложка покрывает весь текст', () => {
    for (const n of json.nodes.filter(x => x.type === 'text')) {
      const base = n.data.highlights.find(h => h.mode === 'text' && h.opacity === 0.75)
      expect(base, n.ref).toMatchObject({ start: 0, end: n.data.content.length })
    }
  })

  it('есть выход из блока: нода основного потока без перехода дальше (к ней автор подключает продолжение)', () => {
    const signalRefs = new Set(json.nodes.flatMap(n => (n.data?.signals ?? []).map(s => s.ref)))
    const exits = json.nodes.filter(n => n.type === 'text' && !signalRefs.has(n.ref) && n.triggers.every(t => !t.then))
    expect(exits.length).toBeGreaterThan(0)
  })
})
