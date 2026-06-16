const NARA_CENTER = [135.8048, 34.6851];
const STORAGE_KEY = "gisphn-tracker-state-v4";
const QUEUE_KEY = "gisphn-tracker-offline-queue-v2";

const STYLE_CATALOG = {
  "osm-bright": "https://tile.openstreetmap.jp/styles/osm-bright/style.json",
  "osmfj-poi": "https://raw.githubusercontent.com/armd-02/Playgrounds/main/tiles/osmfj_poi.json",
  "gsi-photo": {
    version: 8,
    sources: {
      hill: { type: "raster", tiles: ["https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png"], tileSize: 256, attribution: "地理院タイル" },
      photo: { type: "raster", tiles: ["https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg"], tileSize: 256, attribution: "地理院タイル" },
    },
    layers: [
      { id: "hill", type: "raster", source: "hill", paint: { "raster-opacity": 1 } },
      { id: "photo", type: "raster", source: "photo", paint: { "raster-opacity": 0.72 } },
    ],
  },
};

const teams = {
  "team-a": { name: "A班 保健師", color: "#0f5e5e" },
  "team-b": { name: "B班 保健師", color: "#2d62a8" },
  "team-c": { name: "C班 保健師", color: "#8b5b9f" },
  hq: { name: "本部", color: "#9c6b11" },
};

const $ = (selector) => document.querySelector(selector);
const els = {
  connectionState: $("#connectionState"),
  fieldModeBtn: $("#fieldModeBtn"),
  hqModeBtn: $("#hqModeBtn"),
  municipalityInput: $("#municipalityInput"),
  surnameInput: $("#surnameInput"),
  teamSelect: $("#teamSelect"),
  sessionInput: $("#sessionInput"),
  accessCodeInput: $("#accessCodeInput"),
  toggleTracking: $("#toggleTracking"),
  sendNow: $("#sendNow"),
  intervalSelect: $("#intervalSelect"),
  statusSelect: $("#statusSelect"),
  memoInput: $("#memoInput"),
  saveMemo: $("#saveMemo"),
  centerMap: $("#centerMap"),
  activeCount: $("#activeCount"),
  staleCount: $("#staleCount"),
  memoCount: $("#memoCount"),
  queuedCount: $("#queuedCount"),
  teamCount: $("#teamCount"),
  lastUpdateText: $("#lastUpdateText"),
  teamFilter: $("#teamFilter"),
  basemapSelect: $("#basemapSelect"),
  showTracks: $("#showTracks"),
  showOverturePoi: $("#showOverturePoi"),
  createSession: $("#createSession"),
  copyShareLink: $("#copyShareLink"),
  shareHint: $("#shareHint"),
  addDemo: $("#addDemo"),
  clearDemo: $("#clearDemo"),
  exportCsv: $("#exportCsv"),
  exportGeojson: $("#exportGeojson"),
  exportSvgmap: $("#exportSvgmap"),
  activityList: $("#activityList"),
  syncHint: $("#syncHint"),
  teamSummaryList: $("#teamSummaryList"),
  staleList: $("#staleList"),
};

const config = window.GISPHN_CONFIG || {};
let state = loadState();
let map;
let naraArea = null;
let poiData = null;
let watchId = null;
let timerId = null;
let lastPosition = null;
let lastSentAt = 0;
let gasPollTimer = null;
let handlersReady = false;

init();

function init() {
  applyUrlSession();
  hydrateProfile();
  initMap();
  bindEvents();
  startSync();
  updateMode();
  updateConnectionState();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  render();
}

function initMap() {
  map = new maplibregl.Map({ container: "map", style: STYLE_CATALOG[state.profile.basemap || "osmfj-poi"], center: NARA_CENTER, zoom: 10, attributionControl: false });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
  map.on("style.load", () => { ensureHillshadeBase(); tuneUpperMapOpacity(); ensureLayers(); render(); });
  map.on("load", () => {
    fetch("./data/nara-sample.geojson").then((r) => r.json()).then((json) => { naraArea = json; render(); }).catch(() => {});
    setupMapHandlers();
  });
}

function bindEvents() {
  window.addEventListener("online", updateConnectionState);
  window.addEventListener("offline", updateConnectionState);
  els.fieldModeBtn.addEventListener("click", () => setMode("field"));
  els.hqModeBtn.addEventListener("click", () => setMode("hq"));
  [els.municipalityInput, els.surnameInput, els.teamSelect, els.sessionInput, els.accessCodeInput].forEach((input) => input.addEventListener("change", () => { saveProfile(); startSync(); render(); }));
  els.intervalSelect.addEventListener("change", () => { saveProfile(); if (watchId !== null) restartTracking(); });
  els.statusSelect.addEventListener("change", saveProfile);
  els.toggleTracking.addEventListener("click", toggleTracking);
  els.sendNow.addEventListener("click", () => captureAndSend(true));
  els.saveMemo.addEventListener("click", saveMemo);
  els.centerMap.addEventListener("click", centerOnLatest);
  els.teamFilter.addEventListener("change", render);
  els.basemapSelect.addEventListener("change", () => { map.setStyle(STYLE_CATALOG[els.basemapSelect.value]); saveProfile(); });
  els.showTracks.addEventListener("change", render);
  els.showOverturePoi.addEventListener("change", () => { saveProfile(); render(); });
  els.createSession.addEventListener("click", createTrainingSession);
  els.copyShareLink.addEventListener("click", copyShareLink);
  els.addDemo.addEventListener("click", addDemoParticipants);
  els.clearDemo.addEventListener("click", () => { state.logs = state.logs.filter((log) => !log.demo); saveState(); render(); });
  els.exportCsv.addEventListener("click", exportCsv);
  els.exportGeojson.addEventListener("click", exportGeojson);
  els.exportSvgmap.addEventListener("click", exportSvgmap);
}

function isGasMode() {
  return config.mode === "gas-sheet" && Boolean(config.gasWebAppUrl);
}

function startSync() {
  if (gasPollTimer) window.clearInterval(gasPollTimer);
  if (!isGasMode()) {
    els.syncHint.textContent = "同期未設定: この端末内のデータのみ表示しています。";
    return;
  }
  loadGasLogs();
  gasPollTimer = window.setInterval(loadGasLogs, Number(config.pollIntervalMs || 30000));
  els.syncHint.textContent = "Googleスプレッドシート同期: 数十秒ごとに本部画面を更新します。";
  updateConnectionState();
}

async function createTrainingSession() {
  if (!isGasMode()) {
    const generated = generateSessionCredentials();
    els.sessionInput.value = generated.sessionId;
    els.accessCodeInput.value = generated.accessCode;
    saveProfile();
    els.syncHint.textContent = "訓練IDとアクセスコードを端末内で作成しました。Apps Script設定後は自動登録できます。";
    return;
  }
  els.syncHint.textContent = "訓練セッションを作成中です。";
  try {
    const label = `${els.municipalityInput.value || "nara"}-${new Date().toISOString().slice(0, 10)}`;
    const data = await gasJsonp({ action: "createSession", label });
    if (!data.ok) throw new Error(data.error || "作成に失敗しました");
    els.sessionInput.value = data.sessionId;
    els.accessCodeInput.value = data.accessCode;
    saveProfile();
    startSync();
    els.syncHint.textContent = "訓練セッションを作成しました。共有URLを参加者へ配布できます。";
  } catch (error) {
    els.syncHint.textContent = `訓練作成に失敗しました: ${error.message}`;
  }
}

function generateSessionCredentials() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 6);
  const code = `${Math.floor(1000 + Math.random() * 9000)}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
  return { sessionId: `${date}-nara-drill-${suffix}`, accessCode: code };
}

async function loadGasLogs() {
  if (!isGasMode()) return;
  const profile = getProfile();
  if (!profile.accessCode) {
    els.syncHint.textContent = "Googleスプレッドシート同期: アクセスコードを入力してください。";
    return;
  }
  try {
    const data = await gasJsonp({ action: "logs", session: profile.sessionId, code: profile.accessCode });
    if (!data.ok) throw new Error(data.error || "読み取りに失敗しました");
    (data.logs || []).forEach((row) => mergeRemoteLog(sheetRowToLog(row)));
    els.syncHint.textContent = `Googleスプレッドシート同期: ${formatTime(new Date().toISOString())} 更新`;
  } catch (error) {
    els.syncHint.textContent = `Googleスプレッドシート同期エラー: ${error.message}`;
  }
}

function syncLog(log) {
  if (!isGasMode()) {
    enqueueIfOffline(log);
    render();
    return;
  }
  const profile = getProfile();
  if (!profile.accessCode || !navigator.onLine) {
    enqueueIfOffline(log);
    render();
    return;
  }
  const params = new URLSearchParams({
    action: "append",
    code: profile.accessCode,
    id: log.id,
    session_id: log.sessionId,
    user_id: log.userId,
    display_name: log.displayName,
    team_id: log.teamId,
    type: log.type,
    latitude: String(log.lat),
    longitude: String(log.lng),
    accuracy: String(log.accuracy ?? ""),
    status: log.status || "",
    memo: log.memo || "",
    created_at: log.createdAt,
  });
  fetch(config.gasWebAppUrl, { method: "POST", mode: "no-cors", body: params }).catch(() => enqueueIfOffline(log));
  log.synced = true;
  saveState();
  render();
}

function gasJsonp(params) {
  return new Promise((resolve, reject) => {
    const callback = `gisphnCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(config.gasWebAppUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("callback", callback);
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Apps Scriptから応答がありません")); }, 15000);
    function cleanup() { window.clearTimeout(timeout); script.remove(); delete window[callback]; }
    window[callback] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("Apps Scriptを読み込めません")); };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function sheetRowToLog(row) {
  return {
    id: row.id,
    type: row.type || "location",
    source: "google-sheet",
    sessionId: row.session_id,
    userId: row.user_id,
    displayName: row.display_name,
    teamId: row.team_id,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    accuracy: row.accuracy,
    status: row.status || "",
    memo: row.memo || "",
    createdAt: row.created_at,
    synced: true,
    demo: false,
  };
}

function mergeRemoteLog(log) {
  if (!log || !log.id || log.sessionId !== getProfile().sessionId) return;
  const index = state.logs.findIndex((item) => item.id === log.id);
  if (index >= 0) state.logs[index] = { ...state.logs[index], ...log, synced: true };
  else state.logs.push({ ...log, synced: true });
  saveState();
  render();
}

function setMode(mode) {
  state.profile.mode = mode;
  saveState();
  updateMode();
}

function updateMode() {
  const hq = state.profile.mode === "hq";
  document.body.classList.toggle("hq-mode", hq);
  els.fieldModeBtn.classList.toggle("primary", !hq);
  els.hqModeBtn.classList.toggle("primary", hq);
}

function ensureHillshadeBase() {
  if (map.getLayer("hill")) return;
  if (!map.getSource("gsi-hillshade")) map.addSource("gsi-hillshade", { type: "raster", tiles: ["https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png"], tileSize: 256, attribution: "地理院タイル" });
  if (!map.getLayer("gsi-hillshade-base")) map.addLayer({ id: "gsi-hillshade-base", type: "raster", source: "gsi-hillshade", paint: { "raster-opacity": 1 } }, map.getStyle().layers?.[0]?.id);
}

function tuneUpperMapOpacity() {
  for (const layer of map.getStyle().layers || []) {
    if (layer.id === "gsi-hillshade-base" || layer.id.startsWith("gisphn-")) continue;
    try {
      if (layer.type === "background") map.setPaintProperty(layer.id, "background-opacity", 0.45);
      if (layer.type === "fill") map.setPaintProperty(layer.id, "fill-opacity", 0.72);
      if (layer.type === "line") map.setPaintProperty(layer.id, "line-opacity", 0.88);
      if (layer.type === "raster" && layer.id !== "hill") map.setPaintProperty(layer.id, "raster-opacity", 0.72);
      if (layer.type === "circle") map.setPaintProperty(layer.id, "circle-opacity", 0.86);
    } catch {}
  }
}

function ensureLayers() {
  addSource("area"); addSource("tracks"); addSource("locations"); addSource("memos"); addSource("poi");
  addLayer({ id: "gisphn-area-fill", type: "fill", source: "area", paint: { "fill-color": "#5fb0a9", "fill-opacity": 0.08 } });
  addLayer({ id: "gisphn-area-line", type: "line", source: "area", paint: { "line-color": "#0f5e5e", "line-width": 2 } });
  addLayer({ id: "gisphn-tracks-line", type: "line", source: "tracks", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "teamColor"], "line-width": 4, "line-opacity": 0.78 } });
  addLayer({ id: "gisphn-locations-circle", type: "circle", source: "locations", paint: { "circle-radius": ["case", ["get", "stale"], 10, 8], "circle-color": ["get", "teamColor"], "circle-stroke-color": ["case", ["get", "stale"], "#b73b45", "#fff"], "circle-stroke-width": ["case", ["get", "stale"], 4, 2] } });
  addLayer({ id: "gisphn-locations-label", type: "symbol", source: "locations", layout: { "text-field": ["get", "initials"], "text-size": 11, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
  addLayer({ id: "gisphn-memos-circle", type: "circle", source: "memos", paint: { "circle-radius": 7, "circle-color": "#fff", "circle-stroke-color": ["get", "teamColor"], "circle-stroke-width": 3 } });
  addLayer({ id: "gisphn-poi-circle", type: "circle", source: "poi", paint: { "circle-radius": ["case", ["==", ["get", "basicCategory"], "health_and_medical"], 7, 5], "circle-color": ["case", ["==", ["get", "basicCategory"], "health_and_medical"], "#f87171", "#f8fafc"], "circle-stroke-color": ["case", ["==", ["get", "basicCategory"], "health_and_medical"], "#b73b45", "#334155"], "circle-stroke-width": 2 } });
  addLayer({ id: "gisphn-poi-label", type: "symbol", source: "poi", minzoom: 13, layout: { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1], "text-anchor": "top", "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"] }, paint: { "text-color": "#1f2937", "text-halo-color": "#fff", "text-halo-width": 1 } });
}

function addSource(id) { if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: fc([]) }); }
function addLayer(layer) { if (!map.getLayer(layer.id)) map.addLayer(layer); }
function setData(id, data) { const source = map.getSource(id); if (source) source.setData(data); }

function setupMapHandlers() {
  if (handlersReady) return;
  handlersReady = true;
  ["gisphn-locations-circle", "gisphn-memos-circle", "gisphn-poi-circle"].forEach((id) => {
    map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
  });
  map.on("click", "gisphn-locations-circle", (event) => {
    const p = event.features?.[0]?.properties || {};
    popup(event.lngLat, `<strong>${esc(p.displayName)}</strong><br>${esc(p.teamName)}<br>${esc(p.status)}<br>${esc(p.createdAt)}<br>精度: ${esc(p.accuracy ?? "不明")}m`);
  });
  map.on("click", "gisphn-memos-circle", (event) => {
    const p = event.features?.[0]?.properties || {};
    popup(event.lngLat, `<strong>${esc(p.displayName)}</strong><br>${esc(p.memo)}<br>${esc(p.createdAt)}`);
  });
  map.on("click", "gisphn-poi-circle", (event) => {
    const p = event.features?.[0]?.properties || {};
    popup(event.lngLat, `<strong>${esc(p.name)}</strong><br>${esc(p.category)}<br>${esc(p.address)}`);
  });
}

function popup(lngLat, html) { new maplibregl.Popup().setLngLat(lngLat).setHTML(html).addTo(map); }

function toggleTracking() { watchId !== null || timerId !== null ? stopTracking() : startTracking(); }
function startTracking() {
  els.toggleTracking.textContent = "活動停止";
  els.toggleTracking.classList.add("is-active");
  const interval = Number(els.intervalSelect.value);
  if (!navigator.geolocation) { addSyntheticLog("位置情報APIを利用できません。デモ位置を記録しました。"); return; }
  watchId = navigator.geolocation.watchPosition((position) => {
    lastPosition = position;
    if (interval > 0 && Date.now() - lastSentAt >= interval) persistPosition(position, "auto");
  }, () => addSyntheticLog("位置情報の取得に失敗しました。"), { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  if (interval !== 0) { timerId = window.setInterval(() => captureAndSend(false), interval); captureAndSend(true); }
}
function restartTracking() { stopTracking(false); startTracking(); }
function stopTracking(updateButton = true) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (timerId !== null) window.clearInterval(timerId);
  watchId = null; timerId = null;
  if (updateButton) { els.toggleTracking.textContent = "活動開始"; els.toggleTracking.classList.remove("is-active"); }
}
function captureAndSend(force) {
  const interval = Number(els.intervalSelect.value);
  if (!force && interval === 0) return;
  if (lastPosition) { persistPosition(lastPosition, force ? "manual" : "timer"); return; }
  navigator.geolocation?.getCurrentPosition((position) => persistPosition(position, force ? "manual" : "timer"), () => addSyntheticLog("現在地を取得できませんでした。"), { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
}

function persistPosition(position, source) {
  const profile = getProfile();
  const log = { id: crypto.randomUUID(), type: "location", source, sessionId: profile.sessionId, userId: profile.userId, displayName: profile.displayName, teamId: profile.teamId, lat: round(position.coords.latitude), lng: round(position.coords.longitude), accuracy: Math.round(position.coords.accuracy || 0), status: els.statusSelect.value, memo: "", createdAt: new Date().toISOString(), synced: false, demo: false };
  state.logs.push(log); lastSentAt = Date.now(); saveState(); render(); syncLog(log);
}
function saveMemo() {
  const text = els.memoInput.value.trim();
  if (!text) return;
  const profile = getProfile();
  const latest = getLatestLog(profile.userId) || { lat: NARA_CENTER[1], lng: NARA_CENTER[0], accuracy: null };
  const log = { id: crypto.randomUUID(), type: "memo", source: "memo", sessionId: profile.sessionId, userId: profile.userId, displayName: profile.displayName, teamId: profile.teamId, lat: latest.lat, lng: latest.lng, accuracy: latest.accuracy, status: els.statusSelect.value, memo: text, createdAt: new Date().toISOString(), synced: false, demo: false };
  state.logs.push(log); els.memoInput.value = ""; saveState(); render(); syncLog(log);
}
function addSyntheticLog(message) {
  const profile = getProfile();
  const offset = state.logs.length * 0.003;
  state.logs.push({ id: crypto.randomUUID(), type: "location", source: "synthetic", sessionId: profile.sessionId, userId: profile.userId, displayName: profile.displayName, teamId: profile.teamId, lat: round(NARA_CENTER[1] + offset), lng: round(NARA_CENTER[0] + offset), accuracy: null, status: els.statusSelect.value, memo: message, createdAt: new Date().toISOString(), synced: false, demo: true });
  saveState(); render();
}
function addDemoParticipants() {
  const now = Date.now();
  [["奈良市-佐藤", "team-a", 34.6851, 135.8048], ["橿原市-田中", "team-b", 34.5094, 135.7926], ["天理市-中村", "team-c", 34.5967, 135.8373], ["生駒市-森", "team-a", 34.6919, 135.7006], ["本部-調整", "hq", 34.6858, 135.8327]].forEach(([displayName, teamId, lat, lng], index) => {
    for (let step = 0; step < 4; step += 1) state.logs.push({ id: crypto.randomUUID(), type: "location", source: "demo", sessionId: els.sessionInput.value.trim(), userId: `demo-${index}`, displayName, teamId, lat: round(lat + step * 0.004 + index * 0.001), lng: round(lng + step * 0.003 - index * 0.001), accuracy: 18 + step, status: step === 3 ? "訪問中" : "移動中", memo: step === 3 ? "訓練用メモ: 現地確認中" : "", createdAt: new Date(now - (4 - step) * 60000 - index * 15000).toISOString(), synced: true, demo: true });
  });
  saveState(); render();
}

function render() {
  if (!map || !map.isStyleLoaded()) { renderMetrics(); renderActivity(); renderDashboard(); return; }
  ensureLayers();
  const selectedTeam = els.teamFilter.value;
  const logs = state.logs.filter((log) => selectedTeam === "all" || log.teamId === selectedTeam);
  const latest = [...latestByUser(logs).values()];
  setData("area", naraArea || fc([]));
  setData("tracks", els.showTracks.checked ? tracks(logs) : fc([]));
  setData("locations", fc(latest.map(locationFeature)));
  setData("memos", fc(logs.filter((log) => log.type === "memo").map(memoFeature)));
  renderPoi(); renderMetrics(); renderActivity(); renderDashboard();
}
function tracks(logs) {
  const features = [];
  groupBy(logs.filter((log) => log.type === "location"), "userId").forEach((items) => {
    const sorted = items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (sorted.length < 2) return;
    const team = teams[sorted[0].teamId] || teams["team-a"];
    features.push({ type: "Feature", geometry: { type: "LineString", coordinates: sorted.map((log) => [log.lng, log.lat]) }, properties: { teamColor: team.color } });
  });
  return fc(features);
}
function locationFeature(log) {
  const team = teams[log.teamId] || teams["team-a"];
  return { type: "Feature", geometry: { type: "Point", coordinates: [log.lng, log.lat] }, properties: { displayName: log.displayName, initials: initials(log.displayName), teamName: team.name, teamColor: team.color, status: log.status || "", accuracy: log.accuracy ?? "", createdAt: formatTime(log.createdAt), stale: Date.now() - new Date(log.createdAt) > 300000 } };
}
function memoFeature(log) {
  const team = teams[log.teamId] || teams["team-a"];
  return { type: "Feature", geometry: { type: "Point", coordinates: [log.lng, log.lat] }, properties: { displayName: log.displayName, memo: log.memo || "", teamColor: team.color, createdAt: formatTime(log.createdAt) } };
}
async function renderPoi() {
  if (!els.showOverturePoi.checked) { setData("poi", fc([])); return; }
  if (!poiData) poiData = await (await fetch("./data/overture-nara-poi.sample.geojson")).json();
  setData("poi", fc((poiData.features || []).map((feature) => ({ type: "Feature", geometry: feature.geometry, properties: { name: feature.properties?.names?.primary || "POI", category: feature.properties?.categories?.primary || "", basicCategory: feature.properties?.basic_category || "", address: feature.properties?.addresses?.[0]?.freeform || "" } }))));
}

function renderMetrics() {
  const latest = [...latestByUser(state.logs).values()];
  const stale = latest.filter((log) => Date.now() - new Date(log.createdAt) > 300000);
  const last = state.logs.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  els.activeCount.textContent = String(latest.length);
  els.staleCount.textContent = String(stale.length);
  els.memoCount.textContent = String(state.logs.filter((log) => log.type === "memo").length);
  els.queuedCount.textContent = String(loadQueue().length);
  els.teamCount.textContent = String(new Set(latest.map((log) => log.teamId)).size);
  els.lastUpdateText.textContent = last ? elapsedText(last.createdAt) : "-";
}
function renderDashboard() {
  const latest = [...latestByUser(state.logs).values()];
  const byTeam = groupBy(latest, "teamId");
  els.teamSummaryList.innerHTML = [...byTeam.entries()].map(([teamId, logs]) => {
    const team = teams[teamId] || { name: teamId, color: "#334155" };
    const stale = logs.filter((log) => Date.now() - new Date(log.createdAt) > 300000).length;
    return `<div class="summary-row"><span class="team-dot" style="background:${team.color}"></span><strong>${esc(team.name)}</strong><span>${logs.length}人</span><span>要確認 ${stale}</span></div>`;
  }).join("") || `<div class="summary-row muted">まだ参加者がありません</div>`;
  const staleLogs = latest.filter((log) => Date.now() - new Date(log.createdAt) > 300000);
  els.staleList.innerHTML = staleLogs.map((log) => `<div class="summary-row"><strong>${esc(log.displayName)}</strong><span>${esc(log.status || "")}</span><span>${elapsedText(log.createdAt)}</span></div>`).join("") || `<div class="summary-row muted">要確認者はいません</div>`;
}
function renderActivity() {
  const selectedTeam = els.teamFilter.value;
  const logs = state.logs.filter((log) => selectedTeam === "all" || log.teamId === selectedTeam).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 80);
  els.activityList.innerHTML = logs.map((log) => {
    const team = teams[log.teamId] || teams["team-a"];
    return `<li><div class="log-title"><span>${esc(log.displayName)}</span><span style="color:${team.color}">${esc(log.status || log.type)}</span></div><div class="log-meta">${esc(team.name)} / ${formatTime(log.createdAt)} / ${log.lat}, ${log.lng}</div>${log.memo ? `<div>${esc(log.memo)}</div>` : ""}</li>`;
  }).join("");
}

function centerOnLatest() { const latest = getLatestLog(getProfile().userId); map.flyTo({ center: latest ? [latest.lng, latest.lat] : NARA_CENTER, zoom: latest ? 15 : 10, essential: true }); }
function exportCsv() { const rows = [["id", "type", "session_id", "display_name", "team_id", "latitude", "longitude", "accuracy", "status", "memo", "created_at", "synced"], ...state.logs.map((log) => [log.id, log.type, log.sessionId, log.displayName, log.teamId, log.lat, log.lng, log.accuracy ?? "", log.status ?? "", log.memo ?? "", log.createdAt, log.synced])]; download("gisphn-location-logs.csv", "text/csv;charset=utf-8", rows.map((row) => row.map(csvCell).join(",")).join("\n")); }
function exportGeojson() { download("gisphn-location-logs.geojson", "application/geo+json", JSON.stringify(fc(state.logs.map((log) => ({ type: "Feature", geometry: { type: "Point", coordinates: [log.lng, log.lat] }, properties: log }))), null, 2)); }
function exportSvgmap() { download("gisphn-svgmap-layer.svg", "image/svg+xml;charset=utf-8", "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"); }

function getProfile() {
  const municipality = els.municipalityInput.value.trim() || "自治体";
  const surname = els.surnameInput.value.trim() || "参加者";
  return { userId: state.profile.userId, municipality, surname, displayName: `${municipality}-${surname}`, teamId: els.teamSelect.value, basemap: els.basemapSelect.value, showOverturePoi: els.showOverturePoi.checked, sessionId: els.sessionInput.value.trim() || "nara-training-001", accessCode: els.accessCodeInput.value.trim() };
}
function hydrateProfile() {
  els.municipalityInput.value = state.profile.municipality;
  els.surnameInput.value = state.profile.surname;
  els.teamSelect.value = state.profile.teamId;
  els.basemapSelect.value = state.profile.basemap || "osmfj-poi";
  els.showOverturePoi.checked = Boolean(state.profile.showOverturePoi);
  els.sessionInput.value = state.profile.sessionId;
  els.accessCodeInput.value = state.profile.accessCode || "";
  els.intervalSelect.value = state.profile.intervalMs;
  els.statusSelect.value = state.profile.status;
  updateShareHint();
}
function saveProfile() {
  const profile = getProfile();
  state.profile = { ...state.profile, municipality: profile.municipality, surname: profile.surname, teamId: profile.teamId, basemap: profile.basemap, showOverturePoi: profile.showOverturePoi, sessionId: profile.sessionId, accessCode: profile.accessCode, intervalMs: els.intervalSelect.value, status: els.statusSelect.value };
  saveState(); updateShareHint();
}
function loadState() {
  const fallback = { profile: { userId: crypto.randomUUID(), municipality: "奈良市", surname: "山田", teamId: "team-a", basemap: "osmfj-poi", showOverturePoi: false, mode: "field", sessionId: "nara-training-001", accessCode: "", intervalMs: "60000", status: "移動中" }, logs: [] };
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); return { ...fallback, ...saved, profile: { ...fallback.profile, ...(saved.profile || {}) }, logs: Array.isArray(saved.logs) ? saved.logs : [] }; } catch { return fallback; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function enqueueIfOffline(log) { const queue = loadQueue(); if (!queue.some((item) => item.id === log.id)) queue.push(log); localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); }
function loadQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } }
function updateConnectionState() { const online = navigator.onLine; const synced = isGasMode(); els.connectionState.textContent = synced ? (online ? "同期接続" : "オフライン") : (online ? "端末内" : "オフライン"); els.connectionState.classList.toggle("online", online && synced); els.connectionState.classList.toggle("offline", !online || !synced); }
function applyUrlSession() { const params = new URLSearchParams(window.location.search); if (params.get("session")) state.profile.sessionId = params.get("session"); if (params.get("code")) state.profile.accessCode = params.get("code"); }
async function copyShareLink() { const profile = getProfile(); const url = new URL(window.location.href); url.searchParams.set("session", profile.sessionId); if (profile.accessCode) url.searchParams.set("code", profile.accessCode); const text = url.toString(); try { await navigator.clipboard.writeText(text); els.shareHint.textContent = "共有URLをコピーしました。参加者に配布できます。"; } catch { els.shareHint.textContent = text; } }
function updateShareHint() { const profile = getProfile(); els.shareHint.textContent = profile.accessCode ? `参加者には訓練ID ${profile.sessionId} とアクセスコードを共有してください。` : "訓練作成を押すと、訓練IDとアクセスコードを自動発行します。"; }
function latestByUser(logs) { const latest = new Map(); logs.forEach((log) => { if (!Number.isFinite(log.lat) || !Number.isFinite(log.lng)) return; const current = latest.get(log.userId); if (!current || new Date(log.createdAt) > new Date(current.createdAt)) latest.set(log.userId, log); }); return latest; }
function getLatestLog(userId) { return state.logs.filter((log) => log.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]; }
function groupBy(items, key) { const groups = new Map(); items.forEach((item) => { const id = item[key]; if (!groups.has(id)) groups.set(id, []); groups.get(id).push(item); }); return groups; }
function initials(name) { const parts = String(name).split("-"); return (parts[1] || parts[0] || "?").slice(0, 2); }
function formatTime(value) { return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function elapsedText(value) { const minutes = Math.floor((Date.now() - new Date(value)) / 60000); if (minutes < 1) return "1分未満"; if (minutes < 60) return `${minutes}分前`; return `${Math.floor(minutes / 60)}時間前`; }
function round(value) { return Math.round(value * 1_000_000) / 1_000_000; }
function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function download(filename, type, text) { const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
function fc(features) { return { type: "FeatureCollection", features }; }
function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
