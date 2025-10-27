// Table.js
var Table = class {
  constructor(baseTable) {
    this.baseTable = baseTable;
  }
  createRowFromData(row) {
    const tr = document.createElement("tr");
    if (row[this.baseTable.idField] !== void 0) tr.dataset.id = String(row[this.baseTable.idField]);
    for (const col of this.baseTable.columns) {
      const td = document.createElement("td");
      if (col.className) td.className = col.className;
      if (col.width) td.style.width = col.width;
      if (col.attrs && typeof col.attrs === "object") {
        Object.entries(col.attrs).forEach(([k, v]) => td.setAttribute(k, v));
      }
      const val = this.getByPath(row, col.key);
      if (typeof col.renderer === "function") {
        try {
          const out = col.renderer(val, row, {
            table: this.baseTable,
            col
          });
          if (typeof out === "string") td.innerHTML = out;
          else if (out instanceof Node) td.appendChild(out);
          else td.textContent = out ?? "";
        } catch (e) {
          this.baseTable.error("col.renderer error", e);
          td.textContent = String(val ?? "");
        }
        tr.appendChild(td);
        continue;
      }
      const type = col.type || this._inferTypeFromValue(val);
      const renderer = this.baseTable.typeRenderers.get(type);
      if (typeof renderer !== "function") {
        td.textContent = String(val ?? "");
        tr.appendChild(td);
        continue;
      }
      try {
        renderer.call(this.baseTable, td, val, col, row, {
          escapeHtml: BaseTable.escapeHtml,
          formatPrice: this.formatPrice?.bind(this.baseTable)
        });
      } catch (e) {
        this.baseTable.error("type renderer error", e);
        td.textContent = String(val ?? "");
      }
      tr.appendChild(td);
    }
    if (this.baseTable.actions && this.baseTable.actions.length) {
      const tdActions = document.createElement("td");
      tdActions.className = "text-end";
      for (const a of this.baseTable.actions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = a.className || "btn btn-sm btn-outline-secondary";
        btn.textContent = a.label;
        if (a.title) btn.title = a.title;
        if (a.action) btn.dataset.action = a.action;
        btn.dataset.id = row[this.baseTable.idField];
        if (a.attrs) Object.entries(a.attrs).forEach(([k, v]) => btn.setAttribute(k, v));
        tdActions.appendChild(btn);
        if (typeof a.after === "function") {
          try {
            a.after(btn, row);
          } catch (e) {
            this.baseTable.error("action.after", e);
          }
        }
      }
      tr.appendChild(tdActions);
    }
    return tr;
  }
  getByPath(obj, path) {
    if (!obj || !path) return void 0;
    if (path.indexOf(".") === -1) return obj[path];
    return path.split(".").reduce((cur, p) => cur && cur[p] !== void 0 ? cur[p] : void 0, obj);
  }
  _inferTypeFromValue(val) {
    if (val == null) return "text";
    if (typeof val === "boolean") return "boolean";
    if (typeof val === "number") return "number";
    if (val instanceof Date) return "date";
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{10,13}$/.test(s)) return "date";
    if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(s)) return "image";
    if (/^https?:\/\//i.test(s) || /^mailto:/i.test(s) || /^\/\//.test(s)) return "link";
    return "text";
  }
  formatPrice(v) {
    if (v === null || v === void 0 || v === "") return "\u2014";
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return n.toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }
  _buildFormFromSchema(item = {}) {
    if (typeof this.baseTable.ui.formBuilder === "function") {
      try {
        return this.baseTable.ui.formBuilder(this.baseTable.formSchema, item, this.baseTable.refs, {
          placeholderSVG: this.baseTable.placeholderSVG.bind(this.baseTable)
        });
      } catch (e) {
        this.baseTable.error("ui.formBuilder error", e);
      }
    }
    const form = document.createElement("form");
    form.className = "bt-dynamic-form pe-form";
    const grid = document.createElement("div");
    grid.className = "bt-form-grid";
    if (!document.getElementById("bt-form-grid-style")) {
      const mediaStyle = document.createElement("style");
      mediaStyle.id = "bt-form-grid-style";
      mediaStyle.textContent = `.bt-form-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; } @media (max-width: 720px) { .bt-form-grid { grid-template-columns: 1fr; } }`;
      document.head.appendChild(mediaStyle);
    }
    const fieldMap = {};
    const groups = {};
    (this.baseTable.formSchema || []).forEach((f) => {
      const g = f.group || "__default";
      if (!groups[g])
        groups[g] = [];
      groups[g].push(f);
    });
    const makeFieldCard = (title) => {
      const card = document.createElement("div");
      card.className = "bt-field-card";
      Object.assign(card.style, {
        padding: "10px",
        borderRadius: "10px",
        background: "#fff",
        border: "1px solid #eef4fb",
        boxShadow: "0 6px 18px rgba(12,20,40,0.02)"
      });
      return card;
    };
    const makeRow = (field) => {
      const wrap = document.createElement("div");
      wrap.className = "bt-form-row";
      if (field.type !== "hidden") {
        const labelRow = document.createElement("div");
        Object.assign(labelRow.style, {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        });
        const label = document.createElement("label");
        label.className = "form-label";
        label.textContent = field.label || field.name || "";
        Object.assign(label.style, {
          fontWeight: 600,
          fontSize: "0.95rem"
        });
        labelRow.appendChild(label);
        if (field.hint) {
          const hint = document.createElement("div");
          hint.className = "form-hint";
          hint.textContent = field.hint;
          Object.assign(hint.style, {
            fontSize: "0.82rem",
            color: "#6b7280"
          });
          labelRow.appendChild(hint);
        }
        if (field.required) {
          const star = document.createElement("span");
          star.style.color = "#ef4444";
          star.textContent = " *";
          label.appendChild(star);
        }
        wrap.appendChild(labelRow);
      }
      let control;
      const attrs = field.attrs || {};
      switch (field.type) {
        case "textarea":
          control = document.createElement("textarea");
          control.rows = attrs.rows || 4;
          control.className = attrs.className || "form-control";
          if (field.placeholder)
            control.placeholder = field.placeholder;
          break;
        case "number":
          control = document.createElement("input");
          control.type = "number";
          control.className = attrs.className || "form-control";
          if (field.placeholder)
            control.placeholder = field.placeholder;
          if (attrs.min !== void 0)
            control.min = attrs.min;
          if (attrs.step !== void 0)
            control.step = attrs.step;
          break;
        case "price": {
          const wrapper = document.createElement("div");
          wrapper.className = attrs.wrapperClass || "input-group";
          const currencyCode = (field.currency || this.baseTable.options.currency || "RUB").toUpperCase();
          const currencySymbols = {
            RUB: "\u20BD",
            RUBLES: "\u20BD",
            USD: "$",
            EUR: "\u20AC",
            GBP: "\xA3"
          };
          const currencySign = field.currencySign || (currencySymbols[currencyCode] || currencyCode);
          const prefix = document.createElement("span");
          prefix.className = attrs.prefixClass || "input-group-text";
          prefix.setAttribute("aria-hidden", "true");
          prefix.textContent = currencySign;
          const visible = document.createElement("input");
          visible.type = "text";
          visible.className = (attrs.className ? attrs.className + " " : "") + "form-control bt-field-price-visible";
          if (field.placeholder)
            visible.placeholder = field.placeholder;
          visible.setAttribute("inputmode", "numeric");
          visible.setAttribute("autocomplete", "off");
          visible.setAttribute("aria-label", field.label || field.name || "\u0426\u0435\u043D\u0430");
          const hidden = document.createElement("input");
          hidden.type = "hidden";
          hidden.className = "bt-field-price-hidden";
          wrapper.appendChild(prefix);
          wrapper.appendChild(visible);
          wrapper.appendChild(hidden);
          const parseToNumber = (s) => {
            if (s === "" || s === null || s === void 0)
              return null;
            try {
              const cleaned = String(s).replace(/\s+/g, "").replace(/\u00A0/g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
              const n = Number(cleaned);
              return Number.isFinite(n) ? n : null;
            } catch (e) {
              return null;
            }
          };
          const syncToHidden = (valStr) => {
            const n = parseToNumber(valStr);
            if (n === null) {
              hidden.value = "";
              visible.removeAttribute("data-raw");
            } else {
              const precision = Number.isFinite(field.precision) ? Math.max(0, field.precision) : 0;
              const raw = precision ? Math.round(n * Math.pow(10, precision)) / Math.pow(10, precision) : Math.trunc(n);
              hidden.value = String(raw);
              visible.setAttribute("data-raw", String(raw));
            }
          };
          let pluginApplied = false;
          const initialVal = item[field.name];
          try {
            if (window.jQuery) {
              const $v = jQuery(visible);
              if (typeof jQuery.fn.maskMoney === "function") {
                $v.maskMoney({
                  thousands: " ",
                  decimal: ",",
                  allowZero: true,
                  precision: field.precision ?? 0
                });
                if (initialVal !== void 0 && initialVal !== null && String(initialVal) !== "") {
                  const num = Number(String(initialVal).toString().replace(/\s+/g, "").replace(",", ".")) || 0;
                  $v.maskMoney("mask", num);
                  syncToHidden(String(num));
                } else {
                  $v.maskMoney("mask");
                }
                $v.on("mask.maskMoney input change", () => {
                  syncToHidden($v.val());
                });
                pluginApplied = true;
              } else if (typeof jQuery.fn.mask === "function") {
                try {
                  $v.mask("000 000 000 000 000", {
                    reverse: true
                  });
                } catch (e) {
                  $v.mask("999 999 999 999 999", {
                    reverse: true
                  });
                }
                if (initialVal !== void 0 && initialVal !== null && String(initialVal) !== "") {
                  $v.val(String(initialVal)).trigger("input");
                  syncToHidden($v.val());
                }
                $v.on("input change", () => syncToHidden($v.val()));
                pluginApplied = true;
              } else if (typeof jQuery.fn.maskedInput === "function" || typeof jQuery.fn.masked === "function") {
                try {
                  if (typeof jQuery.fn.maskedInput === "function")
                    jQuery(visible).maskedInput("999999999999");
                  else
                    jQuery(visible).masked("999999999999");
                } catch (e) {
                }
                if (initialVal !== void 0 && initialVal !== null && String(initialVal) !== "") {
                  $v.val(String(initialVal)).trigger("input");
                  syncToHidden($v.val());
                }
                $v.on("input change", () => syncToHidden($v.val()));
                pluginApplied = true;
              }
            }
          } catch (e) {
            pluginApplied = false;
          }
          const liveHandler = (ev) => {
            const raw = String(visible.value || "").replace(/\s+/g, "").replace(/[^\d,.-]/g, "").replace(",", ".");
            const num = parseToNumber(raw);
            if (num === null) {
              syncToHidden(visible.value);
              return;
            }
            const precision = Number.isFinite(field.precision) ? Math.max(0, field.precision) : 0;
            let display;
            try {
              if (precision > 0)
                display = num.toLocaleString("ru-RU", {
                  minimumFractionDigits: precision,
                  maximumFractionDigits: precision
                });
              else
                display = Math.trunc(num).toLocaleString("ru-RU");
            } catch (e) {
              display = String(Math.trunc(num)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
            }
            visible.value = display;
            try {
              visible.setSelectionRange(visible.value.length, visible.value.length);
            } catch (_) {
            }
            syncToHidden(display);
          };
          if (!pluginApplied) {
            visible.addEventListener("input", liveHandler);
            this.baseTable._listeners.push({
              el: visible,
              ev: "input",
              fn: liveHandler
            });
            try {
              if (initialVal !== void 0 && initialVal !== null && String(initialVal) !== "") {
                const n = parseToNumber(String(initialVal));
                if (n !== null) {
                  const precision = Number.isFinite(field.precision) ? Math.max(0, field.precision) : 0;
                  visible.value = precision > 0 ? n.toLocaleString("ru-RU", {
                    minimumFractionDigits: precision,
                    maximumFractionDigits: precision
                  }) : Math.trunc(n).toLocaleString("ru-RU");
                  syncToHidden(visible.value);
                } else {
                  visible.value = String(initialVal);
                  syncToHidden(visible.value);
                }
              }
            } catch (e) {
            }
          }
          prefix.addEventListener("click", () => {
            try {
              visible.focus();
            } catch (e) {
            }
          });
          this.baseTable._listeners.push({
            el: prefix,
            ev: "click",
            fn: () => {
              try {
                visible.focus();
              } catch (e) {
              }
            }
          });
          fieldMap[field.name] = visible;
          hidden.name = field.name;
          visible.id = `bt-field-${field.name}-visible`;
          hidden.id = `bt-field-${field.name}`;
          wrap.appendChild(wrapper);
          return wrap;
        }
        case "select": {
          const selectWrap = document.createElement("div");
          Object.assign(selectWrap.style, {
            display: "flex",
            flexDirection: "column",
            gap: "6px"
          });
          let searchInput = null;
          if (field.searchable) {
            searchInput = document.createElement("input");
            searchInput.type = "search";
            searchInput.placeholder = "\u041F\u043E\u0438\u0441\u043A...";
            searchInput.className = "form-control form-control-sm";
            searchInput.style.width = "100%";
            selectWrap.appendChild(searchInput);
          }
          control = document.createElement("select");
          control.className = attrs.className || "form-select";
          control.name = field.name;
          control.style.width = "100%";
          control.setAttribute("aria-label", field.label || field.name || "");
          const placeholderOption = document.createElement("option");
          placeholderOption.value = "";
          placeholderOption.textContent = field.placeholder ?? "\u2014";
          placeholderOption.setAttribute("aria-placeholder", "true");
          control.appendChild(placeholderOption);
          const opts = field.options || (field.ref ? this.baseTable.refs[field.ref] ?? null : null);
          let populatePromise = null;
          if (opts && opts.length) {
            for (const o of opts) {
              const {
                value,
                label
              } = this.baseTable._mapOptionValueLabel(o, field);
              const optEl = document.createElement("option");
              optEl.value = value;
              optEl.textContent = label;
              optEl.title = label;
              control.appendChild(optEl);
            }
          } else {
            const tmp = document.createElement("option");
            tmp.value = "";
            tmp.disabled = true;
            tmp.selected = true;
            tmp.textContent = field.ref ? "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." : "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445";
            control.appendChild(tmp);
            if (field.ref) {
              populatePromise = (async () => {
                try {
                  await this.baseTable._ensureRefLoaded(field.ref);
                } catch (e) {
                }
                try {
                  await this.baseTable._populateSelectFromRef(control, field);
                } catch (e) {
                  this.baseTable.error("_populateSelectFromRef async error", e);
                }
              })();
            }
          }
          control._populatePromise = populatePromise;
          if (searchInput) {
            const onSearch = (e) => {
              const q = String(e.target.value || "").toLowerCase().trim();
              Array.from(control.options).forEach((opt) => {
                if (opt.getAttribute("aria-placeholder") === "true")
                  return opt.hidden = false;
                const label = (opt.textContent || "").toLowerCase();
                opt.hidden = q ? !label.includes(q) : false;
              });
              if (control.selectedOptions.length && control.selectedOptions[0].hidden)
                control.value = "";
            };
            searchInput.addEventListener("input", onSearch);
            this.baseTable._listeners.push({
              el: searchInput,
              ev: "input",
              fn: onSearch
            });
          }
          selectWrap.appendChild(control);
          wrap.appendChild(selectWrap);
          fieldMap[field.name] = control;
          return wrap;
        }
        case "checkbox": {
          control = document.createElement("input");
          control.type = "checkbox";
          control.className = attrs.className || "form-check-input";
          const chkRow = document.createElement("div");
          Object.assign(chkRow.style, {
            display: "flex",
            alignItems: "center",
            gap: "8px"
          });
          chkRow.appendChild(control);
          if (field.note) {
            const note = document.createElement("div");
            note.textContent = field.note;
            Object.assign(note.style, {
              fontSize: "0.92rem",
              color: "#374151"
            });
            chkRow.appendChild(note);
          }
          wrap.appendChild(chkRow);
          fieldMap[field.name] = control;
          return wrap;
        }
        case "date":
          control = document.createElement("input");
          control.type = "date";
          control.className = attrs.className || "form-control";
          break;
        case "image": {
          const row = document.createElement("div");
          Object.assign(row.style, {
            display: "grid",
            gridTemplateColumns: "1fr 180px",
            gap: "14px",
            alignItems: "start"
          });
          const control2 = document.createElement("input");
          control2.type = "hidden";
          control2.className = attrs.className || "form-control";
          control2.name = field.name;
          const dropArea = document.createElement("div");
          dropArea.className = "bt-drop";
          dropArea.innerHTML = `
    <div class="bt-drop-icon" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 3v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7l4-4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 15v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="bt-drop-text">\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u0438\u043B\u0438 \u043A\u043B\u0438\u043A\u043D\u0438\u0442\u0435</div>
    <div class="bt-drop-sub">\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F JPG, PNG, WEBP. \u041C\u0430\u043A\u0441. \u0440\u0430\u0437\u043C\u0435\u0440: 5 MB</div>
  `;
          const fileInput = document.createElement("input");
          fileInput.type = "file";
          fileInput.accept = "image/*";
          fileInput.style.display = "none";
          const previewWrap = document.createElement("div");
          previewWrap.className = "pe-right";
          const previewContainer = document.createElement("div");
          previewContainer.style.position = "relative";
          const preview = document.createElement("img");
          preview.className = "bt-preview";
          preview.src = item && item[field.name] ? item[field.name] : this.baseTable.placeholderSVG(360, 180);
          preview.alt = "preview";
          const progressWrap = document.createElement("div");
          progressWrap.className = "bt-progress-wrap";
          const progressBar = document.createElement("div");
          progressBar.className = "bt-progress";
          const progressFill = document.createElement("div");
          progressFill.className = "bt-progress-fill";
          progressBar.appendChild(progressFill);
          const progressPercent = document.createElement("div");
          progressPercent.className = "bt-progress-percent";
          progressPercent.textContent = "0%";
          progressWrap.appendChild(progressBar);
          progressWrap.appendChild(progressPercent);
          const status = document.createElement("div");
          status.className = "bt-status bt-small";
          status.textContent = "";
          const controls = document.createElement("div");
          controls.className = "bt-controls";
          const resetBtn = document.createElement("button");
          resetBtn.type = "button";
          resetBtn.className = "bt-btn ghost";
          resetBtn.textContent = "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C";
          const openBtn = document.createElement("button");
          openBtn.type = "button";
          openBtn.className = "bt-btn primary";
          openBtn.textContent = "\u041E\u0442\u043A\u0440\u044B\u0442\u044C";
          controls.appendChild(resetBtn);
          controls.appendChild(openBtn);
          const actionBtn = document.createElement("button");
          actionBtn.type = "button";
          actionBtn.className = "bt-btn ghost";
          actionBtn.style.display = "none";
          actionBtn.textContent = "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C";
          controls.appendChild(actionBtn);
          previewContainer.appendChild(preview);
          previewContainer.appendChild(progressWrap);
          previewContainer.appendChild(status);
          previewWrap.appendChild(previewContainer);
          previewWrap.appendChild(controls);
          let currentXhr = null;
          const showStatus = (txt, state) => {
            status.textContent = txt || "";
            status.classList.remove("error", "success");
            if (state === "error")
              status.classList.add("error");
            if (state === "success")
              status.classList.add("success");
          };
          const setProgress = (percent, indeterminate = false) => {
            if (indeterminate) {
              if (!progressBar.querySelector(".bt-progress-indet")) {
                const ind = document.createElement("div");
                ind.className = "bt-progress-indet";
                progressBar.appendChild(ind);
              }
              progressFill.style.width = "100%";
              progressPercent.textContent = "...";
            } else {
              const p = Math.max(0, Math.min(100, Math.round(percent)));
              const anim = progressBar.querySelector(".bt-progress-indet");
              if (anim)
                anim.remove();
              progressFill.style.width = `${p}%`;
              progressPercent.textContent = `${p}%`;
            }
          };
          const resetUI = () => {
            setProgress(0);
            showStatus("", "");
            actionBtn.style.display = "none";
            actionBtn.textContent = "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C";
            actionBtn.className = "bt-btn ghost";
          };
          const uploadFile = (file) => {
            return new Promise((resolve, reject) => {
              if (!(file instanceof File))
                return reject(new Error("uploadFile expects a File"));
              if (currentXhr) {
                try {
                  currentXhr.abort();
                } catch (e) {
                }
                currentXhr = null;
              }
              const uploadUrl = this.baseTable.options.uploadUrl || "/";
              const categoryName = field && field.category || item && item.category || this.baseTable.options.defaultCategory || "default";
              const fd = new FormData();
              fd.append("file", file);
              fd.append("category", categoryName);
              fd.append("admPanel", "imageUpload");
              const xhr = new XMLHttpRequest();
              currentXhr = xhr;
              xhr.open("POST", uploadUrl, true);
              if (this.baseTable.options.withCredentials)
                xhr.withCredentials = true;
              if (this.baseTable.options.uploadHeaders && typeof this.baseTable.options.uploadHeaders === "object") {
                Object.keys(this.baseTable.options.uploadHeaders).forEach((k) => {
                  try {
                    xhr.setRequestHeader(k, this.baseTable.options.uploadHeaders[k]);
                  } catch (err) {
                  }
                });
              }
              actionBtn.style.display = "inline-block";
              actionBtn.textContent = "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C";
              actionBtn.className = "bt-btn ghost";
              showStatus("\u041D\u0430\u0447\u0430\u043B\u043E \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438...", "");
              setProgress(0);
              const onCancel = () => {
                if (xhr) {
                  try {
                    xhr.abort();
                  } catch (e) {
                  }
                  showStatus("\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430", "error");
                  resetUI();
                  reject(new Error("Upload cancelled"));
                }
              };
              actionBtn.onclick = onCancel;
              xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable) {
                  setProgress(ev.loaded / ev.total * 100, false);
                  showStatus("\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430: " + Math.round(ev.loaded / ev.total * 100) + "%", "");
                } else {
                  setProgress(0, true);
                  showStatus("\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...", "");
                }
              };
              xhr.onload = () => {
                currentXhr = null;
                if (xhr.status >= 200 && xhr.status < 300) {
                  let data = {};
                  try {
                    data = JSON.parse(xhr.responseText || "{}");
                  } catch (e) {
                    data = {};
                  }
                  const serverPath = data.path || data.url || data.filePath || data.filename || data.file || null;
                  if (!serverPath) {
                    showStatus("\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u043F\u0443\u0442\u044C \u043A \u0444\u0430\u0439\u043B\u0443", "error");
                    resetUI();
                    return reject(new Error("Server did not return file path"));
                  }
                  setProgress(100);
                  showStatus("\u0413\u043E\u0442\u043E\u0432\u043E", "success");
                  actionBtn.style.display = "none";
                  actionBtn.textContent = "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0435\u0449\u0451";
                  actionBtn.className = "bt-btn ghost";
                  actionBtn.onclick = () => {
                    resetUI();
                    fileInput.value = "";
                  };
                  control2.value = serverPath;
                  preview.src = serverPath;
                  control2.dispatchEvent(new Event("change", {
                    bubbles: true
                  }));
                  return resolve(serverPath);
                } else {
                  let txt = xhr.responseText || `${xhr.status} ${xhr.statusText}`;
                  try {
                    txt = JSON.parse(xhr.responseText || "") || txt;
                  } catch (e) {
                  }
                  showStatus("\u041E\u0448\u0438\u0431\u043A\u0430: " + (typeof txt === "string" ? txt : JSON.stringify(txt)), "error");
                  actionBtn.style.display = "inline-block";
                  actionBtn.textContent = "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C";
                  actionBtn.className = "bt-btn primary";
                  actionBtn.onclick = () => {
                    resetUI();
                    handleFile(file);
                  };
                  resetUI();
                  return reject(new Error("Upload failed: " + xhr.status));
                }
              };
              xhr.onerror = () => {
                currentXhr = null;
                showStatus("\u0421\u0435\u0442\u0435\u0432\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435", "error");
                actionBtn.style.display = "inline-block";
                actionBtn.textContent = "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C";
                actionBtn.className = "bt-btn primary";
                actionBtn.onclick = () => {
                  resetUI();
                  handleFile(file);
                };
                resetUI();
                return reject(new Error("Network error during upload"));
              };
              xhr.onabort = () => {
                currentXhr = null;
                showStatus("\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430", "error");
                actionBtn.style.display = "inline-block";
                actionBtn.textContent = "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C";
                actionBtn.className = "bt-btn primary";
                actionBtn.onclick = () => {
                  resetUI();
                  handleFile(file);
                };
                resetUI();
                return reject(new Error("Upload aborted"));
              };
              xhr.send(fd);
            });
          };
          const handleFile = (fileOrUrl) => {
            if (!fileOrUrl)
              return;
            if (fileOrUrl instanceof File) {
              if (!fileOrUrl.type.startsWith("image/")) {
                preview.src = this.baseTable.placeholderSVG(360, 180);
                control2.value = "";
                showStatus("\u041D\u0435\u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u043C\u044B\u0439 \u0444\u043E\u0440\u043C\u0430\u0442 \u0444\u0430\u0439\u043B\u0430", "error");
                return;
              }
              uploadFile(fileOrUrl).catch((err) => {
                console.error("Upload failed", err);
                const reader = new FileReader();
                reader.onload = () => {
                  preview.src = String(reader.result || "");
                };
                reader.onerror = () => {
                  preview.src = this.baseTable.placeholderSVG(360, 180);
                  control2.value = "";
                };
                reader.readAsDataURL(fileOrUrl);
                if (this.baseTable.notifications && typeof this.baseTable.notifications.error === "function") {
                  this.baseTable.notifications.error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440.");
                } else {
                  showStatus("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435", "error");
                }
              });
            } else if (typeof fileOrUrl === "string") {
              const url = fileOrUrl.trim();
              if (!url)
                return;
              const tmp = new Image();
              tmp.onload = () => {
                control2.value = url;
                preview.src = url;
                control2.dispatchEvent(new Event("change", {
                  bubbles: true
                }));
                showStatus("URL \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D", "");
              };
              tmp.onerror = () => {
                preview.src = this.baseTable.placeholderSVG(360, 180);
                control2.value = "";
                showStatus("\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0439 URL \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F", "error");
              };
              tmp.src = url;
            }
          };
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
            dropArea.classList.add("dragging");
          };
          const onDragLeave = (e) => {
            e.preventDefault();
            dropArea.classList.remove("dragging");
          };
          const onDrop = (e) => {
            e.preventDefault();
            dropArea.classList.remove("dragging");
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) {
              handleFile(f);
              return;
            }
            const text = e.dataTransfer && e.dataTransfer.getData && e.dataTransfer.getData("text") || "";
            if (text && text.startsWith("http"))
              handleFile(text);
          };
          const onPaste = (e) => {
            const items = e.clipboardData && e.clipboardData.items || [];
            for (let i = 0; i < items.length; i++) {
              const it = items[i];
              if (it.kind === "file") {
                const f = it.getAsFile();
                if (f) {
                  handleFile(f);
                  return;
                }
              }
            }
            const text = (e.clipboardData || window.clipboardData).getData("text");
            if (text && text.startsWith("http"))
              handleFile(text);
          };
          const onReset = (e) => {
            e.preventDefault();
            control2.value = "";
            fileInput.value = "";
            preview.src = this.baseTable.placeholderSVG(360, 180);
            control2.dispatchEvent(new Event("change", {
              bubbles: true
            }));
            resetUI();
          };
          const onOpen = (e) => {
            e.preventDefault();
            const val = String(control2.value || "").trim();
            if (!val)
              return;
            if (val.startsWith("data:") || val.startsWith("http")) {
              window.open(val, "_blank");
            } else {
              console.warn("\u041D\u0435\u0447\u0435\u0433\u043E \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0442\u044C: \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0441\u0441\u044B\u043B\u043A\u043E\u0439 \u0438\u043B\u0438 data URL.");
              showStatus("\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0441\u0441\u044B\u043B\u043A\u043E\u0439", "error");
            }
          };
          dropArea.addEventListener("click", onClickDrop);
          this.baseTable._listeners.push({
            el: dropArea,
            ev: "click",
            fn: onClickDrop
          });
          fileInput.addEventListener("change", onFileChange);
          this.baseTable._listeners.push({
            el: fileInput,
            ev: "change",
            fn: onFileChange
          });
          dropArea.addEventListener("dragover", onDragOver);
          this.baseTable._listeners.push({
            el: dropArea,
            ev: "dragover",
            fn: onDragOver
          });
          dropArea.addEventListener("dragleave", onDragLeave);
          this.baseTable._listeners.push({
            el: dropArea,
            ev: "dragleave",
            fn: onDragLeave
          });
          dropArea.addEventListener("drop", onDrop);
          this.baseTable._listeners.push({
            el: dropArea,
            ev: "drop",
            fn: onDrop
          });
          dropArea.addEventListener("paste", onPaste);
          this.baseTable._listeners.push({
            el: dropArea,
            ev: "paste",
            fn: onPaste
          });
          resetBtn.addEventListener("click", onReset);
          this.baseTable._listeners.push({
            el: resetBtn,
            ev: "click",
            fn: onReset
          });
          openBtn.addEventListener("click", onOpen);
          this.baseTable._listeners.push({
            el: openBtn,
            ev: "click",
            fn: onOpen
          });
          const leftCol = document.createElement("div");
          leftCol.appendChild(dropArea);
          leftCol.appendChild(fileInput);
          leftCol.appendChild(control2);
          row.appendChild(leftCol);
          row.appendChild(previewWrap);
          wrap.appendChild(row);
          fieldMap[field.name] = control2;
          return wrap;
        }
        case "hidden":
          control = document.createElement("input");
          control.type = "hidden";
          break;
        case "json": {
          const rowWrap = document.createElement("div");
          rowWrap.className = attrs.className || "bt-json-wrap";
          Object.assign(rowWrap.style, {
            marginTop: "6px"
          });
          const list = document.createElement("ul");
          list.className = "bt-json-list";
          Object.assign(list.style, {
            margin: "6px 0 0 0",
            paddingLeft: "18px"
          });
          const hidden = document.createElement("textarea");
          hidden.name = field.name;
          hidden.style.display = "none";
          let initialObj = {};
          const raw = item && item[field.name] !== void 0 ? item[field.name] : field.value ?? {};
          try {
            initialObj = typeof raw === "string" ? JSON.parse(raw) : raw && typeof raw === "object" ? raw : {};
          } catch (e) {
            initialObj = {};
          }
          const controls = document.createElement("div");
          controls.className = "bt-json-controls";
          Object.assign(controls.style, {
            marginTop: "8px",
            display: "flex",
            gap: "8px"
          });
          const addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.className = "btn btn-sm btn-outline-secondary";
          addBtn.textContent = field.addLabel || "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u0430\u0440\u0443";
          controls.appendChild(addBtn);
          const updateHidden = () => {
            const obj = {};
            Array.from(list.children).forEach((li) => {
              const kInput = li.querySelector(".bt-json-key");
              const vInput = li.querySelector(".bt-json-value");
              if (!kInput)
                return;
              const key = String(kInput.value || "").trim();
              if (!key)
                return;
              obj[key] = vInput ? vInput.value : "";
            });
            try {
              hidden.value = JSON.stringify(obj);
            } catch (e) {
              hidden.value = "{}";
            }
          };
          const makeRow2 = (key = "", value = "") => {
            const li = document.createElement("li");
            Object.assign(li.style, {
              marginBottom: "6px",
              display: "flex",
              gap: "8px",
              alignItems: "center"
            });
            const keyInput = document.createElement("input");
            keyInput.type = "text";
            keyInput.placeholder = "\u043A\u043B\u044E\u0447";
            keyInput.className = "bt-json-key form-control form-control-sm";
            keyInput.value = key;
            const valInput = document.createElement("input");
            valInput.type = "text";
            valInput.placeholder = "\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435";
            valInput.className = "bt-json-value form-control form-control-sm";
            valInput.value = value === null || value === void 0 ? "" : String(value);
            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "btn btn-sm btn-outline-danger";
            removeBtn.textContent = "\u2715";
            removeBtn.title = "\u0423\u0434\u0430\u043B\u0438\u0442\u044C";
            Object.assign(keyInput.style, {
              width: "30%"
            });
            Object.assign(valInput.style, {
              width: "calc(70% - 34px)"
            });
            Object.assign(removeBtn.style, {
              flex: "0 0 34px",
              height: "30px",
              padding: "0 6px"
            });
            li.appendChild(keyInput);
            li.appendChild(valInput);
            li.appendChild(removeBtn);
            const onInput = () => updateHidden();
            keyInput.addEventListener("input", onInput);
            valInput.addEventListener("input", onInput);
            this.baseTable._listeners.push({
              el: keyInput,
              ev: "input",
              fn: onInput
            });
            this.baseTable._listeners.push({
              el: valInput,
              ev: "input",
              fn: onInput
            });
            const onRemove = (ev) => {
              ev.preventDefault();
              try {
                li.remove();
              } catch (e) {
                li.parentNode && li.parentNode.removeChild(li);
              }
              updateHidden();
            };
            removeBtn.addEventListener("click", onRemove);
            this.baseTable._listeners.push({
              el: removeBtn,
              ev: "click",
              fn: onRemove
            });
            return li;
          };
          if (initialObj && typeof initialObj === "object") {
            if (Array.isArray(initialObj)) {
              initialObj.forEach((v, i) => list.appendChild(makeRow2(String(i), typeof v === "object" ? JSON.stringify(v) : String(v))));
            } else {
              Object.entries(initialObj).forEach(([k, v]) => list.appendChild(makeRow2(k, typeof v === "object" ? JSON.stringify(v) : String(v))));
            }
          }
          updateHidden();
          const onAdd = (ev) => {
            ev.preventDefault();
            const newLi = makeRow2("", "");
            list.appendChild(newLi);
            const keyInp = newLi.querySelector(".bt-json-key");
            if (keyInp)
              setTimeout(() => {
                try {
                  keyInp.focus();
                } catch (e) {
                }
              }, 10);
            updateHidden();
          };
          addBtn.addEventListener("click", onAdd);
          this.baseTable._listeners.push({
            el: addBtn,
            ev: "click",
            fn: onAdd
          });
          rowWrap.appendChild(list);
          rowWrap.appendChild(controls);
          rowWrap.appendChild(hidden);
          wrap.appendChild(rowWrap);
          fieldMap[field.name] = hidden;
          return wrap;
        }
        case "link":
        case "text":
        default:
          control = document.createElement("input");
          control.type = "text";
          control.className = attrs.className || "form-control";
          if (field.placeholder)
            control.placeholder = field.placeholder;
          break;
      }
      if (!control)
        control = document.createElement("input");
      control.name = field.name;
      control.id = `bt-field-${field.name}`;
      control.setAttribute("aria-label", field.label || field.name || "");
      if (field.required)
        control.required = true;
      if (field.readonly)
        control.readOnly = true;
      if (field.disabled)
        control.disabled = true;
      if (field.note) {
        const note = document.createElement("div");
        note.className = "pe-note";
        note.textContent = field.note;
        Object.assign(note.style, {
          fontSize: "0.86rem",
          color: "#6b7280"
        });
        wrap.appendChild(control);
        wrap.appendChild(note);
      } else
        wrap.appendChild(control);
      const errorHint = document.createElement("div");
      errorHint.className = "bt-field-error";
      Object.assign(errorHint.style, {
        color: "#ef4444",
        fontSize: "0.82rem",
        display: "none"
      });
      wrap.appendChild(errorHint);
      const onInvalid = (e) => {
        e.preventDefault();
        errorHint.textContent = field.errorMessage || "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E";
        errorHint.style.display = "block";
      };
      control.addEventListener("invalid", onInvalid);
      this.baseTable._listeners.push({
        el: control,
        ev: "invalid",
        fn: onInvalid
      });
      const onInputHide = () => {
        errorHint.style.display = "none";
      };
      control.addEventListener("input", onInputHide);
      this.baseTable._listeners.push({
        el: control,
        ev: "input",
        fn: onInputHide
      });
      fieldMap[field.name] = control;
      return wrap;
    };
    const groupNames = Object.keys(groups);
    for (const gName of groupNames) {
      const fields = groups[gName];
      const isDefault = gName === "__default";
      if (!isDefault) {
        const card = makeFieldCard(gName);
        card.style.gridColumn = "1 / -1";
        const title = document.createElement("div");
        Object.assign(title.style, {
          fontWeight: 700,
          marginBottom: "8px"
        });
        title.textContent = gName;
        card.appendChild(title);
        const inner = document.createElement("div");
        Object.assign(inner.style, {
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px"
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
          if (f.layout === "full")
            node.style.gridColumn = "1 / -1";
          grid.appendChild(node);
        }
      }
    }
    const actionsWrap = document.createElement("div");
    Object.assign(actionsWrap.style, {
      gridColumn: "1 / -1",
      display: "flex",
      justifyContent: "flex-end",
      gap: "10px",
      paddingTop: "6px"
    });
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn btn-primary";
    submit.textContent = "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-outline-secondary";
    cancel.textContent = "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C";
    cancel.dataset.action = "cancel";
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
        case "checkbox":
          el.checked = Boolean(val);
          break;
        case "date":
          if (val)
            el.value = val;
          break;
        case "select":
          if (val !== void 0 && val !== null && String(val) !== "") {
            try {
              el.value = String(val);
            } catch (e) {
            }
            const hasOption = Array.from(el.options).some((o) => o.value === String(val));
            if (!hasOption && f.ref) {
              (async () => {
                try {
                  if (el._populatePromise)
                    await el._populatePromise;
                  else
                    await this.baseTable._ensureRefLoaded(f.ref).catch(() => {
                    });
                  await this.baseTable._populateSelectFromRef(el, f);
                } catch (e) {
                  this.baseTable.error("async select populate/set error", e);
                }
                try {
                  el.value = String(val);
                } catch (e) {
                }
                if (!Array.from(el.options).some((o) => o.value === String(val))) {
                  setTimeout(() => {
                    try {
                      el.value = String(val);
                    } catch (e) {
                    }
                  }, 60);
                }
              })();
            }
          }
          break;
        case "image":
          try {
            const ctrlEl = el.id && form.querySelector(`#${el.id}`) ? form.querySelector(`#${el.id}`) : el;
            const rowEl = ctrlEl ? ctrlEl.closest?.(".bt-form-row") || ctrlEl.parentNode : null;
            const fileInput = rowEl ? rowEl.querySelector('input[type="file"]') : null;
            const preview = rowEl ? rowEl.querySelector("img.bt-image-preview") : null;
            if (val) {
              try {
                el.value = String(val);
              } catch (e) {
                el.value = "";
              }
              if (preview)
                preview.src = String(val);
            } else {
              el.value = "";
              if (preview)
                preview.src = this.baseTable.placeholderSVG(320, 180);
            }
            if (fileInput) {
              const onFileChange = (e) => {
                const f2 = e.target.files && e.target.files[0];
                if (!f2)
                  return;
                if (!f2.type || !f2.type.startsWith("image/")) {
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    el.value = String(reader.result || "");
                  } catch (err) {
                    el.value = "";
                  }
                  if (preview)
                    preview.src = el.value || this.baseTable.placeholderSVG(320, 180);
                };
                reader.onerror = () => {
                  if (preview)
                    preview.src = this.baseTable.placeholderSVG(320, 180);
                };
                reader.readAsDataURL(f2);
              };
              const existing = (this.baseTable._listeners || []).some((l) => l.el === fileInput && l.ev === "change");
              if (!existing) {
                fileInput.addEventListener("change", onFileChange);
                this.baseTable._listeners.push({
                  el: fileInput,
                  ev: "change",
                  fn: onFileChange
                });
              }
            }
          } catch (err) {
            this.baseTable.error("image init error", err);
          }
          break;
        case "price":
          if (val !== void 0 && val !== null && String(val) !== "") {
            try {
              el.value = String(val);
            } catch (e) {
            }
          }
          try {
            this.baseTable._applyPriceMaskToElement(el, val);
          } catch (e) {
            this.baseTable.error("_applyPriceMaskToElement error", e);
          }
          break;
        default:
          if (val !== void 0 && val !== null) {
            try {
              el.value = String(val);
            } catch (e) {
            }
          }
      }
      if (f.type !== "price" && el && el.matches && el.matches("input.bt-field-price")) {
        try {
          this.baseTable._applyPriceMaskToElement(el, el.value || null);
        } catch (e) {
        }
      }
    }
    return {
      form,
      fieldMap,
      submitBtn: submit,
      cancelBtn: cancel
    };
  }
};

// Modal.js
var Modal = class {
  constructor(baseTable) {
    this.baseTable = baseTable;
  }
  _openFormForItem(initial = {}) {
    if (this.baseTable._modal)
      this._closeModal();
    const modalBuilder = this.baseTable._ensureModalBuilder();
    const title = initial && initial[this.baseTable.idField] ? "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C" : "\u041D\u043E\u0432\u044B\u0439 \u044D\u043B\u0435\u043C\u0435\u043D\u0442";
    const built = this.baseTable.table._buildFormFromSchema(initial || {});
    const containerNode = built.form instanceof Node ? built.form : built;
    const m = modalBuilder.open(title, containerNode instanceof Node ? containerNode : containerNode.form || containerNode);
    const dialog = m.dialog;
    const form = containerNode.form || containerNode;
    const focusableSelector = 'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const focusables = dialog.querySelectorAll(focusableSelector);
    const firstFocusable = focusables[0], lastFocusable = focusables[focusables.length - 1];
    const trap = (e) => {
      if (e.key === "Tab") {
        if (e.shiftKey) {
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
          }
        } else if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelHandler();
      }
    };
    dialog.addEventListener("keydown", trap);
    this.baseTable._listeners.push({
      el: dialog,
      ev: "keydown",
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
          const schemaField = (this.baseTable.formSchema || []).find((x) => x.name === k);
          if (schemaField) {
            switch (schemaField.type) {
              case "number":
                payload[k] = v === "" ? null : Number(v);
                break;
              case "checkbox":
                payload[k] = form.querySelector(`[name="${k}"]`).checked;
                break;
              default:
                payload[k] = v;
            }
          } else
            payload[k] = v;
        }
        (this.baseTable.formSchema || []).filter((f) => f.type === "checkbox").forEach((f) => {
          if (!(f.name in payload))
            payload[f.name] = !!form.querySelector(`[name="${f.name}"]`)?.checked;
        });
        if (initial && initial[this.baseTable.idField] !== void 0 && !payload[this.baseTable.idField])
          payload[this.baseTable.idField] = initial[this.baseTable.idField];
        self._isSaving = true;
        try {
          let res;
          if (!payload[this.baseTable.idField]) {
            if (!self.apis.apiAdd)
              throw new Error("apiAdd not provided");
            res = await self.apis.apiAdd(payload);
          } else {
            if (!self.apis.apiUpdate)
              throw new Error("apiUpdate not provided");
            res = await self.apis.apiUpdate(payload[this.baseTable.idField], payload);
          }
          const saved = self._resolveResponse(res) || payload;
          if (!payload[this.baseTable.idField]) {
            const added = saved && saved[self.idField] !== void 0 ? saved : Object.assign({
              [self.idField]: Date.now()
            }, saved);
            self.data.unshift(added);
          } else {
            const idx = self.data.findIndex((d) => String(d[self.idField]) === String(payload[this.baseTable.idField]));
            if (idx === -1)
              self.data.unshift(saved);
            else
              self.data[idx] = self._mergeLocalItem(self.data[idx], saved);
          }
          self.log("Saved item", saved);
          resolvedOnce = true;
          resolve(saved);
        } catch (err) {
          self.error("modal save error", err);
          alert("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0438. \u0421\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u043A\u043E\u043D\u0441\u043E\u043B\u044C.");
          resolve(null);
        } finally {
          self._isSaving = false;
        }
      };
      form.addEventListener("submit", submitHandler);
      this.baseTable._listeners.push({
        el: form,
        ev: "submit",
        fn: submitHandler
      });
      const cancelHandler2 = () => {
        if (!resolvedOnce)
          resolve(null);
        try {
          form.removeEventListener("submit", submitHandler);
        } catch (e) {
        }
        modalBuilder.close();
      };
      const cancelBtn = form.querySelector('[data-action="cancel"]');
      if (cancelBtn) {
        const onCancel = (e) => {
          e.preventDefault();
          cancelHandler2();
        };
        cancelBtn.addEventListener("click", onCancel);
        this.baseTable._listeners.push({
          el: cancelBtn,
          ev: "click",
          fn: onCancel
        });
      }
      const closeBtn = dialog.querySelector('button[data-action="close"]') || dialog.querySelector(".btn-ghost");
      if (closeBtn) {
        const onClose = cancelHandler2;
        closeBtn.addEventListener("click", onClose);
        this.baseTable._listeners.push({
          el: closeBtn,
          ev: "click",
          fn: onClose
        });
      }
    });
    return {
      promise,
      close: () => {
        try {
          modalBuilder.close();
        } catch (e) {
        }
      }
    };
  }
  async openEditModal(id) {
    const item = this.baseTable.data.find((d) => String(d[this.baseTable.idField]) === String(id));
    const {
      promise
    } = this._openFormForItem(item || {
      [this.baseTable.idField]: id
    });
    const saved = await promise;
    let table = document.querySelector("table");
    if (saved && saved.type === "success") {
      this.baseTable.applyFiltersAndRender();
      this._closeModal();
      this.baseTable.refresh();
    }
    try {
      if (table && window.$)
        $(table).notify(saved?.message, saved?.type);
    } catch (e) {
    }
  }
  _defaultModalBuilder() {
    return {
      open: (title, contentNode) => {
        if (this.baseTable._modal)
          this._closeModal();
        const overlay = this.baseTable._create("div", {
          className: "pe-modal-overlay",
          attrs: {
            role: "dialog",
            "aria-modal": "true"
          }
        });
        const dialog = this.baseTable._create("div", {
          className: "pe-modal-dialog"
        });
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        this.baseTable._modal = {
          overlay,
          dialog,
          focusRestore: document.activeElement
        };
        const header = this.baseTable._create("div", {
          className: "pe-modal-header"
        });
        const h = this.baseTable._create("h4", {
          className: "modal-title",
          text: title
        });
        const close = this.baseTable._create("button", {
          className: "btn btn-ghost",
          text: "\u2715",
          attrs: {
            "data-action": "close",
            "aria-label": "Close"
          }
        });
        header.appendChild(h);
        header.appendChild(close);
        dialog.appendChild(header);
        const content = this.baseTable._create("div", {
          className: "pe-modal-content"
        });
        if (typeof contentNode === "string")
          content.innerHTML = contentNode;
        else if (contentNode instanceof Node)
          content.appendChild(contentNode);
        dialog.appendChild(content);
        overlay.style.display = "flex";
        close.addEventListener("click", () => this._closeModal());
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay)
            this._closeModal();
        });
        setTimeout(() => {
          const focusEl = dialog.querySelector("input,select,textarea,button");
          if (focusEl)
            try {
              focusEl.focus();
            } catch (e) {
            }
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
      if (focusRestore && typeof focusRestore.focus === "function")
        focusRestore.focus();
    } catch (e) {
      this.baseTable.warn("_closeModal error", e);
    }
    this.baseTable._modal = null;
  }
};

// RendererRegistry.js
var RendererRegistry = class {
  constructor(baseTable) {
    this.baseTable = baseTable;
  }
  registerTypeRenderer(type, fn) {
    if (!type || typeof fn !== "function")
      throw new Error("registerTypeRenderer(type, fn) invalid args");
    this.baseTable.typeRenderers.set(String(type), fn);
    this.baseTable.log("Registered renderer:" + type);
  }
  _registerDefaults() {
    this.registerTypeRenderer(
      "text",
      (td, val, col) => {
        const s = val == null ? "" : String(val);
        const max = col.maxLength || col.truncate || 0;
        if (max && s.length > max) {
          const short = s.slice(0, max - 1) + "\u2026";
          const span = this.baseTable._create("span", {
            text: short
          });
          span.title = s;
          td.appendChild(span);
        } else
          td.textContent = s;
      }
    );
    this.registerTypeRenderer(
      "link",
      (td, val, col, row) => {
        if (!val) {
          td.textContent = "\u2014";
          return;
        }
        const href = String(val);
        const allowed = /^(https?:|mailto:|\/)/i;
        const safeHref = allowed.test(href) ? href : "//" + href.replace(/^[\/]+/, "");
        const a = this.baseTable._create("a", {
          attrs: {
            href: safeHref,
            target: "_blank",
            rel: "noopener noreferrer"
          }
        });
        a.textContent = col.textKey ? this.baseTable._valueForField(col.textKey, row) || "" : col.display || String(val);
        td.appendChild(a);
      }
    );
    this.registerTypeRenderer(
      "image",
      (td, val, col) => {
        const img = document.createElement("img");
        img.src = val || this.baseTable.placeholderSVG(80, 80);
        img.className = "image";
        img.loading = "lazy";
        img.addEventListener(
          "error",
          () => {
            try {
              img.src = this.baseTable.placeholderSVG(80, 80);
            } catch (e) {
            }
          }
        );
        td.appendChild(img);
      }
    );
    this.registerTypeRenderer(
      "date",
      (td, val, col) => {
        if (val === void 0 || val === null || val === "") {
          td.textContent = "\u2014";
          return;
        }
        const date = this.baseTable._parseToDate(val);
        if (!date || isNaN(date.getTime())) {
          td.textContent = String(val);
          return;
        }
        const opts = col.dateFormat || {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        };
        try {
          const txt = date.toLocaleString(col.locale || "ru-RU", opts);
          td.textContent = txt;
          td.title = date.toISOString();
          td.setAttribute("data-timestamp", String(Math.floor(date.getTime() / 1e3)));
          td.className = "unixDate";
        } catch (e) {
          td.textContent = date.toString();
        }
      }
    );
    this.registerTypeRenderer(
      "number",
      (td, val, col) => {
        const n = Number(val);
        if (Number.isNaN(n)) {
          td.textContent = String(val ?? "\u2014");
          return;
        }
        td.textContent = typeof col.formatPrice === "function" ? col.formatPrice(n) : n.toLocaleString();
      }
    );
    this.registerTypeRenderer(
      "boolean",
      (td, val) => {
        td.textContent = val ? "\u0414\u0430" : "\u041D\u0435\u0442";
      }
    );
    this.registerTypeRenderer(
      "price",
      (td, val, col = {}, row = {}) => {
        const raw = val === void 0 || val === null || val === "" ? 0 : Number(String(val).replace(/\s+/g, "").replace(",", "."));
        const n = Number.isFinite(raw) ? raw : 0;
        const currency = String(col.currency || this.baseTable.options.currency || "RUB").toUpperCase();
        const maxFrac = typeof col.maximumFractionDigits === "number" ? col.maximumFractionDigits : 0;
        try {
          const fmt = new Intl.NumberFormat(col.locale || "ru-RU", {
            style: "currency",
            currency,
            maximumFractionDigits: maxFrac,
            minimumFractionDigits: 0
          });
          td.innerHTML = `<div class="price" data-currency="${BaseTable.escapeHtml(currency)}">${fmt.format(n)}</div>`;
        } catch (e) {
          const formatted = n.toLocaleString("ru-RU", {
            maximumFractionDigits: maxFrac
          });
          td.textContent = currency ? `${formatted} ${currency}` : formatted;
        }
        try {
          td.setAttribute("data-raw", String(n));
        } catch (_) {
        }
        td.classList.add("cell-price");
      }
    );
    this.registerTypeRenderer(
      "json",
      (td, val, col = {}, row = {}) => {
        if (val === void 0 || val === null || val === "") {
          td.textContent = "\u2014";
          return;
        }
        let obj = val;
        if (typeof val === "string") {
          try {
            obj = JSON.parse(val);
          } catch (e) {
            td.textContent = String(val);
            return;
          }
        }
        const maxDepth = Number.isFinite(col.maxDepth) ? Math.max(0, col.maxDepth) : 2;
        const maxItems = Number.isFinite(col.maxItems) ? Math.max(1, col.maxItems) : 50;
        const linkify = col.linkify === true;
        const renderPrimitive = (v) => {
          if (v === null || v === void 0)
            return document.createTextNode("\u2014");
          if (typeof v === "string") {
            const s = v;
            if (linkify && /^(https?:\/\/|\/\/)/i.test(s)) {
              const a = document.createElement("a");
              a.href = s.startsWith("//") ? location.protocol + s : s;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              a.textContent = s;
              return a;
            }
            return document.createTextNode(String(s));
          }
          if (typeof v === "boolean" || typeof v === "number")
            return document.createTextNode(String(v));
          return document.createTextNode(String(v));
        };
        const createList = (value, depth = 0) => {
          const ul = document.createElement("ul");
          ul.className = "bt-json-render";
          ul.style.margin = "6px 0 0 0";
          ul.style.paddingLeft = "18px";
          if (depth > maxDepth) {
            const li2 = document.createElement("li");
            li2.textContent = "\u2026";
            ul.appendChild(li2);
            return ul;
          }
          if (Array.isArray(value)) {
            const len = Math.min(value.length, maxItems);
            for (let i = 0; i < len; i++) {
              const v = value[i];
              const li2 = document.createElement("li");
              const strong = document.createElement("strong");
              strong.textContent = `${i}: `;
              li2.appendChild(strong);
              if (v && typeof v === "object")
                li2.appendChild(createList(v, depth + 1));
              else
                li2.appendChild(renderPrimitive(v));
              ul.appendChild(li2);
            }
            if (value.length > maxItems) {
              const li2 = document.createElement("li");
              li2.textContent = `... ${value.length - maxItems} more`;
              ul.appendChild(li2);
            }
            return ul;
          }
          if (value && typeof value === "object") {
            const entries = Object.entries(value);
            const len = Math.min(entries.length, maxItems);
            for (let i = 0; i < len; i++) {
              const [k, v] = entries[i];
              const li2 = document.createElement("li");
              const keyNode = document.createElement("strong");
              keyNode.textContent = `${k}: `;
              li2.appendChild(keyNode);
              if (v && typeof v === "object")
                li2.appendChild(createList(v, depth + 1));
              else
                li2.appendChild(renderPrimitive(v));
              ul.appendChild(li2);
            }
            if (entries.length > maxItems) {
              const li2 = document.createElement("li");
              li2.textContent = `... ${entries.length - maxItems} more`;
              ul.appendChild(li2);
            }
            return ul;
          }
          const li = document.createElement("li");
          li.appendChild(renderPrimitive(value));
          ul.appendChild(li);
          return ul;
        };
        try {
          td.classList.add("cell-json");
          td.appendChild(createList(obj, 0));
          try {
            td.setAttribute("data-json", BaseTable.escapeHtml(JSON.stringify(obj)));
          } catch (_) {
          }
        } catch (err) {
          td.textContent = String(val);
        }
      }
    );
  }
};

// BaseTable.js
var BaseTable2 = class _BaseTable {
  constructor(adminPanel = null, options = {}) {
    this.adminPanel = adminPanel;
    this.options = options || {};
    this.typeRenderers = /* @__PURE__ */ new Map();
    this.table = new Table(this);
    this.modal = new Modal(this);
    this.renderRegistry = new RendererRegistry(this);
    this._meta = {
      author: "Calista Verner",
      version: options.version || "1.4.2",
      license: options.license || "MIT"
    };
    const defaultSelectors = {
      container: options.selectors?.container || "adminContent",
      tbody: options.selectors?.tbody || "tbody",
      search: options.selectors?.search || "search",
      clear: options.selectors?.clear || "clear",
      count: options.selectors?.count || "count",
      noResults: options.selectors?.noResults || "noResults",
      table: options.selectors?.table || "table",
      add: options.selectors?.add || "add",
      loading: options.selectors?.loading || "bt-loading"
    };
    this.selectors = Object.assign({}, defaultSelectors, options.selectors || {});
    this.container = typeof this.selectors.container === "string" ? document.getElementById(this.selectors.container) || document.querySelector(this.selectors.container) || document.body : this.selectors.container || document.body;
    this.idField = options.idField || "id";
    this.columns = options.columns || [];
    this.formSchema = options.formSchema || [];
    this.placeholderLabel = options.placeholderLabel || "\u041D\u0435\u0442 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F";
    this.apis = Object.assign({
      apiCall: null,
      apiAdd: null,
      apiUpdate: null,
      apiDelete: null,
      refs: {}
    }, options.apis || {});
    this.actions = options.actions || [{
      label: "\u0418\u0437\u043C\u0435\u043D.",
      action: "edit",
      className: "btn btn-sm btn-outline-primary me-1",
      title: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C"
    }, {
      label: "\u0423\u0434\u0430\u043B.",
      action: "delete",
      className: "btn btn-sm btn-outline-danger",
      title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C"
    }];
    this.ui = Object.assign({
      showLoadingOverlay: true,
      loadingSelector: this.selectors.loading,
      createLoadingElement: null,
      modalBuilder: null,
      formBuilder: null
    }, options.ui || {});
    this.brandTag = options.brandName || adminPanel && adminPanel.brandName || "BaseTable";
    this.data = [];
    this.refs = {};
    this._refsLoading = null;
    this._refsLoaded = false;
    this.state = {
      q: "",
      sortBy: null,
      sortDir: 1
    };
    this._els = {};
    this.bound = {};
    this._modal = null;
    this._isSaving = false;
    this._listeners = [];
    this.options.currency = this.options.currency || "RUB";
    this._formatNumberToLocale = (n) => {
      try {
        return n.toLocaleString("ru-RU", {
          maximumFractionDigits: 0
        });
      } catch {
        return String(n);
      }
    };
    this.renderRegistry._registerDefaults();
    this._livePriceInputHandler = this._livePriceInputHandler.bind(this);
    this._priceMaskCleanup = this._priceMaskCleanup.bind(this);
    document.addEventListener("focusin", this._priceMaskHandler);
  }
  _livePriceInputHandler(e) {
    const el = e.target;
    if (!el || el.tagName !== "INPUT")
      return;
    const raw = String(el.value || "").replace(/\s+/g, "").replace(/[^\d,.-]/g, "").replace(",", ".");
    const num = Number(raw);
    if (!Number.isFinite(num))
      return;
    const formatted = this._formatNumberToLocale(Math.trunc(num));
    const pos = el.selectionStart || el.value.length;
    el.value = formatted;
    try {
      el.setSelectionRange(el.value.length, el.value.length);
    } catch (_) {
    }
  }
  _priceMaskCleanup(el) {
    if (!el)
      return;
    if (el.dataset)
      delete el.dataset.priceMaskApplied;
  }
  _applyPriceMaskToElement(el, initialVal) {
    if (!el || el.tagName !== "INPUT")
      return;
    if (el.dataset && el.dataset.priceMaskApplied) {
      if (initialVal === void 0 || initialVal === null || String(initialVal) === "")
        return;
      try {
        if (window.jQuery && typeof jQuery.fn.mask === "function") {
          jQuery(el).val(String(initialVal)).trigger("input");
          return;
        }
        if (window.jQuery && typeof jQuery.fn.maskMoney === "function") {
          const num = Number(String(initialVal).replace(/\s+/g, "").replace(",", ".")) || 0;
          jQuery(el).maskMoney("mask", num);
          return;
        }
      } catch (err) {
      }
      try {
        const raw = String(initialVal).replace(/\s+/g, "").replace(",", ".");
        const num = Number(raw);
        if (Number.isFinite(num))
          el.value = this._formatNumberToLocale(Math.trunc(num));
      } catch (_) {
      }
      return;
    }
    if (el.dataset)
      el.dataset.priceMaskApplied = "1";
    try {
      if (window.jQuery && typeof jQuery.fn.mask === "function") {
        jQuery(el).mask("000 000 000 000", {
          reverse: true
        });
        if (initialVal !== void 0 && initialVal !== null && String(initialVal) !== "") {
          jQuery(el).val(String(initialVal)).trigger("input");
        } else {
          jQuery(el).trigger("input");
        }
        return;
      }
      if (window.jQuery && typeof jQuery.fn.maskMoney === "function") {
        jQuery(el).maskMoney({
          thousands: " ",
          decimal: ",",
          allowZero: true,
          precision: 0
        });
        if (initialVal !== void 0 && initialVal !== null && String(initialVal) !== "") {
          const num = Number(String(initialVal).replace(/\s+/g, "").replace(",", ".")) || 0;
          jQuery(el).maskMoney("mask", num);
        } else {
          jQuery(el).maskMoney("mask");
        }
        return;
      }
    } catch (err) {
    }
    const handler = this._livePriceInputHandler;
    el.addEventListener("input", handler);
    this._listeners.push({
      el,
      ev: "input",
      fn: handler
    });
    try {
      const raw = initialVal !== void 0 && initialVal !== null && String(initialVal) !== "" ? String(initialVal).replace(/\s+/g, "").replace(",", ".") : (el.value || "").replace(/\s+/g, "").replace(",", ".");
      const num = Number(raw);
      if (Number.isFinite(num))
        el.value = this._formatNumberToLocale(Math.trunc(num));
    } catch (_) {
    }
  }
  meta() {
    return {
      ...this._meta
    };
  }
  _logPrefixStyle() {
    return ["background:#0ea5a4;color:#fff;padding:4px 8px;border-radius:6px;font-weight:700", "color:#374151"];
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
    this._console("log", ...args);
  }
  info(...args) {
    this._console("info", ...args);
  }
  warn(...args) {
    try {
      const p1 = "background:#f59e0b;color:#fff;padding:4px 8px;border-radius:6px;font-weight:700";
      console.warn(`%c ${this.brandTag} %c`, p1, "color:#374151", ...args);
    } catch (e) {
      console.warn(this.brandTag, ...args);
    }
  }
  error(...args) {
    try {
      const p1 = "background:#ef4444;color:#fff;padding:4px 8px;border-radius:6px;font-weight:700";
      console.error(`%c ${this.brandTag} %c`, p1, "color:#fff", ...args);
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
        return new Date(n * 1e3);
      return new Date(n);
    };
    if (typeof val === "number")
      return tryNumber(val);
    if (typeof val === "string") {
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
    } catch (e) {
    }
    return null;
  }
  static escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[m]);
  }
  placeholderSVG(w = 80, h = 80, label = null) {
    const text = _BaseTable.escapeHtml(label ?? this.placeholderLabel);
    return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#f2f6fb"/><text x="50%" y="50%" fill="#9aa6bf" font-size="${Math.max(10, Math.round(w / 8))}" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`);
  }
  registerTypeRenderer(type, fn) {
    if (!type || typeof fn !== "function")
      throw new Error("registerTypeRenderer(type, fn) invalid args");
    this.typeRenderers.set(String(type), fn);
    this.log("Registered renderer:" + type);
  }
  getByPath(obj, path) {
    if (!obj || !path)
      return void 0;
    if (path.indexOf(".") === -1)
      return obj[path];
    return path.split(".").reduce((cur, p) => cur && cur[p] !== void 0 ? cur[p] : void 0, obj);
  }
  _inferTypeFromValue(val) {
    if (val == null)
      return "text";
    if (typeof val === "boolean")
      return "boolean";
    if (typeof val === "number")
      return "number";
    if (val instanceof Date)
      return "date";
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{10,13}$/.test(s))
      return "date";
    if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(s))
      return "image";
    if (/^https?:\/\//i.test(s) || /^mailto:/i.test(s) || /^\/\//.test(s))
      return "link";
    return "text";
  }
  _valueForField(field, row) {
    if (!field)
      return void 0;
    if (typeof field === "function")
      return field(row);
    if (typeof field === "string")
      return this.getByPath(row, field);
    return void 0;
  }
  formatLink(href) {
    return href ? `<a href="${_BaseTable.escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${_BaseTable.escapeHtml(href)}</a>` : "\u2014";
  }
  formatPrice(v) {
    if (v === null || v === void 0 || v === "")
      return "\u2014";
    const n = Number(v);
    if (Number.isNaN(n))
      return String(v);
    return n.toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }
  debounce(fn, ms = 200) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }
  _create(tag, opts = {}) {
    const el = document.createElement(tag);
    if (opts.className)
      el.className = opts.className;
    if (opts.text)
      el.textContent = opts.text;
    if (opts.html)
      el.innerHTML = opts.html;
    if (opts.attrs)
      Object.entries(opts.attrs).forEach(([k, v]) => el.setAttribute(k, v));
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
      if (typeof res === "string")
        return JSON.parse(res);
    } catch (e) {
    }
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
    const overlay = this._create("div", {
      className: "bt-loading-overlay",
      attrs: {
        role: "status",
        "aria-hidden": "true"
      }
    });
    const inner = this._create("div", {
      className: "bt-loading-inner",
      attrs: {
        "aria-live": "polite"
      }
    });
    const spinner = this._create("i", {
      className: "fa-solid fa-spinner fa-spin bt-fa-spinner",
      attrs: {
        "aria-hidden": "true"
      }
    });
    const label = this._create("div", {
      className: "bt-loading-text",
      text: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..."
    });
    inner.appendChild(spinner);
    inner.appendChild(label);
    overlay.appendChild(inner);
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(255,255,255,0.6)",
      zIndex: 9998,
      pointerEvents: "none"
    });
    Object.assign(inner.style, {
      display: "inline-flex",
      gap: "10px",
      alignItems: "center",
      padding: "8px 12px",
      borderRadius: "10px",
      background: "rgba(255,255,255,0.95)",
      boxShadow: "0 6px 20px rgba(20,30,50,0.08)",
      pointerEvents: "auto"
    });
    return overlay;
  }
  showLoading(msg = "") {
    if (!this.ui.showLoadingOverlay)
      return;
    this._ensureEls();
    if (typeof this.ui.createLoadingElement === "function") {
      try {
        if (!this._els._customLoading) {
          this._els._customLoading = this.ui.createLoadingElement(this._els.table || this.container, msg);
          if (this._els._customLoading)
            (this._els.table || this.container || document.body).appendChild(this._els._customLoading);
        }
        if (this._els._customLoading) {
          this._els._customLoading.style.display = "";
          this._els._customLoading.setAttribute("aria-hidden", "false");
        }
      } catch (e) {
        this.error("createLoadingElement error", e);
      }
      return;
    }
    if (!this._els._autoLoading) {
      this._els._autoLoading = this._createDefaultLoading();
      const parent = this._els.table || this.container || document.body;
      const cs = getComputedStyle(parent);
      if (cs.position === "static")
        parent.style.position = "relative";
      parent.appendChild(this._els._autoLoading);
    }
    if (msg) {
      const txt = this._els._autoLoading.querySelector(".bt-loading-text");
      if (txt)
        txt.textContent = msg;
    }
    this._els._autoLoading.style.display = "flex";
    this._els._autoLoading.setAttribute("aria-hidden", "false");
  }
  hideLoading() {
    setTimeout(
      () => {
        try {
          if (this._els._customLoading) {
            this._els._customLoading.style.display = "none";
            this._els._customLoading.setAttribute("aria-hidden", "true");
          }
        } catch (e) {
        }
        try {
          if (this._els.loading) {
            this._els.loading.style.display = "none";
            this._els.loading.setAttribute("aria-hidden", "true");
          }
        } catch (e) {
        }
        try {
          if (this._els._autoLoading) {
            this._els._autoLoading.style.display = "none";
            this._els._autoLoading.setAttribute("aria-hidden", "true");
          }
        } catch (e) {
        }
      },
      200
    );
  }
  async fetchItems() {
    try {
      this.showLoading("\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0434\u0430\u043D\u043D\u044B\u0445...");
      let call = this.apis.apiCall;
      if (!call) {
        if (this.adminPanel?.foxEngine?.sendPostAndGetAnswer) {
          call = () => this.adminPanel.foxEngine.sendPostAndGetAnswer({
            sysRequest: "getCategories"
          }, "JSON");
        } else if (typeof foxEngine !== "undefined" && foxEngine.sendPostAndGetAnswer) {
          call = () => foxEngine.sendPostAndGetAnswer({
            sysRequest: "getCategories"
          }, "JSON");
        } else
          throw new Error("apiCall not provided");
      }
      const res = await call();
      const list = this._normalizeListResponse(res);
      this.log("items fetched", list && list.length || 0);
      return list;
    } catch (err) {
      this.error("fetchItems error", err);
      return [];
    } finally {
      setTimeout(() => this.hideLoading(), 200);
    }
  }
  createRowFromData(row) {
    const tr = document.createElement("tr");
    if (row[this.idField] !== void 0)
      tr.dataset.id = String(row[this.idField]);
    for (const col of this.columns) {
      const td = document.createElement("td");
      if (col.className)
        td.className = col.className;
      if (col.width)
        td.style.width = col.width;
      if (col.attrs && typeof col.attrs === "object") {
        Object.entries(col.attrs).forEach(([k, v]) => td.setAttribute(k, v));
      }
      const val = this.getByPath(row, col.key);
      if (typeof col.renderer === "function") {
        try {
          const out = col.renderer(val, row, {
            table: this,
            col
          });
          if (typeof out === "string")
            td.innerHTML = out;
          else if (out instanceof Node)
            td.appendChild(out);
          else
            td.textContent = out ?? "";
        } catch (e) {
          this.error("col.renderer error", e);
          td.textContent = String(val ?? "");
        }
        tr.appendChild(td);
        continue;
      }
      const type = col.type || this._inferTypeFromValue(val);
      const renderer = this.typeRenderers.get(type);
      if (typeof renderer !== "function") {
        td.textContent = String(val ?? "");
        tr.appendChild(td);
        continue;
      }
      try {
        renderer.call(this, td, val, col, row, {
          escapeHtml: _BaseTable.escapeHtml,
          formatPrice: this.formatPrice?.bind(this)
        });
      } catch (e) {
        this.error("type renderer error", e);
        td.textContent = String(val ?? "");
      }
      tr.appendChild(td);
    }
    if (this.actions && this.actions.length) {
      const tdActions = document.createElement("td");
      tdActions.className = "text-end";
      for (const a of this.actions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = a.className || "btn btn-sm btn-outline-secondary";
        btn.textContent = a.label;
        if (a.title)
          btn.title = a.title;
        if (a.action)
          btn.dataset.action = a.action;
        btn.dataset.id = row[this.idField];
        if (a.attrs)
          Object.entries(a.attrs).forEach(([k, v]) => btn.setAttribute(k, v));
        tdActions.appendChild(btn);
        if (typeof a.after === "function") {
          try {
            a.after(btn, row);
          } catch (e) {
            this.error("action.after", e);
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
      const v = String(row[col.key] ?? "").toLowerCase();
      if (v.includes(q))
        return true;
    }
    if (String(row[this.idField] ?? "").toLowerCase().includes(q))
      return true;
    return false;
  }
  applyFiltersAndRender() {
    let list = (this.data || []).filter((r) => this.matches(r, this.state.q));
    if (this.state.sortBy) {
      const key = this.state.sortBy;
      const dir = this.state.sortDir === 1 ? 1 : -1;
      list.sort(
        (a, b) => {
          let va = a[key], vb = b[key];
          if (typeof va === "number" || typeof vb === "number") {
            va = Number(va || 0);
            vb = Number(vb || 0);
            return (va - vb) * dir;
          }
          va = String(va ?? "").toLowerCase();
          vb = String(vb ?? "").toLowerCase();
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
      this.warn("tbody not found");
      return;
    }
    tbody.innerHTML = "";
    if (!list || !list.length) {
      if (noResults)
        noResults.style.display = "";
      if (countEl)
        countEl.textContent = "0";
      return;
    }
    if (noResults)
      noResults.style.display = "none";
    const frag = document.createDocumentFragment();
    for (const row of list)
      frag.appendChild(this.createRowFromData(row));
    tbody.appendChild(frag);
    if (countEl)
      countEl.textContent = `${list.length} \u0437\u0430\u043F\u0438\u0441\u0435\u0439`;
  }
  attachEvents() {
    this._ensureEls();
    const { search, clear, tbody, add } = this._els;
    if (search) {
      this.bound.onSearch = this.debounce(
        (e) => {
          this.state.q = e.target.value.trim();
          this.applyFiltersAndRender();
        },
        180
      );
      search.addEventListener("input", this.bound.onSearch);
      this._listeners.push({
        el: search,
        ev: "input",
        fn: this.bound.onSearch
      });
    }
    if (clear) {
      this.bound.onClear = () => {
        if (this._els.search)
          this._els.search.value = "";
        this.state.q = "";
        this.applyFiltersAndRender();
      };
      clear.addEventListener("click", this.bound.onClear);
      this._listeners.push({
        el: clear,
        ev: "click",
        fn: this.bound.onClear
      });
    }
    if (tbody) {
      this.bound.onTbodyClick = async (e) => {
        const btn = e.target.closest("button");
        if (!btn)
          return;
        const action = btn.dataset.action;
        const tr = btn.closest("tr");
        if (!tr)
          return;
        const id = tr.dataset.id;
        if (action === "edit")
          return this.modal.openEditModal(id);
        if (action === "delete")
          return this.openDeleteConfirm(id);
        if (typeof this.onAction === "function") {
          try {
            await this.onAction(action, id, tr);
          } catch (e2) {
            this.error("onAction error", e2);
          }
        }
      };
      tbody.addEventListener("click", this.bound.onTbodyClick);
      this._listeners.push({
        el: tbody,
        ev: "click",
        fn: this.bound.onTbodyClick
      });
    }
    if (add) {
      this.bound.onAdd = () => this.modal.openAddModal();
      add.addEventListener("click", this.bound.onAdd);
      this._listeners.push({
        el: add,
        ev: "click",
        fn: this.bound.onAdd
      });
    }
    const ths = (this._els.table || document).querySelectorAll("thead th[data-key]");
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
      (this._els.table || document).querySelectorAll(".sort-indicator").forEach((el) => el.textContent = "");
      const ind = (this._els.table || document).querySelector("#sort-" + key);
      if (ind)
        ind.textContent = this.state.sortDir === 1 ? "\u25B2" : "\u25BC";
      this.applyFiltersAndRender();
    };
    ths.forEach(
      (th) => {
        th.addEventListener("click", this.bound.onHeaderClick);
        this._listeners.push({
          el: th,
          ev: "click",
          fn: this.bound.onHeaderClick
        });
      }
    );
  }
  detachEvents() {
    for (const l of this._listeners) {
      try {
        l.el.removeEventListener(l.ev, l.fn, l.opts || false);
      } catch (e) {
      }
    }
    this._listeners = [];
    this.bound = {};
  }
  _ensureModalBuilder() {
    if (typeof this.ui.modalBuilder === "function")
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
        this.showLoading("\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A\u043E\u0432...");
        const calls = keys.map(
          (k) => {
            const v = refsMap[k];
            try {
              if (typeof v === "function")
                return Promise.resolve(v());
              if (v && typeof v.then === "function")
                return v;
              return Promise.resolve(v);
            } catch (e) {
              return Promise.resolve([]);
            }
          }
        );
        const settled = await Promise.allSettled(calls);
        keys.forEach(
          (k, i) => {
            const r = settled[i];
            if (r.status === "fulfilled")
              this.refs[k] = this._normalizeListResponse(r.value);
            else {
              this.error(`ref "${k}" load failed`, r.reason);
              this.refs[k] = [];
            }
          }
        );
        this.log("refs loaded", Object.keys(this.refs).map((k) => `${k}(${(this.refs[k] || []).length})`).join(", "));
        this._refsLoaded = true;
        return this.refs;
      } catch (err) {
        this.error("fetchRefs error", err);
        this.refs = {};
        this._refsLoaded = true;
        return {};
      } finally {
        this.hideLoading();
        this._refsLoading = null;
      }
    })();
    return this._refsLoading;
  }
  async _ensureRefLoaded(refKey) {
    if (!refKey)
      return [];
    if (this.refs && Array.isArray(this.refs[refKey]) && this.refs[refKey].length)
      return this.refs[refKey];
    try {
      const refProvider = (this.apis.refs || {})[refKey];
      if (typeof refProvider === "function") {
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
      const placeholder = selectEl.querySelector('option[aria-placeholder="true"]') || selectEl.querySelector("option:first-child");
      Array.from(selectEl.querySelectorAll("option")).forEach(
        (opt) => {
          if (opt === placeholder)
            return;
          opt.remove();
        }
      );
      let optsSource = field.options || null;
      if (!optsSource && field.ref)
        optsSource = await this._ensureRefLoaded(field.ref);
      if (!optsSource || !optsSource.length) {
        const tmp = document.createElement("option");
        tmp.value = "";
        tmp.disabled = true;
        tmp.selected = true;
        tmp.textContent = field.ref ? "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445" : "\u041D\u0435\u0442 \u043E\u043F\u0446\u0438\u0439";
        selectEl.appendChild(tmp);
        return;
      }
      for (const o of optsSource) {
        const { value, label } = this._mapOptionValueLabel(o, field);
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        opt.title = label;
        selectEl.appendChild(opt);
      }
      if (placeholder && placeholder.parentNode === selectEl)
        selectEl.insertBefore(placeholder, selectEl.firstChild);
    } catch (e) {
      this.error("_populateSelectFromRef error", e);
    }
  }
  _mapOptionValueLabel(opt, schemaField = {}) {
    if (typeof opt === "string" || typeof opt === "number")
      return {
        value: String(opt),
        label: String(opt)
      };
    const valueKey = schemaField.valueKey || schemaField.valueProp || "name";
    const labelKey = schemaField.labelKey || schemaField.labelProp || "fullname";
    const candidates = [valueKey, "value", "id", "name"];
    const labelCandidates = [labelKey, "name", "fullname", "label", "title"];
    let value;
    for (const k of candidates)
      if (opt[k] !== void 0 && opt[k] !== null) {
        value = opt[k];
        break;
      }
    let label;
    for (const k of labelCandidates)
      if (opt[k] !== void 0 && opt[k] !== null) {
        label = opt[k];
        break;
      }
    if (value === void 0)
      value = opt.value ?? opt.id ?? opt.name ?? JSON.stringify(opt);
    if (label === void 0)
      label = opt.name ?? opt.fullname ?? opt.label ?? String(value);
    return {
      value: String(value),
      label: String(label)
    };
  }
  async openDeleteConfirm(id) {
    const wrap = this._create("div");
    wrap.innerHTML = `<p>\u0412\u044B \u0443\u0432\u0435\u0440\u0435\u043D\u044B, \u0447\u0442\u043E \u0445\u043E\u0442\u0438\u0442\u0435 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u043B\u0435\u043C\u0435\u043D\u0442 <strong>${this.data.find((r) => r.id == id).fullname}</strong>?</p>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-danger btn-confirm">\u0423\u0434\u0430\u043B\u0438\u0442\u044C</button>
        <button class="btn btn-secondary btn-cancel" data-action="cancel">\u041E\u0442\u043C\u0435\u043D\u0430</button>
      </div>`;
    const modal = this._ensureModalBuilder();
    const m = modal.open("\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F", wrap);
    const confirmBtn = wrap.querySelector(".btn-confirm");
    const cancelBtn = wrap.querySelector(".btn-cancel");
    return new Promise(
      (resolve) => {
        cancelBtn.addEventListener(
          "click",
          () => {
            modal.close();
            resolve(false);
          }
        );
        confirmBtn.addEventListener(
          "click",
          async () => {
            try {
              if (!this.apis.apiDelete)
                throw new Error("apiDelete not provided");
              await this.apis.apiDelete(id);
              this.data = this.data.filter((d) => String(d[this.idField]) !== String(id));
              this.applyFiltersAndRender();
              modal.close();
              this.log("Deleted", id);
              resolve(true);
            } catch (err) {
              this.error("delete error", err);
              alert("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0438. \u0421\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u043A\u043E\u043D\u0441\u043E\u043B\u044C.");
              modal.close();
              resolve(false);
            }
          },
          {
            once: true
          }
        );
      }
    );
  }
  async deleteRow(id) {
    if (!confirm("\u0412\u044B \u0443\u0432\u0435\u0440\u0435\u043D\u044B, \u0447\u0442\u043E \u0445\u043E\u0442\u0438\u0442\u0435 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u043B\u0435\u043C\u0435\u043D\u0442?"))
      return;
    try {
      const res = await this.apis.apiDelete(id);
      const ok = res === true || res && (res.success === true || res.ok === true || res.deleted === id);
      if (!ok)
        this.warn("delete returned ambiguous response", res);
      this.data = this.data.filter((d) => String(d[this.idField]) !== String(id));
      this.applyFiltersAndRender();
    } catch (err) {
      this.error("deleteRow error", err);
      alert("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0438. \u0421\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u043A\u043E\u043D\u0441\u043E\u043B\u044C.");
    }
  }
  async init() {
    this._ensureEls();
    await this.fetchRefs();
    const items = await this.fetchItems();
    this.data = Array.isArray(items) ? items.map((it) => ({
      ...it
    })) : [];
    this.attachEvents();
    this.applyFiltersAndRender();
    this.log("initialized", this.meta());
    return this;
  }
  async refresh() {
    await this.fetchRefs();
    const items = await this.fetchItems();
    this.data = Array.isArray(items) ? items.map((it) => ({
      ...it
    })) : [];
    this.applyFiltersAndRender();
    this.log("refreshed");
  }
  clearRefs() {
    this.refs = {};
    this._refsLoaded = false;
    this._refsLoading = null;
    this.log("refs cache cleared");
  }
  destroy() {
    this.detachEvents();
    if (this._modal)
      this.modal._closeModal();
    try {
      if (this._els._customLoading)
        this._els._customLoading.remove();
    } catch (e) {
    }
    try {
      if (this._els._autoLoading)
        this._els._autoLoading.remove();
    } catch (e) {
    }
    try {
      document.querySelectorAll("input.bt-field-price").forEach(
        (el) => {
          el.removeEventListener("input", this._livePriceInputHandler);
          this._priceMaskCleanup(el);
        }
      );
    } catch (e) {
    }
    this._els = {};
    this.data = [];
    this.refs = {};
    this.state = {
      q: "",
      sortBy: null,
      sortDir: 1
    };
    this.log("destroyed");
  }
};
export {
  BaseTable2 as BaseTable
};
/**
 * BaseTable
 * Table build utilities
 *
 * @author {string} Calista Verner
 * @version 1.4.2
 * @license MIT
 */
/**
 * BaseTable
 * Modall App Utilities
 *
 * @author {string} Calista Verner
 * @version 1.4.2
 * @license MIT
 */
/**
 * BaseTable
 * Table renders Registry
 *
 * @author {string} Calista Verner
 * @version 1.4.2
 * @license MIT
 */
/**
 * BaseTable
 * Main class for working with the BaseTable
 *
 * @author {string} Calista Verner
 * @version 1.4.2
 * @license MIT
 */
//# sourceMappingURL=BaseTable.js.map
