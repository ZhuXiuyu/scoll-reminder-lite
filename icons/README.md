# Icons

This directory contains the extension icons.

Due to browser extension requirements, icons must be in PNG format.

## How to generate icons

### Option 1: Use the SVG file
The `icon.svg` file in this directory can be converted to PNG using:
- Online converters: https://convertio.co/svg-png/
- Image editing software: GIMP, Photoshop, Figma
- Command line: `inkscape` or `rsvg-convert`

### Option 2: Create manually
Create three PNG files with the following dimensions:
- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels
- `icon128.png` - 128x128 pixels

The icon should be a simple red circle (like a stop sign) on a white or transparent background.

### Option 3: Use a placeholder
For testing, you can use any 128x128 PNG image and resize it to create the three required sizes.
