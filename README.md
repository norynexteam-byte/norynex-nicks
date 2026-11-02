# norynex-nicks

Nickname-Dienst für den Norynex Client (Cloudflare Worker).

- `GET /nicks.txt` – Liste `MinecraftName=Nickname`
- `POST /set` – Nickname setzen (Prüfung über Minecraft-Login)

Jeder Push auf `main` wird automatisch auf Cloudflare deployt.
