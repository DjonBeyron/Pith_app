---
name: lint-set-state-in-effect
description: В проекте включено правило eslint react-hooks/set-state-in-effect (ошибка, не warning) — синхронный setState в теле useEffect валит npm run lint; как обходить
metadata:
  type: feedback
---

Нельзя звать setState синхронно в теле useEffect — `npm run lint` падает с ошибкой `react-hooks/set-state-in-effect`.

**Why:** в eslint.config.js включён плагин react-hooks нового поколения (правила `set-state-in-effect`, `refs`, `immutability`), ошибки блокируют сборку/проверку.

**How to apply:** принятые в кодовой базе паттерны обхода (FeedSlide, useTranslationReveal, useSlideCatch, CatchCover):
- производное состояние — считать при рендере (`const revealed = opened || ct.done`), а не копировать в state эффектом;
- «сброс при рендере»: `if (prev !== cur) { setPrev(cur); setX(...) }` прямо в теле компонента/хука;
- асинхронные setState внутри эффекта допустимы: в `setTimeout`, `requestAnimationFrame`, в колбэке ResizeObserver, через `.then`;
- вызов setState родителя через ref (`heightRef.current?.(h)`) в layout-эффекте правило не ловит.
