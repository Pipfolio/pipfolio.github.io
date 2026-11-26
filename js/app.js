'use strict';
const SUPABASE_URL = 'https://ukotgedbveqgsywksuyc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Dqw7e5vjjn1IXwlKzG17nw_elllMnSH';
const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById('app'), modal = document.getElementById('modal');
let screenshotDraft = [];
let explicitSignOut = false;
let authRequestPending = false;
let recoveryMode = false;
let authInitialised = false;
let user = null, revision = 0, view = 'dashboard', account = 'all', search = '', filter = 'all', month = new Date().getMonth(), year = new Date().getFullYear(), selectedDay = '', busy = false;
let data = { version: 3, trades: [], settings: { accounts: [] }, preferences: { theme: 'light', accent: '#C0C0C0', quote: '' } };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => (v < 0 ? '−' : '') + '$' + Math.abs(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = v => Number(v) || 0;
// Preserve the user's local date and time when editing stored ISO timestamps.
function dateInputValue(value) {
    if (!value) return '';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw;
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) return raw.slice(0, 16);
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
// Convert legacy opening balances to deposits without changing account totals.
// Idempotent: an account is converted only while startingBalance is non-zero.
function migrateOpeningBalances(journal) {
    let changed = false;
    for (const a of journal.settings?.accounts || []) {
        const opening = num(a.startingBalance);
        if (!opening) continue;
        a.flows = Array.isArray(a.flows) ? a.flows : [];
        a.flows.unshift({
            id: uid(), type: opening > 0 ? 'deposit' : 'withdrawal',
            amount: Math.abs(opening), date: '', note: 'Opening balance (migrated)'
        });
        a.startingBalance = 0;
        changed = true;
    }
    return changed;
}
function tradesBalance() {
    const selected = accounts().filter(a => account === 'all' || a.id === account);
    if (!selected.length) return '<span class="trade-toolbar-balance muted" title="Add an account to calculate its balance">N/A</span>';
    const currencies = [...new Set(selected.map(a => a.currency || 'USD'))];
    if (currencies.length !== 1) return '<span class="trade-toolbar-balance muted" title="Select a single currency account to see its balance">N/A</span>';
    const balance = selected.reduce((sum, a) => sum + accountFigures(a).balance, 0);
    const baseline = 0;
    const tone = balance > baseline ? 'positive' : balance < baseline ? 'negative' : '';
    return `<span class="trade-toolbar-balance ${tone}" title="Estimated current balance (${esc(currencies[0])}): deposits − withdrawals + closed trade net P&amp;L; excludes open positions">${esc(money(balance))}</span>`;
}
const uid = () => globalThis.crypto?.randomUUID?.() || 'trade-' + Date.now() + '-' + Math.random().toString(36).slice(2);
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
            if (!data || !Array.isArray(data.trades) || !data.settings || !Array.isArray(data.settings.accounts || []))
                throw Error('Your saved journal has an unsupported format. No data was changed.');
        } data.settings.accounts ||= []; data.preferences ||= { theme: 'light', accent: '#2563eb', quote: '' }; if (migrateOpeningBalances(data)) { await save(data); } theme(); render();
}
async function save(next) {
    if (busy)
        return false; busy = true; try {
            const payload = structuredClone(next);
            migrateOpeningBalances(payload);
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
function shell(inner) { app.innerHTML = `<div class="shell"><header class="topbar"><div class="brand"><img class="brand-icon" src="assets/pipfolio-logo.png" alt="P"><span>ipfolio</span></div><div class="header-right"><span class="header-username" title="Signed-in username">${esc(user?.user_metadata?.username || user?.email?.split("@")[0] || "Account")}</span><nav class="nav" aria-label="Main navigation">${['dashboard', 'trades', 'settings'].map(v => `<button type="button" data-view="${v}" class="${view === v ? 'active' : ''}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</nav><div class="top-actions"><button type="button" class="btn primary" data-action="add">+ Add trade</button></div></div></header><main class="content">${inner}<footer class="footer"><span>© 2026 <a href="mailto:pipfolio@proton.me">Pipfolio</a>. All rights reserved.</span><span><a href="https://github.com/Pipfolio/pipfolio.github.io/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer">Privacy Policy</a> &amp; <a href="https://github.com/Pipfolio/pipfolio.github.io/blob/main/TERMS.md" target="_blank" rel="noopener noreferrer">Terms of Service</a></span></footer></main></div>`; }
function render() {
    if (!user) {
        auth();
        return;
    }
    shell(view === 'dashboard' ? dashboard() : view === 'trades' ? tradesPage() : settingsPage());
}
function dashboard() {
    const ts = allClosed().sort((a, b) => String(a.xdt || a.dt || '').localeCompare(String(b.xdt || b.dt || '')));
    const wins = ts.filter(t => pnl(t) > 0);
    const losses = ts.filter(t => pnl(t) < 0);
    const net = ts.reduce((sum, t) => sum + pnl(t), 0);
    const winrate = ts.length ? 100 * wins.length / ts.length : 0;
    const grossWin = wins.reduce((sum, t) => sum + pnl(t), 0);
    const grossLoss = -losses.reduce((sum, t) => sum + pnl(t), 0);
    const pfValue = grossLoss ? grossWin / grossLoss : 0;
    const pf = grossLoss ? pfValue.toFixed(2) : grossWin ? '∞' : '';
    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    const ratio = avgLoss ? (avgWin / avgLoss).toFixed(2) : '';
    const quote = data.preferences?.quote?.trim() || 'A clear view of your trading performance.';
    const breakeven = ts.length - wins.length - losses.length;
    // Compare the last seven completed calendar days with the seven days before them.
    // This is a net P&L comparison, not a broker account-balance change.
    const today = new Date();
    const utcDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const dayMs = 86400000;
    const tradeDay = t => {
        const raw = (t.xdt || t.dt || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return NaN;
        return Date.parse(raw + 'T00:00:00Z');
    };
    const recentWeek = ts.filter(t => { const d = tradeDay(t); return d >= utcDay - 6 * dayMs && d < utcDay + dayMs; }).reduce((v, t) => v + pnl(t), 0);
    const previousWeek = ts.filter(t => { const d = tradeDay(t); return d >= utcDay - 13 * dayMs && d < utcDay - 6 * dayMs; }).reduce((v, t) => v + pnl(t), 0);
    const weeklyDifference = recentWeek - previousWeek;
    const weeklyLabel = `${weeklyDifference >= 0 ? '▲' : '▼'} ${money(Math.abs(weeklyDifference))} vs prior 7d`;
    const totalFees = ts.reduce((sum, t) => sum + num(t.comm) + num(t.charges), 0);
    const recentTrades = ts.filter(t => { const d = tradeDay(t); return d >= utcDay - 6 * dayMs && d < utcDay + dayMs; });
    const priorTrades = ts.filter(t => { const d = tradeDay(t); return d >= utcDay - 13 * dayMs && d < utcDay - 6 * dayMs; });
    const rateFor = trades => trades.length ? 100 * trades.filter(t => pnl(t) > 0).length / trades.length : null;
    const recentRate = rateFor(recentTrades);
    const priorRate = rateFor(priorTrades);
    const rateChange = recentRate !== null && priorRate !== null ? recentRate - priorRate : null;
    const rateDetail = rateChange === null ? '7d comparison unavailable' : `${rateChange >= 0 ? '+' : ''}${rateChange.toFixed(1)} pp vs prior 7d`;
    const pfDetail = !ts.length ? 'No closed trades' : grossLoss === 0 ? (grossWin > 0 ? 'No losing trades' : 'No gains or losses') : 'Gross profit ÷ gross loss';
    // Percentage changes compare the latest seven calendar days with the preceding seven.
    // An undefined baseline is displayed as N/A instead of a misleading percentage.
    const periodMetrics = trades => {
        const positive = trades.filter(t => pnl(t) > 0).map(pnl);
        const negative = trades.filter(t => pnl(t) < 0).map(t => -pnl(t));
        const gain = positive.reduce((a, b) => a + b, 0);
        const loss = negative.reduce((a, b) => a + b, 0);
        return {
            factor: loss > 0 ? gain / loss : null,
            ratio: positive.length && negative.length && loss > 0
                ? (gain / positive.length) / (loss / negative.length) : null
        };
    };
    const recentMetrics = periodMetrics(recentTrades);
    const priorMetrics = periodMetrics(priorTrades);
    const changePercent = (current, previous) => current !== null && previous !== null && previous > 0
        ? 100 * (current - previous) / previous : null;
    const pctTag = value => value === null ? ''
        : `<span class="metric-change ${value >= 0 ? 'positive' : 'negative'}">${value >= 0 ? '+' : ''}${value.toFixed(1)}%</span>`;
    const netPct = previousWeek !== 0 ? 100 * (recentWeek - previousWeek) / Math.abs(previousWeek) : null;
    const netPctTag = pctTag(netPct);
    const winPctTag = rateChange === null ? ''
        : `<span class="metric-change ${rateChange >= 0 ? 'positive' : 'negative'}">${rateChange >= 0 ? '+' : ''}${rateChange.toFixed(1)} pp</span>`;
    const pfPctTag = pctTag(changePercent(recentMetrics.factor, priorMetrics.factor));
    const ratioPctTag = pctTag(changePercent(recentMetrics.ratio, priorMetrics.ratio));


    // The gauge segments represent the actual proportions of wins, breakevens and losses.
    // A single half-circle is split into three contiguous segments, matching the reference.
    const winShare = ts.length ? 100 * wins.length / ts.length : 0;
    const evenShare = ts.length ? 100 * breakeven / ts.length : 0;
    const lossShare = ts.length ? 100 * losses.length / ts.length : 0;
    // Semicircle: green = wins, neutral = breakevens, red = losses.
    // The three contiguous segments sum to exactly 100% of closed trades.
    const gaugePath = 'M 10 62 A 50 50 0 0 1 110 62';
    const gaugeSegment = (colour, share, offset) => share > 0
        ? `<path d="${gaugePath}" fill="none" stroke="${colour}" stroke-width="10" pathLength="100" stroke-dasharray="${share} ${100 - share}" stroke-dashoffset="${-offset}" />`
        : '';
    const winGauge = `<div class="win-reference-layout">
        <strong class="win-reference-value">${winrate.toFixed(2)}%</strong>
        <div class="win-reference-right" role="img" aria-label="${wins.length} winning, ${breakeven} breakeven, ${losses.length} losing trades out of ${ts.length} closed trades">
            <svg class="win-reference-arc" viewBox="0 0 120 82" aria-hidden="true">
                <path d="${gaugePath}" fill="none" stroke="var(--border)" stroke-width="10" />
                ${gaugeSegment('var(--green)', winShare, 0)}
                ${gaugeSegment('var(--accent)', evenShare, winShare)}
                ${gaugeSegment('var(--red)', lossShare, winShare + evenShare)}
            </svg>
            <div class="win-gauge-counts" aria-hidden="true"><span class="win-pill">${wins.length} W</span><span class="even-pill">${breakeven} BE</span><span class="loss-pill">${losses.length} L</span></div>
        </div>
    </div>`;
    const cards = `<section class="metrics metrics-ref metrics-compact metrics-reference metrics-dashboard-four">
        <div class="panel"><div class="metric-label">Net P&L</div><div class="metric-value ${net >= 0 ? 'positive' : 'negative'}">${money(net)}</div><div class="metric-week-change ${weeklyDifference >= 0 ? 'positive' : 'negative'}">${weeklyLabel}</div><div class="metric-sub">${ts.length} closed trades · ${money(totalFees)} fees</div></div>
        <div class="panel win-card"><div class="metric-label">Trade Win %</div>${winGauge}</div>
        <div class="panel"><div class="metric-label">Profit Factor</div><div class="metric-value">${pf || 'N/A'} ${pfPctTag}</div><div class="metric-sub">${pfDetail}</div></div>
        <div class="panel"><div class="metric-label">Average Win / Loss</div><div class="metric-value">${ratio || 'N/A'}</div><div class="ratio-bar"><span style="width:${avgWin + avgLoss ? 100 * avgWin / (avgWin + avgLoss) : 50}%"></span></div><div class="avg-win-loss-detail"><span><span class="positive">+${money(avgWin)}</span> <span class="avg-detail-label">avg win</span></span><span><span class="negative">-${money(avgLoss)}</span> <span class="avg-detail-label">avg loss</span></span></div></div>
    </section>`;
    return `<div class="pagehead"><div><h2>Trading Overview</h2><div class="dashboard-quote">“${esc(quote)}”</div></div></div>
        ${cards}
        <div class="dashboard-grid dashboard-analytics">
            <section class="panel"><div class="panel-head"><div><h3>Cumulative P&L</h3><p class="muted small">Running net profit and loss</p></div></div>${curve(ts)}</section>
            <section class="panel"><div class="panel-head"><div><h3>Performance Score</h3><p class="muted small">Six trading performance dimensions</p></div></div>${performanceRadar(ts)}</section>
        </div>
        <div class="dashboard-calendar dashboard-calendar-full">${calendarPage(true)}</div>`;
}
/** Daily net P&L uses closed-trade exit dates and recorded net results. */
function dailyPnLChart(trades) {
    const totals = new Map();
    for (const trade of trades) {
        const date = (trade.xdt || trade.dt || '').slice(0, 10);
        if (!date) continue;
        totals.set(date, (totals.get(date) || 0) + pnl(trade));
    }
    const entries = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30);
    if (!entries.length) return '';
    const max = Math.max(1, ...entries.map(([, value]) => Math.abs(value)));
    const bars = entries.map(([date, value]) => {
        const height = Math.max(1, Math.abs(value) / max * 43);
        const top = value >= 0 ? 48 - height : 48;
        const colour = value >= 0 ? 'var(--green)' : 'var(--red)';
        return `<div class="daily-pnl-item" title="${esc(date)}: ${esc(money(value))}" aria-label="${esc(date)}: ${esc(money(value))}">
            <div class="daily-pnl-bar" style="top:${top}%;height:${height}%;background:${colour}"></div>
        </div>`;
    }).join('');
    return `<section class="panel daily-pnl-panel">
        <div class="panel-head"><h3>Daily Net P&L</h3><span class="muted small">Last ${entries.length} trading days · hover for values</span></div>
        <div class="daily-pnl-chart" role="img" aria-label="Daily net profit and loss chart">
            <div class="daily-pnl-baseline"></div>${bars}
        </div>
    </section>`;
}

/** Peak-to-trough drawdown from the closed-trade cumulative net P&L curve. */
function drawdownChart(trades) {
    if (!trades.length) return `<section class="panel insight-panel"><h3>Relative Drawdown</h3><div class="empty">No closed trades yet</div></section>`;
    let equity = 0, peak = 0;
    const values = trades.map(trade => {
        equity += pnl(trade);
        peak = Math.max(peak, equity);
        return Math.max(0, peak - equity);
    });
    const maximum = Math.max(1, ...values);
    const bars = values.map((value, i) => `<div class="insight-bar-slot" title="After trade ${i + 1}: ${esc(money(value))} below peak"><span class="insight-bar negative-bar" style="height:${value / maximum * 100}%"></span></div>`).join('');
    return `<section class="panel insight-panel"><div class="panel-head"><h3>Drawdown From Peak</h3><span class="muted small">Maximum ${money(Math.max(...values))}</span></div><div class="insight-bars drawdown-bars">${bars}</div><p class="muted small">Cash drawdown based on recorded net P&L, not account equity percentage.</p></section>`;
}

/** Rolling win rate, using only complete 20-closed-trade windows. */
function rollingWinChart(trades) {
    const windowSize = 20;
    if (trades.length < windowSize) return `<section class="panel insight-panel"><h3>Win-Rate Trend</h3><div class="empty">At least 20 closed trades needed</div></section>`;
    const values = [];
    for (let i = windowSize - 1; i < trades.length; i++) {
        const sample = trades.slice(i - windowSize + 1, i + 1);
        values.push(100 * sample.filter(trade => pnl(trade) > 0).length / windowSize);
    }
    const x = i => 20 + (values.length === 1 ? 0 : i * 660 / (values.length - 1));
    const y = v => 185 - v * 1.55;
    const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const targets = values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="9" fill="transparent" tabindex="0"><title>Trades ${i + 1}–${i + windowSize}: ${v.toFixed(1)}% wins</title></circle>`).join('');
    return `<section class="panel insight-panel"><div class="panel-head"><h3>Win-Rate Trend</h3><span class="muted small">Last 20 closed trades per point</span></div><div class="insight-line"><svg viewBox="0 0 720 210" preserveAspectRatio="none" role="img" aria-label="Rolling 20-trade win rate"><line x1="20" y1="${y(50)}" x2="700" y2="${y(50)}" stroke="var(--border)" stroke-dasharray="4 5"/><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${targets}</svg></div><p class="muted small">Latest rolling win rate: ${values.at(-1).toFixed(1)}%</p></section>`;
}

/** Weekday net P&L, grouped by the recorded close date (UTC calendar date). */
function weekdayPerformanceChart(trades) {
    const totals = Array(7).fill(0);
    const counts = Array(7).fill(0);
    for (const trade of trades) {
        const date = (trade.xdt || trade.dt || '').slice(0, 10);
        const weekday = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`).getUTCDay() : NaN;
        if (!Number.isInteger(weekday)) continue;
        totals[weekday] += pnl(trade);
        counts[weekday]++;
    }
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return comparisonBars('P&L by weekday', names.map((name, i) => ({ name, value: totals[i], count: counts[i] })), 'Net P&L by close weekday · includes fees');
}

/** Per-instrument net P&L, using only instruments with recorded closed trades. */
function instrumentPerformanceChart(trades) {
    const groups = new Map();
    for (const trade of trades) {
        const symbol = String(trade.pair || trade.symbol || '').trim().toUpperCase();
        if (!symbol) continue;
        const item = groups.get(symbol) || { name: symbol, value: 0, count: 0 };
        item.value += pnl(trade);
        item.count++;
        groups.set(symbol, item);
    }
    const ranked = [...groups.values()].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8);
    return comparisonBars('P&L by instrument', ranked, 'Top 8 instruments by absolute net P&L');
}

/** Last six calendar months containing recorded closed trades. */
function monthlyPerformanceChart(trades) {
    const groups = new Map();
    for (const trade of trades) {
        const date = (trade.xdt || trade.dt || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(date)) continue;
        const item = groups.get(date) || { name: date, value: 0, count: 0 };
        item.value += pnl(trade);
        item.count++;
        groups.set(date, item);
    }
    const months = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(-6);
    return comparisonBars('Monthly net P&L', months, 'Last 6 months with closed trades');
}

/** Shared horizontal bars with a common zero point and accessible exact values. */
function comparisonBars(title, entries, subtitle) {
    if (!entries.some(item => item.count)) {
        return `<section class="panel insight-panel"><div class="panel-head"><h3>${title}</h3></div><div class="empty">No closed trades yet</div></section>`;
    }
    const maximum = Math.max(1, ...entries.map(item => Math.abs(item.value)));
    const rows = entries.map(item => {
        const value = item.value;
        const width = Math.abs(value) / maximum * 50;
        const left = value < 0 ? 50 - width : 50;
        const colour = value < 0 ? 'var(--red)' : 'var(--green)';
        const detail = `${item.name}: ${money(value)} · ${item.count} closed trade${item.count === 1 ? '' : 's'}`;
        return `<div class="comparison-row" title="${esc(detail)}">
            <span class="comparison-name" title="${esc(item.name)}">${esc(item.name)}</span>
            <div class="comparison-track"><span class="comparison-zero"></span><span class="comparison-bar" style="left:${left}%;width:${width}%;background:${colour}"></span></div>
            <span class="comparison-value ${value < 0 ? 'negative' : value > 0 ? 'positive' : ''}">${item.count ? money(value) : 'N/A'}</span>
        </div>`;
    }).join('');
    return `<section class="panel insight-panel"><div class="panel-head"><h3>${title}</h3></div><p class="muted small comparison-description">${subtitle}</p><div class="comparison-chart">${rows}</div></section>`;
}

function curve(ts) {
    if (!ts.length) return '<div class="empty">No Closed Trades Yet</div>';

    const ordered = [...ts].sort((a, b) => String(a.xdt || a.dt || '').localeCompare(String(b.xdt || b.dt || '')));
    const values = [0];
    for (const trade of ordered) values.push(values.at(-1) + pnl(trade));

    const low = Math.min(0, ...values);
    const high = Math.max(0, ...values);
    const range = high - low || 1;
    const x = i => 28 + i * 664 / Math.max(1, values.length - 1);
    const y = v => 258 - (v - low) / range * 220;
    const baseline = y(0);
    const points = values.map((v, i) => [x(i), y(v)]);
    // Match the performance radar: one accent-coloured area at 18% opacity,
    // with an accent-coloured outline and zero baseline.
    const linePath = points.map(([px, py], index) =>
        `${index === 0 ? 'M' : 'L'} ${px} ${py}`
    ).join(' ');
    const areaPath = `${linePath} L ${points.at(-1)[0]} ${baseline} L ${points[0][0]} ${baseline} Z`;
    const shapes = `<path d="${areaPath}" fill="var(--accent)" fill-opacity=".18" />`;
    const strokes = `<path d="${linePath}" fill="none" stroke="var(--accent)"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
    const hoverData = values.map((value, i) => ({
        x: x(i),
        y: y(value),
        amount: value,
        date: i === 0 ? 'Starting Point' : String(ordered[i - 1].xdt || ordered[i - 1].dt || '').slice(0, 10)
    }));
    const encodedData = encodeURIComponent(JSON.stringify(hoverData));

    return `<div class="cumulative-combined-chart" data-curve-points="${encodedData}">
        <svg viewBox="0 0 720 290" role="img" aria-label="Cumulative P&L with accent-coloured line and area fill" preserveAspectRatio="xMidYMid meet">
            <line x1="28" x2="692" y1="${baseline}" y2="${baseline}" stroke="var(--border)" stroke-width="1" />
            ${shapes}
            ${strokes}
            <circle class="cumulative-hover-dot" cx="28" cy="${baseline}" r="5" visibility="hidden" />
        </svg>
        <div class="cumulative-hover-tooltip" hidden></div>
    </div>`;
}

function performanceRadar(ts) {
    if (!ts.length) return '<div class="empty">Record closed trades to see your performance score</div>';
    // Descriptive, bounded indicators. Scores are not forecasts or a measure of trading skill.
    const ordered = [...ts].sort((a, b) => (a.xdt || a.dt).localeCompare(b.xdt || b.dt));
    const values = ordered.map(pnl);
    const winners = values.filter(v => v > 0), losers = values.filter(v => v < 0);
    const grossWin = winners.reduce((a, b) => a + b, 0);
    const grossLoss = -losers.reduce((a, b) => a + b, 0);
    const clamp = v => Math.max(0, Math.min(1, v));
    const rate = winners.length / values.length;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    const avgWin = winners.length ? grossWin / winners.length : 0;
    const avgLoss = losers.length ? grossLoss / losers.length : 0;
    const payoff = avgLoss ? avgWin / avgLoss : avgWin ? Infinity : 0;
    const daily = new Map();
    for (const t of ordered) {
        const date = (t.xdt || t.dt || '').slice(0, 10);
        if (date) daily.set(date, (daily.get(date) || 0) + pnl(t));
    }
    const days = [...daily.values()];
    const consistency = days.length ? days.filter(v => v > 0).length / days.length : 0;
    let equity = 0, peak = 0, maxDD = 0;
    for (const v of values) {
        equity += v;
        peak = Math.max(peak, equity);
        maxDD = Math.max(maxDD, peak - equity);
    }
    const net = values.reduce((a, b) => a + b, 0);
    const drawdownControl = grossWin + grossLoss ? clamp(1 - maxDD / (grossWin + grossLoss)) : 0;
    const recovery = maxDD ? clamp((net / maxDD) / 3) : net > 0 ? 1 : 0;
    const metrics = [
        ['Win %', rate],
        ['Profit factor', clamp(profitFactor / 3)],
        ['Avg win/loss', clamp(payoff / 3)],
        ['Drawdown', drawdownControl],
        ['Recovery', recovery],
        ['Consistency', consistency]
    ];
    const cx = 210, cy = 185, R = 140;
    const xy = (i, r) => { const a = -Math.PI / 2 + i * Math.PI / 3; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    const polygon = r => metrics.map((_, i) => xy(i, r).map(v => v.toFixed(1)).join(',')).join(' ');
    const shape = metrics.map((m, i) => xy(i, m[1] * R).map(v => v.toFixed(1)).join(',')).join(' ');
    const grid = [.25, .5, .75, 1].map(v => `<polygon points="${polygon(R * v)}" fill="none" stroke="var(--border)" stroke-width="1"/>`).join('');
    const axes = metrics.map((_, i) => { const [x, y] = xy(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border)"/>`; }).join('');
    const labels = metrics.map(([label, v], i) => { const [x, y] = xy(i, R + 27); return `<text x="${x}" y="${y + 4}" text-anchor="middle" fill="var(--muted)" font-size="11"><title>${label}: ${Math.round(v * 100)} / 100</title>${label}</text>`; }).join('');
    return `<div class="radar-wrap"><svg viewBox="0 0 420 370" role="img" aria-label="Trading performance radar chart across six dimensions"><title>Six trading performance dimensions based on closed trades</title>${grid}${axes}<polygon points="${shape}" fill="var(--accent)" fill-opacity=".18" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>${labels}</svg></div>`;
}

function tradeSession(dt) {
    // Entry time is interpreted as entered; session boundaries are in UTC.
    // Overlap periods are deliberately classified separately.
    if (!dt || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(dt)) return '';
    const minutes = Number(dt.slice(11, 13)) * 60 + Number(dt.slice(14, 16));
    if (minutes >= 13 * 60 && minutes < 16 * 60) return 'London / New York overlap';
    if (minutes >= 8 * 60 && minutes < 16 * 60) return 'London';
    if (minutes >= 13 * 60 && minutes < 22 * 60) return 'New York';
    if (minutes >= 0 && minutes < 9 * 60) return 'Tokyo';
    return 'Sydney / Asia';
}
function tradeDuration(t) {
    if (!t.dt || !t.xdt) return '';
    const delta = (new Date(t.xdt).getTime() - new Date(t.dt).getTime()) / 60000;
    if (!Number.isFinite(delta) || delta < 0) return '';
    return delta >= 1440 ? `${Math.floor(delta / 1440)}d ${Math.floor(delta % 1440 / 60)}h` : delta >= 60 ? `${Math.floor(delta / 60)}h ${Math.floor(delta % 60)}m` : `${Math.round(delta)}m`;
}
function plannedRR(t) {
    const entry = Number(t.entry), stop = Number(t.stopLoss), target = Number(t.takeProfit);
    if (!(entry > 0 && stop > 0 && target > 0)) return '';
    const direction = t.side === 'Sell' ? -1 : 1;
    const risk = (entry - stop) * direction;
    const reward = (target - entry) * direction;
    return risk > 0 && reward > 0 ? `1:${(reward / risk).toFixed(2)}` : '';
}
function viewTrade(id) {
    const t = data.trades.find(item => item.id === id);
    if (!t) return;
    const cell = (label, value) => `<div class="trade-detail-cell"><span class="muted small">${label}</span><strong>${esc(value === null || value === undefined || String(value).trim() === '' || String(value).trim() === '—' ? 'N/A' : value)}</strong></div>`;
    const shots = (t.screenshots || []).map((item, i) => {
        const src = screenshotSrc(item);
        return src ? `<a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="Trade screenshot ${i + 1}" class="trade-detail-image"></a>` : '';
    }).join('');
    const body = `<div class="trade-detail-grid">
        ${cell('Instrument', t.pair)}${cell('Account', acctName(t.account))}
        ${cell('Direction', t.side === 'Sell' ? 'Short' : 'Long')}${cell('Result', labelResult(t))}
        ${cell('Entry', t.entry)}${cell('Exit', t.exit ?? '')}
        ${cell('Entry Date', t.dt?.replace('T', ' ') || '')}${cell('Exit Date', t.xdt?.replace('T', ' ') || '')}
        ${cell('Session', t.session || '')}${cell('Duration', tradeDuration(t))}
        ${cell('Position Size', t.lots)}${cell('Gross P&L', t.pl == null ? '' : money(t.pl))}
        ${cell('Commission', money(t.comm))}${cell('Other Fees', money(t.charges))}
        ${cell('Net P&L', closed(t) ? money(pnl(t)) : '')}${cell('Planned R:R', plannedRR(t))}
        ${cell('Stop Loss', t.stopLoss ?? '')}${cell('Take Profit', t.takeProfit ?? '')}
        ${cell('Strategy', t.setup || '')}${cell('Reviewed', t.reviewed ? 'Yes' : 'No')}
        ${cell('Tags', t.tags || '')}${cell('Mistakes / Lessons', t.mistakes || '')}
    </div><div class="trade-detail-notes"><strong>Notes</strong><p>${t.notes ? esc(t.notes) : 'None'}</p></div><div class="trade-detail-notes"><strong>Screenshots</strong>${shots ? `<div class="trade-detail-shots">${shots}</div>` : '<p>None</p>'}</div>`;
    openModal('Trade Details', body, `<button type="button" class="btn" data-action="close">Close</button><button type="button" class="btn primary" data-action="edit-viewed-trade">Edit Trade</button>`);
    modal.dataset.trade = id;
}

function resultsChart(w, l, b) {
    const total = w + l + b; if (!total)
        return '<div class="empty">No closed trades yet</div>'; const parts = [['Wins', w, 'var(--green)'], ['Losses', l, 'var(--red)'], ['Breakeven', b, 'var(--muted)']]; return `<div class="results-chart" role="img" aria-label="Trade results: ${w} wins, ${l} losses, ${b} breakeven"><div class="results-bars">${parts.map(([name, n, color]) => `<div class="results-bar-col"><strong>${n}</strong><div class="results-bar-track"><div class="results-bar" style="height:${n ? Math.max(4, 100 * n / Math.max(w, l, b)) : 0}%;background:${color}"></div></div><span>${name}</span></div>`).join('')}</div></div>`;
}
// TradingView-style symbol icons. Explicit matches are preferred to guesses.
const CURRENCY = {
    USD:'us', EUR:'eu', GBP:'gb', JPY:'jp', AUD:'au', NZD:'nz',
    CAD:'ca', CHF:'ch', CNH:'cn', CNY:'cn', SGD:'sg', HKD:'hk',
    ZAR:'za', MXN:'mx', TRY:'tr', SEK:'se', NOK:'no', DKK:'dk',
    PLN:'pl', INR:'in', BRL:'br'
};
// Verified-style mappings by market. Do not guess logos for unknown tickers.
// The actual TradingView-hosted SVG is displayed when the path exists.
const SYMBOL_LOGOS = {
    XAUUSD:'metal/gold', XAGUSD:'metal/silver', XPTUSD:'metal/platinum',
    XPDUSD:'metal/palladium', GOLD:'metal/gold', SILVER:'metal/silver',
    BTC:'crypto/XTVCBTC', ETH:'crypto/XTVCETH', SOL:'crypto/XTVCSOL',
    ADA:'crypto/XTVCADA', DOGE:'crypto/XTVCDOGE', XRP:'crypto/XTVCXRP',
    LTC:'crypto/XTVCLTC', DOT:'crypto/XTVCDOT', LINK:'crypto/XTVCLINK',
    AVAX:'crypto/XTVCAVAX', BNB:'crypto/XTVCBNB', TRX:'crypto/XTVCTRX',
    BCH:'crypto/XTVCBCH', UNI:'crypto/XTVCUNI', ATOM:'crypto/XTVCATOM',
    SPX:'indices/s-and-p-500', SPX500:'indices/s-and-p-500',
    US500:'indices/s-and-p-500', NDX:'indices/nasdaq-100',
    NAS100:'indices/nasdaq-100', US100:'indices/nasdaq-100',
    DJI:'indices/dow-jones-industrial-average',
    US30:'indices/dow-jones-industrial-average',
    DAX:'indices/dax', DE40:'indices/dax', GER40:'indices/dax',
    UK100:'indices/ftse-100', FTSE:'indices/ftse-100',
    VIX:'indices/volatility-s-and-p-500',
    AAPL:'apple', MSFT:'microsoft', NVDA:'nvidia', TSLA:'tesla',
    AMZN:'amazon', META:'meta-platforms', GOOGL:'alphabet', GOOG:'alphabet',
    JPM:'jpmorgan-chase', V:'visa', MA:'mastercard',
    JNJ:'johnson-and-johnson', BAC:'bank-of-america',
    HD:'home-depot', BRKB:'berkshire-hathaway',
    UNH:'unitedhealth-group'
};
const CRYPTO_BASES = new Set([
    'BTC','ETH','SOL','ADA','DOGE','XRP','LTC','DOT','LINK','AVAX',
    'BNB','TRX','BCH','UNI','ATOM'
]);
const CRYPTO_QUOTES = ['USDT','USDC','BUSD','USD','BTC','ETH','EUR','GBP'];
// A future is identified by its contract root, not by a guessed ticker logo.
const FUTURE_UNDERLYING = {
    GC:'XAUUSD', MGC:'XAUUSD', SI:'XAGUSD', SIL:'XAGUSD',
    ES:'SPX', MES:'SPX', NQ:'NDX', MNQ:'NDX',
    YM:'DJI', MYM:'DJI', RTY:'RUT', M2K:'RUT',
    VX:'VIX'
};
const ETF_LOGOS = {
    SPY:'spdr-s-and-p-500-etf-trust',
    QQQ:'invesco-qqq-trust',
    IWM:'ishares-russell-2000-etf',
    GLD:'spdr-gold-shares',
    SLV:'ishares-silver-trust',
    TLT:'ishares-20-plus-year-treasury-bond-etf'
};
function instrumentChart(ts) {
    const totals = new Map(); for (const t of ts) {
        const k = String(t.pair || 'Unknown').toUpperCase();
        totals.set(k, (totals.get(k) || 0) + pnl(t));
    } const rows = [...totals].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6); if (!rows.length)
        return '<div class="empty">No closed trades yet</div>'; const max = Math.max(...rows.map(x => Math.abs(x[1])), 1); return `<div class="instrument-chart">${rows.map(([name, value]) => `<div class="instrument-chart-row"><span title="${esc(name)}">${esc(name)}</span><div class="instrument-chart-track"><div class="instrument-chart-fill ${value < 0 ? 'is-loss' : ''}" style="width:${Math.max(1, Math.abs(value) / max * 100)}%"></div></div><strong class="${value >= 0 ? 'positive' : 'negative'}">${value > 0 ? '+' : ''}${money(value)}</strong></div>`).join('')}</div>`;
}
// TradingView's image host is a best-effort source, not a public logo lookup API.
// Never attach an unrelated logo to a ticker with ambiguous meaning.
function assetIcon(symbol) {
    const raw = String(symbol || '').trim().toUpperCase();
    if (!raw) return '<span class="asset-icon" aria-hidden="true"></span>';
    const fullTicker = raw.split(':').pop().replace(/\\.[A-Z0-9]+$/, '');
    const ticker = fullTicker.replace(/[^A-Z0-9!]/g, '');
    const root = 'https://s3-symbol-logo.tradingview.com/';
    const forex = /^[A-Z]{6}$/.test(ticker) &&
        CURRENCY[ticker.slice(0, 3)] && CURRENCY[ticker.slice(3, 6)];
    if (forex) {
        const flag = code => {
            const country = CURRENCY[code];
            const urls = [root + 'country/' + country.toUpperCase() + '.svg',
                'https://flagcdn.com/w80/' + country + '.png'];
            return `<span class="asset-flag"><span class="asset-flag-fallback">${esc(code)}</span>${logoImage(urls)}</span>`;
        };
        return `<span class="asset-pair" aria-label="${esc(ticker)}">${flag(ticker.slice(0,3))}${flag(ticker.slice(3,6))}</span>`;
    }
    let match = SYMBOL_LOGOS[ticker] || ETF_LOGOS[ticker];
    if (!match) {
        for (const quote of CRYPTO_QUOTES) {
            if (ticker.endsWith(quote)) {
                const base = ticker.slice(0, -quote.length);
                if (CRYPTO_BASES.has(base)) {
                    match = SYMBOL_LOGOS[base];
                    break;
                }
            }
        }
    }
    if (!match) {
        // Continuous futures (ES1!, MES1!) and dated futures (ESZ2026).
        const m = ticker.match(/^([A-Z]{1,3})(?:[FGHJKMNQUVXZ]\\d{1,4}|\\d+!)$/);
        if (m) match = SYMBOL_LOGOS[FUTURE_UNDERLYING[m[1]]];
    }
    const fallback = esc(ticker.replace(/!$/, '').slice(0, 4));
    const urls = match ? [root + match + '.svg'] : [];
    return `<span class="asset-icon asset-icon-native" title="${esc(raw)}"><span class="asset-fallback">${fallback}</span>${logoImage(urls)}</span>`;
}
function logoImage(urls) {
    if (!urls.length) return '';
    const options = esc(JSON.stringify(urls.slice(1)));
    return `<img loading="lazy" alt="" src="${esc(urls[0])}" data-logo-options="${options}" onerror="try{const q=JSON.parse(this.dataset.logoOptions||'[]');if(q.length){this.src=q.shift();this.dataset.logoOptions=JSON.stringify(q)}else this.remove()}catch(e){this.remove()}">`;
}
function table(ts) {
    if (!ts.length) return '<div class="empty">No trades to display. Add a trade to get started.</div>';
    const show = value => value === null || value === undefined || String(value).trim() === '' || String(value).trim() === '—' ? 'N/A' : esc(String(value));
    const row = t => {
        const direction = t.side === 'Sell' ? 'Short' : t.side === 'Buy' ? 'Long' : 'N/A';
        const result = labelResult(t);
        const accountName = acctName(t.account);
        return `<tr class="clickable" data-edit="${esc(t.id)}">
            <td>${show((t.dt || '').slice(0, 10))}</td>
            <td><span class="instrument">${assetIcon(t.pair)}<strong>${show(t.pair)}</strong></span></td>
            <td>${direction === 'N/A' ? '<span class="muted">N/A</span>' : `<span class="result ${direction.toLowerCase()}">${direction}</span>`}</td>
            <td>${show(accountName)}</td>
            <td>${show(t.lots)}</td>
            <td>${result && result !== '—' ? `<span class="result ${esc(result.toLowerCase())}">${esc(result)}</span>` : ''}</td>
            <td class="right ${closed(t) ? pnl(t) > 0 ? 'positive' : pnl(t) < 0 ? 'negative' : '' : ''}">${closed(t) ? money(pnl(t)) : '<span class="muted">N/A</span>'}</td>
        </tr>`;
    };
    return `<div class="tablewrap"><table class="trades-table"><colgroup><col class="col-date"><col class="col-instrument"><col class="col-direction"><col class="col-account"><col class="col-size"><col class="col-result"><col class="col-pnl"></colgroup><thead><tr><th>Date</th><th>Instrument</th><th>Direction</th><th>Account</th><th>Size</th><th>Result</th><th class="right">Net P&L</th></tr></thead><tbody>${ts.map(row).join('')}</tbody></table></div>`;
}
function tradeHistorySummary(trades) {
    const finished = trades.filter(closed);
    const net = finished.reduce((total, trade) => total + pnl(trade), 0);
    const best = finished.length ? Math.max(...finished.map(pnl)) : null;
    const worst = finished.length ? Math.min(...finished.map(pnl)) : null;
    const selectedAccounts = accounts().filter(a => account === 'all' || a.id === account);
    const balance = selectedAccounts.reduce((total, a) => {
        const flows = Array.isArray(a.flows) ? a.flows : [];
        return total + flows.reduce((sum, f) => sum + (f.type === 'deposit' ? num(f.amount) : f.type === 'withdrawal' ? -num(f.amount) : 0), 0);
    }, 0) + data.trades.filter(t => closed(t) && (account === 'all' || t.account === account)).reduce((sum, t) => sum + pnl(t), 0);
    const balanceText = selectedAccounts.length ? money(balance) : '';
    return `<div class="trade-summary-grid">
        <div class="trade-summary-item"><span>Net P&L</span><strong class="${net >= 0 ? 'positive' : 'negative'}">${finished.length ? money(net) : 'N/A'}</strong></div>
        <div class="trade-summary-item"><span>Best Trade</span><strong class="positive">${best === null ? 'N/A' : money(best)}</strong></div>
        <div class="trade-summary-item"><span>Worst Trade</span><strong class="negative">${worst === null ? 'N/A' : money(worst)}</strong></div>
    </div>`;
}

function tradesPage() { const shown = filtered(); return `<div class="pagehead"><div><h2>Trade History</h2><div class="muted">Search, record and review your trades.</div></div><div><button type="button" class="btn" data-action="import">Import</button> <button type="button" class="btn" data-action="export">Export</button></div></div><div class="toolbar"><select id="account-filter" aria-label="Filter trading account"><option value="all">All accounts</option>${accounts().map(a => `<option value="${esc(a.id)}" ${account === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select><input id="search" placeholder="Search instruments, notes…" value="${esc(search)}"><select id="result-filter"><option value="all">All results</option>${['open', 'win', 'loss', 'breakeven'].map(v => `<option value="${v}" ${filter === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select><span class="muted small">${shown.length} trades</span>${tradesBalance()}</div>${tradeHistorySummary(shown)}${table(filtered().sort((a, b) => String(b.dt || '').localeCompare(String(a.dt || ''))))}`; }
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
        cells.push(`<div class="week-total"><strong class="${weekTotal > 0 ? 'positive' : weekTotal < 0 ? 'negative' : ''}">${weekTrades ? `${weekTotal > 0 ? '+' : ''}${money(weekTotal)}` : 'N/A'}</strong><span>${weekTrades ? `${weekTrades} trade${weekTrades === 1 ? '' : 's'}` : '0 trades'}</span></div>`);
    } const chosen = byDay[selectedDay] || []; return `${embedded ? '' : '<div class="pagehead"><div><h2>Trading Calendar</h2><div class="muted">Daily results at a glance.</div></div></div>'}<section class="panel calendar-panel"><div class="calendar-head calendar-picker" aria-label="Choose calendar month and year"><button type="button" class="calendar-nav-btn" data-action="calendar-prev-year" aria-label="Previous year" title="Previous year"><span aria-hidden="true">&laquo;</span></button><button type="button" class="calendar-nav-btn" data-action="calendar-prev-month" aria-label="Previous month" title="Previous month"><span aria-hidden="true">&lsaquo;</span></button><label class="calendar-picker-field"><select id="calendar-month" aria-label="Calendar month">${Array.from({ length: 12 }, (_, i) => `<option value="${i}" ${i === month ? 'selected' : ''}>${new Date(2024, i, 1).toLocaleString('en-GB', { month: 'long' })}</option>`).join('')}</select></label><label class="calendar-picker-field"><select id="calendar-year" aria-label="Calendar year">${Array.from({ length: 201 }, (_, i) => 1900 + i).map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></label><button type="button" class="calendar-nav-btn" data-action="calendar-next-month" aria-label="Next month" title="Next month"><span aria-hidden="true">&rsaquo;</span></button><button type="button" class="calendar-nav-btn" data-action="calendar-next-year" aria-label="Next year" title="Next year"><span aria-hidden="true">&raquo;</span></button></div><div class="calendar-scroll"><div class="calgrid">${cells.join('')}</div></div><div class="calendar-footer"><span>${tradeDays} trading days · ${greenDays} green</span><span>Month: <strong class="${monthly >= 0 ? 'positive' : 'negative'}">${monthly > 0 ? '+' : ''}${money(monthly)}</strong></span></div></section>${selectedDay ? `<section class="selected-day"><div class="panel-head"><h3>${esc(selectedDay)} · ${chosen.length} trades</h3><button type="button" class="btn" data-action="clear-day">Clear selection</button></div>${table(chosen)}</section>` : ''}`;
}
function accountFigures(a) {
    const flows = Array.isArray(a.flows) ? a.flows : [];
    const deposits = flows.filter(f => f.type === 'deposit').reduce((v, f) => v + num(f.amount), 0);
    const withdrawals = flows.filter(f => f.type === 'withdrawal').reduce((v, f) => v + num(f.amount), 0);
    const trades = data.trades.filter(t => t.account === a.id && closed(t));
    const net = trades.reduce((v, t) => v + pnl(t), 0);
    return { deposits, withdrawals, net, balance: deposits - withdrawals + net, count: trades.length };
}
function settingsPage() { const prefs = data.preferences || {}; return `<div class="pagehead"><div><h2>Settings</h2><div class="muted">Manage your trading accounts and journal.</div></div></div><div class="settings-stack"><section class="panel"><div class="panel-head"><h3>Trading Accounts</h3><button type="button" class="btn" data-action="add-account">+ Add account</button></div><div class="account-list">${accounts().map(a => { const f = accountFigures(a); return `<article class="account-card"><div class="account-card-head"><div><strong>${esc(a.name)}</strong><div class="small muted">${esc(a.broker || 'Broker not set')} · ${esc(a.type || 'Other')}${a.currency ? ' · ' + esc(a.currency) : ''}</div></div><button type="button" class="btn" data-account-edit="${esc(a.id)}">Edit</button></div><div class="account-figures"><div><span>Estimated balance</span><strong>${money(f.balance)}</strong></div><div><span>Deposits</span><strong>${money(f.deposits)}</strong></div><div><span>Withdrawals</span><strong>${money(f.withdrawals)}</strong></div><div><span>Closed trade P&L</span><strong class="${f.net >= 0 ? 'positive' : 'negative'}">${money(f.net)}</strong></div><div><span>Closed trades</span><strong>${f.count}</strong></div></div><div class="account-foot"><span class="small muted">Calculated from recorded activity, not a live broker balance.</span><button type="button" class="btn" data-account-flow="${esc(a.id)}">Deposit / withdrawal</button></div></article>`; }).join('') || '<p class="muted">No accounts yet.</p>'}</div></section><section class="panel settings-profile"><div class="panel-head"><h3>Profile & Security</h3></div><div class="profile-fields"><div class="field"><label>Username</label><div class="profile-value">${esc(user?.user_metadata?.username || 'Not set')}</div><button type="button" class="btn" data-action="profile-username">Change Username</button></div><div class="field"><label>Email Address</label><div class="profile-value">${esc(user?.email || 'Not available')}</div><button type="button" class="btn" data-action="profile-email">Change Email</button></div><div class="field"><label>Password</label><div class="profile-value">••••••••</div><button type="button" class="btn" data-action="profile-password">Change Password</button></div></div><p class="small muted">Email changes may require confirmation through your email inbox. Password changes may require a recent sign-in.</p></section><div class="settings-lower"><section class="panel settings-appearance"><h3>Appearance</h3><div class="field"><label for="theme">Theme</label><select id="theme"><option value="light" ${prefs.theme !== 'dark' ? 'selected' : ''}>Light</option><option value="dark" ${prefs.theme === 'dark' ? 'selected' : ''}>Dark (black)</option></select></div><div class="field"><label for="accent">Custom accent colour</label><div class="accent-row"><input id="accent" type="color" value="${/^#[0-9a-fA-F]{6}$/.test(prefs.accent || '') ? prefs.accent : '#2563eb'}"><button type="button" class="btn" data-action="reset-accent">Reset colour</button></div></div><div class="field"><label for="quote">Dashboard quote</label><textarea id="quote" maxlength="180" placeholder="Your trading quote…">${esc(prefs.quote || '')}</textarea><button type="button" class="btn" data-action="save-quote">Save quote</button></div></section><section class="panel settings-data"><h3>Data & Account</h3><p class="muted">Back up your journal or import existing trades.</p><div class="toolbar"><button type="button" class="btn" data-action="export">Export backup</button><button type="button" class="btn" data-action="import">Import file</button></div><div class="account-danger-actions"><button type="button" class="btn" data-action="signout">Sign Out</button><button type="button" class="btn danger" data-action="erase-journal">Erase Journal</button><button type="button" class="btn danger" data-action="delete-profile">Delete Account</button></div><div class="risk-disclaimer"><strong>Risk Disclaimer:</strong> Trading in financial markets and leveraged instruments involves risk, including capital loss. Pipfolio is a trade journaling and analytics platform for informational purposes only, not financial advice, investment recommendations or trading signals. Trading decisions are at your own risk. Past performance does not guarantee future results. Assess circumstances and practise responsible risk management.</div></section></div></div>`; }
function openModal(title, body, footer = '') { if (modal.open) modal.close(); modal.className = 'dialog'; modal.innerHTML = `<div class="dialog-head"><h3>${esc(title)}</h3><button type="button" class="btn" data-action="close">✕</button></div><div class="dialog-body">${body}</div>${footer ? `<div class="dialog-foot">${footer}</div>` : ''}`; modal.showModal(); }
function field(name, label, value = '', type = 'text', extra = '') { return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`; }
function tradeEditor(id) {
    const t = data.trades.find(x => x.id === id);
    const now = local();
    if (!accounts().length) {
        toast('Add a trading account in Settings first.');
        view = 'settings';
        render();
        return;
    }
    const v = t || {
        account: account !== 'all' ? account : accounts()[0].id,
        dt: now,
        side: 'Buy',
        lots: 0.01,
        comm: 0
    };
    const sessionOptions = ['Auto (UTC)', 'Sydney', 'Tokyo', 'London', 'New York', 'London / New York overlap', 'Sydney / Asia', 'Other'];
    const body = `<form id="trade-form" class="form-grid">
        <div class="field"><label for="f-account">Trading Account</label><select id="f-account" name="account">${accounts().map(a => `<option value="${esc(a.id)}" ${v.account === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
        ${field('pair', 'Instrument', v.pair || '', 'text', 'required maxlength="20" placeholder="XAUUSD"')}
        <div class="field"><label for="f-side">Direction</label><select id="f-side" name="side"><option value="Buy" ${v.side === 'Buy' ? 'selected' : ''}>Buy / Long</option><option value="Sell" ${v.side === 'Sell' ? 'selected' : ''}>Sell / Short</option></select></div>
        ${field('lots', 'Position Size (Lots)', v.lots, 'number', 'required min="0.000001" step="any"')}
        ${field('dt', 'Entry Date & Time', dateInputValue(v.dt) || now, 'datetime-local', 'required')}
        ${field('entry', 'Entry Price', v.entry ?? '', 'number', 'required min="0.00000001" step="any"')}
        ${field('stopLoss', 'Stop Loss', v.stopLoss ?? '', 'number', 'min="0.00000001" step="any"')}
        ${field('takeProfit', 'Take Profit', v.takeProfit ?? '', 'number', 'min="0.00000001" step="any"')}
        <div class="field"><label for="f-session">Trading Session</label><select id="f-session" name="session">${sessionOptions.map(x => `<option value="${x === 'Auto (UTC)' ? '' : x}" ${(v.session || '') === (x === 'Auto (UTC)' ? '' : x) ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        ${field('xdt', 'Exit Date & Time', dateInputValue(v.xdt) || '', 'datetime-local')}
        ${field('exit', 'Exit Price', v.exit ?? '', 'number', 'min="0.00000001" step="any"')}
        ${field('pl', 'Gross P&L', v.pl ?? '', 'number', 'step="any"')}
        ${field('comm', 'Commission', v.comm ?? 0, 'number', 'min="0" step="any"')}
        <div class="field full"><div class="trade-auto-summary" id="trade-auto-summary" aria-live="polite"></div></div>
        <div class="field full"><label for="f-notes">Trade Notes (Optional)</label><textarea id="f-notes" name="notes" maxlength="5000" placeholder="Setup, execution or lessons learned">${esc(v.notes || '')}</textarea></div>
        <div class="field full"><label for="trade-screenshot-upload">Screenshots (Optional)</label><input id="trade-screenshot-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple><div id="screenshot-list" class="screenshot-list"></div></div>
    </form>`;
    openModal(t ? 'Edit Trade' : 'Add Trade', body, `${t ? '<button type="button" class="btn danger" data-action="delete-trade">Delete Trade</button>' : ''}<button type="button" class="btn" data-action="close">Cancel</button><button type="button" class="btn primary" data-action="save-trade">Save Trade</button>`);
    modal.dataset.trade = id || '';
    screenshotDraft = Array.isArray(v.screenshots) ? structuredClone(v.screenshots) : [];
    renderScreenshots();
    updateTradePreview();
}

function updateTradePreview() {
    const form = modal.querySelector('#trade-form'), output = modal.querySelector('#trade-auto-summary');
    if (!form || !output) return;
    const f = new FormData(form), get = key => String(f.get(key) || '');
    const t = { dt: get('dt'), xdt: get('xdt'), entry: get('entry'), stopLoss: get('stopLoss'), takeProfit: get('takeProfit'), side: get('side') };
    const net = get('pl') !== '' ? Number(get('pl')) - Number(get('comm') || 0) - Number(get('charges') || 0) : null;
    const session = get('session') || tradeSession(t.dt);
    output.innerHTML = `<div><span>Session</span><strong>${esc(session)}</strong></div><div><span>Duration</span><strong>${esc(tradeDuration(t))}</strong></div><div><span>Planned R:R</span><strong>${esc(plannedRR(t))}</strong></div><div><span>Net P&L</span><strong>${net === null ? '' : esc(money(net))}</strong></div>`;
}
modal.addEventListener('input', e => { if (e.target.closest('#trade-form')) updateTradePreview(); });
modal.addEventListener('change', e => { if (e.target.closest('#trade-form')) updateTradePreview(); });
function screenshotSrc(item) { return typeof item === 'string' ? item : (item?.data || item?.url || item?.src || ''); }
function renderScreenshots() {
    const el = modal.querySelector('#screenshot-list'); if (!el)
        return; el.innerHTML = screenshotDraft.map((item, i) => { const src = screenshotSrc(item); return src ? `<div class="screenshot-item"><a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="Trade screenshot ${i + 1}"></a><button type="button" class="screenshot-remove" data-remove-screenshot="${i}" aria-label="Remove screenshot ${i + 1}">×</button></div>` : ''; }).join('');
}
function readScreenshot(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('Could not read screenshot')); reader.readAsDataURL(file); }); }
modal.addEventListener('change', async (e) => {
    if (e.target.id !== 'trade-screenshot-upload')
        return; const files = [...e.target.files]; const uploadDialog = modal.querySelector('#trade-form'); e.target.value = ''; for (const file of files) {
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
                toast('Only PNG, JPEG, WebP and GIF images are supported.');
                continue;
            }
            if (file.size > 3 * 1024 * 1024) {
                toast('Each screenshot must be smaller than 3 MB.');
                continue;
            }
            try {
                const imageData = await readScreenshot(file);
                if (!modal.open || modal.querySelector('#trade-form') !== uploadDialog) return;
                screenshotDraft.push(imageData);
            }
            catch (err) {
                toast(err.message);
            }
        } if (modal.open && modal.querySelector('#trade-form') === uploadDialog) renderScreenshots();
});
modal.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-screenshot]'); if (!btn)
        return; e.preventDefault(); e.stopPropagation(); const i = Number(btn.dataset.removeScreenshot); if (!confirm('Remove this screenshot from the trade when you save?'))
        return; screenshotDraft.splice(i, 1); renderScreenshots();
});
async function saveTrade() {
    const form = document.getElementById('trade-form'); if (!form.reportValidity())
        return; const f = new FormData(form), get = k => String(f.get(k) || '').trim(), id = modal.dataset.trade, old = data.trades.find(t => t.id === id), dt = get('dt'), xdt = get('xdt'); if (xdt && Date.parse(xdt) < Date.parse(dt)) {
        // Imported trades may contain legacy inconsistent timestamps. Do not prevent
        // editing unrelated details unless either date was actually changed.
        const originalEntry = old ? dateInputValue(old.dt) : '';
        const originalExit = old ? dateInputValue(old.xdt) : '';
        if (!old || dt !== originalEntry || xdt !== originalExit)
            return toast('Exit cannot be before entry. Check the dates and timezone.');
    } if (get('pl') && !xdt && !get('exit'))
        return toast('Enter an exit date or exit price for a closed trade.'); const n = clone(), t = { ...(old || {}), id: id || uid(), account: get('account'), pair: get('pair').toUpperCase(), side: get('side'), lots: Number(get('lots')), dt, xdt, entry: Number(get('entry')), exit: get('exit') ? Number(get('exit')) : null, pl: get('pl') ? Number(get('pl')) : null, comm: Number(get('comm') || 0), charges: old?.charges ?? 0, session: get('session') || tradeSession(dt), setup: old?.setup || '', stopLoss: get('stopLoss') ? Number(get('stopLoss')) : null, takeProfit: get('takeProfit') ? Number(get('takeProfit')) : null, tags: old?.tags || '', mistakes: old?.mistakes || '', reviewed: old?.reviewed || false, notes: get('notes'), updated: Date.now(), created: old?.created || Date.now(), sample: old?.sample || false, screenshots: structuredClone(screenshotDraft) }; if (!(t.entry > 0 && t.lots > 0))
        return toast('Entry price and position size must be greater than zero.'); if (t.stopLoss !== null && t.stopLoss <= 0 || t.takeProfit !== null && t.takeProfit <= 0) return toast('Stop Loss and Take Profit must be positive prices.'); if (t.stopLoss !== null && (t.side === 'Buy' ? t.stopLoss >= t.entry : t.stopLoss <= t.entry)) return toast('Stop Loss must be below entry for buys and above entry for sells.'); if (t.takeProfit !== null && (t.side === 'Buy' ? t.takeProfit <= t.entry : t.takeProfit >= t.entry)) return toast('Take Profit must be above entry for buys and below entry for sells.'); if (t.exit !== null && t.exit <= 0)
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
function accountEditor(id) { const a = accounts().find(x => x.id === id); openModal(a ? 'Edit account' : 'Add account', `<form id="account-form" class="form-grid">${field('name', 'Account name', a?.name || '', 'text', 'required maxlength="70"')}${field('broker', 'Broker / firm', a?.broker || '', 'text', 'maxlength="100"')}<div class="field"><label>Account type</label><select name="type">${['Personal', 'Funded', 'Demo', 'Other'].map(x => `<option ${a?.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="field"><label>Currency</label><select name="currency">${['USD', 'EUR', 'GBP', 'XCD', 'CAD', 'AUD', 'JPY', 'Other'].map(x => `<option ${((a?.currency || 'USD') === x) ? 'selected' : ''}>${x}</option>`).join('')}</select></div>${field('accountNumber', 'Account reference (optional)', a?.accountNumber || '', 'text', 'maxlength="80"')}<div class="field full"><label>Notes (optional)</label><textarea name="notes" maxlength="500">${esc(a?.notes || '')}</textarea></div></form>`, `${a ? '<button type="button" class="btn danger" data-action="delete-account">Delete account</button>' : ''}<button type="button" class="btn" data-action="close">Cancel</button><button type="button" class="btn primary" data-action="save-account">Save</button>`); modal.dataset.account = id || ''; }
async function saveAccount() {
    const f = document.getElementById('account-form');
    if (!f?.reportValidity()) return;
    const vals = new FormData(f);
    const n = clone();
    const id = modal.dataset.account;
    const a = accounts().find(x => x.id === id);
    const get = k => String(vals.get(k) || '').trim();
    const next = {
        ...(a || { id: uid(), flows: [] }),
        name: get('name'), type: get('type'), broker: get('broker'),
        currency: get('currency'), startingBalance: 0,
        accountNumber: get('accountNumber'), notes: get('notes')
    };
    if (a) n.settings.accounts = n.settings.accounts.map(x => x.id === id ? next : x);
    else n.settings.accounts.push(next);
    if (await save(n)) {
        modal.close();
        toast('Account saved');
    }
}
function accountFlowEditor(id) {
    const a = accounts().find(x => x.id === id); if (!a)
        return; const flows = Array.isArray(a.flows) ? [...a.flows].sort((x, y) => String(y.date || '').localeCompare(String(x.date || ''))) : []; openModal('Deposits and withdrawals — ' + a.name, `<form id="flow-form" class="form-grid"><div class="field"><label>Transaction</label><select name="type"><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></select></div>${field('amount', 'Amount', '', 'number', 'required min="0.01" step="0.01"')}${field('date', 'Date', new Date().toISOString().slice(0, 10), 'date', 'required')}<div class="field full"><label>Note (optional)</label><input name="note" maxlength="140"></div></form><div class="flow-history"><h4>Transaction History</h4>${flows.length ? flows.map(f => `<div class="flow-row"><div><strong>${f.type === 'withdrawal' ? 'Withdrawal' : 'Deposit'} · ${money(f.amount)}</strong><div class="small muted">${esc(f.date || '')}${f.note ? ' · ' + esc(f.note) : ''}</div></div><button class="btn" type="button" data-remove-flow="${esc(f.id)}" aria-label="Delete transaction">Remove</button></div>`).join('') : '<p class="small muted">No deposits or withdrawals recorded.</p>'}</div>`, `<button type="button" class="btn" data-action="close">Close</button><button type="button" class="btn primary" data-action="save-flow">Add transaction</button>`); modal.dataset.account = id;
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
function parseCSVRecords(text) {
    const rows = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (quoted && text[i + 1] === '"') { field += '"'; i++; }
            else if (quoted) quoted = false;
            else if (!field) quoted = true;
            else field += c;
        } else if (c === ',' && !quoted) { row.push(field); field = ''; }
        else if ((c === '\n' || c === '\r') && !quoted) {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            if (row.some(value => value.trim())) rows.push(row);
            row = []; field = '';
        } else field += c;
    }
    if (quoted) throw Error('CSV contains an unclosed quoted field.');
    row.push(field);
    if (row.some(value => value.trim())) rows.push(row);
    return rows;
}
async function importFile(file) {
    if (!file)
        return; try {
            if (file.size > 25 * 1024 * 1024) throw Error('Import file exceeds the 25 MB limit.');
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
                const lines = parseCSVRecords(text.replace(/^\uFEFF/, ''));
                if (!lines.length) throw Error('CSV file is empty.');
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
                const h = lines.shift().map(x => x.trim().toLowerCase());
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
                    const r = line, pair = col(r, 'symbol', 'pair', 'instrument'), date = col(r, 'date', 'entry date', 'entry time', 'datetime'), entry = Number(col(r, 'entry', 'entry price')), size = Number(col(r, 'lots', 'size', 'quantity') || 1), pl = col(r, 'p&l', 'pnl', 'profit', 'gross pnl');
                    if (!pair || !date || !(entry > 0) || !(size > 0) || (pl !== '' && !Number.isFinite(Number(pl))))
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
        if (mode === 'signup') {
            if (r.data?.session?.user) {
                user = r.data.session.user;
                try { await load(); } catch (error) { showJournalError(error); }
            } else {
                auth('signin', 'Account created. Check your email to confirm your address, then sign in.');
            }
        }
        else if (mode === 'reset')
            auth('signin', 'If the address is registered, a reset email has been sent.');
        else if (r.data?.session?.user) {
            user = r.data.session.user;
            try { await load(); } catch (error) { showJournalError(error); }
        } else {
            throw Error('Sign-in did not return a valid session. Please try again.');
        }
    }
        catch (e) {
            console.error('Pipfolio authentication error:', e);
            const notice = document.createElement('div');
            notice.className = 'notice';
            notice.setAttribute('role', 'alert');
            notice.textContent = 'Sign-in failed: ' + (e?.message || 'Please try again.');
            const currentForm = app.querySelector('#auth-form');
            if (currentForm) { currentForm.parentElement.querySelector('.auth-error')?.remove(); notice.classList.add('auth-error'); currentForm.before(notice); }
            else toast(notice.textContent);
        } finally {
            authRequestPending = false;
            if (submit?.isConnected) submit.disabled = false;
        }
}
function showJournalError(error) {
    app.innerHTML = '<div class="auth"><div class="auth-card"><h1>Journal unavailable</h1><p class="muted">You are still signed in, but your journal could not be loaded. Your data has not been deleted.</p><p id="load-error"></p><button class="btn primary" type="button" id="retry-load">Retry</button></div></div>';
    document.getElementById('load-error').textContent = error?.message || 'Unknown error';
    console.error('Pipfolio journal loading error:', error);
    document.getElementById('retry-load').addEventListener('click', () => load().catch(showJournalError), { once: true });
}
function openRecoveryDialog() {
    recoveryMode = true;
    openModal('Set a new password', `<form id="password-form">${field('password', 'New password', '', 'password', 'required minlength="8" autocomplete="new-password"')}</form>`, `<button type="button" class="btn primary" data-action="update-password">Update password</button>`);
}
async function init() {
    if (!db) {
        app.textContent = 'Unable to load Supabase. Check your internet connection.';
        return;
    }
    // Register before reading the session: password recovery links may emit
    // PASSWORD_RECOVERY during initialisation, not after getSession resolves.
    db.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            user = session?.user || user;
            queueMicrotask(openRecoveryDialog);
            return;
        }
        if (event === 'SIGNED_IN' && session?.user) {
            user = session.user;
            return;
        }
        if (event === 'SIGNED_OUT') {
            if (explicitSignOut) {
                user = null;
                explicitSignOut = false;
                recoveryMode = false;
                if (modal.open) modal.close();
                auth();
            } else if (authInitialised) {
                // Session loss is not a click action. Keep unsaved UI visible
                // and explain the situation rather than silently logging out.
                toast('Your session ended. Export a backup if needed, then sign in again.');
            }
        }
    });
    let result;
    try { result = await db.auth.getSession(); }
    catch (error) { auth('signin', 'Could not verify your session: ' + error.message); return; }
    if (result.error) { auth('signin', 'Could not verify your session: ' + result.error.message); return; }
    if (result.data?.session?.user) {
        user = result.data.session.user;
        try { await load(); } catch (error) { showJournalError(error); }
    } else {
        auth();
    }
    authInitialised = true;
    // Recovery callback can arrive before or after the initial session read.
    if (recoveryMode && user && !modal.open) openRecoveryDialog();
}
app.addEventListener('click', async (e) => {
    const nav = e.target.closest('[data-view]'); if (nav) {
        e.preventDefault();
        view = nav.dataset.view === 'calendar' ? 'dashboard' : nav.dataset.view;
        render();
        return;
    } const edit = e.target.closest('[data-edit]'); if (edit) {
        viewTrade(edit.dataset.edit);
        return;
    } const day = e.target.closest('[data-day]'); if (day) {
        selectedDay = selectedDay === day.dataset.day ? null : day.dataset.day;
        render();
        return;
    } const acc = e.target.closest('[data-account-edit]'); if (acc) {
        accountEditor(acc.dataset.accountEdit);
        return;
    } const flow = e.target.closest('[data-account-flow]'); if (flow) {
        accountFlowEditor(flow.dataset.accountFlow);
        return;
    } const au = e.target.closest('[data-auth]'); if (au) {
        e.preventDefault();
        auth(au.dataset.auth);
        return;
    } const action = e.target.closest('[data-action]')?.dataset.action; if (!action)
        return;
    e.preventDefault();
    if (['calendar-prev-year', 'calendar-prev-month', 'calendar-next-month', 'calendar-next-year'].includes(action)) {
        const change = {
            'calendar-prev-year': -12,
            'calendar-prev-month': -1,
            'calendar-next-month': 1,
            'calendar-next-year': 12
        }[action];
        const next = new Date(year, month + change, 1);
        if (next.getFullYear() >= 1900 && next.getFullYear() <= 2100) {
            year = next.getFullYear();
            month = next.getMonth();
            selectedDay = '';
            render();
        }
        return;
    }
    if (action === 'calendar-today') {
        const today = new Date();
        month = today.getMonth();
        year = today.getFullYear();
        selectedDay = '';
        render();
        return;
    }
    if (action === 'profile-username') {
        openModal('Change Username', `<form id="profile-username-form"><div class="field"><label for="profile-username-input">Username</label><input id="profile-username-input" name="username" required minlength="3" maxlength="40" autocomplete="nickname" value="${esc(user?.user_metadata?.username || '')}"></div></form>`, `<button type="button" class="btn primary" data-action="save-profile-username">Save Username</button>`);
        return;
    }
    if (action === 'profile-email') {
        openModal('Change Email', `<form id="profile-email-form"><div class="field"><label for="profile-email-input">New Email Address</label><input id="profile-email-input" name="email" type="email" autocomplete="email" required value="${esc(user?.email || '')}"></div></form>`, `<button type="button" class="btn primary" data-action="save-profile-email">Update Email</button>`);
        return;
    }
    if (action === 'profile-password') {
        openModal('Change Password', `<form id="profile-password-form"><div class="field"><label for="profile-password-current">Current Password</label><input id="profile-password-current" name="current" type="password" autocomplete="current-password" required></div><div class="field"><label for="profile-password-input">New Password</label><input id="profile-password-input" name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></div><div class="field"><label for="profile-password-confirm">Confirm Password</label><input id="profile-password-confirm" name="confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></div></form>`, `<button type="button" class="btn primary" data-action="save-profile-password">Update Password</button>`);
        return;
    }
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
        }
    if (action === 'erase-journal') {
        if (!confirm('Erase all trades, screenshots, trading accounts and recorded transactions? This cannot be undone. Export a backup first.')) return;
        const response = prompt('Type ERASE to permanently erase your journal:');
        if (response !== 'ERASE') return;
        const next = clone();
        next.trades = [];
        next.settings.accounts = [];
        if (await save(next)) toast('Journal erased. Your login remains active.');
        return;
    }
    if (action === 'delete-profile') {
        if (!confirm('Permanently delete your Pipfolio account, journal, screenshots and all saved data? This cannot be undone. Export a backup first.')) return;
        if (prompt('Type DELETE to permanently delete your account:') !== 'DELETE') return;
        try {
            // Requires the authenticated server-side Edge Function supplied with this package.
            // Never place the service-role key in browser JavaScript.
            const { data: sessionResult, error: sessionError } = await db.auth.getSession();
            if (sessionError || !sessionResult?.session) throw Error('Please sign in again.');
            const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${sessionResult.session.access_token}`
                },
                body: JSON.stringify({ confirmation: 'DELETE' })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw Error(body.error || 'Account deletion service unavailable. No deletion was confirmed.');
            }
            explicitSignOut = true;
            await db.auth.signOut({ scope: 'local' });
            user = null;
            data = { version: 3, trades: [], settings: { accounts: [] }, preferences: { theme: 'light', accent: '#C0C0C0', quote: '' } };
            auth();
            toast('Account deleted.');
        } catch (error) {
            toast('Delete account failed: ' + error.message);
        }
        return;
    }
    if (action === 'signout') {
            if (!e.isTrusted || !e.target.closest('button[data-action="signout"]')) return;
            if (!confirm('Sign out of Pipfolio?')) return;
            explicitSignOut = true;
            try {
                const result = await db.auth.signOut({ scope: 'local' });
                if (result.error) throw result.error;
                user = null;
                explicitSignOut = false;
                auth();
            } catch (error) {
                explicitSignOut = false;
                toast('Sign out failed: ' + error.message);
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
    if (['save-profile-username', 'save-profile-email', 'save-profile-password'].includes(action)) {
        if (busy) return;
        const form = modal.querySelector('form');
        if (!form?.reportValidity()) return;
        let changes;
        if (action === 'save-profile-username') {
            const username = form.elements.username.value.trim();
            if (username.length < 3 || username.length > 40) return toast('Username must be 3–40 characters.');
            changes = { data: { username } };
        } else if (action === 'save-profile-email') {
            const email = form.elements.email.value.trim();
            if (email.toLowerCase() === String(user?.email || '').toLowerCase()) return toast('This is already your email address.');
            changes = { email };
        } else {
            if (form.elements.password.value !== form.elements.confirm.value) return toast('Passwords do not match.');
            if (!user?.email) return toast('A registered email address is required to verify your current password.');
            if (!form.elements.current.value) return toast('Enter your current password.');
            if (form.elements.current.value === form.elements.password.value) return toast('Choose a new password different from your current password.');
            changes = { password: form.elements.password.value };
        }
        busy = true;
        try {
            if (action === 'save-profile-password') {
                // Verify the current password with Supabase before allowing the change.
                // Never store the entered password in the journal or browser storage.
                const verify = await db.auth.signInWithPassword({
                    email: user.email,
                    password: form.elements.current.value
                });
                if (verify.error) throw new Error('Current password is incorrect or could not be verified.');
            }
            const result = await db.auth.updateUser(changes);
            if (result.error) throw result.error;
            if (result.data?.user) user = result.data.user;
            modal.close();
            render();
            toast(action === 'save-profile-email' ? 'Check your inbox to confirm the email change.' : 'Account details updated.');
        } catch (err) {
            toast('Update failed: ' + err.message);
        } finally {
            busy = false;
        }
        return;
    }
    if (action === 'close')
        modal.close(); if (action === 'edit-viewed-trade')
        tradeEditor(modal.dataset.trade); if (action === 'save-trade')
        await saveTrade(); if (action === 'delete-trade')
        await deleteTrade(); if (action === 'save-account')
        await saveAccount(); if (action === 'save-flow')
        await saveFlow(); if (action === 'delete-account')
        await deleteAccount(); if (action === 'update-password') {
            const password = modal.querySelector('[name=password]');
            if (!password.reportValidity())
                return;
            try {
                const r = await db.auth.updateUser({ password: password.value });
                if (r.error) throw r.error;
                recoveryMode = false;
                modal.close();
                toast('Password updated successfully.');
                if (user) { try { await load(); } catch (error) { showJournalError(error); } }
            } catch (error) { toast('Password update failed: ' + error.message); }
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
    if (e.target.id === 'calendar-month' || e.target.id === 'calendar-year') {
        const selected = Number(e.target.value);
        if (e.target.id === 'calendar-month' && Number.isInteger(selected) && selected >= 0 && selected <= 11) month = selected;
        if (e.target.id === 'calendar-year' && Number.isInteger(selected) && selected >= 1900 && selected <= 2100) year = selected;
        selectedDay = '';
        render();
        return;
    }
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
            holder.innerHTML = table(filtered().sort((a, b) => String(b.dt || '').localeCompare(String(a.dt || ''))));
            wrap.replaceWith(holder.firstElementChild);
        }
        const count = app.querySelector('.toolbar .muted');
        if (count)
            count.textContent = `${filtered().length} trades`;
        e.target.focus();
        e.target.setSelectionRange(old, old);
    }
});
// One movable marker and one tooltip, instead of a marker at every trade.
document.addEventListener('pointermove', event => {
    const chart = event.target.closest?.('.cumulative-combined-chart');
    if (!chart) return;
    const svg = chart.querySelector('svg');
    const dot = chart.querySelector('.cumulative-hover-dot');
    const tooltip = chart.querySelector('.cumulative-hover-tooltip');
    if (!svg || !dot || !tooltip) return;
    let points; try { points = JSON.parse(decodeURIComponent(chart.dataset.curvePoints || '[]')); } catch { return; }
    if (!points.length) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const localX = (event.clientX - rect.left) * 720 / rect.width;
    const nearest = points.reduce((best, point) =>
        Math.abs(point.x - localX) < Math.abs(best.x - localX) ? point : best
    );
    dot.setAttribute('cx', nearest.x);
    dot.setAttribute('cy', nearest.y);
    dot.setAttribute('visibility', 'visible');
    tooltip.hidden = false;
    const amount = Number(nearest.amount);
    tooltip.textContent = `${nearest.date} · Cumulative P&L: ${money(amount)}`;
    tooltip.style.left = `${Math.max(8, Math.min(rect.width - 8, nearest.x / 720 * rect.width))}px`;
    tooltip.style.top = `${nearest.y / 290 * rect.height}px`;
});
document.addEventListener('pointerout', event => {
    const chart = event.target.closest?.('.cumulative-combined-chart');
    if (!chart || (event.relatedTarget && chart.contains(event.relatedTarget))) return;
    chart.querySelector('.cumulative-hover-dot')?.setAttribute('visibility', 'hidden');
    const tooltip = chart.querySelector('.cumulative-hover-tooltip');
    if (tooltip) tooltip.hidden = true;
});
document.getElementById('upload').addEventListener('change', e => { importFile(e.target.files[0]); e.target.value = ''; });
init().catch(error => { console.error('Pipfolio initialisation failed', error); showJournalError(error); });