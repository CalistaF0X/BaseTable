/**
 * BaseTable
 * Main class for working with the BaseTable
 *
 * @author {string} Calista Verner
 * @version 1.4.2
 * @license MIT
 */

import {Table} from './Table.js';
import {Modal} from './Modal.js';
import {RendererRegistry} from './RendererRegistry.js';

export class BaseTable {
    constructor(adminPanel=null, options={}) {
        this.adminPanel = adminPanel;
        this.options = options || {};
        this.typeRenderers = new Map();
        this.table = new Table(this);
		this.modal = new Modal(this);
		this.renderRegistry = new RendererRegistry(this);

        this._meta = {
            author: 'Calista Verner',
            version: options.version || '1.4.2',
            license: options.license || 'MIT'
        };

        const defaultSelectors = {
            container: options.selectors?.container || 'adminContent',
            tbody: options.selectors?.tbody || 'tbody',
            search: options.selectors?.search || 'search',
            clear: options.selectors?.clear || 'clear',
            count: options.selectors?.count || 'count',
            noResults: options.selectors?.noResults || 'noResults',
            table: options.selectors?.table || 'table',
            add: options.selectors?.add || 'add',
            loading: options.selectors?.loading || 'bt-loading'
        };

        this.selectors = Object.assign({}, defaultSelectors, options.selectors || {});
        this.container = (typeof this.selectors.container === 'string') ? (document.getElementById(this.selectors.container) || document.querySelector(this.selectors.container) || document.body) : (this.selectors.container || document.body);

        this.idField = options.idField || 'id';
        this.columns = options.columns || [];
        this.formSchema = options.formSchema || [];
        this.placeholderLabel = options.placeholderLabel || 'Нет изображения';

        this.apis = Object.assign({
            apiCall: null,
            apiAdd: null,
            apiUpdate: null,
            apiDelete: null,
            refs: {}
        }, options.apis || {});

        this.actions = options.actions || [{
            label: 'Измен.',
            action: 'edit',
            className: 'btn btn-sm btn-outline-primary me-1',
            title: 'Редактировать'
        }, {
            label: 'Удал.',
            action: 'delete',
            className: 'btn btn-sm btn-outline-danger',
            title: 'Удалить'
        }];

        this.ui = Object.assign({
            showLoadingOverlay: true,
            loadingSelector: this.selectors.loading,
            createLoadingElement: null,
            modalBuilder: null,
            formBuilder: null
        }, options.ui || {});

        this.brandTag = options.brandName || (adminPanel && adminPanel.brandName) || 'BaseTable';

        this.data = [];
        this.refs = {};
        this._refsLoading = null;
        this._refsLoaded = false;

        this.state = {
            q: '',
            sortBy: null,
            sortDir: 1
        };

        this._els = {};
        this.bound = {};
        this._modal = null;
        this._isSaving = false;

        // unified listeners registry (for attach/detach)
        this._listeners = [];

        this.options.currency = this.options.currency || 'RUB';

        // small helper bindings
        this._formatNumberToLocale = (n) => {
            try {
                return n.toLocaleString('ru-RU', {
                    maximumFractionDigits: 0
                });
            } catch {
                return String(n);
            }
        }
        ;

        // register default renderers
        this.renderRegistry._registerDefaults();

        // price helpers bound
        this._livePriceInputHandler = this._livePriceInputHandler.bind(this);
        this._priceMaskCleanup = this._priceMaskCleanup.bind(this);
        document.addEventListener('focusin', this._priceMaskHandler);
    }

    _livePriceInputHandler(e) {
        const el = e.target;
        if (!el || el.tagName !== 'INPUT')
            return;
        // naive live formatter: keep only digits, then format to locale with spaces
        const raw = String(el.value || '').replace(/\s+/g, '').replace(/[^\d,.-]/g, '').replace(',', '.');
        const num = Number(raw);
        if (!Number.isFinite(num))
            return;
        const formatted = this._formatNumberToLocale(Math.trunc(num));
        const pos = el.selectionStart || el.value.length;
        el.value = formatted;
        try {
            el.setSelectionRange(el.value.length, el.value.length);
        } catch (_) {}
    }

    _priceMaskCleanup(el) {
        if (!el)
            return;
        // nothing special for plugin cleanup - just mark removed if needed
        if (el.dataset)
            delete el.dataset.priceMaskApplied;
    }

    _applyPriceMaskToElement(el, initialVal) {
        if (!el || el.tagName !== 'INPUT')
            return;
        // if already applied, try to update initial value if provided
        if (el.dataset && el.dataset.priceMaskApplied) {
            if (initialVal === undefined || initialVal === null || String(initialVal) === '')
                return;
            try {
                if (window.jQuery && typeof jQuery.fn.mask === 'function') {
                    jQuery(el).val(String(initialVal)).trigger('input');
                    return;
                }
                if (window.jQuery && typeof jQuery.fn.maskMoney === 'function') {
                    const num = Number(String(initialVal).replace(/\s+/g, '').replace(',', '.')) || 0;
                    jQuery(el).maskMoney('mask', num);
                    return;
                }
            } catch (err) {// plugin error -> fallback below
            }
            // fallback formatting if plugins not available
            try {
                const raw = String(initialVal).replace(/\s+/g, '').replace(',', '.');
                const num = Number(raw);
                if (Number.isFinite(num))
                    el.value = this._formatNumberToLocale(Math.trunc(num));
            } catch (_) {}
            return;
        }

        // mark as applied (first time)
        if (el.dataset)
            el.dataset.priceMaskApplied = '1';

        try {
            if (window.jQuery && typeof jQuery.fn.mask === 'function') {
                jQuery(el).mask('000 000 000 000', {
                    reverse: true
                });
                if (initialVal !== undefined && initialVal !== null && String(initialVal) !== '') {
                    jQuery(el).val(String(initialVal)).trigger('input');
                } else {
                    jQuery(el).trigger('input');
                }
                return;
            }

            if (window.jQuery && typeof jQuery.fn.maskMoney === 'function') {
                jQuery(el).maskMoney({
                    thousands: ' ',
                    decimal: ',',
                    allowZero: true,
                    precision: 0
                });
                if (initialVal !== undefined && initialVal !== null && String(initialVal) !== '') {
                    const num = Number(String(initialVal).replace(/\s+/g, '').replace(',', '.')) || 0;
                    jQuery(el).maskMoney('mask', num);
                } else {
                    jQuery(el).maskMoney('mask');
                }
                return;
            }
        } catch (err) {// plugin error -> fallback
        }

        // fallback: attach input listener for live formatting and format initial value
        const handler = this._livePriceInputHandler;
        el.addEventListener('input', handler);
        this._listeners.push({
            el,
            ev: 'input',
            fn: handler
        });
        // initial formatting
        try {
            const raw = (initialVal !== undefined && initialVal !== null && String(initialVal) !== '') ? String(initialVal).replace(/\s+/g, '').replace(',', '.') : (el.value || '').replace(/\s+/g, '').replace(',', '.');
            const num = Number(raw);
            if (Number.isFinite(num))
                el.value = this._formatNumberToLocale(Math.trunc(num));
        } catch (_) {}
    }

    meta() {
        return {
            ...this._meta
        };
    }

    _logPrefixStyle() {
        return ['background:#0ea5a4;color:#fff;padding:4px 8px;border-radius:6px;font-weight:700', 'color:#374151'];
    }
    _console(method, ...args) {
        try {
            const prefix = `%c ${this.brandTag} %c`;
            console[method](prefix, ...this._logPrefixStyle(), ...args);
        } catch (e) {
            console[method](this.brandTag, ...args);
        }
    }
    log(...args) {
        this._console('log', ...args);
    }
    info(...args) {
        this._console('info', ...args);
    }
    warn(...args) {
        try {
            const p1 = 'background:#f59e0b;color:#fff;padding:4px 8px;border-radius:6px;font-weight:700';
            console.warn(`%c ${this.brandTag} %c`, p1, 'color:#374151', ...args);
        } catch (e) {
            console.warn(this.brandTag, ...args);
        }
    }
    error(...args) {
        try {
            const p1 = 'background:#ef4444;color:#fff;padding:4px 8px;border-radius:6px;font-weight:700';
            console.error(`%c ${this.brandTag} %c`, p1, 'color:#fff', ...args);
        } catch (e) {
            console.error(this.brandTag, ...args);
        }
    }

    _parseToDate(val) {
        if (!val && val !== 0)
            return null;
        if (val instanceof Date)
            return val;
        const tryNumber = (v) => {
            const n = Number(v);
            if (Number.isNaN(n))
                return null;
            const absStr = String(Math.trunc(Math.abs(n)));
            if (absStr.length <= 10)
                return new Date(n * 1000);
            return new Date(n);
        }
        ;
        if (typeof val === 'number')
            return tryNumber(val);
        if (typeof val === 'string') {
            const s = val.trim();
            if (/^[+-]?\d+$/.test(s))
                return tryNumber(s);
            const parsed = Date.parse(s);
            if (!Number.isNaN(parsed))
                return new Date(parsed);
            return null;
        }
        try {
            const j = JSON.stringify(val);
            const parsed = Date.parse(j);
            if (!Number.isNaN(parsed))
                return new Date(parsed);
        } catch (e) {}
        return null;
    }

    static escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, m => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m]));
    }

    placeholderSVG(w=80, h=80, label=null) {
        const text = BaseTable.escapeHtml(label ?? this.placeholderLabel);
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#f2f6fb"/><text x="50%" y="50%" fill="#9aa6bf" font-size="${Math.max(10, Math.round(w / 8))}" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`);
    }

    registerTypeRenderer(type, fn) {
        if (!type || typeof fn !== 'function')
            throw new Error('registerTypeRenderer(type, fn) invalid args');
        this.typeRenderers.set(String(type), fn);
        this.log('Registered renderer:' + type);
    }

    getByPath(obj, path) {
        if (!obj || !path)
            return undefined;
        if (path.indexOf('.') === -1)
            return obj[path];
        return path.split('.').reduce( (cur, p) => (cur && cur[p] !== undefined ? cur[p] : undefined), obj);
    }

    _inferTypeFromValue(val) {
        if (val == null)
            return 'text';
        if (typeof val === 'boolean')
            return 'boolean';
        if (typeof val === 'number')
            return 'number';
        if (val instanceof Date)
            return 'date';
        const s = String(val);
        if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{10,13}$/.test(s))
            return 'date';
        if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(s))
            return 'image';
        if (/^https?:\/\//i.test(s) || /^mailto:/i.test(s) || /^\/\//.test(s))
            return 'link';
        return 'text';
    }

    _valueForField(field, row) {
        if (!field)
            return undefined;
        if (typeof field === 'function')
            return field(row);
        if (typeof field === 'string')
            return this.getByPath(row, field);
        return undefined;
    }

    formatLink(href) {
        return href ? `<a href="${BaseTable.escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${BaseTable.escapeHtml(href)}</a>` : '—';
    }

    formatPrice(v) {
        if (v === null || v === undefined || v === '')
            return '—';
        const n = Number(v);
        if (Number.isNaN(n))
            return String(v);
        return n.toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }

    debounce(fn, ms=200) {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout( () => fn(...a), ms);
        }
        ;
    }

    _create(tag, opts={}) {
        const el = document.createElement(tag);
        if (opts.className)
            el.className = opts.className;
        if (opts.text)
            el.textContent = opts.text;
        if (opts.html)
            el.innerHTML = opts.html;
        if (opts.attrs)
            Object.entries(opts.attrs).forEach( ([k,v]) => el.setAttribute(k, v));
        if (opts.props)
            Object.assign(el, opts.props);
        return el;
    }

    _normalizeListResponse(res) {
        if (!res)
            return [];
        if (Array.isArray(res))
            return res;
        if (res.result && Array.isArray(res.result))
            return res.result;
        if (res.data && Array.isArray(res.data))
            return res.data;
        try {
            if (typeof res === 'string')
                return JSON.parse(res);
        } catch (e) {}
        return [];
    }

    _resolveResponse(res) {
        if (!res)
            return null;
        let candidate = null;
        if (res.item)
            candidate = res.item;
        else if (res.created)
            candidate = res.created;
        else if (res.updated)
            candidate = res.updated;
        else if (res.data)
            candidate = res.data;
        else if (res.result)
            candidate = res.result;
        else
            candidate = res;
        if (Array.isArray(candidate))
            return candidate.length ? candidate[0] : null;
        return candidate;
    }

    _mergeLocalItem(existing, incoming) {
        if (!existing)
            return incoming;
        return Object.assign({}, existing, incoming);
    }

    _ensureEls() {
        const c = this.container || document;
        const sel = this.selectors;
        this._els.tbody = c.querySelector(`#${sel.tbody}`) || c.querySelector(sel.tbody) || this._els.tbody;
        this._els.search = c.querySelector(`#${sel.search}`) || c.querySelector(sel.search) || this._els.search;
        this._els.clear = c.querySelector(`#${sel.clear}`) || c.querySelector(sel.clear) || this._els.clear;
        this._els.count = c.querySelector(`#${sel.count}`) || c.querySelector(sel.count) || this._els.count;
        this._els.noResults = c.querySelector(`#${sel.noResults}`) || c.querySelector(sel.noResults) || this._els.noResults;
        this._els.table = c.querySelector(`#${sel.table}`) || c.querySelector(sel.table) || this._els.table;
        this._els.add = c.querySelector(`#${sel.add}`) || c.querySelector(sel.add) || this._els.add;
        this._els.loading = c.querySelector(`#${this.ui.loadingSelector || sel.loading}`) || c.querySelector(this.ui.loadingSelector || sel.loading) || this._els.loading;
    }

    _createDefaultLoading() {
        const overlay = this._create('div', {
            className: 'bt-loading-overlay',
            attrs: {
                role: 'status',
                'aria-hidden': 'true'
            }
        });
        const inner = this._create('div', {
            className: 'bt-loading-inner',
            attrs: {
                'aria-live': 'polite'
            }
        });
        const spinner = this._create('i', {
            className: 'fa-solid fa-spinner fa-spin bt-fa-spinner',
            attrs: {
                'aria-hidden': 'true'
            }
        });
        const label = this._create('div', {
            className: 'bt-loading-text',
            text: 'Загрузка...'
        });
        inner.appendChild(spinner);
        inner.appendChild(label);
        overlay.appendChild(inner);
        Object.assign(overlay.style, {
            position: 'absolute',
            inset: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.6)',
            zIndex: 9998,
            pointerEvents: 'none'
        });
        Object.assign(inner.style, {
            display: 'inline-flex',
            gap: '10px',
            alignItems: 'center',
            padding: '8px 12px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.95)',
            boxShadow: '0 6px 20px rgba(20,30,50,0.08)',
            pointerEvents: 'auto'
        });
        return overlay;
    }

    showLoading(msg='') {
        if (!this.ui.showLoadingOverlay)
            return;
        this._ensureEls();
        if (typeof this.ui.createLoadingElement === 'function') {
            try {
                if (!this._els._customLoading) {
                    this._els._customLoading = this.ui.createLoadingElement(this._els.table || this.container, msg);
                    if (this._els._customLoading)
                        (this._els.table || this.container || document.body).appendChild(this._els._customLoading);
                }
                if (this._els._customLoading) {
                    this._els._customLoading.style.display = '';
                    this._els._customLoading.setAttribute('aria-hidden', 'false');
                }
            } catch (e) {
                this.error('createLoadingElement error', e);
            }
            return;
        }
        if (!this._els._autoLoading) {
            this._els._autoLoading = this._createDefaultLoading();
            const parent = this._els.table || this.container || document.body;
            const cs = getComputedStyle(parent);
            if (cs.position === 'static')
                parent.style.position = 'relative';
            parent.appendChild(this._els._autoLoading);
        }
        if (msg) {
            const txt = this._els._autoLoading.querySelector('.bt-loading-text');
            if (txt)
                txt.textContent = msg;
        }
        this._els._autoLoading.style.display = 'flex';
        this._els._autoLoading.setAttribute('aria-hidden', 'false');
    }

    hideLoading() {
        setTimeout( () => {
            try {
                if (this._els._customLoading) {
                    this._els._customLoading.style.display = 'none';
                    this._els._customLoading.setAttribute('aria-hidden', 'true');
                }
            } catch (e) {}
            try {
                if (this._els.loading) {
                    this._els.loading.style.display = 'none';
                    this._els.loading.setAttribute('aria-hidden', 'true');
                }
            } catch (e) {}
            try {
                if (this._els._autoLoading) {
                    this._els._autoLoading.style.display = 'none';
                    this._els._autoLoading.setAttribute('aria-hidden', 'true');
                }
            } catch (e) {}
        }
        , 200);
    }

    async fetchItems() {
        try {
            this.showLoading('Загрузка данных...');
            let call = this.apis.apiCall;
            if (!call) {
                if (this.adminPanel?.foxEngine?.sendPostAndGetAnswer) {
                    call = () => this.adminPanel.foxEngine.sendPostAndGetAnswer({
                        sysRequest: "getCategories"
                    }, "JSON");
                } else if (typeof foxEngine !== 'undefined' && foxEngine.sendPostAndGetAnswer) {
                    call = () => foxEngine.sendPostAndGetAnswer({
                        sysRequest: "getCategories"
                    }, "JSON");
                } else
                    throw new Error('apiCall not provided');
            }
            const res = await call();
            const list = this._normalizeListResponse(res);
            this.log('items fetched', (list && list.length) || 0);
            return list;
        } catch (err) {
            this.error('fetchItems error', err);
            return [];
        } finally {
            setTimeout( () => this.hideLoading(), 200);
        }
    }

    createRowFromData(row) {
        const tr = document.createElement('tr');
        if (row[this.idField] !== undefined)
            tr.dataset.id = String(row[this.idField]);

        for (const col of this.columns) {
            const td = document.createElement('td');
            if (col.className)
                td.className = col.className;
            if (col.width)
                td.style.width = col.width;
            if (col.attrs && typeof col.attrs === 'object') {
                Object.entries(col.attrs).forEach( ([k,v]) => td.setAttribute(k, v));
            }

            const val = this.getByPath(row, col.key);

            if (typeof col.renderer === 'function') {
                try {
                    const out = col.renderer(val, row, {
                        table: this,
                        col
                    });
                    if (typeof out === 'string')
                        td.innerHTML = out;
                    else if (out instanceof Node)
                        td.appendChild(out);
                    else
                        td.textContent = out ?? '';
                } catch (e) {
                    this.error('col.renderer error', e);
                    td.textContent = String(val ?? '');
                }
                tr.appendChild(td);
                continue;
            }

            const type = col.type || this._inferTypeFromValue(val);
            const renderer = this.typeRenderers.get(type);
            if (typeof renderer !== 'function') {
                td.textContent = String(val ?? '');
                tr.appendChild(td);
                continue;
            }

            try {
                renderer.call(this, td, val, col, row, {
                    escapeHtml: BaseTable.escapeHtml,
                    formatPrice: this.formatPrice?.bind(this)
                });
            } catch (e) {
                this.error('type renderer error', e);
                td.textContent = String(val ?? '');
            }

            tr.appendChild(td);
        }

        if (this.actions && this.actions.length) {
            const tdActions = document.createElement('td');
            tdActions.className = 'text-end';
            for (const a of this.actions) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = a.className || 'btn btn-sm btn-outline-secondary';
                btn.textContent = a.label;
                if (a.title)
                    btn.title = a.title;
                if (a.action)
                    btn.dataset.action = a.action;
                btn.dataset.id = row[this.idField];
                if (a.attrs)
                    Object.entries(a.attrs).forEach( ([k,v]) => btn.setAttribute(k, v));
                tdActions.appendChild(btn);
                if (typeof a.after === 'function') {
                    try {
                        a.after(btn, row);
                    } catch (e) {
                        this.error('action.after', e);
                    }
                }
            }
            tr.appendChild(tdActions);
        }

        return tr;
    }

    matches(row, q) {
        if (!q)
            return true;
        q = q.toLowerCase();
        for (const col of this.columns) {
            const v = String(row[col.key] ?? '').toLowerCase();
            if (v.includes(q))
                return true;
        }
        if (String(row[this.idField] ?? '').toLowerCase().includes(q))
            return true;
        return false;
    }

    applyFiltersAndRender() {
        let list = (this.data || []).filter(r => this.matches(r, this.state.q));
        if (this.state.sortBy) {
            const key = this.state.sortBy;
            const dir = this.state.sortDir === 1 ? 1 : -1;
            list.sort( (a, b) => {
                let va = a[key]
                  , vb = b[key];
                if (typeof va === 'number' || typeof vb === 'number') {
                    va = Number(va || 0);
                    vb = Number(vb || 0);
                    return (va - vb) * dir;
                }
                va = String(va ?? '').toLowerCase();
                vb = String(vb ?? '').toLowerCase();
                if (va === vb)
                    return 0;
                return va > vb ? dir : -dir;
            }
            );
        }
        this.renderTable(list);
    }

    renderTable(list) {
        this._ensureEls();
        const tbody = this._els.tbody;
        const countEl = this._els.count;
        const noResults = this._els.noResults;
        if (!tbody) {
            this.warn('tbody not found');
            return;
        }

        tbody.innerHTML = '';
        if (!list || !list.length) {
            if (noResults)
                noResults.style.display = '';
            if (countEl)
                countEl.textContent = '0';
            return;
        }
        if (noResults)
            noResults.style.display = 'none';

        const frag = document.createDocumentFragment();
        for (const row of list)
            frag.appendChild(this.createRowFromData(row));
        tbody.appendChild(frag);
        if (countEl)
            countEl.textContent = `${list.length} записей`;
    }

    attachEvents() {
        this._ensureEls();
        const {search, clear, tbody, add} = this._els;

        if (search) {
            this.bound.onSearch = this.debounce( (e) => {
                this.state.q = e.target.value.trim();
                this.applyFiltersAndRender();
            }
            , 180);
            search.addEventListener('input', this.bound.onSearch);
            this._listeners.push({
                el: search,
                ev: 'input',
                fn: this.bound.onSearch
            });
        }
        if (clear) {
            this.bound.onClear = () => {
                if (this._els.search)
                    this._els.search.value = '';
                this.state.q = '';
                this.applyFiltersAndRender();
            }
            ;
            clear.addEventListener('click', this.bound.onClear);
            this._listeners.push({
                el: clear,
                ev: 'click',
                fn: this.bound.onClear
            });
        }

        if (tbody) {
            this.bound.onTbodyClick = async (e) => {
                const btn = e.target.closest('button');
                if (!btn)
                    return;
                const action = btn.dataset.action;
                const tr = btn.closest('tr');
                if (!tr)
                    return;
                const id = tr.dataset.id;
                if (action === 'edit')
                    return this.modal.openEditModal(id);
                if (action === 'delete')
                    return this.openDeleteConfirm(id);
                if (typeof this.onAction === 'function') {
                    try {
                        await this.onAction(action, id, tr);
                    } catch (e) {
                        this.error('onAction error', e);
                    }
                }
            }
            ;
            tbody.addEventListener('click', this.bound.onTbodyClick);
            this._listeners.push({
                el: tbody,
                ev: 'click',
                fn: this.bound.onTbodyClick
            });
        }

        if (add) {
            this.bound.onAdd = () => this.modal.openAddModal();
            add.addEventListener('click', this.bound.onAdd);
            this._listeners.push({
                el: add,
                ev: 'click',
                fn: this.bound.onAdd
            });
        }

        const ths = (this._els.table || document).querySelectorAll('thead th[data-key]');
        this.bound.onHeaderClick = (e) => {
            const th = e.currentTarget;
            const key = th.dataset.key;
            if (!key)
                return;
            if (this.state.sortBy === key)
                this.state.sortDir = -this.state.sortDir;
            else {
                this.state.sortBy = key;
                this.state.sortDir = 1;
            }
            (this._els.table || document).querySelectorAll('.sort-indicator').forEach(el => el.textContent = '');
            const ind = (this._els.table || document).querySelector('#sort-' + key);
            if (ind)
                ind.textContent = this.state.sortDir === 1 ? '▲' : '▼';
            this.applyFiltersAndRender();
        }
        ;
        ths.forEach(th => {
            th.addEventListener('click', this.bound.onHeaderClick);
            this._listeners.push({
                el: th,
                ev: 'click',
                fn: this.bound.onHeaderClick
            });
        }
        );
    }

    detachEvents() {
        for (const l of this._listeners) {
            try {
                l.el.removeEventListener(l.ev, l.fn, l.opts || false);
            } catch (e) {}
        }
        this._listeners = [];
        this.bound = {};
    }

    _ensureModalBuilder() {
        if (typeof this.ui.modalBuilder === 'function')
            return this.ui.modalBuilder(this);
        return this.modal._defaultModalBuilder();
    }

    async fetchRefs() {
        if (this._refsLoading)
            return this._refsLoading;
        if (this._refsLoaded && this.refs && Object.keys(this.refs).length)
            return this.refs;

        const refsMap = this.apis.refs || {};
        const keys = Object.keys(refsMap);
        if (!keys.length) {
            this.refs = {};
            this._refsLoaded = true;
            return {};
        }

        this._refsLoading = (async () => {
            try {
                this.showLoading('Загрузка справочников...');
                const calls = keys.map(k => {
                    const v = refsMap[k];
                    try {
                        if (typeof v === 'function')
                            return Promise.resolve(v());
                        if (v && typeof v.then === 'function')
                            return v;
                        return Promise.resolve(v);
                    } catch (e) {
                        return Promise.resolve([]);
                    }
                }
                );

                const settled = await Promise.allSettled(calls);
                keys.forEach( (k, i) => {
                    const r = settled[i];
                    if (r.status === 'fulfilled')
                        this.refs[k] = this._normalizeListResponse(r.value);
                    else {
                        this.error(`ref "${k}" load failed`, r.reason);
                        this.refs[k] = [];
                    }
                }
                );

                this.log('refs loaded', Object.keys(this.refs).map(k => `${k}(${(this.refs[k] || []).length})`).join(', '));
                this._refsLoaded = true;
                return this.refs;
            } catch (err) {
                this.error('fetchRefs error', err);
                this.refs = {};
                this._refsLoaded = true;
                return {};
            } finally {
                this.hideLoading();
                this._refsLoading = null;
            }
        }
        )();

        return this._refsLoading;
    }

    async _ensureRefLoaded(refKey) {
        if (!refKey)
            return [];
        if (this.refs && Array.isArray(this.refs[refKey]) && this.refs[refKey].length)
            return this.refs[refKey];
        try {
            const refProvider = (this.apis.refs || {})[refKey];
            if (typeof refProvider === 'function') {
                try {
                    const res = await refProvider();
                    this.refs[refKey] = this._normalizeListResponse(res);
                    this.log(`ref "${refKey}" loaded via provider`, (this.refs[refKey] || []).length);
                    return this.refs[refKey];
                } catch (e) {
                    this.error(`ref provider "${refKey}" error`, e);
                }
            }
        } catch (e) {
            this.error(`_ensureRefLoaded error for ${refKey}`, e);
        }
        await this.fetchRefs();
        return this.refs[refKey] || [];
    }

    async _populateSelectFromRef(selectEl, field) {
        if (!selectEl)
            return;
        try {
            const placeholder = selectEl.querySelector('option[aria-placeholder="true"]') || selectEl.querySelector('option:first-child');
            Array.from(selectEl.querySelectorAll('option')).forEach(opt => {
                if (opt === placeholder)
                    return;
                opt.remove();
            }
            );

            let optsSource = field.options || null;
            if (!optsSource && field.ref)
                optsSource = await this._ensureRefLoaded(field.ref);

            if (!optsSource || !optsSource.length) {
                const tmp = document.createElement('option');
                tmp.value = '';
                tmp.disabled = true;
                tmp.selected = true;
                tmp.textContent = field.ref ? 'Нет данных' : 'Нет опций';
                selectEl.appendChild(tmp);
                return;
            }

            for (const o of optsSource) {
                const {value, label} = this._mapOptionValueLabel(o, field);
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = label;
                opt.title = label;
                selectEl.appendChild(opt);
            }

            if (placeholder && placeholder.parentNode === selectEl)
                selectEl.insertBefore(placeholder, selectEl.firstChild);
        } catch (e) {
            this.error('_populateSelectFromRef error', e);
        }
    }

    _mapOptionValueLabel(opt, schemaField={}) {
        if (typeof opt === 'string' || typeof opt === 'number')
            return {
                value: String(opt),
                label: String(opt)
            };
        const valueKey = schemaField.valueKey || schemaField.valueProp || 'name';
        const labelKey = schemaField.labelKey || schemaField.labelProp || 'fullname';
        const candidates = [valueKey, 'value', 'id', 'name'];
        const labelCandidates = [labelKey, 'name', 'fullname', 'label', 'title'];
        let value;
        for (const k of candidates)
            if (opt[k] !== undefined && opt[k] !== null) {
                value = opt[k];
                break;
            }
        let label;
        for (const k of labelCandidates)
            if (opt[k] !== undefined && opt[k] !== null) {
                label = opt[k];
                break;
            }
        if (value === undefined)
            value = (opt.value ?? opt.id ?? opt.name ?? JSON.stringify(opt));
        if (label === undefined)
            label = (opt.name ?? opt.fullname ?? opt.label ?? String(value));
        return {
            value: String(value),
            label: String(label)
        };
    }

    async openDeleteConfirm(id) {
        const wrap = this._create('div');
        wrap.innerHTML = `<p>Вы уверены, что хотите удалить элемент <strong>${this.data.find(r => r.id == id).fullname}</strong>?</p>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-danger btn-confirm">Удалить</button>
        <button class="btn btn-secondary btn-cancel" data-action="cancel">Отмена</button>
      </div>`;
        const modal = this._ensureModalBuilder();
        const m = modal.open('Подтверждение удаления', wrap);
        const confirmBtn = wrap.querySelector('.btn-confirm');
        const cancelBtn = wrap.querySelector('.btn-cancel');
        return new Promise( (resolve) => {
            cancelBtn.addEventListener('click', () => {
                modal.close();
                resolve(false);
            }
            );
            confirmBtn.addEventListener('click', async () => {
                try {
                    if (!this.apis.apiDelete)
                        throw new Error('apiDelete not provided');
                    await this.apis.apiDelete(id);
                    this.data = this.data.filter(d => String(d[this.idField]) !== String(id));
                    this.applyFiltersAndRender();
                    modal.close();
                    this.log('Deleted', id);
                    resolve(true);
                } catch (err) {
                    this.error('delete error', err);
                    alert('Ошибка при удалении. Смотрите консоль.');
                    modal.close();
                    resolve(false);
                }
            }
            , {
                once: true
            });
        }
        );
    }

    async deleteRow(id) {
        if (!confirm('Вы уверены, что хотите удалить элемент?'))
            return;
        try {
            const res = await this.apis.apiDelete(id);
            const ok = (res === true) || (res && (res.success === true || res.ok === true || res.deleted === id));
            if (!ok)
                this.warn('delete returned ambiguous response', res);
            this.data = this.data.filter(d => String(d[this.idField]) !== String(id));
            this.applyFiltersAndRender();
        } catch (err) {
            this.error('deleteRow error', err);
            alert('Ошибка при удалении. Смотрите консоль.');
        }
    }

    async init() {
        this._ensureEls();
        await this.fetchRefs();
        const items = await this.fetchItems();
        this.data = Array.isArray(items) ? items.map(it => ({
            ...it
        })) : [];
        this.attachEvents();
        this.applyFiltersAndRender();
        this.log('initialized', this.meta());
        return this;
    }

    async refresh() {
        await this.fetchRefs();
        const items = await this.fetchItems();
        this.data = Array.isArray(items) ? items.map(it => ({
            ...it
        })) : [];
        this.applyFiltersAndRender();
        this.log('refreshed');
    }

    clearRefs() {
        this.refs = {};
        this._refsLoaded = false;
        this._refsLoading = null;
        this.log('refs cache cleared');
    }

    destroy() {
        this.detachEvents();
        if (this._modal)
            this.modal._closeModal();
        try {
            if (this._els._customLoading)
                this._els._customLoading.remove();
        } catch (e) {}
        try {
            if (this._els._autoLoading)
                this._els._autoLoading.remove();
        } catch (e) {}
        // cleanup price mask listeners (best-effort)
        try {
            document.querySelectorAll('input.bt-field-price').forEach(el => {
                el.removeEventListener('input', this._livePriceInputHandler);
                this._priceMaskCleanup(el);
            }
            );
        } catch (e) {}
        this._els = {};
        this.data = [];
        this.refs = {};
        this.state = {
            q: '',
            sortBy: null,
            sortDir: 1
        };
        this.log('destroyed');
    }
}
