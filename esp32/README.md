# ESP32 Jarvis Box — assets & tools

Stripped-down Jarvis: ESP32-S3 + INMP441 mic + MAX98357A amp + tiny speaker,
talking to the existing Jarvis API server (Whisper → LLM → ElevenLabs).

## The chime

A soft three-note bell arpeggio (C5 → E5 → G5, 1.62s, 16 kHz/16-bit/mono) used
as the "I'm thinking…" cue between you speaking and Jarvis replying.

| File | What it is |
|---|---|
| `assets/jarvis-chime.wav` | Standard WAV — play it from SPIFFS/SD, or listen on your PC |
| `assets/jarvis-chime.h` | Same audio as a `PROGMEM` `int16_t` array — zero-decode playback |
| `tools/make_chime.py` | The synthesizer. `python3 tools/make_chime.py [freq...]` to tweak notes |

## Playing it on the ESP32 (no decoder needed)

```cpp
#include "assets/jarvis-chime.h"          // JARVIS_CHIME[] + JARVIS_CHIME_NUM_SAMPLES
#include <driver/i2s_std.h>               // I2S already at 16 kHz / 16-bit / mono

void playChime() {
  size_t written = 0;
  i2s_write(I2S_NUM_0, JARVIS_CHIME, sizeof(JARVIS_CHIME), &written, portMAX_DELAY);
}
```

If you'd rather use the `ESP32-audioI2S` library instead (it handles MP3/WAV
from URLs/SPIFFS), copy `assets/jarvis-chime.wav` to SPIFFS and call
`player.playFile("/jarvis-chime.wav")`.

## Tweak the sound

Edit the notes / partials at the top of `make_chime.py` and rerun:

```sh
python3 esp32/tools/make_chime.py           # defaults: 523.25 659.25 783.99 Hz
python3 esp32/tools/make_chime.py 587.33 880  # try a different arpeggio
```

Then reflash — both the WAV and the header regenerate together.

> Why synthesize instead of downloading a sample? It's 0 €, no licensing,
> tiny (~50 KB), and you can reshape it to sound however you like.
