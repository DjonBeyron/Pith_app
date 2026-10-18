import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')

// «Начать можно так…» по таймеру и мягкий выход после тишины — проводка
describe('say_phrase — подсказка по таймеру и выход после тишины', () => {
  const panel = read('./SayPhrasePanel.jsx')
  it('панель ставит таймер подсказки только пока ждёт ученика (idle/failed), без выхода и без сигнала', () => {
    expect(panel).toContain('useSayStartHint({ data,')
    expect(panel).toContain("(phase === 'idle' || phase === 'failed')")
    expect(panel).toContain('!sp.silenceExit')
    expect(panel).toContain("onAnswered?.(text, 'hint')")
  })
  it('после мягкой реплики панель закрывается как «Я не могу говорить» (skip → say_done без сообщения-успеха)', () => {
    expect(panel).toContain("finish(sp.silenceExit ? 'skip' : 'wrong')")
    expect(panel).toContain("sp.silenceExit ? 'silence'")
  })
  it('пузыри модуля сохраняют переносы строк подсказки (по слову на строке)', () => {
    expect(read('../../modules/say-phrase/SayPhraseModule.jsx')).toContain('keepLines')
  })
  it('таймер срабатывает один раз и сбрасывается при выходе из ожидания', () => {
    const hook = read('./useSayStartHint.js')
    expect(hook).toContain('fired.current = true')
    expect(hook).toContain('return () => clearTimeout(t)')
  })
})
