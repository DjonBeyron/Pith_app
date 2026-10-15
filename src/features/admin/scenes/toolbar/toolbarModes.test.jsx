import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BuilderToolbar from '../BuilderToolbar.jsx'
import ToolbarActions from './ToolbarActions.jsx'
import { buildToolbarActions, splitByWidth, menuItems, groupActions } from './toolbarModel.js'
import { demoCafeScene } from '../../../scene/v2/demoScenes.js'

// Тулбар: группа режимов предпросмотра (сегмент показа, тумблеры озвучки, «Сделать по умолчанию»),
// кнопка «Озвучить ▾» по наборам, раскладка в меню «⋯» на узком окне, разметка override
const base = { save: { label: 'Сохранить', run() {}, disabled: false }, onNew() {}, theme: 'dark', onToggleTheme() {}, panels: null }
const stats = { total: 5, ready: 2, stale: 0, none: 3, translation: { total: 5, ready: 0, stale: 0, none: 5, withText: 2 } }
const voice = { run: vi.fn(), disabled: false, stats, hint: 'h' }
const modes = (over = {}) => ({
  effective: { display: 'text', voice: { original: true, translation: false } },
  overridden: { display: false, original: false, translation: false, any: false },
  set: vi.fn(), makeDefault: vi.fn(), ...over,
})
const ids = l => l.map(a => a.id)

describe('toolbarModel — режимы и озвучка по наборам', () => {
  it.each(['admin', 'node', 'module'])('%s: группа modes впереди, затем voice/scene/view; «По умолчанию» заблокирована без переопределений', mode => {
    const l = buildToolbarActions({ ...base, mode, voice, modes: modes(), apply: mode === 'admin' ? null : { label: 'Применить', run() {} } })
    expect(ids(l).slice(0, 5)).toEqual(['display', 'voiceOriginal', 'voiceTranslation', 'makeDefault', 'voiceAll'])
    expect(groupActions(l).map(g => g.id)).toEqual(['modes', 'voice', 'scene', 'view'])
    expect(l.find(a => a.id === 'makeDefault').disabled).toBe(true)
    expect(l.find(a => a.id === 'display')).toMatchObject({ kind: 'segment', value: 'text' })
    expect(l.find(a => a.id === 'voiceOriginal')).toMatchObject({ kind: 'toggle', pressed: true })
    expect(l.find(a => a.id === 'voiceTranslation')).toMatchObject({ kind: 'toggle', pressed: false })
  })
  it('без modes/voice — группы пропускаются (старая раскладка)', () => {
    expect(ids(buildToolbarActions({ ...base, mode: 'admin' }))).toEqual(['save', 'new', 'theme'])
  })
  it('сегмент/тумблеры зовут modes.set; «По умолчанию» — makeDefault; overridden доходит до действий', () => {
    const m = modes({ overridden: { display: true, original: false, translation: true, any: true } })
    const l = buildToolbarActions({ ...base, mode: 'admin', modes: m })
    l.find(a => a.id === 'display').pick('both')
    expect(m.set).toHaveBeenCalledWith('display', 'both')
    l.find(a => a.id === 'voiceTranslation').run()
    expect(m.set).toHaveBeenCalledWith('translation', true)
    expect(l.find(a => a.id === 'display').overridden).toBe(true)
    expect(l.find(a => a.id === 'voiceTranslation').overridden).toBe(true)
    expect(l.find(a => a.id === 'voiceOriginal').overridden).toBe(false)
    const md = l.find(a => a.id === 'makeDefault')
    expect(md.disabled).toBe(false)
    md.run()
    expect(m.makeDefault).toHaveBeenCalled()
  })
  it('«Озвучить ▾»: пункты всё / только текст / только перевод; заблокированы по статистике', () => {
    const a = buildToolbarActions({ ...base, mode: 'admin', voice }).find(x => x.id === 'voiceAll')
    expect(a.kind).toBe('menu')
    expect(a.items.map(i => i.id)).toEqual(['voiceAllBoth', 'voiceText', 'voiceTranslation'])
    a.items[1].run()
    expect(voice.run).toHaveBeenCalledWith(['original'])
    a.items[2].run()
    expect(voice.run).toHaveBeenCalledWith(['translation'])
    a.run()
    expect(voice.run).toHaveBeenCalledWith()
    const done = { ...voice, stats: { ...stats, ready: 5, translation: { ...stats.translation, ready: 2 } } }
    const d = buildToolbarActions({ ...base, mode: 'admin', voice: done }).find(x => x.id === 'voiceAll')
    expect(d.disabled).toBe(true)
    expect(d.items[1].disabled).toBe(true)
    expect(d.items[2].disabled).toBe(true)
    const noTr = buildToolbarActions({ ...base, mode: 'admin', voice: { ...voice, stats: { ...stats, translation: { ...stats.translation, withText: 0 } } } }).find(x => x.id === 'voiceAll')
    expect(noTr.items[2].disabled).toBe(true)
  })
  it('узкое окно: режимы и озвучка уходят в «⋯» пунктами radio/checkbox с галочками', () => {
    const l = buildToolbarActions({ ...base, mode: 'admin', voice, modes: modes({ overridden: { display: true, original: false, translation: false, any: true } }) })
    const { bar, menu } = splitByWidth(l, true)
    expect(ids(bar)).toEqual(['save'])
    const items = menuItems(menu)
    expect(items.slice(0, 3).map(i => [i.id, i.role, i.checked])).toEqual([['display:none', 'menuitemradio', false], ['display:text', 'menuitemradio', true], ['display:both', 'menuitemradio', false]])
    expect(items[1].hint).toBe('предпросмотр ≠ сцена')
    expect(items.find(i => i.id === 'voiceOriginal')).toMatchObject({ role: 'menuitemcheckbox', checked: true })
    expect(items.find(i => i.id === 'voiceAll:voiceText').label).toBe('Озвучить: только текст')
  })
})

describe('разметка тулбара с режимами', () => {
  it('ToolbarActions: radiogroup сегмента, aria-pressed у тумблеров, data-override; кнопка с выпадашкой', () => {
    const l = buildToolbarActions({ ...base, mode: 'admin', voice, modes: modes({ effective: { display: 'both', voice: { original: false, translation: true } }, overridden: { display: true, original: true, translation: false, any: true } }) })
    const html = renderToStaticMarkup(<ToolbarActions actions={l} />)
    expect(html).toMatch(/<div class="scbTbSeg scbTbOverride" role="radiogroup" aria-label="Режим показа"[^>]*data-override="1"/)
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*data-value="both"/)
    expect(html).toMatch(/data-action="voiceOriginal"[^>]*data-override="1"[^>]*aria-pressed="false"/)
    expect(html).toMatch(/data-action="voiceTranslation"[^>]*aria-pressed="true"/)
    expect(html).toContain('data-action="makeDefault"')
    expect(html).toContain('class="fsBtn scbTbSplitMain"')
    expect(html).toContain('aria-label="Озвучить: варианты"')
    expect(html).not.toContain('Ещё действия')
  })
  it('BuilderToolbar: с modes — сегмент на панели и чип «предпросмотр ≠ сцена»; на узком — только «⋯»', () => {
    const draft = { scene: { ...demoCafeScene }, saved: { id: null, status: 'draft' }, dirty: false, errors: [], restoredAt: null, actions: {} }
    const render = props => renderToStaticMarkup(
      <BuilderToolbar draft={draft} library={{ busy: false, missingTable: false }} status={null} setStatus={() => {}} onSave={() => {}} onBack={() => {}} backRef={{ current: null }} theme="dark" onToggleTheme={() => {}} voice={{ busy: false, openAll() {}, quota: null }} {...props} />,
    )
    const wide = render({ modes: modes({ overridden: { display: true, original: false, translation: false, any: true } }), forceNarrow: false })
    expect(wide).toContain('aria-label="Режим показа"')
    expect(wide).toContain('предпросмотр ≠ сцена')
    expect(wide).toContain('Озвучка перевода')
    const narrow = render({ modes: modes(), forceNarrow: true, menuOpen: true })
    expect(narrow).not.toContain('role="radiogroup"')
    expect(narrow).toContain('role="menuitemradio"')
    expect(narrow).toContain('Режим показа: Текст + перевод')
  })
})
