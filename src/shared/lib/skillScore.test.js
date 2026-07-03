import { describe, it, expect } from 'vitest'
import {
  computePriority,
  latestSessionEvents,
  computeAllPriorities,
  THRESHOLD_SLOW,
} from './skillScore.js'

// Короткий конструктор события: ev('correct', { attempt: 2 })
let seq = 0
function ev(type, extra = {}) {
  return {
    lessonId: 'les-x',
    type,
    attempt: 1,
    timeMs: 3000,
    option: '',
    sessionId: 's1',
    sourceLessonId: 'src-1',
    at: `2026-07-03T10:00:${String(seq++).padStart(2, '0')}`,
    ...extra,
  }
}

describe('computePriority — каскад правил', () => {
  it('пустая копилка → null', () => {
    expect(computePriority([])).toBe(null)
    expect(computePriority(undefined)).toBe(null)
  })

  it('wrong без последующего correct → high', () => {
    expect(computePriority([ev('wrong')])).toBe('high')
    expect(computePriority([ev('wrong'), ev('wrong')])).toBe('high')
  })

  it('correct со 2-й попытки → medium', () => {
    expect(computePriority([ev('correct', { attempt: 2 })])).toBe('medium')
  })

  it('correct дольше порога → medium', () => {
    expect(computePriority([ev('correct', { timeMs: THRESHOLD_SLOW + 1 })])).toBe('medium')
  })

  it('correct с 1-й попытки, быстро → low', () => {
    expect(computePriority([ev('correct')])).toBe('low')
    expect(computePriority([ev('correct'), ev('correct')])).toBe('low')
  })

  it('dont_know → correct = «только что узнал» → medium', () => {
    expect(computePriority([ev('dont_know'), ev('correct')])).toBe('medium')
  })

  it('know → correct = подтверждённое знание → low', () => {
    expect(computePriority([ev('know'), ev('correct')])).toBe('low')
  })

  it('know → wrong = факт сильнее самооценки → high', () => {
    expect(computePriority([ev('know'), ev('wrong')])).toBe('high')
  })

  it('wrong → correct поп.2 = в итоге разобрался → medium', () => {
    expect(computePriority([
      ev('dont_know'), ev('wrong'), ev('correct', { attempt: 2 }),
    ])).toBe('medium')
  })

  it('correct → wrong = свежее сильнее, знание не удержалось → high', () => {
    expect(computePriority([ev('correct'), ev('correct'), ev('wrong')])).toBe('high')
  })

  it('только know (без фактов) → слабый low', () => {
    expect(computePriority([ev('know')])).toBe('low')
  })

  it('только dont_know (без фактов) → medium', () => {
    expect(computePriority([ev('dont_know')])).toBe('medium')
  })
})

describe('latestSessionEvents — замещение сессий', () => {
  it('берёт только последнюю сессию каждого урока-источника', () => {
    const events = [
      ev('wrong',   { sessionId: 's1', sourceLessonId: 'src-1' }),
      ev('correct', { sessionId: 's2', sourceLessonId: 'src-1' }), // пересдача src-1
      ev('correct', { sessionId: 's9', sourceLessonId: 'src-2' }), // другой источник
    ]
    const actual = latestSessionEvents(events)
    expect(actual.map(e => e.sessionId)).toEqual(['s2', 's9'])
  })
})

describe('computeAllPriorities — сквозной расчёт', () => {
  it('старая сессия с ошибками не портит новую чистую → low', () => {
    const events = [
      ev('wrong',   { sessionId: 's1' }),
      ev('wrong',   { sessionId: 's1' }),
      ev('correct', { sessionId: 's2' }), // пересдача «с обновлением»
    ]
    expect(computeAllPriorities(events).get('les-x')).toBe('low')
  })

  it('сценарий из SKILL_ANALYSIS.md §5', () => {
    const events = [
      ev('correct',   { lessonId: 'les-im' }),
      ev('know',      { lessonId: 'les-please' }),
      ev('correct',   { lessonId: 'les-trying', attempt: 2 }),
      ev('wrong',     { lessonId: 'les-to' }),
      ev('dont_know', { lessonId: 'les-to' }),
      ev('wrong',     { lessonId: 'les-to', attempt: 2 }),
      ev('correct',   { lessonId: 'les-trying' }),
    ]
    const p = computeAllPriorities(events)
    expect(p.get('les-im')).toBe('low')        // 🔵 верно с 1-й
    expect(p.get('les-trying')).toBe('medium') // 🟡 была 2-я попытка
    expect(p.get('les-to')).toBe('high')       // 🟠 ошибки без верного
    expect(p.get('les-please')).toBe('low')    // 🔵 слабый (самооценка)
    expect(p.has('les-both')).toBe(false)      // без полоски — данных нет
  })

  it('события без lessonId (сюжетные) игнорируются', () => {
    const events = [ev('correct', { lessonId: null })]
    expect(computeAllPriorities(events).size).toBe(0)
  })
})
