import { describe, it, expect, beforeEach, vi } from 'vitest'

const api = vi.hoisted(() => ({
  getAudioSettingsRows: vi.fn(),
  saveAudioSettingRow: vi.fn(() => Promise.resolve()),
}))
vi.mock('../api/audioSettingsApi.js', () => ({
  ...api, UI_SOUND_VOLUME_KEY: 'ui_sound_volume', EQ_SENSITIVITY_KEY: 'eq_sensitivity',
}))
const store = new Map()
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }

const S = await import('./audioSettings.js')
const { getSoundVolume } = await import('./soundVolume.js')

beforeEach(() => { store.clear(); S._resetAudioSettingsForTests(); vi.clearAllMocks() })

describe('audioSettings: глобальные настройки звука', () => {
  it('без строк в базе — значения по умолчанию (громкость 1, чувствительность 1)', async () => {
    api.getAudioSettingsRows.mockResolvedValue({ volumes: null, eq: null })
    await S.prefetchAudioSettings()
    expect(S.getAudioSettings().volumes).toEqual({})
    expect(S.getEqSensitivity()).toBe(1)
    expect(getSoundVolume('xp-gain')).toBe(1)
  })

  it('ответ сервера применяется к звукам и чувствительности, мусор зажимается; зеркало пишется в localStorage', async () => {
    api.getAudioSettingsRows.mockResolvedValue({ volumes: { 'xp-gain': 0.35, 'level-up': 'x', 'pin-message': 1 }, eq: { value: 9 } })
    await S.prefetchAudioSettings()
    expect(getSoundVolume('xp-gain')).toBe(0.35)
    expect(getSoundVolume('level-up')).toBe(1)
    expect(S.getEqSensitivity()).toBe(S.EQ_MAX)
    expect(JSON.parse(store.get('pithy_ui_sound_volume'))).toEqual({ 'xp-gain': 0.35 })
    expect(JSON.parse(store.get('pithy_eq_sensitivity'))).toBe(3)
  })

  it('запрос не удался (null) — состояние и зеркало не трогаем', async () => {
    S.setUiSoundVolume('xp-gain', 0.5)
    await S.saveUiSoundVolumes()
    api.getAudioSettingsRows.mockResolvedValue(null)
    await S.prefetchAudioSettings()
    expect(getSoundVolume('xp-gain')).toBe(0.5)
  })

  it('setUiSoundVolume применяет сразу и подписчик уведомляется; 1 убирает ключ; сброс — всё в 1', () => {
    const fn = vi.fn()
    const off = S.subscribeAudioSettings(fn)
    S.setUiSoundVolume('answer-wrong', 0.456)
    expect(getSoundVolume('answer-wrong')).toBe(0.46)
    expect(fn).toHaveBeenCalledTimes(1)
    S.setUiSoundVolume('xp-gain', 0.2)
    S.setUiSoundVolume('answer-wrong', 1)
    expect(S.getAudioSettings().volumes).toEqual({ 'xp-gain': 0.2 })
    S.resetUiSoundVolumes()
    expect(S.getAudioSettings().volumes).toEqual({})
    expect(getSoundVolume('xp-gain')).toBe(1)
    off()
  })

  it('чувствительность зажата 0.3…3', () => {
    S.setEqSensitivity(0.1); expect(S.getEqSensitivity()).toBe(0.3)
    S.setEqSensitivity(5); expect(S.getEqSensitivity()).toBe(3)
    S.setEqSensitivity(1.74); expect(S.getEqSensitivity()).toBe(1.74)
    S.setEqSensitivity('abc'); expect(S.getEqSensitivity()).toBe(1)
  })

  it('сохранение: upsert нужного ключа; ошибка сервера пробрасывается; пока правка не сохранена, ответ сети её не затирает', async () => {
    S.setUiSoundVolume('xp-gain', 0.5)
    S.setEqSensitivity(2)
    api.getAudioSettingsRows.mockResolvedValue({ volumes: { 'xp-gain': 0.9 }, eq: { value: 1 } })
    await S.prefetchAudioSettings()
    expect(getSoundVolume('xp-gain')).toBe(0.5)
    await S.saveUiSoundVolumes()
    await S.saveEqSensitivity()
    expect(api.saveAudioSettingRow).toHaveBeenCalledWith('ui_sound_volume', { 'xp-gain': 0.5 })
    expect(api.saveAudioSettingRow).toHaveBeenCalledWith('eq_sensitivity', { value: 2 })
    api.saveAudioSettingRow.mockRejectedValueOnce(new Error('нет прав'))
    await expect(S.saveEqSensitivity()).rejects.toThrow('нет прав')
  })
})
