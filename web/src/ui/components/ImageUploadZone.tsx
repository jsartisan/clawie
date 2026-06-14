'use client';

import { useCallback, useId, useState } from 'react';
import { DropZone, FileTrigger } from 'react-aria-components';
import { IconCloudUpload, IconPhotoPlus, IconX } from '@tabler/icons-react';

import { Icon } from './Icon';
import { cn } from '../lib/utils';
import { Button } from './Button';
import { LabelWithDots } from './LabelWithDots';

export interface UploadedAsset {
  name: string;
  url: string;
}

interface PendingFile {
  id: string;
  name: string;
  previewUrl: string;
}

interface ImageUploadZoneProps {
  allowsMultiple?: boolean;
  assets: UploadedAsset[];
  className?: string;
  onAssetsChange: (assets: UploadedAsset[]) => void;
  onUpload: (file: File) => Promise<UploadedAsset>;
}

export function ImageUploadZone({
  allowsMultiple = true,
  assets,
  className,
  onAssetsChange,
  onUpload,
}: ImageUploadZoneProps) {
  const instanceId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);

  const processFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      const toUpload = allowsMultiple ? imageFiles : imageFiles.slice(0, 1);

      const pendingEntries: PendingFile[] = toUpload.map((f, i) => ({
        id: `${instanceId}-${Date.now()}-${i}`,
        name: f.name,
        previewUrl: URL.createObjectURL(f),
      }));

      setPending((prev) => [...prev, ...pendingEntries]);

      if (!allowsMultiple) {
        onAssetsChange([]);
      }

      const results = await Promise.allSettled(
        toUpload.map(async (file, i) => {
          const entry = pendingEntries[i];
          try {
            const uploaded = await onUpload(file);
            setPending((prev) => prev.filter((p) => p.id !== entry.id));
            URL.revokeObjectURL(entry.previewUrl);
            return uploaded;
          } catch {
            setPending((prev) => prev.filter((p) => p.id !== entry.id));
            URL.revokeObjectURL(entry.previewUrl);
            return null;
          }
        }),
      );

      const uploaded = results
        .filter(
          (r): r is PromiseFulfilledResult<UploadedAsset | null> =>
            r.status === 'fulfilled',
        )
        .map((r) => r.value)
        .filter((v): v is UploadedAsset => v !== null);

      if (uploaded.length > 0) {
        onAssetsChange(
          allowsMultiple ? [...assets, ...uploaded] : uploaded.slice(0, 1),
        );
      }
    },
    [allowsMultiple, assets, instanceId, onAssetsChange, onUpload],
  );

  const handleSelect = useCallback(
    (selected: FileList | null) => {
      if (!selected) return;
      void processFiles(Array.from(selected));
    },
    [processFiles],
  );

  const removeAsset = useCallback(
    (index: number) => {
      onAssetsChange(assets.filter((_, i) => i !== index));
    },
    [assets, onAssetsChange],
  );

  const allItems = [
    ...assets.map((a) => ({ type: 'uploaded' as const, ...a })),
    ...pending.map((p) => ({
      type: 'pending' as const,
      name: p.name,
      url: p.previewUrl,
      id: p.id,
    })),
  ];

  const hasItems = allItems.length > 0;

  // Empty state — large dropzone
  if (!hasItems) {
    return (
      <div className={className}>
        <DropZone
          onDropEnter={() => setIsDragging(true)}
          onDropExit={() => setIsDragging(false)}
          onDrop={async (e) => {
            setIsDragging(false);
            const imageFiles: File[] = [];
            for (const item of e.items) {
              if (item.kind === 'file') {
                const file = await item.getFile();
                if (file.type.startsWith('image/')) {
                  imageFiles.push(file);
                }
              }
            }
            void processFiles(imageFiles);
          }}
          className={cn(
            'border-border relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'hover:border-muted-foreground/50',
          )}
        >
          <div className="bg-muted rounded-full p-3">
            <Icon
              icon={IconCloudUpload}
              size="lg"
              className="text-muted-foreground"
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">
              Drop images here or click to upload
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              PNG, JPG, WebP, or AVIF
            </p>
          </div>
          <FileTrigger
            acceptedFileTypes={[
              'image/png',
              'image/jpeg',
              'image/webp',
              'image/avif',
            ]}
            allowsMultiple={allowsMultiple}
            onSelect={handleSelect}
          >
            <Button
              variant="ghost"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Browse files"
            />
          </FileTrigger>
        </DropZone>
      </div>
    );
  }

  // Has items — compact grid with small "Add" tile
  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {allItems.map((item, index) => (
        <div
          key={item.type === 'pending' ? item.id : `${item.name}-${index}`}
          className="border-border group relative overflow-hidden rounded-lg border"
        >
          <img
            src={item.url}
            alt={item.name}
            className={cn(
              'aspect-square w-full object-cover transition-[filter,transform] duration-500 ease-out',
              item.type === 'pending'
                ? 'scale-[1.03] blur-lg'
                : 'blur-0 scale-100',
            )}
          />
          {item.type === 'pending' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
              <LabelWithDots label="Uploading" />
            </div>
          )}
          {item.type === 'uploaded' && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
              onPress={() => removeAsset(index)}
            >
              <Icon icon={IconX} size="xs" />
            </Button>
          )}
        </div>
      ))}

      {allowsMultiple && (
        <FileTrigger
          acceptedFileTypes={[
            'image/png',
            'image/jpeg',
            'image/webp',
            'image/avif',
          ]}
          allowsMultiple={allowsMultiple}
          onSelect={handleSelect}
        >
          <Button
            variant="ghost"
            className={cn(
              'border-border text-muted-foreground aspect-square h-auto! w-full flex-col gap-1.5 rounded-lg border-2 border-dashed',
              'hover:border-muted-foreground/50 hover:text-foreground',
            )}
          >
            <Icon icon={IconPhotoPlus} size="md" />
            <span className="text-xs font-medium">Add</span>
          </Button>
        </FileTrigger>
      )}
    </div>
  );
}
