import { describe, it, expect } from 'vitest'
import { validateSceneV2, normalizeSceneV2, parseSceneV2 } from './sceneSchemaV2.js'
import { lintScene } from './sceneLint.js'
import { demoMascotScene, demoOfficeScene } from './demoScenes.js'
import { sceneByteSize } from './sceneNode.js'

// audioMeta.env — огибающая громкости для рта «живого Пита v2» (shared/lib/audioEnvelope.js): схема принимает, старые сцены без неё не ломаются
const clone = o => JSON.parse(JSON.stringify(o))
const HASH = 'a'.repeat(64)
const ENV = { hz: 20, data: '001bd79ca11743cff84200073814795678994113531000' }

function withAudio(base, i, meta) {
  const s = clone(base)
  s.timeline[i] = { ...s.timeline[i], audioUrl: 'https://pub-1.r2.dev/chat/a.mp3', audioMeta: meta }
  return s
}

describe('audioMeta.env в схеме сцены', () => {
  it('валидатор принимает env; нормализация её сохраняет; сцена без env (старая) по-прежнему валидна', () => {
    const s = withAudio(demoMascotScene, 0, { hash: HASH, voiceId: 'v', durationMs: 2400, env: ENV })
    expect(validateSceneV2(s)).toEqual([])
    expect(normalizeSceneV2(s).timeline[0].audioMeta.env).toEqual(ENV)
    expect(parseSceneV2(JSON.stringify(s)).errors).toEqual([])
    expect(validateSceneV2(withAudio(demoMascotScene, 0, { hash: HASH, voiceId: 'v' }))).toEqual([])
    expect(validateSceneV2(demoOfficeScene)).toEqual([])
  })

  it('env есть и у перевода (translationAudioMeta)', () => {
    const s = withAudio(demoMascotScene, 0, { hash: HASH })
    s.timeline[0].translationAudioUrl = 'https://pub-1.r2.dev/chat/t.mp3'
    s.timeline[0].translationAudioMeta = { hash: HASH, env: ENV }
    expect(validateSceneV2(s)).toEqual([])
  })

  it('негодная env — ошибка по-русски с путём; лишних полей в audioMeta по-прежнему нет', () => {
    for (const env of [{ hz: 20 }, { hz: 0, data: 'ff' }, { hz: 20, data: 'xyz' }, 'ff', { hz: 20, data: '' }]) {
      const errs = validateSceneV2(withAudio(demoMascotScene, 0, { hash: HASH, env }))
      expect(errs.some(e => e.includes('timeline[0].audioMeta.env') && e.includes('огибающая'))).toBe(true)
    }
    expect(validateSceneV2(withAudio(demoMascotScene, 0, { hash: HASH, junk: 1 })).some(e => e.includes('лишнее поле'))).toBe(true)
  })

  it('размер: огибающая реплики в 10 с — 200 символов (≤ 260 байт с ключами)', () => {
    const base = withAudio(demoMascotScene, 0, { hash: HASH })
    const big = withAudio(demoMascotScene, 0, { hash: HASH, env: { hz: 20, data: 'f'.repeat(200) } })
    expect(sceneByteSize(big) - sceneByteSize(base)).toBeLessThan(260)
  })
})

describe('линтер: «нет огибающей» (только при animV2, предупреждение)', () => {
  const envWarn = findings => findings.filter(f => f.text.includes('audioMeta.env'))

  it('animV2 + озвученная реплика маскота без env → warn; с env, без файла, без флага — нет', () => {
    const noEnv = withAudio(demoMascotScene, 0, { hash: HASH })
    const f = envWarn(lintScene(noEnv, { animV2: true }))
    expect(f).toHaveLength(1)
    expect(f[0].level).toBe('warn')
    expect(f[0].text).toContain('timeline[0]')
    expect(envWarn(lintScene(noEnv))).toEqual([])
    expect(envWarn(lintScene(noEnv, { animV2: false }))).toEqual([])
    expect(envWarn(lintScene(withAudio(demoMascotScene, 0, { hash: HASH, env: ENV }), { animV2: true }))).toEqual([])
    expect(envWarn(lintScene(demoMascotScene, { animV2: true }))).toEqual([])
  })

  it('обычный кот (без skin) предупреждения не получает: у него рот по-старому', () => {
    const s = withAudio(demoOfficeScene, 0, { hash: HASH })
    expect(envWarn(lintScene(s, { animV2: true }))).toEqual([])
  })

  it('это не ошибка: сцену с предупреждением можно публиковать', () => {
    const f = lintScene(withAudio(demoMascotScene, 0, { hash: HASH }), { animV2: true })
    expect(f.filter(x => x.level === 'error' && x.text.includes('env'))).toEqual([])
  })
})
