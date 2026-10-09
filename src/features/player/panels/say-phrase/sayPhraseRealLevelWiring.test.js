import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Проводка «Сказать фразу»: опциональный реальный уровень звука для колец (админский флаг, эксперимент). Остальная проводка — sayPhraseWiring.test.js
const dir = fileURLToPath(new URL('.', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const panelFiles = readdirSync(dir).filter(f => /\.(jsx?)$/.test(f) && !f.endsWith('.test.js'))
const panelSrc = Object.fromEntries(panelFiles.map(f => [f, read(`./${f}`)]))

describe('say_phrase — реальный уровень для колец (админский флаг, эксперимент)', () => {
  const hook = panelSrc['useSayPhrase.js']
  const real = read('../../../../shared/lib/speech/sayRealLevel.js')

  it('поток открывается в том же тапе ДО recognition.start() (промис не ждём), закрывается на конце попытки, уходе панели и сворачивании; флаг читает общий модуль', () => {
    const begin = hook.slice(hook.indexOf('const begin = useCallback'), hook.indexOf('// Тап по микрофону'))
    expect(begin).toContain('isRealLevelOn()')
    expect(begin.indexOf('real.open()')).toBeGreaterThan(-1)
    expect(begin.indexOf('real.open()')).toBeLessThan(begin.indexOf('ctrl.start('))
    expect(begin).not.toMatch(/await|\.then\(/)
    expect(hook).toMatch(/if \(s\.phase === 'run'\) return[\s\S]*real\.close\(\)/) // попытка кончилась
    expect(hook).toMatch(/clearTimeout\(morphRef\.current\); real\.close\(\) \}/) // панель закрыта
    expect(hook).toMatch(/const interrupt = \(\) => \{ ctrl\.reset\(\); voice\.signal\('end', nowMs\(\)\); real\.close\(\)/) // сворачивание
    expect(hook).toContain('voice: levels')
    expect(hook).toContain("realLevel: realLevelLabel(wantReal, null)") // пометка «реальный уровень: вкл/выкл» для админской строки
  })

  it('по умолчанию ВЫКЛЮЧЕНО (нужен localStorage-флаг "1"); getUserMedia/AudioContext только в sayRealLevel.js, не в файлах панели', () => {
    expect(real).toContain("REAL_LEVEL_KEY = 'pithy_say_real_level_v1'")
    expect(real).toContain("getItem(REAL_LEVEL_KEY) === '1'")
    expect(real).toContain('autoGainControl: true, noiseSuppression: false, echoCancellation: false')
    expect(real).not.toMatch(/setInterval/) // уровень читается каждый кадр rAF колец, а не по таймеру
    for (const [name, src] of Object.entries(panelSrc)) expect(src.replace(/\/\/.*$/gm, ''), name).not.toMatch(/getUserMedia|AudioContext|AnalyserNode|REAL_LEVEL_KEY/)
  })

  it('админка «Голос»: переключатель и кнопка сброса подсказок микрофона', () => {
    const block = read('../../../admin/speech/SpeechSayBlock.jsx')
    expect(block).toContain('Реальный уровень микрофона для колец (эксперимент)')
    expect(block).toContain('Сбросить подсказки микрофона (показать полное пояснение снова)')
    expect(block).toContain('setRealLevelOn(next)')
    expect(block).toContain('resetMicHints()')
    expect(read('../../../admin/speech/AdminSpeechTab.jsx')).toContain('<SpeechSayBlock />')
  })
})
