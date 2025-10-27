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
                        gridTemplateColumns: '1fr 180px',
                        gap: '14px',
                        alignItems: 'start'
                    });

                    // Скрытое поле для хранения значения (серверный путь или data URL)
                    const control = document.createElement('input');
                    control.type = 'hidden';
                    control.className = attrs.className || 'form-control';
                    control.name = field.name;

                    // Область Drag & Drop / клик для выбора файла (стилизованная)
                    const dropArea = document.createElement('div');
                    dropArea.className = 'bt-drop';
                    dropArea.innerHTML = `
    <div class="bt-drop-icon" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 3v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7l4-4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 15v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="bt-drop-text">Перетащите изображение или кликните</div>
    <div class="bt-drop-sub">Поддерживаются JPG, PNG, WEBP. Макс. размер: 5 MB</div>
  `;

                    // Скрытый input[type=file] для открытия диалога
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.style.display = 'none';

                    // Превью и кнопки справа
                    const previewWrap = document.createElement('div');
                    previewWrap.className = 'pe-right';
                    const previewContainer = document.createElement('div');
                    previewContainer.style.position = 'relative';
                    const preview = document.createElement('img');
                    preview.className = 'bt-preview';
                    preview.src = (item && item[field.name]) ? item[field.name] : this.baseTable.placeholderSVG(360, 180);
                    preview.alt = 'preview';

                    // progress UI
                    const progressWrap = document.createElement('div');
                    progressWrap.className = 'bt-progress-wrap';
                    const progressBar = document.createElement('div');
                    progressBar.className = 'bt-progress';
                    const progressFill = document.createElement('div');
                    progressFill.className = 'bt-progress-fill';
                    progressBar.appendChild(progressFill);
                    const progressPercent = document.createElement('div');
                    progressPercent.className = 'bt-progress-percent';
                    progressPercent.textContent = '0%';
                    progressWrap.appendChild(progressBar);
                    progressWrap.appendChild(progressPercent);

                    // status text + cancel/retry button
                    const status = document.createElement('div');
                    status.className = 'bt-status bt-small';
                    status.textContent = '';

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

                    // Cancel/Retry button (появляется при загрузке/ошибке)
                    const actionBtn = document.createElement('button');
                    actionBtn.type = 'button';
                    actionBtn.className = 'bt-btn ghost';
                    actionBtn.style.display = 'none';
                    actionBtn.textContent = 'Отменить';
                    controls.appendChild(actionBtn);

                    previewContainer.appendChild(preview);
                    previewContainer.appendChild(progressWrap);
                    previewContainer.appendChild(status);

                    previewWrap.appendChild(previewContainer);
                    previewWrap.appendChild(controls);

                    // FIELD appended on left column later
                    // Накладка загрузки (визуально не обязательна — используем прогресс и статус)

                    // переменная для текущего XHR (чтобы можно было отменить)
                    let currentXhr = null;

                    // вспомогательные функции для статусов
                    const showStatus = (txt, state) => {
                        status.textContent = txt || '';
                        status.classList.remove('error', 'success');
                        if (state === 'error')
                            status.classList.add('error');
                        if (state === 'success')
                            status.classList.add('success');
                    };

                    const setProgress = (percent, indeterminate = false) => {
                        if (indeterminate) {
                            // добавляем индет-полоску
                            if (!progressBar.querySelector('.bt-progress-indet')) {
                                const ind = document.createElement('div');
                                ind.className = 'bt-progress-indet';
                                progressBar.appendChild(ind);
                            }
                            progressFill.style.width = '100%';
                            progressPercent.textContent = '...';
                        } else {
                            const p = Math.max(0, Math.min(100, Math.round(percent)));
                            const anim = progressBar.querySelector('.bt-progress-indet');
                            if (anim)
                                anim.remove();
                            progressFill.style.width = `${p}%`;
                            progressPercent.textContent = `${p}%`;
                        }
                    };

                    const resetUI = () => {
                        setProgress(0);
                        showStatus('', '');
                        actionBtn.style.display = 'none';
                        actionBtn.textContent = 'Отменить';
                        actionBtn.className = 'bt-btn ghost';
                    };

                    // Асинхронная функция загрузки файла на сервер через XHR (с поддержкой progress + cancel)
                    const uploadFile = (file) => {
                        return new Promise((resolve, reject) => {
                            if (!(file instanceof File))
                                return reject(new Error('uploadFile expects a File'));

                            // abort предыдущего если есть
                            if (currentXhr) {
                                try {
                                    currentXhr.abort();
                                } catch (e) {
                                    /* ignore */
                                }
                                currentXhr = null;
                            }

                            const uploadUrl = this.baseTable.options.uploadUrl || '/';
                            const categoryName = (field && field.category) || (item && item.category) || this.baseTable.options.defaultCategory || 'default';

                            const fd = new FormData();
                            fd.append('file', file);
                            fd.append('category', categoryName);
                            fd.append('admPanel', 'imageUpload');

                            const xhr = new XMLHttpRequest();
                            currentXhr = xhr;

                            xhr.open('POST', uploadUrl, true);
                            if (this.baseTable.options.withCredentials)
                                xhr.withCredentials = true;

                            // кастомные заголовки (не для Content-Type)
                            if (this.baseTable.options.uploadHeaders && typeof this.baseTable.options.uploadHeaders === 'object') {
                                Object.keys(this.baseTable.options.uploadHeaders).forEach((k) => {
                                    try {
                                        xhr.setRequestHeader(k, this.baseTable.options.uploadHeaders[k]);
                                    } catch (err) {
                                        /* ignore header set errors */
                                    }
                                });
                            }

                            // показываем UI загрузки
                            actionBtn.style.display = 'inline-block';
                            actionBtn.textContent = 'Отменить';
                            actionBtn.className = 'bt-btn ghost';
                            showStatus('Начало загрузки...', '');
                            setProgress(0);

                            // привяжем cancel
                            const onCancel = () => {
                                if (xhr) {
                                    try {
                                        xhr.abort();
                                    } catch (e) {}
                                    showStatus('Загрузка отменена', 'error');
                                    resetUI();
                                    reject(new Error('Upload cancelled'));
                                }
                            };
                            actionBtn.onclick = onCancel;

                            xhr.upload.onprogress = (ev) => {
                                if (ev.lengthComputable) {
                                    setProgress((ev.loaded / ev.total) * 100, false);
                                    showStatus('Загрузка: ' + Math.round((ev.loaded / ev.total) * 100) + '%', '');
                                } else {
                                    // индетерминированный режим
                                    setProgress(0, true);
                                    showStatus('Загрузка...', '');
                                }
                            };

                            xhr.onload = () => {
                                currentXhr = null;
                                // статус 2xx
                                if (xhr.status >= 200 && xhr.status < 300) {
                                    let data = {};
                                    try {
                                        data = JSON.parse(xhr.responseText || '{}');
                                    } catch (e) {
                                        data = {};
                                    }
                                    const serverPath = data.path || data.url || data.filePath || data.filename || data.file || null;
                                    if (!serverPath) {
                                        showStatus('Сервер не вернул путь к файлу', 'error');
                                        resetUI();
                                        return reject(new Error('Server did not return file path'));
                                    }
                                    // успех
                                    setProgress(100);
                                    showStatus('Готово', 'success');
                                    actionBtn.style.display = 'none';
                                    actionBtn.textContent = 'Загрузить ещё';
                                    actionBtn.className = 'bt-btn ghost';
                                    actionBtn.onclick = () => {
                                        resetUI();
                                        fileInput.value = '';
                                    };
                                    control.value = serverPath;
                                    preview.src = serverPath;
                                    control.dispatchEvent(new Event('change', {
                                        bubbles: true
                                    }));
                                    return resolve(serverPath);
                                } else {
                                    let txt = xhr.responseText || `${xhr.status} ${xhr.statusText}`;
                                    try {
                                        txt = JSON.parse(xhr.responseText || '') || txt;
                                    } catch (e) {
                                        /* leave text */
                                    }
                                    showStatus('Ошибка: ' + (typeof txt === 'string' ? txt : JSON.stringify(txt)), 'error');
                                    actionBtn.style.display = 'inline-block';
                                    actionBtn.textContent = 'Повторить';
                                    actionBtn.className = 'bt-btn primary';
                                    actionBtn.onclick = () => {
                                        resetUI();
                                        handleFile(file);
                                    };
                                    resetUI();
                                    return reject(new Error('Upload failed: ' + xhr.status));
                                }
                            };

                            xhr.onerror = () => {
                                currentXhr = null;
                                showStatus('Сетевая ошибка при загрузке', 'error');
                                actionBtn.style.display = 'inline-block';
                                actionBtn.textContent = 'Повторить';
                                actionBtn.className = 'bt-btn primary';
                                actionBtn.onclick = () => {
                                    resetUI();
                                    handleFile(file);
                                };
                                resetUI();
                                return reject(new Error('Network error during upload'));
                            };

                            xhr.onabort = () => {
                                currentXhr = null;
                                showStatus('Загрузка отменена', 'error');
                                actionBtn.style.display = 'inline-block';
                                actionBtn.textContent = 'Повторить';
                                actionBtn.className = 'bt-btn primary';
                                actionBtn.onclick = () => {
                                    resetUI();
                                    handleFile(file);
                                };
                                resetUI();
                                return reject(new Error('Upload aborted'));
                            };

                            xhr.send(fd);
                        });
                    };

                    // Вспомогательная функция обработки файла/URL
                    const handleFile = (fileOrUrl) => {
                        if (!fileOrUrl)
                            return;
                        if (fileOrUrl instanceof File) {
                            if (!fileOrUrl.type.startsWith('image/')) {
                                preview.src = this.baseTable.placeholderSVG(360, 180);
                                control.value = '';
                                showStatus('Неподдерживаемый формат файла', 'error');
                                return;
                            }
                            // сразу загружаем на сервер
                            uploadFile(fileOrUrl).catch((err) => {
                                console.error('Upload failed', err);
                                // fallback: показать локальную превью, но не сохранять значение
                                const reader = new FileReader();
                                reader.onload = () => {
                                    preview.src = String(reader.result || '');
                                };
                                reader.onerror = () => {
                                    preview.src = this.baseTable.placeholderSVG(360, 180);
                                    control.value = '';
                                };
                                reader.readAsDataURL(fileOrUrl);

                                // уведомление
                                if (this.baseTable.notifications && typeof this.baseTable.notifications.error === 'function') {
                                    this.baseTable.notifications.error('Не удалось загрузить изображение на сервер.');
                                } else {
                                    showStatus('Не удалось загрузить изображение', 'error');
                                }
                            });
                        } else if (typeof fileOrUrl === 'string') {
                            const url = fileOrUrl.trim();
                            if (!url)
                                return;
                            const tmp = new Image();
                            tmp.onload = () => {
                                // Для URL мы не отправляем его на сервер автоматически — оставляем как есть.
                                control.value = url;
                                preview.src = url;
                                control.dispatchEvent(new Event('change', {
                                    bubbles: true
                                }));
                                showStatus('URL установлен', '');
                            };
                            tmp.onerror = () => {
                                preview.src = this.baseTable.placeholderSVG(360, 180);
                                control.value = '';
                                showStatus('Невалидный URL изображения', 'error');
                            };
                            tmp.src = url;
                        }
                    };

                    // Обработчики событий
                    const onClickDrop = (e) => {
                        e.preventDefault();
                        fileInput.click();
                    };
                    const onFileChange = (e) => {
                        const f = e.target.files && e.target.files[0];
                        if (f)
                            handleFile(f);
                    };
                    const onDragOver = (e) => {
                        e.preventDefault();
                        dropArea.classList.add('dragging');
                    };
                    const onDragLeave = (e) => {
                        e.preventDefault();
                        dropArea.classList.remove('dragging');
                    };
                    const onDrop = (e) => {
                        e.preventDefault();
                        dropArea.classList.remove('dragging');
                        const f = (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
                        if (f) {
                            handleFile(f);
                            return;
                        }
                        const text = (e.dataTransfer && e.dataTransfer.getData && e.dataTransfer.getData('text')) || '';
                        if (text && text.startsWith('http'))
                            handleFile(text);
                    };
                    const onPaste = (e) => {
                        const items = (e.clipboardData && e.clipboardData.items) || [];
                        for (let i = 0; i < items.length; i++) {
                            const it = items[i];
                            if (it.kind === 'file') {
                                const f = it.getAsFile();
                                if (f) {
                                    handleFile(f);
                                    return;
                                }
                            }
                        }
                        const text = (e.clipboardData || window.clipboardData).getData('text');
                        if (text && text.startsWith('http'))
                            handleFile(text);
                    };

                    // reset/open кнопки
                    const onReset = (e) => {
                        e.preventDefault();
                        control.value = '';
                        fileInput.value = '';
                        preview.src = this.baseTable.placeholderSVG(360, 180);
                        control.dispatchEvent(new Event('change', {
                            bubbles: true
                        }));
                        resetUI();
                    };
                    const onOpen = (e) => {
                        e.preventDefault();
                        const val = String(control.value || '').trim();
                        if (!val)
                            return;
                        if (val.startsWith('data:') || val.startsWith('http')) {
                            window.open(val, '_blank');
                        } else {
                            console.warn('Нечего открывать: значение не является ссылкой или data URL.');
                            showStatus('Значение не является ссылкой', 'error');
                        }
                    };

                    // Навешиваем слушатели и сохраняем в this.baseTable._listeners
                    dropArea.addEventListener('click', onClickDrop);
                    this.baseTable._listeners.push({
                        el: dropArea,
                        ev: 'click',
                        fn: onClickDrop
                    });

                    fileInput.addEventListener('change', onFileChange);
                    this.baseTable._listeners.push({
                        el: fileInput,
                        ev: 'change',
                        fn: onFileChange
                    });

                    dropArea.addEventListener('dragover', onDragOver);
                    this.baseTable._listeners.push({
                        el: dropArea,
                        ev: 'dragover',
                        fn: onDragOver
                    });
                    dropArea.addEventListener('dragleave', onDragLeave);
                    this.baseTable._listeners.push({
                        el: dropArea,
                        ev: 'dragleave',
                        fn: onDragLeave
                    });
                    dropArea.addEventListener('drop', onDrop);
                    this.baseTable._listeners.push({
                        el: dropArea,
                        ev: 'drop',
                        fn: onDrop
                    });

                    dropArea.addEventListener('paste', onPaste);
                    this.baseTable._listeners.push({
                        el: dropArea,
                        ev: 'paste',
                        fn: onPaste
                    });

                    resetBtn.addEventListener('click', onReset);
                    this.baseTable._listeners.push({
                        el: resetBtn,
                        ev: 'click',
                        fn: onReset
                    });

                    openBtn.addEventListener('click', onOpen);
                    this.baseTable._listeners.push({
                        el: openBtn,
                        ev: 'click',
                        fn: onOpen
                    });

                    // соберём всё во фрагмент
                    const leftCol = document.createElement('div');
                    leftCol.appendChild(dropArea);
                    leftCol.appendChild(fileInput);
                    leftCol.appendChild(control);

                    row.appendChild(leftCol);
                    row.appendChild(previewWrap);
                    wrap.appendChild(row);

                    fieldMap[field.name] = control;
                    return wrap;
                }

                case 'hidden':
                    control = document.createElement('input');
                    control.type = 'hidden';
                    break;

                case 'json': {
                    // editable JSON key:value editor (list + add/remove) + hidden field for submission
                    const rowWrap = document.createElement('div');
                    rowWrap.className = attrs.className || 'bt-json-wrap';
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

                case 'image':
                    // el здесь — hidden input который хранит data: или путь/URL
                    try {
                        // находим DOM-элементы рядом: row, file input, preview img
                        const ctrlEl = (el.id && form.querySelector(`#${el.id}`)) ? form.querySelector(`#${el.id}`) : el;
                        const rowEl = ctrlEl ? (ctrlEl.closest?.('.bt-form-row') || ctrlEl.parentNode) : null;
                        const fileInput = rowEl ? rowEl.querySelector('input[type="file"]') : null;
                        const preview = rowEl ? rowEl.querySelector('img.bt-image-preview') : null;

                        // подставляем значение (может быть data: или URL)
                        if (val) {
                            try {
                                el.value = String(val);
                            } catch (e) {
                                el.value = '';
                            }
                            if (preview)
                                preview.src = String(val);
                        } else {
                            el.value = '';
                            if (preview)
                                preview.src = this.baseTable.placeholderSVG(320, 180);
                        }

                        // если есть file input — навесим handler для чтения файла в dataURL и подстановки в hidden + preview
                        if (fileInput) {
                            const onFileChange = (e) => {
                                const f = e.target.files && e.target.files[0];
                                if (!f)
                                    return;
                                if (!f.type || !f.type.startsWith('image/')) {
                                    // not an image — ignore
                                    return;
                                }
                                const reader = new FileReader();
                                reader.onload = () => {
                                    try {
                                        el.value = String(reader.result || '');
                                    } catch (err) {
                                        el.value = '';
                                    }
                                    if (preview)
                                        preview.src = el.value || this.baseTable.placeholderSVG(320, 180);
                                };
                                reader.onerror = () => {
                                    if (preview)
                                        preview.src = this.baseTable.placeholderSVG(320, 180);
                                };
                                reader.readAsDataURL(f);
                            };

                            // защита от двойной навески — если уже есть такой слушатель, не добавляем
                            const existing = (this.baseTable._listeners || []).some(l => l.el === fileInput && l.ev === 'change');
                            if (!existing) {
                                fileInput.addEventListener('change', onFileChange);
                                this.baseTable._listeners.push({
                                    el: fileInput,
                                    ev: 'change',
                                    fn: onFileChange
                                });
                            }
                        }
                    } catch (err) {
                        this.baseTable.error('image init error', err);
                    }
                    break;

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
}