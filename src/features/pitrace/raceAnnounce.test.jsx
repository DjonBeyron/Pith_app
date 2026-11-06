import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildStages } from '../player/modules/rotate-phone/wordLaneStages.js'
import WordLaneTurnPlate from '../player/modules/rotate-phone/WordLaneTurnPlate.jsx'
import { RACE_LINES } from './raceLines.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// Плашка этапа: название + задание; реплика Пита — то же «название, задание». Индикатора микрофона в гонке нет.
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const TASKS = { race_sprint: ['Пинг-понг', 'перевод едет вниз, скажи слово по-английски, пока не убежало'], race_climb: ['Вершина', 'собираем фразу по слову, с каждым шагом длиннее'], race_descent: ['Спуск', 'повтори всю фразу за мной на скорости'] }
const CATCH_LINE = 'теперь наоборот, я говорю по-английски, а ты называешь перевод' // проход B: объявление БЕЗ плашки

describe('объявление этапов: название + задание', () => {
  it('плашки раундов: title — название, task — задание; реплика Пита = «название, задание»', () => {
    const stages = buildStages({ chunks: plan.chunks, plan, rate: 1 }).stages
    const ann = stages.filter(s => s.type === 'announce' && TASKS[s.line])
    expect(ann.map(s => s.line)).toEqual(['race_climb', 'race_descent'])
    const sp = stages.find(s => s.sid === 'sprint-ann'); expect(sp.line).toBeNull(); expect([sp.round.title, sp.round.task]).toEqual(TASKS.race_sprint) // плашка этапа A есть, отдельной реплики нет: её заменяет стартовая фраза
    for (const s of ann) {
      const [title, task] = TASKS[s.line]
      expect(s.round.title).toBe(title); expect(s.round.task).toBe(task)
      expect(RACE_LINES.find(l => l.id === s.line).text).toBe(`${title}, ${task}`)
    }
    expect(stages.find(s => s.sid === 'climb-top').round.task).toBeUndefined() // плашка вершины без задания
    const b = stages.find(s => s.sid === 'catch-ann'); expect(b.line).toBe('race_catch_tap'); expect(b.round.title).toBe(''); expect(b.round.task).toBe('') // проход B: Пит говорит, плашки нет
    expect(RACE_LINES.find(l => l.id === 'race_catch').text).toBe(CATCH_LINE)
  })
  it('реплики без точек, тире и восклицаний', () => {
    for (const id of [...Object.keys(TASKS), 'race_catch', 'race_sprint_tap', 'race_catch_tap', 'race_switch_ru', 'race_start', 'race_start_tap']) expect(RACE_LINES.find(l => l.id === id).text).not.toMatch(/[.!—–]/)
  })
  it('WordLaneTurnPlate: «название и задание через перевод строки» — задание строкой под заголовком; без задания как раньше', () => {
    const h = renderToStaticMarkup(createElement(WordLaneTurnPlate, { text: 'Разгон\nпроверим, как ты помнишь слова из своей памяти' }))
    expect(h).toContain('Разгон<div class="wlTurnTask" data-testid="wl-turn-task">проверим, как ты помнишь слова из своей памяти</div>')
    expect(renderToStaticMarkup(createElement(WordLaneTurnPlate, { text: 'Теперь твоя очередь' }))).not.toContain('wlTurnTask')
    expect(read('../../styles/player/modules/word-lane-plate.css')).toContain('.wlTurnTask')
  })
  it('в гонке индикатора микрофона нет (WordLaneGame не монтирует Mic при plan.game = race)', () => {
    expect(read('../player/modules/rotate-phone/WordLaneGame.jsx')).toContain("cfg.plan?.game !== 'race' && <Mic ")
  })
})
