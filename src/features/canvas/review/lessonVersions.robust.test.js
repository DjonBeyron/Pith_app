import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeSnapshot, diffSnapshots, pushVersion, nodeSignature } from './lessonVersions.js'
import { recordLessonVersion } from './useLessonVersions.js'
import { importLesson } from '../lesson-io/importLesson.js'
import { fromCanvasNodes } from '../lesson-io/lessonLint.js'

// «Изменения» в разборе: розовым должно быть ТОЛЬКО реально новое или изменённое. Раньше при переимпорте урока подсвечивалось почти всё:
// подпись ноды зависела от порядка ключей (сервер хранит урок в jsonb и переставляет ключи — короткие первыми), от пустых полей и файловых
// полей, а перенесённый блок нод считался новым. Здесь сценарии на живых размерах (от 0 до 20 000 нод) — чтобы ничего не сыпалось.

// ───── Стенд ─────
const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const TYPES = ['text', 'audio', 'word_choice', 'system', 'photo']
const dataOf = (type, i) => ({
  text: { content: `Реплика ${i}: слово ${i * 7} и ещё слово`, hardWrap: false, highlights: [{ mode: 'text', color: '#c6c6c6', start: 0, end: 5, opacity: 1 }] },
  audio: { text: `Озвучка ${i}`, showText: true },
  word_choice: { options: [{ id: `o${i}a`, text: `вариант ${i} A`, isCorrect: true }, { id: `o${i}b`, text: `вариант ${i} B`, isCorrect: false }], reward: false, sendPickToChat: true },
  system: { content: `Часть ${i}` },
  photo: { imagePrompt: `кот номер ${i}`, caption: `подпись ${i}` },
}[type])
const lesson = n => Array.from({ length: n }, (_, i) => { const type = TYPES[i % TYPES.length]; return { ref: `n${i}`, seq: i + 1, type, data: dataOf(type, i) } })
const renum = nodes => nodes.map((n, i) => ({ ...n, seq: i + 1 }))

/** Как jsonb: ключи по длине, потом по алфавиту (на всех уровнях) */
const jsonbOrder = v => Array.isArray(v) ? v.map(jsonbOrder) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map(k => [k, jsonbOrder(v[k])])) : v
const reverseOrder = v => Array.isArray(v) ? v.map(reverseOrder) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, reverseOrder(v[k])])) : v
/** Шум холста: поля, которых нет в чистом импорте */
const noisy = d => ({ ...d, extra: null, tags: [], note2: '', box: {}, file_id: 'f-1', waveformData: [1, 2, 3], duration: 3.2, wordTimings: [{ w: 'a' }] })

const asServer = (nodes, p = 's') => nodes.map(n => ({ ...n, ref: p + n.ref, data: jsonbOrder(noisy(n.data)) }))
const asImport = (nodes, p = 'i') => nodes.map(n => ({ ...n, ref: p + n.ref, data: reverseOrder(n.data) }))
const snap = nodes => makeSnapshot(renum(nodes))
const orig = (marks, p) => [...marks.keys()].map(k => k.slice(p.length)).sort()
const sorted = refs => [...refs].sort()

describe('подпись ноды не зависит от порядка ключей и служебных полей', () => {
  it('тот же контент в другом порядке ключей — та же подпись', () => {
    const n = lesson(5)[0]
    expect(nodeSignature({ ...n, data: jsonbOrder(n.data) })).toBe(nodeSignature({ ...n, data: reverseOrder(n.data) }))
  })
  it('пустые значения, id и файловые поля подпись не меняют', () => {
    const n = lesson(5)[1]
    expect(nodeSignature({ ...n, data: noisy(n.data) })).toBe(nodeSignature(n))
  })
  it('изменение текста, варианта или раскраски подпись меняет', () => {
    const [t, , wc] = lesson(5)
    expect(nodeSignature({ ...t, data: { ...t.data, content: t.data.content + '!' } })).not.toBe(nodeSignature(t))
    expect(nodeSignature({ ...wc, data: { ...wc.data, options: [{ text: 'другой', isCorrect: true }] } })).not.toBe(nodeSignature(wc))
    expect(nodeSignature({ ...t, data: { ...t.data, highlights: [{ mode: 'bold', start: 0, end: 3 }] } })).not.toBe(nodeSignature(t))
    expect(nodeSignature({ ...wc, data: { ...wc.data, reward: true } })).not.toBe(nodeSignature(wc))
  })
})

describe('тот же урок после сохранения на сервер и свежего импорта — ничего не помечено', () => {
  for (const size of [1, 2, 10, 83, 309, 1500]) {
    it(`${size} нод`, () => {
      const base = lesson(size)
      expect(diffSnapshots(snap(asServer(base)), snap(asImport(base))).size).toBe(0)
    })
  }
  it('и наоборот (импорт, потом сервер)', () => {
    const base = lesson(120)
    expect(diffSnapshots(snap(asImport(base)), snap(asServer(base))).size).toBe(0)
  })
  it('живой урок «I\'m» (309 нод, файл из репозитория): через jsonb-порядок помечено 0', () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    const json = JSON.parse(readFileSync(new URL('../../../../lesson-drafts/im.json', import.meta.url), 'utf8'))
    const canvas = importLesson(json).nodes
    const server = JSON.parse(JSON.stringify(canvas.map(n => ({ ...n, typeData: jsonbOrder(n.typeData) }))))
    expect(canvas.length).toBeGreaterThan(200)
    expect(diffSnapshots(makeSnapshot(fromCanvasNodes(server)), makeSnapshot(fromCanvasNodes(canvas))).size).toBe(0)
  })
})

describe('правки: помечено ровно то, что изменилось', () => {
  const R = rng(42)
  const pick = (n, k) => { const s = new Set(); while (s.size < k) s.add(Math.floor(R() * n)); return [...s] }
  const newNode = i => ({ ref: `new${i}`, type: 'text', data: { content: `Совсем новое сообщение ${i}` } })

  for (const [size, k] of [[30, 1], [30, 5], [309, 1], [309, 10], [309, 60], [1000, 100]]) {
    it(`вставка ${k} нод в урок из ${size}: помечены только вставленные`, () => {
      const base = lesson(size)
      const at = pick(size, k).sort((a, b) => b - a)
      const cur = [...base]
      at.forEach((p, i) => cur.splice(p, 0, newNode(i)))
      const marks = diffSnapshots(snap(asServer(base)), snap(asImport(cur)))
      expect(orig(marks, 'i')).toEqual(sorted(cur.filter(n => n.ref.startsWith('new')).map(n => n.ref)))
    })
    it(`удаление ${k} нод из ${size}: ничего лишнего не помечено`, () => {
      const base = lesson(size)
      const gone = new Set(pick(size, k))
      const cur = base.filter((_, i) => !gone.has(i))
      expect(diffSnapshots(snap(asServer(base)), snap(asImport(cur))).size).toBe(0)
    })
    it(`правка текста у ${k} нод из ${size}: помечены только они (changed)`, () => {
      const base = lesson(size)
      const edited = new Set(pick(size, k))
      const cur = base.map((n, i) => (edited.has(i) ? { ...n, data: { ...n.data, ...(n.type === 'system' ? { content: n.data.content + ' (правка)' } : n.type === 'text' ? { content: n.data.content + ' (правка)' } : n.type === 'audio' ? { text: n.data.text + ' (правка)' } : n.type === 'photo' ? { caption: n.data.caption + ' (правка)' } : { reward: true }) } } : n))
      const marks = diffSnapshots(snap(asServer(base)), snap(asImport(cur)))
      expect(orig(marks, 'i')).toEqual(sorted([...edited].map(i => `n${i}`)))
      expect([...marks.values()].every(v => v === 'changed')).toBe(true)
    })
  }

  it('вставки, удаления и правки одновременно: помечены вставленные и правленые, остальные нет', () => {
    const base = lesson(309)
    const gone = new Set(pick(309, 20)), edited = new Set(pick(309, 15))
    let cur = base.filter((_, i) => !gone.has(i)).map(n => (edited.has(Number(n.ref.slice(1))) ? { ...n, data: { ...n.data, content: 'правка', text: 'правка', caption: 'правка', imagePrompt: 'правка', reward: true } } : n))
    const ins = pick(cur.length, 25).sort((a, b) => b - a)
    ins.forEach((p, i) => cur.splice(p, 0, newNode(i)))
    const marks = diffSnapshots(snap(asServer(base)), snap(asImport(cur)))
    const marked = new Set(orig(marks, 'i'))
    const allowed = new Set([...cur.filter(n => n.ref.startsWith('new')).map(n => n.ref), ...[...edited].filter(i => !gone.has(i)).map(i => `n${i}`)])
    const unchangedMarked = [...marked].filter(r => !allowed.has(r))
    expect(unchangedMarked).toEqual([])
    for (const r of allowed) expect(marked.has(r)).toBe(true)
  })
})

describe('перестановки: содержимое то же — значит не новое', () => {
  it('блок из 40 нод перенесён в другое место: ничего не помечено', () => {
    const base = lesson(309)
    const block = base.slice(100, 140)
    const cur = [...base.slice(0, 100), ...base.slice(140, 250), ...block, ...base.slice(250)]
    expect(diffSnapshots(snap(asServer(base)), snap(asImport(cur))).size).toBe(0)
  })
  it('две половины урока поменяли местами: ничего не помечено', () => {
    const base = lesson(200)
    expect(diffSnapshots(snap(asServer(base)), snap(asImport([...base.slice(100), ...base.slice(0, 100)]))).size).toBe(0)
  })
  it('порядок ветки развернули: ничего не помечено', () => {
    const base = lesson(120)
    const cur = [...base.slice(0, 40), ...base.slice(40, 80).reverse(), ...base.slice(80)]
    expect(diffSnapshots(snap(asServer(base)), snap(asImport(cur))).size).toBe(0)
  })
  it('перенесён блок и вставлено новое: помечено только новое', () => {
    const base = lesson(150)
    const cur = [...base.slice(50), ...base.slice(0, 20), { ref: 'newX', type: 'text', data: { content: 'вставка' } }, ...base.slice(20, 50)]
    const marks = diffSnapshots(snap(asServer(base)), snap(asImport(cur)))
    expect(orig(marks, 'i')).toEqual(['newX'])
  })
})

describe('размеры и крайние случаи — система не сыплется', () => {
  it('пустая предыдущая версия: все новые', () => {
    const marks = diffSnapshots([], snap(asImport(lesson(10))))
    expect(marks.size).toBe(10)
    expect([...marks.values()].every(v => v === 'new')).toBe(true)
  })
  it('пустая текущая версия: пометок нет, ошибки нет', () => {
    expect(diffSnapshots(snap(asServer(lesson(10))), []).size).toBe(0)
    expect(diffSnapshots([], []).size).toBe(0)
  })
  it('одна нода в обеих версиях', () => {
    expect(diffSnapshots(snap(asServer(lesson(1))), snap(asImport(lesson(1)))).size).toBe(0)
  })
  it('совсем другой урок: помечены все, ничего не падает', () => {
    const other = lesson(60).map(n => ({ ...n, data: { ...n.data, content: 'чужое ' + n.ref, text: 'чужое ' + n.ref, caption: 'чужое', imagePrompt: 'чужое', options: [{ text: 'чужое ' + n.ref, isCorrect: true }] } }))
    expect(diffSnapshots(snap(asServer(lesson(40))), snap(asImport(other))).size).toBe(60)
  })
  it('урок стал больше вдвое и вдвое меньше', () => {
    const base = lesson(300)
    expect(orig(diffSnapshots(snap(asServer(base)), snap(asImport([...base, ...lesson(300).map(n => ({ ...n, ref: 'b' + n.ref, data: { ...n.data, content: 'доп ' + n.ref, text: 'доп ' + n.ref, caption: 'доп ' + n.ref, imagePrompt: 'доп ' + n.ref, options: [{ text: 'доп' + n.ref, isCorrect: true }], reward: n.type === 'word_choice' ? true : undefined } }))]))), 'i')).toHaveLength(300)
    expect(diffSnapshots(snap(asServer(base)), snap(asImport(base.slice(0, 150)))).size).toBe(0)
  })
  it('много одинаковых нод («Дальше» ×50): вставка ещё одной даёт ровно одну пометку', () => {
    const dup = () => ({ type: 'system', data: { content: 'Дальше' } })
    const base = [...lesson(20), ...Array.from({ length: 50 }, (_, i) => ({ ...dup(), ref: `d${i}` })), ...lesson(20).map(n => ({ ...n, ref: 'z' + n.ref }))]
    const cur = [...base.slice(0, 40), { ...dup(), ref: 'dNew' }, ...base.slice(40)]
    expect(diffSnapshots(snap(asServer(base)), snap(asImport(cur))).size).toBe(1)
  })
  it('3000 → 3500 нод (больше предела полного выравнивания): быстро, без ложных пометок', () => {
    const base = lesson(3000)
    const cur = [...base.slice(0, 1500), ...Array.from({ length: 500 }, (_, i) => ({ ref: `new${i}`, type: 'text', data: { content: `Новое ${i}` } })), ...base.slice(1500)]
    const t0 = performance.now()
    const marks = diffSnapshots(snap(asServer(base)), snap(asImport(cur)))
    expect(performance.now() - t0).toBeLessThan(3000)
    expect(orig(marks, 'i')).toEqual(sorted(cur.filter(n => n.ref.startsWith('new')).map(n => n.ref)))
  })
  it('20 000 одинаковых по структуре нод: не падает по памяти и времени', () => {
    const base = Array.from({ length: 20000 }, (_, i) => ({ ref: `n${i}`, type: 'text', data: { content: 'одно и то же' } }))
    const t0 = performance.now()
    expect(diffSnapshots(snap(asServer(base)), snap(asImport(base))).size).toBe(0)
    expect(performance.now() - t0).toBeLessThan(4000)
  })
  it('20 000 разных нод, половина заменена: помечена ровно половина', () => {
    const base = Array.from({ length: 20000 }, (_, i) => ({ ref: `n${i}`, type: 'text', data: { content: `строка ${i}` } }))
    const cur = base.map((n, i) => (i % 2 ? { ...n, data: { content: `другая ${i}` } } : n))
    const marks = diffSnapshots(snap(asServer(base)), snap(asImport(cur)))
    expect(marks.size).toBe(10000)
  })
})

describe('те же id (правка на месте) и флаг комментариев', () => {
  it('по id: помечены правленые и новые, остальные нет', () => {
    const base = lesson(50)
    const cur = base.map((n, i) => (i === 10 ? { ...n, data: { ...n.data, content: 'правка', text: 'правка', caption: 'правка', imagePrompt: 'правка', reward: true } } : n))
    cur.splice(30, 0, { ref: 'nNew', type: 'text', data: { content: 'новая' } })
    expect(orig(diffSnapshots(snap(base), snap(cur)), '')).toEqual(['n10', 'nNew'])
  })
  it('при переимпорте комментарий в прошлой версии помечает только ноду с комментарием', () => {
    const base = lesson(40)
    const prev = makeSnapshot(renum(asServer(base)), new Set(['sn5', 'sn9']))
    expect(orig(diffSnapshots(prev, snap(asImport(base))), 'i')).toEqual(['n5', 'n9'])
  })
})

describe('стопка версий и запись вокруг импорта', () => {
  beforeEach(() => {
    const m = new Map()
    globalThis.localStorage = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }
  })
  const toCanvas = nodes => nodes.map(n => ({ id: n.ref, seq: n.seq ?? 0, type: n.type, typeData: { [n.type]: n.data }, triggers: [] }))
  const stack = () => JSON.parse(localStorage.getItem('pithy-versions:L'))

  it('версии старой схемы подписи отбрасываются: после обновления не будет «всё розовое»', () => {
    const old = [{ t: 1, h: 'x', items: [{ id: 'a', type: 'text', sig: 'старая' }] }]
    const next = pushVersion(old, snap(lesson(3)))
    expect(next).toHaveLength(1)
    expect(next[0].items).toHaveLength(3)
  })
  it('поток автора: загрузка с сервера → импорт нового файла поверх → розовое только у нового', () => {
    const v1 = lesson(80)
    recordLessonVersion('L', toCanvas(asServer(v1)))                  // серверная версия при загрузке
    recordLessonVersion('L', toCanvas(asServer(v1)))                  // холст через 1,5 с — то же
    const v2 = [...v1.slice(0, 30), { ref: 'newA', type: 'text', data: { content: 'новая А' } }, ...v1.slice(30, 60), { ref: 'newB', type: 'system', data: { content: 'новая Б' } }, ...v1.slice(60)]
    recordLessonVersion('L', toCanvas(asServer(v1)))                  // «до импорта»
    recordLessonVersion('L', toCanvas(asImport(v2)))                  // «после импорта» (свежие id и порядок ключей)
    const s = stack()
    expect(s.length).toBeGreaterThanOrEqual(2)
    const marks = diffSnapshots(s[s.length - 2].items, s[s.length - 1].items)
    expect(orig(marks, 'i')).toEqual(['newA', 'newB'])
  })
  it('второй импорт подряд (тот же файл) не меняет картину: помечено 0', () => {
    const v = lesson(60)
    recordLessonVersion('L', toCanvas(asImport(v, 'a')))
    recordLessonVersion('L', toCanvas(asImport(v, 'b')))
    const s = stack()
    expect(diffSnapshots(s[s.length - 2].items, s[s.length - 1].items).size).toBe(0)
  })
})
