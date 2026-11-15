import { describe, it, expect, vi } from 'vitest'

vi.mock('../api/supabase.js', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
import { commentFile, collectLogs } from './logUpload.js'
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
    expect(await runSend(send, 'текст')).toMatchObject({ ok: true }); expect(send).toHaveBeenCalledWith('текст')
    await runSend(send); expect(send).toHaveBeenLastCalledWith('')
    expect(COMMENT_MAX).toBe(2000)
  })
})
