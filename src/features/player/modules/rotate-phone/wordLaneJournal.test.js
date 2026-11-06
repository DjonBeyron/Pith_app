import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { journalHeader, buildJournalFile, copyText, COPY_HOW } from './wordLaneJournal.js'
import { createGameJournal } from '../../../../shared/lib/gameJournal.js'

// «Скачать журнал» / «Скопировать журнал» в шестерёнке игры: txt с заголовком (версия, устройство, режим, модели), копирование — clipboard или запасной путь.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('журнал из шестерёнки', () => {
  it('заголовок: версия, устройство, режим говорю / тапаю, русская модель, снимок звука', () => {
    const h = journalHeader({ version: '3.3.123', ua: 'iPhone OS 18_7', tap: true, ru: false, en: 'готов', snap: 'ctx=running' }).join('\n')
    expect(h).toContain('v3.3.123'); expect(h).toContain('устройство: iPhone OS 18_7'); expect(h).toContain('режим: тапаю (без микрофона)')
    expect(h).toContain('русская модель Vosk: не готова; английская: готов'); expect(h).toContain('сейчас: ctx=running')
    expect(journalHeader({ tap: false, ru: true }).join('\n')).toMatch(/режим: говорю \(микрофон\)[\s\S]*русская модель Vosk: готова/)
  })
  it('файл: pithy-journal-<дата-время>.txt, текст = заголовок + строки журнала', async () => {
    const journal = createGameJournal({ now: () => 5, clock: () => new Date(2026, 10, 6, 9, 8, 7) })
    journal.add('[start] итог: …')
    const f = buildJournalFile({ header: ['шапка'], journal, at: new Date(2026, 10, 6, 9, 8, 7) })
    expect(f.name).toBe('pithy-journal-2026-11-06_09-08-07.txt')
    expect(f.text.split('\n')[0]).toBe('шапка'); expect(f.text).toContain('[start] итог: …')
    expect(await f.blob.text()).toBe(f.text)
  })
  it('копирование: clipboard API; отказ — скрытое поле и execCommand; ничего — честная подсказка', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    expect(await copyText('abc', { nav: { clipboard: { writeText } } })).toBe('copied'); expect(writeText).toHaveBeenCalledWith('abc')
    const el = { setAttribute: vi.fn(), style: {}, select: vi.fn(), remove: vi.fn() }
    const doc = { createElement: () => el, body: { appendChild: vi.fn() }, execCommand: vi.fn(() => true) }
    expect(await copyText('x', { nav: { clipboard: { writeText: () => Promise.reject(new Error('нет')) } }, doc })).toBe('copied'); expect(doc.execCommand).toHaveBeenCalledWith('copy')
    expect(await copyText('x', { nav: {}, doc: { ...doc, execCommand: () => false } })).toBe('failed')
    expect(COPY_HOW.failed).toContain('Скачать журнал')
  })
  it('шестерёнка: пункты «Скачать журнал» и «Скопировать журнал» — первыми, под сводкой; на паузе шестерёнка над подложкой', () => {
    const hud = read('./WordLaneHud.jsx'), css = read('../../../../styles/player/modules/word-lane-hud.css'), pause = read('../../../../styles/player/modules/word-lane-pause.css')
    expect(hud).toContain('data-testid="wl-hud-journal"'); expect(hud).toContain('data-testid="wl-hud-journal-copy"')
    expect(hud.indexOf('wl-hud-journal-row')).toBeLessThan(hud.indexOf('wl-hud-proc'))
    const z = Number(css.match(/\.wl\[data-phase='paused'\] \.wlHudBtn, \.wl\[data-phase='paused'\] \.wlHud \{ z-index: (\d+); \}/)?.[1])
    expect(z).toBeGreaterThan(Number(pause.match(/\.wlPauseBack \{[^}]*z-index: (\d+)/)[1]))
  })
})
