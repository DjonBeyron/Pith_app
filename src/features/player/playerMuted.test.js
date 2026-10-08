import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlayerMutedContext, usePlayerMuted } from './playerMuted.js'

const Probe = () => createElement('i', null, String(usePlayerMuted()))
const read = f => readFileSync(new URL(f, import.meta.url), 'utf8')

// «Не могу слушать» (повторение): голосовые играют без звука — флаг идёт контекстом от LessonPlayer до <audio>
describe('беззвучный плеер', () => {
  it('по умолчанию звук есть; провайдер включает беззвучие', () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<i>false</i>')
    expect(renderToStaticMarkup(createElement(PlayerMutedContext.Provider, { value: true }, createElement(Probe)))).toBe('<i>true</i>')
  })

  it('LessonPlayer раздаёт флаг, голосовое ставит его на свой <audio> (и помечает себя речью для useSoloMedia)', () => {
    expect(read('./LessonPlayer.jsx')).toMatch(/PlayerMutedContext\.Provider value=\{muted\}/)
    expect(read('./modules/audio/AudioModule.jsx')).toMatch(/<audio key=\{elKey\} ref=\{audioRef\} src=\{src\} preload="auto" muted=\{muted\} data-voice="" \/>/)
  })

  it('«Не могу слушать» глушит озвучку слов (не играет) и звуки интерфейса; кнопка «без звука» урока — только звуки интерфейса здесь (слова глушит сам wordAudioPlayer, muted)', () => {
    const src = read('./word-audio/useLessonWordAudio.js')
    expect(src).toMatch(/setWordAudioMuted\(muted\)/)
    expect(src).toMatch(/setSoundsMuted\(muted \|\| lessonMuted\)/)
    expect(src).toMatch(/return \(\) => setSoundsMuted\(false\)/) // выход из урока снимает беззвучие
  })

  it('usePlayerMuted = контекст повторения || «без звука» из шапки урока (lessonVolume.js)', () => {
    const src = read('./playerMuted.js')
    expect(src).toMatch(/useLessonMuted\(\)/)
    expect(src).toMatch(/return review \|\| lesson/)
  })

  it('диктант таблицы, видео, кружок, стикер и тренажёр уважают «без звука»', () => {
    // audioSrc в deps: <audio> монтируется позже первого рендера — иначе автозапуск через 800 мс шёл бы со звуком
    expect(read('./panels/table-dictator/TableDictatorPanel.jsx')).toMatch(/useDictatorVolume\(audioRef, muted, playing, audioSrc\)/)
    expect(read('./modules/video/VideoModule.jsx')).toMatch(/v\.muted = getLessonMuted\(\)/)
    expect(read('./modules/video/useVideoFullscreen.jsx')).toMatch(/fs\.muted = getLessonMuted\(\)/)
    expect(read('./modules/circle/CircleModule.jsx')).toMatch(/v\.muted = getLessonMuted\(\)/)
    expect(read('./modules/circle/useCircleExpand.js')).toMatch(/v2\.muted = getLessonMuted\(\)/)
    expect(read('./modules/sticker/StickerModule.jsx')).toMatch(/v\.muted = !turnOn \|\| getLessonMuted\(\)/)
    expect(read('./modules/rotate-phone/SpeechLaneOverlay.jsx')).toMatch(/<audio ref=\{audioRef\} src=\{src\} preload="auto" muted=\{muted\} \/>/)
  })
})
