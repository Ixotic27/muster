"""Validate editable diagrams and documentation links with Python's stdlib."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DIAGRAMS = ROOT / 'docs' / 'diagrams'
failures = []
names = ('conceptual-er', 'entity-relationship', 'supporting-entities',
         'system-context', 'system-design')
edge_count = 0
for name in names:
    for extension in ('drawio', 'svg', 'png'):
        file = DIAGRAMS / f'{name}.{extension}'
        if not file.is_file() or not file.stat().st_size:
            failures.append(f'Missing/empty diagram export: {file.name}')
    try:
        svg = ET.parse(DIAGRAMS / f'{name}.svg').getroot()
        if not svg.findtext('{http://www.w3.org/2000/svg}title'):
            failures.append(f'{name}: SVG lacks accessible title')
        cells = ET.parse(DIAGRAMS / f'{name}.drawio').findall('.//mxCell')
        identifiers = [cell.get('id') for cell in cells]
        if len(identifiers) != len(set(identifiers)):
            failures.append(f'{name}: duplicate draw.io cell IDs')
        for cell in cells:
            if cell.get('edge') != '1':
                continue
            edge_count += 1
            for end in ('source', 'target'):
                if cell.get(end) and cell.get(end) not in identifiers:
                    failures.append(f'{name}: dangling {end} on {cell.get("id")}')
            if name in ('entity-relationship', 'supporting-entities') and cell.get('source') and cell.get('target'):
                style = cell.get('style', '')
                for end in ('startArrow', 'endArrow'):
                    marker = re.search(rf'(?:^|;){end}=([^;]+)', style)
                    if not marker or not marker.group(1).startswith('ER'):
                        failures.append(f'{name}: relationship lacks conventional ER endpoint')
    except (ET.ParseError, OSError) as error:
        failures.append(f'{name}: {error}')

documents = [ROOT / 'README.md', ROOT / 'docs/integration.md']
documents += list((ROOT / 'docs/architecture').glob('*.md'))
documents += [DIAGRAMS / 'README.md']
link_count = 0
for document in documents:
    for link in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)', document.read_text(encoding='utf-8')):
        if re.match(r'^[a-zA-Z]+://', link) or link.startswith('#'):
            continue
        link = link.split('#')[0]
        link_count += 1
        if not (document.parent / link).resolve().exists():
            failures.append(f'{document.relative_to(ROOT)}: broken local link {link}')
if failures:
    raise SystemExit('\n'.join(failures))
print(f'Architecture check passed: {len(names)} diagram sets, {edge_count} editable connectors, {link_count} local links.')
