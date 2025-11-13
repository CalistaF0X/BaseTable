export class Fetcher {
	constructor(baseTable){
		this.baseTable = baseTable;
	}
	
	async fetchRefs() {
    if (this.baseTable._refsLoading) return this.baseTable._refsLoading;
    if (this.baseTable._refsLoaded && this.baseTable.refs && Object.keys(this.baseTable.refs).length) return this.baseTable.refs;

    const refsMap = this.baseTable.apis.refs || {};
    const keys = Object.keys(refsMap);
    if (!keys.length) { this.baseTable.refs = {}; this.baseTable._refsLoaded = true; return {}; }

    this.baseTable._refsLoading = (async () => {
      try {
        this.baseTable.showLoading('Загрузка справочников...');
        const calls = keys.map(k => {
          const v = refsMap[k];
          try { if (typeof v === 'function') return Promise.resolve(v()); if (v && typeof v.then === 'function') return v; return Promise.resolve(v); } catch (e) { return Promise.resolve([]); }
        });

        const settled = await Promise.allSettled(calls);
        keys.forEach((k, i) => {
          const r = settled[i];
          if (r.status === 'fulfilled') this.baseTable.refs[k] = this.baseTable._normalizeListResponse(r.value); else { this.baseTable.error(`ref "${k}" load failed`, r.reason); this.baseTable.refs[k] = []; }
        });

        this.baseTable.log('refs loaded', Object.keys(this.baseTable.refs).map(k => `${k}(${(this.baseTable.refs[k] || []).length})`).join(', '));
        this.baseTable._refsLoaded = true;
        return this.baseTable.refs;
      } catch (err) {
        this.baseTable.error('fetchRefs error', err);
        this.baseTable.refs = {};
        this.baseTable._refsLoaded = true;
        return {};
      } finally { this.baseTable.hideLoading(); this.baseTable._refsLoading = null; }
    })();

    return this.baseTable._refsLoading;
  }
  
    async fetchItems() {
    try {
      this.baseTable.showLoading('Загрузка данных...');
      let call = this.baseTable.apis.apiCall;
      if (!call) {
        if (this.baseTable.adminPanel?.foxEngine?.sendPostAndGetAnswer) call = () => this.baseTable.adminPanel.foxEngine.sendPostAndGetAnswer({ sysRequest: 'getCategories' }, 'JSON');
        else if (typeof foxEngine !== 'undefined' && foxEngine.sendPostAndGetAnswer) call = () => foxEngine.sendPostAndGetAnswer({ sysRequest: 'getCategories' }, 'JSON');
        else throw new Error('apiCall not provided');
      }
      const res = await call();
      const list = this.baseTable._normalizeListResponse(res);
      this.baseTable.log('items fetched', (list && list.length) || 0);
      return list;
    } catch (err) {
      this.baseTable.error('fetchItems error', err);
      return [];
    } finally { setTimeout(() => this.baseTable.hideLoading(), 200); }
  }
}