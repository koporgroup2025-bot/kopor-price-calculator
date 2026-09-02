// Verifies calculatePrice() against the 7 confirmed test cases.
// Run with: node test/test-price-calculator.js
const { calculatePrice } = require('../price-calculator.js');

const cases = [
  { name: 'หมึกอย่างเดียว 2 กระปุก', qtys: { squidQty: 2, mooQty: 0, kwabeeQty: 0 }, grand: 419 },
  { name: 'หมึกอย่างเดียว 3 กระปุก', qtys: { squidQty: 3, mooQty: 0, kwabeeQty: 0 }, grand: 597 },
  { name: 'cold อย่างเดียว 3 กระปุก', qtys: { squidQty: 0, mooQty: 3, kwabeeQty: 0 }, grand: 529 },
  { name: 'cold อย่างเดียว 5 กระปุก', qtys: { squidQty: 0, mooQty: 5, kwabeeQty: 0 }, grand: 739 },
  { name: 'คละ cold 2 + หมึก 1', qtys: { squidQty: 1, mooQty: 2, kwabeeQty: 0 }, grand: 579 },
  { name: 'คละ cold 4 + หมึก 1', qtys: { squidQty: 1, mooQty: 4, kwabeeQty: 0 }, grand: 789 },
  { name: 'คละ cold 6 + หมึก 3', qtys: { squidQty: 3, mooQty: 6, kwabeeQty: 0 }, grand: 1417 },
];

let failures = 0;
for (const c of cases) {
  const result = calculatePrice(c.qtys);
  const pass = result.grand === c.grand;
  if (!pass) failures++;
  console.log(
    `${pass ? 'PASS' : 'FAIL'} - ${c.name}: expected ${c.grand}, got ${result.grand}`
  );
  if (!pass) {
    console.log('  steps:', result.steps);
  }
}

if (failures > 0) {
  console.log(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll 7 test cases passed.');
}
