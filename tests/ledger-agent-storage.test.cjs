const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  const stored = new Map();
  const batches = [];
  const context = vm.createContext({ structuredClone, appSettings: {}, alert() {},
    console: { warn() {}, error() {} }, window: { BudgetNative: {
      read: async (key) => structuredClone(stored.get(key)),
      writeMany: async (entries) => { batches.push(entries); for (const { key, value } of entries) stored.set(key, structuredClone(value)); }
    } } });
  for (const file of ['src/data/constants.js', 'src/utils/storage.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  context.renderSaveStatus = () => {};
  return { c: context, stored, batches };
}

test('reviewed update cannot overwrite a writer queued before it', async () => {
  const { c, stored, batches } = setup();
  const original = [{ id: 'synthetic-a', amount: 120 }];
  stored.set('records', original);
  const competing = c.safeSaveMany([{ key: 'records', data: [{ id: 'synthetic-a', amount: 240 }] }]);
  const reviewed = c.safeSaveMany([{ key: 'records', data: [{ id: 'synthetic-a', amount: 360 }], expectedJson: JSON.stringify(original) }]);
  assert.equal(await competing, true);
  assert.equal(await reviewed, false);
  assert.equal(stored.get('records')[0].amount, 240);
  assert.equal(batches.length, 1);
});

test('a stale related value prevents every write in the reviewed batch', async () => {
  const { c, stored, batches } = setup();
  stored.set('records', [{ id: 'synthetic-a', amount: 120 }]);
  stored.set('reimbursements', { 'synthetic-a': 40 });
  const result = await c.safeSaveMany([
    { key: 'records', data: [{ id: 'synthetic-a', amount: 240 }], expectedJson: JSON.stringify(stored.get('records')) },
    { key: 'reimbursements', data: { 'synthetic-a': 80 }, expectedJson: JSON.stringify({ 'synthetic-a': 20 }) }
  ]);
  assert.equal(result, false);
  assert.equal(stored.get('records')[0].amount, 120);
  assert.equal(stored.get('reimbursements')['synthetic-a'], 40);
  assert.equal(batches.length, 0);
});

test('matching reviewed values retain last-good copies and ordinary saving stays compatible', async () => {
  const { c, stored } = setup();
  const original = [{ id: 'synthetic-a', amount: 120 }];
  stored.set('records', original);
  assert.equal(await c.safeSaveMany([{ key: 'records', data: [], expectedJson: JSON.stringify(original) }]), true);
  assert.deepEqual(stored.get('records:last-good'), original);
  assert.equal(await c.safeSaveMany([{ key: 'records', data: original }]), true);
  assert.equal(await c.safeSaveMany([{ key: 'new-value', data: {}, expectedJson: 'null' }]), true);
});
