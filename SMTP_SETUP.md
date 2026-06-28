# Смена почты для отправки писем (SMTP)

## Что нужно сделать на новой почте

### Яндекс Почта
1. Зайди в `mail.yandex.ru` → шестерёнка → Все настройки → **Email-клиенты**
2. Включи **Разрешить доступ с помощью почтовых клиентов**
3. Зайди на `id.yandex.ru` → Безопасность → **Пароли приложений** → Создать
4. Выбери тип **Почта** → скопируй сгенерированный пароль (16 символов)

### Gmail / другие провайдеры
- Gmail: включи двухфакторную аутентификацию → App Passwords → создай пароль для Mail
- Mail.ru: Настройки → Безопасность → Пароли для внешних приложений

---

## Где менять в Supabase

**Supabase Dashboard → Authentication → Emails → SMTP Settings**

| Поле | Значение |
|------|----------|
| Sender email | новый адрес отправителя (например `noreply@domain.ru`) |
| Sender name | `Pithy` |
| Host | `smtp.yandex.ru` (или smtp вашего провайдера) |
| Port | `465` |
| Username | полный email (`tv.eugeny@yandex.ru`) |
| Password | **пароль приложения**, не обычный пароль |

Нажми **Save**.

---

## Проверить что всё работает

1. Supabase → Authentication → Sign In / Providers → убедись что **Confirm email** включён
2. Зарегистрируй тестового пользователя
3. Проверь что письмо пришло
4. Перейди по ссылке — должно открыться приложение (нужен правильный Redirect URL)

---

## Redirect URL (важно при смене домена)

**Supabase → Authentication → Configuration → URL Configuration**

- **Site URL**: адрес продакшн-сайта (например `https://pithy-app.vercel.app`)
- **Redirect URLs**: добавь все допустимые адреса:
  - `http://localhost:5173/**` — для локальной разработки
  - `https://pithy-app.vercel.app/**` — для прода

Оба можно держать одновременно.

---

## Шаблон письма

**Supabase → Authentication → Emails → Templates → Confirm signup**

Текущий шаблон на русском уже настроен. При смене провайдера шаблон сохраняется — менять не нужно.
