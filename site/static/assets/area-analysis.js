(() => {
  'use strict';

  let activeTab = 'summary';
  let scenarioFraction = .25;
  const area = () => state.data.cell_area_m2 / 1e6;
  const included = (s, i) => s.classes[i] >= 0 && s.confidence[i] >= state.threshold;
  const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const average = (s, key, ids) => mean(ids.map(i => s[key][i]).filter(Number.isFinite));
  const number = (n, digits) => fmt(n, digits ?? (n !== 0 && Math.abs(n) < .01 ? 3 : 2));
  const value = (n, digits) => Number.isFinite(n) ? number(n, digits) : '—';
  const signed = n => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${number(n)}` : '—';
  const dateLabel = date => new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
  const fraction = (n, total) => total ? pct(n / total) : '—';
  const tabNames = {summary: 'At a glance', vegetation: 'Vegetation history', water: 'Water history', evidence: 'Data & explanation'};

  function snapshot(s, ids) {
    const good = ids.filter(i => included(s, i));
    const vegetation = good.filter(i => s.classes[i] === 0);
    const water = good.filter(i => s.classes[i] === 2);
    const n = [0, 0, 0, 0];
    good.forEach(i => n[s.classes[i]]++);
    return {date: s.date, n, cells: good.length, total: ids.length, area_km2: n.map(n => n * area()),
      included_km2: good.length * area(), coverage: ids.length ? good.length / ids.length : null,
      mean_model_score: average(s, 'confidence', good),
      vegetation_ndvi: average(s, 'ndvi', vegetation), vegetation_ndmi: average(s, 'ndmi', vegetation),
      area_ndwi: average(s, 'ndwi', good), water_ndwi: average(s, 'ndwi', water),
      vegetation_novelty: average(s, 'anomaly', vegetation)};
  }

  function comparison(before, after, ids) {
    const paired = ids.filter(i => included(before, i) && included(after, i));
    const matrix = Array.from({length: 4}, () => [0, 0, 0, 0]);
    paired.forEach(i => matrix[before.classes[i]][after.classes[i]]++);
    const a = snapshot(before, paired), b = snapshot(after, paired);
    const persistentVegetation = paired.filter(i => before.classes[i] === 0 && after.classes[i] === 0);
    return {cells: paired.length, area_km2: paired.length * area(), before: a, after: b,
      delta_km2: a.area_km2.map((v, k) => b.area_km2[k] - v),
      vegetation_gain_km2: matrix.reduce((n, row, k) => n + (k === 0 ? 0 : row[0]), 0) * area(),
      vegetation_loss_km2: matrix[0].slice(1).reduce((a, b) => a + b, 0) * area(),
      bare_to_vegetation_km2: matrix[1][0] * area(),
      new_water_km2: matrix.reduce((n, row, k) => n + (k === 2 ? 0 : row[2]), 0) * area(),
      lost_water_km2: (matrix[2][0] + matrix[2][1] + matrix[2][3]) * area(),
      persistent_vegetation_cells: persistentVegetation.length,
      persistent_ndvi_before: average(before, 'ndvi', persistentVegetation),
      persistent_ndvi_after: average(after, 'ndvi', persistentVegetation),
      persistent_ndmi_before: average(before, 'ndmi', persistentVegetation),
      persistent_ndmi_after: average(after, 'ndmi', persistentVegetation),
      transition_km2: matrix.map(row => row.map(n => n * area()))};
  }

  function buildReport() {
    const d = state.data, ids = indices(), s = current(), base = d.scenes[state.base];
    const common = ids.filter(i => d.scenes.every(scene => included(scene, i)));
    const coords = ids.map(i => d.coordinates[i]);
    const lon = mean(coords.map(c => c[0])), lat = mean(coords.map(c => c[1]));
    return {name: state.sector === null ? 'Amaravati study window' : `Analysis grid ${sectorName(state.sector)}`,
      sector: state.sector, centre: [lon, lat], observation: s.date, baseline: base.date,
      threshold: state.threshold, total_cells: ids.length, total_km2: ids.length * area(),
      current: snapshot(s, ids), history: d.scenes.map(scene => snapshot(scene, ids)),
      common_cells: common.length, common_km2: common.length * area(),
      common_history: d.scenes.map(scene => snapshot(scene, common)),
      comparison: comparison(base, s, ids),
      sources: d.sources, limitations: d.limitations};
  }

  function metric(label, n, unit, detail, tone = '') {
    return `<article class="area-stat ${tone}"><span>${label}</span><strong>${n}<small>${unit}</small></strong><p>${detail}</p></article>`;
  }

  function chart(rows, getter, {label, color = '#63875d', unit = 'km²', domain = null} = {}) {
    const values = rows.map(row => row.cells ? getter(row) : null);
    if (!values.some(Number.isFinite)) return '<div class="area-empty">No comparable measurements at this threshold. Try a lower model-score threshold in Model & evidence.</div>';
    const width = 540, height = 210, left = 47, right = 22, top = 22, bottom = 42;
    const dates = rows.map(r => Date.parse(r.date)), first = Math.min(...dates), last = Math.max(...dates);
    const max = domain ? domain[1] : Math.max(.02, ...values.filter(Number.isFinite)) * 1.16;
    const min = domain ? domain[0] : 0;
    const x = i => left + (dates[i] - first) / Math.max(1, last - first) * (width - left - right);
    const y = v => top + (max - v) / (max - min) * (height - top - bottom);
    let path = '', connected = false;
    values.forEach((v, i) => { if (!Number.isFinite(v)) { connected = false; return; } path += `${connected ? 'L' : 'M'}${x(i)},${y(v)} `; connected = true; });
    return `<svg class="area-history-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}. ${rows.map((r, i) => `${r.date}: ${value(values[i], 3)} ${unit}`).join('; ')}"><title>${esc(label)}</title>${[0, .5, 1].map(f => {const v = min + (max - min) * f; return `<line x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}" stroke="#e2e7dc" stroke-dasharray="3 5"/><text x="${left-10}" y="${y(v)+4}" text-anchor="end">${number(v, domain ? 1 : 2)}</text>`;}).join('')}<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>${rows.map((r, i) => `<text x="${x(i)}" y="${height-15}" text-anchor="middle">${r.date.slice(0, 4)}</text>${Number.isFinite(values[i]) ? `<circle cx="${x(i)}" cy="${y(values[i])}" r="5" fill="${color}" stroke="#fffefa" stroke-width="2"><title>${dateLabel(r.date)}: ${value(values[i], 3)} ${unit}</title></circle><text class="point-label" x="${x(i)}" y="${Math.max(13, y(values[i])-12)}" text-anchor="middle">${value(values[i], domain ? 3 : undefined)}</text>` : ''}`).join('')}</svg>`;
  }

  function chartCard(title, intro, plot, footer, tone = '') {
    return `<article class="area-card area-chart-card ${tone}"><h3>${title}</h3><p>${intro}</p>${plot}<p class="area-chart-caption">${footer}</p></article>`;
  }

  function commonNote(r) {
    return `${number(r.common_km2)} km² (${fraction(r.common_cells, r.total_cells)} of this area) is included on all four dates. These charts use only those same cells. Lines connect snapshots; conditions between them were not measured.`;
  }

  function deltaExplanation(r, type) {
    const k = type === 'vegetation' ? 0 : 2, p = r.comparison;
    if (!p.cells) return 'The two selected dates have no shared included cells at this threshold. No change can be calculated.';
    if (r.observation === r.baseline) return 'The observation and baseline are the same date. Select a different baseline to compare change.';
    const delta = p.delta_km2[k];
    const direction = Math.abs(delta) < area() / 2 ? 'no net mapped area change' : `${number(Math.abs(delta))} km² ${delta > 0 ? 'more' : 'less'} mapped ${type}`;
    return `Between ${dateLabel(r.baseline)} and ${dateLabel(r.observation)}, the same ${number(p.area_km2)} km² of included land has ${direction}. The comparison excludes cells missing or below the model-score threshold on either date.`;
  }

  function composition(r) {
    const c = r.current;
    return `<div class="area-composition-bar">${c.n.map((n, k) => `<span style="width:${c.cells ? n/c.cells*100 : 0}%;background:${colors[k]}" title="${short[k]}: ${number(n*area())} km²"></span>`).join('')}</div><div class="area-cover-list">${c.n.map((n, k) => `<div><span><i style="background:${colors[k]}"></i>${short[k] === 'Exposed' ? 'Exposed ground' : short[k] === 'Built' ? 'Built surfaces' : short[k]}</span><strong>${number(n*area())} km²</strong><small>${fraction(n, c.cells)} of included area</small></div>`).join('')}</div>`;
  }

  function observationExplanation(r) {
    const c=r.current, p=r.comparison;
    if(!c.cells) return '<article class="area-card area-explanation"><h3>What is happening in this area?</h3><p>No cells pass the current quality screen and score threshold. The visible map cannot establish vegetation, water or land-use change here. Try a clearer observation date or review the threshold.</p></article>';
    const dominant=c.n.indexOf(Math.max(...c.n));
    const history=r.common_history, first=history[0], last=history[history.length-1];
    const historyChange=r.common_cells?last.area_km2[0]-first.area_km2[0]:null;
    const historyText=historyChange===null?'There is no footprint included on all four dates, so a full-history change is unavailable.':`Across the same ${number(r.common_km2)} km² observed on all four dates, vegetation changes from ${number(first.area_km2[0])} km² in ${first.date.slice(0,4)} to ${number(last.area_km2[0])} km² in ${last.date.slice(0,4)} (${signed(historyChange)} km²).`;
    const waterText=p.cells?`Surface water changes by ${signed(p.delta_km2[2])} km² between the selected dates, using the same included cells. This describes visible extent, not water height or storage.`:'Water change cannot be compared without included cells on both selected dates.';
    const action=dominant===2?'Inspect river banks, drainage and flood exposure before proposing planting.':dominant===3?'Verify unsealed land and permitted land use before considering planting.':p.cells&&p.delta_km2[0]<0?'Inspect the patches that changed out of vegetation and compare harvest, construction and planting records.':'Check whether vegetation persists between crop seasons and compare new cover with planting and site records.';
    return `<article class="area-card area-explanation"><span class="area-kicker">EXPLAINED FOR THIS GRID</span><h3>What is happening in this area?</h3><p>${short[dominant]} makes up ${fraction(c.n[dominant],c.cells)} of the included area on ${dateLabel(r.observation)}. ${deltaExplanation(r,'vegetation')}</p><ul class="area-summary-points"><li><strong>The longer view.</strong> ${historyText} Lines connect four observations; they do not show conditions in every intervening year.</li><li><strong>Water and greenness.</strong> ${waterText} ${c.vegetation_ndvi===null?'No vegetation greenness mean is available.':`Mean NDVI on the currently vegetation-classified cells is ${value(c.vegetation_ndvi,3)}; it describes the optical greenness signal.`}</li><li><strong>What deserves a closer look.</strong> ${action} The observations do not identify the cause of change or prove rehabilitation success.</li><li><strong>How complete is the evidence?</strong> ${fraction(c.cells,r.total_cells)} of this grid is included; ${number(r.total_km2-c.included_km2)} km² is excluded or unknown. Missing cells are not counted as lost vegetation. Future crop choices and plantable capacity require field checks.</li></ul></article>`;
  }

  function summary(r) {
    const c = r.current, p = r.comparison;
    const available = c.cells > 0;
    const majority = available ? c.n.indexOf(Math.max(...c.n)) : -1;
    const change = p.cells ? `${signed(p.delta_km2[0])} km²` : 'Unavailable';
    return `<div class="area-introduction"><span class="area-kicker">THE LOCAL PICTURE</span><h3>${available ? `${short[majority]} is the largest mapped cover here.` : 'This area needs a clearer observation.'}</h3><p>${available ? `On ${dateLabel(r.observation)}, ${number(c.included_km2)} km² of this ${number(r.total_km2)} km² area passes the cloud screening and selected model-score threshold. The model identifies ${number(c.area_km2[0])} km² of vegetation and ${number(c.area_km2[2])} km² of surface water.` : 'No cells pass the current screening and model-score threshold. Hidden or cloud-obscured cells are unknown; they are not evidence of vegetation or water loss.'}</p></div>
      <div class="area-stats">${metric('Mapped vegetation', value(c.cells ? c.area_km2[0] : null), 'km²', `${fraction(c.n[0], c.cells)} of included land`, 'green')}${metric('Surface water', value(c.cells ? c.area_km2[2] : null), 'km²', 'Visible water area at this date', 'blue')}${metric('Vegetation change', p.cells ? signed(p.delta_km2[0]) : '—', 'km²', 'Same cells on baseline and observation')}${metric('Included coverage', fraction(c.cells, r.total_cells), '', `${c.cells.toLocaleString('en-IN')} of ${r.total_cells.toLocaleString('en-IN')} cells`)}</div>
      ${observationExplanation(r)}${window.regrowOutlook.html(r,scenarioFraction)}<div class="area-method-note"><span>◎</span><p><strong>A fair history comparison.</strong> ${commonNote(r)}</p></div>
      <div class="area-grid">${chartCard('Vegetation, through time', 'Mapped vegetation area on the common observation footprint.', chart(r.common_history, s => s.area_km2[0], {label:'Vegetation area history'}), 'Area of vegetation cover, not crop yield or recovery success.')}${chartCard('Water, through time', 'Mapped surface-water area on the same observation footprint.', chart(r.common_history, s => s.area_km2[2], {label:'Surface-water extent history', color:colors[2]}), 'Area in km². Water level and depth have not been measured.', 'water-card')}</div>
      <div class="area-grid"><article class="area-card"><h3>What covers the area now?</h3><p>Shares below use the ${number(c.included_km2)} km² included on ${dateLabel(r.observation)}. The remaining ${number((r.total_cells-c.cells)*area())} km² is unknown at this threshold.</p>${composition(r)}</article><article class="area-card area-reading"><h3>How to read these findings</h3><p>${deltaExplanation(r, 'vegetation')}</p><p>${p.cells ? `Vegetation change is ${change}; it includes new vegetation minus vegetation that changed to exposed, built or water cover.` : 'A numerical trend is withheld when a shared footprint is unavailable.'} Crop rotation, harvest, river changes, construction and classification error can affect this result.</p><p>Use the report to decide where to inspect. A satellite cover change alone cannot establish rehabilitation success or explain why a change happened.</p></article></div>
      <article class="area-card"><span class="area-kicker">FROM OBSERVATION TO ACTION</span><h3>What to check on the ground</h3><div class="area-actions-grid"><div><span>01</span><h4>Rehabilitation</h4><p>${p.cells ? `${number(p.bare_to_vegetation_km2)} km² changed from exposed ground to vegetation on shared cells.` : 'No paired exposed-to-vegetation estimate is available.'} Compare any candidate establishment with planting records, species, survival and site photographs.</p></div><div><span>02</span><h4>Farming</h4><p>Review vegetation cover alongside sowing and harvest dates. Inspect crop condition, drainage and local soil measurements before making irrigation or planting decisions.</p></div><div><span>03</span><h4>Water & drainage</h4><p>${c.n[2] ? 'Visit mapped water patches and check whether they are river water, irrigation storage or temporary ponding.' : 'No water is mapped above this threshold; small channels or water beneath vegetation may still be present.'} Use a gauge for water level and a field visit for drainage.</p></div></div></article>`;
  }

  function vegetation(r) {
    const c = r.current, p = r.comparison;
    return `<div class="area-introduction"><span class="area-kicker">VEGETATION HISTORY</span><h3>How much is growing, and how its signal changes.</h3><p>${deltaExplanation(r, 'vegetation')}</p></div>
      <div class="area-stats">${metric('Vegetation now', value(c.cells ? c.area_km2[0] : null), 'km²', `${fraction(c.n[0], c.cells)} of included area`, 'green')}${metric('Newly mapped vegetation', p.cells ? value(p.vegetation_gain_km2) : '—', 'km²', 'Other cover → vegetation on shared cells')}${metric('Vegetation no longer mapped', p.cells ? value(p.vegetation_loss_km2) : '—', 'km²', 'Vegetation → other cover on shared cells')}${metric('Mean vegetation NDVI', value(c.vegetation_ndvi, 3), '', 'Greenness signal on current vegetation')}</div>
      <div class="area-method-note"><span>◎</span><p>${commonNote(r)} Index means below use the vegetation-classified cells within that footprint at each date, so the vegetation subset can change.</p></div>
      <article class="area-card area-chart-card"><h3>Vegetation cover at every observation</h3><p>A fixed ground footprint makes the area history comparable.</p>${chart(r.common_history, s => s.area_km2[0], {label:'Vegetation area on all-date shared footprint'})}<p class="area-chart-caption">The full date-by-date table in Data & explanation also includes cells available on only some dates.</p></article>
      <div class="area-grid">${chartCard('Greenness · NDVI', '(Near infrared − red) ÷ (near infrared + red)', chart(r.common_history, s => s.vegetation_ndvi, {label:'Mean NDVI of mapped vegetation', unit:'index', domain:[-1,1]}), 'NDVI is a greenness index from −1 to +1. Higher values can indicate a stronger vegetation signal; they do not directly measure yield or plant survival.')}${chartCard('Vegetation moisture signal · NDMI', '(Near infrared − shortwave infrared) ÷ their sum', chart(r.common_history, s => s.vegetation_ndmi, {label:'Mean NDMI of mapped vegetation', color:'#8b9770', unit:'index', domain:[-1,1]}), 'NDMI is an optical moisture-related index from −1 to +1. It is not measured soil moisture, groundwater depth or an irrigation requirement.')}</div>
      <article class="area-card area-reading"><h3>What this means for rehabilitation and farming</h3><p>${p.persistent_vegetation_cells ? `On ${number(p.persistent_vegetation_cells*area())} km² that stays classified as vegetation on both selected dates, mean NDVI changes from ${value(p.persistent_ndvi_before,3)} to ${value(p.persistent_ndvi_after,3)}, and mean NDMI changes from ${value(p.persistent_ndmi_before,3)} to ${value(p.persistent_ndmi_after,3)}. Comparing this persistent subset helps separate signal changes from a changing vegetation footprint.` : 'No shared cells are classified as vegetation on both dates at this threshold, so a persistent-vegetation index comparison is unavailable.'}</p><p>${p.cells ? `${number(p.bare_to_vegetation_km2)} km² of exposed ground becomes vegetation. This is a place to inspect for establishment, seasonal crop growth or regrowth.` : 'Select two dates with shared included cells before comparing establishment.'} The model combines trees, shrubs, grass and crops into one vegetation class; it cannot identify the crop, its health or whether land has been safely restored.</p><p>The current vegetation spectral-novelty score averages ${value(c.vegetation_novelty,3)} on a normalized 0–1 scale relative to the 2021 vegetated reference. This is a measure of optical difference, not the probability of crop stress.</p><p>For rehabilitation, verify species, survival and intervention dates. For farming, add crop calendars, pest observations, soil tests and measured moisture. Do not infer crop stress or irrigation needs from a single index.</p></article>
      <article class="area-card"><h3>Vegetation observation record</h3><p>Each row uses that date’s included cells in this area. Area totals can change with coverage; use the shared-footprint chart for history comparisons.</p>${historyTable(r, 'vegetation')}</article>`;
  }

  function water(r) {
    const c = r.current, p = r.comparison;
    return `<div class="area-introduction"><span class="area-kicker">WATER HISTORY</span><h3>See where water spreads across the surface.</h3><p>${deltaExplanation(r, 'water')}</p></div>
      <div class="area-water-limit"><span class="water-symbol">≈</span><div><h3>Water level / depth: not measured</h3><p>These satellite observations map how much ground looks like open water. They cannot say how high the river is, how deep a pond is, or how much groundwater is available. Add a dated local gauge or compatible height observation to report water level.</p></div><span class="area-status neutral">No level data</span></div>
      <div class="area-stats">${metric('Surface water now', value(c.cells ? c.area_km2[2] : null), 'km²', `${fraction(c.n[2],c.cells)} of included area`, 'blue')}${metric('Water extent change', p.cells ? signed(p.delta_km2[2]) : '—', 'km²', 'Net change on the paired footprint', 'blue')}${metric('New water footprint', p.cells ? value(p.new_water_km2) : '—', 'km²', 'Other cover → water on shared cells')}${metric('Water footprint lost', p.cells ? value(p.lost_water_km2) : '—', 'km²', 'Water → other cover on shared cells')}</div>
      <div class="area-method-note"><span>◎</span><p>${commonNote(r)}</p></div>
      <div class="area-grid">${chartCard('Surface-water area', 'Only water-classified cells are counted, in square kilometres.', chart(r.common_history, s => s.area_km2[2], {label:'Surface-water area history', color:colors[2]}), 'An increase means a larger visible water footprint. It does not show a rise in water level.', 'water-card')}${chartCard('Water-related spectral signal · NDWI', '(Green − near infrared) ÷ (green + near infrared)', chart(r.common_history, s => s.area_ndwi, {label:'Mean NDWI on all-date shared footprint', color:colors[2], unit:'index', domain:[-1,1]}), 'Mean NDWI across all included cover on the common footprint, from −1 to +1. It supports optical interpretation; it is not a water-depth or water-quality sensor.', 'water-card')}</div>
      <article class="area-card area-reading"><h3>What the water findings can tell us</h3><p>${c.n[2] ? `${c.n[2].toLocaleString('en-IN')} included cells are classified as water on ${dateLabel(r.observation)}, covering ${number(c.area_km2[2])} km². Their mean NDWI is ${value(c.water_ndwi,3)}.` : 'There are no water-classified cells above the current threshold. This does not establish that the area has no water: narrow channels, water under vegetation and obscured cells may be missed.'} The four snapshots describe individual observation dates; they do not measure year-round availability or how long ponding lasts.</p><p>For farming, use mapped changes to choose places to inspect for irrigation storage, blocked drainage or temporary ponding. For rehabilitation, review whether water overlaps intended planting areas and check drainage on site. A surface-water patch does not establish flooding damage, usable irrigation water or contamination.</p><p>The input observations are optical and screened for clouds. Wet soil, shadows and mixed land-water cells can affect classification. Add field photographs, a staff gauge and local rainfall records to understand the cause and consequences of a change.</p></article>
      <article class="area-card"><h3>Water observation record</h3><p>Per-date area is based on that date’s available cells. No water-level values have been estimated or invented.</p>${historyTable(r, 'water')}</article>`;
  }

  function historyTable(r, kind = 'all') {
    const headers = kind === 'vegetation' ? ['Observation','Vegetation km²','Mean vegetation NDVI','Mean vegetation NDMI','Included coverage'] : kind === 'water' ? ['Observation','Water km²','Share of included area','Mean area NDWI','Included coverage'] : ['Observation','Vegetation km²','Exposed km²','Water km²','Built km²','Included km²','Mean model score'];
    return `<div class="area-table-scroll"><table class="area-history-table"><caption>${esc(r.name)} · date-specific included cells</caption><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${r.history.map(s => {const vals = kind === 'vegetation' ? [value(s.area_km2[0]),value(s.vegetation_ndvi,3),value(s.vegetation_ndmi,3),fraction(s.cells,r.total_cells)] : kind === 'water' ? [value(s.area_km2[2]),fraction(s.n[2],s.cells),value(s.area_ndwi,3),fraction(s.cells,r.total_cells)] : [value(s.area_km2[0]),value(s.area_km2[1]),value(s.area_km2[2]),value(s.area_km2[3]),value(s.included_km2),s.mean_model_score === null ? '—' : pct(s.mean_model_score)];return `<tr class="${s.date === r.observation?'is-current':''}"><th scope="row">${dateLabel(s.date)}${s.date===r.observation?'<small>Selected observation</small>':''}</th>${vals.map(v=>`<td>${v}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`;
  }

  function evidence(r) {
    const report = state.data.report, c = r.current;
    return `<div class="area-introduction"><span class="area-kicker">DATA & EXPLANATION</span><h3>Every number has a footprint and a source.</h3><p>This is a report for ${esc(r.name)} around ${number(r.centre[1],5)}° N, ${number(r.centre[0],5)}° E. It summarizes ${r.total_cells.toLocaleString('en-IN')} analysis cells of 60 × 60 metres each. The sector is a regular grid, not a surveyed farm boundary.</p></div>
      <div class="area-grid"><article class="area-card"><h3>How to interpret the coverage</h3><dl class="area-facts"><div><dt>Complete selected area</dt><dd>${number(r.total_km2)} km²</dd></div><div><dt>Included on this date</dt><dd>${number(c.included_km2)} km² · ${fraction(c.cells,r.total_cells)}</dd></div><div><dt>Excluded / unknown</dt><dd>${number((r.total_cells-c.cells)*area())} km²</dd></div><div><dt>Common to all dates</dt><dd>${number(r.common_km2)} km²</dd></div><div><dt>Baseline / observation overlap</dt><dd>${number(r.comparison.area_km2)} km²</dd></div><div><dt>Required model score</dt><dd>≥ ${r.threshold.toFixed(2)}</dd></div></dl></article><article class="area-card area-reading"><h3>How the model reaches a result</h3><p>A 96-tree Random Forest reads six optical bands plus NDVI, NDWI, NDMI and NDBI. It assigns each included cell to vegetation, exposed ground, water or built surfaces.</p><p>The mean model score here is ${c.mean_model_score === null ? 'unavailable' : pct(c.mean_model_score)}. This is average tree-vote support, not a calibrated probability of being correct.</p><p>Across geographically separate test blocks, agreement with ESA WorldCover is ${pct(report.accuracy)} and macro F1 is ${report.macro_f1.toFixed(3)}. These are study-wide reference-map results, not measured accuracy for this selected area or later years.</p></article></div>
      <div class="area-method-note"><span>↗</span><p><strong>Change across the observed years.</strong> ${commonNote(r)} There are no observations for 2022 or 2023. These plots do not estimate monthly or seasonal changes.</p></div>
      <div class="area-grid">${[0,1,2,3].map(k=>chartCard(`${short[k]} cover history`, 'Area on the same cells included at every date.', chart(r.common_history,s=>s.area_km2[k],{label:`${short[k]} cover across observation years`,color:colors[k]}), 'Each dot is a real observation date; connecting lines are a visual guide.')).join('')}${chartCard('How much of the area was observable?', 'Per-date coverage after quality screening and your score threshold.',chart(r.history,s=>s.coverage*100,{label:'Included observation coverage by year',unit:'%',domain:[0,100]}),'Coverage changes are data availability changes, not land-cover loss.')}</div>
      <article class="area-card"><h3>All observed land-cover totals</h3><p>These are complete per-date included-cell summaries. Different coverage can change the totals, so vegetation and water history charts use a fixed common footprint instead.</p>${historyTable(r)}</article>
      <article class="area-card"><h3>What each measurement means</h3><div class="area-definition-grid"><div><h4>Vegetation cover</h4><p>The area classified as trees, shrubs, grass or crops combined. It does not identify a crop or demonstrate restored ecosystem function.</p></div><div><h4>Surface water</h4><p>The area classified as water on the observation date. Depth, height, volume, groundwater and water quality are not measured.</p></div><div><h4>NDVI & NDMI</h4><p>Optical indices describing vegetation greenness and a moisture-related signal. They do not directly measure yield, soil moisture or irrigation needs.</p></div><div><h4>NDWI</h4><p>A green / near-infrared index that helps interpret surface-water signals. The report’s area mean includes all land-cover types on its stated footprint.</p></div><div><h4>Exposed & built surfaces</h4><p>Model cover labels with material uncertainty. Exposed-ground recall in held-out reference labels is ${pct(report.classes['Exposed ground'].recall)}. Verify individual sites on the ground.</p></div><div><h4>Spectral novelty</h4><p>An Isolation Forest compares optical indices with the 2021 vegetated reference. It is not a calibrated stress diagnosis; no disease or recovery-time prediction is available.</p></div></div></article>
      <article class="area-card area-reading"><h3>The observations behind this report</h3><p>NASA HLS S30 v2 optical reflectance at 30 m source resolution is aggregated to a 60 m analysis grid. Fmask screening excludes flagged cloud, shadow, cirrus and adjacency pixels. The model uses ESA WorldCover 2021 v200 reference labels and was trained on the 2021 snapshot.</p><p>The 2024, 2025 and 2026 classifications are predictions on later observations, without independent field validation. The dates fall in broadly similar months; crop stages and weather can still differ. NISAR radar is not connected to this prototype.</p><details><summary>See the original observation identifiers</summary><ul class="area-source-records">${state.data.scenes.map(s=>`<li><strong>${dateLabel(s.date)}</strong><code>${esc(s.id)}</code></li>`).join('')}</ul></details><div class="area-source-links">${state.data.sources.slice(0,2).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.name)} ↗</a>`).join('')}</div></article>
      <article class="area-card area-reading"><h3>Before using this for a field decision</h3><p>Add real parcel boundaries, intervention and planting dates, ground photographs, crop calendars, measured soil moisture and a dated water-level record. This report helps prioritize investigation; it does not certify safe agricultural reuse, successful rehabilitation or water availability.</p></article>`;
  }

  function render() {
    if (!state.data) return;
    const r = buildReport(), dialog = document.querySelector('#area-dialog');
    dialog.dataset.sector = r.sector === null ? 'whole' : r.sector;
    document.querySelector('#area-title').textContent = r.name;
    document.querySelector('#area-location').textContent = `Amaravati, Andhra Pradesh · ${number(r.centre[1],4)}° N, ${number(r.centre[0],4)}° E · ${number(r.total_km2)} km²`;
    document.querySelector('#area-date').innerHTML = state.data.scenes.map((s,i)=>`<option value="${i}" ${i===state.date?'selected':''}>${dateLabel(s.date)}</option>`).join('');
    document.querySelector('#area-baseline').innerHTML = state.data.scenes.map((s,i)=>`<option value="${i}" ${i===state.base?'selected':''}>${dateLabel(s.date)}</option>`).join('');
    const status = document.querySelector('#area-quality');
    status.textContent = `${fraction(r.current.cells,r.total_cells)} included`;
    status.className = `area-status ${r.current.cells/r.total_cells < .7?'neutral':''}`;
    document.querySelectorAll('[data-area-tab]').forEach(button => {const selected = button.dataset.areaTab === activeTab; button.setAttribute('aria-selected', selected);button.tabIndex = selected ? 0 : -1;});
    const content = document.querySelector('#area-tab-content');
    content.setAttribute('aria-labelledby','area-tab-'+activeTab);
    content.innerHTML = ({summary,vegetation,water,evidence})[activeTab](r);
    const slider=content.querySelector('#outlook-fraction');
    if(slider) slider.oninput=()=>{scenarioFraction=+slider.value/100;const plan=window.regrowOutlook.assess(r,scenarioFraction);content.querySelector('#scenario-percent').textContent=slider.value+'%';content.querySelector('#scenario-addition').textContent='+'+fmt(plan.assumed_additional_vegetation_km2,3)+' km²';content.querySelector('#scenario-total').textContent=fmt(plan.scenario_vegetation_km2,3)+' km²';};
  }

  function open() {
    if (!state.data) return;
    activeTab = 'summary';
    render();
    const dialog = document.querySelector('#area-dialog');
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('area-report-open');
    document.querySelector('#area-scroll').scrollTop = 0;
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'area-dialog';
  dialog.className = 'area-dialog';
  dialog.setAttribute('aria-labelledby','area-title');
  dialog.innerHTML = `<header class="area-dialog-header"><div><span class="area-kicker">REGROW / AREA REPORT</span><h2 id="area-title">Selected area</h2><p id="area-location"></p></div><button id="close-area" class="area-close" aria-label="Close area report">×</button></header><div class="area-report-controls"><label>Observation<select id="area-date" aria-label="Area report observation"></select></label><label>Compare with<select id="area-baseline" aria-label="Area report baseline"></select></label><span class="area-status" id="area-quality"></span><button id="area-download" class="button outline">↓ Area report</button></div><div class="area-tabs" role="tablist" aria-label="Area analysis sections">${Object.entries(tabNames).map(([key,label])=>`<button id="area-tab-${key}" role="tab" aria-controls="area-tab-content" data-area-tab="${key}" aria-selected="${key==='summary'}" tabindex="${key==='summary'?0:-1}">${label}</button>`).join('')}</div><div id="area-scroll" class="area-scroll"><section id="area-tab-content" role="tabpanel" tabindex="0" aria-labelledby="area-tab-summary"></section><footer class="area-report-footer"><p>Real observation snapshots · NASA HLS / ESA WorldCover<br>Research prototype · surface extent, not water level</p></footer></div>`;
  document.body.append(dialog);
  document.querySelector('#close-area').onclick = () => dialog.close();
  dialog.addEventListener('close', () => document.body.classList.remove('area-report-open'));
  dialog.addEventListener('click', e => {if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  document.querySelectorAll('[data-area-tab]').forEach(button => {
    button.onclick = () => {activeTab=button.dataset.areaTab;render();document.querySelector('#area-scroll').scrollTop=0;};
    button.onkeydown = e => {const keys=Object.keys(tabNames),i=keys.indexOf(activeTab);let next=null;if(e.key==='ArrowRight')next=keys[(i+1)%keys.length];if(e.key==='ArrowLeft')next=keys[(i+keys.length-1)%keys.length];if(e.key==='Home')next=keys[0];if(e.key==='End')next=keys[keys.length-1];if(next){e.preventDefault();document.querySelector('#area-tab-'+next).click();document.querySelector('#area-tab-'+next).focus();}};
  });
  document.querySelector('#area-date').onchange = e => setDate(+e.target.value);
  document.querySelector('#area-baseline').onchange = e => {state.base=+e.target.value;document.querySelector('#baseline-select').value=state.base;renderOverview();renderChanges();updateMap();};
  document.querySelector('#area-download').onclick = () => download(`regrow-${state.sector===null?'study-window':sectorName(state.sector)}-area-report.json`, JSON.stringify({project:'ReGrow',...buildReport(),future_scenario:window.regrowOutlook.assess(buildReport(),scenarioFraction)},null,2));
  const detailButton = document.createElement('button');
  detailButton.id='open-area-report';detailButton.className='button area-open-report full';
  detailButton.innerHTML='Read the full area analysis <span>↗</span>';
  detailButton.onclick=open;
  document.querySelector('#insight-description').after(detailButton);
  const mapHint = document.createElement('p');
  mapHint.className='area-map-hint';mapHint.textContent='Click any grid area to open vegetation, water and land-cover history.';
  document.querySelector('.map-toolbar').after(mapHint);
  window.areaAnalysis = {open, refresh:()=>{if(dialog.open)render();}, buildReport};
})();
