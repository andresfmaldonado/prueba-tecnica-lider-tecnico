#!/usr/bin/env python3
"""Escáner de secretos propio (sin dependencias externas).

uso: escaner-secretos.py [--raiz RUTA] [--salida ARCHIVO.json]

Recorre el repositorio excluyendo node_modules, .git y pruebas/*/resultados.
Patrones: claves Stripe en vivo, claves AWS (AKIA), claves privadas PEM,
asignaciones de secretos en texto y archivos .env*.
Cada coincidencia se reporta con archivo y línea; el valor se muestra enmascarado.
La coincidencia de la clave ficticia de parte-b-code-review se clasifica como
falso positivo documentado y no cuenta como hallazgo.
"""
import argparse
import json
import os
import re
import sys

RAIZ_POR_DEFECTO = os.environ.get(
    "REPO_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
)
EXCLUIR = {"node_modules", ".git"}
LIMITE_BYTES = 5 * 1024 * 1024

# Clave ficticia del enunciado de la prueba (parte-b-code-review). Se compone por concatenación
# para que este propio archivo no genere la coincidencia que pretende clasificar.
FALSO_POSITIVO_FICTICIO = "sk_live_" + "9f8a7b6c5d4e3f2a1b"
CARPETA_FALSO_POSITIVO = "parte-b-code-review"

PATRONES = [
    ("clave_stripe_live", re.compile(r"sk_live_[0-9a-zA-Z]{10,}")),
    ("clave_aws_akia", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("clave_privada_pem", re.compile(r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    (
        "asignacion_secreta",
        re.compile(r"""(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*['"][^'"]{8,}""", re.IGNORECASE),
    ),
]


def enmascarar(valor: str) -> str:
    return valor[:4] + "***" if len(valor) > 4 else "***"


def excluido(rel_dir: str, nombre: str) -> bool:
    if nombre in EXCLUIR:
        return True
    # pruebas/<tipo>/resultados, a cualquier profundidad (el repo raíz contiene parte-c-agendar-guia/pruebas/...).
    partes = os.path.normpath(os.path.join(rel_dir, nombre)).split(os.sep)
    return len(partes) >= 3 and partes[-3] == "pruebas" and partes[-1] == "resultados"


def escanear(raiz: str) -> dict:
    hallazgos, falsos, archivos, omitidos = [], [], 0, []
    for dp, dns, fns in os.walk(raiz):
        rel_dir = os.path.relpath(dp, raiz)
        dns[:] = [d for d in dns if not excluido(rel_dir, d)]
        for nombre in fns:
            ruta = os.path.join(dp, nombre)
            rel = os.path.normpath(os.path.join(rel_dir, nombre))
            if os.path.islink(ruta):
                continue
            # .env.example is a documented template: its content is still scanned for secrets.
            if nombre.startswith(".env") and nombre != ".env.example":
                hallazgos.append({"archivo": rel, "linea": 0, "patron": "archivo_env", "valor": nombre})
            try:
                if os.path.getsize(ruta) > LIMITE_BYTES:
                    omitidos.append(rel)
                    continue
                with open(ruta, "rb") as f:
                    datos = f.read()
            except OSError:
                omitidos.append(rel)
                continue
            if b"\x00" in datos[:8000]:
                continue  # binario
            archivos += 1
            texto = datos.decode("utf-8", errors="replace")
            for num, linea in enumerate(texto.splitlines(), start=1):
                for nombre_patron, rx in PATRONES:
                    for m in rx.finditer(linea):
                        valor = m.group(0)
                        reg = {"archivo": rel, "linea": num, "patron": nombre_patron, "valor": enmascarar(valor)}
                        # La misma clave ficticia aparece también bajo el patrón genérico (PROVIDER_TOKEN = '...').
                        if FALSO_POSITIVO_FICTICIO in valor and rel.startswith(CARPETA_FALSO_POSITIVO + os.sep):
                            falsos.append(reg | {"clasificacion": "falso positivo documentado"})
                        else:
                            hallazgos.append(reg)
    return {
        "raiz": raiz,
        "archivos_escaneados": archivos,
        "omitidos": omitidos,
        "hallazgos": hallazgos,
        "falsos_positivos_documentados": falsos,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raiz", default=RAIZ_POR_DEFECTO)
    ap.add_argument("--salida")
    a = ap.parse_args()
    resultado = escanear(os.path.abspath(a.raiz))
    print(f"Raíz escaneada: {resultado['raiz']}")
    print(f"Archivos de texto escaneados: {resultado['archivos_escaneados']}")
    print(f"Omitidos (tamaño o lectura): {len(resultado['omitidos'])}")
    for h in resultado["hallazgos"]:
        print(f"HALLAZGO {h['archivo']}:{h['linea']} [{h['patron']}] {h['valor']}")
    for f in resultado["falsos_positivos_documentados"]:
        print(f"FALSO POSITIVO DOCUMENTADO {f['archivo']}:{f['linea']} [{f['patron']}] {f['valor']}")
    print(f"Total hallazgos: {len(resultado['hallazgos'])} · falsos positivos documentados: {len(resultado['falsos_positivos_documentados'])}")
    if a.salida:
        os.makedirs(os.path.dirname(os.path.abspath(a.salida)), exist_ok=True)
        with open(a.salida, "w", encoding="utf-8") as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
