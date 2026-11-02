# norynex-nicks

Nickname-Dienst für den Norynex Client (Cloudflare Worker).

- `GET /nicks.txt` – Liste `MinecraftName=Nickname`
- `POST /set` – Nickname setzen (Prüfung über Minecraft-Login)

Jeder Push auf `main` wird automatisch auf Cloudflare deployt.

## SMP Better Client Auto-Update
- `client/version.txt` – aktuelle Version
- `client/smp-better-client.jar` – aktuelle Mod-Datei (ab 3.0)
- `client/dev-client.jar` – gleiche Datei, fuer alte Versionen (bis 2.6), damit sie sich selbst aktualisieren

Der Client prüft beim Start diese Version und lädt Updates automatisch herunter (aktiv nach Neustart).
