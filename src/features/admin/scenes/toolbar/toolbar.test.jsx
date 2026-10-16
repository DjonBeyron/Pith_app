import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BuilderToolbar from '../BuilderToolbar.jsx'
import BackConfirm from './BackConfirm.jsx'
import { menuKeyAction } from './menuKeys.js'
import { buildToolbarActions, splitByWidth, groupActions, menuItems, backDecision, runBackChoice } from './toolbarModel.js'
import { demoCafeScene } from '../../../scene/v2/demoScenes.js'

// Раскладка тулбара по режимам, «Назад» (решение и три исхода диалога), меню «⋯» на узком окне.
const base = { save: { label: 'Сохранить', run() {}, disabled: false }, onNew() {}, theme: 'dark', onToggleTheme() {}, panels: { has: true, allCollapsed: false, toggle() {} } }
const voice = { run() {}, disabled: false }
const apply = { label: 'Применить к ноде', run() {}, disabled: false }
const ids = list => list.map(a => a.id)

describe('toolbarModel — какие кнопки в каких режимах', () => {
  it('admin: файл → озвучка → сервис; «Применить» нет; Сохранить — главная', () => {
    const l = buildToolbarActions({ ...base, mode: 'admin', voice, apply })
    expect(ids(l)).toEqual(['save', 'new', 'voiceAll', 'collapseAll', 'theme'])
    expect(l.find(a => a.id === 'save').primary).toBe(true)
  })
  it.each(['node', 'module'])('%s: «Применить» первая в группе файла и главная, «Сохранить» вторична', mode => {
    const l = buildToolbarActions({ ...base, mode, voice, apply })
    expect(ids(l)).toEqual(['apply', 'save', 'new', 'voiceAll', 'collapseAll', 'theme'])
    expect(l.find(a => a.id === 'apply').primary).toBe(true)
    expect(l.find(a => a.id === 'save').primary).toBe(false)
  })
  it('без озвучки и без панелей — этих кнопок нет; группы по порядку', () => {
    const l = buildToolbarActions({ ...base, mode: 'admin', panels: null })
    expect(ids(l)).toEqual(['save', 'new', 'theme'])
    expect(groupActions(l).map(g => g.id)).toEqual(['file', 'service'])
  })
})

describe('группы тулбара и меню «Ещё»', () => {
  const full = () => buildToolbarActions({
    ...base, mode: 'admin', voice, feedTest: { run() {}, hint: 'x' }, saveAs: { run() {}, hint: 'h' }, publish: { label: 'Опубликовать', run() {}, hint: 'h' }, copyId: { run() {}, hint: 'id' },
    modes: { effective: { display: 'text', voice: { original: true, translation: false } }, overridden: { display: false, original: false, translation: false, any: false }, set() {}, makeDefault() {} },
  })
  it('состав групп: Файл, Просмотр и тест, Озвучка, Сервис — с подсказками', () => {
    const g = groupActions(full())
    expect(g.map(x => x.id)).toEqual(['file', 'preview', 'voice', 'service'])
    expect(g.map(x => x.label)).toEqual(['Файл', 'Просмотр и тест', 'Озвучка', 'Сервис'])
    expect(g.every(x => x.hint)).toBe(true)
    expect(Object.fromEntries(g.map(x => [x.id, ids(x.items)]))).toEqual({
      file: ['save', 'new', 'saveAs', 'publish'],
      preview: ['display', 'voiceOriginal', 'voiceTranslation', 'makeDefault', 'feedTest'],
      voice: ['voiceAll'],
      service: ['collapseAll', 'theme', 'copyId'],
    })
  })
  it('широкое окно: на панели основные, второстепенное (more) — только в «Ещё»', () => {
    const { bar, menu } = splitByWidth(full(), false)
    expect(ids(bar)).toEqual(['save', 'new', 'display', 'voiceOriginal', 'voiceTranslation', 'makeDefault', 'feedTest', 'voiceAll'])
    expect(ids(menu)).toEqual(['saveAs', 'publish', 'collapseAll', 'theme', 'copyId'])
  })
  it('узкое окно: на панели только «Сохранить»; всё остальное в «Ещё» по группам', () => {
    const { bar, menu } = splitByWidth(full(), true)
    expect(ids(bar)).toEqual(['save'])
    const items = menuItems(menu)
    expect(items.filter(i => i.heading).map(i => i.heading)).toEqual(['Файл', 'Просмотр и тест', 'Озвучка', 'Сервис'])
    expect(items[0]).toMatchObject({ id: 'new', heading: 'Файл' })
  })
  it('основные действия всегда на виду: Сохранить (и Применить в ноде) не уходят в меню ни на какой ширине', () => {
    for (const narrow of [false, true]) {
      expect(ids(splitByWidth(buildToolbarActions({ ...base, mode: 'admin', voice }), narrow).bar)).toContain('save')
      expect(ids(splitByWidth(buildToolbarActions({ ...base, mode: 'node', apply }), narrow).bar)).toContain('apply')
    }
  })
  it('узкое окно: на панели только pinned, остальное в меню; пункты «Озвучить»', () => {
    const l = buildToolbarActions({ ...base, mode: 'admin', voice })
    const n = splitByWidth(l, true)
    expect(ids(n.bar)).toEqual(['save'])
    expect(ids(n.menu)).toEqual(['new', 'voiceAll', 'collapseAll', 'theme'])
    expect(menuItems(n.menu).map(a => a.id)).toEqual(['new', 'voiceAll:voiceAllBoth', 'voiceAll:voiceText', 'voiceAll:voiceTranslation', 'collapseAll', 'theme'])
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
  it('«Ещё» есть всегда (на узком окне в нём и остальные действия); в открытом меню — подписи групп', () => {
    const wide = render({ forceNarrow: false })
    expect(wide).toContain('aria-label="Ещё действия"')
    expect(wide).toContain('aria-haspopup="menu"')
    expect(wide).toContain('aria-expanded="false"')
    expect(wide).not.toContain('role="menu"')
    const open = render({ forceNarrow: true, menuOpen: true, voice: { busy: false, openAll() {}, quota: null } })
    expect(open).toContain('role="menu"')
    expect(open).toContain('role="group" aria-label="Файл"')
    expect(open).toContain('Озвучить: всё (текст и перевод)')
    expect(open).toContain('Озвучить: только перевод')
    expect(open).toContain('role="menuitem"')
    expect(open).toContain('Новая')
    expect(open).toContain('Копировать id сцены')
  })
  it('широкое окно: в «Ещё» — Сохранить как…, Опубликовать, тема; «Назад», «Сохранить» на панели', () => {
    const html = render({ forceNarrow: false, menuOpen: true, onSaveAs() {}, onTogglePublish() {} })
    expect(html).toContain('Сохранить как…')
    expect(html).toContain('Опубликовать')
    expect(html).toContain('Светлая тема окна') // theme="dark" → предлагает светлую
    expect(html).toContain('data-action="save"')
    expect(html).toContain('scbBack')
  })
  it('шапка: название сцены кнопкой-полем и статус; служебного поля id нет', () => {
    const html = render({})
    expect(html).toContain('id="f-title"')
    expect(html).toContain('Название сцены:')
    expect(html).toContain('Новая · не сохранена')
    expect(html).not.toContain('id="f-id"')
    expect(html).not.toMatch(/>id</)
  })
  it('индикаторы озвучки: озвучено X из N, квота', () => {
    const html = render({ unsaved: true, voice: { busy: false, openAll() {}, quota: { used: 10, limit: 100 } } })
    expect(html.replace(/<!-- -->/g, "")).toContain("озвучено 0 из 5")
    expect(html).toContain('квота')
  })
})

describe('клавиши меню «Ещё»', () => {
  it('закрыто: только ↓ открывает; открыто: Esc закрывает, стрелки/Home/End ходят, Tab закрывает', () => {
    expect(menuKeyAction('ArrowDown', false)).toBe('open')
    expect(menuKeyAction('Escape', false)).toBe(null)
    expect(menuKeyAction('Escape', true)).toBe('close')
    expect(menuKeyAction('ArrowDown', true)).toBe('next')
    expect(menuKeyAction('ArrowUp', true)).toBe('prev')
    expect(menuKeyAction('Home', true)).toBe('first')
    expect(menuKeyAction('End', true)).toBe('last')
    expect(menuKeyAction('Tab', true)).toBe('tab')
    expect(menuKeyAction('a', true)).toBe(null)
  })
})
