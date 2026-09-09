import { describe, it, expect } from 'vitest'
import { decideToggle, decideFollowScenario, decideStep } from './debugStepLogic.js'

// Матрица состояний: у паузы три независимых носителя (часы, сценарий,
// React-стейт кнопки), и ломались именно их сочетания — по одному всё
// работало. Поэтому перебираем сочетания, а не отдельные случаи.

describe('кнопка паузы', () => {
  it('часы идут — нажатие ставит паузу', () => {
    expect(decideToggle({ clockInstalled: true, clockRunning: true, displayPaused: false })).toBe('pause')
  })

  it('часы стоят — нажатие продолжает', () => {
    expect(decideToggle({ clockInstalled: true, clockRunning: false, displayPaused: true })).toBe('resume')
  })

  // Тот самый баг: React не успел перерисоваться, и стейт кнопки врёт.
  // Решение по часам должно быть верным ВОПРЕКИ ему
  it('стейт кнопки отстал от часов — верим часам, не стейту', () => {
    expect(decideToggle({ clockInstalled: true, clockRunning: false, displayPaused: false })).toBe('resume')
    expect(decideToggle({ clockInstalled: true, clockRunning: true, displayPaused: true })).toBe('pause')
  })

  it('часов нет (прод-превью) — работаем по стейту кнопки', () => {
    expect(decideToggle({ clockInstalled: false, clockRunning: false, displayPaused: false })).toBe('pause')
    expect(decideToggle({ clockInstalled: false, clockRunning: false, displayPaused: true })).toBe('resume')
  })
})

describe('часы следуют за сценарием', () => {
  it('сценарий замер сам («назад»), часы шли — останавливаем часы', () => {
    expect(decideFollowScenario({ frozen: true, clockInstalled: true, clockRunning: true })).toBe('pause')
  })

  it('сценарий ожил сам («вперёд»), часы стояли — пускаем часы', () => {
    expect(decideFollowScenario({ frozen: false, clockInstalled: true, clockRunning: false })).toBe('resume')
  })

  it('уже в согласии — ничего не трогаем (иначе кнопки дёргали бы друг друга)', () => {
    expect(decideFollowScenario({ frozen: true, clockInstalled: true, clockRunning: false })).toBe(null)
    expect(decideFollowScenario({ frozen: false, clockInstalled: true, clockRunning: true })).toBe(null)
  })

  it('плеер не открыт — сценария нет, часы живут сами', () => {
    expect(decideFollowScenario({ frozen: undefined, clockInstalled: true, clockRunning: true })).toBe(null)
  })

  it('часов нет — следовать нечему', () => {
    expect(decideFollowScenario({ frozen: true, clockInstalled: false, clockRunning: false })).toBe(null)
  })
})

describe('шаг времени', () => {
  // Главная поломка: сценарий двигали ТОЛЬКО часами, а его таймеры на паузе
  // уничтожены — шаг упирался, следующее сообщение не приходило никогда
  it('шаг вперёд двигает и часы, и сценарий — иначе сценарий упрётся', () => {
    const d = decideStep({ deltaMs: 33, clockInstalled: true })
    expect(d.tickClock).toBe(true)
    expect(d.stepScenario).toBe(true)
  })

  it('шаг назад: часы назад не умеют, но сценарий и медиа двигаются', () => {
    const d = decideStep({ deltaMs: -33, clockInstalled: true })
    expect(d.tickClock).toBe(false)
    expect(d.stepScenario).toBe(true)
    expect(d.stepMedia).toBe(true)
  })

  it('часов нет — сценарий всё равно шагает', () => {
    expect(decideStep({ deltaMs: 33, clockInstalled: false })).toMatchObject({ tickClock: false, stepScenario: true })
  })
})

describe('сквозные последовательности нажатий', () => {
  // Прогоняем кнопки подряд по маленькой модели мира и проверяем, что часы и
  // сценарий не расходятся ни на одном шаге
  function world() {
    return { running: true, frozen: false, displayPaused: false }
  }
  function apply(w, action) {
    if (action === 'toggle') {
      const r = decideToggle({ clockInstalled: true, clockRunning: w.running, displayPaused: w.displayPaused })
      w.running = r === 'resume'
      w.frozen = !w.running               // тулбар синхронизирует сценарий
      w.displayPaused = !w.running
    }
    if (action === 'scenarioBack') {      // «назад» сам ставит сценарий на паузу
      w.frozen = true
      const r = decideFollowScenario({ frozen: w.frozen, clockInstalled: true, clockRunning: w.running })
      if (r === 'pause') w.running = false
    }
    if (action === 'scenarioForward') {   // «вперёд» сам размораживает
      w.frozen = false
      const r = decideFollowScenario({ frozen: w.frozen, clockInstalled: true, clockRunning: w.running })
      if (r === 'resume') w.running = true
    }
    return w
  }

  const actions = ['toggle', 'scenarioBack', 'scenarioForward']

  it('любая последовательность из 6 нажатий не разводит часы и сценарий', () => {
    const seqs = []
    const build = (acc) => {
      if (acc.length === 6) { seqs.push(acc); return }
      for (const a of actions) build([...acc, a])
    }
    build([])
    for (const seq of seqs) {
      const w = seq.reduce((acc, a) => apply(acc, a), world())
      // Единый таймлайн: часы идут ровно тогда, когда сценарий не заморожен
      expect(w.running, `разошлись после ${seq.join(' → ')}`).toBe(!w.frozen)
    }
    expect(seqs.length).toBe(729)
  })
})
