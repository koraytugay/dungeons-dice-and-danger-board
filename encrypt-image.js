const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const inputImagePath = path.join(__dirname, 'DungeonsDiceDanger.png');
const outputEncPath = path.join(__dirname, 'DungeonsDiceDanger.enc');
const PASSCODE = process.argv[2];

function encryptImage() {
  if (!PASSCODE) {
    console.error('Error: Please provide a passcode to encrypt the image.');
    console.error('Usage: node encrypt-image.js <passcode>');
    process.exit(1);
  }

  if (!fs.existsSync(inputImagePath)) {
    console.error('Source image not found at:', inputImagePath);
    process.exit(1);
  }

  console.log('Reading image:', inputImagePath);
  const imageBuffer = fs.readFileSync(inputImagePath);
  console.log(`Original image size: ${(imageBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

  // Generate 16-byte random salt and 12-byte random IV
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  // Derive 256-bit AES key using PBKDF2 with SHA-256 and 100,000 iterations
  const key = crypto.pbkdf2Sync(PASSCODE, salt, 100000, 32, 'sha256');

  // Encrypt with AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(imageBuffer), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes auth tag

  // Combined binary format: [Salt (16B)] + [IV (12B)] + [Ciphertext] + [AuthTag (16B)]
  const encryptedFileBuffer = Buffer.concat([salt, iv, encrypted, tag]);

  fs.writeFileSync(outputEncPath, encryptedFileBuffer);
  console.log(`Encrypted image saved to: ${outputEncPath}`);
  console.log(`Encrypted file size: ${(encryptedFileBuffer.length / (1024 * 1024)).toFixed(2)} MB`);
  console.log('Encryption complete!');
}

encryptImage();
