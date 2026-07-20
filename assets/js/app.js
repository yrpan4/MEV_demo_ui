const state = {
  data: null,
  page: "Market Overview",
  range: "24H",
  chartMode: "profit",
  topTab: "txProfit",
  currentAddress: "0x64545160d28Fd0E309277C02D6d73b3923C4bFA",
  entityRole: "Contract Portfolio",
  currentTxHash: "0x9a11d6f86ef06d4bdb95e5815686a0f65b0f1d9a7720af5d954ad7e4ef1bb001",
  explorerType: "Sandwich",
  explorerView: "Token Flow",
  selectedPosition: null,
  hoverPoints: {}
};

const pages = ["Market Overview", "MEV Explorer", "Entity Analysis", "Simulator Lab"];
const colors = ["#31d0aa", "#e8b64f", "#6fa8ff", "#ef6f6c", "#a48cff", "#6fd2ff", "#f28fb3"];
const rangeScale = { "1H": 0.08, "24H": 1, "7D": 5.6, "30D": 21, "90D": 63, "1Y": 240 };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const money = (n) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const compact = (value) => String(value).length > 18 ? `${String(value).slice(0, 8)}...${String(value).slice(-6)}` : value;

async function boot() {
  state.data = await fetch("./data/mock-data.json").then((r) => r.json());
  document.body.insertAdjacentHTML("beforeend", `<div id="tooltip" class="tooltip"></div>`);
  initTooltipDelegation();
  initNav();
  initControls();
  render();
}

function initNav() {
  $("#nav").innerHTML = pages.map((page) => `<button class="nav-btn" data-page="${page}" data-tooltip="Open ${page}">${page}</button>`).join("");
  $("#nav").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (!button) return;
    state.page = button.dataset.page;
    render();
  });
}

function initControls() {
  $("#themeBtn").addEventListener("click", () => {
    document.body.classList.toggle("light");
    drawCharts();
  });
  $("#moreBtn").addEventListener("click", () => $("#filterPanel").classList.toggle("hidden"));
  $("#globalRange").addEventListener("change", (event) => {
    state.range = event.target.value;
    render();
  });
  $("#fromDate").addEventListener("change", applyDateRange);
  $("#toDate").addEventListener("change", applyDateRange);
  $("#searchBtn").addEventListener("click", applySearch);
  $("#searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") applySearch();
  });
  $("#typeFilter").innerHTML = `<option>All</option>${state.data.detectors.map((d) => `<option>${d.type}</option>`).join("")}`;
}

function applyDateRange() {
  if (!$("#fromDate").value || !$("#toDate").value) return;
  const days = Math.max(1, Math.round((new Date($("#toDate").value) - new Date($("#fromDate").value)) / 86400000) + 1);
  if (days <= 1) state.range = "24H";
  else if (days <= 7) state.range = "7D";
  else if (days <= 30) state.range = "30D";
  else if (days <= 90) state.range = "90D";
  else state.range = "1Y";
  render();
}

function applySearch() {
  const type = $("#searchType").value;
  const value = $("#searchInput").value.trim();
  if (type === "Address") {
    state.page = "Entity Analysis";
    loadEntityAddress(value || state.currentAddress);
  } else if (type === "Token") {
    state.page = "Market Overview";
    state.topTab = "tokens";
  } else {
    state.page = "MEV Explorer";
    const match = explorerCases().find((item) => value && (item.tx.includes(value) || String(item.block.height) === value));
    if (match) loadExplorerTx(match.tx, match.type);
  }
  render();
}

function render() {
  $("#globalRange").value = state.range;
  $$(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.page === state.page));
  const app = $("#app");
  if (state.page === "Market Overview") app.innerHTML = marketOverview();
  if (state.page === "MEV Explorer") app.innerHTML = mevExplorer();
  if (state.page === "Entity Analysis") app.innerHTML = entityAnalysis();
  if (state.page === "Simulator Lab") app.innerHTML = simulatorLab();
  bindPageEvents();
  drawCharts();
}

function scaled(value) {
  return Math.round(Number(value) * (rangeScale[state.range] || 1));
}

function scaledMoney(value) {
  return money(Number(value) * (rangeScale[state.range] || 1));
}

function pageHead(title, subtitle, tools = "") {
  return `
    <div class="page-head">
      <div><h1>${title}</h1><p>${subtitle}</p></div>
      <div class="toolbar">${tools}</div>
    </div>
  `;
}

function metrics(items) {
  return `<div class="grid cols-4">${items.map((item) => `
    <article class="card card-pad metric" data-tooltip="${item.label}: ${item.value}. ${item.delta || "Derived from selected range."}">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
      <small>${item.delta || `Range ${state.range}`}</small>
    </article>
  `).join("")}</div>`;
}

function chartCard(id, title, note = "") {
  return `
    <article class="card chart-card">
      <div class="chart-title"><h3>${title}</h3><small>${note}</small></div>
      <canvas id="${id}" height="260"></canvas>
      <div class="chart-note">Hover chart points or bars for exact values. Current range: ${state.range}.</div>
    </article>
  `;
}

function tableCard(title, columns, rows, mapper) {
  return `
    <article class="card card-pad">
      <div class="chart-title"><h3>${title}</h3><small>clickable tx / block / address / token fields</small></div>
      <div style="overflow:auto">
        <table>
          <thead><tr>${columns.map((c) => `<th data-tooltip="Sort by ${c}">${c}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${mapper(row)}</tr>`).join("")}</tbody>
        </table>
      </div>
    </article>
  `;
}

function tokenBadges(tokens) {
  return tokens.map((token) => `<span class="token-dot" data-jump="token" data-value="${token}" data-tooltip="Token ${token}. Click to open token leaderboard.">${token.slice(0, 3)}</span>`).join("");
}

function marketRows() {
  const factor = rangeScale[state.range] || 1;
  return {
    kpis: [
      { label: "Total MEV Profit", value: scaledMoney(3840000), delta: `${state.range} selected` },
      { label: "Detected Transactions", value: scaled(9428).toLocaleString(), delta: "all inspectors" },
      { label: "Builder Payments", value: `${scaled(1284).toLocaleString()} ETH`, delta: "private flow dominant" },
      { label: "Victim Loss Estimate", value: scaledMoney(812600), delta: "Sandwich + JIT" }
    ],
    performance: state.data.overview.performance.map((row, i) => {
      const hourShift = state.range === "1H" ? `${i * 10}m` : row.time;
      const out = { ...row, time: hourShift, count: scaled(row.count), volumeEth: scaled(row.volumeEth) };
      state.data.detectors.forEach((d) => out[d.type] = Math.round(row[d.type] * factor));
      return out;
    }),
    share: state.data.overview.share.map((row) => ({ ...row, profit: Math.round(row.profit * factor) })),
    dist: state.data.overview.profitDistribution.map((row) => ({ ...row, count: scaled(row.count), avgProfit: row.avgProfit * Math.sqrt(factor) })),
    latest: state.data.latest.map((row) => ({ ...row, profit: row.profit * factor, cost: row.cost * factor, revenue: row.revenue * factor }))
  };
}

function marketOverview() {
  const rows = marketRows();
  const tools = `
    <div class="segmented">
      <button data-mode="profit" class="${state.chartMode === "profit" ? "active" : ""}">By Profit</button>
      <button data-mode="volume" class="${state.chartMode === "volume" ? "active" : ""}">By Volume</button>
    </div>
  `;
  const topRows = state.data.tops[state.topTab];
  return `
    ${pageHead("Market Overview", "Range-aware MEV market overview with clickable addresses, blocks, txs, tokens, and MEV types.", tools)}
    ${metrics(rows.kpis)}
    <div class="grid cols-2">
      ${chartCard("shareChart", "Overview", "Profit share by MEV type")}
      ${chartCard("performanceChart", "Performance of MEV Types", "Stacked value + count line")}
      ${chartCard("profitDistChart", "MEV Profit Distribution", "Count and average profit by range")}
      ${tableCard("Latest MEV", ["Time", "Tx", "Block", "Token", "From", "Profit", "Cost", "Revenue", "Type"], rows.latest, latestRow)}
    </div>
    <article class="card card-pad">
      <div class="chart-title">
        <h3>Tops</h3>
        <div class="segmented">
          ${["txProfit", "pools", "tokens"].map((tab) => `<button data-top-tab="${tab}" class="${state.topTab === tab ? "active" : ""}">${tab}</button>`).join("")}
        </div>
      </div>
      ${topTable(state.topTab, topRows)}
    </article>
  `;
}

function latestRow(row) {
  return `<td data-tooltip="${row.time} in ${state.range} range">${row.time}</td>
    <td class="hash" data-jump="tx" data-value="${row.tx}" data-tooltip="Open tx ${row.tx}">${compact(row.tx)}</td>
    <td class="hash" data-jump="block" data-value="${row.block}" data-tooltip="Open block ${row.block}">${row.block}</td>
    <td>${tokenBadges(row.tokens)}</td>
    <td class="addr" data-jump="address" data-value="${row.from}" data-tooltip="Open entity ${row.from}">${compact(row.from)}</td>
    <td data-tooltip="Profit = revenue - cost">${money(row.profit)}</td>
    <td data-tooltip="Gas + builder payment + execution cost">${money(row.cost)}</td>
    <td data-tooltip="Gross revenue before cost">${money(row.revenue)}</td>
    <td><span class="tag" data-jump="mev-type" data-value="${row.type}" data-tooltip="Open ${row.type} Explorer design">${row.type}</span></td>`;
}

function topTable(tab, rows) {
  if (tab === "txProfit") return `<div style="overflow:auto"><table class="tx-profit-table"><thead><tr><th>Time</th><th>Tx</th><th>Block</th><th>Token</th><th>From</th><th>Profit</th><th>Cost</th><th>Revenue</th><th>Type</th></tr></thead><tbody>${rows.map((row) => `<tr>${latestRow(row)}</tr>`).join("")}</tbody></table></div>`;
  if (tab === "pools") return `<div style="overflow:auto"><table><thead><tr><th>Pool Address</th><th>Protocol</th><th>Token</th><th>Profit</th><th>Cost</th><th>Revenue</th><th>Count</th><th>Type</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="addr" data-jump="address" data-value="${r.pool}" data-tooltip="Open pool ${r.pool}">${compact(r.pool)}</td><td>${r.protocol}</td><td>${tokenBadges(r.tokens)}</td><td>${money(r.profit)}</td><td>${money(r.cost)}</td><td>${money(r.revenue)}</td><td>${r.count}</td><td><span class="tag" data-jump="mev-type" data-value="${r.type}">${r.type}</span></td></tr>`).join("")}</tbody></table></div>`;
  return `<div style="overflow:auto"><table><thead><tr><th>Token</th><th>Profit</th><th>Cost</th><th>Revenue</th><th>Count</th><th>Type</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${tokenBadges([r.token])}<span class="linkish" data-jump="token" data-value="${r.token}">${r.token}</span></td><td>${money(r.profit)}</td><td>${money(r.cost)}</td><td>${money(r.revenue)}</td><td>${r.count}</td><td><span class="tag" data-jump="mev-type" data-value="${r.type}">${r.type}</span></td></tr>`).join("")}</tbody></table></div>`;
}

function explorerCases() {
  return [
    {
      type: "Sandwich", tx: "0x9a11d6f86ef06d4bdb95e5815686a0f65b0f1d9a7720af5d954ad7e4ef1bb001", pair: "WETH / USDC", block: { height: 22918482, timestamp: "2026-07-20 15:42:13 UTC", count: 182, position: 41 },
      summary: "Duplicate EOA around victim swap, shared pool overlap, verified front/victim/back sequence.",
      amounts: { Revenue: "$6,754.05", Cost: "$912.44", Profit: "$5,841.61", "Victim Loss": "$13,199.45", "Builder Payment": "0.30 ETH", Gas: "0.62 ETH" },
      evidence: ["Same searcher EOA appears before and after victim", "Front-run and back-run both swap on Uniswap V2 WETH/USDC", "Victim swap overlaps pool and direction", "Profit below false-positive cap and pricing available"],
      rows: [
        row(39, "0x5121d6b987087c3b3b01e111cb261f4ac8650408244f2309217c18b0e13a2f41", "Swap", ["FrontRun"], ["WETH", "USDC"], "Uniswap V2", "0x64545160d28Fd0E309277C02D6d73b3923C4bFA", "0xMEVExecutor", 0.34, 0.18, "Sandwich"),
        row(40, "0x2c2f87d51045a4f2f5d09c67cba0101c5aac9444dfe614a55a049c8e54d14c11", "Swap", ["Victim"], ["WETH", "USDC"], "Uniswap V2", "0xVictim97", "0xRouter02", 0.09, 0, "Victim"),
        row(41, "0x9a11d6f86ef06d4bdb95e5815686a0f65b0f1d9a7720af5d954ad7e4ef1bb001", "Swap", ["BackRun", "Profit"], ["USDC", "WETH"], "Uniswap V2", "0x64545160d28Fd0E309277C02D6d73b3923C4bFA", "0xMEVExecutor", 0.28, 0.12, "Sandwich")
      ],
      flow: flow(["searcher", "executor", "victim", "pool", "builder"], [
        ["searcher", "executor", "frontrun call", "1227.54 WETH", 39],
        ["executor", "pool", "buy pressure", "WETH > 1,324,443.63 USDC", 39],
        ["victim", "pool", "victim swap", "259.11 WETH", 40],
        ["pool", "executor", "backrun", "1,324,443.63 USDC > 1232.98 WETH", 41],
        ["executor", "searcher", "profit", "2.18 ETH", 41],
        ["searcher", "builder", "builder payment", "0.30 ETH", 41]
      ])
    },
    {
      type: "AtomicArb", tx: "0x7f81a3a2dc4e771d8d02401f83f8b77a9ca916428f7864602500d76da889acf2", pair: "wstETH / WETH / USDC", block: { height: 22918472, timestamp: "2026-07-20 15:38:11 UTC", count: 146, position: 88 },
      summary: "Closed-loop swap path returns to starting token; classified as Triangle/Cross-Pair by token continuity.",
      amounts: { Revenue: "$20,746.48", Cost: "$1,320.10", Profit: "$19,426.38", "Start Token": "840.0 WETH", "End Token": "845.55 WETH", Gas: "$1,320.10" },
      evidence: ["At least two swaps in one transaction", "First token equals final token", "Intermediate route is continuous except one cross-pair jump", "Searcher has prior AtomicArb count above threshold"],
      rows: [row(88, "0x7f81a3a2dc4e771d8d02401f83f8b77a9ca916428f7864602500d76da889acf2", "Multicall Swap", ["AtomicArb", "Triangle"], ["WETH", "wstETH", "USDC"], "Curve, Uniswap V3", "0x8ce45e650ab17b6ca0dd6071f7c2b5c69b5b42b2", "0xArbContract", 0.41, 0.06, "AtomicArb")],
      flow: flow(["searcher", "executor", "poolA", "poolB", "poolC"], [
        ["searcher", "executor", "execute route", "840 WETH", 88],
        ["executor", "poolA", "WETH > wstETH", "840 WETH", 88],
        ["poolA", "poolB", "wstETH > USDC", "$2.94M", 88],
        ["poolB", "poolC", "USDC > WETH", "$2.96M", 88],
        ["poolC", "searcher", "closed-loop profit", "5.55 WETH", 88]
      ])
    },
    {
      type: "CexDexQuotes", tx: "0xaa61d8c8c9d0a7770000111122223333444455556666777788889999aaaabbbb", pair: "ETH / USDT", block: { height: 22918463, timestamp: "2026-07-20 15:33:58 UTC", count: 161, position: 63 },
      summary: "DEX execution is favorable versus Binance maker/taker mid quote after gas.",
      amounts: { "DEX Output": "1,806,420 USDT", "CEX Mid": "3,612.84 USDT/ETH", "Quote PnL": "$6,210.44", Gas: "$802.14", Profit: "$5,408.30", Exchange: "Binance" },
      evidence: ["Transaction has swap actions and is not a triangular arb", "CEX quote found for token pair", "PnL positive for known CexDexQuotes searcher", "Stable pair/outlier filters pass"],
      rows: [row(63, "0xaa61d8c8c9d0a7770000111122223333444455556666777788889999aaaabbbb", "Swap", ["CexDexQuotes"], ["ETH", "USDT"], "Uniswap V3", "0xQuoteSearcher", "0xRouter", 0.22, 0.03, "CexDexQuotes")],
      flow: flow(["searcher", "dexPool", "cex", "builder"], [
        ["searcher", "dexPool", "DEX buy", "500 ETH > USDT", 63],
        ["dexPool", "searcher", "favorable output", "1,806,420 USDT", 63],
        ["cex", "searcher", "reference quote", "mid 3612.84", 63],
        ["searcher", "builder", "private inclusion", "0.03 ETH", 63]
      ])
    },
    {
      type: "CexDexTrades", tx: "0x43fb24e893ef3e27b9f35aeef5acd240fbba8dd9e9990622c155926d22c73301", pair: "PEPE / USDT", block: { height: 22918443, timestamp: "2026-07-20 15:28:09 UTC", count: 173, position: 22 },
      summary: "VWAP and optimistic VWAP windows estimate likely CEX hedge route around block time.",
      amounts: { "Maker PnL": "$4,912.62", "Taker PnL": "$3,881.20", Gas: "$730.20", Profit: "$4,312.42", "Default Window": "-20ms/+80ms", "Final Window": "-10s/+20s" },
      evidence: ["Swap route merged to match off-chain PEPE/USDT market", "Global VWAP route profitable", "Optimistic route remains positive after gas", "Kucoin/Okex outlier guard not triggered"],
      rows: [row(22, "0x43fb24e893ef3e27b9f35aeef5acd240fbba8dd9e9990622c155926d22c73301", "Aggregator Swap", ["CexDexTrades"], ["PEPE", "USDT"], "Uniswap V2, Binance", "0xa75...8f8a2", "0xAggRouter", 0.19, 0.02, "CexDexTrades")],
      flow: flow(["searcher", "dexPool", "cex", "exchangeVWAP"], [
        ["searcher", "dexPool", "on-chain swap", "PEPE > WETH > USDT", 22],
        ["dexPool", "searcher", "DEX fill", "$814,000 notional", 22],
        ["searcher", "cex", "hedge estimate", "maker/taker route", 22],
        ["exchangeVWAP", "searcher", "VWAP markout", "$4,912.62 maker pnl", 22]
      ])
    },
    {
      type: "Jit", tx: "0x6c12300000aaabbbcccdddeeefff111222333444555666777888999000abc123", pair: "USDC / WETH", block: { height: 22918436, timestamp: "2026-07-20 15:24:44 UTC", count: 129, position: 55 },
      summary: "Mint-victim-burn sequence from same account around one concentrated-liquidity pool.",
      amounts: { "Minted Liquidity": "$1,840,000", "Victim Swap": "$1,420,000", "Fees Earned": "$18,400", Gas: "$780", "Builder Payment": "$240", Profit: "$17,380" },
      evidence: ["Frontrun contains mint action", "Backrun contains burn action", "Mint and burn token set aligns", "Victim swap uses same pool and active tick range"],
      rows: [
        row(55, "0x6c12300000aaabbbcccdddeeefff111222333444555666777888999000abc123", "Mint", ["JIT", "FrontRun"], ["USDC", "WETH"], "Uniswap V3", "0xJitMaker", "0xNFTPositionManager", 0.12, 0.01, "Jit"),
        row(56, "0x6c12400000aaabbbcccdddeeefff111222333444555666777888999000abc124", "Swap", ["Victim"], ["USDC", "WETH"], "Uniswap V3", "0xLargeTrader", "0xRouter", 0.08, 0, "Victim"),
        row(57, "0x6c12500000aaabbbcccdddeeefff111222333444555666777888999000abc125", "Burn", ["JIT", "BackRun"], ["USDC", "WETH"], "Uniswap V3", "0xJitMaker", "0xNFTPositionManager", 0.11, 0.01, "Jit")
      ],
      flow: flow(["maker", "position", "pool", "victim", "builder"], [
        ["maker", "position", "mint narrow range", "$1.84M liquidity", 55],
        ["position", "pool", "active ticks", "USDC/WETH", 55],
        ["victim", "pool", "large swap", "$1.42M", 56],
        ["pool", "position", "fees accrue", "$18.4K", 56],
        ["position", "maker", "burn collect", "$17.38K profit", 57],
        ["maker", "builder", "bid", "$240", 57]
      ])
    },
    {
      type: "Liquidation", tx: "0x53b5bca7ba8c9300e605701430640021380ef691ad384ba65084310612f2bc8c", pair: "WBTC / USDC", block: { height: 22918428, timestamp: "2026-07-20 15:20:18 UTC", count: 156, position: 101 },
      summary: "Liquidation action found; collateral seized and swapped, profit computed after gas.",
      amounts: { "Debt Repaid": "$3,920,000", "Collateral Seized": "$4,200,000", Revenue: "$14,940.98", Cost: "$2,260.94", Profit: "$12,680.04", Protocol: "Aave V3" },
      evidence: ["Transaction contains liquidation action", "Liquidation swaps collected for collateral conversion", "DEX pricing available", "Profit below maximum threshold"],
      rows: [row(101, "0x53b5bca7ba8c9300e605701430640021380ef691ad384ba65084310612f2bc8c", "LiquidationCall", ["Liquidation"], ["WBTC", "USDC"], "Aave V3, Uniswap V3", "0xdf9...6a555", "0xAavePool", 0.53, 0.07, "Liquidation")],
      flow: flow(["liquidator", "protocol", "borrower", "dexPool", "builder"], [
        ["liquidator", "protocol", "repay debt", "3.92M USDC", 101],
        ["protocol", "borrower", "close unhealthy debt", "HF < 1", 101],
        ["protocol", "liquidator", "seize collateral", "WBTC $4.2M", 101],
        ["liquidator", "dexPool", "swap collateral", "WBTC > USDC", 101],
        ["dexPool", "liquidator", "net profit", "$12,680.04", 101],
        ["liquidator", "builder", "payment", "0.07 ETH", 101]
      ])
    }
  ];
}

function row(position, hash, method, labels, tokens, lps, from, to, gasFeeEth, builderPayments, type) {
  return { position, hash, method, labels, tokens, lps: [lps], from, to, gasFeeEth, builderPayments, type };
}

function flow(nodeIds, edgeRows) {
  const labelMap = {
    searcher: "Searcher", executor: "MEV Contract", victim: "Victim", pool: "DEX Pool", builder: "Builder",
    poolA: "Pool A", poolB: "Pool B", poolC: "Pool C", dexPool: "DEX Pool", cex: "CEX", exchangeVWAP: "VWAP",
    maker: "JIT Maker", position: "LP Position", protocol: "Lending Protocol", borrower: "Borrower", liquidator: "Liquidator"
  };
  return {
    nodes: nodeIds.map((id) => ({ id, label: labelMap[id] || id, address: `${id}:sample`, roles: [labelMap[id] || id] })),
    edges: edgeRows.map(([from, to, label, amount, position], i) => ({ from, to, label, amount, position, order: position ?? i + 1, weight: 2 + (i % 5) }))
  };
}

function activeCase() {
  const tx = activeTransaction();
  const item = tx.cases.find((entry) => entry.type === state.explorerType) || tx.cases[0];
  if (state.selectedPosition == null || !item.rows.some((rowItem) => rowItem.position === state.selectedPosition)) {
    state.selectedPosition = item.block.position;
  }
  return item;
}

function activeTransaction() {
  const all = explorerCases();
  const matches = all.filter((entry) => entry.tx === state.currentTxHash);
  const cases = matches.length ? matches : [all[0]];
  if (!matches.length) state.currentTxHash = all[0].tx;
  return {
    tx: state.currentTxHash,
    cases,
    types: cases.map((entry) => entry.type),
    block: cases[0].block,
    pair: [...new Set(cases.map((entry) => entry.pair))].join(" + "),
    summary: cases.map((entry) => entry.summary).join(" ")
  };
}

function loadExplorerTx(txHash, preferredType = null) {
  const cases = explorerCases().filter((entry) => entry.tx === txHash);
  if (!cases.length) return;
  state.currentTxHash = txHash;
  state.explorerType = preferredType && cases.some((entry) => entry.type === preferredType) ? preferredType : cases[0].type;
  state.selectedPosition = null;
}

function mevExplorer() {
  const tx = activeTransaction();
  const current = activeCase();
  const rightView = state.explorerView === "Block Detail" ? blockDetailView(current) : tokenFlowView(current);
  return `
    ${pageHead("MEV Explorer", "Load a transaction by tx hash, then inspect the MEV behaviors contained in that transaction.")}
    <div class="explorer-layout">
      <aside class="side-stack">
        <article class="card card-pad">
          <h3>Transaction Description</h3>
          <p><span class="hash" data-jump="tx" data-value="${tx.tx}" data-tooltip="${tx.tx}">${compact(tx.tx)}</span></p>
          <p>${tx.block.timestamp}</p>
          <p>${tx.types.map((type) => `<span class="tag" data-tooltip="MEV contained in current transaction: ${type}">${type}</span>`).join(" ")} <span class="tag">${tx.pair}</span></p>
          <p>${tx.summary}</p>
        </article>
        ${tx.cases.map((card) => `<article class="card card-pad mev-card ${card.type === current.type ? "active" : ""}" data-case="${card.type}" data-tooltip="MEV behavior inside loaded tx: ${card.summary}"><h3>${card.type}</h3><p>${card.pair}</p><strong>${card.amounts.Profit || card.amounts["Quote PnL"]}</strong><p>${card.summary}</p></article>`).join("")}
      </aside>
      <section class="card explorer-workspace">
        <div class="workspace-head">
          <div class="workspace-title">
            <strong>${state.explorerView}</strong>
            <small>${current.type} | Block ${current.block.height} | Current Trading Position: ${state.selectedPosition}</small>
          </div>
          <div class="view-tabs">
            ${["Token Flow", "Block Detail"].map((view) => `<button data-explorer-view="${view}" class="${state.explorerView === view ? "active" : ""}">${view}</button>`).join("")}
          </div>
        </div>
        <div class="workspace-body">
          ${rightView}
        </div>
      </section>
    </div>
  `;
}

function tokenFlowView(current) {
  return `
    <div class="flow-detail-layout">
      <article class="card flow-wrap">
        <div class="flow-controls"><button id="playFlow">Play</button><button id="fitFlow">Fit</button></div>
        <svg id="flowSvg" class="flow-svg"></svg>
      </article>
      <article class="card card-pad flow-detail-card">
        <h3>Flow Detail</h3>
        <div id="flowDetail" class="detail-pane">
          <strong>${current.type}</strong><br>
          ${current.summary}<br><br>
          ${Object.entries(current.amounts).map(([k, v]) => `${k}: ${v}`).join("<br>")}
        </div>
      </article>
    </div>
  `;
}

function blockDetailView(current) {
  return `
    <div class="grid">
      <article>
        <div class="chart-title"><h3>Calculation Surface</h3><small>${current.type} inspector inputs and outputs</small></div>
        <div class="amount-grid">${Object.entries(current.amounts).map(([k, v]) => `<div class="amount-pill" data-tooltip="${k}: ${v}"><span>${k}</span><strong>${v}</strong></div>`).join("")}</div>
      </article>
      <article>
        <div class="chart-title"><h3>Inspector Evidence</h3><small>derived from script methodology</small></div>
        <ul class="evidence-list">${current.evidence.map((item) => `<li data-tooltip="${item}">${item}</li>`).join("")}</ul>
      </article>
      <article>
      <div class="chart-title"><h3>Block Detail</h3><small>Block ${current.block.height} | ${current.block.timestamp} | ${current.block.count} txs | Current Trading Position: <span id="currentPositionText">${state.selectedPosition}</span></small></div>
      <div style="overflow:auto">
        <table>
          <thead><tr><th>Position</th><th>Txn Hash</th><th>Method</th><th>Labels</th><th>Tokens</th><th>LPs</th><th>From</th><th>To</th><th>GasFee(ETH)</th><th>Builder Payments</th><th>Type</th></tr></thead>
          <tbody>${current.rows.map((r) => `<tr class="${r.position === state.selectedPosition ? "selected-row" : ""}" data-position="${r.position}" data-tooltip="Select position ${r.position}"><td>${r.position}</td><td class="hash" data-jump="tx" data-value="${r.hash}" data-tooltip="${r.hash}">${compact(r.hash)}</td><td>${r.method}</td><td>${r.labels.map((l) => `<span class="tag" data-tooltip="${l}">${l}</span>`).join(" ")}</td><td>${tokenBadges(r.tokens)}</td><td>${r.lps.join(", ")}</td><td class="addr" data-jump="address" data-value="${r.from}" data-tooltip="${r.from}">${compact(r.from)}</td><td class="addr" data-jump="address" data-value="${r.to}" data-tooltip="${r.to}">${compact(r.to)}</td><td>${r.gasFeeEth}</td><td>${r.builderPayments}</td><td><span class="tag" data-jump="mev-type" data-value="${r.type}" data-tooltip="${current.summary}">${r.type}</span></td></tr>`).join("")}</tbody>
        </table>
      </div>
      </article>
    </div>
  `;
}

function entityAnalysis() {
  const profile = activeEntityProfile();
  const role = state.data.entities.roles[state.entityRole] || state.data.entities.roles[profile.roles[0]];
  const portfolio = state.data.entities.portfolio;
  const liquidator = state.data.entities.liquidator;
  const kpis = state.entityRole === "Liquidator" ? liquidator.kpis : state.entityRole === "Contract Portfolio" ? portfolio.kpis : role.kpis.map((label, i) => ({ label, value: ["$842.1K", "71.4%", "38", "12.6 ETH"][i] || "Ready", delta: state.range }));
  return `
    ${pageHead("Entity Analysis", "Load an address from search or clickable address fields, then inspect roles inferred for that address.")}
    ${metrics(kpis)}
    <div class="entity-layout">
      <article class="card card-pad">
        <h3>Address Profile</h3>
        <p class="addr" data-tooltip="Current loaded address">${profile.address}</p>
        <p><span class="tag">${profile.label}</span> <span class="tag">Risk ${profile.risk}</span></p>
        <p>${profile.roles.map((roleName) => `<span class="tag ${roleName === state.entityRole ? "active" : ""}" data-entity-role="${roleName}" data-tooltip="Inspect ${roleName} view for this address">${roleName}</span>`).join(" ")}</p>
        <p>${profile.summary}</p>
        <div class="amount-grid">${Object.entries(profile.stats).map(([k, v]) => `<div class="amount-pill"><span>${k}</span><strong>${v}</strong></div>`).join("")}</div>
      </article>
      <div class="grid cols-2">
        ${chartCard("entityMainChart", `${state.entityRole} View`, `current address: ${compact(profile.address)}`)}
        ${chartCard("entityDistChart", "Profit Distribution", "PDF-style profit bins")}
        ${chartCard("entityTokenChart", state.entityRole === "Liquidator" ? "Liquidator Behaviors" : "Top 10 Favourite Tokens", "dual-axis behavior chart")}
        ${tableCard("Builder / Relay Acceptance", ["Name", "Accepted", "Percentage"], portfolio.builders, (r) => `<td data-tooltip="${r.name}">${r.name}</td><td>${scaled(r.accepted)}</td><td>${r.percentage}%</td>`)}
      </div>
    </div>
  `;
}

function simulatorLab() {
  const templates = state.data.simulator.templates;
  return `
    ${pageHead("Simulator Lab", "Template calculator reacts immediately and can jump imported tx/block samples into Explorer.")}
    <div class="sim-layout">
      <article class="card card-pad">
        <h3>Calculator</h3>
        <div class="formula">
          <label>Template <select id="simTemplate">${templates.map((t) => `<option>${t.name}</option>`).join("")}</select></label>
          <label>Victim / Leg USD <input id="simBase" type="number" /></label>
          <label>Gas USD <input id="simGas" type="number" /></label>
          <label>Builder Payment USD <input id="simBuilder" type="number" /></label>
          <label>Slippage bps <input id="simBps" type="number" /></label>
          <label>Import Tx or Block <input id="simImport" placeholder="0x... or 22918482" /></label>
        </div>
        <p><button id="runSim" class="primary">Run Simulation</button> <button id="importSim">Open Import</button></p>
        <div id="simResult" class="detail-pane"></div>
      </article>
      <div class="grid">
        ${chartCard("simChart", "Scenario Sensitivity", "profit after gas and builder payments")}
        ${tableCard("Preset Templates", ["Template", "Default Inputs"], templates, (r) => `<td><span class="tag" data-jump="mev-type" data-value="${r.name}">${r.name}</span></td><td data-tooltip="${Object.entries(r.inputs).map(([k, v]) => `${k}: ${v}`).join(" | ")}">${Object.entries(r.inputs).map(([k, v]) => `${k}: ${v}`).join(" | ")}</td>`)}
      </div>
    </div>
  `;
}

function bindPageEvents() {
  $$("[data-mode]").forEach((btn) => btn.addEventListener("click", () => { state.chartMode = btn.dataset.mode; render(); }));
  $$("[data-top-tab]").forEach((btn) => btn.addEventListener("click", () => { state.topTab = btn.dataset.topTab; render(); }));
  $$("[data-explorer-view]").forEach((btn) => btn.addEventListener("click", () => { state.explorerView = btn.dataset.explorerView; render(); }));
  $$("tr[data-position]").forEach((row) => row.addEventListener("click", (event) => {
    if (event.target.closest("[data-jump]")) return;
    state.selectedPosition = Number(row.dataset.position);
    render();
  }));
  $$("[data-jump]").forEach((el) => el.addEventListener("click", () => jumpTo(el.dataset.jump, el.dataset.value)));
  $$("[data-case]").forEach((el) => el.addEventListener("click", () => { state.explorerType = el.dataset.case; state.selectedPosition = null; render(); }));
  $$("[data-entity-role]").forEach((el) => el.addEventListener("click", () => { state.entityRole = el.dataset.entityRole; render(); }));
  $("#playFlow")?.addEventListener("click", playFlow);
  $("#fitFlow")?.addEventListener("click", () => drawFlow());
  $("#simTemplate")?.addEventListener("change", loadSimTemplate);
  $("#runSim")?.addEventListener("click", runSimulation);
  $("#importSim")?.addEventListener("click", () => {
    const value = $("#simImport").value.trim();
    state.page = "MEV Explorer";
    const match = explorerCases().find((c) => c.tx === value || String(c.block.height) === value) || explorerCases().find((c) => c.type === $("#simTemplate").value);
    if (match) loadExplorerTx(match.tx, match.type);
    render();
  });
  attachTooltips();
  attachCanvasTooltips();
  if ($("#simTemplate")) loadSimTemplate();
}

function jumpTo(kind, value) {
  if (kind === "address") {
    state.page = "Entity Analysis";
    loadEntityAddress(value || state.currentAddress);
  }
  if (kind === "token") {
    state.page = "Market Overview";
    state.topTab = "tokens";
  }
  if (kind === "tx" || kind === "block" || kind === "mev-type") {
    state.page = "MEV Explorer";
    const match = explorerCases().find((c) => c.tx === value || String(c.block.height) === String(value) || c.type === value);
    if (match) loadExplorerTx(match.tx, match.type);
  }
  render();
}

function loadEntityAddress(address) {
  const profile = entityProfiles(address);
  state.currentAddress = profile.address;
  state.entityRole = profile.roles[0];
}

function activeEntityProfile() {
  const profile = entityProfiles(state.currentAddress);
  if (!profile.roles.includes(state.entityRole)) state.entityRole = profile.roles[0];
  return profile;
}

function entityProfiles(address) {
  const normalized = address || state.data.entities.portfolio.address;
  const known = {
    "0x64545160d28Fd0E309277C02D6d73b3923C4bFA": {
      address: "0x64545160d28Fd0E309277C02D6d73b3923C4bFA",
      label: "Arkham: MEV Searcher Contract Portfolio",
      roles: ["Contract Portfolio", "Searcher", "Relayer"],
      risk: "High",
      summary: "Address is loaded by address search. It shows searcher behavior, contract portfolio performance, and relay/builder acceptance for the same address.",
      stats: { Transactions: "1,025", Profit: "$117,345.41", Cost: "$590,238.16", "Private Flow": "64%" }
    },
    "0xVictim97": {
      address: "0xVictim97",
      label: "Trader / Victim",
      roles: ["Trader"],
      risk: "Impacted",
      summary: "Trader address involved as victim in the loaded sandwich transaction.",
      stats: { Transactions: "18", "Estimated Loss": "$13,199.45", "Protected Flow": "12%", Counterparties: "7" }
    },
    "0xdf9...6a555": {
      address: "0xdf9...6a555",
      label: "Liquidator",
      roles: ["Liquidator", "Searcher"],
      risk: "Medium",
      summary: "Address is active in liquidation opportunities and searcher-like private order flow.",
      stats: { "Tx Count": "267", "Liquidation Amount": "$45.84B", Profit: "$94,600.30", Borrowers: "217" }
    },
    "builder:titan": {
      address: "builder:titan",
      label: "Builder / Relay Counterparty",
      roles: ["Relayer", "Validator"],
      risk: "Infrastructure",
      summary: "Infrastructure entity used for builder acceptance, relay coverage, and validator payout analysis.",
      stats: { Payloads: "1,204", "Median Bid": "0.18 ETH", Validators: "338", Builders: "42" }
    }
  };
  if (known[normalized]) return known[normalized];
  const inferredRole = normalized.toLowerCase().includes("validator") ? "Validator" : normalized.toLowerCase().includes("relay") ? "Relayer" : "Searcher";
  return {
    address: normalized,
    label: "Inferred Address",
    roles: [inferredRole],
    risk: "Unknown",
    summary: "No local profile was found, so the page renders an inferred role view for the searched address using mock data.",
    stats: { Transactions: "42", Profit: "$8,420", Cost: "$1,260", "First Seen": "mock" }
  };
}

function drawCharts() {
  if ($("#shareChart")) drawPie("shareChart", marketRows().share, "profit");
  if ($("#performanceChart")) drawPerformance("performanceChart", marketRows().performance);
  if ($("#profitDistChart")) drawProfitDistribution("profitDistChart", marketRows().dist);
  if ($("#entityMainChart")) drawPerformance("entityMainChart", marketRows().performance, true);
  if ($("#entityDistChart")) drawProfitDistribution("entityDistChart", marketRows().dist);
  if ($("#entityTokenChart")) drawBarsLine("entityTokenChart", state.data.entities.portfolio.favoriteTokens.map((r) => ({ ...r, WETH: scaled(r.WETH), count: scaled(r.count) })), "WETH", "count");
  if ($("#simChart")) drawSimChart();
  if ($("#flowSvg")) drawFlow();
}

function canvas(id) {
  const c = document.getElementById(id);
  const rect = c.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  c.width = Math.max(320, rect.width * ratio);
  c.height = Math.max(220, rect.height * ratio);
  const ctx = c.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  state.hoverPoints[id] = [];
  return { c, ctx, w: rect.width, h: rect.height };
}

function drawAxes(ctx, w, h, maxValue = 1, formatter = shortValue) {
  ctx.strokeStyle = getCss("--line");
  ctx.lineWidth = 1;
  ctx.fillStyle = getCss("--muted");
  ctx.font = "11px Inter, sans-serif";
  ctx.beginPath();
  ctx.moveTo(44, 16);
  ctx.lineTo(44, h - 34);
  ctx.lineTo(w - 10, h - 34);
  ctx.stroke();
  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const value = (maxValue / ticks) * i;
    const y = h - 34 - (i / ticks) * (h - 70);
    ctx.strokeStyle = i === 0 ? getCss("--line") : colorMixLine();
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(w - 10, y);
    ctx.stroke();
    ctx.fillStyle = getCss("--muted");
    ctx.textAlign = "right";
    ctx.fillText(formatter(value), 38, y + 4);
  }
  ctx.textAlign = "left";
}

function addPoint(id, x, y, text) {
  state.hoverPoints[id].push({ x, y, r: 9, text });
}

function drawPie(id, rows, key) {
  const { ctx, w, h } = canvas(id);
  const total = rows.reduce((sum, row) => sum + row[key], 0);
  let start = -Math.PI / 2;
  const cx = w * 0.34, cy = h * 0.5, radius = Math.min(w, h) * 0.3;
  rows.forEach((row, i) => {
    const arc = (row[key] / total) * Math.PI * 2;
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + arc);
    ctx.fill();
    const mid = start + arc / 2;
    addPoint(id, cx + Math.cos(mid) * radius * 0.65, cy + Math.sin(mid) * radius * 0.65, `${row.type}: ${money(row[key])}`);
    ctx.fillStyle = getCss("--text");
    ctx.fillText(`${Math.round(row[key] / total * 100)}%`, cx + Math.cos(mid) * radius * 0.72, cy + Math.sin(mid) * radius * 0.72);
    start += arc;
    ctx.fillStyle = getCss("--text");
    ctx.fillText(`${row.type} ${Math.round(row[key] / total * 100)}%`, w * 0.62, 34 + i * 24);
  });
}

function drawPerformance(id, rows, entity = false) {
  const { ctx, w, h } = canvas(id);
  const types = state.data.detectors.map((d) => d.type);
  const max = Math.max(...rows.map((r) => state.chartMode === "volume" ? r.volumeEth : types.reduce((s, t) => s + r[t], 0)));
  drawAxes(ctx, w, h, max, (value) => state.chartMode === "volume" ? `${shortValue(value)}E` : shortValue(value));
  const step = (w - 74) / rows.length;
  const barW = step * 0.62;
  rows.forEach((row, i) => {
    const x = 58 + i * step;
    let y = h - 34;
    types.forEach((type, ci) => {
      const value = state.chartMode === "volume" ? row.volumeEth / types.length : row[type];
      const bh = (value / max) * (h - 70);
      ctx.fillStyle = colors[ci % colors.length];
      ctx.fillRect(x, y - bh, barW, bh);
      if (bh > 18) {
        ctx.fillStyle = "#061713";
        ctx.fillText(shortValue(value, state.chartMode === "volume" ? " ETH" : ""), x + 4, y - bh + 14);
      }
      addPoint(id, x + barW / 2, y - bh / 2, `${row.time} ${type}: ${state.chartMode === "volume" ? `${Math.round(value)} ETH` : money(value)}`);
      y -= bh;
    });
    ctx.fillStyle = getCss("--muted");
    ctx.fillText(entity ? row.time.replace(":00", "") : row.time, x, h - 12);
  });
  ctx.strokeStyle = getCss("--accent-2");
  ctx.beginPath();
  const linePoints = rows.map((row, i) => {
    const x = 58 + i * step + barW / 2;
    const y = h - 34 - (row.count / Math.max(...rows.map((r) => r.count))) * (h - 70);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    return { x, y, row, label: row.bin || row.date || i + 1 };
  });
  ctx.stroke();
  linePoints.forEach(({ x, y, row, label }) => {
    ctx.fillStyle = getCss("--accent-2");
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(shortValue(row.count), x + 6, y - 6);
    addPoint(id, x, y, `${row.time} Count: ${row.count.toLocaleString()}`);
  });
}

function drawBarsLine(id, rows, barKey, lineKey) {
  const { ctx, w, h } = canvas(id);
  const maxBar = Math.max(1, ...rows.map((r) => Math.abs(r[barKey] || 0)));
  const maxLine = Math.max(1, ...rows.map((r) => Math.abs(r[lineKey] || 0)));
  drawAxes(ctx, w, h, maxBar, shortValue);
  const step = (w - 74) / rows.length;
  rows.forEach((row, i) => {
    const x = 56 + i * step;
    const bh = Math.abs(row[barKey] || 0) / maxBar * (h - 76);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, h - 34 - bh, step * 0.54, bh);
    ctx.fillStyle = getCss("--text");
    ctx.fillText(shortValue(row[barKey]), x, Math.max(22, h - 40 - bh));
    addPoint(id, x + step * 0.27, h - 34 - bh / 2, `${row.bin || row.date || i + 1}: ${barKey} ${Number(row[barKey]).toLocaleString()}`);
    ctx.fillStyle = getCss("--muted");
    ctx.fillText(row.bin || row.date || i + 1, x, h - 12);
  });
  ctx.strokeStyle = getCss("--accent-2");
  ctx.beginPath();
  const linePoints = rows.map((row, i) => {
    const x = 56 + i * step + step * 0.27;
    const y = h - 34 - (Math.abs(row[lineKey] || 0) / maxLine) * (h - 76);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    return { x, y, row, label: row.bin || row.date || i + 1 };
  });
  ctx.stroke();
  linePoints.forEach(({ x, y, row, label }) => {
    ctx.fillStyle = getCss("--accent-2");
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(shortValue(row[lineKey]), x + 6, y - 6);
    addPoint(id, x, y, `${label}: ${lineKey} ${Number(row[lineKey]).toLocaleString()}`);
  });
}

function drawProfitDistribution(id, rows) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.count || 0), 0) || 1;
  const pdfRows = rows.map((row) => ({
    ...row,
    pdf: Math.max(0, row.count || 0) / total
  }));
  const { ctx, w, h } = canvas(id);
  drawAxes(ctx, w, h, 1, (value) => value.toFixed(value === 0 || value === 1 ? 0 : 2));
  const step = (w - 74) / pdfRows.length;
  pdfRows.forEach((row, i) => {
    const x = 56 + i * step;
    const bh = row.pdf * (h - 76);
    ctx.fillStyle = "#18a8e6";
    ctx.fillRect(x, h - 34 - bh, step * 0.9, bh);
    ctx.fillStyle = getCss("--muted");
    ctx.fillText(row.bin, x, h - 12);
    ctx.fillStyle = getCss("--text");
    ctx.fillText(row.pdf.toFixed(2), x + 2, Math.max(22, h - 40 - bh));
    addPoint(id, x + step * 0.45, h - 34 - bh / 2, `${row.bin}: PDF ${row.pdf.toFixed(4)} | Count ${row.count.toLocaleString()} | Avg ${money(row.avgProfit)}`);
  });
  ctx.fillStyle = getCss("--muted");
  ctx.save();
  ctx.translate(14, h / 2 + 70);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("PDF of Transaction Profit", 0, 0);
  ctx.restore();
}

function drawFlow(highlightIndex = -1) {
  const svg = $("#flowSvg");
  if (!svg) return;
  const data = activeCase().flow;
  const width = svg.clientWidth || 900;
  const height = svg.clientHeight || 520;
  const ids = data.nodes.map((n) => n.id);
  const pos = {};
  ids.forEach((id, i) => {
    const angle = -Math.PI / 2 + (i / ids.length) * Math.PI * 2;
    pos[id] = [width * 0.5 + Math.cos(angle) * width * 0.32, height * 0.5 + Math.sin(angle) * height * 0.28];
  });
  const r = Math.max(26, Math.min(36, width / 28));
  svg.innerHTML = `
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${getCss("--accent")}"/></marker></defs>
    ${data.edges.map((edge, i) => {
      const [sx, sy] = pos[edge.from];
      const [tx, ty] = pos[edge.to];
      const dx = tx - sx, dy = ty - sy;
      const len = Math.max(1, Math.hypot(dx, dy));
      const x1 = sx + dx / len * r;
      const y1 = sy + dy / len * r;
      const x2 = tx - dx / len * (r + 5);
      const y2 = ty - dy / len * (r + 5);
      const active = i <= highlightIndex || edge.position === state.selectedPosition;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const labelX = midX - 20;
      const labelY = midY - 8;
      const orderWidth = Math.max(18, String(edge.position).length * 8 + 8);
      return `<g class="flow-edge" data-position="${edge.position}" data-tooltip="Position ${edge.position}: ${edge.label} | ${edge.amount}" data-detail="Position ${edge.position} | ${edge.label} | ${edge.amount}">
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${active ? colors[i % colors.length] : getCss("--line")}" stroke-width="${active ? edge.weight + 2 : edge.weight}" marker-end="url(#arrow)" opacity="0.9"/>
        <g class="flow-order-label">
          <rect x="${labelX}" y="${labelY - 12}" width="${orderWidth}" height="16" rx="2"></rect>
          <text x="${labelX + orderWidth / 2}" y="${labelY}" text-anchor="middle">${edge.position}</text>
        </g>
        <text x="${labelX + orderWidth + 6}" y="${labelY}" fill="${active ? getCss("--accent") : getCss("--muted")}" font-size="12">${edge.amount}</text>
      </g>`;
    }).join("")}
    ${data.nodes.map((node, i) => {
      const [x, y] = pos[node.id];
      return `<g class="flow-node" data-tooltip="${node.label} | ${node.address} | ${node.roles.join(", ")}" data-detail="${node.label} | ${node.address} | ${node.roles.join(", ")}"><circle cx="${x}" cy="${y}" r="${r}" fill="${colors[i % colors.length]}" opacity="0.92"/><text x="${x}" y="${y + 4}" text-anchor="middle" fill="#051814" font-size="12" font-weight="800">${node.label}</text><text x="${x}" y="${y + r + 18}" text-anchor="middle" fill="${getCss("--muted")}" font-size="12">${node.address}</text></g>`;
    }).join("")}
  `;
  svg.querySelectorAll("[data-detail]").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.dataset.position) state.selectedPosition = Number(el.dataset.position);
      $("#flowDetail").textContent = el.dataset.detail;
      render();
    });
    el.addEventListener("mousemove", showTooltip);
    el.addEventListener("mouseleave", hideTooltip);
  });
}

function playFlow() {
  let i = 0;
  const total = activeCase().flow.edges.length;
  const timer = setInterval(() => {
    drawFlow(i);
    i += 1;
    if (i >= total) clearInterval(timer);
  }, 650);
}

function loadSimTemplate() {
  const template = state.data.simulator.templates.find((t) => t.name === $("#simTemplate").value);
  const inputs = template.inputs;
  $("#simBase").value = inputs.victimSwapUsd || inputs.legTwoUsd || inputs.collateralUsd || 0;
  $("#simGas").value = inputs.gasUsd || 0;
  $("#simBuilder").value = inputs.builderPaymentUsd || 0;
  $("#simBps").value = inputs.slippageBps || 0;
  runSimulation();
}

function runSimulation() {
  const base = Number($("#simBase").value || 0);
  const gas = Number($("#simGas").value || 0);
  const builder = Number($("#simBuilder").value || 0);
  const bps = Number($("#simBps").value || 0);
  const gross = base * (bps / 10000);
  const profit = gross - gas - builder;
  $("#simResult").innerHTML = `<strong>${money(profit)}</strong><br>Gross extraction ${money(gross)} - Gas ${money(gas)} - Builder payment ${money(builder)}.`;
  drawSimChart();
}

function drawSimChart() {
  const c = $("#simChart");
  if (!c) return;
  const base = Number($("#simBase")?.value || 271224);
  const gas = Number($("#simGas")?.value || 900);
  const builder = Number($("#simBuilder")?.value || 540);
  const rows = [5, 10, 20, 40, 80, 120].map((bps) => ({ bin: `${bps}bps`, count: base * bps / 10000 - gas - builder, avgProfit: bps }));
  drawBarsLine("simChart", rows, "count", "avgProfit");
  attachCanvasTooltips();
}

function attachTooltips() {
  // Tooltips are handled by document-level delegation so newly rendered UI works immediately.
}

function attachCanvasTooltips() {
  $$("canvas").forEach((canvasEl) => {
    canvasEl.onmousemove = (event) => {
      const rect = canvasEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const points = state.hoverPoints[canvasEl.id] || [];
      const point = points.find((p) => Math.hypot(p.x - x, p.y - y) <= p.r);
      if (!point) return hideTooltip();
      showTooltipText(point.text, event.clientX, event.clientY);
    };
    canvasEl.onmouseleave = hideTooltip;
  });
}

function initTooltipDelegation() {
  document.addEventListener("mousemove", (event) => {
    if (event.target.closest("canvas")) return;
    const target = event.target.closest("[data-tooltip]");
    if (!target) return hideTooltip();
    showTooltipText(target.dataset.tooltip, event.clientX, event.clientY);
  });
  document.addEventListener("mouseleave", hideTooltip);
  document.addEventListener("scroll", hideTooltip, true);
}

function showTooltip(event) {
  const target = event.currentTarget || event.target.closest("[data-tooltip]");
  showTooltipText(target?.dataset?.tooltip, event.clientX, event.clientY);
}

function showTooltipText(text, clientX, clientY) {
  const tip = $("#tooltip");
  if (!tip || !text) return;
  tip.textContent = text;
  tip.classList.add("visible");
  const pad = 14;
  const x = Math.min(clientX + pad, window.innerWidth - tip.offsetWidth - pad);
  const y = Math.min(clientY + pad, window.innerHeight - tip.offsetHeight - pad);
  tip.style.left = `${Math.max(pad, x)}px`;
  tip.style.top = `${Math.max(pad, y)}px`;
}

function hideTooltip() {
  const tip = $("#tooltip");
  if (!tip) return;
  tip.classList.remove("visible");
  tip.style.left = "-9999px";
  tip.style.top = "-9999px";
}

function getCss(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function colorMixLine() {
  return document.body.classList.contains("light") ? "rgba(96, 117, 111, 0.18)" : "rgba(147, 170, 165, 0.16)";
}

function shortValue(value, suffix = "") {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M${suffix}`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K${suffix}`;
  return `${Math.round(n)}${suffix}`;
}

boot().catch((error) => {
  $("#app").innerHTML = `<article class="card card-pad"><h1>Failed to load app</h1><p>${error.message}</p></article>`;
});
