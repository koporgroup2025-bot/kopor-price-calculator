/**
 * KoPor price calculator — pure functions only, no DOM access.
 * Exported both as CommonJS (for tests) and as `window.PriceCalculator`
 * (for the browser UI), so the exact same code path is what gets tested
 * and what runs live.
 *
 * The step-text wording here is ported directly from the LINE OA bot's
 * PriceCalculator.gs (Bank-confirmed pricing, 2026-08-05) so the copy
 * button produces text matching what customers already see from the bot.
 * That includes calculateMixedPrice's chained .replace() calls, whose
 * later two replacements never actually match anything (the first
 * replace already consumes the substring they're looking for) - ported
 * as-is since that's the real, live bot behavior, not what the comments
 * in that file describe.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.PriceCalculator = mod;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function formatBaht(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  /**
   * หมึกกังฟูอย่างเดียว. Base promo unlocks at qty 3 (597 บาท, free
   * shipping); past that, units pair up into 369-บาท คู่ + a 199 leftover.
   */
  function calculateSquidPrice(qty) {
    if (!qty || qty <= 0) {
      return { total: 0, shipping: 0, grand: 0, steps: [] };
    }
    if (qty === 1) {
      return { total: 199, shipping: 50, grand: 249, steps: ['หมึกกังฟู 1 กระปุก = ' + formatBaht(199) + ' บาท'] };
    }
    if (qty === 2) {
      return { total: 369, shipping: 50, grand: 419, steps: ['โปรหมึกกังฟู 2 กระปุก = ' + formatBaht(369) + ' บาท (ปกติ 398 บาท)'] };
    }
    if (qty === 3) {
      return { total: 597, shipping: 0, grand: 597, steps: ['โปรฐานหมึกกังฟู 3 กระปุก = ' + formatBaht(597) + ' บาท (ปลดล็อกส่งฟรี)'] };
    }

    const R = qty - 3;
    const pairs = Math.floor(R / 2);
    const rem = R % 2;
    const steps = ['โปรฐานหมึกกังฟู 3 กระปุก = ' + formatBaht(597) + ' บาท (ปลดล็อกส่งฟรี)'];
    if (pairs > 0) {
      steps.push('เพิ่มอีก ' + pairs + ' คู่ (คู่ละ 2 กระปุก) = ' + formatBaht(pairs * 369) + ' บาท');
    }
    if (rem > 0) {
      steps.push('เพิ่มอีก ' + rem + ' กระปุกเดี่ยว = ' + formatBaht(rem * 199) + ' บาท');
    }
    const total = 597 + pairs * 369 + rem * 199;
    return { total, shipping: 0, grand: total, steps };
  }

  /**
   * หมู/แตงกวา รวมกัน (คละกันเองได้อิสระ). Base promo unlocks at qty 5
   * (739 บาท, free shipping); past that, units group into 3-กระปุก ชุด
   * (379 บาท) + a leftover at 149/กระปุก.
   */
  function calculateColdPrice(qty) {
    if (!qty || qty <= 0) {
      return { total: 0, shipping: 0, grand: 0, steps: [] };
    }
    if (qty === 1) {
      return { total: 149, shipping: 150, grand: 299, steps: ['หมู/แตงกวา 1 กระปุก = ' + formatBaht(149) + ' บาท'] };
    }
    if (qty === 2) {
      return { total: 298, shipping: 150, grand: 448, steps: ['หมู/แตงกวา 2 กระปุก = ' + formatBaht(298) + ' บาท'] };
    }
    if (qty === 3) {
      return { total: 379, shipping: 150, grand: 529, steps: ['โปรหมู/แตงกวา 3 กระปุก = ' + formatBaht(379) + ' บาท (ปกติ 447 บาท)'] };
    }
    if (qty === 4) {
      return { total: 596, shipping: 150, grand: 746, steps: ['หมู/แตงกวา 4 กระปุก = ' + formatBaht(596) + ' บาท'] };
    }
    if (qty === 5) {
      return { total: 739, shipping: 0, grand: 739, steps: ['โปรฐานหมู/แตงกวา 5 กระปุก = ' + formatBaht(739) + ' บาท (ปลดล็อกส่งฟรี)'] };
    }

    const R = qty - 5;
    const sets = Math.floor(R / 3);
    const rem = R % 3;
    const steps = ['โปรฐานหมู/แตงกวา 5 กระปุก = ' + formatBaht(739) + ' บาท (ปลดล็อกส่งฟรี)'];
    if (sets > 0) {
      steps.push('เพิ่มอีก ' + sets + ' ชุด (ชุดละ 3 กระปุก) = ' + formatBaht(sets * 379) + ' บาท');
    }
    if (rem > 0) {
      steps.push('เพิ่มอีก ' + rem + ' กระปุกเดี่ยว = ' + formatBaht(rem * 149) + ' บาท');
    }
    const total = 739 + sets * 379 + rem * 149;
    return { total, shipping: 0, grand: total, steps };
  }

  /**
   * คละ (มีทั้งหมึกและ cold ในออเดอร์เดียว): combined qty drives the cold
   * price table (ships in one chilled box regardless), then squid adds a
   * +50/กระปุก surcharge (199-149 price difference).
   */
  function calculateMixedPrice(coldQty, squidQty) {
    coldQty = coldQty || 0;
    squidQty = squidQty || 0;

    const total = coldQty + squidQty;
    const base = calculateColdPrice(total);

    const steps = base.steps.map((s) =>
      s.replace('หมู/แตงกวา', 'สินค้ารวม').replace('โปรฐานหมู/แตงกวา', 'โปรฐานคละสินค้า').replace('โปรหมู/แตงกวา', 'โปรคละสินค้า')
    );

    if (squidQty > 0) {
      steps.push('หมึกกังฟู ' + squidQty + ' กระปุก (รวมในชุดคละ) = ' + formatBaht(squidQty * 50) + ' บาท (คิดกระปุกละ 50 บาทเมื่อคละกับหมู/แตงกวา)');
    }

    const grand = base.total + squidQty * 50 + base.shipping;
    return { total: base.total + squidQty * 50, shipping: base.shipping, grand, steps };
  }

  /**
   * @param {number} coldQty จำนวนกระปุกหมู/แตงกวารวมกัน (0 ได้ถ้าไม่มี)
   * @param {number} squidQty จำนวนกระปุกหมึก (0 ได้ถ้าไม่มี)
   */
  function calculateOrderPrice(coldQty, squidQty) {
    coldQty = coldQty || 0;
    squidQty = squidQty || 0;

    if (coldQty === 0 && squidQty === 0) {
      return { total: 0, shipping: 0, grand: 0, steps: [] };
    }
    if (coldQty === 0) {
      return calculateSquidPrice(squidQty);
    }
    if (squidQty === 0) {
      return calculateColdPrice(coldQty);
    }
    return calculateMixedPrice(coldQty, squidQty);
  }

  /**
   * Adapts calculateOrderPrice to the app's product names.
   * @param {{squidQty:number, mooQty:number, kwabeeQty:number}} qtys
   * @returns {{steps:string[], shipping:number, grand:number}}
   */
  function calculatePrice(qtys) {
    const squidQty = Math.max(0, Math.floor(qtys.squidQty || 0));
    const mooQty = Math.max(0, Math.floor(qtys.mooQty || 0));
    const kwabeeQty = Math.max(0, Math.floor(qtys.kwabeeQty || 0));
    const coldQty = mooQty + kwabeeQty;

    const r = calculateOrderPrice(coldQty, squidQty);
    return { steps: r.steps, shipping: r.shipping, grand: r.grand };
  }

  return {
    calculateSquidPrice,
    calculateColdPrice,
    calculateMixedPrice,
    calculateOrderPrice,
    calculatePrice,
    formatBaht,
  };
});
