import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { warmGameSounds, warmLessonRotate, warmSig } from './wordLaneWarm.js'
import { readWordLane } from './wordLaneConfig.js'
import { normalizeLines } from './wordLaneCatLines.js'
import { startRotateWarmups } from '../../useLessonWarmups.js'

// Озвучка кусков и реплик Пита качается ДО тапа «Начать» (карточка игры показана / урок начался): к тапу остаётся разбудить слоты, а не ждать сеть 2,5 с
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const cfgOf = (extra = {}) => readWordLane({ phrase: "I'm | trying | to learn", ...extra })
const linesWith = urls => normalizeLines({ lines: Object.fromEntries(urls.map(([id, url]) => [id, { text: id, url, duration: 1 }])) })

describe('warmGameSounds: что и в каком порядке качается', () => {
  it('всё качается одним списком (нужное к старту — первым); библиотека слов спрашивается первой', async () => {
    const order = []
    const prefetch = vi.fn(async (items, opts) => { order.push(items.map(i => i.key)); return opts })
    const list = vi.fn(async () => { order.push('list') })
    const lines = linesWith([['split_words', 'https://r2/split.mp3'], ['try_again', 'https://r2/again.mp3']])
    await warmGameSounds({ cfg: cfgOf(), lines }, { prefetch, list })
    expect(list).toHaveBeenCalledTimes(1)
    expect(order[0]).toBe('list')
    expect(prefetch).toHaveBeenCalledTimes(1) // ВСЁ сразу: now + late одним списком
    const first = order[1]
    expect(first).toEqual(expect.arrayContaining(['line:split_words', 'line:try_again']))
  })

  it('измерение включено по умолчанию (карточка), в прогреве урока выключено; сбой сети/библиотеки не отклоняет промис', async () => {
    const prefetch = vi.fn(async () => {})
    await warmGameSounds({ cfg: cfgOf(), lines: linesWith([]) }, { prefetch, list: async () => {} })
    expect(prefetch.mock.calls.every(c => c[1].measure === true)).toBe(true)
    const lesson = vi.fn(async () => {})
    await warmLessonRotate([{ typeData: { rotate_phone: { phrase: 'try' } } }], { prefetch: lesson, list: async () => {}, readLines: async () => linesWith([]) })
    expect(lesson).toHaveBeenCalled()
    expect(lesson.mock.calls.every(c => c[1].measure === false)).toBe(true)
    await expect(warmGameSounds({ cfg: cfgOf(), lines: linesWith([]) }, { prefetch: async () => { throw new Error('net') }, list: async () => { throw new Error('db') } })).resolves.toBeUndefined()
    await expect(warmLessonRotate([{ typeData: null }], { readLines: async () => { throw new Error('db') } })).resolves.toBeUndefined()
  })

  it('warmSig меняется, когда меняются куски или адреса реплик (тогда «Готовлю звук…» показывается заново)', () => {
    const a = warmSig(cfgOf(), linesWith([['try_again', 'https://r2/a.mp3']]))
    expect(warmSig(cfgOf(), linesWith([['try_again', 'https://r2/a.mp3']]))).toBe(a)
    expect(warmSig(cfgOf(), linesWith([['try_again', 'https://r2/b.mp3']]))).not.toBe(a)
    expect(warmSig(cfgOf({ phrase: 'so | far' }), linesWith([['try_again', 'https://r2/a.mp3']]))).not.toBe(a)
  })
})

describe('подключение', () => {
  it('прогрев урока: ноды rotate_phone качаются в простое отдельным чанком; нод нет — ничего; выход из урока отпускает', async () => {
    const stopIdle = vi.fn()
    const idle = vi.fn(tasks => { idle.tasks = tasks; return stopIdle })
    const warmLessonRotate = vi.fn(async () => {})
    const load = vi.fn(async () => ({ warmLessonRotate }))
    expect(startRotateWarmups([], { idle, load })).toBeUndefined()
    expect(idle).not.toHaveBeenCalled()
    const nodes = [{ type: 'rotate_phone', typeData: { rotate_phone: { phrase: 'try' } } }]
    const stop = startRotateWarmups(nodes, { idle, load })
    expect(load).not.toHaveBeenCalled() // чанк грузится в простое, не сразу
    await idle.tasks[0]()
    expect(warmLessonRotate).toHaveBeenCalledWith(nodes)
    stop()
    expect(stopIdle).toHaveBeenCalled()
    await idle.tasks[0]() // урок закрыт, а задача простоя всё же сработала — не качаем
    expect(warmLessonRotate).toHaveBeenCalledTimes(1)
  })

  it('карточка игры: качает при показе, пока качается — «Готовлю звук…» (кнопку «Начать» не блокирует); в тапе prefetch берёт те же скачанные файлы', () => {
    const mod = read('./RotatePhoneModule.jsx')
    expect(mod).toContain("import { warmGameSounds, warmSig } from './wordLaneWarm.js'")
    expect(mod).toContain('warmGameSounds({ cfg, lines }, { onListed: () => setListed(sig) })')
    expect(mod).toContain("phase === 'wait' && !wp.all && <WordLaneWarmBar wp={wp} />")
    expect(mod).toContain("label={phase === 'wait' && !wp.open ? wp.label : null}") // кнопка: «Готовлю звук… 7/15», пока ворота закрыты
    expect(mod).toContain('disabled={busy || locked}') // прогрев в блокировку не входит: тап разрешён, игра ждёт ворота
    expect(mod).not.toMatch(/locked=\{[^}]*warm/)
    expect(read('./wordLaneFetch.js')).toContain('let p = blobs.get(url)') // тот же fetchBlob: повторный вызов получает тот же промис
  })

  it('«Шлифовка репетиции» и «Тест игры» монтируют RotatePhoneModule — прогрев карточки работает и там; в уроке — useLessonWarmups', () => {
    expect(readFileSync(new URL('../../../admin/speech/RehearsalPolishBlock.jsx', import.meta.url), 'utf8')).toContain('<RotatePhoneModule')
    expect(readFileSync(new URL('../../../admin/speech/GameTestBlock.jsx', import.meta.url), 'utf8')).toContain('<RotatePhoneModule')
    const hook = readFileSync(new URL('../../useLessonWarmups.js', import.meta.url), 'utf8')
    expect(hook).toContain("import('./modules/rotate-phone/wordLaneWarm.js')")
    expect(hook).toContain("n.type === 'rotate_phone'")
  })
})
