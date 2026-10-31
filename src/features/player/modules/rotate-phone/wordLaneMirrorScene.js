// Сцена «Дубль и зеркало» на дорожках для движка пилюль (useWordLanePills, v3.3.86): после дубля дорожки сами плавно останавливаются (конвейер, laneConveyorDrive.js: пилюль на дорожке нет),
// и на них появляются две ленты — верхняя Пит, нижняя ты. Пилюли берутся из того же пула и стоят на месте без полёта (pool.take с flight: false, pool.place): data-still = 'pit' | 'you' — конвейер их
// за пилюли на дорожке не считает (дорожки остаются стоять), data-tag — маленькая подпись на самой пилюле («Пит» / «Ты», word-lane-mirror.css), data-cmp — состояние куска в дубле.
// Заливка: у Пита полная; у «Ты» по измерениям (mirrorCompare.js) — сказан: залита (data-lock), пропущен: пустая с полосками промаха (data-wrong, word-lane-pill-wrong.css).
// Что звучит сейчас, подсвечивает api.lit(side, i): пилюля светится (data-voice) и дорожка вспыхивает цветом (pool.flashLane — на слабом устройстве статично); api.lit(null) гасит. Ничего нового в DOM нет.
// scene.layout — compareLayout(): { pit: [{ i, lane, y, tag, fill, wrong, state }], you: [...] }.
export function runMirrorScene({ pool, scene }) {
  const held = { pit: new Map(), you: new Map() } // сторона → (кусок → номер пилюли в пуле)
  let lit = null                                   // номер горящей сейчас пилюли в пуле (или null)

  const put = (side, p) => {
    const k = pool.take(p.lane, { flight: false })
    if (k == null) return
    const el = pool.el(k)
    pool.place(k, p.y)
    el.setAttribute('data-still', side)
    el.setAttribute('data-tag', p.tag)
    el.setAttribute('data-cmp', p.state)
    pool.paintFill(k, p.fill)
    if (p.fill > 0) pool.attr(k, 'data-lock')
    if (p.wrong) pool.attr(k, 'data-wrong')
    pool.attr(k, 'data-live', false); pool.attr(k, 'data-ring', false) // заливка стоит готовая: искр и «выдоха» кольца нет
    held[side].set(p.i, { k, lane: p.lane })
  }
  scene.layout.pit.forEach(p => put('pit', p))
  scene.layout.you.forEach(p => put('you', p))

  const off = () => { if (lit !== null) { pool.attr(lit, 'data-voice', false); lit = null } }
  return {
    api: {
      /** Зазвучал кусок i стороны side ('pit' | 'you'); side = null — тишина. Нет такой пилюли (кусок не сказан) — просто гасим */
      lit(side, i) {
        off()
        const h = side ? held[side]?.get(i) : null
        if (!h) return
        lit = h.k
        pool.attr(h.k, 'data-voice')
        pool.flashLane(h.lane)
      },
    },
    stop() { off(); for (const side of Object.values(held)) for (const { k } of side.values()) pool.unplace(k) },
  }
}
