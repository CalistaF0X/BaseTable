/**
 * BaseTable
 * Table renders Registry
 *
 * @author {string} Calista Verner
 * @version 1.4.2
 * @license MIT
 */

export class RendererRegistry {
  constructor(baseTable) {
    this.baseTable = baseTable;
  }

    registerTypeRenderer(type, fn) {
        if (!type || typeof fn !== 'function')
            throw new Error('registerTypeRenderer(type, fn) invalid args');
        this.baseTable.typeRenderers.set(String(type), fn);
        this.baseTable.log('Registered renderer:' + type);
    }
	
	    _registerDefaults() {
        this.registerTypeRenderer('text', (td, val, col) => {
            const s = val == null ? '' : String(val);
            const max = col.maxLength || col.truncate || 0;
            if (max && s.length > max) {
                const short = s.slice(0, max - 1) + '…';
                const span = this.baseTable._create('span', {
                    text: short
                });
                span.title = s;
                td.appendChild(span);
            } else
                td.textContent = s;
        }
        );

        this.registerTypeRenderer('link', (td, val, col, row) => {
            if (!val) {
                td.textContent = '—';
                return;
            }
            const href = String(val);
            const allowed = /^(https?:|mailto:|\/)/i;
            const safeHref = allowed.test(href) ? href : ('//' + href.replace(/^[\/]+/, ''));
            const a = this.baseTable._create('a', {
                attrs: {
                    href: safeHref,
                    target: '_blank',
                    rel: 'noopener noreferrer'
                }
            });
            a.textContent = col.textKey ? (this.baseTable._valueForField(col.textKey, row) || '') : (col.display || String(val));
            td.appendChild(a);
        }
        );

        this.registerTypeRenderer('image', (td, val, col) => {
            const img = document.createElement('img');
            img.src = val || this.baseTable.placeholderSVG(80, 80);
            //img.alt = String((col.altKey && this.baseTable._valueForField(col.altKey, {})) || col.altText || '');
            img.className = 'image';
            img.loading = 'lazy';
            img.addEventListener('error', () => {
                try {
                    img.src = this.baseTable.placeholderSVG(80, 80);
                } catch (e) {}
            }
            );
            td.appendChild(img);
        }
        );

        this.registerTypeRenderer('date', (td, val, col) => {
            if (val === undefined || val === null || val === '') {
                td.textContent = '—';
                return;
            }
            const date = this.baseTable._parseToDate(val);
            if (!date || isNaN(date.getTime())) {
                td.textContent = String(val);
                return;
            }
            const opts = col.dateFormat || {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            };
            try {
                const txt = date.toLocaleString(col.locale || 'ru-RU', opts);
                td.textContent = txt;
                td.title = date.toISOString();
                td.setAttribute('data-timestamp', String(Math.floor(date.getTime() / 1000)));
                td.className = "unixDate";
            } catch (e) {
                td.textContent = date.toString();
            }
        }
        );

        this.registerTypeRenderer('number', (td, val, col) => {
            const n = Number(val);
            if (Number.isNaN(n)) {
                td.textContent = String(val ?? '—');
                return;
            }
            td.textContent = (typeof col.formatPrice === 'function') ? col.formatPrice(n) : n.toLocaleString();
        }
        );

        this.registerTypeRenderer('boolean', (td, val) => {
            td.textContent = (val ? 'Да' : 'Нет');
        }
        );

        this.registerTypeRenderer('price', (td, val, col={}, row={}) => {
            const raw = (val === undefined || val === null || val === '') ? 0 : Number(String(val).replace(/\s+/g, '').replace(',', '.'));
            const n = Number.isFinite(raw) ? raw : 0;
            const currency = String(col.currency || this.baseTable.options.currency || 'RUB').toUpperCase();
            const maxFrac = (typeof col.maximumFractionDigits === 'number') ? col.maximumFractionDigits : 0;
            try {
                const fmt = new Intl.NumberFormat(col.locale || 'ru-RU',{
                    style: 'currency',
                    currency,
                    maximumFractionDigits: maxFrac,
                    minimumFractionDigits: 0
                });
                td.innerHTML = `<div class="price" data-currency="${BaseTable.escapeHtml(currency)}">${fmt.format(n)}</div>`;
            } catch (e) {
                const formatted = (n).toLocaleString('ru-RU', {
                    maximumFractionDigits: maxFrac
                });
                td.textContent = (currency ? `${formatted} ${currency}` : formatted);
            }
            try {
                td.setAttribute('data-raw', String(n));
            } catch (_) {}
            td.classList.add('cell-price');
        }
        );

        this.registerTypeRenderer('json', (td, val, col={}, row={}) => {
            // empty / null
            if (val === undefined || val === null || val === '') {
                td.textContent = '—';
                return;
            }

            // parse if string
            let obj = val;
            if (typeof val === 'string') {
                try {
                    obj = JSON.parse(val);
                } catch (e) {
                    /* not valid JSON, just show string */
                    td.textContent = String(val);
                    return;
                }
            }

            const maxDepth = Number.isFinite(col.maxDepth) ? Math.max(0, col.maxDepth) : 2;
            const maxItems = Number.isFinite(col.maxItems) ? Math.max(1, col.maxItems) : 50;
            const linkify = col.linkify === true;

            const renderPrimitive = (v) => {
                if (v === null || v === undefined)
                    return document.createTextNode('—');
                if (typeof v === 'string') {
                    const s = v;
                    if (linkify && /^(https?:\/\/|\/\/)/i.test(s)) {
                        const a = document.createElement('a');
                        a.href = s.startsWith('//') ? (location.protocol + s) : s;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        a.textContent = s;
                        return a;
                    }
                    return document.createTextNode(String(s));
                }
                if (typeof v === 'boolean' || typeof v === 'number')
                    return document.createTextNode(String(v));
                // fallback for other types
                return document.createTextNode(String(v));
            }
            ;

            const createList = (value, depth=0) => {
                const ul = document.createElement('ul');
                ul.className = 'bt-json-render';
                ul.style.margin = '6px 0 0 0';
                ul.style.paddingLeft = '18px';
                if (depth > maxDepth) {
                    const li = document.createElement('li');
                    li.textContent = '…';
                    ul.appendChild(li);
                    return ul;
                }

                if (Array.isArray(value)) {
                    const len = Math.min(value.length, maxItems);
                    for (let i = 0; i < len; i++) {
                        const v = value[i];
                        const li = document.createElement('li');
                        const strong = document.createElement('strong');
                        strong.textContent = `${i}: `;
                        li.appendChild(strong);
                        if (v && typeof v === 'object')
                            li.appendChild(createList(v, depth + 1));
                        else
                            li.appendChild(renderPrimitive(v));
                        ul.appendChild(li);
                    }
                    if (value.length > maxItems) {
                        const li = document.createElement('li');
                        li.textContent = `... ${value.length - maxItems} more`;
                        ul.appendChild(li);
                    }
                    return ul;
                }

                if (value && typeof value === 'object') {
                    const entries = Object.entries(value);
                    const len = Math.min(entries.length, maxItems);
                    for (let i = 0; i < len; i++) {
                        const [k,v] = entries[i];
                        const li = document.createElement('li');
                        const keyNode = document.createElement('strong');
                        keyNode.textContent = `${k}: `;
                        li.appendChild(keyNode);
                        if (v && typeof v === 'object')
                            li.appendChild(createList(v, depth + 1));
                        else
                            li.appendChild(renderPrimitive(v));
                        ul.appendChild(li);
                    }
                    if (entries.length > maxItems) {
                        const li = document.createElement('li');
                        li.textContent = `... ${entries.length - maxItems} more`;
                        ul.appendChild(li);
                    }
                    return ul;
                }

                // fallback
                const li = document.createElement('li');
                li.appendChild(renderPrimitive(value));
                ul.appendChild(li);
                return ul;
            }
            ;

            try {
                td.classList.add('cell-json');
                td.appendChild(createList(obj, 0));
                try {
                    td.setAttribute('data-json', BaseTable.escapeHtml(JSON.stringify(obj)));
                } catch (_) {}
            } catch (err) {
                // if any error — fallback to string representation
                td.textContent = String(val);
            }
        }
        );

    }
}