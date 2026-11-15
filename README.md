# ReGrow | Land Observatory

Explore four satellite observations of Amaravati, Andhra Pradesh. Select one of 16 study sectors to see where vegetation, exposed ground, surface water and built cover changed. The area report shows how much land had usable observations on both dates, so cloud gaps do not become apparent land loss.

[Open the dashboard](https://regrow.pages.dev/) · [Download the dataset](Dataset/ReGrow_Amaravati_Full_Dataset.csv) · [Read the column guide](Dataset/ReGrow_Amaravati_CSV_Guide.md)

## Run locally

With Node.js 20 or newer, run the following from the repository root. The dashboard opens at http://localhost:4317 after you start the server. The fitted model and observations are included. Background imagery and terrain use online tile services.

~~~sh
npm start
~~~

Select a date and click a sector. **At a glance** summarizes its current cover and paired changes. **Vegetation history** and **Water history** compare the same usable footprint across the four dates. The planning slider shows how vegetation area would change if a chosen fraction of exposed ground were restored. Water values measure surface extent in square kilometres. Crop examples require local soil and field checks.

## Observations and model

| Property | Value |
| --- | --- |
| Observation dates | 31 March 2021, 24 April 2024, 24 April 2025, 19 April 2026 |
| Study grid | 21,164 cells at 60 m in UTM zone 44N |
| CSV | 84,656 cell-date records, 41 columns, including quality flags |
| Predictors | Six HLS optical reflectance bands plus NDVI, NDWI, NDMI and NDBI |
| Training reference | ESA WorldCover 2021, aggregated to four cover classes |
| Classifier | 96-tree Random Forest trained on the 2021 observation |

Development and test cells are grouped in 960 m spatial blocks. Three tree configurations were compared on development data. On the 4,192 held-out cells the fitted classifier agreed with WorldCover on **93.56%**, with **macro F1 of 0.681**. Exposed-ground recall was 0.265 on just 34 examples. Inspect the [class-level evaluation](data/training-report.json) before using a sector for rehabilitation planning.

Later dates use the 2021 classifier and lack independent field validation. A separate anomaly score measures optical differences from a 2021 vegetation reference. The prototype has no field labels for crop suitability, future growth or water depth.

### Radar coverage

The [NISAR catalogue search](data/sar/selected-nisar.json) identifies a same-track GCOV pair covering the study window on 23 October and 4 November 2026. The included radar scripts support discovery and authenticated product inspection. Radar catalogue records carry no backscatter measurements. All dashboard classifications in this release use HLS optical observations.

## Reproduce the model

Use a Python environment with the dependencies below. Training reads the clipped rasters in **data/clips/**. The CSV is a companion export of observations and model results. The original evaluation travels with the fitted model. Regenerate evaluation figures when changing the environment, labels or training procedure.

~~~sh
python -m pip install -r requirements.txt
python scripts/prepare_train.py
python scripts/package_app.py
python scripts/package_static.py
~~~

## Repository guide

| Path | Contents |
| --- | --- |
| web/ | Dashboard, interactive map, sector reports and charts |
| scripts/ | Data selection, training, packaging, servers and checks |
| data/ | Clipped inputs, fitted models, evaluation and source records |
| Dataset/ | Full CSV and column definitions |
| site/worker/ | Local inference service |
| site/static/ | Prebuilt dashboard for static hosting |

## Verification and hosting

~~~sh
npm test
node scripts/backend_test.mjs
npm install
npx playwright install chromium
npm run test:browser
~~~

The scenario tests cover sector arithmetic, missing observations and file integrity. The backend checks compare fitted predictions with stored results. Browser tests cover report navigation, theme switching, downloads and deployment under a project subpath.

Run **npm run preview** to inspect the static build at http://localhost:4318. Netlify can serve **site/static/** using the included configuration. For GitHub Pages select **GitHub Actions** as the Pages source, then run the included Pages workflow manually. Both serve bundled observations and predictions.

## Sources and credits

Satellite reflectance comes from [NASA Harmonized Landsat Sentinel-2](https://hls.gsfc.nasa.gov/data-products/). Reference labels come from [ESA WorldCover](https://esa-worldcover.org/en/data-access). © ESA WorldCover project 2021. Contains modified Copernicus Sentinel data (2021) processed by the ESA WorldCover consortium.

Radar product documentation is available from [ASF DAAC](https://nisar-docs.asf.alaska.edu/gcov/). Map rendering uses [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js). Imagery and terrain attribution appears on the map.

Project by Spandan Dey.
