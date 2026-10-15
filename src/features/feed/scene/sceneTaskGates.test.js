import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { GATES, taskGateBlock } from './sceneTaskGates.js'
import { taskStatusText, sandboxTask } from './sandbox/sandboxTaskStatus.js'

// Ворота показа голосового задания: «нет звука = не могу говорить» (sceneTaskGates.js, подключены в useSceneTask)
const voice = { voice: true, task: { kind: 'say' } }
const repeat = { voice: true, task: { kind: 'repeat' } }
const text = { voice: false, task: { kind: 'translate' } }
const src = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8')

describe('ворота: звук ленты выключен', () => {
  it('say / repeat без звука закрыты, причина с кодом gate:sound_off и словами «звук выключен»', () => {
    for (const info of [voice, repeat]) {
      const r = taskGateBlock(info, { soundOn: false })
      expect(r.code).toBe('gate:sound_off')
      expect(r.text).toContain('звук выключен')
    }
  })
  it('со звуком — открыты; текстовое задание (translate) звука не требует и не закрывается', () => {
    expect(taskGateBlock(voice, { soundOn: true })).toBeNull()
    expect(taskGateBlock(text, { soundOn: false })).toBeNull()
  })
  it('принудительный показ админа обходит ворота; без задания и без окружения — не падает', () => {
    expect(taskGateBlock(voice, { soundOn: false, forced: true })).toBeNull()
    expect(taskGateBlock(null, { soundOn: false })).toBeNull()
    expect(taskGateBlock(voice)).not.toBeNull() // окружение не передано = звука нет
  })
  it('у каждого правила есть id, название и пояснение для админки; коды уникальны', () => {
    expect(GATES.length).toBeGreaterThan(0)
    for (const g of GATES) { expect(g.id && g.title && g.help && g.text).toBeTruthy(); expect(typeof g.applies).toBe('function'); expect(typeof g.blocked).toBe('function') }
    expect(new Set(GATES.map(g => g.id)).size).toBe(GATES.length)
  })
  it('песочница: строка статуса «пропущено: звук выключен …»', () => {
    const info = { ...voice, task: { kind: 'say' } }
    const s = taskStatusText({ task: info.task, info, status: { phase: 'skipped', index: 0, total: 2, reason: taskGateBlock(info, { soundOn: false }) } })
    expect(s.text).toContain('пропущено: звук выключен')
    expect(s.tone).toBe('bad')
  })
})

describe('песочница: причина ворот не затирается следующим кругом', () => {
  it('skipped gate:* переживает waiting() нового круга; показ (shown) и сброс (idle) снимают её', () => {
    sandboxTask.reset()
    sandboxTask.waiting(2, 5)
    sandboxTask.skipped(taskGateBlock(voice, { soundOn: false }))
    sandboxTask.waiting(0, 5)
    expect(sandboxTask.get().phase).toBe('skipped')
    sandboxTask.shown()
    expect(sandboxTask.get().phase).toBe('shown')
    sandboxTask.skipped(taskGateBlock(voice, { soundOn: false }))
    sandboxTask.idle()
    expect(sandboxTask.get().phase).toBe('idle')
    sandboxTask.skipped({ code: 'limit', text: 'x' }) // обычные причины — как раньше
    sandboxTask.waiting(0, 5)
    expect(sandboxTask.get().phase).toBe('waiting')
    sandboxTask.reset()
  })
})

describe('проводка ворот (исходники)', () => {
  const hook = src('./useSceneTask.js')
  it('ворота проверяются раньше микрофона и лимитов: ничего не тратят', () => {
    const gate = hook.indexOf('if (closed)')
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(hook.indexOf('voiceTaskBlockReason()'))
    expect(gate).toBeLessThan(hook.indexOf('gate.claim(id)'))
  })
  it('звук ленты приходит из слайда, а после отказа детектор круга сброшен — следующий круг решит заново', () => {
    expect(src('./SlideScene.jsx')).toMatch(/useSceneTask\(\{[^}]*soundOn[^}]*\}\)/)
    expect(hook).toMatch(/if \(closed\) \{ playRef\.current = initialPlay\(\); return skip\(closed\) \}/)
  })
})
