import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Проводка «три неудачи → ветка «неверный»» и «Я не могу говорить» в панели «Сказать фразу». Логику счёта проверяет sayFlowAttempts.test.js,
// выбор выхода — player/sayPairSkip.test.js; здесь — что панель их правильно соединяет.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const code = src => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
const body = read('./SayPhrasePanel.jsx')
const hook = read('./useSayPhrase.js')

describe('say_phrase — три неудачи → say_wrong', () => {
  it('пауза после последней реплики — короткая (600–900 мс), как SEE_RESULT_MS у «Напечатай слово»; реплика и подсказка уходят в чат как обычно', () => {
    const pause = Number(body.match(/const WRONG_PAUSE_MS = (\d+)/)[1])
    expect(pause).toBeGreaterThanOrEqual(600)
    expect(pause).toBeLessThanOrEqual(900)
    expect(read('../type-word/TypeWordPanel.jsx')).toContain('const SEE_RESULT_MS = 700')
    // тайминг: пузыри через HINT_DELAY_MS (после окна тишины звуков), затем пауза; нет пузырей (подсказки выключены, тишина) — только пауза
    expect(body).toContain("if (sp.exhausted) wrongTimer.current = setTimeout(() => finish('wrong'), (reply || hint ? HINT_DELAY_MS : 0) + WRONG_PAUSE_MS)")
    expect(body.indexOf('wrongTimer.current = setTimeout')).toBeLessThan(body.indexOf("if (reply) onAnswered?.(reply, 'wrong_final', false, voiceId)"))
  })

  it('закрытие по неверной ветке: итог say_wrong без XP, салюта, пузыря «верно» и звука; таймер снимается при уходе панели и при любом другом выходе (finish)', () => {
    expect(body).toMatch(/if \(kind === 'wrong'\) \{ closeWith\(out\.trigger\); return \}/)
    const wrongBranch = body.slice(body.indexOf("if (kind === 'wrong')"), body.indexOf('// Звук «верно»'))
    expect(wrongBranch).not.toMatch(/onXpEarned|fireBurst|playSound|onAnswered/)
    expect(body).toMatch(/closingRef\.current = true\s*clearTimeout\(wrongTimer\.current\)/)
    expect(body).toContain('clearTimeout(wrongTimer.current); revokeSayVoice(pendingVoice.current) }, [])')
  })

  it('после третьей неудачи микрофон заблокирован: и в хуке (тап игнорируется), и в круге (disabled), и в reducer (begin не начинает запись)', () => {
    expect(hook).toMatch(/const tapMic = useCallback\(\(\) => \{\s*if \(s\.exhausted\) return/)
    expect(body).toContain("disabled={closing || phase === 'passed' || sp.exhausted}")
    expect(hook).toContain('exhausted: s.exhausted')
  })

  it('«Я не могу говорить» доступна на любой попытке (в т.ч. в паузе после третьей неудачи) и всегда закрывает модуль итогом say_cant, не ставя флаг сессии', () => {
    expect(body).toContain("onSkip={() => finish('skip')}")
    expect(body).toMatch(/if \(kind === 'skip'\) \{[\s\S]*?closeWith\(out\.trigger\)/)
    expect(code(body)).not.toMatch(/setCantSpeakSession|TRIGGER_SKIP|hasSkipLink/)
  })

  it('счётчик попыток ученику не показывается: ни в панели, ни в надписях', () => {
    for (const src of [code(body), code(read('./SayStage.jsx')), code(read('./SayCaption.jsx'))]) expect(src).not.toMatch(/attempts|попыт[а-я]* \d|из 3|осталось/i)
    expect(code(read('../../../../shared/lib/speech/sayTexts.js'))).not.toMatch(/осталось|из 3/)
  })

  it('реплика ученика уходит в чат на каждой попытке красным пузырём (wrong_final), нейтрального нет', () => {
    expect(body).toContain("onAnswered?.(reply, 'wrong_final', false, voiceId)")
    expect(code(body)).not.toMatch(/'neutral'|"neutral"/)
  })
})
