/* ===========================
   AI Diplomatic Risk Dashboard
   Client-side (GitHub Pages)
   =========================== */

// ---- Lightweight settings store (localStorage) ----
const Settings = {
  get() {
    return {
      newsapi: localStorage.getItem('newsapi') || '',
      openweather: localStorage.getItem('openweather') || '',
      region: localStorage.getItem('region') || 'West Africa',
    };
  },
  set(k, v) { localStorage.setItem(k, v); },
};

// ---- Countries & metadata (West Africa default) ----
const REGIONS = {
  'West Africa': ['nigeria', 'ghana', 'senegal', 'mali', 'niger'],
  'East Africa': ['kenya', 'ethiopia', 'uganda', 'tanzania', 'rwanda'],
  'Central Africa': ['cameroon', 'chad', 'car', 'congo', 'gabon'],
};

const ISO3 = {
  nigeria: 'NGA', ghana: 'GHA', senegal: 'SEN', mali: 'MLI', niger: 'NER',
  kenya: 'KEN', ethiopia: 'ETH', uganda: 'UGA', tanzania: 'TZA', rwanda: 'RWA',
  cameroon: 'CMR', chad: 'TCD', car: 'CAF', congo: 'COG', gabon: 'GAB',
};

const CAPITALS = {
  nigeria: 'Abuja', ghana: 'Accra', senegal: 'Dakar', mali: 'Bamako', niger: 'Niamey',
  kenya: 'Nairobi', ethiopia: 'Addis Ababa', uganda: 'Kampala', tanzania: 'Dodoma', rwanda: 'Kigali',
  cameroon: 'Yaoundé', chad: "N'Djamena", car: 'Bangui', congo: 'Brazzaville', gabon: 'Libreville',
};

// ---- DOM refs (from your index.html) ----
const newsFeedEl = document.getElementById('news-feed');
const sentimentEl = document.getElementById('sentiment');
const economicsEl = document.getElementById('economics');

// ---- Utility: load Chart.js on demand ----
function loadChartJS() {
  return new Promise((resolve, reject) => {
    if (window.Chart) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Chart.js'));
    document.body.appendChild(s);
  });
}

// ---- UI: tiny settings button (top-right) ----
(function injectSettingsButton() {
  const btn = document.createElement('button');
  btn.textContent = '⚙️';
  btn.title = 'API Keys / Region';
  Object.assign(btn.style, {
    position: 'fixed', top: '12px', right: '12px', zIndex: 9999,
    border: 'none', background: '#ffffff', color: '#1a237e',
    borderRadius: '12px', padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,.15)',
    cursor: 'pointer', fontSize: '16px'
  });
  btn.addEventListener('click', () => {
    const current = Settings.get();
    const newsapi = prompt('Enter NewsAPI key (https://newsapi.org) — leave blank for demo:', current.newsapi);
    if (newsapi !== null) Settings.set('newsapi', newsapi.trim());
    const ow = prompt('Enter OpenWeather key (https://openweathermap.org) — optional:', current.openweather);
    if (ow !== null) Settings.set('openweather', ow.trim());
    const region = prompt('Region: West Africa | East Africa | Central Africa', current.region);
    if (region && REGIONS[region]) Settings.set('region', region);
    location.reload();
  });
  document.body.appendChild(btn);
})();

// ---- Simple keyword sentiment ----
function analyzeSentiment(items) {
  const positive = ['peace', 'agreement', 'cooperation', 'growth', 'stability', 'progress', 'ceasefire'];
  const negative = ['conflict', 'crisis', 'war', 'violence', 'instability', 'tension', 'coup', 'protest', 'sanction'];

  let pos = 0, neg = 0, neu = 0;
  for (const it of items) {
    const text = ((it.title || '') + ' ' + (it.description || '')).toLowerCase();
    const p = positive.some(w => text.includes(w));
    const n = negative.some(w => text.includes(w));
    if (p && !n) pos++; else if (n && !p) neg++; else neu++;
  }
  const total = Math.max(items.length, 1);
  return {
    positive: Math.round((pos / total) * 100),
    negative: Math.round((neg / total) * 100),
    neutral: Math.round((neu / total) * 100),
  };
}

// ---- Weather risk score (optional) ----
function weatherRiskFromNow(data) {
  // expects OpenWeather /weather payload
  if (!data || !data.main || !data.weather) return 0;
  let risk = 0;
  if (data.main.temp > 313.15) risk += 2;     // >40°C
  if (data.main.temp < 273.15) risk += 2;     // <0°C
  if (data.main.humidity > 90) risk += 1;
  const severe = ['Thunderstorm', 'Tornado', 'Hurricane', 'Extreme'];
  if (severe.includes(data.weather[0]?.main)) risk += 3;
  return Math.min(risk, 5);
}

// ---- Risk calculation ----
function computeRisk(sentimentPct, weatherRisk, econTrend) {
  // Base 5; add negativity, weather, and econ decline
  let score = 5;
  score += (sentimentPct.negative / 100) * 3; // up to +3
  score -= (sentimentPct.positive / 100) * 2; // down to -2
  score += (weatherRisk || 0) * 0.5;          // up to +2.5
  if (econTrend < 0) score += 1;              // decline penalty
  return Math.max(1, Math.min(10, Number(score.toFixed(1))));
}

// ---- Fetch: NewsAPI (optional key) ----
async function fetchNewsForCountry(country, key) {
  if (!key) return { country, articles: [] }; // demo mode handled later
  const q = encodeURIComponent(`${country} politics conflict diplomacy`);
  const url = `https://newsapi.org/v2/everything?q=${q}&sortBy=publishedAt&pageSize=8&language=en&apiKey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('News fetch failed');
  const data = await res.json();
  return { country, articles: data.articles || [] };
}

// ---- Fetch: World Bank GDP current/last for econ trend ----
async function fetchWB(countryKey) {
  const iso3 = ISO3[countryKey];
  if (!iso3) return { country: countryKey, series: [] };
  // 2020–2024 GDP current USD
  const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/NY.GDP.MKTP.CD?format=json&date=2020:2024&per_page=5`;
  const res = await fetch(url);
  if (!res.ok) return { country: countryKey, series: [] };
  const data = await res.json();
  return { country: countryKey, series: (data && data[1]) ? data[1] : [] };
}

// ---- Fetch: OpenWeather current (optional key) ----
async function fetchWeather(countryKey, key) {
  if (!key) return { country: countryKey, risk: 0 };
  const city = CAPITALS[countryKey];
  if (!city) return { country: countryKey, risk: 0 };
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}`;
  const res = await fetch(url);
  if (!res.ok) return { country: countryKey, risk: 0 };
  const data = await res.json();
  return { country: countryKey, risk: weatherRiskFromNow(data) };
}

// ---- Demo generators ----
function demoNews(country) {
  return {
    country,
    articles: [
      {
        title: `${country[0].toUpperCase()+country.slice(1)} diplomatic developments`,
        description: `Talks and policy shifts impacting regional stability in ${country}.`,
        url: '#', publishedAt: new Date().toISOString(), source: { name: 'Demo Wire' }
      },
      {
        title: `Economic cooperation discussions in ${country}`,
        description: `Leaders explore trade and security cooperation.`,
        url: '#', publishedAt: new Date().toISOString(), source: { name: 'Demo Journal' }
      },
    ]
  };
}

function demoEconTrend() {
  // random small up/down
  const delta = (Math.random() - 0.5) * 0.2; // -10% to +10%
  return delta; // use as proxy for trend
}

// ---- Render helpers ----
function renderNewsFeed(allNews) {
  newsFeedEl.innerHTML = '';
  for (const { country, articles } of allNews) {
    const li = document.createElement('li');
    const title = country[0].toUpperCase() + country.slice(1);
    const inner = document.createElement('div');
    inner.innerHTML = `<strong>${title}</strong>`;
    const ul = document.createElement('ul');
    ul.style.marginTop = '6px';
    for (const a of (articles || []).slice(0, 3)) {
      const item = document.createElement('li');
      item.style.margin = '2px 0';
      const link = document.createElement('a');
      link.href = a.url || '#';
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = a.title || 'Untitled';
      item.appendChild(link);
      ul.appendChild(item);
    }
    if (!articles || articles.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'No live data (demo mode).';
      ul.appendChild(item);
    }
    li.appendChild(inner);
    li.appendChild(ul);
    newsFeedEl.appendChild(li);
  }
}

function renderSentiment(allArticlesFlat) {
  const s = analyzeSentiment(allArticlesFlat);
  sentimentEl.textContent = `Positive: ${s.positive}% • Neutral: ${s.neutral}% • Negative: ${s.negative}%`;
  return s;
}

function renderEconomics(econSummaryMap) {
  // show trend up/down per country
  const lines = [];
  for (const [country, trend] of Object.entries(econSummaryMap)) {
    const dir = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
    lines.push(`${country[0].toUpperCase()+country.slice(1)}: ${dir}`);
  }
  economicsEl.textContent = lines.join('  |  ');
}

// ---- Chart creation (risk over last 5 checkpoints) ----
let riskChart;
function ensureChartContainer() {
  // If index.html doesn’t have a canvas, create a card with one
  if (!document.getElementById('riskChart')) {
    const section = document.getElementById('dashboard');
    const card = document.createElement('div');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = 'Risk Trends';
    const canvas = document.createElement('canvas');
    canvas.id = 'riskChart';
    canvas.className = 'chart';
    card.appendChild(h2);
    card.appendChild(canvas);
    section.appendChild(card);
  }
}

function drawRiskChart(labels, datasets) {
  const ctx = document.getElementById('riskChart').getContext('2d');
  if (riskChart) {
    riskChart.data.labels = labels;
    riskChart.data.datasets = datasets;
    riskChart.update();
    return;
  }
  riskChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      scales: {
        y: { min: 0, max: 10, title: { display: true, text: 'Risk (1–10)' } },
        x: { title: { display: true, text: 'Time' } }
      },
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

// ---- Main flow ----
async function main() {
  const cfg = Settings.get();
  const region = cfg.region;
  const countries = REGIONS[region] || REGIONS['West Africa'];

  // 1) Fetch news (or demo)
  let newsResults = [];
  try {
    newsResults = await Promise.all(
      countries.map(c => fetchNewsForCountry(c, cfg.newsapi).catch(() => demoNews(c)))
    );
  } catch {
    newsResults = countries.map(c => demoNews(c));
  }
  renderNewsFeed(newsResults);

  // 2) Sentiment from all articles
  const allArticles = newsResults.flatMap(n => n.articles || []);
  const sentimentPct = renderSentiment(allArticles);

  // 3) Economics (World Bank) — compute trend (latest minus previous)
  const econ = await Promise.all(countries.map(c => fetchWB(c)));
  const econTrendMap = {};
  for (const e of econ) {
    const series = (e.series || []).filter(x => x && x.value != null);
    // sort by date ascending
    series.sort((a, b) => Number(a.date) - Number(b.date));
    const last = series[series.length - 1]?.value ?? null;
    const prev = series[series.length - 2]?.value ?? null;
    const trend = (last != null && prev != null) ? (last - prev) : demoEconTrend();
    econTrendMap[e.country] = trend;
  }
  renderEconomics(econTrendMap);

  // 4) Weather risk (optional)
  const weather = await Promise.all(countries.map(c => fetchWeather(c, cfg.openweather).catch(() => ({ country: c, risk: 0 }))));
  const weatherRiskMap = {};
  for (const w of weather) weatherRiskMap[w.country] = w.risk || 0;

  // 5) Compute current risk per country
  const currentRisk = {};
  for (const c of countries) {
    const articles = (newsResults.find(n => n.country === c)?.articles) || [];
    const s = analyzeSentiment(articles);
    const econTrend = econTrendMap[c] || 0;
    const wRisk = weatherRiskMap[c] || 0;
    currentRisk[c] = computeRisk(s, wRisk, econTrend);
  }

  // 6) Build 5-timepoints series (mock time roll with small variance)
  const labels = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i * 7);
    labels.push(d.toISOString().split('T')[0]);
  }
  const datasets = countries.map((c, idx) => {
    const base = currentRisk[c];
    const series = Array.from({ length: 5 }, () => {
      const wobble = (Math.random() - 0.5) * 0.8; // ±0.4
      return Math.max(1, Math.min(10, Number((base + wobble).toFixed(1))));
    });
    return {
      label: c[0].toUpperCase() + c.slice(1),
      data: series,
      borderWidth: 2,
      tension: 0.25,
    };
  });

  // 7) Ensure chart exists, load Chart.js, then draw
  ensureChartContainer();
  try {
    await loadChartJS();
    drawRiskChart(labels, datasets);
  } catch (e) {
    console.warn('Chart disabled:', e.message);
  }
}

// Kick off
document.addEventListener('DOMContentLoaded', () => {
  // placeholder text while loading
  newsFeedEl.innerHTML = '<li>Loading latest diplomatic events…</li>';
  sentimentEl.textContent = 'Analyzing sentiment…';
  economicsEl.textContent = 'Fetching economic indicators…';
  main();
});
