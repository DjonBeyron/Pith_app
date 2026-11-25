import { describe, it, expect } from 'vitest'
import { auditLine, auditVoice, auditSummary, toneSummary, AUDIT_MISSING } from './voiceAudit.js'
import { CAT_LINES, normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { MIA_LINES } from '../../pitrace/mia/miaLines.js'
import { RACE_LINES } from '../../pitrace/raceLines.js'
import { lineVoiced, CODE_TEXT_OF } from '../../rehearsal/rehearsalLines.js'
import { missingPitLines } from '../../rehearsal/rehearsalVoice.js'
import { lineRows, toneRows } from './raceVoiceTable.js'

// Аудит озвучки (v3.3.300): подозрение владельца — «Озвучить недостающие» не всегда видит изменённые и новые реплики Пита и Мии. Причина: реплики эпизода «Мия» не входили в список «текст в коде изменился → озвучка устарела».
const MIA = MIA_LINES.find(l => l.id === 'boss_mia_keep'), PIT = MIA_LINES.find(l => l.id === 'boss_pit_stuck')
const voiced = (d, extra = {}) => ({ text: d.text, url: 'u/x.mp3', duration: 2, said: d.text, ...extra })

describe('auditLine: статусы по сырой записи', () => {
  it('ok / new / none / stale / nodur / skip', () => {
    expect(auditLine(MIA, voiced(MIA)).status).toBe('ok')
    expect(auditLine(MIA, undefined).status).toBe('new')
    expect(auditLine(MIA, { text: MIA.text, url: null }).status).toBe('none')
    expect(auditLine(MIA, voiced(MIA, { said: 'старый текст', text: 'старый текст' }))).toMatchObject({ status: 'stale', was: 'старый текст', now: MIA.text })
    expect(auditLine(MIA, voiced(MIA, { duration: 0 })).status).toBe('nodur')
    expect(auditLine({ id: 'x', text: 'Скажи {word}' }, undefined).status).toBe('skip')
  })
  it('у старой записи без said текст файла считается сохранённым: код поменялся — stale', () => {
    expect(auditLine(PIT, { text: 'прежний текст', url: 'u', duration: 1 }).status).toBe('stale')
    expect(auditLine(PIT, { text: PIT.text, url: 'u', duration: 1 }).status).toBe('ok')
  })
  it('custom-текст из админки главнее кода; файл говорит другое — stale, совпало с said — ok', () => {
    expect(auditLine(MIA, { text: 'мой текст', custom: true, url: 'u', duration: 1, said: MIA.text }).status).toBe('stale')
    expect(auditLine(MIA, { text: 'мой текст', custom: true, url: 'u', duration: 1, said: 'мой текст' }).status).toBe('ok')
  })
})

describe('auditVoice: весь каталог', () => {
  it('пустые настройки: все реплики новые; озвученные — ok; лишние озвученные ключи — orphans', () => {
    const a0 = auditVoice(null); expect(a0.counts.new).toBe(CAT_LINES.filter(d => !d.text.includes('{')).length); expect(a0.missing.length).toBe(a0.counts.new)
    const lines = Object.fromEntries(CAT_LINES.map(d => [d.id, voiced(d)])); lines.old_gone = { text: 'x', url: 'u' }
    const a = auditVoice({ lines }); expect(a.missing).toEqual([]); expect(a.orphans).toEqual(['old_gone']); expect(auditSummary(a)).toBeNull()
  })
  it('кто говорит: Мия / Пит эпизода / Пит гонки; по каждой причине — было и стало', () => {
    const a = auditVoice({ lines: {} })
    expect(a.byId[MIA.id].who).toBe('mia'); expect(a.byId[PIT.id].who).toBe('pit-mia'); expect(a.byId[RACE_LINES[0].id].who).toBe('pit')
    const lines = Object.fromEntries(CAT_LINES.map(d => [d.id, voiced(d)])); lines[MIA.id] = voiced(MIA, { text: 'Старая реплика', said: 'Старая реплика' })
    const b = auditVoice({ lines }); expect(b.mia.missing.map(e => e.id)).toEqual([MIA.id]); expect(b.byId[MIA.id].reason).toContain('было «Старая реплика»'); expect(auditSummary(b)).toContain('1 с изменённым текстом')
  })
  it('AUDIT_MISSING — ровно то, что должна подхватывать кнопка', () => { expect(AUDIT_MISSING).toEqual(['new', 'none', 'stale', 'nodur']) })
})

describe('корень проблемы: правка текста реплики Мии в коде теперь замечается игрой и кнопкой', () => {
  const raw = { lines: { [MIA.id]: { text: 'Старая реплика Мии', url: 'u/mia.mp3', duration: 3, said: 'Старая реплика Мии' } } }
  it('все реплики Мии и Пита эпизода входят в «текст из кода»', () => { for (const l of MIA_LINES) expect(CODE_TEXT_OF[l.id]).toBe(l.text) })
  it('normalizeLines сбрасывает устаревшую озвучку Мии, lineVoiced — не озвучена, missingPitLines — в списке на озвучку', () => {
    const l = normalizeLines(raw)
    expect(l[MIA.id]).toMatchObject({ text: MIA.text, url: null }); expect(lineVoiced(MIA.id, raw.lines[MIA.id])).toBe(false)
    expect(missingPitLines(l, MIA_LINES).map(d => d.id)).toContain(MIA.id)
  })
  it('строка таблицы получает статус stale и причину «было → стало»', () => {
    const rows = lineRows(MIA_LINES, normalizeLines(raw), auditVoice(raw).byId), r = rows.find(x => x.id === MIA.id)
    expect(r.status).toBe('stale'); expect(r.note).toContain('Старая реплика Мии'); expect(r.note).toContain(MIA.text)
  })
})

const raceCatalog0 = () => CAT_LINES.filter(d => ['race_start', 'mia_push'].includes(d.id))

describe('аудит делится на «Встряхни память» и другие игры (v3.3.356)', () => {
  it('реплики других игр не попадают в аудит блока «Озвучка Пита», а в «Старом» они есть', async () => {
    const { raceCatalog, otherCatalog, RACE_LINE_SET } = await import('./voiceAudit.js')
    const ids = c => c.map(d => d.id)
    expect(ids(raceCatalog())).toContain('race_start'); expect(ids(raceCatalog())).toContain('mia_push')
    for (const id of ['round_discern', 'round_blind', 'well_done', 'rh2_shadow']) { expect(ids(raceCatalog())).not.toContain(id); expect(ids(otherCatalog())).toContain(id) }
    expect(ids(raceCatalog()).length + ids(otherCatalog()).length).toBe(CAT_LINES.length)
    expect(ids(raceCatalog()).every(id => RACE_LINE_SET.has(id))).toBe(true)
  })
  it('запись реплики другой игры не считается «лишней» в аудите гонки', () => {
    const a = auditVoice({ lines: { well_done: { url: 'u', text: 'x', duration: 1 } } }, raceCatalog0(), CAT_LINES)
    expect(a.orphans).toEqual([])
  })
})

describe('интонация: текст для диктора рядом со статусом озвучки', () => {
  it('старая запись (saidTts нет) — мягко «можно переозвучить с интонацией», статус остаётся ok и в «нужно озвучить» не попадает', () => {
    const a = auditLine(MIA, voiced(MIA))
    expect(a).toMatchObject({ status: 'ok', tone: 'can', dictor: MIA.tts }); expect(a.toneNote).toBe(`🎭 можно переозвучить с интонацией: диктору уйдёт «${MIA.tts}»`)
    const all = auditVoice({ lines: { [MIA.id]: voiced(MIA) } }, [MIA])
    expect(all.missing).toEqual([]); expect(all.tone.can.map(e => e.id)).toEqual([MIA.id]); expect(all.tone.redo).toEqual([]); expect(auditSummary(all)).toBeNull()
    expect(toneSummary(all)).toBe('🎭 Интонация: 1 можно переозвучить с интонацией (озвучены без знаков препинания)')
  })
  it('озвучено нынешним текстом диктора — чисто; текст диктора поправили после озвучки — «нужно переозвучить» (было → стало)', () => {
    expect(auditLine(MIA, voiced(MIA, { saidTts: MIA.tts })).tone).toBeUndefined()
    const own = auditLine(MIA, voiced(MIA, { saidTts: MIA.tts, tts: MIA.tts.replace(/!$/, '…') }))
    expect(own).toMatchObject({ status: 'ok', tone: 'redo' }); expect(own.toneNote).toContain('🎭 нужно переозвучить: текст для диктора изменён: было «'); expect(own.toneNote).toContain(`стало «${MIA.tts.replace(/!$/, '…')}»`)
    const all = auditVoice({ lines: { [MIA.id]: voiced(MIA, { saidTts: 'по-старому.' }), [PIT.id]: voiced(PIT, { saidTts: PIT.tts }) } }, [MIA, PIT])
    expect(all.tone.redo.map(e => e.id)).toEqual([MIA.id]); expect(toneSummary(all)).toBe('🎭 Интонация: 1 нужно переозвучить (текст для диктора изменён)'); expect(toneSummary(auditVoice({ lines: {} }, [MIA]))).toBeNull()
  })
  it('неозвученные и устаревшие реплики про интонацию не говорят; строка таблицы несёт отметку; «фраза продолжается» без знаков — чисто', () => {
    expect(auditLine(MIA, undefined).tone).toBeUndefined(); expect(auditLine(MIA, voiced(MIA, { said: 'старое', text: 'старое' })).tone).toBeUndefined()
    const pre = RACE_LINES.find(l => l.id === 'race_trap_pre'); expect(auditLine(pre, voiced(pre)).tone).toBeUndefined() // диктору уйдёт то же «это»
    const raw = { lines: { [PIT.id]: voiced(PIT) } }, row = lineRows([PIT], normalizeLines(raw), auditVoice(raw, [PIT]).byId)[0]
    expect(row).toMatchObject({ status: 'ok', tone: 'can' }); expect(toneRows([row, { id: 'x', text: 'y', status: 'ok' }])).toEqual([row])
  })
})
