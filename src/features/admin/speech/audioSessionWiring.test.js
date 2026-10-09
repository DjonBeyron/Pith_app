import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { recordEntry, emptyState, seriesLines, DEFAULT_REFS } from './contextSeries.js'
import { soundsLine } from './seriesCards.js'

// Стражи проводки «гипотезы аудиосессии» (читаем исходники): вкладка «Голос» молчит, проба передаёт контроллеру аудиосессию и журнал звуков,
// «Тест 1» и «Тест 2» идут на ОДНОЙ выбранной стратегии, панель модуля помечена data-no-unlock целиком.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('вкладка «Голос» молчит и пишет журнал звуков', () => {
  it('AdminSpeechTab держит полную тишину, пока видна (useTabSilence → holdSilence)', () => {
    const tab = read('./AdminSpeechTab.jsx')
    expect(tab).toContain('useTabSilence(rootRef)')
    expect(tab).toContain('ref={rootRef}')
    const hook = read('./useTabSilence.js')
    expect(hook).toContain("holdSilence('admin-voice')")
    expect(hook).toContain('IntersectionObserver')
    expect(hook).toContain('installMediaPlayLog()')
  })
  it('проба передаёт контроллеру audioSession и журнал звуков; стратегия читается на каждом тапе (общая для Теста 1 и Теста 2)', () => {
    const probe = read('./useSpeechProbe.js')
    expect(probe).toContain('audioSession: createAudioSession()')
    expect(probe).toContain('sounds: soundProbe')
    expect(probe).toContain('getRestart: () => readStrategy()')
    const simple = read('./SimpleTestsBlock.jsx')
    expect(simple).toContain('onSay={() => start()}') // Тест 1 → probe.start → контроллер → readStrategy()
    expect(simple).toContain('strategy={restart.strategy}')
    expect(read('./RestartSeriesBlock.jsx')).toContain('onClick={() => probe.start()}') // Тест 2 — тот же probe.start
    expect(read('./ContextSeriesBlock.jsx')).toContain('data-testid="step-strategy"')
  })
  it('сообщение «закрой приложение и открой снова» — в живой строке пробы (LiveHeard) и в карточке попытки; модуль его не рисует', () => {
    expect(read('./LiveHeard.jsx')).toContain('view?.deafGiveUp')
    expect(read('./RestartSeriesBlock.jsx')).toContain('runGaveUp(run)')
    expect(read('../../player/panels/say-phrase/SayPhrasePanel.jsx')).not.toContain('deafGiveUp')
  })
})

describe('модуль «Сказать фразу»: звук не играет на касаниях панели, аудиосессия — по флагу админа', () => {
  const panel = read('../../player/panels/say-phrase/SayPhrasePanel.jsx')
  it('корень панели и попап микрофона помечены data-no-unlock целиком', () => {
    expect(panel).toMatch(/className=\{`phrasePanel sayPanel[^`]*`\} data-no-unlock=""/)
    expect(read('../../player/panels/say-phrase/SayMicPopup.jsx')).toContain('data-no-unlock=""')
  })
  it('useSayPhrase: адаптер audioSession, тип по флагу, пометка в плашке админа; стратегия M не меняется', () => {
    const hook = read('../../player/panels/say-phrase/useSayPhrase.js')
    expect(hook).toContain('audioSession: createAudioSession()')
    expect(hook).toContain('getAudioSessionType: () => sayAudioSessionType()')
    expect(hook).toContain('audioSession: sayAudioSessionType()')
    expect(hook).toContain("getRestart: () => 'M'")
  })
  it('SpeechSayBlock: переключатель «Аудиосессия play-and-record для модуля (эксперимент)», по умолчанию выкл', () => {
    const b = read('./SpeechSayBlock.jsx')
    expect(b).toContain('Аудиосессия play-and-record для модуля (эксперимент)')
    expect(b).toContain('useState(isSayAudioSessionOn)')
    expect(b).toContain('data-testid="say-audiosession-toggle"')
  })
})

describe('«Тест 1»: звуки до записи в карточке и в «Скопировать итог»', () => {
  const entry = {
    t: 5, audioBefore: 'unlock-wav, audio-play', audioSession: 'auto→play-and-record',
    tx: { ref: DEFAULT_REFS[1], said: "I'm try", lang: 'en-US', series: { step: 1, wrongPhrase: "I'm try" }, top1: { text: "I'm trying", conf: 86 }, alts: [], literal: [], verdicts: { top1: true, consensus: false, strict: false }, fixed: false, dir: null },
  }
  it('строка шага хранит snd/ses; карточка и итог показывают «звуки до записи»', () => {
    const st = recordEntry(emptyState(), entry)
    const row = st.langs['en-US'][1]
    expect(row).toMatchObject({ snd: 'unlock-wav, audio-play', ses: 'auto→play-and-record' })
    expect(soundsLine(row)).toBe('звуки до записи: unlock-wav, audio-play')
    expect(soundsLine(null)).toBe('')
    expect(seriesLines(st).join('\n')).toContain('звуки до записи: unlock-wav, audio-play | аудиосессия: auto→play-and-record')
    expect(read('./SeriesStepCard.jsx')).toContain('soundsLine(row)')
  })
  it('старая запись без audioBefore — snd null, строк про звуки нет', () => {
    const st = recordEntry(emptyState(), { ...entry, audioBefore: undefined, audioSession: undefined })
    expect(st.langs['en-US'][1].snd).toBe(null)
    expect(seriesLines(st).join('\n')).not.toContain('звуки до записи')
  })
})
