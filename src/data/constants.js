const APP_VERSION = "v93";
const STORAGE_KEYS = {
  rules: "monthly-card-budget-rules-v1",
  monthlyIncome: "monthly-card-budget-income-v1",
  records: "monthly-card-budget-records-v1",
  importMeta: "monthly-card-budget-import-meta-v1",
  reimbursements: "monthly-card-budget-reimbursements-v1",
  products: "monthly-card-budget-products-v1",
  recurringExpenses: "monthly-card-budget-recurring-expenses-v1",
  settings: "monthly-card-budget-settings-v1",
  autoSnapshots: "monthly-card-budget-auto-snapshots-v1",
  migrations: "monthly-card-budget-migrations-v1",
  categoryMigration: "monthly-card-budget-category-migration-v2"
};
const LEGACY_STORAGE_KEYS = {
  monthlyIncome: ["monthly-card-budget-incomes-v1"],
  products: ["monthly-card-budget-consumables-v1"]
};
const LAST_GOOD_SUFFIX = ":last-good";
const MAX_AUTO_SNAPSHOTS = 12;
const STORAGE_KEY = STORAGE_KEYS.rules;
const INCOME_STORAGE_KEY = STORAGE_KEYS.monthlyIncome;
const RECORD_STORAGE_KEY = STORAGE_KEYS.records;
const IMPORT_META_STORAGE_KEY = STORAGE_KEYS.importMeta;
const REIMBURSEMENT_STORAGE_KEY = STORAGE_KEYS.reimbursements;
const PRODUCT_STORAGE_KEY = STORAGE_KEYS.products;
const RECURRING_STORAGE_KEY = STORAGE_KEYS.recurringExpenses;
const SETTINGS_STORAGE_KEY = STORAGE_KEYS.settings;
const AUTO_SNAPSHOT_STORAGE_KEY = STORAGE_KEYS.autoSnapshots;
const CATEGORY_MIGRATION_STORAGE_KEY = STORAGE_KEYS.categoryMigration;
const DB_NAME = "monthly-card-budget-private-db";
const DB_VERSION = 1;
const DB_STORE = "privateData";
