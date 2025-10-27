const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');

const sourcePath = path.resolve(__dirname, '..', 'build', 'logo.png');
const outputDir = path.resolve(__dirname, '..', 'build');
const linuxIconsDir = path.join(outputDir, 'icons');

const ensureFile = (filePath, buffer) => {
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated ${path.basename(filePath)}`);
};

const main = () => {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Logo base file not found at ${sourcePath}`);
    process.exit(1);
  }

  // Create directory for Linux icons
  if (!fs.existsSync(linuxIconsDir)) {
    fs.mkdirSync(linuxIconsDir, { recursive: true });
  }

  const pngBuffer = fs.readFileSync(sourcePath);

  // Generate modern ICNS for macOS
  const icns = png2icons.createICNS(pngBuffer, png2icons.BICUBIC, true);
  if (icns) {
    ensureFile(path.join(outputDir, 'icon.icns'), icns);
  } else {
    console.warn('Failed to generate icon.icns');
  }

  // Generate ICO for Windows
  const ico = png2icons.createICO(pngBuffer, png2icons.BICUBIC, 0, false);
  if (ico) {
    ensureFile(path.join(outputDir, 'icon.ico'), ico);
  } else {
    console.warn('Failed to generate icon.ico');
  }

  // Copy PNG for renderer and for Linux
  const iconPngPath = path.join(outputDir, 'icon.png');
  fs.copyFileSync(sourcePath, iconPngPath);
  console.log('Copied icon.png');

  fs.copyFileSync(iconPngPath, path.join(linuxIconsDir, 'icon.png'));
  console.log('Copied icon.png to icons directory for Linux');
};

main();
