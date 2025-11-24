# Walkthrough - Call Improvements & Message Rendering Fixes

## Problem 1: Audio/File Messages Displaying as Raw JSON

**Issue:** After restarting the server/client, historical audio and file messages were displayed as raw JSON strings instead of the expected audio player or file attachment UI.

**Root Cause:** The `loadMessageHistory` function used a regex that stopped at the first comma, truncating JSON payloads.

**Solution:** Updated the regex in `web-client/src/pages/Chat.js` to `msg:(.*?),ts:` to correctly capture the entire message content.

---

## Problem 2: Call Termination Not Synchronized

**Issue:** When one party hung up the call, the other party's call UI remained active and audio continued looping.

**Root Cause:** The `hangupCall` and `hideCallUI` functions didn't properly stop the audio streaming, causing the audio to continue even after the UI was hidden.

**Solution:**

1. Modified `hideCallUI()` to call `endAudioCall(false)` to stop audio streaming without creating a notification loop
2. Updated `hangupCall()` to call `endAudioCall(true)` before ending the ICE call, ensuring the other party is notified
3. Updated `rejectCall()` to also call `endAudioCall(true)` to properly notify the caller

---

## Problem 3: Missing Call Timer

**Issue:** There was no visual indication of call duration for either party during an active call.

**Solution:** Implemented a call timer that:

- Displays elapsed time in MM:SS format
- Starts automatically when call is accepted or connected
- Updates every second
- Stops when call ends
- Is visible on both incoming and outgoing call UIs

### Implementation Details

#### Timer Variables

```javascript
let callTimer = null;
let callStartTime = null;
```

#### Timer Functions

```javascript
function startCallTimer() {
    stopCallTimer(); // Clear any existing timer
    callStartTime = Date.now();
    
    callTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        
        const timerEl = document.getElementById('call-timer');
        if (timerEl) {
            timerEl.innerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    }, 1000);
}

function stopCallTimer() {
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
    callStartTime = null;
}
```

#### UI Integration

- Timer element added to both `showIncomingCallUI()` and `showOutgoingCallUI()`
- Timer starts when call status changes to "In call" or "Connected"
- Timer stops automatically when `hideCallUI()` is called

---

## Changes Summary

### [Chat.js](file:///Users/juancal1728/Documents/Juan%20David%20Calderón/Icesi/Semestre%205/Compunet%20I/TrabajoFinalChat/Chat_TCP/multichat/03_tcp/web-client/src/pages/Chat.js)

1. **Added call timer variables** (line ~2021)
2. **Enhanced `showIncomingCallUI()`** - Added timer display element
3. **Enhanced `showOutgoingCallUI()`** - Added timer display element
4. **Modified `hideCallUI()`** - Now stops timer and audio streaming
5. **Modified `acceptCall()`** - Starts timer when call is accepted
6. **Modified `rejectCall()`** - Calls `endAudioCall(true)` to notify caller
7. **Modified `hangupCall()`** - Calls `endAudioCall(true)` before ending ICE call
8. **Enhanced `updateCallUIStatus()`** - Automatically starts timer when status is "In call"
9. **Added `startCallTimer()`** - Initializes and updates the call timer
10. **Added `stopCallTimer()`** - Cleans up timer resources

---

## Verification

### Call Timer

1. Start a call between two users
2. Accept the call
3. Verify both parties see a timer counting up (00:00, 00:01, 00:02, etc.)
4. Let the call run for over a minute to verify MM:SS format works correctly

### Call Termination

1. Start a call and accept it
2. Hang up from one side
3. Verify the other party's call UI closes immediately
4. Verify audio streaming stops on both sides
5. Verify no audio loops continue playing

### Message Rendering

1. Send audio and file messages
2. Refresh the browser
3. Verify historical messages display correctly as audio players and file attachments
