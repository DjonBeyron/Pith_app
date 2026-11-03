import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Страж «Гонки с Питом» (DEV_REHEARSAL.md, запреты): в src/features/pitrace слушает только Vosk (ни SpeechRecognition / webkitSpeechRecognition, ни нативных обёрток speechController / sayVoicePlan / speechSupport), Пит не говорит голосом системы
// (speechSynthesis / SpeechSynthesisUtterance / speakText), случайность — только от семени (Math.random нет), микрофон открывается не здесь (getUserMedia только в игре), а размер файлов — в пределах правила проекта (≤ 250 строк, потолок 400).
// Комментарии не считаются — проверяем код; строки в кавычках тоже считаются нарушением.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '../..')
const walk = dir => readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
const stripComments = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const files = walk(HERE).filter(f => /\.(js|jsx)$/.test(f) && !/\.test\.(js|jsx)$/.test(f))
const code = f => stripComments(readFileSync(f, 'utf8'))
const rel = f => path.relative(SRC, f).split(path.sep).join('/')

describe('«Гонка с Питом»: запреты движка (features/pitrace)', () => {
  it('страж не пустой: в папке гонки есть директор, рецепт, стадии и лестница', () => {
    const names = files.map(f => path.basename(f))
    for (const must of ['useRaceActs.js', 'raceRecipe.js', 'raceStages.js', 'raceLadder.js', 'raceLines.js', 'raceSim.js', 'RaceClimb.jsx']) expect(names).toContain(must)
  })
  it('только Vosk: нет SpeechRecognition и нативных модулей распознавания', () => {
    const bad = files.filter(f => /SpeechRecognition|speechController|sayVoicePlan|speechSupport/.test(code(f))).map(rel)
    expect(bad).toEqual([])
  })
  it('никакого speechSynthesis: Пит говорит только озвучкой из библиотеки', () => {
    const bad = files.filter(f => /speechSynthesis|SpeechSynthesisUtterance|speakText|unlockVoice/.test(code(f))).map(rel)
    expect(bad).toEqual([])
  })
  it('без Math.random: случайность от семени плана (rngFor)', () => {
    expect(files.filter(f => /Math\.random/.test(code(f))).map(rel)).toEqual([])
    expect(files.some(f => /rngFor/.test(code(f)))).toBe(true)
  })
  it('микрофон — не отсюда: getUserMedia / AudioContext гонка не создаёт (микрофон открывает игра из тапа, громкость — GainNode движка)', () => {
    expect(files.filter(f => /getUserMedia|new AudioContext|\.volume\s*=/.test(code(f))).map(rel)).toEqual([])
  })
  it('размер файлов: каждый не больше 250 строк (потолок проекта 400), и тесты тоже', () => {
    for (const f of walk(HERE)) expect(readFileSync(f, 'utf8').split('\n').length, rel(f)).toBeLessThanOrEqual(250)
  })
  it('сам страж ловит нарушение', () => {
    expect(/Math\.random/.test(stripComments('const x = Math.random()'))).toBe(true)
    expect(/Math\.random/.test(stripComments('// Math.random нет\n/* и тут Math.random */'))).toBe(false)
  })
})
