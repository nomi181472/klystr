'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

export function FaviconSync() {
  const { resolvedTheme, theme } = useTheme();

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
        existingIcons.forEach((link) => {
          if (link.getAttribute('href') !== targetIcon) {
            const nextLink = link.cloneNode(true) as HTMLLinkElement;
            nextLink.setAttribute('href', targetIcon);
            nextLink.setAttribute('type', 'image/svg+xml');
            link.parentNode?.replaceChild(nextLink, link);
          }
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

    const observer = new MutationObserver(updateFavicon);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    mediaQuery?.addEventListener?.('change', updateFavicon);

    return () => {
      observer.disconnect();
      mediaQuery?.removeEventListener?.('change', updateFavicon);
    };
  }, [resolvedTheme, theme]);

  return null;
}
