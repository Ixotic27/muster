"""Regenerate the editable architecture/ER diagrams and matching SVGs."""
from pathlib import Path
import runpy

HERE = Path(__file__).resolve().parent
for script in ('generate-er-diagrams.py', 'generate-system-diagrams.py'):
    runpy.run_path(str(HERE / script), run_name='__main__')
