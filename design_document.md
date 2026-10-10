# ESP32 Smart Voltage Protector

**Md Mahmud Akon**<br>
FSMB Recruitment 2026 — Embedded System Engineer, Phase 1

## Design approach

I built an ESP32-based device that disconnects an appliance during unsafe
voltage or current conditions. I developed the protection and relay control
first, added the local interface, and then added MQTT and the web dashboard.
The complete project was tested in Wokwi.

Wokwi does not provide a real AC grid or the exact sensors needed here, so I
used two potentiometers as sensor emulators. They represent conditioned 0–3.3 V
outputs from isolated voltage and current sensors. The firmware converts them
to 150–300 V RMS and 0–10 A RMS. A relay module represents the contactor, and a
green LED represents the protected appliance.

## Operation and control

The ESP32 continuously checks minimum voltage, maximum voltage, maximum
current, and sudden voltage rise. If a limit is crossed, the relay opens, the
green load LED turns off, and the red fault LED and buzzer turn on.

When the readings return to normal, the relay remains open and the yellow LED
asks for a manual reset. A reset is rejected while a fault is active. After a
valid reset, the readings must stay healthy for three seconds before the relay
closes. I chose this method because reconnecting after only one normal reading
could be unsafe.

A keypad and OLED provide local settings and status. Invalid settings are
rejected, while accepted settings are stored in ESP32 flash memory. The MQTT
dashboard shows live values, relay state, graphs, and recent activity. It can
also update settings and request a safe reset. Protection runs locally, so an
MQTT failure does not stop the ESP32 from opening the relay.

## Results and limitations

I manually tested normal operation, over-voltage, under-voltage, over-current,
sudden rise, fault recovery, unsafe reset, local and remote settings, system
power, and MQTT failure. The relay, indicators, OLED, Serial Monitor, and
dashboard showed the expected states. The firmware also compiled successfully
for the ESP32.

This is a simulation, not a mains-ready product. The potentiometers do not
model real sensor noise or isolation, and the public MQTT broker is only for a
demonstration. Real hardware would need isolated sensing, fusing, ADC
protection, safe clearances, and a correctly rated relay or contactor. The
tests were manual, so automated testing would be a useful future improvement.
