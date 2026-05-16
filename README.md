# Roboto4ka

> Десктоп-приложение для офисных задач: поиск по базам, проверка текста, конвертация файлов, обработка фото и видео.

Создано на **PySide6**. Тёмная тема, фиолетово-синие градиенты, оверлей загрузки со спиннером.

## Возможности

- **Поиск по базам** — Excel, CSV, Word. Ищет по ФИО (без учёта регистра, ё/е) и по телефону (любой формат). Массовый поиск списком, экспорт в Excel.
- **Проверка текста** — счётчик символов/слов/строк, чистка пробелов, орфография через Яндекс.Спеллер.
- **Конвертер файлов** — PDF, DOCX, JPG, PNG, MP3, MP4, ZIP, RAR и десятки других форматов через [ConvertHub API](https://converthub.com/api).
- **Редактор фото и видео** — сжатие, обрезка, фильтры через [Cloudinary](https://cloudinary.com).

## Установка

```bash
pip install -r requirements.txt
```

Скопируй `config.example.json` в `config.json` и впиши свои API-ключи:

```json
{
  "converthub_token": "...",
  "cloudinary_cloud_name": "...",
  "cloudinary_api_key": "...",
  "cloudinary_api_secret": "..."
}
```

## Запуск

```bash
python Roboto4ka.py
```

## Сборка в .exe

```bash
pip install pyinstaller
pyinstaller --onefile --noconsole --clean --name "Roboto4ka" Roboto4ka.py
```

После сборки положи рядом с `Roboto4ka.exe` свой `config.json` и файл базы (`backup.csv` или `all_users.xlsx`).

## Структура

```
Roboto4ka.py            запуск
config.example.json     шаблон конфига
roboto4ka/
  app.py                главное окно, сайдбар, навигация
  theme.py              QSS-стили, палитра
  widgets.py            оверлей загрузки, спиннер
  utils.py              конфиг, нормализация ФИО и телефонов
  db.py                 загрузка xlsx/csv/docx, индексация, поиск
  page_home.py          главная с тремя картами
  page_search.py        поиск по базе
  page_text.py          проверка текста
  page_convert.py       ConvertHub API
  page_media.py         Cloudinary
```

## Лицензия

MIT  ·  Create by Nikita
