const state = { period: "1h", gateway: "all", metric: "temperature", data: null, request: null };
const $ = (id) => document.getElementById(id);
const format = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const integer = new Intl.NumberFormat("pt-BR");
const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const timeOnly = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const today = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
const metricLabels = { temperature: "°C", humidity: "%", solarRadiation: "W/m²" };
const colors = { G1: "#2caf80", G2: "#6388d9" };

function setText(id, value) { $(id).textContent = value; }
function formatted(value) { return typeof value === "number" && Number.isFinite(value) ? format.format(value) : "—"; }
function readableDate(iso) { return iso ? dateTime.format(new Date(iso)) : "Sem leitura"; }

function setStatus(kind, text) {
  $("connectionDot").className = `live-dot ${kind}`;
  setText("connectionText", text);
}

function renderSummary(data) {
  const activeCount = data.sensors.filter((sensor) => sensor.status === "online" &&
    (data.gateway === "all" || sensor.gateway === data.gateway)).length;
  const context = activeCount ? `Média de ${activeCount} sensor${activeCount > 1 ? "es" : ""} online` : "Sem leitura recente";
  setText("tempValue", formatted(data.current?.temperature));
  setText("humidityValue", formatted(data.current?.humidity));
  setText("solarValue", formatted(data.current?.solarRadiation));
  ["tempContext", "humidityContext", "solarContext"].forEach((id) => setText(id, context));
  setText("sampleValue", integer.format(data.sampleCount));
  setText("sampleContext", `No período selecionado · ${data.gateway === "all" ? "todos" : data.gateway}`);
  setText("updatedAt", `Atualizado às ${timeOnly.format(new Date(data.generatedAt))}`);
  setText("chartRange", { "1h": "Última hora", "24h": "Últimas 24 horas", "7d": "Últimos 7 dias" }[data.window]);
}

function sensorCard(sensor) {
  const card = document.createElement("article");
  card.className = "sensor-card";
  const head = document.createElement("div"); head.className = "sensor-card-head";
  const name = document.createElement("div"); name.className = "sensor-card-name";
  const icon = document.createElement("span"); icon.className = "sensor-device-icon";
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6m-6 4h6m-5 5h4"/></svg>';
  const title = document.createElement("span");
  const strong = document.createElement("strong"); strong.textContent = `Sensor ${sensor.id}`;
  const small = document.createElement("small"); small.textContent = `Via gateway ${sensor.gateway}`;
  title.append(strong, small); name.append(icon, title);
  const badge = document.createElement("span"); badge.className = `status-pill ${sensor.status}`;
  badge.textContent = sensor.status === "online" ? "Online" : "Offline";
  head.append(name, badge);
  const values = document.createElement("div"); values.className = "sensor-card-values";
  const entries = [
    ["Temperatura", formatted(sensor.reading?.temperature), "°C"],
    ["Umidade", formatted(sensor.reading?.humidity), "%"],
    ["Radiação", formatted(sensor.reading?.solarRadiation), "W/m²"],
  ];
  for (const [label, value, unit] of entries) {
    const item = document.createElement("span");
    item.textContent = `${value} ${value === "—" ? "" : unit}`;
    const caption = document.createElement("small"); caption.textContent = label;
    item.append(caption); values.append(item);
  }
  const last = document.createElement("div"); last.className = "sensor-last";
  last.textContent = `Última leitura: ${readableDate(sensor.reading?.timestamp)}`;
  card.append(head, values, last);
  return card;
}

function renderSensors(data) {
  const sidebar = $("sideSensors"); const cards = $("sensorCards");
  sidebar.replaceChildren(); cards.replaceChildren();
  const online = data.sensors.filter((s) => s.status === "online").length;
  const visible = data.sensors.filter((s) => data.gateway === "all" || s.gateway === data.gateway);
  setText("sideSensorCount", `${online}/${data.sensors.length}`);
  setText("onlineCount", `${visible.filter((s) => s.status === "online").length} online`);
  for (const sensor of data.sensors) {
    const item = document.createElement("div"); item.className = "side-sensor";
    const label = document.createElement("span"); label.className = "sensor-short";
    const dot = document.createElement("span"); dot.className = `status-dot ${sensor.status}`;
    label.append(dot, document.createTextNode(`Sensor ${sensor.id}`));
    const status = document.createElement("small"); status.textContent = sensor.status === "online" ? "Online" : "Offline";
    item.append(label, status); sidebar.append(item);
    if (data.gateway === "all" || sensor.gateway === data.gateway) cards.append(sensorCard(sensor));
  }
}

function renderReadings(data) {
  const body = $("readingsBody"); body.replaceChildren();
  if (!data.readings.length) {
    const row = document.createElement("tr"); const cell = document.createElement("td");
    cell.colSpan = 6; cell.className = "table-empty";
    cell.textContent = "Nenhuma leitura registrada neste período.";
    row.append(cell); body.append(row); return;
  }
  for (const reading of data.readings) {
    const row = document.createElement("tr");
    const sensor = document.createElement("td");
    const label = document.createElement("span"); label.className = "table-sensor";
    const dot = document.createElement("span"); dot.className = "status-dot";
    label.append(dot, document.createTextNode(`Sensor ${reading.sensorNode}`)); sensor.append(label);
    row.append(sensor);
    for (const value of [reading.gateway, readableDate(reading.timestamp), `${formatted(reading.temperature)} °C`, `${formatted(reading.humidity)} %`, `${formatted(reading.solarRadiation)} W/m²`]) {
      const cell = document.createElement("td"); cell.className = "number-cell"; cell.textContent = value; row.append(cell);
    }
    body.append(row);
  }
}

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

function renderChart(data) {
  const container = $("chartContent"), legend = $("chartLegend"), axis = $("chartAxis");
  container.replaceChildren(); legend.replaceChildren(); axis.replaceChildren();
  const series = data.series.filter((item) => item.points.length);
  if (!series.length) {
    axis.hidden = true;
    const empty = document.createElement("div"); empty.className = "chart-empty";
    const glyph = document.createElement("span"); glyph.className = "empty-glyph"; glyph.setAttribute("aria-hidden", "true"); glyph.textContent = "⌁";
    const title = document.createElement("strong"); title.textContent = "Aguardando dados para o gráfico";
    const detail = document.createElement("span"); detail.textContent = "As médias aparecem após a primeira janela de 10 segundos.";
    empty.append(glyph, title, detail); container.append(empty); return;
  }
  const metric = state.metric;
  const points = series.flatMap((entry) => entry.points);
  const values = points.map((point) => point[metric]);
  const minValue = Math.min(...values), maxValue = Math.max(...values);
  const spread = Math.max(maxValue - minValue, metric === "temperature" ? 4 : metric === "humidity" ? 10 : 100);
  const low = Math.max(0, minValue - spread * .25), high = maxValue + spread * .25;
  const minTime = Math.min(...points.map((point) => Date.parse(point.time)));
  const maxTime = Math.max(Date.now(), ...points.map((point) => Date.parse(point.time)));
  const start = Math.min(minTime, maxTime - 300000);
  const width = 900, height = 240, left = 48, right = 14, top = 16, bottom = 12;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const x = (time) => left + ((Date.parse(time) - start) / (maxTime - start)) * chartWidth;
  const y = (value) => top + (1 - (value - low) / (high - low)) * chartHeight;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", role: "img", "aria-label": `Histórico de ${metric === "temperature" ? "temperatura" : metric === "humidity" ? "umidade" : "radiação solar"} por gateway` });
  for (let i = 0; i < 4; i++) {
    const yy = top + i * chartHeight / 3;
    svg.append(svgElement("line", { x1: left, x2: width - right, y1: yy, y2: yy, stroke: "#e9eff1", "stroke-dasharray": "4 5" }));
    const label = svgElement("text", { x: 2, y: yy + 4, fill: "#9baab3", "font-size": 11 });
    label.textContent = `${Math.round(high - i * (high - low) / 3)}`;
    svg.append(label);
  }
  for (const entry of series) {
    const color = colors[entry.gateway] ?? "#659a92";
    const coordinates = entry.points.map((point) => [x(point.time), y(point[metric]), point]);
    if (coordinates.length > 1) {
      const path = svgElement("path", { d: coordinates.map(([px, py], index) => `${index ? "L" : "M"}${px.toFixed(2)} ${py.toFixed(2)}`).join(" "), fill: "none", stroke: color, "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" });
      svg.append(path);
    }
    if (coordinates.length <= 25) {
      for (const [px, py, point] of coordinates) {
        const circle = svgElement("circle", { cx: px, cy: py, r: 4, fill: "white", stroke: color, "stroke-width": 2.5, "vector-effect": "non-scaling-stroke" });
        const title = svgElement("title"); title.textContent = `${entry.gateway} · ${readableDate(point.time)} · ${formatted(point[metric])} ${metricLabels[metric]}`;
        circle.append(title); svg.append(circle);
      }
    }
    const legendItem = document.createElement("span"); legendItem.className = "chart-legend-item";
    const swatch = document.createElement("span"); swatch.className = "legend-swatch"; swatch.style.backgroundColor = color;
    legendItem.append(swatch, document.createTextNode(entry.gateway)); legend.append(legendItem);
  }
  container.append(svg);
  axis.hidden = false;
  for (let i = 0; i < 5; i++) {
    const tick = document.createElement("span");
    const time = start + (maxTime - start) * i / 4;
    tick.textContent = data.window === "7d" ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(time) :
      new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(time);
    axis.append(tick);
  }
}

async function load() {
  if (state.request) state.request.abort();
  const controller = new AbortController(); state.request = controller;
  try {
    const query = new URLSearchParams({ window: state.period, gateway: state.gateway });
    const response = await fetch(`/api/dashboard?${query}`, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (controller !== state.request) return;
    state.data = data;
    renderSummary(data); renderSensors(data); renderReadings(data); renderChart(data);
    $("errorBanner").hidden = true;
    setStatus("online", "Dados atualizados");
  } catch (error) {
    if (error.name === "AbortError") return;
    $("errorBanner").hidden = false;
    setStatus("error", "Conexão indisponível");
  } finally {
    if (controller === state.request) state.request = null;
  }
}

document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => {
  state.period = button.dataset.period;
  document.querySelectorAll("[data-period]").forEach((item) => {
    item.classList.toggle("selected", item === button); item.setAttribute("aria-pressed", String(item === button));
  });
  load();
}));
document.querySelectorAll("[data-metric]").forEach((button) => button.addEventListener("click", () => {
  state.metric = button.dataset.metric;
  document.querySelectorAll("[data-metric]").forEach((item) => {
    item.classList.toggle("active", item === button); item.setAttribute("aria-pressed", String(item === button));
  });
  if (state.data) renderChart(state.data);
}));
$("gatewaySelect").addEventListener("change", (event) => { state.gateway = event.target.value; load(); });
$("refreshButton").addEventListener("click", load);
setText("todayLabel", today.format(new Date()));
load();
setInterval(load, 5000);
