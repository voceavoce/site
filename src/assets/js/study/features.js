// Interruttori delle funzioni del player. Servono a spegnere/accendere i moduli (futuro premium) senza toccare il resto.
export const features = {
  mixer: true,
  loop: true,
  tempo: true,
  download: false, // predisposto, spento: vedi download.js
};

export const isOn = (name) => features[name] === true;
