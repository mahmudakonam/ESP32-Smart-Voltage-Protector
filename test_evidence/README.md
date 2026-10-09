# Test evidence checklist

Firmware build verified locally with ESP32 Arduino core 3.3.11:

- Program storage: 980,375 bytes (74%).
- Dynamic memory: 49,148 bytes (14%).
- Build result: successful.

Capture screenshots or logs for these cases before submission:

| Test | Stimulus | Expected result |
| --- | --- | --- |
| Startup latch | Start simulation | Relay off; startup state shown |
| Healthy reset | Nominal V/I, request reset | Relay on after configured delay |
| Over-voltage | Raise voltage above `v_max` | Immediate trip and latched fault |
| Under-voltage | Lower voltage below `v_min` | Immediate trip and latched fault |
| Over-current | Raise current above `i_max` | Immediate trip and latched fault |
| Sudden surge | Increase voltage by `surge_step_v` between samples | Surge trip |
| Unsafe reset | Request reset while fault remains | Relay stays off |
| Keypad settings | Edit and save each field | OLED confirmation and persistence |
| Remote settings | Publish profile from dashboard | Device acknowledgement and new limits |
| MQTT outage | Disconnect network/broker | Local protection remains operational |
| Master power OFF | Press blue power button / `P` | Relay/load, LEDs, buzzer, OLED and network turn off |
| Master power ON | Press blue power button / `P` again | Blue LED on; yellow reset-required state; load remains off |

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
