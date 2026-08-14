const DATA_URL = "../../data/words.json";
const AUDIO_DIR = "../../data/audio";

const progressEl = document.querySelector("#progress");
const scoreEl = document.querySelector("#score");
const promptEl = document.querySelector("#prompt");
const hintEl = document.querySelector("#hint");
const choicesEl = document.querySelector("#choices");
const feedbackEl = document.querySelector("#feedback");
const nextBtn = document.querySelector("#next");
const restartBtn = document.querySelector("#restart");
const speakBtn = document.querySelector("#speak");

let playback = null;
let speakToken = 0;
let words = [];
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

function optionsFor(word) {
  const pool = uniqueBy(
    words.filter((item) => item.id !== word.id),
    (item) => item.ru,
  );
  const distractors = shuffle(pool).slice(0, 3);
  return shuffle([word, ...distractors]);
}

function renderStatus() {
  progressEl.textContent = queue.length
    ? `Карточка ${seen + (answered ? 0 : 1)} из ${words.length}`
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

function speakWord(word) {
  if (!word) return;
  stopPlayback();
  const token = speakToken;
  const src = word.audio ? `${AUDIO_DIR}/${word.audio}` : "";
  if (!src) {
    speakWithTts(word.hy);
    return;
  }
  const audio = new Audio(src);
  playback = audio;
  audio.addEventListener("error", () => {
    if (token !== speakToken) return;
    speakWithTts(word.hy);
  });
  audio.play().catch(() => {
    if (token !== speakToken) return;
    speakWithTts(word.hy);
  });
}

function renderCard() {
  answered = false;
  current = queue[0] ?? null;
  feedbackEl.className = "feedback";
  feedbackEl.textContent = "";
  nextBtn.disabled = true;
  stopPlayback();

  if (!current) {
    promptEl.textContent = "Վերջ";
    hintEl.textContent =
      roundHint || "Ещё круг — или скажи те же слова вслух по примерам.";
    choicesEl.replaceChildren();
    speakBtn.hidden = true;
    renderStatus();
    return;
  }

  promptEl.textContent = current.hy;
  hintEl.textContent = "Какой смысл? Слушай слово, потом выбери перевод.";
  speakBtn.hidden = false;
  speakBtn.textContent = "Слушать";
  const options = optionsFor(current);
  choicesEl.replaceChildren(
    ...options.map((option) => {
      const button = document.createElement("button");
      button.className = "btn btn-choice";
      button.type = "button";
      button.textContent = option.ru;
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
    if (choice.textContent === current.ru) choice.classList.add("is-ok");
  }
  if (!ok) button.classList.add("is-bad");

  feedbackEl.className = ok ? "feedback" : "feedback is-bad";
  feedbackEl.replaceChildren();
  const verdict = document.createElement("strong");
  verdict.textContent = ok ? "Верно." : "Нет.";
  feedbackEl.append(verdict);
  if (current.example) {
    const hy = document.createElement("div");
    hy.className = "example-hy";
    hy.textContent = current.example.hy;
    const ru = document.createElement("div");
    ru.className = "muted";
    ru.textContent = current.example.ru;
    feedbackEl.append(hy, ru);
  }
  if (current.notes) {
    const note = document.createElement("div");
    note.className = "muted";
    note.textContent = current.notes;
    feedbackEl.append(note);
  }
  nextBtn.disabled = false;
  queue.shift();
  renderStatus();
  if (!queue.length) logRound();
}

function restart() {
  queue = shuffle(words);
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
        game: "слова",
        correct,
        total: seen,
        minutes,
      }),
    });
    if (!response.ok) throw new Error(String(response.status));
    roundHint = `В журнал: ${correct}/${seen}, ${minutes} мин. Ещё круг — или скажи примеры вслух.`;
  } catch {
    roundHint =
      "Журнал не записался — открой игру через ./Xfile serve. Ещё круг — или скажи примеры вслух.";
  }
  hintEl.textContent = roundHint;
}

speakBtn.addEventListener("click", () => {
  if (current) speakWord(current);
});
nextBtn.addEventListener("click", renderCard);
restartBtn.addEventListener("click", restart);

async function main() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    words = data.words ?? [];
    if (words.length < 4) throw new Error("too few words");
    restart();
  } catch (error) {
    progressEl.textContent = "Нет данных";
    promptEl.textContent = "?";
    hintEl.textContent = "Открой игры через ./Xfile serve из корня репо";
    console.error(error);
  }
}

main();
