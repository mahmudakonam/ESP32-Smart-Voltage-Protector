# ESP32 Smart Voltage Protector

This repository currently publishes the remote web dashboard for the FSMB 2026
Embedded System Engineer Phase 1 project.

## Live dashboard

The GitHub Pages URL is:

<https://mahmudakonam.github.io/ESP32-Smart-Voltage-Protector/>

Start the Wokwi ESP32 simulation first, then open the dashboard on any device.
Both devices must use the same MQTT broker and topic base. The current demo uses
the public HiveMQ WebSocket broker and topic `fsmb/protector/demo72619`.

> The public broker is suitable only for demonstration. Do not send private or
> safety-critical data through it.

## Current repository contents

- `src/web/index.html` — dashboard markup
- `src/web/styles.css` — responsive light UI
- `src/web/app.js` — MQTT communication, controls, and live RMS graphs
- `src/web/vendor/mqtt.min.js` — browser MQTT client
- `.github/workflows/pages.yml` — GitHub Pages deployment

The firmware, one-page design report, schematics, test evidence, and Wokwi
project files will be added before this repository is used as the final
assessment submission.

## Safety

Simulation and low-voltage testing only. Do not connect this project directly
to mains voltage.
