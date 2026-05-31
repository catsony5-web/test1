function setupAdminMenu() {
  if (!els.adminMenuButton || !els.adminMenu) return;

  els.adminMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleAdminMenu();
  });
  els.adminMenuCloseButton?.addEventListener("click", () => closeAdminMenu());

  els.adminMenu.addEventListener("click", (event) => event.stopPropagation());
  els.adminMenu.querySelectorAll("[data-admin-view]").forEach((button) => {
    button.addEventListener("click", () => {
      switchView(button.dataset.adminView);
      closeAdminMenu();
      document.querySelector(`#${button.dataset.adminView}View`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.addEventListener("click", closeAdminMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAdminMenu();
  });
}
