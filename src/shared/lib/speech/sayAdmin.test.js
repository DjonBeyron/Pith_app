import { describe, it, expect } from 'vitest'
import { showHeardText, adminHeardLine } from './sayAdmin.js'
import { emptyView } from './speechController.js'

const alt = (text, confidence = 0.9) => ({ text, confidence })
const done = (extra = {}) => ({ ...emptyView, status: 'done', final: alt("I'm trying"), alternatives: [alt("I'm trying"), alt('I am trying')], lastInterim: "I'm try", ...extra })

describe('распознанный текст — только админу', () => {
  it('showHeardText: админ да, остальные нет', () => {
    expect(showHeardText({ isAdmin: true })).toBe(true)
    expect(showHeardText({ isAdmin: false })).toBe(false)
    expect(showHeardText({})).toBe(false)
  })

  it('обычный пользователь: строки нет ни во время записи, ни после результата', () => {
    expect(adminHeardLine({ isAdmin: false, phase: 'run', view: { ...emptyView, status: 'listening', interim: 'secret' } })).toBe(null)
    expect(adminHeardLine({ isAdmin: false, phase: 'passed', view: done() })).toBe(null)
    expect(adminHeardLine({ isAdmin: false, phase: 'failed', view: done() })).toBe(null)
  })

  it('админ: живой interim во время записи', () => {
    expect(adminHeardLine({ isAdmin: true, phase: 'run', view: { ...emptyView, status: 'listening', interim: "I'm tr" } }).text).toBe("Админ: слышу «I'm tr»")
    expect(adminHeardLine({ isAdmin: true, phase: 'run', view: { ...emptyView, status: 'listening' } })).toBe(null)
  })

  it('админ: interim и final отдельно, когда движок «исправил» слово (I\'m try → I\'m trying)', () => {
    const l = adminHeardLine({ isAdmin: true, phase: 'passed', view: done() })
    expect(l.text).toBe("Админ: interim: «I'm try» → final: «I'm trying» · 90%")
    expect(l.title).toMatch(/Варианты: «I'm trying» · «I am trying»/)
  })

  it('админ: interim совпал с final — короткая строка «услышали»', () => {
    const l = adminHeardLine({ isAdmin: true, phase: 'failed', view: done({ lastInterim: "i'm trying" }) })
    expect(l.text).toBe("Админ: услышали «I'm trying» · 90%")
  })
})
