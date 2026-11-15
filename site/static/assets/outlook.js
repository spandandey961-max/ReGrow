/* Conditional planning scenarios; these are not outputs of a crop-suitability model. */
window.regrowOutlook = {
  assess(r, fraction=.25) {
    const a=r.current.area_km2, known=r.current.cells>0;
    return {method:'Conditional land-cover scenario, not a forecast or crop-suitability assessment',
      assumption_fraction_of_exposed: fraction, current_vegetation_km2:known?a[0]:null,
      mapped_exposed_km2:known?a[1]:null, assumed_additional_vegetation_km2:known?a[1]*fraction:null,
      scenario_vegetation_km2:known?a[0]+a[1]*fraction:null,
      excluded_water_and_built_km2:a[2]+a[3],
      unknown_km2:r.total_km2-r.current.included_km2,
      feasible_plantable_area_km2:null, crop_suitability:null,
      regional_crop_examples:['Paddy','Maize','Blackgram','Greengram'],
      crop_source:'https://apseeds.ap.gov.in/Website/Guntur.aspx',
      required_checks:['Parcel access and land use','Soil texture, pH, salinity and contamination','Rainfall and dependable irrigation','Drainage, flood exposure and crop calendar']};
  },
  html(r, fraction=.25) {
    const c=r.current, a=c.area_km2, has=c.cells>0, plan=this.assess(r,fraction);
    const dominant=has?c.n.indexOf(Math.max(...c.n)):-1;
    const title=['Protect existing cover; inspect gaps for regrowth.','Test exposed patches before planning establishment.','Understand the water footprint before planning land use.','Find unsealed ground before considering planting.'][dominant]||'A clearer observation is needed before planning.';
    const context=[
      'Existing vegetation gives a starting point for monitoring retention, seasonal farming or restoration. The cover class combines crops, grass, shrubs and trees; field records must identify which is present.',
      'Mapped exposed ground is an inspection inventory. It may include harvested fields, bare soil or other surfaces. Soil condition, land use and the model’s weak exposed-ground recall limit how much can be inferred.',
      'Visible open water is a reason to assess banks, drainage and flood exposure. It does not establish irrigation supply, water depth or a suitable field for paddy.',
      'Mapped built surfaces are excluded from the planting scenario. Any planting proposal needs verified unsealed land, ownership and compatible land use.'
    ][dominant]||'No cells pass screening at this threshold. The app withholds a numerical planning scenario.';
    const crops=has&&dominant!==2&&dominant!==3;
    return `<article class="area-card future-card" id="future-outlook"><div class="outlook-heading"><span class="area-kicker">FUTURE LAND USE / EXPLORATORY</span><span class="outlook-badge">Scenario · not a forecast</span></div><h3>${title}</h3><p>${context}</p>
      <div class="outlook-facts"><div><span>Existing vegetation</span><strong>${has?fmt(a[0]):'—'} <small>km²</small></strong></div><div><span>Exposed ground to inspect</span><strong>${has?fmt(a[1]):'—'} <small>km²</small></strong></div><div><span>Verified plantable area</span><strong>Not established</strong></div></div>
      ${has?`<div class="scenario-box"><div class="scenario-top"><div><h4>Explore a vegetation establishment scenario</h4><p>Assume a share of the currently mapped exposed ground becomes vegetation.</p></div><output id="scenario-percent" for="outlook-fraction">${Math.round(fraction*100)}%</output></div><label class="sr-only" for="outlook-fraction">Assumed share of mapped exposed ground becoming vegetation</label><input id="outlook-fraction" type="range" min="0" max="100" step="5" value="${fraction*100}" ${a[1]===0?'disabled':''}><div class="scenario-result"><strong id="scenario-addition">+${fmt(plan.assumed_additional_vegetation_km2,3)} km²</strong><span>illustrative additional cover</span><strong id="scenario-total">${fmt(plan.scenario_vegetation_km2,3)} km²</strong><span>illustrative vegetation total</span></div><p class="scenario-note">Arithmetic: current vegetation + assumed fraction × mapped exposed area. This assigns no timeline or success probability. Water, built surfaces and unknown cells are excluded; soil feasibility and legal land use remain unverified. Even the 100% setting is an assumption, not measured capacity.</p></div>`:''}
      <div class="outlook-options"><section><span class="area-kicker">CROPS TO DISCUSS LOCALLY</span><h4>${crops?'Regional examples, subject to field checks':'Establish suitable farmland first'}</h4><p>${crops?'Paddy, maize, blackgram and greengram are regional crop examples from Andhra Pradesh State Seeds. They are an unranked discussion list, not crops predicted as suitable for this grid.':'This observation does not support a crop recommendation. Review any verified farmland within the sector separately from mapped water and built surfaces.'}</p><a href="https://apseeds.ap.gov.in/Website/Guntur.aspx" target="_blank" rel="noreferrer">Regional crop reference ↗</a></section><section><span class="area-kicker">VEGETATION TO INVESTIGATE</span><h4>${dominant===2?'Locally native bank vegetation':'Native ground cover, shrubs and trees'}</h4><p>Discuss locally native grasses and shrubs for ground cover, and mixed native trees where land use and soils support them. Select species with a local forestry or agriculture specialist. The satellite model cannot identify species or predict their survival.</p></section></div>
      <div class="outlook-next"><h4>What turns an idea into a plan?</h4><p>Check soil texture, pH, salinity and contamination; dependable irrigation and rainfall; drainage and flood exposure; land access, parcel boundaries and the sowing calendar. These inputs are needed to estimate crop suitability, yield or feasible vegetation capacity.</p></div></article>`;
  }
};
