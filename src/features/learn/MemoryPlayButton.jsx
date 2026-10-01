import { useState, useRef, useEffect } from 'react'
import { Volume2 } from 'lucide-react'

// Кнопка ▶ озвучки слова в списке «Все слова». Звук, которого ещё нет в
// прогретых, играет с сервера — тап может ждать. Если звук не пошёл дольше
// короткого порога (WAIT_MS в wordAudioPlayer.js), на кнопке крутится кружок
// загрузки до начала звука; быстрые тапы без кружка — мигать нечем. Значок
// появляется плавно (библиотека озвучки подгружается чуть позже списка)
export default function MemoryPlayButton({ word, onPlay }) {
  const [wait, setWait] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const play = () => onPlay(word, {
    onWait: () => { if (alive.current) setWait(true) },
    onDone: () => { if (alive.current) setWait(false) },
  })
  return (
    <button className={wait ? 'memPlay memPlay--wait' : 'memPlay'} onClick={play} aria-busy={wait}
      aria-label={`Воспроизвести «${word}»`} title="Послушать">
      {wait ? <span className="memPlaySpin" aria-hidden="true" /> : <Volume2 />}
    </button>
  )
}
