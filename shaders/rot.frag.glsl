precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_image;
uniform vec2 u_resolution;

const mediump int SAMPLE_COUNT = 2048;

void main() {
  vec4 color = vec4(0.0);
  float rotationDeg = v_texCoord.y * -3.14159265 * 2.0; // Convert degrees to radians
  mat2 uvRotation = mat2(cos(rotationDeg), -sin(rotationDeg),
                          sin(rotationDeg),  cos(rotationDeg));
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    float sampleY = float(i) / float(SAMPLE_COUNT - 1);
    vec2 rotatedUV = uvRotation * (vec2(v_texCoord.x, sampleY) - 0.5) + 0.5;
    if (rotatedUV.x < 0.0 || rotatedUV.x > 1.0 || rotatedUV.y < 0.0 || rotatedUV.y > 1.0) {
      color += vec4(0.0); // Transparent outside the original UV range
      continue;
    }
    color += texture2D(u_image, rotatedUV); // Apply gamma correction
  }
  gl_FragColor = color / float(SAMPLE_COUNT); // Apply inverse gamma correction
}
