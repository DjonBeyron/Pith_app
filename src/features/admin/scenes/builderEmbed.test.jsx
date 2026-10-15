import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useBuilderDraft } from './useBuilderDraft.js'
import BuilderToolbar from './BuilderToolbar.jsx'
import { BACKUP_KEY } from './draftBackup.js'
import { demoCafeScene } from '../../scene/v2/demoScenes.js'

// Управляемый режим сборщика (сцена для ноды урока, canvas/NodeSceneBuilderHost):
// старт с initialScene, бэкап черновика админа не трогается, в тулбаре —
// «Применить к ноде», и она отдаёт текущую сцену черновика.

let store
beforeEach(() => {
  store = new Map([[BACKUP_KEY, JSON.stringify({ scene: { ...demoCafeScene, title: 'Черновик админа' }, savedId: null, at: '2026-10-14T00:00:00Z' })]])
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

function Probe({ initialScene, backup }) {
  const d = useBuilderDraft({ initialScene, backup })
  return <i data-title={d.scene.title} data-lines={d.scene.timeline.length} data-restored={d.restoredAt ? '1' : '0'} />
}

describe('useBuilderDraft — управляемый режим', () => {
  it('initialScene → черновик стартует с неё, а не с резервной копии', () => {
    const html = renderToStaticMarkup(<Probe initialScene={{ ...demoCafeScene, title: 'Сцена ноды' }} backup={false} />)
    expect(html).toContain('data-title="Сцена ноды"')
    expect(html).toContain('data-lines="5"')
    expect(html).toContain('data-restored="0"')
    // Бэкап админа цел
    expect(JSON.parse(store.get(BACKUP_KEY)).scene.title).toBe('Черновик админа')
  })

  it('без initialScene (режим админки) — восстанавливает резервную копию', () => {
    const html = renderToStaticMarkup(<Probe />)
    expect(html).toContain('data-title="Черновик админа"')
    expect(html).toContain('data-restored="1"')
  })
})

describe('BuilderToolbar — кнопка «Применить к ноде»', () => {
  const draft = (errors = []) => ({
    scene: { ...demoCafeScene }, saved: { id: null, status: 'draft' }, dirty: true, errors, restoredAt: null,
    actions: { setTitle() {}, setId() {}, reset() {}, dismissRestored() {} },
  })
  const library = { busy: false, missingTable: false }

  it('с onApply — кнопка есть и первая, заголовок свой; без onApply — нет', () => {
    const onApply = vi.fn()
    const html = renderToStaticMarkup(
      <BuilderToolbar draft={draft()} library={library} status={null} setStatus={() => {}} title="Сцена для ноды" onSave={() => {}} onApply={onApply} onBack={() => {}} backRef={{ current: null }} theme="dark" onToggleTheme={() => {}} />,
    )
    expect(html).toContain('Сцена для ноды')
    expect(html.indexOf('Применить к ноде')).toBeLessThan(html.indexOf('Сохранить в библиотеку'))
    expect(html).not.toContain('Применить к ноде" disabled')
    const plain = renderToStaticMarkup(
      <BuilderToolbar draft={draft()} library={library} status={null} setStatus={() => {}} onSave={() => {}} onBack={() => {}} backRef={{ current: null }} theme="dark" onToggleTheme={() => {}} />,
    )
    expect(plain).toContain('Сборщик сцен')
    expect(plain).not.toContain('Применить к ноде')
  })

  it('при ошибках линтера «Применить» заблокирована', () => {
    const html = renderToStaticMarkup(
      <BuilderToolbar draft={draft([{ level: 'error', text: 'x' }])} library={library} status={null} setStatus={() => {}} onSave={() => {}} onApply={() => {}} onBack={() => {}} backRef={{ current: null }} theme="dark" onToggleTheme={() => {}} />,
    )
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Применить к ноде/)
  })
})
