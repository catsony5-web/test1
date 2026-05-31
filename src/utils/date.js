function previousMonthKey(month) {
  const [year, monthNumber] = String(month || "").split("-").map(Number);
  if (!year || !monthNumber) return "";
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthKey(month, offset) {
  const [year, monthNumber] = String(month || currentMonthKey()).split("-").map(Number);
  const base = new Date(year || new Date().getFullYear(), (monthNumber || new Date().getMonth() + 1) - 1 + offset, 1);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
}

function moveCalendarMonth(offset) {
  const current = selectedCalendarMonth || els.calendarMonth.value || currentMonthKey();
  selectedCalendarMonth = shiftMonthKey(current, offset);
  setSharedSelectedMonth(selectedCalendarMonth, { syncControls: false });
  selectedCalendarDate = "";
  renderCalendar();
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


function toNumber(value) {
  const text = String(value ?? "").replaceAll(",", "").trim();
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function normalizeInputDate(value) {
  const text = String(value ?? "").trim().replaceAll(".", "-").replaceAll("/", "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function normalizeInputTime(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normalizeDateKey(value) {
  return normalizeInputDate(value);
}

function monthKey(value) {
  const text = String(value ?? "").trim().replaceAll(".", "-");
  const match = text.match(/^(\d{4})-(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}`;
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.round((end - start) / 86400000);
}

function addDays(date, days) {
  const base = new Date(`${date}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}
