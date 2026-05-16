# ML wrapper backlog

Vault ships TypeScript wrappers for several optional ONNX / Python-sidecar
models. Each wrapper auto-detects whether its model file is present on disk
and self-disables when absent — adding one is a model drop + restart, never a
code change.

This doc is the single index. For per-wrapper activation steps, read the
file header — every wrapper has a `// ACTIVATION:` block.

## Status legend
- **shipped** — full implementation, has consumers, has UI surface
- **functional** — full implementation, no consumer wired yet
- **scaffold** — class shape + ACTIVATION docs but classify/process is a stub
  that warns and returns empty until someone fills it in against a real model

## Wrappers

| File | Purpose | Status | Activation summary |
|---|---|---|---|
| `tier1-onnx-tagger.ts` | WD-Tagger + variants | shipped | Multi-tagger ensemble, consensus boost. `settings.ai.wdTaggerVariants[]` |
| `nudenet-detector.ts` | YOLOv5/v8 NSFW body parts | shipped | UI card in AI Tools. Drop `nudenet-detector.onnx`. |
| `face-detector.ts` (YuNet) | Face bounding boxes | shipped | Bundled with standard downloads. |
| `sface-recognizer.ts` | 128-D / 512-D face embeddings | shipped | Auto-detects SFace vs ArcFace via filename. |
| `arcface-recognizer.ts` | Standalone ArcFace handle | functional | Isolated session (bulk performer-photo seeding). |
| `person-reid-recognizer.ts` | 768-D body embeddings | shipped | Wired into Performers tab. |
| `pose-detector.ts` (MoveNet) | Pose + performer count | shipped | UI card in AI Tools. |
| `gender-classifier.ts` | Per-face M/F | shipped | UI card in AI Tools. |
| `whisper-transcriber.ts` (whisper.cpp) | Utterance transcripts | shipped | UI card + opt-in. |
| `whisperx-launcher.ts` | Word-level + diarization | functional | Python sidecar (8031). `settings.ai.whisperxAutoStart` + `whisperxStartScript`. |
| `joycaption-launcher.ts` | Dense VLM captions | shipped | Auto-starts at boot when sidecar dir detected. |
| `f5-tts-launcher.ts` | Voice-clone alt to XTTS | functional | Python sidecar (8021). `settings.ai.f5ttsAutoStart` + `f5ttsStartScript`. |
| `clip-bpe-tokenizer.ts` | Real CLIP text encoding | shipped | UI card with one-click `ai:clip-bpe-download`. |
| `paddle-ocr.ts` (DB + CRNN) | Two-stage OCR | functional | Drop `text-detection-db.onnx` + `text-recognition-crnn.onnx` + flip `settings.ai.useDbCrnnOcr`. Falls back to tesseract.js. |
| `aesthetic-predictor.ts` | LAION aesthetic score | functional | Linear/MLP head on existing CLIP. Drop `aesthetic-linear.json`. |
| `deepfake-detector.ts` | AI-face detector | functional | Drop `deepfake-detector.onnx`. |
| `ai-image-detector.ts` | AI-image (full-frame) | functional | Drop `ai-image-detector.onnx`. |
| `chromaprint-fingerprint.ts` | Audio fingerprint | functional | Drop `fpcalc.exe` at `resources/bin/`. |
| `yamnet-classifier.ts` | 521-class audio events | functional | Drop `yamnet.onnx` + `yamnet-class-map.csv`. |
| `videomae-classifier.ts` | Kinetics-400 actions | functional | Drop `videomae-v2.onnx` + `kinetics-400-labels.txt`. |
| `transnet-detector.ts` | Shot boundaries (3D-CNN) | **scaffold** | `detectBoundaries()` returns `[]` — fill in once a real `transnet-v2.onnx` is on disk to verify the sliding-window shape. |
| `xclip-tagger.ts` | Zero-shot video tagging | **scaffold** | `classify()` returns `[]` — needs the model file present to validate frame-count + embedding-dim. |
| `clap-audio-tagger.ts` | Zero-shot audio tagging | **scaffold** | `classify()` returns `[]` — needs the model + a CLIP-style BPE tokenizer for the text branch. |
| `demucs-separator.ts` | Vocal / drum / bass / other stems | **scaffold** | Python sidecar (no port assigned) — wire up once `settings.ai.demucsPython` is configured. |

## Filling in a scaffold

1. Drop the model at the path the wrapper expects (see `getModelPath` calls).
2. Run Vault, watch console for the `Loaded` line on first call.
3. Replace the `console.warn(...)` stub block with real preprocessing +
   inference. Pattern to copy: `videomae-classifier.ts` (single-tensor in,
   sorted-top-N out) or `yamnet-classifier.ts` (windowed input, aggregated
   per-class probability).
4. Add a consumer in `processing-queue.ts` (for queue-step integration) or
   `index.ts` (for IPC).
5. Optionally surface a setup card in `AiTaggerPage.tsx` following the
   existing JoyCaption / NudeNet / CLIP-BPE pattern.

## Removing a wrapper

If a scaffold proves to be a dead end (model deprecated, license changed,
no maintainer interest), delete the file outright — none of them have
consumers, so removal is safe. Update this doc to match.
