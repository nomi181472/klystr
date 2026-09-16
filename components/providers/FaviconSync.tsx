'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';

export function FaviconSync() {
  const { resolvedTheme, theme } = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    function updateFavicon() {
      const isDark =
        document.documentElement.classList.contains('dark') ||
        resolvedTheme === 'dark' ||
        (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

      const targetIcon = isDark ? '/icon-dark.svg' : '/icon-light.svg';

      const existingIcons = document.querySelectorAll<HTMLLinkElement>(
        "link[rel*='icon']"
      );

      if (existingIcons.length > 0) {
        // Mutate existing link attributes in place.
        // DO NOT call link.remove() or replaceChild, as Next.js / React 19 manages head fibers.
        // Removing fibers from parentNode causes "can't access property removeChild, parentNode is null".
        existingIcons.forEach((link) => {
          if (link.getAttribute('href') !== targetIcon) {
            link.setAttribute('href', targetIcon);
          }
          if (link.hasAttribute('media')) {
            link.removeAttribute('media');
          }
          link.setAttribute('type', 'image/svg+xml');
        });
      } else {
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/svg+xml';
        link.href = targetIcon;
        document.head.appendChild(link);
      }
    }

    updateFavicon();
    const frameId = requestAnimationFrame(updateFavicon);

    const observer = new MutationObserver(updateFavicon);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    mediaQuery?.addEventListener?.('change', updateFavicon);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      mediaQuery?.removeEventListener?.('change', updateFavicon);
    };
  }, [resolvedTheme, theme, pathname]);

  return null;
}


