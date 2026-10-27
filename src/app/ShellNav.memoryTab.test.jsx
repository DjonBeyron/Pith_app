import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ShellNav from './ShellNav.jsx'
import { learnTap } from './navTap.js'

// Вкладка «Память» на нижней панели у нового пользователя: скрыта / мерцает / обычная (memoryTab.js)
const html = memoryTab => renderToStaticMarkup(<ShellNav tab="feed" setTab={() => {}} memoryTab={memoryTab} />)

describe('ShellNav: вкладка «Память»', () => {
  it('hidden — кнопки нет (и цели полёта data-nav тоже), остальные на месте', () => {
    const out = html('hidden')
    expect(out).not.toContain('data-nav="learn"')
    expect(out).not.toContain('Память')
    for (const t of ['Уроки', 'Профиль', 'Рейтинг']) expect(out).toContain(t)
  })

  it('blink — кнопка есть и мерцает', () => {
    const out = html('blink')
    expect(out).toContain('data-nav="learn"')
    expect(out).toContain('shellV2NavBtn--blink')
  })

  it('normal и без параметра (старые вызовы) — обычная кнопка без мерцания', () => {
    for (const out of [html('normal'), renderToStaticMarkup(<ShellNav tab="feed" setTab={() => {}} />)]) {
      expect(out).toContain('data-nav="learn"')
      expect(out).not.toContain('shellV2NavBtn--blink')
    }
  })
})

describe('learnTap: нажатие на «Память»', () => {
  it('первое нажатие отмечается и переключает на вкладку', () => {
    const setTab = vi.fn(), onMemoryTap = vi.fn(), requestHome = vi.fn()
    learnTap('feed', { setTab, requestHome, onMemoryTap })
    expect(onMemoryTap).toHaveBeenCalledTimes(1)
    expect(setTab).toHaveBeenCalledWith('learn')
    expect(requestHome).not.toHaveBeenCalled()
  })

  it('на уже активной «Памяти» — ещё и «домой»', () => {
    const setTab = vi.fn(), onMemoryTap = vi.fn(), requestHome = vi.fn()
    learnTap('learn', { setTab, requestHome, onMemoryTap })
    expect(requestHome).toHaveBeenCalledTimes(1)
    expect(setTab).toHaveBeenCalledWith('learn')
  })

  it('без onMemoryTap не падает', () => {
    expect(() => learnTap('feed', { setTab: () => {}, requestHome: () => {} })).not.toThrow()
  })
})
