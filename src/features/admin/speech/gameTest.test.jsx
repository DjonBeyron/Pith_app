import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import GameTestBlock from './GameTestBlock.jsx'
import { chunkRows, loadTestForm, saveTestForm, TEST_KEY, TEST_DEFAULTS } from './gameTestRows.js'

vi.mock('../../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => ({ status: 'preparing', download() {}, retry() {} }) })) // фоновая загрузка Vosk не рендерится на сервере

// Админ → «Голос» → «Тест игры»: фраза с кусками, озвучка кусков в библиотеку слов, запуск игры без урока
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('куски и озвучка', () => {
  it('chunkRows: ключ wordKey, чистый текст для озвучки, «есть озвучка» по библиотеке', () => {
    const lib = new Map([["i'm", { url: 'x' }], ['trying', { url: 'y' }]])
    expect(chunkRows("I'm | trying | to learn", lib)).toEqual([
      { text: "I'm", key: "i'm", has: true },
      { text: 'trying', key: 'trying', has: true },
      { text: 'to learn', key: 'to learn', has: false },
    ])
  })
  it('библиотека ещё не загружена — «нет озвучки»; кириллица не для озвучки (ключа нет); больше трёх кусков не берём', () => {
    expect(chunkRows('try', null)).toEqual([{ text: 'try', key: 'try', has: false }])
    expect(chunkRows('привет', new Map())[0]).toMatchObject({ key: null, has: false })
    expect(chunkRows('a | b | c | d', new Map())).toHaveLength(3)
    expect(chunkRows('', new Map())).toEqual([])
  })
  it('форма запоминается в браузере админа; мусор и приватный режим — значения по умолчанию', () => {
    const s = memStore()
    expect(loadTestForm(s)).toEqual(TEST_DEFAULTS)
    saveTestForm({ phrase: 'go | home', translation: 'иди домой' }, s)
    expect(JSON.parse(s.m[TEST_KEY])).toEqual({ phrase: 'go | home', translation: 'иди домой' })
    expect(loadTestForm(s)).toEqual({ phrase: 'go | home', translation: 'иди домой' })
    expect(loadTestForm(memStore({ [TEST_KEY]: '{не json' }))).toEqual(TEST_DEFAULTS)
    const broken = { getItem() { throw new Error('p') }, setItem() { throw new Error('p') } }
    expect(loadTestForm(broken)).toEqual(TEST_DEFAULTS)
    expect(() => saveTestForm(TEST_DEFAULTS, broken)).not.toThrow()
  })
})

describe('блок «Тест игры»', () => {
  it('по умолчанию «I\'m | trying | to learn», кнопки «Озвучить» и «Запустить игру», индикация у каждого куска', () => {
    const out = renderToStaticMarkup(createElement(GameTestBlock))
    expect(out).toContain('data-testid="game-test-block"')
    expect(out).toContain('I&#x27;m | trying | to learn')
    expect(out).toContain('data-testid="game-test-voice"')
    expect(out).toContain('data-testid="game-test-start"')
    expect(out).toContain('Запустить игру')
    expect(out).toContain('нет озвучки') // библиотека ещё не загружена
    expect(out.match(/<li /g)).toHaveLength(3)
  })
  it('запуск — через игру модуля rotate_phone с синтетической нодой и forceDebug; тап кнопки зовёт start() модуля (жест)', () => {
    const src = read('./GameTestBlock.jsx')
    expect(src).toContain("type: 'rotate_phone'")
    expect(src).toContain("lang: 'en-US', content: 'Тест'")
    expect(src).toContain('<RotatePhoneModule node={node} bare forceDebug startRef={startRef}')
    expect(src).toContain('onClick={() => startRef.current?.()}')
    expect(src).toContain("runs > 0 ? 'Ещё раз' : 'Запустить игру'")
  })
  it('озвучка — тот же путь, что у уроков: generateWordAudio (ElevenLabs → R2 → word_audio) по ключу wordKey; блок вставлен в «Голос»', () => {
    const src = read('./GameTestBlock.jsx')
    expect(src).toContain("import { generateWordAudio } from '../../../shared/lib/wordAudio/wordAudioGenerate.js'")
    expect(src).toContain('generate(r.key, r.text)')
    expect(src).toContain('listWordAudio()')
    const tab = read('./AdminSpeechTab.jsx')
    expect(tab).toContain("import GameTestBlock from './GameTestBlock.jsx'")
    expect(tab).toContain('<GameTestBlock />')
  })
})
