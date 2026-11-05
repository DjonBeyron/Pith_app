import { useState, useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { voskRuntime } from '../../shared/lib/vosk/voskRuntime.js'
import { voskRuntimeRu } from '../../shared/lib/vosk/voskRuntimes.js'
import { createSwitcher } from './raceSwitch.js'

// Переключение слуха в игре «Встряхни память» (raceSwitch.js) для директора: стадия-плашка со switchTo 'ru' (перед проходом B) запускает загрузку русской модели вместо английской, со switchTo 'en' (перед «Вершиной» полной гонки) —
// обратно. Как только игра ушла с русского прохода (итог, «Вершина»), английская возвращается сама, и на выходе из игры тоже: следующая игра находит её в памяти. Русская не включилась — проход B переводится на тап (stage.demote).
// pendingMs() — пока идёт переключение, пилюли ждут (директор прибавляет к pitLeft). Хук ничего не делает, если у плана нет русского прохода (on = false).
export function useRaceSwitch({ on, running, stages }) {
  const [sw] = useState(() => createSwitcher({ en: voskRuntime, ru: voskRuntimeRu, log: m => pLog(`[race] ${m}`) }))
  const target = on ? running?.switchTo : undefined
  const sid = running?.sid
  useEffect(() => {
    if (target === 'ru') sw.toRu().then(r => { if (!r.ok) stages.find(x => x.demote)?.demote() })
    else if (target === 'en') sw.toEn('перед вершиной')
  }, [target, sid, sw, stages])
  const act = on ? running?.act : undefined
  useEffect(() => { if (act && act !== 'catch' && sw.state() === 'ru') sw.toEn('русский проход закончен') }, [act, sid, sw])
  useEffect(() => () => { if (sw.state() !== 'en') sw.toEn('выход из игры') }, [sw])
  return sw
}
