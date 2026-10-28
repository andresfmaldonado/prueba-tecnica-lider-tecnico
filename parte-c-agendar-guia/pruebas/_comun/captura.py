#!/usr/bin/env python3
"""Convierte la salida REAL de un comando en una imagen tipo terminal (evidencia).

uso: captura.py <entrada.log | -> <salida.png> --titulo T --comando C [--cabeza N] [--cola M]

No inventa nada: muestra el texto del log tal cual (sin colores ANSI), con el comando,
la fecha de ejecución y el entorno. Con --cabeza/--cola recorta e indica cuántas líneas omite.
"""
import argparse
import datetime
import html
import os
import platform
import re
import subprocess
import sys
import tempfile

CHROME = os.environ.get("CHROME_BIN", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
MAX_COLS = 112


def clase(linea: str) -> str:
    if re.search(r"✗|×|\bFAIL\b|\bfailed\b|Error|ERROR|VULNERAB|HALLAZGO", linea):
        return "mal"
    if re.search(r"^\s*(RUN|Test Files|Tests|Duration|Start at)\b", linea):
        return "res"
    if re.search(r"✓|✔|\bpassed\b|\bPASS\b|\bOK\b", linea):
        return "ok"
    return ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("entrada")
    ap.add_argument("salida")
    ap.add_argument("--titulo", default="Terminal")
    ap.add_argument("--comando", default="")
    ap.add_argument("--cabeza", type=int, default=0)
    ap.add_argument("--cola", type=int, default=0)
    ap.add_argument("--ancho", type=int, default=1040)
    a = ap.parse_args()

    if a.entrada == "-":
        texto, cuando = sys.stdin.read(), datetime.datetime.now()
    else:
        texto = open(a.entrada, encoding="utf-8", errors="replace").read()
        cuando = datetime.datetime.fromtimestamp(os.path.getmtime(a.entrada))
    lineas = [ANSI.sub("", l).expandtabs(4).rstrip() for l in texto.splitlines()]
    while lineas and not lineas[0].strip():
        lineas.pop(0)
    while lineas and not lineas[-1].strip():
        lineas.pop()
    if a.cabeza and a.cola and len(lineas) > a.cabeza + a.cola:
        omitidas = len(lineas) - a.cabeza - a.cola
        lineas = lineas[: a.cabeza] + [f"… ({omitidas} líneas omitidas; el log completo está en resultados/) …"] + lineas[-a.cola:]
    lineas = [l if len(l) <= MAX_COLS else l[: MAX_COLS - 1] + "…" for l in lineas]

    try:
        node = subprocess.run(["node", "-v"], capture_output=True, text=True).stdout.strip()
    except OSError:
        node = "?"
    pie = f"Ejecutado el {cuando:%Y-%m-%d %H:%M:%S} · Node {node} · {platform.system()} {platform.machine()}"

    cuerpo = []
    if a.comando:
        cuerpo.append(f'<span class="cmd">$ {html.escape(a.comando)}</span>')
    for l in lineas:
        c = clase(l)
        cuerpo.append(f'<span class="{c}">{html.escape(l) or " "}</span>' if c else html.escape(l) or " ")
    n = len(cuerpo)
    doc = f"""<!doctype html><meta charset="utf-8"><style>
html,body{{margin:0;background:#fff}}
.v{{width:{a.ancho - 40}px;margin:20px;border-radius:10px;overflow:hidden;background:#0F172A;box-shadow:0 2px 8px rgba(0,0,0,.25)}}
.b{{background:#1E293B;color:#CBD5E1;font:13px 'Avenir Next','Helvetica Neue',Arial;padding:10px 14px;display:flex;align-items:center;gap:7px}}
.b i{{width:11px;height:11px;border-radius:50%;display:inline-block}}.b span{{margin-left:10px}}
pre{{margin:0;padding:14px 16px;color:#E2E8F0;font:14px/20px Menlo,'SF Mono',monospace;white-space:pre}}
.cmd{{color:#7DD3FC}}.ok{{color:#4ADE80}}.mal{{color:#F87171;font-weight:700}}.res{{color:#FBBF24}}
.p{{background:#1E293B;color:#94A3B8;font:12px 'Avenir Next','Helvetica Neue',Arial;padding:8px 14px}}
</style><div class="v"><div class="b"><i style="background:#F87171"></i><i style="background:#FBBF24"></i><i style="background:#4ADE80"></i><span>{html.escape(a.titulo)}</span></div>
<pre>{chr(10).join(cuerpo)}</pre><div class="p">{html.escape(pie)}</div></div>"""
    alto = 40 + 40 + n * 20 + 28 + 34
    with tempfile.TemporaryDirectory() as d:
        ruta = os.path.join(d, "c.html")
        open(ruta, "w", encoding="utf-8").write(doc)
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
             f"--window-size={a.ancho},{alto}", f"--screenshot={os.path.abspath(a.salida)}", f"file://{ruta}"],
            capture_output=True,
        )
    print(f"{a.salida} ({n} líneas)")


if __name__ == "__main__":
    main()
