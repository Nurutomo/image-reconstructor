precision highp float;
precision highp int;

varying vec2 v_texCoord;
uniform sampler2D u_image;
uniform vec2 u_mouse;
uniform vec2 u_resolution;
uniform vec2 u_slider;

const mediump int SAMPLE_COUNT = 1024;

void main() {
  vec4 color = vec4(0.0);
  mediump int COUNT = 0;
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    float normalizedY = float(i) / float(SAMPLE_COUNT - 1);
    if (u_slider.x < normalizedY) {
      break; // Skip rows above the slider line
    }
    float rotationDeg = normalizedY * 3.14159265 * 2.0; // Convert degrees to radians
    mat2 uvRotation = mat2(cos(rotationDeg), -sin(rotationDeg),
                          sin(rotationDeg),  cos(rotationDeg));
    vec2 rotatedUV = uvRotation * (v_texCoord.xy - 0.5) + 0.5;
    vec4 c = texture2D(u_image, vec2(rotatedUV.x, normalizedY));
    color += c;
    COUNT++;
  }
  gl_FragColor = color / float(COUNT); // Apply inverse gamma correction
}
