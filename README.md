# Зоопарк Долбоебов

Статический сайт: только интерактивные холсты. Записи и вложения показываются внутри узлов холста, отдельная страница есть только у холста.

## Что публикуется

Фильтров нет. Синхронизация берёт всё из папки источника в `sync.config.json` и публикует без исключений. Из `.canvas` делается холст, из `.md` — содержимое узла, все остальные файлы становятся вложениями.

Навигация — дерево папок: корень → папки → холсты. Отдельного списка «Разделы» нет.

## Обновление в один клик

Двойной клик по `Обновить сайт.bat` в папке источника (`D:\ЗООПАРК\ЗООПАРК\ЗООПАРК ДОЛБОЕБОВ\Public`) или по `update-site.bat` в папке сайта:

1. читает всю папку источника;
2. копирует вложения в `public/media`, получает холсты и записи в `src/content/notes`, пишет `src/data/manifest.json`;
3. собирает `dist/`;
4. коммитит изменения и пушит в `origin`, если remote настроен.

Локальная папка источника в CI недоступна: GitHub Pages собирает уже закоммиченные файлы.

## Публикация в GitHub Pages

1. Создайте публичный репозиторий на https://github.com/new.
2. В папке сайта выполните:

```bat
git init
git remote add origin https://github.com/ВАС_ИМЯ/ВАС_РЕПОЗИТОРИЙ.git
git add -A
git commit -m "initial"
git pull --rebase origin main
git push -u origin main
```

3. В репозитории: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
4. Дальше при каждом пуше workflow `.github/workflows/pages.yml` сам собирает и публикует сайт. Ссылка: `https://ВАС_ИМЯ.github.io/ВАС_РЕПОЗИТОРИЙ/`.

`astro.config.mjs` сам определяет `site` и `base` из `GITHUB_REPOSITORY`. Для собственного домена задайте переменные `SITE_URL` и `SITE_BASE` в **Settings → Secrets and variables → Actions → Variables**.

Для GitLab Pages параллельно работает `.gitlab-ci.yml`.

## Локальный запуск

Node.js 20+:

```bat
npm ci
npm run dev
```

`npm run dev` перед стартом делает синхронизацию. Ручная сборка: `npm run update`.

## Страницы

| Путь | Что это |
| --- | --- |
| `/` | корень: холсты, дерево, статистика |
| `/canvases/` | все холсты в виде дерева папок |
| `/canvases/<slug>/` | интерактивный холст |
| `/graph/` | граф связей между холстами |
| `/graph/folder/.../` | граф папки |
| `/search-index.json` | индекс поиска |

Предложка работает через Telegram-бота [@Predlozkadegeneratos_bot](https://t.me/Predlozkadegeneratos_bot). Ссылка есть в верхней панели, в проводнике и на главной.

Проводник — кнопка в шапке или клавиша **E**. Поиск — **Ctrl+K**. Внутри узлов можно прокручивать содержимое и разворачивать его кнопкой `⤢`.

## Холсты

- координаты, размеры, цвета и связи сохраняются;
- фото, видео, аудио, PDF и другие вложения открываются прямо на холсте;
- вложенные записи показываются целиком внутри узла;
- есть панорама, колесо масштаба и кнопка «ВМЕСТИТЬ».

Большие холсты по умолчанию вписываются целиком. Приближайте колесом или кнопкой `+`.

## Google-вход и комментарии

1. Создайте проект Firebase.
2. Включите **Authentication → Sign-in method → Google**.
3. Создайте **Firestore Database**.
4. В **Authentication → Settings → Authorized domains** добавьте `localhost`, `127.0.0.1`, домен GitHub Pages и свой домен, если есть.
5. Скопируйте правила из `firestore.rules` в **Firestore → Rules** и опубликуйте.
6. Скопируйте `.env.example` в `.env` и заполните значения из **Project settings → Your apps → Web app**:

```bat
copy .env.example .env
```

```env
PUBLIC_FIREBASE_API_KEY=...
PUBLIC_FIREBASE_AUTH_DOMAIN=...
PUBLIC_FIREBASE_PROJECT_ID=...
PUBLIC_FIREBASE_APP_ID=...
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_MEASUREMENT_ID=
```

Для GitHub Pages добавьте те же имена в **Settings → Secrets and variables → Actions → Secrets**. Значения попадают в клиентский бандл — это нормально, доступ к записи ограничен правилами Firestore.

Без конфигурации сайт работает без ошибок, но вход и комментарии неактивны. Предложка при этом работает через Telegram-бота.

## Настройки

`sync.config.json`:

```json
{
  "vault": "D:\\ЗООПАРК\\ЗООПАРК\\ЗООПАРК ДОЛБОЕБОВ\\Public",
  "siteTitle": "Зоопарк Долбоебов",
  "siteDescription": "Холсты и связи"
}
```
