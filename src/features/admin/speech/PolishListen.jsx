import { useRef, useState } from 'react'

// Кнопка «Послушать» у озвученной реплики Пита («Шлифовка репетиции»): <audio> с url озвучки, воспроизведение в тапе (жест). Одновременно звучит одна реплика: новая останавливает прежнюю.
let current = null

export default function PolishListen({ url, testid }) {
  const ref = useRef(null)
  const [on, setOn] = useState(false)
  function toggle() {
    const a = ref.current
    if (!a) return
    if (on) { a.pause(); a.currentTime = 0; return }
    if (current && current !== a) current.pause()
    current = a
    setOn(true)
    a.play().catch(() => setOn(false)) // нет доступа к файлу / iOS отказал — кнопка возвращается в «Послушать»
  }
  return (
    <>
      <button type="button" className="aspChip" onClick={toggle} data-testid={testid}>{on ? 'Стоп' : 'Послушать'}</button>
      <audio ref={ref} src={url} preload="none" onEnded={() => setOn(false)} onPause={() => setOn(false)} data-testid={testid ? `${testid}-audio` : undefined} />
    </>
  )
}
