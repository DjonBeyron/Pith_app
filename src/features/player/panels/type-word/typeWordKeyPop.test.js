import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('клавиатура «Напечатай»: всплывающая буква над нажатой клавишей (как на iPhone)', () => {
  it('у буквенных клавиш есть data-ch, у пробела нет; CSS показывает ::after с attr(data-ch) по :active и не у тусклых', () => {
    const jsx = read('./TypeWordKeyboard.jsx')
    expect(jsx).toMatch(/data-ch=\{k\.ch === ' ' \? undefined : k\.ch\}/)
    const css = read('../../../../styles/player/panels/type-word.css')
    expect(css).toContain('.twKey[data-ch]:not(.twKeyDim)::after')
    expect(css).toContain('content: attr(data-ch)')
    expect(css).toContain('.twKey[data-ch]:not(.twKeyDim):active::after { opacity: 1')
  })
})
