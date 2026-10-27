// Проигрыватель склейки «до слова → мяу → после» для «Дополни реплику» (B5): шаги даёт fillAudioPlan.js. Один элемент
// Audio на реплику: играет кусок [from, to) — currentTime каждые POLL_MS сравнивается с to, — на шаге «мяу» молчит
// meow.ms миллисекунд. onStage(stage) говорит экрану, что идёт: 'before' | 'meow' | 'after' | 'done' | 'blocked'
// (браузер не дал играть без касания — экран покажет кнопку «Послушать»). Любая остановка (stop / новый play) обрывает
// старый прогон: его хвост ничего не сыграет и не позовёт onStage.
// makeAudio/setT/clearT подменяются в тестах (фейковый звук и таймеры).
export const POLL_MS = 20
const SLACK_MS = 3000 // запас на загрузку: кусок не должен висеть вечно, если звук не пошёл
const OPEN_ENDED_MS = 30000 // потолок для «до конца файла»

export function createFillPlayer({
  url, steps, onStage = () => {}, makeAudio = u => new Audio(u), setT = setTimeout, clearT = clearTimeout,
}) {
  let audio = null
  let run = 0
  let timer = null

  const wait = ms => new Promise(res => { timer = setT(res, ms) })

  async function playPart(a, step, id) {
    a.currentTime = step.from
    await a.play()
    const limit = step.to == null ? OPEN_ENDED_MS : (step.to - step.from) * 1000 + SLACK_MS
    let spent = 0
    while (id === run && spent < limit) {
      if (a.ended || (step.to != null && a.currentTime >= step.to)) break
      await wait(POLL_MS)
      spent += POLL_MS
    }
    a.pause()
  }

  const player = {
    // Играет склейку сначала; повторный вызов обрывает прежний прогон
    async play() {
      player.stop()
      const id = ++run
      try {
        audio ??= makeAudio(url)
        for (const step of steps) {
          if (id !== run) return
          onStage(step.stage)
          if (step.kind === 'meow') await wait(step.ms)
          else await playPart(audio, step, id)
        }
        if (id === run) onStage('done')
      } catch {
        if (id === run) onStage('blocked') // play() отклонён (нужен жест) или файл не открылся
      }
    },
    stop() {
      run += 1
      if (timer) { clearT(timer); timer = null }
      try { audio?.pause() } catch { /* элемент уже снят */ }
    },
  }
  return player
}
