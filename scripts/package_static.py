"""Package ReGrow for static hosting with actual inference in a browser worker."""
from pathlib import Path
import gzip
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'site' / 'static'
ASSETS = OUT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)


def packed(name, value):
    content = json.dumps(value, separators=(',', ':'), allow_nan=False).encode()
    (ASSETS / name).write_bytes(gzip.compress(content, mtime=0))


data = json.loads((ROOT / 'data/dashboard.json').read_text(encoding='utf-8'))
public = {**data, 'scenes': [{k: v for k, v in s.items() if k != 'features'} for s in data['scenes']]}
inputs = {'scenes': [{k: s[k] for k in ('date', 'features', 'classes')} for s in data['scenes']]}
packed('observations.json.gz', public)
packed('inference-inputs.json.gz', inputs)
packed('forest.json.gz', json.loads((ROOT / 'data/forest.json').read_text(encoding='utf-8')))
(OUT / 'training-report.json').write_text(json.dumps(data['report'], indent=2), encoding='utf-8')

for name in ('style.css', 'area-analysis.css', 'area-analysis.js', 'maplibre.js', 'maplibre.css', 'design.css', 'design.js', 'outlook.js', 'logo.svg', 'logo-symbol.svg'):
    shutil.copyfile(ROOT / 'web' / name, ASSETS / name)
for image in (ROOT / 'data').glob('*-rgb.jpg'):
    shutil.copyfile(image, ASSETS / image.name)

html = (ROOT / 'web/index.html').read_text(encoding='utf-8')
assert '<script src="assets/app.js" defer>' in html
html = html.replace('<script src="assets/app.js" defer>', '<script src="assets/hosting-api.js" defer></script><script src="assets/app.js" defer>')
html = html.replace('href="/api/training-report"', 'href="training-report.json"')
html = html.replace('Optical reference model · research prototype', 'Optical reference model · saved predictions')
(OUT / 'index.html').write_text(html, encoding='utf-8')
app = (ROOT / 'web/app.js').read_text(encoding='utf-8')
assert app.count("await fetch('/api/data'") == 1
app = app.replace("await fetch('/api/", "await window.ReGrowHosting.request('/api/")
app = app.replace('Backend inference complete', 'Browser model inference complete')
(ASSETS / 'app.js').write_text(app, encoding='utf-8')

for name in ('hosting-api.js', 'inference-worker.js'):
    shutil.copyfile(ROOT / 'web' / name, ASSETS / name)

dataset_dir=next((d for d in (ROOT/'Dataset', ROOT.parent/'Dataset', ROOT.parent/'output') if (d/'ReGrow_Amaravati_Full_Dataset.csv').exists()),None)
if dataset_dir is None:
    raise FileNotFoundError('The full CSV is required; see README.md for dataset locations.')
(ASSETS/'ReGrow_Amaravati_Full_Dataset.csv.gz').write_bytes(gzip.compress((dataset_dir/'ReGrow_Amaravati_Full_Dataset.csv').read_bytes(),mtime=0))
shutil.copyfile(dataset_dir/'ReGrow_Amaravati_CSV_Guide.md',ASSETS/'DATA_DICTIONARY.md')

manifest = {
    'project': 'ReGrow Amaravati',
    'runtime': 'Static hosting; saved fitted Random Forest classifications; optional browser inference module bundled',
    'model': 'Original local 96-tree model, not the separately saved Colab retrain',
    'data': 'Four actual NASA HLS observations with ESA WorldCover 2021 reference labels',
    'privacy': 'No field notebook or account details bundled; theme preference stays in the browser',
    'files': {str(p.relative_to(OUT)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted(OUT.rglob('*')) if p.is_file() and p.name != 'manifest.json'},
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
archive = ROOT.parent / 'output/ReGrow_Public_Hosting.zip'
archive.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(OUT.rglob('*')):
        if p.is_file():
            z.write(p, p.relative_to(OUT))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
print(f'Public package ready: {archive} ({archive.stat().st_size:,} bytes)')
