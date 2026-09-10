// Таблица не «исчезает из панели и заново появляется» пузырём в чате: панель
// на месте превращается в сообщение. Меняется КЛОН панели поверх всего
// (position:fixed) — настоящая панель в этот момент уже гаснет и вот-вот
// размонтируется, и вешать на неё анимацию было бы гонкой с React.
//
// Это не «полёт» в буквальном смысле: панель никуда не уезжает и не гаснет.
// Клон СХЛОПЫВАЕТСЯ в форму сообщения — уходит верхняя часть (бокс сборки) и
// низ (кнопка), фон сжимается по бокам до ширины пузыря, углы округляются.
// Сама таблица при этом неподвижна: позиция считается так, чтобы её сетка
// совпала с сеткой в пузыре, поэтому переезда не видно — меняется только
// форма вокруг неё. Раньше клон масштабировался через transform: scale и
// гас по opacity, из-за чего таблица уезжала вниз и подменялась другой.
import { pLog } from '../../../shared/lib/debug.js'
import { traceMorph } from './tracePanelSync.js'
import { r, FLIGHT_MS, SPACER_EASE, anchorRow, whenSettled, slimDown } from './flyPanelParts.js'

export function flyPanelToChat(panelEl, nodeId, { send, reveal, onLanded, onCompensate, settleLayout, onRelease }) {
  const finish = () => onLanded?.()
  // Без WAAPI (очень старый браузер) — обычное поведение: пузырь просто
  // появляется в чате, без полёта
  if (!panelEl || typeof panelEl.animate !== 'function') {
    send?.(false)
    finish()
    return
  }

  const from = panelEl.getBoundingClientRect()
  const ghost = panelEl.cloneNode(true)
  ghost.classList.add('panelFlyGhost')
  ghost.style.left   = `${from.left}px`
  ghost.style.top    = `${from.top}px`
  ghost.style.width  = `${from.width}px`
  ghost.style.height = `${from.height}px`
  document.body.appendChild(ghost)
  pLog(`[fly] старт: панель ${r(from)}, сетка в панели ${r(panelEl.querySelector('.tableGrid')?.getBoundingClientRect())}`)
  slimDown(ghost)

  // Вставка пузыря толкает ленту ВВЕРХ на его высоту (FLIP в PlayerFeed), а
  // снятие распорки тянет её ВНИЗ. Обе правки идут одним setState-батчем,
  // значит одним пересчётом layout — лента при вставке не двигается вовсе.
  //
  // Сколько отдать, знаем точно: строка таблицы занимает в ленте РОВНО высоту
  // панели — так подобраны её поля в table.css (пузырь короче на разницу
  // нижних полос, строка длиннее на отступ сверху). Прежние прикидки по
  // слагаемым («сетка», потом «сетка + бокс + поля») дважды молча расходились
  // с реальностью и каждый раз выливались в рывок истории.
  const expectH = Math.round(from.height)
  pLog(`[fly] компенсация спейсера: пузырь займёт ${expectH}px (вся высота панели)`)

  // Запоминаем, где стояла переписка ДО вставки: удержание ниже считается по
  // фактическому смещению этого сообщения, а не по остатку распорки
  const anchor = anchorRow()
  const anchorWas = anchor ? anchor.getBoundingClientRect().top : null

  // arriving=true: пузырь встаёт в ленту сразу (держит место под посадку и
  // даёт её замерить), но невидимым — до вызова reveal
  send?.(true)
  if (expectH) onCompensate?.(expectH)

  whenSettled(() => document.querySelector(`[data-table-bubble="${nodeId}"]`), row => {
    // Снимаем распорку и тут же удерживаем историю трансформом: раскладка
    // становится конечной, а картинка не меняется. Меряем уже по ней
    const rest = settleLayout ? settleLayout() : 0
    // Насколько история УЖЕ уехала. Вставка пузыря толкает её вверх на его
    // высоту, снятие распорки — вниз на свою; сложились они точно или нет,
    // видно только по якорю. Удерживать надо ровно на эту разницу: держать на
    // остатке распорки (как было раньше) можно, только если оценка высоты
    // пузыря была идеальной, а её промах превращался в прыжок истории вверх
    // на первом же кадре и долгий съезд обратно.
    const anchorNow = anchor && document.body.contains(anchor)
      ? anchor.getBoundingClientRect().top : null
    const drop = (anchorWas != null && anchorNow != null)
      ? Math.round(anchorNow - anchorWas)
      : rest
    pLog(`[fly] раскладка зафиксирована | остаток распорки ${Math.round(rest)}px`
      + ` | якорь ${anchorWas != null ? Math.round(anchorWas) : '—'}→${anchorNow != null ? Math.round(anchorNow) : '—'}`
      + ` | удержание ${drop}px`)
    const target = row?.querySelector('.playerMsgBubble--table') ?? row
    if (!target) {
      pLog('[fly] пузыря в ленте нет — показываем сообщение без превращения')
      ghost.remove()
      frame?.remove()
      reveal?.()
      finish()
      return
    }
    const to = target.getBoundingClientRect()
    const cs = getComputedStyle(target)

    // Совмещать надо не рамки панели и пузыря, а САМИ СЕТКИ: над таблицей в
    // панели лежит бокс сборки и отступы .tdStage, в пузыре — ничего этого
    // нет. Приземляя панель по её верхнему краю, мы клали таблицу ниже, чем
    // она оказывалась в сообщении, — отсюда скачок на последнем кадре.
    const ghostGrid = ghost.querySelector('.tableGrid')
    const bubbleGrid = target.querySelector('.tableGrid')

    // Снимаем анимации подгонки: их конечное состояние уже продублировано
    // инлайном (см. collapseBlock), поэтому отмена ничего не «отматывает», а
    // замер ниже видит настоящую геометрию, а не кадр анимации
    ghost.getAnimations({ subtree: true }).forEach(a => a.cancel())

    const at = ghost.getBoundingClientRect()

    // Клон и пузырь УЖЕ совпадают по содержимому: внутренний блок панели и сам
    // пузырь оба ограничены 600px и центрированы, поэтому таблица в них стоит
    // в одной и той же точке экрана. Значит переход — это не перелёт, а
    // ОБРЕЗКА рамки: лишнее по бокам и снизу нужно просто убрать.
    //
    // Так и делаем: коробка клона не меняется вообще (ни left, ни width, ни
    // height), а края съедает clip-path. Это чистая отрисовка — ни layout, ни
    // сдвига содержимого, значит и рябить нечему. Раньше здесь ехали
    // left/width/height, и весь текст таблицы каждый кадр растеризовался
    // заново с новой субпиксельной фазой: в трассе всё стояло неподвижно до
    // сотых, а на экране была рябь.
    const gridTo = bubbleGrid?.getBoundingClientRect() ?? to
    const gridAt = ghostGrid?.getBoundingClientRect() ?? at

    // Остаточное несовпадение сеток. В обычной раскладке это ноль; если вдруг
    // нет — доводим трансформом, он композитный и содержимое не перерисовывает
    const dx = gridTo.left - gridAt.left
    const dy = gridTo.top - gridAt.top

    // На сколько ужмётся рамка с каждой стороны — только для лога: сама она
    // едет по своим left/top/width/height, а эти числа показывают величину хода
    const cut = v => Math.max(0, v)
    const insL = cut(to.left - (at.left + dx))
    const insR = cut((at.left + dx + at.width) - (to.left + to.width))
    const insT = cut(to.top - (at.top + dy))
    const insB = cut((at.top + dy + at.height) - (to.top + to.height))

    pLog(`[fly] сдвиг таблицы ${dx.toFixed(2)},${dy.toFixed(2)} (должен быть 0,0 — иначе сетки не совпали)`)
    pLog(`[fly] клон ${r(at)} | пузырь ${r(to)}`)
    pLog(`[fly] сетка клона ${r(gridAt)} → сетка пузыря ${r(gridTo)}${bubbleGrid ? '' : ' (СЕТКИ В ПУЗЫРЕ НЕТ, целимся по пузырю)'}`)
    pLog(`[fly] рамка ужмётся: сверху ${insT.toFixed(2)} справа ${insR.toFixed(2)} снизу ${insB.toFixed(2)} слева ${insL.toFixed(2)}`)

    // Внутренний блок не трогаем СОВСЕМ. Поля панели и пузыря совпадают (6px
    // сверху, 16px по бокам), отличается только нижний отступ — а он под
    // срезанным низом и не виден. Раньше тут пинались ширина, margin и
    // padding, и каждая правка была лишним пересчётом раскладки.


    // Никакого затухания: панель не «улетает и гаснет», а СХЛОПЫВАЕТСЯ в
    // форму сообщения — сжимается фон по бокам, уходит верхняя часть,
    // округляются углы. Таблица внутри при этом стоит на месте: позиция
    // клона подобрана выше так, чтобы его сетка совпала с сеткой пузыря,
    // поэтому видимого переезда нет — только смена формы вокруг неё.
    // Клон СРАЗУ принимает форму пузыря и дальше не анимируется ничем: он и так
    // стоит там, где окажется сообщение, и содержимое в нём то же самое.
    // Внутренний блок в обоих ограничен 600px, поэтому от смены ширины коробки
    // таблица не сдвигается — она как стояла, так и стоит.
    //
    // Фон при этом остаётся СВОИМ, непрозрачным. Это важнее, чем кажется: без
    // непрозрачной подложки в своём слое Chrome рисует текст серым сглаживанием
    // вместо субпиксельного, и надпись заметно меняет вид — сначала при уходе
    // фона, потом обратно при подмене на пузырь. Это и было мерцание.
    ghost.style.left = `${to.left}px`
    ghost.style.top = `${to.top}px`
    ghost.style.width = `${to.width}px`
    ghost.style.height = `${to.height}px`
    ghost.style.borderRadius = cs.borderRadius

    // Остаток меряем ПОСЛЕ переустановки коробки, а не до неё. Клон только что
    // переехал из позиции панели в позицию пузыря, и его сетка уехала вместе с
    // ним — то расхождение, что было посчитано выше (dx/dy), этим переездом
    // уже закрыто. Применять его ещё и трансформом значит сдвинуть таблицу на
    // ту же величину второй раз: в логе это видно как «клон T=509» при пузыре
    // на 537 — ровно 28px мимо, при том что рамка садится в пузырь идеально.
    // Отсюда и «таблицы не совпадают»: рамка на месте, а таблица внутри выше.
    const gridNow = ghostGrid?.getBoundingClientRect() ?? ghost.getBoundingClientRect()
    const restX = gridTo.left - gridNow.left
    const restY = gridTo.top - gridNow.top
    pLog(`[fly] остаток после переезда ${restX.toFixed(2)},${restY.toFixed(2)}`
      + ` (до переезда было ${dx.toFixed(2)},${dy.toFixed(2)} — эта разница закрыта самим переездом)`)

    // Переезд коробки — это МГНОВЕННЫЙ скачок из позиции панели в позицию
    // пузыря. Пузырь же приезжает туда не сразу: лента опускается те же
    // FLIGHT_MS (см. onRelease ниже). Если клон просто поставить на конечное
    // место, он прыгает на всю разницу в первом кадре и потом неподвижно ждёт
    // ленту — в трассе это видно как «клон T=537 с первого кадра, пузырь
    // 565→537 за 416мс». Именно это читается как рывок: панель не перетекает,
    // а телепортируется.
    //
    // Поэтому возвращаем клон трансформом туда, где он стоял, и снимаем этот
    // сдвиг той же кривой и длительностью, что едет лента. Трансформ
    // композитный: содержимое таблицы не перерисовывается, только смещается
    // готовый слой.
    const backX = at.left - to.left + restX
    const backY = at.top - to.top + restY
    if (backX || backY || restX || restY) {
      pLog(`[fly] клон едет с лентой: ${backX.toFixed(2)},${backY.toFixed(2)} → ${restX.toFixed(2)},${restY.toFixed(2)} за ${FLIGHT_MS}мс`)
      ghost.style.transform = `translate(${backX}px, ${backY}px)`
      ghost.animate([
        { transform: `translate(${backX}px, ${backY}px)` },
        { transform: `translate(${restX}px, ${restY}px)` },
      ], { duration: FLIGHT_MS, easing: SPACER_EASE, fill: 'forwards' })
      ghost.style.transform = `translate(${restX}px, ${restY}px)`
    }

    // А панель вокруг него сжимает отдельная пустая коробка ПОЗАДИ клона. Ей и
    // отданы left/top/width/height со скруглением. Внутри неё пусто, поэтому
    // кадр почти ничего не стоит — в отличие от той же анимации на самом клоне,
    // где вместе с рамкой заново растеризовалась вся таблица (это была рябь), и
    // в отличие от clip-path, который не композитится и рисует то же самое,
    // только ещё и сквозь скруглённую маску (это был лаг).
    //
    // В первых кадрах рамка шире клона, и её фон того же цвета просто
    // достраивает панель по бокам; к концу они совпадают ровно.
    const frame = document.createElement('div')
    frame.className = 'panelFlyFrame'
    // Габариты задаются ниже — сразу конечные, а начальный вид даёт трансформ
    Object.assign(frame.style, {
      background: getComputedStyle(ghost).backgroundColor,
      borderRadius: '0px',
    })
    ghost.parentNode.insertBefore(frame, ghost)

    // Единственная анимация всего перехода. onfinish берём с неё же: вешать
    // пустышку на клон нельзя — анимация opacity, даже из 1 в 1, поднимает его
    // на отдельный слой и на это время отключает субпиксельное сглаживание
    // Рамка едет ТРАНСФОРМОМ, а не left/top/width/height. Те четыре свойства
    // — раскладка: браузер пересчитывал её и перерисовывал каждый из ~20
    // кадров превращения, и всё это на главном потоке, ровно тогда, когда он
    // нужен ленте и клону. Отсюда и рывок на телефоне при уходе таблицы.
    //
    // Коробке сразу задаётся КОНЕЧНЫЙ размер (размер пузыря), а начальный вид
    // получается обратным трансформом от него: сдвиг в позицию панели плюс
    // растяжение до её габаритов. К концу трансформ сходит в единицу — рамка
    // оказывается ровно там и такой, какой была бы при прежней анимации.
    // Точка отсчёта — левый верхний угол, иначе масштаб развёл бы края.
    const sx = at.width / to.width
    const sy = at.height / to.height
    Object.assign(frame.style, {
      left: `${to.left}px`, top: `${to.top}px`,
      width: `${to.width}px`, height: `${to.height}px`,
      transformOrigin: 'top left',
    })
    const anim = frame.animate([
      { transform: `translate(${at.left - to.left}px, ${at.top - to.top}px) scale(${sx}, ${sy})`, borderRadius: '0px' },
      { transform: 'translate(0px, 0px) scale(1, 1)', borderRadius: cs.borderRadius },
    ], { duration: FLIGHT_MS, easing: SPACER_EASE, fill: 'forwards' })

    // Тотальная трасса на время превращения — видно и цифры, и пропуски кадров
    traceMorph(ghost, target)

    // История опускается ровно вместе с превращением: та же длительность и
    // кривая, и оба движения — композитные трансформы, один конвейер.
    // Запускается в том же синхронном блоке, что и снятие распорки с замером,
    // поэтому промежуточное состояние на экран не попадает
    onRelease?.(drop)

    // Клон держится непрозрачным до последнего кадра, а подмена идёт в один
    // приём: пузырь показывается и клон снимается в одном и том же кадре —
    // к этому моменту они совпадают пиксель в пиксель, и мигания нет
    const land = () => {
      const tg = target.getBoundingClientRect()
      // Сравнивать надо рамку: клон стоит на месте пузыря с самого начала, а
      // едет и приходит в его форму именно она. Если тут не ноль, картинка
      // прыгнет при подмене ровно на столько
      const fr = frame.getBoundingClientRect()
      const vL = fr.left, vT = fr.top, vW = fr.width, vH = fr.height
      pLog(`[fly] посадка: рамка ${Math.round(vL)},${Math.round(vT)} ${Math.round(vW)}x${Math.round(vH)}`
        + `, пузырь ${r(tg)} → расхождение ${Math.round(tg.left - vL)},${Math.round(tg.top - vT)} высота ${Math.round(tg.height - vH)}`)
      reveal?.()
      // Клон снимаем не «через кадр», а когда пузырь ФАКТИЧЕСКИ проявился.
      // reveal — это setState: React коммитит его не в текущем кадре, и клон,
      // снятый раньше коммита, оставлял кадр, где его уже нет, а пузырь ещё
      // скрыт (visibility: hidden). Этот один пустой кадр и читался морганием.
      let tries = 0
      const drop = () => {
        const shown = getComputedStyle(target).visibility !== 'hidden'
        if (shown || tries >= 8) {
          ghost.remove()
          frame.remove()
          pLog(`[fly] клон снят через ${tries} кадр(ов)${shown ? '' : ' — ПО ЛИМИТУ, пузырь так и не проявился'}`)
          // Следующая нода запускается ТОЛЬКО отсюда, после снятия клона.
          // Раньше finish() стоял сразу за requestAnimationFrame(drop), то
          // есть на кадр-два раньше: плеер успевал вставить в ленту индикатор
          // «печатает» и следующее сообщение, лента сдвигалась и уносила
          // пузырь, — а клон ещё висел поверх на прежних координатах и
          // расходился с ним. До появления «печатает» вставлять в этот зазор
          // было нечего, и промах не был виден.
          finish()
          return
        }
        tries += 1
        requestAnimationFrame(drop)
      }
      requestAnimationFrame(drop)
    }
    anim.onfinish = land
    anim.oncancel = land
  })
}
