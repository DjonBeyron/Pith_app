import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { voskFallbackPlugin, FALLBACK_NAME } from '../../../tools/viteVoskFallback.js'
import { collectPrecache } from '../../../tools/viteShellCache.js'

describe('vite-плагин /vosk-fallback.js', () => {
  it('closeBundle копирует UMD vosk-browser в dist/', () => {
    const root = mkdtempSync(join(tmpdir(), 'vf-'))
    mkdirSync(join(root, 'node_modules/vosk-browser/dist'), { recursive: true })
    mkdirSync(join(root, 'dist'))
    writeFileSync(join(root, 'node_modules/vosk-browser/dist/vosk.js'), '/*vosk*/')
    const p = voskFallbackPlugin()
    p.configResolved({ root, build: { outDir: 'dist' } })
    p.closeBundle()
    expect(readFileSync(join(root, 'dist', FALLBACK_NAME), 'utf8')).toBe('/*vosk*/')
  })
  it('нет пакета — молча ничего не делает', () => {
    const root = mkdtempSync(join(tmpdir(), 'vf-'))
    mkdirSync(join(root, 'dist'))
    const p = voskFallbackPlugin()
    p.configResolved({ root, build: { outDir: 'dist' } })
    expect(() => p.closeBundle()).not.toThrow()
    expect(existsSync(join(root, 'dist', FALLBACK_NAME))).toBe(false)
  })
  it('в предзагрузку кеша оболочки не входит', () => {
    const { urls } = collectPrecache([{ path: FALLBACK_NAME, size: 6e6 }, { path: 'assets/a.js', size: 10 }])
    expect(urls).not.toContain('/' + FALLBACK_NAME)
  })
})
