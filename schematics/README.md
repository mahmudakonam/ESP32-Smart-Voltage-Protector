# Wokwi schematic

![Wokwi wiring diagram](system_wiring_diagram.png)

This figure shows the complete simulated circuit: ESP32, two sensor emulators,
relay module, protected-load LED, OLED, keypad, four status LEDs, buzzer, and
system power button.

The potentiometers represent conditioned 0–3.3 V outputs from voltage and
current sensors. The firmware converts them to 150–300 V RMS and 0–10 A RMS.
They do not represent a direct mains connection.

The relay opens during a fault and disconnects the green protected-load LED.
Red indicates an active fault, yellow requests a manual reset, blue shows that
the system is on, and green shows that the protected load is connected.
