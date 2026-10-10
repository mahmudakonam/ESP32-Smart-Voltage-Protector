# Schematics

## Wokwi simulation

![Wokwi wiring diagram](system_wiring_diagram.png)

The two potentiometers imitate the conditioned outputs of voltage and current
sensors. The ESP32 reads these signals, controls the relay, and updates the
OLED, LEDs, buzzer, keypad, and web dashboard. The green LED represents the
protected appliance.

## Real-product block diagram

```mermaid
flowchart LR
    Grid[AC grid] --> Fuse[Input fuse and protection]
    Fuse --> Contactor[Relay or contactor]
    Contactor --> Current[Isolated current sensor]
    Current --> Load[Protected appliance]

    Fuse --> Voltage[Isolated voltage sensor]
    Voltage --> VSignal[Signal conditioning]
    Current --> ISignal[Signal conditioning]
    VSignal --> ESP[ESP32 controller]
    ISignal --> ESP

    ESP --> Driver[Isolated relay driver]
    Driver --> Contactor
    Keypad[Keypad] --> ESP
    ESP --> Display[OLED and status indicators]
    ESP <--> MQTT[Wi-Fi and MQTT]
    MQTT <--> Web[Web dashboard]

    Supply[Isolated low-voltage supply] --> ESP
    Supply --> Voltage
    Supply --> Current
```

Wokwi does not simulate a real AC grid or the internal isolation and
conditioning circuits. In real hardware, the design would need suitable
isolation, fuses, clearances, input protection, and a correctly rated
relay/contactor. The simulated circuit must not be connected directly to mains
voltage.
