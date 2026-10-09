// Образцы записей журнала старта для тестов (формат — как пишет inline-скрипт index.html)
export const CTX = { ver: '2.0.9', sa: true, dm: true, ua: '(iPhone; CPU iPhone OS 18_0)', scr: '402x874', dpr: 3, win: '402x814', or: 'portrait-primary', dark: true, rm: false, vis: 'visible', ref: '', url: '/', nav: 'navigate', rc: 0, size: 900, n: 1, cold: true, sw: 'activated', reloadHook: 'unforgeable', safe: '59px/0px/34px/0px' }

const FIRST = 'bg=rgb(0,0,0) bb=rgb(0,0,0) so=1 sd=block fd=0 lg=163,376,92x92 rt=0 ng=0 fn=loaded'

// Здоровый старт: лого плавно проявилось, сплэш растворился поверх готового #root, ничего не двигалось
export function goodRec(over = {}) {
  return {
    v: 1, id: '2026-10-09T10:00:00.000Z', ctx: { ...CTX }, drop: {}, cut: {}, end: 't6000', endT: 6001, gap: null,
    splash: ['[0.04] splash: первый кадр (HTML разобран, cssReady=false)', '[1.20] splash: улетает'],
    ev: [
      [3, 'start', 'rs=loading'], [40, 'raf-first', ''], [40, 'sample', FIRST],
      [56, 'sample', 'fd=0.3'], [72, 'sample', 'fd=0.7'], [88, 'sample', 'fd=1'],
      [100, 'tick', '='], [200, 'tick', '='], [300, 'tick', '='],
      [400, 'sample', 'rt=1'], [900, 'paint', 'first-contentful-paint'],
      [1200, 'splash-gone', ''], [1216, 'sample', 'so=0.5'], [1232, 'sample', 'so=0.1'], [1250, 'sample', 'so=-'],
    ],
    ...over,
  }
}

// Старт с «морганием»: смена цвета, скачок лого, сдвиг, resize после первого кадра, reload, подмена воркера
export function badRec() {
  const r = goodRec({ id: '2026-10-09T10:05:00.000Z', gap: 300000 })
  r.ctx = { ...CTX, nav: 'reload', cold: false, n: 2 }
  r.ev = [
    [3, 'start', 'rs=loading'], [40, 'raf-first', ''], [40, 'sample', 'bg=rgb(11,13,16) bb=rgb(0,0,0) so=1 sd=block fd=0 lg=163,376,92x92 rt=0 ng=0 fn=loading'],
    [56, 'sample', 'fd=1'], // 0 -> 1 за один кадр
    [90, 'sample', 'bg=rgb(0,0,0)'], // смена цвета
    [120, 'sample', 'lg=163,346,92x92'], // лого сдвинулось
    [150, 'resize', '402x874 vv=402x874@0'],
    [200, 'cls', 'v=0.0423 div.feedSkeleton@0,0,402x800>0,59,402x741'],
    [210, 'cls', 'v=0.5000 recentInput div#x@0,0,1x1>0,0,1x1'],
    [260, 'jank', '120ms'], [270, 'jank', '55ms'], [300, 'longtask', '210ms'],
    [500, 'pageshow', 'persisted=true'], [800, 'sw-ctrl', ''], [900, 'offline', ''], [1000, 'online', ''],
    [1100, 'vis', 'hidden'], [1500, 'sample', 'so=0.4 rt=0'], [2000, 'js-error', 'boom @a.js:1'], [2100, 'beforeunload', ''],
    [4000, 'sw-ctrl', ''],
  ]
  return r
}
