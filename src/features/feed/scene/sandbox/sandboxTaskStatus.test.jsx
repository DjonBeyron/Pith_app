import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createDirector } from '../../../scene/v2/directorCore.js'
import { normalizeSceneV2 } from '../../../scene/v2/sceneSchemaV2.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'
import { feedTaskOf, initialPlay, trackPlay, taskAllowed } from '../sceneTaskPlay.js'
import { createTaskGate, TASK_PER_DAY, TASK_KEY, TASK_FORCE_KEY } from '../sceneTaskLimits.js'
import { voiceTaskBlockReason, voiceTaskAvailable } from '../sceneVoiceData.js'
import { sandboxTask, taskStatusText, noTaskReason, micReason, limitReason, inactiveReason } from './sandboxTaskStatus.js'
import { sandboxModule } from './sandboxModule.js'
import { SANDBOX_ID, parseSandbox } from './feedSandbox.js'
import SandboxBar from './SandboxBar.jsx'

vi.mock('../../../../shared/lib/analytics/track.js', () => ({ track: () => {} }))

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), has: k => m.has(k) } }
const withTask = task => normalizeSceneV2({ ...demoOfficeScene, timeline: demoOfficeScene.timeline.slice(0, 3).map(l => ({ ...l, translation: 'Перевод.' })), task })

// Прогон круга настоящим режиссёром (directorCore) с loop: возвращает события в порядке прихода
function runLaps(total, laps, onState) {
  const ends = []
  const tl = Array.from({ length: total }, (_, i) => ({ who: i % 2 ? 'b' : 'a', text: `Line ${i}.` }))
  const d = createDirector({ timeline: tl, loop: true, playLine: (_l, _i, { onEnd }) => { ends.push(onEnd); return () => {} }, onChange: onState })
  d.play()
  for (let i = 0; i < total * laps; i++) ends.pop()?.()
  d.destroy()
}

describe('песочница: первый полный круг при принудительном показе', () => {
  it('задание открывается сразу после первого полного проигрывания (не по второму кругу) — ровно один раз', () => {
    const session = mem(); const local = mem()
    vi.stubGlobal('sessionStorage', session)
    const gate = createTaskGate({ storage: () => local, session: () => session, today: () => '2026-10-15' })
    session.setItem(TASK_FORCE_KEY, JSON.stringify({ sceneId: SANDBOX_ID }))
    let play = initialPlay(); const opened = []; let step = 0
    runLaps(3, 3, st => {
      step += 1
      const prev = play
      play = trackPlay(play, st)
      if (play.done && !prev.done && gate.claim(SANDBOX_ID)) opened.push(step)
    })
    // реплики 0,1,2 → после конца 2-й режиссёр сразу шагает на 0: это и есть конец круга — 4-е событие
    expect(opened).toEqual([4])
    expect(session.has(TASK_FORCE_KEY)).toBe(false) // принудительный показ одноразовый
    vi.unstubAllGlobals()
  })
  it('песочница не тратит боевые лимиты: ни день, ни «сцена раз в сутки»; без force — те же правила, причина видна', () => {
    const local = mem(); const session = mem()
    const gate = createTaskGate({ storage: () => local, session: () => session, today: () => '2026-10-15' })
    for (let i = 0; i < 3; i++) expect(gate.claim(SANDBOX_ID)).toBe(true)
    expect(local.has(TASK_KEY)).toBe(false)
    local.setItem(TASK_KEY, JSON.stringify({ date: '2026-10-15', count: TASK_PER_DAY, scenes: {} }))
    expect(gate.claim(SANDBOX_ID)).toBe(false)
    expect(gate.why(SANDBOX_ID)).toMatch(/5 заданий в день/)
    session.setItem(TASK_FORCE_KEY, JSON.stringify({ sceneId: SANDBOX_ID }))
    expect(gate.why(SANDBOX_ID)).toBeNull()
  })
  it('состояние active: неактивный/нежилой слайд задание не открывает (причина «слайд не активен»)', () => {
    const info = feedTaskOf(withTask({ kind: 'translate', lineIndex: 1 }))
    expect(taskAllowed({ info, active: true, live: true })).toBe(true)
    expect(taskAllowed({ info, active: false, live: true })).toBe(false)
    expect(taskAllowed({ info, active: true, live: false })).toBe(false)
    expect(inactiveReason().text).toMatch(/не активен/)
  })
})

describe('причина пропуска голосового задания видна', () => {
  const perm = d => ({ decide: () => d })
  it('voiceTaskBlockReason: код причины или null', () => {
    expect(voiceTaskBlockReason(perm({ action: 'fallback', reason: 'browser' }))).toBe('browser')
    expect(voiceTaskBlockReason(perm({ action: 'fallback', reason: 'denied' }))).toBe('denied')
    expect(voiceTaskBlockReason(perm({ action: 'fallback' }))).toBe('unsupported')
    expect(voiceTaskBlockReason(perm({ action: 'listen' }))).toBeNull()
    expect(voiceTaskBlockReason(perm({ action: 'explain', kind: 'full' }))).toBeNull()
    expect(voiceTaskAvailable(perm({ action: 'fallback', reason: 'cant_speak' }))).toBe(false)
  })
  it('тексты причин: микрофон / лимит / не активен', () => {
    expect(micReason('browser').text).toMatch(/Firefox/)
    expect(micReason('unsupported').text).toMatch(/нет распознавания/)
    expect(micReason('cant_speak').text).toMatch(/Не могу говорить/)
    expect(micReason('denied').text).toMatch(/запрещён/)
    expect(micReason('denied').code).toBe('mic:denied')
    expect(limitReason('лимит: X').text).toBe('лимит: X')
  })
})

describe('строка статуса задания на тестовом слайде', () => {
  const sc = withTask({ kind: 'repeat', lineIndex: 1 })
  const info = feedTaskOf(sc)
  beforeEach(() => sandboxTask.reset())
  it('нет задания / нет эталона — с понятной причиной', () => {
    expect(taskStatusText({ task: undefined, info: null, status: sandboxTask.get() })).toMatchObject({ tone: 'off' })
    expect(taskStatusText({ task: undefined, info: null, status: sandboxTask.get() }).text).toMatch(/не выбран вид задания/)
    expect(noTaskReason({ kind: 'translate' })).toMatch(/нет эталона/)
    expect(noTaskReason({ kind: 'say' })).toMatch(/ключевых слов/)
  })
  it('ждём конец диалога (реплика N/M) → появится → показано', () => {
    sandboxTask.waiting(2, 6)
    expect(taskStatusText({ task: sc.task, info, status: sandboxTask.get() }).text).toBe('задание: Повтори за диктором · ждём конец диалога (реплика 3/6) → появится')
    sandboxTask.shown()
    expect(taskStatusText({ task: sc.task, info, status: sandboxTask.get() })).toEqual({ tone: 'ok', text: 'задание: Повтори за диктором · показано' })
  })
  it('пропущено: причина в строке, а не тишина', () => {
    sandboxTask.waiting(0, 3)
    sandboxTask.skipped(micReason('browser'))
    const t = taskStatusText({ task: sc.task, info, status: sandboxTask.get() })
    expect(t.tone).toBe('bad')
    expect(t.text).toMatch(/пропущено: нет микрофона\/распознавания/)
  })
  it('store: waiting не плодит обновления при тех же значениях; reset — в исходное', () => {
    const fn = vi.fn()
    const off = sandboxTask.subscribe(fn)
    sandboxTask.waiting(1, 3); sandboxTask.waiting(1, 3)
    expect(fn).toHaveBeenCalledTimes(1)
    sandboxTask.reset()
    expect(sandboxTask.get().phase).toBe('idle')
    off()
  })
})

describe('возврат в сборщик: плашка и запись песочницы', () => {
  it('SandboxBar: кнопка «← Вернуться в сборщик» и статус; без onBack кнопки нет', () => {
    const html = renderToStaticMarkup(<SandboxBar hasTask status={{ tone: 'wait', text: 'задание: X · ждём' }} onClose={() => {}} onAgain={() => {}} onBack={() => {}} />)
    expect(html).toContain('Вернуться в сборщик')
    expect(html).toContain('Закрыть тест')
    expect(html).toContain('задание: X · ждём')
    expect(renderToStaticMarkup(<SandboxBar hasTask onClose={() => {}} onAgain={() => {}} />)).not.toContain('Вернуться в сборщик')
  })
  it('запись песочницы помнит origin (по умолчанию admin), модуль несёт taskForce/origin', () => {
    const raw = o => JSON.stringify({ v: 1, scene: { a: 1 }, taskForce: true, createdAt: 3, ...o })
    expect(parseSandbox(raw({ origin: 'node' })).origin).toBe('node')
    expect(parseSandbox(raw({ origin: 'bogus' })).origin).toBe('admin')
    expect(parseSandbox(raw({})).origin).toBe('admin')
    const m = sandboxModule({ scene: { title: 'T' }, createdAt: 5, taskForce: true, origin: 'module' })
    expect(m).toMatchObject({ taskForce: true, origin: 'module', sandboxAt: 5 })
  })
})
