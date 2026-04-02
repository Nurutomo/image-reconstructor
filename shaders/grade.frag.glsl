precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_image;
uniform vec2 u_mouse;
uniform vec2 u_resolution;

const mediump int SAMPLE_COUNT = 2048;

void main() {
  vec4 color = vec4(0.0);
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    float normalizedY = float(i) / float(SAMPLE_COUNT - 1);
    float rotationDeg = normalizedY * 3.14159265 * 2.0; // Convert degrees to radians
    mat2 uvRotation = mat2(cos(rotationDeg), -sin(rotationDeg),
                          sin(rotationDeg),  cos(rotationDeg));
    vec2 rotatedUV = uvRotation * (vec2(v_texCoord.xy) - 0.5) + 0.5;
    color += texture2D(u_image, vec2(rotatedUV.x, normalizedY)); // Apply gamma correction
  }
  gl_FragColor = color / float(SAMPLE_COUNT); // Apply inverse gamma correction
}
