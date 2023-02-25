"use strict"

// https://webmidijs.org/
// Enable WEBMIDI.js and trigger the onEnabled() function when ready
WebMidi
    .enable()
    .then(onEnabled)
    .catch(err => alert(err));

// Function triggered when WEBMIDI.js is ready
function onEnabled() {
    // Display available MIDI output devices
    // and add to html dropdown
    let dropdownElem = document.getElementById("ports");
    console.log("availiable output ports");
    if (WebMidi.outputs.length < 1) {
        console.log("No device detected.");
    } else {
        WebMidi.outputs.forEach((device, index) => {
            console.log(`${index}: ${device.name}`);
            let option = document.createElement("option");
            option.text = `${index}: ${device.name}`;
            option.value = index;
            dropdownElem.appendChild(option);
        });
    }
}

export function notifyOffScreen(){
    endGesture();
}

// Convert gesture data into midi output
// This function is called by gesture_mediapipe.js every frame
let noteActive = false;
let playingNote = 0;
let playingChannel = 1;
export function processData(x, y, z, gestureName, canvasCtx, canvasElement) {
    let selectedPort = document.getElementById("ports").value;
    let midiout = WebMidi.outputs[selectedPort];
    if(midiout == null) return;


    // let posX = x;
    // let posY = y;

    // checkForGestureStartOrEnd(posX, posY);
    // drawGestureDetectionStatus(canvasCtx, canvasElement);

    let gestureId = -1;
    if (gestureName == 'Closed_Fist') {
        endGesture();
        gestureId = -1;
    }
    else {
        startGesture(x, y);
        switch (gestureName) {
            case 'Open_Palm':
                gestureId = 0;
                break;
            case 'Pointing_Up':
                gestureId = 1;
                break;
            case 'Victory':
                gestureId = 2;
                break;
            case 'ILoveYou':
                gestureId = 3;
                break;
            default:
                gestureId = -1;
                break;
        }
    }
    // doSliderGestureIfActive(posX, posY, midiout, gestureId);


    if(isGestureActive()){
        // Note input mode when finger pointing up
        if(gestureId == 1){
            endMpeMode();
            // console.log("notes mode");
            let pos = getGestureStartPos();
            let noteInfo = getRadialNote(x, y, pos.x, pos.y, 200, scaleCmaj7);

            canvasCtx.beginPath();
            canvasCtx.strokeStyle = 'orange';
            canvasCtx.lineWidth = 5;
            canvasCtx.arc(pos.x, pos.y, 200, 0, 2*Math.PI);
            canvasCtx.arc(pos.x, pos.y, 200*0.3, 0, 2*Math.PI);
            canvasCtx.stroke();

            // One note plays at a time
            if(noteInfo.note != playingNote){
                // midiout.channels[2].sendNoteOff(playingNote);
                if(noteInfo.note > 0){
                    midiout.channels[noteInfo.channel].sendNoteOn(noteInfo.note);
                }
                playingNote = noteInfo.note;
                playingChannel = noteInfo.channel;
            }
        }
        // MPE mode when hand open
        else if(gestureId == 0){
            if(!playingChannel) playingChannel = 1;
            // endGesture(); // TODO create three states and not just two
            startMpeMode(x, y);
            // console.log("MPE mode");

            // send x, y, z info
            // x == pitch bend; between -1 and 1
            // move left == bend down; move right == bend up
            // let startPos = getGestureStartPos();
            let startPos = getMpeStartPos();
            let ccx = 0;
            let bendRadius = 400;
            if(x > startPos.x){ //left
                ccx = Math.max(Math.min((x-startPos.x)/bendRadius, 1.0), 0.0);
                // console.log(ccx);
            }
            else { //right
                ccx = Math.max(Math.min((x-startPos.x)/(-bendRadius), 1.0), 0.0);
                // console.log(ccx);
            }
            // let ccx = getCCValueXYAxisMode(x, y, canvasElement.width, canvasElement.height, "x");
            midiout.channels[playingChannel].sendPitchBend(ccx);
            
            // y == timbre or CC 74; between 0-127
            // let ccy = getCCValueXYAxisMode(x, y, canvasElement.width, canvasElement.height, "y");
            // move up and down relative to starting position
            let ccy = 63;
            if(y > startPos.y){ //down
                let change = Math.max(Math.min((y-startPos.y)/bendRadius, 1.0), 0.0);
                ccy = 63 - change*63;
            }
            else { //up
                let change = Math.max(Math.min((y-startPos.y)/(-bendRadius), 1.0), 0.0);
                ccy = 63 + change*63;
            }
            midiout.channels[playingChannel].sendControlChange(74, Math.min(Math.max(Math.round(ccy), 0), 127));

            // z == aftertouch; between 0 and 1.0
            // z ranges from about 15 to 115
            let ccz = Math.max(Math.min((z - 15) / 115, 1.0), 0);
            midiout.channels[playingChannel].sendChannelAftertouch(ccz);
        }
        else {
            console.log("dunno");
        }
    }
    else if(gestureId == -1){
        // midiout.channels[2].sendNoteOff(playingNote);
        midiout.sendAllNotesOff();
    }

    drawOutputStatus();

    drawGestureActiveStatus(canvasCtx, canvasElement);
}


function getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Calculate the note on the scale at (x,y) 
// centered around (cx,cy) in the circle of radius
// uses the 8 notes provided in scale 
// returns note 0-127 AND the channel the note should be played on for MPE
const scaleCmaj7 = [60, 62, 64, 65, 67, 69, 71, 72];
function getRadialNote(x, y, cx, cy, radius, scale) {
    let noteX = x - cx;
    let noteY = y - cy;
    let radians = Math.atan2(noteY, noteX);
    let distance = getDistance(0, 0, noteX, noteY);

    if (distance > radius) return 0;

    // 30% of the radius in center is a safe area
    if (distance > radius * 0.3) {
        // TODO: channels numbered 2-9 depending on position
        let radialPercent = (radians + Math.PI) / (2 * Math.PI);
        let index = (Math.floor(radialPercent * 9)) % 8;
        let note = scale[index];
        return {note: note, channel: index + 2};
    } else {
        return 0;
    }
}

// Draw the radial note layout
function drawRadialNotes(x, y, cx, cy, radius, canvasCtx){

}

// https://stackoverflow.com/a/19832744
let prevTimestamp = null;
let prevX;
let prevY;
function getPointVelocity(currX, currY) {
    let info = { vx: 0, vy: 0, distanceTraveled: 0 };
    if (prevTimestamp == null) {
        prevTimestamp = Date.now();
        prevX = currX;
        prevY = currY;
    }

    let dt = Date.now() - prevTimestamp;
    let dx = currX - prevX;
    let dy = currY - prevY;

    info.vx = Math.round(dx / dt * 100);
    info.vy = Math.round(dy / dt * 100);
    info.distanceTraveled = getDistance(currX, currY, prevX, prevY);

    prevTimestamp = Date.now();
    prevX = currX;
    prevY = currY;

    return info;
}


// SWIPE FUNCTION, UNFINISHED
// const SWIPE_DIR = {
//     "LEFT": 0,
//     "RIGHT": 1,
//     "UP": 2,
//     "DOWN": 3
// }
// function checkForSwipe(posX, posY) {
//     const swipeThreshold = 100;
//     let info = getPointVelocity(posX, posY);
//     if (info.vx < -swipeThreshold) {
//         console.log("swiped right");
//         return SWIPE_DIR.RIGHT;
//     }
//     else if (info.vx > swipeThreshold) {
//         console.log("swiped left");
//         return SWIPE_DIR.LEFT;
//     }
//     else if (info.vy > swipeThreshold) {
//         console.log("swiped up");
//         return SWIPE_DIR.UP;
//     }
//     else if (info.vy < swipeThreshold) {
//         console.log("swiped down");
//         return SWIPE_DIR.DOWN;
//     }
//     else {
//         console.log("no swipe");
//         return false;
//     }
// }

// the "slider" is defined between (startX,startY) and a radius around it
// (posX,posY) is compared for closeness to the start, with a cutoff at radius
function getCCValueRadial(posX, posY, startX, startY, radius) {
    let value = 0; // value is between 0-127

    let distance = getDistance(posX, posY, startX, startY);

    // Only send a value if we are within radius
    if (distance < radius) {
        // the more close to start point, the higher the value
        // on startpoint, closeness = 1
        // at radius edge, closeness = 0
        let closeness = 1 - distance / radius;
        value = closeness * 127;

    }

    return Math.round(value);
}

// width = max x, height = max y
// we will use 80% of the width and height, centered
function getCCValueXYAxisMode(posX, posY, width, height, axis) {
    let position = 0;
    if (axis === "x") {
        position = (posX - width * 0.1) / (width * 0.8);
    }
    else {
        // top of screen = 1
        // bottom of screen = 0
        position = 1 - (posY - height * 0.1) / (height * 0.8);
    }
    return Math.min(Math.max(Math.round(position * 127), 0), 127);
}


// this function relies on being periodically called
// GestureStart = finger has not moved for 1 second and gesture was inactive
// GestureEnd = finger has not moved for 1 second and gesture was active
let gestureActive = false;
let gestureStartX;
let gestureStartY;

let mpeActive = false;
let mpeStartX;
let mpeStartY;


let gestureStartTime = null;
let gestureEndTime = null;
let stillnessTolerance = 15;
let gestureStartThreshold = 1000;
let gestureEndThreshold = 1000;
let elapsedTimeSinceCheck = 0;
let checkTimeStart = null;
let checkX;
let checkY;
function checkForGestureStartOrEnd(x, y) {
    if (gestureActive) { // check for gesture end
        if (checkTimeStart == null) {
            checkTimeStart = Date.now();
            checkX = x;
            checkY = y;
        }

        if (getDistance(x, y, checkX, checkY) < stillnessTolerance) {
            elapsedTimeSinceCheck = Date.now() - checkTimeStart;
            if (elapsedTimeSinceCheck > gestureEndThreshold) {
                // if xy position is about the same 
                console.log("GESTURE END: finger didnt move for 1s");
                gestureActive = false;
                checkTimeStart = null;
            }
        }
        // finger moved, reset 
        else {
            console.log("END CHECK: finger moved, reset");
            checkTimeStart = null;
        }

    }
    else { // check for gesture start
        if (checkTimeStart == null) {
            checkTimeStart = Date.now();
            checkX = x;
            checkY = y;
        }

        if (getDistance(x, y, checkX, checkY) < stillnessTolerance) {
            elapsedTimeSinceCheck = Date.now() - checkTimeStart;
            if (elapsedTimeSinceCheck > gestureStartThreshold) {
                // if xy position is about the same 
                console.log("GESTURE START: finger didnt move for 1s");
                gestureActive = true;
                gestureStartTime = Date.now();
                gestureStartX = x;
                gestureStartY = y;
                checkTimeStart = null;
            }
        }
        // finger moved, reset 
        else {
            console.log("START CHECK: finger moved, reset");
            checkTimeStart = null;
        }
    }

}

function isGestureActive() {
    return gestureActive;
}

function getElapsedTime() {
    return elapsedTimeSinceCheck;
}
function getGestureStartThreshold() {
    return gestureStartThreshold;
}
function getGestureEndThreshold() {
    return gestureEndThreshold;
}
function getGestureCheckPos() {
    return { x: checkX, y: checkY };
}
function getGestureStartPos() {
    return { x: gestureStartX, y: gestureStartY };
}
function endGesture() {
    gestureActive = false;
}
function startGesture(x, y) {
    if(!gestureActive || mpeActive){
        gestureStartX = x;
        gestureStartY = y;
        gestureActive = true;
    }
}
function startMpeMode(x, y){
    if(!mpeActive){
        mpeStartX = x;
        mpeStartY = y;
        mpeActive = true;
    }
}
function endMpeMode(){
    mpeActive = false;
}
function getMpeStartPos() {
    return { x: mpeStartX, y: mpeStartY };
}

let detectedGestureId = null;
let activeGestureId = null;
let gestureCCs = [101, 102, 103, 104, 105];
let gestureValues = [0, 0, 0, 0, 0];

function updateGestureCC(gestureId, cc) {
    gestureCCs[gestureId] = Number(cc);
}

function doSliderGestureIfActive(x, y, midiout, gestureId) {
    if (isGestureActive() && gestureId > -1) {
        // let ccx = getCCValueXYAxisMode(x, y, 1280, 720, "x");
        let ccx = getCCValueXYAxisMode(x, y, 1280, 720, "y");

        activeGestureId = gestureId;
        // console.log(gestureId, gestureCCs);
        let cc = gestureCCs[gestureId];
        gestureValues[activeGestureId] = ccx;

        if (midiout) {
            midiout.channels[1].sendControlChange(cc, ccx);
        }
    }
    else {
        activeGestureId = null;
        detectedGestureId = gestureId;
    }
    // updateOutputStatus();
}

function drawGestureDetectionStatus(canvasCtx, canvasElement) {
    if (isGestureActive()) {
        // draw a progress circle until gesture end
        let checkPos = getGestureCheckPos();
        let proportionUntilGestureEnd = getElapsedTime() / getGestureEndThreshold();
        canvasCtx.beginPath();
        canvasCtx.strokeStyle = 'orange';
        canvasCtx.lineWidth = 5;
        canvasCtx.arc(checkPos.x, checkPos.y, 15, 0, proportionUntilGestureEnd * 2 * Math.PI, false);
        canvasCtx.stroke();

    }
    else {
        // draw a progress circle until gesture start
        let checkPos = getGestureCheckPos();
        let proportionUntilGestureStart = getElapsedTime() / getGestureStartThreshold();
        canvasCtx.beginPath();
        canvasCtx.strokeStyle = '#00ff00';
        canvasCtx.lineWidth = 5;
        canvasCtx.arc(checkPos.x, checkPos.y, 15, 0, proportionUntilGestureStart * 2 * Math.PI, false);
        canvasCtx.stroke();
    }
}

function drawGestureActiveStatus(canvasCtx, canvasElement) {
    if (isGestureActive()) {
        canvasCtx.strokeStyle = '#00ff00';
    }
    else {
        canvasCtx.strokeStyle = '#ff0000';
    }

    canvasCtx.lineWidth = 20;
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, 0);
    canvasCtx.lineTo(canvasElement.width, 0);
    canvasCtx.stroke();

    canvasCtx.beginPath();
    canvasCtx.moveTo(0, canvasElement.height);
    canvasCtx.lineTo(canvasElement.width, canvasElement.height);
    canvasCtx.stroke();
}

function drawOutputStatus() {
    let outputSection = document.getElementById("out");
    if (outputSection.children.length == 0) {
        // populate with elements if there are none
        gestureCCs.forEach((cc, index) => {
            let d = document.createElement("div");
            d.innerText = `G${index + 1} | CC: ${cc} | VAL: 0`;
            outputSection.appendChild(d);
        });
    }
    else {
        // update existing elements if they exist
        gestureCCs.forEach((cc, index) => {
            let current = outputSection.children[index];
            current.innerText = `G${index + 1} | CC: ${cc} | VAL: ${gestureValues[index]}`;

            if (index == activeGestureId) {
                current.classList.add("active");
            }
            else if (index == detectedGestureId) {
                current.classList.add("detected");
            }
            else {
                current.classList.remove("active");
                current.classList.remove("detected");
            }
        });
    }
}