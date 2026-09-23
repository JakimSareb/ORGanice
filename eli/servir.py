#!/usr/bin/env python3
"""Servidor local para ORG Mode para Eli (uso en el Mac, sin conexión a GitHub).

Uso:  python3 servir.py   ->  http://localhost:3000/ORGanice/

La app está compilada para vivir en /ORGanice/ (igual que en GitHub Pages), así que una
única compilación sirve para los dos sitios. Solo escucha en 127.0.0.1 (no es accesible
desde otros equipos de la red).
"""
import argparse, http.server, os, socketserver

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")
BASE = "/ORGanice"


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIST, **kw)

    def send_head(self):
        path = self.path.split("?", 1)[0]
        if path == "/" or path == BASE:
            self.send_response(302)
            self.send_header("Location", BASE + "/")
            self.end_headers()
            return None
        if not path.startswith(BASE + "/"):
            self.send_error(404)
            return None
        self.path = self.path[len(BASE):]
        fs_path = self.translate_path(self.path.split("?", 1)[0])
        if not os.path.exists(fs_path):
            self.path = "/index.html"  # rutas internas de la app (/files, /file/...)
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=3000)
    a = ap.parse_args()
    srv = Server(("127.0.0.1", a.port), SPAHandler)
    print(f"Sirviendo en http://localhost:{a.port}{BASE}/  (Ctrl+C para parar)")
    srv.serve_forever()


if __name__ == "__main__":
    main()
