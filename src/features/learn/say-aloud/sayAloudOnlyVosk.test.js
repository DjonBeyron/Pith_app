import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// «Скажи вслух» распознаёт речь ТОЛЬКО через Vosk (решения 17 и 20 плана нового пользователя): системного распознавания (Web Speech) в игре и в общем уведомлении и хуке нет,
// «тихого отката» на него тоже. Сторож по исходникам — чтобы это не поменялось незаметно.
const dir = fileURLToPath(new URL('.', import.meta.url))
const sharedLib = fileURLToPath(new URL('../../../shared/lib/', import.meta.url))
const sources = readdirSync(dir).filter(f => /\.(jsx?)$/.test(f) && !/\.test\./.test(f)).map(f => [f, readFileSync(join(dir, f), 'utf8')])
const sharedSrc = [
  ['useVoskReady.js', readFileSync(join(sharedLib, 'vosk/useVoskReady.js'), 'utf8')],
  ['voskReadyView.js', readFileSync(join(sharedLib, 'vosk/voskReadyView.js'), 'utf8')],
  ['VoskReadyNotice.jsx', readFileSync(join(sharedLib, '../ui/VoskReadyNotice.jsx'), 'utf8')],
]
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '') // комментарии объясняют запрет — их не считаем

describe('«Скажи вслух»: только Vosk', () => {
  it('в say-aloud/ есть исходники (иначе сторож зелёный впустую)', () => {
    expect(sources.length).toBeGreaterThanOrEqual(6)
  })
  it.each([...sources, ...sharedSrc])('%s: нет системного распознавания', (name, text) => {
    const code = strip(text)
    expect(code).not.toMatch(/webkitSpeechRecognition|SpeechRecognition|speechController|sayRecognizer|createSayRecognizer|pickEngine|speechSynthesis/)
  })
  it('игра слушает через createWordListener (Vosk), словарь — слова раунда', () => {
    const hook = strip(sources.find(([n]) => n === 'useSayAloudGame.js')[1])
    expect(hook).toContain('createWordListener')
    expect(hook).toContain('targets: words.map(w => w.word)')
    expect(hook).not.toMatch(/mic: 'manual'|status: 'manual'/) // ручного режима «тап = сказал» нет: самооценка не должна выдавать себя за распознавание
  })
  it('нет модели — уведомление «нужно скачать», а не откат', () => {
    expect(readFileSync(join(dir, 'SayAloudOverlay.jsx'), 'utf8')).toContain('<VoskReadyNotice vosk={vosk} />')
    expect(sharedSrc[1][1]).toContain('Нужно скачать распознавание речи')
    expect(sharedSrc[1][1]).toContain('≈39 МБ')
  })
})
