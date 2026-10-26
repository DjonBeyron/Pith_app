import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { voiceFillStep, fillProfile, makeFillCurve, FILL_CAP, VOICE_THRESHOLD } from './wordLaneTimeline.js'
import { makeListenPlan, makeMouthLevel } from './wordLanePlan.js'
import { makeNoteWav, NOTES, NOTE_FREQS } from './wordLaneNotes.js'
import { mouthShape } from './wordLaneMouth.js'
import { XP_PER_PILL } from './wordLaneConfig.js'
import { createWordListener } from './wordLaneListen.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('подсказка ученику: темп и «тень» слова диктора', () => {
  it('голос наливает пилюлю до FILL_CAP ровно за длину слова диктора: короткое слово — быстрее, длинное — медленнее', () => {
    const fillTime = ms => { let p = 0; let t = 0; while (p < FILL_CAP && t < 10) { p = voiceFillStep(p, 0.01, 1, ms); t += 0.01 } return t * 1000 }
    expect(fillTime(1000)).toBeGreaterThan(950)
    expect(fillTime(1000)).toBeLessThan(1050)
    expect(fillTime(500)).toBeLessThan(fillTime(1000) * 0.6)
    expect(fillTime(1600)).toBeGreaterThan(fillTime(1000) * 1.5)
    expect(voiceFillStep(0.2, 0.1, VOICE_THRESHOLD, 1000)).toBe(0.2) // не громче порога — не наливает
  })

  it('профиль «тени»: 10 полосок 0.25…1; ровный без озвучки; следует громкости слова с озвучкой', () => {
    expect(fillProfile(null)).toEqual(Array(10).fill(0.6))
    const wave = [...Array(20).fill(250), ...Array(20).fill(5)]            // слово 0…2 с: громко, потом тихо
    const prof = fillProfile(makeFillCurve(wave, 2, 0, 2))
    expect(prof).toHaveLength(10)
    prof.forEach(v => { expect(v).toBeGreaterThanOrEqual(0.25); expect(v).toBeLessThanOrEqual(1) })
    expect(prof[2]).toBeGreaterThan(prof[8] + 0.3)                           // громкий кусок шире тихого
  })

  it('план отдаёт «тени» на каждую пилюлю', () => {
    const p = makeListenPlan(null)
    expect(p.profiles).toHaveLength(3)
    expect(typeof p.mouth).toBe('function')
  })

  it('метка темпа и ожидающая заливка подключены в движке и вёрстке', () => {
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain("'--pace'")
    expect(eng).toContain('p.onset')
    expect(read('./wordLaneStudent.js')).toContain('p.ms)')         // скорость наливания — длина слова диктора
    const css = read('../../../../styles/player/modules/word-lane.css')
    expect(css).toContain(".wl[data-phase='speak'] .wlPill:not([data-lock]) .wlPace")
    expect(css).toContain(".wlPill:not([data-lock]) .wlPillFill")   // «ожидающая» заливка до подтверждения слова
  })
})

describe('честность оценки', () => {
  const mkRuntime = (model = {}) => ({ getModel: () => model })
  const tick = () => new Promise(r => setTimeout(r, 0))
  function fakeListen(steps) {
    return async (model, grammar, cb) => {
      queueMicrotask(() => { cb.onReady?.(); steps.forEach(s => cb.onPartial(s)); cb.onResult(steps.at(-1), { words: [] }) })
      return { stop() {}, cancel() {} }
    }
  }

  it('слушатель отдаёт, что именно услышал движок: «…» вместо неразобранного слова', async () => {
    const seen = []
    const l = createWordListener({ word: 'try', onChange: s => seen.push(s), runtime: mkRuntime(), listen: fakeListen(['try [unk] try']) })
    l.start()
    await tick(); await tick()
    expect(seen.some(s => s.heard === 'try … try')).toBe(true)
    l.dispose()
  })

  it('на время ноты-награды «чужие слова» не засчитываются (эхо динамика), а слова ученика — да', async () => {
    let t = 1000
    const seen = []
    let cb
    const listen = async (model, grammar, callbacks) => { cb = callbacks; queueMicrotask(() => callbacks.onReady?.()); return { stop() {}, cancel() {} } }
    const l = createWordListener({ word: 'try', onChange: s => seen.push(s), runtime: mkRuntime(), listen, now: () => t })
    l.start()
    await tick(); await tick()
    l.mute(900)
    cb.onPartial('try [unk] try')   // нота зазвучала: [unk] в середине — эхо
    expect(seen.at(-1)).toMatchObject({ hits: 2, misses: 0 })
    t += 2000                       // нота отзвучала
    cb.onPartial('try [unk] try [unk] try')   // настоящая ошибка ученика уже считается
    expect(seen.at(-1).misses).toBe(1)
    l.dispose()
  })

  it('чужое слово показывает ученику «Услышал: …»; тишину — «Не слышу голос»; принятое слово не наказывает', () => {
    const flow = read('./useWordLaneFlow.js')
    expect(flow).toContain('Услышал: «${heard')
    const mic = read('./WordLaneMic.jsx')
    expect(mic).toContain('Не слышу голос — говори ближе')
    expect(mic).toContain('QUIET_MS')
  })
})

describe('XP за пилюлю, ноты, Пит', () => {
  it('2 XP за принятую пилюлю; летит цифра из плеера (XpFloat), в профиль пока не начисляется', () => {
    expect(XP_PER_PILL).toBe(2)
    const flow = read('./useWordLaneFlow.js')
    expect(flow).toContain('amount: XP_PER_PILL')
    expect(read('./WordLaneGame.jsx')).toContain("import XpFloat from '../../XpFloat.jsx'")
    expect(read('./WordLaneGame.jsx')).toContain('<XpFloat events={f.xpEvents} onDismiss={f.dismissXp} viewport />')
    // XP — только у ученика: fx.win зовётся из события win конвейера ученика, а в фазе диктора щёлкает без награды
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain("e.type === 'win'")
    expect(eng).toContain('fxRef.current?.win?.(e.order')
    expect(eng.split('fxRef.current?.win?.').length - 1).toBe(1)
  })

  it('нота выше с каждой пилюлей: три возрастающих тона, WAV корректный', () => {
    expect(NOTE_FREQS).toHaveLength(3)
    expect(NOTE_FREQS[0]).toBeLessThan(NOTE_FREQS[1])
    expect(NOTE_FREQS[1]).toBeLessThan(NOTE_FREQS[2])
    NOTES.forEach(n => {
      const w = makeNoteWav(n.freqs, n.ms, n.level)
      expect(String.fromCharCode(...w.slice(0, 4))).toBe('RIFF')
      expect(String.fromCharCode(...w.slice(8, 12))).toBe('WAVE')
      expect(w.length).toBe(44 + Math.floor((22050 * n.ms) / 1000) * 2)
    })
    expect(Math.max(...makeNoteWav([0], 80).slice(44))).toBe(0) // «тишина» для пробуждения элемента — нули
  })

  it('ноты будятся в тапе «Начать» и уважают «без звука»', () => {
    expect(read('./RotatePhoneModule.jsx')).toContain('unlockNotes()')
    expect(read('./wordLaneNotes.js')).toContain('getLessonMuted()')
  })

  it('рот кота: громкость → closed / half / open', () => {
    expect(mouthShape(0)).toBe('closed')
    expect(mouthShape(0.2)).toBe('half')
    expect(mouthShape(0.8)).toBe('open')
  })

  it('рот кота в фазе диктора идёт по громкости озвучки (без озвучки — пульсация на слова), вне слов закрыт', () => {
    const wave = [...Array(10).fill(0), ...Array(10).fill(250), ...Array(10).fill(0)]
    const m = makeMouthLevel([1000], [1000], { wave, duration: 3 }, 0)
    expect(m(500)).toBe(0)       // тишина в файле
    expect(m(1500)).toBeGreaterThan(0.8)
    const pulse = makeMouthLevel([1000], [800], null, null)
    expect(pulse(500)).toBe(0)
    expect(pulse(1300)).toBeGreaterThan(0.4)
    expect(pulse(2500)).toBe(0)
  })

  it('Пит — маскот из конструктора (buildMascot kit): реакции love / shy, рот через setMouth', () => {
    const cat = read('./WordLaneCat.jsx')
    expect(cat).toContain("buildMascot(skin, { face, flip: false })")
    expect(cat).toContain("react(next, ms = 1500)")
    expect(cat).toContain('setMouth(')
    const flow = read('./useWordLaneFlow.js')
    expect(flow).toContain("react('love'")
    expect(flow).toContain("react('shy'")
    expect(read('./WordLaneGame.jsx')).toContain('<WordLaneCat apiRef={catApi} />')
  })
})
