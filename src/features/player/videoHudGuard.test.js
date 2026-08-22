import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { VIDEO_GUARD, applyVideoGuard } from '../../shared/lib/videoHudGuard.js'

const MODULES = fileURLToPath(new URL('./modules', import.meta.url))

// В пояснениях к коду тоже встречается «<video>» — комментарии выкидываем,
// иначе тест ловит текст, а не разметку
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')
}

function jsxFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return jsxFiles(full)
    return name.endsWith('.jsx') ? [full] : []
  })
}

describe('надстройки браузера над видео заглушены', () => {
  // Яндекс.Браузер и Chrome рисуют поверх <video> свою панель («перевести»,
  // «в отдельном окне», «скачать»). В уроке это чужой интерфейс поверх
  // сообщения — каждый <video> плеера обязан идти с набором атрибутов.
  it('каждое <video> в модулях плеера получает VIDEO_GUARD', () => {
    const missed = []
    for (const file of jsxFiles(MODULES)) {
      const src = stripComments(readFileSync(file, 'utf8'))
      let i = src.indexOf('<video')
      while (i !== -1) {
        const tag = src.slice(i, src.indexOf('/>', i) + 2)
        if (!tag.includes('{...VIDEO_GUARD}')) missed.push(file.split('modules')[1])
        i = src.indexOf('<video', i + 1)
      }
    }
    expect(missed).toEqual([])
  })

  it('набор атрибутов покрывает перевод, PiP и трансляцию', () => {
    expect(VIDEO_GUARD.controls).toBe(false)
    expect(VIDEO_GUARD.disablePictureInPicture).toBe(true)
    expect(VIDEO_GUARD.disableRemotePlayback).toBe(true)
    expect(VIDEO_GUARD.controlsList).toContain('nodownload')
    expect(VIDEO_GUARD.controlsList).toContain('noremoteplayback')
    expect(VIDEO_GUARD.controlsList).toContain('nofullscreen')
  })

  it('те же атрибуты ставятся вручную созданному <video> (пул ленты)', () => {
    const calls = { attrs: {} }
    const fake = {
      controls: true, disablePictureInPicture: false, disableRemotePlayback: false,
      setAttribute: (k, v) => { calls.attrs[k] = v },
    }
    applyVideoGuard(fake)
    expect(fake.controls).toBe(false)
    expect(fake.disablePictureInPicture).toBe(true)
    expect(fake.disableRemotePlayback).toBe(true)
    expect(calls.attrs.controlslist).toBe(VIDEO_GUARD.controlsList)
    expect(calls.attrs['x-webkit-airplay']).toBe('deny')
  })

  it('пустой элемент не роняет хелпер', () => {
    expect(applyVideoGuard(null)).toBe(null)
  })
})

// Атрибутов Яндекс.Браузеру мало: его панель — интерфейс самого браузера.
// Поэтому на широких экранах <video> прячется, а кадры показывает canvas.
describe('canvas-зеркало видео на десктопе', () => {
  const MIRROR = readFileSync(fileURLToPath(new URL('./videoMirror.js', import.meta.url)), 'utf8')
  const CSS = readFileSync(fileURLToPath(new URL('../../styles/base.css', import.meta.url)), 'utf8')

  it('включается только на широких экранах', () => {
    expect(MIRROR).toContain("const WIDE_QUERY = '(min-width: 900px)'")
    expect(MIRROR).toContain('matchMedia')
  })

  it('кадры берутся по событию видео, с запасным rAF', () => {
    expect(MIRROR).toContain('v.requestVideoFrameCallback(draw)')
    expect(MIRROR).toContain('requestAnimationFrame(draw)')
    expect(MIRROR).toContain('ctx.drawImage(v, 0, 0, w, h)')
  })

  it('до первого кадра рисуется постер, чтобы не мелькала пустота', () => {
    expect(MIRROR).toContain('if (stopped || painted) return')
    expect(MIRROR).toContain('img.src = posterUrl')
  })

  it('источник кадров остаётся в потоке — из display:none кадров не будет', () => {
    const block = CSS.slice(CSS.indexOf('.videoMirrorSource'))
    expect(block).toContain('width: 2px !important')
    expect(block).toContain('opacity: 0.01 !important')
    expect(block).not.toContain('display: none')
  })

  it('все три модуля с видео зеркалят кадры', () => {
    for (const f of ['circle/CircleModule.jsx', 'video/VideoModule.jsx', 'sticker/StickerModule.jsx']) {
      const src = readFileSync(join(MODULES, f), 'utf8')
      expect(src).toContain('useVideoMirror(')
      expect(src).toContain('videoMirrorSource')
      expect(src).toContain('<canvas')
    }
  })
})
