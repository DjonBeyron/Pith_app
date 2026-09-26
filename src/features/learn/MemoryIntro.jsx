import { useState } from 'react'

// Первый вход во вкладку «Память» — один раз на устройстве (утверждённый
// макет, экран «Первый вход»): что здесь живёт, что мы напоминаем вовремя и
// как слово растёт — новенькие → мои → родные → постоянная память.
// open — вкладка на экране (в скрытой вкладке окно не всплывает)
const FLAG = 'pithy_memory_intro_v1'
const seen = () => { try { return !!localStorage.getItem(FLAG) } catch { return true } }

export default function MemoryIntro({ open }) {
  const [show, setShow] = useState(() => !seen())
  if (!open || !show) return null

  function close() {
    try { localStorage.setItem(FLAG, '1') } catch { /* приватный режим — покажем ещё раз */ }
    setShow(false)
  }

  return (
    <div className="lrSheetBack" onClick={close}>
      <div className="lrSheet memIntro" role="dialog" aria-label="Это твоя память" onClick={e => e.stopPropagation()}>
        <p className="lrSheetWord">Это твоя память</p>
        <p className="memIntroText">Сюда попадают слова из твоих уроков. Со временем любое слово забывается — это нормально.</p>
        <p className="memIntroText memIntroStrong">Мы сами напомним повторить слово — как раз тогда, когда оно начнёт забываться.</p>
        <p className="memIntroText">
          Сначала слова живут во временной памяти и с каждым повтором становятся роднее:{' '}
          <b className="memIntroLv1">новенькие</b> → <b className="memIntroLv2">мои</b> → <b className="memIntroLv3">родные</b>.
          Потом уходят в <b className="memIntroPerm">постоянную память</b> — и остаются с тобой навсегда.
        </p>
        <button className="lrCta memIntroCta" onClick={close}>Посмотреть мою память</button>
      </div>
    </div>
  )
}
