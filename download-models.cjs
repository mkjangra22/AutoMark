const fs = require('fs');
const path = require('path');
const https = require('https');

const publicDir = path.join(__dirname, 'public');
const modelsDir = path.join(publicDir, 'models');

// Ensure public and models directory exist
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
  console.log('Created public/ directory');
}
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
  console.log('Created public/models/ directory');
}

// Copy local images to public/ so Vite serves them
const filesInRoot = fs.readdirSync(__dirname);
const imagesToCopy = filesInRoot.filter(file => 
  file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.JPEG')
);

for (const img of imagesToCopy) {
  const dest = path.join(publicDir, img);
  fs.copyFileSync(path.join(__dirname, img), dest);
  console.log(`Copied ${img} to public/`);
}

// Model files to download
const BASE_URL = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";
const models = [
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model-shard1",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model-shard1",
  "face_recognition_model-shard2",
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model-shard1"
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect if any
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (Status Code: ${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log("Downloading face-api.js models...");
  for (const model of models) {
    const destPath = path.join(modelsDir, model);
    if (fs.existsSync(destPath)) {
      console.log(`${model} already exists. Skipping.`);
      continue;
    }
    console.log(`Downloading ${model}...`);
    try {
      await downloadFile(`${BASE_URL}/${model}`, destPath);
      console.log(`Downloaded ${model} successfully.`);
    } catch (err) {
      console.error(`Error downloading ${model}:`, err.message);
    }
  }
  console.log("Setup complete!");
}

main();
