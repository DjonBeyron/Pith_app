import { useEffect } from 'react'
import { publishLevel, unpublishLevel, levelFromWave } from './audioLevel.js'
import { requestSpectrum, peekSpectrum, spectrumBandsAt } from '../../shared/lib/audioSpectrum.js'

// <audio> в ленте (голосовое, таблица-показ) отдаёт свой уровень и спектр
// свечению снизу чата (audioLevel.js): слушаем события САМОГО элемента, а не
// свои кнопки — остановка снаружи (useSoloMedia, дебаг-тулбар, конец записи)
// тогда гасит свечение сама. Ключ источника — сам элемент. waveData — RMS по
// кадрам WAVEFORM_FPS (нет — синтезированная огибающая). Спектр по полосам
// (audioSpectrum.js) запрашивается ЛЕНИВО при старте игры по адресу файла
// (blob/URL — он у элемента уже есть) и считается в простое; пока не готов —
// цикл синтезирует полосы «речи». Остальные аргументы — ключи пересоздания
// элемента (смена src, elKey): подписку переставляем
export function useAudioGlowSource(audioRef, waveData, src = null, elKey = 0) {
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const key = () => src ?? audio.currentSrc ?? null
    const on = () => {
      const k = key()
      if (k) requestSpectrum(k)
      publishLevel(audio, {
        playing: true,
        getLevel: () => levelFromWave(waveData, audio.currentTime),
        getBands: (now, out) => spectrumBandsAt(peekSpectrum(k), audio.currentTime, out),
      })
    }
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
