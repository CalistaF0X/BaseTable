/**
 * BaseTable
 * Table build utilities
 *
 * @author {string} Calista Verner
 * @version 1.4.2
 * @license MIT
 */

export class Table {

    constructor(baseTable) {
        this.baseTable = baseTable;
    }

    createRowFromData(row) {
        const tr = document.createElement('tr');
        if (row[this.baseTable.idField] !== undefined) tr.dataset.id = String(row[this.baseTable.idField]);

        for (const col of this.baseTable.columns) {
            const td = document.createElement('td');
            if (col.className) td.className = col.className;
            if (col.width) td.style.width = col.width;
            if (col.attrs && typeof col.attrs === 'object') {
                Object.entries(col.attrs).forEach(([k, v]) => td.setAttribute(k, v));
            }

            const val = this.getByPath(row, col.key);

            if (typeof col.renderer === 'function') {
                try {
                    const out = col.renderer(val, row, {
                        table: this.baseTable,
                        col
                    });
                    if (typeof out === 'string') td.innerHTML = out;
                    else if (out instanceof Node) td.appendChild(out);
                    else td.textContent = out ?? '';
                } catch (e) {
                    this.baseTable.error('col.renderer error', e);
                    td.textContent = String(val ?? '');
                }
                tr.appendChild(td);
                continue;
            }

            const type = col.type || this._inferTypeFromValue(val);
            const renderer = this.baseTable.typeRenderers.get(type);
            if (typeof renderer !== 'function') {
                td.textContent = String(val ?? '');
                tr.appendChild(td);
                continue;
            }

            try {
                renderer.call(this.baseTable, td, val, col, row, {
                    escapeHtml: BaseTable.escapeHtml,
                    formatPrice: this.formatPrice?.bind(this.baseTable)
                });
            } catch (e) {
                this.baseTable.error('type renderer error', e);
                td.textContent = String(val ?? '');
            }

            tr.appendChild(td);
        }

        if (this.baseTable.actions && this.baseTable.actions.length) {
            const tdActions = document.createElement('td');
            tdActions.className = 'text-end';
            for (const a of this.baseTable.actions) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = a.className || 'btn btn-sm btn-outline-secondary';
                btn.textContent = a.label;
                if (a.title) btn.title = a.title;
                if (a.action) btn.dataset.action = a.action;
                btn.dataset.id = row[this.baseTable.idField];
                if (a.attrs) Object.entries(a.attrs).forEach(([k, v]) => btn.setAttribute(k, v));
                tdActions.appendChild(btn);
                if (typeof a.after === 'function') {
                    try {
                        a.after(btn, row);
                    } catch (e) {
                        this.baseTable.error('action.after', e);
                    }
                }
            }
            tr.appendChild(tdActions);
        }

        return tr;
    }

    getByPath(obj, path) {
        if (!obj || !path) return undefined;
        if (path.indexOf('.') === -1) return obj[path];
        return path.split('.').reduce((cur, p) => (cur && cur[p] !== undefined ? cur[p] : undefined), obj);
    }

    _inferTypeFromValue(val) {
        if (val == null) return 'text';
        if (typeof val === 'boolean') return 'boolean';
        if (typeof val === 'number') return 'number';
        if (val instanceof Date) return 'date';
        const s = String(val);
        if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{10,13}$/.test(s)) return 'date';
        if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(s)) return 'image';
        if (/^https?:\/\//i.test(s) || /^mailto:/i.test(s) || /^\/\//.test(s)) return 'link';
        return 'text';
    }

    formatPrice(v) {
        if (v === null || v === undefined || v === '') return '—';
        const n = Number(v);
        if (Number.isNaN(n)) return String(v);
        return n.toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }

    _buildFormFromSchema(item = {}) {
        if (typeof this.baseTable.ui.formBuilder === 'function') {
            try {
                return this.baseTable.ui.formBuilder(this.baseTable.formSchema, item, this.baseTable.refs, {
                    placeholderSVG: this.baseTable.placeholderSVG.bind(this.baseTable)
                });
            } catch (e) {
                this.baseTable.error('ui.formBuilder error', e);
            }
        }

        const form = document.createElement('form');
        form.className = 'bt-dynamic-form pe-form';

        const grid = document.createElement('div');
        grid.className = 'bt-form-grid';

        if (!document.getElementById('bt-form-grid-style')) {
            const mediaStyle = document.createElement('style');
            mediaStyle.id = 'bt-form-grid-style';
            mediaStyle.textContent = `.bt-form-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; } @media (max-width: 720px) { .bt-form-grid { grid-template-columns: 1fr; } }`;
            document.head.appendChild(mediaStyle);
        }

        const fieldMap = {};
        const groups = {};
        (this.baseTable.formSchema || []).forEach(f => {
            const g = f.group || '__default';
            if (!groups[g])
                groups[g] = [];
            groups[g].push(f);
        });

        const makeFieldCard = (title) => {
            const card = document.createElement('div');
            card.className = 'bt-field-card';
            Object.assign(card.style, {
                padding: '10px',
                borderRadius: '10px',
                background: '#fff',
                border: '1px solid #eef4fb',
                boxShadow: '0 6px 18px rgba(12,20,40,0.02)'
            });
            return card;
        };

        const makeRow = (field) => {
            const wrap = document.createElement('div');
            wrap.className = 'bt-form-row';

            if (field.type !== 'hidden') {
                const labelRow = document.createElement('div');
                Object.assign(labelRow.style, {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                });
                const label = document.createElement('label');
                label.className = 'form-label';
                label.textContent = field.label || field.name || '';
                Object.assign(label.style, {
                    fontWeight: 600,
                    fontSize: '0.95rem'
                });
                labelRow.appendChild(label);
                if (field.hint) {
                    const hint = document.createElement('div');
                    hint.className = 'form-hint';
                    hint.textContent = field.hint;
                    Object.assign(hint.style, {
                        fontSize: '0.82rem',
                        color: '#6b7280'
                    });
                    labelRow.appendChild(hint);
                }
                if (field.required) {
                    const star = document.createElement('span');
                    star.style.color = '#ef4444';
                    star.textContent = ' *';
                    label.appendChild(star);
                }
                wrap.appendChild(labelRow);
            }

            let control;
            const attrs = field.attrs || {};
            switch (field.type) {
                case 'textarea':
                    control = document.createElement('textarea');
                    control.rows = attrs.rows || 4;
                    control.className = attrs.className || 'form-control';
                    if (field.placeholder)
                        control.placeholder = field.placeholder;
                    break;

                case 'number':
                    control = document.createElement('input');
                    control.type = 'number';
                    control.className = attrs.className || 'form-control';
                    if (field.placeholder)
                        control.placeholder = field.placeholder;
                    if (attrs.min !== undefined)
                        control.min = attrs.min;
                    if (attrs.step !== undefined)
                        control.step = attrs.step;
                    break;

                case 'price': {
                    // wrapper (bootstrap-like input-group)
                    const wrapper = document.createElement('div');
                    wrapper.className = attrs.wrapperClass || 'input-group';

                    // currency symbol (from field.currency or options.currency)
                    const currencyCode = (field.currency || this.baseTable.options.currency || 'RUB').toUpperCase();
                    const currencySymbols = {
                        RUB: '₽',
                        RUBLES: '₽',
                        USD: '$',
                        EUR: '€',
                        GBP: '£'
                    };
                    const currencySign = field.currencySign || (currencySymbols[currencyCode] || currencyCode);

                    const prefix = document.createElement('span');
                    prefix.className = attrs.prefixClass || 'input-group-text';
                    prefix.setAttribute('aria-hidden', 'true');
                    prefix.textContent = currencySign;

                    // visible (formatted) input for user interaction
                    const visible = document.createElement('input');
                    visible.type = 'text';
                    visible.className = (attrs.className ? attrs.className + ' ' : '') + 'form-control bt-field-price-visible';
                    if (field.placeholder)
                        visible.placeholder = field.placeholder;
                    visible.setAttribute('inputmode', 'numeric');
                    visible.setAttribute('autocomplete', 'off');
                    visible.setAttribute('aria-label', field.label || field.name || 'Цена');

                    // hidden input that will actually carry the numeric value for the form
                    const hidden = document.createElement('input');
                    hidden.type = 'hidden';
                    // name will be set on hidden below via fieldMap assignment (so form submits numeric value)
                    hidden.className = 'bt-field-price-hidden';

                    // append to wrapper
                    wrapper.appendChild(prefix);
                    wrapper.appendChild(visible);
                    wrapper.appendChild(hidden);

                    // helper: parse formatted string -> number
                    const parseToNumber = (s) => {
                        if (s === '' || s === null || s === undefined)
                            return null;
                        try {
                            const cleaned = String(s).replace(/\s+/g, '').replace(/\u00A0/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
                            const n = Number(cleaned);
                            return Number.isFinite(n) ? n : null;
                        } catch (e) {
                            return null;
                        }
                    };

                    // sync visible -> hidden (set hidden.value as raw numeric string; set data-raw on visible)
                    const syncToHidden = (valStr) => {
                        const n = parseToNumber(valStr);
                        if (n === null) {
                            hidden.value = '';
                            visible.removeAttribute('data-raw');
                        } else {
                            // keep integer if user wants 0 decimals; allow fraction if provided (field.precision)
                            const precision = Number.isFinite(field.precision) ? Math.max(0, field.precision) : 0;
                            const raw = precision ? (Math.round(n * Math.pow(10, precision)) / Math.pow(10, precision)) : Math.trunc(n);
                            hidden.value = String(raw);
                            visible.setAttribute('data-raw', String(raw));
                        }
                    };

                    // try to prefer jQuery plugins if available
                    let pluginApplied = false;
                    const initialVal = item[field.name];

                    try {
                        if (window.jQuery) {
                            const $v = jQuery(visible);

                            // maskMoney (common for currency)
                            if (typeof jQuery.fn.maskMoney === 'function') {
                                $v.maskMoney({
                                    thousands: ' ',
                                    decimal: ',',
                                    allowZero: true,
                                    precision: field.precision ?? 0
                                });
                                if (initialVal !== undefined && initialVal !== null && String(initialVal) !== '') {
                                    const num = Number(String(initialVal).toString().replace(/\s+/g, '').replace(',', '.')) || 0;
                                    $v.maskMoney('mask', num);
                                    syncToHidden(String(num));
                                } else {
                                    $v.maskMoney('mask');
                                }
                                // update hidden on change/input
                                $v.on('mask.maskMoney input change', () => {
                                    syncToHidden($v.val());
                                });
                                pluginApplied = true;
                            } // jQuery Mask plugin (RobinHerbots jQuery Mask) — supports reverse option
                            else if (typeof jQuery.fn.mask === 'function') {
                                try {
                                    $v.mask('000 000 000 000 000', {
                                        reverse: true
                                    });
                                } catch (e) {
                                    // fallback mask pattern if plugin expects different signature
                                    $v.mask('999 999 999 999 999', {
                                        reverse: true
                                    });
                                }
                                if (initialVal !== undefined && initialVal !== null && String(initialVal) !== '') {
                                    $v.val(String(initialVal)).trigger('input');
                                    syncToHidden($v.val());
                                }
                                $v.on('input change', () => syncToHidden($v.val()));
                                pluginApplied = true;
                            } // maskedInput (older plugin names) — try common fn name
                            else if (typeof jQuery.fn.maskedInput === 'function' || typeof jQuery.fn.masked === 'function') {
                                // best-effort: apply a numeric mask (not ideal for arbitrary length)
                                try {
                                    if (typeof jQuery.fn.maskedInput === 'function')
                                        jQuery(visible).maskedInput('999999999999');
                                    else
                                        jQuery(visible).masked('999999999999');
                                } catch (e) {}
                                if (initialVal !== undefined && initialVal !== null && String(initialVal) !== '') {
                                    $v.val(String(initialVal)).trigger('input');
                                    syncToHidden($v.val());
                                }
                                $v.on('input change', () => syncToHidden($v.val()));
                                pluginApplied = true;
                            }
                        }
                    } catch (e) {
                        // plugin error -> fallback to JS handler below
                        pluginApplied = false;
                    }

                    // fallback: simple live formatter (thousands by spaces) if plugin not applied
                    const liveHandler = (ev) => {
                        const raw = String(visible.value || '').replace(/\s+/g, '').replace(/[^\d,.-]/g, '').replace(',', '.');
                        const num = parseToNumber(raw);
                        if (num === null) {
                            // keep user input but don't break caret too much
                            syncToHidden(visible.value);
                            return;
                        }
                        // format to locale-like thousands with no decimals by default (or keep precision)
                        const precision = Number.isFinite(field.precision) ? Math.max(0, field.precision) : 0;
                        let display;
                        try {
                            if (precision > 0)
                                display = num.toLocaleString('ru-RU', {
                                    minimumFractionDigits: precision,
                                    maximumFractionDigits: precision
                                });
                            else
                                display = Math.trunc(num).toLocaleString('ru-RU');
                        } catch (e) {
                            display = String(Math.trunc(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                        }

                        // try to preserve caret by setting to end (simple)
                        visible.value = display;
                        try {
                            visible.setSelectionRange(visible.value.length, visible.value.length);
                        } catch (_) {}
                        syncToHidden(display);
                    };

                    if (!pluginApplied) {
                        visible.addEventListener('input', liveHandler);
                        this.baseTable._listeners.push({
                            el: visible,
                            ev: 'input',
                            fn: liveHandler
                        });
                        // format initial
                        try {
                            if (initialVal !== undefined && initialVal !== null && String(initialVal) !== '') {
                                const n = parseToNumber(String(initialVal));
                                if (n !== null) {
                                    const precision = Number.isFinite(field.precision) ? Math.max(0, field.precision) : 0;
                                    visible.value = precision > 0 ? n.toLocaleString('ru-RU', {
                                        minimumFractionDigits: precision,
                                        maximumFractionDigits: precision
                                    }) : Math.trunc(n).toLocaleString('ru-RU');
                                    syncToHidden(visible.value);
                                } else {
                                    visible.value = String(initialVal);
                                    syncToHidden(visible.value);
                                }
                            }
                        } catch (e) {}
                    }

                    // when clicking prefix focus visible input
                    prefix.addEventListener('click', () => {
                        try {
                            visible.focus();
                        } catch (e) {}
                    });
                    this.baseTable._listeners.push({
                        el: prefix,
                        ev: 'click',
                        fn: () => {
                            try {
                                visible.focus();
                            } catch (e) {}
                        }
                    });

                    // expose visible as the UI control for population, but the hidden carries the name
                    // we must register both in fieldMap: visible for UI updates, hidden for form data
                    fieldMap[field.name] = visible;
                    // later population code will use visible (formatting)
                    // set hidden's name so FormData uses numeric value
                    hidden.name = field.name;
                    // also set ids for both (use distinct ids)
                    visible.id = `bt-field-${field.name}-visible`;
                    hidden.id = `bt-field-${field.name}`;
                    // append wrapper to DOM in place of simple control
                    wrap.appendChild(wrapper);
                    // note: `wrap` is outer row element created earlier in makeRow
                    // return early like select case (so global post-switch name/id/aria setting is not applied to visible)
                    return wrap;
                }

                case 'select': {
                    const selectWrap = document.createElement('div');
                    Object.assign(selectWrap.style, {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                    });
                    let searchInput = null;
                    if (field.searchable) {
                        searchInput = document.createElement('input');
                        searchInput.type = 'search';
                        searchInput.placeholder = 'Поиск...';
                        searchInput.className = 'form-control form-control-sm';
                        searchInput.style.width = '100%';
                        selectWrap.appendChild(searchInput);
                    }
                    control = document.createElement('select');
                    control.className = attrs.className || 'form-select';
                    control.name = field.name;
                    control.style.width = '100%';
                    control.setAttribute('aria-label', field.label || field.name || '');
                    const placeholderOption = document.createElement('option');
                    placeholderOption.value = '';
                    placeholderOption.textContent = field.placeholder ?? '—';
                    placeholderOption.setAttribute('aria-placeholder', 'true');
                    control.appendChild(placeholderOption);
                    const opts = field.options || (field.ref ? (this.baseTable.refs[field.ref] ?? null) : null);
                    let populatePromise = null;
                    if (opts && opts.length) {
                        for (const o of opts) {
                            const {
                                value,
                                label
                            } = this.baseTable._mapOptionValueLabel(o, field);
                            const optEl = document.createElement('option');
                            optEl.value = value;
                            optEl.textContent = label;
                            optEl.title = label;
                            control.appendChild(optEl);
                        }
                    } else {
                        const tmp = document.createElement('option');
                        tmp.value = '';
                        tmp.disabled = true;
                        tmp.selected = true;
                        tmp.textContent = field.ref ? 'Загрузка...' : 'Нет данных';
                        control.appendChild(tmp);
                        if (field.ref) {
                            populatePromise = (async () => {
                                try {
                                    await this.baseTable._ensureRefLoaded(field.ref);
                                } catch (e) {}
                                try {
                                    await this.baseTable._populateSelectFromRef(control, field);
                                } catch (e) {
                                    this.baseTable.error('_populateSelectFromRef async error', e);
                                }
                            })();
                        }
                    }
                    control._populatePromise = populatePromise;
                    if (searchInput) {
                        const onSearch = (e) => {
                            const q = String(e.target.value || '').toLowerCase().trim();
                            Array.from(control.options).forEach(opt => {
                                if (opt.getAttribute('aria-placeholder') === 'true')
                                    return opt.hidden = false;
                                const label = (opt.textContent || '').toLowerCase();
                                opt.hidden = q ? !label.includes(q) : false;
                            });
                            if (control.selectedOptions.length && control.selectedOptions[0].hidden)
                                control.value = '';
                        };
                        searchInput.addEventListener('input', onSearch);
                        this.baseTable._listeners.push({
                            el: searchInput,
                            ev: 'input',
                            fn: onSearch
                        });
                    }
                    selectWrap.appendChild(control);
                    wrap.appendChild(selectWrap);
                    fieldMap[field.name] = control;
                    return wrap;
                }

                case 'checkbox': {
                    control = document.createElement('input');
                    control.type = 'checkbox';
                    control.className = attrs.className || 'form-check-input';
                    const chkRow = document.createElement('div');
                    Object.assign(chkRow.style, {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    });
                    chkRow.appendChild(control);
                    if (field.note) {
                        const note = document.createElement('div');
                        note.textContent = field.note;
                        Object.assign(note.style, {
                            fontSize: '0.92rem',
                            color: '#374151'
                        });
                        chkRow.appendChild(note);
                    }
                    wrap.appendChild(chkRow);
                    fieldMap[field.name] = control;
                    return wrap;
                }

                case 'date':
                    control = document.createElement('input');
                    control.type = 'date';
                    control.className = attrs.className || 'form-control';
                    break;

   case 'image': {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'grid',
    gridTemplateColumns: '1fr 220px',
    gap: '14px',
    alignItems: 'start'
  });

  const control = document.createElement('input');
  control.type = 'hidden';
  control.className = attrs.className || 'form-control';
  control.name = field.name;

  const dropArea = document.createElement('div');
  dropArea.className = 'bt-drop';
  dropArea.innerHTML = `
    <div class="bt-drop-icon" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 3v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7l4-4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 15v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="bt-drop-text">Перетащите изображения или кликните</div>
    <div class="bt-drop-sub">Поддерживаются JPG, PNG, WEBP. Макс. размер: 5 MB</div>
  `;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.style.display = 'none';

  const previewWrap = document.createElement('div');
  previewWrap.className = 'pe-right';
  const previewContainer = document.createElement('div');
  previewContainer.className = 'bt-preview-list';
  previewContainer.style.display = 'grid';
  previewContainer.style.gap = '10px';
  previewContainer.style.maxHeight = '60vh';
  previewContainer.style.overflow = 'auto';
  previewWrap.appendChild(previewContainer);

  const controls = document.createElement('div');
  controls.className = 'bt-controls';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'bt-btn ghost';
  resetBtn.textContent = 'Сбросить';
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'bt-btn primary';
  openBtn.textContent = 'Открыть';
  controls.appendChild(resetBtn);
  controls.appendChild(openBtn);
  previewWrap.appendChild(controls);

  const uploads = []; // records

  const placeholder = (this.baseTable && typeof this.baseTable.placeholderSVG === 'function')
    ? this.baseTable.placeholderSVG(360, 180)
    : '';

  const syncControl = () => {
    const paths = uploads.filter(u => u.serverPath).map(u => u.serverPath);
    try { control.value = JSON.stringify(paths); } catch (e) { control.value = '[]'; }
    control.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const makePreviewItem = (fileOrUrl, id, isExisting = false) => {
    const container = document.createElement('div');
    container.className = 'bt-preview-item';
    Object.assign(container.style, { display: 'flex', gap: '10px', alignItems: 'center' });

    const img = document.createElement('img');
    img.className = 'bt-preview-thumb';
    img.width = 120; img.height = 80; img.style.objectFit = 'cover';
    img.alt = typeof fileOrUrl === 'string' ? (fileOrUrl.split('/').pop() || 'preview') : (fileOrUrl.name || 'preview');
    img.src = placeholder;

    const meta = document.createElement('div');
    meta.style.flex = '1 1 auto';

    const nameEl = document.createElement('div');
    nameEl.className = 'bt-preview-name';
    nameEl.textContent = typeof fileOrUrl === 'string' ? (fileOrUrl.split('/').pop() || 'Файл') : (fileOrUrl.name || 'Файл');

    const progressWrap = document.createElement('div');
    progressWrap.className = 'bt-progress-wrap small';
    progressWrap.style.marginTop = '6px';
    const progressBar = document.createElement('div');
    progressBar.className = 'bt-progress';
    const progressFill = document.createElement('div');
    progressFill.className = 'bt-progress-fill';
    progressFill.style.width = '0%';
    progressBar.appendChild(progressFill);
    const progressPercent = document.createElement('div');
    progressPercent.className = 'bt-progress-percent';
    progressPercent.textContent = '0%';
    progressWrap.appendChild(progressBar);
    progressWrap.appendChild(progressPercent);

    const status = document.createElement('div');
    status.className = 'bt-status bt-small';
    status.textContent = isExisting ? 'Готово' : '';

    meta.appendChild(nameEl);
    meta.appendChild(progressWrap);
    meta.appendChild(status);

    const btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.flexDirection = 'column';
    btns.style.gap = '6px';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button'; btnCancel.className = 'bt-btn ghost'; btnCancel.textContent = 'Отменить';
    const btnRetry = document.createElement('button');
    btnRetry.type = 'button'; btnRetry.className = 'bt-btn primary'; btnRetry.textContent = 'Повторить'; btnRetry.style.display = 'none';
    const btnRemove = document.createElement('button');
    btnRemove.type = 'button'; btnRemove.className = 'bt-btn ghost'; btnRemove.textContent = 'Удалить';

    btns.appendChild(btnCancel);
    btns.appendChild(btnRetry);
    btns.appendChild(btnRemove);

    container.appendChild(img);
    container.appendChild(meta);
    container.appendChild(btns);

    return { container, img, progressFill, progressPercent, status, btnCancel, btnRetry, btnRemove, nameEl };
  };

  const uploadSingle = (file, uploadRecord) => {
    return new Promise((resolve, reject) => {
      if (!(file instanceof File)) return reject(new Error('uploadSingle expects File'));
      if (!file.type || !file.type.startsWith('image/')) {
        uploadRecord.els.status.textContent = 'Неподдерживаемый формат';
        uploadRecord.els.status.classList.add('error');
        uploadRecord.state = 'error';
        uploadRecord.els.btnRetry.style.display = 'inline-block';
        uploadRecord.els.btnCancel.style.display = 'none';
        return reject(new Error('Invalid image type'));
      }

      if (uploadRecord.xhr) try { uploadRecord.xhr.abort(); } catch (e) {}
      const uploadUrl = (this.baseTable && this.baseTable.options && this.baseTable.options.uploadUrl) ? this.baseTable.options.uploadUrl : '/';
      const categoryName = (field && field.category) || (item && item.category) || (this.baseTable && this.baseTable.options && this.baseTable.options.defaultCategory) || 'default';

      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', categoryName);
      fd.append('admPanel', 'imageUpload');

      const xhr = new XMLHttpRequest();
      uploadRecord.xhr = xhr;
      uploadRecord.state = 'uploading';
      uploadRecord.els.status.textContent = 'Загрузка...';
      uploadRecord.els.btnCancel.style.display = 'inline-block';
      uploadRecord.els.btnRetry.style.display = 'none';
      uploadRecord.els.status.classList.remove('error'); uploadRecord.els.status.classList.remove('success');

      xhr.open('POST', uploadUrl, true);
      if (this.baseTable && this.baseTable.options && this.baseTable.options.withCredentials) xhr.withCredentials = true;

      if (this.baseTable && this.baseTable.options && this.baseTable.options.uploadHeaders) {
        Object.keys(this.baseTable.options.uploadHeaders).forEach((k) => {
          try { xhr.setRequestHeader(k, this.baseTable.options.uploadHeaders[k]); } catch (e) {}
        });
      }

      const onCancel = () => {
        try { xhr.abort(); } catch (e) {}
        uploadRecord.els.status.textContent = 'Отменено';
        uploadRecord.els.status.classList.add('error');
        uploadRecord.state = 'error';
        uploadRecord.els.btnCancel.style.display = 'none';
        uploadRecord.els.btnRetry.style.display = 'inline-block';
        reject(new Error('Upload cancelled'));
      };
      uploadRecord.els.btnCancel.onclick = onCancel;

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const p = Math.round((ev.loaded / ev.total) * 100);
          uploadRecord.els.progressFill.style.width = `${p}%`;
          uploadRecord.els.progressPercent.textContent = `${p}%`;
        } else {
          uploadRecord.els.progressPercent.textContent = '...';
          uploadRecord.els.progressFill.style.width = '100%';
        }
      };

      xhr.onload = () => {
        uploadRecord.xhr = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          let data = {};
          try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) { data = {}; }
          const serverPath = data.path || data.url || data.filePath || data.filename || data.file || null;
          if (!serverPath) {
            uploadRecord.els.status.textContent = 'Сервер не вернул путь';
            uploadRecord.els.status.classList.add('error');
            uploadRecord.state = 'error';
            uploadRecord.els.btnRetry.style.display = 'inline-block';
            uploadRecord.els.btnCancel.style.display = 'none';
            return reject(new Error('Server did not return file path'));
          }
          uploadRecord.serverPath = serverPath;
          uploadRecord.state = 'done';
          uploadRecord.els.status.textContent = 'Готово';
          uploadRecord.els.status.classList.add('success');
          uploadRecord.els.btnCancel.style.display = 'none';
          uploadRecord.els.btnRetry.style.display = 'none';
          uploadRecord.els.img.src = serverPath;
          syncControl();
          resolve(serverPath);
        } else {
          uploadRecord.state = 'error';
          uploadRecord.els.status.textContent = `Ошибка ${xhr.status}`;
          uploadRecord.els.status.classList.add('error');
          uploadRecord.els.btnRetry.style.display = 'inline-block';
          uploadRecord.els.btnCancel.style.display = 'none';
          reject(new Error('Upload failed: ' + xhr.status));
        }
      };

      xhr.onerror = () => {
        uploadRecord.xhr = null;
        uploadRecord.state = 'error';
        uploadRecord.els.status.textContent = 'Сетевая ошибка';
        uploadRecord.els.status.classList.add('error');
        uploadRecord.els.btnRetry.style.display = 'inline-block';
        uploadRecord.els.btnCancel.style.display = 'none';
        reject(new Error('Network error'));
      };

      xhr.onabort = () => {
        uploadRecord.xhr = null;
        uploadRecord.state = 'error';
        uploadRecord.els.status.textContent = 'Отменено';
        uploadRecord.els.status.classList.add('error');
        uploadRecord.els.btnRetry.style.display = 'inline-block';
        uploadRecord.els.btnCancel.style.display = 'none';
        reject(new Error('Abort'));
      };

      xhr.send(fd);
    });
  };

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    files.forEach((file) => {
      const id = Math.random().toString(36).slice(2);
      const els = makePreviewItem(file, id, false);
      previewContainer.appendChild(els.container);
      const record = { id, file, xhr: null, state: 'idle', serverPath: null, els };
      els.btnRetry.onclick = (e) => { e.preventDefault(); els.btnRetry.style.display = 'none'; record.state = 'idle'; uploadSingle(file, record).catch(()=>{}); };
      els.btnRemove.onclick = (e) => {
        e.preventDefault();
        if (record.xhr) try { record.xhr.abort(); } catch (e) {}
        els.container.remove();
        const idx = uploads.findIndex(u => u.id === record.id);
        if (idx !== -1) uploads.splice(idx, 1);
        syncControl();
      };
      uploads.push(record);
      const reader = new FileReader();
      reader.onload = () => { els.img.src = String(reader.result || ''); };
      reader.onerror = () => {};
      reader.readAsDataURL(file);
      uploadSingle(file, record).catch(() => {});
    });
  };

  // parse initial value (try field.value first, then maybe provided 'val')
  const parseInitial = (v) => {
    if (v == null) return [];
    if (typeof v !== 'string') return Array.isArray(v) ? v.slice() : [];
    let s = v.trim();
    if (!s) return [];
    if (s.indexOf('&quot;') !== -1) s = s.replace(/&quot;/g, '"').replace(/&#34;/g, '"');
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.map(x => String(x)) : [];
    } catch (e) {
      return [s];
    }
  };

  // initialize hidden control value from field.value or existing control attribute
  const initialSource = (typeof field.value !== 'undefined') ? field.value : (attrs.value || control.value || '[]');
  const initialArr = parseInitial(initialSource);
  try { control.value = JSON.stringify(initialArr); } catch (e) { control.value = '[]'; }

  // initialize baseTable listeners array
  if (!this.baseTable) this.baseTable = this.baseTable || {};
  if (!Array.isArray(this.baseTable._listeners)) this.baseTable._listeners = [];

  // build upload records for existing server paths
  initialArr.forEach((url) => {
    const id = 'srv_' + Math.random().toString(36).slice(2);
    const els = makePreviewItem(url, id, true);
    // set image src to server url
    els.img.src = url;
    els.progressFill.style.width = '100%';
    els.progressPercent.textContent = '100%';
    els.status.textContent = 'Готово';
    els.btnCancel.style.display = 'none';
    els.btnRetry.style.display = 'none';
    // remove handler
    els.btnRemove.onclick = (e) => {
      e.preventDefault();
      const idx = uploads.findIndex(u => u.id === id);
      if (idx !== -1) uploads.splice(idx, 1);
      els.container.remove();
      syncControl();
    };
    const record = { id, file: null, xhr: null, state: 'done', serverPath: url, els };
    uploads.push(record);
    previewContainer.appendChild(els.container);
  });

  // attach drag/click/paste handlers
  const onClickDrop = (e) => { e.preventDefault(); fileInput.click(); };
  const onFileChange = (e) => {
    const fList = e.target.files ? Array.from(e.target.files) : [];
    handleFiles(fList);
    fileInput.value = '';
  };
  const onDragOver = (e) => { e.preventDefault(); dropArea.classList.add('dragging'); };
  const onDragLeave = (e) => { e.preventDefault(); dropArea.classList.remove('dragging'); };
  const onDrop = (e) => {
    e.preventDefault();
    dropArea.classList.remove('dragging');
    const dtFiles = (e.dataTransfer && e.dataTransfer.files) ? Array.from(e.dataTransfer.files) : [];
    if (dtFiles.length) { handleFiles(dtFiles); return; }
    const text = (e.dataTransfer && e.dataTransfer.getData && e.dataTransfer.getData('text')) || '';
    if (text && text.startsWith('http')) {
      // add URL as serverPath (no upload)
      const id = 'url_' + Math.random().toString(36).slice(2);
      const els = makePreviewItem(text, id, true);
      els.img.src = text;
      els.btnRemove.onclick = (ev) => { ev.preventDefault(); const idx = uploads.findIndex(u => u.id === id); if (idx !== -1) uploads.splice(idx, 1); els.container.remove(); syncControl(); };
      const record = { id, file: null, xhr: null, state: 'done', serverPath: text, els };
      uploads.push(record);
      previewContainer.appendChild(els.container);
      syncControl();
    }
  };
  const onPaste = (e) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    const collected = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) collected.push(f);
      }
    }
    if (collected.length) handleFiles(collected);
    else {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (text && text.startsWith('http')) {
        // add url as serverPath
        const id = 'url_' + Math.random().toString(36).slice(2);
        const els = makePreviewItem(text, id, true);
        els.img.src = text;
        els.btnRemove.onclick = (ev) => { ev.preventDefault(); const idx = uploads.findIndex(u => u.id === id); if (idx !== -1) uploads.splice(idx, 1); els.container.remove(); syncControl(); };
        const record = { id, file: null, xhr: null, state: 'done', serverPath: text, els };
        uploads.push(record);
        previewContainer.appendChild(els.container);
        syncControl();
      }
    }
  };

  // reset/open
  const onReset = (e) => {
    e.preventDefault();
    uploads.forEach(u => { try { u.xhr && u.xhr.abort(); } catch (e) {} });
    uploads.length = 0;
    previewContainer.innerHTML = '';
    control.value = '[]';
    control.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const onOpen = (e) => {
    e.preventDefault();
    let arr;
    try { arr = JSON.parse(control.value || '[]'); } catch (e) { arr = []; }
    if (arr.length) window.open(arr[0], '_blank');
    else if (typeof showToast === 'function') showToast('Нет загруженных изображений');
  };

  // wire listeners and record for cleanup
  dropArea.addEventListener('click', onClickDrop);
  this.baseTable._listeners.push({ el: dropArea, ev: 'click', fn: onClickDrop });

  fileInput.addEventListener('change', onFileChange);
  this.baseTable._listeners.push({ el: fileInput, ev: 'change', fn: onFileChange });

  dropArea.addEventListener('dragover', onDragOver);
  this.baseTable._listeners.push({ el: dropArea, ev: 'dragover', fn: onDragOver });
  dropArea.addEventListener('dragleave', onDragLeave);
  this.baseTable._listeners.push({ el: dropArea, ev: 'dragleave', fn: onDragLeave });
  dropArea.addEventListener('drop', onDrop);
  this.baseTable._listeners.push({ el: dropArea, ev: 'drop', fn: onDrop });

  document.addEventListener('paste', onPaste);
  this.baseTable._listeners.push({ el: document, ev: 'paste', fn: onPaste });

  resetBtn.addEventListener('click', onReset);
  this.baseTable._listeners.push({ el: resetBtn, ev: 'click', fn: onReset });

  openBtn.addEventListener('click', onOpen);
  this.baseTable._listeners.push({ el: openBtn, ev: 'click', fn: onOpen });

  // assemble DOM
  const leftCol = document.createElement('div');
  leftCol.appendChild(dropArea);
  leftCol.appendChild(fileInput);
  leftCol.appendChild(control);

  row.appendChild(leftCol);
  row.appendChild(previewWrap);
  wrap.appendChild(row);

  fieldMap[field.name] = control;

  // make sure control reflects current serverPaths (synchronize)
  syncControl();

  return wrap;
}



                case 'hidden':
                    control = document.createElement('input');
                    control.type = 'hidden';
                    break;
					
				//TEST	
				case 'froala': {
					// создаём textarea
					console.log('FROALA');
					control = document.createElement('textarea');

					// даём id, если его нет (некоторые библиотеки ожидают уникальный id)
					if (!field.id) {
						field.id = 'froala-' + Math.random().toString(36).slice(2, 9);
					}
					control.id = field.id;

					control.className = attrs.className || 'form-control froala-textarea';
					if (field.placeholder) control.placeholder = field.placeholder;
					if (field.value) control.value = field.value;
					control.dataset.editorType = 'froala';

					// ИНСТРУКЦИЯ: вызывайте control._initFroala() только после appendChild(control)

					control._initFroala = function (froalaOptions = {}) {
						console.log('-> _initFroala called for', control.id);

						if (control._froalaEditor) {
							console.log('Froala already initialized for', control.id);
							return control._froalaEditor;
						}

						if (typeof FroalaEditor === 'undefined') {
							console.warn('FroalaEditor is not loaded. Include Froala JS/CSS before initializing.');
							return null; // прерываем — иначе new FroalaEditor упадёт
						}

						const defaultOpts = {
							toolbarButtons: froalaOptions.toolbarButtons || [
								'bold', 'italic', 'underline', '|', 'formatUL', 'formatOL', '|', 'insertLink', 'insertImage', 'undo', 'redo'
							],
							placeholderText: field.placeholder || '',
						};

						const opts = Object.assign({}, defaultOpts, froalaOptions);

						// Передаём DOM-элемент напрямую — надёжнее, чем селектор
						try {
							control._froalaEditor = new FroalaEditor(control, opts, function () {
								console.log('Froala editor initialized callback for', control.id);
								if (field.value) {
									try { control._froalaEditor.html.set(field.value); } catch (e) { control.value = field.value; }
								}
								if (field.readOnly || field.disabled) {
									try { control._froalaEditor.edit.off(); }
									catch (e) { control._froalaEditor.opts.toolbarButtons = []; }
								}
							});
						} catch (err) {
							console.error('Ошибка при инициализации Froala: ', err);
							return null;
						}

						// Подписка на изменения
						try {
							control._froalaEditor.events.on('contentChanged', function () {
								try { control.value = control._froalaEditor.html.get(); } catch (e) {}
								control.dispatchEvent(new Event('input', { bubbles: true }));
							});
						} catch (e) {
							// Некоторые версии/сборки Froala могут иметь другой API — логируем
							console.warn('Не удалось подписаться на contentChanged:', e);
						}

						return control._froalaEditor;
					};

					control.getHtml = function () {
						if (control._froalaEditor) {
							try { return control._froalaEditor.html.get(); } catch (e) { return control.value; }
						}
						return control.value;
					};

					control._destroyFroala = function () {
						if (control._froalaEditor) {
							try { control._froalaEditor.destroy(); } catch (e) { console.warn(e); }
							control._froalaEditor = null;
						}
					};

					break;
				}

	

                case 'json': {
                    // editable JSON key:value editor (list + add/remove) + hidden field for submission
                    const rowWrap = document.createElement('div');
                    rowWrap.className = attrs.className || 'bt-wrap';
                    Object.assign(rowWrap.style, {
                        marginTop: '6px'
                    });

                    // container for list of pairs
                    const list = document.createElement('ul');
                    list.className = 'bt-json-list';
                    Object.assign(list.style, {
                        margin: '6px 0 0 0',
                        paddingLeft: '18px'
                    });

                    // hidden textarea (so form submits the JSON string) - we'll also parse it on submit to get an object
                    const hidden = document.createElement('textarea');
                    hidden.name = field.name;
                    hidden.style.display = 'none';

                    // helper: parse incoming data (string or object) into plain object
                    let initialObj = {};
                    const raw = (item && item[field.name] !== undefined) ? item[field.name] : (field.value ?? {});
                    try {
                        initialObj = (typeof raw === 'string') ? JSON.parse(raw) : (raw && typeof raw === 'object' ? raw : {});
                    } catch (e) {
                        initialObj = {};
                    }

                    // create controls area (Add button)
                    const controls = document.createElement('div');
                    controls.className = 'bt-json-controls';
                    Object.assign(controls.style, {
                        marginTop: '8px',
                        display: 'flex',
                        gap: '8px'
                    });

                    const addBtn = document.createElement('button');
                    addBtn.type = 'button';
                    addBtn.className = 'btn btn-sm btn-outline-secondary';
                    addBtn.textContent = field.addLabel || 'Добавить пару';

                    controls.appendChild(addBtn);

                    // internal helper to sync hidden value from current list
                    const updateHidden = () => {
                        const obj = {};
                        Array.from(list.children).forEach(li => {
                            const kInput = li.querySelector('.bt-json-key');
                            const vInput = li.querySelector('.bt-json-value');
                            if (!kInput)
                                return;
                            const key = String(kInput.value || '').trim();
                            if (!key)
                                return;
                            // skip empty keys
                            // store value as string - leave type parsing for submitHandler if needed
                            obj[key] = (vInput ? vInput.value : '');
                        });
                        try {
                            hidden.value = JSON.stringify(obj);
                        } catch (e) {
                            hidden.value = '{}';
                        }
                    };

                    // create a row (li) with key/value inputs and remove button
                    const makeRow = (key = '', value = '') => {
                        const li = document.createElement('li');
                        Object.assign(li.style, {
                            marginBottom: '6px',
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center'
                        });

                        const keyInput = document.createElement('input');
                        keyInput.type = 'text';
                        keyInput.placeholder = 'ключ';
                        keyInput.className = 'bt-json-key form-control form-control-sm';
                        keyInput.value = key;

                        const valInput = document.createElement('input');
                        valInput.type = 'text';
                        valInput.placeholder = 'значение';
                        valInput.className = 'bt-json-value form-control form-control-sm';
                        valInput.value = (value === null || value === undefined) ? '' : String(value);

                        const removeBtn = document.createElement('button');
                        removeBtn.type = 'button';
                        removeBtn.className = 'btn btn-sm btn-outline-danger';
                        removeBtn.textContent = '✕';
                        removeBtn.title = 'Удалить';

                        // append inputs
                        // make key narrower
                        Object.assign(keyInput.style, {
                            width: '30%'
                        });
                        Object.assign(valInput.style, {
                            width: 'calc(70% - 34px)'
                        });
                        // leave space for remove button
                        Object.assign(removeBtn.style, {
                            flex: '0 0 34px',
                            height: '30px',
                            padding: '0 6px'
                        });

                        li.appendChild(keyInput);
                        li.appendChild(valInput);
                        li.appendChild(removeBtn);

                        // wire events: update hidden on input
                        const onInput = () => updateHidden();
                        keyInput.addEventListener('input', onInput);
                        valInput.addEventListener('input', onInput);
                        this.baseTable._listeners.push({
                            el: keyInput,
                            ev: 'input',
                            fn: onInput
                        });
                        this.baseTable._listeners.push({
                            el: valInput,
                            ev: 'input',
                            fn: onInput
                        });

                        const onRemove = (ev) => {
                            ev.preventDefault();
                            // remove li and update hidden
                            try {
                                li.remove();
                            } catch (e) {
                                li.parentNode && li.parentNode.removeChild(li);
                            }
                            updateHidden();
                        };
                        removeBtn.addEventListener('click', onRemove);
                        this.baseTable._listeners.push({
                            el: removeBtn,
                            ev: 'click',
                            fn: onRemove
                        });

                        return li;
                    };

                    // populate initial rows
                    if (initialObj && typeof initialObj === 'object') {
                        if (Array.isArray(initialObj)) {
                            initialObj.forEach((v, i) => list.appendChild(makeRow(String(i), (typeof v === 'object') ? JSON.stringify(v) : String(v))));
                        } else {
                            Object.entries(initialObj).forEach(([k, v]) => list.appendChild(makeRow(k, (typeof v === 'object') ? JSON.stringify(v) : String(v))));
                        }
                    }

                    // initial sync
                    updateHidden();

                    // add button behavior
                    const onAdd = (ev) => {
                        ev.preventDefault();
                        const newLi = makeRow('', '');
                        list.appendChild(newLi);
                        // focus to key input of the new row
                        const keyInp = newLi.querySelector('.bt-json-key');
                        if (keyInp)
                            setTimeout(() => {
                                try {
                                    keyInp.focus();
                                } catch (e) {}
                            }, 10);
                        updateHidden();
                    };
                    addBtn.addEventListener('click', onAdd);
                    this.baseTable._listeners.push({
                        el: addBtn,
                        ev: 'click',
                        fn: onAdd
                    });

                    // assemble
                    rowWrap.appendChild(list);
                    rowWrap.appendChild(controls);
                    rowWrap.appendChild(hidden);

                    wrap.appendChild(rowWrap);

                    // expose the hidden field to fieldMap so _buildFormFromSchema can set its value if needed
                    fieldMap[field.name] = hidden;
                    return wrap;
                }

                case 'link':
                case 'text':
                default:
                    control = document.createElement('input');
                    control.type = 'text';
                    control.className = attrs.className || 'form-control';
                    if (field.placeholder)
                        control.placeholder = field.placeholder;
                    break;
            }

            if (!control)
                control = document.createElement('input');

            control.name = field.name;
            control.id = `bt-field-${field.name}`;
            control.setAttribute('aria-label', field.label || field.name || '');
            if (field.required)
                control.required = true;
            if (field.readonly)
                control.readOnly = true;
            if (field.disabled)
                control.disabled = true;

            if (field.note) {
                const note = document.createElement('div');
                note.className = 'pe-note';
                note.textContent = field.note;
                Object.assign(note.style, {
                    fontSize: '0.86rem',
                    color: '#6b7280'
                });
                wrap.appendChild(control);
                wrap.appendChild(note);
            } else
                wrap.appendChild(control);

            const errorHint = document.createElement('div');
            errorHint.className = 'bt-field-error';
            Object.assign(errorHint.style, {
                color: '#ef4444',
                fontSize: '0.82rem',
                display: 'none'
            });
            wrap.appendChild(errorHint);

            const onInvalid = (e) => {
                e.preventDefault();
                errorHint.textContent = field.errorMessage || 'Заполните корректно';
                errorHint.style.display = 'block';
            };
            control.addEventListener('invalid', onInvalid);
            this.baseTable._listeners.push({
                el: control,
                ev: 'invalid',
                fn: onInvalid
            });

            const onInputHide = () => {
                errorHint.style.display = 'none';
            };
            control.addEventListener('input', onInputHide);
            this.baseTable._listeners.push({
                el: control,
                ev: 'input',
                fn: onInputHide
            });

            fieldMap[field.name] = control;
            return wrap;
        };

        const groupNames = Object.keys(groups);
        for (const gName of groupNames) {
            const fields = groups[gName];
            const isDefault = (gName === '__default');
            if (!isDefault) {
                const card = makeFieldCard(gName);
                card.style.gridColumn = '1 / -1';
                const title = document.createElement('div');
                Object.assign(title.style, {
                    fontWeight: 700,
                    marginBottom: '8px'
                });
                title.textContent = gName;
                card.appendChild(title);
                const inner = document.createElement('div');
                Object.assign(inner.style, {
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px'
                });
                for (const f of fields) {
                    const node = makeRow(f);
                    inner.appendChild(node);
                }
                card.appendChild(inner);
                grid.appendChild(card);
            } else {
                for (const f of fields) {
                    const node = makeRow(f);
                    if (f.layout === 'full')
                        node.style.gridColumn = '1 / -1';
                    grid.appendChild(node);
                }
            }
        }

        const actionsWrap = document.createElement('div');
        Object.assign(actionsWrap.style, {
            gridColumn: '1 / -1',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            paddingTop: '6px'
        });

        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'btn btn-primary';
        submit.textContent = 'Сохранить';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn btn-outline-secondary';
        cancel.textContent = 'Отменить';
        cancel.dataset.action = 'cancel';

        actionsWrap.appendChild(submit);
        actionsWrap.appendChild(cancel);

        form.appendChild(grid);
        grid.appendChild(actionsWrap);

        for (const f of this.baseTable.formSchema) {
            const el = fieldMap[f.name];
            if (!el)
                continue;
            const val = item[f.name];

            switch (f.type) {
                case 'checkbox':
                    el.checked = Boolean(val);
                    break;

                case 'date':
                    if (val)
                        el.value = val;
                    break;

                case 'select':
                    if (val !== undefined && val !== null && String(val) !== '') {
                        try {
                            el.value = String(val);
                        } catch (e) {}
                        const hasOption = Array.from(el.options).some(o => o.value === String(val));
                        if (!hasOption && f.ref) {
                            (async () => {
                                try {
                                    if (el._populatePromise)
                                        await el._populatePromise;
                                    else
                                        await this.baseTable._ensureRefLoaded(f.ref).catch(() => {});
                                    await this.baseTable._populateSelectFromRef(el, f);
                                } catch (e) {
                                    this.baseTable.error('async select populate/set error', e);
                                }
                                try {
                                    el.value = String(val);
                                } catch (e) {}
                                if (!Array.from(el.options).some(o => o.value === String(val))) {
                                    setTimeout(() => {
                                        try {
                                            el.value = String(val);
                                        } catch (e) {}
                                    }, 60);
                                }
                            })();
                        }
                    }
                    break;

case 'image': {
  try {
    const ctrlEl = (el.id && form.querySelector(`#${el.id}`)) ? form.querySelector(`#${el.id}`) : el;
    const rowEl = ctrlEl ? (ctrlEl.closest?.('.bt-form-row') || ctrlEl.parentNode) : null;
    const fileInput = rowEl ? rowEl.querySelector('input[type="file"]') : null;
    let preview = rowEl ? rowEl.querySelector('img.bt-image-preview') : null;
    let thumbsWrap = rowEl ? rowEl.querySelector('.bt-wrap') : null;

    const parseImages = (v) => {
      if (v == null) return [];
      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) return [];
        try { const p = JSON.parse(s); return parseImages(p); } catch (e) { return [s]; }
      }
      if (Array.isArray(v)) {
        return v.map(x => (typeof x === 'string' ? x : String(x))).filter(Boolean);
      }
      if (typeof v === 'object' && v !== null) {
        const keys = ['src','url','path','file','location','image','thumb','thumbnail'];
        for (const k of keys) {
          if (v[k]) {
            const found = parseImages(v[k]);
            if (found.length) return found;
          }
        }
        const numeric = Object.keys(v).filter(k => String(Number(k)) === k)
          .sort((a,b)=>Number(a)-Number(b)).map(k => v[k]);
        if (numeric.length) return parseImages(numeric);
      }
      return [];
    };

    let currentArr = parseImages(val ?? el.value);

    const placeholder = (this.baseTable && typeof this.baseTable.placeholderSVG === 'function')
      ? this.baseTable.placeholderSVG(320, 180)
      : (this.options && this.options.placeholder) || '';

    const saveHidden = (arr) => {
      try { el.value = JSON.stringify(arr); } catch (e) { el.value = JSON.stringify([]); }
    };
    saveHidden(currentArr);

    if (!preview && rowEl) {
      preview = document.createElement('img');
      preview.className = 'bt-image-preview';
      preview.alt = 'preview';
      preview.src = currentArr.length ? currentArr[0] : placeholder;
      rowEl.insertBefore(preview, rowEl.firstChild);
    } else if (preview) {
      preview.src = currentArr.length ? currentArr[0] : placeholder;
    }

    if (!thumbsWrap && rowEl) {
      thumbsWrap = document.createElement('div');
      thumbsWrap.className = 'bt-wrap';
      rowEl.appendChild(thumbsWrap);
    }

    const renderThumbnails = (arr) => {
      if (!thumbsWrap) return;
      thumbsWrap.innerHTML = '';
      arr.forEach((src, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'bt-thumb';
        wrap.dataset.index = idx;

        const img = document.createElement('img');
        img.className = 'bt-thumb-img';
        img.src = src || placeholder;
        img.alt = `img-${idx}`;
        img.loading = 'lazy';
        img.dataset.index = idx;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bt-thumb-remove';
        btn.innerText = '×';
        btn.title = 'Удалить';
        btn.dataset.index = idx;

        wrap.appendChild(img);
        wrap.appendChild(btn);
        thumbsWrap.appendChild(wrap);
      });
    };

    renderThumbnails(currentArr);

    if (!this.baseTable) this.baseTable = this.baseTable || {};
    if (!Array.isArray(this.baseTable._listeners)) this.baseTable._listeners = this.baseTable._listeners || [];

    const refreshState = (arr) => {
      currentArr = Array.isArray(arr) ? arr.slice() : parseImages(el.value);
      saveHidden(currentArr);
      if (preview) preview.src = currentArr.length ? currentArr[0] : placeholder;
      renderThumbnails(currentArr);
    };

    if (fileInput) {
      const onFileChange = (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        if (!f.type || !f.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          let arr;
          try { arr = parseImages(el.value); } catch (err) { arr = []; }
          arr.unshift(dataUrl);
          refreshState(arr);
        };
        reader.onerror = () => { if (preview) preview.src = placeholder; };
        reader.readAsDataURL(f);
      };

      const already = (this.baseTable._listeners || []).some(l => l.el === fileInput && l.ev === 'change' && l.fn === onFileChange);
      if (!already) {
        fileInput.addEventListener('change', onFileChange);
        this.baseTable._listeners.push({ el: fileInput, ev: 'change', fn: onFileChange });
      }
    }

    if (thumbsWrap) {
		this.addNotice(thumbsWrap, {
		  type: 'info',
		  title: 'Заметка',
		  description: 'При нажатии на миниатюру она становится главным изображением товара!',
		  timeout: 5000
		});
      const onThumbClick = (ev) => {
        const target = ev.target;

        if (target.matches('.bt-thumb-remove')) {
          const idx = Number(target.dataset.index);
          if (!Number.isNaN(idx)) {
            const arr = parseImages(el.value);
            arr.splice(idx, 1);
            refreshState(arr);
          }
          ev.stopPropagation();
          return;
        }

        const thumbEl = target.closest?.('.bt-thumb');
        if (!thumbEl) return;
        const img = thumbEl.querySelector('img.bt-thumb-img');
        if (!img) return;
        const idx = Number(img.dataset.index);
        if (Number.isNaN(idx)) return;

        const arr = parseImages(el.value);
        if (!arr[idx]) return;

        // перемещаем выбранный элемент в начало массива
        const [item] = arr.splice(idx, 1);
        arr.unshift(item);
        refreshState(arr);

        ev.stopPropagation();
      };

      const alreadyThumb = (this.baseTable._listeners || []).some(l => l.el === thumbsWrap && l.ev === 'click' && l.fn === onThumbClick);
      if (!alreadyThumb) {
        thumbsWrap.addEventListener('click', onThumbClick);
        this.baseTable._listeners.push({ el: thumbsWrap, ev: 'click', fn: onThumbClick });
      }
    }

  } catch (err) {
    if (this.baseTable && typeof this.baseTable.error === 'function') this.baseTable.error('image init error', err);
    else console.error('image init error', err);
  }
  break;
}


                case 'price':
                    if (val !== undefined && val !== null && String(val) !== '') {
                        try {
                            el.value = String(val);
                        } catch (e) {}
                    }
                    try {
                        this.baseTable._applyPriceMaskToElement(el, val);
                    } catch (e) {
                        this.baseTable.error('_applyPriceMaskToElement error', e);
                    }
                    break;

                default:
                    if (val !== undefined && val !== null) {
                        try {
                            el.value = String(val);
                        } catch (e) {}
                    }
            }

            // If field is price but was not covered in switch (safety), ensure mask applied:
            if (f.type !== 'price' && el && el.matches && el.matches('input.bt-field-price')) {
                try {
                    this.baseTable._applyPriceMaskToElement(el, el.value || null);
                } catch (e) {}
            }
        }

        return {
            form,
            fieldMap,
            submitBtn: submit,
            cancelBtn: cancel
        };
    }
	
/**
 * Добавляет notice в контейнер (.notice-window или .notice-stack).
 *
 * container - Element (например .notice-window или элемент .notice-stack внутри него)
 * options:
 *  - type: 'info'|'success'|'warning'|'danger'
 *  - title: string
 *  - description: string
 *  - timeout: ms (0 — не автоскрывать)
 *  - icon: optional FontAwesome класс (строка)
 *  - appendToTop: boolean (true — вставлять в начало стека)
 *  - closeLabel: string (aria-label для кнопки закрытия)
 *  - onClose: function(reason) optional callback ('manual'|'timeout'|'esc'|'removed')
 *  - autofocus: boolean (фокус на уведомлении после добавления)
 */
addNotice(container, {
  type = 'info',
  title = '',
  description = '',
  timeout = 4000,
  icon = '',
  appendToTop = false,
  closeLabel = 'Закрыть уведомление',
  onClose = null,
  autofocus = false
} = {}) {
  if (!container || !(container instanceof Element)) return null;

  const icons = {
    info: 'fa-solid fa-circle-info',
    success: 'fa-solid fa-check-circle',
    warning: 'fa-solid fa-triangle-exclamation',
    danger: 'fa-solid fa-xmark-circle'
  };
  const chosenIcon = (typeof icon === 'string' && icon.trim()) ? icon.trim() : (icons[type] || icons.info);

  // найдем стек внутри контейнера (если есть), иначе используем сам container
  const stack = container.querySelector('.notice-stack') || container;

  // ----- Create elements (safe) -----
  const el = document.createElement('span');
  el.className = `notice notice--${type} notice--enter`;
  el.setAttribute('role', (type === 'info' ? 'status' : 'alert'));
  el.setAttribute('aria-live', (type === 'info' ? 'polite' : 'assertive'));
  el.tabIndex = -1; // чтобы можно было фокусировать

  // icon wrapper (so CSS can style .notice__icon)
  const iconWrap = document.createElement('span');
  iconWrap.className = 'notice__icon';
  const i = document.createElement('i');
  i.className = chosenIcon;
  i.setAttribute('aria-hidden', 'true');
  iconWrap.appendChild(i);

  // content
  const content = document.createElement('span');
  content.className = 'notice__content';

  if (title) {
    const t = document.createElement('span');
    t.className = 'notice__title';
    t.textContent = title; // безопасно
    content.appendChild(t);
  }

  if (description) {
    const d = document.createElement('span');
    d.className = 'notice__desc';
    d.textContent = description;
    content.appendChild(d);
  }

  // close button
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'notice__close';
  close.setAttribute('aria-label', closeLabel);
  close.innerHTML = '&times;'; // safe: static char
  // assemble
  el.appendChild(iconWrap);
  el.appendChild(content);
  el.appendChild(close);

  // ----- Animation / removal helpers -----
  let timerId = null;
  let startTs = 0;
  let remaining = timeout;
  let removed = false;

  const startTimer = () => {
    if (!remaining || remaining <= 0) return;
    startTs = performance.now();
    timerId = setTimeout(() => closeNotice('timeout'), Math.max(0, remaining));
  };

  const pauseTimer = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
      remaining = Math.max(0, remaining - (performance.now() - startTs));
    }
  };

  // унифицированное закрытие — запускает exit-анимацию и затем удаляет элемент
  const closeNotice = (reason = 'manual') => {
    if (removed) return;
    removed = true;
    // stop timer if any
    if (timerId) { clearTimeout(timerId); timerId = null; }
    // remove enter class and add exit class to trigger CSS animation
    el.classList.remove('notice--enter');
    el.classList.add('notice--exit');

    // after animation end remove DOM node; fallback timeout if browser didn't fire animationend
    const onAnimEnd = (ev) => {
      // ensure it's our exit animation (name may vary), but we remove regardless
      cleanup();
    };
    const cleanup = () => {
      el.removeEventListener('animationend', onAnimEnd);
      el.removeEventListener('transitionend', onAnimEnd);
      // remove listeners
      el.removeEventListener('mouseenter', pauseTimer);
      el.removeEventListener('mouseleave', startTimer);
      close.removeEventListener('click', onClickClose);
      document.removeEventListener('keydown', onKeyDown);
      // remove node
      if (el.parentNode) el.parentNode.removeChild(el);
      // callback
      if (typeof onClose === 'function') {
        try { onClose(reason); } catch (e) { /* ignore */ }
      }
    };

    el.addEventListener('animationend', onAnimEnd);
    el.addEventListener('transitionend', onAnimEnd);

    // fallback: if animationend not fired within 600ms, force cleanup
    setTimeout(() => {
      if (el.parentNode) cleanup();
    }, 700);
  };

  // click on close
  const onClickClose = (ev) => {
    ev.stopPropagation();
    closeNotice('manual');
  };
  close.addEventListener('click', onClickClose);

  // pause on hover, resume on leave
  el.addEventListener('mouseenter', () => {
    pauseTimer();
  });
  el.addEventListener('mouseleave', () => {
    // resume only if not already removed
    if (!removed && remaining > 0) startTimer();
  });

  // Esc handler: close the most-recent-focused notice when Escape pressed
  const onKeyDown = (ev) => {
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      // only close if el contains focus or body focused and el is last child
      if (document.activeElement === el || el.contains(document.activeElement)) {
        ev.preventDefault();
        closeNotice('esc');
      }
    }
  };
  document.addEventListener('keydown', onKeyDown);

  // add enter animation cleanup (remove enter class after finished)
  const onEnterAnimEnd = () => {
    el.classList.remove('notice--enter');
    el.removeEventListener('animationend', onEnterAnimEnd);
  };
  el.addEventListener('animationend', onEnterAnimEnd);

  // ----- Insert into DOM -----
  if (appendToTop && stack.firstChild) {
    stack.insertBefore(el, stack.firstChild);
  } else {
    stack.appendChild(el);
  }

  // set remaining timer and start it if needed
  remaining = timeout;
  if (timeout && timeout > 0) startTimer();

  // optional autofocus for accessibility (announce + keyboard nav)
  if (autofocus) {
    // slight delay so screenreaders pick up insertion
    setTimeout(() => {
      try { el.focus(); } catch (e) { /* ignore */ }
    }, 50);
  }

  // return handle with utility methods
  return {
    el,
    close: (reason = 'manual') => closeNotice(reason),
    pause: pauseTimer,
    resume: () => { if (!removed && remaining > 0) startTimer(); },
    isRemoved: () => removed
  };
}


}