import { useEffect, useState } from 'react'

// Виджет капчи Turnstile + подсказки вокруг него. На экране появляется только
// после того, как форма попросила токен (captcha.active) — то есть после
// нажатия «Войти»/«Зарегистрироваться». Пока капча выключена ключом или не
// запрошена, компонент не рисует ничего.
//
// Turnstile рисует блок жёстких 300×65 и по центру он выбивался из ряда полей
// ввода. Ужимаем его до 0.9 и прижимаем к левому краю — отступ от края окна
// совпадает с инпутами. На узких телефонах, где 270px уже не влезает, масштаб
// считается по реальной ширине контейнера, чтобы виджет не обрезало.
const NATURAL_W = 300
const NATURAL_H = 65
const MAX_SCALE = 0.9

export default function CaptchaBox({ captcha }) {
  const { enabled, active, boxRef, token, failed, retrying, asking, retry } = captcha
  const [wrap,  setWrap]  = useState(null)
  const [scale, setScale] = useState(MAX_SCALE)

  useEffect(() => {
    if (!wrap) return
    const fit = () => {
      const w = wrap.clientWidth
      if (w) setScale(Math.min(MAX_SCALE, w / NATURAL_W))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [wrap])

  if (!enabled || !active) return null

  return (
    <div className="captchaBox">
      <div
        ref={setWrap}
        className="captchaWidget"
        style={{ height: NATURAL_H * scale, '--captcha-scale': scale }}
      >
        <div ref={boxRef} />
      </div>
      {retrying && (
        <div className="captchaHint">Проверка не загрузилась — пробуем ещё раз...</div>
      )}
      {!token && !retrying && asking && (
        <div className="captchaHint">Поставь галочку — и вход продолжится сам</div>
      )}
      {!token && !retrying && !asking && !failed && (
        <div className="captchaHint">Проверяем, что ты не робот...</div>
      )}
      {!token && !asking && failed && (
        <div className="captchaHint">
          Проверка «я не робот» не отвечает — продолжаем без неё.
          <button type="button" className="captchaRetry" onClick={retry}>Повторить</button>
        </div>
      )}
    </div>
  )
}
