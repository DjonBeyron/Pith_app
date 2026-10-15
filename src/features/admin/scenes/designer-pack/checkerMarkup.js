// Разметка автономного HTML-проверщика для дизайнера (тело страницы). Текст — по-русски,
// простыми словами, у каждого блока «?» (подсказка на CSS по data-tip, без JS). Числа
// подставляет buildCheckerHtml.js из констант ядра (метки {{...}}). Скрипт и стили — отдельно.

const tip = text => `<span class="q" tabindex="0" role="note" data-tip="${text.replace(/"/g, '&quot;')}">?</span>`

export function checkerBody() {
  return `
<header class="hd">
  <div>
    <h1>Проверка SVG для Pithy</h1>
    <p class="sub">Файл открывается без интернета и ничего никуда не отправляет. Загрузите свой SVG — увидите вердикт «можно отправлять /
      исправьте», список замечаний с подсказками и то, как кот или предмет будет двигаться и стоять в приложении. Версия приложения {{version}}.</p>
  </div>
</header>
<main class="wrap">
  <section class="card" id="sec-in">
    <h2>1. Файл ${tip('Можно загрузить файл кнопкой, перетащить его в пунктирную область или вставить текст SVG в поле. Тип (кот / предмет / фон) определяется сам, но его можно переключить.')}</h2>
    <div class="row">
      <div class="seg" id="kind" role="radiogroup" aria-label="Тип файла">
        <button type="button" data-kind="cat" aria-checked="false" role="radio">Кот</button>
        <button type="button" data-kind="prop" aria-checked="true" role="radio">Предмет</button>
        <button type="button" data-kind="background" aria-checked="false" role="radio">Фон</button>
      </div>
      <label class="btn file">Загрузить файл… <input type="file" id="file" accept=".svg,image/svg+xml"></label>
      <button type="button" class="btn" id="demo">Пример: шаблон кота</button>
      <button type="button" class="btn" id="clear">Очистить</button>
      <span class="muted" id="fname"></span>
    </div>
    <textarea id="src" rows="7" spellcheck="false" placeholder="Вставьте текст SVG сюда — от <svg до </svg> — или перетащите файл в это поле"></textarea>
    <p class="muted small">Лимиты по типу: кот ≤ {{catMax}} узлов, предмет ≤ {{propMax}}, фон ≤ {{bgMax}}. Узел — любая фигура или группа.</p>
  </section>

  <section class="card" id="sec-rep" hidden>
    <h2>2. Вердикт ${tip('Зелёный — файл проходит те же проверки, что и в приложении: можно отправлять администратору. Красный — исправьте каждый пункт и загрузите файл снова.')}</h2>
    <p class="verdict" id="verdict"></p>
    <div class="budget" aria-label="Бюджет узлов">
      <div class="bar"><div class="fill" id="bar"></div></div>
      <span id="nodes"></span>
      ${tip('Сколько фигур и групп попадёт на экран. Чем меньше, тем плавнее анимация на слабых телефонах. Сцена целиком (фон + два кота + предметы) не больше {{budget}} узлов.')}
    </div>
    <div class="chips" id="parts"></div>
    <div class="chips" id="visemes"></div>
    <ol class="problems" id="problems"></ol>
  </section>

  <section class="card" id="sec-prev" hidden>
    <h2>3. Предпросмотр ${tip('Те же CSS-анимации, что в приложении: тело «дышит», голова покачивается, глаза моргают, хвост качается; рот переключает три формы. Работают только если группы data-part названы верно.')}</h2>
    <div class="ctl" id="ctl-cat">
      <div class="seg" id="emo" data-label="Эмоция">${['neutral', 'happy', 'tired', 'surprised'].map(e => `<button type="button" data-emo="${e}">${e}</button>`).join('')}
        ${tip('Эмоции встроенных котов приложение рисует само (веки, брови). Для вашего кота: нарисуйте варианты глаз/бровей отдельными файлами cat-…-happy.svg — или положите их в группы <g data-emotion="happy|tired|surprised"> рядом с нейтральными: тогда переключатель покажет их здесь.')}</div>
      <div class="seg" id="mouth" data-label="Рот"><button type="button" data-mouth="closed">closed</button><button type="button" data-mouth="half">half</button><button type="button" data-mouth="open">open</button>
        ${tip('Три формы рта лежат в файле одновременно; приложение показывает одну, атрибутом data-mouth. Во время речи формы чередуются каждые {{mouthMs}} мс: {{mouthCycle}}.')}</div>
      <label class="chk"><input type="checkbox" id="talk"> Говорит</label>
      <label class="chk"><input type="checkbox" id="pause"> Пауза</label>
      <label class="rng">Скорость <input type="range" id="speed" min="0.25" max="2" step="0.25" value="1"><span id="speedv">1×</span></label>
    </div>
    <div class="ctl" id="ctl-prop">
      <div class="seg" id="slot" data-label="Куда поставить">{{slotButtons}}
        ${tip('Предмет ставится точкой (0,0) своего файла в якорь ячейки: напольные и настольные — нижней серединой, настенные — центром, подвесные — верхом. Красная точка — якорь.')}</div>
    </div>
    <div class="ctl">
      <label class="chk"><input type="checkbox" id="dark"> Тёмный фон</label>
      <label class="rng">Масштаб <input type="range" id="zoom" min="0.5" max="2.5" step="0.25" value="1"><span id="zoomv">1×</span></label>
    </div>
    <p class="muted small" id="prev-note"></p>
    <div class="stage-wrap"><div class="scn scn--live stage" id="stage"></div></div>
  </section>

  <section class="card tips">
    <h2>Что проверяется</h2>
    <ul>
      <li><b>Размер холста</b> — viewBox: кот {{catVb}}, фон {{bgVb}}, предмет — свой габарит, не больше {{propMaxW}}×{{propMaxH}}.</li>
      <li><b>Группы</b> — обязательные <code>data-part</code> у кота: {{catParts}}; у фона: wall, floor; у предмета — хотя бы одна с именем предмета.</li>
      <li><b>Рот</b> — три группы <code>data-viseme</code>: {{visemes}}.</li>
      <li><b>Запрещено</b> — {{banWords}}; внешние ссылки, url(…), обработчики on…, текст лучше в контуры.</li>
      <li><b>Цвета</b> — только fill/stroke: #rrggbb, rgb(), currentColor, none.</li>
      <li><b>Бюджет</b> — узлов не больше лимита типа; файл до 64 КБ.</li>
    </ul>
    <p class="muted small">Имена файлов: латиница, дефисы, нижний регистр — cat-male.svg, coffee-cup.svg, bg-cafe.svg. Проверка та же, что в приложении (один и тот же код), поэтому зелёный здесь = зелёный у администратора.</p>
  </section>
</main>
<footer class="ft">Pithy · пакет для дизайнера · проверка SVG · v{{version}}</footer>
`
}
