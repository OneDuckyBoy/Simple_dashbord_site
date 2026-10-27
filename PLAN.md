# Простичък блог — план

Цел: малък едностраничен сайт за тестване на ai-automation интеграцията. Има
потребители (вкл. смяна на парола), публикации и коментари, и REST API за четене,
писане, редактиране и изтриване.

## Стек

| Слой | Технология | Защо |
|------|-----------|------|
| Frontend | React 18 + Vite + TypeScript | стандарт, бърз дев сървър |
| Backend | Express 4 + TypeScript | прост, познат |
| БД | SQLite (`node:sqlite` `DatabaseSync`) | вграден в Node 26 — **без native компилация** |
| Auth | JWT + bcryptjs | лек, bearer токен |

Няма отделен DB сървър и ORM — обикновени prepared statements в един файл.

## База — 3 таблици

```
users    (id, username UNIQUE, email UNIQUE, password_hash, role)
posts    (id, user_id → users, title, body, created_at, updated_at)
comments (id, post_id → posts, user_id → users, body, created_at)
```

`role` = `admin` | `user`. Админ може да редактира/трие всяка публикация и коментар;
обикновен потребител — само своите. Всички проверки за права са на **backend**,
не само в UI.

## Структура

```
Simple_site/
├─ package.json        # workspaces + npm run dev (concurrently)
├─ server/
│  ├─ src/
│  │  ├─ index.ts      # Express app, /api, /health, error handler
│  │  ├─ db.ts         # отваря SQLite, схема, индекси
│  │  ├─ auth.ts       # JWT: sign, requireAuth
│  │  ├─ seed.ts       # демо данни
│  │  └─ routes/
│  │     ├─ auth.ts        # register/login/me/change-password
│  │     ├─ posts.ts       # CRUD публикации
│  │     └─ comments.ts    # списък/добавяне/триене
│  └─ data/app.sqlite  # (gitignored, генерира се)
└─ client/
   ├─ vite.config.ts   # proxy /api → 3001 (без CORS проблеми)
   └─ src/
      ├─ api.ts        # fetch wrapper + token
      ├─ App.tsx       # state-view routing (без react-router)
      └─ styles.css
```

## API

Всичко под `http://localhost:3001/api`:

**Auth**
- `POST /auth/register` `{username,email,password}` → `{user,token}`
- `POST /auth/login` `{username,password}` → `{user,token}`
- `GET /auth/me` (Bearer)
- `POST /auth/change-password` `{currentPassword,newPassword}` (Bearer)

**Posts (за POST/PUT/DELETE: Bearer)**
- `GET /posts` — всички
- `GET /posts/:id` — една (+ `user_id`)
- `POST /posts` `{title,body}` — създай
- `PUT /posts/:id` `{title,body}` — редактирай (собственик/админ)
- `DELETE /posts/:id` — изтрий (собственик/админ)

**Comments (за POST/DELETE: Bearer)**
- `GET /comments/post/:postId`
- `POST /comments/post/:postId` `{body}`
- `DELETE /comments/:id` (собственик/админ)

Здравен endpoint: `GET /health` → `{ok:true}`.

## Демо акаунти (от `npm run seed`)

- `admin` / `admin123` (роля admin)
- `demo` / `demo123` (роля user)

## Как ще проверя

Backend — живо curl-тестване на целия поток (логин, list/get/create/update/delete,
коментари, смяна на парола грешна+вярна, 401 без токен, 403 не-собственик, 404).
Frontend — `tsc --noEmit` + `vite build`. Цялото — стартиране на `npm run dev` и проверка.

## Отворени въпроси / бъдеще

- Ролята `admin` е само поле — няма отделен админ панел за потребителите.
- Пароли: само hash в БД, без reset-by-email поток (достатъчно за тест).
- Портове фиксирани (3001 API, 5173 UI) — промяната е в `server/src/index.ts` /
  `client/vite.config.ts`.