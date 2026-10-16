import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Статус озвучки запасного слова в библиотеке word_audio (блок «Слова пользователя»)
let cache = null
vi.mock('../../../shared/lib/wordAudio/wordAudioApi.js', () => ({
  listWordAudio: () => Promise.resolve(cache), cachedWordAudio: () => cache, subscribeWordAudio: () => () => {},
}))
vi.mock('../../../shared/lib/wordAudio/wordAudioGenerate.js', () => ({ generateWordAudio: vi.fn() }))
const { default: VarWordAudio } = await import('./VarWordAudio.jsx')

describe('VarWordAudio', () => {
  it('слово есть в библиотеке — «озвучено», кнопки нет', () => {
    cache = new Map([['cheese', { key: 'cheese' }]])
    const html = renderToStaticMarkup(<VarWordAudio text="Cheese" />)
    expect(html).toContain('озвучено в библиотеке')
    expect(html).toContain('data-state="ok"')
    expect(html).not.toContain('Озвучить слово')
  })
  it('слова нет — предупреждение «вся реплика синтезом» и кнопка «Озвучить слово»; список не загружен — кнопка неактивна', () => {
    cache = new Map()
    const html = renderToStaticMarkup(<VarWordAudio text="a sandwich" />)
    expect(html).toContain('не озвучено в библиотеке')
    expect(html).toContain('синтезом устройства')
    expect(html).toMatch(/<button[^>]*title="Озвучить слово через ElevenLabs[^>]*>/)
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*Озвучить слово/)
    cache = null
    expect(renderToStaticMarkup(<VarWordAudio text="a sandwich" />)).toMatch(/<button[^>]*disabled=""[^>]*title="Озвучить слово/)
  })
  it('кириллица и пустое слово: в библиотеку не попадает / ничего не показываем', () => {
    cache = new Map()
    expect(renderToStaticMarkup(<VarWordAudio text="сыр" />)).toContain('не для библиотеки озвучки')
    expect(renderToStaticMarkup(<VarWordAudio text="  " />)).toBe('')
  })
})
