"use client";

import { useEffect, useRef, useState } from "react";
import { parseExpedicaoQr, type ExpedicaoQrScan } from "@/lib/packaging/parse-expedicao-qr";
import { Button } from "@/components/ui/button";

type Detector = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

export function VolumeQrScanner({
  onScan,
  disabled,
  labelIdle = "Abrir câmera para bipar",
  labelActive = "Fechar câmera",
}: {
  onScan: (scan: ExpedicaoQrScan) => void;
  disabled?: boolean;
  labelIdle?: string;
  labelActive?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastKey = useRef("");

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!active || disabled) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    const DetectorCtor = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
      }
    ).BarcodeDetector;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        if (!DetectorCtor) {
          setError("Câmera aberta. Se o QR não ler sozinho, use o campo abaixo.");
          return;
        }
        const detector = new DetectorCtor({ formats: ["qr_code"] });
        const tick = async () => {
          if (cancelled || video.readyState < 2) {
            if (!cancelled) requestAnimationFrame(() => void tick());
            return;
          }
          try {
            const codes = await detector.detect(video);
            const raw = codes[0]?.rawValue ?? "";
            const parsed = parseExpedicaoQr(raw);
            if (parsed) {
              const key =
                parsed.type === "list"
                  ? `l:${parsed.listId}`
                  : `v:${parsed.token}`;
              if (key !== lastKey.current) {
                lastKey.current = key;
                onScanRef.current(parsed);
              }
            }
          } catch {
            /* ignore frame */
          }
          if (!cancelled) requestAnimationFrame(() => void tick());
        };
        requestAnimationFrame(() => void tick());
      } catch {
        setError("Não foi possível abrir a câmera. Permita o acesso ou cole o QR.");
        setActive(false);
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [active, disabled]);

  return (
    <div className="space-y-2">
      {active ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-black">
          <video
            ref={videoRef}
            className="w-full max-h-72 object-cover"
            playsInline
            muted
          />
        </div>
      ) : null}
      {error ? <p className="text-xs text-amber-800">{error}</p> : null}
      <Button
        type="button"
        className="min-h-12 w-full text-base"
        variant={active ? "outline" : "default"}
        disabled={disabled}
        onClick={() => {
          setError(null);
          setActive((v) => !v);
        }}
      >
        {active ? labelActive : labelIdle}
      </Button>
    </div>
  );
}
