/**
 * User-triggered WebRTC self-test. It opens a local RTCPeerConnection with
 * a data channel and watches ICE gathering for a few seconds. It contacts
 * the STUN servers passed in (none by default: only host candidates), so the
 * caller decides whether any external server is involved.
 */
export interface WebRtcProbeResult {
  supported: boolean;
  dataChannel: boolean;
  hostCandidates: number;
  srflxCandidates: number;
  relayCandidates: number;
  ipv6: boolean;
  error?: string;
  durationMs: number;
}

export async function probeWebRtc(
  options: { stunServers?: string[]; timeoutMs?: number } = {},
): Promise<WebRtcProbeResult> {
  const started = Date.now();
  const PC = (globalThis as unknown as { RTCPeerConnection?: typeof RTCPeerConnection })
    .RTCPeerConnection;
  const result: WebRtcProbeResult = {
    supported: false,
    dataChannel: false,
    hostCandidates: 0,
    srflxCandidates: 0,
    relayCandidates: 0,
    ipv6: false,
    durationMs: 0,
  };
  if (typeof PC !== 'function') {
    result.error = 'RTCPeerConnection no disponible';
    result.durationMs = Date.now() - started;
    return result;
  }
  result.supported = true;
  let pc: RTCPeerConnection | null = null;
  try {
    pc = new PC({ iceServers: (options.stunServers ?? []).map((urls) => ({ urls })) });
    const channel = pc.createDataChannel('ovtorrent-probe');
    result.dataChannel = typeof channel.send === 'function';
    const gathered = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, options.timeoutMs ?? 3000);
      pc!.onicecandidate = (e) => {
        if (!e.candidate) {
          clearTimeout(timer);
          resolve();
          return;
        }
        const c = e.candidate.candidate;
        if (/ typ host/.test(c)) result.hostCandidates++;
        if (/ typ srflx/.test(c)) result.srflxCandidates++;
        if (/ typ relay/.test(c)) result.relayCandidates++;
        if (/:[0-9a-f]*:[0-9a-f]*:/i.test(c.split(' ')[4] ?? '')) result.ipv6 = true;
      };
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await gathered;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    pc?.close();
  }
  result.durationMs = Date.now() - started;
  return result;
}
