'use strict';
const SUPABASE_URL = 'https://ukotgedbveqgsywksuyc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Dqw7e5vjjn1IXwlKzG17nw_elllMnSH';
const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById('app'), modal = document.getElementById('modal');
let screenshotDraft = [];
let explicitSignOut = false;
let authRequestPending = false;
let user = null, revision = 0, view = 'dashboard', account = 'all', search = '', filter = 'all', month = new Date().getMonth(), year = new Date().getFullYear(), selectedDay = '', busy = false;
let data = { version: 3, trades: [], settings: { accounts: [] }, preferences: { theme: 'light', accent: '#C0C0C0', quote: '' } };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => (v < 0 ? '−' : '') + '$' + Math.abs(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = v => Number(v) || 0;
const uid = () => crypto.randomUUID?.() || 'trade-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const local = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const closed = t => !!t.xdt || (t.exit !== null && t.exit !== undefined && t.exit !== '' && t.pl !== null && t.pl !== undefined && t.pl !== '');
const pnl = t => num(t.pl) - num(t.comm) - num(t.charges) + num(t.adjustment);
const accounts = () => data.settings.accounts || [];
const filtered = () => data.trades.filter(t => (account === 'all' || t.account === account) && (!search || [t.pair, t.setup, t.notes].some(x => String(x || '').toLowerCase().includes(search.toLowerCase()))) && (filter === 'all' || (filter === 'open' ? !closed(t) : closed(t) && (filter === 'win' ? pnl(t) > 0 : filter === 'loss' ? pnl(t) < 0 : pnl(t) === 0))));
const allClosed = () => data.trades.filter(t => closed(t) && (account === 'all' || t.account === account));
const acctName = id => accounts().find(a => a.id === id)?.name || 'Account';
const labelResult = t => !closed(t) ? 'Open' : pnl(t) > 0 ? 'Win' : pnl(t) < 0 ? 'Loss' : 'Breakeven';
function toast(message) { const el = document.getElementById('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3300); }
function theme() { document.documentElement.dataset.theme = data.preferences?.theme === 'dark' ? 'dark' : 'light'; const c = /^#[0-9a-fA-F]{6}$/.test(data.preferences?.accent || '') ? data.preferences.accent : '#2563eb'; document.documentElement.style.setProperty('--accent', c); }
async function load() {
    const r = await db.from('journals').select('payload,revision').eq('user_id', user.id).maybeSingle(); if (r.error)
        throw r.error; revision = num(r.data?.revision); if (r.data?.payload) {
            data = r.data.payload;
            if (!Array.isArray(data.trades) || !data.settings)
                throw Error('Your saved journal has an unsupported format. No data was changed.');
        } data.settings.accounts ||= []; data.preferences ||= { theme: 'light', accent: '#2563eb', quote: '' }; theme(); render();
}
async function save(next) {
    if (busy)
        return false; busy = true; try {
            const payload = structuredClone(next);
            payload.version = 3;
            payload.preferences ||= { theme: 'light', accent: '#C0C0C0', quote: '' };
            payload.settings ||= { accounts: [] };
            payload.trades ||= [];
            if (new Blob([JSON.stringify(payload)]).size > 20 * 1024 * 1024)
                throw Error('Journal exceeds the 20 MB limit. Reduce screenshots before saving.');
            const r = await db.rpc('save_journal', { p_payload: payload, p_expected_revision: revision });
            if (r.error)
                throw r.error;
            revision = num(r.data);
            data = payload;
            theme();
            render();
            return true;
        }
    catch (e) {
        toast('Save failed: ' + e.message);
        return false;
    }
    finally {
        busy = false;
    }
}
const clone = () => structuredClone(data);
function icons(name) { const paths = { dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', trades: '<path d="M4 6h16M4 12h16M4 18h16"/>', calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>' }; return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`; }
function shell(inner) { app.innerHTML = `<div class="shell"><header class="topbar"><div class="brand"><img class="brand-icon" src="assets/pipfolio-logo.png" alt="P"><span>ipfolio</span></div><div class="header-right"><nav class="nav" aria-label="Main navigation">${['dashboard', 'trades', 'calendar', 'settings'].map(v => `<button type="button" data-view="${v}" class="${view === v ? 'active' : ''}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</nav><div class="top-actions">${view !== 'settings' ? `<select id="account-filter" aria-label="Select trading account"><option value="all">All accounts</option>${accounts().map(a => `<option value="${esc(a.id)}" ${account === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : ''}<button type="button" class="btn primary" data-action="add">+ Add trade</button></div></div></header><main class="content">${inner}<footer class="footer"><span>© 2026 <a href="mailto:pipfolio@proton.me">Pipfolio</a>. All rights reserved.</span><span><a href="https://github.com/Pipfolio/pipfolio.github.io/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer">Privacy Policy</a> &amp; <a href="https://github.com/Pipfolio/pipfolio.github.io/blob/main/TERMS.md" target="_blank" rel="noopener noreferrer">Terms of Service</a></span></footer></main></div>`; }
function render() {
    if (!user)
        return auth(); shell(view === 'dashboard' ? dashboard() : view === 'trades' ? tradesPage() : view === 'calendar' ? calendarPage() : settingsPage());
}
function dashboard() {
    const ts = allClosed().sort((a, b) => (a.xdt || a.dt).localeCompare(b.xdt || b.dt)), wins = ts.filter(t => pnl(t) > 0), losses = ts.filter(t => pnl(t) < 0), net = ts.reduce((s, t) => s + pnl(t), 0), winrate = ts.length ? 100 * wins.length / ts.length : 0, grossWin = wins.reduce((s, t) => s + pnl(t), 0), grossLoss = -losses.reduce((s, t) => s + pnl(t), 0), pf = grossLoss ? (grossWin / grossLoss).toFixed(2) : grossWin ? '∞' : '—', days = {}; for (const t of ts)
        (days[(t.xdt || t.dt).slice(0, 10)] ||= []).push(t); const dayCount = Object.keys(days).length, greenDays = Object.values(days).filter(a => a.reduce((n, t) => n + pnl(t), 0) > 0).length, avgWin = wins.length ? grossWin / wins.length : 0, avgLoss = losses.length ? grossLoss / losses.length : 0, ratio = avgLoss ? (avgWin / avgLoss).toFixed(2) : '—', quote = data.preferences?.quote?.trim() || 'A clear view of your trading performance.'; return `<div class="pagehead"><div><h2>Trading overview</h2><div class="dashboard-quote">“${esc(quote)}”</div></div></div><section class="metrics metrics-ref"><div class="panel"><div class="metric-label">Net P&L</div><div class="metric-value ${net >= 0 ? 'positive' : 'negative'}">${money(net)}</div><div class="metric-sub">${ts.length} closed trades</div></div><div class="panel"><div class="metric-label">Trade Win %</div><div class="gauge-row"><div class="gauge" style="--pct:${winrate.toFixed(1)}"><strong>${winrate.toFixed(1)}%</strong></div><div class="gauge-side">${wins.length} W<br>${losses.length} L<br>${ts.length - wins.length - losses.length} BE</div></div></div><div class="panel"><div class="metric-label">Profit Factor</div><div class="metric-value">${pf}</div><div class="metric-sub">Gross profit ÷ gross loss</div></div><div class="panel"><div class="metric-label">Average Win / Loss</div><div class="metric-value">${ratio}</div><div class="ratio-bar"><span style="width:${avgWin + avgLoss ? 100 * avgWin / (avgWin + avgLoss) : 50}%"></span></div><div class="metric-sub"><span class="positive">${money(avgWin)} avg win</span> · <span class="negative">${money(avgLoss)} avg loss</span></div></div></section><div class="dashboard-grid"><section class="panel"><div class="panel-head"><h3>Cumulative P&L</h3></div><div class="chart">${curve(ts)}</div></section><section class="panel"><div class="panel-head"><h3>Performance score</h3></div>${performanceRadar(ts)}</section></div><div class="dashboard-calendar">${calendarPage(true)}</div><section class="panel recent-trades"><div class="panel-head"><h3>Recent trades</h3><button type="button" class="btn" data-view="trades">View all trades</button></div>${table(filtered().sort((a, b) => b.dt.localeCompare(a.dt)).slice(0, 6))}</section>`;
}
function curve(ts) {
    if (!ts.length)
        return '<div class="empty">No closed trades yet</div>';
    let values = [0], running = 0;
    for (const t of ts) {
        running += pnl(t);
        values.push(running);
    }
    const min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1;
    const y = v => 210 - (v - min) / span * 170;
    const x = i => 30 + i * 660 / (values.length - 1);
    const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const circles = values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="11" fill="transparent" stroke="none" class="curve-hit" tabindex="0"><title>${i === 0 ? 'Starting balance' : `After trade ${i}`}: ${money(v)}</title></circle>`).join('');
    return `<svg viewBox="0 0 720 240" role="img" aria-label="Cumulative profit and loss; hover over the line points to see values" preserveAspectRatio="none"><line x1="30" y1="${y(0)}" x2="690" y2="${y(0)}" stroke="var(--muted)" stroke-opacity=".55" stroke-width="1"/><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>${circles}</svg>`;
}
function performanceRadar(ts) {
    if (!ts.length)
        return '<div class="empty">Record closed trades to see your performance score</div>';
    const vals = ts.map(pnl), wins = vals.filter(v => v > 0), losses = vals.filter(v => v < 0), n = vals.length;
    const grossWin = wins.reduce((a, b) => a + b, 0), grossLoss = -losses.reduce((a, b) => a + b, 0);
    const rate = wins.length / n, pf = grossLoss ? grossWin / grossLoss : (grossWin ? 4 : 0);
    const avgWin = wins.length ? grossWin / wins.length : 0, avgLoss = losses.length ? grossLoss / losses.length : 0;
    const ratio = avgLoss ? avgWin / avgLoss : (avgWin ? 4 : 0);
    const daily = new Map();
    for (const t of ts) {
        const d = (t.xdt || t.dt).slice(0, 10);
        daily.set(d, (daily.get(d) || 0) + pnl(t));
    }
    const days = [...daily.values()], consistency = days.length ? days.filter(v => v > 0).length / days.length : 0;
    let peak = 0, equity = 0, maxDD = 0;
    for (const v of vals) {
        equity += v;
        peak = Math.max(peak, equity);
        maxDD = Math.max(maxDD, peak - equity);
    }
    const drawdown = grossWin + grossLoss ? 1 - Math.min(1, maxDD / (grossWin + grossLoss)) : 0;
    const recovery = maxDD ? Math.max(0, Math.min(1, (grossWin - grossLoss) / maxDD / 3)) : grossWin ? 1 : 0;
    const metrics = [['Win %', rate], ['Profit factor', Math.min(1, pf / 3)], ['Avg win/loss', Math.min(1, ratio / 3)], ['Drawdown', drawdown], ['Recovery', recovery], ['Consistency', consistency]];
    const score = Math.round(metrics.reduce((a, m) => a + m[1], 0) / metrics.length * 100);
    const cx = 180, cy = 154, R = 105;
    const xy = (i, r) => { const a = -Math.PI / 2 + i * Math.PI / 3; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    const polygon = r => metrics.map((_, i) => xy(i, r).map(v => v.toFixed(1)).join(',')).join(' ');
    const shape = metrics.map((m, i) => xy(i, Math.max(0, m[1]) * R).map(v => v.toFixed(1)).join(',')).join(' ');
    const grid = [.25, .5, .75, 1].map(t => `<polygon points="${polygon(R * t)}" fill="none" stroke="var(--border)" stroke-width="1"/>`).join('');
    const axes = metrics.map((_, i) => { const [x, y] = xy(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border)" stroke-width="1"/>`; }).join('');
    const labels = metrics.map(([label, v], i) => { const [x, y] = xy(i, R + 24); return `<text x="${x}" y="${y + 4}" text-anchor="middle" fill="var(--muted)" font-size="11"><title>${label}: ${Math.round(v * 100)} / 100</title>${label}</text>`; }).join('');
    return `<div class="radar-wrap"><svg viewBox="0 0 360 310" role="img" aria-label="Trading performance radar score ${score} out of 100"><title>Performance score ${score} / 100. Normalised metrics, not a prediction of future results.</title>${grid}${axes}<polygon points="${shape}" fill="var(--accent)" fill-opacity=".18" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>${labels}<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="19" font-weight="700" fill="var(--text)">${score}</text></svg></div>`;
}
function resultsChart(w, l, b) {
    const total = w + l + b; if (!total)
        return '<div class="empty">No closed trades yet</div>'; const parts = [['Wins', w, 'var(--green)'], ['Losses', l, 'var(--red)'], ['Breakeven', b, 'var(--muted)']]; return `<div class="results-chart" role="img" aria-label="Trade results: ${w} wins, ${l} losses, ${b} breakeven"><div class="results-bars">${parts.map(([name, n, color]) => `<div class="results-bar-col"><strong>${n}</strong><div class="results-bar-track"><div class="results-bar" style="height:${n ? Math.max(4, 100 * n / Math.max(w, l, b)) : 0}%;background:${color}"></div></div><span>${name}</span></div>`).join('')}</div></div>`;
}
// TradingView-hosted symbol logos: best-effort lookup, not a complete licensed catalogue.
const CURRENCY = { USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', AUD: 'au', NZD: 'nz', CAD: 'ca', CHF: 'ch', CNH: 'cn', CNY: 'cn', SGD: 'sg', HKD: 'hk', ZAR: 'za', MXN: 'mx', TRY: 'tr', SEK: 'se', NOK: 'no', DKK: 'dk', PLN: 'pl' };
const SYMBOL_LOGOS = { XAUUSD: 'metal/gold', XAGUSD: 'metal/silver', XPTUSD: 'metal/platinum', XPDUSD: 'metal/palladium', BTCUSD: 'crypto/XTVCBTC', ETHUSD: 'crypto/XTVCETH', SOLUSD: 'crypto/XTVCSOL', SPX: 'indices/s-and-p-500', SPX500: 'indices/s-and-p-500', US500: 'indices/s-and-p-500', NAS100: 'indices/nasdaq-100', US100: 'indices/nasdaq-100', NDX: 'indices/nasdaq-100', DJI: 'indices/dow-jones-industrial-average', US30: 'indices/dow-jones-industrial-average', DAX: 'indices/dax', DE40: 'indices/dax', UK100: 'indices/ftse-100', VIX: 'indices/volatility-s-and-p-500', GC1: 'metal/gold', SI1: 'metal/silver', CL1: 'crude-oil', NG1: 'natural-gas' };
function instrumentChart(ts) {
    const totals = new Map(); for (const t of ts) {
        const k = String(t.pair || 'Unknown').toUpperCase();
        totals.set(k, (totals.get(k) || 0) + pnl(t));
    } const rows = [...totals].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6); if (!rows.length)
        return '<div class="empty">No closed trades yet</div>'; const max = Math.max(...rows.map(x => Math.abs(x[1])), 1); return `<div class="instrument-chart">${rows.map(([name, value]) => `<div class="instrument-chart-row"><span title="${esc(name)}">${esc(name)}</span><div class="instrument-chart-track"><div class="instrument-chart-fill ${value < 0 ? 'is-loss' : ''}" style="width:${Math.max(1, Math.abs(value) / max * 100)}%"></div></div><strong class="${value >= 0 ? 'positive' : 'negative'}">${value > 0 ? '+' : ''}${money(value)}</strong></div>`).join('')}</div>`;
}
function assetIcon(symbol) {
    const raw = String(symbol || '').toUpperCase().trim(), ticker = raw.split(':').pop().replace(/\.[A-Z0-9]+$/, '').replace(/[^A-Z0-9!]/g, ''), base = ticker.replace(/1!$/, '1'); let paths = []; if (SYMBOL_LOGOS[ticker] || SYMBOL_LOGOS[base])
        paths.push(SYMBOL_LOGOS[ticker] || SYMBOL_LOGOS[base]); if (!SYMBOL_LOGOS[ticker] && /^[A-Z]{6}$/.test(ticker) && CURRENCY[ticker.slice(0, 3)] && CURRENCY[ticker.slice(3)]) {
            const a = CURRENCY[ticker.slice(0, 3)], b = CURRENCY[ticker.slice(3)];
            return `<span class="asset-pair" aria-hidden="true"><img src="https://flagcdn.com/w40/${a}.png" onerror="this.style.display='none'"><img src="https://flagcdn.com/w40/${b}.png" onerror="this.style.display='none'"></span>`;
        } if (/^[A-Z0-9]{1,15}$/.test(ticker)) {
            paths.push(ticker.toLowerCase());
            paths.push('crypto/' + ticker.toLowerCase());
            paths.push('country/' + ticker.toLowerCase());
        } const unique = [...new Set(paths)]; const urls = unique.map(x => 'https://s3-symbol-logo.tradingview.com/' + x + '.svg'); return `<span class="asset-icon" aria-hidden="true"><span class="asset-fallback">${esc(ticker.slice(0, 2) || '•')}</span>${urls.length ? `<img loading="lazy" alt="" src="${urls[0]}" data-logo-options="${esc(JSON.stringify(urls.slice(1)))}" onerror="try{const q=JSON.parse(this.dataset.logoOptions||'[]');if(q.length){this.src=q.shift();this.dataset.logoOptions=JSON.stringify(q)}else this.remove()}catch(e){this.remove()}">` : ''}</span>`;
}
function table(ts) {
    if (!ts.length)
        return '<div class="empty">No trades to display. Add a trade to get started.</div>'; return `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Instrument</th><th>Direction</th><th>Account</th><th>Size</th><th>Result</th><th class="right">Net P&L</th></tr></thead><tbody>${ts.map(t => `<tr class="clickable" data-edit="${esc(t.id)}"><td>${esc(t.dt.slice(0, 10))}</td><td><span class="instrument">${assetIcon(t.pair)}<strong>${esc(t.pair)}</strong></span></td><td><span class="result ${t.side === 'Sell' ? 'short' : 'long'}">${t.side === 'Sell' ? 'Short' : 'Long'}</span></td><td>${esc(acctName(t.account))}</td><td>${esc(t.lots)}</td><td><span class="result ${labelResult(t).toLowerCase()}">${labelResult(t)}</span></td><td class="right ${closed(t) ? pnl(t) > 0 ? 'positive' : pnl(t) < 0 ? 'negative' : '' : ''}">${closed(t) ? money(pnl(t)) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function tradesPage() { return `<div class="pagehead"><div><h2>Trade history</h2><div class="muted">Search, record and review your trades.</div></div><div><button type="button" class="btn" data-action="import">Import</button> <button type="button" class="btn" data-action="export">Export</button></div></div><div class="toolbar"><input id="search" placeholder="Search instruments, notes…" value="${esc(search)}"><select id="result-filter"><option value="all">All results</option>${['open', 'win', 'loss', 'breakeven'].map(v => `<option value="${v}" ${filter === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select><span class="muted small">${filtered().length} trades</span></div>${table(filtered().sort((a, b) => b.dt.localeCompare(a.dt)))}`; }
function calendarPage(embedded = false) {
    const first = new Date(year, month, 1).getDay(), days = new Date(year, month + 1, 0).getDate(), byDay = {}; for (const t of allClosed()) {
        const day = (t.xdt || t.dt).slice(0, 10);
        (byDay[day] ||= []).push(t);
    } const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; const cells = weekday.map(d => `<div class="weekday">${d}</div>`); cells.push('<div class="weekday week-head">Week</div>'); let monthly = 0, tradeDays = 0, greenDays = 0; for (let d = 1; d <= days; d++) {
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, ts = byDay[date] || [], sum = ts.reduce((s, t) => s + pnl(t), 0);
        monthly += sum;
        if (ts.length) {
            tradeDays++;
            if (sum > 0)
                greenDays++;
        }
    } const weeks = Math.ceil((first + days) / 7); for (let w = 0; w < weeks; w++) {
        let weekTotal = 0, weekTrades = 0;
        for (let i = 0; i < 7; i++) {
            const d = w * 7 + i - first + 1;
            if (d < 1 || d > days) {
                cells.push('<div class="day day-empty"></div>');
                continue;
            }
            const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, ts = byDay[date] || [], sum = ts.reduce((s, t) => s + pnl(t), 0);
            weekTotal += sum;
            weekTrades += ts.length;
            cells.push(`<button type="button" class="day ${ts.length ? sum > 0 ? 'win' : sum < 0 ? 'loss' : 'even' : ''} ${selectedDay === date ? 'selected' : ''}" data-day="${date}"><span class="number">${d}</span>${ts.length ? `<strong class="amount">${sum > 0 ? '+' : ''}${money(sum)}</strong><span class="small">${ts.length} trade${ts.length === 1 ? '' : 's'}</span>` : ''}</button>`);
        }
        cells.push(`<div class="week-total"><strong class="${weekTotal > 0 ? 'positive' : weekTotal < 0 ? 'negative' : ''}">${weekTrades ? `${weekTotal > 0 ? '+' : ''}${money(weekTotal)}` : '—'}</strong><span>${weekTrades} trade${weekTrades === 1 ? '' : 's'}</span></div>`);
    } const chosen = byDay[selectedDay] || []; return `${embedded ? '' : '<div class="pagehead"><div><h2>Trading calendar</h2><div class="muted">Daily results at a glance.</div></div></div>'}<section class="panel calendar-panel"><div class="calendar-head"><button type="button" class="btn" data-action="prev-month" aria-label="Previous month">←</button><h3>${new Date(year, month, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })}</h3><button type="button" class="btn" data-action="next-month" aria-label="Next month">→</button></div><div class="calendar-scroll"><div class="calgrid">${cells.join('')}</div></div><div class="calendar-footer"><span>${tradeDays} trading days · ${greenDays} green</span><span>Month: <strong class="${monthly >= 0 ? 'positive' : 'negative'}">${monthly > 0 ? '+' : ''}${money(monthly)}</strong></span></div></section>${selectedDay ? `<section class="selected-day"><div class="panel-head"><h3>${esc(selectedDay)} · ${chosen.length} trades</h3><button type="button" class="btn" data-action="clear-day">Clear selection</button></div>${table(chosen)}</section>` : ''}`;
}
function accountFigures(a) {
    const flows = Array.isArray(a.flows) ? a.flows : [];
    const deposits = flows.filter(f => f.type === 'deposit').reduce((v, f) => v + num(f.amount), 0);
    const withdrawals = flows.filter(f => f.type === 'withdrawal').reduce((v, f) => v + num(f.amount), 0);
    const trades = data.trades.filter(t => t.account === a.id && closed(t));
    const net = trades.reduce((v, t) => v + pnl(t), 0);
    const starting = num(a.startingBalance);
    return { deposits, withdrawals, net, balance: starting + deposits - withdrawals + net, count: trades.length };
}
function settingsPage() { const prefs = data.preferences || {}; return `<div class="pagehead"><div><h2>Settings</h2><div class="muted">Manage your trading accounts and journal.</div></div></div><div class="settings-stack"><section class="panel"><div class="panel-head"><h3>Trading accounts</h3><button type="button" class="btn" data-action="add-account">+ Add account</button></div><div class="account-list">${accounts().map(a => { const f = accountFigures(a); return `<article class="account-card"><div class="account-card-head"><div><strong>${esc(a.name)}</strong><div class="small muted">${esc(a.broker || 'Broker not set')} · ${esc(a.type || 'Other')}${a.currency ? ' · ' + esc(a.currency) : ''}</div></div><button type="button" class="btn" data-account-edit="${esc(a.id)}">Edit</button></div><div class="account-figures"><div><span>Estimated balance</span><strong>${money(f.balance)}</strong></div><div><span>Starting balance</span><strong>${money(a.startingBalance)}</strong></div><div><span>Deposits</span><strong>${money(f.deposits)}</strong></div><div><span>Withdrawals</span><strong>${money(f.withdrawals)}</strong></div><div><span>Closed trade P&L</span><strong class="${f.net >= 0 ? 'positive' : 'negative'}">${money(f.net)}</strong></div><div><span>Closed trades</span><strong>${f.count}</strong></div></div><div class="account-foot"><span class="small muted">Calculated from recorded activity, not a live broker balance.</span><button type="button" class="btn" data-account-flow="${esc(a.id)}">Deposit / withdrawal</button></div></article>`; }).join('') || '<p class="muted">No accounts yet.</p>'}</div></section><div class="settings-lower"><section class="panel settings-appearance"><h3>Appearance</h3><div class="field"><label for="theme">Theme</label><select id="theme"><option value="light" ${prefs.theme !== 'dark' ? 'selected' : ''}>Light</option><option value="dark" ${prefs.theme === 'dark' ? 'selected' : ''}>Dark (black)</option></select></div><div class="field"><label for="accent">Custom accent colour</label><div class="accent-row"><input id="accent" type="color" value="${/^#[0-9a-fA-F]{6}$/.test(prefs.accent || '') ? prefs.accent : '#2563eb'}"><button type="button" class="btn" data-action="reset-accent">Reset colour</button></div></div><div class="field"><label for="quote">Dashboard quote</label><textarea id="quote" maxlength="180" placeholder="Your trading quote…">${esc(prefs.quote || '')}</textarea><button type="button" class="btn" data-action="save-quote">Save quote</button></div></section><section class="panel settings-data"><h3>Data & account</h3><p class="muted">Back up your journal or import existing trades.</p><div class="toolbar"><button type="button" class="btn" data-action="export">Export backup</button><button type="button" class="btn" data-action="import">Import file</button></div><button type="button" class="btn danger" data-action="signout">Sign out</button><div class="risk-disclaimer"><strong>Risk Disclaimer:</strong> Trading in financial markets and leveraged instruments involves risk, including capital loss. Pipfolio is a trade journaling and analytics platform for informational purposes only, not financial advice, investment recommendations or trading signals. Trading decisions are at your own risk. Past performance does not guarantee future results. Assess circumstances and practise responsible risk management.</div></section></div></div>`; }
function openModal(title, body, footer = '') { if (modal.open) modal.close(); modal.className = 'dialog'; modal.innerHTML = `<div class="dialog-head"><h3>${esc(title)}</h3><button type="button" class="btn" data-action="close">✕</button></div><div class="dialog-body">${body}</div>${footer ? `<div class="dialog-foot">${footer}</div>` : ''}`; modal.showModal(); }
function field(name, label, value = '', type = 'text', extra = '') { return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`; }
function tradeEditor(id) {
    const t = data.trades.find(x => x.id === id), now = local(); if (!accounts().length) {
        toast('Add a trading account in Settings first.');
        view = 'settings';
        render();
        return;
    } const v = t || { account: account !== 'all' ? account : accounts()[0].id, dt: now, side: 'Buy', lots: 0.01, comm: 0, charges: 0 }; const body = `<form id="trade-form" class="form-grid"><div class="field"><label>Account</label><select name="account">${accounts().map(a => `<option value="${esc(a.id)}" ${v.account === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>${field('pair', 'Instrument', v.pair || '', 'text', 'required maxlength="20" placeholder="XAUUSD"')}<div class="field"><label>Direction</label><select name="side"><option value="Buy" ${v.side === 'Buy' ? 'selected' : ''}>Buy / Long</option><option value="Sell" ${v.side === 'Sell' ? 'selected' : ''}>Sell / Short</option></select></div>${field('lots', 'Position size (lots)', v.lots, 'number', 'required min="0.000001" step="any"')}${field('dt', 'Entry date and time', v.dt?.slice(0, 16) || now, 'datetime-local', 'required')}${field('xdt', 'Exit date and time', v.xdt?.slice(0, 16) || '', 'datetime-local')}${field('entry', 'Entry price', v.entry ?? '', 'number', 'required min="0.00000001" step="any"')}${field('exit', 'Exit price (optional)', v.exit ?? '', 'number', 'min="0.00000001" step="any"')}${field('pl', 'Gross P&L (optional)', v.pl ?? '', 'number', 'step="any"')}${field('comm', 'Commission', v.comm ?? 0, 'number', 'min="0" step="any"')}${field('charges', 'Other fees', v.charges ?? 0, 'number', 'min="0" step="any"')}${field('setup', 'Strategy / setup', v.setup || '')}<div class="field full"><label>Notes</label><textarea name="notes" maxlength="5000">${esc(v.notes || '')}</textarea></div><div class="field full"><label>Trade screenshots</label><input id="trade-screenshot-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple><div class="small muted">Add screenshots or remove them individually. Images are saved with this trade.</div><div id="screenshot-list" class="screenshot-list"></div></div></form>`; openModal(t ? 'Edit trade' : 'Add trade', body, `${t ? '<button type="button" class="btn danger" data-action="delete-trade">Delete trade</button>' : ''}<button type="button" class="btn" data-action="close">Cancel</button><button type="button" class="btn primary" data-action="save-trade">Save trade</button>`); modal.dataset.trade = id || ''; screenshotDraft = Array.isArray(v.screenshots) ? structuredClone(v.screenshots) : []; renderScreenshots();
}
function screenshotSrc(item) { return typeof item === 'string' ? item : (item?.data || item?.url || item?.src || ''); }
function renderScreenshots() {
    const el = modal.querySelector('#screenshot-list'); if (!el)
        return; el.innerHTML = screenshotDraft.map((item, i) => { const src = screenshotSrc(item); return src ? `<div class="screenshot-item"><a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="Trade screenshot ${i + 1}"></a><button type="button" class="screenshot-remove" data-remove-screenshot="${i}" aria-label="Remove screenshot ${i + 1}">×</button></div>` : ''; }).join('');
}
function readScreenshot(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('Could not read screenshot')); reader.readAsDataURL(file); }); }
modal.addEventListener('change', async (e) => {
    if (e.target.id !== 'trade-screenshot-upload')
        return; const files = [...e.target.files]; e.target.value = ''; for (const file of files) {
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
                toast('Only PNG, JPEG, WebP and GIF images are supported.');
                continue;
            }
            if (file.size > 3 * 1024 * 1024) {
                toast('Each screenshot must be smaller than 3 MB.');
                continue;
            }
            try {
                screenshotDraft.push(await readScreenshot(file));
            }
            catch (err) {
                toast(err.message);
            }
        } renderScreenshots();
});
modal.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-screenshot]'); if (!btn)
        return; e.preventDefault(); e.stopPropagation(); const i = Number(btn.dataset.removeScreenshot); if (!confirm('Remove this screenshot from the trade when you save?'))
        return; screenshotDraft.splice(i, 1); renderScreenshots();
});
async function saveTrade() {
    const form = document.getElementById('trade-form'); if (!form.reportValidity())
        return; const f = new FormData(form), get = k => String(f.get(k) || '').trim(), id = modal.dataset.trade, old = data.trades.find(t => t.id === id), dt = get('dt'), xdt = get('xdt'); if (xdt && xdt < dt)
        return toast('Exit cannot be before entry.'); if (get('pl') && !xdt && !get('exit'))
        return toast('Enter an exit date or exit price for a closed trade.'); const n = clone(), t = { ...(old || {}), id: id || uid(), account: get('account'), pair: get('pair').toUpperCase(), side: get('side'), lots: Number(get('lots')), dt, xdt, entry: Number(get('entry')), exit: get('exit') ? Number(get('exit')) : null, pl: get('pl') ? Number(get('pl')) : null, comm: Number(get('comm') || 0), charges: Number(get('charges') || 0), setup: get('setup'), notes: get('notes'), updated: Date.now(), created: old?.created || Date.now(), sample: old?.sample || false, screenshots: structuredClone(screenshotDraft) }; if (!(t.entry > 0 && t.lots > 0))
        return toast('Entry price and position size must be greater than zero.'); if (t.exit !== null && t.exit <= 0)
        return toast('Exit price must be greater than zero.'); if (!t.xdt && t.exit !== null)
        t.xdt = t.dt; if (t.xdt && t.pl === null)
        return toast('Enter the gross P&L for closed trades.'); if (old)
        n.trades = n.trades.map(x => x.id === id ? t : x);
    else
        n.trades.push(t); if (await save(n)) {
            modal.close();
            toast('Trade saved');
        }
}
function accountEditor(id) { const a = accounts().find(x => x.id === id); openModal(a ? 'Edit account' : 'Add account', `<form id="account-form" class="form-grid">${field('name', 'Account name', a?.name || '', 'text', 'required maxlength="70"')}${field('broker', 'Broker / firm', a?.broker || '', 'text', 'maxlength="100"')}<div class="field"><label>Account type</label><select name="type">${['Personal', 'Funded', 'Demo', 'Other'].map(x => `<option ${a?.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="field"><label>Currency</label><select name="currency">${['USD', 'EUR', 'GBP', 'XCD', 'CAD', 'AUD', 'JPY', 'Other'].map(x => `<option ${((a?.currency || 'USD') === x) ? 'selected' : ''}>${x}</option>`).join('')}</select></div>${field('startingBalance', 'Starting balance', a?.startingBalance ?? 0, 'number', 'required min="0" step="0.01"')}${field('accountNumber', 'Account reference (optional)', a?.accountNumber || '', 'text', 'maxlength="80"')}<div class="field full"><label>Notes (optional)</label><textarea name="notes" maxlength="500">${esc(a?.notes || '')}</textarea></div></form>`, `${a ? '<button type="button" class="btn danger" data-action="delete-account">Delete account</button>' : ''}<button type="button" class="btn" data-action="close">Cancel</button><button type="button" class="btn primary" data-action="save-account">Save</button>`); modal.dataset.account = id || ''; }
async function saveAccount() {
    const f = document.getElementById('account-form'); if (!f.reportValidity())
        return; const vals = new FormData(f), n = clone(), id = modal.dataset.account, a = accounts().find(x => x.id === id); const get = k => String(vals.get(k) || '').trim(), startingBalance = Number(get('startingBalance')); if (!Number.isFinite(startingBalance) || startingBalance < 0)
        return toast('Enter a valid starting balance.'); const next = { ...(a || { id: uid(), flows: [] }), name: get('name'), type: get('type'), broker: get('broker'), currency: get('currency'), startingBalance, accountNumber: get('accountNumber'), notes: get('notes') }; if (a)
        n.settings.accounts = n.settings.accounts.map(x => x.id === id ? next : x);
    else
        n.settings.accounts.push(next); if (await save(n)) {
            modal.close();
            toast('Account saved');
        }
}
function accountFlowEditor(id) {
    const a = accounts().find(x => x.id === id); if (!a)
        return; const flows = Array.isArray(a.flows) ? a.flows : []; openModal('Deposits and withdrawals — ' + a.name, `<form id="flow-form" class="form-grid"><div class="field"><label>Transaction</label><select name="type"><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></select></div>${field('amount', 'Amount', '', 'number', 'required min="0.01" step="0.01"')}${field('date', 'Date', new Date().toISOString().slice(0, 10), 'date', 'required')}<div class="field full"><label>Note (optional)</label><input name="note" maxlength="140"></div></form><div class="flow-history"><h4>Transaction history</h4>${flows.length ? flows.map(f => `<div class="flow-row"><div><strong>${f.type === 'withdrawal' ? 'Withdrawal' : 'Deposit'} · ${money(f.amount)}</strong><div class="small muted">${esc(f.date || '')}${f.note ? ' · ' + esc(f.note) : ''}</div></div><button class="btn" type="button" data-remove-flow="${esc(f.id)}" aria-label="Delete transaction">Remove</button></div>`).join('') : '<p class="small muted">No deposits or withdrawals recorded.</p>'}</div>`, `<button type="button" class="btn" data-action="close">Close</button><button type="button" class="btn primary" data-action="save-flow">Add transaction</button>`); modal.dataset.account = id;
}
async function saveFlow() {
    const f = document.getElementById('flow-form'); if (!f?.reportValidity())
        return; const v = new FormData(f), amount = Number(v.get('amount')); if (!Number.isFinite(amount) || amount <= 0)
        return toast('Enter a valid amount.'); const n = clone(), a = n.settings.accounts.find(x => x.id === modal.dataset.account); if (!a)
        return; a.flows ||= []; a.flows.push({ id: uid(), type: String(v.get('type')), amount, date: String(v.get('date')), note: String(v.get('note') || '').trim() }); if (await save(n)) {
            accountFlowEditor(a.id);
            toast('Transaction added');
        }
}
async function removeFlow(id) {
    if (!confirm('Delete this recorded transaction?'))
        return; const n = clone(), a = n.settings.accounts.find(x => x.id === modal.dataset.account); if (!a)
        return; a.flows = (a.flows || []).filter(f => f.id !== id); if (await save(n)) {
            accountFlowEditor(a.id);
            toast('Transaction removed');
        }
}
async function deleteTrade() {
    if (!confirm('Permanently delete this trade?'))
        return; const n = clone(); n.trades = n.trades.filter(x => x.id !== modal.dataset.trade); if (await save(n)) {
            modal.close();
            toast('Trade deleted');
        }
}
async function deleteAccount() {
    const id = modal.dataset.account; if (data.trades.some(t => t.account === id))
        return toast('Move or delete this account’s trades before deleting the account.'); if (accounts().length <= 1)
        return toast('Keep at least one trading account.'); if (!confirm('Delete this account?'))
        return; const n = clone(); n.settings.accounts = n.settings.accounts.filter(x => x.id !== id); if (account === id)
        account = 'all'; if (await save(n)) {
            modal.close();
            toast('Account deleted');
        }
}
function exportJSON() { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = window.URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'pipfolio-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => window.URL.revokeObjectURL(url), 1000); }
async function importFile(file) {
    if (!file)
        return; try {
            const text = await file.text();
            if (file.name.toLowerCase().endsWith('.json')) {
                const imported = JSON.parse(text);
                if (!Array.isArray(imported.trades))
                    throw Error('Expected a Pipfolio JSON backup containing trades.');
                if (!confirm(`Import ${imported.trades.length} trades? Existing trades with matching IDs will be retained.`))
                    return;
                const n = clone(), ids = new Set(n.trades.map(t => t.id));
                for (const a of imported.settings?.accounts || [])
                    if (a.id && !n.settings.accounts.some(x => x.id === a.id))
                        n.settings.accounts.push(a);
                let added = 0;
                for (const t of imported.trades) {
                    if (!t.id || !t.dt || !t.pair || ids.has(t.id))
                        continue;
                    if (!n.settings.accounts.some(a => a.id === t.account))
                        t.account = n.settings.accounts[0]?.id;
                    if (!t.account)
                        continue;
                    n.trades.push(t);
                    ids.add(t.id);
                    added++;
                }
                if (await save(n))
                    toast(`${added} trades imported`);
            }
            else {
                const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
                const parse = line => {
                    const a = []; let s = '', quoted = false; for (let i = 0; i < line.length; i++) {
                        const c = line[i];
                        if (c === '"' && line[i + 1] === '"' && quoted) {
                            s += '"';
                            i++;
                        }
                        else if (c === '"')
                            quoted = !quoted;
                        else if (c === ',' && !quoted) {
                            a.push(s);
                            s = '';
                        }
                        else
                            s += c;
                    } a.push(s); return a;
                };
                const h = parse(lines.shift()).map(x => x.trim().toLowerCase());
                const col = (row, ...keys) => {
                    for (const key of keys) {
                        const i = h.indexOf(key);
                        if (i >= 0)
                            return row[i] || '';
                    } return '';
                };
                if (!h.includes('symbol') && !h.includes('pair') && !h.includes('instrument'))
                    throw Error('CSV needs a symbol, pair or instrument column.');
                const n = clone(), id = account !== 'all' ? account : accounts()[0]?.id;
                if (!id)
                    throw Error('Create an account first.');
                let count = 0;
                for (const line of lines) {
                    const r = parse(line), pair = col(r, 'symbol', 'pair', 'instrument'), date = col(r, 'date', 'entry date', 'entry time', 'datetime'), entry = Number(col(r, 'entry', 'entry price')), size = Number(col(r, 'lots', 'size', 'quantity') || 1), pl = col(r, 'p&l', 'pnl', 'profit', 'gross pnl');
                    if (!pair || !date || !(entry > 0) || !(size > 0))
                        continue;
                    const dt = date.includes('T') ? date.slice(0, 16) : date.includes(' ') ? date.replace(' ', 'T').slice(0, 16) : date + 'T00:00';
                    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt))
                        continue;
                    n.trades.push({ id: uid(), account: id, pair: pair.toUpperCase(), side: /sell|short/i.test(col(r, 'side', 'direction', 'type')) ? 'Sell' : 'Buy', dt, entry, lots: size, xdt: pl !== '' ? dt : '', pl: pl !== '' ? Number(pl) : null, comm: Number(col(r, 'commission', 'comm') || 0), charges: Number(col(r, 'fees', 'charges') || 0), notes: col(r, 'notes', 'note'), created: Date.now(), updated: Date.now() });
                    count++;
                }
                if (!count)
                    throw Error('No valid rows. Use columns: symbol, date, side, entry, lots, pnl, commission.');
                if (!confirm(`Import ${count} rows into ${acctName(id)}?`))
                    return;
                if (await save(n))
                    toast(`${count} trades imported`);
            }
        }
    catch (e) {
        toast('Import failed: ' + e.message);
    }
}
function auth(mode = 'signin', message = '') {
    if (!message && app.querySelector('#auth-form') && app.dataset.auth === mode)
        return; app.innerHTML = `<div class="auth"><div class="auth-card"><div class="brand auth-brand"><img class="brand-icon" src="assets/pipfolio-logo.png" alt="P"><span>ipfolio</span></div><div class="muted">A simpler way to track your trades.</div>${message ? `<div class="notice">${esc(message)}</div>` : ''}<form id="auth-form"><div class="field"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" required autocomplete="email" autocapitalize="none" spellcheck="false"></div>${mode !== 'reset' ? `<div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" minlength="6" required autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"></div>` : ''}<button class="btn primary" type="submit">${mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</button></form><div class="auth-links"><button type="button" class="auth-switch" data-auth="${mode === 'signin' ? 'signup' : 'signin'}">${mode === 'signin' ? 'Create an account' : 'Back to sign in'}</button>${mode === 'signin' ? '<button type="button" class="auth-switch" data-auth="reset">Forgot password?</button>' : ''}</div></div>`; app.dataset.auth = mode;
}
async function handleAuth(form) {
    if (authRequestPending) return;
    authRequestPending = true;
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    const mode = app.dataset.auth, f = new FormData(form), email = String(f.get('email') || ''), password = String(f.get('password') || ''); try {
        let r;
        if (mode === 'signup')
            r = await db.auth.signUp({ email, password });
        else if (mode === 'reset')
            r = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        else
            r = await db.auth.signInWithPassword({ email, password });
        if (r.error)
            throw r.error;
        if (mode === 'signup')
            auth('signin', 'Account created. Check your email if confirmation is required.');
        else if (mode === 'reset')
            auth('signin', 'If the address is registered, a reset email has been sent.');
        else if (r.data?.user) {
            user = r.data.user;
            await load();
        }
    }
        catch (e) {
            toast(e.message);
        } finally {
            authRequestPending = false;
            if (submit?.isConnected) submit.disabled = false;
        }
}
async function init() {
    if (!db) {
        app.textContent = 'Unable to load Supabase. Check your internet connection.';
        return;
    }
    const r = await db.auth.getSession();
    if (r.error) {
        auth('signin', 'Could not verify your session: ' + r.error.message);
        return;
    }
    if (r.data?.session?.user) {
        user = r.data.session.user;
        try {
            await load();
        }
        catch (e) {
            auth('signin', 'Unable to load your journal: ' + e.message);
        }
    }
    else
        auth(); db.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                // Ignore unexpected auth notifications until the actual session is checked.
                // This prevents an unrelated UI action from immediately clearing the page.
                Promise.resolve().then(async () => {
                    const current = await db.auth.getSession();
                    if (current.error) {
                        toast('Unable to verify your session. Please try again.');
                        return;
                    }
                    if (current.data?.session?.user) {
                        user = current.data.session.user;
                        explicitSignOut = false;
                        return;
                    }
                    user = null;
                    explicitSignOut = false;
                    if (!app.querySelector('#auth-form')) auth();
                }).catch(err => toast('Session check failed: ' + err.message));
            }
            else if (event === 'PASSWORD_RECOVERY') {
                user = session?.user;
                openModal('Update password', `<form id="password-form">${field('password', 'New password', '', 'password', 'required minlength="6"')}</form>`, `<button type="button" class="btn primary" data-action="update-password">Update password</button>`);
            }
        });
}
app.addEventListener('click', async (e) => {
    const nav = e.target.closest('[data-view]'); if (nav) {
        e.preventDefault();
        view = nav.dataset.view;
        render();
        return;
    } const edit = e.target.closest('[data-edit]'); if (edit) {
        tradeEditor(edit.dataset.edit);
        return;
    } const day = e.target.closest('[data-day]'); if (day) {
        selectedDay = day.dataset.day;
        render();
        return;
    } const acc = e.target.closest('[data-account-edit]'); if (acc) {
        accountEditor(acc.dataset.accountEdit);
        return;
    } const flow = e.target.closest('[data-account-flow]'); if (flow) {
        accountFlowEditor(flow.dataset.accountFlow);
        return;
    } const au = e.target.closest('[data-auth]'); if (au) {
        auth(au.dataset.auth);
        return;
    } const action = e.target.closest('[data-action]')?.dataset.action; if (!action)
        return;
    e.preventDefault();
    if (action === 'add')
        tradeEditor(); if (action === 'import')
        document.getElementById('upload')?.click(); if (action === 'export')
        exportJSON(); if (action === 'add-account')
        accountEditor(); if (action === 'prev-month') {
            month--;
            if (month < 0) {
                month = 11;
                year--;
            }
            selectedDay = '';
            render();
        } if (action === 'next-month') {
            month++;
            if (month > 11) {
                month = 0;
                year++;
            }
            selectedDay = '';
            render();
        } if (action === 'clear-day') {
            selectedDay = '';
            render();
        } if (action === 'save-quote') {
            const n = clone();
            n.preferences.quote = document.getElementById('quote').value.trim();
            if (await save(n))
                toast('Quote saved');
        } if (action === 'reset-accent') {
            const n = clone();
            n.preferences.accent = '#2563eb';
            if (await save(n))
                toast('Accent colour reset');
        } if (action === 'signout') {
            if (!confirm('Sign out of Pipfolio?')) return;
            explicitSignOut = true;
            const result = await db.auth.signOut();
            if (result.error) {
                explicitSignOut = false;
                toast('Sign out failed: ' + result.error.message);
            }
        }
});
modal.addEventListener('click', async (e) => {
    const remove = e.target.closest('[data-remove-flow]'); if (remove) {
        e.preventDefault();
        await removeFlow(remove.dataset.removeFlow);
        return;
    } const action = e.target.closest('[data-action]')?.dataset.action; if (!action)
        return;
    e.preventDefault();
    if (action === 'close')
        modal.close(); if (action === 'save-trade')
        await saveTrade(); if (action === 'delete-trade')
        await deleteTrade(); if (action === 'save-account')
        await saveAccount(); if (action === 'save-flow')
        await saveFlow(); if (action === 'delete-account')
        await deleteAccount(); if (action === 'update-password') {
            const password = modal.querySelector('[name=password]');
            if (!password.reportValidity())
                return;
            const r = await db.auth.updateUser({ password: password.value });
            if (r.error)
                toast(r.error.message);
            else {
                modal.close();
                toast('Password updated');
            }
        }
});
modal.addEventListener('submit', e => {
    e.preventDefault();
    // Dialog actions are handled by explicit Save buttons.
});
app.addEventListener('submit', e => {
    if (e.target.id === 'auth-form') {
        e.preventDefault();
        handleAuth(e.target);
    }
});
app.addEventListener('change', async (e) => {
    if (e.target.id === 'account-filter') {
        account = e.target.value;
        render();
    } if (e.target.id === 'result-filter') {
        filter = e.target.value;
        render();
    } if (e.target.id === 'theme') {
        const n = clone();
        n.preferences.theme = e.target.value;
        await save(n);
    } if (e.target.id === 'accent') {
        const n = clone();
        n.preferences.accent = e.target.value;
        await save(n);
    }
});
app.addEventListener('input', e => {
    if (e.target.id === 'search') {
        search = e.target.value;
        const old = e.target.selectionStart;
        const wrap = app.querySelector('.tablewrap,.empty');
        if (wrap) {
            const holder = document.createElement('div');
            holder.innerHTML = table(filtered().sort((a, b) => b.dt.localeCompare(a.dt)));
            wrap.replaceWith(holder.firstElementChild);
        }
        const count = app.querySelector('.toolbar .muted');
        if (count)
            count.textContent = `${filtered().length} trades`;
        e.target.focus();
        e.target.setSelectionRange(old, old);
    }
});
document.getElementById('upload').addEventListener('change', e => { importFile(e.target.files[0]); e.target.value = ''; });
init();