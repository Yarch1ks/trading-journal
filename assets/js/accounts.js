/**
 * Account Manager Modal (markup + basic open/close logic)
 * Full CRUD wired to Supabase (table: public.accounts) with minimal UX.
 * It can be safely included on pages that need the Accounts modal.
 *
 * Usage:
 *  - Include this script after auth.js to have access to window.auth if needed later.
 *  - Call window.AccountsUI.injectModal() once (e.g., on DOMContentLoaded).
 *  - Add a button with id="openAccountsBtn" (or call AccountsUI.open()) to show the modal.
 */
(function () {
  // Utilities
  const fmtDT = (d) => {
    if (!d) return "—";
    const dt = typeof d === "string" ? new Date(d) : d;
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };
  const getClient = () => window.supabaseClient || (window.auth && window.auth.supabase);

  const TEMPLATE = `
  <div class="modal-backdrop" id="accountsModalBackdrop" hidden aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="accountsModalTitle">
      <div class="modal__header">
        <h2 id="accountsModalTitle">Accounts</h2>
        <button class="btn ghost icon" id="accountsCloseBtn" aria-label="Close">✕</button>
      </div>

      <div class="modal__body">
        <div class="accounts-layout">
          <aside class="accounts-list">
            <div class="accounts-list__toolbar">
              <button class="btn primary" id="accountAddBtn">+ Add Account</button>
              <button class="btn ghost" id="accountSyncAllBtn">Sync All</button>
            </div>

            <ul class="accounts-list__items" id="accountsList" role="listbox" aria-label="Accounts list">
              <!-- filled dynamically -->
            </ul>
          </aside>

          <section class="account-editor" aria-live="polite">
            <header class="account-editor__header">
              <h3 id="accountEditorTitle">Edit Account</h3>
              <div class="account-editor__actions">
                <button class="btn" id="accountToggleBtn">Disable</button>
                <button class="btn" id="accountSyncBtn">Sync</button>
                <button class="btn danger" id="accountDeleteBtn">Delete</button>
              </div>
            </header>

            <form class="form grid-2" id="accountForm">
              <label class="field">
                <span>Name</span>
                <input type="text" name="name" placeholder="My Account" required>
              </label>

              <label class="field">
                <span>Exchange / Type</span>
                <select name="exchange">
                  <option value="binance-futures">Binance Futures</option>
                  <option value="binance-spot">Binance Spot</option>
                  <option value="bybit-futures">Bybit Futures</option>
                  <option value="bybit-spot">Bybit Spot</option>
                </select>
              </label>

              <label class="field">
                <span>Status</span>
                <select name="status">
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="error">Error</option>
                </select>
              </label>

              <label class="field full">
                <span>Notes</span>
                <textarea name="notes" rows="3" placeholder="Optional notes"></textarea>
              </label>

              <!-- credentials removed by request (manual accounts without API) -->

              <div class="form__row full end">
                <button type="button" class="btn ghost" id="accountCancelBtn">Cancel</button>
                <button type="submit" class="btn primary">Save</button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  </div>`;

  const STYLES = `
  /* Accounts Modal basic layout (scoped by modal-backdrop root) */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: grid; place-items: center; z-index: 1000; }
  .modal { background: var(--surface, #fff); color: var(--text, #111); width: min(1100px, 94vw); max-height: 90vh; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.25); display: flex; flex-direction: column; overflow: hidden; }
  .modal__header { padding: 14px 16px; border-bottom: 1px solid var(--border, #e7e8ec); display: flex; align-items: center; justify-content: space-between; }
  .modal__body { padding: 0; }

  .accounts-layout { display: grid; grid-template-columns: 340px 1fr; gap: 0; min-height: 520px; }
  .accounts-list { border-right: 1px solid var(--border, #e7e8ec); padding: 12px; display: flex; flex-direction: column; }
  .accounts-list__toolbar { display: flex; gap: 8px; margin-bottom: 10px; }
  .accounts-list__items { list-style: none; margin: 0; padding: 0; overflow: auto; }
  .acc-item { padding: 10px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; }
  .acc-item + .acc-item { margin-top: 8px; }
  .acc-item:hover { background: rgba(0,0,0,.03); }
  .acc-item.selected { background: rgba(74, 132, 255, .06); border-color: rgba(74,132,255,.35); }
  .acc-item__main { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
  .acc-item__name { font-weight: 600; }
  .acc-item__meta { margin-top: 4px; display: flex; gap: 12px; color: #6b7280; font-size: 12px; }
  .badge { font-size: 11px; padding: 2px 6px; border-radius: 999px; }
  .badge.success { background: #e8f7ee; color: #148f3e; }
  .badge.warning { background: #fff4da; color: #9a6b00; }
  .badge.error { background: #ffe4e6; color: #b42318; }

  .account-editor { padding: 16px; }
  .account-editor__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .account-editor__actions { display: flex; gap: 8px; }
  .form.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field.full { grid-column: 1 / -1; }
  .form__row { display: flex; gap: 8px; }
  .form__row.end { justify-content: flex-end; }
  .credentials legend { font-weight: 600; }
  .muted { color: #6b7280; }
  .small { font-size: 12px; }

  .btn { border: 1px solid var(--border, #d2d6dc); background: var(--surface, #fff); color: inherit; padding: 6px 10px; border-radius: 8px; cursor: pointer; }
  .btn:hover { background: rgba(0,0,0,.04); }
  .btn.primary { background: #4a84ff; color: #fff; border-color: #4a84ff; }
  .btn.primary:hover { background: #3a73eb; }
  .btn.danger { background: #ef4444; color: #fff; border-color: #ef4444; }
  .btn.ghost { background: transparent; }
  .btn.icon { width: 32px; height: 32px; display: grid; place-items: center; }

  @media (max-width: 820px) {
    .accounts-layout { grid-template-columns: 1fr; }
    .accounts-list { border-right: none; border-bottom: 1px solid var(--border, #e7e8ec); }
  }
  `;

  function injectStylesOnce() {
    console.debug("Accounts: injectStylesOnce");
    if (document.getElementById("accountsModalStyles")) return;
    const style = document.createElement("style");
    style.id = "accountsModalStyles";
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  async function fetchUserId() {
    const client = getClient();
    if (!client || !client.auth) return null;
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    return user.id;
  }

  function badgeFor(status) {
    const cls = status === "active" ? "success" : status === "error" ? "error" : "warning";
    return `<span class="badge ${cls}">${status}</span>`;
  }

  function accountItemTpl(acc, selectedId) {
    return `
      <li class="acc-item ${acc.id === selectedId ? "selected" : ""}" data-id="${acc.id}" role="option" aria-selected="${acc.id === selectedId}">
        <div class="acc-item__main">
          <span class="acc-item__name">${acc.name || "—"}</span>
          ${badgeFor(acc.status || "active")}
        </div>
        <div class="acc-item__meta">
          <span class="muted">${acc.exchange || acc.type || "—"}</span>
          <span class="muted">last sync: ${fmtDT(acc.last_sync_at) || "never"}</span>
        </div>
      </li>
    `;
  }

  function readForm(formEl) {
    const fd = new FormData(formEl);
    return {
      name: String(fd.get("name") || "").trim(),
      exchange: String(fd.get("exchange") || "").trim(),
      status: String(fd.get("status") || "active"),
      notes: String(fd.get("notes") || "").trim(),
    };
  }

  function fillForm(formEl, acc) {
    formEl.elements.name.value = acc?.name || "";
    formEl.elements.exchange.value = acc?.exchange || "binance-futures";
    formEl.elements.status.value = acc?.status || "active";
    formEl.elements.notes.value = acc?.notes || "";
  }

  function injectModal() {
    console.debug("Accounts: injectModal start");
    if (document.getElementById("accountsModalBackdrop")) {
      console.debug("Accounts: already injected");
      return;
    }
    injectStylesOnce();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = TEMPLATE;
    const node = wrapper.firstChild;
    document.body.appendChild(node);
    console.debug("Accounts: injected backdrop =", !!document.getElementById("accountsModalBackdrop"));

    // Wire basic open/close
    const backdrop = document.getElementById("accountsModalBackdrop");
    const closeBtn = document.getElementById("accountsCloseBtn");
    const cancelBtn = document.getElementById("accountCancelBtn");
    const listEl = document.getElementById("accountsList");
    const addBtn = document.getElementById("accountAddBtn");
    const syncAllBtn = document.getElementById("accountSyncAllBtn");
    const formEl = document.getElementById("accountForm");
    const deleteBtn = document.getElementById("accountDeleteBtn");
    const toggleBtn = document.getElementById("accountToggleBtn");
    const syncBtn = document.getElementById("accountSyncBtn");
    const editorTitle = document.getElementById("accountEditorTitle");

    // Guard against missing nodes to avoid null.addEventListener errors
    const safeOn = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };

    let state = {
      userId: null,
      items: [],
      selectedId: null,
    };

    async function load() {
      const client = getClient();
      if (!client) return;
      if (!state.userId) state.userId = await fetchUserId();
      const { data, error } = await client.from("accounts").select("*").order("created_at", { ascending: true });
      if (error) {
        console.error("accounts.load failed", error);
        return;
      }
      state.items = data || [];
      if (state.items.length && !state.selectedId) state.selectedId = state.items[0].id;
      renderList();
      const cur = state.items.find(a => a.id === state.selectedId);
      fillForm(formEl, cur || null);
      editorTitle.textContent = cur ? "Edit Account" : "New Account";
      toggleBtn.textContent = cur && cur.status === "disabled" ? "Enable" : "Disable";
    }

    function renderList() {
      listEl.innerHTML = state.items.map(a => accountItemTpl(a, state.selectedId)).join("");
    }

    function select(id) {
      state.selectedId = id;
      renderList();
      const acc = state.items.find(a => a.id === id);
      fillForm(formEl, acc || null);
      editorTitle.textContent = acc ? "Edit Account" : "New Account";
      toggleBtn.textContent = acc && acc.status === "disabled" ? "Enable" : "Disable";
    }

    function close() {
      backdrop.hidden = true;
      backdrop.setAttribute("aria-hidden", "true");
    }
    async function openAndLoad() {
      console.debug("Accounts: openAndLoad");
      let el = document.getElementById("accountsModalBackdrop");
      if (!el) {
        console.debug("Accounts: backdrop missing, injecting…");
        injectModal();
        el = document.getElementById("accountsModalBackdrop");
      }
      if (!el) {
        console.warn("Accounts: cannot create backdrop");
        return;
      }
      el.hidden = false;
      el.setAttribute("aria-hidden", "false");
      await load();
    }
    safeOn(closeBtn, "click", close);
    safeOn(cancelBtn, "click", close);
    safeOn(backdrop, "click", (e) => {
      if (e.target === backdrop) close();
    });

    // expose a bound loader to call from public API without custom events
    window.AccountsUI = Object.assign(window.AccountsUI || {}, {
      _openAndLoad: () => openAndLoad()
    });

    // List interactions
    safeOn(listEl, "click", (e) => {
      const li = e.target.closest(".acc-item");
      if (li) select(li.dataset.id);
    });

    // Toolbar actions
    safeOn(addBtn, "click", async () => {
      // prepare new blank row locally and select it; insert on Save
      state.selectedId = null;
      fillForm(formEl, { name: "", exchange: "binance-futures", status: "active", notes: "" });
      editorTitle.textContent = "New Account";
      toggleBtn.textContent = "Disable";
      renderList();
    });

    safeOn(syncAllBtn, "click", async () => {
      const client = getClient();
      if (!client) return;
      // mark synced for all user's accounts
      const { error } = await client
        .from("accounts")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("user_id", state.userId);
      if (error) console.error("Sync all failed", error);
      await load();
    });

    // Form submit (Create or Update)
    safeOn(formEl, "submit", async (e) => {
      e.preventDefault();
      const client = getClient();
      if (!client) return;
      const payload = readForm(formEl);

      if (!payload.name) {
        alert("Name is required");
        return;
      }

      if (!state.selectedId) {
        // create
        const row = { ...payload, user_id: state.userId };
        const { data, error } = await client.from("accounts").insert(row).select("*").single();
        if (error) {
          console.error("Create account failed", error);
          alert(error.message);
          return;
        }
        state.selectedId = data.id;
      } else {
        // update
        const { error } = await client.from("accounts").update(payload).eq("id", state.selectedId);
        if (error) {
          console.error("Update account failed", error);
          alert(error.message);
          return;
        }
      }
      await load();
    });

    safeOn(deleteBtn, "click", async () => {
      if (!state.selectedId) return;
      if (!confirm("Удалить аккаунт?")) return;
      const client = getClient();
      const { error } = await client.from("accounts").delete().eq("id", state.selectedId);
      if (error) {
        console.error("Delete failed", error);
        alert(error.message);
        return;
      }
      state.selectedId = null;
      await load();
    });

    safeOn(toggleBtn, "click", async () => {
      const client = getClient();
      const cur = state.items.find(a => a.id === state.selectedId);
      if (!client || !cur) return;
      const next = cur.status === "disabled" ? "active" : "disabled";
      const { error } = await client.from("accounts").update({ status: next }).eq("id", cur.id);
      if (error) {
        console.error("Toggle failed", error);
        alert(error.message);
        return;
      }
      await load();
    });

    safeOn(syncBtn, "click", async () => {
      const client = getClient();
      if (!client || !state.selectedId) return;
      // Use RPC account_sync to set last_sync_at = now()
      const { error } = await client.rpc("account_sync", { p_id: state.selectedId });
      if (error) {
        console.error("Sync failed", error);
        alert(error.message);
        return;
      }
      await load();
    });

    // Expose handlers
    window.AccountsUI = Object.assign(window.AccountsUI || {}, { open, close });
  }

  // Public API
  window.AccountsUI = Object.assign(window.AccountsUI || {}, {
    injectModal,
    open: async () => {
      // call the internal bound loader directly
      if (!document.getElementById("accountsModalBackdrop")) injectModal();
      if (window.AccountsUI && typeof window.AccountsUI._openAndLoad === "function") {
        await window.AccountsUI._openAndLoad();
      }
    },
    close: () => {
      const b = document.getElementById("accountsModalBackdrop");
      if (b) {
        b.hidden = true;
        b.setAttribute("aria-hidden", "true");
      }
    },
  });

  // Auto-inject on DOM ready (safe if included on multiple pages)
  function wire() {
    const triggers = document.querySelectorAll("#openAccountsBtn");
    triggers.forEach((t) => {
      if (t.__accBound) return;
      t.addEventListener("click", async () => {
        console.debug("Accounts: button click");
        if (window.AccountsUI && typeof window.AccountsUI.open === "function") {
          await window.AccountsUI.open();
        } else {
          // fallback: force inject and load
          if (!document.getElementById("accountsModalBackdrop")) injectModal();
          if (window.AccountsUI && typeof window.AccountsUI._openAndLoad === "function") {
            await window.AccountsUI._openAndLoad();
          }
        }
      });
      t.__accBound = true;
    });
    console.debug("Accounts: wire complete, buttons =", triggers.length);
  }

  let wired = false;
  function init() {
    if (wired) return;
    wired = true;
    wire();
    const mo = new MutationObserver(() => wire());
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
