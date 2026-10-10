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
  const LOG_LIMIT = 80;

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
    "surgeInput", "delayInput", "formError", "activityCard", "eventLog",
    "logCount", "emptyLogMessage", "clearLogButton", "downloadLogButton",
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
    telemetryWasStale: false,
    settingsReceived: false,
    activeLogFilter: "all",
    recentLogKeys: new Map(),
  };

  const logFilterButtons = [...document.querySelectorAll("[data-log-filter]")];

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
    if (!window.mqtt) {
      addLog("MQTT library could not load", {
        category: "system",
        tone: "danger",
        details: "The browser cannot start the device connection.",
      });
      return;
    }
    disconnect(false);
    state.manualDisconnect = false;
    setConnection("connecting", "Connecting");
    addLog("Connecting to MQTT broker", {
      category: "system",
      tone: "info",
      details: `${state.profile.brokerUrl} · ${state.profile.topicBase}`,
      key: "mqtt-connecting",
      dedupeMs: 3000,
    });

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
      addLog("MQTT connection established", {
        category: "system",
        tone: "success",
        details: `Subscribed to ${state.profile.topicBase}`,
        key: "mqtt-connected",
      });
    });
    state.client.on("reconnect", () => {
      setConnection("connecting", "Reconnecting");
      addLog("Reconnecting to MQTT broker", {
        category: "system",
        tone: "warning",
        details: "The dashboard is retrying automatically.",
        key: "mqtt-reconnecting",
        dedupeMs: 5000,
      });
    });
    state.client.on("offline", () => {
      setConnection("connecting", "Reconnecting");
      addLog("MQTT connection interrupted", {
        category: "system",
        tone: "warning",
        details: "Live updates may be temporarily unavailable.",
        key: "mqtt-offline",
        dedupeMs: 5000,
      });
    });
    state.client.on("close", () => {
      if (state.manualDisconnect) setConnection("", "Offline");
    });
    state.client.on("error", (error) => addLog("MQTT connection error", {
      category: "system",
      tone: "danger",
      details: error.message,
      key: `mqtt-error:${error.message}`,
      dedupeMs: 5000,
    }));
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
      addLog("Dashboard disconnected", {
        category: "system",
        tone: "neutral",
        details: "Disconnected manually from the MQTT broker.",
      });
    }
  }

  function handleMessage(receivedTopic, buffer) {
    let data;
    try { data = JSON.parse(buffer.toString()); }
    catch {
      addLog("Invalid MQTT message ignored", {
        category: "system",
        tone: "warning",
        details: receivedTopic,
        key: `invalid-json:${receivedTopic}`,
        dedupeMs: 5000,
      });
      return;
    }

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

    const previous = state.telemetry;
    const next = {
      voltage,
      current,
      loadOn: Boolean(data.load_on),
      systemOn,
      activeFault,
      latchedFault,
      faultLatched,
      resetRequired,
    };
    state.telemetry = next;
    state.telemetryAt = Date.now();
    if (systemOn) state.history.push({ at: state.telemetryAt, voltage, current });
    state.history = state.history.filter((sample) => sample.at >= state.telemetryAt - HISTORY_WINDOW_MS);
    logTelemetryChanges(previous, next);
    if (state.telemetryWasStale) {
      state.telemetryWasStale = false;
      addLog("Live telemetry restored", {
        category: "system",
        tone: "success",
        details: measurementDetails(next),
        key: "telemetry-restored",
      });
    }
    renderTelemetry();
    drawCharts();
  }

  function measurementDetails(data) {
    return `${data.voltage.toFixed(1)} V · ${data.current.toFixed(2)} A · Load ${data.loadOn ? "ON" : "OFF"}`;
  }

  function voltageZone(data) {
    if (!data.systemOn) return "off";
    if (data.voltage < state.settings.v_min) return "low";
    if (data.voltage > state.settings.v_max) return "high";
    return "normal";
  }

  function currentZone(data) {
    if (!data.systemOn) return "off";
    return data.current > state.settings.i_max ? "high" : "normal";
  }

  function logTelemetryChanges(previous, next) {
    if (!previous) {
      addLog("First live telemetry received", {
        category: "system",
        tone: "success",
        details: measurementDetails(next),
        key: "telemetry-first",
      });
      return;
    }

    if (previous.systemOn !== next.systemOn) {
      addLog(next.systemOn ? "Protection system turned on" : "Protection system entered standby", {
        category: "system",
        tone: next.systemOn ? "success" : "neutral",
        details: next.systemOn ? "Blue system indicator is ON." : "Relay, load, alarm, and indicators are safely off.",
        key: `system:${next.systemOn}`,
      });
    }

    if (previous.activeFault !== next.activeFault) {
      if (next.activeFault !== "NORMAL") {
        addLog(`${pretty(next.activeFault)} activated`, {
          category: "safety",
          tone: "danger",
          details: measurementDetails(next),
          key: `fault:${next.activeFault}`,
        });
      } else if (previous.activeFault !== "NORMAL") {
        addLog("Active fault condition cleared", {
          category: "safety",
          tone: "warning",
          details: `${pretty(previous.activeFault)} cleared · ${next.resetRequired ? "Manual reset is now required." : "System is monitoring."}`,
          key: `fault-cleared:${previous.activeFault}`,
        });
      }
    }

    if (previous.resetRequired !== next.resetRequired) {
      addLog(next.resetRequired ? "Manual reset required" : "Reset requirement cleared", {
        category: "control",
        tone: next.resetRequired ? "warning" : "success",
        details: next.resetRequired
          ? `${pretty(next.latchedFault)} remains latched; the yellow indicator is ON.`
          : `Yellow indicator OFF · Load ${next.loadOn ? "reconnected" : "remains disconnected"}.`,
        key: `reset-required:${next.resetRequired}`,
      });
    }

    if (previous.loadOn !== next.loadOn) {
      addLog(next.loadOn ? "Protected load connected" : "Protected load disconnected", {
        category: next.activeFault !== "NORMAL" ? "safety" : "control",
        tone: next.loadOn ? "success" : next.activeFault !== "NORMAL" ? "danger" : "warning",
        details: next.loadOn ? "Relay closed · Green load indicator ON." : `Relay opened · ${measurementDetails(next)}.`,
        key: `relay:${next.loadOn}`,
      });
    }

    const previousVoltageZone = voltageZone(previous);
    const nextVoltageZone = voltageZone(next);
    if (previousVoltageZone !== nextVoltageZone && nextVoltageZone !== "off") {
      const messages = {
        low: "Voltage dropped below minimum",
        high: "Voltage exceeded maximum",
        normal: "Voltage returned to the healthy range",
      };
      addLog(messages[nextVoltageZone], {
        category: "safety",
        tone: nextVoltageZone === "normal" ? "success" : "danger",
        details: `${next.voltage.toFixed(1)} V · Allowed ${state.settings.v_min.toFixed(1)}–${state.settings.v_max.toFixed(1)} V`,
        key: `voltage-zone:${nextVoltageZone}`,
      });
    }

    const previousCurrentZone = currentZone(previous);
    const nextCurrentZone = currentZone(next);
    if (previousCurrentZone !== nextCurrentZone && nextCurrentZone !== "off") {
      addLog(nextCurrentZone === "high" ? "Current exceeded maximum" : "Current returned below the limit", {
        category: "safety",
        tone: nextCurrentZone === "normal" ? "success" : "danger",
        details: `${next.current.toFixed(2)} A · Limit ${state.settings.i_max.toFixed(1)} A`,
        key: `current-zone:${nextCurrentZone}`,
      });
    }
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
      const source = pretty(String(data.source ?? "device"));
      addLog(state.settingsReceived ? "Protection settings updated" : "Protection settings synchronized", {
        category: "settings",
        tone: data.accepted === false ? "danger" : "success",
        details: `${settingsDetails(next)} · Source: ${source}`,
        key: `settings:${JSON.stringify(next)}:${data.accepted}`,
      });
      state.settingsReceived = true;
    }
    if (data.accepted === true) feedback("Settings accepted by the device.");
    else if (data.accepted === false) {
      feedback("The device rejected these settings.");
      addLog("Protection settings rejected", {
        category: "settings",
        tone: "danger",
        details: String(data.source ?? "The device did not accept the submitted limits."),
      });
    }
  }

  function settingsDetails(value) {
    return `Voltage ${value.v_min.toFixed(1)}–${value.v_max.toFixed(1)} V · Current ${value.i_max.toFixed(1)} A · Surge ${value.surge_step_v.toFixed(1)} V · Delay ${(value.reconnect_delay_ms / 1000).toFixed(1)} s`;
  }

  function updateEvent(data) {
    const eventName = String(data.event ?? "Device event");
    const active = String(data.active_fault ?? data.fault ?? "NORMAL");
    const latched = String(data.latched_fault ?? "NONE");
    const values = Number.isFinite(Number(data.voltage)) && Number.isFinite(Number(data.current))
      ? `${Number(data.voltage).toFixed(1)} V · ${Number(data.current).toFixed(2)} A`
      : "Device event message";

    if (eventName === "TRIP") {
      addLog(`${pretty(active)} trip`, {
        category: "safety",
        tone: "danger",
        details: `${values} · Relay opened immediately.`,
        key: `fault:${active}`,
      });
    } else if (eventName === "RESET COMPLETE") {
      addLog("Safe reconnection completed", {
        category: "control",
        tone: "success",
        details: `${values} · Healthy delay completed and relay closed.`,
        key: "relay:true",
      });
    } else if (eventName === "SYSTEM ON" || eventName === "SYSTEM OFF") {
      const turnedOn = eventName === "SYSTEM ON";
      addLog(turnedOn ? "Protection system turned on" : "Protection system entered standby", {
        category: "system",
        tone: turnedOn ? "success" : "neutral",
        details: `${values} · Device event received.`,
        key: `system:${turnedOn}`,
      });
    } else {
      addLog(pretty(eventName), {
        category: "system",
        tone: "info",
        details: `${values}${latched !== "NONE" ? ` · Latched: ${pretty(latched)}` : ""}`,
      });
    }
  }

  function publish(payload, label, logOptions = {}) {
    if (!state.client?.connected) {
      feedback("Connect to the device first.");
      addLog(`${label} blocked`, {
        category: logOptions.category ?? "control",
        tone: "warning",
        details: "Connect to the MQTT broker before sending this command.",
      });
      return;
    }
    state.client.publish(topic("config/set"), JSON.stringify(payload), { qos: 0, retain: false }, (error) => {
      if (error) {
        feedback("Could not send the command.");
        addLog(`${label} failed`, {
          category: logOptions.category ?? "control",
          tone: "danger",
          details: error.message,
        });
      }
      else {
        feedback(`${label} sent.`);
        addLog(`${label} sent`, {
          category: logOptions.category ?? "control",
          tone: "info",
          details: logOptions.details ?? `Published to ${topic("config/set")}`,
        });
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
    if (error) {
      addLog("Settings validation failed", {
        category: "settings",
        tone: "danger",
        details: error,
      });
    } else {
      publish({ action: "config", ...values }, "Protection settings", {
        category: "settings",
        details: settingsDetails(values),
      });
    }
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

  function addLog(message, options = {}) {
    const category = ["safety", "system", "control", "settings"].includes(options.category)
      ? options.category
      : "system";
    const tone = ["danger", "warning", "success", "info", "neutral"].includes(options.tone)
      ? options.tone
      : "neutral";
    const now = new Date();

    if (options.key) {
      const last = state.recentLogKeys.get(options.key) ?? 0;
      if (now.getTime() - last < (options.dedupeMs ?? 1500)) return;
      state.recentLogKeys.set(options.key, now.getTime());
    }

    const row = document.createElement("tr");
    row.className = `log-row tone-${tone}`;
    row.dataset.category = category;
    row.dataset.timestamp = now.toISOString();
    row.dataset.tone = tone;

    const timeCell = document.createElement("td");
    const time = document.createElement("time");
    time.dateTime = now.toISOString();
    time.textContent = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(now);
    timeCell.append(time);

    const typeCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "log-badge";
    badge.textContent = category === "control" ? "Control" : pretty(category);
    typeCell.append(badge);

    const titleCell = document.createElement("td");
    titleCell.className = "log-title";
    titleCell.textContent = message;

    const detailsCell = document.createElement("td");
    detailsCell.className = "log-details";
    detailsCell.textContent = options.details || "—";

    row.append(timeCell, typeCell, titleCell, detailsCell);
    elements.eventLog.prepend(row);
    while (elements.eventLog.children.length > LOG_LIMIT) elements.eventLog.lastElementChild.remove();
    applyLogFilter();
  }

  function applyLogFilter() {
    const rows = [...elements.eventLog.querySelectorAll(".log-row")];
    let visible = 0;
    rows.forEach((row) => {
      row.hidden = state.activeLogFilter !== "all" && row.dataset.category !== state.activeLogFilter;
      if (!row.hidden) visible += 1;
    });
    elements.logCount.textContent = `${rows.length} ${rows.length === 1 ? "event" : "events"}`;
    elements.emptyLogMessage.hidden = visible !== 0;
    logFilterButtons.forEach((button) => {
      const active = button.dataset.logFilter === state.activeLogFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function downloadActivityLog() {
    const rows = [...elements.eventLog.querySelectorAll(".log-row")].reverse();
    const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const lines = [
      ["Timestamp", "Type", "Activity", "Details"].map(escapeCsv).join(","),
      ...rows.map((row) => [
        row.dataset.timestamp,
        row.dataset.category,
        row.children[2].textContent,
        row.children[3].textContent,
      ].map(escapeCsv).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `voltage-protector-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    addLog("Activity log downloaded", {
      category: "control",
      tone: "info",
      details: `${rows.length} event rows exported as CSV.`,
    });
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
    addLog("Connection profile updated", {
      category: "settings",
      tone: "info",
      details: `${brokerUrl} · ${topicBase}`,
    });
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
      if (!state.telemetryWasStale) {
        state.telemetryWasStale = true;
        addLog("Device telemetry timed out", {
          category: "system",
          tone: "warning",
          details: `No telemetry received for ${seconds} seconds; displayed measurements may be stale.`,
          key: "telemetry-timeout",
          dedupeMs: 10000,
        });
      }
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
  elements.resetButton.addEventListener("click", () => publish({ action: "reset" }, "Safe reset request", {
    category: "control",
    details: state.telemetry ? `${measurementDetails(state.telemetry)} · Latched: ${pretty(state.telemetry.latchedFault)}` : "Manual reset requested from the dashboard.",
  }));
  elements.systemPowerButton.addEventListener("click", () => publish({ action: "power_toggle" }, "Power button command", {
    category: "control",
    details: state.telemetry?.systemOn ? "Requested system standby." : "Requested system start.",
  }));
  logFilterButtons.forEach((button) => button.addEventListener("click", () => {
    state.activeLogFilter = button.dataset.logFilter;
    applyLogFilter();
  }));
  elements.downloadLogButton.addEventListener("click", downloadActivityLog);
  elements.clearLogButton.addEventListener("click", () => {
    elements.eventLog.innerHTML = "";
    addLog("Activity log cleared", {
      category: "control",
      tone: "neutral",
      details: "Previous dashboard-session events were removed.",
    });
  });

  populateSettings();
  drawCharts();
  elements.topicFooter.textContent = state.profile.topicBase;
  addLog("Dashboard ready", {
    category: "system",
    tone: "info",
    details: `Monitoring ${state.profile.topicBase}`,
  });
  setInterval(updateFreshness, 1000);
  window.addEventListener("resize", drawCharts);
  setTimeout(connect, 350);
})();
