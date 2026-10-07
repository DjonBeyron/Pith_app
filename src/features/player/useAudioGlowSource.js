import { useEffect } from 'react'
import { publishLevel, unpublishLevel, levelFromWave } from './audioLevel.js'

// <audio> в ленте (голосовое, таблица-показ) отдаёт свой уровень свечению-
// эквалайзеру (audioLevel.js): слушаем события САМОГО элемента, а не свои
// кнопки — остановка снаружи (useSoloMedia, дебаг-тулбар, конец записи)
// тогда гасит свечение сама. Ключ источника — сам элемент. waveData — RMS по
// кадрам WAVEFORM_FPS (нет — синтезированная огибающая). Остальные аргументы
// — ключи пересоздания элемента (смена src, elKey): подписку переставляем
export function useAudioGlowSource(audioRef, waveData, src = null, elKey = 0) {
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const on  = () => publishLevel(audio, { playing: true, getLevel: () => levelFromWave(waveData, audio.currentTime) })
    const off = () => unpublishLevel(audio)
    audio.addEventListener('play', on)
    audio.addEventListener('pause', off)
    audio.addEventListener('ended', off)
    if (!audio.paused) on()
    return () => {
      off()
      audio.removeEventListener('play', on)
      audio.removeEventListener('pause', off)
      audio.removeEventListener('ended', off)
    }
  }, [audioRef, waveData, src, elKey])
}
