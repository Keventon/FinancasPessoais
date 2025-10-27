const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');

const sourcePath = path.resolve(__dirname, '..', 'build', 'logo.png');
const outputDir = path.resolve(__dirname, '..', 'build');

const ensureFile = (filePath, buffer) => {
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated ${path.basename(filePath)}`);
};

const main = () => {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Logo base file not found at ${sourcePath}`);
    process.exit(1);
  }

  const pngBuffer = fs.readFileSync(sourcePath);

  const icns = png2icons.createICNS(pngBuffer, png2icons.BICUBIC, false);
  if (icns) {
    ensureFile(path.join(outputDir, 'icon.icns'), icns);
  } else {
    console.warn('Failed to generate icon.icns');
  }

  const ico = png2icons.createICO(pngBuffer, png2icons.BICUBIC, false, 0, false);
  if (ico) {
    ensureFile(path.join(outputDir, 'icon.ico'), ico);
  } else {
    console.warn('Failed to generate icon.ico');
  }

  fs.copyFileSync(sourcePath, path.join(outputDir, 'icon.png'));
  console.log('Copied icon.png');
};

main();
