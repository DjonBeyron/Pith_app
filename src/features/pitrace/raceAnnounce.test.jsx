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
const TASKS = { race_sprint: ['Конвейер слов', 'перевод едет вниз, скажи слово по-английски, пока не убежало'], race_climb: ['Конвейер фраз', 'собираем фразу по слову, с каждым шагом длиннее'], race_descent: ['', 'повтори всю фразу за мной на скорости'] }
const REVERSE_LINE = 'теперь наоборот, секунду, переключаюсь на русский' // разворот в реверс (голосом): Пит говорит, пока едут пилюли со стрелками

describe('объявление этапов: название + задание', () => {
  it('плашки раундов: title — название, task — задание; реплика Пита = «название, задание»', () => {
    const stages = buildStages({ chunks: plan.chunks, plan, rate: 1 }).stages
    const ann = stages.filter(s => s.type === 'announce' && TASKS[s.line])
    expect(ann.map(s => s.line)).toEqual(['race_climb', 'race_descent'])
    const sp = stages.find(s => s.sid === 'sprint-ann'); expect(sp.line).toBeNull(); expect([sp.round.title, sp.round.task]).toEqual(TASKS.race_sprint) // плашка этапа A есть, отдельной реплики нет: её заменяет стартовая фраза
    for (const s of ann) {
      const [title, task] = TASKS[s.line]
      expect(s.round.title).toBe(title); expect(s.round.task).toBe(title ? task : '')
      expect(RACE_LINES.find(l => l.id === s.line).text).toBe(title ? `${title}, ${task}` : `теперь ${task}`) // «Спуск» — вторая половина «Конвейера фраз», плашки нет, реплика без названия
    }
    expect(stages.find(s => s.sid === 'climb-top').round.task).toBeUndefined() // плашка вершины без задания
    const rev = stages.find(s => s.sid === 'catch-rev'); expect(rev.line).toBe('race_reverse_tap'); expect(rev.round.title).toBe(''); expect(rev.rev).toBeGreaterThan(2000) // разворот: Пит говорит, плашки нет
    const b = stages.find(s => s.sid === 'catch-ann'); expect(b.line).toBeNull(); expect(b.round.title).toBe('Конвейер слов'); expect(b.round.brief).toBe('теперь тапай перевод'); expect(b.charge).toBe(true) // после разворота — плашка этапа с зарядкой бара
    expect(RACE_LINES.find(l => l.id === 'race_reverse').text).toBe(REVERSE_LINE)
  })
  it('реплики без точек, тире и восклицаний', () => {
    for (const id of [...Object.keys(TASKS), 'race_reverse', 'race_sprint_tap', 'race_reverse_tap', 'race_start', 'race_start_tap']) expect(RACE_LINES.find(l => l.id === id).text).not.toMatch(/[.!—–]/)
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
