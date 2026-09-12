const CACHE_PREFIX = "monthly-card-budget-";
const CACHE_NAME = `${CACHE_PREFIX}v183-storage-release`;
const APP_FILES = [
  "./",
  "./index.html",
  "./src/styles/00-tokens.css?v=169-corsa-themes",
  "./src/styles/01-base.css?v=151-loan-repayments",
  "./src/styles/02-layout.css?v=76",
  "./src/styles/03-components.css?v=140-long-term-trend",
  "./src/styles/04-forms-tables.css?v=83",
  "./src/styles/05-charts.css?v=176-recurring-review",
  "./src/styles/06-features.css?v=174-food-occasions",
  "./src/styles/07-responsive.css?v=176-recurring-review",
  "./src/styles/08-themes.css?v=169-corsa-themes",
  "./src/styles/09-production-ui.css?v=172-calendar-layout-r2",
  "./src/styles/10-analysis.css?v=175-monthly-close-r3",
  "./src/styles/11-summary-insights.css?v=174-food-occasions",
  "./src/styles/12-rosso-ink.css?v=169-corsa-themes",
  "./src/styles/13-goals.css?v=179-goal-tabs",
  "./src/styles/14-board-overview.css?v=178-board-overview",
  "./assets/vendor/xlsx.full.min.js?v=182-maintenance",
  "./assets/vendor/xlsx.LICENSE",
  "./assets/tabler/tabler-icons.min.css?v=135-subcategory-icons",
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
  "./src/data/constants.js?v=183-storage-release",
  "./src/data/categories.js?v=136-mineral-layers",
  "./src/data/rules.js?v=93",
  "./src/data/board-sections.js?v=151-loan-repayments",
  "./src/data/field-aliases.js?v=77",
  "./src/data/goal-resources.js?v=170-goal-planner-r3",
  "./src/features/goals/goals-core.js?v=170-goal-planner",
  "./src/features/app/state.js?v=176-recurring-review",
  "./src/utils/format.js?v=80",
  "./src/utils/date.js?v=141-garden-analysis",
  "./src/utils/dom.js?v=61",
  "./src/features/recurring/recurring-review-core.js?v=176-recurring-review",
  "./src/utils/food-occasion.js?v=174-food-occasions",
  "./src/utils/normalize.js?v=174-food-occasions",
  "./src/utils/grouping.js?v=156-loan-sharing",
  "./src/utils/storage.js?v=183-storage-release",
  "./src/utils/backup.js?v=182-maintenance",
  "./src/components/chips.js?v=174-food-occasions",
  "./src/components/tables.js?v=61",
  "./src/components/metrics.js?v=131-yearly",
  "./src/components/charts.js?v=61",
  "./src/components/quick-add.js?v=61",
  "./src/features/import/excel-import.js?v=183-storage-release",
  "./src/features/import/transaction-parser.js?v=77",
  "./src/features/classification/classifier.js?v=61",
  "./src/features/classification/smart-suggestions.js?v=173-food-calendar-r2",
  "./src/features/classification/rules-manager.js?v=61",
  "./src/features/board/board-view.js?v=178-board-overview",
  "./src/features/board/board-summary.js?v=156-loan-sharing",
  "./src/features/board/board-overview.js?v=178-board-overview",
  "./src/features/board/board-cards.js?v=156-loan-sharing",
  "./src/features/details/details-view.js?v=151-loan-repayments",
  "./src/features/summary/comparison-analysis.js?v=171-calendar-split-summary",
  "./src/features/summary/summary-priority.js?v=165-summary-insights-r2",
  "./src/features/summary/summary-food-core.js?v=174-food-occasions",
  "./src/features/summary/summary-food-view.js?v=174-food-occasions",
  "./src/features/summary/summary-pattern.js?v=173-food-calendar-r2",
  "./src/features/summary/summary-period.js?v=165-summary-insights-r2",
  "./src/features/summary/summary-view.js?v=171-calendar-split-summary",
  "./src/features/summary/sector-analysis.js?v=165-summary-insights-r2",
  "./src/features/summary/summary-chart.js?v=165-summary-insights-r2",
  "./src/features/monthly/monthly-flow.js?v=165-summary-insights-r2",
  "./src/features/monthly/monthly-chart.js?v=156-loan-sharing",
  "./src/features/income/income-entry.js?v=61",
  "./src/features/income/income-bulk.js?v=61",
  "./src/features/income/income-list.js?v=156-loan-sharing",
  "./src/features/recurring/recurring-view.js?v=177-storage-recovery",
  "./src/features/calendar/calendar-view.js?v=183-storage-release",
  "./src/features/analysis/analysis-core.js?v=156-loan-sharing",
  "./src/features/analysis/monthly-analysis-core.js?v=175-monthly-close-r2",
  "./src/features/analysis/monthly-analysis-view.js?v=175-monthly-close-r2",
  "./src/features/analysis/spending-structure-view.js?v=156-loan-sharing",
  "./src/features/products/products-view.js?v=62",
  "./src/features/ipo/ipo-view.js?v=183-storage-release",
  "./src/features/unknown/unknown-view.js?v=97",
  "./src/features/transactions/transactions-view.js?v=182-maintenance",
  "./src/features/goals/goals-view.js?v=179-goal-tabs",
  "./src/features/app/navigation.js?v=112",
  "./src/features/app/appearance.js?v=141-garden-analysis",
  "./src/features/app/render-all.js?v=183-storage-release",
  "./src/features/app/init.js?v=182-maintenance",
  "./manifest.webmanifest?v=146-professional-analysis",
  "./app-icon.svg"
];

const PUBLIC_PATHS = new Set(APP_FILES.map((file) => new URL(file, self.location.href).pathname));

async function matchAppCache(request, options) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request, options);
}

async function fetchAndCache(request, event) {
  const response = await fetch(request);
  if (response.ok && response.type !== "opaque" && !/\b(no-store|private)\b/i.test(response.headers.get("Cache-Control") || "")) {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
    );
  }
  return response;
}

async function fetchPublicSchedule(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(new Request(request, { cache: "no-store", signal: controller.signal }));
    if (!response.ok) throw new Error(`Public schedule HTTP ${response.status}`);
    const payload = await response.clone().json();
    if (!Array.isArray(payload?.items) || !payload.items.every((item) =>
      item && typeof item === "object" && !Array.isArray(item)
      && typeof item.sourceId === "string" && item.sourceId.trim()
      && typeof item.company === "string" && item.company.trim()
    )) throw new Error("Invalid public schedule");
    if (!/\b(no-store|private)\b/i.test(response.headers.get("Cache-Control") || "")) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put("./data/ipo-calendar.json", response.clone());
      } catch { /* Cache failure must not hide a successfully fetched schedule. */ }
    }
    return response;
  } catch {
    const cached = await matchAppCache("./data/ipo-calendar.json").catch(() => undefined);
    if (!cached) return Response.error();
    const headers = new Headers(cached.headers);
    headers.set("X-Budget-Schedule-Cache", "offline");
    return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        // An unavailable feed must not block app installation or cache a malformed snapshot.
        await cache.addAll(APP_FILES.filter((file) => file !== "./data/ipo-calendar.json"));
        await fetchPublicSchedule(new Request(new URL("./data/ipo-calendar.json", self.location.href)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  // Only public application files may enter this cache. Never intercept financial APIs.
  if (requestUrl.origin !== self.location.origin || event.request.headers.has("Authorization")) return;
  if (!PUBLIC_PATHS.has(requestUrl.pathname)) return;
  if (requestUrl.pathname.endsWith("/data/ipo-calendar.json")) {
    event.respondWith(fetchPublicSchedule(event.request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetchAndCache(event.request, event).catch(async () =>
        (await matchAppCache(event.request))
        || (await matchAppCache("./index.html"))
        || Response.error()
      )
    );
    return;
  }

  event.respondWith(
    matchAppCache(event.request).then((cached) => {
      if (cached) return cached;
      return fetchAndCache(event.request, event).catch(async () => {
        // A different query can name a newer release; never substitute an older asset.
        if (requestUrl.search) return Response.error();
        return (await matchAppCache(event.request, { ignoreSearch: true })) || Response.error();
      });
    })
  );
});
