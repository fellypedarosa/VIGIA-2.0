import { useCallback, useRef, useState } from 'react';

export interface MotionDetectionHook {
  isDetecting: boolean;
  sensitivityLevel: number;
  lastMotionTime: number | null;
  motionScore: number;
  startDetection: (videoElement: HTMLVideoElement) => void;
  stopDetection: () => void;
  setSensitivity: (level: number) => void;
  onMotionDetected?: (score: number, frame: string) => void;
}

interface MotionDetectionConfig {
  sensitivity?: number;
  minMotionArea?: number;
  motionThreshold?: number;
  onMotionDetected?: (score: number, frame: string) => void;
}

export const useMotionDetection = (config: MotionDetectionConfig = {}): MotionDetectionHook => {
  const {
    sensitivity = 50,
    minMotionArea = 100,
    motionThreshold = 30,
    onMotionDetected
  } = config;

  const [isDetecting, setIsDetecting] = useState(false);
  const [sensitivityLevel, setSensitivityLevel] = useState(sensitivity);
  const [lastMotionTime, setLastMotionTime] = useState<number | null>(null);
  const [motionScore, setMotionScore] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>();
  const ctxRef = useRef<CanvasRenderingContext2D>();
  const previousFrameRef = useRef<ImageData>();
  const intervalRef = useRef<NodeJS.Timeout>();
  const videoRef = useRef<HTMLVideoElement>();

  const setSensitivity = useCallback((level: number) => {
    setSensitivityLevel(Math.max(1, Math.min(100, level)));
  }, []);

  const captureCurrentFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !ctxRef.current) return null;

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    ctx.drawImage(video, 0, 0);
    
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, []);

  const calculateMotionScore = useCallback((currentFrame: ImageData, previousFrame: ImageData) => {
    if (currentFrame.data.length !== previousFrame.data.length) return 0;

    let diffPixels = 0;
    let totalDiff = 0;
    const threshold = motionThreshold * (100 - sensitivityLevel) / 100;

    // Analisa cada pixel (a cada 4 bytes - RGBA)
    for (let i = 0; i < currentFrame.data.length; i += 4) {
      const currentR = currentFrame.data[i];
      const currentG = currentFrame.data[i + 1];
      const currentB = currentFrame.data[i + 2];
      
      const prevR = previousFrame.data[i];
      const prevG = previousFrame.data[i + 1];
      const prevB = previousFrame.data[i + 2];

      // Calcula diferença de luminosidade
      const currentLuma = 0.299 * currentR + 0.587 * currentG + 0.114 * currentB;
      const prevLuma = 0.299 * prevR + 0.587 * prevG + 0.114 * prevB;
      
      const diff = Math.abs(currentLuma - prevLuma);
      
      if (diff > threshold) {
        diffPixels++;
        totalDiff += diff;
      }
    }

    // Score baseado na porcentagem de pixels alterados e intensidade da mudança
    const pixelChangePercentage = (diffPixels / (currentFrame.data.length / 4)) * 100;
    const avgIntensity = diffPixels > 0 ? totalDiff / diffPixels : 0;
    
    return pixelChangePercentage * (avgIntensity / 255) * 100;
  }, [sensitivityLevel, motionThreshold]);

  const detectMotion = useCallback(() => {
    if (!videoRef.current || videoRef.current.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
      return;
    }

    const currentFrame = captureCurrentFrame();
    if (!currentFrame) return;

    if (previousFrameRef.current) {
      const score = calculateMotionScore(currentFrame, previousFrameRef.current);
      setMotionScore(score);

      // Detecta movimento baseado na sensibilidade e área mínima
      if (score > minMotionArea * (sensitivityLevel / 100)) {
        const now = Date.now();
        setLastMotionTime(now);
        
        // Captura frame para envio
        if (onMotionDetected && canvasRef.current && ctxRef.current) {
          const frameData = canvasRef.current.toDataURL('image/jpeg', 0.8);
          onMotionDetected(score, frameData);
        }
      }
    }

    previousFrameRef.current = currentFrame;
  }, [captureCurrentFrame, calculateMotionScore, sensitivityLevel, minMotionArea, onMotionDetected]);

  const startDetection = useCallback((videoElement: HTMLVideoElement) => {
    if (isDetecting) return;

    videoRef.current = videoElement;
    
    // Cria canvas para processamento
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      ctxRef.current = canvasRef.current.getContext('2d') || undefined;
    }

    setIsDetecting(true);
    
    // Inicia detecção a cada 200ms
    intervalRef.current = setInterval(detectMotion, 200);
  }, [isDetecting, detectMotion]);

  const stopDetection = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    
    setIsDetecting(false);
    previousFrameRef.current = undefined;
    setMotionScore(0);
  }, []);

  return {
    isDetecting,
    sensitivityLevel,
    lastMotionTime,
    motionScore,
    startDetection,
    stopDetection,
    setSensitivity
  };
};