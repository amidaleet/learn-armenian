# Audio sources

`alphabet-eastern.mp3` is the Wikimedia Commons transcode of
[Armenian alphabet (Eastern Armenian).ogg](https://commons.wikimedia.org/wiki/File:Armenian_alphabet_(Eastern_Armenian).ogg)
by [Vahagn Petrosyan](https://commons.wikimedia.org/wiki/User:Vahagn_Petrosyan),
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

The game plays `letters/{id}.wav` — slices from that recitation. The recording has 40 names: 38 classical letters (including ւ) plus ու and և. Letter ւ is not in the deck; ու and և are the last two names.

Example words are `examples/{id}.wav`: Eastern Armenian pronunciations from Wiktionary (`Hy-….ogg`) and [Lingua Libre](https://lingualibre.org/) (`hye`, Vahagn Petrosyan). `է` and `և` reuse the letter-name clips.

Word-game clips are `words/{id}.wav` — the same Commons / Lingua Libre recordings, converted to 44.1 kHz mono. Sources are listed in `audio/words.json`. A few everyday words still have no public clip (`հիմա`, `ուշ`, `քամի`, `կանգառ`, `ինչու`, `ներեցեք`).

