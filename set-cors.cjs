const fs = require('fs');
const path = require('path');
const https = require('https');

// 1. Locate and retrieve the Firebase CLI token
const userProfile = process.env.USERPROFILE || process.env.HOME || '';
const appData = process.env.APPDATA || '';
const localAppData = process.env.LOCALAPPDATA || '';

const paths = [
  path.join(userProfile, '.config', 'configstore', 'firebase-tools.json'),
  path.join(appData, 'configstore', 'firebase-tools.json'),
  path.join(localAppData, 'configstore', 'firebase-tools.json')
];

let token = null;
for (const p of paths) {
  if (fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data.tokens && data.tokens.access_token) {
        token = data.tokens.access_token;
        console.log(`Found access token in config file at: ${p}`);
        break;
      }
    } catch (e) {
      console.error(`Error reading config at ${p}: ${e.message}`);
    }
  }
}

if (!token) {
  console.error('Error: Could not find a valid Firebase access token. Make sure you are logged in via firebase login.');
  process.exit(1);
}

// 2. Read the cors.json file
const corsPath = path.join(__dirname, 'cors.json');
if (!fs.existsSync(corsPath)) {
  console.error(`Error: cors.json not found at ${corsPath}`);
  process.exit(1);
}

let corsConfig;
try {
  corsConfig = JSON.parse(fs.readFileSync(corsPath, 'utf8'));
} catch (e) {
  console.error(`Error parsing cors.json: ${e.message}`);
  process.exit(1);
}

const payload = JSON.stringify({ cors: corsConfig });
const bucketName = 'automark12.appspot.com';
const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}?fields=cors`;

console.log(`Setting CORS for bucket: gs://${bucketName}`);
console.log(`Payload: ${payload}`);

// 3. Make the PATCH request
const options = {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(url, options, (res) => {
  let responseBody = '';
  res.on('data', (chunk) => {
    responseBody += chunk;
  });

  res.on('end', () => {
    console.log(`Response Status: ${res.statusCode} ${res.statusMessage}`);
    try {
      const parsedBody = JSON.parse(responseBody);
      console.log('Response Body:', JSON.stringify(parsedBody, null, 2));
      if (res.statusCode === 200) {
        console.log('\nSUCCESS! CORS configuration successfully updated.');
      } else {
        console.error('\nFAILURE! Error setting CORS config.');
      }
    } catch (e) {
      console.log('Raw Response Body:', responseBody);
      console.error('\nFailed to parse JSON response.');
    }
  });
});

req.on('error', (e) => {
  console.error(`Network error: ${e.message}`);
});

req.write(payload);
req.end();
