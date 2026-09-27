"""
Carga items_extraidos.json a la tabla `items` de Supabase.

Requiere las variables de entorno:
    SUPABASE_URL
    SUPABASE_SERVICE_KEY   (la "service_role" key, NO la anon key —
                             esta sí puede escribir sin restricciones de RLS)

Instalar dependencia:
    pip install supabase --break-system-packages

Uso:
    python3 seed_items.py ../scripts/items_extraidos.json
"""
import sys
import os
import json
from supabase import create_client


def main():
    if len(sys.argv) != 2:
        print("Uso: python3 seed_items.py <items_extraidos.json>")
        sys.exit(1)

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Faltan variables de entorno SUPABASE_URL y/o SUPABASE_SERVICE_KEY")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)

    supabase = create_client(url, key)

    filas = []
    for item in data["items"]:
        filas.append(
            {
                "fase": item["fase"],
                "fila_excel": item["fila_excel"],
                "relacion": item["relacion"],
                "ejemplo_selector_1": item["ejemplo_selector_1"],
                "ejemplo_selector_2": item["ejemplo_selector_2"],
                "muestra": item["muestra"],
                "eco_1": item["ecos"][0],
                "eco_2": item["ecos"][1],
                "eco_3": item["ecos"][2],
                "eco_4": item["ecos"][3],
                "indice_correcto": item["indice_correcto"],
            }
        )

    print(f"Insertando {len(filas)} items...")
    # Insertar en bloques de 50 para no exceder límites de payload
    for i in range(0, len(filas), 50):
        bloque = filas[i : i + 50]
        supabase.table("items").insert(bloque).execute()
        print(f"  insertados {i + len(bloque)}/{len(filas)}")

    print("Listo.")


if __name__ == "__main__":
    main()
