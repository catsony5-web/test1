function setupAppearanceControls() {
  els.themeChoiceGroup?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-theme-choice]");
    if (!button) return;
    appSettings.theme = normalizeTheme(button.dataset.themeChoice);
    applyAppSettings();
    await saveSettings();
  });

  els.backgroundImageInput?.addEventListener("change", handleBackgroundImageSelection);
  els.applyBackgroundButton?.addEventListener("click", async () => {
    if (!pendingBackgroundImageData) return;
    appSettings.backgroundImage = pendingBackgroundImageData;
    pendingBackgroundImageData = "";
    applyAppSettings();
    await saveSettings();
    setBackgroundStatus("배경 이미지를 적용했습니다.");
  });
  els.removeBackgroundButton?.addEventListener("click", async () => {
    pendingBackgroundImageData = "";
    appSettings.backgroundImage = "";
    if (els.backgroundImageInput) els.backgroundImageInput.value = "";
    applyAppSettings();
    await saveSettings();
    setBackgroundStatus("배경 이미지를 제거했습니다.");
  });

  [
    [els.backgroundOpacityInput, "backgroundOpacity", 100],
    [els.backgroundBlurInput, "backgroundBlur", 1],
    [els.backgroundOverlayInput, "backgroundOverlay", 100]
  ].forEach(([control, key, scale]) => {
    if (!control) return;
    control.addEventListener("input", () => {
      appSettings[key] = Number(control.value) / scale;
      if (key === "backgroundBlur") appSettings[key] = Number(control.value);
      applyAppSettings();
    });
    control.addEventListener("change", () => saveSettings());
  });
}

async function handleBackgroundImageSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setBackgroundStatus("이미지 파일만 선택할 수 있습니다.");
    event.target.value = "";
    return;
  }
  const maxBytes = 3 * 1024 * 1024;
  if (file.size > maxBytes) {
    setBackgroundStatus("이미지가 너무 큽니다. 3MB 이하 이미지로 선택해주세요.");
    event.target.value = "";
    return;
  }
  pendingBackgroundImageData = await readFileAsDataUrl(file);
  if (els.backgroundPreview) {
    els.backgroundPreview.style.backgroundImage = `url("${pendingBackgroundImageData}")`;
    els.backgroundPreview.classList.add("has-image");
  }
  if (els.applyBackgroundButton) els.applyBackgroundButton.disabled = false;
  setBackgroundStatus("이미지를 선택했습니다. 배경 적용을 누르면 저장됩니다.");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function syncAppearanceControls() {
  els.themeChoiceGroup?.querySelectorAll("[data-theme-choice]").forEach((button) => {
    const isActive = button.dataset.themeChoice === appSettings.theme;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  if (els.backgroundOpacityInput) els.backgroundOpacityInput.value = Math.round(clampNumber(appSettings.backgroundOpacity, 0, 0.45, 0.14) * 100);
  if (els.backgroundBlurInput) els.backgroundBlurInput.value = Math.round(clampNumber(appSettings.backgroundBlur, 0, 18, 0));
  if (els.backgroundOverlayInput) els.backgroundOverlayInput.value = Math.round(clampNumber(appSettings.backgroundOverlay, 0, 0.8, 0.28) * 100);
  if (els.backgroundOpacityValue) els.backgroundOpacityValue.textContent = `${els.backgroundOpacityInput?.value || 0}%`;
  if (els.backgroundBlurValue) els.backgroundBlurValue.textContent = `${els.backgroundBlurInput?.value || 0}px`;
  if (els.backgroundOverlayValue) els.backgroundOverlayValue.textContent = `${els.backgroundOverlayInput?.value || 0}%`;
  if (els.backgroundPreview) {
    const image = pendingBackgroundImageData || appSettings.backgroundImage;
    els.backgroundPreview.style.backgroundImage = image ? `url("${image}")` : "";
    els.backgroundPreview.classList.toggle("has-image", Boolean(image));
  }
  if (els.applyBackgroundButton) els.applyBackgroundButton.disabled = !pendingBackgroundImageData;
}

function setBackgroundStatus(message) {
  if (els.backgroundSettingsStatus) els.backgroundSettingsStatus.textContent = message;
}

const MOBILE_PRIMARY_VIEWS = new Set(["board", "calendar", "details"]);

function syncNavigationState(viewName) {
  document.querySelectorAll(".tab[data-view]").forEach((tab) => {
    const isActive = tab.dataset.view === viewName;
    tab.classList.toggle("active", isActive);
    if (isActive) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });

  els.mobileNavigationButtons?.forEach((button) => {
    const isActive = button.dataset.mobileView === viewName;
    button.classList.toggle("active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  const isMoreView = !MOBILE_PRIMARY_VIEWS.has(viewName);
  els.mobileMoreButton?.classList.toggle("active", isMoreView);
  if (isMoreView) els.mobileMoreButton?.setAttribute("aria-current", "page");
  else els.mobileMoreButton?.removeAttribute("aria-current");
}

function switchView(viewName) {
  if (!document.querySelector(`#${viewName}View`)) return;
  const currentViewName = document.querySelector(".view.active")?.id?.replace(/View$/, "");
  if (currentViewName === "calendar" && viewName !== "calendar") {
    calendarDetailReturnState = null;
    els.calendarCurrentMonthLabel?.querySelector("[data-calendar-return-detail]")?.remove();
  }
  closeAdminMenu({ restoreFocus: false });
  syncNavigationState(viewName);
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelector(`#${viewName}View`).classList.add("active");
  els.adminMenuButton?.classList.toggle("active-admin-view", ["income", "recurring", "rules", "transactions"].includes(viewName));
  updateBoardMapTopButton();
  renderView(viewName);
}
