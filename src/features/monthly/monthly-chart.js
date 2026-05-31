function renderMonthlyLineChart(rows) {
  const width = 980;
  const height = 390;
  const padLeft = 104;
  const padRight = 46;
  const padTop = 54;
  const padBottom = 70;
  const values = rows.map((row) => row.net);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const xStep = rows.length > 1 ? plotWidth / (rows.length - 1) : 0;
  const point = (row, index) => {
    const x = rows.length > 1 ? padLeft + index * xStep : padLeft + plotWidth / 2;
    const y = padTop + (max - row.net) / span * plotHeight;
    return { x, y };
  };
  const points = rows.map(point);
  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const segments = points.slice(1).map((p, index) => {
    const previous = points[index];
    const previousRow = rows[index];
    const row = rows[index + 1];
    const tone = previousRow.net >= 0 && row.net >= 0
      ? "positive"
      : previousRow.net < 0 && row.net < 0
        ? "negative"
        : "mixed";
    return `<line class="balance-segment ${tone}" x1="${previous.x}" y1="${previous.y}" x2="${p.x}" y2="${p.y}"></line>`;
  }).join("");
  const zeroY = padTop + (max - 0) / span * plotHeight;
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));
  const best = [...rows].sort((a, b) => b.net - a.net)[0];
  const worst = [...rows].sort((a, b) => a.net - b.net)[0];
  const areaPoints = [
    `${points[0]?.x || padLeft},${zeroY}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${points.at(-1)?.x || width - padRight},${zeroY}`
  ].join(" ");
  const gridValues = unique([max, Math.round((max + 0) / 2), 0, Math.round((min + 0) / 2), min])
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);

  return `
    <div class="monthly-chart-summary">
      <span class="chart-summary-pill positive">최고 잔액 <b>${escapeHtml(best.month)} ${escapeHtml(formatSignedWon(best.net))}</b></span>
      <span class="chart-summary-pill negative">최저 잔액 <b>${escapeHtml(worst.month)} ${escapeHtml(formatSignedWon(worst.net))}</b></span>
    </div>
    <div class="chart-legend-row balance-legend">
      <span><b class="legend-positive"></b>남은 돈 <b class="legend-negative"></b>부족한 돈</span>
      <span>0원 기준선 위는 흑자, 아래는 적자입니다.</span>
    </div>
    <svg class="balance-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="수입에서 실 지출을 뺀 월별 잔액 추이 차트">
      <defs>
        <linearGradient id="balanceAreaGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#22c55e" stop-opacity="0.17"></stop>
          <stop offset="52%" stop-color="#94a3b8" stop-opacity="0.08"></stop>
          <stop offset="100%" stop-color="#ef4444" stop-opacity="0.14"></stop>
        </linearGradient>
      </defs>
      <rect class="balance-chart-bg" x="0" y="0" width="${width}" height="${height}" rx="18"></rect>
      ${gridValues.map((value) => {
        const y = padTop + (max - value) / span * plotHeight;
        return `
          <g>
            <line class="chart-grid balance-grid" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
            <text class="chart-value balance-axis-label" x="${padLeft - 12}" y="${y + 4}" text-anchor="end">${escapeHtml(formatCompactWon(value))}</text>
          </g>
        `;
      }).join("")}
      <line class="chart-axis balance-zero-line" x1="${padLeft}" y1="${zeroY}" x2="${width - padRight}" y2="${zeroY}"></line>
      <text class="chart-baseline-label" x="${width - padRight}" y="${zeroY - 8}" text-anchor="end">0원</text>
      <polygon class="balance-area" points="${areaPoints}"></polygon>
      <polyline class="balance-line balance-line-base" points="${polyline}"></polyline>
      ${segments}
      ${points.map((p, index) => {
        const row = rows[index];
        const showMonth = index % labelEvery === 0 || index === rows.length - 1;
        const isEdge = row === best || row === worst || index === rows.length - 1;
        const valueY = row.net >= 0 ? Math.max(p.y - 16, padTop + 14) : Math.min(p.y + 27, height - padBottom - 9);
        const hitWidth = Math.max(30, Math.min(62, xStep || 48));
        return `
        <g class="balance-point-group ${focusedMonthlyMonth === row.month ? "is-persistent" : ""}" data-chart-month="${escapeHtml(row.month)}" tabindex="0" role="button" aria-label="${escapeHtml(`${row.month} 년도 지출정리 표 행으로 이동`)}">
          <title>${escapeHtml(row.month)} · ${escapeHtml(formatSignedWon(row.net))}</title>
          <rect class="balance-hit-area" x="${p.x - hitWidth / 2}" y="${padTop}" width="${hitWidth}" height="${plotHeight}" rx="12"></rect>
          <line class="balance-guide" x1="${p.x}" y1="${padTop}" x2="${p.x}" y2="${height - padBottom}"></line>
          <circle class="balance-point ${row.net >= 0 ? "good" : "bad"}" cx="${p.x}" cy="${p.y}" r="${isEdge ? 6.7 : 5.4}"></circle>
          ${isEdge ? `<text class="chart-value balance-point-label" x="${p.x}" y="${valueY}" text-anchor="middle">${escapeHtml(formatSignedWon(row.net))}</text>` : ""}
          ${showMonth ? `<text class="chart-label" x="${p.x}" y="${height - 22}" text-anchor="middle">${escapeHtml(row.month.slice(2))}</text>` : ""}
        </g>
      `;
      }).join("")}
    </svg>
  `;
}
