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

  it('LessonPlayer раздаёт флаг, голосовое ставит его на свой <audio>', () => {
    expect(read('./LessonPlayer.jsx')).toMatch(/PlayerMutedContext\.Provider value=\{muted\}/)
    expect(read('./modules/audio/AudioModule.jsx')).toMatch(/<audio ref=\{audioRef\} src=\{src\} preload="auto" muted=\{muted\} \/>/)
  })
})
