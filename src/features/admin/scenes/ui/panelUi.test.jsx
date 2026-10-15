import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Panel from './Panel.jsx'
import CollapseAllButton from './CollapseAllButton.jsx'
import PanelColumn from './PanelColumn.jsx'
import { PanelCtx } from './panelContext.js'
import { panelLintState } from '../lintPanelMap.js'
import { setAllCollapsed, allCollapsed } from './panelModel.js'

// Разметка панели без DOM: свёрнутый мини-блок, красная рамка/заголовок при ошибке,
// янтарная метка при предупреждении, вложенность, «Свернуть все»
const ctx = (over = {}) => ({
  collapsed: [], fullscreen: null, lintState: {}, register: vi.fn(() => () => {}),
  isCollapsed: k => (over.collapsed ?? []).includes(k), toggle: vi.fn(), set: vi.fn(), expand: vi.fn(), setAll: vi.fn(),
  allCollapsed: vi.fn(() => false), hasPanels: vi.fn(() => true), setFullscreen: vi.fn(), exitFullscreen: vi.fn(),
  ...over,
})
const render = (ui, value) => renderToStaticMarkup(<PanelCtx.Provider value={value}>{ui}</PanelCtx.Provider>)

describe('Panel', () => {
  it('развёрнутая: заголовок, кнопки «на весь экран» и «свернуть», тело видно', () => {
    const html = render(<Panel id="timeline" title="Реплики"><p>тело</p></Panel>, ctx())
    expect(html).toContain('data-panel="timeline"')
    expect(html).not.toContain('data-collapsed')
    expect(html).toContain('На весь экран: Реплики')
    expect(html).toContain('Свернуть: Реплики')
    expect(html).toContain('<p>тело</p>')
    expect(html).not.toContain('hidden=""')
  })

  it('свёрнутая — мини-блок: тело скрыто (hidden, не размонтировано), только «развернуть»', () => {
    const html = render(<Panel id="timeline" title="Реплики" extra={<button>действие</button>}><p>тело</p></Panel>, ctx({ collapsed: ['timeline'] }))
    expect(html).toContain('data-collapsed="1"')
    expect(html).toContain('hidden=""')
    expect(html).toContain('<p>тело</p>') // состояние полей не теряется
    expect(html).not.toContain('На весь экран')
    expect(html).not.toContain('действие') // кнопки шапки у мини-блока спрятаны
    expect(html).toContain('Развернуть: Реплики')
  })

  it('ошибка линтера: data-tone="error" и счётчик у панели и у родителя; warn — янтарная метка', () => {
    const lintState = panelLintState([{ level: 'error', text: 'timeline[1].text — пусто' }, { level: 'warn', text: 'characters — одно имя' }])
    const html = render(
      <Panel id="timeline" title="Реплики"><Panel id="timeline.1" title="Реплика 2" nested as="h4"><i /></Panel><Panel id="timeline.0" title="Реплика 1" nested as="h4"><i /></Panel></Panel>,
      ctx({ lintState, collapsed: ['timeline'] }),
    )
    expect(html).toMatch(/data-panel="timeline"[^>]*data-collapsed="1"[^>]*data-tone="error"/)
    expect(html).toMatch(/data-panel="timeline.1"[^>]*data-tone="error"/)
    expect(html).not.toMatch(/data-panel="timeline.0"[^>]*data-tone/)
    expect(html).toContain('aria-label="Ошибок линтера: 1"')
    const warn = render(<Panel id="characters" title="Персонажи"><i /></Panel>, ctx({ lintState }))
    expect(warn).toMatch(/data-panel="characters"[^>]*data-tone="warn"/)
    expect(warn).toContain('scbPanelBadge-warn')
    expect(warn).not.toContain('scbPanelBadge-error')
  })

  it('label даёт текст aria, когда title — разметка; fullscreen — data-fullscreen и «Вернуть»', () => {
    const html = render(<Panel id="slots" title={<>Ячейки <b>?</b></>} label="Ячейки предметов"><i /></Panel>, ctx({ fullscreen: 'slots' }))
    expect(html).toContain('Свернуть: Ячейки предметов')
    expect(html).toContain('data-fullscreen="1"')
    expect(html).toContain('Вернуть панель на место (Esc)')
    expect(html).toContain('aria-pressed="true"')
  })

  it('без провайдера — работает с локальным состоянием', () => {
    const html = renderToStaticMarkup(<Panel id="x" title="Один"><i /></Panel>)
    expect(html).toContain('data-panel="x"')
  })
})

describe('CollapseAllButton', () => {
  it('подпись по состоянию колонки; без панелей — ничего', () => {
    const c = ctx({ allCollapsed: vi.fn(() => true) })
    expect(render(<PanelColumn name="settings"><CollapseAllButton column="settings" /></PanelColumn>, c)).toContain('Развернуть все')
    expect(render(<CollapseAllButton column={null} />, ctx())).toContain('Свернуть все')
    expect(render(<CollapseAllButton column="scene" />, ctx({ hasPanels: () => false }))).toBe('')
    expect(renderToStaticMarkup(<CollapseAllButton />)).toBe('')
  })
  it('модель «свернуть все» по колонке не трогает вложенные', () => {
    const keys = ['location', 'slots', 'slots.local']
    const c = setAllCollapsed(['slots.local'], keys, true)
    expect(c).toEqual(['slots.local', 'location', 'slots'])
    expect(allCollapsed(c, keys)).toBe(true)
  })
})
