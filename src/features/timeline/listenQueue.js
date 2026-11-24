// Очередь прослушивания «Таймлайна игры» (режим «Прослушать», v3.3.357, владелец: «без пауз, чисто блоками, каждый блок озвучки в той последовательности, как в игре — для админа»):
// ОДИН обычный <audio> по очереди, следующий клип стартует сразу по окончании прежнего (никаких пауз игры и тишины между репликами). Не игровой звук: без gameAudioCtx, аудиосессии и микрофона
// (как clipPlayer.js). Без React: состояние — в onState; фабрика звука подставляется в тестах. items — [{ key, url }] только проигрываемые; битый файл пропускается и попадает в skipped.
// Состояние: { status: 'idle' | 'loading' | 'playing' | 'paused' | 'done' | 'error', index, total, key, skipped: [key], error }
export function createListenQueue({ make = url => new Audio(url), onState = () => {} } = {}) {
  let q = [], i = -1, audio = null, rate = 1, status = 'idle', error = '', skipped = []
  const emit = () => onState({ status, index: i, total: q.length, key: q[i]?.key ?? null, skipped: skipped.slice(), error })
  const drop = () => { const a = audio; audio = null; if (a) { a.onended = a.onerror = a.onplaying = null; try { a.pause() } catch { /* звук уже ушёл */ } } }
  const fail = text => { drop(); status = 'error'; error = text; emit() }

  function playAt(n) {
    drop()
    if (n >= q.length) { status = 'done'; emit(); return }
    i = n; status = 'loading'; error = ''; emit()
    let a
    try { a = make(q[n].url) } catch (e) { fail(`звук не создался: ${e?.message ?? e}`); return }
    try { a.playbackRate = rate } catch { /* скорость не обязательна */ }
    audio = a
    a.onplaying = () => { if (audio === a) { status = 'playing'; emit() } }
    a.onended = () => { if (audio === a) playAt(n + 1) }
    a.onerror = () => { if (audio === a) { skipped.push(q[n].key); playAt(n + 1) } } // файл не загрузился: идём дальше, список пропущенных покажет экран
    try { Promise.resolve(a.play()).catch(e => { if (audio === a) fail(`браузер не дал проиграть: ${e?.message ?? e}`) }) } catch (e) { fail(`браузер не дал проиграть: ${e?.message ?? e}`) }
  }

  return {
    /** Играть items начиная с номера from; прежнее останавливается */
    start(items, from = 0) { q = (items ?? []).filter(x => x?.url); skipped = []; if (!q.length) { drop(); i = -1; status = 'idle'; emit(); return } playAt(Math.min(Math.max(0, from), q.length - 1)) },
    pause() { if (audio && status === 'playing') { try { audio.pause() } catch { /* пауза не обязательна */ } status = 'paused'; emit() } },
    resume() { if (audio && status === 'paused') { status = 'playing'; emit(); try { Promise.resolve(audio.play()).catch(() => {}) } catch { /* повтор по кнопке */ } } },
    stop() { drop(); i = -1; status = 'idle'; emit() },
    next() { if (q.length && i >= 0) playAt(i + 1 < q.length ? i + 1 : q.length) },
    prev() { if (q.length && i >= 0) playAt(Math.max(0, i - 1)) },
    setRate(r) { rate = r; if (audio) { try { audio.playbackRate = r } catch { /* скорость не обязательна */ } } },
    state: () => ({ status, index: i, total: q.length, key: q[i]?.key ?? null }),
  }
}
