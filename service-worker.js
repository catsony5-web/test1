const CACHE_NAME = "monthly-card-budget-v147";
const APP_FILES = [
  "./",
  "./index.html",
  "./src/styles/00-tokens.css",
  "./src/styles/01-base.css",
  "./src/styles/02-layout.css",
  "./src/styles/03-components.css",
  "./src/styles/04-forms-tables.css",
  "./src/styles/05-charts.css",
  "./src/styles/06-features.css",
  "./src/styles/07-responsive.css",
  "./src/styles/08-themes.css",
  "./src/styles/09-production-ui.css",
  "./src/styles/10-analysis.css",
  "./assets/vendor/xlsx.full.min.js",
  "./assets/vendor/xlsx.LICENSE",
  "./assets/tabler/tabler-icons.min.css",
  "./assets/tabler/icons/adjustments.svg",
  "./assets/tabler/icons/adjustments-horizontal.svg",
  "./assets/tabler/icons/alert-circle.svg",
  "./assets/tabler/icons/arrows-exchange.svg",
  "./assets/tabler/icons/barbell.svg",
  "./assets/tabler/icons/bike.svg",
  "./assets/tabler/icons/bolt.svg",
  "./assets/tabler/icons/books.svg",
  "./assets/tabler/icons/brush.svg",
  "./assets/tabler/icons/bus.svg",
  "./assets/tabler/icons/bus-stop.svg",
  "./assets/tabler/icons/building-bank.svg",
  "./assets/tabler/icons/calendar.svg",
  "./assets/tabler/icons/calendar-month.svg",
  "./assets/tabler/icons/calendar-repeat.svg",
  "./assets/tabler/icons/cash.svg",
  "./assets/tabler/icons/cash-banknote.svg",
  "./assets/tabler/icons/cash-plus.svg",
  "./assets/tabler/icons/car.svg",
  "./assets/tabler/icons/category.svg",
  "./assets/tabler/icons/certificate.svg",
  "./assets/tabler/icons/chart-line.svg",
  "./assets/tabler/icons/chart-pie.svg",
  "./assets/tabler/icons/chevron-down.svg",
  "./assets/tabler/icons/chevron-left.svg",
  "./assets/tabler/icons/chevron-right.svg",
  "./assets/tabler/icons/coffee.svg",
  "./assets/tabler/icons/coin.svg",
  "./assets/tabler/icons/cookie.svg",
  "./assets/tabler/icons/database.svg",
  "./assets/tabler/icons/device-laptop.svg",
  "./assets/tabler/icons/device-mobile.svg",
  "./assets/tabler/icons/dots.svg",
  "./assets/tabler/icons/download.svg",
  "./assets/tabler/icons/file-export.svg",
  "./assets/tabler/icons/file-certificate.svg",
  "./assets/tabler/icons/file-plus.svg",
  "./assets/tabler/icons/file-spreadsheet.svg",
  "./assets/tabler/icons/filter-off.svg",
  "./assets/tabler/icons/flame.svg",
  "./assets/tabler/icons/gas-station.svg",
  "./assets/tabler/icons/gift.svg",
  "./assets/tabler/icons/gift-card.svg",
  "./assets/tabler/icons/help-circle.svg",
  "./assets/tabler/icons/history.svg",
  "./assets/tabler/icons/home-cog.svg",
  "./assets/tabler/icons/home-dollar.svg",
  "./assets/tabler/icons/layout-dashboard.svg",
  "./assets/tabler/icons/list-details.svg",
  "./assets/tabler/icons/medical-cross.svg",
  "./assets/tabler/icons/microphone-2.svg",
  "./assets/tabler/icons/movie.svg",
  "./assets/tabler/icons/notebook.svg",
  "./assets/tabler/icons/package.svg",
  "./assets/tabler/icons/palette.svg",
  "./assets/tabler/icons/pencil.svg",
  "./assets/tabler/icons/pencil-plus.svg",
  "./assets/tabler/icons/percentage.svg",
  "./assets/tabler/icons/pig-money.svg",
  "./assets/tabler/icons/plus.svg",
  "./assets/tabler/icons/puzzle.svg",
  "./assets/tabler/icons/receipt.svg",
  "./assets/tabler/icons/refresh.svg",
  "./assets/tabler/icons/repeat.svg",
  "./assets/tabler/icons/school.svg",
  "./assets/tabler/icons/scissors.svg",
  "./assets/tabler/icons/scooter.svg",
  "./assets/tabler/icons/settings.svg",
  "./assets/tabler/icons/shield-check.svg",
  "./assets/tabler/icons/shield-dollar.svg",
  "./assets/tabler/icons/shirt.svg",
  "./assets/tabler/icons/shopping-cart.svg",
  "./assets/tabler/icons/sparkles.svg",
  "./assets/tabler/icons/spray.svg",
  "./assets/tabler/icons/tool.svg",
  "./assets/tabler/icons/tools-kitchen-2.svg",
  "./assets/tabler/icons/train.svg",
  "./assets/tabler/icons/trash.svg",
  "./assets/tabler/icons/truck-delivery.svg",
  "./assets/tabler/icons/upload.svg",
  "./assets/tabler/icons/user.svg",
  "./assets/tabler/icons/users.svg",
  "./assets/tabler/icons/users-group.svg",
  "./assets/tabler/icons/wallet.svg",
  "./assets/tabler/icons/world-www.svg",
  "./assets/tabler/icons/x.svg",
  "./assets/tabler/LICENSE",
  "./data/ipo-calendar.json",
  "./src/data/constants.js",
  "./src/data/categories.js",
  "./src/data/rules.js",
  "./src/data/board-sections.js",
  "./src/data/field-aliases.js",
  "./src/features/app/state.js",
  "./src/utils/format.js",
  "./src/utils/date.js",
  "./src/utils/dom.js",
  "./src/utils/normalize.js",
  "./src/utils/grouping.js",
  "./src/utils/storage.js",
  "./src/utils/backup.js",
  "./src/components/chips.js",
  "./src/components/tables.js",
  "./src/components/metrics.js",
  "./src/components/charts.js",
  "./src/components/quick-add.js",
  "./src/features/import/excel-import.js",
  "./src/features/import/transaction-parser.js",
  "./src/features/classification/classifier.js",
  "./src/features/classification/smart-suggestions.js",
  "./src/features/classification/rules-manager.js",
  "./src/features/board/board-view.js",
  "./src/features/board/board-summary.js",
  "./src/features/board/board-cards.js",
  "./src/features/details/details-view.js",
  "./src/features/summary/comparison-analysis.js",
  "./src/features/summary/summary-view.js",
  "./src/features/summary/sector-analysis.js",
  "./src/features/summary/summary-chart.js",
  "./src/features/monthly/monthly-flow.js",
  "./src/features/monthly/monthly-chart.js",
  "./src/features/income/income-entry.js",
  "./src/features/income/income-bulk.js",
  "./src/features/income/income-list.js",
  "./src/features/recurring/recurring-view.js",
  "./src/features/calendar/calendar-view.js",
  "./src/features/analysis/analysis-core.js",
  "./src/features/analysis/monthly-analysis-view.js",
  "./src/features/analysis/spending-structure-view.js",
  "./src/features/products/products-view.js",
  "./src/features/ipo/ipo-view.js",
  "./src/features/unknown/unknown-view.js",
  "./src/features/transactions/transactions-view.js",
  "./src/features/app/navigation.js",
  "./src/features/app/appearance.js",
  "./src/features/app/render-all.js",
  "./src/features/app/init.js",
  "./manifest.webmanifest",
  "./app-icon.svg"
];

async function fetchAndCache(request, event) {
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
    );
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetchAndCache(event.request, event).catch(async () =>
        (await caches.match(event.request))
        || (await caches.match("./index.html"))
        || Response.error()
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetchAndCache(event.request, event).catch(async () =>
        (await caches.match(event.request, { ignoreSearch: true })) || Response.error()
      );
    })
  );
});
