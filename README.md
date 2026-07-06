# Sight — Real-Time Scene Narrator

A browser-based assistive tool that watches through your camera and speaks a short, prioritized description of what's around you — built for visually impaired users, running entirely client-side.

**[Live demo →] **(https://nahlasmida.github.io/sight-narrator/)**

![Sight demo](docs/demo.gif) *(add a screen recording here — see "Recording a demo" below)*

## What it does

Point a camera (phone or laptop) at a room or street. Sight detects objects, works out roughly how close they are and which side they're on, and speaks a natural sentence like:

> "There's a person close on your left, and a car far away ahead of you."

It repeats this every few seconds, only when the scene meaningfully changes, so it narrates without becoming noise.

## Why

Most assistive object-detection demos stop at printing labels on a bounding box. The useful version for a blind or low-vision user isn't "person, chair, car" — it's a sentence that reads like a companion describing the room, prioritized by what's closest and most relevant. That's the gap this project closes, using only pretrained models and browser-native APIs — no backend, no cost, no setup for the end user.

## How it works

```
Webcam feed
    │
    ▼
COCO-SSD (TensorFlow.js, pretrained) ── runs fully client-side
    │  → bounding boxes + class labels + confidence
    ▼
Heuristic reasoning layer
    │  → bbox size → rough distance ("very close" … "far away")
    │  → bbox horizontal position → left / ahead / right
    │  → priority ranking (closer + more confident first)
    ▼
Sentence builder
    │  → deduped, prioritized, natural-language sentence
    │  → (swappable for an LLM call for more natural phrasing — see app.js)
    ▼
Web Speech API (SpeechSynthesis) ── spoken aloud, throttled to avoid overlap/spam
```

Everything runs in the browser. No video frame or detection ever leaves the device.

## Tech stack

- **Object detection:** [TensorFlow.js](https://www.tensorflow.org/js) + [COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) (pretrained, 80-class)
- **Speech output:** Web Speech API (`SpeechSynthesisUtterance`) — no external TTS service
- **UI:** vanilla HTML/CSS/JS, no framework, no build step
- **Distance/position reasoning:** custom heuristic based on bounding-box area and horizontal center (see `app.js`)

## Running it locally

No build step, no dependencies to install. Just serve the folder:

```bash
git clone https://github.com/YOUR_USERNAME/sight-narrator.git
cd sight-narrator
python3 -m http.server 8080
# open http://localhost:8080
```

(Needs to be served over HTTP/HTTPS, not opened as a local file, for camera permissions to work.)

## Deploying

Works on any static host. Easiest options:
- **GitHub Pages:** Settings → Pages → deploy from `main` branch, root folder
- **Vercel / Netlify:** import the repo, no build command needed, output directory is `/`

## Modes

- **Everything** — narrates all detected objects above the confidence threshold
- **Hazards only** — narrates only classes relevant to safe navigation (people, vehicles, obstacles)

## What I'd improve next

- Swap the template sentence builder for a real LLM call (Claude Haiku) for more natural, context-aware phrasing — the hook is already stubbed in `buildSentence()` in `app.js`
- Monocular depth estimation instead of bbox-size heuristic, for real distance estimates
- Persistent object tracking (IDs across frames) instead of per-frame detection, to reduce flicker and support "the same person is now closer" narration
- Multilingual TTS voice selection
- On-device wake word ("what's around me?") instead of continuous narration, to save battery/attention

## License

MIT
