/**
 * KoPor price calculator — pure functions only, no DOM access.
 * Exported both as CommonJS (for tests) and as `window.PriceCalculator`
 * (for the browser UI), so the exact same code path is what gets tested
 * and what runs live.
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

  function fmt(n) {
    return n.toLocaleString('en-US');
  }

  /**
   * หมึกกังฟูอย่างเดียว (squid-only pricing table).
   * Base promo unlocks at qty 3 (= 597 บาท, free shipping).
   * Every unit past that is priced by pairing into 369-บาท คู่ + a 199 leftover.
   */
  function calcSquidOnly(qty) {
    const steps = [];
    if (qty <= 0) return { total: 0, shipping: 0, steps };

    if (qty === 1) {
      steps.push(`หมึกกังฟู 1 กระปุก = ${fmt(199)} บาท`);
      return { total: 199, shipping: 50, steps };
    }
    if (qty === 2) {
      steps.push(`หมึกกังฟู 2 กระปุก = ${fmt(369)} บาท (ราคาปกติ ${fmt(398)} บาท)`);
      return { total: 369, shipping: 50, steps };
    }

    // qty >= 3: base promo (3 กระปุก = 597, free shipping) then pair up the rest
    steps.push(`โปรฐานหมึก 3 กระปุก = ${fmt(597)} บาท (ปลดล็อกส่งฟรี)`);
    let total = 597;
    const remainder = qty - 3;
    const pairs = Math.floor(remainder / 2);
    const rem = remainder % 2;
    if (pairs > 0) {
      const pairsTotal = pairs * 369;
      steps.push(`หมึกส่วนเกิน ${pairs} คู่ x ${fmt(369)} บาท = ${fmt(pairsTotal)} บาท`);
      total += pairsTotal;
    }
    if (rem > 0) {
      const remTotal = rem * 199;
      steps.push(`หมึกส่วนเกิน ${rem} กระปุก x ${fmt(199)} บาท = ${fmt(remTotal)} บาท`);
      total += remTotal;
    }
    return { total, shipping: 0, steps };
  }

  /**
   * หมูหมัดฮุค + กวาบี่กวาบอง รวมกัน (cold-chain pricing table; both items
   * share one price table because they ship in the same chilled box).
   * Base promo unlocks at qty 5 (= 739 บาท, free shipping). Past that,
   * units are grouped into 3-กระปุก ชุด (379 บาท) + a leftover at 149/กระปุก.
   *
   * `label` lets the mixed-order calculation reuse this table (where the
   * qty passed in is cold+squid combined) while phrasing the steps clearly.
   */
  function calcColdOnly(qty, label) {
    label = label || 'หมู/แตงกวา';
    const steps = [];
    if (qty <= 0) return { total: 0, shipping: 0, steps };

    if (qty === 1) {
      steps.push(`${label} 1 กระปุก = ${fmt(149)} บาท`);
      return { total: 149, shipping: 150, steps };
    }
    if (qty === 2) {
      steps.push(`${label} 2 กระปุก = ${fmt(298)} บาท`);
      return { total: 298, shipping: 150, steps };
    }
    if (qty === 3) {
      steps.push(`${label} 3 กระปุก = ${fmt(379)} บาท (ราคาปกติ ${fmt(447)} บาท)`);
      return { total: 379, shipping: 150, steps };
    }
    if (qty === 4) {
      steps.push(`${label} 4 กระปุก = ${fmt(596)} บาท`);
      return { total: 596, shipping: 150, steps };
    }

    // qty >= 5: base promo (5 กระปุก = 739, free shipping) then group the rest into sets of 3
    steps.push(`โปรฐาน${label} 5 กระปุก = ${fmt(739)} บาท (ปลดล็อกส่งฟรี)`);
    let total = 739;
    const remainder = qty - 5;
    const sets = Math.floor(remainder / 3);
    const rem = remainder % 3;
    if (sets > 0) {
      const setsTotal = sets * 379;
      steps.push(`${label} ส่วนเกิน ${sets} ชุด (ชุดละ 3 กระปุก) x ${fmt(379)} บาท = ${fmt(setsTotal)} บาท`);
      total += setsTotal;
    }
    if (rem > 0) {
      const remTotal = rem * 149;
      steps.push(`${label} ส่วนเกิน ${rem} กระปุก x ${fmt(149)} บาท = ${fmt(remTotal)} บาท`);
      total += remTotal;
    }
    return { total, shipping: 0, steps };
  }

  /**
   * Full order calculation for the three real products.
   * @param {{squidQty:number, mooQty:number, kwabeeQty:number}} qtys
   * @returns {{steps:string[], shipping:number, grand:number}}
   */
  function calculatePrice(qtys) {
    const squidQty = Math.max(0, Math.floor(qtys.squidQty || 0));
    const mooQty = Math.max(0, Math.floor(qtys.mooQty || 0));
    const kwabeeQty = Math.max(0, Math.floor(qtys.kwabeeQty || 0));
    const coldQty = mooQty + kwabeeQty;

    if (squidQty === 0 && coldQty === 0) {
      return { steps: [], shipping: 0, grand: 0 };
    }

    if (coldQty === 0) {
      const r = calcSquidOnly(squidQty);
      return { steps: r.steps, shipping: r.shipping, grand: r.total + r.shipping };
    }

    if (squidQty === 0) {
      const r = calcColdOnly(coldQty, 'หมู/แตงกวา');
      return { steps: r.steps, shipping: r.shipping, grand: r.total + r.shipping };
    }

    // Mixed order: cold + squid ship together in one chilled box, so the
    // combined qty drives the base price table; squid adds a +50/กระปุก
    // surcharge on top (199-149 price difference) since it's riding along
    // in a box it doesn't normally need.
    const combinedQty = coldQty + squidQty;
    const base = calcColdOnly(combinedQty, `แพ็กแช่เย็นรวม (แช่เย็น ${coldQty} + หมึกคละ ${squidQty})`);
    const squidSurcharge = squidQty * 50;
    const steps = base.steps.slice();
    steps.push(`หมึกคละแช่เย็น ${squidQty} กระปุก ส่วนต่างกระปุกละ ${fmt(50)} บาท = ${fmt(squidSurcharge)} บาท`);
    const grand = base.total + squidSurcharge + base.shipping;
    return { steps, shipping: base.shipping, grand };
  }

  return {
    calcSquidOnly,
    calcColdOnly,
    calculatePrice,
  };
});
