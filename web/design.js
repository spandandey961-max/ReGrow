/* Theme and model evidence presentation. No field records are collected here. */
(() => {
  const root=document.documentElement, toggle=document.querySelector('#theme-toggle');
  function syncTheme(){const dark=root.dataset.theme==='dark';toggle.setAttribute('aria-pressed',String(dark));toggle.innerHTML=dark?'☀ <span>Light mode</span>':'◐ <span>Dark mode</span>';document.querySelector('meta[name="theme-color"]').content=dark?'#000000':'#f5f4ee';}
  toggle.onclick=()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('regrow-theme',root.dataset.theme);}catch{}syncTheme();};
  syncTheme();
  window.regrowDesign={renderModel(){
    const r=state.data.report, classes=['Vegetation','Exposed ground','Water','Built surfaces'];
    document.querySelector('#model-class-table').innerHTML='<thead><tr><th>Reference class</th><th>Precision</th><th>Recall</th><th>F1</th><th>Test cells</th></tr></thead><tbody>'+classes.map(name=>{const c=r.classes[name];return `<tr><th scope="row">${name}</th><td>${pct(c.precision)}</td><td>${pct(c.recall)}</td><td>${c['f1-score'].toFixed(3)}</td><td>${c.support.toLocaleString()}</td></tr>`;}).join('')+'</tbody>';
    document.querySelector('#model-split-detail').innerHTML=`<div><strong>12,988</strong><span>fit cells for the three parameter trials</span></div><div><strong>${r.validation_samples.toLocaleString()}</strong><span>validation cells to choose settings</span></div><div><strong>${r.train_samples.toLocaleString()}</strong><span>development cells for the final refit</span></div><div><strong>${r.test_samples.toLocaleString()}</strong><span>held-out cells for the reported evaluation</span></div>`;
    document.querySelector('#model-parameters').textContent=`${r.trees} trees · maximum depth ${r.max_depth} · minimum leaf ${r.min_samples_leaf} · random seed ${r.seed}. Class weighting balances each tree's training sample. Parameters were selected using validation macro F1.`;
  }};
})();
