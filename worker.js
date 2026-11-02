// Norynex Client - Nickname-Dienst (Cloudflare Worker)
// GET  /nicks.txt  -> Liste "Name=Nick" pro Zeile (fuer die Mod)
// POST /set        -> {"username","serverId","nick"}; prueft ueber Mojang, dass du wirklich du bist

const MAX_NICK = 40;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/nicks.txt")) {
      const cache = caches.default;
      const cacheKey = new Request(url.origin + "/nicks.txt");
      let res = await cache.match(cacheKey);
      if (res) return res;
      const all = (await env.NICKS.get("all", "json")) || {};
      const body = Object.entries(all).map(([name, nick]) => `${name}=${nick}`).join("\n") + "\n";
      res = new Response(body, {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=30" },
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }

    if (request.method === "POST" && url.pathname === "/set") {
      let data;
      try { data = await request.json(); } catch { return text("Ungueltige Anfrage", 400); }
      const username = String(data.username || "");
      const serverId = String(data.serverId || "");
      let nick = String(data.nick ?? "").trim();
      const secret = String(data.secret || "");
      if (!/^[0-9a-f]{32,128}$/.test(secret)) return text("Ungueltiger Schluessel - Mod aktualisieren", 400);
      const secretHash = await sha256(secret);

      if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) return text("Ungueltiger Name", 400);
      if (!/^[0-9a-f]{8,64}$/.test(serverId)) return text("Ungueltige serverId", 400);
      nick = nick.replace(/[\r\n=]/g, "").replace(/[&§]k/gi, ""); // kein Zeilenumbruch, kein "Zauber-Text"
      if (nick.length > MAX_NICK) return text("Nickname zu lang (max " + MAX_NICK + ")", 400);

      // Minecraft-Login pruefen (wie beim Betreten eines Servers). Mojang braucht manchmal kurz,
      // deshalb bis zu 5 Versuche.
      const checkUrl = "https://sessionserver.mojang.com/session/minecraft/hasJoined?username=" +
        encodeURIComponent(username) + "&serverId=" + encodeURIComponent(serverId);
      let profile = null, lastStatus = 0;
      for (let i = 0; i < 5 && !profile; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 700));
        try {
          const check = await fetch(checkUrl, { headers: { "user-agent": "DevClient-NickService/1.0" } });
          lastStatus = check.status;
          if (check.status === 200) {
            const p = await check.json();
            if (p && p.name) profile = p;
          }
        } catch (e) { lastStatus = -1; }
      }
      // Mojang blockiert Cloudflare oft (403). Dann gilt: Wer einen Namen zuerst beansprucht,
      // bekommt einen Schluessel; danach darf nur noch dieser Schluessel den Nick aendern.
      const owners = (await env.NICKS.get("owners", "json")) || {};
      let realName;
      if (profile) {
        realName = profile.name;                       // echt bestaetigt -> Besitz uebernehmen
      } else {
        const owner = owners[username.toLowerCase()];
        if (owner && owner !== secretHash) return text("Dieser Name gehoert schon einem anderen PC", 403);
        realName = username;
      }
      owners[realName.toLowerCase()] = secretHash;
      await env.NICKS.put("owners", JSON.stringify(owners));

      const all = (await env.NICKS.get("all", "json")) || {};
      for (const k of Object.keys(all)) if (k.toLowerCase() === realName.toLowerCase()) delete all[k];
      if (nick === "") delete all[realName];
      else all[realName] = nick;
      await env.NICKS.put("all", JSON.stringify(all));
      ctx.waitUntil(caches.default.delete(new Request(url.origin + "/nicks.txt")));
      return text(nick === "" ? "Nickname entfernt" : "Gespeichert", 200);
    }

    // ---------- Online-Liste ----------
    if (url.pathname === "/ping" || url.pathname === "/online") {
      const stub = env.PRESENCE.get(env.PRESENCE.idFromName("global"));
      if (request.method === "POST" && url.pathname === "/ping") {
        let data;
        try { data = await request.json(); } catch { return text("Ungueltige Anfrage", 400); }
        const username = String(data.username || "");
        const secret = String(data.secret || "");
        const server = String(data.server || "").slice(0, 60).replace(/[\r\n|]/g, "");
        if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) return text("Ungueltiger Name", 400);
        if (!/^[0-9a-f]{32,128}$/.test(secret)) return text("Ungueltiger Schluessel", 400);
        const owners = (await env.NICKS.get("owners", "json")) || {};
        const owner = owners[username.toLowerCase()];
        if (owner && owner !== (await sha256(secret))) return text("Name gehoert einem anderen PC", 403);
        return stub.fetch("https://do/ping", { method: "POST", body: JSON.stringify({ username, server }) });
      }
      return stub.fetch("https://do/online");
    }

    return text("Norynex Nick-Dienst laeuft", 200);
  },
};

async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function text(s, status) {
  return new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

// Merkt sich im Arbeitsspeicher, wer in den letzten 2,5 Minuten "gepingt" hat (keine Speicher-Schreibvorgaenge).
export class Presence {
  constructor(state, env) { this.users = new Map(); }
  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    for (const [k, v] of this.users) if (now - v.t > 150000) this.users.delete(k);
    if (url.pathname === "/ping") {
      const { username, server } = await request.json();
      this.users.set(username.toLowerCase(), { name: username, server, t: now });
      return new Response("ok");
    }
    const lines = [...this.users.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => `${u.name}|${u.server}|${Math.round((now - u.t) / 1000)}`);
    return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
