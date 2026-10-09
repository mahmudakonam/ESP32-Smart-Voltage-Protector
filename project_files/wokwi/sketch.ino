
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <Keypad.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <math.h>

// ================= PINS =================
#define VOLT_PIN     34
#define CURRENT_PIN  35
#define SYSTEM_POWER_BUTTON_PIN 4
#define POWER_LED    2
#define RELAY_PIN    26
#define FAULT_LED    27
#define RECONNECT_LED 33
#define BUZZER_PIN   25

#define OLED_SDA     21
#define OLED_SCL     22
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

Adafruit_SSD1306 display(
  SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1
);

// ================= KEYPAD =================
const byte ROWS = 4;
const byte COLS = 4;

char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};

byte rowPins[ROWS] = {13, 14, 16, 17};
byte colPins[COLS] = {18, 19, 23, 32};

Keypad keypad = Keypad(
  makeKeymap(keys),
  rowPins,
  colPins,
  ROWS,
  COLS
);

// ================= WIFI / MQTT =================
const char* ssid = "Wokwi-GUEST";
const char* password = "";

const char* mqttServer = "broker.hivemq.com";
const int mqttPort = 1883;

// Change this ID before using a public broker
const char* topicBase = "fsmb/protector/demo72619";

String topicCommand;
String topicTelemetry;
String topicSettings;
String topicEvent;

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

Preferences prefs;

// ================= SETTINGS =================
struct Settings {
  float vMin = 190.0;
  float vMax = 250.0;
  float iMax = 5.0;
  float surgeStep = 25.0;
  unsigned long reconnectDelay = 3000;
};

Settings cfg;

// ================= SYSTEM STATE =================
enum FaultType {
  NO_FAULT,
  OVER_VOLTAGE,
  UNDER_VOLTAGE,
  OVER_CURRENT,
  SUDDEN_SURGE,
  SENSOR_ERROR,
  STARTUP
};

FaultType fault = STARTUP;
FaultType activeFault = NO_FAULT;

float voltage = 230.0;
float current = 2.0;
float previousVoltage = 230.0;
float voltageRise = 0;

bool firstSample = true;
bool surgeDetected = false;
bool relayOn = false;
bool resetRequested = false;
bool faultLatched = true;
bool systemOn = true;
bool powerButtonWasPressed = false;

unsigned long healthySince = 0;
unsigned long lastSample = 0;
unsigned long lastOLED = 0;
unsigned long lastTelemetry = 0;
unsigned long lastWifiAttempt = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastPowerToggle = 0;

// ================= OLED MENU =================
enum UIState {
  HOME_SCREEN,
  SETTINGS_MENU,
  EDIT_SETTING
};

UIState uiState = HOME_SCREEN;

int selectedMenu = 0;
String inputValue = "";

const int MENU_COUNT = 5;

const char* menuNames[MENU_COUNT] = {
  "MIN VOLTAGE",
  "MAX VOLTAGE",
  "MAX CURRENT",
  "SURGE STEP",
  "RECONNECT DELAY"
};

String message = "";
unsigned long messageUntil = 0;

// ================= BUZZER =================
int previousTone = 0;
FaultType previousAlarm = NO_FAULT;
unsigned long alarmStarted = 0;

void updateBuzzer() {
  // Sound only while the electrical fault is present. Once the readings are
  // healthy, the yellow reconnect LED replaces the audible/red alarm.
  FaultType alarm = activeFault;
  unsigned long now = millis();

  if (alarm != previousAlarm) {
    previousAlarm = alarm;
    alarmStarted = now;
  }

  unsigned long elapsed = now - alarmStarted;
  int frequency = 0;

  switch (alarm) {
    case SUDDEN_SURGE: {
      unsigned long phase = elapsed % 600;
      if (phase < 150) frequency = 1500;
      else if (phase < 300) frequency = 2200;
      else if (phase < 450) frequency = 1500;
      break;
    }

    case OVER_VOLTAGE:
      if (elapsed % 850 < 400)
        frequency = 1500;
      break;

    case OVER_CURRENT:
      if (elapsed % 500 < 150)
        frequency = 1000;
      break;

    case UNDER_VOLTAGE:
      if (elapsed % 1100 < 250)
        frequency = 650;
      break;

    case SENSOR_ERROR:
      if (elapsed % 250 < 125)
        frequency = 2400;
      break;

    default:
      frequency = 0;
      break;
  }

  if (frequency != previousTone) {
    if (frequency > 0)
      tone(BUZZER_PIN, frequency);
    else
      noTone(BUZZER_PIN);

    previousTone = frequency;
  }
}

// ================= FAULT NAME =================
const char* faultName(FaultType f) {
  switch (f) {
    case OVER_VOLTAGE: return "OVER VOLTAGE";
    case UNDER_VOLTAGE: return "UNDER VOLTAGE";
    case OVER_CURRENT: return "OVER CURRENT";
    case SUDDEN_SURGE: return "SUDDEN V SURGE";
    case SENSOR_ERROR: return "SENSOR ERROR";
    case STARTUP: return "STARTUP";
    default: return "NORMAL";
  }
}

// ================= SETTINGS =================
bool validSettings(const Settings& s) {
  return isfinite(s.vMin) &&
         isfinite(s.vMax) &&
         isfinite(s.iMax) &&
         isfinite(s.surgeStep) &&
         s.vMin >= 160 && s.vMin <= 230 &&
         s.vMax >= 230 && s.vMax <= 280 &&
         s.vMax > s.vMin + 5 &&
         s.iMax >= 0.5 && s.iMax <= 10 &&
         s.surgeStep >= 5 && s.surgeStep <= 100 &&
         s.reconnectDelay <= 120000;
}

void saveSettings() {
  prefs.putFloat("vmin", cfg.vMin);
  prefs.putFloat("vmax", cfg.vMax);
  prefs.putFloat("imax", cfg.iMax);
  prefs.putFloat("surge", cfg.surgeStep);
  prefs.putUInt("delay", cfg.reconnectDelay);
}

void loadSettings() {
  prefs.begin("protector", false);

  cfg.vMin = prefs.getFloat("vmin", 190);
  cfg.vMax = prefs.getFloat("vmax", 250);
  cfg.iMax = prefs.getFloat("imax", 5);
  cfg.surgeStep = prefs.getFloat("surge", 25);
  cfg.reconnectDelay = prefs.getUInt("delay", 3000);

  if (!validSettings(cfg)) {
    cfg = Settings();
    saveSettings();
  }
}

void showMessage(String text) {
  message = text;
  messageUntil = millis() + 1800;
  Serial.println(text);
}

// ================= MQTT =================
void publishSettings(bool accepted, String source) {
  if (!mqtt.connected()) return;

  JsonDocument doc;

  doc["accepted"] = accepted;
  doc["source"] = source;
  doc["v_min"] = cfg.vMin;
  doc["v_max"] = cfg.vMax;
  doc["i_max"] = cfg.iMax;
  doc["surge_step_v"] = cfg.surgeStep;
  doc["reconnect_delay_ms"] = cfg.reconnectDelay;

  String payload;
  serializeJson(doc, payload);

  mqtt.publish(
    topicSettings.c_str(),
    payload.c_str(),
    true
  );
}

bool applySettings(Settings next, String source) {
  if (!validSettings(next)) {
    showMessage("INVALID SETTINGS");
    publishSettings(false, source);
    return false;
  }

  cfg = next;
  saveSettings();

  showMessage("SETTINGS SAVED");
  publishSettings(true, source);

  return true;
}

bool requestReset() {
  if (activeFault != NO_FAULT) {
    resetRequested = false;
    healthySince = 0;
    showMessage("FAULT STILL ACTIVE");
    Serial.println("RESET REJECTED: FAULT ACTIVE");
    return false;
  }

  if (!faultLatched) {
    showMessage("LOAD ALREADY ON");
    Serial.println("RESET NOT NEEDED");
    return true;
  }

  resetRequested = true;
  healthySince = 0;
  showMessage("RECONNECT WAIT");
  Serial.println("RESET REQUESTED");
  return true;
}

void mqttCallback(
  char* topic,
  byte* payload,
  unsigned int length
) {
  if (String(topic) != topicCommand || length > 450)
    return;

  JsonDocument doc;

  if (deserializeJson(doc, payload, length)) {
    Serial.println("INVALID MQTT JSON");
    return;
  }

  if (!doc.is<JsonObject>()) return;

  String action = doc["action"] | "config";

  if (action == "reset") {
    bool accepted = requestReset();
    publishSettings(
      accepted,
      accepted ? "mqtt-reset" : "mqtt-reset-rejected"
    );
    return;
  }

  if (action != "config") return;

  Settings next = cfg;
  bool changed = false;

  if (doc["v_min"].is<float>() ||
      doc["v_min"].is<int>()) {
    next.vMin = doc["v_min"].as<float>();
    changed = true;
  }

  if (doc["v_max"].is<float>() ||
      doc["v_max"].is<int>()) {
    next.vMax = doc["v_max"].as<float>();
    changed = true;
  }

  if (doc["i_max"].is<float>() ||
      doc["i_max"].is<int>()) {
    next.iMax = doc["i_max"].as<float>();
    changed = true;
  }

  if (doc["surge_step_v"].is<float>() ||
      doc["surge_step_v"].is<int>()) {
    next.surgeStep = doc["surge_step_v"].as<float>();
    changed = true;
  }

  if (doc["reconnect_delay_ms"].is<uint32_t>()) {
    next.reconnectDelay =
      doc["reconnect_delay_ms"].as<uint32_t>();
    changed = true;
  }

  if (changed)
    applySettings(next, "mqtt");
}

void maintainMQTT() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiAttempt >= 10000) {
      lastWifiAttempt = now;
      WiFi.begin(ssid, password);
    }
    return;
  }

  if (mqtt.connected()) {
    mqtt.loop();
    return;
  }

  if (now - lastMqttAttempt >= 10000) {
    lastMqttAttempt = now;

    String clientId =
      "ESP32-Protector-" +
      String((uint32_t)ESP.getEfuseMac(), HEX);

    if (mqtt.connect(clientId.c_str())) {
      mqtt.subscribe(topicCommand.c_str());
      publishSettings(true, "connected");
      Serial.println("MQTT CONNECTED");
    } else {
      Serial.printf(
        "MQTT FAILED: %d\n", mqtt.state()
      );
    }
  }
}

// ================= SENSOR EMULATION =================
// The Wokwi knobs are powered sensor-output emulators. Each one represents the
// conditioned 0-3.3 V output of an isolated voltage/current sensing stage. The
// firmware converts that ADC signal into engineering units; no mains waveform
// or unconditioned sensor signal is connected to the ESP32.
void readSensors() {
  int rawV = analogRead(VOLT_PIN);
  int rawI = analogRead(CURRENT_PIN);

  voltage = 150.0 + rawV * 150.0 / 4095.0;
  current = rawI * 10.0 / 4095.0;

  if (!firstSample) {
    voltageRise = voltage - previousVoltage;

    if (voltageRise >= cfg.surgeStep)
      surgeDetected = true;
  } else {
    firstSample = false;
  }

  previousVoltage = voltage;
}

// ================= PROTECTION =================
FaultType detectFault() {
  if (!isfinite(voltage) || !isfinite(current))
    return SENSOR_ERROR;

  if (surgeDetected)
    return SUDDEN_SURGE;

  if (voltage > cfg.vMax)
    return OVER_VOLTAGE;

  if (voltage < cfg.vMin)
    return UNDER_VOLTAGE;

  if (current > cfg.iMax)
    return OVER_CURRENT;

  return NO_FAULT;
}

void publishEvent(String eventName) {
  if (!mqtt.connected()) return;

  JsonDocument doc;
  doc["event"] = eventName;
  doc["voltage"] = voltage;
  doc["current"] = current;
  doc["fault"] = faultName(activeFault);
  doc["active_fault"] = faultName(activeFault);
  doc["latched_fault"] = faultLatched
    ? faultName(fault)
    : "NONE";
  doc["fault_latched"] = faultLatched;
  doc["system_on"] = systemOn;

  String payload;
  serializeJson(doc, payload);

  mqtt.publish(
    topicEvent.c_str(),
    payload.c_str()
  );
}

void evaluateProtection() {
  FaultType detected = detectFault();
  activeFault = detected;
  surgeDetected = false;

  unsigned long now = millis();

  if (detected != NO_FAULT) {
    if (!faultLatched || fault != detected) {
      fault = detected;
      publishEvent("TRIP");
      Serial.printf(
        "FAULT: %s\n", faultName(fault)
      );
    }

    faultLatched = true;
    resetRequested = false;
    healthySince = 0;
    fault = detected;

  } else if (faultLatched && resetRequested) {
    if (healthySince == 0)
      healthySince = now;

    if (now - healthySince >= cfg.reconnectDelay) {
      faultLatched = false;
      resetRequested = false;
      fault = NO_FAULT;
      publishEvent("RESET COMPLETE");
    }
  }

  relayOn = !faultLatched;

  digitalWrite(
    RELAY_PIN, relayOn ? HIGH : LOW
  );

  digitalWrite(
    FAULT_LED,
    activeFault != NO_FAULT ? HIGH : LOW
  );

  digitalWrite(
    RECONNECT_LED,
    faultLatched && activeFault == NO_FAULT
      ? HIGH
      : LOW
  );
}

// ================= KEYPAD MENU =================
String settingValue(int index) {
  switch (index) {
    case 0: return String(cfg.vMin, 1);
    case 1: return String(cfg.vMax, 1);
    case 2: return String(cfg.iMax, 1);
    case 3: return String(cfg.surgeStep, 1);
    case 4: return String(cfg.reconnectDelay);
  }
  return "";
}

void handleKeypad() {
  char key = keypad.getKey();
  if (!key) return;

  Serial.printf(
    "KEYPAD: %c, PAGE: %d\n",
    key, uiState
  );

  if (uiState == HOME_SCREEN) {
    if (key == 'A') {
      selectedMenu = 0;
      uiState = SETTINGS_MENU;
    }

    if (key == 'D')
      requestReset();

    return;
  }

  if (uiState == SETTINGS_MENU) {
    if (key == 'A')
      selectedMenu =
        (selectedMenu + MENU_COUNT - 1) % MENU_COUNT;

    else if (key == 'B')
      selectedMenu =
        (selectedMenu + 1) % MENU_COUNT;

    else if (key == '*')
      uiState = HOME_SCREEN;

    else if (key == 'D')
      requestReset();

    else if (key == '#') {
      inputValue = "";
      uiState = EDIT_SETTING;
    }

    return;
  }

  if (uiState == EDIT_SETTING) {

    if (key >= '0' && key <= '9') {
      if (inputValue.length() < 9)
        inputValue += key;
    }

    else if (key == 'D' && selectedMenu != 4) {
      if (inputValue.indexOf('.') < 0) {
        if (inputValue.isEmpty())
          inputValue = "0";
        inputValue += '.';
      }
    }

    else if (key == 'C') {
      if (!inputValue.isEmpty())
        inputValue.remove(inputValue.length() - 1);
    }

    else if (key == '*') {
      uiState = SETTINGS_MENU;
    }

    else if (key == '#') {
      if (inputValue.isEmpty()) {
        showMessage("ENTER VALUE");
        return;
      }

      Settings next = cfg;
      float value = inputValue.toFloat();

      switch (selectedMenu) {
        case 0: next.vMin = value; break;
        case 1: next.vMax = value; break;
        case 2: next.iMax = value; break;
        case 3: next.surgeStep = value; break;
        case 4:
          next.reconnectDelay =
            (unsigned long)value;
          break;
      }

      if (applySettings(next, "keypad"))
        uiState = SETTINGS_MENU;
    }
  }
}

// ================= OLED =================
void updateOLED() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);

  if (uiState == HOME_SCREEN) {
    display.println("SMART VOLT PROTECT");
    display.println("------------------");

    display.printf("VOLT: %.1f V\n", voltage);
    display.printf("CURR: %.2f A\n", current);

    display.println(
      relayOn ? "LOAD: CONNECTED" : "LOAD: DISCONNECTED"
    );

    if (activeFault != NO_FAULT) {
      display.println(faultName(activeFault));
    } else if (faultLatched) {
      display.print("RESET: ");
      display.println(faultName(fault));
    } else {
      display.println("NORMAL");
    }

    display.println(
      mqtt.connected() ? "MQTT: ONLINE" : "MQTT: OFFLINE"
    );

    display.println("A:MENU  D:RESET");
  }

  else if (uiState == SETTINGS_MENU) {
    display.println("SETTINGS MENU");
    display.drawLine(
      0, 11, 127, 11, SSD1306_WHITE
    );

    display.setCursor(0, 16);
    display.printf(
      "SETTING %d/%d\n",
      selectedMenu + 1, MENU_COUNT
    );

    display.println(menuNames[selectedMenu]);

    display.setTextSize(2);
    display.println(settingValue(selectedMenu));

    display.setTextSize(1);
    display.println("A:UP B:DOWN #:EDIT");
    display.println("*:BACK");
  }

  else if (uiState == EDIT_SETTING) {
    display.println("EDIT SETTING");
    display.println("----------------");
    display.println(menuNames[selectedMenu]);

    display.setTextSize(2);
    display.println(
      inputValue.isEmpty() ? "_" : inputValue
    );

    display.setTextSize(1);
    display.println("D:DOT C:DELETE");
    display.println("#:SAVE *:BACK");
  }

  if (!message.isEmpty() &&
      (int32_t)(messageUntil - millis()) > 0) {
    display.fillRect(
      0, 55, 128, 9, SSD1306_BLACK
    );

    display.setTextSize(1);
    display.setCursor(0, 56);
    display.print(message.substring(0, 21));
  }

  display.display();
}

// ================= TELEMETRY =================
void publishTelemetry() {
  if (!mqtt.connected()) return;

  JsonDocument doc;

  doc["voltage"] = voltage;
  doc["current"] = current;
  doc["voltage_rise"] = voltageRise;
  doc["load_on"] = relayOn;
  // "fault" reports the condition that is active right now. The separate
  // latched fields explain why the relay can remain off after inputs recover.
  doc["fault"] = faultName(activeFault);
  doc["active_fault"] = faultName(activeFault);
  doc["latched_fault"] = faultLatched
    ? faultName(fault)
    : "NONE";
  doc["fault_latched"] = faultLatched;
  doc["reset_required"] =
    faultLatched && activeFault == NO_FAULT;
  doc["system_on"] = systemOn;

  String payload;
  serializeJson(doc, payload);

  mqtt.publish(
    topicTelemetry.c_str(),
    payload.c_str()
  );
}

// ================= SERIAL =================
String serialInput;

void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\n' || c == '\r') {
      serialInput.trim();

      if (serialInput == "RESET")
        requestReset();

      else if (serialInput == "STATUS") {
        Serial.printf(
          "V=%.1f I=%.2f LOAD=%s ACTIVE=%s LATCHED=%s RESET=%s\n",
          voltage,
          current,
          relayOn ? "ON" : "OFF",
          faultName(activeFault),
          faultLatched ? faultName(fault) : "NONE",
          faultLatched && activeFault == NO_FAULT
            ? "REQUIRED"
            : "NO"
        );
      }

      serialInput = "";
    }

    else if (serialInput.length() < 80)
      serialInput += c;
  }
}

// ================= SETUP =================
void setup() {
  pinMode(SYSTEM_POWER_BUTTON_PIN, INPUT_PULLUP);
  pinMode(POWER_LED, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(FAULT_LED, OUTPUT);
  pinMode(RECONNECT_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  systemOn = true;

  digitalWrite(POWER_LED, systemOn ? HIGH : LOW);
  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(FAULT_LED, LOW);
  digitalWrite(RECONNECT_LED, systemOn ? HIGH : LOW);

  Serial.begin(115200);

  Wire.begin(OLED_SDA, OLED_SCL);

  if (!display.begin(
      SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED FAILED");
  }

  analogReadResolution(12);
  analogSetPinAttenuation(VOLT_PIN, ADC_11db);
  analogSetPinAttenuation(CURRENT_PIN, ADC_11db);

  loadSettings();

  topicCommand =
    String(topicBase) + "/config/set";

  topicTelemetry =
    String(topicBase) + "/telemetry";

  topicSettings =
    String(topicBase) + "/config/reported";

  topicEvent =
    String(topicBase) + "/event";

  mqtt.setServer(mqttServer, mqttPort);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(768);
  mqtt.setSocketTimeout(1);

  if (systemOn) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);
  } else {
    WiFi.mode(WIFI_OFF);
  }

  lastWifiAttempt = millis();

  // Initialize measurement before evaluating protection when powered on.
  if (systemOn)
    readSensors();

  Serial.println("ESP32 SMART PROTECTOR");
  Serial.println("SIMULATION ONLY");
  Serial.println(
    systemOn ? "SYSTEM POWER: ON" : "SYSTEM POWER: OFF"
  );
  Serial.println("A: MENU");
  Serial.println("B: NEXT");
  Serial.println("#: SELECT/SAVE");
  Serial.println("*: BACK");
  Serial.println("D: RESET / DECIMAL");
  Serial.println("C: DELETE");

  Serial.println("MQTT COMMAND TOPIC:");
  Serial.println(topicCommand);
}

// ================= MAIN LOOP =================
void loop() {
  unsigned long now = millis();

  // The Wokwi pushbutton toggles simulated master power. A real product would
  // place a latching switch in series with the isolated low-voltage input.
  bool powerButtonPressed =
    digitalRead(SYSTEM_POWER_BUTTON_PIN) == LOW;
  bool togglePower =
    powerButtonPressed &&
    !powerButtonWasPressed &&
    now - lastPowerToggle >= 200;

  powerButtonWasPressed = powerButtonPressed;

  bool requestedPower = systemOn;
  if (togglePower) {
    requestedPower = !systemOn;
    lastPowerToggle = now;
  }

  if (requestedPower != systemOn) {
    systemOn = requestedPower;

    if (!systemOn) {
      // Publish the transition before disabling network activity.
      publishEvent("SYSTEM OFF");
      mqtt.loop();

      relayOn = false;
      activeFault = NO_FAULT;
      fault = STARTUP;
      faultLatched = true;
      resetRequested = false;
      healthySince = 0;

      digitalWrite(POWER_LED, LOW);
      digitalWrite(RELAY_PIN, LOW);
      digitalWrite(FAULT_LED, LOW);
      digitalWrite(RECONNECT_LED, LOW);
      noTone(BUZZER_PIN);
      previousTone = 0;

      display.clearDisplay();
      display.display();

      mqtt.disconnect();
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
      Serial.println("SYSTEM POWER: OFF");
    } else {
      fault = STARTUP;
      activeFault = NO_FAULT;
      faultLatched = true;
      resetRequested = false;
      healthySince = 0;
      firstSample = true;

      digitalWrite(POWER_LED, HIGH);
      digitalWrite(RECONNECT_LED, HIGH);

      WiFi.mode(WIFI_STA);
      WiFi.begin(ssid, password);
      lastWifiAttempt = now;

      readSensors();
      Serial.println("SYSTEM POWER: ON");
    }
  }

  if (!systemOn) {
    delay(20);
    return;
  }

  // Local safety decisions execute before network tasks.
  if (now - lastSample >= 40) {
    lastSample = now;
    readSensors();
  }

  evaluateProtection();
  handleKeypad();
  handleSerial();
  updateBuzzer();

  if (now - lastOLED >= 150) {
    lastOLED = now;
    updateOLED();
  }

  maintainMQTT();

  if (now - lastTelemetry >= 1500) {
    lastTelemetry = now;
    publishTelemetry();

    Serial.printf(
      "V: %.1f I: %.2f LOAD: %s ACTIVE: %s LATCHED: %s RESET: %s\n",
      voltage,
      current,
      relayOn ? "ON" : "OFF",
      faultName(activeFault),
      faultLatched ? faultName(fault) : "NONE",
      faultLatched && activeFault == NO_FAULT
        ? "REQUIRED"
        : "NO"
    );
  }

  delay(2);
}
