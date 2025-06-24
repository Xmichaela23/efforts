import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, X } from 'lucide-react';

interface BannerUploadProps {
  onBannerChange?: (imageUrl: string | null) => void;
}

export const BannerUpload: React.FC<BannerUploadProps> = ({ onBannerChange }) => {
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        setBannerImage(imageUrl);
        onBannerChange?.(imageUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeBanner = () => {
    setBannerImage(null);
    onBannerChange?.(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="w-full mb-6">
      <CardContent className="p-4">
        {bannerImage ? (
          <div className="relative">
            <img 
              src={bannerImage} 
              alt="Banner" 
              className="w-full h-32 object-cover rounded-lg"
            />
            <Button
              variant="destructive"
              size="sm"
              className="absolute top-2 right-2"
              onClick={removeBanner}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 mb-4">Upload a PNG file to create a banner</p>
            <Button onClick={() => fileInputRef.current?.click()}>
              Choose File
            </Button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/gif"
          onChange={handleFileSelect}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
};