#!/usr/bin/env python3
"""Estado de las pruebas en pruebas/ESTADO.json (con bloqueo: varios subagentes escriben a la vez).

  estado.py set <prueba> clave=valor ...   # p. ej. estado=en_curso hallazgos=2 nota="..."
  estado.py nota "texto"                   # anotación global (bucle, decisiones)
  estado.py ver                            # resumen compacto (lo usa el bucle de control)

estado de cada prueba: pendiente | en_curso | ejecutada | informe_generado | con_hallazgos | aprobada | fallida
"""
import datetime
import fcntl
import glob
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../pruebas
ARCH = os.path.join(RAIZ, "ESTADO.json")
PRUEBAS = ["funcional", "seguridad", "carga", "estres"]


def ahora() -> str:
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def base() -> dict:
    return {"creado": ahora(), "pruebas": {p: {"estado": "pendiente"} for p in PRUEBAS}, "notas": []}


def actualizar(fn) -> dict:
    with open(ARCH, "a+", encoding="utf-8") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.seek(0)
        txt = f.read()
        d = json.loads(txt) if txt.strip() else base()
        fn(d)
        d["actualizado"] = ahora()
        f.seek(0)
        f.truncate()
        json.dump(d, f, ensure_ascii=False, indent=2)
        fcntl.flock(f, fcntl.LOCK_UN)
    return d


def valor(v: str):
    return int(v) if v.lstrip("-").isdigit() else v


def minutos_desde(iso: str) -> int:
    return int((datetime.datetime.now().astimezone() - datetime.datetime.fromisoformat(iso)).total_seconds() // 60)


def ver() -> None:
    d = actualizar(lambda x: None)
    print(f"Estado al {d['actualizado']}")
    for p in PRUEBAS:
        e = d["pruebas"].get(p, {})
        carpeta = os.path.join(RAIZ, p)
        evid = len(glob.glob(os.path.join(carpeta, "evidencias", "*.png")))
        md = len(glob.glob(os.path.join(carpeta, "Informe-*.md")))
        pdf = len(glob.glob(os.path.join(carpeta, "Informe-*.pdf")))
        quieto = minutos_desde(e["actualizado"]) if "actualizado" in e else None
        print(f"- {p:9} estado={e.get('estado', 'pendiente'):17} evidencias={evid:2} informe_md={md} informe_pdf={pdf} "
              f"hallazgos={e.get('hallazgos', '-')} sin_cambios_min={quieto if quieto is not None else '-'} nota={e.get('nota', '')[:70]}")
    for n in d["notas"][-3:]:
        print(f"  · {n['hora']}: {n['texto'][:110]}")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "ver"
    if cmd == "ver":
        ver()
    elif cmd == "set":
        prueba, campos = sys.argv[2], dict(a.split("=", 1) for a in sys.argv[3:])
        def f(d):
            e = d["pruebas"].setdefault(prueba, {})
            e.update({k: valor(v) for k, v in campos.items()})
            e["actualizado"] = ahora()
        actualizar(f)
        print("ok")
    elif cmd == "nota":
        actualizar(lambda d: d["notas"].append({"hora": ahora(), "texto": sys.argv[2]}))
        print("ok")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
