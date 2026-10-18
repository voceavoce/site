import json, sys, wave, numpy as np, subprocess
S=sys.argv[1]
sync=json.load(open(S+"/sitecopy/content/player/locus-iste-bruckner/sync.json"))
sr=24000; n=int(sync["fine"]*sr)
freqs={"soprano":1500,"alto":1200,"tenore":900,"basso":700}
for name,f in freqs.items():
    x=np.zeros(n,dtype=np.float32)
    t=np.arange(n)/sr
    x+=0.03*np.sin(2*np.pi*f/4*t)
    for b in sync["battute"]:
        i=int(b["t"]*sr); L=int(0.04*sr)
        tt=np.arange(L)/sr
        x[i:i+L]+=(0.22*np.sin(2*np.pi*f*tt)*np.exp(-tt/0.012)).astype(np.float32)[:max(0,min(L,n-i))]
    w=f"{S}/audio/locus-iste-bruckner/v1/{name}.wav"
    with wave.open(w,"wb") as o:
        o.setnchannels(1);o.setsampwidth(2);o.setframerate(sr);o.writeframes((x*32767).astype("<i2").tobytes())
    for ext,args in (("opus",["-c:a","libopus","-b:a","64k","-ar","48000"]),("mp3",["-c:a","libmp3lame","-q:a","5"])):
        subprocess.run(["ffmpeg","-v","error","-y","-i",w]+args+[f"{S}/audio/locus-iste-bruckner/v1/{name}.{ext}"],check=True)
print("ok",n/sr)
