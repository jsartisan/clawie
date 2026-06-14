import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type Ref,
} from 'react';

import { cn } from '../lib/utils';

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface MediaImageProps extends Omit<ComponentProps<'img'>, 'ref'> {
  src?: string;
  alt: string;
  ref?: Ref<HTMLImageElement>;
  /** CSS `aspect-ratio` reserved while the image loads so the layout
   *  doesn't jump when pixels arrive. Defaults to `'1'` (square). Pass the
   *  real ratio (`'16/9'`, `'4/3'`, …) when known. Dropped after load so
   *  intrinsic dims drive sizing. */
  aspectRatio?: string;
}

export function MediaImage({
  alt,
  aspectRatio = '1',
  className,
  loading,
  onError,
  onLoad,
  ref,
  src,
  style,
  ...rest
}: MediaImageProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  // `loaded` is derived from comparing the last-loaded src to the current
  // one. Using a `useEffect([src])` reset would race with the browser's
  // `load` event for cached/blob URLs: the load event fires as a microtask
  // post-commit, before passive effects run, so the effect would overwrite
  // `loaded` back to `false` and the pulse skeleton would never clear.
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>(undefined);
  const loaded = !!src && loadedSrc === src;

  const setRef = useCallback(
    (node: HTMLImageElement | null) => {
      imageRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  useIsomorphicLayoutEffect(() => {
    if (!src || !imageRef.current?.complete) return;
    setLoadedSrc(src);
  }, [src]);

  return (
    <img
      ref={setRef}
      src={src}
      alt={alt}
      loading={loading}
      decoding={loading === 'lazy' ? 'async' : undefined}
      draggable={false}
      onLoad={(e) => {
        setLoadedSrc(src);
        onLoad?.(e);
      }}
      onError={(e) => {
        setLoadedSrc(src);
        onError?.(e);
      }}
      {...rest}
      style={loaded ? style : { aspectRatio, ...style }}
      className={cn(
        'rounded-inherit border-overlay block',
        !loaded && 'bg-secondary animate-pulse',
        className,
      )}
    />
  );
}

/** Gate `<img>` src swaps on a decoded bitmap to avoid mid-fetch repaint
 *  flashes (e.g. blob → remote URL transitions). */
export function useDeferredImageSrc(
  src: string | undefined,
): string | undefined {
  const [displayed, setDisplayed] = useState(src);

  useEffect(() => {
    if (!src) {
      setDisplayed(undefined);
      return;
    }
    if (src === displayed) return;

    let cancelled = false;
    const commit = () => {
      if (!cancelled) setDisplayed(src);
    };
    const probe = new Image();
    probe.onload = commit;
    probe.onerror = commit;
    probe.src = src;
    if (typeof probe.decode === 'function') {
      probe.decode().then(commit, commit);
    }

    return () => {
      cancelled = true;
    };
  }, [src, displayed]);

  return displayed;
}
