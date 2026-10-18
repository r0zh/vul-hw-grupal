// Small DOM helpers used by spec files. Each takes the CDP page object.
export const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;

export async function setRange(page, sel, value) {
  await page.evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    el.value = ${JSON.stringify(String(value))};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value;
  })()`);
}

export async function setSelect(page, sel, value) {
  await page.evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    el.value = ${JSON.stringify(String(value))};
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })()`);
}

export async function setCheck(page, sel, checked) {
  await page.evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (el.checked !== ${checked}) { el.checked = ${checked}; el.dispatchEvent(new Event('change', { bubbles: true })); }
    return el.checked;
  })()`);
}

export const dataOf = (page, sel, key) =>
  page.evalJs(`document.querySelector(${JSON.stringify(sel)}).dataset[${JSON.stringify(key)}]`);

export const textOf = (page, sel) =>
  page.evalJs(`document.querySelector(${JSON.stringify(sel)}).innerText`);

export const countOf = (page, sel) =>
  page.evalJs(`document.querySelectorAll(${JSON.stringify(sel)}).length`);

export async function widgetText(page, sel) {
  return page.evalJs(`document.querySelector(${JSON.stringify(sel)})?.querySelector('.out')?.innerText ?? ''`);
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function closeTo(a, b, eps, msg) {
  assert(Math.abs(Number(a) - Number(b)) <= eps, `${msg}: ${a} vs ${b}`);
}

export async function clickPreset(page, name, within = 'body') {
  await page.evalJs(`(() => {
    const b = document.querySelector(${JSON.stringify(within)}).querySelector('[data-preset=${JSON.stringify(name)}]');
    if (!b) throw new Error('no preset ' + ${JSON.stringify(name)});
    b.click();
    return true;
  })()`);
}
