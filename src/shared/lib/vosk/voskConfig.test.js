import { describe, it, expect } from 'vitest'
import { VOSK_MODEL_URL, VOSK_URL_KEY, defaultModelUrl, readModelUrl, writeModelUrl, resetModelUrl } from './voskConfig.js'

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) } }
const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
const NO_ENV = {}
const R2_ENV = { VITE_VOSK_MODEL_URL: ' https://models.example.com/vosk.tar.gz ' }

describe('voskConfig: адрес модели', () => {
  it('по умолчанию встроенный; VITE_VOSK_MODEL_URL (без пробелов по краям) его перекрывает; пустая строка не считается', () => {
    expect(defaultModelUrl(NO_ENV)).toBe(VOSK_MODEL_URL)
    expect(defaultModelUrl({ VITE_VOSK_MODEL_URL: '  ' })).toBe(VOSK_MODEL_URL)
    expect(defaultModelUrl(R2_ENV)).toBe('https://models.example.com/vosk.tar.gz')
  })
  it('обычный пользователь (в localStorage пусто) получает адрес из env, иначе встроенный', () => {
    expect(readModelUrl(mem(), NO_ENV)).toBe(VOSK_MODEL_URL)
    expect(readModelUrl(mem(), R2_ENV)).toBe('https://models.example.com/vosk.tar.gz')
  })
  it('у админа адрес из localStorage главнее env; при ошибке хранилища — адрес по умолчанию', () => {
    expect(VOSK_URL_KEY).toBe('pithy_admin_vosk_model_url_v1')
    const s = mem()
    writeModelUrl('https://example.com/m.tar.gz', s)
    expect(readModelUrl(s, R2_ENV)).toBe('https://example.com/m.tar.gz')
    expect(s.getItem(VOSK_URL_KEY)).toBe('https://example.com/m.tar.gz')
    expect(readModelUrl(broken, R2_ENV)).toBe('https://models.example.com/vosk.tar.gz')
    expect(() => writeModelUrl('x', broken)).not.toThrow()
  })
  it('прежний ключ адреса читается; «Вернуть по умолчанию» стирает оба и отдаёт адрес по умолчанию', () => {
    const s = mem({ pithy_admin_voice_vosk_url_v1: 'https://old.example/m.tar.gz' })
    expect(readModelUrl(s, NO_ENV)).toBe('https://old.example/m.tar.gz')
    writeModelUrl('https://new.example/m.tar.gz', s)
    expect(readModelUrl(s, NO_ENV)).toBe('https://new.example/m.tar.gz')
    expect(resetModelUrl(s, R2_ENV)).toBe('https://models.example.com/vosk.tar.gz')
    expect(readModelUrl(s, NO_ENV)).toBe(VOSK_MODEL_URL)
    expect(() => resetModelUrl(broken, NO_ENV)).not.toThrow()
  })
})
