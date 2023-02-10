//<script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js" crossorigin="anonymous"></script>

const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

function get_hand(frame) {
    const TIPS = [0, 4, 8, 12, 16, 20]
    let coords = []

    results = hands.process(frame);
    if (results.multiHandLandmarks) {
        landmarks = results.multiHandLandmarks[0];
        for (t in TIPS){
            coords.push(landmarks[t].x, landmarks[t].y);
        }
    }
    return coords;
}