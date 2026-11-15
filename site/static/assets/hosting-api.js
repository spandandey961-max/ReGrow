/* Static-hosting adapter: model inference runs in a separate browser thread. */
window.ReGrowHosting = (() => {
  let worker, sequence = 0;
  const pending = new Map();
  function failAll(message) {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(message)); }
    pending.clear();
    worker?.terminate(); worker = null;
  }
  function getWorker() {
    if (!worker) {
      worker = new Worker(new URL('assets/inference-worker.js',document.baseURI), {type:'module'});
      worker.onmessage = ({data}) => {
        const item = pending.get(data.id);
        if (!item) return;
        clearTimeout(item.timer); pending.delete(data.id);
        if (data.error) item.reject(new Error(data.error)); else item.resolve(data.result);
      };
      worker.onerror = () => failAll('The browser model could not load. Please reload and try again.');
      worker.onmessageerror = () => failAll('The browser could not read the model result.');
    }
    return worker;
  }
  return {
    async request(route, options = {}) {
      if (route === '/api/data') {
        const response = await fetch(new URL('assets/observations.json.gz',document.baseURI));
        if (!response.ok) throw new Error('Study observations could not load.');
        const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream, {headers:{'content-type':'application/json'}});
      }
      if (route !== '/api/predict') throw new Error('Unknown model operation.');
      const body = JSON.parse(options.body || '{}');
      const modelWorker = getWorker(), id = ++sequence;
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => failAll('The model took too long. Please try again.'), 90000);
        pending.set(id, {resolve, reject, timer});
        modelWorker.postMessage({id, date:body.date});
      });
      return new Response(JSON.stringify(result), {headers:{'content-type':'application/json'}});
    }
  };
})();
