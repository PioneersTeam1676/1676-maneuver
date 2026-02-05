import { useRef, useEffect, useCallback, useMemo } from 'react';
import redFieldImage from '@/assets/FieldMap.png';
import blueFieldImage from '@/assets/FieldMapBlue.png';

interface AutoStartMapProps {
  startPoses: (boolean | null)[];
  setStartPoses: Array<(value: boolean) => void>;
  alliance?: string;
}

const AutoStartMap = ({ startPoses, setStartPoses, alliance }: AutoStartMapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Define click zones for starting positions - spanning full field width horizontally (0-4)
  const clickZones = useMemo(() => [
    // All zones arranged horizontally across the field width (0-4 from left to right)
    { x: 0, y: 50, width: 128, height: 100, position: 0 },     // Position 0 (leftmost)
    { x: 128, y: 50, width: 128, height: 100, position: 1 },   // Position 1
    { x: 256, y: 50, width: 128, height: 100, position: 2 },   // Position 2 (center)
    { x: 384, y: 50, width: 128, height: 100, position: 3 },   // Position 3
    { x: 512, y: 50, width: 128, height: 100, position: 4 },   // Position 4 (rightmost)
  ], []);

  const drawSelectionIndicators = useCallback((ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
    // Add semi-transparent mask over the entire field image
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // Dark mask with 40% opacity
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const scaleX = canvasWidth / 640; // Adjust 640 to your image width
    const scaleY = canvasHeight / 480; // Adjust 480 to your image height

    clickZones.forEach((zone) => {
      const scaledX = zone.x * scaleX;
      const scaledY = zone.y * scaleY;
      const scaledWidth = zone.width * scaleX;
      const scaledHeight = zone.height * scaleY;

      // Clear the mask in the zone area for better visibility
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Remove some of the mask in zone areas
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
      ctx.globalCompositeOperation = 'source-over'; // Reset to normal drawing

      // Draw zone background
      if (startPoses[zone.position]) {
        // Selected zone - bright green background
        ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
      } else {
        // Unselected zone - lighter background for visibility
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      }
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);

      // Draw zone outline
      ctx.strokeStyle = startPoses[zone.position] ? '#16a34a' : '#374151';
      ctx.lineWidth = startPoses[zone.position] ? 4 : 2;
      ctx.setLineDash(startPoses[zone.position] ? [] : [5, 5]);
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

      // Draw zone number with better contrast
      ctx.fillStyle = startPoses[zone.position] ? '#ffffff' : '#1f2937';
      ctx.font = `bold ${Math.max(20 * Math.min(scaleX, scaleY), 16)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Add text shadow for even better readability
      ctx.shadowColor = startPoses[zone.position] ? '#000000' : '#ffffff';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      
      ctx.fillText(
        (zone.position).toString(),
        scaledX + scaledWidth / 2,
        scaledY + scaledHeight / 2
      );
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });
  }, [startPoses, clickZones]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load the appropriate field image based on alliance
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
        // Image is wider relative to container
        canvasWidth = containerWidth;
        canvasHeight = containerWidth / imgAspectRatio;
      } else {
        // Image is taller relative to container
        canvasHeight = containerHeight;
        canvasWidth = containerHeight * imgAspectRatio;
      }

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;

      // Draw the field image
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

      // Draw selection indicators
      drawSelectionIndicators(ctx, canvasWidth, canvasHeight);
    };

    // Use red field by default, or blue field if blue alliance is selected
    img.src = alliance === 'blue' ? blueFieldImage : redFieldImage;
  }, [alliance, drawSelectionIndicators]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const canvasScaleX = canvas.width / 640; // Adjust to your image width
    const canvasScaleY = canvas.height / 480; // Adjust to your image height

    // Check which zone was clicked
    for (const zone of clickZones) {
      const scaledX = zone.x * canvasScaleX;
      const scaledY = zone.y * canvasScaleY;
      const scaledWidth = zone.width * canvasScaleX;
      const scaledHeight = zone.height * canvasScaleY;

      if (x >= scaledX && x <= scaledX + scaledWidth && 
          y >= scaledY && y <= scaledY + scaledHeight) {
        
        // Clear all other selections
        setStartPoses.forEach((setter, index) => {
          setter(index === zone.position);
        });
        break;
      }
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center p-1 lg:p-2 xl:p-3">
      <canvas
        ref={canvasRef}
        className="cursor-pointer max-w-full max-h-full shadow-lg rounded-md xl:shadow-xl 2xl:shadow-2xl"
        onClick={handleCanvasClick}
      />
    </div>
  );
};

export default AutoStartMap;
