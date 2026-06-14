import { IconAlertTriangle } from '@tabler/icons-react';

import { Icon } from './Icon';
import { Button } from './Button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './Empty';

export interface FullPageErrorProps {
  title?: string;
  description?: string;
  error?: Error;
  onRetry?: () => void;
  retryLabel?: string;
}

export function FullPageError(props: FullPageErrorProps) {
  const {
    description = 'An unexpected error occurred. You can try again or reload the page.',
    error,
    onRetry,
    retryLabel = 'Try again',
    title = 'Something went wrong',
  } = props;

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="bg-background flex h-full min-h-screen w-full items-center justify-center p-6">
      <Empty className="max-w-md border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon icon={IconAlertTriangle} size="lg" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {error && import.meta.env.DEV && (
          <pre className="bg-muted text-muted-foreground max-w-full overflow-auto rounded-md p-3 text-left text-xs">
            {error.message}
          </pre>
        )}
        <EmptyContent>
          <div className="flex flex-row gap-2">
            {onRetry && (
              <Button variant="outline" onPress={onRetry}>
                {retryLabel}
              </Button>
            )}
            <Button onPress={handleReload}>Reload page</Button>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
