import { describe, it, expect, vi } from 'vitest'
import { AUDIO_PRESETS, PRESET_IDS, PRESET_KEY, CUSTOM, DEFAULT_PRESET, presetIdOf, currentPresetId, applyPreset, describePreset, presetInner, readSelectedPreset, writeSelectedPreset, applySelected, audioModeInfo } from './audioPresets.js'
import { AUDIO_SESSION_KEY, MIC_HOLD_KEY, readAudioSessionMode, readMicHoldMode } from '../../../shared/lib/gameAudioSettings.js'
import { MIC_PROCESSING_KEY, isMicProcessingOn } from '../../../shared/lib/gameMic.js'
import { makeComment, summaryText, listComments, addComment } from './rehearsalComments.js'
import { snapshotSettings } from './commentSettings.js'

// «Режим звука» A…H для запуска этапов: список, применение трёх настроек, обратное определение (custom), хранение выбора, запись в журнал, режим звука в комментарии
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const broken = { getItem() { throw new Error('p') }, setItem() { throw new Error('p') }, removeItem() { throw new Error('p') } }

describe('список пресетов', () => {
  it('восемь режимов A…H с короткими подписями владельца', () => {
    expect(PRESET_IDS).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    expect(AUDIO_PRESETS.map(p => p.title)).toEqual([
      'Запись+воспр., не глушить, обработка выкл', 'Запись+воспр., выключать дорожку на речь Пита', 'Запись+воспр., закрывать микрофон на речь Пита', 'Авто-сессия, не глушить',
      'По фазам, не глушить', 'По фазам, закрывать микрофон', 'Обработка микрофона системой ВКЛ, не глушить', 'Обработка ВКЛ, закрывать микрофон',
    ])
  })
  it('три настройки каждого: сессия, дорожка на речь Пита, обработка микрофона', () => {
    const t = Object.fromEntries(AUDIO_PRESETS.map(p => [p.id, [p.session, p.hold, p.processing]]))
    expect(t).toEqual({
      A: ['play-and-record', 'none', false], B: ['play-and-record', 'enabled-false', false], C: ['play-and-record', 'close', false], D: ['auto', 'none', false],
      E: ['phases', 'none', false], F: ['phases', 'close', false], G: ['play-and-record', 'none', true], H: ['play-and-record', 'close', true],
    })
    expect(new Set(AUDIO_PRESETS.map(p => `${p.session}|${p.hold}|${p.processing}`)).size).toBe(8) // ни один не совпадает с другим — обратное определение однозначно
    expect(DEFAULT_PRESET).toBe('A')
  })
})

describe('применить и определить', () => {
  it('applyPreset пишет три настройки; currentPresetId узнаёт тот же пресет — для каждого из восьми', () => {
    for (const p of AUDIO_PRESETS) {
      const s = memStore()
      expect(applyPreset(p.id, s)).toBe(p)
      expect([readAudioSessionMode(s), readMicHoldMode(s), isMicProcessingOn(s)]).toEqual([p.session, p.hold, p.processing])
      expect(currentPresetId(s)).toBe(p.id)
    }
  })
  it('C: в хранилище лежат play-and-record (по умолчанию — ключа нет), close, обработка выключена', () => {
    const s = memStore({ [MIC_PROCESSING_KEY]: '1' })
    applyPreset('C', s)
    expect(s.m).toEqual({ [MIC_HOLD_KEY]: 'close' })
    applyPreset('H', s)
    expect(s.m).toEqual({ [MIC_HOLD_KEY]: 'close', [MIC_PROCESSING_KEY]: '1' })
    applyPreset('E', s)
    expect(s.m).toEqual({ [AUDIO_SESSION_KEY]: 'phases' })
  })
  it('пресет полностью заменяет прежние настройки (остатков от прошлого режима нет)', () => {
    const s = memStore({ [AUDIO_SESSION_KEY]: 'phases', [MIC_HOLD_KEY]: 'enabled-false', [MIC_PROCESSING_KEY]: '1' })
    applyPreset('A', s)
    expect(s.m).toEqual({}); expect(currentPresetId(s)).toBe('A')
  })
  it('настройки, не похожие ни на один пресет, — custom; незнакомый id ничего не меняет', () => {
    const s = memStore({ [AUDIO_SESSION_KEY]: 'auto', [MIC_HOLD_KEY]: 'close' })
    expect(currentPresetId(s)).toBe(CUSTOM)
    expect(presetIdOf({ session: 'auto', hold: 'enabled-false', processing: true })).toBe(CUSTOM)
    expect(applyPreset('Z', s)).toBeNull(); expect(applyPreset(undefined, s)).toBeNull()
    expect(s.m).toEqual({ [AUDIO_SESSION_KEY]: 'auto', [MIC_HOLD_KEY]: 'close' })
  })
  it('нет хранилища / приватный режим: по умолчанию это A, запись не падает', () => {
    expect(currentPresetId(broken)).toBe('A'); expect(currentPresetId(null)).toBe('A')
    expect(() => applyPreset('C', broken)).not.toThrow()
  })
  it('describePreset: «C — подпись», custom — «свой набор»; presetInner — три значения', () => {
    expect(describePreset('C')).toBe('C — Запись+воспр., закрывать микрофон на речь Пита')
    expect(describePreset(CUSTOM)).toContain('свой набор'); expect(describePreset('Z')).toContain('свой набор')
    expect(presetInner(AUDIO_PRESETS[7])).toBe('сессия play-and-record · дорожка close · обработка ВКЛ'); expect(presetInner(null)).toBe('')
  })
})

describe('выбор пресета для запуска', () => {
  it('хранится в pithy_rh_audio_preset_v1; по умолчанию A; мусор и сбой хранилища — A', () => {
    const s = memStore()
    expect(PRESET_KEY).toBe('pithy_rh_audio_preset_v1'); expect(readSelectedPreset(s)).toBe('A')
    writeSelectedPreset('F', s)
    expect(s.m[PRESET_KEY]).toBe('F'); expect(readSelectedPreset(s)).toBe('F')
    writeSelectedPreset('Z', s); expect(readSelectedPreset(s)).toBe('F')
    expect(readSelectedPreset(memStore({ [PRESET_KEY]: 'мусор' }))).toBe('A'); expect(readSelectedPreset(broken)).toBe('A')
    expect(() => writeSelectedPreset('B', broken)).not.toThrow()
  })
  it('applySelected: выбранный пресет применяется и пишется в журнал плеера «[audio-mode] пресет C: …»', () => {
    const s = memStore({ [PRESET_KEY]: 'C', [MIC_PROCESSING_KEY]: '1' })
    const log = vi.fn()
    const r = applySelected({ store: s, log })
    expect(r.id).toBe('C'); expect(currentPresetId(s)).toBe('C')
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toBe('[audio-mode] пресет C: Запись+воспр., закрывать микрофон на речь Пита (сессия play-and-record · дорожка close · обработка выкл)')
    expect(r.line).toBe(log.mock.calls[0][0])
  })
  it('applySelected: сбой журнала не мешает применить режим', () => {
    const s = memStore({ [PRESET_KEY]: 'E' })
    const r = applySelected({ store: s, log: () => { throw new Error('log') } })
    expect(r.id).toBe('E'); expect(currentPresetId(s)).toBe('E')
  })
})

describe('режим звука в экспорте', () => {
  it('audioModeInfo из описания микрофона игры (dump.mic.game): пресет узнаётся, launched — выбор при запуске', () => {
    const s = memStore({ [PRESET_KEY]: 'C' })
    const info = audioModeInfo({ game: { audioSessionMode: 'play-and-record', micHoldMode: 'close', processing: false }, store: s })
    expect(info).toMatchObject({ id: 'C', launched: 'C', custom: false, line: 'C — Запись+воспр., закрывать микрофон на речь Пита' })
  })
  it('настройки поменяли после запуска — custom, в строке видно, в каком режиме запускали', () => {
    const s = memStore({ [PRESET_KEY]: 'C' })
    const info = audioModeInfo({ game: { audioSessionMode: 'auto', micHoldMode: 'close', processing: false }, store: s })
    expect(info).toMatchObject({ id: CUSTOM, launched: 'C', custom: true })
    expect(info.line).toContain('свой набор'); expect(info.line).toContain('запускали в режиме C — Запись+воспр., закрывать микрофон на речь Пита')
  })
  it('без описания микрофона берётся из настроек браузера сейчас', () => {
    const s = memStore({ [MIC_PROCESSING_KEY]: '1' })
    expect(audioModeInfo({ store: s }).id).toBe('G')
  })
  it('в снимке настроек комментария есть audioPreset; в комментарии — на момент сохранения; переключатель в окне делает его custom, сводка это показывает', () => {
    const s = memStore({ [PRESET_KEY]: 'C' }); applyPreset('C', s)
    const readers = { hud: () => ({}), sessionMode: () => 'play-and-record', micHold: () => 'close', micProcessing: () => false, launchedPreset: () => 'C' }
    const settings = snapshotSettings(readers)
    expect(settings.audioPreset).toMatchObject({ id: 'C', launched: 'C' })
    const same = makeComment({ text: 'раз', snap: { stage: { act: 'build' } }, settings, changes: [], t: 1 })
    expect(same.audioPreset).toMatchObject({ id: 'C', atTap: 'C', changed: false })
    vi.stubGlobal('localStorage', s)
    try {
      s.setItem(MIC_PROCESSING_KEY, '1') // в окне 💬 включили «обработку микрофона»: C → custom
      const diff = makeComment({ text: 'два', snap: { stage: { act: 'build' } }, settings, changes: [{ t: 5, key: 'proc', label: 'обработка микрофона', from: 'выкл', to: 'вкл' }], t: 2 })
      expect(diff.audioPreset).toMatchObject({ id: 'H', atTap: 'C', changed: true }) // C + обработка = H — это тоже пресет, а не custom
      s.setItem(AUDIO_SESSION_KEY, 'auto')
      const custom = makeComment({ text: 'три', snap: { stage: { act: 'build' } }, settings, changes: [{ t: 5, key: 'session', label: 'аудиосессия', from: 'play-and-record', to: 'auto' }], t: 3 })
      expect(custom.audioPreset).toMatchObject({ id: CUSTOM, atTap: 'C', launched: 'C', custom: true, changed: true })
      const text = summaryText('build', [same, custom])
      expect(text).toContain('   Режим звука: C — Запись+воспр., закрывать микрофон на речь Пита')
      expect(text).toContain('Режим звука: свой набор'); expect(text).toContain('в момент тапа было: C —')
      const store = memStore(); addComment('build', custom, store)
      expect(listComments('build', store)[0].audioPreset.id).toBe(CUSTOM)
    } finally { vi.unstubAllGlobals() }
  })
})
