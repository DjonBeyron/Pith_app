import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildStages } from '../../player/modules/rotate-phone/wordLaneStages.js'
import { fixturePlan } from '../../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../../rehearsal/rehearsalPlan.js'
import { LINE_AT_MS } from '../../rehearsal/useRehearsalActs.js'
import { MIA } from './raceMia.js'
import { MIA_INTRO_MS } from '../raceStageKit.js'

// Жалоба владельца (2026-11-22, таймлайн игры v3.3.339): «перед допросом Мии игра долго молчит». Журнал: «не успел „meet“» 17:09:26.779 → стадия catch3-intro-ann 17:09:27.033 (1,7 с: ни плашки,
// ни реплики — плашку «Допрос у Мии» с v3.3.271 показывает сама церемония, пока Мия говорит за кадром) → catch3-ann 17:09:28.758 → Пит «Некоторые слова забылись…» 17:09:29.029. Итого 2,25 с тишины,
// из них 1,7 с — пустая стадия-заставка. Та же пустая заставка стояла перед церемонией экзамена (boss-intro-ann).
const stages = (() => { const p = normalizePlan({ ...fixturePlan('three'), game: 'race' }); return buildStages({ chunks: p.chunks, plan: p, rate: 1 }).stages })()
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('вход в «Допрос у Мии» и в экзамен: без молчаливой заставки', () => {
  it('от конца круга до первых слов Пита «Некоторые слова забылись…» — не больше 0,7 с (было 2,2 с)', () => {
    for (const act of ['sprint', 'catch']) {
      const i = stages.findIndex(s => s.sid === `${act}3-intro-ann`), intro = stages[i], ann = stages[i + 1]
      expect(intro).toMatchObject({ type: 'announce', mia: 'intro', line: null }); expect(ann).toMatchObject({ sid: `${act}3-ann`, mia: 'ann', line: 'pit_forgot' })
      expect(MIA.EXIT_MS + intro.ms + LINE_AT_MS).toBeLessThanOrEqual(700) // пауза после круга + заставка + реплика стадии «чуть позже её начала»
    }
  })
  it('заставка экзамена «Шкала памяти» тоже не держит сцену: сразу церемония (падение коробки, Пит, Мия)', () => {
    const i = stages.findIndex(s => s.sid === 'boss-intro-ann')
    expect(stages[i]).toMatchObject({ type: 'announce', line: null, ms: MIA_INTRO_MS }); expect(stages[i + 1]).toMatchObject({ sid: 'boss-ann', mia: 'ann', script: 'boss' })
    expect(MIA_INTRO_MS).toBe(0)
  })
  it('почему заставку можно не держать: на ней нет ни плашки, ни реплики, ни отсчёта — директор держал её ровно stage.ms', () => {
    expect(read('../useRaceActs.js')).toContain("st?.mia === 'intro' || st?.sid === 'boss-intro-ann' ? ''") // плашки на заставке нет
    expect(read('../../rehearsal/useRehearsalActs.js')).toContain('holdMs: st => (!on || (!lineOf(st) && !st?.count) ? st.ms : timingOf(st).holdMs)')
    for (const sid of ['sprint3-intro-ann', 'catch3-intro-ann', 'boss-intro-ann']) expect(stages.find(s => s.sid === sid).count).toBeFalsy()
  })
  it('стадии-заставки остались в списке на своих местах (маршрут Мии и «начать с этапа» считают от них)', () => {
    for (const act of ['sprint', 'catch']) { const i = stages.findIndex(s => s.sid === `${act}3-intro-ann`); expect(stages.slice(i, i + 4).map(s => s.sid)).toEqual([`${act}3-intro-ann`, `${act}3-ann`, `${act}3`, `${act}3-end`]) }
  })
})
