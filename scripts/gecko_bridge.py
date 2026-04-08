#!/usr/bin/env python3
"""
Gecko in.Touch 2 bridge — connects via local UDP (geckolib) and outputs JSON.

Usage:
  python3 gecko_bridge.py <spa_ip>
  python3 gecko_bridge.py discover

Output (JSON to stdout):
  {
    "ok": true,
    "spaName": "...",
    "spaId": "...",
    "temperature": 37.5,
    "setPoint": 38.0,
    "heatingStatus": "Heating",
    "pumps": [{"id": "P1", "active": true, "speed": null}, ...],
    "lights": [{"id": "L1", "active": false}, ...],
    "watercare": "Standard"
  }

On error:
  { "ok": false, "error": "message" }
"""

import asyncio
import json
import sys
import signal


def timeout_handler(signum, frame):
    print(json.dumps({"ok": False, "error": "Connection timeout (30s)"}))
    sys.exit(1)


# Set a hard 30-second timeout
signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(30)

try:
    from geckolib import GeckoAsyncSpaMan, GeckoSpaEvent  # type: ignore
except ImportError:
    print(json.dumps({"ok": False, "error": "geckolib not installed — run: pip3 install geckolib"}))
    sys.exit(1)


CLIENT_ID = "SW1M5P4-D45HB04RD"


class BridgeSpaMan(GeckoAsyncSpaMan):
    """Minimal spa manager that connects, reads data, and exits."""

    def __init__(self, client_id: str, spa_address: str | None = None):
        super().__init__(client_id)
        self._spa_address = spa_address
        self._result: dict | None = None
        self._done = asyncio.Event()
        self._discovery_results: list[dict] = []

    async def handle_event(self, event: GeckoSpaEvent, **kwargs) -> None:
        pass  # Required override — we drive the flow ourselves

    async def discover(self) -> list[dict]:
        """Discover spas on the local network."""
        async with self:
            await self.async_locate_spas(
                spa_address=self._spa_address
            )
            await asyncio.sleep(5)  # Wait for discovery responses
            results = []
            for descriptor in self.spa_descriptors:
                results.append({
                    "spaId": descriptor.identifier_as_string,
                    "spaName": descriptor.name,
                    "address": descriptor.ipaddress,
                })
            return results

    async def read_state(self) -> dict:
        """Connect to the spa and read its current state."""
        async with self:
            # Locate the spa
            await self.async_locate_spas(spa_address=self._spa_address)
            await asyncio.sleep(3)

            if not self.spa_descriptors:
                return {"ok": False, "error": f"No spa found at {self._spa_address}"}

            descriptor = self.spa_descriptors[0]

            # Connect
            await self.async_connect(
                spa_identifier=descriptor.identifier_as_string,
                spa_address=self._spa_address,
            )

            # Wait for the facade to be ready
            ready = await self.wait_for_facade()
            if not ready or not self.facade:
                return {"ok": False, "error": "Failed to establish spa connection"}

            facade = self.facade

            # Read data
            result: dict = {
                "ok": True,
                "spaName": descriptor.name,
                "spaId": descriptor.identifier_as_string,
            }

            # Water heater / temperature
            try:
                wh = facade.water_heater
                result["temperature"] = wh.current_temperature
                result["setPoint"] = wh.target_temperature
                result["heatingStatus"] = wh.current_operation
                result["minTemp"] = wh.min_temp
                result["maxTemp"] = wh.max_temp
                result["tempUnit"] = wh.temperature_unit
            except Exception as e:
                result["temperature"] = None
                result["setPoint"] = None
                result["heatingStatus"] = None
                result["_heaterError"] = str(e)

            # Pumps
            pumps = []
            try:
                for pump in facade.pumps:
                    pumps.append({
                        "id": pump.name,
                        "active": pump.is_on if hasattr(pump, "is_on") else False,
                        "mode": str(pump.mode) if hasattr(pump, "mode") else None,
                    })
            except Exception:
                pass
            result["pumps"] = pumps

            # Lights
            lights = []
            try:
                for light in facade.lights:
                    lights.append({
                        "id": light.name,
                        "active": light.is_on if hasattr(light, "is_on") else False,
                    })
            except Exception:
                pass
            result["lights"] = lights

            # Blowers
            blowers = []
            try:
                for blower in facade.blowers:
                    blowers.append({
                        "id": blower.name,
                        "active": blower.is_on if hasattr(blower, "is_on") else False,
                    })
            except Exception:
                pass
            result["blowers"] = blowers

            # Watercare mode
            try:
                result["watercare"] = str(facade.water_care.active_mode) if facade.water_care else None
            except Exception:
                result["watercare"] = None

            # Sensors
            sensors = []
            try:
                for sensor in facade.sensors:
                    sensors.append({
                        "id": sensor.name,
                        "value": sensor.state,
                        "unit": getattr(sensor, "unit_of_measurement", None),
                    })
            except Exception:
                pass
            result["sensors"] = sensors

            return result


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Usage: gecko_bridge.py <spa_ip|discover>"}))
        sys.exit(1)

    command = sys.argv[1]

    if command == "discover":
        # Broadcast discovery
        spa_man = BridgeSpaMan(CLIENT_ID)
        try:
            results = await spa_man.discover()
            print(json.dumps({"ok": True, "spas": results}))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
    else:
        # Connect to specific IP and read state
        spa_ip = command
        spa_man = BridgeSpaMan(CLIENT_ID, spa_address=spa_ip)
        try:
            result = await spa_man.read_state()
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))


if __name__ == "__main__":
    asyncio.run(main())
