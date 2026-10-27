# Простичък блог

Малък едностраничен сайт (blog + users) за тестване на ai-automation интеграцията.
Има четиво, писане, редактиране, изтриване, потребители със смяна на парола, и
REST API за всичко.

- **Frontend:** React 18 + Vite + TypeScript — `http://localhost:5173`
- **Backend:** Express 4 + TypeScript — `http://localhost:3001`
- **База:** SQLite (вграден `node:sqlite` в Node 26) — един файл, без DB сървър

---

## Бърз старт

Изисква се Node **22+** (тествано на Node 26).

```bash
# 1. Инсталация (веднъж, от корена — workspaces покрива и server/, и client/)
npm install

# 2. Демо данни (потребители + публикации)
npm run seed

# 3. Стартирай всичко (API + frontend заедно)
npm run dev
```

Отвори **http://localhost:5173**.

> Ако `npm run dev` ти е пречка (нужен е `concurrently`), можеш да пуснеш двете
> поотделно в два терминала: `cd server && npm run dev` и `cd client && npm run dev`.

## Демо акаунти

| Потребител | Парола  | Роля  |
|-----------|---------|-------|
| `admin`   | `admin123` | admin (редактира/трие всичко) |
| `demo`    | `demo123`  | user (само своите) |

Можеш и да се регистрираш от UI-то („Регистрация“).

---

## Какво има в UI-то

- **Начало** — списък с публикации; „Чети“ отваря една.
- **Вход / Регистрация** — създаване и влизане в акаунт.
- **+ Нова публикация** — създаване на пост.
- **Редактирай / Изтрий** — на своя публикация (или всяка, ако си админ).
- **Коментари** — добавяне и триене под всяка публикация.
- **🔑 Смяна на парола** — от менюто горе; иска текущата + новата (4+ знака).

---

## API

Бейз URL: `http://localhost:3001/api`. Публикуващите (POST/PUT/DELETE) endpoints
изискват заглавка `Authorization: Bearer <token>` (освен register/login).

### Auth
| Метод | Път | Тяло | Отговор |
|------|-----|------|---------|
| POST | `/auth/register` | `{username,email,password}` | `{user,token}` |
| POST | `/auth/login` | `{username,password}` | `{user,token}` |
| GET  | `/auth/me` | — | `{user}` |
| POST | `/auth/change-password` | `{currentPassword,newPassword}` | `{ok:true}` |

### Posts
| Метод | Път | Тяло | Бележка |
|------|-----|------|---------|
| GET  | `/posts` | — | всички |
| GET  | `/posts/:id` | — | една (+ `user_id`) |
| POST | `/posts` | `{title,body}` | създай |
| PUT  | `/posts/:id` | `{title,body}` | собственик/админ |
| DELETE | `/posts/:id` | — | собственик/админ |

### Comments
| Метод | Път | Тяло | Бележка |
|------|-----|------|---------|
| GET  | `/comments/post/:postId` | — | списък |
| POST | `/comments/post/:postId` | `{body}` | добави |
| DELETE | `/comments/:id` | — | собственик/админ |

Здравен check: `GET /health` → `{ok:true}`.

### Пример (curl)

```bash
# логин
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

# списък публикации
curl -s http://localhost:3001/api/posts

# създай публикация
curl -s -X POST http://localhost:3001/api/posts \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"От API","body":"Създадена през curl"}'

# смяна на парола
curl -s -X POST http://localhost:3001/api/auth/change-password \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"demo123","newPassword":"новапарола"}'
```

---

## Команди

| Команда | Какво прави |
|---------|-------------|
| `npm run dev` | API (3001) + frontend (5173) заедно |
| `npm run seed` | създава/обновява демо данни |
| `npm run build` | компилира server (`dist/`) + клиент (`dist/`) |
| `npm run start` | пуска само компилирания API |
| `cd server && npm run typecheck` | TS проверка на backend |
| `cd client && npm run typecheck` | TS проверка на frontend |

## База

SQLite файл: `server/data/app.sqlite` (gitignored; `npm run seed` го създава).
Три таблици: `users`, `posts`, `comments` (foreign keys + индекси). Схемата се
създава автоматично при старт на сървъра.

За изчистване: спри сървъра, изтрий файла и пре-seed-ни:

```bash
rm -f server/data/app.sqlite*
npm run seed
```

## Структура

```
Simple_site/
├─ PLAN.md                 # план
├─ docs/
│  └─ architecture.html    # диаграма (отвори в браузър)
├─ server/                 # Express + TS + node:sqlite
│  └─ src/
│     ├─ index.ts  db.ts  auth.ts  seed.ts
│     └─ routes/  auth.ts  posts.ts  comments.ts
└─ client/                 # Vite + React + TS
   └─ src/
      ├─ api.ts  App.tsx  styles.css  main.tsx
```

Довърши / гръбнакът за интеграциите: `server/src/routes/*` (API) и
`client/src/api.ts` (който frontend-ът ползва).