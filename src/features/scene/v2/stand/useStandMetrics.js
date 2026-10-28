import { useEffect, useRef, useState } from 'react'

// Замеры стенда сравнения (SceneCompareStand.jsx): всё читается прямо из DOM и браузера, поэтому годится и для Playwright
// (window.__cmp — последний снимок: page.evaluate(() => window.__cmp)).
//  · nodes — число элементов внутри <svg> сцены (фон + предметы + Пит), mascot — элементов внутри самого Пита (бюджет маскота ≤ 100);
//  · anims — бегущие и всего анимаций сцены (Element.getAnimations({ subtree: true }): CSS-анимации и переходы), silence — сколько их было
//    в тишине (до старта, status idle), speech — максимум за время речи (playing); pit* — то же, но только у самого Пита (его группа .scn-cat,
//    без фона, предметов и облачка); docAnims — document.getAnimations() целиком;
//  · frame — кадры rAF за последние 2 с: средний и максимальный интервал, fps. Кадры общие на всю страницу (две сцены в одном потоке).
// side: 'old' | 'neu'; roots — { old: ref, neu: ref } на корни .scn; status — { old, neu } (состояние режиссёра, ref).

const WINDOW_MS = 2000
const SAMPLE_MS = 400

function sideStats(root) {
  if (!root) return { nodes: 0, mascot: 0, anims: 0, running: 0, pit: 0 }
  const svg = root.querySelector('svg')
  const cat = root.querySelector('[data-part="cat"]')
  const pit = cat?.closest('.scn-cat')
  const all = root.getAnimations ? root.getAnimations({ subtree: true }) : []
  return {
    nodes: svg ? svg.querySelectorAll('*').length : 0,
    mascot: cat ? cat.querySelectorAll('*').length : 0,
    anims: all.length,
    running: all.filter(a => a.playState === 'running').length,
    pit: pit?.getAnimations ? pit.getAnimations({ subtree: true }).length : 0,
  }
}

export function useStandMetrics(roots, statusRef) {
  const [snap, setSnap] = useState(null)
  const frames = useRef([])
  const peaks = useRef({ old: { silence: 0, speech: 0, pitSilence: 0, pitSpeech: 0 }, neu: { silence: 0, speech: 0, pitSilence: 0, pitSpeech: 0 } })

  useEffect(() => {
    let raf = 0
    const loop = t => { frames.current.push(t); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)

    const sample = () => {
      const now = performance.now()
      const f = frames.current
      while (f.length && now - f[0] > WINDOW_MS) f.shift()
      let max = 0
      let sum = 0
      for (let i = 1; i < f.length; i++) { const d = f[i] - f[i - 1]; sum += d; if (d > max) max = d }
      const n = Math.max(0, f.length - 1)
      const sides = {}
      for (const side of ['old', 'neu']) {
        const s = sideStats(roots[side].current)
        const p = peaks.current[side]
        if (statusRef.current[side] === 'playing') { p.speech = Math.max(p.speech, s.anims); p.pitSpeech = Math.max(p.pitSpeech, s.pit) }
        else if (statusRef.current[side] === 'idle') { p.silence = s.anims; p.pitSilence = s.pit }
        sides[side] = { ...s, ...p, status: statusRef.current[side] }
      }
      const out = {
        frame: { avg: n ? +(sum / n).toFixed(1) : 0, max: +max.toFixed(1), fps: n ? Math.round(1000 / (sum / n)) : 0, n },
        docAnims: document.getAnimations ? document.getAnimations().length : 0,
        sides,
      }
      window.__cmp = out
      setSnap(out)
    }
    const timer = setInterval(sample, SAMPLE_MS)
    return () => { cancelAnimationFrame(raf); clearInterval(timer) }
  }, [roots, statusRef])

  return {
    snap,
    resetPeaks: () => { for (const p of Object.values(peaks.current)) { p.speech = 0; p.pitSpeech = 0 } },
  }
}
