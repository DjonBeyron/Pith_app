// Проигрыватель одного клипа таймлайна: ОБЫЧНЫЙ элемент <audio> (new Audio(url)) — не игровой звук (ни gameAudioCtx, ни аудиосессия, ни микрофон не трогаются). Один звук за раз:
// новый клип останавливает прежний; повторное нажатие на тот же клип — стоп. Без React: состояние отдаётся в onState, фабрика звука подставляется (make) — тесты проверяют логику без браузера.
// Состояние: { key, status: 'idle' | 'loading' | 'playing' | 'error', dur (длина файла, с), at (с какой секунды играет), error }.
export const IDLE = { key: null, status: 'idle' }
const EVENTS = ['playing', 'ended', 'error']

export function createClipPlayer({ make = url => new Audio(url), onState = () => {} } = {}) {
  let cur = null // { key, audio, on }
  const drop = () => { const c = cur; cur = null; if (c) for (const ev of EVENTS) { try { c.audio.removeEventListener(ev, c.on[ev]) } catch { /* звук уже ушёл */ } } return c }
  const fail = (c, text) => { if (cur !== c) return; drop(); onState({ key: c.key, status: 'error', error: text }) }

  /** Остановить то, что играет (ничего не играет — ничего не меняется) */
  function stop() {
    const c = drop()
    if (!c) return false
    try { c.audio.pause() } catch { /* пауза не обязательна */ }
    onState(IDLE)
    return true
  }

  /** Проиграть url под ключом key (прежний звук останавливается) */
  function play(key, url) {
    const old = drop()
    if (old) { try { old.audio.pause() } catch { /* пауза не обязательна */ } }
    let audio
    try { audio = make(url) } catch (e) { onState({ key, status: 'error', error: `звук не создался: ${e?.message ?? e}` }); return }
    const c = { key, audio, on: {} }
    c.on.playing = () => { if (cur === c) onState({ key, status: 'playing', dur: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null, at: Number(audio.currentTime) || 0 }) }
    c.on.ended = () => { if (cur === c) { drop(); onState(IDLE) } }
    c.on.error = () => fail(c, 'файл озвучки не загрузился (удалён или нет сети)')
    for (const ev of EVENTS) audio.addEventListener(ev, c.on[ev])
    cur = c
    onState({ key, status: 'loading' })
    try { Promise.resolve(audio.play()).catch(e => fail(c, `браузер не дал проиграть: ${e?.message ?? e}`)) } catch (e) { fail(c, `браузер не дал проиграть: ${e?.message ?? e}`) }
  }

  return { play, stop, /** Тот же ключ — стоп, другой — играть его */ toggle: (key, url) => (cur?.key === key ? void stop() : play(key, url)), current: () => cur?.key ?? null }
}
