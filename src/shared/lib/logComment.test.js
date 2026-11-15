import { describe, it, expect, vi } from 'vitest'

vi.mock('../api/supabase.js', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
import { commentFile, collectLogs, uploadLogs } from './logUpload.js'
import { runSend, COMMENT_MAX } from './sendLogFlow.js'

const at = new Date('2026-11-15T10:20:30Z')

describe('комментарий к логам (попап перед отправкой)', () => {
  it('комментарий — отдельный файл с версией; пустой / из пробелов — файла нет', () => {
    const f = commentFile('  после слов Мии пропал звук ', at, '3.3.249')
    expect(f.name).toBe('pithy-comment-2026-11-15-10-20-30.txt')
    expect(f.text).toBe('Комментарий владельца к логам (v3.3.249):\n\nпосле слов Мии пропал звук')
    expect(commentFile('   ', at)).toBeNull(); expect(commentFile(undefined, at)).toBeNull()
  })
  it('collectLogs: комментарий идёт ПЕРВЫМ (читай читает по порядку имён); без комментария список прежний', async () => {
    const base = { journal: { name: 'j.txt', text: 'шапка' }, debugLines: ['d'], last: null, at }
    const out = await collectLogs({ ...base, comment: 'не слышу Мию' })
    expect(out.map(f => f.name)).toEqual(['pithy-comment-2026-11-15-10-20-30.txt', 'j.txt', 'pithy-debug-2026-11-15-10-20-30.txt'])
    expect(out[0].text).toContain('не слышу Мию')
    expect((await collectLogs(base)).map(f => f.name)).toEqual(['j.txt', 'pithy-debug-2026-11-15-10-20-30.txt'])
  })
  it('runSend передаёт комментарий в send; предел длины задан', async () => {
    const send = vi.fn(async () => 'Отправлено в GitHub (3 ф.)')
    expect(await runSend(send, 'текст')).toMatchObject({ ok: true }); expect(send).toHaveBeenCalledWith('текст', {})
    await runSend(send); expect(send).toHaveBeenLastCalledWith('', {})
    expect(COMMENT_MAX).toBe(2000)
  })
  it('галочка «Отправить логи» снята — уходит только комментарий; пустой комментарий — нечего слать', async () => {
    const base = { journal: { name: 'j.txt', text: 'шапка' }, debugLines: ['d'], last: { name: 'x.json', text: '{}' }, at }
    expect((await collectLogs({ ...base, comment: 'заметка', withLogs: false })).map(f => f.name)).toEqual(['pithy-comment-2026-11-15-10-20-30.txt'])
    expect(await collectLogs({ ...base, withLogs: false })).toEqual([])
  })
  it('«Дополнить»: в функцию уходит append: true, иначе поля нет (прежнее заменяется)', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, paths: ['a'] }, error: null }))
    await uploadLogs([{ name: 'a', text: 'b' }], { client: { functions: { invoke } }, version: '1', append: true })
    expect(invoke).toHaveBeenLastCalledWith('send-log', { body: { files: [{ name: 'a', text: 'b' }], version: '1', append: true } })
    await uploadLogs([{ name: 'a', text: 'b' }], { client: { functions: { invoke } }, version: '1' })
    expect(invoke).toHaveBeenLastCalledWith('send-log', { body: { files: [{ name: 'a', text: 'b' }], version: '1' } })
  })
})
