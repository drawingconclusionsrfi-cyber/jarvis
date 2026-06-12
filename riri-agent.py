#!/usr/bin/env python3
# ============================================================
#  RIRI PC AGENT — Ri Ri's hands on this computer
#  ------------------------------------------------------------
#  100% free. Pure Python standard library — nothing to install.
#  Listens ONLY on 127.0.0.1 (this machine), token-protected.
#
#  Run it with:  start-riri-agent.bat   (Windows)
#           or:  python3 riri-agent.py  (Mac/Linux)
#  Then paste the token it prints into Ri Ri's Settings.
# ============================================================
import json, os, sys, time, platform, secrets, subprocess, ctypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 7777
VERSION = "1.0"
START_TIME = time.time()
IS_WIN = (os.name == "nt")
HOME = os.path.expanduser("~")
TOKEN_FILE = os.path.join(HOME, ".riri-agent-token")

# ---- token: created once, reused forever ----
def load_token():
    try:
        with open(TOKEN_FILE, "r") as f:
            t = f.read().strip()
            if len(t) >= 8:
                return t
    except OSError:
        pass
    t = secrets.token_hex(8).upper()
    try:
        with open(TOKEN_FILE, "w") as f:
            f.write(t)
    except OSError:
        pass
    return t

TOKEN = load_token()

# ---- user folders Ri Ri may touch (kept inside your profile) ----
FOLDERS = {
    "downloads": os.path.join(HOME, "Downloads"),
    "documents": os.path.join(HOME, "Documents"),
    "desktop":   os.path.join(HOME, "Desktop"),
    "pictures":  os.path.join(HOME, "Pictures"),
    "music":     os.path.join(HOME, "Music"),
    "videos":    os.path.join(HOME, "Videos"),
}

# ---- friendly app names -> what to actually launch ----
APP_ALIASES = {
    "notepad": "notepad", "calculator": "calc", "calc": "calc",
    "paint": "mspaint", "wordpad": "write",
    "file explorer": "explorer", "explorer": "explorer",
    "task manager": "taskmgr", "command prompt": "cmd", "cmd": "cmd",
    "terminal": "wt" if IS_WIN else "x-terminal-emulator",
    "control panel": "control", "snipping tool": "snippingtool",
    "chrome": "chrome", "google chrome": "chrome",
    "edge": "msedge", "microsoft edge": "msedge", "firefox": "firefox",
    "word": "winword", "microsoft word": "winword",
    "excel": "excel", "powerpoint": "powerpnt", "outlook": "outlook",
    "clipstudiopaint": "CLIPStudioPaint", "clip studio": "CLIPStudioPaint",
    "photoshop": "photoshop", "illustrator": "illustrator",
    "blender": "blender", "krita": "krita", "gimp": "gimp",
    "obs": "obs64", "vlc": "vlc", "steam": "steam",
    "discord": "discord", "spotify": "spotify",
}

def log(msg):
    print(time.strftime("[%H:%M:%S] ") + msg, flush=True)

# ---- Start Menu shortcut search (Windows) ----
def start_menu_dirs():
    dirs = []
    pd = os.environ.get("ProgramData")
    ad = os.environ.get("APPDATA")
    if pd: dirs.append(os.path.join(pd, "Microsoft", "Windows", "Start Menu", "Programs"))
    if ad: dirs.append(os.path.join(ad, "Microsoft", "Windows", "Start Menu", "Programs"))
    return [d for d in dirs if os.path.isdir(d)]

def find_shortcut(name):
    """Find a Start Menu .lnk whose filename contains every word of `name`."""
    words = [w for w in name.lower().split() if w]
    best, best_len = None, 10**9
    for root_dir in start_menu_dirs():
        for root, _dirs, files in os.walk(root_dir):
            for f in files:
                if not f.lower().endswith(".lnk"):
                    continue
                base = f[:-4].lower()
                if all(w in base for w in words):
                    if len(base) < best_len:            # shortest = closest match
                        best, best_len = os.path.join(root, f), len(base)
    return best

def open_app(name):
    name = (name or "").strip()
    if not name:
        return False, "no app name given"
    key = name.lower().strip()
    target = APP_ALIASES.get(key)

    # 1) Start Menu shortcut (works for almost everything installed)
    if IS_WIN:
        lnk = find_shortcut(name) or (find_shortcut(target) if target else None)
        if lnk:
            os.startfile(lnk)
            return True, "Opened " + os.path.basename(lnk)[:-4]
    # 2) Known executable name
    exe = target or key.replace(" ", "")
    try:
        if IS_WIN:
            # 'start' resolves App Paths registry entries (chrome, winword, etc.)
            subprocess.Popen('start "" "{}"'.format(exe.replace('"', "")), shell=True)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-a", name])
        else:
            subprocess.Popen([exe])
        return True, "Launched " + name
    except Exception as e:
        return False, str(e)

# ---- file search inside the user folders ----
def find_files(query, limit=10):
    words = [w for w in (query or "").lower().split() if w]
    if not words:
        return []
    hits = []
    for label, folder in FOLDERS.items():
        if not os.path.isdir(folder):
            continue
        depth0 = folder.rstrip(os.sep).count(os.sep)
        for root, dirs, files in os.walk(folder):
            if root.count(os.sep) - depth0 >= 4:      # don't dig forever
                dirs[:] = []
                continue
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for f in files:
                fl = f.lower()
                if all(w in fl for w in words):
                    hits.append(os.path.join(root, f))
                    if len(hits) >= limit:
                        return hits
    return hits

def open_path_anything(p):
    if IS_WIN:
        os.startfile(p)
    elif sys.platform == "darwin":
        subprocess.Popen(["open", p])
    else:
        subprocess.Popen(["xdg-open", p])

# ---- system info (no psutil needed) ----
def sysinfo():
    info = {
        "host": platform.node(),
        "platform": platform.system() + " " + platform.release(),
        "cpus": os.cpu_count() or 1,
        "freeGB": 0, "memGB": 0,
        "upMin": int((time.time() - START_TIME) / 60),
    }
    try:
        if IS_WIN:
            class MEMSTAT(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                            ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                            ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
            m = MEMSTAT(); m.dwLength = ctypes.sizeof(MEMSTAT)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
            info["memGB"] = round(m.ullTotalPhys / 2**30, 1)
            info["freeGB"] = round(m.ullAvailPhys / 2**30, 1)
            info["upMin"] = int(ctypes.windll.kernel32.GetTickCount64() / 60000)
        else:
            pages = os.sysconf("SC_PHYS_PAGES"); psize = os.sysconf("SC_PAGE_SIZE")
            info["memGB"] = round(pages * psize / 2**30, 1)
            av = os.sysconf("SC_AVPHYS_PAGES")
            info["freeGB"] = round(av * psize / 2**30, 1)
    except Exception:
        pass
    return info

# ---- the actions Ri Ri can ask for ----
def run_action(action, arg):
    a = (action or "").strip()
    arg = (arg or "").strip()

    if a == "open-app":
        ok, did = open_app(arg)
        log(("OPENED app: " if ok else "FAILED app: ") + arg + " — " + did)
        return {"ok": ok, "did": did} if ok else {"ok": False, "err": did}

    if a == "open-path":
        folder = FOLDERS.get(arg.lower())
        if not folder or not os.path.isdir(folder):
            return {"ok": False, "err": "unknown folder " + arg}
        open_path_anything(folder)
        log("OPENED folder: " + folder)
        return {"ok": True, "did": "Opened " + arg}

    if a == "list-dir":
        folder = FOLDERS.get(arg.lower())
        if not folder or not os.path.isdir(folder):
            return {"ok": False, "err": "unknown folder " + arg}
        try:
            items = sorted(os.listdir(folder))[:50]
        except OSError as e:
            return {"ok": False, "err": str(e)}
        log("LISTED: " + folder)
        return {"ok": True, "items": items}

    if a == "find-file":
        hits = find_files(arg)
        log("SEARCHED files for '" + arg + "' — " + str(len(hits)) + " hit(s)")
        return {"ok": True, "hits": hits}

    if a == "open-file":
        hits = find_files(arg, limit=1)
        if not hits:
            return {"ok": False, "err": "no file matching '" + arg + "' in your user folders"}
        try:
            open_path_anything(hits[0])
        except Exception as e:
            return {"ok": False, "err": str(e)}
        log("OPENED file: " + hits[0])
        return {"ok": True, "did": "Opened " + os.path.basename(hits[0])}

    if a == "sysinfo":
        d = sysinfo(); d["ok"] = True
        return d

    return {"ok": False, "err": "unknown action " + a}

# ---- HTTP layer (CORS + preflight so the browser allows it) ----
class Handler(BaseHTTPRequestHandler):
    server_version = "RiriAgent/" + VERSION

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Riri-Token")
        self.send_header("Access-Control-Max-Age", "86400")
        # Chrome Private Network Access preflight
        if self.headers.get("Access-Control-Request-Private-Network"):
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/ping"):
            self._json(200, {"ok": True, "name": "riri-agent", "version": VERSION})
        else:
            self._json(404, {"ok": False, "err": "not found"})

    def do_POST(self):
        if not self.path.startswith("/run"):
            self._json(404, {"ok": False, "err": "not found"})
            return
        tok = (self.headers.get("X-Riri-Token") or "").strip()
        if not secrets.compare_digest(tok, TOKEN):
            log("REJECTED a request — wrong or missing token")
            self._json(403, {"ok": False, "err": "bad token — paste the token from this window into Ri Ri's Settings"})
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(n) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"ok": False, "err": "bad request body"})
            return
        try:
            self._json(200, run_action(data.get("action"), data.get("arg")))
        except Exception as e:
            self._json(200, {"ok": False, "err": str(e)})

    def log_message(self, *a):  # silence default noisy logging
        pass

def main():
    print("=" * 56)
    print("   RIRI PC AGENT  v" + VERSION + "   —   Ri Ri's hands on this PC")
    print("=" * 56)
    print()
    print("   YOUR TOKEN (paste into Ri Ri > Settings > PC Agent):")
    print()
    print("        " + TOKEN)
    print()
    print("   Listening on http://127.0.0.1:%d  (this PC only)" % PORT)
    print("   Keep this window open. Press Ctrl+C to stop.")
    print("-" * 56)
    try:
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nAgent stopped. Bye, Reni!")
    except OSError as e:
        print("\nCould not start: " + str(e))
        print("Is the agent already running in another window?")
        input("Press Enter to close...")

if __name__ == "__main__":
    main()
