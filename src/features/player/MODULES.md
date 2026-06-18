# Архитектура модулей плеера

## Принцип: три независимых слоя

```
LessonPlayer (оркестратор)
    │
    ├── PlayerFeed (ИЗОЛИРОВАННЫЙ скролл)
    │       └── модули сообщений (рендерят себя, не знают о скролле)
    │
    └── панель (рендерится ВНЕ PlayerFeed, не влияет на его скролл)
```

**Строго запрещено:**
- Модулям сообщений трогать `scrollTop` / `scrollIntoView`
- Панелям монтироваться внутри `PlayerFeed`
- Одному модулю импортировать стили другого

---

## Скролл-поведение — полная изоляция

`PlayerFeed.jsx` — единственный файл, который управляет скроллом.
Он предоставляет API через ref (или callback):

```
scrollToBottom(animated)   ← вызвать когда добавлено новое сообщение
lockToBottom()             ← зафиксировать на дне во время активного вывода
unlockScroll()             ← разрешить пользователю скроллить вручную
```

**Триггеры скролла** (только из `LessonPlayer` или `PlayerFeed`, никогда из модулей):
- Появилось новое сообщение → `scrollToBottom`
- Открылась/закрылась панель → `scrollToBottom`
- Появились/исчезли точки ожидания → `scrollToBottom`

CSS-анимации входа сообщения (slide-up, fade-in) описаны только в `feed.css`.
Они не должны зависеть от внутреннего состояния модуля.

---

## Структура файлов

```
src/features/player/
  LessonPlayer.jsx           ← оркестратор: последовательность нод, состояние панели
  PlayerFeed.jsx             ← ИЗОЛИРОВАННЫЙ скролл, вход сообщений, waiting-dots
  PlayerTopBar.jsx           ← шапка
  PlayerBubble.jsx           ← анимация высоты пузыря (ResizeObserver)
  PlayerTypingText.jsx       ← посимвольное печатание (общий для всех модулей)

  modules/
    audio/
      AudioModule.jsx        ← основной компонент аудио-сообщения
      AudioWaveform.jsx      ← волна (можно отдельно переиспользовать)
    text/
      TextModule.jsx
    photo/
      PhotoModule.jsx
    video/
      VideoModule.jsx
    circle/
      CircleModule.jsx
    sticker/
      StickerModule.jsx
    system/
      SystemModule.jsx       ← системное сообщение (нет пузыря)
    index.js                 ← роутер: node.type → нужный модуль

  panels/
    choose-word/
      ChooseWordPanel.jsx    ← контейнер панели, список чипов
      ChooseWordOption.jsx   ← один вариант (default / selected / correct / wrong)
      ChooseWordResponse.jsx ← ответный пузырь появляется после выбора
      useChooseWord.js       ← вся логика выбора, состояние, валидация
    build-phrase/
      BuildPhrasePanel.jsx
      useBuildPhrase.js
    index.js                 ← роутер: node.panelType → нужная панель

  waiting/
    WaitingDots.jsx          ← три точки «учитель печатает»

src/styles/player/
  layout.css      ← .lessonPlayer, общий flex-контейнер
  topbar.css      ← шапка
  feed.css        ← ИЗОЛИРОВАНО: скролл, .playerMsgRow вход-анимация, waiting
  message.css     ← только базовый пузырь: border-radius, фон, max-width

  modules/
    audio.css     ← waveform, cursor, charRevealGlow — только аудио
    text.css
    photo.css
    video.css
    circle.css
    sticker.css
    system.css

  panels/
    choose-word.css
    build-phrase.css
```

---

## Правила модуля сообщения

Каждый `XxxModule.jsx`:
1. Принимает `{ node, file }` — и ничего больше из контекста плеера
2. Управляет своим внутренним состоянием (isPlaying, isTyping и т.д.)
3. Общается вверх только через `onDone()` callback (когда сообщение «проиграно»)
4. НЕ знает о скролле, о других модулях, о панелях
5. Импортирует CSS только из `styles/player/modules/свой.css` и общих `message.css`

Роутер `modules/index.js`:
```js
import AudioModule  from './audio/AudioModule.jsx'
import TextModule   from './text/TextModule.jsx'
// ...
const MODULE_MAP = { audio: AudioModule, text: TextModule, ... }
export function resolveModule(type) { return MODULE_MAP[type] ?? null }
```

---

## Правила панели

Каждая панель (`panels/*/XxxPanel.jsx`):
1. Рендерится в `LessonPlayer` — **вне** `PlayerFeed`
2. Имеет фиксированную/анимированную высоту — `PlayerFeed` получает уведомление через callback чтобы подправить скролл
3. Принимает `{ node, onAnswer(answer) }` — одним коллбэком отдаёт ответ
4. Для сложных панелей (choose-word) логика в отдельном `useXxx.js` хуке

«Выбери слово» — особый случай:
- `ChooseWordPanel` показывает чипы внизу
- При выборе → `ChooseWordResponse` добавляет пузырь-ответ в ленту
- `useChooseWord` управляет: какой вариант выбран, правильный/нет, текст ответа
- Файлы: Panel (~60), Option (~25), Response (~30), Hook (~70) — ни один не превышает лимит

---

## Waiting dots — отдельный слой

`WaitingDots` монтируется/размонтируется `PlayerFeed`-ом (или `LessonPlayer`-ом).
Имеет **фиксированную высоту** (например 48px) чтобы скролл не прыгал.
Анимация трёх точек — чистый CSS в `feed.css`, никакого JS-таймера.

---

## Порядок рефакторинга (этапы)

**Этап 1 — CSS изоляция** (не трогает JSX)
- Создать `feed.css`, `topbar.css`, `modules/`, `panels/`
- Разнести стили из `message.css` и `player.css` по новым файлам
- Обновить `index.css`

**Этап 2 — PlayerFeed**
- Выделить `PlayerFeed.jsx` из `LessonPlayer.jsx`
- Весь скролл-код переехал в `PlayerFeed`
- `LessonPlayer` только решает что показывать

**Этап 3 — modules/index.js + роутер**
- Переименовать/переместить существующие компоненты в `modules/`
- Создать роутер; `PlayerMessage.jsx` → тонкая обёртка через роутер

**Этап 4 — WaitingDots**
- Создать `WaitingDots.jsx` + стили в `feed.css`
- Подключить в `PlayerFeed` / `LessonPlayer`

**Этап 5 — panels/**
- Создать `panels/choose-word/` с разбивкой на 4 файла
- Создать `panels/build-phrase/` стаб
- Подключить панели в `LessonPlayer` вне `PlayerFeed`
