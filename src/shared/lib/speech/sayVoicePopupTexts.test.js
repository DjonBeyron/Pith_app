import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  EXPLAIN_LINES, EXPLAIN_SHORT_LINES, INTRO_LINES, PRIVACY_LINE, PRIVACY_VOICE_LINE, pickPopupLines,
} from './sayTexts.js'

// Строка приватности попапа перед записью: обычный режим — «Запись не сохраняется.», «Голосовое с текстом» — «остаётся только на вашем телефоне до конца урока».
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const KINDS = ['full', 'short', 'intro']

describe('pickPopupLines — тексты попапа в режимах «текст» и «голосовое»', () => {
  it('voice выключен/не задан — тексты как раньше, во всех видах', () => {
    for (const v of [false, undefined, null, 'true', 1]) {
      expect(pickPopupLines('full', v)).toBe(EXPLAIN_LINES)
      expect(pickPopupLines('short', v)).toBe(EXPLAIN_SHORT_LINES)
      expect(pickPopupLines('intro', v)).toBe(INTRO_LINES)
    }
    expect(pickPopupLines('full', false).join(' ')).toContain(PRIVACY_LINE)
  })

  it('voice === true — вместо «Запись не сохраняется.» строка про телефон, во всех видах: full/intro — «до конца урока», short — укороченная', () => {
    for (const k of KINDS) {
      const t = pickPopupLines(k, true).join(' ')
      expect(t, k).toContain('Запись остаётся ')
      expect(t, k).toContain('на вашем телефоне')
      expect(t, k).not.toContain('не сохраняется')
    }
    expect(PRIVACY_VOICE_LINE).toBe('Запись остаётся только на вашем телефоне до конца урока.')
    expect(pickPopupLines('full', true)).toEqual([PRIVACY_VOICE_LINE])
    expect(pickPopupLines('intro', true)).toEqual([PRIVACY_VOICE_LINE])
    expect(pickPopupLines('short', true)).toEqual(['Нажмите «Разрешить». Запись остаётся на вашем телефоне.'])
  })

  it('вводный вид по-прежнему не обещает системный запрос; мусорный вид = full', () => {
    expect(pickPopupLines('intro', true).join(' ')).not.toMatch(/разреш|спросит|доступ/i)
    expect(pickPopupLines('nope', true)).toEqual(pickPopupLines('full', true))
    expect(pickPopupLines(undefined, false)).toBe(EXPLAIN_LINES)
  })

  it('тексты голосового режима короткие и без техники', () => {
    for (const k of KINDS) {
      const t = pickPopupLines(k, true).join(' ')
      expect(t.length, k).toBeLessThanOrEqual(64) // две строки на 320px: уже при 3 строках карточка не помещается над модулем
      expect(t, k).not.toMatch(/API|getUserMedia|Vosk|движок|сервер|память|IndexedDB/i)
    }
  })

  it('SayMicPopup принимает проп voice и берёт строки через pickPopupLines', () => {
    const src = read('../../../features/player/panels/say-phrase/SayMicPopup.jsx')
    expect(src).toMatch(/SayMicPopup\(\{ kind = 'full', voice = false,/)
    expect(src).toContain('pickPopupLines(k, voice)')
  })
})
