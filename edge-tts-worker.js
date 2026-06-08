/* ============================================================
   Ri Ri — FREE Edge Neural TTS Worker  (Cloudflare Workers)
   ------------------------------------------------------------
   Turns Microsoft Edge's free neural voices into a simple
   POST endpoint Ri Ri can call. No API key. No cost.

   HOW TO DEPLOY (no coding tools needed):
   1. Go to https://dash.cloudflare.com  →  Workers & Pages
   2. Create  →  Create Worker  →  give it a name (e.g. "edge-tts")
   3. Click "Edit code", DELETE everything in the editor,
      PASTE this whole file, then click "Deploy".
   4. Copy the worker URL it gives you
      (looks like https://edge-tts.YOURNAME.workers.dev ).
   5. In Ri Ri → Settings → Voice → Edge Neural Voices,
      paste that URL, pick a voice, tap TEST EDGE VOICE.

   Ri Ri sends:  POST { "text": "...", "voice": "en-US-AriaNeural" }
   Worker returns: MP3 audio bytes.
   ============================================================ */

const TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=" + TRUSTED_TOKEN;
const CHROMIUM_VERSION = "130.0.2849.68";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    let text = "Hello.", voice = "en-US-AriaNeural", rate = "+0%", pitch = "+0Hz";
    try {
      if (request.method === "POST") {
        const b = await request.json();
        text  = (b.text  || text).toString().slice(0, 6000);
        voice = (b.voice || voice).toString();
        if (b.rate)  rate  = b.rate;
        if (b.pitch) pitch = b.pitch;
      } else {
        const u = new URL(request.url);
        text  = (u.searchParams.get("text")  || text).slice(0, 6000);
        voice = u.searchParams.get("voice") || voice;
      }
    } catch (e) {
      return json({ error: "bad request" }, 400);
    }

    try {
      const audio = await synthesize(text, voice, rate, pitch);
      return new Response(audio, {
        headers: { ...CORS, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" }
      });
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 502);
    }
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, "Content-Type": "application/json" } });
}

/* Microsoft requires a Sec-MS-GEC security token: SHA-256 of
   (Windows-filetime rounded to 5 min + trusted token), uppercased hex. */
async function secMsGec() {
  let ticks = Math.floor(Date.now() / 1000) + 11644473600; // unix -> windows epoch (seconds)
  ticks = ticks - (ticks % 300);                            // round down to 5 minutes
  ticks = ticks * 10000000;                                 // seconds -> 100ns intervals
  const str = ticks + TRUSTED_TOKEN;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function uuid() { return crypto.randomUUID().replace(/-/g, ""); }

async function synthesize(text, voice, rate, pitch) {
  const gec = await secMsGec();
  const url = WSS + "&Sec-MS-GEC=" + gec + "&Sec-MS-GEC-Version=1-" + CHROMIUM_VERSION + "&ConnectionId=" + uuid();

  const resp = await fetch(url, { headers: { "Upgrade": "websocket" } });
  const ws = resp.webSocket;
  if (!ws) throw new Error("no websocket (status " + resp.status + ")");
  ws.accept();

  return await new Promise((resolve, reject) => {
    const chunks = [];
    const fail = (m) => { try { ws.close(); } catch (e) {} reject(new Error(m)); };
    const timer = setTimeout(() => fail("timeout"), 20000);

    const reqId = uuid();
    const now = new Date().toString();

    // 1) audio output format config
    ws.send(
      "X-Timestamp:" + now + "\r\n" +
      "Content-Type:application/json; charset=utf-8\r\n" +
      "Path:speech.config\r\n\r\n" +
      '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}'
    );

    // 2) the text as SSML
    const ssml =
      "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
      "<voice name='" + voice + "'>" +
      "<prosody pitch='" + pitch + "' rate='" + rate + "' volume='+0%'>" +
      escapeXml(text) +
      "</prosody></voice></speak>";

    ws.send(
      "X-RequestId:" + reqId + "\r\n" +
      "Content-Type:application/ssml+xml\r\n" +
      "X-Timestamp:" + now + "\r\n" +
      "Path:ssml\r\n\r\n" +
      ssml
    );

    ws.addEventListener("message", async (ev) => {
      const data = ev.data;
      if (typeof data === "string") {
        if (data.includes("Path:turn.end")) {
          clearTimeout(timer);
          try { ws.close(); } catch (e) {}
          if (!chunks.length) return reject(new Error("no audio"));
          // concatenate audio chunks
          let total = 0; for (const c of chunks) total += c.length;
          const out = new Uint8Array(total);
          let off = 0; for (const c of chunks) { out.set(c, off); off += c.length; }
          resolve(out);
        }
      } else {
        // binary frame: [2-byte big-endian header length][header][audio]
        const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : await data.arrayBuffer());
        if (bytes.length < 2) return;
        const headerLen = (bytes[0] << 8) | bytes[1];
        const audio = bytes.slice(2 + headerLen);
        if (audio.length) chunks.push(audio);
      }
    });

    ws.addEventListener("close", () => { clearTimeout(timer); if (!chunks.length) reject(new Error("closed early")); });
    ws.addEventListener("error", () => fail("ws error"));
  });
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
