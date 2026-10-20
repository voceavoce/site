#!/usr/bin/env python3
"""Genera i campioni degli strumenti del player (docs/midi-player.md, §4 strada C).

Per ogni strumento: una nota ogni 3 semitoni resa con FluidSynth dal soundfont GeneralUser GS (lo stesso della
pipeline), a 32 kHz mono, impilate in UN solo MP3 con "slot" di durata fissa. Il browser decodifica il file una
volta e suona la nota piu' vicina cambiando la velocita' di lettura (`playbackRate`), con loop sul tratto stabile
per gli strumenti a suono tenuto.

Uso (servono fluidsynth, ffmpeg, numpy):
    python3 tools/strumenti/genera.py --soundfont /percorso/GeneralUser-GS.sf2 [--out src/assets/strumenti]

Scrive <out>/<id>.mp3 e <out>/strumenti.json. Licenza del soundfont: vedi src/assets/strumenti/LICENSE-GeneralUser-GS.txt.
Rigenerare solo se cambia il catalogo: i file sono in git.
"""
import argparse
import json
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 32000
PAD = 0.10          # silenzio prima dell'attacco, dentro lo slot (assorbe il ritardo di codifica dell'MP3)
NOTE_MIN, NOTE_MAX, STEP = 24, 102, 3
VEL = 90
TARGET_RMS = 0.07   # livello di riferimento (lineare) per equalizzare gli strumenti fra loro

# id, programma GM (0-based), durata della nota (s), coda dopo il rilascio (s), loop (inizio, lunghezza max) o None
STRUMENTI = [
    {"id": "pianoforte", "nome": {"it": "Pianoforte", "en": "Piano", "es": "Piano", "de": "Klavier", "fr": "Piano"},
     "programma": 0, "tenuto": False, "durata": 3.6, "coda": 0.05},
    {"id": "organo", "nome": {"it": "Organo", "en": "Organ", "es": "Órgano", "de": "Orgel", "fr": "Orgue"},
     "programma": 19, "tenuto": True, "durata": 3.2, "coda": 0.05},
    {"id": "coro", "nome": {"it": "Coro «aah»", "en": "Choir “aah”", "es": "Coro «aah»", "de": "Chor „aah“", "fr": "Chœur « aah »"},
     "programma": 52, "tenuto": True, "durata": 3.2, "coda": 0.05},
    {"id": "voce", "nome": {"it": "Voce «ooh»", "en": "Voice “ooh”", "es": "Voz «ooh»", "de": "Stimme „ooh“", "fr": "Voix « ooh »"},
     "programma": 53, "tenuto": True, "durata": 3.2, "coda": 0.05},
    {"id": "flauto", "nome": {"it": "Flauto", "en": "Flute", "es": "Flauta", "de": "Flöte", "fr": "Flûte"},
     "programma": 73, "tenuto": True, "durata": 3.0, "coda": 0.05},
    {"id": "archi", "nome": {"it": "Archi", "en": "Strings", "es": "Cuerdas", "de": "Streicher", "fr": "Cordes"},
     "programma": 48, "tenuto": True, "durata": 3.2, "coda": 0.05},
]

LOOP_INIZIO = 1.2   # s dall'attacco: l'attacco e il transitorio restano fuori dal loop
LOOP_MIN, LOOP_MAX = 0.8, 1.5   # lunghezza del loop cercata (s)
FINESTRA = 0.005     # confronto delle forme d'onda attorno ai punti di raccordo (s)
DISSOLVENZA = 0.06   # chiusura della nota a fine slot: niente code che sconfinano nello slot dopo (s)


def chiudi_slot(dati, n_slot, durata):
    """Azzera tutto dopo la nota (code del rilascio comprese) con una breve dissolvenza."""
    fine = int((PAD + durata) * SR)
    f = int(DISSOLVENZA * SR)
    for i in range(len(dati) // n_slot):
        base = i * n_slot
        dati[base + fine - f: base + fine] *= np.linspace(1, 0, f, dtype=np.float32)
        dati[base + fine: base + n_slot] = 0
    return dati


def trova_loop(seg):
    """Punti di raccordo (inizio, fine) in campioni dentro lo slot: il `fine` in [inizio+LOOP_MIN, inizio+LOOP_MAX]
    che rende piu' simili le forme d'onda attorno ai due punti (si salta da `fine` a `inizio` senza scatto).
    Ritorna anche l'errore relativo (0 = identico)."""
    w = int(FINESTRA * SR)
    a = int((PAD + LOOP_INIZIO) * SR)
    rif = seg[a - w: a + w]
    migliore = (None, 1e9)
    for b in range(a + int(LOOP_MIN * SR), a + int(LOOP_MAX * SR)):
        err = float(np.sum((seg[b - w: b + w] - rif) ** 2))
        if err < migliore[1]:
            migliore = (b, err)
    energia = float(np.sum(rif ** 2)) or 1e-9
    return a, migliore[0], (migliore[1] / energia) ** 0.5


def vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def midi_file(programma, eventi, ticks=960):
    """SMF formato 0, 120 bpm con 480 tick per quarto => 960 tick al secondo."""
    ev = [(0, bytes([0xC0, programma]))]
    for t_on, t_off, nota in eventi:
        ev.append((int(round(t_on * ticks)), bytes([0x90, nota, VEL])))
        ev.append((int(round(t_off * ticks)), bytes([0x80, nota, 0])))
    ev.sort(key=lambda e: e[0])
    trk = bytearray()
    trk += vlq(0) + bytes([0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20])  # tempo 500000 us/quarto
    prev = 0
    for t, b in ev:
        trk += vlq(t - prev) + b
        prev = t
    trk += vlq(0) + bytes([0xFF, 0x2F, 0x00])
    return b"MThd" + struct.pack(">IHHH", 6, 0, 1, 480) + b"MTrk" + struct.pack(">I", len(trk)) + bytes(trk)


def rendi(soundfont, strumento, tmp):
    note = list(range(NOTE_MIN, NOTE_MAX + 1, STEP))
    slot = PAD + strumento["durata"] + strumento["coda"]
    eventi = [(i * slot + PAD, i * slot + PAD + strumento["durata"], n) for i, n in enumerate(note)]
    mid = tmp / f"{strumento['id']}.mid"
    wav = tmp / f"{strumento['id']}.wav"
    mid.write_bytes(midi_file(strumento["programma"], eventi))
    subprocess.run(
        ["fluidsynth", "-ni", "-q", "-r", str(SR), "-g", "1.0",
         "-o", "synth.reverb.active=0", "-o", "synth.chorus.active=0",
         "-F", str(wav), str(soundfont), str(mid)], check=True, capture_output=True)
    with wave.open(str(wav)) as w:
        nch, n = w.getnchannels(), w.getnframes()
        dati = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768.0
    if nch == 2:
        dati = dati.reshape(-1, 2).mean(axis=1)
    return note, slot, dati


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--soundfont", required=True)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "src" / "assets" / "strumenti"))
    ap.add_argument("--kbps", type=int, default=40)
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    catalogo = {"schema": 1, "campioni_per_slot": None, "strumenti": []}
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for s in STRUMENTI:
            note, slot, dati = rendi(args.soundfont, s, tmp)
            n_slot = int(round(slot * SR))
            # equalizzazione: RMS del tratto stabile (0,3-1,2 s dall'attacco) medio su tutte le note
            rms = []
            for i in range(len(note)):
                a = i * n_slot + int((PAD + 0.3) * SR)
                b = i * n_slot + int((PAD + 1.2) * SR)
                seg = dati[a:b]
                if len(seg):
                    rms.append(float(np.sqrt(np.mean(seg ** 2))))
            livello = float(np.mean(rms)) or 1e-6
            gain = TARGET_RMS / livello
            picco = float(np.max(np.abs(dati)))
            norm = min(gain, 0.95 / picco) if picco else 1.0  # il guadagno rimasto lo applica il browser
            dati = np.clip(dati * norm, -1, 1)
            dati = chiudi_slot(dati, n_slot, s['durata'])
            loops, errori = [], []
            if s['tenuto']:
                for i in range(len(note)):
                    a, b, e = trova_loop(dati[i * n_slot:(i + 1) * n_slot])
                    loops.append([round(a / SR, 5), round(b / SR, 5)])
                    errori.append(e)
            residuo = gain / norm
            wav_n = tmp / f"{s['id']}-n.wav"
            with wave.open(str(wav_n), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(SR)
                w.writeframes((dati * 32767).astype("<i2").tobytes())
            mp3 = out / f"{s['id']}.mp3"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_n), "-ac", "1", "-ar", str(SR),
                            "-c:a", "libmp3lame", "-b:a", f"{args.kbps}k", str(mp3)], check=True)
            voce = {"id": s["id"], "nome": s["nome"], "file": f"{s['id']}.mp3", "programma": s["programma"],
                    "note": note, "slot": round(slot, 4), "pad": PAD, "durata": s["durata"],
                    "guadagno": round(residuo, 3)}
            if s["tenuto"]:
                voce["loop"] = loops  # per nota: [inizio, fine] in secondi dall'inizio dello slot
            catalogo["strumenti"].append(voce)
            extra = f"  errore loop mediano {np.median(errori):.2f} max {max(errori):.2f}" if errori else ""
            print(f"{s['id']:11s} {mp3.stat().st_size/1024:7.0f} KB{extra}")
    catalogo["campioni_per_slot"] = 1
    (out / "strumenti.json").write_text(json.dumps(catalogo, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tot = sum(f.stat().st_size for f in out.glob("*.mp3"))
    print(f"totale {tot/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
