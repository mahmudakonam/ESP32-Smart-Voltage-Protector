# Test evidence checklist

Firmware build verified locally with ESP32 Arduino core 3.3.11:

- Program storage: 980,375 bytes (74%).
- Dynamic memory: 49,148 bytes (14%).
- Build result: successful.

Capture screenshots or logs for these cases before submission:

| Test | Stimulus | Expected result | Evidence |
| --- | --- | --- | --- |
| Startup latch | Start simulation | Relay off; startup state shown | — |
| Healthy reset | Nominal V/I, request reset | Relay on after configured delay | [figures/01](figures/01_normal_operation_load_on.png) |
| Over-voltage | Raise voltage above `v_max` | Immediate trip and latched fault | [figures/03](figures/03_overvoltage_fault_trip.png), [figures/04](figures/04_oled_overvoltage_detail.png), [figures/08](figures/08_web_dashboard_fault_history.png) |
| Under-voltage | Lower voltage below `v_min` | Immediate trip and latched fault | — |
| Over-current | Raise current above `i_max` | Immediate trip and latched fault | [figures/02](figures/02_overcurrent_fault_trip.png), [figures/08](figures/08_web_dashboard_fault_history.png) |
| Sudden surge | Increase voltage by `surge_step_v` between samples | Surge trip | [figures/09](figures/09_web_dashboard_activity_log.png) |
| Unsafe reset | Request reset while fault remains | Relay stays off | — |
| Keypad settings | Edit and save each field | OLED confirmation and persistence | [figures/05](figures/05_settings_menu_overview.png), [figures/06](figures/06_settings_menu_edit_min_voltage.png) |
| Remote settings | Publish profile from dashboard | Device acknowledgement and new limits | [figures/07](figures/07_web_dashboard_normal_operation.png) |
| MQTT outage | Disconnect network/broker | Local protection remains operational | — |
| Master power OFF | Press blue power button / `P` | Relay/load, LEDs, buzzer, OLED and network turn off | — |
| Master power ON | Press blue power button / `P` again | Blue LED on; yellow reset-required state; load remains off | — |

Still outstanding: startup-latch, under-voltage, unsafe-reset, MQTT-outage, and
master-power screenshots/logs — capture and link them here before final
submission.

After a fault clears but before reset, serial output intentionally separates the
live condition from the safety latch, for example:

```text
V: 233.3 I: 4.93 LOAD: OFF ACTIVE: NORMAL LATCHED: OVER CURRENT RESET: REQUIRED
```

This means the measurement is healthy now, while the load remains disconnected
until the operator requests a safe reset.

## Indicator-state verification

| Electrical condition | Red fault LED | Yellow reconnect LED | Green protected load | Relay |
| --- | --- | --- | --- | --- |
| Active fault | ON | OFF | OFF | Open |
| Fault cleared, reset required | OFF | ON | OFF | Open |
| Reset requested, waiting delay | OFF | ON | OFF | Open |
| Healthy and reconnected | OFF | OFF | ON | Closed |
| Fault returns during delay | ON | OFF | OFF | Open; reset cancelled |

The reset command is rejected while an electrical fault is active. The buzzer
sounds only with the red active-fault state and stops when the readings recover.
