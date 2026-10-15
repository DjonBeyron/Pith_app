import { describe, it, expect } from 'vitest'
import { parseUndoKey, isNativeUndoField, undoKeyAction } from './undoKeys.js'

const ev = (over = {}) => ({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, code: '', key: '', defaultPrevented: false, target: null, ...over })
const field = (tag, own = false) => ({ tagName: tag, isContentEditable: false, closest: sel => (own && sel === '[data-native-undo]' ? {} : null) })

describe('горячие клавиши отмены', () => {
  it('Ctrl/Cmd+Z — отменить; с Shift — повторить; Ctrl+Y — повторить', () => {
    expect(parseUndoKey(ev({ ctrlKey: true, code: 'KeyZ', key: 'z' }))).toBe('undo')
    expect(parseUndoKey(ev({ metaKey: true, code: 'KeyZ', key: 'z' }))).toBe('undo')
    expect(parseUndoKey(ev({ ctrlKey: true, shiftKey: true, code: 'KeyZ', key: 'Z' }))).toBe('redo')
    expect(parseUndoKey(ev({ metaKey: true, shiftKey: true, code: 'KeyZ', key: 'Z' }))).toBe('redo')
    expect(parseUndoKey(ev({ ctrlKey: true, code: 'KeyY', key: 'y' }))).toBe('redo')
  })
  it('русская раскладка: key «я», но code KeyZ — работает', () => {
    expect(parseUndoKey(ev({ ctrlKey: true, code: 'KeyZ', key: 'я' }))).toBe('undo')
  })
  it('без Ctrl/Cmd, с Alt, чужие клавиши и Cmd+Y — ничего', () => {
    expect(parseUndoKey(ev({ code: 'KeyZ', key: 'z' }))).toBeNull()
    expect(parseUndoKey(ev({ ctrlKey: true, altKey: true, code: 'KeyZ', key: 'z' }))).toBeNull()
    expect(parseUndoKey(ev({ ctrlKey: true, code: 'KeyX', key: 'x' }))).toBeNull()
    expect(parseUndoKey(ev({ metaKey: true, code: 'KeyY', key: 'y' }))).toBeNull()
    expect(parseUndoKey(null)).toBeNull()
  })
  it('поля с data-native-undo (JSON, нейросеть, переименование) — родной откат браузера; остальные — наша история', () => {
    expect(isNativeUndoField(field('TEXTAREA', true))).toBe(true)
    expect(isNativeUndoField(field('TEXTAREA'))).toBe(false)
    expect(isNativeUndoField(field('BUTTON', true))).toBe(false)
    const z = { ctrlKey: true, code: 'KeyZ', key: 'z' }
    expect(undoKeyAction(ev({ ...z, target: field('TEXTAREA') }))).toBe('undo')
    expect(undoKeyAction(ev({ ...z, target: field('TEXTAREA', true) }))).toBeNull()
    expect(undoKeyAction(ev({ ...z, defaultPrevented: true }))).toBeNull()
  })
})
