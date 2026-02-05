/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useEffect } from 'react';
import redFieldImage from '@/assets/FieldMap.png';

interface AutoStartPositionMapProps {
  startPositions: {
    position0: number;
    position1: number;
    position2: number;
    position3: number;
    position4: number;
  };
  matchResults: Array<{
    matchNumber: string;
    alliance: string;
    totalPoints: number;
    autoPoints: number;
    teleopPoints: number;
    endgamePoints: number;
    climbed: boolean;
    brokeDown: boolean;
    startPosition: number;
  }>;
}

const AutoStartPositionMap = ({ startPositions, matchResults }: AutoStartPositionMapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use the same zones as the existing AutoStartMap component (0-4 horizontal only)
  const zones = [
    { x: 0, y: 50, width: 128, height: 100, position: 0 },
    { x: 128, y: 50, width: 128, height: 100, position: 1 },
    { x: 256, y: 50, width: 128, height: 100, position: 2 },
    { x: 384, y: 50, width: 128, height: 100, position: 3 },
    { x: 512, y: 50, width: 128, height: 100, position: 4 },
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Calculate container size
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

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

      // Draw position overlays
      drawPositionOverlays(ctx, canvasWidth, canvasHeight);
    };

    img.src = redFieldImage;
  }, [startPositions, matchResults]);

  const drawPositionOverlays = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
    // Use the same scaling as AutoStartMap (640x480 base)
    const scaleX = canvasWidth / 640;
    const scaleY = canvasHeight / 480;

    // Add semi-transparent overlay to darken unused areas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    zones.forEach((zone) => {
      const scaledX = zone.x * scaleX;
      const scaledY = zone.y * scaleY;
      const scaledWidth = zone.width * scaleX;
      const scaledHeight = zone.height * scaleY;

      // Get percentage for this position
      const percentage = (startPositions as any)[`position${zone.position}`] || 0;
      
      // Calculate average AUTO points for this position (not total points)
      const positionMatches = matchResults.filter(match => match.startPosition === zone.position);
      const avgAutoPoints = positionMatches.length > 0 
        ? Math.round((positionMatches.reduce((sum, match) => sum + match.autoPoints, 0) / positionMatches.length) * 10) / 10
        : 0;

      // Clear the overlay in this zone (make it brighter)
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
      ctx.globalCompositeOperation = 'source-over';

      // Draw background based on usage percentage
      const intensity = Math.min(percentage / 100, 1);
      const alpha = Math.max(0.4, intensity * 0.9);
      
      // Color based on usage frequency
      let color;
      if (percentage === 0) {
        color = `rgba(156, 163, 175, ${alpha})`; // Gray for unused
      } else if (percentage < 20) {
        color = `rgba(239, 68, 68, ${alpha})`; // Red for low usage
      } else if (percentage < 40) {
        color = `rgba(245, 158, 11, ${alpha})`; // Orange for medium-low usage
      } else if (percentage < 60) {
        color = `rgba(234, 179, 8, ${alpha})`; // Yellow for medium usage
      } else if (percentage < 80) {
        color = `rgba(59, 130, 246, ${alpha})`; // Blue for high usage
      } else {
        color = `rgba(34, 197, 94, ${alpha})`; // Green for very high usage
      }

      ctx.fillStyle = color;
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);

      // Draw border (similar to AutoStartMap style)
      ctx.strokeStyle = percentage > 0 ? '#374151' : '#9ca3af';
      ctx.lineWidth = percentage > 0 ? 3 : 2;
      ctx.setLineDash(percentage > 0 ? [] : [5, 5]);
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
      ctx.setLineDash([]); // Reset dash

      // Draw position number (similar to AutoStartMap style)
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(18 * Math.min(scaleX, scaleY), 14)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      
      // Add shadow for text readability
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      
      ctx.fillText(
        `${zone.position}`,
        scaledX + scaledWidth / 2,
        scaledY + 8
      );

      // Draw percentage in the center
      ctx.font = `bold ${Math.max(22 * Math.min(scaleX, scaleY), 18)}px Arial`;
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `${percentage}%`,
        scaledX + scaledWidth / 2,
        scaledY + scaledHeight / 2
      );

      // Draw average AUTO points at the bottom if available
      if (positionMatches.length > 0) {
        ctx.font = `${Math.max(14 * Math.min(scaleX, scaleY), 12)}px Arial`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(
          `${avgAutoPoints} auto pts`,
          scaledX + scaledWidth / 2,
          scaledY + scaledHeight - 8
        );
      }

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });
  };

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full border rounded-lg"
      />
    </div>
  );
};

export default AutoStartPositionMap;