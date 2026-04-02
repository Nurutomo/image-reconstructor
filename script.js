/* =============================================================
   Image Reconstructor – script.js
   Multi-pass pipeline: Before -> Rotation -> 1D Grade -> Final
   ============================================================= */

(function () {
  'use strict';

  const imageInput = document.getElementById('imageInput');
  const uploadLabel = document.querySelector('.upload-label');
  const uploadText = document.getElementById('uploadText');
  const controlsSection = document.getElementById('controlsSection');
  const canvasSection = document.getElementById('canvasSection');

  const rotationRange = document.getElementById('rotationRange');
  const rotationVal = document.getElementById('rotationVal');
  const gradeRange = document.getElementById('gradeRange');
  const gradeVal = document.getElementById('gradeVal');

  const beforeCanvas = document.getElementById('beforeCanvas');
  const rotateCanvas = document.getElementById('rotateCanvas');
  const gradeCanvas = document.getElementById('gradeCanvas');
  const afterCanvas = document.getElementById('afterCanvas');

  const beforeCtx = beforeCanvas.getContext('2d');
  const afterCtx = afterCanvas.getContext('2d');

  const DEFAULT_IMAGE_PATH = 'default-image.svg';
  const VERTEX_SHADER_PATH = 'shaders/rot.vert.glsl';
  const ROT_FRAGMENT_SHADER_PATH = 'shaders/rot.frag.glsl';
  const GRADE_FRAGMENT_SHADER_PATH = 'shaders/grade.frag.glsl';

  const MAX_DIM = 800;

  let rotateState = null;
  let gradeState = null;
  let mouseUniform = { x: 0.5, y: 0.5 };

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

  function loadImageFromUrl(url) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function loadTextFile(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to load: ' + url);
    }
    return response.text();
  }

  function drawImageToCanvas(canvas, ctx, img) {
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;

    const scale = Math.min(MAX_DIM / naturalW, MAX_DIM / naturalH, 1);
    const drawW = Math.round(naturalW * scale);
    const drawH = Math.round(naturalH * scale);
    const side = Math.max(drawW, drawH);

    canvas.width = side;
    canvas.height = side;

    const offsetX = Math.floor((side - drawW) / 2);
    const offsetY = Math.floor((side - drawH) / 2);

    ctx.clearRect(0, 0, side, side);
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  }

  function setPipelineCanvasSize(side) {
    rotateCanvas.width = side;
    rotateCanvas.height = side;
    gradeCanvas.width = side;
    gradeCanvas.height = side;
    afterCanvas.width = side;
    afterCanvas.height = side;
  }

  function createShader(glContext, type, source) {
    const shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);

    if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
      const info = glContext.getShaderInfoLog(shader);
      glContext.deleteShader(shader);
      throw new Error(info || 'WebGL shader compile error');
    }

    return shader;
  }

  function createProgram(glContext, vertexSource, fragmentSource) {
    const vertexShader = createShader(glContext, glContext.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(glContext, glContext.FRAGMENT_SHADER, fragmentSource);
    const program = glContext.createProgram();

    glContext.attachShader(program, vertexShader);
    glContext.attachShader(program, fragmentShader);
    glContext.linkProgram(program);

    glContext.deleteShader(vertexShader);
    glContext.deleteShader(fragmentShader);

    if (!glContext.getProgramParameter(program, glContext.LINK_STATUS)) {
      const info = glContext.getProgramInfoLog(program);
      glContext.deleteProgram(program);
      throw new Error(info || 'WebGL program link error');
    }

    return program;
  }

  function createPass(canvas, vertexSource, fragmentSource) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) {
      throw new Error('Unable to create WebGL context for ' + canvas.id + '.');
    }

    const program = createProgram(gl, vertexSource, fragmentSource);
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
      ]),
      gl.STATIC_DRAW
    );

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        0, 1,
        1, 0,
        1, 1
      ]),
      gl.STATIC_DRAW
    );

    return {
      canvas,
      gl,
      program,
      positionLocation,
      texCoordLocation,
      positionBuffer,
      texCoordBuffer,
      textures: {}
    };
  }

  function getPassTexture(pass, name) {
    if (pass.textures[name]) return pass.textures[name];

    const texture = pass.gl.createTexture();
    pass.gl.bindTexture(pass.gl.TEXTURE_2D, texture);
    pass.gl.texParameteri(pass.gl.TEXTURE_2D, pass.gl.TEXTURE_WRAP_S, pass.gl.CLAMP_TO_EDGE);
    pass.gl.texParameteri(pass.gl.TEXTURE_2D, pass.gl.TEXTURE_WRAP_T, pass.gl.CLAMP_TO_EDGE);
    pass.gl.texParameteri(pass.gl.TEXTURE_2D, pass.gl.TEXTURE_MIN_FILTER, pass.gl.LINEAR);
    pass.gl.texParameteri(pass.gl.TEXTURE_2D, pass.gl.TEXTURE_MAG_FILTER, pass.gl.LINEAR);
    pass.textures[name] = texture;
    return texture;
  }

  function webglFragment(pass, uniforms) {
    const gl = pass.gl;

    gl.viewport(0, 0, pass.canvas.width, pass.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(pass.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, pass.positionBuffer);
    gl.enableVertexAttribArray(pass.positionLocation);
    gl.vertexAttribPointer(pass.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, pass.texCoordBuffer);
    gl.enableVertexAttribArray(pass.texCoordLocation);
    gl.vertexAttribPointer(pass.texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    let textureUnit = 0;

    Object.keys(uniforms).forEach(function (name) {
      const location = gl.getUniformLocation(pass.program, name);
      if (!location) return;

      const uniform = uniforms[name];

      if (uniform && uniform.source) {
        const texture = getPassTexture(pass, name);
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, uniform.flipY === true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, uniform.source);
        gl.uniform1i(location, textureUnit);
        textureUnit += 1;
        return;
      }

      if (uniform && Array.isArray(uniform.value) && uniform.value.length === 2) {
        gl.uniform2f(location, uniform.value[0], uniform.value[1]);
        return;
      }

      if (uniform && typeof uniform.value === 'number') {
        gl.uniform1f(location, uniform.value);
      }
    });

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return pass.canvas;
  }

  async function initRenderers() {
    if (!window.WebGLRenderingContext) {
      throw new Error('WebGL API is not supported by this browser.');
    }

    const [vertexSource, rotFragmentSource, gradeFragmentSource] = await Promise.all([
      loadTextFile(VERTEX_SHADER_PATH),
      loadTextFile(ROT_FRAGMENT_SHADER_PATH),
      loadTextFile(GRADE_FRAGMENT_SHADER_PATH)
    ]);

    rotateState = createPass(rotateCanvas, vertexSource, rotFragmentSource);
    gradeState = createPass(gradeCanvas, vertexSource, gradeFragmentSource);
  }

  function renderPipeline() {
    if (!rotateState || !gradeState) return;

    const output1 = webglFragment(rotateState, {
      u_image: {
        source: beforeCanvas,
        flipY: true
      },
      u_resolution: {
        value: [rotateCanvas.width, rotateCanvas.height]
      },
    });

    const output2 = webglFragment(gradeState, {
      u_image: {
        source: output1,
        flipY: true
      },
      u_mouse: {
        value: [mouseUniform.x, mouseUniform.y]
      },
      u_resolution: {
        value: [gradeCanvas.width, gradeCanvas.height]
      },
    });

    afterCtx.clearRect(0, 0, afterCanvas.width, afterCanvas.height);
    afterCtx.drawImage(output2, 0, 0);
  }

  function resetControls() {
    rotationRange.value = 0;
    rotationVal.textContent = '0';
    gradeRange.value = 0;
    gradeVal.textContent = '0';
  }

  function initializeCanvasState(image) {
    drawImageToCanvas(beforeCanvas, beforeCtx, image);
    setPipelineCanvasSize(beforeCanvas.width);

    if (!rotateState || !gradeState) return;

    resetControls();
    controlsSection.hidden = false;
    canvasSection.hidden = false;
    renderPipeline();
  }

  async function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    uploadText.textContent = file.name;

    let image;
    try {
      image = await loadImageFromFile(file);
    } catch (error) {
      uploadText.textContent = 'Failed to load image. Please try another file.';
      return;
    }

    initializeCanvasState(image);
  }

  async function loadDefaultImage() {
    try {
      const image = await loadImageFromUrl(DEFAULT_IMAGE_PATH);
      initializeCanvasState(image);
      uploadText.textContent = 'Default image loaded';
    } catch (error) {
      uploadText.textContent = 'Click or drag & drop an image here';
    }
  }

  async function bootstrap() {
    let webglInitError = null;

    try {
      await initRenderers();
    } catch (error) {
      rotateState = null;
      gradeState = null;
      webglInitError = error;
    }

    if (!rotateState || !gradeState) {
      const reason = webglInitError && webglInitError.message
        ? webglInitError.message
        : 'Unknown initialization error.';

      uploadText.textContent = 'WebGL is required but unavailable: ' + reason;
      imageInput.disabled = true;
      console.error('WebGL initialization failed:', webglInitError || reason);
      return;
    }

    loadDefaultImage();
  }

  imageInput.addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (file) handleFile(file);
  });

  uploadLabel.addEventListener('dragover', function (event) {
    event.preventDefault();
    uploadLabel.classList.add('drag-over');
  });

  uploadLabel.addEventListener('dragleave', function () {
    uploadLabel.classList.remove('drag-over');
  });

  uploadLabel.addEventListener('drop', function (event) {
    event.preventDefault();
    uploadLabel.classList.remove('drag-over');
    const file = event.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  rotationRange.addEventListener('input', function () {
    rotationVal.textContent = this.value;
    renderPipeline();
  });

  gradeRange.addEventListener('input', function () {
    gradeVal.textContent = this.value;
    renderPipeline();
  });

  gradeCanvas.addEventListener('mousemove', function (event) {
    const rect = gradeCanvas.getBoundingClientRect();
    const localX = (event.clientX - rect.left) / rect.width;
    const localY = (event.clientY - rect.top) / rect.height;
    mouseUniform.x = Math.min(1, Math.max(0, localX));
    mouseUniform.y = Math.min(1, Math.max(0, localY));
    renderPipeline();
  });

  bootstrap();
})();
