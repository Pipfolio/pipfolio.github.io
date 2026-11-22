'use strict';

      // Supabase connection
      const SUPABASE_URL = 'https://ukotgedbveqgsywksuyc.supabase.co';
      const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dqw7e5vjjn1IXwlKzG17nw_elllMnSH';
      // App state and shared helpers
      const SIDES = ['Buy', 'Sell'],
        SESS = ['Asian', 'London', 'New York', 'London/NY Overlap', 'Other'];
      let db = null,
        currentUser = null,
        revision = 0,
        ready = false,
        saving = false;
      let authGeneration = 0,
        loadingUser = null,
        loadTask = null;
      let recoveryMode = /(?:[?#&])type=recovery(?:&|$)/.test(location.hash + location.search);
      const defaultPreferences = () => ({ theme: 'light', accent: '#C0C0C0', quote: '' });
      let preferences = defaultPreferences();
      let syncMessage = 'Saved to your account';
      let profileUsername = '';
      const S = {
        trades: [],
        settings: { accounts: [] },
        view: 'dashboard',
        acc: 'all',
        tacc: 'all',
        lastAcc: '',
        q: '',
        res: 'all',
        importMode: 'main',
      };
      const $ = (s, r = document) => r.querySelector(s);
      const app = $('#app'),
        dlg = $('#dlg');
      const esc = (s) =>
        String(s ?? '').replace(
          /[&<>"']/g,
          (c) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;',
            })[c],
        );

      // Instrument logos and ticker fallbacks
      const TV_LOGO_ROOT = 'https://s3-symbol-logo.tradingview.com/';
      const TV_COUNTRY = {
        EUR: 'EU',
        USD: 'US',
        GBP: 'GB',
        JPY: 'JP',
        AUD: 'AU',
        CAD: 'CA',
        CHF: 'CH',
        NZD: 'NZ',
        CNH: 'CN',
        CNY: 'CN',
        SGD: 'SG',
        HKD: 'HK',
        NOK: 'NO',
        SEK: 'SE',
        DKK: 'DK',
        ZAR: 'ZA',
        MXN: 'MX',
        TRY: 'TR',
        PLN: 'PL',
        BRL: 'BR',
        INR: 'IN',
        KRW: 'KR',
        RUB: 'RU',
        THB: 'TH',
        TWD: 'TW',
        ILS: 'IL',
        CZK: 'CZ',
        HUF: 'HU',
        RON: 'RO',
        AED: 'AE',
        SAR: 'SA',
        PHP: 'PH',
        IDR: 'ID',
        MYR: 'MY',
        VND: 'VN',
        EGP: 'EG',
        NGN: 'NG',
        KES: 'KE',
        PKR: 'PK',
        BDT: 'BD',
        ARS: 'AR',
        CLP: 'CL',
        COP: 'CO',
        PEN: 'PE',
        UYU: 'UY',
        ISK: 'IS',
      };
      const TV_METALS = {
        XAU: 'metal/gold',
        XAG: 'metal/silver',
        XPT: 'metal/platinum',
        XPD: 'metal/palladium',
      };
      const TV_CRYPTO = new Set(
        'BTC ETH SOL XRP BNB USDT USDC DOGE ADA TRX AVAX LINK DOT LTC SHIB SUI POL XLM NEAR UNI BCH ATOM HBAR APT ARB OP FIL ICP ETC XMR AAVE DAI TON PEPE CRO ALGO XTZ EOS XLM VET FET INJ RENDER RNDR TAO KAS WIF BONK'.split(
          ' ',
        ),
      );
      const TV_STOCKS = {
        AAPL: 'apple',
        MSFT: 'microsoft',
        NVDA: 'nvidia',
        TSLA: 'tesla',
        AMZN: 'amazon',
        GOOGL: 'alphabet',
        GOOG: 'alphabet',
        META: 'meta-platforms',
        NFLX: 'netflix',
        AMD: 'advanced-micro-devices',
        INTC: 'intel',
        IBM: 'international-business-machines',
        ORCL: 'oracle',
        ADBE: 'adobe',
        CRM: 'salesforce',
        PLTR: 'palantir-technologies',
        COIN: 'coinbase',
        HOOD: 'robinhood-markets',
        MSTR: 'microstrategy',
        JPM: 'jpmorgan-chase',
        BAC: 'bank-of-america',
        V: 'visa',
        MA: 'mastercard',
        WMT: 'walmart',
        KO: 'coca-cola',
        PEP: 'pepsico',
        DIS: 'walt-disney',
        NKE: 'nike',
        BA: 'boeing',
        XOM: 'exxon',
        CVX: 'chevron',
        'BRK.B': 'berkshire-hathaway',
        BRK_A: 'berkshire-hathaway',
        TSM: 'taiwan-semiconductor',
        BABA: 'alibaba',
        UBER: 'uber',
        PYPL: 'paypal',
        SHOP: 'shopify',
        COST: 'costco',
        AVGO: 'broadcom',
        LLY: 'eli-lilly',
        JNJ: 'johnson-and-johnson',
        UNH: 'unitedhealth-group',
        HD: 'home-depot',
      };
      const TV_FUNDS = {
        SPY: 'spdr-s-and-p-500-etf-trust',
        QQQ: 'invesco-qqq-trust',
        VOO: 'vanguard',
        VTI: 'vanguard',
        VT: 'vanguard',
        VUG: 'vanguard',
        VYM: 'vanguard',
        VGT: 'vanguard',
        BND: 'vanguard',
        VXUS: 'vanguard',
        IVV: 'ishares',
        IWM: 'ishares',
        EEM: 'ishares',
        TLT: 'ishares',
        IEF: 'ishares',
        LQD: 'ishares',
        HYG: 'ishares',
        GLD: 'spdr-gold-trust',
        SLV: 'ishares',
        DIA: 'spdr-dow-jones-industrial-average-etf-trust',
        ARKK: 'ark-invest',
        XLF: 'financial-select-sector-spdr-fund',
        XLK: 'technology-select-sector-spdr-fund',
      };
      const TV_INDICES = {
        SPX: 'indices/s-and-p-500',
        SP500: 'indices/s-and-p-500',
        SPX500: 'indices/s-and-p-500',
        US500: 'indices/s-and-p-500',
        NDX: 'indices/nasdaq-100',
        NAS100: 'indices/nasdaq-100',
        US100: 'indices/nasdaq-100',
        DJI: 'indices/dow-jones-industrial-average',
        US30: 'indices/dow-jones-industrial-average',
        DAX: 'indices/dax',
        GER40: 'indices/dax',
        UK100: 'indices/ftse-100',
        FTSE: 'indices/ftse-100',
        VIX: 'indices/volatility-s-and-p-500',
        NI225: 'indices/nikkei-225',
        JP225: 'indices/nikkei-225',
        RUT: 'indices/russell-2000',
      };
      const TV_FUTURES = {
        ES: 'indices/s-and-p-500',
        MES: 'indices/s-and-p-500',
        NQ: 'indices/nasdaq-100',
        MNQ: 'indices/nasdaq-100',
        YM: 'indices/dow-jones-industrial-average',
        MYM: 'indices/dow-jones-industrial-average',
        RTY: 'indices/russell-2000',
        M2K: 'indices/russell-2000',
        GC: 'metal/gold',
        MGC: 'metal/gold',
        SI: 'metal/silver',
        SIL: 'metal/silver',
        PL: 'metal/platinum',
        PA: 'metal/palladium',
        HG: 'metal/copper',
      };
      function tvSymbolKey(raw) {
        return String(raw || '')
          .trim()
          .toUpperCase()
          .split(':')
          .pop()
          .replace(/\s/g, '');
      }
      function tvLogoPath(symbol) {
        const key = tvSymbolKey(symbol),
          base = key.replace(/\.(P|PERP)$/, '');
        const overrides = S.settings?.logoOverrides || {};
        if (overrides[key]) return overrides[key];
        if (overrides[base]) return overrides[base];
        if (TV_STOCKS[key]) return TV_STOCKS[key];
        if (TV_FUNDS[key]) return TV_FUNDS[key];
        if (TV_INDICES[key]) return TV_INDICES[key];
        if (TV_METALS[key]) return TV_METALS[key];
        if (TV_CRYPTO.has(key)) return 'crypto/XTVC' + key;
        const fut = key.match(/^([A-Z0-9]{1,3})(?:[FGHJKMNQUVXZ]\d{1,4}|[12]!)$/);
        if (fut && TV_FUTURES[fut[1]]) return TV_FUTURES[fut[1]];
        const opt = key.match(/^([A-Z]{1,6})\d{6}[CP]\d{8}$/);
        if (opt) return TV_STOCKS[opt[1]] || TV_FUNDS[opt[1]] || null;
        return null;
      }
      function tvLogoImg(path, label) {
        if (!path)
          return `<span class="pair-token" title="${esc(label)}">${esc(label.slice(0, 3))}</span>`;
        // Only allow TradingView-relative paths, not arbitrary hosts or script URLs.
        if (!/^[a-zA-Z0-9_./-]{1,120}$/.test(path) || path.includes('..'))
          return `<span class="pair-token">${esc(label.slice(0, 3))}</span>`;
        const src = TV_LOGO_ROOT + path + '.svg';
        return `<span class="tv-logo-wrap"><img src="${esc(src)}" alt="${esc(label)}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="pair-token" hidden>${esc(label.slice(0, 3))}</span></span>`;
      }
      function pairHTML(pair) {
        const raw = String(pair || ''),
          key = tvSymbolKey(raw);
        const direct = tvLogoPath(key);
        let logos = '';
        if (direct) logos = tvLogoImg(direct, key);
        else {
          const clean = key.replace(/[^A-Z]/g, '');
          const quoteCodes = [
            'USDT',
            'USDC',
            'USD',
            'EUR',
            'GBP',
            'JPY',
            'AUD',
            'CAD',
            'CHF',
            'NZD',
            'BTC',
            'ETH',
            'BNB',
          ];
          const quote = quoteCodes.find((q) => clean.endsWith(q) && clean.length > q.length);
          const base = quote ? clean.slice(0, -quote.length) : '';
          const path = (c) =>
            TV_COUNTRY[c]
              ? 'country/' + TV_COUNTRY[c]
              : TV_METALS[c] || (TV_CRYPTO.has(c) ? 'crypto/XTVC' + c : null);
          if (quote && TV_METALS[base]) {
            // Gold/silver/platinum/palladium pairs display the underlying metal only.
            logos = tvLogoImg(path(base), base);
          } else if (quote && TV_CRYPTO.has(base)) {
            // BTCUSD, BTCUSDT, ETHUSD, etc. display the crypto asset only.
            logos = tvLogoImg(path(base), base);
          } else if (quote && TV_COUNTRY[base] && TV_COUNTRY[quote]) {
            // Fiat forex crosses retain the two overlapping currency symbols.
            logos = tvLogoImg(path(base), base) + tvLogoImg(path(quote), quote);
          } else if (quote && TV_COUNTRY[base] && TV_CRYPTO.has(quote)) {
            logos = tvLogoImg(path(base), base) + tvLogoImg(path(quote), quote);
          } else logos = tvLogoImg(null, key);
        }
        return `<span class="pair-label"><span class="pair-logos">${logos}</span><span>${esc(raw)}</span></span>`;
      }

      // Rounding and formatting helpers
      // Round half away from zero; toPrecision strips binary float noise (e.g. 1.005 -> 1.01).
      const roundTo = (x, dp = 2) => {
        if (!Number.isFinite(x)) return x;
        const k = 10 ** dp;
        return (Math.sign(x) * Math.round(Number((Math.abs(x) * k).toPrecision(15)))) / k + 0;
      };
      const r2 = (x) => roundTo(x, 2);
      const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      function toast(m, type = '') {
        const t = document.createElement('div');
        t.className = 'toast ' + type;
        t.textContent = m;
        $('#toasts').append(t);
        setTimeout(() => t.remove(), type ? 5000 : 3000);
      }
      function setTheme(t, save = true) {
        document.documentElement.dataset.theme = t;
      }
      setTheme('light', false);
      // Appearance preferences
      const DEFAULT_QUOTE = 'A little progress, one trade at a time.';
      function dashboardQuote() {
        return preferences.quote || DEFAULT_QUOTE;
      }

      function validAccent(c) {
        return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
      }
      function applyAccent(c, save = true) {
        if (!validAccent(c)) c = '#C0C0C0';
        const root = document.documentElement;
        const rgb = c.match(/[a-f0-9]{2}/gi).map((v) => parseInt(v, 16));
        const dark = root.dataset.theme === 'dark';
        // Accent colours never change the background, surfaces, borders or typography.
        const visibleAccent =
          c === '#ffffff' && !dark ? '#202020' : c === '#000000' && dark ? '#ffffff' : c;
        const visibleRgb = visibleAccent.match(/[a-f0-9]{2}/gi).map((v) => parseInt(v, 16));
        const luminance = visibleRgb.reduce(
          (sum, v, i) =>
            sum +
            [0.2126, 0.7152, 0.0722][i] *
              (v / 255 <= 0.04045 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4)),
          0,
        );
        root.style.setProperty('--ac', visibleAccent);
        root.style.setProperty('--accent-rgb', visibleRgb.join(','));
        root.style.setProperty('--acx', luminance > 0.3 ? '#111827' : '#ffffff');
        root.dataset.neutralAccent = c === '#000000' || c === '#ffffff' ? 'true' : 'false';
      }
      applyAccent(preferences.accent, false);
      // Data cleaning and validation helpers
      const defPip = (p) => (/JPY/.test(p) ? 0.01 : /XAU|GOLD/.test(p) ? 0.1 : 0.0001);
      const num = (v) => (v === '' || v == null ? null : Number.isFinite(+v) ? +v : NaN);
      const ACCT = ['Demo', 'Live', 'Prop Firm', 'Other'];
      const ms = (s) =>
        Date.UTC(
          +s.slice(0, 4),
          +s.slice(5, 7) - 1,
          +s.slice(8, 10),
          +s.slice(11, 13),
          +s.slice(14, 16),
        );
      const okDt = (s) =>
        /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(s) &&
        new Date(ms(s)).toISOString().slice(0, 16) === s.slice(0, 16) &&
        (!s.includes(':', 16) || Number(s.slice(17, 19)) < 60);
      const dur = (a, b) => {
        let m = Math.round((ms(b) - ms(a)) / 6e4);
        const d = Math.floor(m / 1440),
          h = Math.floor((m % 1440) / 60);
        m %= 60;
        return [d && d + 'd', (d || h) && h + 'h', m + 'm'].filter(Boolean).join(' ');
      };
      const fdt = (s) => (s ? s.replace('T', ' ') : '\u2014');
      const MARKETS = [
        { name: 'Asian', tz: 'Asia/Tokyo', open: 9, close: 18 },
        { name: 'London', tz: 'Europe/London', open: 8, close: 17 },
        { name: 'New York', tz: 'America/New_York', open: 8, close: 17 },
      ];
      const tzFmt = {};
      function marketClock(date, tz) {
        const f = (tzFmt[tz] ||= new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'short',
          hour: '2-digit',
          hourCycle: 'h23',
        }));
        const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
        return { wd: p.weekday, hour: +p.hour };
      }
      // dt = 'YYYY-MM-DDTHH:mm' in the browser's local time zone
      function detectSession(dt) {
        const d = new Date(dt);
        if (!okDt(dt) || isNaN(d)) return 'Other';
        const open = MARKETS.filter((m) => {
          const c = marketClock(d, m.tz);
          return c.wd !== 'Sat' && c.wd !== 'Sun' && c.hour >= m.open && c.hour < m.close;
        }).map((m) => m.name);
        if (open.includes('London') && open.includes('New York')) return 'London/NY Overlap';
        if (open.includes('London')) return 'London';
        if (open.includes('New York')) return 'New York';
        if (open.includes('Asian')) return 'Asian';
        return 'Other';
      }
      // Value of one pip in USD for the given lots, or null if it can't be known exactly.
      function usdPerPip(pair, price, lots, pip) {
        const p = pair.replace(/[^A-Z]/g, '');
        if (p.length < 6) return null;
        const base = p.slice(0, 3),
          quote = p.slice(3, 6);
        if (base === 'XAG') return null;
        const size = base === 'XAU' ? 100 : 100000;
        const perPip = size * pip * lots;
        if (quote === 'USD') return perPip;
        if (base === 'USD' && price > 0) return perPip / price;
        return null;
      }
      function cleanFlow(f) {
        if (!f || typeof f !== 'object') return null;
        const amt = Number(f.amount);
        const o = {
          id: String(f.id || ''),
          type: f.type === 'Withdrawal' ? 'Withdrawal' : 'Deposit',
          date: String(f.date || '').slice(0, 10),
          amount: amt,
          note: String(f.note || '')
            .trim()
            .slice(0, 100),
        };
        return o.id && /^\d{4}-\d\d-\d\d$/.test(o.date) && Number.isFinite(amt) && amt > 0
          ? o
          : null;
      }
      const flowNet = (a) =>
        r2((a.flows || []).reduce((s, f) => s + (f.type === 'Deposit' ? f.amount : -f.amount), 0));
      function cleanAcc(a) {
        if (!a || typeof a !== 'object') return null;
        const b = Number(a.balance),
          o = {
            id: String(a.id || ''),
            name: String(a.name || '')
              .trim()
              .slice(0, 40),
            balance: b,
            currency: String(a.currency || '')
              .trim()
              .slice(0, 3),
            broker: String(a.broker || '')
              .trim()
              .slice(0, 40),
            type: ACCT.includes(a.type) ? a.type : 'Other',
            created: Number(a.created) || Date.now(),
            sample: a.sample === true,
            flows: (Array.isArray(a.flows) ? a.flows : []).map(cleanFlow).filter(Boolean),
          };
        return o.id && o.name && o.currency && Number.isFinite(b) && b >= 0 ? o : null;
      }
      function cleanSettings(s) {
        s = s && typeof s === 'object' ? s : {};
        const seen = new Set(),
          acc = (Array.isArray(s.accounts) ? s.accounts : [])
            .map(cleanAcc)
            .filter((a) => a && !seen.has(a.id) && seen.add(a.id));
        if (!acc.length) {
          const b = Number(s.startBalance);
          acc.push({
            id: 'acc-default',
            name: 'Main account',
            balance: Number.isFinite(b) && b >= 0 ? b : 0,
            currency: String(s.currency || '$').slice(0, 3) || '$',
            broker: '',
            type: 'Other',
            created: Date.now(),
          });
        }
        return {
          accounts: acc,
          checklist: Array.isArray(s.checklist)
            ? s.checklist.filter((x) => typeof x === 'string').slice(0, 20)
            : ['Trend confirmed', 'Entry signal identified', 'Stop loss set', 'Risk checked'],
        };
      }
      function norm(trades, st) {
        const fb = (st.accounts.find((a) => a.id === 'acc-default') || st.accounts[0]).id;
        return trades.map((t) =>
          st.accounts.some((a) => a.id === t.account) ? t : { ...t, account: fb },
        );
      }
      function clean(t) {
        if (!t || typeof t !== 'object') return null;
        const legacy =
          !('xdt' in t) && t.exit != null && t.exit !== '' && t.pl != null && t.pl !== '';
        const o = {
          id: String(t.id || ''),
          account: String(t.account || ''),
          dt: String(t.dt || '').slice(0, 19),
          xdt: String(legacy ? t.dt : t.xdt || '').slice(0, 19),
          pair: String(t.pair || '')
            .trim()
            .toUpperCase()
            .slice(0, 20),
          side: t.side,
          entry: num(t.entry),
          sl: num(t.sl),
          tp: num(t.tp),
          exit: num(t.exit),
          lots: num(t.lots),
          risk: num(t.risk) ?? 0,
          pl: num(t.pl),
          comm: num(t.comm) ?? 0,
          charges: num(t.charges) ?? 0,
          adjustment: num(t.adjustment) ?? 0,
          pipSize: num(t.pipSize),
          session: SESS.includes(t.session) ? t.session : 'Other',
          setup: String(t.setup || '')
            .trim()
            .slice(0, 100),
          tf: String(t.tf || '')
            .trim()
            .slice(0, 20),
          notes: String(t.notes || '').slice(0, 5000),
          psychologyBefore: String(t.psychologyBefore || '').slice(0, 40),
          planFollowed: t.planFollowed === true ? true : t.planFollowed === false ? false : null,
          psychologyAfter: String(t.psychologyAfter || '').slice(0, 40),
          mistakes: Array.isArray(t.mistakes)
            ? t.mistakes.filter((x) => typeof x === 'string').slice(0, 20)
            : [],
          checklistDone: Array.isArray(t.checklistDone)
            ? t.checklistDone.filter((x) => typeof x === 'string').slice(0, 20)
            : [],
          screenshots: Array.isArray(t.screenshots)
            ? t.screenshots
                .filter(
                  (x) => typeof x === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(x),
                )
                .slice(0, 100)
            : [],
          created: Number(t.created) || Date.now(),
          updated: Number(t.updated) || Date.now(),
          sample: t.sample === true,
        };
        if (!o.id || !okDt(o.dt) || !o.pair || !SIDES.includes(o.side)) return null;
        if (o.xdt && (!okDt(o.xdt) || o.xdt < o.dt)) return null;
        for (const k of ['entry', 'lots']) if (o[k] == null || isNaN(o[k])) return null;
        for (const k of ['sl', 'tp', 'risk', 'comm', 'charges', 'adjustment', 'exit', 'pl'])
          if (isNaN(o[k])) return null;
        if (
          !(o.entry > 0 && o.lots > 0) ||
          (o.exit != null && o.exit <= 0) ||
          o.risk < 0 ||
          o.comm < 0 ||
          o.charges < 0
        )
          return null;
        if (!(o.pipSize > 0)) o.pipSize = defPip(o.pair);
        return o;
      }
      function cleanPreferences(p) {
        return {
          theme: p?.theme === 'dark' ? 'dark' : 'light',
          accent: validAccent(p?.accent) ? p.accent : '#C0C0C0',
          quote: typeof p?.quote === 'string' ? p.quote.slice(0, 240) : '',
        };
      }
      function showPreferences() {
        setTheme(preferences.theme, false);
        applyAccent(preferences.accent, false);
      }
      // Cloud sync and account loading
      function syncStatus(message) {
        syncMessage = message;
        const el = $('#cloud-status');
        if (el) el.textContent = message;
      }
      function busy(on) {
        saving = on;
        app.inert = on;
        dlg.inert = on;
        const indicator = $('#saving-indicator');
        if (indicator) indicator.hidden = !on;
      }
      function clearAccount() {
        authGeneration++;
        ready = false;
        currentUser = null;
        revision = 0;
        profileUsername = '';
        S.trades = [];
        S.settings = cleanSettings();
        S.view = 'dashboard';
        S.acc = S.tacc = 'all';
        S.q = '';
        S.res = 'all';
        S.lastAcc = '';
        S.calDay = '';
        // Calendar state must exist before the dashboard renders after sign-in or reload.
        const today = new Date();
        S.cal = { y: today.getFullYear(), m: today.getMonth() };
        preferences = defaultPreferences();
        showPreferences();
        closeDlg();
        hideChartInfo();
      }
      async function loadAccount(user, force = false) {
        if (recoveryMode) return authScreen('update');
        if (!force && ready && currentUser?.id === user.id) return;
        if (loadingUser === user.id && loadTask) return loadTask;
        clearAccount();
        currentUser = user;
        const generation = authGeneration;
        loadingUser = user.id;
        app.innerHTML = '<div class="lock"><div class="card">Loading your journal…</div></div>';
        loadTask = (async () => {
          try {
            const { data, error } = await db
              .from('journals')
              .select('payload,revision')
              .eq('user_id', user.id)
              .maybeSingle();
            if (generation !== authGeneration) return;
            if (error) throw error;
            const payload = data?.payload || {};
            if (data && (!Array.isArray(payload.trades) || !payload.settings))
              throw new Error(
                'The saved journal format could not be read. Contact the site owner.',
              );
            S.settings = cleanSettings(payload.settings);
            S.trades = norm((payload.trades || []).map(clean).filter(Boolean), S.settings);
            preferences = cleanPreferences(payload.preferences);
            revision = Number(data?.revision || 0);
            ready = true;
            showPreferences();
            // Profile loading must never block access to an existing journal.
            try {
              const profile = await db
                .from('profiles')
                .select('username')
                .eq('id', user.id)
                .maybeSingle();
              if (generation !== authGeneration) return;
              profileUsername = profile.error ? '' : profile.data?.username || '';
            } catch (_) {
              profileUsername = '';
            }
            syncStatus(data ? 'Saved to your account' : 'Account ready — add your first trade');
            render();
          } catch (error) {
            if (generation === authGeneration)
              authScreen('loaderror', 'Your journal could not be loaded. ' + error.message);
          } finally {
            if (generation === authGeneration) {
              loadingUser = null;
              loadTask = null;
            }
          }
        })();
        return loadTask;
      }
      async function commit(trades, settings = S.settings, nextPreferences = preferences) {
        if (!ready || !currentUser) {
          toast('Sign in and load your journal first.', 'error');
          return false;
        }
        if (saving) {
          toast('A save is already in progress.', 'error');
          return false;
        }
        const generation = authGeneration;
        const payload = JSON.parse(
          JSON.stringify({
            version: 3,
            trades,
            settings,
            preferences: cleanPreferences(nextPreferences),
          }),
        );
        if (new Blob([JSON.stringify(payload)]).size > 20 * 1024 * 1024) {
          toast(
            'Your journal exceeds 20 MB. Export a backup and remove some screenshots.',
            'error',
          );
          return false;
        }
        busy(true);
        syncStatus('Saving…');
        try {
          const { data, error } = await db.rpc('save_journal', {
            p_payload: payload,
            p_expected_revision: revision,
          });
          if (error) throw error;
          if (generation !== authGeneration) return false;
          revision = Number(data);
          S.trades = payload.trades;
          S.settings = payload.settings;
          preferences = payload.preferences;
          showPreferences();
          syncStatus('Saved to your account');
          return true;
        } catch (error) {
          if (generation !== authGeneration) return false;
          syncStatus('Save failed — your change was not confirmed');
          const conflict = error.code === '40001';
          toast(
            conflict
              ? 'Another tab or device has newer changes. Copy any form text, then use Reload journal and try again.'
              : 'Save was not confirmed. Check your connection, then reload your journal before retrying. ' +
                  error.message,
            'error',
          );
          return false;
        } finally {
          busy(false);
        }
      }
      // Trade calculations and statistics
      const closed = (t) => t.exit != null && t.pl != null && !!t.xdt;
      const calc = (t) => {
        const d = t.side === 'Buy' ? 1 : -1,
          c = closed(t),
          net = c ? r2(t.pl - t.comm - (t.charges || 0) + (t.adjustment || 0)) : null;
        return {
          c,
          net,
          pips: t.exit != null ? roundTo((d * (t.exit - t.entry)) / t.pipSize, 1) : null,
          rr:
            t.sl != null && t.tp != null && t.sl !== t.entry
              ? roundTo(Math.abs(t.tp - t.entry) / Math.abs(t.entry - t.sl), 2)
              : null,
          R: c && t.risk > 0 ? roundTo(net / t.risk, 2) : null,
          dur: t.xdt ? dur(t.dt, t.xdt) : null,
          res: !c ? 'Open' : net > 0 ? 'Win' : net < 0 ? 'Loss' : 'Breakeven',
        };
      };
      const calcAll = (l) => l.map((t) => ({ t, ...calc(t) }));
      const acc = (id) => S.settings.accounts.find((a) => a.id === id);
      const ccy = (t) => acc(t.account)?.currency || '';
      let CTX = '$';
      const fm = (n, plus, c = CTX) => {
        const v = r2(Number(n) || 0);
        return (
          (v < 0 ? '\u2212' : plus && v > 0 ? '+' : '') +
          (c.length > 1 ? c + ' ' : c) +
          Math.abs(v).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        );
      };
      const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
      const short = (v) =>
        Math.abs(v) >= 1000
          ? (v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'k'
          : String(v);
      const nowLocal = () => {
        const d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
      };
      function stats(list) {
        const all = calcAll(list),
          ts = all
            .filter((x) => x.c)
            .sort((a, b) =>
              a.t.xdt < b.t.xdt ? -1 : a.t.xdt > b.t.xdt ? 1 : a.t.created - b.t.created,
            ),
          w = ts.filter((x) => x.res === 'Win'),
          l = ts.filter((x) => x.res === 'Loss'),
          sum = (a) => r2(a.reduce((s, x) => s + x.net, 0));
        const gw = sum(w),
          gl = Math.abs(sum(l)),
          rrs = ts.filter((x) => x.rr != null);
        let st = 0,
          sr = '';
        if (ts.length) {
          sr = ts[ts.length - 1].res;
          if (sr !== 'Breakeven') for (let i = ts.length - 1; i >= 0 && ts[i].res === sr; i--) st++;
        }
        return {
          ts,
          w,
          l,
          n: ts.length,
          open: all.length - ts.length,
          be: ts.length - w.length - l.length,
          net: sum(ts),
          wr: ts.length ? (w.length / ts.length) * 100 : 0,
          aw: w.length ? r2(gw / w.length) : 0,
          al: l.length ? r2(-gl / l.length) : 0,
          pf: gl ? gw / gl : gw ? Infinity : null,
          rr: rrs.length ? rrs.reduce((s, x) => s + x.rr, 0) / rrs.length : null,
          best: ts.length ? ts.reduce((a, b) => (b.net > a.net ? b : a)) : null,
          worst: ts.length ? ts.reduce((a, b) => (b.net < a.net ? b : a)) : null,
          st,
          sr,
        };
      }
      // Dialogs
      const closeDlg = () => {
        dlg.onclose = null;
        if (dlg.open) dlg.close();
      };
      function openDlg(html, c = '') {
        dlg.onclose = null;
        dlg.className = c;
        dlg.innerHTML = html;
        decorateDialog(dlg);
        if (!dlg.open) dlg.showModal();
      }
      // Keep confirmations separate from the active trade editor/details dialog.
      // Reusing `dlg` here destroyed the editor DOM and discarded unsaved changes.
      const confirmationDlg = document.createElement('dialog');
      confirmationDlg.className = 'sm';
      confirmationDlg.id = 'pipfolio-confirmation';
      document.body.appendChild(confirmationDlg);
      function ask(title, msg, btns) {
        return new Promise((resolve) => {
          const confirmation = confirmationDlg;
          // A confirmation must never replace or close the underlying editor.
          confirmation.innerHTML = `<div class="dh"><h2>${title}</h2></div><div class="db"><p class="mp">${msg}</p></div><div class="df">${btns
            .map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-i="${i}">${b.label}</button>`)
            .join('')}</div>`;
          decorateDialog(confirmation, () => finish(null));
          let settled = false;
          const finish = (value) => {
            if (settled) return;
            settled = true;
            confirmation.removeEventListener('close', onClose);
            if (confirmation.open) confirmation.close();
            resolve(value);
          };
          const onClose = () => finish(null);
          confirmation.addEventListener('close', onClose, { once: true });
          confirmation.querySelectorAll('[data-i]').forEach((button) => {
            button.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              finish(btns[Number(button.dataset.i)].val);
            });
          });
          if (!confirmation.open) confirmation.showModal();
        });
      }

      const pfCloseIcon = 'assets/image-02-1e440df751db.png';
      const pfInfoIcon = 'assets/image-03-68e052af5564.png';
      function decorateDialog(target, onClose) {
        const header = target.querySelector('.dh');
        if (!header || header.querySelector('.pf-dialog-close')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pf-dialog-close';
        button.setAttribute('aria-label', 'Close dialog');
        button.title = 'Close';
        button.innerHTML = `<img src="${pfCloseIcon}" alt="">`;
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
          if (saving) return;
          if (onClose) onClose(); else closeDlg();
        });
        header.appendChild(button);
      }
      const pfHelpText = {
        'Risk Calculator': 'Estimate a position size from your account balance, risk percentage and stop-loss distance. Confirm pip values with your broker.',
        'Import Broker CSV': 'Import trade history from your broker. Review the column mapping and imported results before relying on the statistics.',
        'Strategy Performance': 'Compare outcomes across your recorded trading strategies.',
        'Trade Discipline': 'Review how consistently your trades follow your trading plan.',
        'Trading Accounts': 'Manage accounts separately so balances and performance stay correctly attributed.',
        'Trade Review': 'Review your trade execution, notes, screenshots and patterns.'
      };
      let pfTooltip;
      function hidePfTooltip(){ if(pfTooltip){pfTooltip.remove();pfTooltip=null;} }
      function showPfTooltip(el, message){
        hidePfTooltip();pfTooltip=document.createElement('div');pfTooltip.className='pf-info-tip';pfTooltip.textContent=message;
        document.body.appendChild(pfTooltip);
        const r=el.getBoundingClientRect(), w=pfTooltip.offsetWidth, h=pfTooltip.offsetHeight;
        pfTooltip.style.left=Math.max(12,Math.min(innerWidth-w-12,r.left))+'px';
        pfTooltip.style.top=(r.bottom+h+9<innerHeight?r.bottom+7:Math.max(12,r.top-h-7))+'px';
      }
      function attachPfInfo(root){
        root.querySelectorAll('h1,h2,h3').forEach(h=>{
          if(h.querySelector('.pf-info'))return;
          const title=h.textContent.trim().replace(/\s+/g,' ');
          const msg=pfHelpText[title];if(!msg)return;
          const b=document.createElement('button');b.type='button';b.className='pf-info';
          b.setAttribute('aria-label','Information about '+title);b.innerHTML=`<img src="${pfInfoIcon}" alt="">`;
          b.addEventListener('mouseenter',()=>showPfTooltip(b,msg));
          b.addEventListener('mouseleave',hidePfTooltip);
          b.addEventListener('focus',()=>showPfTooltip(b,msg));
          b.addEventListener('blur',hidePfTooltip);
          b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(pfTooltip)hidePfTooltip();else showPfTooltip(b,msg);});
          h.appendChild(b);
        });
      }
      const pfInfoObserver = new MutationObserver(()=>{
        attachPfInfo(document.getElementById('app'));
        attachPfInfo(dlg);
        attachPfInfo(confirmationDlg);
      });
      pfInfoObserver.observe(document.body,{childList:true,subtree:true});

      const confirmDel = (t, m, label) =>
        ask(t, m, [
          { label: 'Cancel', val: false },
          { label, cls: 'danger solid', val: true },
        ]);
      // Authentication
      // Count Unicode code points, so emojis are not counted as two UTF-16 units.
      function validUsername(value) {
        const length = [...value].length;
        return value.trim().length > 0 && length <= 100;
      }
      const PIPFOLIO_BRAND =
        '<div class="brand"><span class="pipfolio-picture"><img class="pipfolio-wordmark pipfolio-dark-logo" alt="Pipfolio" src="assets/image-04-367e0a59952e.png"><img class="pipfolio-wordmark pipfolio-light-logo" alt="Pipfolio" src="assets/image-05-666de95436a7.png"></span></div>';
      function authScreen(mode = 'signin', message = '') {
        closeDlg();
        const signup = mode === 'signup',
          reset = mode === 'reset',
          update = mode === 'update';
        const failedLoad = mode === 'loaderror';
        const title = signup
          ? 'Create your account'
          : reset
            ? 'Reset your password'
            : update
              ? 'Set a new password'
              : failedLoad
                ? 'Journal unavailable'
                : '';
        app.innerHTML = `<div class="lock"><div class="card">
        ${PIPFOLIO_BRAND}${title ? `<h2 style="margin-top:16px">${title}</h2>` : ''}
        <p class="auth-note">${
          failedLoad
            ? 'Retry loading before making any changes.'
            : update
              ? 'Choose a password with at least 8 characters.'
              : 'Your trading journal, saved to your account.'
        }</p>
        <p id="auth-message" class="auth-status" role="status"${message ? '' : ' hidden'}>${esc(message)}</p>
        ${
          failedLoad
            ? `<div class="auth-links"><button type="button" class="btn primary" id="auth-retry">Retry loading</button><button type="button" class="btn" id="auth-signout">Sign out</button></div>`
            : `<form id="auth-form">
            ${signup ? '<label class="f"><span>Username</span><input name="username" autocomplete="username" required maxlength="200" placeholder="Any name, emojis and symbols welcome"></label>' : ''}
            ${!update ? '<label class="f"><span>Email address</span><input type="email" name="email" autocomplete="email" required maxlength="254"></label>' : ''}
            ${!reset ? `<label class="f"><span>Password</span><input type="password" name="password" autocomplete="${signup || update ? 'new-password' : 'current-password'}" required ${signup || update ? 'minlength="8"' : ''}></label>` : ''}
            ${signup || update ? '<label class="f"><span>Confirm password</span><input type="password" name="confirm" autocomplete="new-password" minlength="8" required></label>' : ''}
            <button class="btn primary block" id="auth-submit">${signup ? 'Create account' : reset ? 'Send reset email' : update ? 'Save password' : 'Sign in'}</button>
        </form>
        <div class="auth-links">${update ? '<button type="button" class="btn" id="auth-back">Back to journal</button><button type="button" class="btn" id="auth-signout">Sign out</button>' : `<button type="button" class="btn" id="auth-toggle">${signup || reset ? 'Back to sign in' : 'Create account'}</button>${!reset ? '<button type="button" class="btn" id="auth-forgot">Forgot password?</button>' : ''}`}</div>`
        }
        </div></div>`;
        const say = (text, error = false) => {
          const el = $('#auth-message');
          if (el) {
            el.textContent = text;
            el.hidden = !text;
            el.classList.toggle('neg', error);
          }
        };
        $('#auth-retry')?.addEventListener(
          'click',
          () => currentUser && loadAccount(currentUser, true),
        );
        $('#auth-toggle')?.addEventListener('click', () =>
          authScreen(signup || reset ? 'signin' : 'signup'),
        );
        $('#auth-forgot')?.addEventListener('click', () => authScreen('reset'));
        $('#auth-signout')?.addEventListener('click', signOut);
        $('#auth-back')?.addEventListener('click', async () => {
          if (recoveryMode) return say('Save your new password first, or sign out.');
          if (currentUser) await loadAccount(currentUser, true);
        });
        $('#auth-form')?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const form = event.target,
            fields = new FormData(form);
          const email = String(fields.get('email') || '').trim();
          const password = String(fields.get('password') || '');
          const username = String(fields.get('username') || '').trim();
          if (signup && !validUsername(username))
            return say(
              'Username must contain 1–100 characters, including emojis or symbols.',
              true,
            );
          if ((signup || update) && password !== fields.get('confirm'))
            return say('Passwords do not match.', true);
          const button = $('#auth-submit');
          button.disabled = true;
          // Prevent navigation during an authentication request.
          app.querySelectorAll('.auth-links button').forEach((b) => (b.disabled = true));
          say('Please wait…');
          try {
            if (update) {
              const { error } = await db.auth.updateUser({ password });
              if (error) throw error;
              recoveryMode = false;
              const { data, error: sessionError } = await db.auth.getSession();
              if (sessionError) throw sessionError;
              if (!data.session) throw new Error('Please sign in again with your new password.');
              await loadAccount(data.session.user, true);
              toast('Password updated');
            } else if (reset) {
              const { error } = await db.auth.resetPasswordForEmail(email, {
                redirectTo: redirectURL(),
              });
              if (error) throw error;
              say('If an account exists for that email, a password reset link has been sent.');
            } else {
              const result = signup
                ? await db.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: redirectURL(), data: { username } },
                  })
                : await db.auth.signInWithPassword({ email, password });
              if (result.error) throw result.error;
              if (result.data.session) await loadAccount(result.data.session.user);
              else
                say(
                  'Check your email for a confirmation link, then return here to sign in. If you already have an account, sign in or reset your password.',
                );
            }
          } catch (error) {
            say(error.message || 'Could not complete the request. Try again.', true);
          } finally {
            button.disabled = false;
            form.querySelector('[name="password"]') &&
              (form.querySelector('[name="password"]').value = '');
            form.querySelector('[name="confirm"]') &&
              (form.querySelector('[name="confirm"]').value = '');
            app.querySelectorAll('.auth-links button').forEach((b) => (b.disabled = false));
          }
        });
      }
      const redirectURL = () => location.origin + location.pathname;
      async function signOut() {
        if (saving) return;
        try {
          const { error } = await db.auth.signOut({ scope: 'local' });
          if (error) throw error;
          recoveryMode = false;
          clearAccount();
          authScreen('signin');
        } catch (error) {
          toast('Could not sign out. ' + error.message, 'error');
        }
      }
      async function startCloud() {
        if (
          SUPABASE_URL.includes('YOUR_PROJECT') ||
          SUPABASE_PUBLISHABLE_KEY.includes('YOUR_SUPABASE')
        ) {
          app.innerHTML =
            '<div class="lock"><div class="card"><div class="brand"><span class="pipfolio-picture"><img class="pipfolio-wordmark pipfolio-dark-logo" alt="Pipfolio" src="assets/image-04-367e0a59952e.png"><img class="pipfolio-wordmark pipfolio-light-logo" alt="Pipfolio" src="assets/image-05-666de95436a7.png"></span></div><h2 style="margin-top:16px">Connect your Supabase project</h2><p class="auth-note">Open index.html in a text editor. Fill in SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY near the start of the JavaScript, then upload it again. Run supabase-setup.sql in your Supabase project first.</p></div></div>';
          return;
        }
        if (!window.supabase?.createClient) {
          app.innerHTML =
            '<div class="lock"><div class="card">The Supabase library could not load. Check your connection or content blocker, then refresh.</div></div>';
          return;
        }
        try {
          db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              flowType: 'implicit',
            },
          });
          db.auth.onAuthStateChange((event, session) => {
            // Do not await another Supabase call inside this callback.
            if (event === 'PASSWORD_RECOVERY') {
              recoveryMode = true;
              setTimeout(() => {
                if (recoveryMode) {
                  clearAccount();
                  currentUser = session?.user || null;
                  authScreen('update');
                }
              }, 0);
            } else if (event === 'SIGNED_OUT') {
              recoveryMode = false;
              clearAccount();
              authScreen();
            } else if (event === 'SIGNED_IN' && session) {
              const eventGeneration = authGeneration;
              setTimeout(() => {
                if (!recoveryMode && eventGeneration === authGeneration) loadAccount(session.user);
              }, 0);
            }
          });
          const { data, error } = await db.auth.getSession();
          if (error) throw error;
          const authError =
            new URLSearchParams(location.hash.slice(1)).get('error_description') ||
            new URLSearchParams(location.search).get('error_description');
          if (authError) {
            history.replaceState(null, '', location.pathname);
            authScreen('signin', authError);
          } else if (recoveryMode && data.session) {
            currentUser = data.session.user;
            authScreen('update');
          } else if (data.session) await loadAccount(data.session.user);
          else authScreen();
        } catch (error) {
          authScreen('signin', 'Connection error: ' + error.message);
        }
      }

      // App shell and view routing
      function render() {
        const v = S.view;
        app.innerHTML = `<div class="wrap"><header class="top">${PIPFOLIO_BRAND}
<div class="header-navigation"><span class="header-username" title="${esc(profileUsername || 'Set username in Settings')}"><bdi dir="auto">${esc(profileUsername || 'Set username in Settings')}</bdi></span><nav class="tabs header-tabs" aria-label="Main navigation">${[
          ['dashboard', 'Dashboard'],
          ['trades', 'Trades'],
          ['review', 'Trade Review'],
          ['settings', 'Settings'],
        ]
          .map(
            ([k, l]) =>
              `<button class="tab ${v === k ? 'on' : ''}" data-act="view" data-v="${k}" ${v === k ? 'aria-current="page"' : ''}>${l}</button>`,
          )
          .join('')}</nav></div></header>
    <main>${
      v === 'dashboard'
        ? dashboard()
        : v === 'trades'
          ? tradesView()
          : v === 'review'
            ? reviewView()
            : settingsView()
    }</main>
    <footer class="footer"><div class="footer-copyright">\u00a9 ${new Date().getFullYear()} Pipfolio. All rights reserved.<div class="footer-credit">Created by Ahndre Walters</div></div><p class="footer-disclaimer"><strong>Risk Disclaimer:</strong> Trading in financial markets and leveraged instruments involves risk, including capital loss. Pipfolio is a trade journaling and analytics platform for informational purposes only, not financial advice, investment recommendations or trading signals. Trading decisions are at your own risk. Past performance does not guarantee future results. Assess circumstances and practice responsible risk management.</p></footer></div>`;
      }
      const emptyState = () =>
        `<div class="card empty"><h2>No Trades Yet</h2><p>Add your first trade to start tracking
    your performance.</p><button class="btn primary" data-act="add">Add trade</button></div>`;
      const scope = () => S.trades.filter((t) => S.acc === 'all' || t.account === S.acc);
      const scopeAccs = () =>
        S.acc === 'all' ? S.settings.accounts : S.settings.accounts.filter((a) => a.id === S.acc);
      const accOpts = (v) =>
        `<option value="all">All accounts</option>${S.settings.accounts
          .map(
            (a) => `<option value="${esc(a.id)}"
    ${v === a.id ? 'selected' : ''}>${esc(a.name)}</option>`,
          )
          .join('')}`;
      // Dashboard
      function dashboard() {
        if (S.acc !== 'all' && !acc(S.acc)) S.acc = 'all';
        const accounts = scopeAccs();
        const currencies = [...new Set(accounts.map((a) => a.currency))];
        CTX = currencies.length === 1 ? currencies[0] : '';
        const mixed = currencies.length > 1;
        const s = stats(scope());
        const balance = accounts.reduce((sum, a) => sum + a.balance + flowNet(a), 0) + s.net;
        const head = `<div class="page-h dashboard-heading"><div><h1 class="dashboard-heading-quote"><span class="dashboard-quote-mark" aria-hidden="true">“</span><span class="dashboard-quote-text">${esc(dashboardQuote())}</span><span class="dashboard-quote-mark" aria-hidden="true">”</span></h1></div><div class="dashboard-top-actions"><div class="dashboard-balance"><strong class="${cls(balance)}">${mixed ? 'N/A' : fm(balance, 1)}</strong></div><select id="accf" class="hsel" aria-label="Filter by account">${accOpts(S.acc)}</select></div></div>`;
        if (!S.trades.length) return head + emptyState();
        if (!s.n)
          return (
            head +
            `<div class="card empty"><h2>Nothing to Chart Yet</h2><p>${s.open ? `${s.open} open trade(s). Close a trade to see your results.` : 'No closed trades in this account yet.'}</p><button class="btn primary" data-act="view" data-v="trades">See trades</button></div>`
          );
        const money = (n) => (mixed ? 'N/A' : fm(n, 1));
        const pct = (n) => `${n.toFixed(1)}%`;
        const profit = r2(s.ts.filter((x) => x.net > 0).reduce((a, x) => a + x.net, 0));
        const loss = r2(-s.ts.filter((x) => x.net < 0).reduce((a, x) => a + x.net, 0));
        let peak = 0,
          running = 0,
          drawdown = 0;
        const equity = [0];
        for (const x of s.ts) {
          running = r2(running + x.net);
          equity.push(running);
          peak = Math.max(peak, running);
          drawdown = r2(Math.max(drawdown, peak - running));
        }
        const dayTotals = new Map();
        for (const x of s.ts) {
          const day = x.t.xdt.slice(0, 10);
          dayTotals.set(day, r2((dayTotals.get(day) || 0) + x.net));
        }
        const winningDays = [...dayTotals.values()].filter((v) => v > 0).length;
        const dayWinRate = dayTotals.size ? (100 * winningDays) / dayTotals.size : 0;
        const latestCloseDay = s.ts.length ? s.ts[s.ts.length - 1].t.xdt.slice(0, 10) : '';
        const earlierCloseDays = [
          ...new Set(s.ts.map((x) => x.t.xdt.slice(0, 10)).filter((d) => d < latestCloseDay)),
        ].sort();
        const priorDay = earlierCloseDays.at(-1);
        const priorDayNet = priorDay ? r2(dayTotals.get(priorDay)) : null;
        const latestDayNet = latestCloseDay ? r2(dayTotals.get(latestCloseDay)) : 0;
        const dayChange = priorDayNet === null ? 0 : r2(latestDayNet - priorDayNet);
        const priorDayDelta =
          priorDayNet === null
            ? ''
            : `<div class="kpi-prior ${dayChange >= 0 ? 'pos' : 'neg'}">${dayChange >= 0 ? '▲' : '▼'} ${money(Math.abs(dayChange))} vs prior trading day</div>`;
        const avgWin = s.w.length ? profit / s.w.length : 0;
        const avgLoss = s.l.length ? loss / s.l.length : 0;
        const avgRatio = avgLoss ? avgWin / avgLoss : null;
        const gauge = (rate, caption) =>
          `<div class="kpi-gauge"><svg viewBox="0 0 120 78" aria-hidden="true"><path d="M 12 65 A 48 48 0 0 1 108 65" pathLength="100" fill="none" stroke="var(--bd)" stroke-width="9" stroke-linecap="round"/><path d="M 12 65 A 48 48 0 0 1 108 65" pathLength="100" fill="none" stroke="var(--ac)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${Math.max(0, Math.min(100, rate))} 100"/></svg><strong>${rate.toFixed(1)}%</strong></div><span class="kpi-gauge-side">${caption}</span>`;
        const metricCards = [
          {
            label: 'Net P&L',
            value: money(s.net),
            color: cls(s.net),
            sub: `${s.n} closed trade${s.n === 1 ? '' : 's'} · ${money(r2(s.ts.reduce((sum, x) => sum + x.t.comm + (x.t.charges || 0), 0)))} fees`,
            prior: priorDayDelta,
            help: 'Total profit or loss from closed trades after recorded costs.',
          },
          {
            label: 'Trade Win %',
            content: gauge(
              s.wr,
              `<span class="kpi-wins">${s.w.length} W</span><br>${s.be} BE<br><span class="kpi-losses">${s.l.length} L</span>`,
            ),
            help: 'Winning closed trades divided by all closed trades, including breakeven trades.',
          },
          {
            label: 'Profit Factor',
            value: s.pf === null ? 'N/A' : s.pf === Infinity ? '∞' : s.pf.toFixed(2),
            sub: 'Gross profit ÷ gross loss',
            prior:
              s.pf === null
                ? '<div class="kpi-pf-status neutral">No Wins or Losses Yet</div>'
                : s.pf === Infinity
                  ? '<div class="kpi-pf-status pos">▲ No Losing Trades</div>'
                  : s.pf > 1
                    ? '<div class="kpi-pf-status pos">▲ Above Break-Even</div>'
                    : s.pf < 1
                      ? '<div class="kpi-pf-status neg">▼ Below Break-Even</div>'
                      : '<div class="kpi-pf-status neutral">At Break-Even</div>',
            help: 'Gross profits from winning trades divided by absolute gross losses. Above 1 means gross profits exceed gross losses; this does not necessarily mean net profitability after fees.',
          },
          {
            label: 'Avg Win / Loss',
            value: avgRatio === null ? 'N/A' : avgRatio.toFixed(2),
            content: `<div class="kpi-ratio"><div class="kpi-ratio-track" style="--ratio-split:${avgWin + avgLoss ? (100 * avgWin) / (avgWin + avgLoss) : 50}%"><span></span></div><div class="kpi-ratio-labels"><span><strong class="pos">${money(avgWin)}</strong> avg win</span><span><strong class="neg">${money(-avgLoss)}</strong> avg loss</span></div></div>`,
            help: 'Average winning trade divided by absolute average losing trade.',
          },
        ];
        const width = 800,
          height = 230,
          gutter = 42;
        const lo = Math.min(0, ...equity),
          hi = Math.max(0, ...equity),
          range = hi - lo || 1;
        const px = (i) => gutter + (i * (width - 2 * gutter)) / Math.max(1, equity.length - 1);
        const py = (v) => height - gutter - ((v - lo) / range) * (height - 2 * gutter);
        const points = equity.map((v, i) => `${px(i)},${py(v)}`).join(' ');
        const baseline = py(0);
        const grid = '';
        const curve = `<svg class="progress-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Interactive cumulative trading profit and loss chart" preserveAspectRatio="none"><defs><linearGradient id="progress-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--ac)" stop-opacity=".24"/><stop offset="1" stop-color="var(--ac)" stop-opacity=".015"/></linearGradient></defs>${grid}<line x1="${gutter}" x2="${width - gutter}" y1="${baseline}" y2="${baseline}" stroke="var(--mut)" stroke-dasharray="5 5"/><polygon points="${gutter},${height - gutter} ${points} ${width - gutter},${height - gutter}" fill="url(#progress-fill)"/><polyline points="${points}" fill="none" stroke="var(--ac)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><line class="progress-guide" x1="${gutter}" x2="${gutter}" y1="${gutter}" y2="${height - gutter}" stroke="var(--ac)" stroke-dasharray="4 4" opacity="0"/><ellipse class="progress-dot" cx="${gutter}" cy="${py(equity[0])}" rx="6" ry="6" fill="var(--ac)" stroke="var(--card)" stroke-width="3" vector-effect="non-scaling-stroke" opacity="0"/><rect class="progress-hit" x="${gutter}" y="${gutter}" width="${width - 2 * gutter}" height="${height - 2 * gutter}" fill="transparent" tabindex="0" role="img" aria-label="Move across chart to inspect each cumulative profit and loss value"/></svg>`;
        const progressValues = equity.map((v) => Number(v.toFixed(2)));
        const progressDates = [null, ...s.ts.map((x) => x.t.xdt.slice(0, 10))];
        const months = new Map();
        for (const x of s.ts) {
          const key = x.t.xdt.slice(0, 7);
          months.set(key, r2((months.get(key) || 0) + x.net));
        }
        const monthEntries = [...months.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-6);
        const maxMonth = Math.max(...monthEntries.map((x) => Math.abs(x[1]))) || 1;
        const monthChart = `<div class="simple-bars">${monthEntries.map(([key, val]) => `<div class="simple-bar-item" title="${esc(key)}: ${esc(money(val))}"><span class="simple-bar-value ${cls(val)}"><span class="desktop-amount">${money(val)}</span><span class="mobile-amount">${mixed ? 'N/A' : compactAmount(val)}</span></span><div class="simple-bar-track"><div class="simple-bar-fill ${val < 0 ? 'is-loss' : ''}" style="height:${Math.max(3, (Math.abs(val) / maxMonth) * 100)}%"></div></div><span class="simple-bar-label">${esc(key.slice(5))}/${esc(key.slice(2, 4))}</span></div>`).join('')}</div>`;
        const pairs = new Map();
        for (const x of s.ts) {
          const pair = x.t.pair || 'Other';
          pairs.set(pair, r2((pairs.get(pair) || 0) + x.net));
        }
        const pairEntries = [...pairs.entries()]
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .slice(0, 5);
        const maxPair = Math.max(...pairEntries.map((x) => Math.abs(x[1]))) || 1;
        const pairChart = `<div class="simple-pairs">${pairEntries.map(([pair, val]) => `<div class="simple-pair-row"><div class="simple-pair-top"><strong>${pairHTML(pair)}</strong><span class="${cls(val)}">${money(val)}</span></div><div class="simple-pair-track"><span class="${val < 0 ? 'is-loss' : ''}" style="width:${Math.max(2, (Math.abs(val) / maxPair) * 100)}%"></span></div></div>`).join('')}</div>`;
        // Six trade-derived dimensions, normalised for visual comparison only.
        const clamp100 = (value) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
        const payoff = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 3 : 0;
        const consistency = dayWinRate;
        const recovery =
          drawdown > 0 ? clamp100((Math.max(0, s.net) / drawdown / 3) * 100) : s.net > 0 ? 100 : 0;
        const radarMetrics = [
          { label: 'Win %', value: clamp100(s.wr) },
          {
            label: 'Profit Factor',
            value: clamp100(((s.pf === Infinity ? 3 : s.pf || 0) / 3) * 100),
          },
          { label: 'Avg Win/Loss', value: clamp100((payoff / 3) * 100) },
          { label: 'Drawdown', value: clamp100(100 * (1 - drawdown / Math.max(1, profit + loss))) },
          { label: 'Recovery', value: recovery },
          { label: 'Consistency', value: clamp100(consistency) },
        ];
        const radarCx = 220,
          radarCy = 188,
          radarRadius = 119;
        const radarPoint = (index, fraction) => {
          const angle = -Math.PI / 2 + (index * 2 * Math.PI) / radarMetrics.length;
          return [
            radarCx + Math.cos(angle) * radarRadius * fraction,
            radarCy + Math.sin(angle) * radarRadius * fraction,
          ];
        };
        const radarPoly = (fraction) =>
          radarMetrics
            .map((_, i) =>
              radarPoint(i, fraction)
                .map((n) => n.toFixed(1))
                .join(','),
            )
            .join(' ');
        const radarShape = radarMetrics
          .map((m, i) =>
            radarPoint(i, m.value / 100)
              .map((n) => n.toFixed(1))
              .join(','),
          )
          .join(' ');
        const radarScore = radarMetrics.reduce((sum, m) => sum + m.value, 0) / radarMetrics.length;
        const radarChart = `<svg class="radar-svg radar-six" viewBox="0 0 440 380" role="img" aria-label="Six-axis trading performance radar chart, custom score ${radarScore.toFixed(0)} out of 100">
          ${[0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${radarPoly(f)}" fill="none" stroke="var(--bd)" stroke-width="1"/>`).join('')}
          ${radarMetrics
            .map((_, i) => {
              const [x, y] = radarPoint(i, 1);
              return `<line x1="${radarCx}" y1="${radarCy}" x2="${x}" y2="${y}" stroke="var(--bd)"/>`;
            })
            .join('')}
          <polygon points="${radarShape}" fill="var(--ac)" fill-opacity=".20" stroke="var(--ac)" stroke-width="2.5" stroke-linejoin="round"/>
          ${radarMetrics
            .map((m, i) => {
              const [x, y] = radarPoint(i, 1.3);
              const anchor = x < radarCx - 12 ? 'end' : x > radarCx + 12 ? 'start' : 'middle';
              return `<text x="${x}" y="${y}" fill="var(--mut)" font-size="12" text-anchor="${anchor}" dominant-baseline="middle">${m.label}</text>`;
            })
            .join('')}
          <circle cx="${radarCx}" cy="${radarCy}" r="27" fill="var(--card)" fill-opacity=".94" stroke="var(--bd)" stroke-width="1"/>
          <text x="${radarCx}" y="${radarCy - 1}" fill="var(--tx)" text-anchor="middle" dominant-baseline="middle" font-size="21" font-weight="750">${radarScore.toFixed(0)}</text>
          <text x="${radarCx}" y="${radarCy + 15}" fill="var(--mut)" text-anchor="middle" font-size="9">/ 100</text>
        </svg>`;
        return `${head}${mixed ? '<p class="notice-mixed">Accounts have different currencies. Select one account for meaningful money totals.</p>' : ''}
      <div class="simple-stats kpi-stats">${metricCards.map((m, i) => `<div class="card simple-stat kpi-card"><div class="simple-stat-head"><div class="simple-label">${m.label}</div></div>${m.value !== undefined ? `<div class="simple-value ${m.color || ''}">${m.value}</div>` : ''}${m.prior || ''}${m.content ? `<div class="kpi-content">${m.content}</div>` : ''}${m.sub ? `<div class="simple-sub">${m.sub}</div>` : ''}</div>`).join('')}</div>
      <div class="simple-layout">
        <section class="card simple-panel"><div class="simple-panel-title"><h2>Your Progress</h2></div><div class="simple-curve" data-progress-values="${esc(JSON.stringify(progressValues))}" data-progress-dates="${esc(JSON.stringify(progressDates))}" data-progress-money="${mixed ? 'mixed' : 'single'}">${curve}</div></section>
        <section class="card simple-panel radar-panel"><div class="simple-panel-title"><h2>Trading Performance</h2></div>${radarChart}</section>

      </div>
      <div class="simple-chart-grid">
        <section class="card simple-panel"><div class="simple-panel-title"><h2>Performance by Pair</h2></div>${pairChart}</section>
        <section class="card simple-panel"><div class="simple-panel-title"><h2>Monthly P&L</h2></div>${monthChart}</section>
      </div>
      <div class="dashboard-calendar-row">
        <section class="card simple-panel simple-calendar" id="cal">${calendar()}</section>

      </div>`;
      }

      // Chart calculations and rendering

      // Chart tooltips
      let chartInfoPop;
      function showChartInfo(el) {
        if (!chartInfoPop) {
          chartInfoPop = document.createElement('div');
          chartInfoPop.className = 'ref-help-pop';
          chartInfoPop.setAttribute('role', 'tooltip');
          document.body.appendChild(chartInfoPop);
        }
        chartInfoPop.replaceChildren();
        const title = document.createElement('strong');
        title.textContent =
          (el.getAttribute('data-chart-title') || '') +
          (el.classList.contains('progress-hit') && el.dataset.progressDate
            ? ' · ' + el.dataset.progressDate.replace(/^Closed: /, '')
            : '');
        const detail = document.createElement('div');
        if (el.classList.contains('progress-hit') && el.dataset.progressPnl) {
          detail.append(document.createTextNode('Cumulative Net P&L: '));
          const amount = document.createElement('strong');
          amount.textContent = el.dataset.progressPnl;
          amount.style.display = 'inline';
          detail.style.whiteSpace = 'nowrap';
          detail.style.overflowWrap = 'normal';
          amount.style.color =
            el.dataset.progressSign === 'negative'
              ? 'var(--red, #F32645)'
              : el.dataset.progressSign === 'positive'
                ? 'var(--green, #00AD4F)'
                : 'var(--tx)';
          detail.append(amount);
        } else {
          detail.textContent = el.getAttribute('data-chart-detail') || '';
        }
        if (el.classList.contains('progress-hit')) {
          title.style.textAlign = 'center';
          detail.style.textAlign = 'center';
        }
        chartInfoPop.append(title, detail);
        chartInfoPop.hidden = false;
        const a = el.getBoundingClientRect(),
          b = chartInfoPop.getBoundingClientRect();
        chartInfoPop.style.left =
          Math.max(10, Math.min(innerWidth - b.width - 10, a.left + a.width / 2 - b.width / 2)) +
          'px';
        let y = a.top - b.height - 10;
        if (y < 8) y = a.bottom + 10;
        chartInfoPop.style.top =
          Math.min(Math.max(8, y), Math.max(8, innerHeight - b.height - 8)) + 'px';
      }
      function hideChartInfo() {
        if (chartInfoPop) chartInfoPop.hidden = true;
      }

      // Interactive crosshair and floating rectangular detail for Your Progress.
      function progressHover(hit, clientX, keyboardIndex) {
        const root = hit.closest('.simple-curve'),
          svg = hit.ownerSVGElement;
        if (!root || !svg) return;
        let values;
        try {
          values = JSON.parse(root.dataset.progressValues || '[]');
        } catch {
          return;
        }
        if (!values.length) return;
        const rect = svg.getBoundingClientRect();
        const left = 42,
          right = 758,
          top = 42,
          bottom = 188;
        const x =
          clientX == null
            ? left
            : Math.max(left, Math.min(right, ((clientX - rect.left) / rect.width) * 800));
        const i =
          keyboardIndex == null
            ? Math.round(((x - left) / (right - left)) * Math.max(1, values.length - 1))
            : Math.max(0, Math.min(values.length - 1, keyboardIndex));
        const gx = left + (i * (right - left)) / Math.max(1, values.length - 1);
        const lo = Math.min(0, ...values),
          hi = Math.max(0, ...values),
          range = hi - lo || 1;
        const gy = bottom - ((values[i] - lo) / range) * (bottom - top);
        const guide = svg.querySelector('.progress-guide'),
          dot = svg.querySelector('.progress-dot');
        guide.setAttribute('x1', gx);
        guide.setAttribute('x2', gx);
        guide.setAttribute(
          'stroke',
          values[i] < 0 ? 'var(--red, #F32645)' : 'var(--green, #00AD4F)',
        );
        guide.setAttribute('opacity', '0');
        dot.setAttribute('cx', gx);
        dot.setAttribute('cy', gy);
        dot.setAttribute('rx', (6 * 800) / Math.max(1, rect.width));
        dot.setAttribute('ry', (6 * 230) / Math.max(1, rect.height));
        dot.setAttribute('fill', values[i] < 0 ? 'var(--red, #F32645)' : 'var(--green, #00AD4F)');
        dot.setAttribute('opacity', '1');
        hit.dataset.progressIndex = i;
        hit.setAttribute(
          'data-chart-title',
          i === 0 ? 'Starting Balance (P&L)' : 'Closed Trade ' + i + ' of ' + (values.length - 1),
        );
        const dates = JSON.parse(root.dataset.progressDates || '[]');
        hit.dataset.progressDate = dates[i] ? 'Closed: ' + dates[i] : 'Starting point';
        hit.dataset.progressPnl =
          root.dataset.progressMoney === 'mixed' ? 'Mixed account currencies' : fm(values[i], 1);
        hit.dataset.progressSign =
          root.dataset.progressMoney === 'mixed'
            ? 'neutral'
            : values[i] > 0
              ? 'positive'
              : values[i] < 0
                ? 'negative'
                : 'neutral';
        hit.setAttribute(
          'data-chart-detail',
          hit.dataset.progressDate + ' · Cumulative Net P&L: ' + hit.dataset.progressPnl,
        );
        showChartInfo(hit);
      }
      function progressLeave(hit) {
        const svg = hit.ownerSVGElement;
        if (svg) {
          svg.querySelector('.progress-guide')?.setAttribute('opacity', '0');
          svg.querySelector('.progress-dot')?.setAttribute('opacity', '0');
        }
        hideChartInfo();
      }
      document.addEventListener('pointermove', (e) => {
        if (e.target.matches?.('.progress-hit')) progressHover(e.target, e.clientX);
      });
      document.addEventListener(
        'pointerleave',
        (e) => {
          if (e.target.matches?.('.progress-hit')) progressLeave(e.target);
        },
        true,
      );
      document.addEventListener('focusin', (e) => {
        if (e.target.matches?.('.progress-hit')) progressHover(e.target, null, 0);
      });
      document.addEventListener('focusout', (e) => {
        if (e.target.matches?.('.progress-hit')) progressLeave(e.target);
      });
      document.addEventListener('keydown', (e) => {
        if (!e.target.matches?.('.progress-hit') || !['ArrowLeft', 'ArrowRight'].includes(e.key))
          return;
        e.preventDefault();
        const i = Number(e.target.dataset.progressIndex || 0) + (e.key === 'ArrowRight' ? 1 : -1);
        progressHover(e.target, null, i);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideChartInfo();
      });
      window.addEventListener('scroll', hideChartInfo, true);
      window.addEventListener('resize', hideChartInfo);
      // Progress chart interactions

      // Trading calendar
      const MONTHS = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];
      const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const DAY_NAMES = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const CAL_MIN = 1900;
      const CAL_MAX = 2100;
      const pad = (n, w = 2) => String(n).padStart(w, '0');
      const dayKey = (y, m, d) => `${pad(y, 4)}-${pad(m + 1)}-${pad(d)}`;
      S.cal = {
        y: +nowLocal().slice(0, 4),
        m: +nowLocal().slice(5, 7) - 1,
      };
      S.calDay = '';
      function dayMap(list) {
        const map = new Map();
        const entry = (key) => {
          if (!map.has(key)) map.set(key, { net: 0, closed: [], open: [] });
          return map.get(key);
        };
        calcAll(list).forEach((x) => {
          if (x.c) {
            const e = entry(x.t.xdt.slice(0, 10));
            e.net = r2(e.net + x.net);
            e.closed.push(x);
          } else {
            entry(x.t.dt.slice(0, 10)).open.push(x);
          }
        });
        return map;
      }
      // Compact chart labels; full values remain available in details.
      function compactAmount(n) {
        const sign = n < 0 ? '−' : n > 0 ? '+' : '';
        const absolute = Math.abs(n);
        return (
          sign +
          (absolute >= 1000
            ? short(absolute)
            : absolute.toLocaleString(undefined, { maximumFractionDigits: 0 }))
        );
      }
      function calAmt(n) {
        const a = Math.abs(n);
        const v = a >= 1000 ? short(a) : a >= 100 ? String(Math.round(a)) : a.toFixed(2);
        const c = CTX.length > 1 ? CTX + ' ' : CTX;
        return (n < 0 ? '\u2212' : n > 0 ? '+' : '') + c + v;
      }
      function calCell(key, e, today) {
        const closed = e ? e.closed.length : 0;
        const open = e ? e.open.length : 0;
        const tone = !closed ? '' : e.net > 0 ? 'pos' : e.net < 0 ? 'neg' : 'be';
        const note = [closed && `${closed} trade${closed > 1 ? 's' : ''}`, open && `${open} open`]
          .filter(Boolean)
          .join(' \u00b7 ');
        const label = closed
          ? `${key}: ${fm(e.net, 1)} from ${closed} closed
        trade${closed > 1 ? 's' : ''}`
          : `${key}: ${open ? open + ' open' : 'no trades'}`;
        const classes = ['cal-d', tone];
        if (key === today) classes.push('today');
        if (key === S.calDay) classes.push('sel');
        return `<button class="${classes.join(' ')}" data-act="calday"
    data-d="${key}" title="${label}" aria-label="${label}"
    aria-pressed="${key === S.calDay}">
    <span class="cal-num">${+key.slice(8)}</span>
    ${closed ? `<span class="cal-v" aria-hidden="true"><span class="desktop-amount">${calAmt(e.net)}</span><span class="mobile-amount">${compactAmount(e.net)}</span></span>` : ''}
    <span class="cal-n">${note}</span></button>`;
      }
      function calendar() {
        const { y, m } = S.cal;
        const days = dayMap(scope());
        const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
        const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const today = nowLocal().slice(0, 10);
        const cells = Array(lead).fill('<div></div>');
        let net = 0;
        let trades = 0;
        let green = 0;
        let red = 0;
        for (let d = 1; d <= count; d++) {
          const key = dayKey(y, m, d);
          const e = days.get(key);
          if (e && e.closed.length) {
            net = r2(net + e.net);
            trades += e.closed.length;
            if (e.net > 0) green++;
            if (e.net < 0) red++;
          }
          cells.push(calCell(key, e, today));
        }
        const name = S.acc === 'all' ? 'All accounts' : esc(acc(S.acc)?.name || '');
        const summary = trades
          ? `<b class="${cls(net)}">${fm(net, 1)}</b> \u00b7 ${trades} closed
        trade${trades > 1 ? 's' : ''} \u00b7 ${green} green and ${red} red
        day${green + red === 1 ? '' : 's'}`
          : 'No closed trades in this month.';
        return `<div class="cal-h"><div><h2 class="ref-calendar-title">Trading Calendar</h2>
    <div class="sub">${name} \u00b7 daily results by close date</div></div>
    <div class="cal-nav">
    
    <button class="btn icon" data-act="calprevy" aria-label="Previous year"
        ${y <= CAL_MIN ? 'disabled' : ''}>\u00ab</button>
    <button class="btn icon" data-act="calprev" aria-label="Previous month"
        ${y <= CAL_MIN && m === 0 ? 'disabled' : ''}>\u2039</button>
    <select id="cm" aria-label="Month">${MONTHS.map(
      (n, i) => `<option value="${i}" ${i === m ? 'selected' : ''}>${n}</option>`,
    ).join('')}</select>
    <input id="cy" type="number" min="${CAL_MIN}" max="${CAL_MAX}" step="1"
        value="${y}" aria-label="Year">
    <button class="btn icon" data-act="calnext" aria-label="Next month"
        ${y >= CAL_MAX && m === 11 ? 'disabled' : ''}>\u203a</button>
    <button class="btn icon" data-act="calnexty" aria-label="Next year"
        ${y >= CAL_MAX ? 'disabled' : ''}>\u00bb</button>
    <button class="btn" data-act="caltoday">Today</button></div></div>
    <div class="cal-sum">${MONTHS[m]} ${y}: ${summary}</div>
    <div class="cal-grid">${WEEKDAYS.map((w) => `<div class="cal-wd">${w}</div>`).join(
      '',
    )}${cells.join('')}</div>
    ${
      S.calDay
        ? dayPanel(S.calDay, days)
        : `<p class="cal-hint">Select a day to see its trades and result.</p>`
    }`;
      }
      function dayPanel(key, days) {
        const e = days.get(key) || { net: 0, closed: [], open: [] };
        const rows = [...e.closed, ...e.open].sort((a, b) =>
          a.t.dt < b.t.dt ? -1 : a.t.dt > b.t.dt ? 1 : a.t.created - b.t.created,
        );
        const weekday = DAY_NAMES[new Date(`${key}T00:00:00Z`).getUTCDay()];
        const head = `<div class="cal-day"><h2>${key} \u00b7 ${weekday}</h2>`;
        if (!rows.length) return `${head}<p class="mp">No trades on this day.</p></div>`;
        const n = e.closed.length;
        const wins = e.closed.filter((x) => x.res === 'Win').length;
        const losses = e.closed.filter((x) => x.res === 'Loss').length;
        const nets = e.closed.map((x) => x.net);
        const pips = roundTo(
          e.closed.reduce((t, x) => t + (x.pips ?? 0), 0),
          1,
        );
        const comm = r2(e.closed.reduce((t, x) => t + x.t.comm + (x.t.charges || 0), 0));
        const dash = 'N/A';
        const tone = (v, text) => `<span class="${cls(v)}">${text}</span>`;
        const kv = [
          ['Daily P&L', n ? tone(e.net, fm(e.net, 1)) : dash],
          ['Closed trades', n],
          ['Wins / losses', `${wins} / ${losses}`],
          ['Win rate', n ? ((wins / n) * 100).toFixed(1) + '%' : dash],
          ['Best trade', n ? tone(Math.max(...nets), fm(Math.max(...nets), 1)) : dash],
          ['Worst trade', n ? tone(Math.min(...nets), fm(Math.min(...nets), 1)) : dash],
          ['Total pips', n ? tone(pips, pips) : dash],
          ['Fees', n ? fm(comm) : dash],
        ];
        const open = e.open.length
          ? `<p class="sub" style="margin-top:12px">${e.open.length} trade${e.open.length > 1 ? 's' : ''}
        opened on this day ${e.open.length > 1 ? 'are' : 'is'} still open and not
        counted in the daily result.</p>`
          : '';
        return `${head}<div class="kv4">${kv
          .map(([k, v]) => `<div class="lbl">${k}<b>${v}</b></div>`)
          .join('')}</div>${open}${tradeTable(rows, rows.length, false)}</div>`;
      }
      function refreshCal() {
        const el = $('#cal');
        if (el) el.innerHTML = calendar();
      }
      function calGo(y, m) {
        y += Math.floor(m / 12);
        m = ((m % 12) + 12) % 12;
        if (y < CAL_MIN || y > CAL_MAX) return;
        S.cal = { y, m };
        S.calDay = '';
        refreshCal();
      }
      // Example data
      const SAMPLE_ACCOUNTS = [
        {
          id: 'sample-acc-demo',
          name: 'Sample Demo',
          type: 'Demo',
          balance: 10000,
          risk: 0.01,
          broker: 'Sample Broker',
        },
        {
          id: 'sample-acc-live',
          name: 'Sample Live',
          type: 'Live',
          balance: 5000,
          risk: 0.01,
          broker: 'Sample Markets',
        },
        {
          id: 'sample-acc-prop',
          name: 'Sample Prop Firm',
          type: 'Prop Firm',
          balance: 25000,
          risk: 0.005,
          broker: 'Sample Capital',
        },
      ];
      const SAMPLE_PAIRS = [
        { pair: 'EURUSD', base: 1.085, dp: 5, pip: 0.0001, pv: 10, sl: [8, 20] },
        { pair: 'GBPUSD', base: 1.27, dp: 5, pip: 0.0001, pv: 10, sl: [10, 25] },
        { pair: 'USDJPY', base: 150.2, dp: 3, pip: 0.01, pv: 6.7, sl: [12, 30] },
        { pair: 'AUDUSD', base: 0.655, dp: 5, pip: 0.0001, pv: 10, sl: [8, 18] },
        { pair: 'GBPJPY', base: 190.5, dp: 3, pip: 0.01, pv: 6.7, sl: [15, 40] },
        { pair: 'XAUUSD', base: 2350, dp: 2, pip: 0.1, pv: 10, sl: [30, 80] },
      ];
      const SAMPLE_SESSIONS = [
        ['Asian', 60, 360],
        ['London', 480, 660],
        ['New York', 810, 1020],
        ['London/NY Overlap', 780, 840],
      ];
      const SAMPLE_SETUPS = ['Breakout', 'Trend pullback', 'Support / resistance', 'News fade'];
      // Small synthetic chart images make screenshot previews testable without external assets.
      const SAMPLE_SCREENSHOTS = [
        'assets/image-06-205eefc8c58e.png',
        'assets/image-07-1ec5d5a79e9c.png',
      ];
      const SAMPLE_EMOTIONS = [
        'Calm',
        'Confident',
        'Focused',
        'Fearful',
        'Anxious',
        'Frustrated',
        'Greedy',
        'Overconfident',
        'Excited',
        'Tired',
      ];
      const SAMPLE_MISTAKES = [
        'FOMO',
        'Revenge Trading',
        'Overtrading',
        'Oversized Position',
        'Moved Stop Loss',
        'Entered Early',
        'Exited Early',
        'Ignored Trading Plan',
        'Chased Price',
        'No Stop Loss',
      ];
      const SAMPLE_CHECKLIST = [
        'Trend confirmed',
        'Entry signal identified',
        'Stop loss set',
        'Risk checked',
      ];
      const SAMPLE_WIN_NOTES = [
        'Waited for confirmation and followed the plan.',
        'Clean entry at the level, managed the trade well.',
        'Patience paid off, held to the target.',
      ];
      const SAMPLE_LOSS_NOTES = [
        'Stopped out, setup invalidated. Risk was respected.',
        'Entered a little early, will wait for the close next time.',
        'Choppy conditions, price reversed against the level.',
      ];
      const sampleInfo = () => ({
        accounts: S.settings.accounts.filter((a) => a.sample).length,
        trades: S.trades.filter((t) => t.sample).length,
      });
      function buildSample() {
        const stamp = Date.now();
        let seed = (stamp % 2147483646) + 1;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const between = (a, b) => a + rnd() * (b - a);
        const pick = (list) => list[Math.floor(rnd() * list.length)];
        const today = nowLocal().slice(0, 10);
        const t0 = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
        const localStr = (ms) => {
          const d = new Date(ms);
          d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
          return d.toISOString().slice(0, 16);
        };
        const have = new Set(S.settings.accounts.map((a) => a.id));
        const batch = stamp.toString(36);
        let n = 0;
        // Regimes create streaks, while rare tail events produce unusually large moves.
        let regime = 0;
        let streakLeft = 0;
        const nextOutcome = () => {
          if (streakLeft-- <= 0) {
            regime = rnd() < 0.5 ? -1 : 1;
            streakLeft = 2 + Math.floor(rnd() * 10);
          }
          const roll = rnd();
          if (roll < 0.07) return 'flat';
          return rnd() < (regime > 0 ? 0.68 : 0.3) ? 'win' : 'loss';
        };
        const make = (a, ago, open) => {
          const inst = pick(SAMPLE_PAIRS);
          const [, from, to] = pick(SAMPLE_SESSIONS);
          const dir = rnd() < 0.5 ? 1 : -1;
          const entry = +(inst.base * (1 + between(-0.01, 0.01))).toFixed(inst.dp);
          const slPips = Math.round(between(...inst.sl));
          const rr = +between(0.6, 5).toFixed(1);
          // Position sizes vary; rare oversized positions magnify both wins and losses.
          const sizeFactor = rnd() < 0.07 ? between(2.5, 5) : between(0.35, 1.8);
          const risk = r2(a.balance * a.risk * sizeFactor);
          const lots = Math.max(0.01, Math.round((risk / (slPips * inst.pv)) * 100) / 100);
          const startMs = t0 - ago * 864e5 + Math.round(between(from, to)) * 6e4;
          const dt = localStr(startMs);
          n++;
          const t = {
            id: `sample-${batch}-${n}`,
            account: a.id,
            dt,
            xdt: '',
            pair: inst.pair,
            side: dir > 0 ? 'Buy' : 'Sell',
            entry,
            sl: +(entry - dir * slPips * inst.pip).toFixed(inst.dp),
            tp: +(entry + dir * slPips * rr * inst.pip).toFixed(inst.dp),
            exit: null,
            lots,
            risk,
            pl: null,
            comm: 0,
            charges: 0,
            adjustment: 0,
            pipSize: inst.pip,
            session: detectSession(dt),
            setup: pick(SAMPLE_SETUPS),
            tf: pick(['M15', 'H1', 'H4']),
            notes: open ? 'Trade still running, stop is in place.' : '',
            psychologyBefore: pick(SAMPLE_EMOTIONS),
            psychologyAfter: '',
            planFollowed: rnd() < 0.76,
            mistakes: [],
            checklistDone: SAMPLE_CHECKLIST.filter(() => rnd() < 0.85),
            screenshots:
              n <= 4 || n % 13 === 0
                ? [SAMPLE_SCREENSHOTS[n % 2], SAMPLE_SCREENSHOTS[(n + 1) % 2]]
                : [],
            sample: true,
            created: stamp + n,
            updated: stamp + n,
          };
          if (!open) {
            const outcome = nextOutcome();
            const shock = rnd();
            let pips;
            if (outcome === 'flat') {
              pips = between(-0.12, 0.12) * slPips;
            } else if (outcome === 'win') {
              // Small wins, full targets, and occasional outsized runners.
              const multiple =
                shock < 0.12
                  ? between(3.5, 8)
                  : shock < 0.5
                    ? between(0.15, 0.85)
                    : between(0.9, 2.6);
              pips = slPips * multiple;
            } else {
              // Stops usually work, but rare gaps/slippage cause large losses.
              const multiple =
                shock < 0.1
                  ? between(3, 7)
                  : shock < 0.3
                    ? between(1.1, 2.3)
                    : shock < 0.48
                      ? between(0.1, 0.7)
                      : between(0.85, 1.1);
              pips = -slPips * multiple;
            }
            t.exit = +(entry + dir * pips * inst.pip).toFixed(inst.dp);
            t.pl = r2(((dir * (t.exit - entry)) / inst.pip) * inst.pv * lots);
            t.comm = r2(lots * between(3, 13));
            t.charges = rnd() < 0.45 ? r2(between(0.2, 5)) : 0;
            t.adjustment = rnd() < 0.12 ? r2(between(-3, 3)) : 0;
            t.xdt = localStr(startMs + Math.round(between(5, 900)) * 6e4);
            t.notes =
              outcome === 'flat'
                ? 'Choppy trade, closed close to breakeven.'
                : outcome === 'loss' && shock < 0.1
                  ? 'Unexpected volatility and slippage caused an unusually large loss.'
                  : outcome === 'win' && shock < 0.12
                    ? 'Unusually strong move; held a runner much longer than expected.'
                    : pick(outcome === 'win' ? SAMPLE_WIN_NOTES : SAMPLE_LOSS_NOTES);
          }
          return clean(t);
        };
        const trades = [];
        for (let ago = 120; ago >= 1; ago--) {
          const wd = new Date(t0 - ago * 864e5).getUTCDay();
          if (wd === 0 || wd === 6 || rnd() < 0.28) continue;
          for (let i = 1 + Math.floor(rnd() * 3); i > 0; i--)
            trades.push(make(pick(SAMPLE_ACCOUNTS), ago, false));
        }
        SAMPLE_ACCOUNTS.forEach((a, i) => trades.push(make(a, 1 + (i % 2), true)));
        // Distribute every review category through closed sample trades.
        const completed = trades.filter((t) => t.xdt);
        completed.forEach((t, i) => {
          if (i < SAMPLE_EMOTIONS.length) t.psychologyBefore = SAMPLE_EMOTIONS[i];
          t.planFollowed = i % 5 !== 0;
          t.psychologyAfter = '';
          t.mistakes = t.planFollowed ? [] : [SAMPLE_MISTAKES[i % SAMPLE_MISTAKES.length]];
          if (i < SAMPLE_CHECKLIST.length) t.checklistDone = SAMPLE_CHECKLIST.slice(0, i + 1);
        });
        // Only create sample accounts that don't exist yet, so clicks never duplicate accounts.
        const accounts = SAMPLE_ACCOUNTS.filter((a) => !have.has(a.id)).map(({ risk, ...a }) =>
          cleanAcc({ ...a, currency: '$', sample: true, created: stamp }),
        );
        return { accounts, trades: trades.filter(Boolean) };
      }
      function sampleCard() {
        const info = sampleInfo(),
          has = info.accounts + info.trades > 0;
        return `<details class="settings-disclosure"><summary>Example data</summary><div class="settings-detail">
        <p>${has ? `${info.accounts} example accounts and ${info.trades} example trades loaded.` : 'Try the journal with example trades.'} Removing examples keeps your own trades.</p>
        <div class="row"><button class="btn" data-act="sampleadd">Add examples</button>
        <button class="btn" data-act="sampledel" ${has ? '' : 'disabled'}>Remove examples</button></div>
    </div></details>`;
      }
      const tfilter = () => {
        const q = S.q.trim().toLowerCase();
        return calcAll(S.trades)
          .sort((a, b) => (a.t.dt < b.t.dt ? 1 : a.t.dt > b.t.dt ? -1 : b.t.created - a.t.created))
          .filter(
            (x) =>
              (S.res === 'all' || x.res === S.res) &&
              (S.tacc === 'all' || x.t.account === S.tacc) &&
              (!q || (x.t.pair + ' ' + x.t.setup + ' ' + x.t.notes).toLowerCase().includes(q)),
          );
      };
      // Trades list and account cards
      function tradesView() {
        const head = `<div class="page-h"><h1 class="trades-title">Trades </h1><div class="row"><button class="btn primary" data-act="add">Add Trade</button></div></div>`;
        if (!S.trades.length) return head + emptyState();
        return (
          head +
          `<div class="filters"><input id="q" type="search" placeholder="Search pair, setup or notes"
        value="${esc(S.q)}" aria-label="Search trades"><select id="tacc" aria-label="Filter by account">${accOpts(S.tacc)}</select>
        <select id="res" aria-label="Filter by result">${['all', 'Open', 'Win', 'Loss', 'Breakeven']
          .map(
            (r) =>
              `<option value="${r}" ${S.res === r ? 'selected' : ''}>${
                r === 'all' ? 'All results' : r
              }</option>`,
          )
          .join('')}</select></div><div id="tl">${tradeTable(tfilter(), S.trades.length)}</div>`
        );
      }
      function tradeTable(fl, total, count = true) {
        if (!fl.length)
          return `<div class="card empty"><h2>No Matching Trades</h2>
        <p>Try a different search, account or result filter.</p></div>`;
        return `${
          count
            ? (() => {
                const totals = new Map();
                for (const trade of fl) {
                  if (trade.net == null || !Number.isFinite(Number(trade.net))) continue;
                  const currency = ccy(trade.t);
                  totals.set(currency, (totals.get(currency) || 0) + Number(trade.net));
                }
                const summary = totals.size
                  ? [...totals]
                      .map(
                        ([currency, amount]) =>
                          `<span class="${cls(amount)}">${fm(r2(amount), 1, currency)}</span>`,
                      )
                      .join(' · ')
                  : 'N/A';
                return `<div class="count trade-count-summary"><span>Showing ${fl.length} of ${total} trade${total !== 1 ? 's' : ''}</span><span><strong>Shown Net P&L:</strong> ${summary}</span></div>`;
              })()
            : ''
        }
    <div class="card tw trade-list"><table class="trade-table" aria-label="Recorded trades"><thead><tr><th>Entry</th>
    <th>Pair</th><th>Side</th><th>Account</th><th>Duration</th>
    <th class="n">Pips</th><th class="n">Commission</th><th class="n">Net P&L</th><th>Result</th></tr></thead>
    <tbody>${fl
      .map(
        (x) => `<tr data-act="detail" data-id="${esc(x.t.id)}" tabindex="0">
        <td data-label="Entry">${fdt(x.t.dt)}</td><td data-label="Pair" class="trade-pair-with-logo"><b>${pairHTML(x.t.pair)}</b></td>
        <td data-label="Side"><span class="trade-side-badge ${x.t.side === 'Buy' ? 'long' : 'short'}">${x.t.side}</span></td><td data-label="Account">${esc(
          acc(x.t.account)?.name || '',
        )}</td><td data-label="Duration">${x.dur || '\u2014'}</td><td data-label="Pips" class="n ${cls(x.pips)}">${x.pips ?? '\u2014'}</td>
        <td data-label="Commission" class="n">${fm(Number(x.t.comm) || 0, 0, ccy(x.t))}</td>
        <td data-label="Net P&L" class="n ${cls(x.net)}">${
          x.net == null ? '\u2014' : fm(x.net, 1, ccy(x.t))
        }</td><td data-label="Result"><span class="badge ${x.res}">${x.res}</span></td></tr>`,
      )
      .join('')}</tbody></table></div>`;
      }
      function accCard(a) {
        const mine = S.trades.filter((t) => t.account === a.id),
          s = stats(mine),
          c = a.currency,
          net = flowNet(a),
          dash = 'N/A';
        const kv = [
          ['Current balance', fm(r2(a.balance + net + s.net), 0, c)],
          ['Starting balance', fm(a.balance, 0, c)],
          ['Net deposits / withdrawals', `<span class="${cls(net)}">${fm(net, 1, c)}</span>`],
          ['Net P&L', `<span class="${cls(s.net)}">${fm(s.net, 1, c)}</span>`],
          [
            'Return',
            a.balance > 0 && s.n
              ? `<span class="${cls(s.net)}">${((s.net / a.balance) * 100).toFixed(1)}%</span>`
              : dash,
          ],
          ['Win rate', s.n ? s.wr.toFixed(1) + '%' : dash],
          ['Trades', mine.length + (s.open ? ` (${s.open} open)` : '')],
          ['Profit factor', s.pf == null ? dash : s.pf === Infinity ? '\u221e' : s.pf.toFixed(2)],
          ['Average R:R', s.rr == null ? dash : '1:' + s.rr.toFixed(2)],
        ];
        const fl = [...(a.flows || [])].sort((x, y) =>
          x.date < y.date ? 1 : x.date > y.date ? -1 : 0,
        );
        const flows = fl.length
          ? `<div class="tw" style="margin-top:12px"><table style="min-width:520px"><thead><tr>
        <th>Date</th><th>Type</th><th class="n">Amount</th><th>Note</th><th></th></tr></thead><tbody>${fl
          .map(
            (f) => `<tr style="cursor:default"><td>${f.date}</td><td>${f.type}</td>
        <td class="n ${f.type === 'Deposit' ? 'pos' : 'neg'}">${fm(f.type === 'Deposit' ? f.amount : -f.amount, 1, c)}</td>
        <td>${esc(f.note) || '\u2014'}</td><td class="n"><button class="btn danger" data-act="flowdel"
        data-id="${esc(a.id)}" data-fid="${esc(f.id)}">Delete</button></td></tr>`,
          )
          .join('')}</tbody></table></div>`
          : `<div class="sub" style="margin-top:8px">No deposits or withdrawals recorded yet.</div>`;
        return `<div class="acc"><div class="acc-h"><div><b>${esc(a.name)}</b> <span class="badge">${a.type}</span>
    <div class="sub">${esc(a.broker) || 'No broker'} \u00b7 ${esc(c)}</div></div>
    <div class="row"><button class="btn" data-act="accview" data-id="${esc(a.id)}">Dashboard</button>
    <button class="btn" data-act="accedit" data-id="${esc(a.id)}">Edit</button>
    <button class="btn danger" data-act="accdel" data-id="${esc(a.id)}">Delete</button></div></div>
    <details class="settings-disclosure"><summary>Balance &amp; cash flow</summary><div class="settings-detail"><div class="kv4">${kv.map(([k, v]) => `<div class="lbl">${k}<b>${v}</b></div>`).join('')}</div>
    <div class="sec" style="margin-top:16px"><div class="page-h" style="margin:0;min-height:0">
    <span>Deposits and withdrawals</span><div class="row">
    <button class="btn" data-act="flowadd" data-id="${esc(a.id)}" data-t="Deposit">Deposit</button>
    <button class="btn" data-act="flowadd" data-id="${esc(a.id)}" data-t="Withdrawal">Withdraw</button>
    </div></div></div>${flows}</div></details></div>`;
      }
      // Settings page
      let settingsSection = 'appearance';
      function settingsView() {
        const dark = preferences.theme === 'dark';
        return `<div class="settings-shell settings-revamp">
          <header class="settings-hero"><div><div class="settings-title-row"><h1>Settings</h1></div><p>Manage your workspace, accounts and journal in one place.</p></div></header>
          <nav class="settings-new-nav" aria-label="Settings sections"><button type="button" class="settings-switch ${settingsSection === 'appearance' ? 'selected' : ''}" data-settings-section="appearance" aria-pressed="${settingsSection === 'appearance'}" aria-controls="settings-appearance">Appearance</button><button type="button" class="settings-switch ${settingsSection === 'profile' ? 'selected' : ''}" data-settings-section="profile" aria-pressed="${settingsSection === 'profile'}" aria-controls="settings-profile">Profile & Security</button><button type="button" class="settings-switch ${settingsSection === 'accounts' ? 'selected' : ''}" data-settings-section="accounts" aria-pressed="${settingsSection === 'accounts'}" aria-controls="settings-accounts">Trading Accounts</button><button type="button" class="settings-switch ${settingsSection === 'trading' ? 'selected' : ''}" data-settings-section="trading" aria-pressed="${settingsSection === 'trading'}" aria-controls="settings-trading">Trading Preferences</button><button type="button" class="settings-switch ${settingsSection === 'data' ? 'selected' : ''}" data-settings-section="data" aria-pressed="${settingsSection === 'data'}" aria-controls="settings-data">Data & Backups</button></nav>
          <div class="settings-layout"><div class="settings-content settings-page" data-current-section="${settingsSection}">
          <section class="card settings-panel" id="settings-appearance" style="display:${settingsSection === 'appearance' ? 'block' : 'none'} !important" data-settings-group="personal"><div class="settings-section-head"><div><h2>Appearance</h2><p>Choose your display mode and personal accent.</p></div></div>
            <div class="settings-field-title">Display Mode</div><div class="settings-theme-choices">
              <button class="settings-theme-option ${!dark ? 'active' : ''}" data-act="theme" ${!dark ? 'disabled' : ''} aria-pressed="${!dark}"><span class="settings-theme-preview light-preview"><i></i><i></i><i></i></span><span>☀ Light</span><small>White background</small></button>
              <button class="settings-theme-option ${dark ? 'active' : ''}" data-act="theme" ${dark ? 'disabled' : ''} aria-pressed="${dark}"><span class="settings-theme-preview dark-preview"><i></i><i></i><i></i></span><span>☾ Dark</span><small>Black background</small></button>
            </div>
            <div class="settings-field-title">Accent Colour <span class="settings-current-accent" style="--swatch:${preferences.accent}"><i></i>${esc(preferences.accent.toUpperCase())}</span></div>
            <p class="settings-field-hint">Updates buttons, charts and highlights. Your background stays ${dark ? 'black' : 'white'}.</p>
            <div class="custom-accent-control"><label for="custom-accent">Custom Accent Colour</label><input id="custom-accent" type="color" value="${esc(preferences.accent)}" aria-label="Pick a custom accent colour"><button class="btn primary" data-act="customaccent">Apply Colour</button><span class="custom-accent-value">${esc(preferences.accent.toUpperCase())}</span></div>
          </section>
<section class="card settings-panel" id="settings-profile" style="display:${settingsSection === 'profile' ? 'block' : 'none'} !important" data-settings-group="personal"><div class="settings-section-head"><div><h2>Profile &amp; Security</h2><p>Manage your identity and account access.</p></div></div>
            <label class="f settings-username" for="profile-username"><span>Username</span><div class="settings-inline"><input id="profile-username" autocomplete="username" maxlength="200" value="${esc(profileUsername)}" placeholder="Choose a username"><button class="btn primary" data-act="saveusername">Save username</button></div></label>
            <div class="settings-info-row"><span>Email address</span><strong>${esc(currentUser?.email || 'Not provided')}</strong></div>
            <div class="row settings-actions"><button class="btn" data-act="chpw">Change password</button><button class="btn" data-act="lock">Sign out</button></div>
          </section>
<section class="card settings-panel" id="settings-accounts" style="display:${settingsSection === 'accounts' ? 'block' : 'none'} !important" data-settings-group="trading"><div class="settings-section-head"><div><h2>Trading Accounts</h2><p>Manage the accounts linked to your journal.</p></div><button class="btn primary" data-act="accadd">+ Add account</button></div><div class="accs">${S.settings.accounts.map(accCard).join('')}</div></section>
<section class="card settings-panel" id="settings-trading" style="display:${settingsSection === 'trading' ? 'block' : 'none'} !important" data-settings-group="trading"><div class="settings-section-head"><div><h2>Trading Preferences</h2><p>Personalise your trading routine and dashboard.</p></div></div>
            <details class="settings-disclosure"><summary>Trading Checklist</summary><div class="settings-detail"><div class="lbl checklist-caption">Your pre-trade rules</div><div id="checklist-chips" class="checklist-chips">${(S.settings.checklist || []).map((rule) => `<span class="checklist-chip" data-rule="${esc(rule)}"><span>${esc(rule)}</span><button type="button" class="checklist-remove" data-act="removecheckrule" data-rule="${esc(rule)}" aria-label="Remove ${esc(rule)}" title="Remove rule">×</button></span>`).join('')}</div><div class="checklist-add"><input id="checklist-new-rule" type="text" maxlength="120" placeholder="Add a checklist rule" aria-label="New checklist rule"><button type="button" class="btn" data-act="addcheckrule">+ Add rule</button></div><button class="btn primary checklist-save" data-act="savechecklist">Save checklist</button></div></details>
            <details class="settings-disclosure"><summary>Dashboard Quote</summary><div class="settings-detail"><label class="f" for="custom-dashboard-quote"><span class="lbl">Your motivational quote</span><textarea id="custom-dashboard-quote" maxlength="240" placeholder="Write your own motivational quote">${esc(dashboardQuote())}</textarea></label><div class="row"><button class="btn primary" data-act="savequote">Save quote</button><button class="btn" data-act="resetquote">Reset to default</button></div></div></details>
          </section>
<section class="card settings-panel" id="settings-data" style="display:${settingsSection === 'data' ? 'block' : 'none'} !important" data-settings-group="data"><div class="settings-section-head"><div><h2>Data &amp; Backups</h2><p>Keep your journal synchronised and protected.</p></div></div>
            <div class="settings-info-row"><span id="cloud-status" role="status">${esc(syncMessage)}</span><button class="btn" data-act="reload">Reload journal</button></div>
            <div class="row settings-actions"><button class="btn" data-act="export">Export backup</button><button class="btn" data-act="import">Import file</button></div>
            ${sampleCard()}
            <details class="settings-disclosure settings-danger"><summary>Remove All Trades</summary><div class="settings-detail"><p>Permanently removes all trades, including their screenshots and review details, while keeping your trading accounts and settings.</p><button type="button" class="btn danger" data-act="removealltrades">Remove all trades</button></div></details>
            <details class="settings-disclosure settings-danger"><summary>Erase Journal</summary><div class="settings-detail"><p>Deletes your journal on every device. Your login stays active. Export a backup first.</p><button class="btn danger" data-act="erase">Erase journal</button></div></details>
          </section>
          </div></div></div>`;
      }
      // Trade review and risk calculator
      const EMOTIONS = [
        'Calm',
        'Confident',
        'Focused',
        'Fearful',
        'Anxious',
        'Frustrated',
        'Greedy',
        'Overconfident',
        'Excited',
        'Tired',
      ];
      const MISTAKES = [
        'FOMO',
        'Revenge Trading',
        'Overtrading',
        'Oversized Position',
        'Moved Stop Loss',
        'Entered Early',
        'Exited Early',
        'Ignored Trading Plan',
        'Chased Price',
        'No Stop Loss',
      ];
      function emotionOptions(current) {
        return (
          `<option value="">Not recorded</option>` +
          EMOTIONS.map((e) => `<option ${current === e ? 'selected' : ''}>${e}</option>`).join('')
        );
      }
      // Preserve uploaded screenshots byte-for-byte instead of downscaling or
      // converting them to low-quality JPEGs. Journal size is checked on save.
      function compressTradeImage(file) {
        return new Promise((resolve, reject) => {
          const allowed = /^(image\/(png|jpeg|webp))$/i.test(file.type);
          if (!allowed) return reject(new Error('Use PNG, JPEG or WebP'));
          // Base64 adds approximately 33% to the original file size. The
          // journal currently has a 20 MB limit, so reject files that cannot
          // fit even in an otherwise empty journal.
          if (file.size > 14 * 1024 * 1024)
            return reject(
              new Error(
                'Screenshot is too large for the 20 MB journal limit (maximum 14 MB per image).',
              ),
            );
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Unable to read screenshot'));
          reader.onload = () => {
            const data = reader.result;
            if (typeof data !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/i.test(data))
              return reject(new Error('Invalid screenshot data'));
            const img = new Image();
            img.onload = () => resolve(data);
            img.onerror = () => reject(new Error('Invalid or damaged image'));
            img.src = data;
          };
          reader.readAsDataURL(file);
        });
      }
      // Strategy and discipline review
      function strategyPanel() {
        const map = new Map();
        for (const t of S.trades) {
          const c = calc(t);
          if (c.net == null) continue;
          const k = t.setup || 'Uncategorised';
          const v = map.get(k) || { n: 0, w: 0, net: 0, gain: 0, loss: 0 };
          v.n++;
          v.w += c.net > 0 ? 1 : 0;
          v.net = r2(v.net + c.net);
          v.gain = r2(v.gain + Math.max(0, c.net));
          v.loss = r2(v.loss + Math.max(0, -c.net));
          map.set(k, v);
        }
        const rows = [...map]
          .sort((a, b) => b[1].n - a[1].n)
          .map(
            ([k, v]) =>
              `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${((100 * v.w) / v.n).toFixed(1)}%</td><td>${v.loss ? (v.gain / v.loss).toFixed(2) : v.gain ? '∞' : 'N/A'}</td><td class="${cls(v.net)}">${v.net.toFixed(2)}</td><td class="${cls(v.net)}">${r2(v.net / v.n).toFixed(2)}</td></tr>`,
          )
          .join('');
        const reviewed = S.trades.filter((t) => calc(t).net != null);
        const rated = reviewed.filter((t) => t.planFollowed === true || t.planFollowed === false);
        const followed = rated.filter((t) => t.planFollowed === true).length;
        const emotionCounts = new Map(),
          mistakeCounts = new Map();
        for (const t of reviewed) {
          const emotion = t.psychologyBefore || t.psychologyAfter;
          if (emotion) emotionCounts.set(emotion, (emotionCounts.get(emotion) || 0) + 1);
          for (const m of t.mistakes || []) mistakeCounts.set(m, (mistakeCounts.get(m) || 0) + 1);
        }
        const most = (m) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
        return `<div class="card review-analytics"><div class="review-section-heading"><h2>Strategy Performance</h2></div><p class="review-hint">Closed trades only. Net results may combine account currencies; compare within the same currency for accurate totals.</p><div class="tw"><table><thead><tr><th>Strategy</th><th>Trades</th><th>Win Rate</th><th>Profit Factor</th><th>Net P&L</th><th>Expectancy</th></tr></thead><tbody>${rows}</tbody></table></div><div class="review-section-heading" style="margin-top:22px"><h2>Trade Discipline</h2></div><p class="review-hint">A quick view of your emotions and how consistently you follow your plan.</p><div class="discipline-stats"><div><span>Plan Followed</span><strong>${rated.length ? Math.round((followed / rated.length) * 100) + '%' : 'N/A'}</strong><small>${rated.length} reviewed trades</small></div><div><span>Most Common Emotion</span><strong>${esc(most(emotionCounts))}</strong></div><div><span>Most Common Mistake</span><strong>${esc(most(mistakeCounts))}</strong></div></div></div>`;
      }
      function reviewView() {
        return `<div class="page-h"><div><div class="review-page-heading"><h1>Trade Review</h1></div><p class="subl">Review your strategies and trading discipline.</p></div><button class="btn primary" data-act="riskcalc">Risk Calculator</button></div>
 ${strategyPanel() || '<div class="card review-analytics"><div class="review-section-heading"><h2>Strategy Performance</h2></div><p class="review-hint">Add and close trades with a strategy to see your review here.</p></div>'}`;
      }
      // Risk calculator
      function riskCalculator() {
        openDlg(
          `<div class="dh"><h2>Risk Calculator</h2></div><div class="db"><div class="grid2"><label class="f"><span>Account Balance</span><input id="rc-balance" type="number" min="0" step="any" value="1000"></label><label class="f"><span>Risk (%)</span><input id="rc-percent" type="number" min="0" step="any" value="1"></label><label class="f"><span>Stop-Loss Distance (Pips)</span><input id="rc-pips" type="number" min="0" step="any" value="20"></label><label class="f"><span>Pip Value per Standard Lot (Account Currency)</span><input id="rc-value" type="number" min="0" step="any" value="10"></label></div><div class="calc" style="margin-top:20px"><div class="lbl">Amount at Risk<b id="rc-amount">N/A</b></div><div class="lbl">Suggested Lot Size<b id="rc-lots">N/A</b></div></div><p class="review-hint" style="margin-top:12px">Enter your broker's actual pip value. This estimate excludes commissions, slippage and conversion costs.</p></div><div class="df"><button class="btn" data-act="close">Close</button></div>`,
        );
        const update = () => {
          const g = (id) => Number($('#rc-' + id).value);
          const risk = (g('balance') * g('percent')) / 100;
          const denom = g('pips') * g('value');
          $('#rc-amount').textContent =
            Number.isFinite(risk) && risk >= 0 && g('balance') >= 0 && g('percent') >= 0
              ? risk.toFixed(2)
              : 'N/A';
          $('#rc-lots').textContent =
            denom > 0 &&
            risk >= 0 &&
            g('balance') >= 0 &&
            g('percent') >= 0 &&
            g('pips') > 0 &&
            g('value') > 0
              ? (risk / denom).toFixed(3)
              : 'N/A';
        };
        dlg.querySelectorAll('input').forEach((i) => i.addEventListener('input', update));
        update();
      }
      // Trade form
      const F = (n, l, inp, hint) =>
        `<label class="f" data-f="${n}"><span>${l}</span>${inp}<small class="err"></small>${
          hint ? `<small class="hint">${hint}</small>` : ''
        }</label>`;
      const nin = (n, v, ph = '') =>
        `<input name="${n}" type="number" step="any" inputmode="decimal" value="${v ?? ''}" placeholder="${ph}">`;
      const showErrs = (root, e) =>
        root.querySelectorAll('[data-f]').forEach((l) => {
          l.classList.toggle('bad', !!e[l.dataset.f]);
          $('.err', l).textContent = e[l.dataset.f] || '';
        });
      function tradeForm(t, focus) {
        const e = !!t,
          n = nowLocal(),
          v = t || {
            dt: n,
            side: 'Buy',
            session: '',
            risk: '',
            comm: '',
            charges: '',
            account:
              S.acc !== 'all' ? S.acc : acc(S.lastAcc) ? S.lastAcc : S.settings.accounts[0].id,
          };
        const [ed, et] = v.dt.split('T'),
          [xd, xt] = (v.xdt || 'T').split('T'),
          today = n.slice(0, 10);
        const pairs = [
            ...new Set([
              'EURUSD',
              'GBPUSD',
              'USDJPY',
              'AUDUSD',
              'USDCAD',
              'USDCHF',
              'NZDUSD',
              'XAUUSD',
              'GBPJPY',
              'EURJPY',
              ...S.trades.map((x) => x.pair),
            ]),
          ],
          setups = [...new Set(S.trades.map((x) => x.setup).filter(Boolean))];
        openDlg(`<div class="dh trade-editor-head"><div><h2>${e ? 'Edit Trade' : 'Add Trade'}</h2><p class="trade-editor-sub">${e ? 'Update your position, results and review.' : 'Record a position and add a review when ready.'}</p></div></div>
    <form id="tf" novalidate style="display:contents"><div class="db trade-editor-body">
    <div class="grid2 trade-editor-grid">
    <div class="full trade-editor-section"><strong>Position</strong><span>Instrument, direction and size</span></div>
    ${F(
      'account',
      'Account',
      `<select name="account">${S.settings.accounts
        .map(
          (a) => `<option
        value="${esc(a.id)}" ${
          a.id === v.account ? 'selected' : ''
        }>${esc(a.name)} (${a.type})</option>`,
        )
        .join('')}</select>`,
    )}
    ${F(
      'pair',
      'Pair / instrument',
      `<input name="pair" list="pl" value="${esc(
        v.pair || '',
      )}" placeholder="EURUSD" autocapitalize="characters" maxlength="20">
        <datalist id="pl">${pairs.map((p) => `<option value="${esc(p)}">`).join('')}</datalist><div class="pair-form-preview" id="pair-preview">${v.pair ? pairHTML(v.pair) : ''}</div>`,
    )}
    ${F(
      'side',
      'Direction',
      `<select name="side">${SIDES.map(
        (s) => `<option ${v.side === s ? 'selected' : ''}>${s}</option>`,
      ).join('')}</select>`,
    )}
    ${F('lots', 'Lot size', nin('lots', v.lots, '0.10'))}
    <div class="full trade-editor-section"><strong>Entry</strong><span>When and where you opened the trade</span></div>
    ${F('ed', 'Entry date', `<input name="ed" type="date" value="${ed}" max="${today}">`)}${F(
      'et',
      'Entry time',
      `<input name="et" type="time" value="${et}">`,
    )}
    ${F('entry', 'Entry price', nin('entry', v.entry))}${F(
      'sl',
      'Stop loss',
      nin('sl', v.sl),
      'Optional',
    )}
    ${F('tp', 'Take profit', nin('tp', v.tp), 'Optional')}${F(
      'risk',
      'Risk <span class="ccy"></span>',
      nin('risk', v.risk, '0.00'),
      'Amount risked. Used for realized R.',
    )}
    ${F(
      'session',
      'Trading session',
      `<select name="session">
        <option value="">Select session</option>${SESS.map(
          (s) => `<option ${v.session === s ? 'selected' : ''}>${s}</option>`,
        ).join('')}</select>`,
    )}
    ${F(
      'tf',
      'Timeframe',
      `<input name="tf" value="${esc(v.tf || '')}" maxlength="20" placeholder="H1">`,
    )}
    <div class="full">${F(
      'setup',
      'Setup / strategy',
      `<input name="setup" list="sl" value="${esc(
        v.setup || '',
      )}" maxlength="100" placeholder="Breakout, trend pullback\u2026">
        <datalist id="sl">${setups.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`,
    )}</div>
    <div class="full trade-editor-section"><strong>Exit &amp; results</strong><span>Leave exit fields blank for an open trade. Complete the exit date, time, price and P&amp;L to close it.</span></div>
    ${F('xd', 'Exit date', `<input name="xd" type="date" value="${xd || ''}" max="${today}">`)}${F(
      'xt',
      'Exit time',
      `<input name="xt" type="time" value="${xt || ''}">`,
    )}
    ${F('exit', 'Exit price', nin('exit', v.exit))}${F(
      'pl',
      'Gross profit / loss <span class="ccy"></span>',
      nin('pl', v.pl, '0.00'),
      'Before commission. Negative for a loss.',
    )}
    ${F(
      'comm',
      'Commission <span class="ccy"></span>',
      nin('comm', v.comm, '0.00'),
      'Enter as a positive cost',
    )}${F(
      'charges',
      'Additional charges <span class="ccy"></span>',
      nin('charges', v.charges, '0.00'),
      'Swap, financing, and other broker fees. Imported automatically when available; edit to override.',
    )}${F(
      'pipSize',
      'Pip size',
      nin('pipSize', e ? v.pipSize : '', 'Auto'),
      'Blank for auto (JPY 0.01, XAU 0.1, others 0.0001)',
    )}
    <div class="full trade-editor-section"><strong>Journal notes</strong><span>Capture your reasoning and lessons</span></div>
    <div class="full">${F(
      'notes',
      'Notes',
      `<textarea name="notes" maxlength="5000" placeholder="Why you took the trade, how you managed it, what you learned">${esc(
        v.notes || '',
      )}</textarea>`,
    )}</div>
    <details class="full trade-review-details" ${e && (v.psychologyBefore || v.psychologyAfter || (v.mistakes || []).length || (v.checklistDone || []).length || (v.screenshots || []).length) ? 'open' : ''}>
    <summary>Trade Review <span class="sub">Optional · discipline, checklist and screenshots</span></summary>
    <div class="grid2 trade-review-fields">
    <div class="full discipline-fields"><h3>Trade Discipline</h3><p class="review-hint">Two quick questions about this trade.</p>
    ${F('psychologyBefore', 'How did you feel during this trade?', `<select name="psychologyBefore">${emotionOptions(v.psychologyBefore || v.psychologyAfter)}</select>`)}
    <div class="f"><span>Did you follow your trading plan?</span><div class="discipline-choice"><label><input type="radio" name="planFollowed" value="yes" ${v.planFollowed === true ? 'checked' : ''}> Yes</label><label><input type="radio" name="planFollowed" value="no" ${v.planFollowed === false ? 'checked' : ''}> No</label></div></div>
    <div id="discipline-mistake" ${v.planFollowed === false ? '' : 'hidden'}>${F('mistakes', 'What went wrong?', `<select name="mistakes"><option value="">Select a mistake</option>${MISTAKES.map((m) => `<option value="${esc(m)}" ${(v.mistakes || []).includes(m) ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`)}</div>
    </div>
    <div class="full"><span class="review-label">Pre-Trade Checklist</span><div class="review-options">${(S.settings.checklist || []).map((m) => `<label><input type="checkbox" name="checklistDone" value="${esc(m)}" ${(v.checklistDone || []).includes(m) ? 'checked' : ''}> ${esc(m)}</label>`).join('')}</div></div>
    <div class="full"><span class="review-label">Trade Screenshots</span><p class="review-hint">Add multiple screenshots at their original resolution. New images are appended to existing ones. Use the × on each screenshot to remove it individually. Your journal currently has a 20 MB total storage limit.</p><input type="file" id="trade-images" accept="image/png,image/jpeg,image/webp" multiple><div id="trade-image-preview" class="review-images trade-image-gallery"></div></div>
    </div></details>
    <div class="full calc">${[
      ['dur', 'Duration'],
      ['pips', 'Pips'],
      ['rr', 'Planned R:R'],
      ['net', 'Net P&L'],
      ['R', 'Realized R'],
      ['res', 'Result'],
    ]
      .map(([i, l]) => `<div class="lbl">${l}<b id="c-${i}">N/A</b></div>`)
      .join('')}</div>
    </div></div><div class="df"><button type="button" class="btn" data-act="close">Cancel</button>
    <button class="btn primary" id="sv">${e ? 'Save changes' : 'Add Trade'}</button></div></form>`);
        const form = $('#tf'),
          imageInput = $('#trade-images'),
          imagePreview = $('#trade-image-preview');
        let tradeImages = [...(v.screenshots || [])];
        let imagesBusy = false;
        const previewImages = () => {
          imagePreview.innerHTML = tradeImages
            .map((src, i) => ({ src, i }))
            .filter(
              ({ src }) =>
                typeof src === 'string' &&
                /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(src),
            )
            .map(
              ({ src, i }) =>
                `<div class="trade-image-item"><div class="trade-image-frame"><a href="${src}" target="_blank" rel="noopener" title="Open full-size screenshot"><img src="${src}" alt="Trade screenshot ${i + 1}" loading="lazy"></a><button type="button" class="trade-image-remove" data-image-index="${i}" aria-label="Remove screenshot ${i + 1}" title="Remove this screenshot"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div><span class="trade-image-caption">Screenshot ${i + 1}</span></div>`,
            )
            .join('');
        };
        imagePreview.addEventListener('click', async (ev) => {
          const remove = ev.target.closest('[data-image-index]');
          if (!remove || imagesBusy) return;
          const index = Number(remove.dataset.imageIndex);
          if (!Number.isInteger(index) || index < 0 || index >= tradeImages.length) return;
          imagesBusy = true;
          try {
            const ok = await confirmDel(
              'Remove this screenshot?',
              `Screenshot ${index + 1} will be removed from this trade when you save your changes.`,
              'Remove screenshot',
            );
            if (ok) {
              tradeImages.splice(index, 1);
              previewImages();
            }
          } finally {
            imagesBusy = false;
          }
        });
        previewImages();
        form.querySelectorAll('input[name="planFollowed"]').forEach((r) =>
          r.addEventListener('change', () => {
            const mistake = form.querySelector('#discipline-mistake');
            mistake.hidden =
              form.querySelector('input[name="planFollowed"]:checked')?.value !== 'no';
            if (mistake.hidden) mistake.querySelector('select').value = '';
          }),
        );
        imageInput.onchange = async () => {
          if (!imageInput.files.length || imagesBusy) return;
          imagesBusy = true;
          try {
            const selected = [...imageInput.files];
            if (tradeImages.length + selected.length > 100)
              throw new Error('A trade can have up to 100 screenshots.');
            const imported = await Promise.all(selected.map(compressTradeImage));
            const nextImages = [...tradeImages, ...imported];
            const otherTrades = S.trades.filter((x) => x.id !== t?.id);
            const proposed = {
              trades: [...otherTrades, { ...v, screenshots: nextImages }],
              settings: S.settings,
              preferences,
            };
            if (new Blob([JSON.stringify(proposed)]).size > 20 * 1024 * 1024)
              throw new Error(
                'These screenshots exceed the 20 MB journal storage limit. Remove some images or use smaller files.',
              );
            tradeImages = nextImages;
            previewImages();
          } catch (err) {
            toast('Could not add screenshots: ' + err.message, 'error');
          } finally {
            imagesBusy = false;
            imageInput.value = '';
          }
        };
        const fld = (n) => form.elements[n],
          manual = new Set();
        const autoVals = () => {
          const g = (n) => fld(n).value.trim(),
            a = acc(g('account')),
            pair = g('pair').toUpperCase(),
            d = g('side') === 'Buy' ? 1 : -1,
            entry = Number(g('entry')),
            lots = Number(g('lots')),
            exit = Number(g('exit')),
            sl = Number(g('sl')),
            ps = Number(g('pipSize')) > 0 ? Number(g('pipSize')) : defPip(pair),
            out = { pl: null, risk: null };
          if (!a || !/^(\$|USD)$/i.test(a.currency) || !(entry > 0) || !(lots > 0)) return out;
          if (exit > 0) {
            const v = usdPerPip(pair, exit, lots, ps);
            if (v != null) out.pl = r2(((d * (exit - entry)) / ps) * v);
          }
          if (sl > 0 && d * (entry - sl) > 0) {
            const v = usdPerPip(pair, entry, lots, ps);
            if (v != null) out.risk = r2((Math.abs(entry - sl) / ps) * v);
          }
          return out;
        };
        const applyAuto = () => {
          const a = autoVals();
          ['pl', 'risk'].forEach((n) => {
            if (!manual.has(n)) fld(n).value = a[n] == null ? '' : a[n];
          });
        };
        const autoSession = () => {
          const ed = fld('ed').value,
            et = fld('et').value;
          if (ed && et) fld('session').value = detectSession(ed + 'T' + et);
        };
        // On edit, keep stored P&L / risk if they differ from the auto value (e.g. broker figures).
        if (e) {
          const a = autoVals();
          ['pl', 'risk'].forEach((n) => {
            const s = t[n];
            const has = s != null && s !== '' && !(n === 'risk' && s === 0);
            if (has && !(a[n] != null && Math.abs(s - a[n]) <= 0.01)) manual.add(n);
          });
        } else autoSession();
        fld('session')
          .closest('label')
          .insertAdjacentHTML(
            'beforeend',
            '<small class="hint">Auto-detected from entry date and time (your local time zone).</small>',
          );
        $('.hint', fld('pl').closest('label')).textContent =
          'Auto-calculated for USD accounts (USD pairs and gold). Type a value to override, clear to resume auto.';
        $('.hint', fld('risk').closest('label')).textContent =
          'Auto-calculated from entry and stop loss for USD accounts. Type a value to override.';
        const upd = () => {
          const f = new FormData(form),
            a = acc(f.get('account')),
            { trade } = validate(f, 'x'),
            set = (i, x, c = '') => {
              const el = $('#c-' + i);
              el.textContent = x;
              el.className = c;
            };
          dlg
            .querySelectorAll('.ccy')
            .forEach((x) => (x.textContent = a ? '(' + a.currency + ')' : ''));
          if (!trade) {
            ['dur', 'pips', 'rr', 'net', 'R', 'res'].forEach((i) => set(i, '\u2014'));
            return;
          }
          trade.adjustment = t?.adjustment || 0;
          const c = calc(trade);
          set('dur', c.dur || '\u2014');
          set('pips', c.pips ?? '\u2014', cls(c.pips));
          set('rr', c.rr == null ? '\u2014' : '1:' + c.rr);
          set('net', c.net == null ? '\u2014' : fm(c.net, 1, a.currency), cls(c.net));
          set('R', c.R == null ? '\u2014' : c.R + 'R');
          set('res', c.res, cls(c.net));
        };
        form.oninput = (ev) => {
          const n = ev.target.name;
          if (n === 'ed' || n === 'et') autoSession();
          if (n === 'pl' || n === 'risk') {
            if (ev.target.value.trim() === '') manual.delete(n);
            else manual.add(n);
          }
          applyAuto();
          upd();
        };
        applyAuto();
        upd();
        if (focus) $(`[name="${focus}"]`, form)?.focus();
        form.onsubmit = async (ev) => {
          ev.preventDefault();
          const f = new FormData(form),
            { errs, trade } = validate(f, t?.id);
          showErrs(form, errs);
          if (Object.keys(errs).length) {
            form.querySelector('.bad input,.bad select')?.focus();
            return;
          }
          if (imagesBusy) {
            toast('Wait for screenshots to finish processing', 'error');
            return;
          }
          trade.adjustment = t?.adjustment || 0; // Preserve broker adjustment on edit
          trade.psychologyBefore = String(f.get('psychologyBefore') || '');
          trade.psychologyAfter = '';
          trade.planFollowed =
            f.get('planFollowed') === 'yes' ? true : f.get('planFollowed') === 'no' ? false : null;
          trade.mistakes =
            trade.planFollowed === false && f.get('mistakes') ? [String(f.get('mistakes'))] : [];
          trade.checklistDone = f.getAll('checklistDone');
          trade.screenshots = tradeImages;
          const list = e
            ? S.trades.map((x) => (x.id === t.id ? { ...trade, id: t.id, created: t.created } : x))
            : [...S.trades, trade];
          if (await commit(list)) {
            S.lastAcc = trade.account;
            closeDlg();
            toast(e ? 'Trade saved' : 'Trade added');
            render();
          }
        };
      }
      // Trade form validation
      function validate(f, id) {
        const e = {},
          g = (n) => String(f.get(n) || '').trim(),
          now = nowLocal();
        const req = (n) => {
          const v = g(n);
          if (v === '') {
            e[n] = 'Required';
            return null;
          }
          const x = Number(v);
          if (!Number.isFinite(x)) {
            e[n] = 'Enter a valid number';
            return null;
          }
          return x;
        };
        const opt = (n) => {
          const v = g(n);
          if (v === '') return null;
          const x = Number(v);
          if (!Number.isFinite(x)) {
            e[n] = 'Enter a valid number';
            return null;
          }
          return x;
        };
        const ed = g('ed'),
          et = g('et'),
          xd = g('xd'),
          xt = g('xt'),
          pair = g('pair').toUpperCase(),
          side = g('side'),
          session = g('session'),
          dt = ed && et ? ed + 'T' + et : '';
        let xdt = '';
        if (!acc(g('account'))) e.account = 'Select an account';
        if (!ed) e.ed = 'Required';
        if (!et) e.et = 'Required';
        if (dt && dt > now) e.ed = 'Entry cannot be in the future';
        if (xd || xt) {
          if (!xd) e.xd = 'Add the exit date';
          if (!xt) e.xt = 'Add the exit time';
          if (xd && xt) {
            xdt = xd + 'T' + xt;
            if (xdt > now) e.xd = 'Exit cannot be in the future';
            else if (dt && xdt < dt) e.xd = 'Exit cannot be before entry';
          }
        }
        if (!pair) e.pair = 'Required';
        if (!session) e.session = 'Select a session';
        const entry = req('entry'),
          lots = req('lots'),
          exit = opt('exit'),
          pl = opt('pl'),
          sl = opt('sl'),
          tp = opt('tp'),
          risk = opt('risk'),
          comm = opt('comm'),
          charges = opt('charges'),
          ps = opt('pipSize');
        for (const [n, x] of [
          ['entry', entry],
          ['exit', exit],
          ['lots', lots],
          ['sl', sl],
          ['tp', tp],
          ['pipSize', ps],
        ])
          if (x != null && x <= 0 && !e[n]) e[n] = 'Must be greater than 0';
        for (const [n, x] of [
          ['risk', risk],
          ['comm', comm],
          ['charges', charges],
        ])
          if (x != null && x < 0) e[n] = 'Cannot be negative';
        if (xd || xt || exit != null || pl != null) {
          if (!xd && !e.xd) e.xd = 'Add the exit date';
          if (!xt && !e.xt) e.xt = 'Add the exit time';
          if (exit == null && !e.exit) e.exit = 'Add the exit price';
          if (pl == null && !e.pl) e.pl = 'Add the profit / loss';
        }
        if (entry > 0) {
          const d = side === 'Buy' ? 1 : -1;
          if (sl > 0 && !e.sl && d * (entry - sl) <= 0)
            e.sl =
              side === 'Buy' ? 'Must be below entry for a buy' : 'Must be above entry for a sell';
          if (tp > 0 && !e.tp && d * (tp - entry) <= 0)
            e.tp =
              side === 'Buy' ? 'Must be above entry for a buy' : 'Must be below entry for a sell';
        }
        if (Object.keys(e).length) return { errs: e, trade: null };
        const t = Date.now(),
          trade = clean({
            id: id || uid(),
            account: g('account'),
            dt,
            xdt,
            pair,
            side,
            entry,
            sl,
            tp,
            exit,
            lots,
            risk: risk ?? 0,
            pl,
            comm: comm ?? 0,
            charges: charges ?? 0,
            pipSize: ps,
            session,
            setup: g('setup'),
            tf: g('tf'),
            notes: f.get('notes') || '',
            created: t,
            updated: t,
          });
        return { errs: trade ? {} : { pair: 'Trade data is invalid' }, trade };
      }
      // Account form
      function accForm(a) {
        const e = !!a,
          v = a || { type: 'Demo', currency: '$', balance: '' };
        openDlg(`<div class="dh"><h2>${e ? 'Edit Account' : 'Add Account'}</h2></div>
    <form id="af" novalidate style="display:contents"><div class="db">
    <div class="grid2">
    ${F(
      'name',
      'Account name',
      `<input name="name" maxlength="40" value="${esc(v.name || '')}" placeholder="Main account">`,
    )}${F(
      'type',
      'Account type',
      `<select name="type">${ACCT.map(
        (x) => `<option ${v.type === x ? 'selected' : ''}>${x}</option>`,
      ).join('')}</select>`,
    )}
    ${F('balance', 'Starting balance', nin('balance', v.balance, '0.00'))}${F(
      'currency',
      'Currency',
      `<input name="currency" maxlength="3" value="${esc(v.currency)}"
        placeholder="USD">`,
      'Symbol or code, up to 3 characters',
    )}
    <div class="full">${F(
      'broker',
      'Broker (optional)',
      `<input name="broker" maxlength="40" value="${esc(v.broker || '')}">`,
    )}</div></div></div>
    <div class="df"><button type="button" class="btn" data-act="close">Cancel</button>
    <button class="btn primary">${e ? 'Save changes' : 'Add Account'}</button></div></form>`);
        $('#af').onsubmit = async (ev) => {
          ev.preventDefault();
          const f = new FormData(ev.target),
            g = (n) => String(f.get(n)).trim(),
            er = {},
            b = g('balance'),
            n = Number(b);
          if (!g('name')) er.name = 'Required';
          else if (
            S.settings.accounts.some(
              (x) => x.id !== a?.id && x.name.toLowerCase() === g('name').toLowerCase(),
            )
          )
            er.name = 'An account with this name exists';
          if (b === '') er.balance = 'Required';
          else if (!Number.isFinite(n) || n < 0) er.balance = 'Enter 0 or a positive number';
          if (!g('currency')) er.currency = 'Required';
          showErrs(ev.target, er);
          if (Object.keys(er).length) return;
          const o = {
            id: a?.id || uid(),
            name: g('name'),
            type: g('type'),
            balance: n,
            currency: g('currency'),
            broker: g('broker'),
            created: a?.created || Date.now(),
            flows: a?.flows || [],
          };
          const st = {
            ...S.settings,
            accounts: e
              ? S.settings.accounts.map((x) => (x.id === a.id ? o : x))
              : [...S.settings.accounts, o],
          };
          if (await commit(S.trades, st)) {
            closeDlg();
            toast(e ? 'Account saved' : 'Account added');
            render();
          }
        };
      }
      // Trade detail dialog
      function detail(id) {
        const t = S.trades.find((x) => x.id === id);
        if (!t) return;
        const c = calc(t),
          a = acc(t.account),
          k = a?.currency || '',
          dash = 'N/A';
        const kv = [
          ['Account', esc(a?.name || 'Unknown')],
          ['Pair', pairHTML(t.pair)],
          ['Direction', t.side],
          ['Entry date and time', fdt(t.dt)],
          ['Exit date and time', fdt(t.xdt)],
          ['Duration', c.dur || dash],
          ['Lot size', t.lots],
          ['Entry price', t.entry],
          ['Exit price', t.exit ?? dash],
          ['Stop loss', t.sl ?? dash],
          ['Take profit', t.tp ?? dash],
          ['Pip size', t.pipSize],
          ['Pips', c.pips == null ? dash : `<span class="${cls(c.pips)}">${c.pips}</span>`],
          ['Planned R:R', c.rr == null ? dash : '1:' + c.rr],
          ['Realized R', c.R == null ? dash : c.R + 'R'],
          ['Risk', t.risk ? fm(t.risk, 0, k) : 'Not set'],
          [
            'Profit / loss',
            t.pl == null ? dash : `<span class="${cls(t.pl)}">${fm(t.pl, 1, k)}</span>`,
          ],
          ['Commission', fm(t.comm, 0, k)],
          ['Additional charges', fm(t.charges || 0, 0, k)],
          ['Broker P&L adjustment', fm(t.adjustment || 0, 1, k)],
          [
            'Net P&L',
            c.net == null ? dash : `<span class="${cls(c.net)}">${fm(c.net, 1, k)}</span>`,
          ],
          ['Result', `<span class="badge ${c.res}">${c.res}</span>`],
          ['Session', esc(t.session)],
          ['Timeframe', esc(t.tf) || dash],
          ['Setup / strategy', esc(t.setup) || 'None'],
          ['Broker', esc(a?.broker) || dash],
          ['Trade Emotion', esc(t.psychologyBefore || t.psychologyAfter) || 'None'],
          [
            'Followed Plan',
            t.planFollowed === true ? 'Yes' : t.planFollowed === false ? 'No' : dash,
          ],
          [
            'Mistake',
            t.planFollowed === false ? (t.mistakes || []).map(esc).join(', ') || 'None' : 'None',
          ],
          [
            'Checklist',
            `${(t.checklistDone || []).length}/${(S.settings.checklist || []).length} completed`,
          ],
        ];
        openDlg(
          `<div class="dh"><h2>${pairHTML(t.pair)} \u00b7 ${t.side}</h2></div>
        <div class="db"><div class="kv">${kv.map(([k, v]) => `<div class="lbl">${k}<b style="color:var(--tx)">${v}</b></div>`).join('')}</div>
        ${(t.screenshots || []).length ? `<div class="review-label" style="margin-top:20px">Trade Screenshots</div><div class="review-images">${t.screenshots.map((src, i) => `<a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="Screenshot ${i + 1}"></a>`).join('')}</div>` : ''}
        <div class="lbl" style="margin:24px 0 4px">Notes</div>${
          t.notes
            ? `<div class="notes">${esc(t.notes)}</div>`
            : '<div class="mp">No notes added.</div>'
        }</div>
        <div class="df"><button class="btn danger l" data-act="del" data-id="${esc(id)}">Delete</button>
        <button class="btn" data-act="close">Close</button>
        <button class="btn ${c.c ? 'primary' : ''}" data-act="edit" data-id="${esc(id)}">Edit</button>${
          c.c
            ? ''
            : `<button class="btn primary" data-act="exit" data-id="${esc(id)}">Add exit details</button>`
        }</div>`,
        );
      }
      // Backup and restore
      function exportData() {
        const d = {
          app: 'Pipfolio',
          version: 2,
          exportedAt: new Date().toISOString(),
          theme: document.documentElement.dataset.theme,
          preferences: { ...preferences },
          settings: S.settings,
          trades: S.trades,
        };
        const a = document.createElement('a'),
          u = URL.createObjectURL(
            new Blob([JSON.stringify(d, null, 2)], {
              type: 'application/json',
            }),
          );
        a.href = u;
        a.download = `pipfolio-backup-${nowLocal().slice(0, 10)}.json`;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
        toast('Backup exported');
      }
      async function importFile(file) {
        if (!file) return;
        const fail = (m) => toast(m, 'error');
        if (file.size > 20 * 1024 * 1024) return fail('Import failed: file is larger than 20 MB.');
        let d;
        try {
          const txt = await file.text();
          if (!txt.trim()) return fail('Import failed: the file is empty.');
          d = JSON.parse(txt);
        } catch {
          return fail('Import failed: the file is not valid JSON.');
        }
        if (!d || d.app !== 'Pipfolio' || !Array.isArray(d.trades))
          return fail('Import failed: this is not a Pipfolio backup file.');
        const ok = d.trades.map(clean).filter(Boolean),
          skipped = d.trades.length - ok.length,
          dup = new Map();
        ok.forEach((t) => {
          const o = dup.get(t.id);
          if (!o || t.updated >= o.updated) dup.set(t.id, t);
        });
        if (d.trades.length && !dup.size)
          return fail('Import failed: no valid trades were found in this file.');
        const st = cleanSettings(d.settings),
          trades = norm([...dup.values()], st);
        const note = `${trades.length} trade${
          trades.length === 1 ? '' : 's'
        } and ${st.accounts.length} account${st.accounts.length === 1 ? '' : 's'} found${
          skipped ? `, ${skipped} invalid trade${skipped > 1 ? 's' : ''} skipped` : ''
        }.`;
        const ch = await ask(
          'Import backup',
          `${note}<br><br><b>Merge</b> adds new accounts and trades and keeps your current
        data. <b>Replace</b> overwrites all accounts, trades and settings with the backup.`,
          [
            { label: 'Cancel', val: null },
            { label: 'Merge', val: 'm' },
            { label: 'Replace', cls: 'primary', val: 'r' },
          ],
        );
        if (!ch) return;
        if (ch === 'm') {
          const am = new Map(S.settings.accounts.map((a) => [a.id, a]));
          st.accounts.forEach((a) => am.has(a.id) || am.set(a.id, a));
          const ns = { ...S.settings, accounts: [...am.values()] },
            m = new Map(S.trades.map((t) => [t.id, t]));
          let add = 0,
            upd = 0;
          trades.forEach((t) => {
            const o = m.get(t.id);
            if (!o) {
              m.set(t.id, t);
              add++;
            } else if (t.updated > o.updated) {
              m.set(t.id, t);
              upd++;
            }
          });
          if (await commit(norm([...m.values()], ns), ns)) {
            toast(`Merged: ${add} added, ${upd} updated`);
            render();
          }
          return;
        }
        if (
          !(await confirmDel(
            'Replace all data?',
            'This overwrites every account, trade and setting in this ' +
              'profile. Export a backup first if you might need the current ' +
              'data.',
            'Replace data',
          ))
        )
          return;
        const restoredPreferences = cleanPreferences(
          d.preferences || { ...preferences, theme: d.theme || preferences.theme },
        );
        if (!(await commit(trades, st, restoredPreferences))) return;
        S.acc = S.tacc = 'all';
        toast('Backup restored to your account.');
        render();
      }
      // Broker CSV import
      function parseCsv(txt) {
        const rows = [];
        let row = [],
          cur = '',
          q = false;
        txt = txt.replace(/^\uFEFF/, '');
        const firstLine = txt.split(/\r?\n/, 1)[0];
        const delimiter = ['\t', ';', ','].sort(
          (a, b) => firstLine.split(b).length - firstLine.split(a).length,
        )[0];
        for (let i = 0; i < txt.length; i++) {
          const c = txt[i];
          if (q) {
            if (c === '"') {
              if (txt[i + 1] === '"') {
                cur += '"';
                i++;
              } else q = false;
            } else cur += c;
          } else if (c === '"') q = true;
          else if (c === delimiter) {
            row.push(cur);
            cur = '';
          } else if (c === '\n' || c === '\r') {
            if (c === '\r' && txt[i + 1] === '\n') i++;
            row.push(cur);
            cur = '';
            rows.push(row);
            row = [];
          } else cur += c;
        }
        if (cur !== '' || row.length) {
          row.push(cur);
          rows.push(row);
        }
        if (q) return Object.assign([], { error: 'Unclosed quoted field in CSV.' });
        return rows.filter((r) => r.some((x) => x.trim() !== ''));
      }
      const csvDt = (s) => {
        const m = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d(?::\d\d)?)/.exec(String(s).trim());
        return m ? m[1] + 'T' + m[2] : '';
      };
      function csvTrades(txt) {
        const rows = parseCsv(txt);
        if (rows.error) return { error: rows.error };
        if (rows.length < 2) return { error: 'The file has no data rows.' };
        // Find the actual header even when the broker prepends a report title or metadata.
        const headerIndex = rows.findIndex((r) => {
          const h = r.map((x) =>
            x
              .trim()
              .toLowerCase()
              .replace(/[\s_]+/g, ' '),
          );
          return h.includes('symbol') && (h.includes('status') || h.includes('order status'));
        });
        if (headerIndex < 0)
          return { error: 'Could not locate the broker orders header (Symbol and Status).' };
        // Blueberry order-history exports are newest-first. Always process fills
        // chronologically so the first fill is correctly recognised as the entry.
        const timeColumn = rows[headerIndex].findIndex((h) =>
          /^(update[ _]time|updated[ _]time|timestamp|date[ /]time)$/i.test(h.trim()),
        );
        const dataRows = rows
          .slice(headerIndex + 1)
          .sort((a, b) => String(a[timeColumn] || '').localeCompare(String(b[timeColumn] || '')));
        const head = rows[headerIndex].map((h) =>
          h
            .trim()
            .toLowerCase()
            .replace(/[\s_]+/g, ' '),
        );
        const aliases = {
          symbol: ['ticker', 'instrument'],
          side: ['direction', 'action'],
          type: ['order type'],
          qty: ['quantity', 'filled qty', 'filled quantity', 'volume', 'lots'],
          'avg fill price': ['average fill price', 'avg price', 'filled price', 'price'],
          status: ['order status'],
          'update time': [
            'updated time',
            'updated at',
            'time',
            'date/time',
            'date time',
            'timestamp',
          ],
          'position id': ['position', 'positionid', 'position identifier'],
          commission: ['commissions', 'commission fee'],
          'closed p&l': [
            'closed pnl',
            'realized p&l',
            'realised p&l',
            'realized pnl',
            'realised pnl',
            'profit/loss',
          ],
        };
        for (const [canonical, alternatives] of Object.entries(aliases)) {
          if (!head.includes(canonical)) {
            const idx = head.findIndex((h) => alternatives.includes(h));
            if (idx >= 0) head[idx] = canonical;
          }
        }
        const cols = [
          'symbol',
          'side',
          'type',
          'qty',
          'avg fill price',
          'status',
          'update time',
          'commission',
        ];
        const miss = cols.filter((c) => head.indexOf(c) < 0);
        if (miss.length) return { error: 'Missing columns: ' + miss.join(', ') + '.' };
        const I = Object.fromEntries(head.map((c, i) => [c, i]));
        // Only use explicitly labelled broker fee columns; never estimate missing fees.
        const feeCols = head
          .map((h, i) =>
            /^(swap|swap fee|swap fees|financing|financing fee|financing fees|overnight fee|overnight fees|other fees|additional charges|transaction fee|transaction fees|exchange fee|exchange fees)$/.test(
              h,
            )
              ? i
              : -1,
          )
          .filter((i) => i >= 0);
        const pos = new Map();
        const unlinkedCancellations = [];
        const balanceCol = head.findIndex((h) =>
          /^(account balance|balance after|running balance|ending balance)$/.test(h),
        );
        const reportedBalances = [];
        const badFinancial = [];
        dataRows.forEach((r) => {
          const g = (c) => (r[I[c]] ?? '').trim();
          const pid = head.includes('position id') ? g('position id') : '';
          if (balanceCol >= 0 && String(r[balanceCol] ?? '').trim() !== '') {
            const b = Number(String(r[balanceCol]).replace(/[$, ]/g, ''));
            if (Number.isFinite(b))
              reportedBalances.push({ time: csvDt(g('update time')), value: b });
          }
          const status = g('status').trim().toLowerCase();
          if (status === 'cancelled' || status === 'canceled') {
            const event = {
              time: csvDt(g('update time')),
              type: g('type').trim(),
              sym: g('symbol').trim().toUpperCase(),
              side: g('side').trim().toLowerCase(),
              qty: Number(g('qty')),
            };
            unlinkedCancellations.push({ ...event, pid });
            return;
          }
          if (status !== 'filled' && status !== 'partially filled' && status !== 'partially-filled')
            return;
          const o = {
            sym: g('symbol'),
            side: g('side'),
            type: g('type').toLowerCase(),
            qty: Number(g('qty')),
            price: Number(g('avg fill price')),
            time: csvDt(g('update time')),
            comm: Math.abs(Number(g('commission')) || 0),
            charges: r2(feeCols.reduce((sum, i) => sum + Math.abs(Number(r[i]) || 0), 0)),
            pl: head.includes('closed p&l') ? g('closed p&l') : '',
            netPl: head.includes('net closed p&l')
              ? (r[head.indexOf('net closed p&l')] ?? '').trim()
              : '',
          };
          if (
            o.pl !== '' &&
            (!Number.isFinite(Number(o.pl)) ||
              (o.netPl !== '' && !Number.isFinite(Number(o.netPl))))
          ) {
            badFinancial.push(pid);
            return;
          }
          if (
            !o.time ||
            !(o.qty > 0) ||
            !(o.price > 0) ||
            !['buy', 'sell'].includes(o.side.trim().toLowerCase())
          )
            return;
          // A zero P&L on an opening fill is not evidence of an exit.
          // Classify by direction and chronology, not simply whether the P&L cell is populated.
          const key = pid || 'unlinked-' + o.sym.trim().toUpperCase();
          if (!pos.has(key)) pos.set(key, { entries: [], exits: [], cancelled: [] });
          const bucket = pos.get(key);
          const openingSide = bucket.entries[0]?.side?.toLowerCase();
          const isExit = openingSide && openingSide !== o.side.toLowerCase();
          if (isExit) bucket.exits.push(o);
          else bucket.entries.push(o);
        });
        if (badFinancial.length)
          return {
            error:
              'Invalid broker P&L values for position(s): ' + [...new Set(badFinancial)].join(', '),
          };
        // Blueberry omits Position ID on cancelled protective orders.
        // Associate each cancellation with the latest eligible completed position,
        // requiring the same symbol, closing direction and quantity. A cancellation
        // must occur after its closing fill and before the next position opens.
        for (const cancellation of unlinkedCancellations) {
          if (!cancellation.time || !Number.isFinite(cancellation.qty) || cancellation.qty <= 0)
            continue;
          let candidates = [...pos.entries()]
            .filter(([id, p]) => {
              if (cancellation.pid && id !== cancellation.pid) return false;
              if (!p.entries.length || !p.exits.length) return false;
              const opened = p.entries.reduce((n, x) => n + x.qty, 0);
              const closedQty = p.exits.reduce((n, x) => n + x.qty, 0);
              if (closedQty < opened - 1e-9) return false;
              const last = p.exits.reduce((a, x) => (!a || x.time > a.time ? x : a), null);
              return (
                p.entries[0].sym.trim().toUpperCase() === cancellation.sym &&
                last.side.trim().toLowerCase() === cancellation.side &&
                Math.abs(opened - cancellation.qty) < 1e-8 &&
                cancellation.time >= last.time
              );
            })
            .sort((a, b) => {
              const lastTime = (p) => p.exits.reduce((max, x) => (x.time > max ? x.time : max), '');
              return lastTime(b[1]).localeCompare(lastTime(a[1]));
            });
          if (!candidates.length) continue;
          const [id, bucket] = candidates[0];
          const lastClose = bucket.exits.reduce((max, x) => (x.time > max ? x.time : max), '');
          // Avoid attaching a stale protective order to an older trade if a new
          // position in the same instrument was opened between close and cancel.
          const interveningEntry = [...pos.entries()].some(
            ([otherId, p]) =>
              otherId !== id &&
              p.entries.some(
                (e) =>
                  e.sym.trim().toUpperCase() === cancellation.sym &&
                  e.time > lastClose &&
                  e.time <= cancellation.time,
              ),
          );
          if (!interveningEntry) bucket.cancelled.push(cancellation);
        }
        const wavg = (a) =>
          +(a.reduce((s, x) => s + x.price * x.qty, 0) / a.reduce((s, x) => s + x.qty, 0)).toFixed(
            5,
          );
        const out = [];
        let skipped = 0,
          stamp = Date.now();
        for (const [pid, p] of pos) {
          if (!p.entries.length) {
            skipped++;
            continue;
          } // opened before this export
          const byTime = (a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
          p.entries.sort(byTime);
          p.exits.sort(byTime);
          p.cancelled.sort(byTime);
          const e0 = p.entries[0];
          const lots = roundTo(
            p.entries.reduce((s, x) => s + x.qty, 0),
            6,
          );
          const entry = wavg(p.entries);
          const d = e0.side.toLowerCase() === 'buy' ? 1 : -1;
          const exitQty = p.exits.reduce((s, x) => s + x.qty, 0);
          const done = p.exits.length && exitQty >= lots - 1e-9; // partial close stays open
          const t = {
            id: 'csv-' + pid,
            account: '',
            dt: e0.time,
            xdt: '',
            pair: e0.sym.split('.')[0].toUpperCase(),
            side: e0.side.toLowerCase() === 'buy' ? 'Buy' : 'Sell',
            entry,
            sl: null,
            tp: null,
            exit: null,
            lots,
            risk: 0,
            pl: null,
            comm: r2(p.entries.reduce((s, x) => s + x.comm, 0)),
            charges: r2(p.entries.reduce((s, x) => s + x.charges, 0)),
            adjustment: 0,
            pipSize: null,
            session: detectSession(e0.time),
            setup: '',
            tf: '',
            notes: 'Imported from broker CSV (' + pid + ')',
            created: stamp,
            updated: stamp++,
          };
          if (done) {
            const last = p.exits[p.exits.length - 1];
            t.exit = wavg(p.exits);
            // Match cancellation events to this exact broker position, never to a symbol alone.
            // Prefer the latest cancellation after the filled closing order; earlier
            // cancellations may belong to replaced stops or unfilled entries.
            const matchingCancellation = p.cancelled
              .filter((x) => x.time && x.time >= last.time)
              .sort(byTime)
              .at(-1);
            t.xdt = matchingCancellation ? matchingCancellation.time : last.time;
            t.notes +=
              '\nExit order type: ' +
              (matchingCancellation
                ? 'Cancelled (' + (matchingCancellation.type || 'unspecified') + ')'
                : last.type || 'Market');

            t.pl = p.exits.every((x) => x.pl !== '')
              ? r2(p.exits.reduce((s, x) => s + Number(x.pl), 0))
              : null;
            t.comm = r2(t.comm + p.exits.reduce((s, x) => s + x.comm, 0));
            t.charges = r2(t.charges + p.exits.reduce((s, x) => s + x.charges, 0));
            // TradingView net includes broker adjustments not itemized as commission.
            // Preserve the reported net rather than inventing a fee.
            if (p.exits.every((x) => x.netPl !== '' && Number.isFinite(Number(x.netPl)))) {
              const reportedNet = r2(p.exits.reduce((s, x) => s + Number(x.netPl), 0));
              t.adjustment = r2(reportedNet - (t.pl - t.comm - t.charges));
            }
            if (last.type.includes('stop') && d * (entry - t.exit) > 0) t.sl = t.exit;
            if (last.type.includes('take') && d * (t.exit - entry) > 0) t.tp = t.exit;
          }
          const c = clean(t);
          c ? out.push(c) : skipped++;
        }
        reportedBalances.sort((a, b) => a.time.localeCompare(b.time));
        return {
          trades: out,
          skipped,
          reportedBalance: reportedBalances.length
            ? reportedBalances[reportedBalances.length - 1].value
            : null,
        };
      }
      async function importCsv(file) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024)
          return toast('CSV import failed: file is larger than 5 MB.', 'error');
        let res;
        try {
          res = csvTrades(await file.text());
        } catch {
          return toast('CSV import failed: unable to read the file.', 'error');
        }
        if (res.error) return toast('CSV import failed: ' + res.error, 'error');
        const have = new Set(S.trades.map((t) => t.id));
        const fresh = res.trades.filter((t) => {
          if (have.has(t.id)) return false;
          have.add(t.id);
          return true;
        });
        const dup = res.trades.length - fresh.length;
        if (!fresh.length)
          return toast(
            dup
              ? 'These trades are already imported.'
              : `No importable positions found (${res.skipped || 0} skipped). Check order dates, filled prices and position identifiers.`,
            'error',
          );
        const def = acc(S.lastAcc) ? S.lastAcc : S.settings.accounts[0].id;
        const balanceNotice =
          res.reportedBalance == null
            ? 'No broker account balance column detected. Existing starting balance will be kept.'
            : 'Broker-reported ending balance: ' +
              fm(res.reportedBalance, false, '') +
              '. You may reconcile the account balance using this value.';
        openDlg(
          `<div class="dh"><h2>Import Broker CSV</h2></div><div class="db">
        <p class="mp" style="margin-bottom:16px">${fresh.length} new trade${fresh.length > 1 ? 's' : ''} found${dup ? `, ${dup} already imported` : ''}${res.skipped ? `, ${res.skipped} skipped` : ''}.</p>
        <p class="mp" style="margin-bottom:12px">${esc(balanceNotice)}</p>
        <label class="f"><span>Import into account</span><select id="csvacc">${S.settings.accounts
          .map(
            (a) =>
              `<option value="${esc(a.id)}" ${a.id === def ? 'selected' : ''}>${esc(a.name)} (${a.type})</option>`,
          )
          .join('')}</select></label>
        ${res.reportedBalance == null ? '' : '<label style="display:block;margin-top:12px"><input type="checkbox" id="csvbalance" style="width:auto;height:auto"> Reconcile account to broker-reported balance (only if this is the latest balance)</label>'}</div>
        <div class="df"><button class="btn" data-act="close">Cancel</button>
        <button class="btn primary" id="csvgo">Import</button></div>`,
          'sm',
        );
        $('#csvgo').onclick = async () => {
          const a = $('#csvacc').value;
          const updatedTrades = [...S.trades, ...fresh.map((t) => ({ ...t, account: a }))];
          let settings = S.settings;
          if (res.reportedBalance != null && $('#csvbalance')?.checked) {
            const accountNet = r2(
              updatedTrades
                .filter((t) => t.account === a && closed(t))
                .reduce((sum, t) => sum + calc(t).net, 0),
            );
            settings = {
              ...S.settings,
              accounts: S.settings.accounts.map((x) =>
                x.id === a
                  ? { ...x, balance: r2(res.reportedBalance - accountNet - flowNet(x)) }
                  : x,
              ),
            };
            if (settings.accounts.some((x) => x.id === a && x.balance < 0))
              return toast(
                'Reconciliation would require a negative starting balance. Check account history.',
                'error',
              );
          }
          if (await commit(updatedTrades, settings)) {
            S.lastAcc = a;
            closeDlg();
            toast(`Imported ${fresh.length} trade${fresh.length > 1 ? 's' : ''}`);
            render();
          }
        };
      }
      // Deposits and withdrawals
      function flowForm(id, type) {
        const a = acc(id);
        if (!a) return;
        openDlg(
          `<div class="dh"><h2>${type} \u00b7 ${esc(a.name)}</h2></div>
    <form id="ff" novalidate style="display:contents"><div class="db"><div class="grid2">
    ${F('date', 'Date', `<input name="date" type="date" value="${nowLocal().slice(0, 10)}">`)}
    ${F('amount', 'Amount (' + esc(a.currency) + ')', nin('amount', '', '0.00'))}
    <div class="full">${F('note', 'Note (optional)', `<input name="note" maxlength="100" placeholder="e.g. Monthly top-up">`)}</div>
    </div></div><div class="df"><button type="button" class="btn" data-act="close">Cancel</button>
    <button class="btn primary">Save ${type.toLowerCase()}</button></div></form>`,
          'sm',
        );
        $('#ff').onsubmit = async (ev) => {
          ev.preventDefault();
          const f = new FormData(ev.target),
            g = (n) => String(f.get(n) || '').trim(),
            er = {},
            amt = Number(g('amount'));
          if (!/^\d{4}-\d{2}-\d{2}$/.test(g('date')) || Number.isNaN(Date.parse(g('date'))))
            er.date = 'Enter a valid date';
          if (g('amount') === '') er.amount = 'Required';
          else if (!Number.isFinite(amt) || amt <= 0) er.amount = 'Must be greater than 0';
          showErrs(ev.target, er);
          if (Object.keys(er).length) return;
          const flow = {
            id: uid(),
            type,
            date: g('date'),
            amount: amt,
            note: g('note').slice(0, 100),
          };
          const st = {
            ...S.settings,
            accounts: S.settings.accounts.map((x) =>
              x.id === id ? { ...x, flows: [...(x.flows || []), flow] } : x,
            ),
          };
          if (await commit(S.trades, st)) {
            closeDlg();
            toast(type + ' added');
            render();
          }
        };
      }
      // Click actions
      const act = {
        view: (d) => {
          S.view = d.v;
          render();
        },
        theme: async () => {
          if (
            await commit(S.trades, S.settings, {
              ...preferences,
              theme: preferences.theme === 'dark' ? 'light' : 'dark',
            })
          )
            render();
        },
        customaccent: async () => {
          const color = $('#custom-accent')?.value;
          if (!validAccent(color)) return toast('Choose a valid colour', 'error');
          if (await commit(S.trades, S.settings, { ...preferences, accent: color })) render();
        },
        accent: async (d) => {
          if (await commit(S.trades, S.settings, { ...preferences, accent: d.color })) render();
        },
        savequote: async () => {
          const quote = ($('#custom-dashboard-quote')?.value || '').trim();
          if (!quote) return toast('Enter a quote first.', 'error');
          if (await commit(S.trades, S.settings, { ...preferences, quote })) {
            render();
            toast('Dashboard quote saved');
          }
        },
        resetquote: async () => {
          if (
            !(await confirmDel(
              'Reset dashboard quote?',
              'Your custom dashboard quote will be replaced with the default quote.',
              'Reset quote',
            ))
          )
            return;
          if (await commit(S.trades, S.settings, { ...preferences, quote: '' })) render();
        },
        saveusername: async () => {
          if (!currentUser || saving) return;
          const username = ($('#profile-username')?.value || '').trim();
          if (!validUsername(username))
            return toast('Username must contain 1–100 characters.', 'error');
          const button = $('[data-act="saveusername"]');
          if (button) button.disabled = true;
          try {
            const { data, error } = await db
              .from('profiles')
              .upsert({ id: currentUser.id, username }, { onConflict: 'id' })
              .select('username')
              .single();
            if (error) throw error;
            profileUsername = data.username;
            render();
            toast('Username updated');
          } catch (error) {
            toast(
              error.code === '23505'
                ? 'That username is already taken.'
                : 'Could not update username: ' + error.message,
              'error',
            );
          } finally {
            if (button?.isConnected) button.disabled = false;
          }
        },
        lock: signOut,
        reload: async () => {
          if (currentUser && !saving) await loadAccount(currentUser, true);
        },
        riskcalc: () => riskCalculator(),
        addcheckrule: () => {
          const input = $('#checklist-new-rule');
          const wrap = $('#checklist-chips');
          const rule = input?.value.trim().replace(/\s+/g, ' ');
          if (!rule || !wrap) return;
          const existing = [...wrap.querySelectorAll('.checklist-chip')].map((x) => x.dataset.rule.toLowerCase());
          if (existing.includes(rule.toLowerCase())) { toast('Rule already added'); return; }
          if (existing.length >= 20) { toast('Maximum 20 checklist rules'); return; }
          const chip = document.createElement('span');
          chip.className = 'checklist-chip';
          chip.dataset.rule = rule;
          const label = document.createElement('span');
          label.textContent = rule;
          const remove = document.createElement('button');
          remove.type = 'button'; remove.className = 'checklist-remove';
          remove.dataset.act = 'removecheckrule'; remove.dataset.rule = rule; remove.textContent = '×';
          remove.setAttribute('aria-label', 'Remove ' + rule);
          chip.append(label, remove); wrap.append(chip);
          input.value = ''; input.focus();
        },
        removecheckrule: (d) => {
          const chips = [...document.querySelectorAll('#checklist-chips .checklist-chip')];
          const rule = d.rule;
          const target = rule ? chips.find((c) => c.dataset.rule === rule) : null;
          if (target) target.remove();
        },
        savechecklist: async () => {
          const val = [...document.querySelectorAll('#checklist-chips .checklist-chip')]
            .map((chip) => chip.dataset.rule).filter(Boolean).slice(0, 20);
          const next = { ...S.settings, checklist: val };
          if (await commit(S.trades, next)) {
            toast('Checklist saved');
            render();
          }
        },
        add: () => tradeForm(),
        close: closeDlg,
        detail: (d) => detail(d.id),
        edit: (d) => tradeForm(S.trades.find((t) => t.id === d.id)),
        del: async (d) => {
          const t = S.trades.find((x) => x.id === d.id);
          if (!t) return;
          if (
            (await confirmDel(
              'Delete this trade?',
              `${esc(t.pair)} ${t.side} on ${t.dt.replace('T', ' ')} will be permanently deleted.`,
              'Delete trade',
            )) &&
            (await commit(S.trades.filter((x) => x.id !== d.id)))
          ) {
            toast('Trade deleted');
            render();
          }
        },
        accadd: () => accForm(),
        flowadd: (d) => flowForm(d.id, d.t),
        flowdel: async (d) => {
          if (
            await confirmDel(
              'Delete this entry?',
              'This deposit or withdrawal will be permanently removed.',
              'Delete',
            )
          ) {
            const st = {
              ...S.settings,
              accounts: S.settings.accounts.map((x) =>
                x.id === d.id ? { ...x, flows: (x.flows || []).filter((f) => f.id !== d.fid) } : x,
              ),
            };
            if (await commit(S.trades, st)) {
              toast('Entry deleted');
              render();
            }
          }
        },
        accedit: (d) => accForm(acc(d.id)),
        accview: (d) => {
          S.acc = d.id;
          S.view = 'dashboard';
          render();
        },
        accdel: async (d) => {
          const a = acc(d.id);
          if (!a) return;
          if (S.settings.accounts.length < 2)
            return toast(
              'Keep at least one account. Add another before deleting this one.',
              'error',
            );
          const n = S.trades.filter((t) => t.account === d.id).length;
          if (
            await confirmDel(
              'Delete this account?',
              `${esc(a.name)} will be deleted${
                n ? ` along with its ${n} trade${n > 1 ? 's' : ''}` : ''
              }. This cannot be undone. Export a backup first if you might
            need it.`,
              'Delete account',
            )
          ) {
            const st = {
              ...S.settings,
              accounts: S.settings.accounts.filter((x) => x.id !== d.id),
            };
            if (
              await commit(
                S.trades.filter((t) => t.account !== d.id),
                st,
              )
            ) {
              if (S.acc === d.id) S.acc = 'all';
              if (S.tacc === d.id) S.tacc = 'all';
              toast('Account deleted');
              render();
            }
          }
        },
        exit: (d) =>
          tradeForm(
            S.trades.find((t) => t.id === d.id),
            'xd',
          ),
        calprev: () => calGo(S.cal.y, S.cal.m - 1),
        calnext: () => calGo(S.cal.y, S.cal.m + 1),
        calprevy: () => calGo(S.cal.y - 1, S.cal.m),
        calnexty: () => calGo(S.cal.y + 1, S.cal.m),
        caltoday: () => {
          const now = nowLocal();
          calGo(+now.slice(0, 4), +now.slice(5, 7) - 1);
        },
        calday: (d) => {
          S.calDay = S.calDay === d.d ? '' : d.d;
          refreshCal();
        },
        sampleadd: async () => {
          const sample = buildSample();
          const st = {
            ...S.settings,
            accounts: [...S.settings.accounts, ...sample.accounts],
            checklist: (S.settings.checklist || []).length
              ? S.settings.checklist
              : [...SAMPLE_CHECKLIST],
          };
          if (await commit([...S.trades, ...sample.trades], st)) {
            toast(
              `Sample data added: ${sample.trades.length} trades` +
                (sample.accounts.length ? `, ${sample.accounts.length} accounts` : ''),
            );
            render();
          }
        },
        sampledel: async () => {
          const info = sampleInfo();
          if (!info.accounts && !info.trades)
            return toast('There is no sample data to remove.', 'error');
          const ok = await confirmDel(
            'Remove sample data?',
            `This removes ${info.trades} sample trade${info.trades === 1 ? '' : 's'} and ` +
              `${info.accounts} sample account${info.accounts === 1 ? '' : 's'}. ` +
              'Your own accounts and trades are not affected, and any sample ' +
              'account that holds your own trades is kept.',
            'Remove sample data',
          );
          if (!ok) return;
          const trades = S.trades.filter((t) => !t.sample);
          const used = new Set(trades.map((t) => t.account));
          const accounts = S.settings.accounts.flatMap((a) =>
            !a.sample
              ? [a]
              : used.has(a.id) || (a.flows || []).length
                ? [{ ...a, sample: false }]
                : [],
          );
          if (await commit(trades, cleanSettings({ ...S.settings, accounts }))) {
            if (S.acc !== 'all' && !acc(S.acc)) S.acc = 'all';
            if (S.tacc !== 'all' && !acc(S.tacc)) S.tacc = 'all';
            S.calDay = '';
            toast('Sample data removed');
            render();
          }
        },
        export: exportData,
        import: () => {
          S.importMode = 'main';
          $('#file').click();
        },
        removealltrades: async () => {
          if (!S.trades.length) return toast('There are no trades to remove.', 'error');
          const count = S.trades.length;
          const ok = await confirmDel(
            'Remove all trades?',
            `This permanently deletes all ${count} trade${count === 1 ? '' : 's'} and their associated screenshots and review details from your journal on every device. Your trading accounts, account balances and settings will remain. Export a backup first.`,
            'Remove all trades',
          );
          if (!ok) return;
          if (await commit([], S.settings)) {
            S.calDay = '';
            closeDlg();
            render();
            toast('All trades removed');
          }
        },
        erase: async () => {
          if (
            await confirmDel(
              'Erase your journal?',
              'This deletes all trades, trading accounts, screenshots and settings from your Supabase profile on every device. Your login stays active. Export a backup first.',
              'Erase journal',
            )
          ) {
            if (await commit([], cleanSettings(), defaultPreferences())) {
              closeDlg();
              S.acc = S.tacc = 'all';
              render();
              toast('Journal erased');
            }
          }
        },
        chpw: () => authScreen('update'),
      };
      document.addEventListener('click', (e) => {
        const category = e.target.closest('[data-settings-section]');
        if (!category) return;
        settingsSection = category.dataset.settingsSection;
        const page = document.querySelector('.settings-content.settings-page');
        if (page) page.dataset.currentSection = settingsSection;
        if (page)
          page.querySelectorAll(':scope > section.settings-panel').forEach((panel) => {
            const active = panel.id === `settings-${settingsSection}`;
            panel.style.setProperty('display', active ? 'block' : 'none', 'important');
            panel.hidden = !active;
          });
        document.querySelectorAll('.settings-switch').forEach((button) => {
          const selected = button.dataset.settingsSection === settingsSection;
          button.classList.toggle('selected', selected);
          button.setAttribute('aria-pressed', String(selected));
        });
      });
      document.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]');
        if (a && act[a.dataset.act] && ready && !saving)
          Promise.resolve(act[a.dataset.act](a.dataset)).catch((error) =>
            toast(error.message, 'error'),
          );
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('tr[data-act]')) act.detail(e.target.dataset);
        if (e.key === 'Enter' && e.target.id === 'checklist-new-rule') { e.preventDefault(); act.addcheckrule(); }
      });
      document.addEventListener('input', (e) => {
        const i = e.target.id;
        if (i === 'q' || i === 'res' || i === 'tacc') {
          S.q = $('#q').value;
          S.res = $('#res').value;
          S.tacc = $('#tacc').value;
          $('#tl').innerHTML = tradeTable(tfilter(), S.trades.length);
        }
        if (i === 'accf') {
          S.acc = e.target.value;
          render();
        }
      });
      document.addEventListener('change', (e) => {
        if (e.target.id !== 'cm' && e.target.id !== 'cy') return;
        const y = Number($('#cy').value);
        const m = Number($('#cm').value);
        if (Number.isInteger(y) && y >= CAL_MIN && y <= CAL_MAX) calGo(y, m);
        else {
          toast(`Enter a year between ${CAL_MIN} and ${CAL_MAX}.`, 'error');
          refreshCal();
        }
      });
      $('#file').onchange = async (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        const isCsv = /\.csv$/i.test(f.name) || f.type === 'text/csv';
        if (isCsv && S.importMode !== 'setup') await importCsv(f);
        else await importFile(f);
      };

      // Card help text

      // Harmonise heading capitalisation throughout the app without changing trade data.
      function harmoniseHeadings() {
        const acronyms = new Set([
          'P&L',
          'ROI',
          'RR',
          'R:R',
          'USD',
          'TP',
          'SL',
          'ID',
          'CSV',
          'FX',
          'API',
          'DOM',
        ]);
        document
          .querySelectorAll(
            '#app h1, #app h2, #app h3, #app h4, #app .ref-title-text, #app .simple-label, #app .settings-field-title',
          )
          .forEach((el) => {
            // The dashboard quote is a sentence, not a heading label.
            if (el.closest('.dashboard-heading-quote')) return;
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const node = walker.currentNode;
              if (!node.nodeValue.trim()) continue;
              const formatted = node.nodeValue.replace(/\b[A-Za-z][A-Za-z&:]*\b/g, (word) => {
                if (acronyms.has(word.toUpperCase())) return word.toUpperCase();
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
              });
              if (formatted !== node.nodeValue) node.nodeValue = formatted;
            }
          });
      }
      let headingsQueued = false;
      new MutationObserver(() => {
        if (headingsQueued) return;
        headingsQueued = true;
        queueMicrotask(() => {
          headingsQueued = false;
          harmoniseHeadings();
        });
      }).observe(document.getElementById('app'), { childList: true, subtree: true });
      harmoniseHeadings();
      document.addEventListener('input', (e) => {
        if (e.target.id === 'custom-accent') {
          const label = document.querySelector('.custom-accent-value');
          if (label) label.textContent = e.target.value.toUpperCase();
        }
      });

      // Keep every visible Recent Trades row whole, even as calendar details expand.
      // The row height is distributed evenly across the available list viewport.
      let recentRowResizeObserver = null;
      let observedRecentList = null;
      function fitRecentTradeRows() {
        const list = document.querySelector('.dashboard-calendar-row .simple-recent');
        if (list === observedRecentList) return;
        if (recentRowResizeObserver) recentRowResizeObserver.disconnect();
        observedRecentList = list;
        if (!list || !window.ResizeObserver) return;
        recentRowResizeObserver = new ResizeObserver(() => {
          const available = list.clientHeight;
          if (!available) return;
          const minRow = 58;
          const count = Math.max(1, Math.floor(available / minRow));
          const rowHeight = available / count;
          list.style.setProperty('--recent-trade-row-height', `${rowHeight}px`);
        });
        recentRowResizeObserver.observe(list);
      }
      const recentListMutationObserver = new MutationObserver(fitRecentTradeRows);
      recentListMutationObserver.observe(document.getElementById('app'), {
        childList: true,
        subtree: true,
      });
      fitRecentTradeRows();
      // Start-up
      dlg.addEventListener('cancel', (event) => {
        if (saving) event.preventDefault();
      });
      window.addEventListener('beforeunload', (event) => {
        if (saving) {
          event.preventDefault();
          event.returnValue = '';
        }
      });
      startCloud();

      // Shared tooltip portal: keeps every card's help text visible even when
      // the card, dashboard grid or viewport edge clips its original tooltip.
