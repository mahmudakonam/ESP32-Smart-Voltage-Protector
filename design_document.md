# ESP32 Smart Voltage Protector — Design Document Draft

**Author:** Mahmud Akon<br>
**Assessment:** FSMB Recruitment 2026 — Embedded System Engineer, Phase 1<br>
**Final deliverable:** Update this draft, keep it within one page, and export it
as `design_document.pdf` in the repository root.

## Objective

The project protects a simulated electrical appliance from under-voltage,
over-voltage, excessive current, and a sudden voltage rise. When an unsafe
condition is detected, an ESP32 immediately opens a relay and keeps the load
disconnected. The project follows the assessment safety notice by representing
the grid and appliance with low-voltage Wokwi components rather than mains
hardware.

## Design approach

Two adjustable sensor-emulator blocks represent conditioned voltage and current
measurements. They use a separate labelled 3.3 V sensor rail and deliver only
0–3.3 V ADC signals to ESP32 pins GPIO34 and GPIO35. Firmware converts the ADC
values to 150–300 V RMS and 0–10 A RMS. The ESP32 compares each sample with
configurable minimum-voltage, maximum-voltage, maximum-current, and
voltage-rise limits.

The protection controller is a latched state machine. An active fault opens the
relay, turns on the red LED, sounds the buzzer, and turns off the green load
lamp. When measurements become normal, the active alarm clears but the relay
remains open and a yellow indicator requests manual reconnection. Pressing `D`
or sending a safe-reset request from the dashboard starts a healthy delay. The
relay closes only if the measurements remain safe throughout that delay.

## User interface and communication

A 4×4 keypad allows the user to change protection limits and request a manual
reset. A 128×64 OLED shows voltage, current, load state, fault state, and MQTT
status. Separate red, yellow, green, and blue indicators show active fault,
reset required, protected load connected, and system power respectively.

The simulated ESP32 connects to `Wokwi-GUEST` and publishes telemetry and event
messages through MQTT. A responsive browser dashboard displays current values,
60-second RMS trends, relay state, fault history, and configurable limits. The
local protection algorithm does not depend on the network and continues to
operate if MQTT is unavailable.

## Verification and limitations

The firmware builds successfully for ESP32, using 980,375 bytes of program
storage and 49,148 bytes of dynamic memory. Planned evidence covers startup,
healthy reconnection, every fault type, unsafe reset rejection, keypad and
remote configuration, MQTT loss, and master power cycling.

Wokwi potentiometers provide convenient sensor-output controls but do not model
the analog isolation, filtering, RMS conversion, contact ratings, or electrical
clearances required by a real mains product. Real hardware would require an
isolated supply, isolated voltage/current sensing, ADC protection, fusing, and
a correctly rated contactor and driver.

**Before exporting:** add final screenshots/results, confirm measured trip and
reconnect timing, remove this instruction, and revise the wording in your own
voice.
