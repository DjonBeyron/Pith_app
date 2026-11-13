import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'

// «⬇ Скачать журнал игры · Скопировать» на итоге «Встряхни память» (RaceJournalLinks.jsx в RaceSummary.jsx): есть только при отладочном интерфейсе; нажатие зовёт формирование журнала из wordLaneJournal.js
// и отдачу файла (saveDebugFile — тот же путь, что в шестерёнке, с «Поделиться» на iPhone), не всплывает к экрану итога и не запускает выход. useState подменён: компонент зовётся как функция, кнопки — вызовом onClick.
const h = vi.hoisted(() => ({ states: [], i: 0, fake: false }))
vi.mock('react', async orig => {
  const real = await orig()
  return { ...real, useState: init => (h.fake ? (() => { const k = h.i++; if (!(k in h.states)) h.states[k] = typeof init === 'function' ? init() : init; return [h.states[k], v => { h.states[k] = v }] })() : real.useState(init)) }
})
const m = vi.hoisted(() => ({ file: { name: 'pithy-journal-x.txt', text: 'шапка\n[perf] кадр\n[start] итог', blob: null } }))
vi.mock('../player/modules/rotate-phone/wordLaneJournal.js', async orig => ({ ...(await orig()), buildJournalFile: vi.fn(() => m.file), copyText: vi.fn(() => Promise.resolve('copied')) }))
vi.mock('../player/modules/rotate-phone/wordLaneDebugExport.js', async orig => ({ ...(await orig()), saveDebugFile: vi.fn(() => Promise.resolve('share')) }))

import RaceSummary from './RaceSummary.jsx'
import RaceJournalLinks from './RaceJournalLinks.jsx'
import { buildJournalFile, copyText } from '../player/modules/rotate-phone/wordLaneJournal.js'
import { saveDebugFile } from '../player/modules/rotate-phone/wordLaneDebugExport.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const html = props => renderToStaticMarkup(createElement(RaceSummary, { plan, result: null, onDone() {}, ...props }))
const find = (node, id) => {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) { for (const n of node) { const r = find(n, id); if (r) return r } return null }
  if (node.props?.['data-testid'] === id) return node
  return find(node.props?.children, id)
}
const draw = () => { h.i = 0; return RaceJournalLinks() }
const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => { h.states = []; h.i = 0; h.fake = false; vi.clearAllMocks() })

describe('журнал игры на итоге', () => {
  it('при отладочном флаге — строка «Скачать журнал игры · Скопировать» под кнопками; без флага её нет', () => {
    const on = html({ journal: true }), off = html({})
    expect(on).toContain('data-testid="race-journal-save"'); expect(on).toContain('⬇ Скачать журнал игры'); expect(on).toContain('data-testid="race-journal-copy"')
    expect(on.indexOf('race-done')).toBeLessThan(on.indexOf('race-journal')) // под основными кнопками, не вместо них
    expect(off).not.toContain('race-journal'); expect(off).toContain('data-testid="race-done"')
  })
  it('«Скачать»: журнал из wordLaneJournal.buildJournalFile уходит в saveDebugFile; клик не всплывает и не трогает выход', async () => {
    h.fake = true
    const onDone = vi.fn(), e = { stopPropagation: vi.fn() }
    find(draw(), 'race-journal-save').props.onClick(e)
    expect(e.stopPropagation).toHaveBeenCalled()
    expect(buildJournalFile).toHaveBeenCalledTimes(1); expect(saveDebugFile).toHaveBeenCalledWith(m.file) // синхронно в обработчике — жест не теряется (iOS «Поделиться»)
    expect(h.states[0]).toBe('Готовлю журнал…')
    await flush()
    expect(h.states[0]).toBe('Файл отправлен через «Поделиться» (журнал)')
    expect(find(draw(), 'race-journal-status').props.children).toContain('«Поделиться»')
    expect(onDone).not.toHaveBeenCalled()
  })
  it('«Скопировать»: сжатый текст (без [perf]) в буфер, подсказка «вставь в чат»', async () => {
    h.fake = true
    find(draw(), 'race-journal-copy').props.onClick({ stopPropagation() {} })
    expect(copyText).toHaveBeenCalledWith('шапка\n[start] итог')
    await flush()
    expect(h.states[0]).toContain('вставь его в чат')
  })
  it('кнопки помечены data-no-unlock, флаг доходит из игры (RaceActs → dbg.enabled), шестерёнка и итог зовут один помощник', () => {
    const src = readFileSync(new URL('./RaceJournalLinks.jsx', import.meta.url), 'utf8')
    expect(src.match(/data-no-unlock=""/g)).toHaveLength(3) // скачать, скопировать, в GitHub
    expect(readFileSync(new URL('./RaceActs.jsx', import.meta.url), 'utf8')).toContain('journal={!!f.dbg?.enabled}')
    expect(readFileSync(new URL('../player/modules/rotate-phone/WordLaneHud.jsx', import.meta.url), 'utf8')).toContain("from './wordLaneJournalNow.js'")
    expect(readFileSync(new URL('../../styles/player/modules/race-final.css', import.meta.url), 'utf8')).not.toMatch(/filter\s*:/)
  })
})
