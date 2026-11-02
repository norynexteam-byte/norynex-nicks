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

      if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) return text("Ungueltiger Name", 400);
      if (!/^[0-9a-f]{8,64}$/.test(serverId)) return text("Ungueltige serverId", 400);
      nick = nick.replace(/[\r\n=]/g, "").replace(/[&§]k/gi, ""); // kein Zeilenumbruch, kein "Zauber-Text"
      if (nick.length > MAX_NICK) return text("Nickname zu lang (max " + MAX_NICK + ")", 400);

      // Minecraft-Login pruefen (wie beim Betreten eines Servers)
      const check = await fetch(
        "https://sessionserver.mojang.com/session/minecraft/hasJoined?username=" +
          encodeURIComponent(username) + "&serverId=" + encodeURIComponent(serverId));
      if (check.status !== 200) return text("Minecraft-Login konnte nicht bestaetigt werden", 403);
      const profile = await check.json();
      const realName = profile.name;

      const all = (await env.NICKS.get("all", "json")) || {};
      if (nick === "") delete all[realName];
      else all[realName] = nick;
      await env.NICKS.put("all", JSON.stringify(all));
      ctx.waitUntil(caches.default.delete(new Request(url.origin + "/nicks.txt")));
      return text(nick === "" ? "Nickname entfernt" : "Gespeichert", 200);
    }

    return text("Norynex Nick-Dienst laeuft", 200);
  },
};

function text(s, status) {
  return new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}
