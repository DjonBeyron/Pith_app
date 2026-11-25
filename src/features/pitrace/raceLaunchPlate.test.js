import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { wordAtMs, hasWord } from './raceLineWord.js'
import { openingPlan, LAUNCH_WORD, MORPH_MS } from './raceOpening.js'
import { chargePlan } from './raceCharge.js'
import { RACE_LINES } from './raceLines.js'
import { RACE_START_LEAD_MS } from './raceStartTrace.js'
import { buildRaceActs } from './raceRecipe.js'
import { revealAtMs } from './boss/bossScale.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { extrasOf } from './raceWords.js'

// Комментарий владельца 2026-11-25 (журнал игры v3.3.365): «В начале переделаем, Пит будет говорить: встряхнём память, я говорю слова, а ты переводишь вслух, запускаю конвейер слов
// (и на словах «запускаю» появляется через анимацию плашка (конвейер слов))». Раньше плашка этапа выскакивала сразу с началом стартовой фразы (plateAt = 0).
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const mk = (extra = {}) => { const p = normalizePlan({ ...fixturePlan('three'), game: 'race', ...extra }); return { ...p, extraWords: extrasOf(p) } }
const text = id => RACE_LINES.find(l => l.id === id).text
const voiced = (id, o = {}) => ({ [id]: { text: text(id), url: 'u', duration: 6, ...o } })

describe('момент слова в реплике (raceLineWord.wordAtMs)', () => {
  const line = { text: 'раз два запускаю три', duration: 4, words: [{ w: 'раз', t: 0.1, e: 0.5 }, { w: 'два', t: 0.8, e: 1.2 }, { w: 'Запускаю,', t: 3, e: 3.6 }, { w: 'три', t: 3.7, e: 3.9 }] }
  it('есть тайминги слов записи — момент начала слова в файле, пересчитанный на реальную длину звука (скорость голоса)', () => {
    expect(wordAtMs(line, 4000, 'запуска')).toBe(3000)
    expect(wordAtMs(line, 2000, 'запуска')).toBe(1500) // звук вдвое короче файла (скорость голоса ×2) — доля та же
  })
  it('таймингов нет — по месту слова в тексте; слова нет — запасная доля; «ё» и регистр не мешают', () => {
    const t = { text: line.text }
    expect(wordAtMs(t, 2000, 'запуска')).toBe(Math.round((2000 * t.text.indexOf('запуска')) / t.text.length))
    expect(wordAtMs(t, 2000, 'нет такого', 0.25)).toBe(500); expect(wordAtMs(null, 2000, 'запуска')).toBe(1000)
    expect(wordAtMs({ text: 'Встряхнём память' }, 1000, 'встряхнем')).toBe(0)
    expect(hasWord(line, 'запуска')).toBe(true); expect(hasWord({ text: 'Три заезда' }, 'запуска')).toBe(false); expect(hasWord(null, 'запуска')).toBe(false)
  })
  it('тот же расчёт, что у шкалы экзамена на слове «шкала» (boss/bossScale.revealAtMs) — две копии одного подхода, их стоит объединить', () => {
    const look = { text: 'это экзамен, шкала покажет', duration: 5, words: [{ w: 'это', t: 0.2 }, { w: 'экзамен', t: 0.9 }, { w: 'шкала', t: 2.5 }, { w: 'покажет', t: 3.1 }] }
    expect(wordAtMs(look, 5200, 'шкал')).toBe(revealAtMs(look, 5200))
    expect(wordAtMs({ text: look.text }, 5200, 'шкал')).toBe(revealAtMs({ text: look.text }, 5200))
  })
})

describe('старт игры: плашка «Конвейер слов» — на слове «запускаю»', () => {
  it('тексты: обе стартовые фразы кончаются «…запускаю конвейер слов» (режим «Пальцами» — решение по аналогии), слово в них есть', () => {
    expect(text('race_start')).toBe('Встряхнём память, я говорю слова, а ты переводишь вслух, запускаю конвейер слов')
    expect(text('race_start_tap')).toBe('Встряхнём память, я говорю слова, а ты ловишь перевод, запускаю конвейер слов')
    for (const id of ['race_start', 'race_start_tap']) expect(hasWord({ text: text(id) }, LAUNCH_WORD)).toBe(true)
    expect(buildRaceActs(mk(), false).acts[0].title).toBe('Конвейер слов')
  })
  it('есть тайминги слов записи: плашка — ровно на слове, до него плашки нет; бар заряжен к этому же моменту (слова летят до него)', () => {
    const words = [{ w: 'Встряхнём', t: 0.1 }, { w: 'память', t: 0.7 }, { w: 'запускаю', t: 4.2 }, { w: 'конвейер', t: 4.9 }, { w: 'слов', t: 5.5 }]
    const o = openingPlan(mk(), voiced('race_start', { words }), 1, false)
    expect(o.startMs).toBe(6000); expect(o.plateAt).toBe(RACE_START_LEAD_MS + 4200); expect(o.plateAt).toBeGreaterThan(3000)
    expect(o.morphAt).toBe(o.plateAt); expect(o.plateEnd).toBe(o.countAt); expect(o.plateEnd).toBeGreaterThan(o.speechEnd) // плашка стоит до первой ноты, как раньше
    const c = chargePlan(mk(), o.morphAt); expect(c.pills.at(-1).arriveAt).toBe(o.plateAt) // последнее слово долетает в бар на «запускаю»
  })
  it('заменили озвучку (другие тайминги) — срок едет за словом, а не за числом; скорость голоса учитывается', () => {
    const a = openingPlan(mk(), voiced('race_start', { words: [{ w: 'запускаю', t: 3 }] }), 1, false), b = openingPlan(mk(), voiced('race_start', { duration: 8, words: [{ w: 'запускаю', t: 6 }] }), 1, false)
    expect(a.plateAt).toBe(3000); expect(b.plateAt).toBe(6000)
    const fast = openingPlan(mk(), voiced('race_start', { words: [{ w: 'запускаю', t: 3 }] }), 1.5, false)
    expect(fast.plateAt / fast.startMs).toBeCloseTo(0.5, 2)
  })
  it('таймингов слов нет — по месту слова в тексте (≈ 70 % фразы); режим «Пальцами» — так же', () => {
    for (const [id, tap] of [['race_start', false], ['race_start_tap', true]]) {
      const o = openingPlan(mk(), voiced(id), 1, tap), share = text(id).toLowerCase().indexOf(LAUNCH_WORD) / text(id).length
      expect(o.plateAt).toBe(RACE_START_LEAD_MS + Math.round(6000 * share)); expect(share).toBeGreaterThan(0.6); expect(share).toBeLessThan(0.8)
      expect(o.morphAt).toBe(o.plateAt); expect(o.plateAt).toBeLessThan(o.speechEnd - MORPH_MS)
    }
  })
  it('в реплике нет слова «запускаю» (текст правили в админке) — как раньше: плашка с началом речи, бар полон за 600 мс до её конца', () => {
    const o = openingPlan(mk(), { race_start: { text: 'Три заезда', url: 'u', duration: 5 } }, 1, false)
    expect(o.plateAt).toBe(RACE_START_LEAD_MS); expect(o.morphAt).toBe(o.speechEnd - MORPH_MS)
  })
  it('одиночный раунд без стартовой фразы — без изменений; показ плашки ведёт plateAt (RaceChargeRun)', () => {
    const rev = { text: 'теперь наоборот, запускаю', url: 'u', duration: 4 }, o = openingPlan(mk({ round: 'catch' }), { race_reverse: rev, race_reverse_tap: rev, pit_back_2: rev }, 1)
    expect(o.firstMs).toBe(4000); expect(o.startMs).toBe(0)
    expect(o.plateAt).toBe(RACE_START_LEAD_MS)
    expect(read('./RaceChargeRun.jsx')).toContain('at(o.plateAt ?? o.morphAt, () => setShown(true))'); expect(read('./RaceChargeRun.jsx')).toContain('{plate && shown && <RaceChargePlate')
  })
})
