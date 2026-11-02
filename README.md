# norynex-nicks

Nickname-Dienst für den Norynex Client (Cloudflare Worker).

- `GET /nicks.txt` – Liste `MinecraftName=Nickname`
- `POST /set` – Nickname setzen (Prüfung über Minecraft-Login)

Jeder Push auf `main` wird automatisch auf Cloudflare deployt.

## Dev Client Auto-Update
- `client/version.txt` – aktuelle Version
- `client/dev-client.jar` – aktuelle Mod-Datei

Der Client prüft beim Start diese Version und lädt Updates automatisch herunter (aktiv nach Neustart).
