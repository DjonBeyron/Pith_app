import { useRef, useState } from 'react'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Звук ленты: первый тап по чипу включает его для всех слайдов и
// запоминается между запусками. Если при холодном старте iOS заблокирует
// автозвук — слайд сообщит (onSoundBlocked), вернём чип
export function useFeedSound() {
  const [soundOn, setSoundOnState] = useState(() => localStorage.getItem('pithy_sound_v1') === '1')
  function setSoundOn(on) {
    setSoundOnState(on)
    if (on) localStorage.setItem('pithy_sound_v1', '1')
    else localStorage.removeItem('pithy_sound_v1')
  }
  // Пользователь тапнул чип хотя бы раз — дальше автоблок звука на
  // пересозданных <video> соседних слайдов (без прямого жеста) не должен
  // откатывать его выбор, иначе звук гаснет сам через пару видео
  // Ref — для мгновенной проверки в handleSoundBlocked (без ожидания ре-рендера);
  // state — чтобы жест форсил ре-рендер и пересчёт soundReady (нужно, когда
  // soundOn уже был true из localStorage: setSoundOn(true) тогда no-op)
  const soundGestureRef = useRef(false)
  const [soundGesture, setSoundGesture] = useState(false)
  function handleSoundOn() {
    fdbg('sound: user tapped chip')
    soundGestureRef.current = true
    setSoundGesture(true)
    setSoundOn(true)
  }
  function handleSoundBlocked() {
    if (soundGestureRef.current) {
      fdbg('sound: blocked ignored (gesture already given)')
      return
    }
    fdbg('sound: blocked → откат soundOn=false')
    setSoundOn(false)
  }
  // Реально играть со звуком можно только после жеста пользователя В ЭТОЙ сессии
  // — иначе браузер блокирует play() и первое видео виснет стоп-кадром. Поэтому
  // на холодном старте (жеста не было), даже если звук включён в настройках,
  // ленте передаём «беззвучно»: видео автоматически играет muted, а на слайде
  // виден чип «Включить звук». Первый тап по чипу/видео = жест → звук включается.
  // Сохранённый выбор soundOn при этом не теряется (без блока откат не сработает).
  const soundReady = soundOn && soundGesture

  return { soundOn, soundReady, soundGestureRef, handleSoundOn, handleSoundBlocked }
}
