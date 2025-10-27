/**
 * BaseTable
 * Modall App Utilities
 *
 * @author {string} Calista Verner
 * @version 1.4.2
 * @license MIT
 */

export class Modal {
    constructor(baseTable) {
        this.baseTable = baseTable;
    }

    _openFormForItem(initial = {}) {
        if (this.baseTable._modal)
            this._closeModal();
        const modalBuilder = this.baseTable._ensureModalBuilder();
        const title = initial && initial[this.baseTable.idField] ? 'Редактировать' : 'Новый элемент';
        const built = this.baseTable.table._buildFormFromSchema(initial || {});
        const containerNode = built.form instanceof Node ? built.form : built;
        const m = modalBuilder.open(title, containerNode instanceof Node ? containerNode : containerNode.form || containerNode);

        const dialog = m.dialog;
        const form = (containerNode.form || containerNode);

        const focusableSelector = 'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';
        const focusables = dialog.querySelectorAll(focusableSelector);
        const firstFocusable = focusables[0],
            lastFocusable = focusables[focusables.length - 1];
        const trap = (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else if (document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable.focus();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelHandler();
            }
        };
        dialog.addEventListener('keydown', trap);
        this.baseTable._listeners.push({
            el: dialog,
            ev: 'keydown',
            fn: trap
        });

        const self = this.baseTable;
        let resolvedOnce = false;
        const promise = new Promise((resolve) => {
            const submitHandler = async (ev) => {
                ev.preventDefault();
                if (self._isSaving)
                    return;
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }

                const fd = new FormData(form);
                const payload = {};
                for (const [k, v] of fd.entries()) {
                    const schemaField = (this.baseTable.formSchema || []).find(x => x.name === k);
                    if (schemaField) {
                        switch (schemaField.type) {
                            case 'number':
                                payload[k] = v === '' ? null : Number(v);
                                break;
                            case 'checkbox':
                                payload[k] = form.querySelector(`[name="${k}"]`).checked;
                                break;
                            default:
                                payload[k] = v;
                        }
                    } else
                        payload[k] = v;
                }

                (this.baseTable.formSchema || []).filter(f => f.type === 'checkbox').forEach(f => {
                    if (!(f.name in payload))
                        payload[f.name] = !!(form.querySelector(`[name="${f.name}"]`)?.checked);
                });

                if (initial && initial[this.baseTable.idField] !== undefined && !payload[this.baseTable.idField])
                    payload[this.baseTable.idField] = initial[this.baseTable.idField];

                self._isSaving = true;
                try {
                    let res;
                    if (!payload[this.baseTable.idField]) {
                        if (!self.apis.apiAdd)
                            throw new Error('apiAdd not provided');
                        res = await self.apis.apiAdd(payload);
                    } else {
                        if (!self.apis.apiUpdate)
                            throw new Error('apiUpdate not provided');
                        res = await self.apis.apiUpdate(payload[this.baseTable.idField], payload);
                    }
                    const saved = self._resolveResponse(res) || payload;

                    if (!payload[this.baseTable.idField]) {
                        const added = (saved && saved[self.idField] !== undefined) ? saved : Object.assign({
                            [self.idField]: (Date.now())
                        }, saved);
                        self.data.unshift(added);
                    } else {
                        const idx = self.data.findIndex(d => String(d[self.idField]) === String(payload[this.baseTable.idField]));
                        if (idx === -1)
                            self.data.unshift(saved);
                        else
                            self.data[idx] = self._mergeLocalItem(self.data[idx], saved);
                    }

                    self.log('Saved item', saved);
                    resolvedOnce = true;
                    resolve(saved);
                } catch (err) {
                    self.error('modal save error', err);
                    alert('Ошибка при сохранении. Смотрите консоль.');
                    resolve(null);
                } finally {
                    self._isSaving = false;
                }
            };

            form.addEventListener('submit', submitHandler);
            this.baseTable._listeners.push({
                el: form,
                ev: 'submit',
                fn: submitHandler
            });

            const cancelHandler = () => {
                if (!resolvedOnce)
                    resolve(null);
                try {
                    form.removeEventListener('submit', submitHandler);
                } catch (e) {}
                modalBuilder.close();
            };

            const cancelBtn = form.querySelector('[data-action="cancel"]');
            if (cancelBtn) {
                const onCancel = (e) => {
                    e.preventDefault();
                    cancelHandler();
                };
                cancelBtn.addEventListener('click', onCancel);
                this.baseTable._listeners.push({
                    el: cancelBtn,
                    ev: 'click',
                    fn: onCancel
                });
            }

            const closeBtn = dialog.querySelector('button[data-action="close"]') || dialog.querySelector('.btn-ghost');
            if (closeBtn) {
                const onClose = cancelHandler;
                closeBtn.addEventListener('click', onClose);
                this.baseTable._listeners.push({
                    el: closeBtn,
                    ev: 'click',
                    fn: onClose
                });
            }
        });

        return {
            promise,
            close: () => {
                try {
                    modalBuilder.close();
                } catch (e) {}
            }
        };
    }

    async openEditModal(id) {
        const item = this.baseTable.data.find(d => String(d[this.baseTable.idField]) === String(id));
        const {
            promise
        } = this._openFormForItem(item || {
            [this.baseTable.idField]: id
        });
        const saved = await promise;
        let table = document.querySelector('table');
        if (saved && saved.type === "success") {
            this.baseTable.applyFiltersAndRender();
            this._closeModal();
            this.baseTable.refresh();
        }
        try {
            if (table && window.$)
                $(table).notify(saved?.message, saved?.type);
        } catch (e) {}
    }

    _defaultModalBuilder() {
        return {
            open: (title, contentNode) => {
                if (this.baseTable._modal)
                    this._closeModal();
                const overlay = this.baseTable._create('div', {
                    className: 'pe-modal-overlay',
                    attrs: {
                        role: 'dialog',
                        'aria-modal': 'true'
                    }
                });
                const dialog = this.baseTable._create('div', {
                    className: 'pe-modal-dialog'
                });
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);
                this.baseTable._modal = {
                    overlay,
                    dialog,
                    focusRestore: document.activeElement
                };

                const header = this.baseTable._create('div', {
                    className: 'pe-modal-header'
                });
                const h = this.baseTable._create('h4', {
                    className: 'modal-title',
                    text: title
                });
                const close = this.baseTable._create('button', {
                    className: 'btn btn-ghost',
                    text: '✕',
                    attrs: {
                        'data-action': 'close',
                        'aria-label': 'Close'
                    }
                });
                header.appendChild(h);
                header.appendChild(close);
                dialog.appendChild(header);

                const content = this.baseTable._create('div', {
                    className: 'pe-modal-content'
                });
                if (typeof contentNode === 'string')
                    content.innerHTML = contentNode;
                else if (contentNode instanceof Node)
                    content.appendChild(contentNode);
                dialog.appendChild(content);

                overlay.style.display = 'flex';
                close.addEventListener('click', () => this._closeModal());
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay)
                        this._closeModal();
                });
                setTimeout(() => {
                    const focusEl = dialog.querySelector('input,select,textarea,button');
                    if (focusEl)
                        try {
                            focusEl.focus();
                        } catch (e) {}
                }, 40);
                return {
                    overlay,
                    dialog
                };
            },
            close: () => this._closeModal()
        };
    }

    async openAddModal() {
        const {
            promise
        } = this._openFormForItem({});
        const saved = await promise;
        if (saved)
            this.baseTable.applyFiltersAndRender();
        this._closeModal();
    }

    _closeModal() {
        if (!this.baseTable._modal)
            return;
        try {
            const {
                overlay,
                focusRestore
            } = this.baseTable._modal;
            overlay.remove();
            if (focusRestore && typeof focusRestore.focus === 'function')
                focusRestore.focus();
        } catch (e) {
            this.baseTable.warn('_closeModal error', e);
        }
        this.baseTable._modal = null;
    }
}