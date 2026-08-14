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
const speakExampleBtn = document.querySelector("#speak-example");

const AUDIO_META_URL = "../../data/audio/clips.json";
const EXAMPLES_META_URL = "../../data/audio/examples.json";
const AUDIO_DIR = "../../data/audio";

let playback = null;
let speakToken = 0;
let clips = {};
let examples = {};

let letters = [];
let queue = [];
let current = null;
let answered = false;
let correct = 0;
let seen = 0;

let roundStartedAt = 0;
let roundLogged = false;
let roundHint = "";

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

function speakWithTts(text) {
  if (!("speechSynthesis" in window) || !text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "hy-AM";
  const voice = speechSynthesis
    .getVoices()
    .find((item) => item.lang.toLowerCase().startsWith("hy"));
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

function playSrc(src, ttsText) {
  stopPlayback();
  const token = speakToken;
  const audio = new Audio(src);
  playback = audio;
  audio.addEventListener("error", () => {
    if (token !== speakToken) return;
    speakWithTts(ttsText);
  });
  audio.play().catch(() => {
    if (token !== speakToken) return;
    speakWithTts(ttsText);
  });
}

function speakLetter(letter) {
  const clip = clips[letter.id];
  const src = clip?.file
    ? `${AUDIO_DIR}/${clip.file}`
    : `${AUDIO_DIR}/letters/${letter.id}.wav`;
  playSrc(src, letter.name_hy);
}

function speakExample(letter) {
  const clip = examples[letter.id];
  const text = letter.example?.hy || letter.name_hy;
  const src = clip?.file
    ? `${AUDIO_DIR}/${clip.file}`
    : `${AUDIO_DIR}/examples/${letter.id}.wav`;
  playSrc(src, text);
}

function renderCard() {
  answered = false;
  current = queue[0] ?? null;
  feedbackEl.className = "feedback";
  feedbackEl.textContent = "";
  nextBtn.disabled = true;
  speakBtn.hidden = true;
  speakExampleBtn.hidden = true;
  stopPlayback();

  if (!current) {
    promptEl.textContent = "Վերջ";
    hintEl.textContent =
      roundHint || "Ещё круг — или иди читать вслух те же буквы без вариантов.";
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
  if (current.example?.hy) {
    speakExampleBtn.hidden = false;
    speakExampleBtn.textContent = current.example.hy;
  }
  queue.shift();
  renderStatus();
  if (!queue.length) logRound();
}

function restart() {
  queue = shuffle(letters);
  current = null;
  answered = false;
  correct = 0;
  seen = 0;
  roundStartedAt = Date.now();
  roundLogged = false;
  roundHint = "";
  renderCard();
}

async function logRound() {
  if (roundLogged || !seen) return;
  roundLogged = true;
  const minutes = Math.max(0, Math.round((Date.now() - roundStartedAt) / 60000));
  try {
    const response = await fetch("/log/round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: "алфавит",
        correct,
        total: seen,
        minutes,
      }),
    });
    if (!response.ok) throw new Error(String(response.status));
    roundHint = `В журнал: ${correct}/${seen}, ${minutes} мин. Ещё круг — или читай вслух.`;
  } catch {
    roundHint =
      "Журнал не записался — открой игру через ./Xfile serve. Ещё круг — или читай вслух.";
  }
  hintEl.textContent = roundHint;
}

speakBtn.addEventListener("click", () => {
  if (current) speakLetter(current);
});
speakExampleBtn.addEventListener("click", () => {
  if (current) speakExample(current);
});
nextBtn.addEventListener("click", renderCard);
restartBtn.addEventListener("click", restart);

async function main() {
  try {
    const [lettersRes, clipsRes, examplesRes] = await Promise.all([
      fetch(DATA_URL),
      fetch(AUDIO_META_URL),
      fetch(EXAMPLES_META_URL),
    ]);
    if (!lettersRes.ok) throw new Error(String(lettersRes.status));
    const data = await lettersRes.json();
    letters = data.letters ?? [];
    if (!letters.length) throw new Error("empty alphabet");
    if (clipsRes.ok) {
      const audioMeta = await clipsRes.json();
      clips = audioMeta.clips ?? {};
    }
    if (examplesRes.ok) {
      const exampleMeta = await examplesRes.json();
      examples = exampleMeta.clips ?? {};
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
