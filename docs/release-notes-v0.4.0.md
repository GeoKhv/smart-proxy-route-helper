# Smart Proxy Route Helper 0.4.0

Work and Life can now route different domains simultaneously, using independent named lists and
connections. Work supports the local SOCKS5 endpoint from Corporate VPN Router. Life can use its
own SOCKS5/HTTP proxy or DIRECT alongside an external OS-level VPN. Additional routes can be
created and renamed in Options.

Popup shows the site's configured route, selected connection and actual Chrome Proxy control.
Options manages connections and independent rule lists, previews rule moves, resolves conflicts
explicitly and can reapply routing. Existing exact/parent/WWW precedence, direct exceptions,
Chrome Sync chunk storage, language preference and related-domain workflows are retained.

Upgrade maps existing untagged rules to Work without rewriting them and preserves a verified local
recovery copy before the first write. Backup v2 carries route names/IDs, excludes local connections
by default, imports v1/v2, and protects against stale previews, conflicts and lost independent
connections. Shared locks serialize concurrent extension-context writes.

Manual route checks restore normal PAC routing even on error. HTTP-only success does not verify
HTTPS. Chrome-exposed certificate/TLS codes show warnings; Work points to the Corporate VPN Router
setup wizard for corporate CA checks. Hidden network causes and unassigned proxy-error events are
explicitly inconclusive. No certificates are installed and HTTPS verification stays enabled.

Permissions are unchanged: `proxy`, `storage`, `activeTab`, `scripting`. No host permissions,
telemetry, backend, remote code, passive browsing observation or automatic rule creation were added.
DIRECT is not the OS HTTP proxy; it remains compatible with VPNs operating below Chrome.

See [named route behavior and migration](https://github.com/GeoKhv/smart-proxy-route-helper/blob/main/docs/named-routes.md)
and the release record for verification and limits. Chrome Web Store update materials are prepared;
this GitHub Release does not claim Store submission or publication. GitHub Actions were deliberately
not run for this release.
