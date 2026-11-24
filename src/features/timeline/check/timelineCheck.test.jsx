import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TimelineCheck from './TimelineCheck.jsx'
import TimelineScenario from './TimelineScenario.jsx'
import TimelineCheckNote from './TimelineCheckNote.jsx'
import TimelineScreen from '../TimelineScreen.jsx'
import TimelineLineEditor from '../TimelineLineEditor.jsx'
import { checkScenario } from './scenarioCheck.js'
import { checkFixtureRaw, PROBLEMS as P } from './checkFixture.js'
import { restoreVoice } from './lineRestore.js'
import { createLineEdit } from '../useLineEdit.js'
import { fixtureEvents } from '../timelineFixture.js'
import { buildTimeline } from '../timelineModel.js'
import { auditVoice } from '../../admin/speech/voiceAudit.js'
import { setLineFile } from '../../admin/speech/raceLineActions.js'
import { voicePitLines } from '../../rehearsal/rehearsalVoice.js'
import { normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'

// Экран «Проверка 🎧»: разметка (светофор, значки, фильтр, карточка правки) и защита «заменил озвучку — ничего не сломалось» (проверка после сохранения, «вернуть прежнюю озвучку»).
const editOf = raw => { const a = auditVoice(raw); return { status: 'ready', lines: normalizeLines(raw), audit: a.byId, orphans: a.orphans, busy: null, error: null, done: null, undo: null, was: null, copy: async () => true } }
const resOf = e => checkScenario({ audit: e.audit, lines: e.lines, orphans: e.orphans })
const html = (raw, props = {}) => { const e = editOf(raw); return renderToStaticMarkup(<TimelineScenario res={resOf(e)} edit={e} {...props} />) }
const item = (s, id) => s.match(new RegExp(`<li[^>]*data-id="${id}"[\\s\\S]*?</li>`))?.[0] ?? ''

describe('экран проверки сценария', () => {
  const bad = html(checkFixtureRaw()), ok = html(checkFixtureRaw(undefined, { clean: true }))
  it('сверху строка-светофор: зелёная «в порядке» либо красная со списком действий; у блоков свои огни', () => {
    expect(ok).toMatch(/data-testid="tl-ck-sum">✅ Сценарий в порядке: всё озвучено и согласовано</); expect(ok).not.toContain('data-testid="tl-ck-acts"')
    expect(bad).toContain('data-testid="tl-ck-sum">🔴 Сценарий требует действий: озвучить или переозвучить 4 · проверить 5 · посмотреть 2<')
    expect(bad).toContain('<li data-level="todo">озвучить 2 реплики (звука нет)</li>'); expect(bad).toContain('то же число горит на вкладке админки «Голос»')
    expect([...bad.matchAll(/class="tlCkLight" data-light="(\w+)"/g)].map(m => m[1])).toEqual(['red', 'red', 'red', 'red', 'red', 'red', 'green'])
  })
  it('у реплики: кто, текст, длительность и значки состояния', () => {
    expect(item(bad, P.none)).toContain('🔇'); expect(item(bad, P.stale)).toContain('✏️'); expect(item(bad, P.long)).toContain('⏱'); expect(item(bad, P.nowords[0])).toContain('👄'); expect(item(bad, P.risk)).toContain('⚠')
    expect(item(ok, 'race_good_1')).toMatch(/Пит[\s\S]*отличное произношение[\s\S]*1,5 с[\s\S]*✓/)
    expect(item(ok, 'race_good_1')).not.toContain('tl-ck-icons')
  })
  it('варианты и ветки помечены: «одна из», «ветка»', () => { expect(ok).toMatch(/<i class="tlCkBadge">одна из<\/i> Похвала за верное слово/); expect(ok).toMatch(/tlCkAlt">ветка<\/i> Режим «Пальцами»/) })
  it('«только проблемы» прячет зелёное; без проблем — так и сказано', () => {
    const only = html(checkFixtureRaw(), { only0: true })
    expect(item(only, P.none)).not.toBe(''); expect(item(only, 'race_good_1')).toBe(''); expect(only).not.toContain('<b>✅ Итог</b>'); expect(html(checkFixtureRaw())).toContain('<b>✅ Итог</b>')
    expect(html(checkFixtureRaw(undefined, { clean: true }), { only0: true })).toContain('data-testid="tl-ck-clean"')
  })
  it('нажатая реплика раскрывает ТУ ЖЕ карточку правки, что на ленте (текст, «Озвучить заново», свой файл), и объяснение словами', () => {
    const open = html(checkFixtureRaw(), { open0: `phrases/demo/${P.risk}` })
    expect(open).toContain('data-testid="tl-ck-card"'); expect(open).toContain('не помещается: длина 4,6 с при запасе 4,0 с')
    expect(open).toContain('data-testid="tl-le-voice"'); expect(open).toContain('data-testid="tl-le-file"'); expect(open).toContain('data-testid="tl-ck-play"')
  })
  it('риски сцены, запас и лишние записи — раскрывающимися списками', () => {
    expect(bad).toMatch(/Риски сцены от длины реплик: проверок \d+, требуют внимания 1/); expect(ok).toMatch(/Риски сцены от длины реплик: проверок \d+, все в порядке/)
    expect(ok).toContain('Не звучат в игре (запас): 11'); expect(bad).toContain('Лишние записи озвучки: 1'); expect(ok).not.toContain('tl-ck-orphans')
  })
  it('переключатель источника: «Сценарий сейчас» по умолчанию, «Последняя игра» — прежний список прохождения; без игр — только сценарий', () => {
    const e = editOf(checkFixtureRaw()), m = buildTimeline(fixtureEvents(), {})
    const now = renderToStaticMarkup(<TimelineCheck m={m} res={resOf(e)} edit={e} />), run = renderToStaticMarkup(<TimelineCheck m={m} res={resOf(e)} edit={e} audio={{ of: () => ({ url: null, why: '' }), stop() {} }} src0="run" />)
    expect(now).toMatch(/aria-checked="true"[^>]*data-testid="tl-ck-src-now"/); expect(now).toContain('data-testid="tl-ck"')
    expect(run).toContain('data-testid="tl-listen"'); expect(run).not.toContain('data-testid="tl-ck"')
    expect(renderToStaticMarkup(<TimelineCheck m={null} res={resOf(e)} edit={e} src0="run" />)).toMatch(/disabled=""[^>]*data-testid="tl-ck-src-run"/)
    expect(renderToStaticMarkup(<TimelineCheck m={m} res={checkScenario({})} edit={null} />)).toContain('data-testid="tl-ck-off"')
  })
  it('экран без единой игры всё равно показывает проверку сценария (настройки ещё грузятся — так и написано)', () => {
    const s = renderToStaticMarkup(<TimelineScreen runs={[]} lineApi={{ load: async () => ({}), normalize: normalizeLines, audit: raw => auditVoice(raw).byId }} />)
    expect(s).toContain('data-testid="tl-empty"'); expect(s).toContain('data-testid="tl-check"'); expect(s).toContain('data-testid="tl-ck-loading"')
  })
})

describe('заменил озвучку — проверка сразу в карточке', () => {
  const server = () => { const s = { raw: checkFixtureRaw(undefined, { clean: true }) }; s.deps = { load: async () => s.raw, save: async v => { s.raw = v; return v } }; return s }
  const edit = async (s, o = {}) => {
    const st = { busy: null, error: null, done: null, undo: null, was: null }
    const core = createLineEdit({ load: s.deps.load, normalize: normalizeLines, audit: raw => auditVoice(raw).byId, orphans: raw => auditVoice(raw).orphans, restoreVoice: (id, prev) => restoreVoice(id, prev, s.deps),
      voice: id => voicePitLines({ ids: [id], ...s.deps, speak: async t => ({ file: new Blob([t]), wordTimings: [] }), upload: async () => 'https://r2/new.mp3', probe: async () => o.dur ?? 2, loadVoice: async () => {} }),
      setFile: (id, f) => setLineFile(id, f, { ...s.deps, upload: async () => 'https://r2/own.mp3', probe: async () => o.dur ?? 2, align: async () => ({ words: null, notes: [] }) }) }, p => Object.assign(st, p))
    await core.reload()
    return { st, core, view: () => ({ ...st, ...core, copy: async () => true }) }
  }
  const ID = 'race_demo_2'
  it('свой файл длиннее потолка сцены: красная проверка с числами, длина против прежней и «Вернуть прежнюю озвучку» рядом', async () => {
    const s = server(), { st, core, view } = await edit(s, { dur: 4.6 }), before = st.lines[ID]
    expect(st.orphans).toEqual([])
    expect(await core.setFile(ID, new Blob(['x']))).toBe(true)
    expect(st.was).toEqual({ id: ID, rec: before })
    const card = renderToStaticMarkup(<TimelineLineEditor line={{ who: 'pit', id: ID, text: 'затем второе' }} edit={view()} />)
    expect(card).toMatch(/data-testid="tl-le-check"[^>]*>|data-light="red"/); expect(card).toContain('🔴 Проверка после сохранения: требует действия')
    expect(card).toContain('не помещается: длина 4,6 с при запасе 4,0 с'); expect(card).toMatch(/стала длиннее на 3,\d с/); expect(card).toContain('data-testid="tl-le-undo-voice"')
    expect(await core.restoreVoice(ID, st.was.rec)).toBe(true)
    expect(s.raw.lines[ID]).toMatchObject({ url: before.url, duration: before.duration, said: 'затем второе' }); expect(st.done.text).toBe('Прежняя озвучка возвращена.')
    expect(renderToStaticMarkup(<TimelineCheckNote id={ID} edit={view()} />)).toContain('✅ Проверка после сохранения: подходит')
  })
  it('«Озвучить заново» с подходящей длиной: «подходит» (без разметки рта — жёлтая заметка), кнопки возврата нет у api без неё', async () => {
    const s = server(), { core, view } = await edit(s, { dur: 0.9 })
    expect(await core.voice(ID)).toBe(true)
    const note = renderToStaticMarkup(<TimelineCheckNote id={ID} edit={{ ...view(), restoreVoice: null }} />)
    expect(note).toContain('🟡 Проверка после сохранения: подходит, но посмотри'); expect(note).toContain('👄 рот не размечен'); expect(note).not.toContain('tl-le-undo-voice')
  })
})
