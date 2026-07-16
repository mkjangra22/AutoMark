#!/bin/bash
# Script to download face-api.js models into the models directory

mkdir -p models

# Base URL for face-api.js models
BASE_URL="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

# List of model files to download
models=(
  "face_landmark_68_model-weights_manifest.json"
  "face_landmark_68_model-shard1"
  "face_recognition_model-weights_manifest.json"
  "face_recognition_model-shard1"
  "face_recognition_model-shard2"
  "tiny_face_detector_model-weights_manifest.json"
  "tiny_face_detector_model-shard1"
)

for model in "${models[@]}"
do
  echo "Downloading $model..."
  curl -o models/$model $BASE_URL/$model
done

echo "Download complete."
