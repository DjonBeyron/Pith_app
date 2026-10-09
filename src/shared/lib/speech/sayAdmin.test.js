import { describe, it, expect } from 'vitest'
import { showHeardText, adminHeardLine, audioSessionNote } from './sayAdmin.js'
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
    const live = adminHeardLine({ isAdmin: true, phase: 'run', view: { ...emptyView, status: 'listening', interim: "I'm tr" } })
    expect(live.text).toBe("Админ: слышу «I'm tr»")
    expect(live.note).toBe('звуки приложения подавлены · реальный уровень: выкл') // отметка: на время попытки звуки приложения молчат (soundQuiet.js)
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

describe('строка админа: ошибки и корректировка движка', () => {
  it('ошибка без текста: причина + прежний interim; финал без interim — только причина', () => {
    expect(adminHeardLine({ isAdmin: true, phase: 'failed', errorCode: 'silence', view: { ...emptyView, lastInterim: 'I am' } }).text).toBe('Админ: silence · слышал «I am»')
    expect(adminHeardLine({ isAdmin: true, phase: 'failed', errorCode: 'network', view: emptyView }).text).toBe('Админ: network')
    expect(adminHeardLine({ isAdmin: true, phase: 'failed', verdict: null, errorCode: null, view: emptyView }).text).toBe('Админ: нет текста')
  })

  it('«слово X подтверждено только final» — корректировка движка (строгий режим)', () => {
    const l = adminHeardLine({
      isAdmin: true, phase: 'failed', view: done({ final: alt('I am trying to please both'), lastInterim: 'I am try to please both' }),
      verdict: { engineFixed: ['trying'] },
    })
    expect(l.note).toBe('слово trying подтверждено только final (корректировка движка) · звуки приложения подавлены · реальный уровень: выкл')
    expect(adminHeardLine({ isAdmin: true, phase: 'passed', view: done(), verdict: { engineFixed: [] } }).note).toBe('звуки приложения подавлены · реальный уровень: выкл')
    expect(adminHeardLine({ isAdmin: true, phase: 'passed', view: done(), realLevel: 'вкл' }).note).toBe('звуки приложения подавлены · реальный уровень: вкл')
  })

  it('«первое увиденное»: слово заблокировано выдержкой — отдельная пометка, не «только final»', () => {
    const l = adminHeardLine({
      isAdmin: true, phase: 'failed', view: done({ final: alt('I am trying'), lastInterim: 'I am trying' }),
      verdict: { engineFixed: ['trying'], firstSeenBlocked: ['trying'] },
    })
    expect(l.note).toBe('слово trying: ошибочная форма держалась в interim дольше выдержки («первое увиденное») · звуки приложения подавлены · реальный уровень: выкл')
  })

  it('не админ — по-прежнему ничего, даже с ошибкой и корректировкой', () => {
    expect(adminHeardLine({ isAdmin: false, phase: 'failed', errorCode: 'silence', view: emptyView, verdict: { engineFixed: ['x'] } })).toBe(null)
  })
})

describe('пометка про аудиосессию (эксперимент модуля)', () => {
  it('флаг вкл → «аудиосессия: play-and-record» в конце заметки; выкл — заметка не меняется', () => {
    expect(adminHeardLine({ isAdmin: true, phase: 'passed', view: done(), audioSession: 'play-and-record' }).note).toBe('звуки приложения подавлены · реальный уровень: выкл · аудиосессия: play-and-record')
    expect(adminHeardLine({ isAdmin: true, phase: 'passed', view: done(), audioSession: null }).note).toBe('звуки приложения подавлены · реальный уровень: выкл')
    expect(audioSessionNote('play-and-record')).toBe('аудиосессия: play-and-record')
    expect(audioSessionNote(null)).toBe('')
  })
})
