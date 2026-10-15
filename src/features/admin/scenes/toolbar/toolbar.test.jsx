import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BuilderToolbar from '../BuilderToolbar.jsx'
import BackConfirm from './BackConfirm.jsx'
import { buildToolbarActions, splitByWidth, groupActions, backDecision, runBackChoice } from './toolbarModel.js'
import { demoCafeScene } from '../../../scene/v2/demoScenes.js'

// Раскладка тулбара по режимам, «Назад» (решение и три исхода диалога), меню «⋯» на узком окне.
const base = { save: { label: 'Сохранить', run() {}, disabled: false }, onNew() {}, theme: 'dark', onToggleTheme() {}, panels: { has: true, allCollapsed: false, toggle() {} } }
const voice = { run() {}, disabled: false }
const apply = { label: 'Применить к ноде', run() {}, disabled: false }
const ids = list => list.map(a => a.id)

describe('toolbarModel — какие кнопки в каких режимах', () => {
  it('admin: озвучка, сохранить (главная), новая, вид; «Применить» нет', () => {
    const l = buildToolbarActions({ ...base, mode: 'admin', voice, apply })
    expect(ids(l)).toEqual(['voiceAll', 'save', 'new', 'collapseAll', 'theme'])
    expect(l.find(a => a.id === 'save').primary).toBe(true)
  })
  it.each(['node', 'module'])('%s: «Применить» первая в группе сцены и главная, «Сохранить» вторична', mode => {
    const l = buildToolbarActions({ ...base, mode, voice, apply })
    expect(ids(l)).toEqual(['voiceAll', 'apply', 'save', 'new', 'collapseAll', 'theme'])
    expect(l.find(a => a.id === 'apply').primary).toBe(true)
    expect(l.find(a => a.id === 'save').primary).toBe(false)
  })
  it('без озвучки и без панелей — этих кнопок нет; группы по порядку', () => {
    const l = buildToolbarActions({ ...base, mode: 'admin', panels: null })
    expect(ids(l)).toEqual(['save', 'new', 'theme'])
    expect(groupActions(l).map(g => g.id)).toEqual(['scene', 'view'])
  })
  it('узкое окно: на панели только pinned, остальное в меню; широкое — всё на панели', () => {
    const l = buildToolbarActions({ ...base, mode: 'admin', voice })
    expect(ids(splitByWidth(l, false).bar)).toEqual(ids(l))
    expect(splitByWidth(l, false).menu).toEqual([])
    const n = splitByWidth(l, true)
    expect(ids(n.bar)).toEqual(['save'])
    expect(ids(n.menu)).toEqual(['voiceAll', 'new', 'collapseAll', 'theme'])
    const embedded = splitByWidth(buildToolbarActions({ ...base, mode: 'node', apply }), true)
    expect(ids(embedded.bar)).toEqual(['apply'])
  })
})

describe('«Назад»', () => {
  it('решение: озвучка → blocked; правки → confirm; чисто → close', () => {
    expect(backDecision({ voiceBusy: true, dirty: true })).toBe('blocked')
    expect(backDecision({ voiceBusy: false, dirty: true })).toBe('confirm')
    expect(backDecision({ voiceBusy: false, dirty: false })).toBe('close')
  })
  it('исходы диалога: сохранить → закрыть; не сохранять → закрыть без сохранения; остаться → ничего', async () => {
    const mk = ok => ({ save: vi.fn(async () => ok), close: vi.fn() })
    let d = mk(true)
    expect(await runBackChoice('save', d)).toBe('closed'); expect(d.save).toHaveBeenCalled(); expect(d.close).toHaveBeenCalled()
    d = mk(true)
    expect(await runBackChoice('discard', d)).toBe('closed'); expect(d.save).not.toHaveBeenCalled(); expect(d.close).toHaveBeenCalled()
    d = mk(true)
    expect(await runBackChoice('stay', d)).toBe('stayed'); expect(d.save).not.toHaveBeenCalled(); expect(d.close).not.toHaveBeenCalled()
    d = mk(false)
    expect(await runBackChoice('save', d)).toBe('stayed'); expect(d.close).not.toHaveBeenCalled()
  })
  it('диалог: три кнопки; закрыт — пусто; без возможности сохранить — «Сохранить» заблокирована', () => {
    expect(renderToStaticMarkup(<BackConfirm open={false} onChoose={() => {}} />)).toBe('')
    const html = renderToStaticMarkup(<BackConfirm open onChoose={() => {}} />)
    for (const t of ['Сохранить', 'Не сохранять', 'Остаться']) expect(html).toContain(t)
    expect(html).toContain('role="alertdialog"')
    const off = renderToStaticMarkup(<BackConfirm open canSave={false} reason="Таблицы нет" onChoose={() => {}} />)
    expect(off).toMatch(/<button[^>]*disabled[^>]*>Сохранить/)
    expect(off).toContain('Таблицы нет')
  })
})

describe('BuilderToolbar — разметка', () => {
  const draft = { scene: { ...demoCafeScene }, saved: { id: null, status: 'draft' }, dirty: true, errors: [], restoredAt: null, actions: {} }
  const render = props => renderToStaticMarkup(
    <BuilderToolbar draft={draft} library={{ busy: false, missingTable: false }} status={null} setStatus={() => {}} onSave={() => {}} onBack={() => {}} backRef={{ current: null }} theme="dark" onToggleTheme={() => {}} {...props} />,
  )
  it('«Назад» первая кнопка, крестика нет', () => {
    const html = render({})
    expect(html.indexOf('Назад')).toBeGreaterThan(-1)
    expect(html.indexOf('scbBack')).toBeLessThan(html.indexOf('Название'))
    expect(html).not.toContain('Закрыть окно')
  })
  it('широкое окно — меню «⋯» нет; узкое — кнопка «⋯», в открытом меню действия', () => {
    expect(render({ forceNarrow: false })).not.toContain('Ещё действия')
    const n = render({ forceNarrow: true })
    expect(n).toContain('aria-label="Ещё действия"')
    expect(n).toContain('aria-haspopup="menu"')
    expect(n).not.toContain('role="menu"')
    const open = render({ forceNarrow: true, menuOpen: true, voice: { busy: false, openAll() {}, quota: null } })
    expect(open).toContain('role="menu"')
    expect(open).toContain('Озвучить всё')
    expect(open).toContain('role="menuitem"')
    expect(open).toContain('Новая')
  })
  it('индикаторы: не в библиотеке, несохранённое, озвучено X из N', () => {
    const html = render({ unsaved: true, voice: { busy: false, openAll() {}, quota: { used: 10, limit: 100 } } })
    expect(html).toContain('не в библиотеке')
    expect(html).toContain('есть несохранённое')
    expect(html.replace(/<!-- -->/g, "")).toContain("озвучено 0 из 5")
    expect(html).toContain('квота')
  })
})
