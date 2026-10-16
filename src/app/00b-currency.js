/* ---------- currency ---------- */
// Each plan has one currency everyone spends in. Each person can also pick their own,
// and big totals then show roughly what that is for them. Rates come from a free,
// keyless rates API, cached for 12 hours, with approximate built-in rates as a fallback.
const CURRENCIES = [['USD', 'US dollar'], ['EUR', 'Euro'], ['JPY', 'Japanese yen'], ['GBP', 'British pound'], ['CNY', 'Chinese yuan'], ['AUD', 'Australian dollar'], ['CAD', 'Canadian dollar'], ['CHF', 'Swiss franc'], ['HKD', 'Hong Kong dollar'], ['SGD', 'Singapore dollar'],
  ['SEK', 'Swedish krona'], ['KRW', 'South Korean won'], ['NOK', 'Norwegian krone'], ['NZD', 'New Zealand dollar'], ['INR', 'Indian rupee'], ['MXN', 'Mexican peso'], ['TWD', 'New Taiwan dollar'], ['ZAR', 'South African rand'], ['BRL', 'Brazilian real'], ['DKK', 'Danish krone']];
const CUR_CODES = CURRENCIES.map(c => c[0]);
// approximate USD rates, used only if the live rates can't be loaded
const FX_FALLBACK = { USD: 1, EUR: 0.92, JPY: 150, GBP: 0.79, CNY: 7.2, AUD: 1.52, CAD: 1.37, CHF: 0.88, HKD: 7.8, SGD: 1.34, SEK: 10.5, KRW: 1380, NOK: 10.7, NZD: 1.66, INR: 84, MXN: 18.5, TWD: 32, ZAR: 18.3, BRL: 5.6, DKK: 6.85 };
const EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ');
const REGION_CUR = { US: 'USD', GB: 'GBP', JP: 'JPY', CN: 'CNY', AU: 'AUD', CA: 'CAD', CH: 'CHF', HK: 'HKD', SG: 'SGD', SE: 'SEK', KR: 'KRW', NO: 'NOK', NZ: 'NZD', IN: 'INR', MX: 'MXN', TW: 'TWD', ZA: 'ZAR', BR: 'BRL', DK: 'DKK' };
function guessCur() {
  const region = (navigator.language || 'en-US').split('-')[1]?.toUpperCase() || '';
  return REGION_CUR[region] || (EURO.includes(region) ? 'EUR' : 'USD');
}
const lsGetC = (k, d) => { try { const v = localStorage.getItem(k); return v || d; } catch { return d; } };
const myCur = () => { const c = lsGetC('outta_mycur', ''); return CUR_CODES.includes(c) ? c : guessCur(); };
const cur = () => S.trip && CUR_CODES.includes(S.trip.currency) ? S.trip.currency : 'USD';
const noCents = c => ['JPY', 'KRW', 'TWD'].includes(c);
function fmtMoney(n, c, cents) {
  const dec = cents && !noCents(c) && Math.round(n * 100) % 100 ? 2 : 0;
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n); }
  catch { return c + ' ' + Math.round(n).toLocaleString('en-US'); }
}
const curSymbol = c => fmtMoney(0, c).replace(/[\d.,\s]/g, '') || c;
let FX = null; try { FX = JSON.parse(localStorage.getItem('outta_fx') || 'null'); } catch {}
const fxRate = c => (FX && FX.rates && FX.rates[c]) || FX_FALLBACK[c];
const convert = (n, from, to) => from === to ? n : n / fxRate(from) * fxRate(to);
async function loadRates() {
  if (FX && FX.live && Date.now() - FX.got < 12 * 36e5) return;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD'), j = await r.json();
    if (j && j.result === 'success' && j.rates) { FX = { rates: j.rates, day: (j.time_last_update_utc || '').slice(5, 16), got: Date.now(), live: true }; try { localStorage.setItem('outta_fx', JSON.stringify(FX)); } catch {} render(); }
  } catch {}
}
const fxNote = () => FX && FX.live ? `rate from ${FX.day}` : 'approximate rate';
// "≈ $1,240" in your own currency, when it differs from the plan's
function alsoMine(lo, hi = lo) {
  const me = myCur(), c = cur(); if (me === c || !fxRate(me) || !fxRate(c)) return '';
  const a = fmtMoney(convert(lo, c, me), me), b = fmtMoney(convert(hi, c, me), me);
  return `<span class="fx" title="${fxNote()}">≈ ${a}${b !== a ? '–' + b : ''}</span>`;
}
setTimeout(() => loadRates(), 1500);
// a USD amount as a round number in the plan's currency (for presets and placeholders)
function niceIn(usd, c = cur()) {
  const v = convert(usd, 'USD', c), mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.round(v / mag) * mag;
}
const curOptions = sel => CURRENCIES.map(([c, n]) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c} · ${n}</option>`).join('');

