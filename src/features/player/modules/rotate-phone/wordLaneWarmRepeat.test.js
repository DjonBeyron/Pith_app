import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { prefetchWords, dropWarmed } from './wordLaneFetch.js'
import { releaseClips } from './wordLaneClips.js'
import { isSettled } from './wordLaneSettled.js'
import { warmGameSounds } from './wordLaneWarm.js'
import { readWordLane } from './wordLaneConfig.js'
import { normalizeLines } from './wordLaneCatLines.js'

// Повторный запуск игры при той же карточке (тест-блок, шлифовка) и «Ещё минутку?»: озвучка уже прогрета и не теряется с концом игры; прогрев запускается заново, когда карточка снова ждёт тапа
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const fileOf = (n = 8000) => ({ numberOfChannels: 1, length: n, sampleRate: 8000, duration: n / 8000, getChannelData: () => Float32Array.from({ length: n }, (_, i) => (i > 800 && i < 4000 ? Math.sin(i / 10) : 0)) })
let fetches
beforeEach(() => {
  fetches = []
  vi.stubGlobal('fetch', url => { fetches.push(url); return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }) })
  vi.stubGlobal('window', { OfflineAudioContext: class { decodeAudioData() { return Promise.resolve(fileOf()) } } })
  Blob.prototype.arrayBuffer ??= () => Promise.resolve(new ArrayBuffer(8))
})
afterEach(() => { releaseClips(); vi.unstubAllGlobals() })
const items = n => Array.from({ length: n }, (_, i) => ({ key: `w${i}`, url: `https://r2/rep${i}-${Math.random()}.mp3` }))

describe('конец игры при открытой карточке: прогретое остаётся', () => {
  it('releaseClips({ keepWarm }) не отпускает скачанное и отметки «готово» (ворота повторного тапа открыты сразу), обычный releaseClips — отпускает', async () => {
    const list = items(3)
    await prefetchWords(list)
    expect(list.every(i => isSettled(i.url))).toBe(true)
    releaseClips({ keepWarm: true })
    expect(list.every(i => isSettled(i.url))).toBe(true)
    await prefetchWords(list)
    expect(fetches).toHaveLength(3) // второй тап: ни сети, ни декодирования
    releaseClips()
    expect(list.some(i => isSettled(i.url))).toBe(false)
    await prefetchWords(list)
    expect(fetches).toHaveLength(6)
  })
  it('dropWarmed(urls) — карточка закрыта: отпускаются только её файлы, чужие остаются', async () => {
    const mine = items(2), other = items(1)
    await prefetchWords([...mine, ...other])
    dropWarmed(mine.map(i => i.url))
    expect(mine.some(i => isSettled(i.url))).toBe(false)
    expect(isSettled(other[0].url)).toBe(true)
    await prefetchWords(mine)
    expect(fetches).toHaveLength(5)
  })
})

describe('повторный прогрев', () => {
  it('второй warmGameSounds после конца игры снова спрашивает библиотеку и качает набор; onItems отдаёт адреса (карточка отпустит их при закрытии)', async () => {
    const cfg = readWordLane({ phrase: "I'm | trying | to learn" })
    const lines = normalizeLines({ lines: { split_words: { text: 'a', url: 'https://r2/split.mp3', duration: 1 } } })
    const prefetch = vi.fn(async () => {})
    const list = vi.fn(async () => {})
    const seen = []
    await warmGameSounds({ cfg, lines }, { prefetch, list, onItems: its => seen.push(...its.map(i => i.url)) })
    await warmGameSounds({ cfg, lines }, { prefetch, list, onItems: its => seen.push(...its.map(i => i.url)) }) // игра кончилась → карточка снова в ожидании
    expect(prefetch).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenCalledTimes(2)
    expect(seen).toContain('https://r2/split.mp3')
    await expect(warmGameSounds({ cfg, lines }, { prefetch, list, onItems: () => { throw new Error('x') } })).resolves.toBeUndefined() // сбой подписчика прогрев не ломает
    expect(prefetch).toHaveBeenCalledTimes(3)
  })
})

describe('карточка игры (RotatePhoneModule) и игра', () => {
  const card = read('./RotatePhoneModule.jsx')
  it('прогрев запускается заново, когда карточка снова в ожидании (phase === wait), а не один раз при монтировании', () => {
    expect(card).toMatch(/useEffect\(\(\) => \{ if \(phase === 'wait'\) warm\(cfg, \{ onListed: \(\) => setListed\(sig\) \}\) \}, \[cfg, sig, phase, warm\]\)/)
  })
  it('конец игры и срыв старта отпускают контекст, но оставляют прогретое; при закрытии карточки отпускаются её файлы', () => {
    expect(card).toContain('releaseClips({ keepWarm: true }); endGameAudio(); closeGameMic(); leaveFullscreen()')
    expect(card).toContain('useEffect(() => () => dropWarmed([...warmed.current]), [])')
    const flow = read('./useWordLaneFlow.js')
    expect(flow.match(/releaseClips\(\{ keepWarm: true \}\)/g)).toHaveLength(2) // конец (finish) и размонтирование игры, в том числе в «Ещё минутку?»
    expect(flow).not.toMatch(/releaseClips\(\)/)
  })
  it('«Ещё минутку?»: пока идёт итог, прогревается набор СЛЕДУЮЩЕГО плана (onSummary → RehearsalSummary.onShown)', () => {
    expect(card).toContain('const prewarmNext = useCallback(() => { const next = nextPlan(cfg.plan); if (next) warm(readWordLane({ plan: next })) }, [cfg, warm])')
    expect(card).toContain('onSummary={cfg.plan && !cfg.plan.only ? prewarmNext : null}')
    expect(read('./WordLaneGame.jsx')).toContain('onSummary={onSummary}')
    expect(read('../../../rehearsal/RehearsalActs.jsx')).toContain('onShown={onSummary}')
    expect(read('../../../rehearsal/RehearsalSummary.jsx')).toContain('useEffect(() => { onShown?.() }, [])')
  })
})
