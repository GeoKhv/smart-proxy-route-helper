# Smart Proxy Route Helper v0.3.1 Release Notes

## English

- Fixed an issue where users with many routing rules could hit Chrome Sync's per-item storage limit and become unable to add new sites.
- Routing rules are now stored internally in multiple Sync chunks.
- Existing rules migrate automatically without changing their content or order.
- Added a clear localized message if the overall Chrome Sync storage limit is reached.
- Fixed an issue where the extension popup could unexpectedly expand to a very wide window on some Chrome profiles.

## Русский

- Исправлена ошибка, из-за которой при большом количестве правил можно было упереться в лимит одного элемента Chrome Sync и больше не добавлять сайты.
- Правила теперь внутренне хранятся в нескольких Sync-чанках.
- Существующие правила мигрируют автоматически без изменения содержимого и порядка.
- Добавлено понятное локализованное сообщение при достижении общего лимита Chrome Sync.
- Исправлена ошибка, из-за которой на некоторых профилях Chrome окно расширения могло неожиданно растягиваться по ширине.
