import { describe, it, expect } from 'vitest'
import { stageInfo, stageTitle, actTitle, STAGE_NAMES, ACT_NAMES } from './timelineStageNames.js'
import { buildRaceStages } from '../pitrace/raceStages.js'
import { RACE_ROUNDS, STAGES_ROUND } from '../pitrace/raceOnly.js'
import { fixturePlan, FIXTURE_IDS } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const stagesOf = (fixture, round, tap, ru) => buildRaceStages({ plan: normalizePlan({ ...fixturePlan(fixture), source: 'sim', game: 'race', ...(round ? { round } : {}) }), tap, ru }).stages

describe('названия стадий для админа (sid → название)', () => {
  it('каждая стадия, которую строит buildRaceStages (полная гонка, режимы stages / pingpong, одиночные раунды; голос и тап, с русской моделью и без), получает название, не равное её sid', () => {
    const seen = new Set()
    for (const fixture of FIXTURE_IDS) for (const round of [undefined, STAGES_ROUND, ...RACE_ROUNDS]) for (const tap of [false, true]) for (const ru of [true, false]) {
      for (const s of stagesOf(fixture, round, tap, ru)) {
        seen.add(s.sid)
        const info = stageInfo(s.sid)
        expect(info, `нет названия у стадии ${s.sid} (${round ?? 'вся гонка'}, tap=${tap}, ru=${ru})`).not.toBeNull()
        expect(info.name).not.toBe(s.sid); expect(info.name.length).toBeGreaterThan(3); expect(stageTitle(s)).toBe(info.name)
        expect(ACT_NAMES[s.act], `нет названия у этапа ${s.act}`).toBeTruthy()
      }
    }
    for (const sid of ['sprint-ann', 'sprint', 'sprint3-intro-ann', 'sprint3-ann', 'sprint3', 'sprint3-end', 'catch-rev', 'catch-sw', 'catch-ann', 'catch', 'catch3', 'phrases-sw', 'phrases1', 'phrases2', 'climb-1', 'climb-top', 'descent-s', 'boss-intro-ann', 'boss', 'boss-sw', 'boss2', 'boss-end', 'summary']) expect(seen.has(sid), sid).toBe(true)
  })

  it('названия по-человечески; ступени «Вершины» — по шаблону с номером; неизвестный sid показывается как есть', () => {
    expect(stageTitle('sprint-ann')).toBe('Плашка: Конвейер слов'); expect(stageTitle('sprint')).toBe('Конвейер слов — круг')
    expect(stageTitle('sprint3-ann')).toBe('Допрос у Мии — церемония (Мия забирает Пита)'); expect(stageTitle('sprint3-end')).toBe('Допрос у Мии — концовка')
    expect(stageTitle('catch3')).toBe('Допрос у Мии — круг (реверс)'); expect(stageTitle('catch-rev')).toBe('Разворот конвейера')
    expect(stageTitle('phrases1')).toBe('Фразы — круг 1 «Пойми»'); expect(stageTitle('boss')).toBe('Шкала памяти — круг'); expect(stageTitle('summary')).toBe('Итог')
    expect(stageTitle('climb-7')).toBe('Вершина — ступень 7'); expect(stageTitle({ sid: 'climb-2', title: '' })).toBe('Вершина — ступень 2')
    expect(stageTitle('warmup-x')).toBe('warmup-x'); expect(stageTitle({ sid: 'lane-1', title: 'Разминка' })).toBe('lane-1 «Разминка»'); expect(stageInfo('toString')).toBeNull()
    expect(stageTitle(null)).toBe('до первой стадии'); expect(actTitle('catch')).toBe('Конвейер слов — реверс'); expect(actTitle('lane')).toBe('lane'); expect(actTitle('')).toBe('до первой стадии')
  })

  it('стадии-анимации (идёт анимация без речи) заданы явно: разворот конвейера, церемонии и концовки Мии, эпилог финала, итог — у каждой сказано, что именно идёт', () => {
    const anim = Object.entries(STAGE_NAMES).filter(([, v]) => v.kind === 'animation').map(([k]) => k).sort()
    expect(anim).toEqual(['boss-ann', 'boss-end', 'catch-rev', 'catch3-ann', 'catch3-end', 'sprint3-ann', 'sprint3-end', 'summary'])
    for (const sid of anim) expect(STAGE_NAMES[sid].anim.length).toBeGreaterThan(5)
    expect(stageInfo('catch-rev').anim).toBe('разворот конвейера'); expect(stageInfo('sprint').kind).toBeUndefined()
  })
})
