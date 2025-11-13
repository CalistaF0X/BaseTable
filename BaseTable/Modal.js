/**
 * Modal (optimized)
 * -----------------
 * Improved, robust modal/form helper for BaseTable.
 * - Centralized listener management with automatic cleanup
 * - Safer focus trap and accessible defaults
 * - Robust form serialization (checkboxes, numbers, arrays, files)
 * - Clear separation of modal-builder and modal lifecycle
 * - Better error handling and consistent logging
 *
 * Usage: const modal = new Modal(baseTable);
 *        const { promise, close } = modal.openEditModal(idOrItem);
 *
 * @author Calista Verner
 * @version 1.5.0
 * @license MIT
 */

export class Modal {
  constructor(baseTable) {
    if (!baseTable) throw new TypeError('Modal requires baseTable');
    this.baseTable = baseTable;

    // Local records for active modal instance (listeners created by this Modal)
    this._active = null; // { modalBuilder, nodes, listeners: [], resolvedOnce }

    // convenience aliases
    this.idField = this.baseTable.idField || 'id';
  }

  // ---------- internal helpers ----------
  _ensureBuilder() {
    return (typeof this.baseTable._ensureModalBuilder === 'function')
      ? this._ensureModalBuilder()
      : this._defaultModalBuilder();
  }
  
  _ensureModalBuilder() {
    if (typeof this.baseTable.ui.modalBuilder === 'function') return this.ui.modalBuilder(this);
    return this._defaultModalBuilder();
  }
  
  async openDeleteConfirm(id) {
    const wrap = this.baseTable._create('div');
    const found = this.baseTable.data.find(r => String(r[this.baseTable.idField]) === String(id)) || {};
    wrap.innerHTML = `<p>Вы уверены, что хотите удалить элемент <strong>${Modal.escapeHtml(found.fullname ?? String(id))}</strong>?</p>\n      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">\n        <button class="btn btn-danger btn-confirm">Удалить</button>\n        <button class="btn btn-secondary btn-cancel" data-action="cancel">Отмена</button>\n      </div>`;
    const modal = this._ensureModalBuilder(); const m = modal.open('Подтверждение удаления', wrap);
    const confirmBtn = wrap.querySelector('.btn-confirm'); const cancelBtn = wrap.querySelector('.btn-cancel');
    return new Promise((resolve) => {
      cancelBtn.addEventListener('click', () => { modal.close(); resolve(false); });
      confirmBtn.addEventListener('click', async () => {
        try {
          if (!this.baseTable.apis.apiDelete) throw new Error('apiDelete not provided');
          await this.baseTable.apis.apiDelete(id);
          this.baseTable.data = this.baseTable.data.filter(d => String(d[this.baseTable.idField]) !== String(id));
          this.baseTable.applyFiltersAndRender();
          modal.close(); this.baseTable.log('Deleted', id); resolve(true);
        } catch (err) { this.baseTable.error('delete error', err); alert('Ошибка при удалении. Смотрите консоль.'); modal.close(); resolve(false); }
      }, { once: true });
    });
  }

  _trackListener(el, ev, fn, opts) {
    // track both in local active list and baseTable._listeners if available
    const rec = { el, ev, fn, opts };
    if (!this._active) this._active = { listeners: [] };
    this._active.listeners.push(rec);
    if (el && typeof el.addEventListener === 'function') el.addEventListener(ev, fn, opts || false);
    if (Array.isArray(this.baseTable._listeners)) this.baseTable._listeners.push(rec);
    return rec;
  }

  _untrackAll() {
    if (!this._active || !Array.isArray(this._active.listeners)) return;
    for (const r of this._active.listeners.slice()) {
      try { r.el.removeEventListener(r.ev, r.fn, r.opts || false); } catch (e) {}
    }
    // remove tracked listeners from baseTable._listeners if it exists
    if (Array.isArray(this.baseTable._listeners)) {
      this.baseTable._listeners = this.baseTable._listeners.filter(x => !this._active.listeners.includes(x));
    }
    this._active.listeners = [];
  }

  _safeFocusables(container) {
    try {
      const selector = 'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';
      return Array.from(container.querySelectorAll(selector)).filter(el => !el.disabled && el.offsetParent !== null);
    } catch (e) { return []; }
  }

  _serializeForm(form, formSchema = []) {
    // Builds payload with sensible conversions and ensures checkboxes are present
    const fd = new FormData(form);
    const payload = {};

    // helper to read values for named fields (including multiple values)
    const entries = {};
    for (const [k, v] of fd.entries()) {
      if (!(k in entries)) entries[k] = [];
      entries[k].push(v);
    }

    for (const [k, vals] of Object.entries(entries)) {
      // if multiple values — keep array
      if (vals.length > 1) payload[k] = vals;
      else payload[k] = vals[0];
    }

    // Ensure checkboxes from schema are present
    for (const f of formSchema || []) {
      if (f.type === 'checkbox') {
        const el = form.querySelector(`[name="${f.name}"]`);
        payload[f.name] = !!(el && el.checked);
      }
      if (f.type === 'number') {
        if (payload[f.name] === '' || payload[f.name] === undefined) payload[f.name] = null;
        else if (payload[f.name] !== null) payload[f.name] = Number(String(payload[f.name]).replace(/\s+/g, '').replace(',', '.'));
      }
      // arrays (multi-select) — normalize
      if (f.type === 'array') {
        const els = form.querySelectorAll(`[name="${f.name}"]`);
        if (els && els.length > 0) {
          const vals = [];
          els.forEach(e => {
            if (e.options) { // select
              Array.from(e.selectedOptions).forEach(opt => vals.push(opt.value));
            } else if (e.type === 'checkbox') {
              if (e.checked) vals.push(e.value);
            }
          });
          payload[f.name] = vals;
        }
      }
    }

    return payload;
  }

  _resolveResponse(res) {
    // Normalize common response shapes: { success:true, data: {...} } or raw object
    try {
      if (!res) return res;
      if (typeof res === 'object') {
        if ('data' in res) return res.data;
        if ('result' in res) return res.result;
        return res;
      }
      return res;
    } catch (e) { return res; }
  }

  // ---------- core modal lifecycle ----------
  _openFormForItem(initial = {}, opts = {}) {
    // ensure previous modal closed and cleaned up
    if (this.baseTable._modal) this._closeModal();

    const modalBuilder = opts.modalBuilder || this._ensureBuilder();
    const title = (initial && initial[this.idField]) ? (opts.title || 'Редактировать') : (opts.title || 'Новый элемент');

    // build form through baseTable.table._buildFormFromSchema
    const built = (this.baseTable.table && typeof this.baseTable.table._buildFormFromSchema === 'function')
      ? this.baseTable.table._buildFormFromSchema(initial || {})
      : (initial || {});

    const containerNode = (built && built.form instanceof Node) ? built.form : (built || document.createElement('div'));
    const m = modalBuilder.open(title, (containerNode instanceof Node) ? containerNode : (containerNode.form || containerNode));

    const dialog = (m && m.dialog) ? m.dialog : (m);
    const form = (containerNode && containerNode.form) ? containerNode.form : (containerNode.tagName === 'FORM' ? containerNode : null);

    // prepare active record
    this._active = { modalBuilder, m, dialog, form, listeners: [], resolvedOnce: false };

    // accessible focus trap
    const focusables = this._safeFocusables(dialog);
    const firstFocusable = focusables[0] || null;
    const lastFocusable = focusables[focusables.length - 1] || firstFocusable;

    const trap = (e) => {
      if (e.key === 'Tab') {
        if (focusables.length === 0) { e.preventDefault(); return; }
        if (e.shiftKey && document.activeElement === firstFocusable) {
          e.preventDefault(); lastFocusable.focus();
        } else if (!e.shiftKey && document.activeElement === lastFocusable) {
          e.preventDefault(); firstFocusable.focus();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault(); cancelHandler();
      }
    };

    this._trackListener(dialog, 'keydown', trap);

    const that = this;
    let resolvePromise;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });

    const cleanupAndResolve = (value) => {
      // prevent multiple resolves
      if (this._active && this._active.resolvedOnce) return;
      if (this._active) this._active.resolvedOnce = true;
      try { this._untrackAll(); } catch (e) {}
      try { if (modalBuilder && typeof modalBuilder.close === 'function') modalBuilder.close(); } catch (e) {}
      resolvePromise(value);
    };

    // submit handler
    const submitHandler = async (ev) => {
      try {
        ev && ev.preventDefault();
        if (!this._active || this.baseTable._isSaving) return;
        if (!form) { alert('Форма не найдена'); cleanupAndResolve(null); return; }
        if (!form.checkValidity()) { form.reportValidity(); return; }

        const payload = this._serializeForm(form, this.baseTable.formSchema || []);

        // preserve id if provided initially
        if (initial && initial[this.idField] !== undefined && !payload[this.idField]) payload[this.idField] = initial[this.idField];

        this.baseTable._isSaving = true;
        let saved = null;
        try {
          let res;
          if (!payload[this.idField]) {
            if (!this.baseTable.apis || !this.baseTable.apis.apiAdd) throw new Error('apiAdd not provided');
            res = await this.baseTable.apis.apiAdd(payload);
          } else {
            if (!this.baseTable.apis || !this.baseTable.apis.apiUpdate) throw new Error('apiUpdate not provided');
            res = await this.baseTable.apis.apiUpdate(payload[this.idField], payload);
          }
          saved = this._resolveResponse(res) || payload;

          // merge into local dataset
          if (!payload[this.idField]) {
            const added = (saved && saved[this.idField] !== undefined) ? saved : Object.assign({ [this.idField]: Date.now() }, saved);
            this.baseTable.data.unshift(added);
          } else {
            const idx = this.baseTable.data.findIndex(d => String(d[this.idField]) === String(payload[this.idField]));
            if (idx === -1) this.baseTable.data.unshift(saved);
            else this.baseTable.data[idx] = this.baseTable._mergeLocalItem ? this.baseTable._mergeLocalItem(this.baseTable.data[idx], saved) : Object.assign({}, this.baseTable.data[idx], saved);
          }

          if (this.baseTable.log) this.baseTable.log('Saved item', saved);
          cleanupAndResolve(saved);
        } catch (err) {
          if (this.baseTable.error) this.baseTable.error('modal save error', err);
          try { console.error(err); } catch (e) {}
          // keep modal open for correction; resolve null to calling code
          alert('Ошибка при сохранении. Смотрите консоль.');
          cleanupAndResolve(null);
        } finally {
          this.baseTable._isSaving = false;
        }
      } catch (e) {
        cleanupAndResolve(null);
      }
    };

    // attach submit
    if (form) this._trackListener(form, 'submit', submitHandler);

    // cancel handler
    const cancelHandler = () => {
      cleanupAndResolve(null);
    };

    // attach cancel buttons (data-action="cancel")
    if (form) {
      const cancelBtn = form.querySelector('[data-action="cancel"]');
      if (cancelBtn) this._trackListener(cancelBtn, 'click', (e) => { e.preventDefault(); cancelHandler(); });
    }

    // attach close button (dialog-level)
    const closeBtn = dialog.querySelector('button[data-action="close"]') || dialog.querySelector('.btn-ghost');
    if (closeBtn) this._trackListener(closeBtn, 'click', (e) => { e && e.preventDefault(); cancelHandler(); });

    // final focus to first focusable
    setTimeout(() => {
      const focusables2 = this._safeFocusables(dialog);
      const focusEl = focusables2[0] || dialog.querySelector('input,select,textarea,button');
      if (focusEl && typeof focusEl.focus === 'function') try { focusEl.focus(); } catch (e) {}
    }, 40);

    return {
      promise,
      close: () => cleanupAndResolve(null)
    };
  }

  async openEditModal(idOrItem, opts = {}) {
    const item = (typeof idOrItem === 'object') ? idOrItem : this.baseTable.data.find(d => String(d[this.idField]) === String(idOrItem));
    const { promise } = this._openFormForItem(item || { [this.idField]: idOrItem }, opts);
    const saved = await promise;

    if (saved) {
      if (typeof saved.type === 'string' && saved.type === 'success') {
        try { this.baseTable.applyFiltersAndRender(); } catch (e) {}
        this._closeModal();
        try { this.baseTable.refresh && this.baseTable.refresh(); } catch (e) {}
      }
    }

    // optional notify via jquery if available
    try {
      const table = document.querySelector('table');
      if (table && window.$) $(table).notify(saved?.message, saved?.type);
    } catch (e) {}

    return saved;
  }

  async openAddModal(opts = {}) {
    const { promise } = this._openFormForItem({}, opts);
    const saved = await promise;
    if (saved) {
      try { this.baseTable.applyFiltersAndRender(); } catch (e) {}
    }
    this._closeModal();
    return saved;
  }

  _defaultModalBuilder() {
    const base = this.baseTable;
    return {
      open: (title, contentNode) => {
        if (base._modal) this._closeModal();
        const overlay = base._create('div', { className: 'pe-modal-overlay', attrs: { role: 'dialog', 'aria-modal': 'true' } });
        const dialog = base._create('div', { className: 'pe-modal-dialog' });
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        base._modal = { overlay, dialog, focusRestore: document.activeElement };

        const header = base._create('div', { className: 'pe-modal-header' });
        const h = base._create('h4', { className: 'modal-title', text: title });
        const close = base._create('button', { className: 'btn btn-ghost', text: '✕', attrs: { 'data-action': 'close', 'aria-label': 'Close' } });
        header.appendChild(h); header.appendChild(close);
        dialog.appendChild(header);

        const content = base._create('div', { className: 'pe-modal-content' });
        if (typeof contentNode === 'string') content.innerHTML = contentNode;
        else if (contentNode instanceof Node) content.appendChild(contentNode);
        dialog.appendChild(content);

        overlay.style.display = 'flex';

        // click outside closes
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeModal(); });
        close.addEventListener('click', () => this._closeModal());

        setTimeout(() => {
          const focusEl = dialog.querySelector('input,select,textarea,button');
          if (focusEl) try { focusEl.focus(); } catch (e) {}
        }, 40);

        return { overlay, dialog };
      },
      close: () => this._closeModal()
    };
  }

  _closeModal() {
    // cleanup active listeners created by Modal
    try {
      this._untrackAll();
    } catch (e) {}

    try {
      if (this.baseTable._modal) {
        const { overlay, focusRestore } = this.baseTable._modal;
        try { overlay.remove(); } catch (e) {}
        if (focusRestore && typeof focusRestore.focus === 'function') try { focusRestore.focus(); } catch (e) {}
      }
    } catch (e) { if (this.baseTable.warn) this.baseTable.warn('_closeModal error', e); }

    this.baseTable._modal = null;
    this._active = null;
  }
  
  static escapeHtml(s) { return String(s ?? '').replace(/[&<>\"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
}