// Дебаг заливки круга 2 «Скажи» для сцены (racePhraseScene.js) в одном месте: журнал «[fill]» (racePhraseFillLog.js) и отладочная полоска под пилюлей (racePhraseDebugBar.js, только в режиме отладки).
// Сцена зовёт: spawn — пилюля «Скажи» выехала; word / phrase — слово цели / итог фразы (onWord / onPhrase); wrong — неверное слово (рывок кромки); ear — что слышит Vosk (onEar слушателя: черновик, итог, затвор тишины);
// frame — каждый кадр (цель и экран); full / rise — заливка дошла до 100 % / взлёт; end — сводка хода; drop — пилюля решена, ушла или сцена снята (полоска убирается).
import { createFillLog } from './racePhraseFillLog.js'
import { debugBarOn, mountDebugBar, barText } from './racePhraseDebugBar.js'

export function createSayTrace({ log = () => {}, bar = debugBarOn, mount = mountDebugBar } = {}) {
  const fill = createFillLog({ log })
  const on = (() => { try { return !!(typeof bar === 'function' ? bar() : bar) } catch { return false } })()
  let strip = null, born = 0, partial = '', gate = null
  const drop = () => { strip?.remove(); strip = null }
  return {
    /** Пилюля «Скажи» выехала: el — её узел (полоска едет внутри) */
    spawn(t, el) { born = t; partial = ''; fill.start(t); drop(); if (on) strip = mount(el) },
    word: (e, t) => fill.word(e, t),
    phrase: ratio => fill.phrase(ratio),
    /** Неверное слово (проход 1): строка «[fill] неверное слово «…», ждём «…»» */
    wrong: (word, expect) => fill.wrong(word, expect),
    /** Слух: { kind: 'partial' | 'final', text } или { kind: 'gate', open } */
    ear(e) { if (e?.kind === 'gate') gate = !!e.open; else if (e?.text != null) partial = e.text },
    frame(t, g, s) { fill.frame(t, g, s); strip?.set(barText({ partial, goal: g, shown: s, gate, ms: t - born })) },
    full: (t, last) => fill.full(t, last),
    rise: t => fill.rise(t),
    /** Ход решён (зачёт или «не успел»): сводная строка «[fill] итог хода: …» */
    end: () => fill.end(),
    drop,
    /** Есть ли полоска на экране (тесты, стенд) */
    shown: () => !!strip,
  }
}
