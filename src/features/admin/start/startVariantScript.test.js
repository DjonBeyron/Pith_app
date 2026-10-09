import { describe, it, expect } from 'vitest'
import { readIndex, headScripts, variantScript, boot, makeEnv } from './startLogHarness.js'
import { VARIANT_IDS, VARIANT_KEY, normalizeVariant } from './startVariant.js'
import { formatStartLog } from './formatStartLog.js'
import { formatStartShort } from './formatStartShort.js'
import { startSummary } from './formatStartLog.js'
import { goodRec } from './startLogFixtures.js'

const html = readIndex()
const V = variantScript()
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))

describe('вариант запуска: страж index.html', () => {
  it('это ПЕРВЫЙ <script> в <head>: inline, раньше журнала, net-guard.js и модульного скрипта', () => {
    expect(V).toBeTruthy()
    expect(headScripts(html)[0].index).toBe(V.index)
    expect(V.attrs.trim()).toBe('')
    expect(html.slice(0, V.index)).not.toMatch(/<script/)
    expect(V.index).toBeLessThan(html.indexOf("'pithy_start_logs_v1'"))
    expect(V.index).toBeLessThan(html.indexOf('<script src="/net-guard.js">'))
  })

  it('крошечный (≤25 строк), в try/catch, без сети и без записи в localStorage', () => {
    expect(V.body.trim().split('\n').length).toBeLessThanOrEqual(25)
    expect(V.body).toMatch(/try \{/)
    expect(V.body).toMatch(/catch \(e\)/)
    expect(V.body).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|new Image|\.src\s*=|setItem|document\.write/)
  })

  it('нет рассинхрона: тот же ключ и те же буквы, что в startVariant.js; журнал берёт вариант оттуда же', () => {
    expect(V.body).toContain(`'${VARIANT_KEY}'`)
    expect(V.body).toContain(`/^[${VARIANT_IDS[0]}-${VARIANT_IDS[VARIANT_IDS.length - 1]}]$/`)
    expect(V.body).toContain('window.__startVariant = v')
    expect(headScripts(html)[1].body).toContain('W.__startVariant')
  })

  it('порядок <head>: charset/viewport, потом <style> с чёрным фоном, и только ПОСЛЕ него meta color-scheme и theme-color, затем скрипт варианта', () => {
    const at = s => head.indexOf(s)
    const STYLE = '<style>html, body { margin: 0; background: #000; }</style>'
    expect(html.startsWith('<!doctype html>\n<html lang="ru" style="background:#000;background-color:#000">')).toBe(true)
    expect(at('<meta charset')).toBeLessThan(at(STYLE))
    expect(at('name="viewport"')).toBeLessThan(at(STYLE))
    expect(at(STYLE)).toBeGreaterThan(-1)
    expect(at(STYLE)).toBeLessThan(at('<title>HETA</title>'))
    expect(at(STYLE)).toBeLessThan(at('<meta name="color-scheme" content="dark" />'))
    expect(at(STYLE)).toBeLessThan(at('<meta name="theme-color" content="#000000" />'))
    expect(at('<meta name="color-scheme" content="dark" />')).toBeLessThan(V.index - html.indexOf('<head>')) // скрипт варианта снимает уже разобранные теги
    expect(at('<meta name="theme-color" content="#000000" />')).toBeLessThan(V.index - html.indexOf('<head>'))
    // у <html> и <body> фон атрибутом; в стилях head нет CSS color-scheme (он красил холст в серый до фона)
    expect(html).toMatch(/<body style="background:#000;background-color:#000">/)
    expect(STYLE).not.toMatch(/color-scheme/)
    expect(head.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '')).not.toMatch(/color-scheme\s*:/)
  })

  it('стили C/D лежат рядом со сплэшем и не трогают базовые правила', () => {
    expect(html).toMatch(/html\.startV-C #splash \.splash-logo \{ filter: none; \}/)
    expect(html).toMatch(/html\.startV-D #splash \.splash-fade \{ visibility: hidden; \}/)
    expect(html.indexOf('html.startV-C')).toBeGreaterThan(html.indexOf('#splash .splash-fade {'))
  })
})

// Мини-DOM для скрипта варианта: <meta> в <head> по name, classList и style на <html>
function run(variant) {
  const env = makeEnv()
  if (variant) env.store[VARIANT_KEY] = variant
  for (const n of ['color-scheme', 'theme-color']) {
    const key = `meta[name="${n}"]`
    env.q[key] = { parentNode: { removeChild: () => { delete env.q[key] } } }
  }
  env.run(V.body)
  const has = n => !!env.q[`meta[name="${n}"]`]
  return { env, cs: has('color-scheme'), tc: has('theme-color'), cls: env.html.classes, sch: env.html.style.colorScheme, v: env.win.__startVariant }
}

describe('вариант запуска: применение в песочнице', () => {
  it('A / нет значения / мусор — ничего не меняется', () => {
    for (const v of [undefined, 'A', 'zzz', 'a']) {
      const r = run(v)
      expect(r).toMatchObject({ cs: true, tc: true, cls: [], v: 'A' })
      expect(r.sch).toBeUndefined()
    }
  })
  it('B — оба meta удалены, color-scheme normal, класс startV-B', () => {
    expect(run('B')).toMatchObject({ cs: false, tc: false, cls: ['startV-B'], sch: 'normal', v: 'B' })
  })
  it('E — удалён только meta color-scheme, theme-color остался', () => {
    expect(run('E')).toMatchObject({ cs: false, tc: true, cls: ['startV-E'], sch: 'normal', v: 'E' })
  })
  it('C и D — meta на месте, только класс на <html>', () => {
    expect(run('C')).toMatchObject({ cs: true, tc: true, cls: ['startV-C'], v: 'C' })
    expect(run('D')).toMatchObject({ cs: true, tc: true, cls: ['startV-D'], v: 'D' })
  })
  it('localStorage бросает исключение — вариант A, скрипт не падает', () => {
    const env = makeEnv()
    env.win.localStorage = { getItem() { throw new Error('blocked') } }
    expect(() => env.run(V.body)).not.toThrow()
    expect(env.win.__startVariant).toBe('A')
  })
  it('каждая буква скрипта согласована с normalizeVariant', () => {
    for (const id of [...VARIANT_IDS, 'X', '']) expect(run(id).v).toBe(normalizeVariant(id))
  })
})

describe('журнал пишет вариант', () => {
  it('ctx.variant и ctx.vfx в записи; без варианта — A', () => {
    const a = boot(); a.advance(100)
    expect(a.log().ctx.variant).toBe('A')
    const b = boot({ variant: 'D' }); b.advance(100)
    expect(b.log().ctx.variant).toBe('D')
    expect(b.log().ctx.vfx).toMatch(/^cs[01] tc[01] sch=/)
  })

  it('формат: «ВАРИАНТ=B» в заголовке полного и короткого отчёта, метка в строке списка', () => {
    const rec = goodRec(); rec.ctx = { ...rec.ctx, variant: 'B', vfx: 'cs0 tc0 sch=normal' }
    expect(formatStartLog(rec)).toContain('ВАРИАНТ=B')
    expect(formatStartLog(rec)).toContain('cs0 tc0 sch=normal')
    expect(formatStartShort(rec).split('\n')[0]).toContain('ВАРИАНТ=B')
    expect(startSummary(rec).variant).toBe('B')
    const old = goodRec()
    expect(formatStartLog(old)).toContain('ВАРИАНТ=?')
    expect(startSummary(old).variant).toBeNull()
  })
})
