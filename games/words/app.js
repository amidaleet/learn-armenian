const DATA_URL = "../../data/words.json";
const AUDIO_DIR = "../../data/audio";

const packScreen = document.querySelector("#pack-screen");
const playScreen = document.querySelector("#play-screen");
const packsEl = document.querySelector("#packs");
const packHintEl = document.querySelector("#pack-hint");
const progressEl = document.querySelector("#progress");
const scoreEl = document.querySelector("#score");
const promptEl = document.querySelector("#prompt");
const heardEl = document.querySelector("#heard");
const hintEl = document.querySelector("#hint");
const choicesEl = document.querySelector("#choices");
const feedbackEl = document.querySelector("#feedback");
const nextBtn = document.querySelector("#next");
const restartBtn = document.querySelector("#restart");
const speakBtn = document.querySelector("#speak");
const packsBackBtn = document.querySelector("#packs-back");

let playback = null;
let speakToken = 0;
let packs = [];
let allWords = [];
let deck = [];
let queue = [];
let current = null;
let selectedPack = null;
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

function wordsForPack(pack) {
  if (!pack || pack.all) return allWords;
  return allWords.filter((word) => (word.packs ?? []).includes(pack.id));
}

function optionsFor(word) {
  const source = deck.length >= 4 ? deck : allWords;
  const pool = uniqueBy(
    source.filter((item) => item.id !== word.id),
    (item) => item.ru,
  );
  const distractors = shuffle(pool).slice(0, 3);
  return shuffle([word, ...distractors]);
}

function renderStatus() {
  const packLabel = selectedPack?.title ?? "";
  progressEl.textContent = queue.length
    ? `${packLabel}: ${seen + (answered ? 0 : 1)} / ${deck.length}`
    : `${packLabel}: колода пройдена`;
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

function showPacks() {
  stopPlayback();
  selectedPack = null;
  deck = [];
  queue = [];
  current = null;
  playScreen.hidden = true;
  packScreen.hidden = false;
  packHintEl.textContent = "Выбери смысловой пакет.";
  packsEl.replaceChildren(
    ...packs.map((pack) => {
      const count = wordsForPack(pack).length;
      const button = document.createElement("button");
      button.className = "btn pack";
      button.type = "button";
      const title = document.createElement("strong");
      title.textContent = pack.title;
      const meta = document.createElement("span");
      meta.className = "muted";
      meta.textContent = pack.blurb
        ? `${count} слов · ${pack.blurb}`
        : `${count} слов`;
      button.append(title, meta);
      button.disabled = count < 4;
      button.addEventListener("click", () => startPack(pack));
      return button;
    }),
  );
}

function startPack(pack) {
  const nextDeck = wordsForPack(pack);
  if (nextDeck.length < 4) return;
  selectedPack = pack;
  deck = nextDeck;
  packScreen.hidden = true;
  playScreen.hidden = false;
  restart();
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
    heardEl.textContent = "";
    hintEl.textContent =
      "Ещё круг в этом пакете — или скажи примеры вслух.";
    choicesEl.replaceChildren();
    speakBtn.hidden = true;
    renderStatus();
    return;
  }

  promptEl.textContent = current.hy;
  heardEl.textContent = current.heard ? `как слышится: ${current.heard}` : "";
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
}

function restart() {
  if (!selectedPack || deck.length < 4) {
    showPacks();
    return;
  }
  queue = shuffle(deck);
  current = null;
  answered = false;
  correct = 0;
  seen = 0;
  renderCard();
}

speakBtn.addEventListener("click", () => {
  if (current) speakWord(current);
});
nextBtn.addEventListener("click", renderCard);
restartBtn.addEventListener("click", restart);
packsBackBtn.addEventListener("click", showPacks);

async function main() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    allWords = data.words ?? [];
    packs = data.packs ?? [];
    if (!packs.length) {
      packs = [{ id: "all", title: "Все слова", blurb: "Вся колода", all: true }];
    }
    if (allWords.length < 4) throw new Error("too few words");
    showPacks();
  } catch (error) {
    packHintEl.textContent = "Нет data/words.json — открой сайт по http, не как файл.";
    console.error(error);
  }
}

main();
