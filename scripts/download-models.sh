#!/usr/bin/env bash
# Vault ML model weight downloader.
# Pulls model weights from HuggingFace via the HF token in .api-keys.env
# into %APPDATA%/Vault/ai-models/.
#
# Usage:
#   bash download-models.sh starter      # ~1.2 GB small high-impact set
#   bash download-models.sh medium       # ~3 GB medium models
#   bash download-models.sh heavy        # ~10+ GB large models
#   bash download-models.sh <model-id>   # one specific model from the table
#
# Each model is defined as: model_id|hf_repo|hf_file|dst_name

# Don't `set -e` — we want individual download failures to skip past
# (via `|| true`) without halting the whole batch. Pipefail still helps.
set -o pipefail

# Resolve dest dir — Vault userData on Windows is %APPDATA%\vault\ai-models\
# which under git-bash is /c/Users/<user>/AppData/Roaming/vault/ai-models.
USERPROFILE_UNIX=$(echo "$USERPROFILE" | sed 's|\\|/|g; s|C:|/c|')
if [ -z "$USERPROFILE_UNIX" ]; then
  USERPROFILE_UNIX=$(echo "$HOME" | sed 's|/c/|/c/|')
fi
# Wrappers expect files at userData/models/, not userData/ai-models/.
# (ai-models/ was a parallel staging dir from the user's manual drops;
# models/ is the canonical location every ONNX/Torch wrapper checks.)
DEST_DIR="$USERPROFILE_UNIX/AppData/Roaming/vault/models"
mkdir -p "$DEST_DIR"
echo "Dest: $DEST_DIR"

# Load HF token
if [ -f "/c/dev/.api-keys.env" ]; then
  HF_TOKEN=$(grep "^HF_TOKEN=" /c/dev/.api-keys.env | head -1 | cut -d= -f2)
fi
if [ -z "$HF_TOKEN" ]; then
  echo "ERROR: HF_TOKEN not set in /c/dev/.api-keys.env" >&2
  exit 1
fi

download_hf() {
  local repo="$1"
  local file="$2"
  local dst="$3"
  local url="https://huggingface.co/${repo}/resolve/main/${file}"
  echo ">>> [$dst] from ${repo}/${file}"
  if [ -f "${DEST_DIR}/${dst}" ]; then
    local existing_size=$(stat -c %s "${DEST_DIR}/${dst}" 2>/dev/null || echo 0)
    if [ "$existing_size" -gt 10000 ]; then
      echo "    skip — already exists (${existing_size} bytes)"
      return 0
    fi
  fi
  curl -fL --progress-bar \
    -H "Authorization: Bearer $HF_TOKEN" \
    -o "${DEST_DIR}/${dst}.part" \
    "$url" || {
      echo "    FAILED — removing partial" >&2
      rm -f "${DEST_DIR}/${dst}.part"
      return 1
    }
  mv "${DEST_DIR}/${dst}.part" "${DEST_DIR}/${dst}"
  echo "    ok — $(stat -c %s "${DEST_DIR}/${dst}") bytes"
}

# Direct (non-HF) GitHub-release download
download_url() {
  local url="$1"
  local dst="$2"
  echo ">>> [$dst] from $url"
  if [ -f "${DEST_DIR}/${dst}" ]; then
    echo "    skip — already exists"
    return 0
  fi
  curl -fL --progress-bar -o "${DEST_DIR}/${dst}.part" "$url" && \
    mv "${DEST_DIR}/${dst}.part" "${DEST_DIR}/${dst}"
}

starter() {
  echo "=== STARTER PACK (~1.2 GB) ==="
  # NudeNet v3 — correct HF location
  download_hf "vladmandic/nudenet" "nudenet.onnx" "nudenet-v3-320n.onnx" || \
    download_hf "vladmandic/nudenet" "640m.onnx" "nudenet-v3-640m.onnx" || \
    download_url "https://github.com/notAI-tech/NudeNet/releases/download/v3.0-weights/640m.onnx" "nudenet-v3-640m.onnx" || true
  # Real-ESRGAN x4plus
  download_url "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth" "RealESRGAN_x4plus.pth"
  # CodeFormer
  download_url "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth" "codeformer.pth"
  # RIFE v4.6 weights — try several known mirrors
  download_hf "imaginAIry/rife" "flownet.pkl" "rife-flownet.pkl" || \
    download_hf "ECLIP/RIFE" "flownet.pkl" "rife-flownet.pkl" || \
    download_hf "AlexWortega/RIFE" "flownet.pkl" "rife-flownet.pkl" || \
    download_url "https://github.com/megvii-research/ECCV2022-RIFE/releases/download/v4.6/RIFE_log.zip" "rife-log.zip" || true
  # AdaFace ir101 webface12m
  download_hf "ksoh/AdaFace" "adaface_ir101_webface12m.ckpt" "adaface_ir101.ckpt" || \
    download_hf "imaginAIry/adaface" "adaface_ir101_webface12m.ckpt" "adaface_ir101.ckpt" || \
    download_hf "nupurkmr9/adaface" "ir101_webface12m.ckpt" "adaface_ir101.ckpt" || true
  # MediaPipe Hand Landmarker — official Google download
  download_url "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task" "hand_landmarker.task"
  echo "=== STARTER PACK DONE ==="
}

medium() {
  echo "=== MEDIUM (~3 GB) ==="
  # Long-CLIP-L
  download_hf "BeichenZhang/LongCLIP-L" "longclip-L.pt" "longclip-L.pt" || true
  # MS-CLAP large
  download_hf "microsoft/msclap" "CLAP_weights_2023.pth" "msclap-2023.pth" || true
  # CG-DETR pretrained QV
  download_hf "wjun0830/cg-detr-qv" "model_best.ckpt" "cgdetr-qv.ckpt" || true
  # SigLIP2 age classifier
  download_hf "prithivMLmods/Age-Classification-SigLIP2" "model.safetensors" "siglip2-age.safetensors" || true
  # Civitai age-vit
  download_hf "civitai/age-vit" "pytorch_model.bin" "civitai-age-vit.bin" || true
  # MERT-v1-330M
  download_hf "m-a-p/MERT-v1-330M" "pytorch_model.bin" "mert-v1-330m.bin" || true
  # Florence-2-large
  download_hf "microsoft/Florence-2-large" "pytorch_model.bin" "florence-2-large.bin" || true
  # Deep-fake detector v2
  download_hf "NPHardTry/deepfake-detector" "model.safetensors" "deepfake-detector-v2.safetensors" || true
  # Demucs htdemucs_ft
  download_url "https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th" "htdemucs_ft.th"
  echo "=== MEDIUM DONE ==="
}

tagger() {
  echo "=== TAGGER PACK (~18 GB; per user's path-A choice — maximize tagging quality) ==="
  # WD Tagger v3 EVA02 large — strongest WD-Tagger variant
  download_hf "SmilingWolf/wd-eva02-large-tagger-v3" "model.onnx" "wd-eva02-large-tagger-v3.onnx" || true
  download_hf "SmilingWolf/wd-eva02-large-tagger-v3" "selected_tags.csv" "wd-eva02-large-tags.csv" || true
  # WD Tagger v3 SwinV2 — runner-up
  download_hf "SmilingWolf/wd-swinv2-tagger-v3" "model.onnx" "wd-swinv2-tagger-v3.onnx" || true
  download_hf "SmilingWolf/wd-swinv2-tagger-v3" "selected_tags.csv" "wd-swinv2-tags.csv" || true
  # JoyTag — purpose-built adult-content tagger (already-uploaded ONNX mirror)
  download_hf "fancyfeast/joytag" "model.onnx" "joytag.onnx" || \
    download_hf "fancyfeast/joytag" "model.safetensors" "joytag.safetensors" || true
  download_hf "fancyfeast/joytag" "top_tags.txt" "joytag-top-tags.txt" || true
  # DeepDanbooru ONNX export (anime/booru cross-coverage)
  download_hf "AIcsCool/deepdanbooru-pytorch" "deepdanbooru.onnx" "deepdanbooru.onnx" || \
    download_url "https://github.com/KichangKim/DeepDanbooru/releases/download/v3-20211112-sgd-e28/deepdanbooru-v3-20211112-sgd-e28.zip" "deepdanbooru.zip" || true
  # CLIP-Interrogator BLIP encoder (image→text caption for prompt-style tags)
  download_hf "Salesforce/blip-image-captioning-large" "pytorch_model.bin" "blip-large.bin" || true
  # EVA02-CLIP — better recall on adult content than vanilla OpenCLIP
  download_hf "QuanSun/EVA-CLIP" "EVA02_CLIP_L_336_psz14_s6B.pt" "eva02-clip-l-336.pt" || true
  # Florence-2-base (smaller, faster — for batch tagging)
  download_hf "microsoft/Florence-2-base-ft" "pytorch_model.bin" "florence-2-base-ft.bin" || true
  # CG-DETR moment retrieval (#B-36)
  download_hf "wjun0830/CG-DETR" "model_best.ckpt" "cgdetr-model.ckpt" || \
    download_hf "wjun0830/cg_detr" "ckpt.ckpt" "cgdetr-model.ckpt" || true
  # Depth Anything V2 base (#B-23)
  download_hf "depth-anything/Depth-Anything-V2-Base-hf" "model.safetensors" "depth-anything-v2-base.safetensors" || true
  # InternVideo2 stage2 1B (already have source zip — need weights)
  download_hf "OpenGVLab/InternVideo2-Stage2_1B-224p-f4" "model.pt" "internvideo2-1b.pt" || true
  echo "=== TAGGER PACK DONE ==="
}

heavy() {
  echo "=== HEAVY (~10+ GB) ==="
  # MetaCLIP 2 ViT-H/14
  download_hf "facebook/metaclip-h14-fullcc2.5b" "pytorch_model.bin" "metaclip-h14.bin" || true
  # Sapiens2-1B
  download_hf "facebook/sapiens-pretrain-1b-torchscript" "sapiens_1b_epoch_173_torchscript.pt2" "sapiens-1b.pt2" || true
  # SAM 3.1 (use SAM 2 base as fallback if 3.1 isn't public yet)
  download_hf "facebook/sam2-hiera-large" "sam2_hiera_large.pt" "sam2-hiera-large.pt" || true
  # AnimateDiff motion module v3
  download_hf "guoyww/animatediff" "mm_sd_v15_v2.ckpt" "animatediff-v3.ckpt" || true
  # MusicGen-large
  download_hf "facebook/musicgen-large" "pytorch_model.bin" "musicgen-large.bin" || true
  # Wav2Vec2-L emotion
  download_hf "audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim" "pytorch_model.bin" "w2v2-l-emotion.bin" || true
  echo "=== HEAVY DONE ==="
}

case "${1:-starter}" in
  starter) starter ;;
  medium) medium ;;
  heavy) heavy ;;
  tagger) tagger ;;
  all) starter && medium && heavy && tagger ;;
  *) echo "Unknown set: ${1:-starter}. Try: starter, medium, heavy, tagger, all" >&2; exit 1 ;;
esac

echo ""
echo "Files in ai-models now:"
ls -lh "$DEST_DIR" | tail -20

# Bonus targets — wire these in if more weights drop later
adaface_onnx() {
  download_hf "imaginAIry/adaface" "adaface_ir101.onnx" "adaface-topofr.onnx" || \
    download_hf "wjason100/adaface_onnx" "adaface_ir101.onnx" "adaface-topofr.onnx" || \
    download_hf "TrustGate/AdaFace-onnx" "ir101_webface12m.onnx" "adaface-topofr.onnx" || true
}
