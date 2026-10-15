import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SoundCheck from './SoundCheck.jsx'
import LineVoiceControls from './LineVoiceControls.jsx'
import PhonePreview from '../PhonePreview.jsx'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'
import { normalizeSceneV2 } from '../../../scene/v2/sceneSchemaV2.js'

// Разметка «Проверить звук» (без DOM): кнопка у файла озвучки реплики, ничего без ссылки;
// предпросмотр в покое строку «звук: …» не показывает (она появляется с первой репликой)
describe('SoundCheck', () => {
  it('кнопка с подписью, без url — пусто', () => {
    const html = renderToStaticMarkup(<SoundCheck url="https://pub-1.r2.dev/chat/a.mp3" />)
    expect(html).toContain('Проверить звук')
    expect(html).toContain('Что это? Проверить звук') // пояснялка sound_check
    expect(renderToStaticMarkup(<SoundCheck url={null} />)).toBe('')
  })
  it('есть у озвученной реплики в LineVoiceControls, нет у реплики без файла', () => {
    const voice = { lines: {}, busy: false, playing: null }
    const cat = { gender: 'male', name: 'Кот', voice: {} }
    const withFile = renderToStaticMarkup(<LineVoiceControls index={0} line={{ who: 'a', text: 'Привет.', audioUrl: 'https://pub-1.r2.dev/chat/a.mp3' }} character={cat} voice={voice} idPrefix="f-timeline-0" />)
    expect(withFile).toContain('Проверить звук')
    const noFile = renderToStaticMarkup(<LineVoiceControls index={0} line={{ who: 'a', text: 'Привет.' }} character={cat} voice={voice} idPrefix="f-timeline-0" />)
    expect(noFile).not.toContain('Проверить звук')
  })
  it('PhonePreview в покое без строки статуса звука', () => {
    const scene = normalizeSceneV2(demoOfficeScene)
    const html = renderToStaticMarkup(<PhonePreview scene={scene} lint={[]} budget={{ total: 1, limit: 100, items: [] }} onHighlight={() => {}} />)
    expect(html).not.toContain('scbSoundStatus')
  })
})

describe('индикатор «звук выключен» в PhonePreview', () => {
  it('при включённом звуке (по умолчанию) индикатора нет; текст статуса — sceneAudioFail.test.js, вид со снятой галкой — снимок Playwright', () => {
    // PhonePreview держит sound в useState(true) — на статичном рендере индикатора нет
    const scene = normalizeSceneV2(demoOfficeScene)
    const html = renderToStaticMarkup(<PhonePreview scene={scene} lint={[]} budget={{ total: 1, limit: 100, items: [] }} onHighlight={() => {}} />)
    expect(html).not.toContain('звук выключен')
  })
})
