(() => {
  "use strict";

  const DEFAULT_PROFILE = {
    brokerUrl: "wss://broker.hivemq.com:8884/mqtt",
    topicBase: "fsmb/protector/demo72619",
  };

  const DEFAULT_SETTINGS = {
    v_min: 190,
    v_max: 250,
    i_max: 5,
    surge_step_v: 25,
    reconnect_delay_ms: 3000,
  };

  const HISTORY_WINDOW_MS = 60000;

  const byId = (id) => document.getElementById(id);
  const elements = Object.fromEntries([
    "connectionPill", "connectionDot", "connectionText", "connectButton",
    "openConnectionButton", "systemCard", "stateIcon", "systemBadge",
    "systemHeading", "systemDetail", "resetButton", "commandFeedback",
    "voltageValue", "currentValue", "voltageHint", "currentHint",
    "voltageDot", "currentDot", "loadCard", "loadValue", "lastPacketValue",
    "indicatorPanel", "indicatorSummary", "faultIndicator", "loadIndicator",
    "powerIndicator", "resetIndicator", "faultIndicatorState",
    "loadIndicatorState", "powerIndicatorState", "resetIndicatorState",
    "systemPowerButton", "powerButtonState",
    "voltageChart", "currentChart", "chartVoltageValue", "chartCurrentValue",
    "settingsSource", "settingsForm", "vMinInput", "vMaxInput", "iMaxInput",
    "surgeInput", "delayInput", "formError", "eventLog", "clearLogButton",
    "topicFooter", "connectionDialog", "connectionForm", "brokerInput",
    "topicInput", "connectionError", "cancelConnectionButton",
  ].map((id) => [id, byId(id)]));

  const state = {
    client: null,
    settings: { ...DEFAULT_SETTINGS },
    telemetry: null,
    telemetryAt: 0,
    history: [],
    profile: loadProfile(),
    manualDisconnect: false,
  };

  function loadProfile() {
    try {
      return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem("gridguard-profile")) };
    } catch {
      return { ...DEFAULT_PROFILE };
    }
  }

  function topic(suffix) {
    return `${state.profile.topicBase}/${suffix}`;
  }

  function setConnection(mode, text) {
    elements.connectionPill.className = `connection-pill ${mode}`;
    elements.connectionText.textContent = text;
    elements.connectButton.textContent = state.client ? "Disconnect" : "Connect";
    renderPowerControl();
  }

  function connect() {
    if (!window.mqtt) return addLog("MQTT library could not load.");
    disconnect(false);
    state.manualDisconnect = false;
    setConnection("connecting", "Connecting");

    const random = Array.from(crypto.getRandomValues(new Uint8Array(5)))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");

    state.client = mqtt.connect(state.profile.brokerUrl, {
      clientId: `voltage-protector-web-${random}`,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 3000,
      keepalive: 30,
      protocolVersion: 4,
    });

    state.client.on("connect", () => {
      setConnection("online", "Connected");
      state.client.subscribe([
        topic("telemetry"),
        topic("config/reported"),
        topic("event"),
      ]);
      addLog("Connected to the device channel.");
    });
    state.client.on("reconnect", () => setConnection("connecting", "Reconnecting"));
    state.client.on("offline", () => setConnection("connecting", "Reconnecting"));
    state.client.on("close", () => {
      if (state.manualDisconnect) setConnection("", "Offline");
    });
    state.client.on("error", (error) => addLog(`Connection error: ${error.message}`));
    state.client.on("message", handleMessage);
    elements.connectButton.textContent = "Disconnect";
  }

  function disconnect(manual = true) {
    state.manualDisconnect = manual;
    if (state.client) {
      state.client.removeAllListeners();
      state.client.end(true);
      state.client = null;
    }
    if (manual) {
      setConnection("", "Offline");
      addLog("Disconnected.");
    }
  }

  function handleMessage(receivedTopic, buffer) {
    let data;
    try { data = JSON.parse(buffer.toString()); }
    catch { return; }

    if (receivedTopic === topic("telemetry")) updateTelemetry(data);
    else if (receivedTopic === topic("config/reported")) updateSettings(data);
    else if (receivedTopic === topic("event")) updateEvent(data);
  }

  function updateTelemetry(data) {
    const voltage = Number(data.voltage);
    const current = Number(data.current);
    if (!Number.isFinite(voltage) || !Number.isFinite(current)) return;

    const activeFault = String(data.active_fault ?? data.fault ?? "UNKNOWN");
    const latchedFault = String(data.latched_fault ?? data.fault ?? "NONE");
    const faultLatched = Boolean(data.fault_latched ?? (latchedFault !== "NONE" && latchedFault !== "NORMAL"));
    const resetRequired = Boolean(data.reset_required ?? (activeFault === "NORMAL" && faultLatched));
    const systemOn = data.system_on === undefined ? true : Boolean(data.system_on);

    state.telemetry = {
      voltage,
      current,
      loadOn: Boolean(data.load_on),
      systemOn,
      activeFault,
      latchedFault,
      faultLatched,
      resetRequired,
    };
    state.telemetryAt = Date.now();
    if (systemOn) state.history.push({ at: state.telemetryAt, voltage, current });
    state.history = state.history.filter((sample) => sample.at >= state.telemetryAt - HISTORY_WINDOW_MS);
    renderTelemetry();
    drawCharts();
  }

  function renderTelemetry() {
    const data = state.telemetry;
    if (!data) return;

    elements.voltageValue.textContent = data.systemOn ? data.voltage.toFixed(1) : "—";
    elements.currentValue.textContent = data.systemOn ? data.current.toFixed(2) : "—";
    elements.chartVoltageValue.textContent = data.voltage.toFixed(1);
    elements.chartCurrentValue.textContent = data.current.toFixed(2);
    elements.voltageHint.textContent = data.systemOn ? `Healthy range ${state.settings.v_min.toFixed(1)}–${state.settings.v_max.toFixed(1)} V` : "System is off";
    elements.currentHint.textContent = data.systemOn ? `Limit ${state.settings.i_max.toFixed(1)} A` : "System is off";
    elements.voltageDot.className = `health-dot${data.systemOn ? ` ${data.voltage >= state.settings.v_min && data.voltage <= state.settings.v_max ? "healthy" : "unhealthy"}` : ""}`;
    elements.currentDot.className = `health-dot${data.systemOn ? ` ${data.current <= state.settings.i_max ? "healthy" : "unhealthy"}` : ""}`;
    elements.loadValue.textContent = data.loadOn ? "Connected" : "Disconnected";
    elements.loadCard.classList.toggle("load-on", data.loadOn);
    elements.lastPacketValue.textContent = "Updated just now";
    renderIndicators();

    elements.systemCard.className = "hero-card";
    if (!data.systemOn) {
      elements.systemCard.classList.add("state-off");
      elements.stateIcon.textContent = "○";
      elements.systemBadge.textContent = "System off";
      elements.systemHeading.textContent = "Protection is in standby";
      elements.systemDetail.textContent = "The relay and load are off. Press the blue power button to start the protection system.";
    } else if (data.activeFault !== "NORMAL") {
      elements.systemCard.classList.add("state-fault");
      elements.stateIcon.textContent = "!";
      elements.systemBadge.textContent = "Fault active";
      elements.systemHeading.textContent = pretty(data.activeFault);
      elements.systemDetail.textContent = "The relay has disconnected the load. Correct the voltage or current before resetting.";
    } else if (data.resetRequired) {
      elements.systemCard.classList.add("state-warning");
      elements.stateIcon.textContent = "↻";
      elements.systemBadge.textContent = "Measurements are normal";
      elements.systemHeading.textContent = "Reset required";
      elements.systemDetail.textContent = `The fault has cleared. The load remains safely off because the previous ${pretty(data.latchedFault).toLowerCase()} trip is latched.`;
    } else if (data.loadOn) {
      elements.systemCard.classList.add("state-normal");
      elements.stateIcon.textContent = "✓";
      elements.systemBadge.textContent = "Protected and online";
      elements.systemHeading.textContent = "Everything looks good";
      elements.systemDetail.textContent = "Voltage and current are within limits. The protected load is connected.";
    } else {
      elements.systemCard.classList.add("state-warning");
      elements.stateIcon.textContent = "↻";
      elements.systemBadge.textContent = "Ready";
      elements.systemHeading.textContent = "Load is disconnected";
      elements.systemDetail.textContent = "Measurements are normal. Request a safe reset to reconnect the load.";
    }
  }

  function setIndicator(item, stateLabel, isOn) {
    item.classList.toggle("is-on", isOn);
    stateLabel.textContent = isOn ? "On" : "Off";
  }

  function renderIndicators() {
    const data = state.telemetry;
    if (!data) return;

    const faultOn = data.systemOn && data.activeFault !== "NORMAL";
    const loadOn = data.systemOn && data.loadOn;
    const resetOn = data.systemOn && data.resetRequired;

    setIndicator(elements.faultIndicator, elements.faultIndicatorState, faultOn);
    setIndicator(elements.loadIndicator, elements.loadIndicatorState, loadOn);
    setIndicator(elements.powerIndicator, elements.powerIndicatorState, data.systemOn);
    setIndicator(elements.resetIndicator, elements.resetIndicatorState, resetOn);
    elements.indicatorPanel.classList.remove("is-stale");
    elements.indicatorSummary.textContent = faultOn ? "Fault active" : resetOn ? "Reset required" : loadOn ? "Load protected" : data.systemOn ? "System on" : "System off";
    renderPowerControl();
  }

  function renderPowerControl() {
    const hasFreshTelemetry = state.telemetry && Date.now() - state.telemetryAt <= 7000;
    const connected = Boolean(state.client?.connected);
    const systemOn = Boolean(state.telemetry?.systemOn);
    elements.systemPowerButton.disabled = !connected || !hasFreshTelemetry;
    elements.resetButton.disabled = !connected || !hasFreshTelemetry || !systemOn || !state.telemetry?.resetRequired || state.telemetry?.activeFault !== "NORMAL";
    elements.systemPowerButton.setAttribute("aria-pressed", String(systemOn));
    elements.powerButtonState.textContent = !connected
      ? "Connect first"
      : !hasFreshTelemetry
        ? "Waiting for device"
        : systemOn ? "Press to turn off" : "Press to turn on";
  }

  function updateSettings(data) {
    const next = {
      v_min: Number(data.v_min),
      v_max: Number(data.v_max),
      i_max: Number(data.i_max),
      surge_step_v: Number(data.surge_step_v),
      reconnect_delay_ms: Number(data.reconnect_delay_ms),
    };
    if (Object.values(next).every(Number.isFinite)) {
      state.settings = next;
      populateSettings();
      elements.settingsSource.textContent = "From device";
      drawCharts();
    }
    if (data.accepted === true) feedback("Settings accepted by the device.");
    else if (data.accepted === false) feedback("The device rejected these settings.");
  }

  function updateEvent(data) {
    const eventName = String(data.event ?? "Device event");
    const active = String(data.active_fault ?? data.fault ?? "NORMAL");
    const latched = String(data.latched_fault ?? "NONE");
    addLog(eventName === "TRIP" ? `${pretty(active)} trip` : `${pretty(eventName)}${latched !== "NONE" ? ` · ${pretty(latched)}` : ""}`);
  }

  function publish(payload, label) {
    if (!state.client?.connected) {
      feedback("Connect to the device first.");
      return;
    }
    state.client.publish(topic("config/set"), JSON.stringify(payload), { qos: 0, retain: false }, (error) => {
      if (error) feedback("Could not send the command.");
      else {
        feedback(`${label} sent.`);
        addLog(`${label} sent.`);
      }
    });
  }

  function saveSettings(event) {
    event.preventDefault();
    const values = {
      v_min: Number(elements.vMinInput.value),
      v_max: Number(elements.vMaxInput.value),
      i_max: Number(elements.iMaxInput.value),
      surge_step_v: Number(elements.surgeInput.value),
      reconnect_delay_ms: Math.round(Number(elements.delayInput.value) * 1000),
    };
    const error = validate(values);
    elements.formError.textContent = error;
    if (!error) publish({ action: "config", ...values }, "Protection settings");
  }

  function validate(value) {
    if (!Object.values(value).every(Number.isFinite)) return "Please enter valid numbers.";
    if (value.v_min < 160 || value.v_min > 230) return "Minimum voltage must be 160–230 V.";
    if (value.v_max < 230 || value.v_max > 280) return "Maximum voltage must be 230–280 V.";
    if (value.v_max <= value.v_min + 5) return "Maximum voltage must be more than 5 V above minimum.";
    if (value.i_max < .5 || value.i_max > 10) return "Maximum current must be 0.5–10 A.";
    if (value.surge_step_v < 5 || value.surge_step_v > 100) return "Surge rise must be 5–100 V.";
    if (value.reconnect_delay_ms < 0 || value.reconnect_delay_ms > 120000) return "Reconnect delay must be 0–120 seconds.";
    return "";
  }

  function populateSettings() {
    elements.vMinInput.value = state.settings.v_min;
    elements.vMaxInput.value = state.settings.v_max;
    elements.iMaxInput.value = state.settings.i_max;
    elements.surgeInput.value = state.settings.surge_step_v;
    elements.delayInput.value = state.settings.reconnect_delay_ms / 1000;
    if (state.telemetry) renderTelemetry();
  }

  function feedback(message) {
    elements.commandFeedback.textContent = message;
  }

  function addLog(message) {
    if (elements.eventLog.querySelector("time")?.textContent === "—") elements.eventLog.innerHTML = "";
    const item = document.createElement("li");
    const time = document.createElement("time");
    const text = document.createElement("span");
    time.textContent = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
    text.textContent = message;
    item.append(time, text);
    elements.eventLog.prepend(item);
    while (elements.eventLog.children.length > 12) elements.eventLog.lastElementChild.remove();
  }

  function pretty(value) {
    return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function openConnection() {
    elements.brokerInput.value = state.profile.brokerUrl;
    elements.topicInput.value = state.profile.topicBase;
    elements.connectionError.textContent = "";
    elements.connectionDialog.showModal();
  }

  function saveConnection(event) {
    event.preventDefault();
    const brokerUrl = elements.brokerInput.value.trim();
    const topicBase = elements.topicInput.value.trim().replace(/\/+$/, "");
    try {
      const url = new URL(brokerUrl);
      if (!["ws:", "wss:"].includes(url.protocol)) throw new Error();
    } catch {
      elements.connectionError.textContent = "Use a valid ws:// or wss:// address.";
      return;
    }
    if (!/^[A-Za-z0-9_/-]+$/.test(topicBase) || topicBase.includes("//")) {
      elements.connectionError.textContent = "Enter a valid MQTT topic.";
      return;
    }
    state.profile = { brokerUrl, topicBase };
    localStorage.setItem("gridguard-profile", JSON.stringify(state.profile));
    elements.topicFooter.textContent = topicBase;
    elements.connectionDialog.close();
    connect();
  }

  function updateFreshness() {
    const now = Date.now();
    state.history = state.history.filter((sample) => sample.at >= now - HISTORY_WINDOW_MS);
    drawCharts(now);
    if (!state.telemetryAt) return;
    const seconds = Math.floor((now - state.telemetryAt) / 1000);
    elements.lastPacketValue.textContent = seconds < 2 ? "Updated just now" : `Updated ${seconds} seconds ago`;
    if (seconds > 7) {
      elements.systemCard.className = "hero-card state-warning";
      elements.stateIcon.textContent = "?";
      elements.systemBadge.textContent = "No recent data";
      elements.systemHeading.textContent = "Device connection lost";
      elements.systemDetail.textContent = "The last values are shown below, but they may no longer be current.";
      elements.indicatorPanel.classList.add("is-stale");
      elements.indicatorSummary.textContent = "Data unavailable";
      [
        elements.faultIndicatorState,
        elements.loadIndicatorState,
        elements.powerIndicatorState,
        elements.resetIndicatorState,
      ].forEach((label) => { label.textContent = "Unknown"; });
    }
    renderPowerControl();
  }

  function drawCharts(now = Date.now()) {
    drawHistoryChart(elements.voltageChart, {
      now,
      key: "voltage",
      min: 150,
      max: 300,
      unit: "V",
      color: "#0071e3",
      limits: [
        { value: state.settings.v_min, label: `Min ${state.settings.v_min.toFixed(0)} V` },
        { value: state.settings.v_max, label: `Max ${state.settings.v_max.toFixed(0)} V` },
      ],
    });
    drawHistoryChart(elements.currentChart, {
      now,
      key: "current",
      min: 0,
      max: 10,
      unit: "A",
      color: "#ff9500",
      limits: [{ value: state.settings.i_max, label: `Limit ${state.settings.i_max.toFixed(1)} A` }],
    });
  }

  function drawHistoryChart(canvas, options) {
    if (!canvas) return;

    const width = Math.max(280, Math.round(canvas.clientWidth));
    const height = Math.max(180, Math.round(canvas.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const plot = { left: 48, right: width - 14, top: 18, bottom: height - 38 };
    const plotWidth = plot.right - plot.left;
    const plotHeight = plot.bottom - plot.top;
    const xAt = (timestamp) => plot.left + ((timestamp - (options.now - HISTORY_WINDOW_MS)) / HISTORY_WINDOW_MS) * plotWidth;
    const yAt = (value) => plot.bottom - ((value - options.min) / (options.max - options.min)) * plotHeight;

    context.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    context.textBaseline = "middle";
    context.lineWidth = 1;

    for (let index = 0; index <= 4; index += 1) {
      const ratio = index / 4;
      const y = plot.bottom - ratio * plotHeight;
      const value = options.min + ratio * (options.max - options.min);
      context.strokeStyle = "#e5e5ea";
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
      context.fillStyle = "#86868b";
      context.textAlign = "right";
      context.fillText(options.unit === "A" ? value.toFixed(1) : value.toFixed(0), plot.left - 8, y);
    }

    [-60, -30, 0].forEach((seconds) => {
      const x = plot.left + ((seconds + 60) / 60) * plotWidth;
      context.fillStyle = "#86868b";
      context.textAlign = seconds === -60 ? "left" : seconds === 0 ? "right" : "center";
      context.fillText(String(seconds), x, plot.bottom + 14);
    });
    context.textAlign = "center";
    context.fillText("Time (seconds ago)", plot.left + plotWidth / 2, height - 8);

    context.save();
    context.translate(11, plot.top + plotHeight / 2);
    context.rotate(-Math.PI / 2);
    context.fillText(options.unit === "V" ? "Voltage (V)" : "Current (A)", 0, 0);
    context.restore();

    options.limits.forEach((limit, index) => {
      if (limit.value < options.min || limit.value > options.max) return;
      const y = yAt(limit.value);
      context.save();
      context.setLineDash([5, 4]);
      context.strokeStyle = "rgba(215, 0, 21, .65)";
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
      context.restore();
      context.fillStyle = "#c52026";
      context.textAlign = "right";
      context.fillText(limit.label, plot.right - 3, y + (index === 0 ? -8 : 8));
    });

    const samples = state.history.filter((sample) => sample.at >= options.now - HISTORY_WINDOW_MS);
    if (!samples.length) {
      context.fillStyle = "#86868b";
      context.textAlign = "center";
      context.fillText("Waiting for live telemetry", plot.left + plotWidth / 2, plot.top + plotHeight / 2);
      return;
    }

    context.save();
    context.beginPath();
    context.rect(plot.left, plot.top, plotWidth, plotHeight);
    context.clip();
    context.strokeStyle = options.color;
    context.lineWidth = 2.5;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    samples.forEach((sample, index) => {
      const x = xAt(sample.at);
      const y = yAt(Math.min(options.max, Math.max(options.min, sample[options.key])));
      if (index === 0 || sample.at - samples[index - 1].at > 5000) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    const last = samples[samples.length - 1];
    context.fillStyle = options.color;
    context.beginPath();
    context.arc(xAt(last.at), yAt(Math.min(options.max, Math.max(options.min, last[options.key]))), 3.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  elements.connectButton.addEventListener("click", () => state.client ? disconnect(true) : connect());
  elements.openConnectionButton.addEventListener("click", openConnection);
  elements.cancelConnectionButton.addEventListener("click", () => elements.connectionDialog.close());
  elements.connectionForm.addEventListener("submit", saveConnection);
  elements.settingsForm.addEventListener("submit", saveSettings);
  elements.resetButton.addEventListener("click", () => publish({ action: "reset" }, "Safe reset request"));
  elements.systemPowerButton.addEventListener("click", () => publish({ action: "power_toggle" }, "Power button command"));
  elements.clearLogButton.addEventListener("click", () => {
    elements.eventLog.innerHTML = "";
    addLog("Activity cleared.");
  });

  populateSettings();
  drawCharts();
  elements.topicFooter.textContent = state.profile.topicBase;
  setInterval(updateFreshness, 1000);
  window.addEventListener("resize", drawCharts);
  setTimeout(connect, 350);
})();
