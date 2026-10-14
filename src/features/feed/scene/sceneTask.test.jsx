import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import * as ts from './sceneTaskState.js'
import { feedTaskOf, initialPlay, trackPlay, taskAllowed } from './sceneTaskPlay.js'
import { dayState, canOfferTask, markTaskShown, createTaskGate, TASK_PER_DAY, TASK_GAP, TASK_KEY, TASK_FORCE_KEY } from './sceneTaskLimits.js'
import { taskKeyboardModel, TASK_KEYBOARD } from './sceneTaskKeyboard.js'
import { loopedScene } from './slideSceneRules.js'
import SceneTaskSheet from './SceneTaskSheet.jsx'
import { normalizeSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import { demoCafeScene } from '../../scene/v2/demoScenes.js'
import { TASK_EXAMPLE } from '../../scene/v2/sceneLegend.js'

vi.mock('../../../shared/lib/analytics/track.js', () => ({ track: () => {} }))

const scene = normalizeSceneV2({ ...demoCafeScene, ...TASK_EXAMPLE })
const info = feedTaskOf(scene)

describe('feedTaskOf / loopedScene', () => {
  it('задание сцены для ленты: реплика, эталоны, вопрос; без задания или эталонов — null', () => {
    expect(info.index).toBe(1)
    expect(info.answers[0]).toBe(scene.timeline[1].translation)
    expect(info.prompt).toBe('Что ответил Барсик?')
    expect(feedTaskOf(normalizeSceneV2(demoCafeScene))).toBeNull()
    const bare = normalizeSceneV2({ ...demoCafeScene, task: { kind: 'translate' } })
    expect(feedTaskOf(bare)).toBeNull()
  })
  it('в ленте переводы под облачками скрыты, если есть задание; без задания — остаются', () => {
    const looped = loopedScene(scene)
    expect(looped.options.loop).toBe(true)
    expect(looped.timeline.every(l => !('translation' in l))).toBe(true)
    expect(looped.task).toBe(scene.task)
    const plain = loopedScene(normalizeSceneV2({ ...demoCafeScene, timeline: demoCafeScene.timeline.map(l => ({ ...l, translation: 'т' })) }))
    expect(plain.timeline[0].translation).toBe('т')
  })
})

describe('trackPlay — первое полное проигрывание', () => {
  const st = (status, index, total = 3) => ({ status, index, total })
  it('зацикленная сцена: done после «последняя → снова нулевая», не раньше', () => {
    let p = initialPlay()
    p = trackPlay(p, st('playing', 0))
    p = trackPlay(p, st('playing', 1))
    expect(p.done).toBe(false)
    p = trackPlay(p, st('playing', 2))
    expect(p.sawLast).toBe(true)
    expect(p.done).toBe(false)
    p = trackPlay(p, st('paused', 2))
    p = trackPlay(p, st('playing', 2))
    expect(p.done).toBe(false)
    const done = trackPlay(p, st('playing', 0))
    expect(done.done).toBe(true)
    expect(trackPlay(done, st('playing', 1))).toBe(done) // дальше — без изменений
  })
  it('без loop — done по ended; idle и повтор нулевой в начале — нет', () => {
    expect(trackPlay(initialPlay(), st('ended', 2)).done).toBe(true)
    let p = trackPlay(initialPlay(), st('idle', 0))
    p = trackPlay(p, st('playing', 0))
    p = trackPlay(p, st('playing', 0))
    expect(p.done).toBe(false)
    expect(trackPlay(initialPlay(), st('playing', 0, 0)).done).toBe(false)
  })
  it('taskAllowed: только активный живой слайд с заданием', () => {
    expect(taskAllowed({ info, active: true, live: true })).toBe(true)
    expect(taskAllowed({ info, active: false, live: true })).toBe(false)
    expect(taskAllowed({ info, active: true, live: false })).toBe(false)
    expect(taskAllowed({ info: null, active: true, live: true })).toBe(false)
  })
})

describe('sceneTaskState — idle → ready → answering → checked → closed', () => {
  const { task, line } = info
  it('открытие, набор с заглавной, стирание, проверка верного', () => {
    let s = ts.initialTask('s1')
    expect(ts.press(s, 'а')).toBe(s) // до открытия клавиши мёртвые
    s = ts.open(s, 1000)
    expect(s.phase).toBe('ready')
    expect(ts.canCheck(s)).toBe(false)
    for (const ch of 'он не большой, просто чашка маленькая') s = ts.press(s, ch)
    expect(s.typed.startsWith('Он не')).toBe(true)
    expect(s.phase).toBe('answering')
    s = ts.backspace(s)
    expect(s.typed.endsWith('маленька')).toBe(true)
    const { state, result } = ts.check(s, task, line)
    expect(result.ok).toBe(true)
    expect(state.phase).toBe('checked')
    expect(state.ok).toBe(true)
    expect(state.attempt).toBe(1)
    expect(ts.isOpen(state)).toBe(true)
    const closed = ts.close(state)
    expect(closed.phase).toBe('closed')
    expect(ts.isOpen(closed)).toBe(false)
  })
  it('две попытки: первая неверная → answering с wrong, вторая неверная → checked без ok', () => {
    let s = ts.open(ts.initialTask('s1'))
    for (const ch of 'ведро') s = ts.press(s, ch)
    const first = ts.check(s, task, line)
    expect(first.state.phase).toBe('answering')
    expect(first.state.wrong).toBe(true)
    expect(first.state.attempt).toBe(1)
    expect(ts.attemptsLeft(first.state)).toBe(1)
    let s2 = ts.press(first.state, '!')
    expect(s2.wrong).toBe(false) // новая буква гасит «не совсем»
    const second = ts.check(s2, task, line)
    expect(second.state.phase).toBe('checked')
    expect(second.state.ok).toBe(false)
    expect(second.state.result.matchedAnswer).toBeTruthy()
  })
  it('пустое не проверяется; «Не знаю» → checked с эталоном; стирание до пустого → ready', () => {
    let s = ts.open(ts.initialTask('s1'))
    expect(ts.check(s, task, line).result).toBeNull()
    s = ts.press(s, 'а')
    s = ts.backspace(s)
    expect(s.phase).toBe('ready')
    const g = ts.giveUp(s, task, line)
    expect(g.phase).toBe('checked')
    expect(g.gaveUp).toBe(true)
    expect(g.result.matchedAnswer).toBe(info.answers[0])
    expect(ts.giveUp(g, task, line)).toBe(g)
  })
})

describe('sceneTaskLimits — лимиты показа', () => {
  const today = '2026-10-14'
  it('dayState: чужая дата обнуляет, сцены других дней чистятся', () => {
    expect(dayState(null, today)).toEqual({ date: today, count: 0, scenes: {} })
    expect(dayState({ date: '2026-10-13', count: 4, scenes: { a: '2026-10-13', b: today } }, today)).toEqual({ date: today, count: 0, scenes: { b: today } })
  })
  it('canOfferTask: зазор слайдов, дневной лимит, сцена раз в сутки, пауза, принудительный', () => {
    const st = dayState(null, today)
    expect(canOfferTask({ swipes: TASK_GAP, state: st, sceneId: 's' })).toBe(true)
    expect(canOfferTask({ swipes: TASK_GAP - 1, state: st, sceneId: 's' })).toBe(false)
    expect(canOfferTask({ swipes: 9, state: { ...st, count: TASK_PER_DAY }, sceneId: 's' })).toBe(false)
    const shown = markTaskShown(st, 's')
    expect(shown.count).toBe(1)
    expect(canOfferTask({ swipes: 9, state: shown, sceneId: 's' })).toBe(false)
    expect(canOfferTask({ swipes: 9, state: shown, sceneId: 'other' })).toBe(true)
    expect(canOfferTask({ swipes: 9, state: st, sceneId: 's', paused: true })).toBe(false)
    expect(canOfferTask({ swipes: 0, state: { ...st, count: 99 }, sceneId: 's', forced: true })).toBe(true)
  })
  it('шлюз: первая сцена может сразу; после показа — зазор; хранение; «позже»; принудительный снимается', () => {
    const mem = new Map()
    const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) }
    const sess = new Map([[TASK_FORCE_KEY, JSON.stringify({ sceneId: 'forced' })]])
    const session = { getItem: k => sess.get(k) ?? null, setItem: (k, v) => sess.set(k, v), removeItem: k => sess.delete(k) }
    let now = 1_000_000
    const gate = createTaskGate({ storage: () => storage, session: () => session, now: () => now, today: () => today })
    expect(gate.claim('s1')).toBe(true)
    expect(JSON.parse(mem.get(TASK_KEY))).toEqual({ date: today, count: 1, scenes: { s1: today } })
    expect(gate.claim('s2')).toBe(false) // зазор не выдержан
    gate.onSlide('m1'); gate.onSlide('m1'); gate.onSlide('m2'); gate.onSlide('m3')
    expect(gate.swipes()).toBe(3)
    expect(gate.claim('s1')).toBe(false) // та же сцена — раз в сутки
    expect(gate.claim('s2')).toBe(true)
    // «Спроси позже»: сцена на паузе 3 часа
    for (let i = 0; i < 5; i++) gate.onSlide(`m${10 + i}`)
    expect(gate.later('s3')).toEqual({ n: 1, long: false })
    expect(gate.claim('s3')).toBe(false)
    now += 4 * 60 * 60 * 1000
    expect(gate.claim('s3')).toBe(true)
    // принудительный: без зазора и поверх лимита, ключ снимается, счётчик дня не тратится
    const before = JSON.parse(mem.get(TASK_KEY)).count
    expect(gate.forced('forced')).toBe(true)
    expect(gate.claim('forced')).toBe(true)
    expect(sess.has(TASK_FORCE_KEY)).toBe(false)
    expect(JSON.parse(mem.get(TASK_KEY)).count).toBe(before)
    expect(gate.claim(null)).toBe(false)
  })
})

describe('клавиатура и панель', () => {
  it('кириллическая модель: три ряда, все живые, ё слева в последнем, пробел', () => {
    const m = taskKeyboardModel()
    expect(m.rows).toHaveLength(3)
    expect(m.rows[2][0].ch).toBe('ё')
    expect(m.lastExtra).toBe(1)
    expect(m.space).toBe(true)
    expect(m.rows.flat().every(k => k.lit && !k.lure)).toBe(true)
    expect(m.cols).toBeGreaterThanOrEqual(12)
    expect(TASK_KEYBOARD.rows[0].map(k => k.ch).join('')).toBe('йцукенгшщзхъ')
  })
  it('панель: до ввода — вопрос, плейсхолдер, «Проверить» выключена; с ответом — включена; вердикты', () => {
    const base = { prompt: info.prompt, lineText: info.line.text, hint: 'про чашку', answer: info.answers[0] }
    const empty = renderToStaticMarkup(<SceneTaskSheet {...base} phase="ready" typed="" />)
    expect(empty).toContain('Что ответил Барсик?')
    expect(empty).toContain('Напиши по-русски')
    expect(empty).toContain('Ещё раз')
    expect(empty).toMatch(/Проверить<\/button>/)
    expect(empty).toContain('disabled=""')
    expect(empty).toContain('twShift')
    const typed = renderToStaticMarkup(<SceneTaskSheet {...base} phase="answering" typed="Он нормальный" wrong attempt={1} />)
    expect(typed).toContain('Он нормальный')
    expect(typed).toContain('Не совсем. Подсказка: про чашку.')
    expect(typed).toContain('одна попытка')
    expect(typed).toContain('twLower')
    const ok = renderToStaticMarkup(<SceneTaskSheet {...base} phase="checked" typed="Он нормальный, чашка маленькая" ok result={{ matchedAnswer: info.answers[0] }} />)
    expect(ok).toContain('✓ Верно!')
    expect(ok).toContain(info.answers[0])
    expect(ok).toContain('class="stVerdictLine">It&#x27;s not big.')
    expect(ok).toContain('Готово')
    const bad = renderToStaticMarkup(<SceneTaskSheet {...base} phase="checked" typed="ведро" ok={false} result={{ matchedAnswer: info.answers[0] }} />)
    expect(bad).toContain('Не вышло. Правильный перевод:')
    expect(bad).toContain('Твой ответ: «ведро»')
    const gave = renderToStaticMarkup(<SceneTaskSheet {...base} phase="checked" typed="" gaveUp result={{ matchedAnswer: info.answers[0] }} />)
    expect(gave).toContain('>Правильный перевод:<')
  })
})
