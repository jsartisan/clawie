import { useEffect, useState } from 'react';
import { RouterProvider } from '@tanstack/react-router';

import { Button } from 'ui/components/Button';
import { Spinner } from 'ui/components/Spinner';
import { Toaster } from 'ui/components/Toast';

import { BrandMark } from './components/BrandMark';
import { fetchSchema } from './lib/api';
import type { ResourceSchema } from './lib/api';
import { SchemaContext } from './lib/schema';
import { router } from './router';

type Screen = 'loading' | 'app' | 'unreachable';

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [schema, setSchema] = useState<ResourceSchema[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setScreen('loading');
    fetchSchema()
      .then((res) => {
        if (cancelled) return;
        setSchema(res);
        setScreen('app');
      })
      .catch(() => {
        if (!cancelled) setScreen('unreachable');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  if (screen === 'app' && schema) {
    return (
      <SchemaContext.Provider value={schema}>
        <RouterProvider router={router} />
        <Toaster />
      </SchemaContext.Provider>
    );
  }

  if (screen === 'unreachable') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-xl shadow-200">
            <BrandMark className="size-7" />
          </div>
          <div>
            <h1 className="font-serif text-[28px] font-medium tracking-tight">Can't reach NanoClaw</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              The app isn't responding. Make sure it's running, then retry.
            </p>
          </div>
          <Button onPress={reload}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}
