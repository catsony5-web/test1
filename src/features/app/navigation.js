let adminMenuReturnFocus = null;
let selectedAdminTab = "screen";

function isAdminMenuOpen() {
  return Boolean(els.adminMenu && !els.adminMenu.hidden);
}

function adminMenuFocusableElements() {
  if (!els.adminMenu) return [];
  return Array.from(els.adminMenu.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hidden && element.getClientRects().length > 0);
}

function setAdminTab(tabName, { focus = false } = {}) {
  const tabs = Array.from(els.adminMenuTabs || []);
  const panels = Array.from(els.adminMenuPanels || []);
  if (!tabs.length || !panels.length) return;
  const nextTab = tabs.find((tab) => tab.dataset.adminTab === tabName) || tabs[0];
  selectedAdminTab = nextTab.dataset.adminTab;

  tabs.forEach((tab) => {
    const isSelected = tab === nextTab;
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  });
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.adminPanel !== selectedAdminTab;
  });
  if (focus) nextTab.focus();
}

function openAdminMenu({ returnFocus } = {}) {
  if (!els.adminMenuButton || !els.adminMenu || !els.adminMenuBackdrop) return;
  if (isAdminMenuOpen()) return;
  adminMenuReturnFocus = returnFocus
    || (document.activeElement instanceof HTMLElement ? document.activeElement : els.adminMenuButton);
  els.adminMenuBackdrop.hidden = false;
  els.adminMenu.hidden = false;
  els.adminMenuButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("admin-panel-open");
  setAdminTab(selectedAdminTab);
  requestAnimationFrame(() => {
    els.adminMenuBackdrop.classList.add("is-open");
    setAdminTab(selectedAdminTab, { focus: true });
  });
}

function closeAdminMenu({ restoreFocus = true } = {}) {
  if (!els.adminMenuButton || !els.adminMenu || !els.adminMenuBackdrop || !isAdminMenuOpen()) return;
  els.adminMenuBackdrop.classList.remove("is-open");
  els.adminMenuBackdrop.hidden = true;
  els.adminMenu.hidden = true;
  els.adminMenuButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("admin-panel-open");
  if (restoreFocus && adminMenuReturnFocus?.isConnected) adminMenuReturnFocus.focus();
  adminMenuReturnFocus = null;
}

function toggleAdminMenu(force, options = {}) {
  const shouldOpen = typeof force === "boolean" ? force : !isAdminMenuOpen();
  if (shouldOpen) openAdminMenu(options);
  else closeAdminMenu(options);
}

function trapAdminMenuFocus(event) {
  if (event.key !== "Tab" || !isAdminMenuOpen()) return;
  const focusable = adminMenuFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    els.adminMenu?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!els.adminMenu?.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function moveAdminTabFocus(event) {
  const tabs = Array.from(els.adminMenuTabs || []);
  const currentIndex = tabs.indexOf(event.currentTarget);
  if (currentIndex < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  setAdminTab(tabs[nextIndex].dataset.adminTab, { focus: true });
}

function setupAdminMenu() {
  if (!els.adminMenuButton || !els.adminMenu || !els.adminMenuBackdrop) return;
  if (els.adminMenuBackdrop.parentElement !== document.body) {
    document.body.append(els.adminMenuBackdrop);
  }
  setAdminTab("screen");

  els.adminMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleAdminMenu();
  });
  els.adminMenuCloseButton?.addEventListener("click", () => closeAdminMenu());
  els.adminMenuBackdrop.addEventListener("click", (event) => {
    if (event.target === els.adminMenuBackdrop) closeAdminMenu();
  });
  els.adminMenu.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-admin-view]");
    if (!viewButton) return;
    const viewName = viewButton.dataset.adminView;
    closeAdminMenu({ restoreFocus: false });
    switchView(viewName);
    document.querySelector(`#${viewName}View`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  els.adminMenuTabs?.forEach((tab) => {
    tab.addEventListener("click", () => setAdminTab(tab.dataset.adminTab));
    tab.addEventListener("keydown", moveAdminTabFocus);
  });

  document.addEventListener("click", (event) => {
    if (!isAdminMenuOpen()) return;
    if (els.adminMenu.contains(event.target) || els.adminMenuButton.contains(event.target)) return;
    closeAdminMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (!isAdminMenuOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeAdminMenu();
      return;
    }
    trapAdminMenuFocus(event);
  });
}

let mobileMoreCloseTimer = 0;
let mobileMoreReturnFocus = null;

function mobileMoreFocusableElements() {
  if (!els.mobileMoreDialog) return [];
  return Array.from(els.mobileMoreDialog.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hidden && element.getClientRects().length > 0);
}

function openMobileMore() {
  if (!els.mobileMoreBackdrop || !els.mobileMoreButton) return;
  window.clearTimeout(mobileMoreCloseTimer);
  closeAdminMenu();
  mobileMoreReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : els.mobileMoreButton;
  els.mobileMoreBackdrop.hidden = false;
  els.mobileMoreButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("mobile-menu-open");
  requestAnimationFrame(() => {
    els.mobileMoreBackdrop.classList.add("is-open");
    (mobileMoreFocusableElements()[0] || els.mobileMoreDialog)?.focus();
  });
}

function closeMobileMore({ restoreFocus = true, immediate = false } = {}) {
  if (!els.mobileMoreBackdrop || els.mobileMoreBackdrop.hidden) return;
  window.clearTimeout(mobileMoreCloseTimer);
  els.mobileMoreBackdrop.classList.remove("is-open");
  els.mobileMoreButton?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("mobile-menu-open");

  const finishClose = () => {
    els.mobileMoreBackdrop.hidden = true;
    if (restoreFocus) (mobileMoreReturnFocus || els.mobileMoreButton)?.focus();
    mobileMoreReturnFocus = null;
  };
  if (immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) finishClose();
  else mobileMoreCloseTimer = window.setTimeout(finishClose, 160);
}

function trapMobileMoreFocus(event) {
  if (event.key !== "Tab" || els.mobileMoreBackdrop?.hidden) return;
  const focusable = mobileMoreFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    els.mobileMoreDialog?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!els.mobileMoreDialog?.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setupMobileNavigation() {
  if (!els.mobileMoreButton || !els.mobileMoreBackdrop) return;

  els.mobileNavigationButtons?.forEach((button) => {
    button.addEventListener("click", () => {
      switchView(button.dataset.mobileView);
      closeMobileMore({ restoreFocus: false });
      document.querySelector(`#${button.dataset.mobileView}View`)?.scrollIntoView({ block: "start" });
    });
  });

  els.mobileMoreButton.addEventListener("click", openMobileMore);
  els.mobileMoreCloseButton?.addEventListener("click", () => closeMobileMore());
  els.mobileMoreBackdrop.addEventListener("click", (event) => {
    if (event.target === els.mobileMoreBackdrop) closeMobileMore();
  });
  els.mobileMoreDialog?.addEventListener("click", (event) => event.stopPropagation());
  els.mobileSettingsButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    closeMobileMore({ restoreFocus: false, immediate: true });
    toggleAdminMenu(true, { returnFocus: els.mobileMoreButton });
  });

  document.addEventListener("keydown", (event) => {
    if (els.mobileMoreBackdrop.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileMore();
      return;
    }
    trapMobileMoreFocus(event);
  });

  const desktopViewport = window.matchMedia("(min-width: 768px)");
  desktopViewport.addEventListener?.("change", (event) => {
    if (event.matches) closeMobileMore({ restoreFocus: false, immediate: true });
  });

  const activeViewName = document.querySelector(".view.active")?.id?.replace(/View$/, "") || "board";
  syncNavigationState(activeViewName);
}
