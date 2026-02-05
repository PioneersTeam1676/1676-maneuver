import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface RobotPhotoSectionProps {
  robotPhoto: string | null;
  setRobotPhoto: (photo: string | null) => void;
}

// Helper function to calculate base64 string size in bytes
const calculateBase64Size = (base64String: string): number => {
  // Remove data URL prefix to get just the base64 data
  const base64Data = base64String.split(',')[1] || base64String;
  // Base64 encoding increases size by ~33%, so actual bytes = (base64 length * 3) / 4
  return Math.round((base64Data.length * 3) / 4);
};

// Helper function to format bytes in human readable format
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const RobotPhotoSection = ({ robotPhoto, setRobotPhoto }: RobotPhotoSectionProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Calculate new dimensions (max width 400px since display is max 256px, maintain aspect ratio)
        const maxWidth = 400;
        const aspectRatio = img.width / img.height;
        const newWidth = Math.min(maxWidth, img.width);
        const newHeight = newWidth / aspectRatio;

        canvas.width = newWidth;
        canvas.height = newHeight;

        // Draw the resized image
        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        // Try to export as WebP first, fallback to JPEG with more aggressive compression
        let dataUrl = canvas.toDataURL('image/webp', 0.6);
        
        // Check if WebP is supported (some browsers return PNG if not supported)
        if (!dataUrl.startsWith('data:image/webp')) {
          // Fallback to JPEG with more aggressive compression
          dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        }

        resolve(dataUrl);
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size (limit to 10MB for original file)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image file is too large. Please choose a file under 10MB.");
        return;
      }

      try {
        toast.loading("Compressing image...");
        const compressedDataUrl = await compressImage(file);
        setRobotPhoto(compressedDataUrl);
        toast.dismiss();
        toast.success("Photo added and compressed successfully!");
      } catch (error) {
        toast.dismiss();
        console.error("Error compressing image:", error);
        toast.error("Failed to process image. Please try again.");
      }
    }
  };

  const removePhoto = () => {
    setRobotPhoto(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Robot Photo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center space-y-4">
          {robotPhoto ? (
            <div className="relative">
              <img 
                src={robotPhoto} 
                alt="Robot" 
                className="max-w-full max-h-64 rounded-lg border"
              />
              <Button
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={removePhoto}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {/* Development-only size display */}
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-2 p-2 bg-gray-100 rounded text-xs space-y-1">
                  <div className="font-medium text-gray-700">📊 Dev Info:</div>
                  <div className="text-gray-600">
                    Compressed Size: <span className="font-mono">{formatBytes(calculateBase64Size(robotPhoto))}</span>
                  </div>
                  <div className="text-gray-600">
                    Est. QR Codes Needed: <span className="font-mono text-red-600">
                      {Math.ceil(calculateBase64Size(robotPhoto) / 2048)}
                    </span> / 30 limit
                  </div>
                  <div className="text-gray-600">
                    Format: <span className="font-mono">
                      {robotPhoto.startsWith('data:image/webp') ? 'WebP' : 
                       robotPhoto.startsWith('data:image/jpeg') ? 'JPEG' : 'Other'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Camera className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500 mb-4">No photo taken yet</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={handlePhotoCapture} variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              {robotPhoto ? "Change Photo" : "Add Photo"}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoUpload}
            className="hidden"
          />
        </div>
      </CardContent>
    </Card>
  );
};
