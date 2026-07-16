const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App2.jsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log(`Searching for "FaceMatcher" or "LabeledFaceDescriptors" in ${filePath}...`);
lines.forEach((line, index) => {
  if (line.includes('FaceMatcher') || line.includes('LabeledFaceDescriptors')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
