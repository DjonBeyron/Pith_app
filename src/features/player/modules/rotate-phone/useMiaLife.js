import { useEffect } from 'react'
import { createCatLook, NO_LOOK } from './wordLaneCatLook.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { MIA_FACES, nextFace } from '../../../pitrace/mia/miaCat.js'

// Мия «живая» в тишине (прототип, владелец 2026-11-14): взгляд изредка уходит в сторону (как у Пита, createCatLook), усы время от времени покачиваются (тот же привод усов, что у
// говорящего Пита), лицо плавно меняется (ухмылка → пафос → интерес, перекрёстное проявление ~160 мс). На слабом устройстве — одно лицо и без взгляда / усов (как у Пита, lite).
// Лежит рядом с котом Пита (rotate-phone): случайность здесь косметическая (в pitrace она запрещена, от семени плана). Хук работает только пока Мия на экране (enabled), все таймеры и привод снимает при уходе. root — контейнер спрайта Мии (.scn с <g class="scn-cat">).
export const FACE_EVERY_MS = [2600, 4200]   // лицо меняется раз в столько мс (случайно между)
export const WHISK_EVERY_MS = [2200, 4600]  // усы покачиваются раз в столько мс
export const WHISK_MS = 1000                // длительность покачивания
export const FADE_MS = 160

export function useMiaLife(root, enabled) {
  useEffect(() => {
    const el = root.current
    if (!enabled || !el) return undefined
    const gro = el.querySelector('.scn-cat'), heads = [...el.querySelectorAll('[data-part="head"]')]
    if (!gro) return undefined
    const lite = isWeakDevice()
    const look = lite ? NO_LOOK : createCatLook({ getRoot: () => gro, skin: 'mia2' })
    const byFace = Object.fromEntries(heads.map(h => [h.getAttribute('data-face'), h]))
    let cur = MIA_FACES.find(f => byFace[f]) ?? null
    heads.forEach(h => { h.style.display = h === byFace[cur] ? '' : 'none' })
    look.idle(true) // взгляд дрейфует
    const timers = new Set()
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn() }, ms); timers.add(t) }
    const between = ([a, b]) => a + Math.random() * (b - a)
    const swap = () => {
      const faces = MIA_FACES.filter(f => byFace[f])
      const to = faces.length > 1 ? nextFace(faces, cur, Math.random()) : cur
      if (to && to !== cur) {
        const prev = byFace[cur], next = byFace[to]
        next.style.display = ''; next.parentNode.appendChild(next) // новая голова — поверх прежней
        const a = !lite && typeof next.animate === 'function' ? next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-in-out' }) : null
        const done = () => { prev.style.display = 'none' }
        if (a) a.onfinish = done; else done()
        cur = to
      }
      later(swap, between(FACE_EVERY_MS))
    }
    const whisk = () => { look.talking(true); later(() => look.talking(false), WHISK_MS); later(whisk, between(WHISK_EVERY_MS)) }
    if (faceCount(byFace) > 1) later(swap, between(FACE_EVERY_MS))
    later(whisk, 900)
    return () => { timers.forEach(clearTimeout); timers.clear(); look.stop() }
  }, [root, enabled])
}

const faceCount = byFace => MIA_FACES.filter(f => byFace[f]).length
