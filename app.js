(() => {
  "use strict";

  const STORAGE_KEY = "johunt_records_v1";
  const BENTO_PRICE = 75; // NT$ per lunchbox, calibrated so -450 -> 6 bentos
  const BURGER_LAYER_STEP = 100; // NT$ profit per burger layer
  const BENTO_MAX_SHOW = 30;
  const BURGER_MAX_SHOW = 12;

  /* ---------- state ---------- */
  let records = loadRecords();
  let draft = { price: null, isWin: true, amount: "", cardNumber: "" };

  /* ---------- storage ---------- */
  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  /* ---------- helpers ---------- */
  function fmtMoney(n) {
    return "NT$ " + Math.abs(Math.round(n)).toLocaleString("en-US");
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function netOf(r) {
    return (r.isWin ? r.amount : 0) - r.price;
  }

  function computeStats() {
    const totalInvested = records.reduce((s, r) => s + r.price, 0);
    const totalNet = records.reduce((s, r) => s + netOf(r), 0);
    const roi = totalInvested > 0 ? (totalNet / totalInvested) * 100 : 0;
    const count = records.length;
    const jackpot = records
      .filter((r) => r.isWin && r.amount > 0)
      .sort((a, b) => b.amount - a.amount)[0] || null;
    return { totalInvested, totalNet, roi, count, jackpot };
  }

  /* ---------- rendering: home ---------- */
  function renderHome() {
    const { totalInvested, totalNet, roi, count, jackpot } = computeStats();

    const plEl = document.getElementById("home-pl");
    plEl.textContent = (totalNet > 0 ? "+" : totalNet < 0 ? "-" : "±") + fmtMoney(totalNet);
    plEl.classList.toggle("positive", totalNet > 0);
    plEl.classList.toggle("negative", totalNet <= 0);

    const bentoLine = document.getElementById("home-bento-line");
    const bentoRow = document.getElementById("home-bento-row");
    if (count === 0) {
      bentoLine.textContent = "還沒有任何紀錄，快去刮一張！";
      bentoRow.innerHTML = "";
    } else if (totalNet < 0) {
      const bentos = Math.floor(Math.abs(totalNet) / BENTO_PRICE);
      bentoLine.textContent = bentos > 0
        ? `請了台彩 ${bentos} 個便當`
        : `再輸 NT$${BENTO_PRICE - Math.abs(totalNet)} 就能請台彩吃一個便當了`;
      bentoRow.innerHTML = "🍱".repeat(Math.min(bentos, BENTO_MAX_SHOW));
    } else if (totalNet === 0) {
      bentoLine.textContent = "目前和台彩打平，繼續加油！";
      bentoRow.innerHTML = "";
    } else {
      const bentos = Math.floor(totalNet / BENTO_PRICE);
      bentoLine.textContent = `你可以請自己吃 ${bentos} 個便當慶祝一下！`;
      bentoRow.innerHTML = "🍱".repeat(Math.min(bentos, BENTO_MAX_SHOW));
    }

    const roiEl = document.getElementById("home-roi");
    roiEl.innerHTML = roi.toFixed(1) + '<span class="roi-pct">%</span>';
    roiEl.classList.toggle("positive", roi > 0);

    document.getElementById("home-invested").textContent = fmtMoney(totalInvested);
    const netEl = document.getElementById("home-net");
    netEl.textContent = (totalNet > 0 ? "+" : totalNet < 0 ? "-" : "±") + fmtMoney(totalNet);
    document.getElementById("home-count").textContent = `${count} 張`;

    const burgerLine = document.getElementById("burger-line");
    const burgerStack = document.getElementById("burger-stack");
    const layers = Math.floor(Math.max(totalNet, 0) / BURGER_LAYER_STEP);
    if (layers <= 0) {
      const remain = totalNet >= 0 ? BURGER_LAYER_STEP - totalNet : BURGER_LAYER_STEP;
      burgerLine.textContent = `你的漢堡肉堆疊了 0 層，肉呢？快去賺一層！`;
    } else {
      const remain = (layers + 1) * BURGER_LAYER_STEP - totalNet;
      burgerLine.textContent = `你的漢堡肉堆疊了 ${layers} 層！再賺 NT$${Math.max(remain, 0)} 就能再疊一層！`;
    }
    burgerStack.innerHTML = layers > 0
      ? "🥩".repeat(Math.min(layers, BURGER_MAX_SHOW))
      : "";

    const jackpotBody = document.getElementById("jackpot-body");
    if (jackpot) {
      jackpotBody.className = "jackpot-win";
      jackpotBody.innerHTML = `
        <p class="jackpot-emoji">🎉</p>
        <p class="jackpot-caption">恭喜中獎</p>
        <p class="jackpot-amount"><span class="prefix">NT$</span>${jackpot.amount.toLocaleString("en-US")}</p>
      `;
    } else {
      jackpotBody.className = "jackpot-empty";
      jackpotBody.innerHTML = `
        <p class="jackpot-emoji">🤞</p>
        <p class="jackpot-caption">尚未中獎，再刮一張試試手氣！</p>
      `;
    }
  }

  /* ---------- rendering: records ---------- */
  function renderRecords() {
    const list = document.getElementById("record-list");
    const empty = document.getElementById("records-empty");
    const sorted = [...records].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (sorted.length === 0) {
      list.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    list.innerHTML = sorted.map((r) => {
      const net = netOf(r);
      let diffHtml = "";
      if (r.isWin) {
        const cls = net > 0 ? "positive" : net < 0 ? "negative" : "";
        const sign = net > 0 ? "+" : net < 0 ? "-" : "±";
        diffHtml = `<span class="record-diff ${cls}">${sign}${fmtMoney(net)}</span>`;
      }
      const iconCls = r.isWin ? "win" : "lose";
      const icon = r.isWin ? "🪙" : "🎫";
      const cardHtml = r.cardNumber ? `<p class="record-card">刮刮樂卡片號 ${escapeHtml(r.cardNumber)}</p>` : "";
      return `
        <li class="record-item">
          <div class="record-icon ${iconCls}">${icon}</div>
          <div class="record-main">
            <p class="record-price">${fmtMoney(r.price)}</p>
            <p class="record-date">${fmtDate(r.createdAt)}</p>
            ${cardHtml}
          </div>
          ${diffHtml}
          <button class="record-delete" data-id="${r.id}" aria-label="刪除紀錄">
            <svg viewBox="0 0 24 24" class="delete-icon"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </li>
      `;
    }).join("");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function deleteRecord(id) {
    records = records.filter((r) => r.id !== id);
    saveRecords();
    renderAll();
  }

  function renderAll() {
    renderHome();
    renderRecords();
  }

  /* ---------- view switching ---------- */
  function showView(name) {
    document.getElementById("view-home").classList.toggle("hidden", name !== "home");
    document.getElementById("view-records").classList.toggle("hidden", name !== "records");
    document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === name);
    });
  }

  /* ---------- modal ---------- */
  function resetDraft() {
    draft = { price: null, isWin: true, amount: "", cardNumber: "" };
    document.querySelectorAll(".price-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".segment").forEach((b) => b.classList.toggle("active", b.dataset.win === "true"));
    document.getElementById("amount-input").value = "";
    document.getElementById("card-number-input").value = "";
    document.getElementById("amount-field").classList.remove("hidden");
    updateConfirmState();
  }

  function openModal() {
    resetDraft();
    document.getElementById("modal-overlay").classList.remove("hidden");
  }

  function closeModal() {
    document.getElementById("modal-overlay").classList.add("hidden");
  }

  function updateConfirmState() {
    const btn = document.getElementById("btn-confirm");
    const priceOk = draft.price != null;
    const amountOk = !draft.isWin || (draft.amount !== "" && Number(draft.amount) >= 0);
    btn.disabled = !(priceOk && amountOk);
  }

  function handleConfirm() {
    if (draft.price == null) return;
    const amount = draft.isWin ? Number(draft.amount || 0) : 0;
    records.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      price: draft.price,
      isWin: draft.isWin,
      amount,
      cardNumber: draft.cardNumber.trim(),
      createdAt: new Date().toISOString(),
    });
    saveRecords();
    renderAll();
    closeModal();
  }

  /* ---------- wire up ---------- */
  document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  document.getElementById("btn-add-from-nav").addEventListener("click", openModal);
  document.getElementById("btn-add-from-records").addEventListener("click", openModal);
  document.getElementById("btn-cancel").addEventListener("click", closeModal);
  document.getElementById("btn-confirm").addEventListener("click", handleConfirm);

  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });

  document.getElementById("price-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".price-btn");
    if (!btn) return;
    draft.price = Number(btn.dataset.price);
    document.querySelectorAll(".price-btn").forEach((b) => b.classList.toggle("active", b === btn));
    updateConfirmState();
  });

  document.getElementById("win-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".segment");
    if (!btn) return;
    draft.isWin = btn.dataset.win === "true";
    document.querySelectorAll(".segment").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("amount-field").classList.toggle("hidden", !draft.isWin);
    updateConfirmState();
  });

  document.getElementById("amount-input").addEventListener("input", (e) => {
    draft.amount = e.target.value;
    updateConfirmState();
  });

  document.getElementById("card-number-input").addEventListener("input", (e) => {
    draft.cardNumber = e.target.value;
  });

  document.getElementById("record-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".record-delete");
    if (!btn) return;
    if (confirm("確定要刪除這筆紀錄嗎？")) {
      deleteRecord(btn.dataset.id);
    }
  });

  /* ---------- init ---------- */
  renderAll();
  showView("home");
})();
