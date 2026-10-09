import { describe, it, expect } from 'vitest'
import { boot, evOf as of } from './startLogHarness.js'

// Семплер кадров inline-скрипта журнала старта: поля, длительность, растворение сплэша, safe-area/--sab, рамки панели и ленты, слои, видео
describe('start-log: семплер кадров', () => {
  it('семплер: полная строка один раз, потом только изменения; без изменений — tick раз в ~100 мс', () => {
    const env = boot()
    env.advance(300)
    const samples = of(env, 'sample')
    expect(samples).toHaveLength(1)
    expect(samples[0][2].startsWith('bg=rgb(0,0,0) bb=rgb(0,0,0) so=1 sd=block fd=1 lg=163,376,92x92 rt=0 ng=0 fn=loaded')).toBe(true)
    // новые поля: safe-area, размеры окна, слои под точками экрана (сплэш исключён), видео, прямоугольники
    expect(samples[0][2]).toContain('sa=59px/0px/34px/0px iw=402x814 ch=814 fh=814 vv=402x814@0 sy=0/0/0 nv=- fe=- fw=- r0=- ep=splash eu=div#root/rgb(0,0,0) eo=div#root/rgb(0,0,0)')
    expect(samples[0][2]).toContain('k1=div#root/rgb(0,0,0)')
    expect(samples[0][2]).toContain('vs=- vo=- vr=- vp=- ps=0')
    expect(of(env, 'tick').length).toBeGreaterThanOrEqual(2)
    env.fade.st.opacity = '0.456'; env.advance(32)
    expect(of(env, 'sample')[1][2]).toBe('fd=0.46') // только изменившееся поле
    env.logo.rect = { x: 163, y: 346, width: 92, height: 92 }; env.root.childElementCount = 1; env.advance(32)
    expect(of(env, 'sample').slice(2).map(e => e[2]).join('|')).toContain('lg=163,346,92x92')
  })

  it('длительность: без ухода сплэша — до 12 с; сплэш ушёл — ещё 2 с после ухода; зонд safe-area убирается; журнал закрывается', () => {
    const a = boot()
    a.advance(11900); expect(of(a, 'raf-stop')).toHaveLength(0)
    a.advance(300); expect(of(a, 'raf-stop')).toHaveLength(1)
    expect(a.log().ev.find(e => e[1] === 'raf-stop')[0]).toBeGreaterThanOrEqual(12000)
    expect(a.html.probes).toBe(0)
    expect(a.log().end).toBe('end')
    const n = a.log().ev.length
    a.advance(500)
    expect(a.log().ev.length).toBe(n) // журнал закрыт

    const b = boot()
    b.advance(3600); b.win.fire('pithy:splash-gone')
    b.advance(1900); expect(of(b, 'raf-stop')).toHaveLength(0)
    b.advance(200); expect(of(b, 'raf-stop')).toHaveLength(1)
    expect(b.log().ev.find(e => e[1] === 'raf-stop')[0]).toBeGreaterThanOrEqual(5600)
    expect(b.saved()[0].end).toBe('end')
    expect(b.html.probes).toBe(0)
  })

  it('поздний уход сплэша (после 12 с) семплер не запускает', () => {
    const env = boot()
    env.advance(12300); env.win.fire('pithy:splash-gone'); env.advance(500)
    expect(of(env, 'raf-stop')).toHaveLength(1)
  })

  it('растворение сплэша (so<1): каждый кадр пишется so и dt, даже если значение не менялось; после ухода — только изменения', () => {
    const env = boot()
    env.advance(500)
    env.win.fire('pithy:splash-gone')
    env.splash.st.opacity = '0.97'; env.advance(16)
    env.advance(16); env.advance(16) // opacity застряла на 0.97 — кадры всё равно видны
    env.splash.st.opacity = '0.5'; env.advance(16)
    const s = of(env, 'sample').map(e => e[2])
    const dis = s.filter(x => /(^| )so=/.test(x) && /dt=/.test(x))
    expect(dis.length).toBeGreaterThanOrEqual(4)
    expect(dis.filter(x => x.includes('so=0.97')).length).toBeGreaterThanOrEqual(3)
    expect(dis[dis.length - 1]).toContain('so=0.5')
    env.elements.splash = null; env.advance(48)
    const after = of(env, 'sample').map(e => e[2]).slice(-3).join('|')
    expect(after).toContain('so=-')
  })

  it('safe-area: момент перехода 0px -> 34px пишется в sample с t; --sab фиксируется после 300 мс стабильности; поворот снимает', () => {
    const env = boot()
    env.pad.b = '0px'; env.pad.t = '0px'
    env.advance(500)
    expect(of(env, 'sample')[0][2]).toContain('sa=0px/0px/0px/0px')
    expect(env.html.style['--sab']).toBeUndefined() // 0 не фиксируем
    expect(env.win.__safeStable()).toBe(true)
    env.pad.b = '34px'; env.advance(16)
    const ch = of(env, 'sample').find(e => e[2].includes('sa=0px/0px/34px/0px'))
    expect(ch).toBeTruthy()
    expect(ch[0]).toBeGreaterThanOrEqual(500)
    expect(env.win.__safeStable()).toBe(false) // только что менялось — сплэш подождёт
    env.advance(200); expect(env.win.__safeStable()).toBe(false); expect(env.html.style['--sab']).toBeUndefined()
    env.advance(150)
    expect(env.win.__safeStable()).toBe(true)
    expect(env.html.style['--sab']).toBe('34px')
    expect(of(env, 'sab-freeze')[0][2]).toBe('34px')
    // iOS потом отдаёт другое — раскладка зафиксирована, а в журнале дрейф
    env.pad.b = '21px'; env.advance(32)
    expect(of(env, 'sab-drift')[0][2]).toBe('env=21px frozen=34px')
    expect(env.html.style['--sab']).toBe('34px')
    env.win.fire('orientationchange')
    expect(env.html.style['--sab']).toBeUndefined()
    expect(of(env, 'sab-unfreeze')).toHaveLength(1)
  })

  it('safe-area держит сплэш не дольше 2,5 с от старта (__safeStable)', () => {
    const env = boot()
    env.advance(300)
    env.pad.b = '0px'; env.advance(16); env.pad.b = '34px'; env.advance(16)
    expect(env.win.__safeStable()).toBe(false)
    env.advance(2500)
    expect(env.win.__safeStable()).toBe(true)
  })

  it('скачок прямоугольника нижней панели и ленты ловится семплером (с позицией и стилем)', () => {
    const env = boot()
    const nav = env.el('nav', { position: 'fixed' }); nav.className = 'shellV2Nav'; nav.nodeName = 'NAV'; nav.rect = { x: 0, y: 772, width: 402, height: 40 }
    const feed = env.el('feed'); feed.rect = { x: 0, y: 0, width: 402, height: 812 }
    env.q['nav.shellV2Nav'] = nav; env.q['.feedV2'] = feed
    env.advance(200)
    expect(of(env, 'sample').map(e => e[2]).join('|')).toContain('nv=0,772,402x40/fixed fe=0,0,402x812')
    nav.rect = { x: 0, y: 738, width: 402, height: 74 }; feed.rect = { x: 0, y: 0, width: 402, height: 778 }
    env.advance(120)
    const last = of(env, 'sample').slice(-1)[0]
    expect(last[2]).toContain('nv=0,738,402x74/fixed')
    expect(last[2]).toContain('fe=0,0,402x778')
  })

  it('слои под точками экрана без сплэша и видео ленты: смена элемента, цвета, readyState; события video — по одному разу', () => {
    const env = boot()
    const vid = env.el('v', { opacity: '0' }, [], 'VIDEO'); vid.className = 'feedMedia'; vid.rect = { x: 0, y: 0, width: 402, height: 700 }; vid.readyState = 0; vid.currentTime = 0; vid.paused = true; vid.poster = ''
    env.advance(200)
    env.stack = [env.splash, vid, env.root]
    env.advance(120)
    expect(of(env, 'sample').slice(-1)[0][2]).toMatch(/eu=video#v\.feedMedia\/rgb\(0,0,0\).*vs=rs0,ct0,pa1 vo=0 vr=0,0,402x700/)
    vid.readyState = 4; vid.currentTime = 0.4; vid.paused = false; vid.st.opacity = '1'; env.root.st.backgroundColor = 'rgb(11, 13, 16)'
    env.advance(120)
    const x = of(env, 'sample').slice(-1)[0][2]
    expect(x).toContain('vs=rs4,ct1,pa0'); expect(x).toContain('vo=1')
    env.doc.fire('loadeddata', { target: vid }); env.doc.fire('loadeddata', { target: vid }); env.doc.fire('playing', { target: vid }); env.doc.fire('playing', { target: { nodeName: 'DIV' } })
    expect(of(env, 'video').map(e => e[2].split(' ')[0])).toEqual(['loadeddata', 'playing'])
    expect(of(env, 'video')[0][2]).toBe('loadeddata video#v.feedMedia rs=4 ct=0.4 paused=0')
  })
})
