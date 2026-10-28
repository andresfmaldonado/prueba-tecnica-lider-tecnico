#!/bin/zsh
# Genera Informe-*.pdf (A4, estilo de la Parte A) a partir de Informe-*.md de una carpeta de prueba.
# uso: informe.sh <carpeta> "<ROTULO EN MAYÚSCULAS>" "<texto del pie>"
set -e
AQUI=${0:A:h}
CARPETA=${1:A}; KICKER=${2:-"PARTE C · PRUEBA"}; PIE=${3:-"Parte C · Pruebas"}
CHROME="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
for MD in $CARPETA/Informe-*.md; do
  PDF=${MD%.md}.pdf
  TMP=$(mktemp -d)
  sed -e "s|__M__|2cm|g" -e "s|__FS__|10pt|g" -e "s|__KICKER__|$KICKER|g" -e "s|__PIE__|$PIE|g" $AQUI/informe/estilo.css > $TMP/e.css
  pandoc $MD -f gfm --columns=100000 --resource-path=$CARPETA --lua-filter=$AQUI/informe/filtro.lua -s \
    --metadata pagetitle="$KICKER" -c $TMP/e.css --embed-resources -o $TMP/doc.html
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=25000 \
    --print-to-pdf=$PDF file://$TMP/doc.html >/dev/null 2>&1
  echo "$PDF: $(pdfinfo $PDF | awk '/Pages/{print $2}') páginas"
done
