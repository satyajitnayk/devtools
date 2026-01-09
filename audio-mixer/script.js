if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
    const note = document.createElement('p');
    note.textContent = "📱 iPhone tip: If files appear greyed out, open them in the Files app, tap 'Download Now', and move them to 'On My iPhone' before selecting.";
    note.style.color = '#f9a826';
    document.body.prepend(note);
}

const $ = (sel) => document.querySelector(sel);

const leadDb = $("#leadDb");
const leadDbNum = $("#leadDbNum");
const bgDb = $("#bgDb");
const bgDbNum = $("#bgDbNum");

function syncRangeAndNumber(rangeEl, numEl){
    rangeEl.addEventListener("input", ()=> numEl.value = rangeEl.value);
    numEl.addEventListener("input", ()=> rangeEl.value = numEl.value);
}
syncRangeAndNumber(leadDb, leadDbNum);
syncRangeAndNumber(bgDb, bgDbNum);

function dbToGain(db){ return Math.pow(10, db/20); }
function secsToHMS(secs){
    secs = Math.max(0, Math.round(secs));
    const m = Math.floor(secs/60), s = secs%60;
    return `${m}:${String(s).padStart(2,"0")}`;
}

// WAV encoder (16-bit PCM)
function interleaveFloat(channels){
    const length = channels[0].length;
    const interleaved = new Float32Array(length * channels.length);
    let idx = 0;
    for (let i=0; i<length; i++){
        for (let ch=0; ch<channels.length; ch++){
            interleaved[idx++] = channels[ch][i];
        }
    }
    return interleaved;
}
function floatTo16PCM(float32){
    const out = new Int16Array(float32.length);
    for (let i=0;i<float32.length;i++){
        let s = Math.max(-1, Math.min(1, float32[i]));
        out[i] = (s < 0 ? s * 0x8000 : s * 0x7FFF) | 0;
    }
    return out;
}
function encodeWavPCM16(channels, sampleRate){
    const interleaved = interleaveFloat(channels);
    const pcm16 = floatTo16PCM(interleaved);
    const numChannels = channels.length;
    const blockAlign = numChannels * 2;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm16.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    let pos = 0;
    const ascii = s => { for(let i=0;i<s.length;i++) view.setUint8(pos++, s.charCodeAt(i)); };
    const u32 = v => { view.setUint32(pos, v, true); pos+=4; };
    const u16 = v => { view.setUint16(pos, v, true); pos+=2; };

    ascii("RIFF"); u32(36 + dataSize); ascii("WAVE");
    ascii("fmt "); u32(16); u16(1); // PCM
    u16(numChannels); u32(sampleRate); u32(byteRate); u16(blockAlign); u16(16);
    ascii("data"); u32(dataSize);
    for(let i=0;i<pcm16.length;i++){ view.setInt16(pos, pcm16[i], true); pos+=2; }
    return new Blob([buffer], {type:"audio/wav"});
}

// Simple normalize with headroom (e.g., 1 dB)
function normalizeChannels(channels, headroomDb = 1){
    let peak = 0;
    for(const ch of channels){
        for(let i=0;i<ch.length;i++){ const v = Math.abs(ch[i]); if (v>peak) peak = v; }
    }
    if (peak <= 0) return channels;
    const target = Math.pow(10, -Math.abs(headroomDb)/20); // e.g. -1 dB
    const scale = peak > target ? target/peak : 1;
    if (scale === 1) return channels;
    return channels.map(ch => {
        const c = new Float32Array(ch.length);
        for (let i=0;i<ch.length;i++) c[i] = ch[i] * scale;
        return c;
    });
}

// MP3 encoding using lamejs
function encodeMp3FromBuffer(channels, sampleRate, kbps = 192){
    // Downmix/limit to stereo or mono
    let left, right, channelsCount = channels.length;
    if (channelsCount >= 2){
        left = channels[0];
        right = channels[1];
        channelsCount = 2;
    } else {
        left = channels[0];
        channelsCount = 1;
    }

    // Convert to Int16
    const floatTo16 = (f32) => {
        const out = new Int16Array(f32.length);
        for(let i=0;i<f32.length;i++){
            let s = Math.max(-1, Math.min(1, f32[i]));
            out[i] = (s < 0 ? s * 0x8000 : s * 0x7FFF) | 0;
        }
        return out;
    };
    const left16 = floatTo16(left);
    const right16 = channelsCount === 2 ? floatTo16(right) : null;

    const mp3enc = new lamejs.Mp3Encoder(channelsCount, sampleRate, kbps);
    const frameSize = 1152;
    const mp3Data = [];

    for (let i=0; i<left16.length; i += frameSize){
        const lChunk = left16.subarray(i, i + frameSize);
        let mp3buf;
        if (channelsCount === 2){
            const rChunk = right16.subarray(i, i + frameSize);
            mp3buf = mp3enc.encodeBuffer(lChunk, rChunk);
        } else {
            mp3buf = mp3enc.encodeBuffer(lChunk);
        }
        if (mp3buf.length) mp3Data.push(mp3buf);
    }
    const end = mp3enc.flush();
    if (end.length) mp3Data.push(end);

    return new Blob(mp3Data, { type: "audio/mpeg" });
}

async function renderMix(){
    try{
        const leadFile = $("#leadFile").files[0];
        const bgFile = $("#bgFile").files[0];
        if (!leadFile || !bgFile){
            $("#status").textContent = "Please select both audio files.";
            return;
        }

        $("#renderBtn").disabled = true;
        $("#status").textContent = "Decoding and rendering…";

        const duration = Math.max(1, +$("#durationSec").value || 85);
        const format = $("#formatSel").value; // mp3 | wav
        const normalize = $("#normalize").checked;
        const kbps = Math.max(96, Math.min(320, +$("#mp3Kbps").value || 192));

        // Decode via AudioContext for best compatibility
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const [leadBuf, bgBuf] = await Promise.all([
            actx.decodeAudioData(await leadFile.arrayBuffer()),
            actx.decodeAudioData(await bgFile.arrayBuffer())
        ]);

        const sampleRate = actx.sampleRate;
        const lengthSamples = Math.floor(duration * sampleRate);
        const numChannels = Math.max(leadBuf.numberOfChannels, bgBuf.numberOfChannels, 2);
        const oac = new OfflineAudioContext(numChannels, lengthSamples, sampleRate);

        // sources
        const leadSrc = oac.createBufferSource(); leadSrc.buffer = leadBuf;
        const bgSrc = oac.createBufferSource();   bgSrc.buffer = bgBuf;

        // gains
        const leadGainNode = oac.createGain(); leadGainNode.gain.value = dbToGain(+leadDb.value);
        const bgGainNode   = oac.createGain(); bgGainNode.gain.value   = dbToGain(+bgDb.value);

        // master (mild headroom pre-normalization)
        const master = oac.createGain(); master.gain.value = 0.9;

        leadSrc.connect(leadGainNode).connect(master).connect(oac.destination);
        bgSrc.connect(bgGainNode).connect(master).connect(oac.destination);

        leadSrc.start(0); bgSrc.start(0);
        const rendered = await oac.startRendering();
        await actx.close();

        // Collect channels
        let channels = [];
        for (let c=0; c<rendered.numberOfChannels; c++){
            const data = rendered.getChannelData(c);
            // Copy only the length we requested (it already is)
            channels.push(new Float32Array(data));
        }

        if (normalize){
            channels = normalizeChannels(channels, 1); // ~1 dB headroom
        }

        // Encode
        let blob, ext, mime;
        if (format === "mp3"){
            blob = encodeMp3FromBuffer(channels, rendered.sampleRate, kbps);
            ext = "mp3";
        } else {
            blob = encodeWavPCM16(channels, rendered.sampleRate);
            ext = "wav";
        }

        const url = URL.createObjectURL(blob);
        $("#player").src = url;
        $("#downloadLink").href = url;
        $("#downloadLink").download = `mix_${secsToHMS(duration).replace(":","m")}s.${ext}`;
        $("#output").style.display = "";
        $("#summary").innerHTML = `
      Length: <b>${secsToHMS(duration)}</b> • Format: <b>${ext.toUpperCase()}</b>${
            ext === "mp3" ? ` • Bitrate: <b>${kbps} kbps</b>` : ""
        } • Sample rate: <b>${rendered.sampleRate} Hz</b><br/>
      Lead: <b>${leadDb.value} dB</b> • Background: <b>${bgDb.value} dB</b> • Normalize: <b>${normalize ? "Yes" : "No"}</b>
    `;
        $("#status").textContent = "Done. Preview and download below.";
    } catch (err){
        console.error(err);
        $("#status").textContent = `Error: ${err.message || err}`;
    } finally {
        $("#renderBtn").disabled = false;
    }
}

$("#renderBtn").addEventListener("click", renderMix);
$("#resetBtn").addEventListener("click", ()=>{
    $("#leadFile").value = "";
    $("#bgFile").value = "";
    $("#durationSec").value = 85;
    $("#formatSel").value = "mp3";
    $("#normalize").checked = true;
    $("#mp3Kbps").value = 192;
    leadDb.value = 20; leadDbNum.value = 20;
    bgDb.value = -18; bgDbNum.value = -18;
    $("#output").style.display = "none";
    $("#status").textContent = "";
});