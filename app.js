/**
 * UI glue: reads the qty inputs, calls PriceCalculator.calculatePrice
 * (price-calculator.js), and renders the result. All money math lives
 * in price-calculator.js — nothing here computes a price.
 */
(function () {
  'use strict';

  // Soft access gate: keeps casual passersby out, NOT real security —
  // this is a static site, so anyone determined to look can read this
  // value straight out of the page source. Deliberately synchronous and
  // dependency-free (no Web Crypto) so it can't silently fail in
  // restrictive in-app browsers (LINE, Messenger, etc.) that block APIs
  // like crypto.subtle without raising a visible error.
  const UNLOCK_KEY = 'kopor.unlocked';
  const PASSCODE = 'kpspl2025';

  const lockScreen = document.getElementById('lockScreen');
  const appContent = document.getElementById('appContent');
  const lockForm = document.getElementById('lockForm');
  const passcodeInput = document.getElementById('passcodeInput');
  const lockError = document.getElementById('lockError');
  const lockAgainBtn = document.getElementById('lockAgainBtn');

  function showApp() {
    lockScreen.hidden = true;
    appContent.hidden = false;
  }

  function showLock() {
    lockScreen.hidden = false;
    appContent.hidden = true;
    passcodeInput.value = '';
    passcodeInput.focus();
  }

  lockForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (passcodeInput.value === PASSCODE) {
      localStorage.setItem(UNLOCK_KEY, 'true');
      lockError.hidden = true;
      showApp();
    } else {
      lockError.hidden = false;
      passcodeInput.value = '';
      passcodeInput.focus();
    }
  });

  lockAgainBtn.addEventListener('click', () => {
    localStorage.removeItem(UNLOCK_KEY);
    showLock();
  });

  if (localStorage.getItem(UNLOCK_KEY) === 'true') {
    showApp();
  }

  const PAYMENT_INFO_KEY = 'kopor.paymentInfo';
  const DEFAULT_PAYMENT_INFO =
    'สามารถโอนได้ที่บัญชี\n' +
    '414-224975-0\n' +
    'ธนาคารไทยพาณิชย์ SCB\n' +
    'ศุภกร นิธิวรนันท์';

  const PRODUCT_LABELS = {
    squidQty: 'หมึกกังฟู',
    mooQty: 'หมูหมัดฮุค',
    kwabeeQty: 'กวาบี่กวาบอง',
  };

  const inputs = {
    squidQty: document.getElementById('squidQty'),
    mooQty: document.getElementById('mooQty'),
    kwabeeQty: document.getElementById('kwabeeQty'),
  };
  const emptyState = document.getElementById('emptyState');
  const resultBody = document.getElementById('resultBody');
  const stepsList = document.getElementById('stepsList');
  const shippingText = document.getElementById('shippingText');
  const grandAmount = document.getElementById('grandAmount');
  const copyBtn = document.getElementById('copyBtn');
  const resetBtn = document.getElementById('resetBtn');
  const paymentInfo = document.getElementById('paymentInfo');

  let lastSummaryText = '';
  let copyResetTimer = null;

  function getQty(id) {
    const n = parseInt(inputs[id].value, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function readQtys() {
    return {
      squidQty: getQty('squidQty'),
      mooQty: getQty('mooQty'),
      kwabeeQty: getQty('kwabeeQty'),
    };
  }

  function fmt(n) {
    return n.toLocaleString('en-US');
  }

  function buildSummaryText(qtys, result) {
    const lines = ['สรุปรายการค่ะ 🧾'];
    for (const key of ['squidQty', 'mooQty', 'kwabeeQty']) {
      if (qtys[key] > 0) {
        lines.push(`- ${PRODUCT_LABELS[key]} x${qtys[key]}`);
      }
    }
    lines.push('');
    lines.push('รายละเอียดราคา:');
    for (const step of result.steps) {
      lines.push(`- ${step}`);
    }
    const shippingLine =
      result.shipping === 0
        ? 'ค่าจัดส่ง = ฟรี 🎉'
        : `ค่าจัดส่ง = ${fmt(result.shipping)} บาท`;
    lines.push(`- ${shippingLine}`);
    lines.push('');
    lines.push(`ยอดชำระทั้งหมด: ${fmt(result.grand)} บาท`);
    lines.push('');
    lines.push(paymentInfo.value.trim());
    lines.push('');
    lines.push('โอนแล้วส่งรูปสลิปกลับมาในแชทนี้ได้เลยนะคะ 🙏');
    return lines.join('\n');
  }

  function render() {
    const qtys = readQtys();
    const result = window.PriceCalculator.calculatePrice(qtys);
    const hasOrder = qtys.squidQty + qtys.mooQty + qtys.kwabeeQty > 0;

    if (!hasOrder) {
      emptyState.hidden = false;
      resultBody.hidden = true;
      lastSummaryText = '';
      return;
    }

    emptyState.hidden = true;
    resultBody.hidden = false;

    stepsList.innerHTML = '';
    for (const step of result.steps) {
      const li = document.createElement('li');
      li.textContent = step;
      stepsList.appendChild(li);
    }

    if (result.shipping === 0) {
      shippingText.textContent = 'ฟรี 🎉';
      shippingText.classList.add('free');
    } else {
      shippingText.textContent = `${fmt(result.shipping)} บาท`;
      shippingText.classList.remove('free');
    }

    grandAmount.textContent = fmt(result.grand);
    lastSummaryText = buildSummaryText(qtys, result);
  }

  function clampInput(el) {
    let n = parseInt(el.value, 10);
    if (!Number.isFinite(n) || n < 0) n = 0;
    el.value = n;
  }

  Object.values(inputs).forEach((el) => {
    el.addEventListener('input', () => {
      render();
    });
    el.addEventListener('blur', () => {
      clampInput(el);
      render();
    });
  });

  document.querySelectorAll('.step-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = inputs[btn.dataset.target];
      const current = getQty(btn.dataset.target);
      const delta = btn.dataset.action === 'inc' ? 1 : -1;
      target.value = Math.max(0, current + delta);
      render();
    });
  });

  resetBtn.addEventListener('click', () => {
    Object.values(inputs).forEach((el) => {
      el.value = 0;
    });
    render();
  });

  copyBtn.addEventListener('click', async () => {
    if (!lastSummaryText) return;
    try {
      await navigator.clipboard.writeText(lastSummaryText);
    } catch (err) {
      // Fallback for browsers/contexts without Clipboard API permission
      const textarea = document.createElement('textarea');
      textarea.value = lastSummaryText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    copyBtn.textContent = 'ก้อปแล้ว ✓';
    copyBtn.classList.add('copied');
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copyBtn.textContent = 'คัดลอกข้อความสรุป';
      copyBtn.classList.remove('copied');
    }, 1800);
  });

  // Payment info: load from localStorage, save on every edit.
  paymentInfo.value = localStorage.getItem(PAYMENT_INFO_KEY) || DEFAULT_PAYMENT_INFO;
  paymentInfo.addEventListener('input', () => {
    localStorage.setItem(PAYMENT_INFO_KEY, paymentInfo.value);
    render();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }

  render();
})();
