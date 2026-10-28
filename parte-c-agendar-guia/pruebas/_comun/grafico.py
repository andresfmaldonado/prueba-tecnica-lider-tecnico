#!/usr/bin/env python3
"""Gráficos de resultados (barras o líneas) a PNG, con el mismo estilo del informe.

uso: grafico.py spec.json salida.png
spec: {"tipo": "barras"|"lineas", "titulo": "...", "subtitulo": "...", "x": ["a","b"],
       "series": [{"nombre": "n", "valores": [1,2]}], "eje_y": "req/s", "eje_x": "concurrencia",
       "log_y": false, "etiquetas": true}
Los valores son los medidos: este script solo los dibuja.
"""
import html
import json
import math
import os
import subprocess
import sys
import tempfile

CHROME = os.environ.get("CHROME_BIN", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
PALETA = ["#0F766E", "#4C9BF5", "#E8710A", "#7C3AED", "#DB2777", "#65A30D"]
W, H = 1200, 640
ML, MR, MT, MB = 96, 30, 96, 120


def bonito(v: float) -> str:
    if v >= 100 or v == int(v):
        return f"{v:,.0f}".replace(",", " ")
    return f"{v:.1f}" if v >= 1 else f"{v:.2f}"


def pasos(maximo: float) -> list[float]:
    if maximo <= 0:
        return [0, 1]
    base = 10 ** math.floor(math.log10(maximo / 5))
    paso = next(m * base for m in (1, 2, 5, 10) if maximo / (m * base) <= 6)
    return [i * paso for i in range(int(maximo / paso) + 2)]


def main() -> None:
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    xs, series = spec["x"], spec["series"]
    logy = spec.get("log_y", False)
    todos = [v for s in series for v in s["valores"] if v is not None]
    if logy:
        minimo = 10 ** math.floor(math.log10(max(min(v for v in todos if v > 0), 1e-9)))
        tope = 10 ** math.ceil(math.log10(max(todos)))
        marcas = [10 ** k for k in range(int(math.log10(minimo)), int(math.log10(tope)) + 1)]
        ymap = lambda v: (math.log10(max(v, minimo)) - math.log10(minimo)) / (math.log10(tope) - math.log10(minimo))
    else:
        marcas = pasos(max(todos))
        tope = marcas[-1]
        ymap = lambda v: v / tope
    ph, pw = H - MT - MB, W - ML - MR
    y = lambda v: MT + ph * (1 - ymap(v))
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="Avenir Next,Helvetica Neue,Arial,sans-serif">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{ML}" y="40" font-size="26" font-weight="700" fill="#0F172A">{html.escape(spec["titulo"])}</text>',
         f'<text x="{ML}" y="66" font-size="16" fill="#64748B">{html.escape(spec.get("subtitulo", ""))}</text>']
    for m in marcas:
        o.append(f'<line x1="{ML}" x2="{W - MR}" y1="{y(m):.1f}" y2="{y(m):.1f}" stroke="#E2E8F0"/>')
        o.append(f'<text x="{ML - 10}" y="{y(m) + 5:.1f}" font-size="14" fill="#64748B" text-anchor="end">{bonito(m)}</text>')
    o.append(f'<text x="24" y="{MT + ph / 2}" font-size="15" fill="#334155" transform="rotate(-90 24 {MT + ph / 2})" text-anchor="middle">{html.escape(spec.get("eje_y", ""))}</text>')
    o.append(f'<text x="{ML + pw / 2}" y="{H - 14}" font-size="15" fill="#334155" text-anchor="middle">{html.escape(spec.get("eje_x", ""))}</text>')
    n, k = len(xs), len(series)
    banda = pw / n
    base_y = y(minimo) if logy else y(0)
    for i, lab in enumerate(xs):
        cx = ML + banda * (i + 0.5)
        o.append(f'<text x="{cx:.1f}" y="{base_y + 24:.1f}" font-size="14" fill="#334155" text-anchor="middle">{html.escape(str(lab))}</text>')
    if spec["tipo"] == "barras":
        ancho = min(70, banda * 0.8 / k)
        for j, s in enumerate(series):
            for i, v in enumerate(s["valores"]):
                if v is None:
                    continue
                x0 = ML + banda * (i + 0.5) - ancho * k / 2 + ancho * j
                o.append(f'<rect x="{x0:.1f}" y="{y(v):.1f}" width="{ancho - 3:.1f}" height="{base_y - y(v):.1f}" rx="3" fill="{PALETA[j % 6]}"/>')
                if spec.get("etiquetas", True):
                    o.append(f'<text x="{x0 + (ancho - 3) / 2:.1f}" y="{y(v) - 6:.1f}" font-size="13" fill="#0F172A" text-anchor="middle">{bonito(v)}</text>')
    else:
        for j, s in enumerate(series):
            pts = [(ML + banda * (i + 0.5), y(v)) for i, v in enumerate(s["valores"]) if v is not None]
            o.append(f'<polyline points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}" fill="none" stroke="{PALETA[j % 6]}" stroke-width="3"/>')
            for (a, b), v in zip(pts, [v for v in s["valores"] if v is not None]):
                o.append(f'<circle cx="{a:.1f}" cy="{b:.1f}" r="5" fill="{PALETA[j % 6]}"/>')
                if spec.get("etiquetas", True):
                    o.append(f'<text x="{a:.1f}" y="{b - 10:.1f}" font-size="13" fill="#0F172A" text-anchor="middle">{bonito(v)}</text>')
    lx = ML
    for j, s in enumerate(series):
        o.append(f'<rect x="{lx}" y="{H - 62}" width="16" height="16" rx="3" fill="{PALETA[j % 6]}"/>')
        o.append(f'<text x="{lx + 24}" y="{H - 49}" font-size="15" fill="#334155">{html.escape(s["nombre"])}</text>')
        lx += 40 + 9 * len(s["nombre"])
    o.append("</svg>")
    with tempfile.TemporaryDirectory() as d:
        ruta = os.path.join(d, "g.html")
        open(ruta, "w", encoding="utf-8").write("<!doctype html><meta charset='utf-8'><style>html,body{margin:0}svg{display:block}</style>" + "\n".join(o))
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                        f"--window-size={W},{H}", f"--screenshot={os.path.abspath(sys.argv[2])}", f"file://{ruta}"], capture_output=True)
    print(sys.argv[2])


if __name__ == "__main__":
    main()
