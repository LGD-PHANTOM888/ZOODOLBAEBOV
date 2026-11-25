# XXXLGDXXX // Cyber Archive

Тёмный статический сайт: только холсты, вложенные фото/видео/текст, графы по разделам, поиск, комментарии с входом через Google и предложка.

## Правила публикации

Фильтров нет. Синхронизация берёт всё, что лежит в папке источника из `sync.config.json`, и публикует без исключений. Отдельные страницы делаются только для `.canvas`; `.md` и вложения показываются внутри холстов.

## Обновление

Двойной клик по `update-site.bat`:

1. читает папку источника;
2. копирует все файлы в `src/content/notes`, `public/media`, `src/data/manifest.json`;
3. собирает `dist/`;
4. коммитит и пушит, если настроен `origin`.

GitLab CI собирает уже закоммиченные файлы. Локальная папка источника в CI недоступна.

## Локальный запуск

Node.js 20+:

```bat
npm ci
npm run dev
```

`npm run dev` перед стартом делает синхронизацию. Ручная сборка: `npm run update`.

## GitLab

Создайте проект на https://gitlab.com и выполните в папке сайта:

```bat
git init
git remote add origin https://gitlab.com/ВАС_ИМЯ/ВАС_ПРОЕКТ.git
git add -A
git commit -m "initial archive"
git pull --rebase origin main
git push -u origin main
```

Дальше — только `update-site.bat`. `.gitlab-ci.yml` публикует `dist/` через GitLab Pages.

Лимиты GitLab Free: репозиторий 10 ГБ, Pages 1 ГБ. Если медиа превысит лимит, используйте внешнее хранилище.

## Что где находится

| Путь | Что это |
| --- | --- |
| `/` | главная: холсты, разделы, статистика |
| `/notes/` | все холсты по разделам |
| `/notes/<slug>/` | интерактивный холст |
| `/graph/` | граф связей между холстами |
| `/graph/folder/.../` | граф папки |
| `/predlozhka/` | форма предложки |
| `/search-index.json` | индекс поиска |

Проводник — кнопка в шапке или клавиша **E**. Поиск — **Ctrl+K**. Внутри узлов можно прокручивать содержимое и открывать его кнопкой `⤢` на весь экран.

## Холсты

- координаты, размеры, цвета и связи сохраняются;
- фото, видео, аудио, PDF и другие вложения открываются прямо на холсте;
- вложенные записи показываются целиком внутри узла;
- есть панорама, колесо масштаба и кнопка «ВМЕСТИТЬ».

Большие холсты по умолчанию вписываются целиком. Приближайте колесом или кнопкой `+`.

## Google-вход, комментарии и предложка

Создайте проект Firebase:

1. Включите **Authentication → Sign-in method → Google**.
2. Создайте **Firestore Database**.
3. В **Authentication → Settings → Authorized domains** добавьте `localhost`, `127.0.0.1`, домен GitLab Pages и свой домен, если есть.
4. Скопируйте Rules из `firestore.rules` в Firestore → Rules и опубликуйте.
5. Скопируйте `.env.example` в `.env` и заполните значения из **Project settings → Your apps → Web app**.

```bat
copy .env.example .env
```

Переменные:

```env
PUBLIC_FIREBASE_API_KEY=...
PUBLIC_FIREBASE_AUTH_DOMAIN=...
PUBLIC_FIREBASE_PROJECT_ID=...
PUBLIC_FIREBASE_APP_ID=...
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_MEASUREMENT_ID=
```

Для GitLab Pages добавьте те же имена в **Settings → CI/CD → Variables**. Значения попадают в клиентский бандл — это нормально; доступ к записи ограничен правилами Firestore.

Без конфигурации сайт работает без ошибок, но вход и формы неактивны.

## Настройки

`sync.config.json`:

```json
{
  "vault": "D:\\...\\Public",
  "siteTitle": "Зоопарк Долбоебов",
  "siteDescription": "Архив холстов"
}
```

Путь `vault` — папка, откуда берётся всё содержимое.
