import { useEffect, useState } from 'react'
import { computeEnvelope } from '../../../../shared/lib/audioEnvelope.js'
import { buildStandScene } from './standScene.js'

// Реплика стенда сравнения: тайминги слов (json по адресу) и огибающая громкости файла (считается здесь же, в браузере — как «Посчитать огибающую»
// в админке) → сцена из одной реплики. Состояние: { phase: 'loading' | 'ready', scene, note, error? }. Ошибки не роняют стенд: нет таймингов —
// рот по синтетическим, нет огибающей — только по буквам (это тоже честная часть сравнения).

async function loadJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

export function useStandLine(params) {
  const { audio, text, words, env: wantEnv } = params
  const [state, setState] = useState({ phase: 'loading', scene: null, note: '' })

  useEffect(() => {
    let dead = false
    ;(async () => {
      const notes = []
      let meta = null
      let timings = null
      if (words) {
        try { meta = await loadJson(words); timings = Array.isArray(meta) ? meta : meta.words } catch (e) { notes.push(`тайминги слов не загрузились (${e.message}) — рот по синтетическим`) }
      }
      let env = null
      if (wantEnv) {
        try {
          const res = await fetch(audio)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          env = await computeEnvelope(await res.arrayBuffer())
        } catch (e) { notes.push(`огибающая не посчиталась (${e.message}) — рот новой версии только по буквам`) }
      }
      const lineText = text || meta?.text || 'Hello, I am Pit.'
      if (!dead) setState({ phase: 'ready', scene: buildStandScene({ text: lineText, audioUrl: audio, words: timings, env }), note: notes.join('; '), env: env?.data?.length ?? 0, hasWords: !!timings?.length })
    })()
    return () => { dead = true }
  }, [audio, text, words, wantEnv])

  return state
}
