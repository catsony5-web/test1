function buildBoardSectionStat(section, rows) {
  return {
    section,
    rows,
    total: sum(rows, "amount"),
    reimbursementTotal: sumReimbursements(rows),
    actualTotal: sumActual(rows),
    count: rows.length
  };
}

function ensureBoardExpandedSectors(month, sectorRows) {
  if (boardExpandedMonth === month && boardExpandedSectors.size) return;
  boardExpandedMonth = month;
  boardExpandedSectors = new Set(sectorRows.slice(0, 3).map((item) => item.sector));
  if (sectorRows.some((item) => item.sector === "미분류" && item.amount > 0)) boardExpandedSectors.add("미분류");
  if (!boardExpandedSectors.size) {
    boardExpandedSectors.add("식비");
    boardExpandedSectors.add("고정 주거비");
  }
}

function syncBoardFilterControls(sectorRows) {
  if (els.boardFilterSector.options.length) readBoardFilterControls();
  const sectors = unique([...sectorRows.map((item) => item.sector), ...boardSections.map((section) => section.sector)])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko-KR"));
  els.boardFilterSector.innerHTML = [
    `<option value="all">전체</option>`,
    ...sectors.map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`)
  ].join("");
  if (!sectors.includes(els.boardFilterSector.value)) els.boardFilterSector.value = "all";
  els.boardFilterStatus.textContent = boardFilterStatusText();
}

function readBoardFilterControls() {
  // The controls themselves are the source of truth for board filters.
}

function boardFilterStatusText() {
  const filters = [];
  if (els.boardFilterSector.value && els.boardFilterSector.value !== "all") filters.push(els.boardFilterSector.value);
  if (els.boardFilterSearch.value.trim()) filters.push(`검색: ${els.boardFilterSearch.value.trim()}`);
  if (els.boardFilterUnknownOnly.checked) filters.push("미분류만");
  if (els.boardFilterHideZero.checked) filters.push("0원 숨김");
  return filters.length ? `필터 적용 중 · ${filters.join(" · ")}` : "전체 상세 표시";
}

function filteredBoardSectionStats(sectionStats) {
  const sector = els.boardFilterUnknownOnly.checked ? "미분류" : els.boardFilterSector.value;
  const search = normalizeKeyText(els.boardFilterSearch.value);
  const hideZero = els.boardFilterHideZero.checked;
  const sortMode = els.boardFilterSort.value || "amount";
  return sectionStats
    .filter((stat) => {
      if (sector && sector !== "all" && stat.section.sector !== sector) return false;
      if (hideZero && stat.actualTotal <= 0 && stat.count === 0) return false;
      if (!search) return true;
      return normalizeKeyText([stat.section.title, stat.section.sector, stat.section.subcategory].join(" ")).includes(search);
    })
    .sort((a, b) => {
      if (sortMode === "name") return a.section.title.localeCompare(b.section.title, "ko-KR");
      if (sortMode === "count") return b.count - a.count || b.actualTotal - a.actualTotal;
      return b.actualTotal - a.actualTotal || b.count - a.count;
    });
}

function renderBoardAccordions(sectionStats, selectedMonth) {
  if (!sectionStats.length) {
    return `<div class="empty">현재 필터에 맞는 상세 카드가 없습니다.</div>`;
  }
  const grouped = groupBy(sectionStats, (stat) => stat.section.sector);
  return [...grouped.entries()]
    .map(([sector, stats]) => {
      const total = stats.reduce((amount, stat) => amount + stat.actualTotal, 0);
      const count = stats.reduce((amount, stat) => amount + stat.count, 0);
      const open = boardExpandedSectors.has(sector);
      return `
        <details class="board-sector-accordion ${categoryClass(sector)} ${boardHighlightSector === sector ? "spotlight" : ""}" data-board-sector-accordion="${escapeHtml(sector)}" ${open ? "open" : ""}>
          <summary>
            <span>${categoryChip(sector)}</span>
            <strong>${formatWon(total)}</strong>
            <small>${count.toLocaleString("ko-KR")}건 · ${stats.length.toLocaleString("ko-KR")}개 상세 카드</small>
          </summary>
          <div class="category-grid">
            ${stats.map((stat) => renderLedgerSection(stat.section, stat.rows, selectedMonth)).join("")}
          </div>
        </details>
      `;
    }).join("");
}

function renderBoardTopCategories(sectionStats, selectedMonth) {
  const visible = sectionStats
    .filter((stat) => stat.actualTotal > 0 || stat.count > 0)
    .slice(0, 12);
  if (!visible.length) {
    return `<div class="empty">선택한 월의 주요 상세 항목이 없습니다. 상세 내역 탭에서 직접 입력을 추가할 수 있습니다.</div>`;
  }
  return `
    <section class="board-top-panel">
      <div class="panel-head">
        <div>
          <h3>많이 쓴 세부항목 TOP</h3>
          <p>선택 월에서 금액이 큰 세부항목을 바로 상세 내역으로 확인합니다.</p>
        </div>
        <button type="button" class="primary-action" data-open-detail-month="${escapeHtml(selectedMonth)}">상세 내역에서 보기</button>
      </div>
      <div class="board-top-grid">
        ${visible.map((stat) => `
          <button type="button" class="board-top-item ${categoryClass(stat.section.sector)}" data-board-top-sector="${escapeHtml(stat.section.sector)}" data-board-top-subcategory="${escapeHtml(stat.section.subcategory)}">
            <span>${categoryChip(stat.section.sector, stat.section.subcategory)}</span>
            <strong>${formatWon(stat.actualTotal)}</strong>
            <small>${stat.count.toLocaleString("ko-KR")}건 · 총 결제 ${formatWon(stat.total)}</small>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function attachBoardTopCategoryHandlers() {
  els.boardGrid.querySelectorAll("[data-open-detail-month]").forEach((button) => {
    button.addEventListener("click", () => openDetailView(boardDetailOptions({ month: button.dataset.openDetailMonth || els.boardMonth.value })));
  });
  els.boardGrid.querySelectorAll("[data-board-top-sector]").forEach((button) => {
    button.addEventListener("click", () => openDetailView(boardDetailOptions({
      month: els.boardMonth.value,
      sector: button.dataset.boardTopSector,
      subcategory: button.dataset.boardTopSubcategory
    })));
  });
}

function attachBoardAccordionHandlers() {
  els.boardGrid.querySelectorAll("[data-board-sector-accordion]").forEach((details) => {
    details.addEventListener("toggle", () => {
      const sector = details.dataset.boardSectorAccordion;
      if (details.open) boardExpandedSectors.add(sector);
      else boardExpandedSectors.delete(sector);
    });
  });
}

function attachBoardSideHandlers() {
  els.boardSideSummary.querySelectorAll("[data-open-income-month]").forEach((button) => {
    button.addEventListener("click", () => {
      openIncomeView({ month: button.dataset.openIncomeMonth || els.boardMonth.value, source: "board", scrollToRecords: true });
    });
  });
  els.boardSideSummary.querySelectorAll("[data-side-sector]").forEach((button) => {
    button.addEventListener("click", () => {
      openDetailView(boardDetailOptions({ sector: button.dataset.sideSector }));
    });
  });
}

function attachBoardSummaryHandlers() {
  els.boardSectorSummary.querySelectorAll("[data-board-summary-sector]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      openDetailView(boardDetailOptions({
        month: els.boardMonth.value,
        sector: node.dataset.boardSummarySector,
        subcategory: node.dataset.boardSummarySubcategory || "all"
      }));
    });
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        openDetailView(boardDetailOptions({
          month: els.boardMonth.value,
          sector: node.dataset.boardSummarySector,
          subcategory: node.dataset.boardSummarySubcategory || "all"
        }));
      }
    });
  });
}

function renderBoardSectorSummary(monthRows, selectedMonth) {
  const total = sumActual(monthRows);
  const sectorRows = buildSectorSpendRows(monthRows);
  if (!sectorRows.length) return `<div class="empty compact-empty">선택 월의 섹터별 요약이 없습니다.</div>`;
  const previousMonth = previousMonthKey(selectedMonth);
  const previousRows = reportingExpenseRows(classified, { months: [previousMonth] });
  return `
    <section class="board-sector-summary-panel">
      <div class="panel-head">
        <div>
          <h3>섹터별 소비 요약</h3>
          <p>선택 월의 소비 비중, 거래 건수, 전월 대비 변화를 섹터별로 봅니다.</p>
        </div>
      </div>
      <div class="board-sector-card-grid">
        ${sectorRows.map((item) => {
          const rows = monthRows.filter((row) => row.sector === item.sector);
          const previousAmount = sumActual(previousRows.filter((row) => row.sector === item.sector));
          const diff = item.amount - previousAmount;
          const trendClass = diff > 0 ? "negative" : diff < 0 ? "positive" : "neutral";
          const topSubcategories = topSubcategorySummary(rows, 3);
          return `
            <article class="board-sector-card ${categoryClass(item.sector)}" data-board-summary-sector="${escapeHtml(item.sector)}" role="button" tabindex="0">
              <div class="board-sector-card-head">
                ${categoryChip(item.sector)}
                <strong>${formatWon(item.amount)}</strong>
              </div>
              <div class="board-sector-card-meta">
                <span class="board-sector-card-share">${formatPercent(item.amount, total)} · ${item.count.toLocaleString("ko-KR")}건</span>
                <span class="board-sector-card-trend ${trendClass}">전월 대비 <b>${formatSignedWon(diff)}</b></span>
              </div>
              <div class="sector-top-list">
                ${topSubcategories.map((sub) => `<button type="button" data-board-summary-sector="${escapeHtml(item.sector)}" data-board-summary-subcategory="${escapeHtml(sub.subcategory)}" title="${escapeHtml(sub.subcategory)}">${escapeHtml(sub.subcategory)} <b>${formatWon(sub.amount)}</b></button>`).join("") || "<span>세부항목 없음</span>"}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderBoardSideSummary(sectorRows, selectedMonth, totals) {
  const { totalSpend } = totals;
  const topRows = sectorRows.slice(0, 5);
  const topSector = sectorRows[0] || { sector: "-", amount: 0 };
  const topRowsTotal = sum(topRows, "amount");
  return `
    <section class="side-summary-card">
      <div class="side-summary-head">
        <h3>선택 월 빠른 진단</h3>
        <span>${escapeHtml(selectedMonth || "-")}</span>
      </div>
      <div class="side-summary-main">
        <span>가장 큰 섹터</span>
        <strong>${escapeHtml(topSector.sector)}</strong>
        <em>${formatWon(topSector.amount)} · ${formatPercent(topSector.amount, totalSpend)}</em>
      </div>
      <div class="side-summary-pairs">
        <div><span>비교 섹터</span><b>${sectorRows.length.toLocaleString("ko-KR")}개</b></div>
        <div><span>TOP 5 합계</span><b>${formatWon(topRowsTotal)}</b></div>
      </div>
      <div class="side-top-list">
        ${topRows.map((item) => `
          <button type="button" data-side-sector="${escapeHtml(item.sector)}">
            ${categoryChip(item.sector)}
            <b>${formatWon(item.amount)}</b>
          </button>
        `).join("") || `<p>지출 내역 없음</p>`}
      </div>
      <button type="button" class="side-detail-button" data-side-sector="all">상세 내역에서 보기</button>
    </section>
  `;
}

function topSubcategorySummary(rows, limit = 3) {
  return [...groupBy(rows, (item) => item.subcategory || "미분류").entries()]
    .map(([subcategory, subRows]) => ({ subcategory, amount: sumActual(subRows), count: subRows.length }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}


function renderBoardGroup(title, description, total, sections, buckets, selectedMonth) {
  return `
    <section class="board-group-card">
      <div class="board-group-head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
        <span>${formatWon(total)}</span>
      </div>
      <div class="category-grid">
        ${sections.map((section) => renderLedgerSection(section, buckets[section.key] || [], selectedMonth)).join("")}
      </div>
    </section>
  `;
}

function renderLedgerSection(section, rows, selectedMonth, sortMode = "date", options = {}) {
  const sortedRows = sortTransactionRows(rows, sortMode);
  const limit = Number(options.limit || 0);
  const visibleRows = limit > 0 ? sortedRows.slice(0, limit) : sortedRows;
  const hiddenCount = Math.max(0, sortedRows.length - visibleRows.length);
  const total = sum(sortedRows, "amount");
  const reimbursementTotal = sumReimbursements(sortedRows);
  const actualTotal = sumActual(sortedRows);
  const canOpenFullView = Boolean(options.fullViewButton && !options.fullMode);
  const bodyRows = visibleRows.map((item) => {
    const installmentText = installmentSummaryText(item);
    const reimbursementDisabled = item.isInstallmentOccurrence || !reimbursementEditMode;
    const canEditInstallment = Boolean(options.fullMode && !item.isInstallmentOccurrence);
    const isInstallmentEditing = canEditInstallment && detailInstallmentEditRecordKey === item.recordKey;
    return `
    <div class="transaction-row ${categoryClass(item.sector)} ${detailFocusRecordKey === item.recordKey ? "is-detail-focused" : ""}" data-detail-record-key="${escapeHtml(item.recordKey)}">
      <span class="date">${escapeHtml(item.approvalDate)}</span>
      <span class="merchant" title="${escapeHtml(item.merchant)}">
        ${escapeHtml(item.merchant)}${item.status === "직접입력" ? `<em class="manual-badge">직접 입력</em>` : ""}
        ${installmentText ? `<em class="installment-badge">${escapeHtml(installmentText)}</em>` : ""}
        ${canEditInstallment ? `<button type="button" class="detail-installment-edit-button ${isInstallmentEditing ? "is-active" : ""}" data-detail-installment-edit="${escapeHtml(item.recordKey)}" title="할부 설정 수정">${isInstallmentEditing ? "수정 중" : "수정"}</button>` : ""}
      </span>
      <span class="amount payment">${formatWon(item.amount)}</span>
      <span class="amount reimbursement">
        <input class="reimbursement-input" type="text" inputmode="numeric" data-record-key="${escapeHtml(item.recordKey)}" value="${formatPlainNumber(reimbursementFor(item))}" aria-label="${escapeHtml(item.merchant)} 정산받은 금액" ${reimbursementDisabled ? "disabled" : ""}>
      </span>
      <span class="amount actual strong">${formatWon(actualAmount(item))}</span>
    </div>
    ${isInstallmentEditing ? renderInstallmentInlineControls(item) : ""}
  `;
  }).join("");

  return `
    <section class="ledger-section category-card ${categoryClass(section.sector)} ${hiddenCount > 0 ? "is-truncated-card" : ""} ${options.fullMode ? "is-full-card" : ""}" data-ledger-sector="${escapeHtml(section.sector)}">
      <div class="category-card-head">
        <div>
          <h4>${escapeHtml(section.title)}</h4>
          <p>${sortedRows.length.toLocaleString("ko-KR")}건 · 정산 ${formatWon(reimbursementTotal)}</p>
        </div>
        <div class="category-actions">
          <strong>${formatWon(actualTotal)}</strong>
          ${canOpenFullView ? `<button type="button" class="detail-card-expand" data-detail-expand-section="${escapeHtml(section.key)}">전체 보기</button>` : ""}
          ${options.fullMode ? `<button type="button" class="detail-reimbursement-toggle ${reimbursementEditMode ? "primary-action" : ""}" data-detail-reimbursement-toggle aria-pressed="${reimbursementEditMode ? "true" : "false"}">${reimbursementEditMode ? "정산금 수정 완료" : "정산금 수정"}</button>` : ""}
          <button type="button" class="quick-add-toggle" data-quick-add-open="${escapeHtml(section.key)}">+ 내역 추가</button>
        </div>
      </div>
      ${boardQuickAddFeedback === section.key ? `<div class="quick-add-feedback">직접 입력 내역을 추가했습니다.</div>` : ""}
      <div class="category-stat-row">
        <span>총 결제 ${formatWon(total)}</span>
        <span>실 지출 ${formatWon(actualTotal)}</span>
      </div>
      ${options.reimbursementHint ? `<p class="category-edit-hint">${escapeHtml(options.reimbursementHint)}</p>` : ""}
      ${boardQuickAddSectionKey === section.key ? renderQuickAddForm(section, selectedMonth) : ""}
      <div class="transaction-list">
        <div class="transaction-head">
          <span>날짜</span>
          <span>내용</span>
          <span class="amount">총 결제액</span>
          <span class="amount">정산받은 금액</span>
          <span class="amount">실 지출액</span>
        </div>
        ${bodyRows || `<div class="ledger-empty">내역 없음</div>`}
      </div>
      ${options.fullViewButton && hiddenCount > 0 ? `
        <div class="detail-card-more">
          <span>${hiddenCount.toLocaleString("ko-KR")}건이 더 있습니다.</span>
          <button type="button" data-detail-expand-section="${escapeHtml(section.key)}">전체 보기</button>
        </div>
      ` : ""}
    </section>
  `;
}

function renderInstallmentInlineControls(item) {
  const enabled = Boolean(item.installmentEnabled && Number(item.installmentMonths || 0) > 1);
  const parsedMonths = installmentMonths(item.installment);
  const months = enabled ? Number(item.installmentMonths || 0) : parsedMonths || 2;
  const startMonth = item.installmentStartMonth || item.month || monthKey(item.approvalDate) || currentMonthKey();
  const monthly = enabled ? installmentMonthlyAmount(item) : Math.floor(Number(item.amount || 0) / Math.max(1, months));
  return `
    <div class="transaction-installment-row" data-installment-row="${escapeHtml(item.recordKey)}">
      <label class="check-line">
        <input type="checkbox" class="installment-toggle" data-installment-field="enabled" data-record-key="${escapeHtml(item.recordKey)}" ${enabled ? "checked" : ""}>
        할부 적용
      </label>
      <label>개월
        <input type="number" min="2" max="60" class="installment-months-input" data-installment-field="months" data-record-key="${escapeHtml(item.recordKey)}" value="${escapeHtml(months)}">
      </label>
      <label>시작 월
        <input type="month" class="installment-start-input" data-installment-field="startMonth" data-record-key="${escapeHtml(item.recordKey)}" value="${escapeHtml(startMonth)}">
      </label>
      <span class="installment-preview">월별 반영액 ${formatWon(monthly)}</span>
      <div class="installment-edit-actions">
        <button type="button" class="primary-action" data-installment-save="${escapeHtml(item.recordKey)}">저장</button>
        <button type="button" data-detail-installment-cancel>취소</button>
      </div>
    </div>
  `;
}

function sortTransactionRows(rows, sortMode = "date") {
  const byDate = (a, b) =>
    `${a.approvalDate} ${a.approvalTime} ${a.merchant}`.localeCompare(`${b.approvalDate} ${b.approvalTime} ${b.merchant}`, "ko-KR");
  const byRecent = (a, b) =>
    `${b.approvalDate} ${b.approvalTime} ${b.importedAt || ""}`.localeCompare(`${a.approvalDate} ${a.approvalTime} ${a.importedAt || ""}`, "ko-KR");
  const sorters = {
    "amount-desc": (a, b) => actualAmount(b) - actualAmount(a) || byDate(a, b),
    "amount-asc": (a, b) => actualAmount(a) - actualAmount(b) || byDate(a, b),
    recent: byRecent,
    date: byDate
  };
  return [...rows].sort(sorters[sortMode] || byDate);
}

function renderSummaryPair(label, value, isAmount = true, options = {}) {
  const attrs = options.incomeMonth ? ` data-open-income-month="${escapeHtml(options.incomeMonth)}"` : "";
  const tagOpen = options.incomeMonth
    ? `<button type="button" class="summary-pair-link"${attrs}>`
    : "<div>";
  const tagClose = options.incomeMonth ? "button" : "div";
  return `
    ${tagOpen}
      <span>${escapeHtml(label)}</span>
      <strong>${isAmount ? formatWon(value) : escapeHtml(value)}</strong>
    </${tagClose}>
  `;
}

function attachBoardFinalSummaryHandlers() {
  els.boardSummary.querySelectorAll("[data-open-income-month]").forEach((button) => {
    button.addEventListener("click", () => {
      openIncomeView({ month: button.dataset.openIncomeMonth || els.boardMonth.value, source: "board", scrollToRecords: true });
    });
  });
}

function renderBoardFinalSummary({ selectedMonth, totalPayment, reimbursementTotal, totalSpend, fixedTotal, variableTotal, income, net }) {
  return `
    <section class="final-summary-card compact-summary-strip">
      <div class="compact-summary-head">
        <h3>월간 핵심 요약</h3>
        <strong class="${net >= 0 ? "positive" : "negative"}">${formatSignedWon(net)}</strong>
      </div>
      <div class="compact-summary-grid">
        ${renderSummaryPair("월", selectedMonth || "-", false)}
        ${renderSummaryPair("총 결제액", totalPayment)}
        ${renderSummaryPair("정산받은 금액", reimbursementTotal)}
        ${renderSummaryPair("실 지출액", totalSpend)}
      </div>
    </section>
  `;
}

function renderQuickAddForm(section, selectedMonth) {
  const defaultDate = defaultDateForMonth(selectedMonth);
  return `
    <form class="quick-add-form" data-quick-add-form="${escapeHtml(section.key)}">
      <div class="quick-add-lock">
        ${categoryChip(section.sector, section.subcategory)}
        <span>이 카드 기준으로 자동 분류됩니다.</span>
      </div>
      <p class="quick-add-hint">실 지출액은 총 결제액에서 정산받은 금액을 뺀 값으로 자동 계산됩니다.</p>
      <label>
        날짜
        <input name="date" type="date" value="${escapeHtml(defaultDate)}" required>
      </label>
      <label>
        결제수단
        <select name="sourceType">
          <option value="card">카드</option>
          <option value="transfer">이체</option>
          <option value="cash">현금</option>
        </select>
      </label>
      <label class="wide-field">
        내용
        <input name="merchant" type="text" placeholder="${escapeHtml(section.title)} 내역" required>
      </label>
      <label>
        총 결제액
        <input name="amount" type="text" inputmode="numeric" placeholder="0" required>
      </label>
      <label>
        정산받은 금액
        <input name="reimbursement" type="text" inputmode="numeric" placeholder="0">
      </label>
      <div class="quick-add-actions">
        <button type="button" data-quick-add-close>취소</button>
        <button type="submit" class="primary-action">저장</button>
      </div>
    </form>
  `;
}

function defaultDateForMonth(month) {
  const today = new Date();
  const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (!month) return todayText;
  return todayText.startsWith(`${month}-`) ? todayText : `${month}-01`;
}

function currentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function attachReimbursementHandlers(root = els.boardGrid) {
  root.querySelectorAll(".reimbursement-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = input.dataset.recordKey;
      if (!key) return;
      const record = classified.find((item) => item.recordKey === key);
      const max = Number(record?.amount || 0);
      const value = Math.min(max, Math.max(0, toNumber(input.value)));
      if (value > 0) reimbursements[key] = value;
      else delete reimbursements[key];
      await saveReimbursements();
      renderAll();
    });
  });
}

function attachInstallmentHandlers(root = els.detailGrid) {
  root.querySelectorAll("[data-installment-row]").forEach((row) => {
    const updatePreview = () => {
      const key = row.dataset.installmentRow;
      const record = classified.find((item) => item.recordKey === key);
      const months = Math.max(2, Number(row.querySelector('[data-installment-field="months"]')?.value || 2));
      const preview = row.querySelector(".installment-preview");
      if (preview) preview.textContent = `월별 반영액 ${formatWon(Math.floor(Number(record?.amount || 0) / months))}`;
    };
    row.querySelectorAll("[data-installment-field]").forEach((control) => {
      control.addEventListener("input", updatePreview);
      control.addEventListener("change", updatePreview);
    });
    row.querySelectorAll("[data-installment-save]").forEach((button) => {
      button.addEventListener("click", async () => {
        await saveInstallmentSettings(button.dataset.installmentSave, row);
        detailInstallmentEditRecordKey = "";
        renderAll();
      });
    });
    row.querySelectorAll("[data-detail-installment-cancel]").forEach((button) => {
      button.addEventListener("click", () => {
        detailInstallmentEditRecordKey = "";
        renderDetailView();
      });
    });
  });
}

async function saveInstallmentSettings(recordKey, row) {
  const index = transactions.findIndex((item) => normalizeStoredTransaction(item).recordKey === recordKey);
  if (index < 0) return;
  const original = normalizeStoredTransaction(transactions[index]);
  const enabled = Boolean(row.querySelector('[data-installment-field="enabled"]')?.checked);
  const months = Math.max(0, Number(row.querySelector('[data-installment-field="months"]')?.value || 0));
  const startMonth = row.querySelector('[data-installment-field="startMonth"]')?.value || original.month;
  const validEnabled = enabled && months > 1 && isValidMonthKey(startMonth);
  const updated = normalizeStoredTransaction({
    ...original,
    installmentEnabled: validEnabled,
    installmentMonths: validEnabled ? months : 0,
    installmentStartMonth: validEnabled ? startMonth : "",
    installmentOriginalAmount: validEnabled ? Number(original.amount || 0) : 0,
    installmentMonthlyAmount: validEnabled ? Math.floor(Number(original.amount || 0) / months) : 0,
    installmentGroupId: validEnabled ? original.installmentGroupId || original.recordKey : "",
    updatedAt: new Date().toISOString(),
    recordKey
  });
  transactions[index] = updated;
  await saveTransactions();
  reclassify();
}

function attachBoardQuickAddHandlers(root = els.boardGrid, rerender = renderBoard) {
  root.querySelectorAll("[data-quick-add-open]").forEach((button) => {
    button.addEventListener("click", () => {
      boardQuickAddSectionKey = button.dataset.quickAddOpen;
      boardQuickAddFeedback = "";
      rerender();
    });
  });

  root.querySelectorAll("[data-quick-add-close]").forEach((button) => {
    button.addEventListener("click", () => {
      boardQuickAddSectionKey = "";
      boardQuickAddFeedback = "";
      rerender();
    });
  });

  root.querySelectorAll("[data-quick-add-form]").forEach((form) => {
    form.addEventListener("submit", handleBoardQuickAdd);
  });
}

async function handleBoardQuickAdd(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const section = boardSections.find((item) => item.key === form.dataset.quickAddForm);
  if (!section) return;

  const formData = new FormData(form);
  const item = buildManualTransaction({
    sourceType: formData.get("sourceType"),
    flow: "expense",
    date: formData.get("date"),
    time: "",
    merchant: formData.get("merchant"),
    amount: formData.get("amount"),
    sector: section.sector,
    subcategory: section.subcategory
  });
  if (!item) {
    alert("날짜, 내용, 총 결제액을 입력해주세요.");
    return;
  }

  const reimbursement = Math.min(Number(item.amount || 0), Math.max(0, toNumber(formData.get("reimbursement"))));
  const mergeResult = mergeTransactions(transactions, [item]);
  transactions = mergeResult.records;
  if (mergeResult.added && reimbursement > 0) reimbursements[item.recordKey] = reimbursement;
  importMeta = {
    ...importMeta,
    lastFileName: "분류 보드 직접 입력",
    lastImportedAt: new Date().toISOString(),
    lastAddedCount: mergeResult.added,
    lastSkippedCount: mergeResult.skipped
  };
  currentFileName = "분류 보드 직접 입력";
  boardQuickAddSectionKey = "";
  boardQuickAddFeedback = section.key;
  await saveTransactions();
  await saveReimbursements();
  await saveImportMeta();
  reclassify();
  window.setTimeout(() => {
    if (boardQuickAddFeedback === section.key) {
      boardQuickAddFeedback = "";
      renderAll();
    }
  }, 1800);
}
