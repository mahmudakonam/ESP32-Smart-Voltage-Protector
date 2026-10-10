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
    subgraph Mains["Mains side"]
        Line[AC line] --> Fuse[Input fuse]
        Fuse --> ProtectedLine[Protected line]
        ProtectedLine --> Contact[Normally-open relay contact]
        Contact --> CurrentSensor[Isolated current transducer]
        CurrentSensor --> Appliance[Protected appliance]
        Appliance --> Neutral[AC neutral]

        ProtectedLine --> SurgeProtection[MOV or surge-protection device]
        Neutral --> SurgeProtection
        ProtectedLine --> VoltageSensor[Isolated voltage transducer]
        Neutral --> VoltageSensor
        ProtectedLine --> PowerSupply[Isolated AC-DC power supply]
        Neutral --> PowerSupply
    end

    subgraph Control["Safe low-voltage control side"]
        PowerSupply --> Rails[Regulated 5 V and 3.3 V rails]

        VoltageSensor --> VoltageConditioning[Voltage RMS-to-DC and 0-3.3 V conditioning]
        CurrentSensor --> CurrentConditioning[Current RMS-to-DC and 0-3.3 V conditioning]
        VoltageConditioning -->|GPIO34 ADC| ESP[ESP32 protection controller]
        CurrentConditioning -->|GPIO35 ADC| ESP

        ESP -->|GPIO26| RelayDriver[Isolated relay driver]
        Rails --> RelayDriver
        RelayDriver --> Coil[Relay or contactor coil]
        Coil -. Mechanical operation .-> Contact

        PowerButton[System ON/OFF pushbutton] -->|GPIO4| ESP
        Keypad[4 x 4 keypad] --> ESP
        ESP <--> OLED[OLED display]
        ESP --> Indicators[Red, yellow, green and blue indicators]
        ESP --> Buzzer[Fault buzzer]

        ESP <--> Network[Wi-Fi and MQTT]
        Network <--> Dashboard[Remote web dashboard]

        Rails --> ESP
        Rails --> VoltageConditioning
        Rails --> CurrentConditioning
        Rails --> OLED
    end
```

The voltage sensor is connected before the relay and measures across line and
neutral. This allows the controller to check the grid voltage while the load is
disconnected. The current sensor is in series with the protected load.

Only isolated, conditioned 0-3.3 V signals reach ESP32 GPIO34 and GPIO35. GPIO26
controls the relay coil through a driver; the coil operates the mains contact
mechanically. The blue pushbutton is a controller input, not a mains isolator.

Wokwi replaces both sensing channels with potentiometers and replaces the
appliance with a green LED. A real unit would require certified isolation,
correct fuse and surge-protection ratings, safe creepage and clearance, ADC
input protection, and a relay or contactor rated for the appliance. The
simulated circuit must not be connected directly to mains voltage.
