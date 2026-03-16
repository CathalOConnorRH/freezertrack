// Camera scanning requires HTTPS except on localhost.
// On local network, either access via http://raspberrypi.local (works on most
// home networks) or enable HTTPS in nginx using the self-signed cert from
// scripts/gen-cert.sh

import { useRef, useEffect, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const COOLDOWN_MS = 3000;

export default function CameraScanner({ onScan }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const lastScanRef = useRef({ text: "", time: 0 });
  const [permState, setPermState] = useState("prompt");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    navigator.permissions
      ?.query({ name: "camera" })
      .then((result) => setPermState(result.state))
      .catch(() => setPermState("prompt"));
  }, []);

  const startScanning = useCallback(() => {
    if (!videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
      if (result) {
        const text = result.getText();
        const now = Date.now();
        if (
          text === lastScanRef.current.text &&
          now - lastScanRef.current.time < COOLDOWN_MS
        ) {
          return;
        }
        lastScanRef.current = { text, time: now };
        setFlash(true);
        setTimeout(() => {
          setFlash(false);
          onScan(text);
        }, 200);
      }
    });
  }, [onScan]);

  useEffect(() => {
    if (permState === "granted") {
      startScanning();
    }
    return () => {
      readerRef.current?.reset?.();
    };
  }, [permState, startScanning]);

  const requestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermState("granted");
    } catch {
      setPermState("denied");
    }
  };

  if (permState === "denied") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="font-medium text-red-700 mb-2">Camera access was blocked.</p>
        <p className="text-sm text-red-600">
          To re-enable:
          <br />
          <strong>iOS:</strong> Settings &rarr; Safari &rarr; Camera &rarr; Allow
          <br />
          <strong>Android:</strong> tap the lock icon in your browser's address bar
        </p>
      </div>
    );
  }

  if (permState === "prompt") {
    return (
      <button
        onClick={requestCamera}
        className="w-full py-4 bg-[var(--ice-blue)] text-white rounded-xl font-medium text-lg hover:bg-[#4a9bd9] transition-colors"
      >
        Tap to enable camera
      </button>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border-2 border-[var(--ice-blue)]">
      <video
        ref={videoRef}
        className="w-full aspect-[4/3] object-cover rounded-xl"
        playsInline
        muted
      />
      {/* Targeting reticle */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[200px] h-[200px]">
          {/* Top-left corner */}
          <div className="absolute top-0 left-0 w-5 h-0.5 bg-[var(--ice-blue)]" />
          <div className="absolute top-0 left-0 w-0.5 h-5 bg-[var(--ice-blue)]" />
          {/* Top-right corner */}
          <div className="absolute top-0 right-0 w-5 h-0.5 bg-[var(--ice-blue)]" />
          <div className="absolute top-0 right-0 w-0.5 h-5 bg-[var(--ice-blue)]" />
          {/* Bottom-left corner */}
          <div className="absolute bottom-0 left-0 w-5 h-0.5 bg-[var(--ice-blue)]" />
          <div className="absolute bottom-0 left-0 w-0.5 h-5 bg-[var(--ice-blue)]" />
          {/* Bottom-right corner */}
          <div className="absolute bottom-0 right-0 w-5 h-0.5 bg-[var(--ice-blue)]" />
          <div className="absolute bottom-0 right-0 w-0.5 h-5 bg-[var(--ice-blue)]" />
        </div>
      </div>
      {/* Green flash overlay */}
      {flash && (
        <div className="absolute inset-0 bg-green-400/30 pointer-events-none" />
      )}
    </div>
  );
}
