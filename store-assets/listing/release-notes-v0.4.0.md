# 0.4.0 Store update notes

## English

- Work and Life routes now run together with independent domain lists and device connections.
- Use Corporate VPN Router's local SOCKS5 for Work; use a separate SOCKS5/HTTP proxy or DIRECT for Life.
- See the current site's configured route, Chrome Proxy control and connection details. Create/rename
  routes, preview moves and explicitly resolve conflicting rules in Options.
- Existing rules migrate to Work without rewriting them. Chrome Sync is retained; backup v2 accepts
  v1 imports and saves a private local pre-upgrade recovery copy.
- Manual route checks report HTTPS/certificate limits honestly. Work's certificate warnings point
  to the Corporate VPN Router setup wizard. No certificate installation or HTTPS bypass is included.
- Permissions remain unchanged. No telemetry, backend or automatic rule creation.

## Русский

- Work и Life работают одновременно: у каждого свой список доменов и подключение на устройстве.
- Work поддерживает локальный SOCKS5 Corporate VPN Router; Life — отдельный SOCKS5/HTTP-прокси или DIRECT.
- Popup показывает настроенный маршрут сайта, подключение и управление Chrome Proxy. В Options можно
  создавать и переименовывать маршруты, переносить правила с предпросмотром и разрешать конфликты.
- Старые правила относятся к Work без перезаписи. Сохранён Chrome Sync, импорт резервных копий v1,
  добавлены формат v2 и локальная копия исходных настроек для восстановления.
- Ручная проверка явно сообщает об ограничениях HTTPS/TLS. При ошибках сертификата Work направляет
  к мастеру Corporate VPN Router. Установки сертификатов и обхода HTTPS нет.
- Разрешения прежние. Нет телеметрии, backend и автоматического добавления правил.
