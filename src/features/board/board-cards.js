function buildBoardSectionStat(section, rows) {
  return {
    section,
    rows,
    total: sum(rows, "amount"),
    reimbursementTotal: sumReimbursements(rows),
    actualTotal: sumConsumption(rows),
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

function buildBoardTreemapLayout(items, width, height) {
  const cells = Array(items.length).fill(null);
  const weighted = items
    .map((item, index) => ({ index, value: Math.max(0, Number(item.value || 0)) }))
    .filter((item) => item.value > 0);

  const place = (group, rect) => {
    if (!group.length) return;
    if (group.length === 1) {
      cells[group[0].index] = rect;
      return;
    }

    const total = group.reduce((sumValue, item) => sumValue + item.value, 0);
    const target = total / 2;
    let running = 0;
    let splitIndex = 1;
    let closest = Number.POSITIVE_INFINITY;
    for (let index = 1; index < group.length; index += 1) {
      running += group[index - 1].value;
      const distance = Math.abs(target - running);
      if (distance < closest) {
        closest = distance;
        splitIndex = index;
      }
    }

    const first = group.slice(0, splitIndex);
    const second = group.slice(splitIndex);
    const firstTotal = first.reduce((sumValue, item) => sumValue + item.value, 0);
    const ratio = total > 0 ? firstTotal / total : 0.5;
    if (rect.width >= rect.height) {
      const firstWidth = rect.width * ratio;
      place(first, { ...rect, width: firstWidth });
      place(second, { x: rect.x + firstWidth, y: rect.y, width: rect.width - firstWidth, height: rect.height });
      return;
    }

    const firstHeight = rect.height * ratio;
    place(first, { ...rect, height: firstHeight });
    place(second, { x: rect.x, y: rect.y + firstHeight, width: rect.width, height: rect.height - firstHeight });
  };

  place(weighted, { x: 0, y: 0, width, height });
  return cells.map((cell) => cell || { x: 0, y: 0, width: 0, height: 0 });
}

function buildResponsiveBoardTreemapLayouts(items, heights) {
  return {
    wide: buildBoardTreemapLayout(items, 100, heights.wide),
    medium: buildBoardTreemapLayout(items, 100, heights.medium),
    mobile: buildBoardTreemapLayout(items, 100, heights.mobile)
  };
}

function boardTreemapStyle(layouts, index) {
  const declarations = [];
  const addLayout = (prefix, cell, height) => {
    const toPercent = (value, total) => (value / total * 100).toFixed(4);
    declarations.push(
      `--treemap-${prefix}x:${toPercent(cell.x, 100)}%`,
      `--treemap-${prefix}y:${toPercent(cell.y, height)}%`,
      `--treemap-${prefix}w:${toPercent(cell.width, 100)}%`,
      `--treemap-${prefix}h:${toPercent(cell.height, height)}%`
    );
  };
  addLayout("", layouts.wide[index], layouts.wide.reduce((max, cell) => Math.max(max, cell.y + cell.height), 0) || 1);
  addLayout("medium-", layouts.medium[index], layouts.medium.reduce((max, cell) => Math.max(max, cell.y + cell.height), 0) || 1);
  addLayout("mobile-", layouts.mobile[index], layouts.mobile.reduce((max, cell) => Math.max(max, cell.y + cell.height), 0) || 1);
  return declarations.join(";");
}

function formatBoardTreemapWon(value) {
  return formatCompactWon(value).replace(/^\+/, "");
}

function renderBoardTopCategories(sectionStats, selectedMonth) {
  const visible = sectionStats
    .filter((stat) => stat.actualTotal > 0)
    .slice(0, 12);
  if (!visible.length) {
    return `<div class="empty">선택한 월의 주요 상세 항목이 없습니다. 상세 내역 탭에서 직접 입력을 추가할 수 있습니다.</div>`;
  }
  const layouts = buildResponsiveBoardTreemapLayouts(
    visible.map((stat) => ({ value: stat.actualTotal })),
    { wide: 24, medium: 48, mobile: 142 }
  );
  return `
    <section class="board-top-panel">
      <div class="panel-head">
        <div>
          <h3>많이 쓴 세부항목 TOP</h3>
        </div>
        <div class="board-treemap-head-actions">
          <span>실 지출 기준 · TOP ${visible.length.toLocaleString("ko-KR")}</span>
          <button type="button" data-open-detail-month="${escapeHtml(selectedMonth)}">전체 보기 <i class="ti ti-chevron-right" aria-hidden="true"></i></button>
        </div>
      </div>
      <div class="board-top-grid board-treemap" role="region" aria-label="많이 쓴 세부항목 상위 ${visible.length.toLocaleString("ko-KR")}개">
        ${visible.map((stat, index) => {
          const subcategory = stat.section.subcategory || stat.section.title || "미분류";
          const accessibleLabel = `${stat.section.sector} ${subcategory}, 실 지출 ${formatWon(stat.actualTotal)}, ${stat.count.toLocaleString("ko-KR")}건`;
          return `
          <button type="button" class="board-top-item board-treemap-tile ${categoryClass(stat.section.sector)}" style="${boardTreemapStyle(layouts, index)}" data-board-top-sector="${escapeHtml(stat.section.sector)}" data-board-top-subcategory="${escapeHtml(subcategory)}" title="${escapeHtml(accessibleLabel)}" aria-label="${escapeHtml(`${accessibleLabel}, 상세 내역 보기`)}">
            <span class="board-treemap-content">
              <span class="board-treemap-sector">${escapeHtml(stat.section.sector)}</span>
              <span class="board-treemap-heading board-top-heading"><span class="board-treemap-icon" aria-hidden="true"><i class="ti ${subcategoryIconClass(stat.section.sector, subcategory)}"></i></span><strong class="board-treemap-title">${escapeHtml(subcategory)}</strong></span>
              <b class="board-treemap-amount">
                <span class="board-treemap-amount-full">${formatWon(stat.actualTotal)}</span>
                <span class="board-treemap-amount-compact">${formatBoardTreemapWon(stat.actualTotal)}</span>
              </b>
              <small class="board-treemap-count">${stat.count.toLocaleString("ko-KR")}건</small>
            </span>
          </button>
        `;
        }).join("")}
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

function attachBoardSummaryHandlers() {
  els.boardSectorSummary.querySelectorAll("[data-board-summary-sector]").forEach((node) => {
    node.addEventListener("click", () => {
      openDetailView(boardDetailOptions({
        month: els.boardMonth.value,
        sector: node.dataset.boardSummarySector,
        subcategory: "all"
      }));
    });
  });
}

function renderBoardSectorSummary(monthRows, selectedMonth) {
  const total = sumConsumption(monthRows);
  const sectorRows = buildSectorSpendRows(monthRows).filter((item) => item.amount > 0);
  if (!sectorRows.length) return `<div class="empty compact-empty">선택 월의 섹터별 요약이 없습니다.</div>`;
  const previousMonth = previousMonthKey(selectedMonth);
  const previousRows = reportingExpenseRows(classified, { months: [previousMonth] });
  const layouts = buildResponsiveBoardTreemapLayouts(
    sectorRows.map((item) => ({ value: item.amount })),
    { wide: 30, medium: 54, mobile: 118 }
  );
  return `
    <section class="board-sector-summary-panel">
      <div class="panel-head">
        <div>
          <h3>섹터별 소비 요약</h3>
        </div>
        <span class="board-treemap-basis">실 지출 기준</span>
      </div>
      <div class="board-sector-card-grid board-treemap" role="region" aria-label="선택 월 섹터별 실 지출 트리맵">
        ${sectorRows.map((item, index) => {
          const previousAmount = sumConsumption(previousRows.filter((row) => row.sector === item.sector));
          const diff = item.amount - previousAmount;
          const trendClass = diff > 0 ? "negative" : diff < 0 ? "positive" : "neutral";
          const accessibleLabel = `${item.sector}, 실 지출 ${formatWon(item.amount)}, 전체의 ${formatPercent(item.amount, total)}, ${item.count.toLocaleString("ko-KR")}건, 전월 대비 ${formatSignedWon(diff)}`;
          return `
            <button type="button" class="board-sector-card board-treemap-tile ${categoryClass(item.sector)}" style="${boardTreemapStyle(layouts, index)}" data-board-summary-sector="${escapeHtml(item.sector)}" title="${escapeHtml(accessibleLabel)}" aria-label="${escapeHtml(`${accessibleLabel}, 상세 내역 보기`)}">
              <span class="board-treemap-content">
                <span class="board-treemap-heading"><span class="board-treemap-icon" aria-hidden="true"><i class="ti ${sectorIconClass(item.sector)}"></i></span><b class="board-treemap-title">${escapeHtml(item.sector)}</b></span>
                <strong class="board-treemap-amount">
                  <span class="board-treemap-amount-full">${formatWon(item.amount)}</span>
                  <span class="board-treemap-amount-compact">${formatBoardTreemapWon(item.amount)}</span>
                </strong>
                <small class="board-treemap-share">${formatPercent(item.amount, total)} · ${item.count.toLocaleString("ko-KR")}건</small>
                <span class="board-treemap-trend ${trendClass}">전월 대비 <b>${formatSignedWon(diff)}</b></span>
              </span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function topSubcategorySummary(rows, limit = 3) {
  return [...groupBy(rows, (item) => item.subcategory || "미분류").entries()]
    .map(([subcategory, subRows]) => ({ subcategory, amount: sumConsumption(subRows), count: subRows.length }))
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
  const actualTotal = sumConsumption(sortedRows);
  const canOpenFullView = Boolean(options.fullViewButton && !options.fullMode);
  const calendarLinks = Boolean(options.fullMode || options.calendarLinks);
  const bodyRows = visibleRows.map((item) => {
    const installmentText = installmentSummaryText(item);
    const reimbursementDisabled = isLoanRepaymentTransaction(item) || item.isInstallmentOccurrence || !reimbursementEditMode;
    const canEditInstallment = Boolean(options.fullMode && !item.isInstallmentOccurrence && !isLoanRepaymentTransaction(item));
    const isInstallmentEditing = canEditInstallment && detailInstallmentEditRecordKey === item.recordKey;
    const calendarRecordKey = item.installmentSourceRecordKey || item.recordKey;
    const calendarLinkAttrs = calendarLinks
      ? ` data-detail-open-calendar="${escapeHtml(calendarRecordKey)}" data-detail-calendar-date="${escapeHtml(item.approvalDate)}" data-detail-calendar-month="${escapeHtml(item.month)}" role="button" tabindex="0" title="소비 달력에서 이 거래 수정"`
      : "";
    return `
    <div class="transaction-row ${categoryClass(item.sector)} ${calendarLinks ? "detail-calendar-link" : ""} ${detailFocusRecordKey === item.recordKey ? "is-detail-focused" : ""}" data-detail-record-key="${escapeHtml(item.recordKey)}"${calendarLinkAttrs}>
      <span class="date">${escapeHtml(item.approvalDate)}</span>
      <span class="merchant" title="${escapeHtml(item.merchant)}">
        ${escapeHtml(item.merchant)}${item.status === "직접입력" ? `<em class="manual-badge">직접 입력</em>` : ""}${isLoanRepaymentTransaction(item) ? `<em class="manual-badge">대출 상환 · 내 원금 ${formatWon(loanPrincipalActualAmount(item))}${loanSupportDueAmount(item) ? ` · 가족 분담 ${formatWon(loanSupportDueAmount(item))}` : ""}</em>` : ""}
        ${installmentText ? `<em class="installment-badge">${escapeHtml(installmentText)}</em>` : ""}
        ${canEditInstallment ? `<button type="button" class="detail-installment-edit-button ${isInstallmentEditing ? "is-active" : ""}" data-detail-installment-edit="${escapeHtml(item.recordKey)}" title="할부 설정 수정">${isInstallmentEditing ? "수정 중" : "수정"}</button>` : ""}
      </span>
      <span class="amount payment">${formatWon(item.amount)}</span>
      <span class="amount reimbursement">
        <input class="reimbursement-input" type="text" inputmode="numeric" data-record-key="${escapeHtml(item.recordKey)}" value="${formatPlainNumber(reimbursementFor(item))}" aria-label="${escapeHtml(item.merchant)} 정산받은 금액" ${reimbursementDisabled ? "disabled" : ""}>
      </span>
      <span class="amount actual strong">${formatWon(consumptionAmount(item))}</span>
    </div>
    ${isInstallmentEditing ? renderInstallmentInlineControls(item) : ""}
  `;
  }).join("");

  return `
    <section class="ledger-section category-card ${categoryClass(section.sector)} ${hiddenCount > 0 ? "is-truncated-card" : ""} ${options.fullMode ? "is-full-card" : ""} ${options.masterDetail ? "is-master-detail-card" : ""}" data-ledger-sector="${escapeHtml(section.sector)}">
      <div class="category-card-head">
        <div class="category-title-block ${options.masterDetail ? "detail-ledger-heading" : ""}">
          ${options.masterDetail ? `<span class="detail-ledger-icon ${categoryClass(section.sector)}" aria-hidden="true"><i class="ti ${subcategoryIconClass(section.sector, section.subcategory)}"></i></span>` : ""}
          <div>
            ${options.contextLabel ? `<span class="detail-ledger-breadcrumb">${escapeHtml(options.contextLabel)} <i class="ti ti-chevron-right" aria-hidden="true"></i></span>` : ""}
            <h4>${escapeHtml(section.title)}</h4>
            <p>${sortedRows.length.toLocaleString("ko-KR")}건 · 정산 ${formatWon(reimbursementTotal)}</p>
          </div>
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
          <span class="amount">분석 반영액</span>
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
    "amount-desc": (a, b) => consumptionAmount(b) - consumptionAmount(a) || byDate(a, b),
    "amount-asc": (a, b) => consumptionAmount(a) - consumptionAmount(b) || byDate(a, b),
    recent: byRecent,
    date: byDate
  };
  return [...rows].sort(sorters[sortMode] || byDate);
}

function renderQuickAddForm(section, selectedMonth) {
  const defaultDate = defaultDateForMonth(selectedMonth);
  return `
    <form class="quick-add-form" data-quick-add-form="${escapeHtml(section.key)}">
      <div class="quick-add-lock">
        ${categoryChip(section.sector, section.subcategory)}
        <span>이 카드 기준으로 자동 분류됩니다.</span>
      </div>
      <p class="quick-add-hint">분석 반영액은 총 결제액에서 정산금을 빼며, 대출 상환은 이자만 반영합니다.</p>
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
  if (isLoanRepaymentTransaction(original)) return;
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
