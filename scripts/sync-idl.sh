#!/usr/bin/env bash
# Copia el IDL generado por `anchor build` al frontend (cliente coherente con el IDL)
set -e
cp target/idl/inventario.json app/src/idl/inventario.json
echo "IDL copiado a app/src/idl/inventario.json"
