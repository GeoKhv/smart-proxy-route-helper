# 0.4.2 Store update notes

## English

- Work, Life and additional named domain lists run simultaneously with device-specific SOCKS5/HTTP or DIRECT connections.
- Fixed independent offline Work / online Life changes that could finish syncing without activating the new rules. Cross-list edits now reconcile without dropping changed conflicting records; incomplete data reports an error and retains the previous PAC.
- Existing 0.3.2 rules migrate to Work. 0.3.2 shares Work and preserves protected Life data but cannot route Life. Use 0.4.2+ for named-route devices; upgrade 0.4.0/0.4.1 writers before editing. Same-list concurrent edits retain last-writer behavior.
- Popup shows configured routes and Chrome Proxy control. Manual checks explain HTTPS/certificate limits; no certificate installation or TLS bypass.
- Permissions unchanged: proxy, storage, activeTab, scripting. No telemetry, backend, remote code or automatic rule creation.

## Русский

- Work, Life и дополнительные именованные списки работают одновременно с локальными подключениями SOCKS5/HTTP или DIRECT.
- Исправлены независимые офлайн-изменения Work и онлайн-изменения Life: после доставки Sync новые правила теперь активируются. Переносы согласуются без удаления изменённых конфликтующих записей; при неполных данных показывается ошибка и сохраняется прежняя PAC.
- Правила 0.3.2 относятся к Work. Версия 0.3.2 обменивается Work и сохраняет защищённые данные Life, но не маршрутизирует Life. Для именованных маршрутов нужна 0.4.2+; обновите клиентов 0.4.0/0.4.1 до редактирования. Конкурентные правки одного списка сохраняют семантику последней записи.
- Popup показывает настроенные маршруты и управление Chrome Proxy. Ручная проверка объясняет ограничения HTTPS/TLS; установки сертификатов и обхода TLS нет.
- Разрешения прежние: proxy, storage, activeTab, scripting. Нет телеметрии, backend, удалённого кода и автоматического создания правил.
