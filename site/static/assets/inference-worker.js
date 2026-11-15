let resources;
async function unpack(name) {
  const response = await fetch(new URL(name, import.meta.url));
  if (!response.ok) throw new Error('A required model file could not load.');
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
}
export function score(row, forest) {
  const probabilities = [0,0,0,0];
  for (const tree of forest.trees) {
    let node = 0;
    while (tree.l[node] !== -1) node = row[tree.f[node]] <= tree.t[node] ? tree.l[node] : tree.r[node];
    for (let k=0; k<4; k++) probabilities[k] += tree.v[node][k] / forest.trees.length;
  }
  let cls = 0;
  for (let k=1; k<4; k++) if (probabilities[k] > probabilities[cls]) cls = k;
  return [cls, Math.round(probabilities[cls]*1000)/1000];
}
export function predict(scene, forest) {
  const started = performance.now(), classes = [], confidence = [];
  for (let i=0; i<scene.features.length; i++) {
    if (scene.classes[i] < 0) { classes.push(-1); confidence.push(0); }
    else { const [cls, value] = score(scene.features[i], forest); classes.push(cls); confidence.push(value); }
  }
  return {date:scene.date, classes, confidence, cells:classes.length,
    elapsed_ms:Math.round(performance.now()-started), algorithm:'Random Forest',
    trees:forest.trees.length, runtime:'Browser Web Worker',
    scope:'Optical reference-map classification, not NISAR radar inference.'};
}
if (typeof self !== 'undefined') self.onmessage = async ({data}) => {
  try {
    if (typeof data.date !== 'string' || data.date.length > 20) throw new Error('Select a valid observation date.');
    resources ??= Promise.all([unpack('inference-inputs.json.gz'), unpack('forest.json.gz')]).catch(error => { resources = null; throw error; });
    const [inputs, forest] = await resources;
    const scene = inputs.scenes.find(item => item.date === data.date);
    if (!scene) throw new Error('Observation not found.');
    self.postMessage({id:data.id, result:predict(scene, forest)});
  } catch (error) { self.postMessage({id:data.id, error:error.message}); }
};
