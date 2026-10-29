import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WordLaneMirror from './WordLaneMirror.jsx'
import { measureTake } from './mirrorMeasure.js'
import { noteFor } from './mirrorNotes.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN, STUDENT_MISSING, STUDENT_PAUSE } from './mirrorFixtures.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const dictor = { ...DICTOR, play: () => Promise.resolve(), leadMs: 0 }
const render = (studentData, extra = {}) => {
  const student = studentData ? { ...studentData, url: 'blob:take' } : undefined
  const measure = student ? measureTake({ dictor: DICTOR, student, chunks: CHUNKS }) : null
  return renderToStaticMarkup(createElement(WordLaneMirror, { dictor, student, chunks: CHUNKS, measure, note: measure ? noteFor(measure, CHUNKS) : undefined, onDone: () => {}, ...extra }))
}
const count = (html, re) => (html.match(re) ?? []).length

describe('WordLaneMirror: экран сравнения', () => {
  it('две полосы «Пит» и «Ты», пилюли по кускам, «Сравнить», заметка, «Дальше», <audio> с записью', () => {
    const html = render(STUDENT_CLEAN)
    expect(count(html, /class="wlMirLane"/g)).toBe(2)
    expect(html).toContain('<b>Пит</b>')
    expect(html).toContain('<b>Ты</b>')
    expect(count(html, /class="wlMirPill"/g)).toBe(6) // три куска × две полосы
    for (const c of CHUNKS) expect(html).toContain(`>${c.replace("'", '&#x27;')}</span>`)
    expect(html).toContain('>Сравнить</button>')
    expect(html).toContain('Порядок верный, темп мой. Чисто.')
    expect(html).toContain('data-key="clean"')
    expect(html).toContain('>Дальше</button>')
    expect(html).toContain('<audio src="blob:take"')
    expect(html.indexOf('wlMirNote')).toBeGreaterThan(html.indexOf('wl-mirror-compare')) // заметка под полосами и кнопкой
    expect(html.indexOf('wl-mirror-done')).toBeGreaterThan(html.indexOf('wlMirNote')) // «Дальше» — после заметки
  })
  it('пропуск: у человека пунктирный «призрак» вместо куска, заметка про потерю', () => {
    const html = render(STUDENT_MISSING)
    expect(count(html, /data-ghost="true"/g)).toBe(1)
    expect(html).toContain('„trying“ потерялось.')
  })
  it('долгая пауза: подсвеченный зазор и заметка про паузу', () => {
    const html = render(STUDENT_PAUSE)
    expect(count(html, /class="wlMirGap"/g)).toBe(1)
    expect(html).toContain('Пауза перед „to learn“ длиннее, чем у меня. Склей.')
  })
  it('заметка не передана — считается из измерения', () => {
    const html = render(STUDENT_MISSING, { note: undefined })
    expect(html).toContain('„trying“ потерялось.')
  })
  it('запись не получилась: только полоса диктора, заметка о сбое, «Дальше» доступна, <audio> нет', () => {
    const html = render(null)
    expect(count(html, /class="wlMirLane"/g)).toBe(1)
    expect(html).not.toContain('<b>Ты</b>')
    expect(html).not.toContain('<audio')
    expect(html).toContain('Запись не получилась — попробуем в следующий раз.')
    expect(html).toContain('data-fail="true"')
    expect(html).toContain('>Дальше</button>')
    expect(html).toContain('>Послушать</button>')
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*data-testid="wl-mirror-done"/)
  })
  it('запись есть, но url пуст (дубль потерян) — тот же режим сбоя, даже если сценарий передал свою заметку', () => {
    const html = renderToStaticMarkup(createElement(WordLaneMirror, { dictor, student: { url: '', words: [], durationMs: 0 }, chunks: CHUNKS, measure: null, note: { key: 'clean', text: 'Чисто.' }, onDone() {} }))
    expect(html).toContain('Запись не получилась')
    expect(html).not.toContain('Чисто.')
  })
  it('без диктора (нет play) и без записи кнопки сравнения нет, «Дальше» остаётся', () => {
    const html = renderToStaticMarkup(createElement(WordLaneMirror, { dictor: { words: [], durationMs: 0 }, student: null, chunks: CHUNKS, measure: null, onDone() {} }))
    expect(html).not.toContain('wl-mirror-compare')
    expect(html).toContain('wl-mirror-done')
  })
  it('бюджет узлов экрана: ≤ 60 DOM-узлов', () => {
    for (const s of [STUDENT_CLEAN, STUDENT_MISSING, STUDENT_PAUSE]) expect(count(render(s), /<[a-z]/g)).toBeLessThanOrEqual(60)
  })
})

describe('стиль: 375 px, только opacity/transform, подключен в index.css', () => {
  const css = read('../../../styles/player/modules/rehearsal-mirror.css')
  it('нет жёстких ширин больше экрана; полосы на всю ширину с полями 16 px', () => {
    expect(css).not.toMatch(/[^-]width:\s*(\d{3,})px/)
    expect(css).toMatch(/\.wlMirror \{[^}]*width: 100%/)
    expect(css).toMatch(/\.wlMirror \{[^}]*box-sizing: border-box/)
    expect(css).toMatch(/max\(16px, env\(safe-area-inset-left\)\)/)
  })
  it('анимируются только opacity и transform', () => {
    const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map(m => m[1])
    expect(transitions.length).toBeGreaterThan(0)
    for (const t of transitions) expect(t.split(',').every(p => /^\s*(opacity|transform|none)\b/.test(p))).toBe(true)
    expect(css).not.toMatch(/@keyframes|filter:|transition:[^;]*(width|left|height|top|box-shadow|background)/)
  })
  it('файл стилей подключён в index.css', () => {
    expect(read('../../../index.css')).toContain("@import './styles/player/modules/rehearsal-mirror.css';")
  })
})
