#!/usr/bin/env python3
"""Validación por mutación: rompe el producto a propósito y comprueba que las pruebas lo detectan.

uso: mutaciones.py <spec.json> <salida.log>
spec: {"suite": "prueba:funcional",
       "mutaciones": [{"id": "M1", "descripcion": "...", "archivo": "src/x.ts",
                       "buscar": "texto exacto", "reemplazar": "texto nuevo", "todas": false}]}

Ejecuta `npm run <suite>` una vez por mutación, restaura src/ al terminar (y lo comprueba)
y escribe una línea por mutación: cuántas pruebas fallan y si fue DETECTADA.
No toques src/ mientras corre.
"""
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # parte-c-agendar-guia


def correr(suite: str):
    r = subprocess.run(["npm", "run", suite], cwd=RAIZ, capture_output=True, text=True)
    # El resumen cambia según el caso: «3 failed | 138 passed (141)», «141 passed (141)» o,
    # si fallan todas, «2 failed (2)» (sin «passed»).
    linea = next((l for l in (r.stdout + r.stderr).splitlines() if re.match(r"\s*Tests\s", l)), None)
    if linea is None:
        return None, None
    fallos = re.search(r"(\d+) failed", linea)
    total = re.search(r"\((\d+)\)", linea)
    return (int(fallos.group(1)) if fallos else 0), (int(total.group(1)) if total else None)


def main() -> None:
    # Mutations rewrite src/ in place: two runs at once corrupt each other's restore.
    lock = open(os.path.join(tempfile.gettempdir(), 'mutaciones-parte-c.lock'), 'w')
    fcntl.flock(lock, fcntl.LOCK_EX)
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    log = open(sys.argv[2], "w", encoding="utf-8")
    src = os.path.join(RAIZ, "src")
    respaldo = os.path.join(tempfile.mkdtemp(), "src")
    shutil.copytree(src, respaldo)

    def decir(texto: str) -> None:
        print(texto)
        log.write(texto + "\n")
        log.flush()

    base_f, base_t = correr(spec["suite"])
    decir(f"Suite: npm run {spec['suite']} · línea base sin mutar: {base_f} fallos de {base_t} pruebas")
    detectadas = 0
    try:
        for m in spec["mutaciones"]:
            ruta = os.path.join(RAIZ, m["archivo"])
            texto = open(ruta, encoding="utf-8").read()
            if m["buscar"] not in texto:
                decir(f"{m['id']} {m['descripcion']} → NO SE PUDO APLICAR (texto no encontrado en {m['archivo']})")
                continue
            nuevo = texto.replace(m["buscar"], m["reemplazar"]) if m.get("todas") else texto.replace(m["buscar"], m["reemplazar"], 1)
            open(ruta, "w", encoding="utf-8").write(nuevo)
            fallos, total = correr(spec["suite"])
            ok = bool(fallos)
            detectadas += ok
            decir(f"{m['id']} {m['descripcion']} → {fallos} pruebas fallan de {total} → {'DETECTADA' if ok else 'NO DETECTADA'}")
            shutil.rmtree(src)
            shutil.copytree(respaldo, src)
    finally:
        shutil.rmtree(src, ignore_errors=True)
        shutil.copytree(respaldo, src)
    identico = subprocess.run(["diff", "-r", src, respaldo], capture_output=True).returncode == 0
    decir(f"Resultado: {detectadas} de {len(spec['mutaciones'])} mutaciones detectadas · src/ restaurado idéntico: {'sí' if identico else 'NO'}")
    log.close()


if __name__ == "__main__":
    main()
