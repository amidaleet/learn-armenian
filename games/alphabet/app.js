const DATA_URL = "../../data/alphabet.json";

const progressEl = document.querySelector("#progress");
const scoreEl = document.querySelector("#score");
const promptEl = document.querySelector("#prompt");
const hintEl = document.querySelector("#hint");
const choicesEl = document.querySelector("#choices");
const feedbackEl = document.querySelector("#feedback");
const nextBtn = document.querySelector("#next");
const restartBtn = document.querySelector("#restart");
const speakBtn = document.querySelector("#speak");

const AUDIO_META_URL = "../../data/audio/clips.json";
const AUDIO_DIR = "../../data/audio";

let playback = null;
let speakToken = 0;
let clips = {};

let letters = [];
let queue = [];
let current = null;
let answered = false;
let correct = 0;
let seen = 0;

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function uniqueBy(items, keyFn) {
  const seenKeys = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

function optionsFor(letter) {
  const pool = uniqueBy(
    letters.filter((item) => item.id !== letter.id),
    (item) => item.ru_approx,
  );
  const distractors = shuffle(pool).slice(0, 3);
  return shuffle([letter, ...distractors]);
}

function renderStatus() {
  progressEl.textContent = queue.length
    ? `Карточка ${seen + (answered ? 0 : 1)} из ${letters.length}`
    : "Колода пройдена";
  scoreEl.textContent = seen ? `Верно ${correct} / ${seen}` : "";
}

function stopPlayback() {
  speakToken += 1;
  if (playback) {
    playback.pause();
    playback.removeAttribute("src");
    playback = null;
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function speakWithTts(letter) {
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(letter.name_hy);
  utter.lang = "hy-AM";
  const voice = speechSynthesis
    .getVoices()
    .find((item) => item.lang.toLowerCase().startsWith("hy"));
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

function speakLetter(letter) {
  stopPlayback();
  const clip = clips[letter.id];
  const src = clip?.file
    ? `${AUDIO_DIR}/${clip.file}`
    : `${AUDIO_DIR}/letters/${letter.id}.wav`;
  const token = speakToken;
  const audio = new Audio(src);
  playback = audio;
  audio.addEventListener("error", () => {
    if (token !== speakToken) return;
    speakWithTts(letter);
  });
  audio.play().catch(() => {
    if (token !== speakToken) return;
    speakWithTts(letter);
  });
}

function renderCard() {
  answered = false;
  current = queue[0] ?? null;
  feedbackEl.className = "feedback";
  feedbackEl.textContent = "";
  nextBtn.disabled = true;
  speakBtn.hidden = true;
  stopPlayback();

  if (!current) {
    promptEl.textContent = "Վերջ";
    hintEl.textContent = "Ещё круг — или иди читать вслух те же буквы без вариантов.";
    choicesEl.replaceChildren();
    renderStatus();
    return;
  }

  promptEl.textContent = `${current.upper} ${current.lower}`;
  hintEl.textContent = "Какой звук?";
  const options = optionsFor(current);
  choicesEl.replaceChildren(
    ...options.map((option) => {
      const button = document.createElement("button");
      button.className = "btn btn-choice";
      button.type = "button";
      button.textContent = option.ru_approx;
      button.addEventListener("click", () => choose(option, button));
      return button;
    }),
  );
  renderStatus();
}

function choose(option, button) {
  if (answered || !current) return;
  answered = true;
  seen += 1;
  const ok = option.id === current.id;
  if (ok) correct += 1;

  for (const choice of choicesEl.querySelectorAll("button")) {
    choice.disabled = true;
    if (choice.textContent === current.ru_approx) choice.classList.add("is-ok");
  }
  if (!ok) button.classList.add("is-bad");

  const example = current.example
    ? `${current.example.hy} — ${current.example.ru}`
    : "";
  const note = current.notes ? ` ${current.notes}` : "";
  feedbackEl.className = ok ? "feedback" : "feedback is-bad";
  feedbackEl.innerHTML = `<strong>${ok ? "Верно" : "Нет"}.</strong> ${current.name_hy}, ${current.ipa}. ${example}.${note}`;
  nextBtn.disabled = false;
  speakBtn.hidden = false;
  queue.shift();
  renderStatus();
}

function restart() {
  queue = shuffle(letters);
  current = null;
  answered = false;
  correct = 0;
  seen = 0;
  renderCard();
}

speakBtn.addEventListener("click", () => {
  if (current) speakLetter(current);
});
nextBtn.addEventListener("click", renderCard);
restartBtn.addEventListener("click", restart);

async function main() {
  try {
    const [lettersRes, clipsRes] = await Promise.all([
      fetch(DATA_URL),
      fetch(AUDIO_META_URL),
    ]);
    if (!lettersRes.ok) throw new Error(String(lettersRes.status));
    const data = await lettersRes.json();
    letters = data.letters ?? [];
    if (!letters.length) throw new Error("empty alphabet");
    if (clipsRes.ok) {
      const audioMeta = await clipsRes.json();
      clips = audioMeta.clips ?? {};
    }
    restart();
  } catch (error) {
    progressEl.textContent = "Нет данных";
    promptEl.textContent = "?";
    hintEl.textContent =
      "Открой игры через ./Xfile serve из корня репо";
    console.error(error);
  }
}

main();
