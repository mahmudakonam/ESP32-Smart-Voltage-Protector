# ESP32 Smart Voltage Protector

An ESP32-based protection controller that disconnects a simulated electrical
load during under-voltage, over-voltage, over-current, sudden voltage-rise, or
sensor faults. It provides local controls, an OLED display, relay/load
indication, and remote monitoring over MQTT.

> **Safety:** This is a Wokwi simulation and low-voltage design study. Do not
> connect the circuit directly to mains voltage.

## Live links

- [Run the Wokwi simulation](https://wokwi.com/projects/477417399320348673)
- [Open the remote web dashboard](https://mahmudakonam.github.io/ESP32-Smart-Voltage-Protector/)

## Repository structure

```text
ESP32-Smart-Voltage-Protector/
├── src/
│   ├── firmware/sketch.ino       # ESP32 firmware source
│   └── web/                      # Remote MQTT dashboard
├── design_document.md            # Editable one-page report draft
├── schematics/                    # Product block diagram and design notes
├── test_evidence/                 # Build results and test checklist
├── project_files/wokwi/           # Wokwi simulation files
│   ├── diagram.json
│   ├── sketch.ino
│   └── libraries.txt
└── readme.md                      # Project instructions
```

Before the final assessment submission, update `design_document.md` and export
it as the required root-level file named `design_document.pdf`.

## Run online

1. Open the [Wokwi project](https://wokwi.com/projects/477417399320348673).
2. Click the green **Start Simulation** button.
3. Wait for the OLED and Serial Monitor to start. The Serial Monitor should
   eventually report `MQTT CONNECTED`.
4. Set healthy measurements with the two sensor-emulator knobs.
5. Press `D` on the keypad to request a safe load connection. The values must
   remain healthy for the configured reconnect delay.
6. Open the [web dashboard](https://mahmudakonam.github.io/ESP32-Smart-Voltage-Protector/)
   on the same or another device to view telemetry and send settings.

Keep the Wokwi simulation tab open while using the dashboard. The simulated
ESP32 stops communicating when the simulation is stopped or the tab is closed.

## Controls

- **Blue POWER button**, keyboard `P`, or dashboard power control: toggle the
  simulated protection system ON/OFF. MQTT remains available in standby so the
  dashboard can turn the simulated system on again.
- **Voltage sensor emulator:** adjust the processed measurement from 150 to
  300 V RMS.
- **Current sensor emulator:** adjust the processed measurement from 0 to
  10 A RMS.
- `D`: request manual reset/reconnection after a fault has cleared.
- `A` / `B`: open the settings menu and move between settings.
- `#`: edit or save the selected setting.
- `*`: go back.
- `C`: delete the last digit while editing.

## Protection sequence

1. An unsafe voltage/current condition immediately opens the relay. The red
   fault LED and buzzer turn on, while the green protected-load lamp turns off.
2. When measurements recover, the red alarm turns off and the yellow indicator
   requests a manual reset. The previous fault remains latched for the record.
3. Pressing `D` starts the healthy reconnect delay. If no fault returns, the
   relay closes, the yellow indicator turns off, and the green load lamp turns
   on.

## Recreate the Wokwi project

Create a new ESP32 project on Wokwi and replace its files with:

- `project_files/wokwi/sketch.ino`
- `project_files/wokwi/diagram.json`
- `project_files/wokwi/libraries.txt`

The two knobs emulate conditioned 0–3.3 V sensor outputs. They do not model
physical mains sensing. Their displayed values represent processed RMS voltage
and current measurements.

## Remote dashboard and MQTT

The firmware and webpage use the same demonstration channel:

```text
Broker: broker.hivemq.com
Topic:  fsmb/protector/demo72619
```

The public broker requires no account and is appropriate only for a short
demonstration. Do not publish private information or production commands on it.
Local protection continues to operate if MQTT is unavailable.

## Evidence and report

- `schematics/README.md` contains the product-level block diagram.
- `test_evidence/README.md` records the successful firmware build and the test
  cases that should be captured before submission.
- `design_document.md` is an editable report draft. Replace its placeholders,
  keep the final report within one page, and export it as `design_document.pdf`.
