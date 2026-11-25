import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import VoiceTonePanel from './VoiceTonePanel.jsx'
import RaceVoiceRow from './RaceVoiceRow.jsx'
import { auditVoice, raceCatalog } from './voiceAudit.js'
import { lineRows, miaRows, toneRows } from './raceVoiceTable.js'
import { CAT_LINES, normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { RACE_LINES } from '../../pitrace/raceLines.js'
import { MIA_LINES, isMiaLine } from '../../pitrace/mia/miaLines.js'
import { setContextOn } from '../../rehearsal/tts/ttsContext.js'

// Панель «Интонация» под проверкой озвучки: счётчик «🎭 можно / нужно переозвучить с интонацией», одна кнопка на все такие реплики (с подтверждением) и галочка «контекст соседних реплик».
const rec = (d, extra = {}) => ({ text: d.text, url: 'u/x.mp3', duration: 2, said: d.text, ...extra })
const tOf = raw => {
  const audit = auditVoice(raw, raceCatalog(), CAT_LINES), lines = normalizeLines(raw)
  return { loaded: true, audit, voice: vi.fn(), groups: { lines: lineRows(RACE_LINES, lines, audit.byId), mia: miaRows(MIA_LINES.filter(l => isMiaLine(l.id)), lines, audit.byId), pitMia: miaRows(MIA_LINES.filter(l => !isMiaLine(l.id)), lines, audit.byId) } }
}
const byId = id => [...RACE_LINES, ...MIA_LINES].find(l => l.id === id)
afterEach(() => setContextOn(true))

describe('панель интонации', () => {
  it('старая озвучка — мягкий счётчик и кнопка; свежая и неозвученные в него не входят; кнопка озвучивает только отмеченные строки', () => {
    const a = byId('race_good_ok'), b = byId('mia_ok_1'), c = byId('pit_reply'), d = byId('race_done')
    const t = tOf({ lines: { [a.id]: rec(a), [b.id]: rec(b, { saidTts: 'Допустим…' }), [c.id]: rec(c, { saidTts: c.tts }), [d.id]: { text: d.text, url: null } } })
    const h = renderToStaticMarkup(<VoiceTonePanel t={t} off={false} />)
    expect(h).toContain('🎭 Интонация: 1 нужно переозвучить (текст для диктора изменён), 1 можно переозвучить с интонацией (озвучены без знаков препинания)')
    expect(h).toContain('🎭 Переозвучить с интонацией (2)'); expect(h).toMatch(/data-testid="rv-tone-context"[^>]*checked|checked[^>]*data-testid="rv-tone-context"/)
    expect(toneRows([...t.groups.lines, ...t.groups.pitMia, ...t.groups.mia]).map(r => r.id).sort()).toEqual([a.id, b.id].sort())
    const row = renderToStaticMarkup(<RaceVoiceRow row={t.groups.lines.find(r => r.id === a.id)} onSave={() => {}} onVoice={() => {}} />)
    expect(row).toContain('data-tone="can"'); expect(row).toContain('🎭 можно переозвучить с интонацией: диктору уйдёт «Отлично!»'); expect(row).toContain('rvStatus-ok')
  })
  it('всё озвучено нынешним текстом диктора — ни счётчика, ни кнопки; галочка помнит выключение', () => {
    const c = byId('pit_reply'), t = tOf({ lines: { [c.id]: rec(c, { saidTts: c.tts }) } })
    let h = renderToStaticMarkup(<VoiceTonePanel t={t} off={false} />)
    expect(h).not.toContain('rv-tone-note'); expect(h).not.toContain('rv-tone-voice'); expect(h).toContain('контекст соседних реплик')
    setContextOn(false); h = renderToStaticMarkup(<VoiceTonePanel t={t} off={false} />); expect(h).not.toMatch(/data-testid="rv-tone-context"[^>]*checked|checked[^>]*data-testid="rv-tone-context"/)
  })
})
