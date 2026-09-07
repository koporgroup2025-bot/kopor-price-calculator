/**
 * KoPor price calculator — pure functions only, no DOM access.
 * Exported both as CommonJS (for tests) and as `window.PriceCalculator`
 * (for the browser UI), so the exact same code path is what gets tested
 * and what runs live.
 *
 * Pricing model (confirmed with Bank/owner across several sessions,
 * latest revision 2026-09-06):
 *
 * Both products ("squid" = หมึกกังฟู, "cold" = หมู/แตงกวา combined) unlock
 * free shipping at a base quantity (squid: 3, cold: 5). Past the base,
 * extra units group into discounted "blocks" — pairs/sets at their usual
 * promo rate, PLUS a "repeat-base" block (another whole base-sized batch,
 * priced at the base rate minus the shipping value already earned once)
 * — and bestBlockCombo() finds whichever combination of blocks + leftover
 * singles is cheapest for any given excess quantity, instead of a fixed
 * "divide by one number" rule. This matters once orders get large enough
 * that a repeat-base block beats plain pairs/sets (confirmed cases:
 * squid6→1144, squid9→1691, cold10→1322).
 *
 * Mixed orders (both products in one order) are priced by computing three
 * independently-justified candidates and keeping whichever is cheapest:
 *   A) merged — combined qty drives the cold table, squid units surcharge
 *      +50/กระปุก each (199-149 price difference). Original formula.
 *   B) borrow-then-excess — only valid when coldQty ≤ 5 and the combined
 *      total ≥ 5 (i.e. cold alone can't reach its own base, and hasn't
 *      overshot it either): pay the 739 base once, surcharge only the
 *      squid units actually needed to complete it, then price any
 *      leftover *pure* squid excess via squid's own block table.
 *   C) separate — each product prices independently off its own table,
 *      sharing one shipping charge.
 * Candidate B only applies in the narrow "cold hasn't formed its own
 * excess" window; outside it, A and C alone already reproduce every
 * confirmed value (this is what stops "excess squid gets its own promo"
 * from wrongly discounting cold6+squid3, where cold itself already has
 * excess — verified against every anchor below).
 *
 * Confirmed anchors this must reproduce exactly:
 *   squid2→419, squid3→597, cold3→529, cold5→739 (original Bank set)
 *   cold2+squid1→579, cold4+squid1→789, cold6+squid3→1417 (Bank-confirmed)
 *   squid2+kwabee1→629, squid3+moo2+kwabee4→1417 (real LINE OA transcripts)
 *   cold3+squid1→728 (candidate C wins — linear zone, no promo to protect)
 *   cold3+squid2→839 (candidate A/B tie — promo zone, protects the base)
 *   cold2+squid5→1258 (candidate B wins — pure squid excess earns its own pair discount)
 *   squid6→1144, squid9→1691, cold10→1322 (repeat-base blocks beat plain pairs/sets)
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

  // Repeat-base block value = base price − the shipping value already
  // earned once (squid base 597 unlocks 50-baht shipping; cold base 739
  // unlocks 150-baht shipping AND already includes a 6-baht product
  // discount vs linear 5×149=745, so a repeat block gives up both: 745-156=589...
  // confirmed by Bank as 739-156=583, i.e. the repeat also forgoes the
  // small product discount, not just the shipping value).
  const SQUID_BLOCKS = [
    { size: 3, value: 547, label: 'ชุด (ชุดละ 3 กระปุก)' }, // repeat-base block: 597-50
    { size: 2, value: 369, label: 'คู่ (คู่ละ 2 กระปุก)' },
  ];
  const COLD_BLOCKS = [
    { size: 5, value: 583, label: 'ชุดฐาน (ชุดละ 5 กระปุก)' }, // repeat-base block: 739-156
    { size: 3, value: 379, label: 'ชุด (ชุดละ 3 กระปุก)' },
  ];

  /**
   * Finds the cheapest way to price R extra units given a set of
   * repeatable discount blocks, with any uncovered remainder priced at
   * unitPrice each. Plain DP (R is always a small realistic order size),
   * so mixed combinations (e.g. 1 pair + 1 triple for R=5) are found
   * correctly, not just "divide by a single block size".
   * @return {{cost:number, counts:Object<number,number>, units:number}}
   */
  function bestBlockCombo(R, blocks, unitPrice) {
    const dp = new Array(R + 1);
    dp[0] = { cost: 0, from: null };
    for (let i = 1; i <= R; i++) {
      let best = { cost: dp[i - 1].cost + unitPrice, from: 'unit' };
      for (const b of blocks) {
        if (i >= b.size) {
          const cost = dp[i - b.size].cost + b.value;
          if (cost < best.cost) best = { cost, from: b.size };
        }
      }
      dp[i] = best;
    }
    const counts = {};
    let units = 0;
    let i = R;
    while (i > 0) {
      const step = dp[i].from;
      if (step === 'unit') {
        units += 1;
        i -= 1;
      } else {
        counts[step] = (counts[step] || 0) + 1;
        i -= step;
      }
    }
    return { cost: dp[R].cost, counts, units };
  }

  /** Renders a bestBlockCombo() result into step lines, biggest block first. */
  function blockStepLines(combo, blocksInDisplayOrder, unitPrice) {
    const lines = [];
    blocksInDisplayOrder.forEach((b) => {
      const n = combo.counts[b.size] || 0;
      if (n > 0) lines.push('เพิ่มอีก ' + n + ' ' + b.label + ' = ' + formatBaht(n * b.value) + ' บาท');
    });
    if (combo.units > 0) {
      lines.push('เพิ่มอีก ' + combo.units + ' กระปุกเดี่ยว = ' + formatBaht(combo.units * unitPrice) + ' บาท');
    }
    return lines;
  }

  /**
   * หมึกกังฟูอย่างเดียว. Base promo unlocks at qty 3 (597 บาท, free
   * shipping); past that, the cheapest combination of pairs (369/2 units)
   * and repeat-base blocks (547/3 units) is used, with any leftover
   * single at 199.
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
    const combo = bestBlockCombo(R, SQUID_BLOCKS, 199);
    const steps = ['โปรฐานหมึกกังฟู 3 กระปุก = ' + formatBaht(597) + ' บาท (ปลดล็อกส่งฟรี)'].concat(
      blockStepLines(combo, SQUID_BLOCKS, 199)
    );
    const total = 597 + combo.cost;
    return { total, shipping: 0, grand: total, steps };
  }

  /**
   * หมู/แตงกวา รวมกัน (คละกันเองได้อิสระ). Base promo unlocks at qty 5
   * (739 บาท, free shipping); past that, the cheapest combination of sets
   * (379/3 units) and repeat-base blocks (583/5 units) is used, with any
   * leftover single(s) at 149.
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
    const combo = bestBlockCombo(R, COLD_BLOCKS, 149);
    const steps = ['โปรฐานหมู/แตงกวา 5 กระปุก = ' + formatBaht(739) + ' บาท (ปลดล็อกส่งฟรี)'].concat(
      blockStepLines(combo, COLD_BLOCKS, 149)
    );
    const total = 739 + combo.cost;
    return { total, shipping: 0, grand: total, steps };
  }

  /**
   * คละ (มีทั้งหมึกและ cold ในออเดอร์เดียว): computes three independently
   * justified candidates and returns whichever is cheapest — see the
   * file-level comment above for the full reasoning and the confirmed
   * anchor values this must reproduce.
   */
  function calculateMixedPrice(coldQty, squidQty) {
    coldQty = coldQty || 0;
    squidQty = squidQty || 0;
    const total = coldQty + squidQty;
    const base = calculateColdPrice(total);

    // Candidate A: merged — combined qty into the cold table, flat +50/กระปุก squid surcharge.
    const mergedSteps = base.steps.map((s) =>
      s.replace('หมู/แตงกวา', 'สินค้ารวม').replace('โปรฐานหมู/แตงกวา', 'โปรฐานคละสินค้า').replace('โปรหมู/แตงกวา', 'โปรคละสินค้า')
    );
    if (squidQty > 0) {
      mergedSteps.push('หมึกกังฟู ' + squidQty + ' กระปุก (รวมในชุดคละ) = ' + formatBaht(squidQty * 50) + ' บาท (คิดกระปุกละ 50 บาทเมื่อคละกับหมู/แตงกวา)');
    }
    const candidateA = {
      total: base.total + squidQty * 50,
      shipping: base.shipping,
      grand: base.total + squidQty * 50 + base.shipping,
      steps: mergedSteps,
    };

    const candidates = [candidateA];

    // Candidate C: separate — each product prices off its own table, one
    // shared shipping charge. Only allowed when the combined total earns
    // NO real discount from the cold table at all (isPromoZone false) —
    // otherwise it would bypass the genuine combo tier the customer only
    // gets by reaching that *combined* qty (e.g. the base-5 free-ship
    // tier), which is exactly the bug this replaced (cold3+squid2 would
    // wrongly drop to 748 instead of the correct 839 if C were allowed
    // to compete here).
    const isPromoZone = base.total !== total * 149;
    if (!isPromoZone) {
      const coldPart = calculateColdPrice(coldQty);
      const squidPart = calculateSquidPrice(squidQty);
      candidates.push({
        total: coldPart.total + squidPart.total,
        shipping: base.shipping,
        grand: coldPart.total + squidPart.total + base.shipping,
        steps: coldPart.steps.concat(squidPart.steps),
      });
    }

    // Candidate B: borrow-then-excess — only when cold hasn't already
    // formed its own excess (coldQty ≤ 5) and the order reaches the
    // shared base (total ≥ 5) at all. Unlike C, B always keeps the 739
    // base intact, so it can never undercut the protected combo tier.
    if (coldQty <= 5 && total >= 5) {
      const borrowed = Math.min(squidQty, 5 - coldQty);
      const excessSquid = squidQty - borrowed;
      const excessCombo = excessSquid > 0 ? bestBlockCombo(excessSquid, SQUID_BLOCKS, 199) : { cost: 0, counts: {}, units: 0 };
      const steps = ['โปรฐานคละสินค้า 5 กระปุก = ' + formatBaht(739) + ' บาท (ปลดล็อกส่งฟรี)'];
      if (borrowed > 0) {
        steps.push('หมึกกังฟู ' + borrowed + ' กระปุก (ใช้เติมฐาน) = ' + formatBaht(borrowed * 50) + ' บาท (คิดกระปุกละ 50 บาทเมื่อคละกับหมู/แตงกวา)');
      }
      if (excessSquid > 0) {
        blockStepLines(excessCombo, SQUID_BLOCKS, 199).forEach((s) => steps.push('หมึกกังฟูส่วนเกิน: ' + s));
      }
      const bTotal = 739 + borrowed * 50 + excessCombo.cost;
      candidates.push({ total: bTotal, shipping: 0, grand: bTotal, steps });
    }

    let bestCandidate = candidates[0];
    for (const c of candidates) {
      if (c.grand < bestCandidate.grand) bestCandidate = c;
    }
    return bestCandidate;
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
