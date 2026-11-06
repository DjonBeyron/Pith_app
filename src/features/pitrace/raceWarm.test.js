import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRaceWarm, raceWarmItems, WARM_FIRST_WORDS } from './raceWarm.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { raceFirstLines } from './raceTexts.js'
import { buildRaceActs } from './raceRecipe.js'

// Прогрев «Встряхни память» в жесте «Начать» (без звука и микрофона): AudioContext открыт, первые реплики, похвалы и первые слова декодируются ПЕРВЫМИ, журнал «[warm] гонка: …»; при входе в игру — что уже в памяти.
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const ln = id => ({ url: `https://x/${id}.mp3`, text: id, duration: 2 })
const lines = { race_start: ln('race_start'), race_catch: ln('race_catch'), race_good_1: ln('race_good_1'), race_good_3: ln('race_good_3'), race_climb: ln('race_climb') }
const cfg = { chunks: plan.chunks, confusers: [], extraWords: [], translations: [], firstLines: ['race_start', 'race_catch'], plan }

describe('что греть первым', () => {
  it('race_start, реплика первого акта, похвалы с озвучкой; реплики позже (Вершина) — нет', () => {
    const keys = raceWarmItems({ cfg, lines }).map(i => i.key)
    expect(keys.slice(0, 2)).toEqual(['line:race_start', 'line:race_catch']); expect(keys).toContain('line:race_good_1'); expect(keys).toContain('line:race_good_3')
    expect(keys).not.toContain('line:race_climb'); expect(keys).not.toContain('line:race_good_2') // без озвучки — нечего декодировать
    expect(WARM_FIRST_WORDS).toBe(3)
  })
  it('режим «Пальцами»: первой декодируется race_start_tap, а не race_start (стартовая фраза выбранного режима)', () => {
    const tapLines = { ...lines, race_start_tap: ln('race_start_tap') }
    const tapCfg = { ...cfg, firstLines: raceFirstLines(plan, buildRaceActs(plan, true, true).acts, true) }
    expect(tapCfg.firstLines).toEqual(['race_start_tap'])
    const keys = raceWarmItems({ cfg: tapCfg, lines: tapLines }).map(i => i.key)
    expect(keys[0]).toBe('line:race_start_tap'); expect(keys).not.toContain('line:race_start')
  })
})

describe('прогрев в «Начать»', () => {
  it('открывает контекст (без звука), декодирует первые файлы и пишет журнал; вход в игру — отчёт, что в памяти', async () => {
    let t = 0
    const log = vi.fn(), unlock = vi.fn(() => Promise.resolve('running')), prefetch = vi.fn(() => Promise.resolve())
    const done = new Set(['https://x/race_start.mp3'])
    const w = createRaceWarm({ unlock, prefetch, log, decoded: u => done.has(u), ctxState: () => 'running', now: () => t })
    const p = w.start({ cfg, lines })
    expect(unlock).toHaveBeenCalledTimes(1); expect(prefetch).toHaveBeenCalledWith(w.items()) // синхронно в жесте
    expect(log.mock.calls[0][0]).toMatch(/^\[warm\] гонка: прогрев начат в «Начать» \(без звука и микрофона\), ctx=running; первыми декодирую 4: race_start, race_catch, race_good_1, race_good_3/)
    t = 180; await p
    expect(log.mock.calls.map(c => c[0])).toContain('[warm] гонка: декодировано 1/4 за 180 мс; нет в памяти: race_catch, race_good_1, race_good_3')
    done.add('https://x/race_catch.mp3'); t = 900
    expect(w.entryReport()).toEqual({ ok: 2, total: 4, start: true })
    expect(log.mock.calls.at(-1)[0]).toBe('[warm] гонка: вход в игру — в памяти 2/4, race_start декодирован, ctx=running, прогрев начат 900 мс назад')
  })
  it('сбой открытия контекста или скачивания прогрев не роняет', async () => {
    const w = createRaceWarm({ unlock: () => { throw new Error('нет') }, prefetch: () => Promise.reject(new Error('сеть')), log: () => {}, decoded: () => false, ctxState: () => null })
    await expect(w.start({ cfg, lines })).resolves.toBeUndefined()
    expect(w.entryReport().start).toBe(false)
  })
  it('в прогреве нет ни звука, ни микрофона: ни getUserMedia, ни startGameAudio, ни play', () => {
    const src = readFileSync(new URL('./raceWarm.js', import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '')
    expect(src).not.toMatch(/getUserMedia|openGameMic|startGameAudio|\.play\(|speechSynthesis|Math\.random/)
  })
})
