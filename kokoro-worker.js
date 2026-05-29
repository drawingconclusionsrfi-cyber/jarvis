/* kokoro-worker.js — runs Kokoro TTS entirely off the main thread.
   This file MUST live at the repository root next to index.html.
   Because it is served from your own origin (GitHub Pages), it can import
   the Kokoro library and run the AI model in the background without ever
   freezing the app's interface. */

let tts = null;

async function loadTTS() {
  const cdns = [
    'https://esm.sh/kokoro-js@1.2.1',
    'https://esm.sh/kokoro-js',
    'https://esm.run/kokoro-js'
  ];
  let lastErr = null;
  for (const url of cdns) {
    try {
      const mod = await import(url);
      const TTS = mod.KokoroTTS || (mod.default && mod.default.KokoroTTS) || mod.default;
      if (!TTS || typeof TTS.from_pretrained !== 'function') throw new Error('no export from ' + url);
      tts = await TTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => {
          if (p && typeof p.progress === 'number') {
            self.postMessage({ type: 'progress', progress: p.progress, file: (p.file || '') });
          }
        }
      });
      return true;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('all CDNs failed');
}

self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.type === 'load') {
    try {
      await loadTTS();
      self.postMessage({ type: 'loaded' });
    } catch (err) {
      self.postMessage({ type: 'loadError', error: String((err && err.message) || err) });
    }
  } else if (m.type === 'generate') {
    try {
      if (!tts) throw new Error('not loaded');
      const audio = await tts.generate(m.text, { voice: m.voice || 'af_bella' });
      const s = audio.audio || audio.data || audio;
      const rate = audio.sampling_rate || 24000;
      const f32 = (s instanceof Float32Array) ? s : new Float32Array(s);
      self.postMessage({ type: 'audio', samples: f32, rate: rate }, [f32.buffer]);
    } catch (err) {
      self.postMessage({ type: 'genError', error: String((err && err.message) || err) });
    }
  }
};
