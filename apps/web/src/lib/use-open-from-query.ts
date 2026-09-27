import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function useOpenFromQuery(onOpen: () => void): void {
  const searchParams = useSearchParams();
  const shouldOpen = searchParams.get('new') === '1';
  const opened = useRef(false);

  useEffect(() => {
    if (!shouldOpen || opened.current) return;
    opened.current = true;
    onOpen();
  }, [onOpen, shouldOpen]);
}
