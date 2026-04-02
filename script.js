/* =============================================================
   Image Reconstructor – script.js
   Canvas-based image manipulation with before/after comparison
   ============================================================= */

(function () {
  'use strict';

  // ── DOM References ────────────────────────────────────────────
  const imageInput      = document.getElementById('imageInput');
  const uploadLabel     = document.querySelector('.upload-label');
  const uploadText      = document.getElementById('uploadText');
  const controlsSection = document.getElementById('controlsSection');
  const canvasSection   = document.getElementById('canvasSection');

  const filterSelect    = document.getElementById('filterSelect');
  const brightnessRange = document.getElementById('brightnessRange');
  const contrastRange   = document.getElementById('contrastRange');
  const saturationRange = document.getElementById('saturationRange');
  const hueRange        = document.getElementById('hueRange');
  const opacityRange    = document.getElementById('opacityRange');

  const brightnessVal   = document.getElementById('brightnessVal');
  const contrastVal     = document.getElementById('contrastVal');
  const saturationVal   = document.getElementById('saturationVal');
  const hueVal          = document.getElementById('hueVal');
  const opacityVal      = document.getElementById('opacityVal');

  const applyBtn        = document.getElementById('applyBtn');
  const resetBtn        = document.getElementById('resetBtn');
  const downloadBtn     = document.getElementById('downloadBtn');

  const beforeCanvas    = document.getElementById('beforeCanvas');
  const afterCanvas     = document.getElementById('afterCanvas');
  const beforeCtx       = beforeCanvas.getContext('2d');
  const afterCtx        = afterCanvas.getContext('2d');

  // ── State ─────────────────────────────────────────────────────
  let originalImage = null;   // HTMLImageElement of the loaded picture
  let originalImageData = null; // ImageData snapshot for pixel operations

  // ── Helpers ───────────────────────────────────────────────────

  /** Clamp a value to [min, max]. */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /** Load an image File into an HTMLImageElement. */
  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /** Draw an image onto a canvas, scaling to fit within MAX_DIM. */
  const MAX_DIM = 800;

  function drawImageToCanvas(canvas, ctx, img) {
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > MAX_DIM || h > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    canvas.width  = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
  }

  // ── Image Loading ─────────────────────────────────────────────

  async function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    uploadText.textContent = file.name;

    try {
      originalImage = await loadImageFromFile(file);
    } catch (e) {
      uploadText.textContent = 'Failed to load image. Please try another file.';
      return;
    }

    // Draw "before" canvas
    drawImageToCanvas(beforeCanvas, beforeCtx, originalImage);

    // Snapshot original pixel data for manipulation
    originalImageData = beforeCtx.getImageData(0, 0, beforeCanvas.width, beforeCanvas.height);

    // Mirror "after" canvas dimensions
    afterCanvas.width  = beforeCanvas.width;
    afterCanvas.height = beforeCanvas.height;
    afterCtx.putImageData(originalImageData, 0, 0);

    // Show controls and canvases
    controlsSection.hidden = false;
    canvasSection.hidden   = false;

    resetControls();
  }

  imageInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  // Drag-and-drop support
  uploadLabel.addEventListener('dragover', function (e) {
    e.preventDefault();
    uploadLabel.classList.add('drag-over');
  });
  uploadLabel.addEventListener('dragleave', function () {
    uploadLabel.classList.remove('drag-over');
  });
  uploadLabel.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadLabel.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // ── Slider Live Labels ────────────────────────────────────────

  brightnessRange.addEventListener('input', function () {
    brightnessVal.textContent = this.value;
  });
  contrastRange.addEventListener('input', function () {
    contrastVal.textContent = this.value;
  });
  saturationRange.addEventListener('input', function () {
    saturationVal.textContent = this.value;
  });
  hueRange.addEventListener('input', function () {
    hueVal.textContent = this.value;
  });
  opacityRange.addEventListener('input', function () {
    opacityVal.textContent = this.value;
  });

  // ── Reset Controls ────────────────────────────────────────────

  function resetControls() {
    filterSelect.value    = 'none';
    brightnessRange.value = 0;
    contrastRange.value   = 0;
    saturationRange.value = 100;
    hueRange.value        = 0;
    opacityRange.value    = 100;

    brightnessVal.textContent = 0;
    contrastVal.textContent   = 0;
    saturationVal.textContent = 100;
    hueVal.textContent        = 0;
    opacityVal.textContent    = 100;
  }

  resetBtn.addEventListener('click', function () {
    resetControls();
    if (originalImageData) {
      afterCtx.putImageData(originalImageData, 0, 0);
    }
  });

  // ── Convolution Kernel Helpers ────────────────────────────────

  /**
   * Apply a 3×3 convolution kernel to the pixel data.
   * Returns a new Uint8ClampedArray with the result.
   */
  function applyKernel(srcData, width, height, kernel, divisor, offset) {
    divisor = divisor || 1;
    offset  = offset  || 0;
    const src = srcData.data;
    const dst = new Uint8ClampedArray(src.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const px = clamp(x + kx, 0, width  - 1);
            const py = clamp(y + ky, 0, height - 1);
            const idx = (py * width + px) * 4;
            const kv  = kernel[(ky + 1) * 3 + (kx + 1)];
            r += src[idx]     * kv;
            g += src[idx + 1] * kv;
            b += src[idx + 2] * kv;
          }
        }

        const outIdx = (y * width + x) * 4;
        dst[outIdx]     = clamp(r / divisor + offset, 0, 255);
        dst[outIdx + 1] = clamp(g / divisor + offset, 0, 255);
        dst[outIdx + 2] = clamp(b / divisor + offset, 0, 255);
        dst[outIdx + 3] = src[outIdx + 3];  // preserve alpha
      }
    }
    return dst;
  }

  // ── Pixel-Level Adjustments ───────────────────────────────────

  /**
   * Apply brightness offset to each channel.
   * @param {Uint8ClampedArray} pixels
   * @param {number} brightness  -150 … +150
   */
  function applyBrightness(pixels, brightness) {
    if (brightness === 0) return;
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i]     = clamp(pixels[i]     + brightness, 0, 255);
      pixels[i + 1] = clamp(pixels[i + 1] + brightness, 0, 255);
      pixels[i + 2] = clamp(pixels[i + 2] + brightness, 0, 255);
    }
  }

  /**
   * Apply contrast using the standard (pixel - 128) * factor + 128 formula.
   * @param {Uint8ClampedArray} pixels
   * @param {number} contrast  -100 … +100
   */
  function applyContrast(pixels, contrast) {
    if (contrast === 0) return;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i]     = clamp(factor * (pixels[i]     - 128) + 128, 0, 255);
      pixels[i + 1] = clamp(factor * (pixels[i + 1] - 128) + 128, 0, 255);
      pixels[i + 2] = clamp(factor * (pixels[i + 2] - 128) + 128, 0, 255);
    }
  }

  /**
   * Convert RGB to HSL.  Returns [h(0-360), s(0-1), l(0-1)].
   */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s, l];
  }

  /**
   * Convert HSL back to RGB.  h(0-360), s/l(0-1).
   * Returns [r, g, b] each 0-255.
   */
  function hslToRgb(h, s, l) {
    h /= 360;
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1/3) * 255),
      Math.round(hue2rgb(p, q, h)       * 255),
      Math.round(hue2rgb(p, q, h - 1/3) * 255)
    ];
  }

  /**
   * Apply saturation and hue-rotation adjustments.
   * @param {Uint8ClampedArray} pixels
   * @param {number} saturation  0 … 300 (100 = no change)
   * @param {number} hue         0 … 360 degrees
   */
  function applySaturationHue(pixels, saturation, hue) {
    const satFactor = saturation / 100;
    const hueShift  = hue;
    if (satFactor === 1 && hueShift === 0) return;
    for (let i = 0; i < pixels.length; i += 4) {
      let [h, s, l] = rgbToHsl(pixels[i], pixels[i+1], pixels[i+2]);
      if (satFactor !== 1) s = clamp(s * satFactor, 0, 1);
      if (hueShift  !== 0) h = (h + hueShift) % 360;
      const [nr, ng, nb] = hslToRgb(h, s, l);
      pixels[i]     = nr;
      pixels[i + 1] = ng;
      pixels[i + 2] = nb;
    }
  }

  /**
   * Apply opacity (alpha) scale.
   * @param {Uint8ClampedArray} pixels
   * @param {number} opacity  0 … 100
   */
  function applyOpacity(pixels, opacity) {
    if (opacity === 100) return;
    const factor = opacity / 100;
    for (let i = 3; i < pixels.length; i += 4) {
      pixels[i] = Math.round(pixels[i] * factor);
    }
  }

  /**
   * Apply grayscale.
   */
  function applyGrayscale(pixels) {
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = 0.299 * pixels[i] + 0.587 * pixels[i+1] + 0.114 * pixels[i+2];
      pixels[i] = pixels[i+1] = pixels[i+2] = gray;
    }
  }

  /**
   * Apply sepia tone.
   */
  function applySepia(pixels) {
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
      pixels[i]     = clamp(r * 0.393 + g * 0.769 + b * 0.189, 0, 255);
      pixels[i + 1] = clamp(r * 0.349 + g * 0.686 + b * 0.168, 0, 255);
      pixels[i + 2] = clamp(r * 0.272 + g * 0.534 + b * 0.131, 0, 255);
    }
  }

  /**
   * Invert all channels.
   */
  function applyInvert(pixels) {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i]     = 255 - pixels[i];
      pixels[i + 1] = 255 - pixels[i + 1];
      pixels[i + 2] = 255 - pixels[i + 2];
    }
  }

  // ── Named Kernels ─────────────────────────────────────────────

  const KERNELS = {
    blur: {
      kernel:  [1, 2, 1,  2, 4, 2,  1, 2, 1],
      divisor: 16
    },
    sharpen: {
      kernel:  [0, -1, 0,  -1, 5, -1,  0, -1, 0],
      divisor: 1
    },
    emboss: {
      kernel:  [-2, -1, 0,  -1, 1, 1,  0, 1, 2],
      divisor: 1,
      offset:  128
    },
    edge: {
      kernel:  [-1, -1, -1,  -1, 8, -1,  -1, -1, -1],
      divisor: 1
    }
  };

  // ── Apply All Adjustments ─────────────────────────────────────

  function applyManipulations() {
    if (!originalImageData) return;

    const width  = afterCanvas.width;
    const height = afterCanvas.height;

    // Read current control values
    const filter     = filterSelect.value;
    const brightness = parseInt(brightnessRange.value, 10);
    const contrast   = parseInt(contrastRange.value,   10);
    const saturation = parseInt(saturationRange.value, 10);
    const hue        = parseInt(hueRange.value,        10);
    const opacity    = parseInt(opacityRange.value,    10);

    // Deep-copy the original pixel data so we always start fresh
    let imageData = new ImageData(
      new Uint8ClampedArray(originalImageData.data),
      width,
      height
    );

    // 1. Apply convolution-based filters first (they need the full grid)
    if (KERNELS[filter]) {
      const cfg = KERNELS[filter];
      const newData = applyKernel(imageData, width, height, cfg.kernel, cfg.divisor, cfg.offset);
      imageData.data.set(newData);
    }

    // 2. Colour-mode filters
    const pixels = imageData.data;
    switch (filter) {
      case 'grayscale': applyGrayscale(pixels); break;
      case 'sepia':     applySepia(pixels);     break;
      case 'invert':    applyInvert(pixels);    break;
    }

    // 3. Tonal / colour adjustments
    applyBrightness(pixels, brightness);
    applyContrast(pixels, contrast);
    applySaturationHue(pixels, saturation, hue);
    applyOpacity(pixels, opacity);

    afterCtx.putImageData(imageData, 0, 0);
  }

  applyBtn.addEventListener('click', applyManipulations);

  // ── Download ──────────────────────────────────────────────────

  downloadBtn.addEventListener('click', function () {
    const link = document.createElement('a');
    link.download = 'reconstructed.png';
    link.href = afterCanvas.toDataURL('image/png');
    link.click();
  });
})();
