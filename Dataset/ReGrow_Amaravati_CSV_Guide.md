# ReGrow Amaravati CSV dataset

Complete project subset: 84,656 observation records, 41 columns, 21,164 unique 60 m cells and four actual HLS observation dates. One row is one cell on one date. The header is not counted as a record.

All rows are retained. Set `input_quality_valid = 1` before using optical measurements, and optionally `included_score_ge_0_55 = 1` to reproduce the default dashboard screen. Rows failing input screening retain their source measurements for traceability; those measurements must not be interpreted as valid observations. Excluded prediction values are blank except for class ID -1 and its explicit label. Some ratio values are zero where the processing denominator was too small; these follow the existing model pipeline.

The six reflectance bands and four unprefixed indices are the 10 model inputs. Do not include predictions, vote support, novelty scores, reference labels, model roles, or duplicated dashboard indices as extra predictor features. Only the 2021 rows carry training/evaluation roles. The 3,984 validation rows are part of the 16,972 development rows, not an additional set. Preserve the held-out spatial test blocks when evaluating.

WorldCover labels are dated 2021 and are repeated under explicitly dated column names. They are not independent ground truth for 2024, 2025 or 2026. Later dates were used for temporal inference, not model fitting. This file contains NASA HLS optical data and derived model results, not NISAR measurements or water-level observations.

## Columns

| Column | Meaning |
| --- | --- |
| `record_id` | Unique date and cell identifier. |
| `observation_date` | NASA HLS observation date in YYYY-MM-DD format. |
| `cell_id` | Stable identifier for the same 60 m cell across all four dates. |
| `grid_row_0based` | Zero-based row in the north-to-south analysis grid. |
| `grid_column_0based` | Zero-based column in the west-to-east analysis grid. |
| `analysis_sector` | Regular 4 x 4 analysis-sector label matching the dashboard. Not a surveyed parcel. |
| `latitude_deg` | Cell-centre latitude in EPSG:4326, degrees north. |
| `longitude_deg` | Cell-centre longitude in EPSG:4326, degrees east. |
| `utm_easting_m` | Cell-centre easting in the stated analysis CRS, metres. |
| `utm_northing_m` | Cell-centre northing in the stated analysis CRS, metres. |
| `analysis_crs` | Projected analysis-grid CRS: EPSG:32644 / UTM zone 44N. |
| `cell_resolution_m` | Analysis-cell side length, 60 metres; HLS source resolution is 30 metres. |
| `cell_area_m2` | Analysis-cell area, 3600 square metres. |
| `source_hls_id` | Original NASA HLS S30 catalogue identifier. |
| `blue_B02_reflectance` | Scaled blue surface reflectance, unitless, as stored in the model input. |
| `green_B03_reflectance` | Scaled green surface reflectance, unitless. |
| `red_B04_reflectance` | Scaled red surface reflectance, unitless. |
| `nir_B8A_reflectance` | Scaled near-infrared surface reflectance, unitless. |
| `swir1_B11_reflectance` | Scaled shortwave-infrared 1 surface reflectance, unitless. |
| `swir2_B12_reflectance` | Scaled shortwave-infrared 2 surface reflectance, unitless. |
| `ndvi` | (NIR - red) / (NIR + red), model-input precision. Not measured yield. |
| `ndwi` | (green - NIR) / (green + NIR), model-input precision. Not water depth. |
| `ndmi` | (NIR - SWIR1) / (NIR + SWIR1), model-input precision. Not measured soil moisture. |
| `ndbi` | (SWIR1 - NIR) / (SWIR1 + NIR), model-input precision. |
| `dashboard_ndvi` | The separately rounded NDVI value used in dashboard summaries. |
| `dashboard_ndwi` | The separately rounded NDWI value used in dashboard summaries. |
| `dashboard_ndmi` | The separately rounded NDMI value used in dashboard summaries. |
| `hls_fmask` | Cached HLS Fmask byte after modal resampling. 255 denotes no data. |
| `input_quality_valid` | 1 when source reflectance and Fmask pass the training pipeline screen, otherwise 0. |
| `included_score_ge_0_55` | 1 when valid and model vote support >= 0.55, the default dashboard threshold. |
| `predicted_class_id` | Model prediction: 0 vegetation, 1 exposed ground, 2 water, 3 built surfaces; -1 excluded. |
| `predicted_class_name` | Model-predicted cover label; Excluded observation when input screening fails. |
| `model_vote_support` | Stored mean tree-vote support, not a calibrated probability. Blank for excluded observations. |
| `optical_novelty_0_1` | Stored normalized Isolation Forest novelty relative to 2021 vegetation. Not crop-stress probability. Blank for excluded observations. |
| `worldcover_2021_code` | Original 2021 WorldCover code at the analysis cell, repeated as a dated reference on later observations. |
| `reference_2021_class_id` | Mapped WorldCover 2021 class: 0 vegetation, 1 exposed, 2 water, 3 built; -1 unsupported. |
| `reference_2021_class_name` | 2021 reference-map label. It is not a verified label for a later observation. |
| `reference_year` | 2021 for every record; reference labels do not update with observation date. |
| `spatial_block_id` | Training spatial group: floor(row / 16) * 100 + floor(column / 16). |
| `model_role` | 2021: development_final_fit or held_out_test. Later dates: temporal_inference_only. |
| `parameter_selection_role` | 2021: fit, validation, held_out_test or excluded. Later dates: not_used_for_training. |

## Date coverage

| Date | Total rows | Input-quality valid | Included at default score ≥ 0.55 |
| --- | ---: | ---: | ---: |
| 2021-03-31 | 21,164 | 21,164 | 20,791 |
| 2024-04-24 | 21,164 | 21,072 | 20,286 |
| 2025-04-24 | 21,164 | 20,697 | 19,725 |
| 2026-04-19 | 21,164 | 19,926 | 18,099 |

## Sources

NASA HLS S30 v2, public Planetary Computer mirror. Six scaled surface-reflectance bands are aggregated from 30 m to the 60 m analysis grid. Reference: ESA WorldCover 2021 v200, modal aggregation. Original observation IDs are attached to every row.

- NASA HLS S30 v2: https://hls.gsfc.nasa.gov/data-products/
- ESA WorldCover 2021 v200: https://esa-worldcover.org/en/data-access

© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.
