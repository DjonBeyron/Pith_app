import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import SceneVoiceSheet from './SceneVoiceSheet.jsx'

// Страж: итог (вердикт) не меняет размер панели микрофона. Реальные замеры высоты по фазам — Playwright (см. PROJECT.md), здесь — разметка и CSS
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const css = read('../../../styles/feed-scene-voice.css')
const rule = sel => css.match(new RegExp(`${sel.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
const html = (phase, p = {}) => renderToStaticMarkup(
  <SceneVoiceSheet kind="repeat" phase={phase} prompt="Повтори" lineText="Hello" expected={['Hello']} ok={phase === 'checked'} heard="hello" stage={<i data-testid="stage" />} {...p} />,
)

describe('панель микрофона: один слот во всех фазах', () => {
  const phases = ['ready', 'listening', 'checked', 'closed']
  it('круг, кнопки и вердикт есть в разметке ВСЕХ фаз (ничего не монтируется и не складывается), складок высоты нет', () => {
    for (const ph of phases) {
      const h = html(ph)
      for (const cls of ['stVoiceFlow', 'stVoiceMain', 'stVoicePane', 'stVoiceNote', 'stVoiceBtns']) expect(h, `${ph}: ${cls}`).toContain(cls)
      expect(h).toContain('data-testid="stage"')
      expect(h).not.toContain('catchSheetFold')
    }
  })
  it('data-done только в финале; в нём тело inert, вердикт доступен; вне финала наоборот', () => {
    expect(html('ready')).not.toContain('data-done')
    expect(html('checked')).toMatch(/stVoiceFlow" data-done/)
    expect(html('checked')).toMatch(/stVoiceMain[^>]*inert/)
    expect(html('checked')).not.toMatch(/stVoicePane"[^>]*inert/)
    expect(html('ready')).toMatch(/stVoicePane"[^>]*inert/)
  })
  it('фаза «closed» без предыдущей не показывает финал; заморозку на уходе держит useFrozenPhase в обеих шторках', () => {
    expect(read('./SceneVoiceSheet.jsx')).toContain('useFrozenPhase(rawPhase)')
    expect(read('./SceneTaskSheet.jsx')).toContain('useFrozenPhase(rawPhase)')
  })
  it('слот не меняет высоту панели в финале: вердикт — абсолютный слой на весь слот, заметка фиксированной высоты', () => {
    expect(rule('.stVoiceFlow')).toMatch(/position:\s*relative/)
    const pane = rule('.stVoicePane')
    expect(pane).toMatch(/position:\s*absolute/)
    expect(pane).toMatch(/inset:\s*0/)
    expect(rule('.stVoicePaneText')).toMatch(/overflow-y:\s*auto/)
    expect(rule('.stVoiceNote')).toMatch(/(?:^|[\s;])height:\s*\d+px/)
  })
  it('переходы слота только opacity/visibility — ни height, ни grid-template-rows, ни max-height не анимируются', () => {
    const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map(m => m[1])
    expect(transitions.length).toBeGreaterThan(0)
    for (const t of transitions) expect(t).not.toMatch(/height|grid|margin|padding|top|bottom/)
  })
})
