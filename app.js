(() => {
  "use strict";

  const API_BASE = "https://scratch-card-5cv.pages.dev";
  const STORAGE_KEY = "johunt_records_v1";
  const USERNAME_KEY = "johunt_username";
  const CHART_COLORS = {
    light: { invested: "#2a78d6", won: "#eb6834", grid: "rgba(0,0,0,0.06)", text: "#85898a" },
    dark: { invested: "#3987e5", won: "#d95926", grid: "rgba(255,255,255,0.08)", text: "#9a9a9e" },
  };

  /* ---------- state ---------- */
  let records = [];
  let username = localStorage.getItem(USERNAME_KEY) || "";
  let draft = { editingId: null, price: null, isWin: true, amount: "", cardNumber: "", purchaseDate: "" };
  let analyticsChart = null;
  let analyticsPeriod = "year";

  /* ---------- local cache (fallback/offline) ---------- */
  function loadLocalCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveLocalCache() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch {}
  }

  function normalizeRecord(r) {
    return {
      ...r,
      purchaseDate: r.purchaseDate || (r.createdAt ? r.createdAt.slice(0, 10) : todayISODate()),
    };
  }

  /* ---------- cloud sync ---------- */
  async function fetchRemoteRecords(user) {
    const res = await fetch(`${API_BASE}/api/records?user=${encodeURIComponent(user)}`);
    if (!res.ok) throw new Error("fetch failed: " + res.status);
    return res.json();
  }

  async function pushRemoteRecords(user, data) {
    const res = await fetch(`${API_BASE}/api/records?user=${encodeURIComponent(user)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("push failed: " + res.status);
  }

  function saveRecords() {
    saveLocalCache();
    if (!username) return;
    pushRemoteRecords(username, records).catch((err) => {
      console.error("雲端同步失敗，變更僅暫存在本機：", err);
    });
  }

  async function loadForUser(user) {
    records = loadLocalCache().map(normalizeRecord);
    renderAll();
    if (!user) return;
    try {
      const remote = await fetchRemoteRecords(user);
      if (remote.length === 0 && records.length > 0) {
        await pushRemoteRecords(user, records);
      } else {
        records = remote.map(normalizeRecord);
        saveLocalCache();
      }
      renderAll();
    } catch (err) {
      console.error("讀取雲端資料失敗，改用本機備份：", err);
    }
  }

  /* ---------- helpers ---------- */
  function todayISODate() {
    const d = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fmtMoney(n) {
    return "NT$ " + Math.abs(Math.round(n)).toLocaleString("en-US");
  }

  function fmtPurchaseDate(dateStr) {
    const [y, m, d] = (dateStr || "").split("-");
    if (!y) return "";
    return `${y}/${m}/${d}`;
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

    const roiEl = document.getElementById("home-roi");
    roiEl.innerHTML = roi.toFixed(1) + '<span class="roi-pct">%</span>';
    roiEl.classList.toggle("positive", roi > 0);

    document.getElementById("home-invested").textContent = fmtMoney(totalInvested);
    const netEl = document.getElementById("home-net");
    netEl.textContent = (totalNet > 0 ? "+" : totalNet < 0 ? "-" : "±") + fmtMoney(totalNet);
    document.getElementById("home-count").textContent = `${count} 張`;

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

    document.getElementById("user-badge-name").textContent = username || "設定使用者";
  }

  /* ---------- rendering: records ---------- */
  function renderRecords() {
    const list = document.getElementById("record-list");
    const empty = document.getElementById("records-empty");
    const sorted = [...records].sort((a, b) => {
      if (a.purchaseDate !== b.purchaseDate) return a.purchaseDate < b.purchaseDate ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });

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
        <li class="record-item" data-id="${r.id}">
          <div class="record-icon ${iconCls}">${icon}</div>
          <div class="record-main">
            <p class="record-price">${fmtMoney(r.price)}</p>
            <p class="record-date">${fmtPurchaseDate(r.purchaseDate)}</p>
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

  /* ---------- rendering: analytics ---------- */
  function groupRecordsByPeriod(mode) {
    const map = new Map();
    for (const r of records) {
      const key = mode === "year" ? r.purchaseDate.slice(0, 4) : r.purchaseDate.slice(0, 7);
      if (!map.has(key)) map.set(key, { invested: 0, won: 0 });
      const entry = map.get(key);
      entry.invested += r.price;
      if (r.isWin) entry.won += r.amount;
    }
    const keys = [...map.keys()].sort();
    return {
      labels: keys.map((k) => (mode === "year" ? k : k.replace("-", "/"))),
      invested: keys.map((k) => map.get(k).invested),
      won: keys.map((k) => map.get(k).won),
    };
  }

  function renderAnalyticsChart() {
    const canvas = document.getElementById("analytics-chart");
    const empty = document.getElementById("analytics-empty");
    const { labels, invested, won } = groupRecordsByPeriod(analyticsPeriod);

    if (labels.length === 0) {
      empty.classList.remove("hidden");
      canvas.style.display = "none";
      if (analyticsChart) {
        analyticsChart.destroy();
        analyticsChart = null;
      }
      return;
    }
    empty.classList.add("hidden");
    canvas.style.display = "";

    const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const colors = dark ? CHART_COLORS.dark : CHART_COLORS.light;

    const data = {
      labels,
      datasets: [
        {
          type: "bar",
          label: "購買總金額",
          data: invested,
          backgroundColor: colors.invested,
          borderRadius: 4,
          maxBarThickness: 36,
          order: 2,
        },
        {
          type: "line",
          label: "中獎金額",
          data: won,
          borderColor: colors.won,
          backgroundColor: colors.won,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: colors.won,
          tension: 0.25,
          order: 1,
        },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.text } },
        y: {
          beginAtZero: true,
          grid: { color: colors.grid },
          ticks: {
            color: colors.text,
            callback: (v) => "NT$" + Number(v).toLocaleString("en-US"),
          },
        },
      },
    };

    if (analyticsChart) {
      analyticsChart.data = data;
      analyticsChart.options = options;
      analyticsChart.update();
    } else {
      analyticsChart = new Chart(canvas.getContext("2d"), { type: "bar", data, options });
    }
  }

  function renderAll() {
    renderHome();
    renderRecords();
    if (!document.getElementById("view-analytics").classList.contains("hidden")) {
      renderAnalyticsChart();
    }
  }

  /* ---------- view switching ---------- */
  function showView(name) {
    document.getElementById("view-home").classList.toggle("hidden", name !== "home");
    document.getElementById("view-records").classList.toggle("hidden", name !== "records");
    document.getElementById("view-analytics").classList.toggle("hidden", name !== "analytics");
    document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === name);
    });
    if (name === "analytics") renderAnalyticsChart();
  }

  /* ---------- record modal ---------- */
  function resetDraft() {
    draft = { editingId: null, price: null, isWin: true, amount: "", cardNumber: "", purchaseDate: todayISODate() };
    document.getElementById("modal-title").textContent = "新紀錄";
    document.querySelectorAll(".price-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll("#win-toggle .segment").forEach((b) => b.classList.toggle("active", b.dataset.win === "true"));
    document.getElementById("amount-input").value = "";
    document.getElementById("ticket-code-input").value = "";
    document.getElementById("purchase-date-input").value = draft.purchaseDate;
    document.getElementById("amount-field").classList.remove("hidden");
    updateConfirmState();
  }

  function loadDraftFromRecord(r) {
    draft = {
      editingId: r.id,
      price: r.price,
      isWin: r.isWin,
      amount: r.isWin ? String(r.amount) : "",
      cardNumber: r.cardNumber || "",
      purchaseDate: r.purchaseDate,
    };
    document.getElementById("modal-title").textContent = "編輯紀錄";
    document.querySelectorAll(".price-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.price) === r.price));
    document.querySelectorAll("#win-toggle .segment").forEach((b) => b.classList.toggle("active", (b.dataset.win === "true") === r.isWin));
    document.getElementById("amount-input").value = r.isWin ? r.amount : "";
    document.getElementById("ticket-code-input").value = r.cardNumber || "";
    document.getElementById("purchase-date-input").value = r.purchaseDate;
    document.getElementById("amount-field").classList.toggle("hidden", !r.isWin);
    updateConfirmState();
  }

  function openModal() {
    resetDraft();
    document.getElementById("modal-overlay").classList.remove("hidden");
  }

  function openEditModal(id) {
    const r = records.find((rec) => rec.id === id);
    if (!r) return;
    loadDraftFromRecord(r);
    document.getElementById("modal-overlay").classList.remove("hidden");
  }

  function closeModal() {
    document.getElementById("modal-overlay").classList.add("hidden");
  }

  function updateConfirmState() {
    const btn = document.getElementById("btn-confirm");
    const priceOk = draft.price != null;
    const amountOk = !draft.isWin || (draft.amount !== "" && Number(draft.amount) >= 0);
    const dateOk = !!draft.purchaseDate;
    btn.disabled = !(priceOk && amountOk && dateOk);
  }

  function handleConfirm() {
    if (draft.price == null) return;
    const amount = draft.isWin ? Number(draft.amount || 0) : 0;
    if (draft.editingId) {
      const r = records.find((rec) => rec.id === draft.editingId);
      if (r) {
        r.price = draft.price;
        r.isWin = draft.isWin;
        r.amount = amount;
        r.cardNumber = draft.cardNumber.trim();
        r.purchaseDate = draft.purchaseDate;
      }
    } else {
      records.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        price: draft.price,
        isWin: draft.isWin,
        amount,
        cardNumber: draft.cardNumber.trim(),
        purchaseDate: draft.purchaseDate,
      });
    }
    saveRecords();
    renderAll();
    closeModal();
  }

  /* ---------- username modal ---------- */
  function openUserModal(forced) {
    document.getElementById("username-input").value = username;
    document.getElementById("user-btn-cancel").classList.toggle("hidden", forced);
    document.getElementById("user-modal-hint").textContent = forced
      ? "第一次使用，請先輸入使用者名稱，你的紀錄會儲存在雲端並跟這個名稱綁定"
      : "輸入使用者名稱，你的紀錄會儲存在雲端並跟這個名稱綁定";
    document.getElementById("user-modal-overlay").classList.remove("hidden");
  }

  function closeUserModal() {
    document.getElementById("user-modal-overlay").classList.add("hidden");
  }

  async function handleUserConfirm() {
    const value = document.getElementById("username-input").value.trim();
    if (!value) return;
    if (value === username) {
      closeUserModal();
      return;
    }
    username = value;
    localStorage.setItem(USERNAME_KEY, username);
    closeUserModal();
    await loadForUser(username);
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
    document.querySelectorAll("#win-toggle .segment").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("amount-field").classList.toggle("hidden", !draft.isWin);
    updateConfirmState();
  });

  document.getElementById("amount-input").addEventListener("input", (e) => {
    const digitsOnly = e.target.value.replace(/[^0-9]/g, "");
    if (digitsOnly !== e.target.value) e.target.value = digitsOnly;
    draft.amount = digitsOnly;
    updateConfirmState();
  });

  document.getElementById("ticket-code-input").addEventListener("input", (e) => {
    draft.cardNumber = e.target.value;
  });

  document.getElementById("purchase-date-input").addEventListener("input", (e) => {
    draft.purchaseDate = e.target.value;
    updateConfirmState();
  });

  document.getElementById("record-list").addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".record-delete");
    if (deleteBtn) {
      if (confirm("確定要刪除這筆紀錄嗎？")) {
        deleteRecord(deleteBtn.dataset.id);
      }
      return;
    }
    const item = e.target.closest(".record-item");
    if (item) openEditModal(item.dataset.id);
  });

  document.getElementById("period-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".segment");
    if (!btn) return;
    analyticsPeriod = btn.dataset.period;
    document.querySelectorAll("#period-toggle .segment").forEach((b) => b.classList.toggle("active", b === btn));
    renderAnalyticsChart();
  });

  document.getElementById("user-badge").addEventListener("click", () => openUserModal(false));
  document.getElementById("user-btn-cancel").addEventListener("click", closeUserModal);
  document.getElementById("user-btn-confirm").addEventListener("click", handleUserConfirm);
  document.getElementById("user-modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "user-modal-overlay" && !username) return;
    if (e.target.id === "user-modal-overlay") closeUserModal();
  });

  /* ---------- init ---------- */
  showView("home");
  if (username) {
    loadForUser(username);
  } else {
    records = loadLocalCache().map(normalizeRecord);
    renderAll();
    openUserModal(true);
  }
})();
