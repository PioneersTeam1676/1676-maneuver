import { useEffect, useRef, useMemo } from 'react';
import redFieldImage from '@/assets/FieldMap.png';

interface FieldPositionVisualProps {
  selectedPosition: number;
}

export const FieldPositionVisual = ({ selectedPosition }: FieldPositionVisualProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use the same zones as AutoStartPositionMap (positions 0-4)
  const zones = useMemo(() => [
    { x: 0, y: 50, width: 128, height: 100, position: 0 },
    { x: 128, y: 50, width: 128, height: 100, position: 1 },
    { x: 256, y: 50, width: 128, height: 100, position: 2 },
    { x: 384, y: 50, width: 128, height: 100, position: 3 },
    { x: 512, y: 50, width: 128, height: 100, position: 4 },
  ], []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawPositionOverlay = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
      // Use the same scaling as AutoStartMap (640x480 base)
      const scaleX = canvasWidth / 640;
      const scaleY = canvasHeight / 480;

      // Add semi-transparent overlay to darken all areas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Find the selected position zone
      const selectedZone = zones.find(zone => zone.position === selectedPosition);
      if (!selectedZone) return;

      const scaledX = selectedZone.x * scaleX;
      const scaledY = selectedZone.y * scaleY;
      const scaledWidth = selectedZone.width * scaleX;
      const scaledHeight = selectedZone.height * scaleY;

      // Clear the overlay for the selected position (make it brighter)
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
      ctx.globalCompositeOperation = 'source-over';

      // Draw highlighted background for selected position
      ctx.fillStyle = 'rgba(59, 130, 246, 0.3)'; // Blue highlight
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);

      // Draw border around selected position
      ctx.strokeStyle = '#2563eb'; // Blue border
      ctx.lineWidth = 3;
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

      // Draw position number
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(24 * Math.min(scaleX, scaleY), 18)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Add shadow for text readability
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      ctx.fillText(
        `${selectedPosition}`,
        scaledX + scaledWidth / 2,
        scaledY + scaledHeight / 2
      );

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    };

    const img = new Image();
    img.onload = () => {
      // Calculate container size
      const containerRect = container.getBoundingClientRect();
      const containerWidth = Math.min(containerRect.width, 400); // Max width
      const containerHeight = Math.min(containerRect.height, 300); // Max height

      // Calculate aspect ratio preserving dimensions
      const imgAspectRatio = img.width / img.height;
      const containerAspectRatio = containerWidth / containerHeight;

      let canvasWidth, canvasHeight;

      if (imgAspectRatio > containerAspectRatio) {
        canvasWidth = containerWidth;
        canvasHeight = containerWidth / imgAspectRatio;
      } else {
        canvasHeight = containerHeight;
        canvasWidth = containerHeight * imgAspectRatio;
      }

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;

      // Draw the field image
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

      // Draw position overlay
      drawPositionOverlay(ctx, canvasWidth, canvasHeight);
    };

    img.src = redFieldImage;
  }, [selectedPosition, zones]);

  return (
    <div className="flex flex-col items-center space-y-2 my-4">
      <div ref={containerRef} className="w-full max-w-md h-48 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="border rounded-lg shadow-sm"
        />
      </div>
      <p className="text-sm text-gray-600 font-medium">
        Position {selectedPosition} Auto Scoring
      </p>
    </div>
  );
};
