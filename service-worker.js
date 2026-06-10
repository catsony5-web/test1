const CACHE_NAME = "monthly-card-budget-v105";
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
  "./src/features/products/products-view.js",
  "./src/features/ipo/ipo-view.js",
  "./src/features/unknown/unknown-view.js",
  "./src/features/transactions/transactions-view.js",
  "./src/features/app/navigation.js",
  "./src/features/app/appearance.js",
  "./src/features/app/render-all.js",
  "./src/features/app/init.js",
  "./manifest.webmanifest",
  "./app-icon.svg",
  "./data/ipo-calendar.json"
];

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

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
