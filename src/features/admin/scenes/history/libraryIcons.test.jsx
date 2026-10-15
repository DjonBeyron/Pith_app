import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneLibrary from '../SceneLibrary.jsx'
import UndoRedoButtons from './UndoRedoButtons.jsx'

// «Мои сцены»: действия строки — иконочный ряд с aria-label у каждой кнопки; подписи остаются у главного
// действия («Использовать») и у действия с последствиями («Сохранить как новую»). Тулбар: Отменить/Повторить.

const noop = () => {}
const rows = [
  { id: 'r1', title: 'Кофе-брейк', status: 'draft', updated_at: '2026-10-15T10:00:00Z' },
  { id: 'r2', title: 'Про работу', status: 'published', updated_at: '2026-10-15T11:00:00Z' },
]
const draft = { saved: { id: 'r1' }, errors: [], dirty: false, scene: {}, actions: {} }
const library = { items: rows, loading: false, error: '', missingTable: false, busy: false, refresh: noop }
const html = () => renderToStaticMarkup(<SceneLibrary draft={draft} library={library} onOpenRow={noop} onSave={noop} setStatus={noop} />)

describe('SceneLibrary — иконочный ряд', () => {
  it('у каждой строки: открыть, опубликовать/в черновик, переименовать, дублировать, удалить — с aria-label и title', () => {
    const out = html()
    for (const label of ['Открыть в сборщике', 'Опубликовать в ленту', 'Снять с публикации (в черновик)', 'Переименовать', 'Дублировать', 'Удалить']) {
      expect(out.match(new RegExp(`aria-label="${label.replace(/[()]/g, '\\$&')}"`, 'g'))?.length ?? 0).toBeGreaterThanOrEqual(1)
      expect(out).toContain(`title="${label}`)
    }
    expect(out.match(/aria-label="Дублировать"/g)).toHaveLength(2)
    expect(out).toContain('aria-label="Действия со сценой «Кофе-брейк»"')
  })
  it('иконочные кнопки — общий класс scbIcon, а текстовых подписей у них нет', () => {
    const btns = [...html().matchAll(/<button[^>]*class="scbIcon[^"]*"[^>]*>(.*?)<\/button>/g)]
    expect(btns.length).toBeGreaterThanOrEqual(10)
    for (const b of btns) expect(b[1].replace(/<svg.*?<\/svg>/g, '')).toBe('')
  })
  it('подписи сохранены: «Сохранить как новую» и «Использовать»; старых текстовых кнопок нет', () => {
    const out = html()
    expect(out).toContain('Сохранить как новую')
    expect(out).toContain('Использовать')
    expect(out).not.toMatch(/>(Переименовать|Дублировать|Опубликовать|В черновик|Обновить)</)
  })
})

describe('UndoRedoButtons', () => {
  const ctl = (over = {}) => ({ canUndo: true, canRedo: false, undoLabel: 'удаление реплики 3', redoLabel: null, undo: noop, redo: noop, ...over })
  it('подсказка называет шаг; пустой «Повторить» disabled', () => {
    const out = renderToStaticMarkup(<UndoRedoButtons ctl={ctl()} />)
    expect(out).toContain('aria-label="Отменить: удаление реплики 3"')
    expect(out).toContain('title="Отменить: удаление реплики 3 (Ctrl+Z)"')
    expect(out).toMatch(/data-action="redo"[^>]*disabled=""/)
    expect(out).not.toMatch(/data-action="undo"[^>]*disabled/)
  })
  it('пустой стек: обе кнопки disabled, подписи без шага', () => {
    const out = renderToStaticMarkup(<UndoRedoButtons ctl={ctl({ canUndo: false, undoLabel: null })} />)
    expect(out).toContain('aria-label="Отменить"')
    expect(out).toContain('aria-label="Повторить"')
    expect(out.match(/disabled=""/g)).toHaveLength(2)
  })
  it('есть что повторить — в подписи шаг', () => {
    const out = renderToStaticMarkup(<UndoRedoButtons ctl={ctl({ canRedo: true, redoLabel: 'удаление всех реплик' })} />)
    expect(out).toContain('aria-label="Повторить: удаление всех реплик"')
  })
})
