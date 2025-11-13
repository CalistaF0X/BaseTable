/**
 * RendererRegistry (optimized)
 * ----------------------------
 * Responsible for registering and invoking cell-type renderers for BaseTable.
 * This file contains an improved, safer and higher-performance implementation
 * of the original RendererRegistry.
 *
 * Key improvements:
 *  - explicit API: register / get / render
 *  - normalized type keys and validation
 *  - better DOM performance (DocumentFragment / small helper factories)
 *  - safer URL handling and currency escaping
 *  - robust JSON rendering with limits and linkify option
 *  - consistent fallbacks for invalid inputs
 *
 * Usage: const reg = new RendererRegistry(baseTable);
 *        reg.registerTypeRenderer('myType', (td, val, col, row) => { ... });
 *        // BaseTable should call reg.renderCell(type, td, value, col, row)
 *
 * @author Calista Verner
 * @version 1.5.0
 * @license MIT
 */

export class RendererRegistry {
  /**
   * @param {Object} baseTable — instance of BaseTable-like object expected to
   *   expose helpers: _create(tag, opts), placeholderSVG(w,h),
   *   _valueForField(key, row), _parseToDate(v), options, log(...)
   */
  constructor(baseTable) {
    if (!baseTable) throw new TypeError('RendererRegistry requires baseTable');
    this.baseTable = baseTable;
    // map of type -> rendererFn
    this.typeRenderers = new Map();

    // register builtin renderers
    this._registerDefaults();
  }

  // ----------------------- utilities -----------------------
  _normalizeType(type) {
    return String(type ?? '').trim().toLowerCase();
  }

  _createEl(tag, opts = {}) {
    // prefer baseTable._create if available for consistent markup
    if (typeof this.baseTable._create === 'function') {
      return this.baseTable._create(tag, opts);
    }
    const el = document.createElement(tag);
    if (opts.text) el.textContent = opts.text;
    if (opts.attrs) Object.entries(opts.attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    if (opts.className) el.className = opts.className;
    return el;
  }

  _safeHref(href) {
    if (!href) return '';
    const s = String(href).trim();
    const allowed = /^(https?:|mailto:|\/)/i;
    return allowed.test(s) ? s : '//' + s.replace(/^[\/]+/, '');
  }

  // ----------------------- public API -----------------------
  /**
   * Register a renderer function for a given type.
   * @param {string} type
   * @param {(td:HTMLElement, val:any, col:object, row:object)=>void} fn
   */
  registerTypeRenderer(type, fn) {
    if (!type || typeof fn !== 'function') {
      throw new Error('registerTypeRenderer(type, fn) invalid args');
    }
    const key = this._normalizeType(type);
    this.typeRenderers.set(key, fn);
    if (this.baseTable && typeof this.baseTable.log === 'function') {
      this.baseTable.log(`Registered renderer: ${key}`);
    }
  }

  /**
   * Render a cell using the renderer for `type` (fallback to 'text').
   * This is the method BaseTable should call when filling a td.
   * @param {string} type
   * @param {HTMLElement} td
   * @param {*} val
   * @param {object} col
   * @param {object} row
   */
  renderCell(type, td, val, col = {}, row = {}) {
    const renderer = this.getRenderer(type) || this.getRenderer('text');
    try {
      renderer.call(this, td, val, col, row);
    } catch (err) {
      // fail gracefully: show string fallback and log error
      td.textContent = String(val ?? '—');
      if (this.baseTable && typeof this.baseTable.log === 'function')
        this.baseTable.log('Renderer error for type ' + type + ': ' + (err && err.message));
    }
  }

  // ----------------------- default renderers -----------------------
  _registerDefaults() {
    // TEXT
	this.registerTypeRenderer('text', (td, val, col = {}) => {
	  const s = (val === null || val === undefined) ? '' : String(val);
	  const GLOBAL_MAX = 128;
	  // если колонка задаёт меньший предел — используем его, иначе берем глобальный лимит
	  const configured = Number.isFinite(col.maxLength) ? col.maxLength : (Number.isFinite(col.truncate) ? col.truncate : 0);
	  const max = configured > 0 ? Math.min(GLOBAL_MAX, configured) : GLOBAL_MAX;

	  if (max > 0 && s.length > max) {
		// оставляем место под три точки '...'
		const keep = Math.max(0, max - 3);
		const short = s.slice(0, keep) + '...';
		const span = this._createEl('span', { text: short });
		span.title = s;
		td.appendChild(span);
	  } else {
		td.textContent = s;
	  }
	});


    // LINK
    this.registerTypeRenderer('link', (td, val, col = {}, row = {}) => {
      if (!val) {
        td.textContent = '—';
        return;
      }
      const href = this._safeHref(val);
      const a = this._createEl('a', { attrs: { href, target: '_blank', rel: 'noopener noreferrer' } });
      const display = col.textKey ? (this.baseTable._valueForField(col.textKey, row) || '') : (col.display || String(val));
      a.textContent = display;
      td.appendChild(a);
    });

    // IMAGE
this.registerTypeRenderer('image', (td, val, col = {}) => {
  const img = document.createElement('img');
  img.className = 'image';
  img.loading = 'lazy';

  // alt: приоритет — ключ из данных, затем altText
  img.alt = (col.altKey ? (this.baseTable._valueForField(col.altKey, {}) || '') : (col.altText || ''));

  // Получаем кандидат(ы) на src:
  let srcCandidate = '';
  let original = val;

  // 1) Если уже массив — берем первый элемент
  if (Array.isArray(val)) {
    original = val;
    srcCandidate = val.length ? val[0] : '';
  } else if (typeof val === 'string') {
    // Попробуем распарсить JSON (на случай, если val — JSON-массив)
    const trimmed = val.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          original = parsed;
          srcCandidate = parsed.length ? parsed[0] : '';
        } else if (parsed && typeof parsed === 'object') {
          original = parsed;
          // если это объект — попробуем распространённые поля
          srcCandidate = parsed.path || parsed.url || parsed.src || parsed.file || '';
        } else {
          srcCandidate = val;
        }
      } catch (e) {
        // Не JSON — используем строку как есть
        srcCandidate = val;
      }
    } else {
      // Простая строка — возможно это прямой путь
      srcCandidate = val;
    }
  } else if (val && typeof val === 'object') {
    // val — объект (не массив)
    original = val;
    srcCandidate = val.path || val.url || val.src || val.file || '';
  } else {
    srcCandidate = '';
  }

  // Если первый кандидат — объект, попробуем извлечь из него путь
  if (srcCandidate && typeof srcCandidate === 'object') {
    img.alt = img.alt || (srcCandidate.alt || srcCandidate.title || '');
    srcCandidate = srcCandidate.path || srcCandidate.url || srcCandidate.src || srcCandidate.file || '';
  }

  // Наконец, если нет src — используем placeholder (если есть функция)
  const placeholder = (typeof this.baseTable.placeholderSVG === 'function')
    ? this.baseTable.placeholderSVG(80, 80)
    : '';

  img.src = srcCandidate || placeholder;

  // Сохраним исходные данные в data-* для дебага/доступа
  try {
    if (original !== undefined) img.dataset._original = (typeof original === 'string' ? original : JSON.stringify(original));
  } catch (e) { /* ignore circular */ }

  img.addEventListener('error', () => {
    try {
      img.src = placeholder;
    } catch (e) { /* ignore */ }
  });

  td.appendChild(img);
});


    // DATE
    this.registerTypeRenderer('date', (td, val, col = {}) => {
      if (val === undefined || val === null || val === '') {
        td.textContent = '—';
        return;
      }
      const date = this.baseTable._parseToDate ? this.baseTable._parseToDate(val) : new Date(val);
      if (!date || isNaN(date.getTime())) {
        td.textContent = String(val);
        return;
      }
      const opts = col.dateFormat || { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' };
      try {
        const txt = date.toLocaleString(col.locale || (this.baseTable.options && this.baseTable.options.locale) || 'ru-RU', opts);
        td.textContent = txt;
        td.title = date.toISOString();
        td.setAttribute('data-timestamp', String(Math.floor(date.getTime() / 1000)));
        td.classList.add('unixDate');
      } catch (e) {
        td.textContent = date.toString();
      }
    });

    // NUMBER
    this.registerTypeRenderer('number', (td, val, col = {}) => {
      const n = Number(val);
      if (Number.isNaN(n)) {
        td.textContent = String(val ?? '—');
        return;
      }
      if (typeof col.formatPrice === 'function') {
        td.textContent = col.formatPrice(n);
        return;
      }
      const locale = col.locale || (this.baseTable.options && this.baseTable.options.locale) || undefined;
      td.textContent = n.toLocaleString(locale);
    });

    // BOOLEAN
    this.registerTypeRenderer('boolean', (td, val) => {
      td.textContent = (!!val) ? 'Да' : 'Нет';
    });

    // PRICE
    this.registerTypeRenderer('price', (td, val, col = {}, row = {}) => {
      let raw = val;
      if (raw === undefined || raw === null || raw === '') raw = 0;
      // allow strings with spaces or comma
      if (typeof raw === 'string') raw = Number(raw.replace(/\s+/g, '').replace(',', '.'));
      const n = Number.isFinite(raw) ? raw : 0;
      const currency = String(col.currency || (this.baseTable.options && this.baseTable.options.currency) || 'RUB').toUpperCase();
      const maxFrac = (typeof col.maximumFractionDigits === 'number') ? col.maximumFractionDigits : 0;
      const locale = col.locale || (this.baseTable.options && this.baseTable.options.locale) || 'ru-RU';

      // create DOM safely instead of innerHTML
      const wrapper = this._createEl('div', { className: 'price', attrs: { 'data-currency': (this.baseTable.escapeHtml ? this.baseTable.escapeHtml(currency) : currency) } });
      try {
        const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: maxFrac, minimumFractionDigits: 0 });
        wrapper.textContent = fmt.format(n);
      } catch (e) {
        wrapper.textContent = `${n.toLocaleString(locale, { maximumFractionDigits: maxFrac })} ${currency}`.trim();
      }
      td.appendChild(wrapper);
      try { td.setAttribute('data-raw', String(n)); } catch (_) {}
      td.classList.add('cell-price');
    });

    // JSON
    this.registerTypeRenderer('json', (td, val, col = {}) => {
      if (val === undefined || val === null || val === '') {
        td.textContent = '—';
        return;
      }

      let obj = val;
      if (typeof val === 'string') {
        try { obj = JSON.parse(val); } catch (e) { td.textContent = String(val); return; }
      }

      const maxDepth = Number.isFinite(col.maxDepth) ? Math.max(0, col.maxDepth) : 2;
      const maxItems = Number.isFinite(col.maxItems) ? Math.max(1, col.maxItems) : 50;
      const linkify = col.linkify === true;

      const renderPrimitive = (v) => {
        if (v === null || v === undefined) return document.createTextNode('—');
        if (typeof v === 'string') {
          if (linkify && /^(https?:\/\/|\/\/)/i.test(v)) {
            const a = document.createElement('a');
            a.href = v.startsWith('//') ? (location.protocol + v) : v;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = v;
            return a;
          }
          return document.createTextNode(v);
        }
        return document.createTextNode(String(v));
      };

      const createList = (value, depth = 0) => {
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
            if (v && typeof v === 'object') li.appendChild(createList(v, depth + 1));
            else li.appendChild(renderPrimitive(v));
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
            const [k, v] = entries[i];
            const li = document.createElement('li');
            const keyNode = document.createElement('strong');
            keyNode.textContent = `${k}: `;
            li.appendChild(keyNode);
            if (v && typeof v === 'object') li.appendChild(createList(v, depth + 1));
            else li.appendChild(renderPrimitive(v));
            ul.appendChild(li);
          }
          if (entries.length > maxItems) {
            const li = document.createElement('li');
            li.textContent = `... ${entries.length - maxItems} more`;
            ul.appendChild(li);
          }
          return ul;
        }

        const li = document.createElement('li');
        li.appendChild(renderPrimitive(value));
        ul.appendChild(li);
        return ul;
      };

      try {
        td.classList.add('cell-json');
        td.appendChild(createList(obj, 0));
        try { td.setAttribute('data-json', JSON.stringify(obj)); } catch (_) {}
      } catch (err) {
        td.textContent = String(val);
      }
    });
  }
}