"""Create a repository-ready source ZIP, excluding credentials and local dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json
import os

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'output'
OUT.mkdir(exist_ok=True)
archive=OUT/'ReGrow_Full_Source_and_ML_Training.zip'
excluded={'node_modules','pydeps','logs','test-results','__pycache__','.git','.wrangler'}
with ZipFile(archive,'w',ZIP_DEFLATED,compresslevel=6,strict_timestamps=False) as z:
    for current,dirs,files in os.walk(ROOT):
        dirs[:]=[d for d in dirs if d not in excluded]
        for name in files:
            if name.endswith(('.pyc','.log')) or name.startswith(('.env','.dev.vars')):
                continue
            p=Path(current)/name
            z.write(p,p.relative_to(ROOT).as_posix())
    dataset=next((d for d in (ROOT/'Dataset',ROOT.parent/'Dataset',OUT) if (d/'ReGrow_Amaravati_Full_Dataset.csv').exists()),None)
    if dataset is None:raise FileNotFoundError('Full dataset CSV not found; see README.md.')
    for name in ('ReGrow_Amaravati_Full_Dataset.csv','ReGrow_Amaravati_CSV_Guide.md'):
        if not (ROOT/'Dataset'/name).exists():z.write(dataset/name,'Dataset/'+name)
with ZipFile(archive) as z:
    assert z.testzip() is None
    for name in ('README.md','package.json','netlify.toml','.github/workflows/pages.yml','scripts/prepare_train.py','site/static/index.html','Dataset/ReGrow_Amaravati_Full_Dataset.csv'):
        assert name in z.namelist(),name
    json.loads(z.read('data/training-report.json'))
    print(f'Repository-ready source ZIP: {len(z.namelist())} files, {archive.stat().st_size:,} bytes')
