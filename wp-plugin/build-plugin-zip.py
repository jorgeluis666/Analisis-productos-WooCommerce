#!/usr/bin/env python3
"""
Empaqueta `lima-retail-analyzer/` en un ZIP instalable en WordPress.

Output: lima-retail-analyzer.zip (en este mismo directorio)

Uso:
    python3 build-plugin-zip.py
"""
import os
import zipfile
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN_DIR = os.path.join(HERE, 'lima-retail-analyzer')
OUTPUT_ZIP = os.path.join(HERE, 'lima-retail-analyzer.zip')

# Archivos a excluir del ZIP
EXCLUDE_PATTERNS = ('.DS_Store', 'Thumbs.db', '.git', '__pycache__', '.pyc')

def should_exclude(path):
    for pattern in EXCLUDE_PATTERNS:
        if pattern in path:
            return True
    return False

def main():
    if not os.path.isdir(PLUGIN_DIR):
        raise SystemExit(f'[ERROR] No existe {PLUGIN_DIR}')

    # Borra ZIP anterior si existe
    if os.path.exists(OUTPUT_ZIP):
        os.remove(OUTPUT_ZIP)

    file_count = 0
    total_bytes = 0

    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(PLUGIN_DIR):
            # Filtrar directorios excluidos
            dirs[:] = [d for d in dirs if not should_exclude(d)]

            for fname in files:
                full_path = os.path.join(root, fname)
                if should_exclude(full_path):
                    continue
                # Path relativo a HERE (para que dentro del ZIP quede como
                # lima-retail-analyzer/...)
                arcname = os.path.relpath(full_path, HERE)
                # En Windows os.sep puede ser \\; zipfile lo normaliza a /
                zf.write(full_path, arcname)
                file_count += 1
                total_bytes += os.path.getsize(full_path)

    size_kb = os.path.getsize(OUTPUT_ZIP) / 1024
    print(f'[OK] Plugin empaquetado: {OUTPUT_ZIP}')
    print(f'     {file_count} archivos, {total_bytes/1024:.1f} KB sin comprimir')
    print(f'     ZIP final: {size_kb:.1f} KB')
    print(f'')
    print(f'Para instalar en WordPress:')
    print(f'  1. WP Admin -> Plugins -> Anadir nuevo -> Subir plugin')
    print(f'  2. Selecciona lima-retail-analyzer.zip')
    print(f'  3. Instalar ahora -> Activar')
    print(f'  4. Menu Analisis LR aparecera en el sidebar')

if __name__ == '__main__':
    main()
