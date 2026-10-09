# Product block diagram

```mermaid
flowchart LR
    USB[Isolated USB / 5 V supply] --> Master[Master power switch]
    Master --> LogicRail[Controller 5 V / 3.3 V rail]
    Master --> SensorRail[Separate regulated 3.3 V sensor rail]
    LogicRail --> ESP[ESP32 controller]
    Grid[Low-voltage grid stand-in] --> SensorV[Isolated voltage sensor / conditioner]
    LoadLine[Low-voltage load stand-in] --> SensorI[Current sensor / conditioner]
    SensorRail --> SensorV
    SensorRail --> SensorI
    SensorV -->|Conditioned 0-3.3 V output| ADC[ESP32 ADC]
    SensorI -->|Conditioned 0-3.3 V output| ADC
    SensorV --- AGND[Common ADC reference ground]
    SensorI --- AGND
    AGND --- ESP
    ESP --> FSM[Protection state machine]
    ADC --> FSM
    Keypad[4 × 4 keypad] --> FSM
    FSM --> OLED[OLED status display]
    FSM --> Alarm[Fault LED and buzzer]
    FSM --> Reconnect[Yellow manual-reconnect LED]
    FSM --> Driver[Isolated relay driver]
    Driver --> Contactor[Load contactor / relay]
    Contactor --> Load[Green protected lamp/load]
    FSM <--> MQTT[Wi-Fi + MQTT]
    MQTT <--> Browser[Remote web dashboard]
```

The Wokwi knobs are presented as powered sensor-output emulators. They use a
separate labelled 3.3 V sensor rail and provide conditioned ADC signals that the
firmware converts to 150-300 V RMS and 0-10 A RMS. Their ground joins the ESP32
ground only to provide the ADC reference. Wokwi does not simulate the internal
isolation or analog conditioning circuitry.

In real hardware, the master switch must disable both the controller and sensor
rails. A real product would also require galvanic isolation, input fusing,
correctly rated clearances, ADC over-voltage protection, and a properly rated
relay/contactor driver.
